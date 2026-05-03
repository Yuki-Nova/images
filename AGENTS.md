# Handoff Prompt

You are taking over a Node/EJS project that renders an OSS image gallery and also builds a static site for GitHub Pages.

## What this repo does
- Local server: Express renders EJS and lists objects from Aliyun OSS.
- Static build: A script renders the same EJS template into docs/index.html.
- GitHub Pages: GitHub Actions builds and deploys docs/ daily and on push.

## Key files
- app.js: local server and OSS list logic
- views/index.ejs: gallery template with lightbox preview
- scripts/build-static.js: static HTML builder for docs/
- .github/workflows/pages.yml: build + deploy workflow
- .env: local OSS creds (ignored by git)

## Config and secrets
Local: .env with OSS_REGION, OSS_ACCESS_KEY_ID, OSS_ACCESS_KEY_SECRET, OSS_BUCKET.
CI: same names as GitHub Actions secrets.
OSS bucket should be public-read for unsigned URLs, or update code to use signed URLs.

## Common tasks
- Local preview: npm start
- Static build: npm run build:static
- Pages deploy: push to main or wait for scheduled run

## Current state
- Gallery uses public object URLs: https://<bucket>.<region>.aliyuncs.com/<path>
- Markdown copy format: ![](url)
- Lightbox: click image to fullscreen, Esc or click outside to close
- GitHub Actions schedule: daily at 02:00 UTC

## Typical issues
- 403 on images => bucket not public-read, or wrong region
- Empty page => OSS list failed; check server logs
- Missing images => object prefix or permissions

## What to do first if something breaks
1) Verify OSS_REGION/OSS_BUCKET match the actual bucket.
2) Confirm bucket ACL is public-read if using public URLs.
3) Run npm run build:static locally to reproduce.
4) Check Actions logs for build failures.
