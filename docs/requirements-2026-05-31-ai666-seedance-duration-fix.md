# ai666 Seedance 视频时长参数修复

## 需求

- 修复 `/clone` 分镜视频强制重新生成时，`ai666 + seedance2` 链路向不支持的 Seedance 模型发送固定 `duration=10`，导致平台返回 `InvalidParameter` 的问题。

## 变更文件

- `src/main/modules/clone/unifiedVideo.ts`
- `src/main/modules/clone/service.ts`
- `docs/requirements.md`

## 实现说明

- ai666 `seedance2` 专用提交分支不再固定写死 `metadata.duration=10`。
- 改为按镜头时长走安全钳制：
  - 最小 `4`
  - 最大 `15`
  - 默认 `5`
- 请求预览同步切换到 ai666 Seedance 的 `metadata` 结构，避免“预览体”和“真实提交体”不一致。

## 使用说明

- 强制重新生成分镜视频时，系统会按当前镜头时长生成更安全的 Seedance duration。
- 若某个具体模型仍然只支持更少档位，需要再根据该模型白名单继续细化。

## Windows / Linux 兼容说明

- 本轮仅修改 TypeScript 主进程和前端预览请求体组装逻辑，不依赖平台专属能力。
- Windows 开发测试与 Linux 部署环境通用。

## 验证

- `npm run typecheck`
