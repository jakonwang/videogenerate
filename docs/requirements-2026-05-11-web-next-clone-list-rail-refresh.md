# 2026-05-11 Web-Next `/clone` 列表页 rail 重排与壳层减重

## 背景

- 当前 `apps/web-next/app/clone/page.tsx` 虽已卡片化，但仍偏通用 dashboard 结构。
- 任务说明区仍然不够独立，主列表区和说明信息的职责边界不够清晰。
- 左侧导航与顶部条仍偏厚重，不利于突出 `/clone` 中心任务区。
- 本轮继续只处理 `apps/web-next`，不修改后端接口契约。

## 目标

- 将 `/clone` 列表页重排为：
  - 中央任务卡片工作区
  - 右侧独立任务说明 rail
- 弱化顶部冗余区域，只保留必要标题、筛选与操作。
- 将任务卡内部重做为更明确的三段式信息结构：
  - 当前阶段
  - 进度编排
  - 素材概览
- 收窄并减轻 `AppShell` 左侧导航视觉重量。
- 保持前后端分离，只复用现有任务列表、新建、删除、分页和鉴权逻辑。

## 实现说明

- 修改文件：
  - `apps/web-next/app/clone/page.tsx`
  - `apps/web-next/components/app/app-shell.tsx`
  - `apps/web-next/app/globals.css`
- 新增内容：
  - `/clone` 列表页独立 rail 布局样式
  - 新任务卡样式组
  - 侧栏减重、顶部条收紧样式
- 保留能力：
  - `useCloneTaskList`
  - 现有项目状态筛选
  - 前端分页
  - 新建任务
  - 删除任务
  - `/clone/[projectId]` 跳转

## 边界

- 不修改 `services/api` 或 Electron 端代码。
- 不新增 Web 专属后端接口。
- 不改现有项目数据结构与字段契约。
- 本地开发环境仍以 Windows 为准，部署环境继续兼容 Linux。

## 使用说明

- 本地验证命令：
  - `npm run typecheck:web-next`
  - `npm run build:web-next`
- 页面验收重点：
  - `/clone` 主区是否以任务卡片为视觉中心
  - 右侧说明 rail 是否保持独立，不再落到底部
  - 左侧导航和顶部条是否明显减轻厚重感
  - 任务卡内部阶段、进度、素材分区是否清晰
