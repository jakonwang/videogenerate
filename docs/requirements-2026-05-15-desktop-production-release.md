# 2026-05-15 桌面正式上线闭环

## 背景

- 当前仓库已经具备 Electron Windows 打包能力、Linux 预检脚本、Web/API 部署骨架和桌面端自动更新逻辑。
- 但此前发布链路仍缺少统一口径：
  - 自动更新地址还是占位配置思路
  - 桌面安装包、官网分发、Linux API/Web、更新源没有收口到同一份正式步骤
- 本轮目标是只做最小正式上线闭环，不扩展新业务功能，不做桌面端大重构。

## 本轮收口内容

### 1. 正式域名职责固定

- `www.example.com`
  - 官网、下载页、商业介绍页
- `api.example.com`
  - Web/API 主业务接口
  - 授权校验、验证码、版本检查接口
- `update.example.com`
  - Electron 自动更新静态资源
  - 托管 `latest.yml`、安装包、`.blockmap`

### 2. 桌面发布配置固定

- `package.json`
  - `build.publish.url` 固定为 `https://update.example.com`
- 正式环境变量继续使用：
  - `VG_APP_ENV=production`
  - `VG_ALLOW_MOCK_GENERATION=false`
  - `VG_UPDATE_BASE_URL=https://update.example.com`
  - `NEXT_PUBLIC_WEB_API_BASE_URL=https://api.example.com`
  - `WEB_API_BASE_URL=https://api.example.com`

### 3. 正式发布顺序

#### Windows 本地打包

```bash
npm install
npm run setup:fonts
npm run build
npm run dist
```

产物要求：

- `release/latest.yml`
- `release/VideoGenerate-<version>-Setup.exe`
- `release/VideoGenerate-<version>-Setup.exe.blockmap`

#### Linux 宝塔 / 面板部署

- `www`
  - 构建：`npm run build:web-next`
  - 启动：`npm run start:web-next`
- `api`
  - 启动：`node services/api/server.ts`
- `update`
  - 作为静态站点目录，直接上传桌面更新资源

#### 更新资源上传

上传顺序：

1. `latest.yml`
2. `*.exe`
3. `*.blockmap`

要求：

- 上传目录对外可直接访问
- 启用 HTTPS
- 不拦截 `latest.yml`
- 允许 HEAD / GET
- 允许大文件下载

### 4. 授权与更新接口口径

继续复用现有业务站点，不新增 Node 授权服务：

- 授权校验：
  - `POST /index.php/api/client/verifyLicense`
- 更新检查：
  - `GET|POST /index.php/api/client/checkUpdate`
- 官网下载页：
  - `GET /index.php/download`

联调要求：

- 返回 UTF-8 JSON
- 错误结构稳定
- 不依赖 Session / Cookie
- `download_url` 必须指向真实可下载资源

## 使用说明

### Windows 本地如何打正式包

1. 修改 `package.json` 版本号
2. 执行 `npm run setup:fonts`
3. 执行 `npm run build`
4. 执行 `npm run dist`
5. 检查 `release` 目录中的安装包、`latest.yml` 和 `.blockmap`

### Linux 宝塔如何部署 API / Web / 更新源

1. 在宝塔配置 3 个子域：
   - `www.example.com`
   - `api.example.com`
   - `update.example.com`
2. `www` 子域托管 Web-Next
3. `api` 子域托管 API 进程
4. `update` 子域托管静态更新资源
5. 全部启用 HTTPS

### 如何上传 `latest.yml` 和安装包

1. 在 Windows 本地生成发布产物
2. 上传 `release/latest.yml`
3. 上传对应版本 `Setup.exe`
4. 上传对应版本 `.blockmap`
5. 访问 `https://update.example.com/latest.yml` 验证可读

### 如何做首发版本与后续增量更新

首发：

1. 先发布一个稳定版本
2. 手动安装验证主链路
3. 再开放给外部用户下载

后续增量更新：

1. 提升版本号
2. 重新打包
3. 上传新的 `latest.yml` 和新版本安装包
4. 用旧版本客户端验证更新提示与安装流程

## 验收

- `npm run preflight:production` 可通过
- Windows 安装包可安装、可启动、可登录、可进入 `/clone` 主链路
- `GET /health` 返回 200
- `GET /api/health` 返回 200
- 授权接口可用
- 更新检查接口可用
- `update.example.com` 上的安装包与 `latest.yml` 可直接访问
- 生产环境不再使用 mock 回退

## 风险说明

- 当前首发只覆盖 Windows 桌面端，不扩展 macOS / Linux 桌面安装包
- 若缺少代码签名证书，首发允许先采用“未签名安装包 + 官网分发”，但需在运营侧明确提示
- 当前更新源使用独立静态子域，不在首轮引入对象存储 / CDN，以降低复杂度
