const express = require('express');
const OSS = require('ali-oss');
const ejs = require('ejs');
const path = require('path');
const bodyParser = require('body-parser');
require('dotenv').config();

const app = express();
const port = 3000; // 本地端口

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// --- 1. 配置阿里云 OSS ---
const ossConfig = {
  region: process.env.OSS_REGION, // 例如: oss-cn-shanghai
  accessKeyId: process.env.OSS_ACCESS_KEY_ID,
  accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET,
  bucket: process.env.OSS_BUCKET,
};

const missingOssConfig = Object.entries(ossConfig)
  .filter(([, value]) => !value)
  .map(([key]) => key);

if (missingOssConfig.length > 0) {
  console.error('❌ OSS 配置缺失，请检查 .env 或环境变量：');
  console.error(missingOssConfig.join(', '));
  process.exit(1);
}

const client = new OSS(ossConfig);
const publicBaseUrl = `https://${ossConfig.bucket}.${ossConfig.region}.aliyuncs.com/`;

function buildPublicUrl(objectName) {
  const encodedPath = objectName
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return `${publicBaseUrl}${encodedPath}`;
}

// --- 启动时先测试连接 OSS，确保配置正确 ---
async function testConnection() {
  try {
    console.log('⏳ 正在尝试连接阿里云 OSS...');
    // 尝试获取 bucket 信息，这是最轻量的测试
    await client.getBucketInfo();
    console.log('✅ OSS 连接成功！配置正确。');
    console.log(`🚀 服务器已启动: http://localhost:${port}`);
  } catch (e) {
    console.error('❌ OSS 连接失败！请检查配置：');
    console.error('错误代码:', e.code); // 比如 AccessDenied, InvalidAccessKeyId
    console.error('错误信息:', e.message);
    process.exit(1); // 停止程序
  }
}

async function listAllImages() {
  const images = [];
  let marker = null;

  do {
    const result = await client.list({ marker, 'max-keys': 1000 });
    const objects = result.objects || [];

    for (const obj of objects) {
      if (obj.name.endsWith('/')) {
        continue;
      }

      images.push({
        name: path.basename(obj.name),
        objectKey: obj.name,
        lastModified: obj.lastModified || null,
        url: buildPublicUrl(obj.name),
      });
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

app.get('/', async (req, res) => {
  try {
    const images = await listAllImages();
    res.render('index', { images });
  } catch (e) {
    console.error('❌ 获取 OSS 列表失败：', e);
    const details = {
      code: e.code,
      status: e.status,
      requestId: e.requestId,
      message: e.message,
    };
    res.status(500).send(`<!DOCTYPE html>
<html lang="zh">
  <head>
    <meta charset="UTF-8" />
    <title>Failed to load images</title>
    <style>body{font-family:Arial, sans-serif;padding:20px;background:#f5f5f5;}pre{background:#fff;padding:12px;border-radius:6px;}</style>
  </head>
  <body>
    <h1>Failed to load images</h1>
    <p>OSS 访问失败，详情如下：</p>
    <pre>${JSON.stringify(details, null, 2)}</pre>
  </body>
</html>`);
  }
});

// 启动服务器
app.listen(port, () => {
  testConnection(); // 先测试连接
});
