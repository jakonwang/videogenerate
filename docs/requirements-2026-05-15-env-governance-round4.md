# 2026-05-15 商业化闭环第四轮：环境与部署配置治理

## 背景

- 前三轮已经把 Web 登录、生产禁 mock、`web-platform` 存储、`cloneRepo` 存储逐步收口。
- 但运行环境判断仍然分散在多个文件里，桌面端自动更新也仍保留占位 URL 逻辑痕迹。
- 本轮目标不是新增业务能力，而是把 `development / staging / production` 的行为边界收清楚，降低桌面端和 Linux 部署误配风险。

## 本轮改动

### 1. 新增统一环境判断 helper

- 新增：
  - `src/main/lib/appEnv.ts`
- 当前统一支持三种环境：
  - `development`
  - `staging`
  - `production`

### 2. Web 登录与 mock 策略改用统一环境判断

- `src/main/modules/web-platform/service.ts`
  - 登录验证码逻辑改为复用统一环境判断
- `src/main/modules/clone/mockPolicy.ts`
  - mock 允许条件改为复用统一环境判断

### 3. 桌面端自动更新按环境分层治理

- `src/main/lib/updater.ts`
  - 仅 `staging / production` 且配置真实 `VG_UPDATE_BASE_URL` 时允许自动更新检查
  - `development` 环境即使打包，也不会执行更新检查
  - 当环境或更新源不满足条件时，输出明确警告

### 4. API 启动入口补全环境与 repo 初始化

- `services/api/server.ts`
  - 启动时同时执行：
    - `webPlatformRepo.ensureSeed()`
    - `cloneRepo.ensureSeed()`
  - 启动日志新增：
    - `app env`
  - 便于 Linux 预发布环境确认实际运行模式

## 使用说明

### Windows 本地开发

```bash
VG_APP_ENV=development
npm run dev:api
npm run dev:web-next
```

### Linux 预发布

```bash
VG_APP_ENV=staging
VG_ALLOW_MOCK_GENERATION=false
VG_UPDATE_BASE_URL=https://staging-update.example.com
node services/api/server.ts
```

### Linux 生产

```bash
VG_APP_ENV=production
VG_ALLOW_MOCK_GENERATION=false
VG_UPDATE_BASE_URL=https://update.example.com
node services/api/server.ts
```

## 验收重点

- `development / staging / production` 行为边界明确
- `development` 下桌面端不会误走自动更新
- `staging / production` 缺少真实更新源时不会再悄悄使用占位值
- API 启动时会同时初始化 Web 商业数据和 Clone 项目元数据
