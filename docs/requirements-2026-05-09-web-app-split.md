# 2026-05-09 独立 Web 程序拆分首轮落地

## 背景

为支持后续浏览器访问、会员订阅、算力包和中心化任务执行，项目开始从 Electron 单体结构拆出独立 Web 程序与独立 API 服务。

本轮目标不是完成全部商业化能力，而是先把“独立程序边界”搭起来，避免继续在 Electron 渲染层和主进程里混写 Web 逻辑。

## 本轮实现

### 1. 新增独立 API 服务入口

新增：

- `services/api/server.ts`

职责：

- 作为独立 Node HTTP 服务入口运行
- 复用现有 `web-platform` 服务层和 `/clone` 业务层
- 不依赖 Electron 窗口启动

当前默认：

- `host=0.0.0.0`
- `port=18080`
- 数据目录优先读取 `VIDEOGENERATE_DATA_DIR`

### 2. 抽出共享 Web API 路由

新增：

- `src/main/modules/web-platform/webApiRouter.ts`

职责：

- 统一承载登录、账务、`/clone` 任务与五阶段接口
- Electron 内嵌 `webApiServer`
- 独立 `services/api`

这两条链路现在共用同一套路由语义，不再维护两套 HTTP 接口实现。

### 3. 底层运行时兼容层补齐

新增：

- `src/main/lib/runtimeCrypto.ts`

更新：

- `src/main/lib/paths.ts`
- `src/main/modules/clone/repo.ts`

调整结果：

- 路径解析不再强依赖 `electron.app.getPath`
- 独立 Node 服务可通过环境变量或运行时配置指定数据目录
- 凭证加密改为“Electron 可加密，纯 Node 可降级”

### 4. 新增独立 Web 前端壳

新增：

- `apps/web/`

当前已落地：

- 登录页
- 任务列表页 `/clone`
- 任务详情页 `/clone/:projectId`
- 会员页占位
- 账户页占位

说明：

- 当前 Web 第一版优先打通商业主链路壳层，不追求桌面端所有复杂交互 1:1 搬运
- 任务详情页已能读取当前任务与 runtime 数据
- 任务详情页已接管前两阶段主链：
  - 浏览器上传参考视频
  - 提交第一阶段参考分析
  - 浏览器上传商品图
  - 拉取并选择模特
  - 生成脚本候选
  - 选择脚本候选
- 后续继续逐阶段接管 `/clone` 五阶段完整编辑和执行界面

### 5. 新增 Web 模特列表接口

新增：

- `GET /clone/model-identities`

用途：

- 给独立 Web 详情页读取当前可选模特列表
- 不再依赖 Electron IPC 的模特库选择链路

### 6. 抽出共享 Web API 客户端

新增：

- `src/shared/web-api/client.ts`
- `src/shared/web-api/types.ts`

更新：

- `src/renderer/src/lib/webApiClient.ts`
- `apps/web/src/services/webApi.ts`

结果：

- 桌面端与 Web 端共享同一套 API 客户端语义和类型
- 不再维护两套 `/clone`、账务、登录接口封装

## 运行方式

### Electron 桌面端

```bash
npm run dev
```

### 独立 API 服务

```bash
npm run dev:api
```

### 独立 Web 前端

```bash
npm run dev:web
```

默认联调地址：

- API：`http://127.0.0.1:18080`
- Web：`http://127.0.0.1:18180`

## 当前边界

- 当前 `/clone` 业务服务仍然复用现有主进程业务层，尚未彻底拆出纯服务端领域层
- Web 详情页目前是首版工作台壳，不等于桌面端完整功能迁移完成
- 上传、对象存储、正式数据库、正式支付、正式任务队列仍属于后续阶段

## 验证

- `npm run typecheck`
- `npm run typecheck:web`
- `npm run typecheck:api`

## 2026-05-09 补充：桌面端 Web API 兜底与 Web 工作台后三阶段接入

- 桌面端渲染层 `src/renderer/src/lib/webApiClient.ts` 已增加 `app:getWebApiInfo` 的容错兜底：
  - 优先走 Electron IPC 获取本地 Web API 地址
  - 若主进程未重启、旧进程未注册 handler 或 IPC 调用失败，则自动回退到 `http://127.0.0.1:18080`
  - 这样在 Windows 开发态下，即使 Vite 仅热更新渲染层，桌面端也不会因缺失 `app:getWebApiInfo` 直接报错中断

- Web 端 `apps/web/src/views/WebCloneDetailView.vue` 已从“前两阶段壳页面”扩展为五阶段首版工作台：
  - 第一阶段：上传参考视频并提交分析
  - 第二阶段：上传商品图、选择模特、生成并选择脚本候选
  - 第三阶段：生成分镜图片、单镜重生成、锁定/解锁分镜
  - 第四阶段：生成分镜视频、单镜同步状态、单镜重生成
  - 第五阶段：提交最终成片合成并显示结果路径摘要

- Web 详情页新增右侧“任务控制台”：
  - 固定显示运行摘要、算力信息、图片/视频数量
  - 支持手动刷新
  - 支持开启/暂停轮询
  - 显示最近阶段动作日志，便于浏览器环境排查远程任务提交和状态更新

- 本轮仍保持前后端分离：
  - Web 页面只通过共享 `webApiClient` 调 HTTP API
  - 不在 Web 页面直接承载 Electron IPC 或主进程业务逻辑
  - 阶段执行权继续在服务端/主进程业务层

- Web 开发启动补充：
  - `apps/web/vite.config.ts` 已显式设置 `root=apps/web`
  - 同时设置独立 `build.outDir`
  - 修复了此前 `npm run dev:web` 虽然启动了 Vite，但根目录仍指向仓库根目录，导致访问 `http://127.0.0.1:18180/` 返回 404 的问题

## 2026-05-09 补充：登录页、布局壳与任务列表页精修

- `apps/web/src/views/WebLoginView.vue`
  - 重写为双栏登录页：左侧产品说明与能力摘要，右侧登录表单
  - 统一使用当前深色高密度工作台语言，不再是简单卡片堆叠
  - 清理登录页中文乱码文案

- `apps/web/src/views/WebLayout.vue`
  - 重写为更稳定的工作台壳层：左侧导航、顶部用户条、右侧内容区
  - 统一文案为中文正常显示
  - 收紧间距与导航层级，贴近现有桌面端专业工作台基线

- `apps/web/src/views/WebCloneTaskListView.vue`
  - 从基础表格重写为“头部 Hero + 统计条 + 搜索工具条 + 高密度任务板”
  - 支持任务总数、运行中、已完成、草稿四类概览
  - 每行聚合展示：标题、阶段、状态、素材摘要、进度、操作
  - 清理任务列表页中文乱码文案

- `apps/web/src/styles.css`
  - 统一升级 Web 全局设计 token：背景、卡片、按钮、输入框、阴影、状态色
  - 增强玻璃感、渐变、悬浮反馈与输入 focus 态
- 保持仍为 Vue 3 + Vite 架构，不做高风险前端框架迁移

## 2026-05-09 补充：并行新增 Next.js 商业化前端
- 新增独立前端目录 `apps/web-next`，采用 `Next.js App Router + React + Tailwind CSS + shadcn/ui 风格组件封装`。
- 本轮不替换现有 `apps/web`，而是并行保留 Vue Web 作为过渡实现，避免影响当前桌面端和已有联调链路。
- 新增根脚本：
  - `npm run dev:web-next`
  - `npm run build:web-next`
  - `npm run start:web-next`
  - `npm run typecheck:web-next`
- 新前端首发页面范围：
  - `/login`
  - `/clone`
  - `/clone/[projectId]`
- 新前端继续复用 `services/api` 与 `src/shared/web-api/types.ts` / `client.ts` 的协议语义，不改后端 API。
- Next 端新增独立基础设施：
  - `lib/api-client.ts`：统一 `baseUrl`、token、本地 401 跳转
  - `store/session-store.ts`：基于 zustand 的轻量会话状态
  - `providers/query-provider.tsx`：React Query 查询层
  - `components/ui/*`：深色工作台风格的 Button / Card / Input / StatusBadge
  - `components/clone/*`：阶段卡片与右侧运行控制台
- 详情页首轮已接入五阶段壳层与主要按钮动作：
  - 分析参考视频
  - 脚本变体评分
  - 分镜图片生成
  - 分镜视频生成
  - 合成最终成片
- 当前策略仍以 CSR 为主，不引入 SSR / Server Actions / Cookie Session 的复杂数据流。

### 启动方式
- 启动 API：`npm run dev:api`
- 启动 Next Web：`npm run dev:web-next`
- 默认地址：
  - API：`http://127.0.0.1:18080`
  - Next Web：`http://127.0.0.1:18280`

## 2026-05-09 补充：Next 前端第二轮页面补齐
- `/clone/[projectId]` 的第 3 到第 5 阶段已从“仅有按钮的壳层”补齐为结果工作台：
  - 分镜图片阶段：逐镜预览、状态、路径、错误、锁定与单镜重生
  - 分镜视频阶段：逐镜预览、图片来源、任务 ID、状态同步、单镜重生
  - 最终成片阶段：按镜头汇总图片/视频完成状态，并展示最终成片预览区域
- 新增 `/billing` 页面：
  - 套餐列表
  - 算力包快捷充值
  - 订单记录
  - 算力流水
- 新增 `/account` 页面：
  - 用户资料
  - 会员状态
  - 钱包与算力
  - 当前 Web 环境信息
- 清洗共享 Web API 文案源头：
  - `src/shared/web-api/client.ts`
  - `src/main/modules/web-platform/webApiRouter.ts`
  先修正公共错误提示，避免新旧两套前端继续读取乱码提示。

## 2026-05-09 补充：旧 Vue Web 关键页同步清洗
- `apps/web` 的关键页面已同步清洗一轮，避免 `18180` 仍然持续输出乱码或只剩占位页：
  - `WebLoginView.vue`
  - `WebLayout.vue`
  - `WebCloneTaskListView.vue`
  - `WebBillingView.vue`
  - `WebAccountView.vue`
- 当前策略是：
  - `18280` 作为新的 Next 商业化前端主入口
  - `18180` 继续作为过渡版 Vue Web，可用于联调与回归

## 2026-05-09 补充：复刻详情页组件拆分与文案清洗

- `apps/web/src/views/WebCloneDetailView.vue`
  - 从单文件“大而全”页面收缩为页面装配层
  - 只负责组合阶段卡片与右侧运行侧栏
  - 全面替换主要中文乱码文案为正常中文

- `apps/web/src/composables/useWebCloneDetailWorkspace.ts`
  - 提取详情页业务逻辑：任务刷新、轮询、参考视频分析、脚本候选、分镜图片、分镜视频、最终合成
  - 将原本堆在页面里的状态与动作统一收敛到 composable，降低页面耦合

- `apps/web/src/components/clone-detail/WebCloneStageCard.vue`
  - 提取统一阶段卡片壳，确保标题、描述、操作按钮与内容区样式一致

- `apps/web/src/components/clone-detail/WebCloneRuntimeSidebar.vue`
  - 提取右侧运行侧栏
  - 统一承载算力、素材统计、轮询控制与控制台日志

- 本轮结果
  - 详情页已完成第一轮“文案清洗 + 视觉收口 + 组件拆分”
  - 当前仍保留已有业务链路，不改变 Web API 协议

后续应继续补：

- Web 端 `/clone` 五阶段完整操作页
- 浏览器文件上传语义替换 Electron 选文件器
- 独立数据库、对象存储、队列与支付接入
## 2026-05-09 追加：`apps/web-next` 第二轮业务收口

- 本轮开始明确只继续建设 `apps/web-next`，不再为 Vue Web 增量开发业务界面。
- 已统一清洗 `web-next` 关键页面和 hook 的中文乱码文案：
  - `app/login/page.tsx`
  - `app/clone/page.tsx`
  - `app/clone/[projectId]/page.tsx`
  - `app/billing/page.tsx`
  - `app/account/page.tsx`
  - `hooks/use-clone-workspace.ts`
  - `components/app/app-shell.tsx`
  - `components/clone/clone-runtime-sidebar.tsx`
  - `lib/utils.ts`
- `/clone` 任务列表页已正式收口为可商用的任务总览页，支持：
  - 新建任务
  - 删除任务
  - 搜索任务
  - 展示阶段、状态、素材摘要与进度
- `/clone/[projectId]` 五阶段详情页已补强为真正结果工作台：
  - 第 1 阶段：上传参考视频并提交分析
  - 第 2 阶段：上传商品图、选择模特、生成和选择脚本候选
  - 第 3 阶段：逐分镜图片预览、单镜重生、锁定/解锁、查看大图
  - 第 4 阶段：逐分镜视频预览、同步状态、单镜重生、查看大图
  - 第 5 阶段：按分镜汇总图片/视频状态并预览最终成片
- 详情页新增增强交互：
  - 大图 / 大视频预览弹层
  - 更明确的空态、失败态与路径展示
  - 任务不存在时的页面兜底提示
- 右侧运行控制台已统一为：
  - 当前阶段
  - 分镜图片数
  - 分镜视频数
  - 算力余额
  - 最近更新时间
  - 浏览器端运行日志
- 本轮不修改 `services/api` 协议，继续复用现有共享 HTTP API 客户端。
- 验证已通过：
  - `npm run typecheck:web-next`
  - `npm run build:web-next`

## 2026-05-09 追加：`apps/web-next` 第三轮工作台细化

- 继续只在 `apps/web-next` 范围内开发，不再对 Vue Web 增量实现。
- 清洗共享 API 客户端 `src/shared/web-api/client.ts` 的残留乱码报错文案，统一为正常中文错误提示。
- `/clone/[projectId]` 继续补强：
  - 第一阶段增加参考视频预览区
  - 第一阶段增加逐分镜分析结果列表
  - 第三阶段增加图片路径复制
  - 第四阶段增加视频路径复制
  - 第五阶段增加最终成片预览按钮与输出路径复制
  - 页面保留任务不存在时的明确空态
- 右侧运行控制台继续增强：
  - 新增“暂停轮询 / 恢复轮询”
  - 新增最近算力流水卡片
  - 保留阶段、产物数量、余额与日志
- 本轮再次验证通过：
  - `npm run typecheck:web-next`
  - `npm run build:web-next`

## 2026-05-09 追加：`apps/web-next` 第四轮视觉与文案精修

- 本轮继续只处理 `apps/web-next`，不再修改 Vue Web。
- 完成以下核心清洗与收口：
  - `apps/web-next/lib/utils.ts`
  - `apps/web-next/components/app/app-shell.tsx`
  - `apps/web-next/components/clone/clone-runtime-sidebar.tsx`
  - `apps/web-next/hooks/use-clone-workspace.ts`
  - `apps/web-next/app/clone/page.tsx`
  - `apps/web-next/app/clone/[projectId]/page.tsx`
- 目标与结果：
  - 清理 `web-next` 主链路页面中的中文乱码与混杂旧文案
  - 将任务列表和任务详情页统一到同一套深色高密度 SaaS 工作台语义
  - 详情页顶部增强为“任务总控区 + 关键指标 + 五阶段导航”
  - 右侧运行控制台收敛为更专业的状态、余额、流水和日志面板
  - 前端保持只调用共享 HTTP API，不把业务逻辑搬回页面层
- 兼容性说明：
  - 本轮未改 `services/api` 接口协议
  - 路径和预览仍保持 Windows 开发、Linux 部署兼容写法
  - `tsconfig` 已调整为可直接执行 `npm run typecheck:web-next`，不再依赖预生成 `.next/types`

## 2026-05-09 追加：`apps/web-next` 第五轮 SaaS 级 UI 重构

- 目标明确调整为：以现代 AI SaaS 工作台标准重构，而不是继续做“可用即可”的后台页。
- 本轮严格收口到三层信息结构：
  - Level 1：当前任务 / 当前步骤
  - Level 2：操作区 / 表单 / 工作流
  - Level 3：辅助状态 / 统计 / 日志
- 统一重构基础设计系统：
  - `apps/web-next/app/globals.css`
  - `apps/web-next/components/ui/button.tsx`
  - `apps/web-next/components/ui/card.tsx`
  - `apps/web-next/components/ui/input.tsx`
  - `apps/web-next/components/ui/badge.tsx`
  - `apps/web-next/components/app/app-shell.tsx`
  - `apps/web-next/components/clone/clone-stage-card.tsx`
- 设计规则落地：
  - 左侧导航固定 240px
  - 主内容最大宽度 1200px
  - 统一 `rounded-2xl + border-white/10 + bg-white/5`
  - 主色收敛为 indigo / blue 体系
  - 接入 `framer-motion` 做轻微 hover 放大
- 页面重构结果：
  - `/clone`：从任务表格心智重构为“当前任务总控 + 下方任务流”的单主区域布局
  - `/clone/[projectId]`：改为“单任务驱动 UI”，当前任务与当前步骤成为视觉中心，运行状态退到弱化侧栏
  - `/account`：改为身份、会员、钱包、环境四个清晰分区的信息卡布局
  - `/login`：统一到同一套现代暗色 SaaS 视觉体系
- 本轮未改动后端接口协议，继续保持前后端分离与共享 HTTP API 客户端架构。
