# 需求说明：模特页 `/models` 布局异常修复

## 背景

2026-05-06 在桌面端验证时，模特页 `/models` 出现主体内容区被压缩、截断的问题。表现为顶部 Hero 与右侧详情仍可见，但中部主工作区布局错乱，页面主体像被额外容器包裹后压扁。

本次问题不调整模特库业务逻辑，仅修复页面结构与全局样式冲突。

## 问题判断

- `ModelLibraryView.vue` 本身采用多层 grid 布局，结构没有直接损坏。
- 根因更接近全局样式污染：
  - `src/renderer/src/styles.css` 中存在 `.ds-workspace > *` 的全局卡片化规则。
  - 模特页根节点 `.models-library-page` 正好是 `.ds-workspace` 的直接子节点，因此被强制套用背景、边框、阴影。
  - 该规则与模特页自身的 grid / sticky / panel 布局叠加后，造成内容区域显示异常。

## 实现范围

### 1. 模特页局部布局兜底

文件：
- `src/renderer/src/ui/views/ModelLibraryView.vue`

调整：
- 为 `.models-library-page` 增加：
  - `min-height: 0`
  - `align-content: start`
- 为 `.models-shell`、`.models-shell__main`、`.models-layout` 增加：
  - `min-height: 0`
- 为 `.models-catalog-panel` 增加：
  - `min-height: 0`
  - `overflow: visible`
- 在窄屏场景下将 `.models-detail-panel` 的 `sticky` 改为 `static`，避免单列布局继续受粘性定位干扰。

### 2. 全局样式对白名单页面做隔离修复

文件：
- `src/renderer/src/styles.css`

新增针对模特页的覆盖：
- `.ds-workspace:has(.models-library-page)`
  - 强制保持 `overflow: auto`
  - 补充适合该页的上下内边距
- `.ds-workspace:has(.models-library-page) > .models-library-page`
  - 移除误加的根级边框、圆角、背景和阴影
  - 保持根容器透明，由页面内部 panel 自行承担视觉层级

## 结果预期

- `/models` 恢复为正常工作台布局
- 顶部栏、筛选区、卡片库、右侧详情区按原有信息层级显示
- 不影响 `/clone`、`/home`、`/settings` 现有逻辑
- 修复以局部白名单覆盖为主，不对脏的全局样式做大清理

## 验证

### 静态检查

- `npm run typecheck`

### 页面验证

- 打开 `/models`
- 确认 Hero、筛选面板、模特卡片区、详情侧栏同时正常显示
- 确认页面主区域不再出现整体被卡片容器包裹压缩的现象
- 缩小窗口到中屏与单列场景，确认详情区不会因 `sticky` 继续压坏布局

## 使用说明

- 本修复是对现有全局样式污染的局部隔离，不代表 `styles.css` 已完成系统性治理。
- 后续如果继续调整全局 `.ds-workspace`、`.ds-workspace > *`、`overflow: hidden !important` 相关规则，必须先验证 `/models`、`/home`、`/clone` 三类工作台页面。

## 2026-05-06 addendum

- Root cause was not only the local model page layout.
- A global `.ds-workspace > *` card wrapper style was also affecting `.models-library-page`.
- Final fix keeps the model page layout guards:
  - `min-height: 0`
  - `align-content: start`
  - `overflow: visible`
  - static detail panel on narrower layouts
- Final fix also isolates `.models-library-page` from the global workspace card wrapper in `styles.css`.
