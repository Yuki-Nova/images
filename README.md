# OSS Gallery

Static photo gallery rendered from Aliyun OSS objects.
基于阿里云 OSS 的静态相册展示。

## Structure
项目结构
- app.js: Express server for local preview and rendering
	app.js: 本地预览与渲染的 Express 服务器
- views/index.ejs: HTML template for the gallery
	views/index.ejs: 相册页面的 HTML 模板
- scripts/build-static.js: Build script to generate static HTML
	scripts/build-static.js: 生成静态 HTML 的构建脚本
- docs/: Output folder for GitHub Pages
	docs/: GitHub Pages 的输出目录
- .github/workflows/pages.yml: GitHub Actions workflow for build/deploy
	.github/workflows/pages.yml: 自动构建/发布的工作流

## Commands
常用命令
- npm start: Run the local server
	npm start: 启动本地服务器
- npm run build:static: Generate docs/index.html for GitHub Pages
	npm run build:static: 生成用于 Pages 的 docs/index.html

## Configuration
配置说明
Create a .env file with the following variables:
创建 .env 文件并填写以下变量：

OSS_REGION=oss-cn-shanghai
OSS_ACCESS_KEY_ID=your_access_key_id
OSS_ACCESS_KEY_SECRET=your_access_key_secret
OSS_BUCKET=your_bucket

Note: Keep .env out of git (.gitignore already includes it).
注意：请勿提交 .env（.gitignore 已包含）。

## Deploy to GitHub Pages
部署到 GitHub Pages
1) Push to the main branch to trigger the workflow.
	推送到 main 分支以触发工作流。
2) In GitHub repo settings, set Pages source to GitHub Actions.
	在仓库设置中将 Pages 来源设置为 GitHub Actions。
3) Add OSS secrets in Settings > Secrets and variables > Actions.
	在 Settings > Secrets and variables > Actions 中配置 OSS secrets。
4) The site will be available after the workflow completes.
	工作流完成后即可访问站点。
