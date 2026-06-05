# 2026-05-28 分镜视频提示词稳定性收紧

## 需求

- 收紧 `/clone` 分镜视频生成提示词，降低耳饰等高风险商品在视频阶段的：
  - 文本重建商品导致的结构漂移
  - 高光/反射导致的闪烁
  - 手部或头部动作过强导致的局部亮度变化

## 本轮最小改动

- 仅调整 `src/main/modules/clone/prompt.ts` 中分镜视频正向 prompt 组装逻辑
- 不修改 provider API、IPC、页面结构、任务流程

## 实现说明

- 分镜视频正向 prompt 的商品定义进一步降文本化：
  - `CORE RULE` 改为强调 `reference image` 是主视觉来源
  - 删除分镜执行层中直接复述商品外观的 `Storyboard visual prompt`
  - 对耳饰类镜头优先写成 `ear wearing the earring`，避免文本偷偷重建商品
- 耳饰类灯光控制升级为更强的稳定规则：
  - `flat diffuse lighting`
  - `no specular highlights`
  - `no reflective response`
  - `constant brightness across frames`
- 耳饰类动作控制收紧：
  - 如果脚本里出现手指/触碰语义，统一压成 `Minimal finger interaction below the ear.`
  - 否则统一压成 `Very subtle movement only.`
- 去掉分镜视频执行层里过重的“假锁死”文案：
  - 不再注入 `buildReferenceImageLockText()`
  - 不再注入 `buildNoSubstituteRuleText()`
  - 不再注入 `FAIL RULE`
  - 保留必要的结构锁、空间锁、构图锁和人物锁

## 使用说明

- 在 `/clone` 的分镜视频阶段生成耳饰类视频时：
  - 提示词不应再直接复述耳环的材质/吊坠/星形等商品描述
  - 提示词应明确出现更稳定的反高光控制
  - 提示词中的动作应明显收敛为轻微微动或极轻触碰

## Windows / Linux 兼容说明

- 本轮仅调整 TypeScript prompt 组装逻辑，不依赖 Windows 专属 API
- Windows 开发测试与 Linux 部署环境通用

## 验证

- `npm run test:clone-shot-video-jewelry-prompt-v2-lock`
