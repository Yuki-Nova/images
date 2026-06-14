# yukinova.top/images OSS 相册

基于 Node.js + Express 的动态相册服务，实时遍历阿里云 OSS 存储桶并渲染展示图片，通过阿里云 CDN 加速图片加载。

## 技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| [Node.js](https://nodejs.org/) | v24 | 运行时环境 |
| [Express](https://expressjs.com/) | 4.21.2 | Web 服务框架 |
| [EJS](https://ejs.co/) | 5.0.2 | 服务端模板渲染 |
| [ali-oss](https://github.com/ali-sdk/ali-oss) | 6.23.0 | 阿里云 OSS SDK，遍历图片列表 |
| [dotenv](https://github.com/motdotla/dotenv) | 16.5.0 | 环境变量管理 |
| [body-parser](https://github.com/expressjs/body-parser) | 2.2.2 | 请求体解析 |
| 阿里云 OSS | - | 图片存储（华东2 上海，Bucket: yukino139） |
| 阿里云 CDN | - | 图片加速分发（img.yukinova.top） |
| Nginx | - | 反向代理（宝塔面板管理） |

## 部署架构

```
用户访问 https://yukinova.top/images
    ↓
Nginx 反向代理
    ↓
Node.js 服务（:3000）
    ↓ ali-oss SDK 遍历 Bucket
返回图片列表，渲染 EJS 模板
    ↓
页面图片通过 CDN 加载（img.yukinova.top）
    ↓ 缓存命中 → 直接返回
    ↓ 未命中 → 回源 OSS（内网，免流量费）
```

## 环境变量配置

在项目根目录创建 `.env` 文件：

```env
OSS_REGION=oss-cn-shanghai
OSS_ACCESS_KEY_ID=你的AccessKeyId
OSS_ACCESS_KEY_SECRET=你的AccessKeySecret
OSS_BUCKET=yukino139
```

> ⚠️ `.env` 文件包含敏感信息，不要提交到 Git 仓库。

## 本地开发

```bash
# 安装依赖
npm install

# 启动动态服务（http://localhost:3000）
npm start

# 构建静态 HTML（输出到 docs/index.html，用于静态托管）
npm run build:static
```

## 目录结构

```
.
├── views/
│   └── index.ejs        # 相册页面模板
├── scripts/
│   └── build-static.js  # 静态构建脚本（生成 docs/index.html）
├── docs/
│   └── index.html       # 静态构建输出
├── app.js               # 动态服务入口
├── categories.json      # 图片分类配置
├── .env                 # 环境变量（不提交 Git）
└── package.json
```

## 图片处理

图片 URL 自动附加 OSS 图片处理参数，缩略图经过以下处理：

```
?x-oss-process=image/auto-orient,1/quality,q_30/format,webp
```

- 自动旋转校正
- 压缩质量 30%
- 转换为 WebP 格式

有效减少图片加载流量。
