# 2026-05-17 我的插件入口闭环

## 目标

在现有插件中心一期基础上，补齐最小主链路：

- 用户进入 `/plugins` 插件市场
- 点击安装插件
- 已安装插件出现在 `/my-plugins`
- 用户在“我的插件”点击“使用”
- 进入对应插件工作台页

本轮只做产品入口闭环，不接真实 FFmpeg、下载、字幕处理执行。

## 本轮最小改动

### 后端

- 扩展 `PluginDefinition`，新增 `workspacePath`
- 扩展 `PluginSummary` / `PluginDetail`，返回 `workspacePath`
- 新增 `GET /plugins/installed`
- 新增 `listInstalledPlugins(...)` 服务方法
- 保持现有插件安装、卸载、启用、停用、配置保存接口不变
- 不新增执行状态表，不改现有插件持久化结构

### 前端

- 保留 `/plugins` 插件市场页
- 市场页新增“我的插件”入口
- 市场页安装成功后提供明确提示，可前往“我的插件”
- 新增独立页面 `/my-plugins`
- 新增 3 个插件工作台占位页：
  - `/plugins/video-parser-download`
  - `/plugins/video-batch-watermark`
  - `/plugins/video-batch-subtitle`
- 侧边导航拆分为：
  - 插件市场
  - 我的插件

## 使用说明

### 插件市场

- 进入 `/plugins`
- 点击“安装”后，插件状态变为已安装
- 如需立即继续使用，可点击右上“我的插件”

### 我的插件

- 进入 `/my-plugins`
- 这里只展示当前账号已安装插件
- 已启用插件可直接点击“使用”
- 已停用插件需先点击“启用”后再进入工作台
- 点击“卸载”后，插件会从“我的插件”中移除

### 插件工作台

- 当前工作台页只展示：
  - 插件标题与说明
  - 当前安装/启用状态
  - 当前配置摘要
  - 暂未开放真实执行说明
- 当前阶段不触发真实处理任务

## Windows / Linux 兼容说明

- 本地开发与测试环境：Windows
- 部署环境：Linux
- `workspacePath` 采用 Web 路由字符串，不依赖操作系统路径分隔符
- 插件配置与状态仍通过现有 Web API 和持久化层访问，不在前端直接读写本地文件

## 验收重点

- `/plugins` 可正常显示预置插件
- 安装后刷新页面，状态仍可保留
- `/my-plugins` 只展示已安装插件
- 已启用插件可进入对应工作台页
- 已停用插件不能直接形成“可用闭环”
- 卸载后插件从“我的插件”中消失
- 配置保存后刷新仍可回显

## 验证命令

- `npm run typecheck`
- `npm run typecheck:web-next`
- `npm run typecheck:api`
