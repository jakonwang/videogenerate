# /clone TikTok爆款复刻生产线改造（2026-05-02）

## 目标

将 `/clone` 从默认暴露分镜工作台，调整为默认 4 步生产线：

1. 输入爆款
2. 生成复刻蓝图
3. 一键生成变体
4. 首条预览优先 + 批量出片

本次不重写整个项目，不移除旧生成引擎，只新增“轻蓝图 + 主进程编排层 + 极简主界面”，并保留高级工作台折叠入口。

## 数据结构

- `CloneBlueprint`
  - 现在同时承载轻蓝图字段：
    - `id`
    - `sourceVideoId`
    - `title`
    - `duration`
    - `market`
    - `category`
    - `hook`
    - `storyBeats`
    - `localization`
    - `renderHints`
    - `createdAt`
    - `updatedAt`
- `CloneExecutionBlueprint`
  - 新增内部执行蓝图，承接旧执行态字段：
    - `shots`
    - `variants`
    - `variantScores`
    - `videoPlans`
    - `scriptCandidates`
    - `consistencyAssets`
    - `strategyNotes`
- `CloneProject`
  - 保留：
    - `baseBlueprint`
    - `previewPipeline`
    - `workflowV2`
  - 新增：
    - `executionBlueprint`
  - `blueprint` 默认作为前端主视图的轻蓝图来源

## 服务与 IPC

- 主进程新增编排接口：
  - `createCloneBlueprintFromReference`
  - `prepareCloneMaterials`
  - `generateCloneVariants`
  - `generateClonePreviewAndBatch`
  - `getClonePipelineStatus`
- 新增 IPC / preload 桥接：
  - `clone:createBlueprint`
  - `clone:prepareMaterials`
  - `clone:generateVariants`
  - `clone:generatePreviewBatch`
  - `clone:getClonePipelineStatus`
- 兼容策略：
  - 旧接口继续保留
  - 高级模式仍可直接调用旧分镜/变体/方案接口
  - 老项目读取时自动从旧 `shots` 数据派生轻蓝图字段

## 页面行为

- `/clone` 默认主界面改为生产线文案和 4 步状态。
- Step 1 展示参考视频上传与基础预览。
- Step 2 展示复刻蓝图信息：
  - Hook
  - story beats
  - market / language
  - render hints
- Step 3 默认展示“一键生成变体”和首条预览优先策略，不要求用户手动操作分镜。
- Step 4 首条预览一旦可用立即展示，剩余任务继续后台执行。
- 旧分镜列表、变体池、视频方案、队列明细和单镜头控制保留为“高级工作台”折叠入口。

## 模型规则

- 视频模型严格按当前用户设置透传。
- 图片模型严格按当前用户设置透传。
- 文案分析模型严格按当前用户设置透传。
- 不允许内部静默切换默认模型。
- 报错时需要能够回显实际 provider / model / 关键参数上下文。

## 使用说明

1. 打开 `/clone`。
2. 上传爆款参考视频。
3. 上传产品参考图，并选择或生成 AI 模特。
4. 点击主按钮，系统按 4 步主流程自动推进。
5. 首条预览生成后立即可看。
6. 如需手动查看分镜、变体和方案，展开“高级工作台”。

## 验收与回归

- 新项目默认不再强迫用户进入分镜工作台。
- 轻蓝图能稳定显示 Hook、story beats、市场、语言和渲染提示。
- 首条预览优先链路继续生效。
- 老项目加载不报错。
- 旧高级能力仍可使用。
- Windows 已要求验证：
  - `npm run typecheck`
  - `npm run build`

## Workflow Update
- Upload reference video and analyze script first.
- Generate multiple script variants and score them.
- Select the highest-scoring script.
- Generate storyboard grid images.
- Generate shot clips from storyboard frames.
- Composite the first full preview video.
- Continue background batch rendering afterward.
- Model reuse is the default; regeneration is optional only.


## Feedback Rules
- The UI must show the current action, current sub-stage, and next step.
- The UI must distinguish script generation, scoring, storyboard generation, shot generation, preview compositing, and background batch progress.
- Progress text must use user-facing workflow language, not only technical engine terms.

