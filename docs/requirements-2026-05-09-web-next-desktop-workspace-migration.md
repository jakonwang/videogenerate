# VideoGen Web-Next 复刻现有桌面端主工作台

## Summary

本轮改动采用“桌面端结构高保真迁移 + Web 定制升级”路线。
目标不是继续凭感觉设计新页面，而是先让 Web-Next 与现有桌面端产品骨架统一，再基于 React / Next.js / Tailwind / shadcn/ui 做浏览器端升级。

## 复刻来源

### 主页面

- `src/renderer/src/ui/views/HomeView.vue`
- `src/renderer/src/ui/views/CloneTaskListView.vue`
- `src/renderer/src/ui/views/CloneView.vue`

### 关键依赖组件

- `src/renderer/src/ui/components/UiWorkspaceSidebar.vue`
- `src/renderer/src/ui/components/clone/CloneStageHeader.vue`
- `src/renderer/src/ui/components/clone/CloneConsoleSidebar.vue`

## Web-Next 页面映射

### 首页

- Web 对应：`apps/web-next/app/page.tsx`
- 结构来源：`HomeView.vue`
- 当前承接模块：
  - Hero 主区
  - 最近任务
  - 推荐模板
  - 快速创建
  - AI 助手
  - 流程可视化
  - 焦点任务摘要

### 复刻任务列表

- Web 对应：`apps/web-next/app/clone/page.tsx`
- 结构来源：`CloneTaskListView.vue`
- 当前承接模块：
  - 页面标题区
  - 任务统计条
  - 搜索与筛选
  - 任务列表
  - 任务说明侧栏
  - 创建任务行为

### 单任务工作台

- Web 对应：`apps/web-next/app/clone/[projectId]/page.tsx`
- 结构来源：`CloneView.vue`
- 当前承接模块：
  - 顶部任务头
  - 顶部步骤导航
  - 五阶段主工作区
  - 右侧运行状态与日志

## 高保真范围

本轮高保真对齐的是：

- 页面职责
- 模块顺序
- 信息分区
- 主要交互路径
- 工作台的“主区 + 侧栏”关系

本轮不做视觉一比一还原：

- 不照搬桌面端历史粗糙样式
- 不复制 Vue 组件实现
- 不把 `window.api.*` 直接搬到 Web

## Web 定制升级范围

在结构复刻基础上，当前已做的 Web 升级包括：

- 统一的深色工作台壳层
- 浏览器端更自然的间距与响应式布局
- 统一按钮、状态标签和卡片表面层
- 统一中文文案口径
- 统一运行日志与阶段动作表达

## 当前实现边界

- `services/api` 协议未改动
- `apps/web-next` 继续使用现有 API client 和 hooks
- 若桌面端依赖 `window.api.*` 而 Web 后端无等价接口，本轮只保留结构，不虚构完整行为

## 2026-05-09 第二轮结构对齐补充

本轮继续按桌面端主工作台做高保真迁移，重点不是新增功能，而是把 Web-Next 的页面骨架和桌面端重新拉齐：

- `apps/web-next/components/app/app-shell.tsx`
  - 清理导航与壳层中文乱码
  - 左侧导航改回更接近桌面端的轻量工作台结构
  - 顶部搜索、状态和账户区文案统一为简体中文
- `apps/web-next/app/globals.css`
  - 收紧左侧导航高度、圆角、hover 和 active 层级
  - 新增 `workspace-sidebar__project-rail` 与 `workspace-rail__*`
  - 用于承接桌面端式“当前项目 / 最近任务”工作对象区
- `apps/web-next/app/page.tsx`
  - 首页接入左侧“最近任务 rail”
  - Hero 文案改为产品主工作台表达，不再像独立营销页
  - 首页继续承担“总览 + 快速创建 + 最近任务”的桌面端职责
- `apps/web-next/app/clone/page.tsx`
  - 任务列表页接入左侧任务 rail
  - 页面定位收回到“复刻任务管理页”，而不是新的 Agent 首页
- `apps/web-next/app/clone/[projectId]/page.tsx`
  - 单任务页接入左侧当前项目 rail
  - 强化“当前项目 / 当前阶段 / 产出进度”的桌面端式工作对象语义

这轮的目标是先让用户一眼认出“这是当前桌面端软件的 Web 版”，再继续补更细的阶段布局和视觉细节。

## 2026-05-09 第三轮阶段深修补充

本轮继续只推进 `apps/web-next`，并把重点放在单任务工作台前三个阶段，向桌面端 `CloneView.vue` 的主区结构进一步靠拢：

- `apps/web-next/app/clone/[projectId]/page.tsx`
  - 第一阶段“分析参考视频”
    - 新增顶部摘要指标条
    - 左侧为参考视频卡与分析说明卡
    - 右侧改为逐分镜时间段脚本流，不再只是普通卡片列表
  - 第二阶段“脚本变体评分”
    - 新增顶部素材与候选摘要条
    - 左侧按“商品图 / 素材绑定摘要 / 模特绑定”三块组织
    - 右侧候选脚本改为更明确的逐分镜时间段候选流
  - 第三阶段“分镜图片生成”
    - 新增阶段摘要指标条
    - 左侧固定为逐分镜脚本列
    - 右侧固定为逐分镜图片结果列，并补状态、一致性、锁定信息
- `apps/web-next/app/page.tsx`
  - 首页 Hero 标题和说明继续向桌面端主工作台语义靠拢
  - 快速创建入口的图标容器和主视觉节奏继续收紧
- `apps/web-next/app/clone/page.tsx`
  - 任务列表页继续保持桌面端任务管理区语义，与单任务工作台的深修结果统一风格

这一轮仍然不改后端协议，不引入新的业务规则，只继续修正 Web-Next 的工作台结构、节奏和视觉层级。

## 2026-05-09 第四轮比例与侧栏补充

本轮继续围绕桌面端工作台的“主区 / 右侧控制台 / 首页比例”做对齐，不新增业务逻辑：

- `apps/web-next/components/clone/clone-runtime-sidebar.tsx`
  - 右侧侧栏从普通统计卡改为更接近桌面端的运行控制台
  - 顶部强化“当前阶段 + 同步时间 + 控制动作”
  - 日志面板改为更深的控制台质感
- `apps/web-next/app/page.tsx`
  - 首页 Hero 区比例继续调整
  - 中央 AI 主视觉区域进一步放大
  - 首页主区和右侧快捷区的分配更接近桌面端首页节奏
- `apps/web-next/app/clone/page.tsx`
  - 任务列表主区宽度继续放大
  - 任务卡底部信息区改为更接近桌面端的横向信息组织

这一轮的目标不是增加页面数量，而是继续减少“Web 后台感”，把现有桌面端的工作台比例和重心往 Web 端迁移得更准确。

## 2026-05-09 第五轮任务头与步骤导航补充

本轮继续收最显眼的桌面端差距，重点放在单任务工作台顶部组合与首页、列表页主区比例：

- `apps/web-next/components/clone/clone-stage-nav.tsx`
  - 步骤导航改为更接近桌面端的“编号 + 标题 + 状态提示”结构
  - 不再只是圆点加标题，而是更接近桌面端 rail 的信息量
- `apps/web-next/app/globals.css`
  - 为步骤导航补齐副文案、激活态面板和完成态面板样式
- `apps/web-next/app/clone/[projectId]/page.tsx`
  - 顶部任务头改为“状态条 + 项目卡 + 指标条 + 步骤导航”的桌面端工作台组合
  - 单任务页右侧宽度继续调整，减少与桌面端的版式偏差
- `apps/web-next/app/page.tsx`
  - 首页 Hero 主区与可视化主视觉的比例继续拉大
- `apps/web-next/app/clone/page.tsx`
  - 列表页主区继续加宽
  - 任务卡顶部与底部指标区进一步接近桌面端任务管理区

这一轮仍然只做 `apps/web-next`，不改变接口和业务规则，目标是继续把 Web-Next 调整到“用户一眼能认出就是当前桌面端软件”的程度。

## 后续建议顺序

1. 继续对齐桌面端剩余细节组件命名与拆分。
2. 补齐 `/clone/[projectId]` 的更细粒度阶段卡片与素材摘要组件。
3. 继续清理登录页与剩余共享组件的历史乱码。
4. 在结构稳定后再做更细的视觉精修，而不是提前大改布局方向。

## 验证

本轮已执行：

- `npm run typecheck:web-next`
- `npm run build:web-next`

结果：通过。
