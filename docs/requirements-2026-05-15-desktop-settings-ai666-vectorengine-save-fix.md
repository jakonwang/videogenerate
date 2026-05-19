# 2026-05-15 桌面设置 AI666 / VectorEngine 保存修复

## 目标

- 修复桌面端设置页中 `AI666` 与 `VectorEngine` 无法分别保存的问题。
- 修复两者在能力下拉框中互相覆盖、刷新后回显错误的问题。

## 问题原因

- `src/renderer/src/ui/views/SettingsView.vue` 的能力配置下拉框中：
  - `AI666`
  - `VectorEngine`
- 这两个选项都共用了同一个 `value="apifox_hub"`。
- 页面再通过 `option @click` 临时修改 `apifoxHubProfile` 来区分两者。
- 在桌面端原生 `select` 场景下，这种写法不稳定，容易出现：
  - 选中后 profile 没有正确同步
  - 保存时只落到当前激活 profile
  - 刷新后两个平台显示成同一个入口，造成“互相冲突、都没保存”的现象

## 本轮修改

- 文件：`src/renderer/src/ui/views/SettingsView.vue`
  - 新增能力平台的显式映射：
    - `kling`
    - `grsai`
    - `ai666`
    - `vectorengine`
  - 通过计算属性统一完成：
    - 下拉显示值
    - `provider` 与 `apifoxHubProfile` 的双向映射
  - 去掉依赖 `option @click` 区分 `AI666 / VectorEngine` 的做法。
  - 设置页摘要卡与右侧“当前生效摘要”改为按当前 `apifoxHubProfile` 正确显示 `AI666` 或 `VectorEngine`。

## 使用说明

1. 打开桌面端设置页。
2. 在“开放平台凭证”中分别填写：
   - `AI666` 的 `API Key / Base URL`
   - `VectorEngine` 的 `API Key / Base URL`
3. 在“能力模型”中分别选择视频、图片、对话使用哪个平台。
4. 点击“保存配置”。
5. 再次刷新设置页后，应保持刚才选择的平台和各自凭证，不再互相覆盖。

## 验收标准

- `AI666` 与 `VectorEngine` 的 `API Key / Base URL` 可分别保存。
- 视频、图片、对话下拉框选择 `AI666` 或 `VectorEngine` 后，刷新回显正确。
- 摘要区显示的平台名称与当前 profile 一致。
- 不引入 Windows 专属路径逻辑，保持 Linux 部署兼容。

## 验证

- `npm run typecheck`
