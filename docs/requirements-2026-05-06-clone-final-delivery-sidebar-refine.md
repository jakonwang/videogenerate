# 2026-05-06 `/clone` 最终成片交付侧栏精修

## 背景

第 5 阶段虽然已经缩小了成片播放器，但右侧信息仍偏散，整体还不够像“最终交付工作台”。

## 修改范围

- `D:\phpstudy_pro\WWW\videogenerate\src\renderer\src\ui\views\CloneView.vue`

## 本次调整

1. 左侧成片区增加预览头：
   - 当前输出预览
   - 输出状态标签
2. 右侧信息改为交付摘要结构：
   - 交付状态主卡
   - 当前阶段 / 片段数量双摘要卡
   - 输出文件摘要卡
3. 保留错误与调用上下文，但收口到摘要区下方，避免主信息层级混乱

## 验证

- `npm run typecheck`
- `npm run build`
