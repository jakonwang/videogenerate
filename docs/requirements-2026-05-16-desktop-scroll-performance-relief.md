# 2026-05-16 桌面端全局滚动卡顿缓解

## 背景

用户反馈桌面端“所有界面滚动都卡顿，不够流畅”。

本轮不做大范围重构，只针对共享壳层中的高概率性能热点做最小减压，优先恢复主流程页面的滚动流畅度。

## 问题判断

排查结果表明，这不是某一个页面组件的单点故障，而是多个共享因素叠加造成的渲染压力：

- 顶栏长期使用 `backdrop-filter: blur(...)`
- 分镜运行日志面板使用 `sticky` + 模糊背景
- 共享工作区与页面内部同时存在滚动容器
- 日志列表启用了 `scroll-behavior: smooth`

这些效果在 Electron 桌面端下容易放大为滚动掉帧和卡顿。

## 本轮最小改动

### 1. 顶栏去实时模糊

文件：

- `src/renderer/src/ui/MainLayout.vue`
- `src/renderer/src/styles.css`

处理：

- 去掉共享顶栏的 `backdrop-filter`
- 增加全局兜底，统一关闭首页、复刻页、切片页等共享壳层顶栏的模糊和重阴影

目的：

- 降低滚动过程中顶部固定区域的实时重绘成本

### 2. 运行日志面板取消粘底重绘

文件：

- `src/renderer/src/ui/components/clone/CloneRuntimeConsole.vue`

处理：

- `position: sticky` 改为 `position: relative`
- 去掉 `backdrop-filter`
- 日志列表取消 `scroll-behavior: smooth`

目的：

- 避免详情页底部日志区域在滚动时持续参与高开销重绘

### 3. 共享工作区收口为单一主滚动容器

文件：

- `src/renderer/src/design-system/layout/MainLayout.vue`
- `src/renderer/src/styles.css`

处理：

- 共享设计系统工作区默认从 `overflow: auto` 改为 `overflow: hidden`
- 对首页、复刻页、切片页等真实需要滚动的页面，在全局样式中显式指定：
  - `overflow-y: auto`
  - `overflow-x: hidden`

目的：

- 减少嵌套滚动带来的滚轮卡顿和滚动链不稳定问题

## 影响范围

主要覆盖共享桌面壳层页面：

- `/home`
- `/clone`
- `/clone/:projectId`
- `/live-slicer`

本轮不修改：

- 后端接口
- IPC 协议
- 任务状态逻辑
- 页面业务结构

## 使用说明

- Windows 本地验证命令：`npm run typecheck`
- Linux 部署无需额外处理
- 若后续继续新增高强度 `blur`、`sticky`、多重 `overflow`，可能再次引入滚动卡顿

## 验收重点

- 页面滚动时不再出现明显的整段掉帧
- 顶栏滚动过程中不再有明显拖影感
- 分镜详情页底部运行日志不再放大滚动卡顿
- 首页与复刻页滚动手感较改动前更稳定
