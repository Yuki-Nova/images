const express = require('express');
const OSS = require('ali-oss');
const ejs = require('ejs');
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const bodyParser = require('body-parser');
const { buildPublicUrl, PROCESS_SUFFIX, listAllImages } = require('./lib/images');
require('dotenv').config();

const app = express();
const port = 3000; // 本地端口

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.use(express.json({ limit: '1mb' }));

const staticDir = path.join(__dirname, 'public');
app.use('/assets', express.static(staticDir));

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
const categoriesPath = path.join(__dirname, 'categories.json');

// --- auth (same pattern as bookswich: password login -> deterministic session token) ---
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const AUTH_SALT = '_SALT_GALLERY_V1';
const hasAuth = () => !!ADMIN_PASSWORD;
const sessionToken = () => 'web_' + crypto.createHash('sha256').update(ADMIN_PASSWORD + AUTH_SALT).digest('hex').slice(0, 48);
function tokenValid(req) {
  if (!hasAuth()) return true;
  const expected = sessionToken();
  const header = req.headers['x-auth-token'];
  const query = req.query && req.query.token;
  return header === expected || query === expected;
}

async function readCategories() {
  try {
    const text = await fs.readFile(categoriesPath, 'utf8');
    const parsed = JSON.parse(text || '{}');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }
    return {};
  } catch (e) {
    if (e.code === 'ENOENT') {
      return {};
    }
    throw e;
  }
}

async function writeCategories(categories) {
  const payload = JSON.stringify(categories, null, 2);
  await fs.writeFile(categoriesPath, `${payload}\n`, 'utf8');
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

// listAllImages / buildPublicUrl / PROCESS_SUFFIX live in lib/images.js (shared with build-static.js)

app.get('/', async (req, res) => {
  try {
    const images = await listAllImages(client);
    const categories = await readCategories();
    res.render('index', { images, initialCategories: categories });
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

app.post('/api/auth/login', (req, res) => {
  if (!hasAuth()) return res.status(404).json({ error: 'auth not configured on server' });
  const { password } = req.body || {};
  if (password === ADMIN_PASSWORD) return res.json({ token: sessionToken() });
  return res.status(401).json({ error: '密码错误' });
});

app.get('/api/categories', async (req, res) => {
  try {
    const categories = await readCategories();
    res.json({ categories });
  } catch (e) {
    res.status(500).json({ error: 'Failed to read categories.' });
  }
});

app.put('/api/categories', async (req, res) => {
  if (!tokenValid(req)) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const payload = req.body && typeof req.body === 'object'
    ? (req.body.categories || req.body)
    : null;

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return res.status(400).json({ error: 'Invalid categories payload.' });
  }

  for (const [key, value] of Object.entries(payload)) {
    if (typeof key !== 'string' || typeof value !== 'string') {
      return res.status(400).json({ error: 'Categories must be string pairs.' });
    }
  }

  try {
    await writeCategories(payload);
    return res.json({ ok: true, count: Object.keys(payload).length });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to write categories.' });
  }
});

// 启动服务器
app.listen(port, () => {
  testConnection(); // 先测试连接
});
