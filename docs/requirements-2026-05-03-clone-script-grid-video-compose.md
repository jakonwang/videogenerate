# 2026-05-03 `/clone` 改造为「脚本变体 -> 分镜拼图 -> 分镜视频 -> 合成成片」

## 摘要

本次改造将 `/clone` 默认主流程收敛为更符合业务实际的复刻生产线：

1. 上传参考视频并分析脚本
2. 生成多条脚本变体并评分
3. 用户单选 1 条脚本继续
4. 上传商品图并选择模特，生成 6/9 宫格分镜拼图
5. 主进程自动裁切为多张 `9:16` 分镜图
6. 用分镜图 + 分镜脚本生成分镜视频
7. 合成前支持替换个别分镜视频
8. 最终合成完整视频并写入历史

本次不重写旧底层引擎，而是在现有 Electron + Vue 3 + Node.js 项目上增加新的主编排层和默认 UI 主流程。

## 默认主流程

### Step 1. 参考视频分析

- 用户上传参考视频
- 主进程调用脚本分析模型分析整条爆款视频
- 输出基础 `shots` 结构和轻量蓝图信息

### Step 2. 脚本变体生成与评分

- 用户设置脚本变体数量，例如 3 条
- 主进程基于当前项目生成整片级脚本变体
- 每条变体包含：
  - 标题
  - 摘要
  - 完整脚本
  - 每个分镜的脚本映射
  - 分数
  - 推荐理由

### Step 3. 分镜拼图与自动裁切

- 用户上传商品图并选择模特
- 图片模型按分镜数生成 6 宫格或 9 宫格拼图
- 超过 9 个分镜时自动拆成多张拼图批次
- 主进程使用 FFmpeg 自动裁切为多张 `9:16` 分镜图

### Step 4. 分镜视频生成

- 每张分镜图与对应分镜脚本组合成视频生成输入
- 视频模型逐个生成分镜视频
- 每个分镜输出记录真实 `provider / model / duration / status`

### Step 5. 合成前检查与替换

- 页面进入合成前检查区
- 用户可为任意分镜上传本地视频替换
- 合成时优先使用：
  - 已上传替换视频
  - 否则使用模型生成的视频

### Step 6. 最终合成与历史

- 主进程使用 FFmpeg 合成为完整成片
- 自动保存最终视频和项目状态
- 页面右侧历史记录区支持再次打开、查看和复用

## 数据结构变更

### 新增项目级状态

在 `CloneProject` 上新增：

- `scriptVariantCandidates`
- `selectedScriptVariantId`
- `storyboardGridBatches`
- `storyboardFrames`
- `shotVideoOutputs`
- `finalCompose`

### 新增类型

新增以下类型：

- `CloneScriptVariantCandidate`
- `CloneStoryboardGridBatch`
- `CloneStoryboardFrame`
- `CloneShotVideoOutput`
- `CloneFinalComposeStatus`

### `ShotSpec` 持续承担分镜核心对象

`ShotSpec` 继续作为主分镜对象使用，当前链路重点依赖以下字段：

- `scriptText`
- `scriptRole`
- `generationPrompt`
- `generatedClipPath`
- `uploadedAssetPath`

## IPC 与服务边界

### 主进程新增编排接口

- `clone:createBlueprint`
- `clone:generateScriptVariants`
- `clone:selectScriptVariant`
- `clone:generateStoryboardGrids`
- `clone:generateShotVideosFromStoryboard`
- `clone:replaceShotVideo`
- `clone:composeCloneVideo`

### Preload 侧

Preload 仅做 IPC 桥接，不在渲染进程承载业务逻辑。

### 渲染进程侧

`CloneView.vue` 负责：

- 显示主流程状态
- 触发各阶段动作
- 展示脚本变体、拼图、分镜视频、最终视频和历史
- 提示错误信息与当前步骤

## 模型透传规则

以下规则保持强约束：

- 视频模型严格按用户当前设置透传
- 图片模型严格按用户当前设置透传
- 文案分析模型严格按用户当前设置透传
- 不允许内部静默切换模型
- 错误时回显真实 `provider / model / 关键参数`

## 兼容策略

- 老项目缺失新字段时，在 `repo.normalizeProject()` 中自动补齐空状态
- 不要求一次性迁移旧项目数据
- 旧分镜工作台能力保留在高级模式中

## 使用说明

1. 进入 `/clone`
2. 上传参考视频并点击分析
3. 设置脚本变体数量并生成候选
4. 选择一条高分脚本
5. 选择模特，上传商品图
6. 生成分镜拼图并等待自动裁切
7. 生成分镜视频
8. 在合成前检查区按需替换个别分镜
9. 合成完整视频并在历史中查看结果

## 测试与验收点

1. 上传参考视频后可以正常完成脚本分析。
2. 可以生成多条整片级脚本变体并展示评分。
3. 用户可单选 1 条脚本继续。
4. 可以根据分镜数生成 6/9 宫格拼图。
5. 分镜数超过 9 时会自动拆批生成。
6. 拼图可以自动裁切为多张 `9:16` 分镜图。
7. 分镜图 + 脚本可以正常进入视频模型生成分镜视频。
8. 页面可在合成前检查区展示每个分镜视频。
9. 用户可上传本地视频替换个别分镜。
10. 合成时优先使用替换视频，其余使用生成视频。
11. 最终能合成为完整视频并写入历史。
12. 切换不同视频模型、图片模型、文案分析模型后，调用仍严格按当前设置透传。
13. 报错时能看到真实 `provider / model / 参数上下文`。
14. Windows 环境通过 `npm run typecheck`。
15. Windows 环境通过 `npm run build`。
