# 2026-05-16 CloneView 渲染稳定化

## 目标

- 在已有局部刷新基础上，继续减少 `CloneView` 模板层的连带重算与列表重绘。
- 提升自动运行视频生成期间的页面稳定性。

## 问题定位

- `CloneView.vue` 模板内存在大量高频 `find()` 查询：
  - 从 `shotVideoOutputs` 反查索引
  - 从 `storyboardFrames` 反查某个镜头图片
  - 从 `blueprintShots` 反查锁定状态
  - 从 `scriptVariants` 反查当前脚本分镜列表
- 在轮询更新时，这些模板表达式会被反复触发，增加主页面重算成本。

## 本轮最小改动

- 修改文件：
  - `src/renderer/src/ui/views/CloneView.vue`
- 新增稳定映射缓存：
  - `shotVideoOutputIndexMap`
  - `blueprintShotMap`
  - `selectedVariantShotScripts`
  - `selectedShotFrame`
- 模板改造：
  - 用映射缓存替换模板内重复 `find()`
  - 视频列表、分镜图片列表、成片检查列表增加 `v-memo`
  - 让高频卡片按关键字段变化时才重新渲染

## 结果

- 自动运行时，主页面不再因为模板层反复查找而放大刷新范围。
- 分镜图片区、分镜视频列表、成片检查列表更接近单项更新。
- 不改业务流程，不改接口结构。

## 使用说明

1. 打开 `clone` 项目详情页。
2. 启动自动运行或视频生成。
3. 观察镜头列表、右侧预览、成片检查区域，应更平滑，非变更项更少跳动。

## 验证

- Windows 开发环境执行：
  - `npm run typecheck`
