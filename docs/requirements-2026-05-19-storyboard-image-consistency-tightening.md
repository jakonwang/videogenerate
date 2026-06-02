# 2026-05-19 分镜图一致性收口与顺序锚定

## 目标

- 修复 `/clone` 分镜图片“各生各的”、商品结构漂移、模特身份跨镜头不稳的问题。
- 修复图片生成 prompt 混乱、原始脏字段干扰 identity lock 的问题。
- 在不改前端协议、不重构整体流程的前提下，提高分镜图片跨镜头的一致性。

## 本轮最小改动

- 仅调整主进程 `clone` 分镜图片生成链路。
- 不改 Web / Electron 页面结构。
- 不新增接口参数，不扩展新的 UI 开关。

## 修复内容

- 图片 prompt 结构收口：
  - `compiledPrompt` 提升为分镜图生成主骨架。
  - `scriptLock`、`referenceLock`、镜头补充信息降为从属层。
  - 明确保持 `reference image priority`、`do not redesign`、`cinematic must never override identity`。
- prompt 清洗增强：
  - 过滤调试回显、重复句、冲突 selling 文案。
  - 过滤容易导致 redesign、beautify、surreal、夸张 cinematic 漂移的表达。
  - 最终输入图片模型的文本更短、更干净、更单义。
- strict 模式增强：
  - 饰品、小结构商品、反光材质、强运动/遮挡镜头更容易进入严格一致性模式。
  - strict 模式下风格层与运动层降权，避免镜头风格盖过商品 identity。
- 顺序锚定：
  - 第 1 镜继续使用商品图 + 模特图 + 当前分镜缩略图。
  - 第 2 镜及之后优先追加前一镜已生成图作为 continuity anchor。
  - 若上一镜不存在或失败，自动回退到旧参考图组合。
- 缓存行为：
  - continuity anchor 进入参考图 hash。
  - prompt / refs 变化时自动触发自然失效，不新增迁移逻辑。

## 使用说明

- 用户无需新增操作，重新生成分镜图后新规则自动生效。
- 旧任务不会自动回刷，需要重新生成对应分镜图片。
- 单镜头重生成功能保持不变；若可找到上一镜已生成图，会自动参与一致性锚定。

## 验收标准

- 同一任务内多镜头商品结构、材质、配件数量、颜色、佩戴方式更稳定。
- 模特身份在跨镜头结果中更统一。
- prompt 预览中 identity lock 位于前部，脏文本和重复段显著减少。
- 批量生成与单镜头重生成功能保持可用。

## Windows / Linux 兼容说明

- 本轮仅修改 TypeScript 主进程逻辑与参考图选择顺序，不依赖 Windows 专属 API。
- Windows 开发测试与 Linux 部署运行逻辑保持一致。
