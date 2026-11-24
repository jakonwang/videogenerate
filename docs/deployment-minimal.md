# 最小部署说明

## 适用范围

- 本地开发：Windows
- 预发布 / 生产部署：Linux
- 官网 + 用户中心 + 后台：`apps/web-next`（Next.js）
- 云服务（账号、会员、云同步、AI / 视频任务）：`services/cloud/server.ts`，同时在 `/app/` 提供网页版（`apps/mobile` 的 web 构建）
- 桌面端自动更新配置入口：`src/main/lib/updater.ts`

> 旧的网页工作台（`apps/web`、`services/api`、web-next 里的 workspace / clone / plugins 等页面）已于 2026-11 移除，
> 功能由网页版 `/app/` 承接；旧路由在 `apps/web-next/next.config.ts` 里重定向到用户中心。

## 统一环境分层

- `VG_APP_ENV=development`：仅用于 Windows 本地开发；不允许桌面端自动更新检查
- `VG_APP_ENV=staging`：Linux 预发布或桌面端灰度验证；禁止 mock 回退；配置真实 `VG_UPDATE_BASE_URL` 后允许自动更新检查
- `VG_APP_ENV=production`：正式运营；禁止 mock 回退；配置真实 `VG_UPDATE_BASE_URL` 后允许自动更新检查

## 启动命令

### Windows 开发

```bash
npm install
npm run dev:cloud
npm run dev:web-next
```

网页版开发：`cd apps/mobile && npm run dev:web`（代理 `/api` 到 `18300`）。

### Linux 预发布 / 生产

```bash
npm install
(cd apps/mobile && npm install && npm run build:web)
npm run build:web-next
npm run start:cloud
npm run start:web-next
```

云服务的环境变量、PM2 与 Nginx 示例见 `services/cloud/README.md` 与 `services/cloud/deploy/`。

网页版的「批量字幕」「图生视频字幕」在服务器上用 Remotion（无界面 Chrome）渲染，部署时额外做一次：

```bash
npm run setup:fonts            # 字幕字体（CLOUD_FONTS_DIR，默认 resources/fonts）
npm run cloud:remotion-browser # 预先下载无界面 Chrome（约 110 MB）
# Debian / Ubuntu：Chrome 依赖的系统库
apt-get install -y libnss3 libdbus-1-3 libatk1.0-0 libgbm1 libasound2 libxrandr2 libxkbcommon0 libxfixes3 libxcomposite1 libxdamage1 libatk-bridge2.0-0 libpango-1.0-0 libcairo2 libcups2
```

同时渲染数用 `CLOUD_SUBTITLE_RENDER_SLOTS` 控制（默认 1，全服务器共用；每个渲染约占几百 MB 内存）。

批量换景的「保真」模式调用腾讯云数据万象抠图（按张收费，同一张原图只抠一次），服务器不装模型：

1. 建一个**私有读写**的 COS 存储桶（可用地域以腾讯云控制台为准），绑定数据万象，给 `scene-swap-temp/` 设 1 天自动删除。
2. 建一个只授权这个桶的子账号：`cos:PutObject`、`cos:GetObject`、`cos:DeleteObject`，以及 `ci:CreateS3AIPicMattingJob`、`ci:CreateS3AIPicPortraitMattingJob`、`ci:CreateGoodsMattingJob`。
3. 后台「软件设置 → 腾讯云抠图」填 SecretId、SecretKey、存储桶、地域。没填时只能用「融合」模式。

并发和每天免费试图数：`CLOUD_SCENE_SWAP_CONCURRENCY`（默认 3）、`CLOUD_SCENE_SWAP_TRIALS_PER_DAY`（默认 10）。系统场景在后台「换景场景库」上传。

## 环境模板

- 预发布：`env/staging.env.example`
- 生产：`env/production.env.example`
- 云服务：`services/cloud/deploy/cloud.env.example`

## 关键环境变量

```bash
VG_APP_ENV=production
VG_ALLOW_MOCK_GENERATION=false
VG_UPDATE_BASE_URL=https://update.example.com
VIDEOGENERATE_DATA_DIR=/srv/videogen/data
NEXT_PUBLIC_CLOUD_API_BASE_URL=https://api.example.com
```

## 部署前预检

```bash
npm run preflight:staging
npm run preflight:production
```

预检会检查：

- `VG_APP_ENV` 是否合法
- `VG_ALLOW_MOCK_GENERATION` 是否符合 staging / production 约束
- `VG_UPDATE_BASE_URL` 是否仍为占位值
- `NEXT_PUBLIC_CLOUD_API_BASE_URL` 是否为 http/https
- `VIDEOGENERATE_DATA_DIR` 是否可创建
- 云服务与 Web-Next 入口是否存在

## 运行时健康检查

- Web-Next：`GET /api/health`

## 更新配置

- 桌面端自动更新必须配置真实更新源：
  - `VG_UPDATE_BASE_URL`
- 仍然使用占位值时：
  - `https://YOUR_UPDATE_URL`
  - 自动更新不会启用
- 当前策略：
  - 仅 `staging` / `production` 允许自动更新检查
  - `development` 永不检查更新

## 桌面正式发布流程

### Windows 本地打正式包

```bash
npm install
npm run setup:fonts
npm run build
npm run dist
```

产物目录：

- `release/latest.yml`
- `release/VideoGenerate-<version>-Setup.exe`
- `release/VideoGenerate-<version>-Setup.exe.blockmap`

发布顺序：

1. 先提升 `package.json` 中的版本号
2. 在 Windows 本地重新执行 `npm run dist`
3. 确认 `release` 中生成新的安装包、`latest.yml` 与 `.blockmap`
4. 再上传到 `update` 更新源站点

### Linux 宝塔 / 面板部署

建议固定 3 个子域：

- `www.example.com`
  - Web 官网与下载页
- `api.example.com`
  - API 与授权 / 发码 / 更新检查接口
- `update.example.com`
  - Electron 自动更新静态资源

宝塔落地方式：

- `www`
  - 使用 Node 项目或 PM2 启动 `apps/web-next`
  - 构建命令：`npm run build:web-next`
  - 启动命令：`npm run start:web-next`
- `api`
  - 使用 PM2 启动云服务：`services/cloud/deploy/ecosystem.config.cjs`
  - 网页版随云服务在 `https://api.example.com/app/` 提供
- `update`
  - 建立静态站点目录
  - 上传 `latest.yml`、`*.exe`、`*.blockmap`
  - 允许 HTTPS、HEAD、GET 与大文件下载

Nginx / 面板层要求：

- `www` 与 `api` 启用 HTTPS
- `update` 启用 HTTPS，且不能拦截 `latest.yml`
- API 反代保留真实 `Host` 与 `X-Forwarded-Proto`
- 更新站点允许直接访问安装包和 `blockmap`

### 更新源上传说明

首次上线：

1. 先把 `release/latest.yml`
2. 再把 `release/*.exe`
3. 再把 `release/*.blockmap`
4. 上传到 `https://update.example.com/` 对应静态目录

后续增量更新：

1. 提升版本号
2. 重新生成安装包
3. 用同名新版本文件追加上传到更新源目录
4. 保证最新 `latest.yml` 与对应安装包版本一致

### 授权接口联调顺序

桌面端正式环境固定消费：

- 授权校验：
  - `POST https://api.example.com/index.php/api/client/verifyLicense`
- 版本检查：
  - `GET|POST https://api.example.com/index.php/api/client/checkUpdate`
- 官网下载页：
  - `GET https://www.example.com/index.php/download`

联调顺序：

1. 先验证授权接口可返回稳定 UTF-8 JSON
2. 再验证版本检查接口能对旧版本返回真实下载地址
3. 再验证 `download_url` 可跳转到 `update.example.com` 安装包
4. 最后在已安装旧版本的桌面端验证自动更新检查

### Windows 到 Linux 的发布操作顺序

1. Windows 本地打包桌面安装包
2. 上传桌面更新资源到 `update` 子域
3. Linux 服务器加载 `env/production.env.example` 对应变量
4. 执行 `npm run preflight:production`
5. 启动云服务
6. 启动 Web-Next
7. 验证健康检查、登录发码、网页版 `/app/` 登录与桌面更新检查

## 验收清单

- 云服务能启动，网页版 `/app/` 可登录
- Web-Next 能启动，`GET /api/health` 返回 200
- 官网登录后可进入用户中心、购买 / 兑换会员
- 生产环境缺少真实模型 Key 时，会明确失败而不是返回 mock
- 桌面端打包后不会再使用占位更新地址检查更新
- `npm run preflight:staging` / `npm run preflight:production` 可直接执行
