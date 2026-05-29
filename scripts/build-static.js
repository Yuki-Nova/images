// scripts/build-static.js
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const OSS = require('ali-oss');
const ejs = require('ejs');

const client = new OSS({
  region: process.env.OSS_REGION,
  accessKeyId: process.env.OSS_ACCESS_KEY_ID,
  accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET,
  bucket: process.env.OSS_BUCKET,
});

const publicBaseUrl = 'https://img.yukinova.top/';
const PROCESS_SUFFIX = '?x-oss-process=image/auto-orient,1/quality,q_30/format,webp';

function buildPublicUrl(objectName) {
  return objectName
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')
    .replace(/^/, publicBaseUrl);
}

async function listAllImages() {
  const images = [];
  let marker = null;

  do {
    const result = await client.list({ marker, 'max-keys': 1000 });
    const objects = result.objects || [];

    for (const obj of objects) {
      if (!obj.name.endsWith('/')) {
        const originalUrl = buildPublicUrl(obj.name);
        images.push({
          name: path.basename(obj.name),
          objectKey: obj.name,
          lastModified: obj.lastModified || null,
          url: originalUrl,
          thumbUrl: originalUrl + PROCESS_SUFFIX,
        });
      }
    }

    marker = result.nextMarker;
  } while (marker);

  images.sort((a, b) => {
    const timeA = a.lastModified ? Date.parse(a.lastModified) : 0;
    const timeB = b.lastModified ? Date.parse(b.lastModified) : 0;
    return timeB - timeA;
  });

  return images;
}

async function main() {
  const images = await listAllImages();
  const html = await ejs.renderFile(
    path.join(__dirname, '..', 'views', 'index.ejs'),
    { images }
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
