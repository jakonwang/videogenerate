# ai666 Kling 视频模型接入

## 需求

- 为现有 `apifox_hub / ai666` 视频链路增加 `videoProvider=kling` 的正式接入。
- 提交任务时按 ai666 提供的 `POST /v1/videos` 协议发送请求。
- 查询任务时按 ai666 的 Kling 视频任务接口查询，避免继续复用旧的 `official_rest` 或通用 `video/query` 路径。

## 变更文件

- `src/main/modules/clone/unifiedVideo.ts`
- `docs/requirements.md`

## 实现说明

- 新增 `isAi666KlingVideo(...)` 判断，仅在“视频 profile 为 `ai666` 且 `videoProvider=kling`”时走新分支。
- 创建任务改为请求 `POST {baseUrl}/v1/videos`。
- 查询任务改为请求 `GET {baseUrl}/v1/videos/{taskId}`。
  - 这里基于你提供的示例推断查询为资源型单任务路径；如果平台最终要求其他查询格式，可在同一处继续微调。
- 新分支请求体按 ai666 提供示例收敛为：
  - `model`
  - `prompt`
  - `seconds=5`
  - `images[]`
  - `size=1280x720`
  - `metadata.output_config`
- 鉴权头增加兼容：
  - `Authorization`
  - `x-api-key`
  - 若保存的 key 本身已带 `Bearer ` 前缀，则不再重复拼接。

## 使用说明

1. 在设置中把视频平台切到 `ai666`。
2. 将 `videoProvider` 设为 `kling`。
3. 将视频模型填写为 ai666 支持的 Kling 模型名，例如 `Kling-3.0-Omni`。
4. 在 `/clone` 分镜视频阶段提交任务后，系统会走 ai666 Kling 视频接口创建与轮询。

## Windows / Linux 兼容说明

- 本轮仅修改 TypeScript 主进程视频网关逻辑，不依赖 Windows 专属路径或命令。
- Windows 开发测试与 Linux 部署环境通用。

## 验证

- `npm run typecheck`
