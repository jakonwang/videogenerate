# 2026-05-15 商业化闭环第五轮：Linux 预发布预检与环境模板

## 背景

- 前几轮已经完成正式存储切换、环境分层治理和桌面端更新源约束。
- 但 Linux 部署仍主要依赖文档手工检查，缺少可以直接执行的预检入口。
- 本轮目标是把“部署前能否通过基本配置检查”变成可执行脚本。

## 本轮改动

### 1. 新增部署预检脚本

- 新增：
  - `scripts/deploy-preflight.mjs`
- 当前提供两个 npm 入口：
  - `npm run preflight:staging`
  - `npm run preflight:production`

### 2. 新增环境模板

- 新增：
  - `env/staging.env.example`
  - `env/production.env.example`

### 3. 预检覆盖内容

- `VG_APP_ENV` 是否属于：
  - `development`
  - `staging`
  - `production`
- `staging / production` 是否强制：
  - `VG_ALLOW_MOCK_GENERATION=false`
- `VG_UPDATE_BASE_URL` 是否仍为占位值
- `VIDEOGENERATE_DATA_DIR`、`db`、`viral-clone`、`web-uploads` 是否可创建
- API 入口、Web-Next 入口、`package.json` 是否存在

## 使用说明

### Windows 本地模拟部署前检查

```bash
$env:VG_APP_ENV='staging'
$env:VG_ALLOW_MOCK_GENERATION='false'
$env:VG_UPDATE_BASE_URL='https://staging-update.example.com'
$env:VIDEOGENERATE_DATA_DIR='D:/phpstudy_pro/WWW/videogenerate/.videogenerate-staging'
$env:NEXT_PUBLIC_WEB_API_BASE_URL='https://staging-api.example.com'
$env:WEB_API_BASE_URL='https://staging-api.example.com'
npm run preflight:staging
```

### Linux 服务器预检

```bash
export VG_APP_ENV=production
export VG_ALLOW_MOCK_GENERATION=false
export VG_UPDATE_BASE_URL=https://update.example.com
export VIDEOGENERATE_DATA_DIR=/srv/videogen/data
export NEXT_PUBLIC_WEB_API_BASE_URL=https://api.example.com
export WEB_API_BASE_URL=https://api.example.com
npm run preflight:production
```

## 验收重点

- 部署前能提前发现占位更新地址、mock 配置残留、数据目录不可写等问题
- Windows 本地和 Linux 服务器可共用同一套预检逻辑
- 预检脚本不依赖额外第三方库，可直接随仓库执行
