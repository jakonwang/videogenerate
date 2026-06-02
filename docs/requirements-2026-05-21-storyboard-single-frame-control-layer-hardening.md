# 2026-05-21 单帧控制层加固

## 目标

- 把 `/clone` 单帧 storyboard / GPT keyframe 生成链路从“约束层”提升到“控制层”。
- 优先解决：
  - 产品漂移
  - 模特漂移
  - start / end 非连续
  - human-use 语义挤压产品锁

## 本轮最小改动

- 仅调整主进程单帧 prompt 组装与编译逻辑。
- 不修改视频生成链路。
- 不修改页面、不修改 IPC 入参、不修改数据库 schema。

## 修复内容

- 在 prompt consistency 顶层前置 `REFERENCE IMAGE LOCK (CRITICAL)`：
  - 商品参考图是产品身份唯一有效来源
  - 产品必须直接复用或严格派生自参考图
  - 不允许根据文字近似重画一个“类似商品”
  - 若无法保持 exact product，则必须失败，不能生成替代品
- 单帧 start / end prompt 新增 `FRAME CONTINUITY LOCK`：
  - end frame 必须是 start frame 的直接延续
  - 保持同一产品实例、同一模特实例、同一场景设置
  - 只允许最小自然动作和轻微机位变化
  - 禁止 reset composition、禁止 regenerate scene
- 增加 `HUMAN PRIORITY RULE`：
  - human 必须适配 product
  - 不允许为了手部、耳部、颈部姿态去改产品大小、比例、结构或挂点
  - 若冲突，只能调 human pose，不能调 product
- 增加 `NO SUBSTITUTE RULE` 与失败导向：
  - 不允许生成 similar / alternative / lookalike product
  - 若触发 forbidden condition，提示词明确要求 discard generation instead of correcting it
- prompt consistency 版本号提升：
  - 通过编译版本与策略版本更新触发缓存自然失效，避免旧 prompt 复用

## 使用说明

- 用户无需新增开关，重新生成单帧分镜图后新规则自动生效。
- 旧任务、旧单帧结果不会自动回刷，需要重新生成对应单帧。
- 本轮仅作用于 storyboard / GPT keyframe 单帧链路，不影响现有视频生成链路。

## 验收与测试

- 更新 `test/storyboard-model-identity-lock.smoke.ts`，覆盖：
  - `REFERENCE IMAGE LOCK (CRITICAL)`
  - `NO SUBSTITUTE RULE`
  - `HUMAN PRIORITY RULE`
  - `FRAME CONTINUITY LOCK`
  - `discard the generation instead of correcting it`
- 编译后的 prompt 预览中，控制层位于 identity/style 之前。

## Windows / Linux 兼容说明

- 本轮仅调整 TypeScript 主进程 prompt 逻辑与测试，不依赖 Windows 专属 API。
- Windows 开发测试与 Linux 部署运行逻辑保持一致。
