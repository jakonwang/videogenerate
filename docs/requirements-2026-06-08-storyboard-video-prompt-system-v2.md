# 2026-06-08 分镜视频 Prompt 系统优化方案 v2

## 需求

- 将现有“系统说明文档”收敛为“执行优先级文档”，让分镜视频 prompt 更稳定、更适合真实生成模型执行。
- 保留现有 6 层架构，但要求最终输出的 prompt 使用固定执行栈，而不是自由拼接段落。
- 当前重点是稳定优先，优先解决产品锁定、镜头冲突、人物抢主体、环境过强、光照误导等问题。

## 适用范围

- 面向 `/clone` 分镜视频 prompt 设计与后续开发落地。
- 重点覆盖耳饰、项链、戒指、手链等佩戴类产品。
- 本文档定义正式系统规格，不承担宣传、演示或销售文案职责。

## 系统总览

```ts
User Input (product + duration)
  -> Product Lock
  -> Shot Intent Planner
  -> Shot Templates
  -> Prompt Builder
  -> Prompt Validator
  -> Final Multi-Shot Prompts
  -> Video Generation Model
```

## 模块规范

### 1. Product Lock

- `Product Lock` 从 “fixed 2D visual object” 升级为 `visual identity anchor`。
- 必须锁定以下可见要素：
  - silhouette
  - proportions
  - connection points
  - visible structure
  - material finish
  - color family
  - wearing direction
- 产品优先级高于人物、环境、镜头气氛和局部解剖合理性。
- 不允许根据文本补完不可见结构，不允许把产品解释为可自由重建的 3D 物体。

建议基线：

```ts
const PRODUCT_LOCK = `
[ABSOLUTE RULES]
Product is a visual identity anchor from the canonical reference.
Preserve exact silhouette, proportions, connection points, visible structure, material finish, color family, and wearing direction.
Do not redesign, rebuild, beautify, simplify, or reconstruct unseen parts.
If product consistency conflicts with human pose, crop, anatomy, or scene styling, preserve the product and adjust the non-product elements.
`
```

### 2. Shot Intent Planner

- `planShots(duration)` 不再只输出时间和镜头类型。
- 每个镜头必须显式定义：
  - `intent`
  - `cameraBehavior`
  - `backgroundBehavior`
  - `priority`
  - `forbidden`
- 推荐镜头职责分配：
  - opening: grab attention with product-first hook
  - middle detail: establish product detail and material clarity
  - depth beat: add controlled spatial separation
  - ending: hold a clean closing frame with purchase-ready confidence

建议接口：

```ts
type PlannedShot = {
  t: number
  type: string
  intent: string
  cameraBehavior: string
  backgroundBehavior: string
  priority: string
  forbidden: string
}
```

### 3. Shot Templates

- `SHOTS[type]` 必须改为结构化模板，不再使用自由文本三段。
- 每个模板只允许：
  - 一个主镜头动作
  - 一个背景动作
  - 一个稳定性约束
  - 一个禁止项
- 避免下列表达同时叠加：
  - `static + zoom`
  - `no motion + movement`
  - 多个模糊动作词同时存在
- 不鼓励使用无法稳定执行的抽象词作为主控制句，例如：
  - `subtle`
  - `natural cinematic feel`
  - `vibe`

建议结构：

```ts
const SHOTS = {
  HOOK_SHOT: {
    camera: "quick push in",
    environment: "soft background drift only",
    stability: "product remains fixed and sharp",
    composition: "tight close-up with product dominance",
    restrictions: "no zoom-out and no product size reduction",
  },
}
```

### 4. Prompt Builder

- `buildPrompt(shot)` 必须输出固定 section 顺序：
  - `ABSOLUTE RULES`
  - `ROLE MAP`
  - `SHOT CONTROL`
  - `FACE CONTROL`
  - `ENVIRONMENT CONTROL`
  - `LIGHTING CONTROL`
  - `RESTRICTIONS`
  - `OUTPUT`
- 不再输出泛句：
  - `[SCENE] Keep the exact reference composition.`
- 必须改为明确职责约束：
  - 参考图定义构图、角度、距离、主体位置
  - 参考图不能重定义产品结构

建议基线：

```ts
function buildPrompt(shot: PlannedShot) {
  return `
[ABSOLUTE RULES]
${PRODUCT_LOCK}

[ROLE MAP]
Image 1 = Product canonical source.
Image 2 = Model identity reference.
Image 3 = Storyboard composition reference.
Strict separation. No cross-role substitution.

[SHOT CONTROL]
Intent: ${shot.intent}
Camera behavior: ${shot.cameraBehavior}
Background behavior: ${shot.backgroundBehavior}
Priority: ${shot.priority}

[FACE CONTROL]
Apply wearable face-suppression rules when human context is required.

[ENVIRONMENT CONTROL]
Background may move slightly.
Environment must not dominate, block, or relight the product.

[LIGHTING CONTROL]
Lighting family stays stable.
Brightness may vary slightly.
No flicker. No new highlight pattern that changes product reading.

[RESTRICTIONS]
${shot.forbidden}

[OUTPUT]
Silent ecommerce commercial video.
No text, subtitles, watermark, logo, or UI overlay.
`
}
```

### 5. Face Control / Composition Priority

- 对佩戴类产品必须单独启用 `FACE CONTROL` 和 `COMPOSITION PRIORITY`。
- 默认规则：
  - `product > hands > body > face`
  - 产品占画面 40% 到 60%
  - 不允许 `full face`
  - 不允许 `eye contact`
  - 人脸只能做支撑上下文
- 当人物与产品冲突时，只允许调整人物姿态、裁切和景别，不允许改产品。

建议基线：

```ts
const FACE_CONTROL = `
[FACE CONTROL]
Do not use full face as the main subject.
No eye contact.
Face must stay cropped, off-center, secondary, or reduced to support context only.
Never let the face dominate the frame.

[COMPOSITION PRIORITY]
Hierarchy: product > hands > body > face
Product occupies 40% to 60% of the frame.
Product must remain larger, clearer, and more centered than surrounding human features.
`
```

### 6. Environment Control

- 背景可以动，但产品不能因为环境而失去主体地位。
- 前景不可遮挡产品关键结构。
- 环境高亮不可压过产品边缘和产品可读性。
- 环境动作必须是具体可见动作，而不是纯抽象氛围词。

推荐合格表达：

- `soft light sweep across background only`
- `foreground drift with background depth separation`
- `slow ripple reflection in background only`

### 7. Lighting Control

- `Soft diffuse lighting` 不足以单独承担控制作用，必须拆成明确规则：
  - lighting family stays stable
  - brightness may vary slightly
  - no flicker
  - no new highlight pattern that reconstructs the product contour
  - no reflective response that changes material interpretation

### 8. Prompt Validator

- `Validator` 必须从简单字符串检测升级为规则检查器。
- 至少覆盖以下问题类型：
  - `camera_conflict`
  - `product_motion_conflict`
  - `missing_composition_priority`
  - `missing_face_control`
  - `environment_overpower`
  - `lighting_reconstruction_risk`
  - `abstract_language_overuse`
  - `missing_role_map`
- `detectConflicts(sections)` 返回规则化问题类型，而不是只靠单关键词命中。
- `fixPrompt(sections)` 必须按问题类型定向修复，不能把不同 shot 统一替换成同一句 camera 文案。

建议接口：

```ts
type PromptIssue =
  | "camera_conflict"
  | "product_motion_conflict"
  | "missing_composition_priority"
  | "missing_face_control"
  | "environment_overpower"
  | "lighting_reconstruction_risk"
  | "abstract_language_overuse"
  | "missing_role_map"
```

## 镜头职责建议

- `HOOK_SHOT`
  - 目标：开场抓眼，但不牺牲产品清晰度
- `SLOW_ZOOM_IN`
  - 目标：建立产品细节和材质读感
- `PARALLAX_DEPTH`
  - 目标：制造受控空间层次，不改变主体支配关系
- `LIGHT_SWEEP`
  - 目标：增加商业质感，但只允许背景或环境光层微动
- `END_SHOT`
  - 目标：收尾定格，形成稳定成交感

## 文档输出要求

- 主文档只保留实现必需信息。
- “系统本质”“最终能力”“可卖钱”等宣传性内容降级为附录或单独说明，不进入正式实现规范。
- 所有代码示例使用英文标识和 ASCII 字符，保证 UTF-8 无 BOM。

## Windows / Linux 兼容说明

- 本轮输出为正式系统文档版本，不涉及平台专属实现。
- 后续如落地到 TypeScript prompt 组装与 smoke test，Windows 开发环境与 Linux 部署环境应保持一致行为。

## 验证标准

- 每个 shot 模板只包含一个主镜头动作，没有互斥动作并存。
- 最终 prompt 前 30% 内容必须出现产品锁定和参考图职责。
- wearable 类镜头必须包含：
  - `product > hands > body > face`
  - 产品占比约束
  - face suppression 规则
- 环境描述不得依赖大量不可执行抽象词。
- 修复器不得把不同镜头全部改写成同一种 camera sentence。
- opening / middle / ending 镜头在职责上必须明确区分。
