# 2026-05-15 桌面端能力模型 AI666 / VectorEngine 联动修复

## 目标

- 修复桌面端设置页中“能力模型”区域：
  - 视频切到 `AI666` 时，图片/对话也一起变成 `AI666`
  - 图片切到 `VectorEngine` 时，视频/对话也一起变成 `VectorEngine`
- 保证视频、图片、对话三个能力可分别保存各自的开放平台 profile。

## 问题原因

- 原实现只有一个全局字段：`apifoxHubProfile`
- 当某个能力的 provider 为 `apifox_hub` 时，界面显示和后端执行都依赖这一个全局 profile
- 因此只要修改其中一个能力的 `AI666 / VectorEngine`，其他同样使用 `apifox_hub` 的能力也会一起受影响

## 本轮修改

- 前端 `SettingsView.vue`
  - 新增独立字段：
    - `videoApifoxHubProfile`
    - `imageApifoxHubProfile`
    - `chatApifoxHubProfile`
  - 视频、图片、对话下拉框改为分别读写各自 profile
  - 对应模型输入框也改为按各自能力读取 `ai666Hub` 或 `vectorEngineHub`
- 后端 `clone` 配置结构
  - `ModelCredentials` 新增三项独立 profile 字段
  - `repo.ts` 在读取历史配置时做兼容：
    - 若新字段不存在，回退到旧的 `apifoxHubProfile`
- 后端能力凭证解析
  - 新增 `src/main/modules/clone/apifoxProfile.ts`
  - 用于按能力解析当前应使用的：
    - `AI666`
    - `VectorEngine`
    - 以及对应的 hub 凭证
- 执行链路
  - 图片与对话能力已切到按各自 profile 解析凭证
  - 视频/图片/脚本摘要显示已按各自 profile 独立显示

## 使用说明

1. 打开桌面端设置页。
2. 进入“能力模型”。
3. 可以分别设置：
   - 视频平台
   - 图片平台
   - 对话平台
4. 保存后刷新，三个能力应保持各自选择，不再联动覆盖。

## 验证

- `npm run typecheck`
- Electron 桌面端自动化实测：
  - 视频设为 `AI666`
  - 图片设为 `VectorEngine`
  - 保存后重新读取，结果保持独立
## 2026-05-15 收尾补充

- 后端残留的全局 `apifoxHub` 直读点已补齐切换为按能力解析：
  - `unifiedVideo.ts`
  - `gptImage.ts`
  - `providers.ts`
  - `service.ts`
- 当前统一通过以下 helper 决定视频 / 图片 / 对话各自应使用的开放平台配置：
  - `resolveApifoxHubProfile(credentials, capability)`
  - `resolveApifoxHubCredentials(credentials, capability)`
- 已追加验证：
  - `npm run build`
  - Electron 自动化场景 1：
    - `videoApifoxHubProfile = ai666`
    - `imageApifoxHubProfile = vectorengine`
    - `chatApifoxHubProfile = ai666`
    - 保存后应用内读回保持独立
  - Electron 自动化场景 2：
    - `videoApifoxHubProfile = vectorengine`
    - `imageApifoxHubProfile = ai666`
    - `chatApifoxHubProfile = vectorengine`
    - 保存后应用内读回保持独立
- 配置保存说明：
  - 实际文件路径：`C:\Users\Administrator\AppData\Roaming\VideoGenerate\.videogenerate\db\clone-settings.json`
  - 该文件采用 `encryptedCredentials` 加密存储
  - 判断“是否真正保存成功”应以应用重新读取后的结果为准，而不是直接看明文字段
