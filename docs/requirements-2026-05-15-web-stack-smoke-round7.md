# 2026-05-15 商业化闭环第七轮：Web + API 双进程联合 smoke

## 背景

- 前一轮已经补了 API `/health`、Web `/api/health` 和 `smoke:api`。
- 但仅验证 API 启动还不够，还需要确认 Web-Next 在连接同一套后端配置时也能启动并访问核心入口页。

## 本轮改动

### 1. 新增双进程联合 smoke 脚本

- 新增：
  - `scripts/web-stack-smoke.mjs`
- npm 入口：
  - `npm run smoke:web-stack`

### 2. 联合 smoke 验收内容

- 启动 API：
  - `services/api/server.ts`
- 启动 Web-Next：
  - `next start --hostname 127.0.0.1 --port 19180`
- 校验：
  - `GET /health`
  - `GET /api/health`
  - `GET /login`

### 3. 端口策略

- API smoke 默认使用：
  - `19080`
- Web stack smoke 默认使用：
  - API `19080`
  - Web `19180`
- 目的是避开本机常驻开发端口：
  - API `18080`
  - Web `18280`

## 使用说明

### Windows 本地模拟 staging 联合验收

```bash
$env:VG_APP_ENV='staging'
$env:VG_ALLOW_MOCK_GENERATION='false'
$env:VIDEOGENERATE_DATA_DIR='D:/phpstudy_pro/WWW/videogenerate/.videogenerate-web-stack-smoke'
npm run smoke:web-stack
```

## 验收重点

- API 和 Web-Next 能在同一套 staging 环境变量下同时启动
- API `/health` 返回 200
- Web `/api/health` 返回 200
- `/login` 可返回 200，不是空白或崩溃页
