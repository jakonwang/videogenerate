# 2026-05-01 模特库恢复修复（/models 显示 0 条）

## 问题
- 现象：`/models` 页面显示“共 0 个模特”，但历史复刻项目中已有 `selectedModelIdentitySnapshot / modelIdentityPacks`。
- 根因：`clone repo` 迁移逻辑只在“项目没有 `selectedModelIdentityId`”时才把旧数据迁移到 `modelIdentityLibrary`。  
  当项目已存在 `selectedModelIdentityId`，但全局 `modelIdentityLibrary` 为空时，未执行补库。

## 修复
- 文件：`src/main/modules/clone/repo.ts`
- 位置：`readDb()` 的项目迁移分支
- 改动：
  - 当 `selectedModelIdentityId` 存在但全局库找不到对应项时，自动从以下来源恢复：
    1. `selectedModelIdentitySnapshot`
    2. `modelIdentityPacks` 中同 ID 项
    3. `modelIdentityPacks[0]`
  - 生成标准化 `ModelIdentityLibraryItem` 写回 `modelIdentityLibrary`。
  - 同步刷新 `selectedModelIdentitySnapshot`，并持久化回 `clone-projects.json`。

## 兼容性
- Windows 开发环境已验证构建通过。
- Linux 不涉及硬编码路径，继续通用。
- 对旧数据兼容：仅做“缺失补全”，不破坏已有库数据。

## 使用说明
1. 更新代码后重启应用。
2. 进入“模特”页，会触发 `readDb()` 自动迁移与写回。
3. 若仍为空，先切换一次筛选到“全部”并刷新；若还为空再反馈日志。

## 验证
- 命令：`npm run build`
- 结果：通过（main / preload / renderer 全部构建成功）。
