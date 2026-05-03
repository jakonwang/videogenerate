# ai666 veo 查询路径修复

## 摘要

本次修正 `videoProvider=veo` 的视频查询路径与失败解析逻辑，避免平台已返回失败结果时，本地还继续轮询到超时。

## 修正内容

- `veo` 视频查询统一使用 `/v1/video/query?id={taskId}`
- 查询结果如果返回 `status=failed`，立即结束轮询并展示平台返回的 `error.message`
- 手工诊断脚本同时保留旧路径对照，便于排查接口平台实际返回行为

## 使用说明

1. 在 ai666 设置中选择 `videoProvider=veo`
2. 发起分镜视频生成
3. 如果平台返回失败，本地应立即显示平台错误，而不是等到超时
4. 若仍异常，可运行 `scripts/query-ai666-task.cjs <taskId>` 对照新旧查询结果
