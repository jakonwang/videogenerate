# 2026-05-13 分镜视频生成产品身份锁强化

## 目标

- 为“分镜视频生成”增加更强的产品提示词约束，确保商品复刻优先于创意表达。
- 重点降低耳饰、戒指、项链、手链、包、鞋、美妆等高风险商品在视频阶段发生结构漂移、比例变化、类别切换的问题。

## 本轮范围

- 仅修改主进程分镜视频生成前的 prompt consistency 编译文本。
- 不改 Web-Next 页面。
- 不改桌面端页面。
- 不修改分镜图片生成策略。
- 不改后端接口协议和任务流转结构。

## 实现说明

- 修改文件：
  - `src/main/modules/clone/prompt-consistency/identity-lock.ts`
  - `src/main/modules/clone/prompt-consistency/reference-priority.ts`
  - `src/main/modules/clone/prompt-consistency/constants.ts`
- 处理策略：
  - 在 `IDENTITY_LAYER` 中加入最高优先级产品身份锁文案。
  - 在 `CONSISTENCY_LAYER` 中强化 `REFERENCE IMAGE PRIORITY` 规则。
  - 明确“这是产品复刻任务，不是创意任务”。
  - 明确 cinematic 指令不能覆盖 identity。
  - 明确必须严格跟随参考图，不允许生成“相似但不同”的产品。

## 新增约束

- `STRICT PRODUCT IDENTITY LOCK (HIGHEST PRIORITY)`
- `This is a product replication task, NOT a creative task.`
- `The product must remain EXACTLY identical to the reference images.`
- 保留以下维度：
  - exact silhouette and outline
  - exact geometry and structure
  - exact proportions and scale
  - exact number of elements and components
  - exact material and reflection behavior
  - exact design details
  - exact accessory type and category
- 禁止以下行为：
  - redesign
  - reinterpret
  - improve the product
  - change shape, thickness, or proportions
  - add or remove elements
  - generate similar but different variations
  - switch to other product styles
- 参考图优先级补充：
  - reference images define product identity
  - reference images override all textual descriptions
  - if any conflict occurs, follow the reference images, not the prompt

## 使用说明

- 分镜视频生成前，系统会自动通过 prompt consistency compiler 生成最终 prompt。
- 新规则会自动注入到：
  - `IDENTITY_LAYER`
  - `CONSISTENCY_LAYER`
- 页面层无需新增开关，现有分镜视频生成入口保持不变。

## 验收标准

- 分镜视频最终编译 prompt 中包含最高优先级产品身份锁语义。
- reference image priority 明确高于 cinematic 指令。
- prompt 明确禁止 redesign、reinterpret、类别切换和几何比例变化。
- 本轮改动不影响 Windows 开发与 Linux 部署兼容性。
