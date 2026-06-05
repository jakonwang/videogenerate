# 2026-05-28 分镜图片强制重生成旧图回灌修复

## 需求

- 修复桌面端 `/clone` 在“重新生成分镜图片”时，界面先显示“生成中”，但退出或刷新后又回退显示上一轮旧图的问题。
- 保证分镜图片强制重生成与分镜视频强制重生成保持同类策略：
  - 先清旧结果
  - 再进入新一轮生成状态
  - 生成中不得继续复用旧快照

## 本轮最小改动

- 仅调整以下文件：
  - `src/main/modules/clone/service.ts`
  - `src/renderer/src/ui/views/CloneView.vue`
  - `test/clone-storyboard-image-force-regenerate-clears-stale-frame.smoke.ts`
- 不改图片 provider 协议，不改 IPC 结构，不扩展到无关页面。

## 实现说明

- 主进程 `generateGptShotFrames(...)` 在 `forceRegenerate=true` 时，先清理当前镜头旧分镜图快照：
  - `gptFirstFramePath`
  - `gptLastFramePath`
  - `generatedFirstFramePath`
  - `generatedLastFramePath`
  - `generatedTaskId`
  - `imagePromptHash`
- 同时清理项目级 `storyboardFrames` 中对应镜头的 `imagePath`，并将状态置为 `generating`。
- 前端 `CloneView.vue` 的 `storyboardFrames` 计算逻辑收紧：
  - 当 `shot.gptFrameStatus === 'generating'` 时，优先展示生成中状态
  - 该状态下不再回退使用 `gptFirstFramePath / generatedFirstFramePath / raw.imagePath` 作为当前图

## 生效规则

- 点击“重新生成分镜图片”后，即使上一轮已有旧图，本轮也必须先脱离旧图，进入真实 `generating`。
- 页面刷新、退出再进入、或主进程重新读取项目快照时，不允许再把旧分镜图恢复成当前有效图。
- 若本轮新生成失败，界面可进入失败态，但不能继续把上一轮旧图当成这次结果。

## 使用说明

- 适用于 `/clone` 分镜设计阶段单镜头重新生成分镜图片。
- 对耳饰等高一致性商品，本轮修复只处理“旧图回灌”状态链，不改变已经收紧的商品一致性 prompt 策略。

## Windows / Linux 兼容说明

- 本轮仅调整 TypeScript 主进程与 Vue 前端状态逻辑，不依赖平台专属能力。
- Windows 开发测试与 Linux 部署环境通用。

## 验证

- `npm run test:clone-storyboard-image-force-regenerate-clears-stale-frame`
- `npm run typecheck`
