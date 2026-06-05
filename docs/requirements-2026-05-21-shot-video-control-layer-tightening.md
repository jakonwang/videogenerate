# 2026-05-21 分镜视频提示词控制层收敛

## 目标

- 将 `/clone` 分镜视频 prompt 从冗长约束堆叠收敛为“控制层 + 执行层 + 风格层”。
- 优先解决商品 identity 漂移、模特 identity 漂移、佩戴类商品缺少空间锚点、以及预览面板控制层不可见的问题。

## 本轮最小改动

- 仅调整分镜视频 prompt 组装与提示词预览拆层。
- 不改 IPC、不改 provider API shape、不改页面主流程、不扩到单帧生成链路。

## 实现说明

- `providers.ts`
  - 重排视频正向 prompt 顺序：
    - silent commercial global rule
    - reference / identity control layer
    - spatial / physics / composition control layer
    - script execution layer
    - motion / camera refinement
    - style realism layer
    - fail-instead enforcement
  - 删除冲突文案：
    - `Replace only the person identity and product identity.`
  - 替换为：
    - `Do NOT replace or regenerate product or model identity. Only adapt camera and motion.`
  - 新增：
    - `SPATIAL ANCHOR LOCK`
    - `PHYSICS CONSISTENCY`
    - `COMPOSITION LOCK`
    - `NO SUBSTITUTE RULE`
    - `fail instead` 失败导向
- `prompt-consistency/compiler.ts`
  - 将空间锚点、物理一致性、构图锁同步注入 compiled prompt 控制层。
  - 对饰品类商品启用耳饰专用增强语义：
    - same ear side
    - same piercing point
    - same hanging direction
    - same distance from ear
- `CloneView.vue`
  - 分镜视频提示词预览的 `Compiled Lock Layer / Video Positive Lock Layer / Execution Layer / Style Layer` 更新为新 marker 集合。
  - `Execution Layer` 仍保留 `scriptSpliceText` fallback。
- 版本
  - prompt consistency compiler version 升级为 `pc-1.3.0`
  - policy version 升级为 `pc-policy-1.5.0`
  - shot video prompt preview sentinel 升级为 `shot-video-prompt-2026-05-21-v1`

## 使用说明

- 在 `/clone` 分镜视频阶段打开提示词预览：
  - `Compiled Lock Layer` 顶部应能直接看到 `REFERENCE IMAGE LOCK (CRITICAL)`、`HUMAN PRIORITY RULE`、`SPATIAL ANCHOR LOCK`、`PHYSICS CONSISTENCY`、`COMPOSITION LOCK`。
  - `Execution Layer` 仅用于查看脚本、动作、镜头和 motion progression，不再承担 identity 控制职责。
  - `Style Layer` 仅保留 realism / smartphone / daylight / jewelry realism 等审美和质感规则。
- 若是耳饰类商品：
  - 控制层会额外锁定耳侧、穿孔点、垂坠方向与耳部距离。
- 若 exact consistency 无法保持：
  - prompt 会明确要求失败或废弃生成，不允许替代品或 lookalike。

## Windows / Linux 兼容说明

- 本轮仅调整 TypeScript prompt 组装逻辑和 Vue 预览拆层逻辑，不依赖 Windows 专属 API。
- Windows 开发测试与 Linux 部署运行逻辑保持一致。
