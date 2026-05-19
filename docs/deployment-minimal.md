# 最小部署说明

## 适用范围

- 本地开发：Windows
- 预发布 / 生产部署：Linux
- 商业主前端：`apps/web-next`
- API 启动入口：`services/api/server.ts`
- 桌面端自动更新配置入口：`src/main/lib/updater.ts`

## 统一环境分层

- `VG_APP_ENV=development`
  - 仅用于 Windows 本地开发
  - 可保留开发验证码
  - 不允许桌面端自动更新检查
- `VG_APP_ENV=staging`
  - 用于 Linux 预发布或桌面端灰度验证
  - 禁止 mock 回退
  - 配置真实 `VG_UPDATE_BASE_URL` 后允许桌面端自动更新检查
- `VG_APP_ENV=production`
  - 用于正式运营
  - 禁止固定验证码直登
  - 禁止 mock 回退
  - 配置真实 `VG_UPDATE_BASE_URL` 后允许桌面端自动更新检查

## 启动命令

### Windows 开发

```bash
npm install
npm run dev:api
npm run dev:web-next
```

### Linux 预发布 / 生产

```bash
npm install
npm run build:web-next
node services/api/server.ts
next start apps/web-next --hostname 0.0.0.0 --port 18280
```

## 环境模板

- 预发布模板：
  - `env/staging.env.example`
- 生产模板：
  - `env/production.env.example`

## 关键环境变量

### Development

```bash
VG_APP_ENV=development
VG_ALLOW_MOCK_GENERATION=true
VIDEOGENERATE_DATA_DIR=D:/phpstudy_pro/WWW/videogenerate/.videogenerate
NEXT_PUBLIC_WEB_API_BASE_URL=http://127.0.0.1:18080
WEB_API_BASE_URL=http://127.0.0.1:18080
VG_DEV_LOGIN_CODE=123456
```

### Staging

```bash
VG_APP_ENV=staging
VG_ALLOW_MOCK_GENERATION=false
VG_SMS_PROVIDER=console
VG_UPDATE_BASE_URL=https://staging-update.example.com
VIDEOGENERATE_DATA_DIR=/srv/videogen-staging/data
VIDEOGENERATE_WEB_API_HOST=0.0.0.0
VIDEOGENERATE_WEB_API_PORT=18080
NEXT_PUBLIC_WEB_API_BASE_URL=https://staging-api.example.com
WEB_API_BASE_URL=https://staging-api.example.com
```

### Production

```bash
VG_APP_ENV=production
VG_ALLOW_MOCK_GENERATION=false
VG_SMS_PROVIDER=console
VG_UPDATE_BASE_URL=https://update.example.com
VIDEOGENERATE_DATA_DIR=/srv/videogen/data
VIDEOGENERATE_WEB_API_HOST=0.0.0.0
VIDEOGENERATE_WEB_API_PORT=18080
NEXT_PUBLIC_WEB_API_BASE_URL=https://api.example.com
WEB_API_BASE_URL=https://api.example.com
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
- `VIDEOGENERATE_DATA_DIR`、`db`、`viral-clone`、`web-uploads` 是否可创建
- API 与 Web-Next 入口是否存在

## 运行时健康检查

- API 健康检查：
  - `GET /health`
- Web-Next 健康检查：
  - `GET /api/health`

## API 启动 smoke

```bash
npm run smoke:api
```

该命令会：

- 启动 `services/api/server.ts`
- 轮询 `http://127.0.0.1:19080/health`
- 成功后输出健康响应并退出

## Web + API 联合 smoke

```bash
npm run smoke:web-stack
```

该命令会：

- 启动 API（默认 `19080`）
- 启动 Web-Next（默认 `19180`）
- 检查：
  - `GET /health`
  - `GET /api/health`
  - `GET /login`

## 认证发码 smoke

```bash
npm run smoke:auth-send-code
```

该命令会验证：

- development 可使用开发验证码与 `mock` provider
- development 60 秒限频生效
- staging 在 `VG_SMS_PROVIDER=console` 下会返回真实环境口径
- staging 不再暴露 `devCode`

## 数据目录与存储

- 上传目录：
  - `${VIDEOGENERATE_DATA_DIR}/web-uploads`
- Clone 文件资产目录：
  - `${VIDEOGENERATE_DATA_DIR}/viral-clone`
- Web 商业数据默认正式存储：
  - `${VIDEOGENERATE_DATA_DIR}/db/web-platform.sqlite`
- Clone 项目元数据默认正式存储：
  - `${VIDEOGENERATE_DATA_DIR}/db/clone-projects.sqlite`
- 兼容与迁移说明：
  - 若首次启动时 SQLite 为空且存在 `${VIDEOGENERATE_DATA_DIR}/db/web-platform.json`，会自动导入旧 Web 商业数据
  - 若首次启动时 SQLite 为空且存在 `${VIDEOGENERATE_DATA_DIR}/db/clone-projects.json`，会自动导入旧 Clone 项目元数据
  - 若当前 Node 运行环境不支持 `node:sqlite`，会自动回退到 JSON 存储

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
  - 使用 Node 项目或 PM2 启动 `services/api/server.ts`
  - 启动命令建议通过仓库根目录执行：`node services/api/server.ts`
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
5. 启动 API
6. 启动 Web-Next
7. 验证健康检查、登录发码、`/clone` 主链路与桌面更新检查

## 验收清单

- API 能启动，并打印正确的 `app env`
- `GET /health` 返回 200
- Web-Next 能启动
- `GET /api/health` 返回 200
- 登录可先发码再登录
- `/clone` 可新建任务
- `/clone/[projectId]` 至少可推进到脚本候选生成
- 生产环境缺少真实模型 Key 时，会明确失败而不是返回 mock
- Linux 下数据目录与 SQLite 文件可正常创建
- 桌面端打包后不会再使用占位更新地址检查更新
- `npm run preflight:staging` / `npm run preflight:production` 可直接执行
- `npm run smoke:api` 可直接执行
