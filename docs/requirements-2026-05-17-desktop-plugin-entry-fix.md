# 2026-05-17 桌面端插件入口补齐

## 目标

修复“桌面端没有显示插件”的问题。

当前插件中心能力已经存在于 Web API 和 `web-next`，但桌面端 Vue 工作台壳层没有插件导航和插件页面入口，导致桌面端用户无法进入插件模块。

## 本轮最小改动

- 仅补桌面端 `src/renderer` 入口闭环
- 不改现有插件后端状态模型
- 不把 Web-Next 页面直接嵌进桌面端
- 不扩展真实插件执行能力

## 具体实现

### 桌面端导航

- 在 `src/renderer/src/ui/MainLayout.vue` 左侧主导航新增“插件”入口
- 导航位置保持与首页、复刻、生产、切片、设置同级

### 桌面端路由

- 在 `src/renderer/src/router/index.ts` 注册 `/plugins`
- 新增桌面端页面：
  - `src/renderer/src/ui/views/PluginsView.vue`

### 桌面端插件页

插件页采用单页三态结构：

- 插件市场
- 我的插件
- 插件工作台

页面内部直接复用现有 Web API：

- `listPlugins`
- `getPlugin`
- `installPlugin`
- `uninstallPlugin`
- `enablePlugin`
- `disablePlugin`
- `setPluginConfig`

## 使用说明

- 打开桌面端后，左侧导航可以看到“插件”
- 进入后默认显示“插件市场”
- 安装插件后，可切到“我的插件”
- 已启用插件可以进入“插件工作台”
- 当前工作台只展示状态和配置摘要，不执行真实任务

## Windows / Linux 兼容说明

- 本地开发测试环境：Windows
- 部署环境：Linux
- 本轮桌面端只消费已有 Web API，不写死 Windows 特有文件路径
- 插件入口与状态仍通过统一后端接口读取，保持前后端分离

## 验收重点

- 桌面端左侧导航能看到“插件”
- 点击后能进入桌面端插件页面
- 可以在桌面端完成安装、启用、停用、卸载、保存配置
- 可以从桌面端进入“我的插件”和“插件工作台”
- `npm run typecheck` 和 `npm run typecheck:api` 通过
