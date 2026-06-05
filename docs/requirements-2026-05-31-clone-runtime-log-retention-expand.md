# clone 运行日志保留条数扩容

## 需求

- 当前 `/clone` 相关运行日志保留条数过少，日志滚动和裁剪太快，用户难以复制和回看关键错误信息。
- 需要在不改动主流程结构的前提下，单独提高运行日志保留上限。

## 变更文件

- `src/renderer/src/ui/views/CloneView.vue`
- `src/renderer/src/ui/views/CloneTaskListView.vue`
- `apps/web/src/composables/useWebCloneDetailWorkspace.ts`
- `docs/requirements.md`

## 实现说明

- 桌面端 clone 详情页运行日志保留上限由 `80` 提高到 `200`。
- 桌面端 clone 列表页运行日志保留上限由 `60` 提高到 `200`。
- Web 端 clone 详情页运行日志保留上限由 `80` 提高到 `200`。
- 本轮只调整前端内存日志裁剪上限，不改主进程日志桥接、不改业务流程、不改持久化结构。

## 使用说明

- 现在 `/clone` 相关页面会保留更多最近日志，复制错误信息时不容易被快速顶掉。
- 日志仍然会裁剪，但阈值提高到 `200` 条，不会无限增长。

## Windows / Linux 兼容说明

- 本轮仅修改前端 TypeScript / Vue 日志数组裁剪逻辑，不依赖平台专属能力。
- Windows 开发测试与 Linux 部署环境通用。

## 验证

- `npm run typecheck`
