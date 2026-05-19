# 2026-05-12 桌面端 `/clone` 主流程测试记录

## 背景

- 当前实际使用与上线优先级以桌面端 Electron + Vue 为主。
- 本轮目标不是扩展新功能，而是先确认桌面端 `/clone` 主流程是否具备基础可用性，并补齐阻断测试的编译问题。

## 本轮范围

- 代码修复范围：
  - `src/main/modules/web-platform/service.ts`
- 测试关注范围：
  - 桌面端复刻任务的基础数据链路
  - `/clone` 列表页依赖的任务创建、查询、删除能力

## 已完成修复

- 修复 `updateCloneProjectStage()` 的参数类型定义：
  - 从直接使用 `CloneProject['workflowV2']['currentStep']`
  - 调整为 `NonNullable<CloneProject['workflowV2']>['currentStep']`
- 目的：
  - 避免 `workflowV2` 可空导致的 TypeScript 报错
  - 恢复全项目 `npm run typecheck` 通过

## 测试方式

### 1. 静态校验

- 命令：
  - `npm run typecheck`
- 结果：
  - 已通过

### 2. 主流程基础服务测试

- 在本地通过脚本直接调用 `cloneService`，验证以下闭环：
  - 创建草稿任务 `createDraftProject`
  - 读取任务列表 `listProjectSummaries`
  - 读取任务详情 `getProject`
  - 删除任务 `removeProject`

## 测试结果

- 已验证通过：
  - 创建新草稿任务后可返回有效 `projectId`
  - 新建任务可在任务摘要列表中查到
  - 任务详情可正常读取，状态为 `draft`
  - 删除任务后，列表中不再存在该任务

## 当前结论

- 桌面端 `/clone` 的基础任务数据链路当前可用。
- 当前最小可确认的是：
  - 列表页依赖的“新建 / 列表 / 打开 / 删除”这条基础路径没有发现服务层失效
- 这说明后续如果页面上出现异常，优先排查方向应放在：
  - 渲染层交互状态
  - 页面文案与错误反馈
  - 本地媒体文件选择
  - 模型供应商配置与额度

## 五阶段实测补充

### 本轮补充验证范围

- 在桌面端复刻主链路上继续验证以下五阶段：
  1. 参考视频分析
  2. 脚本候选生成
  3. 分镜图生成
  4. 分镜视频生成
  5. 最终成片合成

### 本轮新增修复点

- 修复 `generateConsistencyAssets()` 后商品图引用未稳定保留到 shot 层，导致脚本阶段仍提示“请先上传商品图”
- 补齐本地测试 fallback：
  - `src/main/modules/clone/gptImage.ts`
  - `src/main/modules/clone/providers.ts`
  - `src/main/modules/clone/service.ts`
- 具体能力：
  - 无可用图片模型 Key 时，允许基于本地商品图生成 mock 模特图
  - 无可用图片模型 Key 时，允许基于本地参考图生成 mock 首尾帧
  - 无可用视频模型 Key 时，允许基于首尾帧生成 mock 分镜视频
  - 本地测试模式下，最终成片预检允许 mock 分镜进入合成
  - 清理图片任务误被当作视频任务轮询的问题
  - 修复成片成功后 `finalCompose.error` 残留不清空的问题

### 本轮实测结果

- 使用本地现有参考视频、商品图和自动生成的 mock 模特图，已跑通桌面端 `/clone` 五阶段
- 实测结果：
  - 分析：通过
  - 脚本：通过
  - 分镜图：通过
  - 分镜视频：通过
  - 成片合成：通过

### 实测项目与输出

- 验证项目 ID：
  - `b79f1d94-1ada-43e6-8136-3a42c7b3a411`
- 最终输出文件：
  - `D:\\phpstudy_pro\\WWW\\videogenerate\\.videogenerate\\viral-clone\\b79f1d94-1ada-43e6-8136-3a42c7b3a411\\outputs\\viral_clone_001.mp4`

### 边界说明

- 本轮通过的是桌面端 Windows 本地联调链路
- 当前 mock fallback 仅用于：
  - 本地回归测试
  - UI 联调
  - 桌面端主流程可用性验证
- 不作为正式生产云端出片质量标准

## 尚未在本轮自动化完成的部分

- 未在本轮脚本中跑完整五阶段：
  1. 参考视频分析
  2. 脚本生成
  3. 分镜设计
  4. 分镜视频
  5. 成片合成
- 原因：
  - 这些阶段依赖真实参考视频输入
  - 依赖模型供应商配置
  - 依赖外部生成服务和额度状态

## 建议的后续验证顺序

1. Windows 本地执行 `npm run dev`
2. 在桌面端 `/clone` 页面创建新任务
3. 上传一份可用参考视频
4. 在设置中心确认图片 / 视频 / 对话模型凭证可用
5. 依次验证五阶段按钮是否都有明确反馈：
   - 成功态
   - 处理中
   - 失败态
6. 优先记录以下失败信息：
   - 参考视频是否成功绑定
   - 商品图是否成功绑定
   - 模特是否成功绑定
   - 分镜图生成是否返回明确 provider / model / error
   - 分镜视频和最终成片是否返回明确错误上下文

## 使用说明

- Windows 本地开发测试命令：
  - `npm run typecheck`
  - `npm run dev`
- Linux 发布环境说明：
  - 本轮未引入 Windows 专属业务路径逻辑
  - 当前测试结论不会破坏 Linux 部署兼容性

## 桌面端 UI 冒烟补充

- 本轮继续围绕桌面端 Electron + Vue 的 `/clone` 列表页与详情页做页面级冒烟，不扩散到 Web-Next。
- 已确认：
  - Electron 开发进程可正常启动
  - `/clone` 路由挂载到 `src/renderer/src/ui/views/CloneTaskListView.vue`
  - `/clone/:projectId` 路由挂载到 `src/renderer/src/ui/views/CloneView.vue`
  - 现有成功项目 `b79f1d94-1ada-43e6-8136-3a42c7b3a411` 的列表摘要与详情数据均能被页面直接消费
- 页面级发现并修复：
  - `src/renderer/src/ui/views/CloneTaskListView.vue` 中存在一批中文乱码文案，影响桌面端 `/clone` 列表页首屏可用性
  - 已在不改结构、不改 IPC 协议的前提下恢复列表页核心中文文案，包括：
    - 页面标题
    - 状态筛选标签
    - 阶段标签
    - 卡片元信息
    - 空状态提示
    - 右侧辅助说明
- 验收重点：
  - Windows 本地进入桌面端 `/clone` 时，列表页不再出现乱码中文
  - 现有任务卡能正常展示状态、阶段、更新时间和错误信息
  - 成功项目可继续点击进入 `/clone/:projectId` 查看五阶段详情与最终成片入口

## 真实模型补充修复

- 本轮继续针对桌面端真实模型链路做阻塞修复，范围只收敛在“模特身份包生成”相关的图片供应商调用。
- 触发背景：
  - 用户在真实模型测试中，模特生成报错：
    - `grsai 图片服务连接超时，请检查网络、代理或图片供应商配置后重试。`
- 本轮修复：
  - `src/main/modules/clone/gptImage.ts`
  - 为模特图与分镜图共用的图片生成入口增加“真实供应商自动降级”能力
  - 当首选图片供应商出现可重试的网络型失败时，会继续尝试其它已配置真实图片供应商
  - 不会在真实链路测试中偷偷回退到 mock
- 当前目标：
  - 降低单一图片供应商超时导致整个真实测试链路被卡死的概率
  - 保持现有前后端契约与页面调用方式不变
