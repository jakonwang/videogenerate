# 2026-05-28 分镜图首尾帧提示词稳定性收紧

## 需求

- 将分镜视频已经收紧的三类规则同步到分镜图首尾帧链路：
  - 去商品描述化
  - 强反高光
  - 微动作
- 目标是让首尾帧与分镜视频在耳饰等高风险商品上保持同一套稳定策略，避免图片和视频两边规则相互冲突。

## 本轮最小改动

- 仅调整 `src/main/modules/clone/gptImage.ts` 中首尾帧 prompt 组装逻辑
- 不改图片 provider API、不改任务流、不改页面结构

## 实现说明

- 耳饰类首尾帧 prompt 改为优先使用结构性表达：
  - `Use the provided reference image as primary visual source`
  - `Extreme close-up of ear wearing the earring`
  - 不再在首尾帧执行层注入 `TEXT PRODUCT DESCRIPTION LOCK`
- 耳饰类首尾帧灯光控制同步升级：
  - `flat diffuse lighting`
  - `no specular highlights`
  - `no reflective response`
  - `constant brightness across frames`
- 耳饰类动作控制同步收紧：
  - 命中 `finger / touch / hand` 时，统一为 `Minimal finger interaction below the ear.`
  - 否则统一为 `Very subtle movement only.`
- 保留必要的参考图优先、人物锁、空间锁、连续性锁，但去掉首尾帧执行层里直接依赖商品文本描述的入口。

## 使用说明

- 在 `/clone` 的分镜图首尾帧生成耳饰类镜头时：
  - 提示词不应再把商品外观细节重新写一遍
  - 提示词应直接强调参考图主导和强反高光控制
  - 手部动作应被压缩为极轻微交互

## Windows / Linux 兼容说明

- 本轮仅调整 TypeScript prompt 组装逻辑，不依赖平台专属能力
- Windows 开发测试与 Linux 部署环境通用

## 验证

- `npm run test:storyboard-model-lock`
