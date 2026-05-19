# 2026-05-15 AI666 / VectorEngine 双配置凭证支持

## 目标

- 支持 `AI666` 与 `VectorEngine` 两套独立凭证配置，避免互相覆盖。
- 保持现有生成链路稳定，不做大规模重构。

## 本轮实现

- 扩展凭证类型：
  - `apifoxHubProfile?: 'ai666' | 'vectorengine'`
  - `ai666Hub?: ApifoxHubCredentials`
  - `vectorEngineHub?: ApifoxHubCredentials`
- 仓储归一化策略（`clone/repo.ts`）：
  - 同时归一化 `ai666Hub` 与 `vectorEngineHub`
  - 根据 `apifoxHubProfile` 选择当前生效配置映射到运行时 `apifoxHub`
  - 兼容旧数据：若缺少新字段，则从历史 `apifoxHub` 自动补全两套配置
- Web API 输入扩展（`webApiRouter.ts`）：
  - `/clone/model-credentials` 新增接收：
    - `apifoxHubProfile`
    - `ai666Hub`
    - `vectorEngineHub`
  - 保留原有 `apifoxHub` 兼容
- 设置页同步增强（`apps/web-next/app/settings/page.tsx`）：
  - 保存时不再只写浏览器本地
  - 会先读取当前后端凭证，再同步提交：
    - `apifoxHubProfile`
    - `ai666Hub`
    - `vectorEngineHub`
    - 与当前 profile 对应的 `apifoxHub`（运行时兼容）

## 兼容说明

- 现有调用链仍读取运行时 `apifoxHub`，不会影响既有图片/视频/对话能力。
- 新增字段用于“分平台保存不同配置”，通过 profile 控制当前生效平台。

## 验证

- `npm run typecheck`
- `npm run typecheck:web-next`
