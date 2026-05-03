# /clone 分镜视频任务恢复与幂等生成

## 目标

解决 `/clone` 分镜视频生成中“本地超时即失败、重复创建任务、不能断点续跑、云端已成功但本地不显示”的问题。

## 核心规则

- 每个分镜视频都必须持久化 `taskId`、`provider`、`model`、`requestCapability`、`endpointStyle`、`remoteStatus`、`remoteRaw`、`videoUrl`、`localPath`、`error`、`retryCount`、`createdAt`、`updatedAt`、`lastPollAt`、`completedAt`。
- 只要分镜已有 `taskId`，默认只能继续查询旧任务，禁止重新创建云端任务。
- `polling_timeout` 不是失败，只表示本地等待超时，云端可能仍在生成。
- 只有云端明确返回 `failed / canceled / expired` 时，才允许标记失败。
- 打开项目、刷新状态、继续生成剩余分镜、点击失败卡片主按钮时，都必须先同步云端状态。

## 前端交互

- 主按钮：`继续查询结果`
- 副按钮：`放弃旧任务并重新生成`
- 刷新按钮：`同步云端状态`
- 超时文案：`云端任务可能仍在生成或已完成，本地暂未同步。请点击继续查询，不会重新扣费生成。`

## 验证方式

1. 手工让云端先完成，模拟本地轮询超时。
2. 重新打开项目，确认能同步回视频。
3. 点击“继续查询结果”，确认不会创建新 `taskId`。
4. 点击“放弃旧任务并重新生成”，确认旧 `taskId` 被保留到 `previousTaskIds`。

