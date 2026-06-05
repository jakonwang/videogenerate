# 2026-05-21 分镜视频 Zoom Out 镜头级控制补强

## 目标

- 专门补强 `zoom_out` 分镜最容易翻车的镜头级控制。
- 解决连续拉远时重建商品、重算耳饰比例、以及微动被放大成明显摆动的问题。

## 本轮最小改动

- 仅调整分镜视频 prompt 相关逻辑。
- 不改接口、不扩到单帧链路、不重做整体视频 prompt 架构。

## 实现说明

- `prompt.ts`
  - 新增：
    - `CAMERA MOTION LOCK`
    - `SCALE CONSISTENCY LOCK`
    - `MOTION LIMIT`
  - `zoom_out` 使用强版本镜头轨迹锁，明确：
    - single uninterrupted pull-back
    - start / end state
    - do not cut to a new shot
    - do not regenerate a new framing
    - do not change subject scale abruptly
  - 耳饰类额外补充：
    - same ear side
    - same piercing point
    - same hanging direction
    - same distance from the ear
    - minimal breathing micro-movements
- `providers.ts`
  - `zoom_out` 的 motion 文案改为连续拉远，而不是泛化的“reveal more context”。
  - 在现有 reference / identity / spatial / physics / composition 后插入镜头锁。
  - `motionPerformance` 对 `zoom_out` 明确禁止变成中景或新场景。
- `prompt-consistency/compiler.ts`
  - 同步把镜头锁加入 compiled prompt 的前置层，避免预览与实际生成不一致。
- `CloneView.vue`
  - `Compiled Lock Layer` 和 `Video Positive Lock Layer` marker 增加：
    - `camera motion lock`
    - `scale consistency lock`
    - `motion limit`
- 版本
  - compiler version 升级到 `pc-1.4.0`
  - policy version 升级到 `pc-policy-1.6.0`
  - shot video prompt preview sentinel 升级到 `shot-video-prompt-2026-05-21-v2`

## 使用说明

- 在 `/clone` 分镜视频提示词预览中，`zoom_out` 镜头应能直接看到：
  - `CAMERA MOTION LOCK`
  - `SCALE CONSISTENCY LOCK`
  - `MOTION LIMIT`（耳饰类）
- `Execution Layer` 仍只负责脚本、动作、镜头执行描述，不承担镜头锁职责。

## Windows / Linux 兼容说明

- 本轮仅调整 TypeScript prompt 组装与 Vue 预览展示逻辑，不依赖 Windows 专属 API。
- Windows 开发测试与 Linux 部署运行逻辑保持一致。
