# /clone 首条预览优先提速（2026-05-02）

## 目标

将 `/clone` 第 3 步从“等待 Top3 全部生成后再看结果”改为“先尽快拿到 1 条完整可看预览视频，再后台继续补齐剩余方案”，减少用户首屏等待时间。

## 本次改动

- 主进程 `runStoryboardAndVideoBatch` 新增首条预览优先路径：
  - 先生成分镜图。
  - 先执行评分最高的第 1 个视频方案。
  - 首条方案完成后立即合成单条预览并返回 `previewOutput` / `previewReportPath`。
  - 剩余方案改为后台继续执行，不阻塞前端先看结果。
- 项目新增 `previewPipeline` 状态：
  - `running`
  - `background_running`
  - `done`
  - `failed`
- `/clone` 前端第 3 步新增“首条预览优先”状态提示，展示：
  - 正在生成首条预览
  - 首条预览已完成
  - 后台剩余方案继续生成
- 默认提速参数调整：
  - `policy.concurrency`: `2 -> 4`
  - `generationQueue.options.maxConcurrentCloudJobs`: `2 -> 4`
  - `generationQueue.options.perShotTimeoutMs`: `10 分钟 -> 8 分钟`
- 分镜变体生成与 AI 评分改为受控并发执行，减少串行等待。

## 模型选择规则

提速优化不改变模型选择来源：

- 视频模型严格按当前用户设置的 provider / model 调用。
- 图片模型严格按当前用户设置的 provider / model 调用。
- 文案分析模型严格按当前用户设置的分析模型调用。
- 本次提速不允许通过切换到内部默认模型来换速度。

## 使用说明

1. 进入 `/clone`，完成参考视频分析和一致性素材生成。
2. 在第 3 步点击主按钮后，系统会优先生成首条完整预览视频。
3. 一旦首条预览返回，页面立即显示预览视频。
4. 剩余方案和补齐任务会继续在后台执行，可通过队列状态和“首条预览优先”提示查看进度。

## 验证

- Windows 开发环境已执行：
  - `npm run typecheck`
  - `npm run build`
- 路径处理继续使用 Node 跨平台 API，Windows 开发和 Linux 部署均兼容。
