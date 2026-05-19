# 2026-05-15 插件化工具中心一期基础能力

## 背景

当前系统已有视频复刻主链路，但缺少统一的“按需安装工具能力”承载层。像视频解析下载、批量加水印、批量加字幕这类能力，如果直接塞入 `/clone` 主流程，会增加耦合并稀释主工作流重点。

因此本轮先补一层独立工具插件中心，只完成：

- 插件注册
- 安装 / 卸载
- 启用 / 停用
- 配置保存
- 页面入口与状态展示

本轮不实现真实媒体处理执行。

## 本轮范围

### 后端

- 新增 `src/main/modules/web-platform/plugins.ts`
  - 维护内置插件定义
  - 统一插件元数据、配置 schema、默认说明
- 扩展 `src/main/modules/web-platform/types.ts`
  - 新增 `PluginStatus`
  - 新增 `PluginRuntimeState`
  - 新增 `PluginSummary`
  - 新增 `PluginDetail`
  - 新增插件配置字段类型
- 扩展 `src/main/modules/web-platform/repo.ts`
  - 插件状态和配置持久化到现有 `web-platform.json`
- 扩展 `src/main/modules/web-platform/service.ts`
  - 提供插件列表、详情、安装、卸载、启用、停用、配置保存能力
- 扩展 `src/main/modules/web-platform/webApiRouter.ts`
  - 新增 REST 接口：
    - `GET /plugins`
    - `GET /plugins/:pluginId`
    - `POST /plugins/:pluginId/install`
    - `POST /plugins/:pluginId/uninstall`
    - `POST /plugins/:pluginId/enable`
    - `POST /plugins/:pluginId/disable`
    - `POST /plugins/:pluginId/config`

### 前端

- 扩展 `src/shared/web-api/types.ts`
  - 与 Web API 对齐插件公共类型
- 扩展 `src/shared/web-api/client.ts`
  - 新增插件中心调用方法
- 扩展 `apps/web-next/components/app/app-shell.tsx`
  - 侧边栏增加 `/plugins` 入口
- 新增 `apps/web-next/app/plugins/page.tsx`
  - 插件中心页面
  - 支持筛选、安装、卸载、启用、停用、查看配置、保存配置

## 预置插件

本轮预置 3 个插件定义：

1. `video-parser-download`
   - 视频解析下载
2. `video-batch-watermark`
   - 视频批量加水印
3. `video-batch-subtitle`
   - 视频批量加字幕

说明：

- 这 3 个插件当前都属于“已注册但未实现真实执行”的框架态
- 其中“视频解析下载”作为后续首个真实插件样板位

## 状态定义

### 安装状态

- `installed`
  - 表示插件已对当前用户可见可用
- `uninstalled`
  - 表示插件当前未启用到用户工作台

### 运行状态

- `enabled`
  - 已启用，可进入后续真实执行态
- `disabled`
  - 已停用，不允许进入执行态

约束：

- 未安装插件不能启用
- 卸载插件时自动切回 `disabled`
- 卸载后默认保留已保存配置，重新安装可继续使用

## 使用说明

### 进入方式

- 登录 Web 工作台
- 通过左侧导航进入 `/plugins`

### 基础操作

- 点击“安装”可将预置插件加入当前用户插件中心
- 已安装插件可继续：
  - 启用
  - 停用
  - 卸载
- 右侧详情面板可查看：
  - 当前安装状态
  - 当前运行状态
  - 配置项
  - 后续执行说明

### 当前限制

本轮插件中心不执行真实任务：

- 不调用 FFmpeg
- 不创建插件执行队列
- 不生成真实下载结果
- 不做额外计费和资源隔离

这样做的目的是先稳定：

- 插件元数据结构
- 状态持久化模型
- 前后端接口边界
- 页面交互闭环

## Windows / Linux 兼容说明

- 本地开发测试环境：Windows
- 部署环境：Linux
- 本轮插件状态持久化继续走现有 `dataDir` 与 JSON 文件，不写死 Windows 专属路径
- 前端仅通过 Web API 访问插件状态，不直接依赖本地文件系统

## 验证命令

- `npm run typecheck`
- `npm run typecheck:web-next`
- `npm run typecheck:api`

## 验收重点

- 首次进入插件页可看到 3 个预置插件
- 插件默认未安装、未启用
- 安装后刷新页面，状态仍保持
- 未安装插件不能直接启用
- 已安装插件可启用、停用、卸载
- 配置保存后刷新仍可回显
- `/clone`、`/workspace`、`/settings` 现有结构不受影响
