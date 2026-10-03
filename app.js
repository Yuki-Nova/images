const express = require('express');
const OSS = require('ali-oss');
const ejs = require('ejs');
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { buildPublicUrl, PROCESS_SUFFIX, listAllImages } = require('./lib/images');
require('dotenv').config();

const app = express();
const port = 3000; // 本地端口

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.use(express.json({ limit: '1mb' }));

// CORS 支持
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, X-Auth-Token');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

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
// fail-closed：未配置 ADMIN_PASSWORD 时一律判为无权限（曾经是 `return true`，等于写接口裸奔）
function tokenValid(req) {
  if (!hasAuth()) return false;
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
  if (!hasAuth()) {
    return res.status(503).json({ error: 'auth not configured on server (ADMIN_PASSWORD missing); write API disabled' });
  }
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
  if (!hasAuth()) {
    // fail-closed：没有密码就不提供写能力，而不是无条件放行
    return res.status(503).json({ error: 'auth not configured on server (ADMIN_PASSWORD missing); write API disabled' });
  }
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

// 实时获取 OSS 全部图片列表 + 当前分类
app.get('/api/images', async (req, res) => {
  try {
    const images = await listAllImages(client);
    const categories = await readCategories();
    const merged = images.map((img) => ({
      key: img.objectKey,
      name: img.name,
      url: img.url,
      thumb: img.thumbUrl,
      time: img.lastModified,
      category: categories[img.objectKey] || '未分类',
    }));
    return res.json({ ok: true, images: merged, categories });
  } catch (e) {
    console.error('❌ 获取 OSS 实时图片失败：', e);
    return res.status(500).json({ error: 'Failed to list images from OSS.' });
  }
});

// 在线删除 OSS 图片（需要管理员鉴权）
app.delete('/api/images', async (req, res) => {
  if (!hasAuth()) {
    return res.status(503).json({ error: 'auth not configured on server (ADMIN_PASSWORD missing); delete API disabled' });
  }
  if (!tokenValid(req)) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const { objectKey } = req.body || {};
  if (!objectKey || typeof objectKey !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid objectKey.' });
  }

  try {
    console.log(`🗑️ 正在从 OSS 删除文件: ${objectKey}`);
    await client.delete(objectKey);

    // 同步从 categories.json 中移除
    const categories = await readCategories();
    if (categories[objectKey]) {
      delete categories[objectKey];
      await writeCategories(categories);
    }

    return res.json({ ok: true, deleted: objectKey });
  } catch (e) {
    console.error('❌ 删除 OSS 图片失败：', e);
    return res.status(500).json({ error: 'Failed to delete object from OSS.' });
  }
});

// 启动服务器
app.listen(port, () => {
  if (!hasAuth()) {
    console.warn('⚠️  ADMIN_PASSWORD 未配置：写接口 PUT /api/categories 与登录接口均返回 503（fail-closed）。');
    console.warn('    如需在线管理分类，请在 .env 配置 ADMIN_PASSWORD 后重启。');
  } else {
    console.log('🔒 写接口已启用鉴权（X-Auth-Token / ?token=）');
  }
  testConnection(); // 先测试连接
});
