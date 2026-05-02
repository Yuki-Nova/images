const express = require('express');
const OSS = require('ali-oss');
const ejs = require('ejs');
const path = require('path');
const bodyParser = require('body-parser');
const readline = require('readline');

const app = express();
const port = 3000; // 本地端口

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// ... 前面的引用代码不变 ...

// --- 1. 配置阿里云 OSS ---
let client;
let ossConfig = {
  region: process.env.OSS_REGION, // 例如: oss-cn-shanghai
  accessKeyId: process.env.OSS_ACCESS_KEY_ID,
  accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET,
  bucket: process.env.OSS_BUCKET,
};

function askQuestion(rl, question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

async function ensureOssConfig() {
  const missing = Object.entries(ossConfig)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length === 0) {
    return;
  }

  console.log('❗OSS 配置缺失，请按提示输入。');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  try {
    for (const key of missing) {
      const value = await askQuestion(rl, `请输入 ${key}: `);
      if (!value) {
        console.error('❌ 输入为空，启动已终止。');
        process.exit(1);
      }
      ossConfig[key] = value;
      process.env[key] = value;
    }
  } finally {
    rl.close();
  }
}

// --- 新增：启动时先测试连接 ---
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
        url: client.signatureUrl(obj.name, { expires: 3600 }),
      });
    }

    marker = result.nextMarker;
  } while (marker);

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

// ... 后面的路由代码 ...

// 启动服务器
async function bootstrap() {
  await ensureOssConfig();
  client = new OSS(ossConfig);

  app.listen(port, () => {
    testConnection(); // 先测试连接
  });
}

bootstrap().catch((e) => {
  console.error('❌ 启动失败：', e.message);
  process.exit(1);
});
