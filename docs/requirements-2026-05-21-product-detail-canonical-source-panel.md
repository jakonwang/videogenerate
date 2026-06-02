# 2026-05-21 商品详情标准源结果展示补齐

## 目标

- 修复商品详情页在标准源生成完成后没有结果界面的问题。

## 本轮最小改动

- 仅调整 `src/renderer/src/ui/views/ProductDetailView.vue` 前端展示。
- 不修改标准源生成主进程逻辑，不修改商品数据结构。

## 修复内容

- 商品详情页新增 `Product Canonical Source` 结果区块。
- 当 `canonicalSourcePath` 存在时，页面直接展示：
  - 标准源预览图
  - 输出文件名
  - 生成时间
  - 查看标准源入口
- 当状态为 `processing` / `failed` / `idle` 时，分别显示明确占位说明。
- 若存在 `canonicalSourceDiagnostics`，页面补充显示处理记录，便于判断是回退原图、成功生成还是处理失败。

## 使用说明

- 在商品详情页点击“生成标准源”后，生成成功的结果会直接显示在页面中部的 `Product Canonical Source` 卡片里。
- 若失败，可根据处理记录和状态说明重新整理商品图后再生成。

## Windows / Linux 兼容说明

- 本轮仅调整 Vue 渲染层展示，不依赖 Windows 专属 API。
