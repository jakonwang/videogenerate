# 2026-05-21 分镜视频提示词控制层对齐

## 目标

- 让分镜视频生成的 prompt 组合方式向分镜图片链路靠齐。
- 视频提示词预览中明确展示：
  - 商品标准源图
  - 模特主图
  - 沿用之前拼接的脚本块

## 本轮最小改动

- 仅调整分镜视频 prompt 组装与 `/clone` 分镜视频提示词预览。
- 不修改视频 provider API 协议。
- 不修改图片生成链路、不修改页面主流程结构。

## 修复内容

- `providers.ts` 中视频正向 prompt 前置控制层，补齐：
  - `REFERENCE IMAGE LOCK (CRITICAL)`
  - `FRAME CONTINUITY LOCK`
  - `HUMAN PRIORITY RULE`
  - `NO SUBSTITUTE RULE`
  - `fail instead` 失败导向
- 视频 prompt 继续沿用既有脚本拼接方式：
  - `scriptText`
  - `generationPrompt`
  - `visualDescription`
  - `actionDescription`
  - `cameraDescription`
  - `materialNeed`
- 分镜视频提示词预览新增 `scriptSpliceText` 展示块，明确当前视频 prompt 的脚本拼接来源。
- 分镜视频提示词预览继续展示并强调：
  - `Product Canonical Source`
  - 模特主锚点
  - 商品描述锁
  - `Compiled Prompt`
  - `Video Positive Prompt`
  - `Video Negative Prompt`

## 使用说明

- 在 `/clone` 分镜视频阶段点击“提示词”后：
  - 可以直接看到视频 prompt 参考的商品标准源图
  - 可以直接看到视频 prompt 参考的模特主图
  - 可以直接看到脚本拼接块，确认沿用了之前的脚本拼接方式

## Windows / Linux 兼容说明

- 本轮仅调整 TypeScript 主进程 prompt 逻辑与 Vue 预览展示，不依赖 Windows 专属 API。
- Windows 开发测试与 Linux 部署运行逻辑保持一致。
