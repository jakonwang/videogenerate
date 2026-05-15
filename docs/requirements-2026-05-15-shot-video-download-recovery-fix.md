# 2026-05-15 分镜视频下载恢复入口修复

## 目标

- 修复分镜视频在云端已经生成成功，但本地下载失败后，界面无法再次“继续查询/重新获取”的问题。

## 问题表现

- 分镜视频卡片显示类似：
  - `下载中`
  - `succeeded`
- 但本地没有可用 `videoPath`
- 此时界面没有“继续查询”入口，用户只能看到“预览 / 重新生成”
- 实际需求是：
  - 优先继续拉取原远端任务结果
  - 避免直接重新生成导致重复扣费或重复出任务

## 原因

- 前端“继续查询”按钮此前只在以下状态显示：
  - `failed`
  - `polling_timeout`
  - `error`
- 对于这类“远端成功但本地下载未落地”的中间状态：
  - `downloading`
  - `remote_running`
  - `remoteStatus = succeeded` 但无 `videoPath`
- UI 没有暴露手动恢复入口。

## 本轮最小改动

- 修改文件：
  - `src/renderer/src/ui/views/CloneView.vue`
- 新增统一判断：
  - `canContinueSyncShot(item)`
- 当满足以下条件时显示“继续查询”：
  - 没有本地 `videoPath`
  - 存在 `taskId`
  - 且状态属于：
    - `failed`
    - `polling_timeout`
    - `remote_running`
    - `downloading`
  - 或 `remoteStatus === succeeded`

## 结果

- 云端视频已成功、但本地下载出问题时，用户现在可以直接点“继续查询”再次尝试拉取下载结果。
- 优先复用原任务结果，不强迫用户直接重新生成。

## 使用说明

1. 进入分镜视频列表。
2. 如果某条分镜显示：
   - `下载中`
   - 或远端状态为 `succeeded`
   - 但没有可预览视频
3. 直接点击该条目的“继续查询”。
4. 系统会再次按原 `taskId` 继续同步远端结果并尝试下载到本地。

## 验证

- `npm run typecheck`
- 手动验证：
  - 构造一个 `taskId` 仍在、但本地 `videoPath` 缺失的分镜
  - 界面应出现“继续查询”
  - 点击后可再次拉取远端下载结果
