# 2026-05-16 Web-Next 主流程页面性能收紧

## 目标

- 继续只针对 `apps/web-next` 主流程页面做最小性能优化。
- 优先改善 `/workspace`、`/clone`、`/clone/[projectId]` 的点击响应、重复请求和轮询负担。

## 本轮范围

- 页面：
  - `/workspace`
  - `/clone`
  - `/clone/[projectId]`
- 查询层：
  - React Query 默认策略
  - clone 列表查询
  - clone 详情查询

## 本轮最小改动

- 新增：
  - `apps/web-next/hooks/use-app-navigation.ts`
- 修改：
  - `apps/web-next/providers/query-provider.tsx`
  - `apps/web-next/hooks/use-clone-task-list.ts`
  - `apps/web-next/hooks/use-clone-workspace.ts`
  - `apps/web-next/app/workspace/page.tsx`
  - `apps/web-next/app/clone/page.tsx`
  - `apps/web-next/app/clone/[projectId]/page.tsx`

### 1. 导航预热与非阻塞导航

- 抽出 `useAppNavigation()`：
  - `navigate(href)`：基于 `startTransition` 的非阻塞导航
  - `prefetch(href)` / `prefetchMany(hrefs)`：统一路由预热
- `/workspace`：
  - 预热 `/clone`、`/templates`、最近任务详情页
  - 最近任务卡片和模板卡片在 hover / focus 时预热目标路由
- `/clone`：
  - 预热 `/download` 与最近若干详情页
  - 右侧最近切换任务在 hover / focus 时预热详情路由
- `/clone/[projectId]`：
  - 进入详情页后预热 `/clone` 返回路由

### 2. 查询策略收紧

- 全局 Query 默认值补充：
  - `staleTime: 30s`
  - `gcTime: 5min`
  - `refetchOnReconnect: false`
  - 继续保持 `refetchOnWindowFocus: false`
- `clone-projects`：
  - 明确设置 `staleTime: 30s`
  - 明确设置 `gcTime: 5min`
- `clone-models`：
  - 长缓存，减少进入详情页时的重复拉取
- `clone-project` / `clone-runtime`：
  - 保持轮询，但增加：
    - `staleTime: 5s`
    - `refetchIntervalInBackground: false`
    - `refetchOnWindowFocus: false`
  - 避免标签页切到后台时继续高频无效轮询

## 结果

- 主流程页面之间的二次进入和悬停后点击，路由切换体感更顺。
- `/clone` 与 `/clone/[projectId]` 不再因默认查询过于激进而产生更多无意义请求。
- 详情页轮询仍保留实时性，但对后台标签页更克制。

## 使用说明

1. 先登录并进入 `web-next` 主工作台。
2. 手动验证：
   - 从 `/workspace` 进入 `/clone`
   - 从 `/clone` 进入多个任务详情页
   - 在任务卡、最近切换卡和模板卡上先悬停再点击
3. 观察预期：
   - 点击后的页面进入更直接
   - 切回标签页时不会因额外重取而出现明显卡顿
   - 详情页仍保持正常轮询刷新

## 验证

- Windows 开发环境命令：
  - `npm run typecheck:web-next`
