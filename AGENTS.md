# 项目级规则：my-oss-gallery（OSS 相册服务）

上级规则见 `~/.dsh/AGENTS.md`；本文件只写**本项目特有**的规则与坑点。
「是什么 / 技术栈 / 环境变量 / 目录结构」见 `README.md`，此处不重复。

## 一、定位与权威源

- 独立仓库：`git@github.com:Yuki-Nova/images.git` —— **注意仓库名是 `images`，不是目录名**。
- 对外提供 `https://yukinova.top/images`：Nginx 反代到本服务，动态遍历 OSS Bucket 渲染 EJS 页面；
  页面图片走 CDN `img.yukinova.top`（回源走 OSS 内网，免下行流量费）。
- `docs/index.html` + `docs/assets/` 是**静态构建产物**，同时是 `web-portal` 相册页的数据源：
  `web-portal/scripts/extract-gallery.js` 读它和 `categories.json`，生成 `web-portal/public/gallery.json`。
  **改了相册展示，记得去 `web-portal` 重跑抽取脚本**。

## 二、硬规则

1. **凭据零入库。** `.env`（`OSS_REGION` / `OSS_ACCESS_KEY_ID` / `OSS_ACCESS_KEY_SECRET` / `OSS_BUCKET`，
   另有 `ADMIN_PASSWORD`）已在 `.gitignore` 内，实测**未被 git 跟踪** —— 保持这个状态；
   日志、截图、文档、提交信息都不要带出 AccessKey。
2. **端口硬编码 3000**（`app.js:11` `const port = 3000;`，不是环境变量）。
   改端口必须同步通知 Nginx 反代配置，并且**不要自行改服务器**（服务器操作走宝塔 + SSH，需用户确认）。
3. **写接口默认 fail-closed**：未配 `ADMIN_PASSWORD` 时，`PUT /api/categories` 与登录接口返回 503
   （`app.js:235-237` 的告警）。不要为了「能用」改成默认放行。
4. 接口清单（`app.js` 实测）：`GET /`、`POST /api/auth/login`、`GET /api/categories`、
   `PUT /api/categories`、`GET /api/images`、`DELETE /api/images`；静态资源走 `/assets`。
   改接口要同步 `web-portal` 的相册页（`GalleryView.vue` 会**静默降级**到静态快照，见 `web-portal/AGENTS.md` 坑点 3）。

## 三、坑点

1. **`npm test` 是占位符**：`package.json` 里是 `echo "Error: no test specified" && exit 1`，跑必然失败。
   **不要**把它接进 `tools/dsh.ps1 test`（会造成误报）；本项目当前没有自动化测试，验证方式见第四节。
2. **`body-parser` 已移除**：`app.js:15` 只用 `express.json({ limit: '1mb' })`。
   README 技术栈表里那一行是过期的（2026-10-06 已修正）。历史上移除后还在 `node_modules/` 残留被跟踪文件，
   已清理，别再把它加回来。
3. **OSS 图片处理参数必须保留**：缩略图 URL 带
   `?x-oss-process=image/auto-orient,1/quality,q_30/format,webp`（`lib/images.js` 的 `PROCESS_SUFFIX`）。
   去掉它会让页面流量与加载时间暴涨。
4. **`docs/` 是产物，不要手改**：`docs/index.html` 由 `npm run build:static` 生成；
   要改样式改 `views/index.ejs` 与 `views/partials/`。

## 四、改动后的验证

1. `npm start` → 打开 `http://localhost:3000/`，确认相册能出图。
   **没有 OSS 凭据时必然失败，属预期**，如实报告即可，不要伪造验证结果。
2. `npm run build:static` → 确认 `docs/index.html` 有实际变化（`git status` 能看到）。
3. 接口有改动时，用浏览器或 `agent-browser` 实点一遍 `/api/images`、`/api/categories`。
4. 相册内容/结构有变动时，到 `web-portal` 重跑 `node scripts/extract-gallery.js`（只改外观可跳过）。

## 五、边界

- 不新增依赖（尤其不要替换 `ali-oss`）；确需新增先征得用户同意。
- 不碰服务器（Nginx / 宝塔 / OSS 桶配置）。
- 中文注释、中文提交信息（纯中文简述，不加 Conventional Commits 前缀）。
