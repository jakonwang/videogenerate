# 2026-05-08 Web 商业化底座首轮落地

## 背景

为支持 VideoGen 从 Electron 桌面产品向中心化 Web SaaS 演进，本轮先落地第一阶段基础设施，而不是一次性重写全量网页前端。

目标是先具备：

- 账号登录
- 会员/钱包/订单/算力点
- 本地 HTTP API 形态
- `/clone` 关键动作的鉴权与扣费包装
- 后续 Web 前端直接接入的服务端接口骨架

## 本轮实现

### 1. 新增 Web 平台模块

新增 `src/main/modules/web-platform/`：

- `types.ts`
  - 定义用户、会话、会员、钱包、订单、算力规则等数据结构
- `repo.ts`
  - 使用 JSON 文件持久化 Web 平台数据
  - 默认内置会员套餐与算力价格规则
- `service.ts`
  - 提供登录、登出、资料查询、订单创建、支付模拟、算力扣费
  - 提供 `/clone` 的带用户归属与算力扣费的包装调用

### 2. 新增本地 Web API Server

新增 `src/main/lib/webApiServer.ts`：

- 在主进程启动后自动绑定本地 HTTP 端口
- 提供 REST 风格接口：
  - `POST /auth/login`
  - `POST /auth/logout`
  - `GET /me`
  - `GET /me/subscription`
  - `GET /me/wallet`
  - `GET /billing/plans`
  - `POST /billing/orders`
  - `POST /payments/notify/:orderId`
  - `GET /clone/projects`
  - `POST /clone/projects`
  - `GET /clone/projects/:id`
  - `POST /clone/projects/:id/analyze`
  - `POST /clone/projects/:id/script-variants`
  - `POST /clone/projects/:id/storyboard-images`
  - `POST /clone/projects/:id/shot-videos`
  - `POST /clone/projects/:id/compose`
  - `GET /clone/projects/:id/runtime`

### 3. `CloneProject` 增加商业化字段

扩展 `src/main/modules/clone/types.ts`：

- `userId`
- `subscriptionPlanId`
- `billingStatus`
- `estimatedCost`
- `actualCost`
- `deductionStatus`
- `assetStorageProvider`

并在 `clone/repo.ts` 的项目归一化逻辑里补齐兼容。

### 4. 主进程启动链补齐

更新 `src/main/index.ts`：

- 启动时执行 `webPlatformRepo.ensureSeed()`
- 启动时自动拉起 `Web API Server`
- 新增 IPC `app:getWebApiInfo`
- 退出时关闭 `Web API Server`

更新 `src/preload/index.ts`：

- 暴露 `getWebApiInfo()`，便于当前桌面端或后续调试页读取本地 API 地址

## 当前约束

- 当前短信验证码为演示模式，固定值 `123456`
- 当前支付为模拟支付通道：
  - `mock_wechat`
  - `mock_alipay`
- 当前对象存储仍未真正切到云端，`assetStorageProvider` 先作为字段预留
- 当前 Web API 先运行在 Electron 主进程内，作为服务化过渡层；后续再独立部署为真正后端服务

## 使用说明

### 登录

`POST /auth/login`

```json
{
  "phone": "13800138000",
  "code": "123456",
  "displayName": "测试用户"
}
```

返回 `token` 后，后续请求使用：

`Authorization: Bearer <token>`

### 创建订单并模拟支付

1. `POST /billing/orders`
2. `POST /payments/notify/:orderId`

支付回调后：

- 会员订单：开通会员并赠送月度算力
- 算力包订单：直接增加钱包余额

### `/clone` 调用方式

Web 端后续不再通过 IPC，而是直接调本地/服务端 HTTP API：

- 创建任务
- 分析参考视频
- 生成脚本
- 生成分镜图片
- 生成分镜视频
- 合成最终成片

这些动作现在都已挂上：

- 用户鉴权
- 项目归属校验
- 算力点扣费

## 后续阶段

下一轮优先级：

1. 真正独立的 Web 前端壳层与登录页
2. 将 `/clone` 任务列表页接到 HTTP API
3. 将素材上传从本地路径语义改为上传对象存储语义
4. 将模拟支付改为真实微信/支付宝
5. 将 Web API 从 Electron 内嵌服务拆到独立 Node 服务

## 2026-05-08 第二轮补充：最小 Web 前端壳层接入

本轮在不破坏现有 Electron 五阶段工作台的前提下，继续补齐了第一批可运行的 Web SaaS 前端壳层：

### 1. 渲染端新增统一 Web API 客户端

新增：

- `src/renderer/src/lib/webApiClient.ts`

职责：

- 统一读取 `window.api.getWebApiInfo()` 获取本地 HTTP API 地址
- 统一管理 `Bearer Token`
- 封装账号、套餐、订单、`/clone` 任务列表等请求
- 避免把 `fetch` 散落到页面组件中

### 2. 渲染端新增 Web 会话 Store

新增：

- `src/renderer/src/stores/webSession.ts`

职责：

- 保存 `token / user / subscription / wallet / plans`
- 提供 `restoreSession / login / logout / refreshProfile / loadPlans`
- 作为后续会员、钱包、支付按钮和 Web 页面统一状态源

### 3. 登录页升级为双模式入口

更新：

- `src/renderer/src/ui/views/AuthView.vue`

现状：

- 新增 `Web 商业化登录` 模式：
  - 手机号
  - 验证码
  - 昵称
- 保留 `桌面授权登录` 模式：
  - `machine_id`
  - `license_key`
- 登录成功后统一进入 `/clone`

说明：

- 演示环境仍使用固定验证码 `123456`
- 这一步只是壳层接入，不代表已经完成正式支付和正式云端鉴权

### 4. 路由守卫兼容 Web 会话

更新：

- `src/renderer/src/router/index.ts`
- `src/renderer/src/ui/App.vue`

现状：

- 路由守卫改为：
  - 优先检查 Web Token 会话
  - 若无 Web 会话，再回退到原有桌面 License 校验
- 应用启动时自动尝试恢复 Web 会话并拉取套餐列表

这保证了：

- Web 化入口不再被旧 `license` 守卫直接拦死
- 桌面老用户依然可以继续走原授权模式

### 5. `/clone` 任务列表已切到新 HTTP API

更新：

- `src/renderer/src/ui/views/CloneTaskListView.vue`

现状：

- 列表读取改为 `GET /clone/projects`
- 新建任务改为 `POST /clone/projects`
- 删除任务已改为 `DELETE /clone/projects/:id`
- 右侧新增当前账号、会员、算力摘要卡

这样做的原因：

- 新建与列表查询已经先走服务端化接口
- 删除先复用桌面现有稳定链路，避免本轮继续扩大后端改动面

### 6. 主工作台顶栏接入账号/会员/算力摘要

更新：

- `src/renderer/src/ui/MainLayout.vue`

现状：

- 顶栏用户区改为显示当前 Web 用户昵称与会员套餐
- 顶栏状态芯片把原“API 额度”改成“算力余额”
- 侧栏套餐摘要区改为读取当前会员/钱包状态；未登录 Web 时回退为桌面模式文案

## 2026-05-08 第三轮补充：会员 / 钱包页与任务删除 HTTP 化

本轮继续把最小商业闭环向前推进，重点补了“任务删除的服务端接口”和“会员 / 钱包前端页”。

### 1. Web API 补齐账务与删除接口

更新：

- `src/main/lib/webApiServer.ts`
- `src/main/modules/web-platform/service.ts`

新增 / 补齐：

- `GET /billing/orders`
- `GET /billing/transactions`
- `DELETE /clone/projects/:id`

语义：

- 账单页现在可以直接读取当前用户的订单与钱包流水
- `/clone` 列表页删除任务不再依赖旧 IPC，而是走真正的 HTTP API

### 2. 新增会员与钱包中心页

新增：

- `src/renderer/src/ui/views/BillingView.vue`

功能：

- 查看当前用户
- 查看当前会员套餐
- 查看算力余额
- 查看会员套餐列表
- 创建并模拟支付会员订单
- 创建并模拟支付算力包订单
- 查看最近订单
- 查看最近算力流水

说明：

- 当前支付通道仍是 `mock_wechat / mock_alipay`
- 页面重点是先把商业化核心对象展示和调用链接通，不在这一轮引入复杂支付 UI

### 3. 路由与入口补齐

更新：

- `src/renderer/src/router/index.ts`
- `src/renderer/src/ui/MainLayout.vue`

现状：

- 新增 `/billing`
- 顶栏新增“钱包”入口
- 用户可从主工作台直接进入会员 / 钱包中心

### 4. `/clone` 删除动作彻底切到 HTTP API

更新：

- `src/renderer/src/ui/views/CloneTaskListView.vue`

现状：

- 删除任务改为调用 `webApiClient.removeCloneProject()`
- 任务列表的新建 / 查询 / 删除三个基础动作现在都已走 Web API

这意味着当前 `/clone` 列表页已经具备较完整的服务端化任务管理壳层。

## 2026-05-09 第四轮补充：`/clone/:projectId` 详情页第一阶段 Web API 化

本轮开始对任务详情页进行渐进式 Web API 接入，但严格控制范围，不一次性重写全部五阶段逻辑。

### 本轮接入范围

更新：

- `src/renderer/src/lib/webApiClient.ts`
- `src/renderer/src/ui/views/CloneView.vue`

已接入到 HTTP API 的能力：

- 任务详情加载：`GET /clone/projects/:id`
- 运行时状态刷新：`GET /clone/projects/:id/runtime`
- 第一阶段参考分析提交：`POST /clone/projects/:id/analyze`

### 前端行为调整

`CloneView.vue` 现在采用“混合桥接”策略：

- 若当前存在 Web 登录 Token：
  - 详情页加载优先走 Web API
  - 运行时轮询优先走 Web API
  - 第一阶段分析提交优先走 Web API
- 若当前没有 Web Token：
  - 继续回退到原有 Electron IPC 链路

这样做的原因：

- 不破坏已经稳定的桌面工作台细逻辑
- 先把任务详情页最核心的“进入任务 / 看状态 / 跑第一步”服务端化
- 后续可以按阶段继续把脚本变体、分镜图、分镜视频、最终合成逐步切过去

### 当前边界

本轮尚未切到 Web API 的详情页能力仍包括：

- 第四阶段分镜视频生成与重试
- 第五阶段最终成片合成

这些能力当前仍走旧 IPC，因此 `CloneView.vue` 目前是有意识保留的“混合模式”。

## 2026-05-09 第五轮补充：详情页第二阶段主动作 Web API 化

本轮继续按阶段推进详情页服务端化，只扩到第二阶段的两个核心动作，不继续扩到素材绑定和后续分镜阶段。

### 本轮新增接口

更新：

- `src/main/modules/web-platform/service.ts`
- `src/main/lib/webApiServer.ts`
- `src/renderer/src/lib/webApiClient.ts`

新增：

- `POST /clone/projects/:id/select-script-variant`

说明：

- 第二阶段“选择脚本候选”现在也有了正式的 HTTP API
- 这样第二阶段的两个主动作都可以走服务端链路：
  - 生成脚本候选
  - 选择脚本候选

### 详情页前端接入范围扩大

更新：

- `src/renderer/src/ui/views/CloneView.vue`

现状：

- 若当前存在 Web Token：
  - 第二阶段生成脚本变体走 Web API
  - 第二阶段选择脚本变体走 Web API
- 若当前没有 Web Token：
  - 继续回退到原有 IPC

### 当前详情页 Web API 覆盖范围

到目前为止，`/clone/:projectId` 已服务端化的详情页能力包括：

- 任务详情加载
- 运行时状态刷新
- 第一阶段参考视频分析
- 第二阶段脚本变体生成
- 第二阶段脚本变体选择

### 仍保留 IPC 的能力

当前仍未切到 Web API 的详情页能力包括：

- 第四阶段分镜视频生成 / 查询 / 重试
- 第五阶段最终成片合成

因此当前详情页仍是“前两阶段主动作已 Web API 化，后三阶段继续混合运行”的状态。

## 2026-05-09 第六轮补充：第三阶段前置链路与分镜图片主链 Web API 化

本轮继续按顺序推进，把第三阶段开始前必须依赖的两类绑定动作，以及第三阶段主动作一起切到 Web API。

### 本轮新增接口

更新：

- `src/main/modules/web-platform/service.ts`
- `src/main/lib/webApiServer.ts`
- `src/renderer/src/lib/webApiClient.ts`

新增：

- `POST /clone/projects/:id/product-images`
- `POST /clone/projects/:id/select-model-identity`

说明：

- 商品图绑定现在可以通过 HTTP API 写回项目
- 模特绑定现在可以通过 HTTP API 写回项目
- 第三阶段批量分镜图片生成继续复用已有 `POST /clone/projects/:id/storyboard-images`

### 详情页前端接入范围扩大

更新：

- `src/renderer/src/ui/views/CloneView.vue`

现状：

- 若当前存在 Web Token：
  - 商品图绑定走 Web API
  - 商品图删除 / 清空 / 草稿同步走 Web API
  - 模特绑定走 Web API
  - 第三阶段批量分镜图片生成走 Web API
- 若当前没有 Web Token：
  - 继续回退到原有 IPC

### 当前详情页 Web API 覆盖范围

到目前为止，`/clone/:projectId` 已服务端化的详情页能力包括：

- 任务详情加载
- 运行时状态刷新
- 第一阶段参考视频分析
- 第二阶段脚本变体生成
- 第二阶段脚本变体选择
- 商品图绑定
- 模特绑定
- 第三阶段批量分镜图片生成

这意味着“前 3 个阶段的主链”已经基本进入服务端主链。

### 当前仍保留 IPC 的能力

当前仍未切到 Web API 的详情页能力包括：

- 第三阶段单镜重生等细动作
- 第四阶段分镜视频生成 / 查询 / 重试
- 第五阶段最终成片合成

因此当前详情页现在更准确的状态是：

- 前 3 个阶段主链已 Web API 化
- 后 2 个阶段仍是混合运行

## 本轮验证

- `npm run typecheck`
- `npm run build`

已通过。

## 2026-05-09 第七轮补充：第四阶段分镜视频主链 Web API 化
本轮继续按阶段细化详情页服务端化，将第四阶段“分镜视频生成”的三个主动作接入到 HTTP API，但保留本地替换视频的混合能力。

### 本轮新增接口

更新：
- `src/main/modules/web-platform/service.ts`
- `src/main/lib/webApiServer.ts`
- `src/renderer/src/lib/webApiClient.ts`

新增：
- `POST /clone/projects/:id/shot-videos`
- `POST /clone/projects/:id/shot-videos/:shotId/sync`
- `POST /clone/projects/:id/shot-videos/:shotId/regenerate`

### 详情页接入范围

更新：
- `src/renderer/src/ui/views/CloneView.vue`

现状：
- 若当前存在 Web Token：
  - 第四阶段批量生成分镜视频走 Web API
  - 单镜继续查询云端 task 结果走 Web API
  - 单镜强制重生走 Web API
- 若当前没有 Web Token：
  - 继续回退到原有 IPC

说明：
- `replaceShotVideo` 仍然保留为 IPC / 本地文件选择混合动作
- 第四阶段的主生成、查询、重试链路已经可以完整走服务端

## 2026-05-09 第八轮补充：第五阶段最终成片主链 Web API 化
本轮继续清理详情页中剩余的旧 IPC 依赖，将第五阶段“合成最终成片”的提交主链和关键刷新逻辑切到 HTTP API。

### 本轮新增 / 补齐

更新：
- `src/renderer/src/lib/webApiClient.ts`
- `src/renderer/src/ui/views/CloneView.vue`

补齐：
- `webApiClient.composeCloneFinalVideo(projectId, { outputDir? })`

### 详情页接入范围

`CloneView.vue` 现在在 Web Token 登录态下，以下能力优先走 HTTP API：

- 最终成片合成提交 `POST /clone/projects/:id/compose`
- “云端状态同步”时的项目与 runtime 刷新
- `ensureCurrentProjectReady()` 不再回退到旧 IPC 读取项目
- `waitForStoryboardFrames()` 在 Web 登录态下改为读取 HTTP API 与运行时状态

这样做的目的：
- 避免 Web 任务详情页在最终成片阶段又回退到旧 IPC，导致误读本地项目状态
- 保证在 Web 商业化登录模式下，前 5 阶段的主操作链路基本贯通到服务端化入口

### 当前仍保留 IPC 的能力

- 本地参考视频、商品图、替换分镜视频等依赖本地文件选择器的动作
- 部分桌面特有的辅助能力

## 2026-05-09 第九轮补充：第三阶段单镜分镜图与锁定动作 Web API 化
本轮继续补齐第三阶段“分镜图片生成”的边角能力，重点把仍然卡在旧 IPC 的单镜重生和锁定动作切到 HTTP API。

### 本轮新增接口

更新：
- `src/main/modules/web-platform/service.ts`
- `src/main/lib/webApiServer.ts`
- `src/renderer/src/lib/webApiClient.ts`
- `src/renderer/src/ui/views/CloneView.vue`

新增：
- `POST /clone/projects/:id/storyboard-images/:shotId/regenerate`
- `POST /clone/projects/:id/shots/:shotId`

### 详情页接入范围

`CloneView.vue` 现在在 Web Token 登录态下，以下第三阶段动作优先走 HTTP API：

- 单镜分镜图片重生成
- 分镜锁定 / 解锁
- 单镜重生成前的商品图草稿同步
- 单镜重生成后的项目状态回刷

说明：
- 单镜重生成沿用 `generate_storyboard_images` 扣费动作
- `POST /clone/projects/:id/shots/:shotId` 当前先承载 `locked` 更新语义，后续如需扩展可继续复用
- 这样第三阶段除了本地文件选择相关动作外，核心交互已基本完成服务端化

## 2026-05-09 第十轮补充：Web 素材上传底座
本轮开始为真正网页化补底座，不直接重写所有页面，而是先补服务端“素材入库”语义，让参考视频和商品图能通过 HTTP API 进入项目，而不是只能依赖桌面本地文件选择器。

### 本轮新增接口

更新：
- `src/main/modules/web-platform/types.ts`
- `src/main/modules/web-platform/service.ts`
- `src/main/lib/webApiServer.ts`
- `src/renderer/src/lib/webApiClient.ts`

新增：
- `POST /clone/projects/:id/reference-video/upload`
- `POST /clone/projects/:id/product-images/upload`

### 接口语义

- 当前先采用 `application/json + base64Data` 的最小实现，而不是一次性引入 multipart 解析
- 服务端收到上传内容后，会将文件写入本地 `userData/videogenerate/web-uploads/...` 目录
- 对当前项目回写时：
  - 参考视频上传会更新 `referenceVideoPath / referenceVideoName`
  - 商品图上传会追加写入 `productReferenceImagePaths`
- 项目的 `assetStorageProvider` 会标记为 `web_object_storage`，为后续替换成真正对象存储预留语义

### 当前边界

- 这一轮只补“上传入库能力”，还没有把 `CloneView.vue` 的文件选择 UI 改成浏览器原生上传表单
- 当前 Web 客户端已经具备：
  - `webApiClient.uploadCloneReferenceVideo(...)`
  - `webApiClient.uploadCloneProductImages(...)`
- 下一轮可以基于这两个接口继续把 `/clone/:projectId` 第一阶段与第二阶段的素材入口改为真正 Web 上传流

## 2026-05-09 第十一轮补充：`/clone/:projectId` 素材入口切到 Web 上传流
本轮在不大改界面结构的前提下，把详情页第一阶段和第二阶段的两个核心素材入口接到上一轮新增的上传接口。

### 本轮更新

更新：
- `src/main/index.ts`
- `src/preload/index.ts`
- `src/renderer/src/ui/views/CloneView.vue`

新增桥接：
- `fs:readFileAsBase64`

### 页面行为变化

`CloneView.vue` 现在在 Web Token 登录态下：

- 选择参考视频后：
  - 先通过 preload 把本地文件读为 base64
  - 再调用 `POST /clone/projects/:id/reference-video/upload`
  - 上传成功后立即回写当前项目的 `referenceVideoPath / referenceVideoName`

- 选择商品图后：
  - 先通过 preload 把本地图片读为 base64
  - 再调用 `POST /clone/projects/:id/product-images/upload`
  - 上传成功后立即绑定到当前项目，不再先只保存在本地路径草稿里

### 当前边界

- 这一轮仍然借助 Electron 本地文件选择器选文件，但 Web Token 模式下已经不再依赖“把本地绝对路径直接作为项目长期输入源”
- 真正纯浏览器环境仍需要后续把选文件入口替换为 HTML 文件上传控件或前端 Web 页面

## 2026-05-09 第十二轮补充：草稿任务首屏素材直传
本轮继续收紧 `/clone/:projectId` 的任务化体验，解决“新建草稿任务后，页面对象尚未完全载入时，素材上传仍然依赖 `current.id`”的问题。

### 本轮更新

更新：
- `src/renderer/src/ui/views/CloneView.vue`

新增前端语义：
- `activeProjectId = current.id || route.params.projectId`

### 行为变化

在 Web Token 登录态下：

- 参考视频上传
- 商品图上传
- 参考视频分析提交

这三类动作现在都会优先使用 `activeProjectId`，不再强依赖 `current.value?.id` 已经回刷完成。

这样可以保证：
- 用户从任务列表点击“新建任务”后，进入 `/clone/:projectId`
- 即使详情页首屏还在加载
- 也可以直接先上传参考视频或商品图到该草稿任务

### 效果

- 草稿任务的“先建空任务，再逐步补素材”链路更稳定
- Web 任务化入口和上传流的组合更接近真实 SaaS 交互

## 2026-05-09 第十三轮补充：草稿任务首屏模特绑定与第二阶段提交对齐
本轮继续沿用 `activeProjectId` 语义，把草稿任务首屏还容易受 `current.id` 影响的两个动作也收齐。

### 本轮更新

更新：
- `src/renderer/src/ui/views/CloneView.vue`

### 行为变化

以下动作现在都会优先使用：

- `activeProjectId = current.id || route.params.projectId`

覆盖范围新增包括：

- 模特绑定
- 第二阶段脚本变体生成
- 第三阶段“是否允许生成分镜图片”的前置判断

### 效果

- 新建草稿任务后，即使 `current` 还没完全回刷
- 也可以先绑定模特
- 也能让第二阶段和第三阶段的前置判断更贴近真实任务 id，而不是被旧的 `current.value?.id` 卡住

## 2026-05-09 第十四轮补充：`activeProjectId` 延伸到后续阶段主链
本轮继续把详情页的任务路由语义往后续阶段铺开，不改界面结构，只收执行链路。

### 本轮更新

更新：
- `src/renderer/src/ui/views/CloneView.vue`

### 覆盖范围

以下动作现在都会优先使用：

- `activeProjectId = current.id || route.params.projectId`

本轮新增覆盖包括：

- 选中脚本变体
- 生成分镜图片
- 单镜重生分镜图片
- 生成分镜视频
- 查询分镜视频云端状态
- 强制重生分镜视频
- 刷新远程状态
- 最终成片入口前置判断

### 效果

- `/clone/:projectId` 详情页从首屏素材绑定到后续主阶段动作，任务 id 语义更一致
- 新建草稿任务后，即使 `current` 回刷存在时序延迟，后续阶段按钮也更不容易因为旧的 `current.value?.id` 判断被误拦

## 2026-05-09 第十五轮补充：任务路由上下文 composable 抽离
本轮开始做真正独立 Web 工作台壳页前的结构整理，但仍然控制范围，不重写 `CloneView`。

### 本轮更新

新增：
- `src/renderer/src/composables/useCloneRouteProject.ts`

更新：
- `src/renderer/src/ui/views/CloneView.vue`

### 抽离内容

新 composable：
- `useCloneRouteProject()`

当前提供：
- `routeProjectId`
- `resolveActiveProjectId(currentProjectId?)`

`CloneView.vue` 已开始改为复用该 composable，而不是继续在页面内部散落直接读取 `route.params.projectId`。

### 目的

- 把“当前任务 id 来自路由还是已加载项目对象”的语义独立出来
- 为后续新增独立的 Web `/clone/:projectId` 工作台壳页做复用基础
- 后续如果继续拆 `useCloneProjectWorkspace()`，可以基于这个 composable 继续往上收

## 2026-05-09 第十六轮补充：工作台加载链路 composable 抽离
本轮继续做结构层整理，开始把 `/clone/:projectId` 详情页中最核心的“任务加载与刷新”链路从 `CloneView.vue` 中抽离出来。

### 本轮更新

新增：
- `src/renderer/src/composables/useCloneProjectWorkspace.ts`

更新：
- `src/renderer/src/ui/views/CloneView.vue`

### 第一批已抽离能力

`useCloneProjectWorkspace()` 当前已承接：

- `applyProject`
- `refreshCurrentProject`
- `ensureCurrentProjectReady`
- `refreshProjectAfterFailure`
- `loadProject`

### 设计意图

- 先把“任务对象加载、运行时刷新、失败后回刷、当前任务就绪检查”从大页面中抽出来
- `CloneView.vue` 开始转为消费 composable，而不是自己持有所有工作台骨架逻辑
- 为后续真正拆分独立 Web 工作台壳页和继续提炼 `useCloneProjectWorkspace()` 的动作层打基础

## 2026-05-09 第十七轮补充：首屏素材绑定层 composable 抽离
本轮继续扩展 `useCloneProjectWorkspace()`，开始承接详情页首屏最核心的素材绑定动作。

### 本轮更新

更新：
- `src/renderer/src/composables/useCloneProjectWorkspace.ts`
- `src/renderer/src/ui/views/CloneView.vue`

### 第二批已抽离能力

`useCloneProjectWorkspace()` 新增承接：

- 参考视频上传 / 绑定
- 商品图上传 / 绑定
- 模特绑定

对应暴露方法：

- `pickReferenceVideo(filePath)`
- `bindProductImages(files, effectiveProductRefs)`
- `bindModelIdentity(identityId)`

### 页面变化

`CloneView.vue` 中：

- `pickReferenceVideo()`
- `pickProductImages()`
- `selectModel()`

这三段页面级动作已改为薄封装，只负责取文件或取选择结果，再转调 composable。

### 结果

- `CloneView.vue` 进一步从“大控制器页面”转向“消费工作台 composable 的页面”
- 首屏素材绑定层已经不再深度耦合在视图文件里
- 后续继续抽脚本阶段和分镜阶段动作时，拆分路径会更顺

## 2026-05-09 第十八轮补充：第一、二阶段主动作 composable 抽离
本轮继续扩展 `useCloneProjectWorkspace()`，开始承接第一、二阶段的主链动作。

### 本轮更新

更新：
- `src/renderer/src/composables/useCloneProjectWorkspace.ts`
- `src/renderer/src/ui/views/CloneView.vue`

### 第三批已抽离能力

`useCloneProjectWorkspace()` 新增承接：

- 参考视频分析
- 脚本变体生成
- 脚本变体选择

对应暴露方法：

- `createBlueprint(sourcePath)`
- `generateScriptVariants(effectiveProductRefs, hasBoundModel)`
- `selectScriptVariant(variantId)`

### 页面变化

`CloneView.vue` 中：

- `createBlueprint()`
- `generateScriptVariants()`
- `selectScriptVariant()`

这三段页面级动作已改为薄封装，主要保留少量日志上下文，再转调 composable。

### 效果

- 第一、二阶段的主动作已经开始脱离页面文件
- `CloneView.vue` 与 `useCloneProjectWorkspace()` 的职责边界更清晰
- 后续继续抽第三、四阶段动作时，拆分模式已经固定下来
- 
## 2026-05-09 第十九轮补充：第三阶段动作层继续抽离
本轮继续沿用 `/clone/:projectId` 工作台 composable 化方向，范围控制在第三阶段“商品图同步与分镜图片生成”动作层，不改现有界面结构。

### 本轮更新

更新：
- `src/renderer/src/composables/useCloneProjectWorkspace.ts`
- `src/renderer/src/ui/views/CloneView.vue`

### 第四批已抽离能力

`useCloneProjectWorkspace()` 新增承接：
- `syncProductImagesToProject(nextRefs, successMessage)`
- `removeProductImage(imagePath, effectiveProductRefs)`
- `clearProductImages(effectiveProductRefs)`
- `generateStoryboardGrids({ effectiveProductRefs, hasBoundModel, selectedVariantId })`
- `regenerateStoryboardFrame(shotId, effectiveProductRefs)`

### 页面侧变化

`CloneView.vue` 中，以下逻辑已不再由页面直接持有：
- 商品图同步到当前任务
- 单张商品图删除/清空
- 分镜图片批量生成
- 单镜分镜图片重生成

页面当前只保留：
- 文件选择入口
- 按钮点击与界面态联动
- 分镜预览与锁定等纯交互逻辑

### 效果

- 第三阶段开始和前两阶段保持同一套 composable 动作边界
- `CloneView.vue` 继续从“大控制器页面”收缩为工作台壳页
- 后续继续抽第四阶段视频生成、失败恢复、最终合成动作时，可以沿用同样的拆分方式继续推进

## 2026-05-09 第二十轮补充：第四阶段视频动作层继续抽离
本轮继续沿用 `/clone/:projectId` 工作台 composable 化方向，把第四阶段“分镜视频生成与恢复”主动作从页面收口到 `useCloneProjectWorkspace()`。

### 本轮更新

更新：
- `src/renderer/src/composables/useCloneProjectWorkspace.ts`
- `src/renderer/src/ui/views/CloneView.vue`

### 第五批已抽离能力

`useCloneProjectWorkspace()` 新增承接：
- `generateShotVideos()`
- `syncFailedShotVideo(shotId)`
- `replaceShotVideo(shotId, videoPath)`
- `regenerateShotClip(shotId)`
- `refreshRemoteStatus()`

### 页面侧变化

`CloneView.vue` 中，第四阶段以下逻辑已不再由页面直接持有：
- 分镜视频批量生成
- 单镜云端状态继续查询
- 单镜本地替换
- 单镜强制重新生成
- 全局远程状态回刷

页面当前仍保留：
- 替换视频时的文件选择
- 批量“失败项重生”循环
- 最终成片合成入口

### 效果

- 第四阶段开始和前 1-3 阶段保持统一的动作层收口方式
- `CloneView.vue` 进一步收缩为工作台壳页与交互编排层
- 后续若继续抽第五阶段最终成片合成，边界已经足够清晰

## 2026-05-09 第二十一轮补充：第五阶段最终成片合成动作抽离
本轮继续沿用 `/clone/:projectId` 工作台 composable 化方向，把第五阶段“最终成片合成”主动作也收口到 `useCloneProjectWorkspace()`。

### 本轮更新

更新：
- `src/renderer/src/composables/useCloneProjectWorkspace.ts`
- `src/renderer/src/ui/views/CloneView.vue`

### 第六批已抽离能力

`useCloneProjectWorkspace()` 新增承接：
- `composeFinalVideo()`

### 页面侧变化

`CloneView.vue` 中：
- 最终成片合成的前置检查、Web/IPC 双通路调用、日志写入、错误回刷已不再由页面直接持有
- 页面保留：
  - 输出目录选择
  - 打开成片 / 在文件夹中显示
  - 合成按钮点击与少量调试日志

### 效果

- `/clone/:projectId` 五阶段主动作现在都已经进入 `useCloneProjectWorkspace()` 统一承接
- `CloneView.vue` 基本收缩为工作台壳页、局部 UI 状态和桌面交互入口
- 后续如果继续拆，可以开始考虑把 `useCloneProjectWorkspace()` 再按阶段拆成更细的 composable 文件

## 2026-05-09 第二十二轮补充：`useCloneProjectWorkspace` 第二层结构拆分启动
本轮不改业务语义，重点开始处理 `useCloneProjectWorkspace.ts` 自身变大的问题，先做“壳文件 + 内部模块”的第二层拆分。

### 本轮更新

新增：
- `src/renderer/src/composables/useCloneProjectWorkspace.shared.ts`
- `src/renderer/src/composables/useCloneProjectWorkspace.project.ts`
- `src/renderer/src/composables/useCloneProjectWorkspace.materials.ts`

更新：
- `src/renderer/src/composables/useCloneProjectWorkspace.ts`

### 本轮拆分结果

当前分层变为：
- `shared`
  - 承接 `CloneProjectLike`
  - 承接 `UseCloneProjectWorkspaceOptions`
  - 承接若干响应类型与公共工具
- `project`
  - 承接项目加载、刷新、失败回刷、任务载入、分镜图等待回刷
- `materials`
  - 承接参考视频上传、商品图绑定、模特绑定
- `useCloneProjectWorkspace.ts`
  - 作为壳文件组合上述模块
  - 继续承接脚本、分镜图、分镜视频、最终合成执行层

### 效果

- `useCloneProjectWorkspace.ts` 从“所有内容都堆在一个文件”转为可继续演进的组合式结构
- 后续继续拆时，可以优先新增：
  - `useCloneProjectWorkspaceScript.ts`
  - `useCloneProjectWorkspaceStoryboard.ts`
  - `useCloneProjectWorkspaceVideo.ts`
  - `useCloneProjectWorkspaceCompose.ts`
- 现阶段外部调用接口保持不变，`CloneView.vue` 无需跟着大改

## 2026-05-09 第二十三轮补充：脚本层与合成层继续拆出
本轮继续推进 `useCloneProjectWorkspace()` 的第二层结构拆分，优先抽出最稳定、边界最清晰的两段执行层。

### 本轮更新

新增：
- `src/renderer/src/composables/useCloneProjectWorkspace.script.ts`
- `src/renderer/src/composables/useCloneProjectWorkspace.compose.ts`

更新：
- `src/renderer/src/composables/useCloneProjectWorkspace.ts`

### 本轮拆分结果

当前分层进一步变为：
- `script`
  - 参考视频分析
  - 脚本变体生成
  - 脚本变体选择
- `compose`
  - 最终成片合成

主壳文件 `useCloneProjectWorkspace.ts` 现在负责：
- 组合 `project / materials / script / compose`
- 暂时保留 storyboard / video 执行层

### 效果

- 主壳文件继续缩小，职责开始更接近“编排层”
- 后续下一步可直接继续拆：
  - `useCloneProjectWorkspaceStoryboard.ts`
  - `useCloneProjectWorkspaceVideo.ts`
- 当前 `CloneView.vue` 外部调用接口仍保持稳定

## 2026-05-09 第二十四轮补充：Storyboard 层与 Video 层拆出完成
本轮把 `useCloneProjectWorkspace()` 剩余两块主要执行层也独立成模块，主壳文件基本完成“只负责组合”的目标。

### 本轮更新

新增：
- `src/renderer/src/composables/useCloneProjectWorkspace.storyboard.ts`
- `src/renderer/src/composables/useCloneProjectWorkspace.video.ts`

更新：
- `src/renderer/src/composables/useCloneProjectWorkspace.ts`

### 本轮拆分结果

当前完整分层为：
- `shared`
- `project`
- `materials`
- `script`
- `storyboard`
- `video`
- `compose`
- 主壳 `useCloneProjectWorkspace.ts`

各层职责：
- `storyboard`
  - 商品图同步/删除/清空
  - 分镜图片批量生成
  - 单镜分镜图片重生
- `video`
  - 分镜视频批量生成
  - 单镜云端状态同步
  - 单镜替换
  - 单镜强制重生
  - 全局远程状态刷新

### 效果

- `useCloneProjectWorkspace.ts` 现在基本只剩模块组合与统一导出
- `/clone/:projectId` 工作台的动作层已经具备清晰的内部边界
- 后续如需继续精修，可开始考虑：
  - 给每个层增加局部单元测试
  - 再把日志/错误文案抽成统一 helper，进一步减重复
