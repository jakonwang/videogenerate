# 2026-05-13 分镜图片生成产品身份锁同步

## 目标

- 将“分镜视频生成”已使用的严格产品身份锁规则同步到“分镜图片生成”链路。
- 保证分镜图和分镜视频在产品复刻约束上使用同一套核心语义，减少图阶段已经漂移、再传导到视频阶段的问题。

## 本轮范围

- 仅修改主进程分镜图片生成前的 prompt 组装逻辑。
- 不改页面结构。
- 不改后端接口协议。
- 不重写现有首尾帧构图、模特身份和镜头约束逻辑。

## 实现说明

- 修改文件：
  - `src/main/modules/clone/gptImage.ts`
  - `src/main/modules/clone/service.ts`
  - `src/main/modules/clone/unifiedImage.ts`
  - `src/main/modules/clone/grsai.ts`
- 处理策略：
  - 在 `generateGptShotFrames` 中先编译 prompt consistency。
  - 生成首帧、尾帧时，将 `compiled.finalPrompt` 显式注入 `buildGptFramePrompt(...)`。
  - 生成首帧、尾帧时，将 `compiled.finalNegativePrompt` 透传到底层图片提供方。
  - 新增图片阶段 prompt 预览接口，返回首帧/尾帧最终 prompt 与 negative prompt。
  - 保留原有图片链路中的：
    - 模特身份约束
    - 镜头脚本约束
    - 参考镜头约束
    - 商品卖点补充
  - 在此基础上，把统一的高优先级产品身份锁前置到图片 prompt。

## 一致性规则

- 图片链路现在与视频链路保持一致，统一继承：
  - `STRICT PRODUCT IDENTITY LOCK (HIGHEST PRIORITY)`
  - `REFERENCE IMAGE PRIORITY`
  - `reference images override all textual descriptions`
  - `if any conflict occurs, follow the reference images, not the prompt`
  - `Cinematic treatment must never override identity`
- 图片链路与视频链路统一保留：
  - exact silhouette and outline
  - exact geometry and structure
  - exact proportions and scale
  - exact number of elements and components
  - exact material and reflection behavior
  - exact design details
  - exact accessory type and category
- 统一禁止：
  - redesign
  - reinterpret
  - improve the product
  - change shape, thickness, or proportions
  - add or remove elements
  - generate similar but different variations
  - switch to other product styles

## 使用说明

- 页面层无需新增开关。
- 用户继续按原流程生成分镜图片即可。
- 系统会在首尾帧生成时自动附加与分镜视频相同的产品身份锁编译结果。
- 对支持独立负面提示词的图片提供方，系统会优先使用编译后的负面约束。
- 如需核对图片阶段最终提示词，可调用新的图片 prompt 预览接口读取：
  - `startPrompt`
  - `endPrompt`
  - `negativePrompt`
  - `compiledPrompt`
  - `compiledNegativePrompt`

## 验收标准

- 分镜图片首尾帧生成 prompt 中显式包含编译后的产品身份锁内容。
- 分镜图片与分镜视频两阶段的核心产品约束语义保持一致。
- 分镜图片链路优先使用并缓存 `compiledNegativePrompt`。
- 可单独查看图片阶段最终 prompt，便于验收一致性。
- 本轮改动不引入 Windows 开发和 Linux 部署兼容性问题。
