# 2026-05-06 设计联调模式

## 目标

在当前 `electron-vite + Vue 3` 架构中新增一个仅开发环境可见的“设计联调模式”，用于支撑高频 UI 精修，尤其是 `/clone` 爆款分析界面。

核心目标：

1. 改代码后继续沿用现有 HMR 自动刷新
2. 软件内可以直接 hover / 点击页面区域
3. 可以显示这个区域对应的组件、文件和关键类名
4. 可以明确指出优先应该改哪里
5. 先覆盖 `/clone` 分析页和主布局顶部工作栏

## 本次实现范围

### 已实现

- 新增开发环境开关：`设计联调`
- 新增前端 store：`designInspector`
- 新增只读映射表：`design-inspector-map.ts`
- 新增悬浮标注层：`DesignInspectorOverlay.vue`
- 新增 `复制给 Codex` 按钮，可基于当前选区自动生成修改指令并复制到剪贴板
- 为以下区域增加稳定锚点：
  - `main-topbar`
  - `clone-analyze-topbar`
  - `clone-analyze-left-video`
  - `clone-analyze-video-info`
  - `clone-analyze-structure`
  - `clone-analyze-script-preview`
  - `clone-analyze-score`
  - `clone-analyze-project-info`
  - `clone-analyze-queue`
  - `clone-analyze-engine`

### 暂不实现

- 软件内直接编辑源码
- 自动反推出每一个像素对应的 CSS 行号
- 自动写回“修改建议”
- 生产环境开放此能力

## 交互规则

### 开启后

- 鼠标移动到带 `data-design-id` 的区域时显示 hover 高亮
- 点击后锁定区域
- 右侧弹出实现信息面板
- 面板显示：
  - 区域名
  - designId
  - 对应组件
  - 对应文件
  - 关键类名
  - 说明
  - 建议修改点
  - 关注 token
  - 可直接复制给 Codex 的修改指令

### 关闭后

- 关闭所有高亮
- 清空当前选区
- 恢复普通用户界面

## 实现文件

- `src/renderer/src/stores/designInspector.ts`
- `src/renderer/src/ui/design-inspector/design-inspector-map.ts`
- `src/renderer/src/ui/components/DesignInspectorOverlay.vue`
- `src/renderer/src/ui/MainLayout.vue`
- `src/renderer/src/ui/views/CloneView.vue`
- `src/renderer/src/ui/App.vue`

## 设计原则

- 不改后端
- 不引入 IPC
- 不破坏现有 `/clone` 工作流
- 不影响生产构建默认行为
- 映射信息优先手工维护，保证稳定性

## 使用说明

1. 在开发环境运行 `npm run dev`
2. 打开软件顶部的 `设计联调` 按钮
3. 进入 `/clone`
4. 把鼠标移到高亮区域查看名称
5. 点击区域，在右侧面板查看实现位置
6. 根据提示修改对应组件与样式
7. 保存后继续通过 HMR 直接看结果

## 验收

- 开发环境可以看到入口
- `/clone` 分析页关键块可以被 hover 和选中
- 右侧面板能显示正确的文件和类名
- 关闭后不干扰正常交互
- `npm run typecheck` 通过
