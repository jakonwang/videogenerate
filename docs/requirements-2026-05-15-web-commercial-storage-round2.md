# 2026-05-15 Web 商业化闭环第二轮：正式存储替换

## 背景

- 第一轮已经完成 Web 登录改造、支付口径收口、生产禁 mock 和 `/clone/[projectId]` 主链路前置收口。
- 但 `web-platform` 商业数据此前仍以 `web-platform.json` 作为真源，服务重启后虽然可保留数据，仍不适合作为正式运营存储。
- 本轮只处理 `web-platform`，不扩大到 `cloneRepo`，避免影响主工作流。

## 本轮改动

### 1. `web-platform` 改为 SQLite 优先存储

- 新增：
  - `src/main/modules/web-platform/sqlite.ts`
- 默认数据库文件：
  - `db/web-platform.sqlite`
- 表覆盖范围：
  - `users`
  - `sessions`
  - `subscriptions`
  - `wallets`
  - `wallet_transactions`
  - `orders`
  - `subscription_plans`
  - `compute_price_rules`
  - `login_codes`
  - `plugins`

### 2. 保持现有 repo 接口不变

- `src/main/modules/web-platform/repo.ts` 对外方法名保持不变：
  - `getUserByPhone`
  - `createSession`
  - `upsertOrder`
  - `listPluginRecords`
  - 其他现有方法
- `webPlatformService` 和 `webApiRouter` 不需要改调用方式。

### 3. 增加旧 JSON 首次迁移导入

- 启动 `services/api/server.ts` 时仍通过：
  - `webPlatformRepo.ensureSeed()`
- 当前策略：
  - 若 SQLite 为空且存在旧 `db/web-platform.json`
  - 会自动把旧 JSON 数据导入 SQLite
- 导入后：
  - SQLite 成为正式真源
  - JSON 仅保留为兼容迁移源或 SQLite 不可用时兜底

### 4. 保留运行时兜底

- 若当前 Node 运行环境不支持 `node:sqlite`
- `web-platform` 会记录警告并自动退回 JSON 存储
- 这样可以避免因为运行环境差异导致 API 直接无法启动

### 5. 修复 API 默认数据目录的跨平台问题

- `services/api/server.ts` 已改为：
  - `join(process.cwd(), '.videogenerate')`
- 不再使用 Windows 专属的：
  - ``${process.cwd()}\\.videogenerate``

## 使用说明

### Windows 本地开发

- 正常执行：
  - `npm run dev:api`
  - `npm run dev:web-next`
- 首次启动后会在当前工作目录下生成：
  - `.videogenerate/db/web-platform.sqlite`

### Linux 部署

- 建议显式配置：

```bash
VIDEOGENERATE_DATA_DIR=/srv/videogen/data
VG_APP_ENV=production
VG_ALLOW_MOCK_GENERATION=false
```

- 首次部署若存在旧 JSON：
  - `/srv/videogen/data/db/web-platform.json`
- API 启动后会自动导入到：
  - `/srv/videogen/data/db/web-platform.sqlite`

## 验收重点

- 重启 API 后，用户、会话、订单、钱包、插件配置不丢失
- 两个不同用户的数据可通过 `userId` 正常隔离
- `web-platform.json` 不再作为默认正式真源
- Windows 开发与 Linux 部署都能使用同一套路径逻辑
