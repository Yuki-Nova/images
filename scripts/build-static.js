// scripts/build-static.js
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const OSS = require('ali-oss');
const ejs = require('ejs');
const { buildPublicUrl, PROCESS_SUFFIX, listAllImages } = require('../lib/images');

const client = new OSS({
  region: process.env.OSS_REGION,
  accessKeyId: process.env.OSS_ACCESS_KEY_ID,
  accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET,
  bucket: process.env.OSS_BUCKET,
});

function countFiles(dir) {
  let n = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    n += entry.isDirectory() ? countFiles(path.join(dir, entry.name)) : 1;
  }
  return n;
}

// 门禁：页面里每个 assets/... 引用都必须真实存在（2026-09-14 修的正是这条曾静默通过的缺陷）
function missingAssetRefs(html, outDir) {
  const refs = new Set();
  const re = /(?:src|href)\s*=\s*["'](assets\/[^"']+)["']/g;
  let m;
  while ((m = re.exec(html)) !== null) refs.add(m[1]);
  return [...refs].filter((rel) => !fs.existsSync(path.join(outDir, rel)));
}

async function main() {
  const images = await listAllImages(client);
  let initialCategories = {};
  try {
    const raw = fs.readFileSync(path.join(__dirname, '..', 'categories.json'), 'utf8');
    initialCategories = JSON.parse(raw || '{}');
    if (!initialCategories || typeof initialCategories !== 'object' || Array.isArray(initialCategories)) initialCategories = {};
  } catch (e) { /* keep empty */ }

  const html = await ejs.renderFile(
    path.join(__dirname, '..', 'views', 'index.ejs'),
    { images, initialCategories }
  );

  const outDir = path.join(__dirname, '..', 'docs');
  fs.mkdirSync(outDir, { recursive: true });

  // public/ 整个树复制到 docs/assets/ —— 运行时是 app.use('/assets', express.static(public))，
  // 所以静态快照必须镜像同一布局，否则页面无样式、网格空白（曾只复制了备案图标一张图）
  const publicDir = path.join(__dirname, '..', 'public');
  const assetDir = path.join(outDir, 'assets');
  fs.rmSync(assetDir, { recursive: true, force: true });
  fs.cpSync(publicDir, assetDir, { recursive: true });
  console.log(`Copied ${countFiles(assetDir)} asset file(s): public/ -> docs/assets/`);

  // 先过门禁再落盘：宁可构建失败，也不产出"看起来成功"的坏快照
  const missing = missingAssetRefs(html, outDir);
  if (missing.length > 0) {
    console.error('❌ 静态快照引用了不存在的资源，已中止：');
    for (const rel of missing) console.error('   -', rel);
    process.exit(1);
  }

  fs.writeFileSync(path.join(outDir, 'index.html'), html, 'utf8');
  console.log('Generated docs/index.html (asset reference gate: OK)');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
