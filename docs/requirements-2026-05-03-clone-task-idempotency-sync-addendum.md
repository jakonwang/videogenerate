# /clone 可恢复任务补充

- ai666 / apifox_hub 视频任务已改为可恢复模型。
- 有 `taskId` 时默认只查询旧任务，不重新创建云端任务。
- 本地轮询超时写入 `polling_timeout`，保留 `taskId`、`remoteStatus`、`remoteRaw`，不再直接判失败。
- 前端失败卡片主按钮改为 `继续查询结果`，危险操作才是 `放弃旧任务并重新生成`。
- 打开项目和点击 `同步云端状态` 会先 reconcile 远端任务，云端成功结果会下载并写回项目状态。

