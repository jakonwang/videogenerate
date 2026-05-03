# /clone 四步主流程重构说明（2026-05-02）

## 目标

将 `/clone` 用户可见流程收敛为 4 步，并保留既有 7 阶段内部机制：

1. 上传并分析爆款（含 3 个全片脚本候选）
2. 生成模特与产品一致性素材
3. 批量分镜图 + Top3 视频分镜生成
4. 合并导出成片（默认仅合并，不加特效）

## 新增主进程能力

新增 IPC：

- `clone:buildScriptCandidates`
- `clone:generateConsistencyAssets`
- `clone:runStoryboardAndVideoBatch`

新增/扩展服务：

- `buildScriptCandidates`
- `generateConsistencyAssets`
- `runStoryboardAndVideoBatch`
- `generateAllShotFrames`（已接入第3步批量）

## 数据结构扩展（向后兼容）

在 `CloneBlueprint` 增加：

- `scriptCandidates`
- `consistencyAssets`

在 `CloneProject` 增加：

- `workflowV2.currentStep`
- `workflowV2.stepStatus`

旧项目缺失这些字段时，前端按推断逻辑回退，不会崩溃。

## 前端流程行为

- 顶部流程条改为 4 步展示，单步单主按钮。
- 第1步主按钮执行：
  - 无项目：选视频 + 分析
  - 有项目：生成/刷新脚本候选
- 第2步主按钮执行：
  - 生成一致性素材快照（模特 + 产品参考）
- 第3步主按钮执行：
  - 批量串行：变体 -> 评分 -> 方案 -> 批量分镜图 -> Top3 视频分镜
- 第4步主按钮执行：
  - 调用既有导出链路合并成片

## 默认成本策略

- 每分镜默认 5 个变体
- 默认仅 Top3 方案出片
- 批量分镜图默认 `onlyMissing=true`

## 使用说明

1. 打开 `/clone`，点击“上传并分析爆款（生成3版脚本）”
2. 在第2步选择/补充产品图后，点击“生成模特与产品一致性素材”
3. 在第3步点击“批量生成分镜图并生成Top3视频”
4. 在第4步点击“合并导出成片”

若任一步失败，可在当前步重试；成功结果会持久化到项目。
