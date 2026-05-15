# 2026-05-15 桌面端脚本候选商品图判定修复

## 目标

- 修复桌面端复刻工作台中，商品图已上传成功且页面已显示缩略图，但点击“生成候选脚本”仍报错“请先上传商品图”的问题。

## 复现条件

1. 进入桌面端复刻任务详情页。
2. 已完成参考视频分析。
3. 已上传并绑定商品图，页面显示商品图数量和缩略图。
4. 点击“生成候选脚本”。
5. 主进程报错：
   - `Error invoking remote method 'clone:generateScriptVariants': Error: 请先上传商品图。`

## 原因

- 前端工作台判断商品图是否存在时，优先读取项目级已保存商品图：
  - `baseBlueprint.consistencyAssets.productReferenceImages`
- 但桌面端主进程 `generateScriptVariantsForProject(...)` 之前只检查：
  - `projectBlueprintShots(project)[*].productReferenceImagePaths`
- 当商品图已经保存在项目级一致性资产里，但脚本生成时读取口径仍只看分镜字段，就会出现：
  - 页面显示“已上传商品图”
  - 主进程却误判“未上传商品图”

## 本轮最小改动

- 在 `src/main/modules/clone/service.ts` 新增统一商品图收集逻辑：
  - 优先读取项目级 `consistencyAssets.productReferenceImages`
  - 同时兼容 `blueprint` / `baseBlueprint`
  - 最后回退到各分镜 `shot.productReferenceImagePaths`
- 将以下链路改为复用统一口径：
  - `generateScriptVariantsForProject(...)`
  - 自动主链路里生成脚本前的商品图门禁检查

## 结果

- 只要商品图已成功绑定到当前项目，桌面端“生成候选脚本”就不会再因为读取口径不一致而错误拦截。
- 前端显示状态与主进程校验状态保持一致。

## 使用说明

1. 在桌面端复刻任务中上传商品图。
2. 确认页面已显示商品图数量或缩略图。
3. 直接点击“生成候选脚本”。
4. 若商品图已绑定到项目，系统应继续生成脚本候选，而不是提示“请先上传商品图”。

## 验证

- `npm run typecheck`
- 桌面端手动验证：
  - 上传商品图后直接生成候选脚本
  - 已有历史项目且商品图来自项目级保存数据时，重新进入页面后仍可直接生成候选脚本
