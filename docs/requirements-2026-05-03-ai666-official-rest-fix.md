# ai666 official_rest 路径修正

## 摘要

本次修正了 `apifox_hub` / `ai666` 在 `official_rest` 模式下的视频与图片请求路径，避免把请求打到网页首页根路径后收到 HTML 页面，导致任务创建时无法解析 `id`。

## 修正内容

- 视频生成统一使用 `/api/v1/model/generateVideo`
- 视频轮询统一使用 `/api/v1/model/prediction/{id}`
- 图片生成统一使用 `/api/v1/model/generateImage`
- 图片轮询统一使用 `/api/v1/model/prediction/{id}`

## 使用说明

- `baseUrl` 应填写 API 根域名
- 如果服务端实际接口需要前缀 `/api/v1`，现在会自动补齐
- 若仍返回 HTML，优先检查服务端网关是否把 `/api/v1` 反代到了错误页面

## 现象排查

- 报错中出现 `<!doctype html>`，说明拿到的是网页而不是 JSON
- 报错中出现 `缺少 id`，说明创建接口返回内容不是预期的任务对象

