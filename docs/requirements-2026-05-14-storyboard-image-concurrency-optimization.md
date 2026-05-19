# 2026-05-14 分镜图片批量生成并发优化

## 目标

- 在不改页面交互、不改后端协议的前提下，进一步缩短批量分镜图片生成耗时。

## 问题结论

- 批量分镜图片阶段此前仍是逐镜头串行调用，即使单次请求已做瘦身，整体仍受串行耗时限制。

## 本轮修改

- 文件：`src/main/modules/clone/service.ts`
- 函数：`generateAllShotFrames(...)`
- 调整为 `PQueue` 限流并发执行，默认并发度为 `2`：
  - 保持错误收集、成功/失败统计逻辑不变。
  - 不改变对外返回结构（`queueSummary`、`errors`）。
  - 不改调用入口和 UI 参数。
  - 新增并发控制：
    - `generateAllShotFrames` 支持可选参数 `concurrency`
    - 支持环境变量 `CLONE_STORYBOARD_FRAME_CONCURRENCY`
    - 最终并发值限制在 `1-3`，默认 `2`

## 设计取舍

- 不采用无上限 `Promise.all`，避免本地/云端压力瞬时升高。
- 采用“2 路并发”作为稳健默认值，在速度和稳定性之间取平衡。
- 提供上限 3 路并发作为可控加速档，避免无上限并发导致资源抖动。

## 验证

- `npm run typecheck`
- `npm run typecheck:web-next`
