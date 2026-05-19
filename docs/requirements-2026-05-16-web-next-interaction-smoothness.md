# 2026-05-16 Web-Next 页面交互流畅度优化

## 目标

- 修复 `apps/web-next` 页面点击后明显卡顿、跳转发闷的问题。
- 优先优化主流程页面进入体验，不改后端协议，不做大范围重构。

## 问题定位

- `SessionBootstrap` 在已有本地登录 token 时，仍要等待 `getProfile()` 完成后才把登录态标记为 `ready`。
- 这会导致 `/workspace`、`/clone`、`/clone/[projectId]` 进入时先显示恢复态，再继续渲染页面，用户点击后感知为“卡一下再进入”。
- 公共壳层里的部分入口仍直接同步调用 `router.push(...)`，在重客户端页面场景下更容易放大点击迟滞感。

## 本轮最小改动

- 修改文件：
  - `apps/web-next/store/session-store.ts`
  - `apps/web-next/components/app/session-bootstrap.tsx`
  - `apps/web-next/components/app/app-shell.tsx`
  - `apps/web-next/components/marketing/workspace-entry-button.tsx`
- 调整内容：
  - 为 session store 增加 `hydrateToken(token)`，在本地 token 已存在时先恢复 token 并立即标记 `ready`。
  - `SessionBootstrap` 改为：
    - 无 token 时直接清空会话
    - 有 token 时先本地恢复登录态
    - 后台异步补拉 `getProfile()`，成功后补全用户、订阅和钱包信息
    - 若 token 已失效，再清空 token 并回到未登录态
  - 公共壳层账户入口与营销页工作台入口，改为用 `startTransition(() => router.push(...))` 发起导航，减少点击阻塞感。

## 结果

- 已登录用户进入主工作台页面时，不再被资料拉取强阻塞。
- 页面点击后的首个视觉反馈更早，主流程页面跳转体感更顺。
- 保持前后端分离，不引入新依赖，不修改业务接口。

## 使用说明

1. Windows 本地运行 `web-next`。
2. 保持浏览器已有有效登录 token。
3. 依次点击：
   - 公开页进入工作台
   - 左侧导航
   - 账户入口
4. 预期结果：
   - 页面不再先长时间停在恢复态
   - 点击后跳转反馈更直接
   - token 失效时仍会正常回到登录页

## 验证

- Windows 开发环境命令：
  - `npm run typecheck:web-next`
- 手动验证重点：
  - 已登录进入 `/workspace` 不再有明显“白等一下”
  - `/clone` 与 `/clone/[projectId]` 首次进入更快可交互
  - 点击账户入口、工作台入口时体感比此前更顺
