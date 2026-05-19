# 2026-05-16 静默产品展示全局规则统一接入

## 目标

- 为分镜视频、分镜图片、分镜脚本相关链路统一加入固定开头全局指令：
  `[Global Rule: This is a silent visual commercial. Human models must be faceless (head out of frame) and no speaking/dialogue is allowed. Focus 100% on product angles.]`
- 让该规则优先生效，用于产品展示和销售场景，避免模型把人脸表演、口播、对白当成主体。

## 本轮最小改动

- 新增共享方法：
  - `src/main/modules/clone/prompt.ts`
    - `buildSilentCommercialGlobalRule()`
    - `prependSilentCommercialGlobalRule(...)`
- 接入以下入口：
  1. `src/main/modules/clone/service.ts`
     - `buildStructuredShotPrompt(...)`
     - 整片脚本变体生成 prompt
  2. `src/main/modules/clone/gptImage.ts`
     - `buildGptFramePrompt(...)`
  3. `src/main/modules/clone/providers.ts`
     - `buildRealisticPrompt(..., 'video')`
  4. `src/main/modules/clone/aiScriptAnalyzer.ts`
     - 参考视频脚本分析指令 `buildInstruction(...)`
  5. `src/main/modules/clone/variantGenerator.ts`
     - 分镜变体脚本/提示生成入口

## 规则说明

- 这条规则会放在相关提示词最开头，而不是只在尾部补充。
- 规则强调四件事：
  - 静默视觉广告
  - 人物不露脸或头部不入镜
  - 不允许说话/对白
  - 产品角度与产品展示为唯一核心

## 结果

- 新生成的分镜脚本、分镜图片、分镜视频 prompt 都会在开头带上统一全局规则。
- 对导演脚本分析类提示也会带上同样规则，降低生成“口播导向”“人物表演导向”结果的概率。
- 原有 `no speaking` 约束保留，作为补充限制继续生效。

## 使用说明

1. 正常进入 `clone` 主流程。
2. 重新生成分镜脚本、分镜图片或分镜视频。
3. 新任务会自动在提示词开头加入全局规则。
4. 历史已生成结果不会自动回写，需要重新生成才会生效。

## 验证

- Windows 开发环境执行：
  - `npm run typecheck`
- 手动验证：
  - 重新生成一组分镜脚本，确认脚本导向以产品展示为主。
  - 重新生成一张分镜图片，确认人物尽量不露脸，主体聚焦产品。
  - 重新生成一段分镜视频，确认没有口播、对白或明显讲话口型。
