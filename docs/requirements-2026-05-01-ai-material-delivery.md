# 2026-05-01 /clone 升级：AI素材投放系统（增量）

## 范围
- 不新增主路由，不新建重复业务系统。
- 继续复用 `/clone`、`src/main/modules/clone/*`、现有云生成链路与审核链路。

## 已实现（本轮）

### 1) 主进程数据与服务
- 复用并持久化以下结构到 `CloneProject.baseBlueprint`：
  - `shots`
  - `variants`
  - `variantScores`
  - `videoPlans`
- 新增/接入 IPC：
  - `clone:generateShotVariants`
  - `clone:scoreShotVariants`
  - `clone:buildVideoPlans`
- `generateAiShots` 支持 `videoPlanId`，可按方案分镜变体出片。

### 2) AI逐分镜分析
- `aiScriptAnalyzer.ts` 升级为兼容严格 JSON 输出（`global_analysis/shots/key_shots`）并兼容旧字段。
- 分镜可写入并回填：
  - `scriptRole/scriptText/narrationText/onScreenText`
  - `visualDescription/subjectPosition/sceneDescription/emotionDescription`
  - `actionDescription/cameraDescription/productFocus/textOverlay`
  - `generationPrompt/negativePrompt/scriptConfidence/analysisNotes`
- 失败容错：
  - 保留分镜切分结果
  - `scriptConfidence=0`
  - 前端提示可手动填写或重分析
  - 未显式开启 dev mock 时不做静默 mock

### 3) 变体与评分
- 变体生成默认成本控制：
  - 每分镜默认 `5` 个文本变体
  - 仅生成文本/Prompt/JSON，不调用视频模型
- 评分后默认 Top2 选中进入组合池（可继续扩展 Top3）。

### 4) 视频方案与出片
- `videoPlanBuilder` 默认：
  - 组合数量 `10~20`（默认 12）
  - 最终保留可生成方案 `1~5`（默认 3）
- 方案生成时 Prompt 合并：
  - 原分镜卖货角色
  - 变体脚本与画面/动作/镜头描述
  - 产品信息
  - 首尾帧一致性约束
  - 真实手机拍摄风格要求
  - `negativePrompt`
- 保留首尾帧与产品参考图链路。

### 5) 前端（CloneView）
- 在原 `/clone` 分镜操作区新增轻量流程（不新建页面）：
  1. 生成分镜变体
  2. AI评分筛选
  3. 生成视频方案
  4. 生成Top视频
- 新增当前分镜“变体池摘要”和“视频方案摘要”展示。

## 使用说明
1. 第一步照常上传并分析爆款视频。  
2. 在分镜替换阶段先点“生成分镜变体”。  
3. 点“AI评分筛选”后系统会选择每分镜高分变体。  
4. 点“生成视频方案”得到 Top 方案。  
5. 点“生成Top视频”只生成高潜方案，控制成本。  

## 平台说明
- 开发测试环境：Windows。
- 部署环境：Linux。
- 本轮改动使用 Node 跨平台路径与文件 API，无 Linux 路径硬编码。
