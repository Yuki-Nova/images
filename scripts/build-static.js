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
  fs.writeFileSync(path.join(outDir, 'index.html'), html, 'utf8');

  const assetSource = path.join(__dirname, '..', 'public', '备案图标.png');
  if (fs.existsSync(assetSource)) {
    const assetDir = path.join(outDir, 'assets');
    fs.mkdirSync(assetDir, { recursive: true });
    fs.copyFileSync(assetSource, path.join(assetDir, '备案图标.png'));
  }
  console.log('Generated docs/index.html');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
