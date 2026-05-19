# 2026-05-15 设置页 AI666 / VectorEngine 分离显示修复

## 目标

- 修复设置页中 `ai666` 入口“看起来消失/被合并”的问题。
- 保证 `ai666` 与 `VectorEngine` 在前端设置层面可独立选择与保留显示值。

## 问题结论

- `apps/web-next/lib/app-settings.ts` 的 `normalizeProviderLabel(...)` 将 `ai666 / apifox_hub / vectorengine` 强制归一为 `VectorEngine`。
- 导致用户保存后再读取配置时，`ai666` 显示值被覆盖为 `VectorEngine`，形成“入口不见了”的体感。

## 本轮修改

- 文件：`apps/web-next/lib/app-settings.ts`
  - `normalizeProviderLabel(...)` 调整为：
    - `ai666` 保持为 `ai666`
    - `vectorengine`、`apifox_hub` 归一为 `VectorEngine`
- 文件：`apps/web-next/app/settings/page.tsx`
  - `providerOptions` 新增并保留：
    - `ai666`
    - `VectorEngine`

## 说明

- 本轮是“设置层显示与本地配置保持”修复，不改后端执行链路。
- 当前后端运行链路仍使用 `apifox_hub / apifoxHub` 统一字段；如需真正做到两个开放平台完全独立 Host/Key/Model 并分别调用，需要后续扩展后端凭证结构与路由协议。

## 验证

- `npm run typecheck:web-next`
