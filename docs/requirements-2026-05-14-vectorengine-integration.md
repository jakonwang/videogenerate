# 2026-05-14 VectorEngine 全链路接入

## 目标

将现有项目中的 `ai666 / apifox_hub` 聚合模型供应商，对外统一接入并展示为 `VectorEngine`，覆盖视频、图片、对话三类模型能力，同时保持现有存储结构与业务主链路兼容。

## 接入范围

- `src/main/modules/clone/unifiedChat.ts`
- `src/main/modules/clone/unifiedImage.ts`
- `src/main/modules/clone/unifiedVideo.ts`
- `src/main/modules/web-platform/service.ts`
- `src/main/modules/web-platform/webApiRouter.ts`
- `src/renderer/src/ui/views/SettingsView.vue`
- `apps/web-next/lib/app-settings.ts`
- `apps/web-next/app/models/page.tsx`

## 配置字段说明

内部仍沿用：

- `ModelCredentials.apifoxHub`
- provider 值 `apifox_hub`

字段语义统一映射为：

- `baseUrl`: VectorEngine 网关地址
- `apiKey`: VectorEngine API Key
- `chatModel`: 对话模型名
- `chatEndpointStyle`: 对话接口风格
- `imageModel`: 图片生成模型名
- `imageEditModel`: 图片编辑模型名
- `imageEndpointStyle`: 图片接口风格
- `videoProvider`: 视频供应商分支
- `textToVideoModel`: 文生视频模型
- `imageToVideoModel`: 图生视频模型
- `startEndVideoModel`: 起止帧视频模型
- `referenceVideoModel`: 参考视频模型
- `videoEndpointStyle`: 视频接口风格
- `defaultPollIntervalMs`: 轮询间隔
- `defaultTimeoutMs`: 超时等待时间

## 兼容策略

- 用户可见文案统一展示为 `VectorEngine`
- 历史 `apifoxHub / apifox_hub` 配置继续可读可写
- 不改已有外部 API 结构
- 不迁移浏览器本地存储键
- 不改 `/clone` 现有阶段语义与业务流程

## 当前支持能力

- 对话生成
- 文生图
- 图像编辑 / 参考图编辑
- 文生视频
- 图生视频
- 起止帧视频
- 参考视频生成
- 异步任务轮询与结果下载

## 使用说明

### 桌面端

在设置中心选择 `VectorEngine`，并填写：

- `VectorEngine Base URL`
- `VectorEngine API Key`
- 对应视频、图片、对话模型名

### Web 端

在 Web 设置页或模型相关入口中选择 `VectorEngine`，并填写：

- Host / Base URL
- API Key
- 模型名

模特创建和 `/clone` 主链路会自动将这些配置透传到统一模型层。

## 开发与部署约束

- 本地开发测试环境：Windows
- 部署环境：Linux
- 路径处理必须保持跨平台，不能依赖 Windows 专属路径
- 本轮未修改存储结构，因此旧环境中的配置文件可以继续读取

## 验证命令

```bash
npm run typecheck
npm run typecheck:api
npm run typecheck:web-next
```

## 验收要点

- 设置页能保存并重新读取 VectorEngine 配置
- Web 模特页可以把 VectorEngine 图片配置透传到后端
- `/clone` 主链路可继续调用统一对话、图片、视频能力
- 异步视频任务能创建、轮询、下载或返回明确错误
- 错误信息对用户显示为 `VectorEngine`，不再显示旧 `ai666` 文案
