# 2026-05-06 `/clone` 组件化收口

## 背景

`/clone` 已经完成“分步工作流化”，但 `D:\phpstudy_pro\WWW\videogenerate\src\renderer\src\ui\views\CloneView.vue` 里仍然堆积了大量重复的 UI 壳层，导致后续继续精修时容易失控。

本轮不改后端接口、不改 IPC 语义，只处理前端结构，把已经稳定下来的工作台 UI 语言抽成可复用组件，继续维持 Windows 开发、Linux 部署可通用。

## 本轮目标

1. 抽离 `/clone` 页面重复的工作台头部与侧栏结构
2. 统一空状态、待处理、失败状态卡片
3. 统一数据卡片和媒体卡片语义
4. 保持 `CloneView.vue` 继续作为状态编排层，不把 API 调用散到子组件

## 新增组件

新增目录：

- `D:\phpstudy_pro\WWW\videogenerate\src\renderer\src\ui\components\clone\`

新增组件：

- `CloneStageHeader.vue`
  - 用途：统一每个阶段顶部的“左标题说明 + 右唯一主按钮 + 下方辅助状态”
- `CloneStateCard.vue`
  - 用途：统一 `empty / pending / danger` 三类状态卡
- `CloneDataCard.vue`
  - 用途：统一信息卡样式，并支持 `default / danger / context` 语义
- `CloneMediaCard.vue`
  - 用途：统一视频卡、图片卡、历史卡、模特卡等媒体容器
- `CloneConsoleSidebar.vue`
  - 用途：统一右侧运行反馈、历史记录这类控制台侧栏容器

## 页面改造范围

本轮已在 `CloneView.vue` 中接入上述组件，替换了以下区域：

- 参考分析阶段头部
- 脚本变体阶段头部
- 分镜拼图阶段头部
- 分镜视频阶段头部
- 合成前检查阶段头部
- 最终成片阶段头部
- 右侧运行反馈侧栏
- 右侧历史记录侧栏
- 主要空状态 / 待处理 / 错误状态
- 部分元数据卡、媒体卡、历史卡、模特卡

## 组件边界约束

- `CloneView.vue`
  - 继续负责状态、计算属性、事件处理、工作流切换、`window.api.clone.*` 调用
- `src/renderer/src/ui/components/clone/*.vue`
  - 只负责 UI 壳层与表现
  - 不直接访问全局 API
  - 不持有业务流程状态

## 使用说明

后续如果继续精修 `/clone`，优先复用以下组件，不要再手写重复壳层：

1. 新阶段顶部统一使用 `CloneStageHeader`
2. 新增空状态统一使用 `CloneStateCard`
3. 信息摘要类块优先使用 `CloneDataCard`
4. 图片/视频/历史项优先使用 `CloneMediaCard`
5. 新右侧摘要栏优先使用 `CloneConsoleSidebar`

## 验证

已执行：

- `npm run typecheck`

结果：

- 通过

## 后续建议

下一步如果继续彻底收口，建议继续做两件事：

1. 把 `CloneView.vue` 中剩余样式按组件归属继续下沉，减少页面级样式体积
2. 把五个阶段主内容逐步拆成独立 stage 组件，但继续保持 API 调用留在壳层
