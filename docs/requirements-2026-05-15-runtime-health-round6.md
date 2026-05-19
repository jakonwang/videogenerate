# 2026-05-15 商业化闭环第六轮：运行时健康检查与 API 启动 smoke

## 背景

- 前一轮已经补了 Linux 预发布环境变量预检，但仍缺少“服务能不能实际启动并响应”的最小运行时验收。
- 本轮不做完整进程编排，只补最小健康检查入口和 API 启动 smoke。

## 本轮改动

### 1. 新增 API 健康检查接口

- 新增：
  - `GET /health`
- 返回内容包含：
  - `ok`
  - `service`
  - `env`
  - `timestamp`
  - `dataDir`

### 2. 新增 Web-Next 健康检查接口

- 新增：
  - `GET /api/health`
- 返回内容包含：
  - `ok`
  - `service`
  - `env`
  - `timestamp`
  - `webApiBaseUrl`

### 3. 新增 API 启动 smoke 脚本

- 新增：
  - `scripts/api-smoke.mjs`
- npm 入口：
  - `npm run smoke:api`

### 4. Smoke 验收行为

- 自动启动：
  - `services/api/server.ts`
- 自动轮询：
  - `http://127.0.0.1:19080/health`
- 成功后打印健康响应并退出

## 使用说明

### Windows 本地模拟 staging 启动验收

```bash
$env:VG_APP_ENV='staging'
$env:VG_ALLOW_MOCK_GENERATION='false'
$env:VIDEOGENERATE_DATA_DIR='D:/phpstudy_pro/WWW/videogenerate/.videogenerate-smoke'
npm run smoke:api
```

### Linux 服务器最小运行时验收

```bash
export VG_APP_ENV=staging
export VG_ALLOW_MOCK_GENERATION=false
export VIDEOGENERATE_DATA_DIR=/srv/videogen-staging/data
npm run smoke:api
```

## 验收重点

- API 不只是能构建，还能实际监听端口并响应健康检查
- 健康响应能明确暴露当前运行环境
- Windows 本地和 Linux 服务器都可复用同一条 smoke 命令
