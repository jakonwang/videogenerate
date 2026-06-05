# ai666 Seedance 2.0 视频模型接入

## 需求

- 为现有 `apifox_hub / ai666` 视频链路增加 `videoProvider=seedance2` 的 ai666 专用创建与查询接口适配。
- 创建接口使用 `POST /v1/video/generations`。
- 查询接口使用 `GET /v1/video/generations/{task_id}`。

## 变更文件

- `src/main/modules/clone/unifiedVideo.ts`
- `docs/requirements.md`

## 实现说明

- 新增 `isAi666Seedance2Video(...)` 判断，仅在“视频 profile 为 `ai666` 且 `videoProvider=seedance2`”时启用专用分支。
- 创建任务改走 `POST {baseUrl}/v1/video/generations`。
- 查询任务改走 `GET {baseUrl}/v1/video/generations/{taskId}`。
- 请求体按你提供的 ai666 示例收敛为：
  - `model`
  - `content[]`
  - `metadata.duration`
  - `metadata.resolution`
  - `metadata.ratio`
- 首尾帧映射规则：
  - `image` 映射为 `role=first_frame`
  - `lastImage` 映射为 `role=last_frame`
- 同时兼容 ai666 常见鉴权格式 `Authorization: sk-xxx`，不再强制补 `Bearer ` 前缀。

## 使用说明

1. 在设置中把视频平台切到 `ai666`。
2. 将 `videoProvider` 设为 `seedance2`。
3. 将视频模型填写为 ai666 支持的 Seedance 模型名，例如 `doubao-seedance-2-0-260128`。
4. 在 `/clone` 分镜视频阶段提交任务后，系统会走 ai666 Seedance 2.0 专用创建与轮询接口。

## Windows / Linux 兼容说明

- 本轮仅修改 TypeScript 主进程视频网关逻辑，不依赖 Windows 专属路径或命令。
- Windows 开发测试与 Linux 部署环境通用。

## 验证

- `npm run typecheck`
