# 2026-05-15 全链路人物不说话约束

## 目标

- 将“人物不说话”从分镜视频局部限制，扩展为复刻生成相关模块的统一约束。

## 背景

- 之前只在分镜视频共享 prompt 中增加了静默限制。
- 用户要求“其他模块也要限制不说话”，因此需要把相同规则同步到其他生成提示词入口，避免：
  - 分镜图出现明显讲话口型
  - 一致性编译层未带静默约束
  - 局部链路仍沿用旧 prompt

## 本轮最小改动

- 新增共享静默指令：
  - `buildNoSpeakingInstruction()`
- 将该规则接入以下模块：
  1. `src/main/modules/clone/service.ts`
     - `buildStructuredShotPrompt(...)`
  2. `src/main/modules/clone/gptImage.ts`
     - `buildGptFramePrompt(...)`
  3. `src/main/modules/clone/prompt-consistency/compiler.ts`
     - 新增 `PERFORMANCE_LAYER`
  4. `src/main/modules/clone/providers.ts`
     - `buildRealisticPrompt(..., 'video')`

## 统一限制内容

- no speaking
- no lip-sync
- no mouth narration
- no dialogue
- no talking-head delivery
- no visible speech articulation

## 结果

- 分镜图生成、分镜视频生成、以及一致性编译后的共享 prompt 都会统一带上“人物不说话”的限制。
- 不影响：
  - 脚本文案文本本身
  - 字幕模块
  - 页面交互结构

## 使用说明

1. 重新生成分镜图或分镜视频。
2. 新任务会自动带上统一的“人物不说话”约束。
3. 已经生成完成的历史素材不会自动回写，需要重新生成才能生效。

## 验证

- `npm run typecheck`
- 手动验证：
  - 重新生成 GPT 分镜图，观察人物不应出现明显说话口型
  - 重新生成分镜视频，观察人物不应出现口播感或对白感
