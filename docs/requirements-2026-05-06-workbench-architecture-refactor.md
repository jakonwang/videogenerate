# 2026-05-06 工作台架构重构

## 背景

不再继续按单张设计稿对首页和 `/clone` 做局部打补丁，而是以 `DESIGN.md` 为统一设计与信息架构基线，一次性重构首批三类核心页面：

- `/home`
- `/clone`
- `/settings`

## 本轮目标

1. 建立统一工作台骨架与高密度视觉语言
2. 将 `/clone` 从单文件巨型页面拆成壳层 + 阶段组件
3. 将 `/settings` 重构为左导航 / 中表单 / 右摘要三层结构
4. 将 `/home` 收敛为总览控制台，不承担复杂编辑

## 实现内容

### 1. 统一设计 token

- 更新 `src/renderer/src/design-system/tokens.ts`
- 配色与边框基线切换到 `DESIGN.md` 约定的深色 AI 工作台体系：
  - `#060B16`
  - `#08111F`
  - `#0D1729`
  - `#6D5DFF`
  - `#22D3EE`

### 2. `/clone` 结构重构

- 重写 `src/renderer/src/ui/views/CloneView.vue`
- 保留壳层职责：
  - 项目状态
  - 阶段轨道
  - 当前阶段切换
  - `window.api.clone.*` 调用
  - 错误上下文
  - 运行日志
  - 历史项目恢复
- 新增阶段组件目录：
  - `src/renderer/src/ui/views/clone-stages/`
- 新增组件：
  - `CloneAnalyzeStage.vue`
  - `CloneVariantStage.vue`
  - `CloneStoryboardStage.vue`
  - `CloneShotVideoStage.vue`
  - `CloneComposeStage.vue`
- 新增共享类型：
  - `clone-stages/types.ts`

### 3. `/settings` 重构

- 重写 `src/renderer/src/ui/views/SettingsView.vue`
- 统一为：
  - 左侧配置导航
  - 中间配置主区
  - 右侧当前生效摘要 / 测试提示
- 保留原有关键逻辑：
  - `refreshModelSettings`
  - `saveModelSettings`
  - `checkUpdatesNow`
  - `openDataDir`
- 继续遵守“显式透传、不做 silent fallback”

### 4. `/home` 重构

- 重写 `src/renderer/src/ui/views/HomeView.vue`
- 收敛为总览控制台：
  - Hero
  - KPI
  - 进行中任务
  - 流程可视化
  - 推荐模板
  - 右侧快速创建 / AI 助手 / 通知
- 保留原有任务、模板数据读取逻辑

## 架构收益

- `/clone` 后续再改单个阶段时，不需要继续修改超长单文件模板
- 三个核心页面统一为同一套工作台设计语言
- 状态、下一步、主操作都能首屏可见
- 页面风格从“拼贴式修稿”切回“产品级信息架构”

## 验证要求

- `npm run typecheck`
- 验证 `/home` 首屏信息层级
- 验证 `/clone` 五阶段切换显示
- 验证 `/settings` 保存与回显

