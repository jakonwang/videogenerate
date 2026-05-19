# 2026-05-14 模型配置同步与开放平台选择修复

## 目标

- 修复“界面已切换模型，但分镜图片生成仍调用旧模型”的问题。
- 修复图片能力链路中 `VectorEngine / apifox_hub` 选择口径不一致，导致开放平台无法正常选择或保存的问题。
- 保持前后端分离，不把真实模型决策继续留在前端本地缓存里。

## 问题根因

### 1. Web 设置页只写本地，不写真实执行配置

- `apps/web-next/app/settings/page.tsx` 原先只把模型配置保存到浏览器 `localStorage`。
- 分镜图片生成实际调用的是桌面端 `clone` 后端配置：
  - `src/main/modules/clone/repo.ts`
  - `src/main/modules/clone/service.ts`
- 因此前端页面显示已切换模型，但 `generateStoryboardGridsForProject` 实际仍读取旧的后端模型凭证。

### 2. `apifox_hub` 在部分桌面链路类型口径缺失

- 桌面设置页、模型库和后端实际都已支持 `apifox_hub`。
- 但 `src/preload/index.ts` 与 `src/main/index.ts` 中部分图片平台类型仍只允许：
  - `openai`
  - `kling`
  - `grsai`
- 这会导致开放平台在部分调用链路里出现“选不了”“存不住”或类型不一致。

### 3. 图片供应商覆盖时未合并 `apifoxHub` 嵌套配置

- `mergeImageProviderOverrides(...)` 之前只合并顶层字段。
- 当页面或 Web API 显式传入 `apifoxHub.imageModel / baseUrl / apiKey` 时，嵌套配置可能被忽略。

## 本轮修改

- 新增 Web API：
  - `GET /clone/model-credentials`
  - `POST /clone/model-credentials`
- Web 设置页改为：
  - 初始优先读取后端 `clone` 模型凭证
  - 保存时同时写本地缓存和后端真实凭证
- 桌面 IPC / preload 图片平台类型补齐：
  - `apifox_hub`
- 图片供应商覆盖逻辑补齐 `apifoxHub` 嵌套合并

## 影响文件

- `apps/web-next/app/settings/page.tsx`
- `src/shared/web-api/types.ts`
- `src/shared/web-api/client.ts`
- `src/main/modules/web-platform/webApiRouter.ts`
- `src/main/modules/web-platform/service.ts`
- `src/preload/index.ts`
- `src/main/index.ts`
- `src/main/modules/clone/service.ts`

## 使用说明

### Web 端

1. 打开 `apps/web-next` 的设置页。
2. 修改图片平台、图片模型或 VectorEngine 配置。
3. 点击保存后，配置会同时写入：
   - 浏览器本地缓存
   - 后端 `clone` 真实模型配置
4. 后续分镜图片生成将以后端保存值为准。

### 桌面端

- 图片能力中的 `VectorEngine / apifox_hub` 现在与主进程、preload、设置保存链路口径一致。
- 选择开放平台后，不再因为类型遗漏导致选择异常。

## 验收标准

- 在 Web 设置页切换图片模型并保存后，再次生成分镜图片，返回的 `imageModel` 与新配置一致。
- 选择 `VectorEngine` 作为图片平台时，配置可正常保存并在后端读取到。
- `generateModelIdentityPack`、`generateGptShotFrames` 等图片链路传入 `apifoxHub` 覆盖配置时，嵌套字段不再丢失。
- 本地 Windows 开发与 Linux 部署不依赖平台专有路径逻辑。

## 验证

- `npm run typecheck:web-next`
- `npm run typecheck`
