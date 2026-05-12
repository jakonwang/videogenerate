# VideoGen Web-Next UI 全面重构

## Summary

本轮只重构 `apps/web-next`，不再继续扩展 Vue Web，也不修改 `services/api` 协议。
目标是将当前 Web 商业化前端收敛为一套可上线收费的现代 AI SaaS 工作台，并以 `/clone` 主链路为核心。

当前已确认：

- 页面核心以单页面单核心为原则。
- 共享壳层采用轻导航、强主区、弱辅助区。
- `/clone/[projectId]` 采用“顶部步骤导航 + 当前阶段主面板 + 右侧运行侧栏”。
- 所有用户可见文案统一为简体中文。

## 设计原则

- 单页面单核心
- 轻导航、强主区、弱辅助区
- 减少重描边，优先使用留白、透明度、明暗和层级对比
- 不使用花哨渐变、大面积彩色状态块和发光描边
- 卡片只承载信息，不成为视觉主角

## 视觉 Token

- 背景：`#070B14`
- Surface：`rgba(255,255,255,0.03)`
- Border：`rgba(255,255,255,0.06)`
- Accent：`#6366F1`

Typography：

- Display：`text-5xl font-semibold tracking-tight`
- Title：`text-2xl font-semibold`
- Section：`text-lg font-medium`
- Body：`text-sm text-zinc-400 leading-relaxed`
- Meta：`uppercase tracking-[0.24em] text-[11px] text-zinc-500`

## 页面结构

### `/login`

- 居中单入口
- 左侧为价值主张与简洁能力说明
- 右侧为唯一登录表单

### `/clone`

- 顶部标题与唯一主按钮
- 中部为任务统计与搜索筛选
- 主区为任务卡列表
- 侧栏为任务说明

### `/clone/[projectId]`

- 顶部任务头
- 顶部下方步骤导航
- 中间只展示当前阶段主内容
- 右侧弱化为运行概览与日志

### `/account`

- 核心是账户身份与当前订阅状态
- 辅助展示环境和算力信息

### `/billing`

- 核心是当前套餐与购买动作
- 订单与流水作为辅助区

## 组件拆分

### `components/app`

- `app-shell`
- `page-hero`

### `components/clone`

- `clone-stage-nav`
- `clone-stage-card`
- `clone-runtime-sidebar`

### `components/account`

- `account-identity-card`
- `account-session-card`

### `components/billing`

- `plan-summary-card`
- `credit-balance-card`
- `billing-history-list`

## 文案清洗范围

本轮已清理以下范围内的用户可见乱码与旧文案：

- `apps/web-next/app/page.tsx`
- `apps/web-next/app/clone/page.tsx`
- `apps/web-next/app/clone/[projectId]/page.tsx`
- `apps/web-next/app/account/page.tsx`
- `apps/web-next/app/billing/page.tsx`
- `apps/web-next/components/account/*`
- `apps/web-next/components/billing/*`
- `apps/web-next/components/clone/clone-runtime-sidebar.tsx`
- `apps/web-next/components/clone/clone-stage-card.tsx`
- `apps/web-next/components/clone/clone-stage-nav.tsx`
- `apps/web-next/hooks/use-clone-workspace.ts`
- `apps/web-next/lib/utils.ts`

## 平台兼容说明

- 本地开发测试环境：Windows
- 部署环境：Linux
- Web 前端不得依赖 Windows 绝对路径语义
- 文件预览与上传逻辑保持跨平台兼容

## 2026-05-09 高保真复刻追加实现

### 本轮目标

- 对齐用户提供的桌面端高保真设计稿
- 统一 `AppShell`、首页、`/clone`、`/clone/[projectId]`
- 压缩标题层级，解决页面标题过大问题
- 用局部滚动替代整页长滚动
- 为 AI 生成相关区域补充 Skeleton

### 已落实内容

- `AppShell`
  - Sidebar 固定为 `240px`
  - Topbar 固定为 `72px`
  - GPU/API 状态监测上移到统一顶部状态栏
- 全局样式
  - 根背景统一切换为 `#060B16`
  - 移除纯黑背景，统一壳层和卡片背景 token
  - 任务卡 hover 增加 glow 边框反馈
- `/`
  - 切换为桌面端工作台式首页
  - 左主区 + 右辅助区 + 下方任务与模板区
  - 首屏 Hero 收紧为更扁平的工作台比例，避免左主区被右栏拉出大面积空白
  - 右侧“快速创建 / AI 助手”压缩厚度，回到弱辅助区定位
- `/clone`
  - 改为固定视口列表页
  - 中央任务表局部滚动
  - 右侧说明区弱化处理
  - 列表加载时显示骨架屏
  - 表头与表体纳入同一横向滚动容器，避免右侧列信息被裁切
  - 表体独立纵向滚动，修复任务列表无法继续下滑的问题
  - 右侧“任务说明”区继续压缩高度与留白，改为更轻的提示卡
  - 任务列表列宽重新收敛，优先保证桌面一屏可读性
- `/clone/[projectId]`
  - 顶部任务摘要 + 阶段导航固定
  - 当前阶段主面板独立滚动
  - 右侧运行状态与日志独立滚动
  - 分析、脚本、分镜图、分镜视频、成片合成按阶段切面展示
  - 阶段页整体改为更高密度桌面工作台比例
  - 压缩顶部摘要、镜头卡高度和右侧运行栏厚度，对齐 Stitch 设计稿分区

### 2026-05-09 第二轮精修补充

- `/clone/[projectId]` 已不再继续在旧乱码文件上增量修补，改为整页重写。
- 当前阶段页统一改为：
  - 顶部任务头
  - 中部五阶段导航
  - 左侧阶段主工作区
  - 右侧运行状态 + 运行日志
- 页面滚动模型已调整为：
  - 页面整体可自然向下滚动
  - 不再把主工作台锁死在固定高度容器里
  - 右侧日志区保留局部滚动，避免整页信息被底部遮挡
- 第一阶段“参考分析”已重写为干净中文版本：
  - 参考视频卡
  - 分析能力说明卡
  - 结构分段卡
  - 商品图上传与模特选择配置
- 第二阶段“脚本生成”已按用户提供设计稿重构为三栏结构：
  - 左栏：参考视频卡 + 分析完成提示
  - 中栏：脚本版本列表，推荐版本高亮，大号评分显示
  - 右栏：脚本生成设置，包括风格、时长、语言、生成数量
  - 底部双按钮：上一步 / 下一步
- 第三阶段“分镜设计”已按设计稿落为工作台结构：
  - 顶部视图切换与批量操作条
  - 中部高密度分镜表格
  - 右侧分镜预览、AI 优化建议、素材库
- 第四阶段“分镜视频生成”已按设计稿落为工作台结构：
  - 顶部整体进度卡与批量控制
  - 中部镜头视频生成列表
  - 右侧实时预览、生成信息、资源占用、提示词卡
- 第五阶段“成片合成”已按设计稿落为工作台结构：
  - 左侧成片大预览区
  - 下方镜头顺序条与操作区
  - 右侧 AI 成片评分、导出设置、导出预估
- `/clone/[projectId]` 当前已补上基础阶段交互：
  - 顶部阶段导航可点击切换
  - 各阶段补齐上一步 / 下一步
  - 用户可以在前端先完整走通五阶段工作流
- `/clone/[projectId]` 当前阶段切换已升级为数据驱动优先：
  - 优先根据已生成的脚本、分镜图、分镜视频、成片结果推导当前阶段
  - 刷新页面后不再完全依赖后端 `currentStep`
  - 关键动作完成后前端会自动推进到更合理的下一阶段
- `/clone/[projectId]` 当前已补齐的接口入口：
  - 参考视频上传与分析
  - 商品图上传
  - 模特选择
  - 脚本候选生成
  - 脚本版本选择
  - 分镜图片批量生成
  - 单镜头分镜图片重生
  - 分镜锁定 / 解锁
  - 分镜视频批量生成
  - 单镜头视频状态同步
  - 单镜头视频重生
  - 最终成片合成与导出目录输入
- 当前脚本生成阶段已补充 Skeleton，避免脚本候选生成时出现空白等待。
- 当前仍待继续按设计稿精修的阶段：
  - 各阶段细节动画、微间距与图像内容仍可继续压稿

### 使用说明

- Windows 本地运行时，按现有 `apps/web-next` 开发命令测试页面
- Linux 部署时，无需修改页面路径逻辑
- 任务详情页仍依赖现有 API 数据结构，未修改后端协议

## 2026-05-10 `/clone/[projectId]` 接口补齐

- 本轮继续补齐了单任务工作台缺失的基础接口：
  - `POST /clone/projects/:id/stage`
  - `POST /clone/projects/:id/shots`
  - `DELETE /clone/projects/:id/shots/:shotId`
  - `POST /clone/projects/:id/shots/reorder`
  - `POST /clone/projects/:id/shots/:shotId`
- 本轮同时补齐了前端接线：
  - 阶段点击切换与上下步切换改为真实后端写回
  - 分镜设计页“添加镜头”已接入
  - 成片阶段“删除镜头”“重新生成镜头”已接入
- 说明：
  - 当前仍优先基于现有后端数据结构扩展，不重新发明一套 Web 专属协议
  - 后续仍可继续把分镜细粒度编辑表单接到扩展后的 `updateCloneShot`

## 当前交付状态

- 当前主页面均已恢复为可构建、可访问状态：
  - `/login`
  - `/`
  - `/clone`
  - `/clone/[projectId]`
  - `/account`
  - `/billing`
- 当前交付重点不是完整业务闭环，而是：
  - 商业化 Web 工作台基础壳层
  - 主链路页面结构
  - API 查询和关键操作入口
  - 中文文案与统一视觉基础
- 当前补齐的关键功能入口：
  - `/clone/[projectId]` 商品图上传
  - `/clone/[projectId]` 模特选择
  - `/billing` 模拟支付完成
- 已验证：
  - `npm run typecheck:web-next`

## 2026-05-10 继续推进补充

- `/clone/[projectId]` 已整页重写为干净中文版本，旧乱码内容不再保留。
- 当前详情页继续向设计稿靠拢的关键修正：
  - 主区与右侧栏维持高密度比例
  - 大标题继续收敛为 `24px`
  - 表格与镜头条允许在容器内滚动，不再被固定布局卡死
  - 长列表改为分页，避免底部空白和内容遮挡
- 当前功能联动补齐：
  - 模板库创建任务后可带模板上下文进入详情页
  - 模特库创建任务后可自动预选模特
  - 商品素材库可从已有任务派生新任务并自动回填商品素材
- 本轮构建验证通过：
  - `npm run build:web-next`

## 2026-05-10 `/clone/[projectId]` 整页重写

- 本轮不再继续在旧乱码页面上增量修补，直接整页重写：
  - `apps/web-next/app/clone/[projectId]/page.tsx`
- 同步清理了会影响主链路可见质量的共享壳层文案乱码：
  - `apps/web-next/components/app/app-shell.tsx`
  - `apps/web-next/components/clone/clone-stage-nav.tsx`
- 本轮重写后的任务详情页统一为固定工作台结构：
  - 顶部任务摘要
  - 五阶段导航
  - 左侧阶段主工作区
  - 右侧运行状态 / 运行日志 / 算力流水
- 当前五阶段页面已统一接入现有 `useCloneWorkspace` 能力：
  - 参考视频分析
  - 商品图上传
  - 模特选择
  - 脚本候选生成与选择
  - 分镜图片批量生成 / 单镜头重生 / 锁定
  - 分镜视频批量生成 / 单镜头同步 / 单镜头重生
  - 镜头编辑 / 删除 / 新增 / 排序
  - 最终成片合成
- 当前页面重构后的实现约束：
  - 页面标题控制在 `24px`
  - 正文以 `13px-14px` 为主
  - 外层不使用长滚动承载主要操作
  - 主工作区与右侧栏均使用局部滚动
  - AI 生成过程使用 Skeleton，避免空白等待
- 验证结果：
  - `npm run typecheck:web-next`
  - `npm run build:web-next`

## 2026-05-10 首页与 `/clone` 列表页整块重写

- 本轮继续按同一套深色高密度工作台基线，整块重写：
  - `apps/web-next/app/page.tsx`
  - `apps/web-next/app/clone/page.tsx`
- 首页本轮调整重点：
  - 清理历史乱码文案
  - 收紧 Hero 比例，消除大面积无效空白
  - 固定为左主区 + 右侧轻辅助区 + 下方任务区的桌面工作台结构
  - 统一标题、正文、卡片密度与间距
- `/clone` 列表页本轮调整重点：
  - 清理历史乱码文案
  - 表头与表体纳入同一横向滚动容器
  - 表体恢复独立纵向滚动
  - 底部保留真实分页，不再因固定容器导致无法下滑
  - 右侧说明区继续压缩为弱辅助区
  - 保留并验证现有搜索、状态筛选、创建任务、删除任务、分页切换
- 验证结果：
  - `npm run typecheck:web-next`
  - `npm run build:web-next`

## 2026-05-10 账户页与计费页统一收口

- 本轮继续按同一套工作台视觉基线重写：
  - `apps/web-next/app/account/page.tsx`
  - `apps/web-next/app/billing/page.tsx`
- 账户页本轮调整重点：
  - 清理旧乱码文案
  - 统一为“身份信息 + 账户动作 + 环境状态”的三段式结构
  - 保持账户、订阅、钱包信息仍由统一 API 查询
- 计费页本轮调整重点：
  - 清理旧乱码文案
  - 统一为“当前套餐 + 套餐购买 + 算力充值 + 模拟支付 + 最近订单”的主次结构
  - 保留现有套餐下单、算力充值、模拟支付、订单列表功能
- 本轮完成后，`apps/web-next/app` 主页面层已统一到同一套中文、高密度、固定工作台基线：
  - `/`
  - `/clone`
  - `/clone/[projectId]`
  - `/account`
  - `/billing`
- 验证结果：
  - `npm run typecheck:web-next`
  - `npm run build:web-next`

## 2026-05-10 共享组件层继续收口

- 本轮继续统一会被主页面复用或后续可能重新接回的共享组件：
  - `apps/web-next/components/clone/clone-task-list.tsx`
  - `apps/web-next/components/clone/clone-runtime-sidebar.tsx`
  - `apps/web-next/components/account/account-identity-card.tsx`
  - `apps/web-next/components/account/account-session-card.tsx`
  - `apps/web-next/components/billing/billing-history-list.tsx`
  - `apps/web-next/components/billing/plan-summary-card.tsx`
  - `apps/web-next/components/billing/credit-balance-card.tsx`
- 本轮重点：
  - 清理共享组件中的历史乱码文案
  - 统一卡片内边距、标题层级和正文密度
  - 保持与当前 `/`、`/clone`、`/clone/[projectId]`、`/account`、`/billing` 同一套视觉基线
- 验证结果：
  - `npm run build:web-next`
- 说明：
  - 单独执行 `npm run typecheck:web-next` 时，当前 `apps/web-next/tsconfig.json` 依赖 `.next/types/**/*.ts`，若对应类型文件未提前生成，会出现缺失文件报错。
  - 在本轮验证中，`next build apps/web-next` 已完整通过，说明实际构建链路和类型检查流程可用。

## 2026-05-10 剩余共享组件统一

- 本轮继续清理和统一剩余共享组件：
  - `apps/web-next/components/clone/clone-task-hero.tsx`
  - `apps/web-next/components/clone/clone-history-rail.tsx`
  - `apps/web-next/components/clone/clone-stage-card.tsx`
  - `apps/web-next/components/app/page-hero.tsx`
  - `apps/web-next/components/ui/icon-frame.tsx`
- 本轮重点：
  - 清理 `clone-task-hero`、`clone-history-rail` 中的历史乱码文案
  - 统一标题比例和正文密度，避免继续沿用旧的大标题写法
  - 统一图标容器、阶段卡和通用 Hero 的工作台视觉基线
- 验证结果：
  - `npm run build:web-next`

## 2026-05-10 全局样式基线整理

- 本轮继续对 `apps/web-next/app/globals.css` 做基线整理，补充并统一了一批通用类：
  - `page-header`
  - `page-header__copy`
  - `page-header__actions`
  - `soft-card`
  - `soft-card--dense`
  - `soft-card--panel`
  - `stack-title`
  - `stack-copy`
- 同步将以下主页面改为直接复用这些通用类，减少页面层样式继续分散：
  - `apps/web-next/app/page.tsx`
  - `apps/web-next/app/clone/page.tsx`
  - `apps/web-next/app/account/page.tsx`
  - `apps/web-next/app/billing/page.tsx`
- 本轮目标：
  - 统一页面头部结构
  - 统一弱辅助卡片和说明卡的厚度、边框、留白
  - 统一标题组和辅助说明文案的密度
  - 降低页面层重复写样式的比例
- 验证结果：
  - `npm run build:web-next`
  - `npm run build:web-next`
