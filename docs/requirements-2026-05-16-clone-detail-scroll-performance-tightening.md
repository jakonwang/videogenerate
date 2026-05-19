# 2026-05-16 复刻流程页滚动性能二次收紧

## 背景

在完成桌面端共享壳层的第一轮滚动性能减压后，用户继续反馈：

- `/clone/:projectId` 复刻流程页面滑动仍然感觉卡顿

说明该问题不仅来自全局壳层，也来自复刻详情页自身布局和刷新节奏。

## 问题判断

本轮聚焦复刻详情页本身，发现以下几个更直接的性能热点：

- 顶部流程步骤条使用 `position: sticky`
- 右侧控制/预览侧栏使用 `position: sticky`
- 页面主面板仍保留局部 `backdrop-filter`
- 页面每 `4000ms` 定时刷新，滚动过程中更容易叠加重新渲染

这些点在 Electron 内部会明显放大滚动重绘成本。

## 本轮最小改动

### 1. 取消页内吸顶元素

文件：

- `src/renderer/src/ui/views/CloneView.vue`
- `src/renderer/src/ui/components/clone/CloneConsoleSidebar.vue`

处理：

- 顶部流程条从 `sticky` 改为普通流式布局
- 右侧侧栏从 `sticky` 改为普通流式布局

目的：

- 避免滚动时多个吸顶层持续参与位置计算和重绘

### 2. 继续移除复刻详情页局部模糊

文件：

- `src/renderer/src/ui/views/CloneView.vue`

处理：

- 页面主面板去掉 `backdrop-filter: blur(10px)`

目的：

- 降低滚动时卡片层的实时合成成本

### 3. 放宽详情页轮询频率

文件：

- `src/renderer/src/ui/views/CloneView.vue`

处理：

- 定时轮询从 `4000ms` 调整为 `6000ms`
- 完整项目刷新频率进一步收紧，减少不必要的整页数据重算

目的：

- 降低滚动过程中的“页面正在刷新”感
- 保留必要状态同步，但减弱对滚动流畅度的干扰

## 影响范围

只影响桌面端复刻详情页：

- `/clone/:projectId`

不改动：

- 后端接口
- Electron IPC 协议
- 任务状态语义
- 自动查询与手动查询功能口径

## 使用说明

- Windows 本地验证命令：`npm run typecheck`
- Linux 部署无需额外适配
- 若后续仍感觉视频阶段局部卡顿，需要继续针对：
  - 大表格列表
  - 视频预览区域
  - 卡片 hover / glow 效果
  做第三轮更细粒度收紧

## 验收重点

- 复刻流程页上下滚动时不再有明显吸顶拖拽感
- 右侧预览/控制区不再放大滚动卡顿
- 页面滚动过程中刷新感减弱
- 复刻详情页整体滑动比上一版更顺
