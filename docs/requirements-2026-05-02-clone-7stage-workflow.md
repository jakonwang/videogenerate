# 2026-05-02 /clone 固定 7 步流程重构（首版落地）

## 本次目标
- 保持 `/clone` 路由不变，不新增主业务页面。
- 将默认操作切换为 7 步主流程：
  1) 上传爆款视频
  2) 分析爆款脚本
  3) 拆解分镜脚本
  4) 生成脚本变体并评分
  5) 批量生成分镜图
  6) 生成 Top3 视频分镜
  7) 合并导出成片
- 每阶段仅保留一个主按钮；旧细粒度能力保留在“高级设置”。

## 已实现
- `CloneView.vue` 新增：
  - `CloneWorkflowStage` 与 `WorkflowStageStatus`
  - `workflowStage/workflowStatus` 运行态
  - `inferWorkflowStage(project)` 旧项目阶段推断
  - 顶部 7 步流程条（当前/完成/失败/执行中）
  - 单一主按钮 `runWorkflowPrimaryAction()`
- 新增批量分镜图动作：
  - `generateAllStoryboards(onlyMissing=true)`
  - 默认只补缺失首尾帧，失败不中断，结束给出总数/成功/失败
- 第 3 步工作区改造为等高三栏并各栏内滚动，页面根容器不长滚动。
- 高级设置入口迁移到顶部“高级设置”按钮（承接历史细粒度能力）。

## 兼容策略
- 未改动主进程核心语义与 `/clone` 既有 IPC：
  - `clone:analyzeReference`
  - `clone:generateShotVariants`
  - `clone:scoreShotVariants`
  - `clone:buildVideoPlans`
  - `clone:generateAiShots`
  - `clone:renderBatch`
- 旧项目缺失新字段时通过 `inferWorkflowStage()` 自动落位，不依赖新字段硬存在。

## 默认成本策略
- 每分镜默认 5 个变体。
- 每分镜默认 Top2 入池。
- 默认只生成 Top3 视频方案。
- 批量分镜图默认仅补缺失，不重复处理已有结果。

## 使用说明
1. 进入 `/clone`，先点“上传爆款视频”。
2. 按顶部主按钮顺序推进流程。
3. 需要细粒度手动操作时，点“高级设置”。
4. 第 5 步可一键批量生成分镜图；第 6 步默认跑 Top3。
