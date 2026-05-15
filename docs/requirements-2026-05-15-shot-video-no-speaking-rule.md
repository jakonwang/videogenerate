# 2026-05-15 分镜视频临时静默约束

## 目标

- 为分镜视频生成链路增加临时限制：人物暂时不要说话，不要出现口播感或对白感。

## 范围

- 只修改分镜视频生成 prompt。
- 不修改：
  - 脚本候选生成
  - 分镜图片生成
  - 字幕生成
  - 其他页面交互

## 原则

- 保持最小改动。
- 统一在视频 prompt 共享入口处理，避免不同视频供应商行为不一致。

## 本轮改动

- 修改文件：
  - `src/main/modules/clone/providers.ts`
- 在 `buildRealisticPrompt(shot, 'video')` 中追加静默表演约束：
  - no speaking
  - no lip-sync
  - no mouth narration
  - no dialogue
  - no talking-head delivery
  - 嘴部保持闭合或仅自然放松，不出现明显说话口型

## 结果

- 所有复用 `buildRealisticPrompt(..., 'video')` 的分镜视频生成链路，都会带上“人物不说话”的限制。
- 由于限制只加在 `phase === 'video'` 分支：
  - 不影响首帧/尾帧图片 prompt
  - 不影响脚本文案阶段

## 使用说明

1. 正常生成分镜图片。
2. 进入分镜视频阶段。
3. 重新生成对应分镜视频。
4. 新任务会自动带上“人物不说话”的提示词限制。

## 验证

- `npm run typecheck`
- 桌面端手动验证：
  - 重新生成一条分镜视频
  - 观察结果应更偏向静默演示，不出现明显讲话口型或对镜口播感
