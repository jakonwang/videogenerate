# 2026-05-12 Web-Next 详情页乱码与壳层滚动修复

## 背景

- `apps/web-next/app/clone/[projectId]/page.tsx` 存在源码级中文乱码，导致脚本生成、分镜图片、分镜视频、成片输出等阶段在页面中出现异常文案。
- 多个 `web-next` 页面虽然已经消除了横向滚动条，但外层文档仍然随内容继续增高，导致页面底部出现全局纵向滚动条，不符合固定侧栏、固定顶部栏的工作台设计。

## 目标

- 修复 `clone/[projectId]` 页面阶段组件中的乱码文案。
- 保持现有前后端协议和 React Query 工作流不变，只重构前端展示层。
- 收口全局壳层滚动行为：
  - 文档层固定在视口内
  - 页面主体区内部滚动
  - 保持桌面端工作台式固定侧栏和顶部栏

## 实现说明

- 修改文件：
  - `apps/web-next/app/clone/[projectId]/page.tsx`
  - `apps/web-next/lib/utils.ts`
  - `apps/web-next/app/globals.css`
- 详情页修复内容：
  - 重建 `clone/[projectId]` 页面展示层，保留原有阶段切换、mutation、query 和预览逻辑
  - 统一修正以下阶段文案与结构：
    - `参考分析`
    - `脚本生成`
    - `分镜图片`
    - `分镜视频`
    - `成片输出`
  - 修复公共对话框、分页条、运行侧栏、阶段标题和错误态中文
- 公共工具修复内容：
  - `formatStepLabel`
  - `formatStatusLabel`
  - 其他格式化工具维持兼容
- 壳层滚动修复内容：
  - `html`、`body` 增加固定高度语义
  - `.app-frame`、`.workspace-grid`、`.workspace-main` 固定为视口高度
  - `.workspace-content` 改为内部纵向滚动
  - 保持移动端断点下恢复自然文档流，不强制锁定高度

## 边界

- 不修改 `services/api` 协议。
- 不在前端新增后端业务规则。
- 不改变现有任务阶段业务语义，只修正视觉层、文案层和壳层滚动行为。
- Windows 本地开发、Linux 部署兼容保持不变。

## 验证

- 本地命令：
  - `npm run typecheck:web-next`
- 浏览器验收：
  - `/workspace`
  - `/clone`
  - `/models`
  - `/billing`
  - `/settings`
- 验收结果：
  - 上述页面文档层不再出现底部全局滚动条
  - 横向滚动条保持消除
  - `clone/[projectId]` 页面重建后不再出现乱码文案

## 使用说明

- 桌面端尺寸下：
  - 左侧栏固定
  - 顶部栏固定
  - 页面主体在内容区内滚动
- 若后续继续精修单页首屏密度，应优先在页面局部容器内压缩高度，不要重新放开文档级滚动。
