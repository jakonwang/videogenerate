# 2026-05-16 Clone 详情页轮询分区化刷新

## 目标

- 在已有局部 patch 基础上，继续减少详情页自动运行时的整块刷新感。
- 将原来单一的完整项目轮询，拆成高频轻量刷新与低频完整刷新。

## 问题定位

- 之前桌面端每 4 秒执行一次完整 `loadProject()`。
- 即使前端已经做了对象和列表原地 patch，完整项目读取仍会带来更多字段同步与更多主页面计算。

## 本轮最小改动

- 修改文件：
  - `src/renderer/src/composables/useCloneProjectWorkspace.project.ts`
  - `src/renderer/src/composables/useCloneProjectWorkspace.ts`
  - `src/renderer/src/ui/views/CloneView.vue`
- 新增 `refreshRuntimeProject()`：
  - Web 端已登录场景：
    - 高频只拉 `getCloneRuntime()`
  - Electron 本地场景：
    - 高频拉 `getProjectSummary()`
    - 同时拉 `getClonePipelineStatus()`
    - 只更新必要字段：
      - `pipelineStatus`
      - `workflowV2.currentStep`
      - `previewPipeline`
      - `finalCompose`
      - `status/updatedAt/lastError`
- 轮询策略调整：
  - 每 4 秒一次 tick 保持不变
  - 其中 2 次走轻量刷新
  - 第 3 次才走一次完整 `loadProject()`

## 结果

- 高频更新阶段主要刷新运行态、步骤态、错误态和输出态。
- 完整项目同步频率下降，主页面刷新面进一步缩小。
- 不修改后端主流程，不影响现有任务执行。
- 补充修正：
  - 当存在 `pending / remote_running / polling_timeout / downloading / generating / creating` 等远端待回写视频任务时，当前轮询周期会强制走完整 `loadProject()`，避免镜头长时间停留在“待继续查询”状态。

## 使用说明

1. 打开 `clone` 项目详情页。
2. 启动自动运行到分镜视频或最终成片。
3. 观察页面在轮询期间应更稳定：
  - 状态持续更新
  - 主内容整块跳动进一步减少

## 验证

- Windows 开发环境执行：
  - `npm run typecheck`
