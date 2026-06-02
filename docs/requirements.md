# 项目需求说明（持续更新）

## 项目概览

`VideoGenerate` 是一套围绕 AI 视频生产的产品体系，当前同时包含桌面端与独立 Web 商业化前端。
当前开发与测试环境为 Windows，部署环境为 Linux。开发时必须同时满足以下约束：

- 前后端分离
- 低耦合、高内聚
- 模块化开发
- 界面风格统一
- Windows 开发与 Linux 部署兼容
- 每次重要改动后同步更新文档

## 文档维护说明

- `docs/requirements.md` 继续作为当前正式需求与当前生效规格。
- 历史迁移期遗留的乱码条目和旧结构记录只作为归档背景，不再视为当前实现规范。
- 历史轮次修复记录优先迁移到 `docs/archive/` 或独立归档文件，避免继续污染当前有效需求。

## 当前生效规格

## 2026-06-03 桌面端重新打包并封版为 v4.2.0

- 目标：
  - 将当前桌面端发布版本从 `v4.1.0` 提升并重新打包为 `v4.2.0`，用于当前代码状态的安装包封版与提交归档。
- 本轮最小改动：
  - 调整：
    - `package.json`
    - `package-lock.json`
    - `docs/requirements.md`
- 生效规则：
  - 应用主版本号统一更新为 `4.2.0`。
  - 后续 `electron-builder` 产物文件名将更新为 `VideoGenerate-4.2.0-Setup.exe`。
  - 本轮不改业务逻辑，只做版本封版、打包与版本记录同步。
- 使用说明：
  - Windows 本地执行 `npm run dist` 后，应在 `release/` 目录看到 `v4.2.0` 对应安装包、`latest.yml` 与 `.blockmap`。
- Windows / Linux 兼容说明：
  - 本轮仅调整 npm 版本元数据与文档记录；Windows 开发打包、Linux 部署发布流程保持兼容。
- 验证：
  - `node -p "require('./package.json').version"`
  - `npm run dist`

## 2026-06-02 `/clone` 强制重新生成分镜视频必须跳过云端成片缓存

- 目标：
  - 修复 `/clone` 已生成成功的分镜视频点击“重新生成”后，即使新流程走完，最终仍可能拿回上一版旧视频的问题。
- 本轮最小改动：
  - 调整：
    - `src/main/modules/clone/service.ts`
    - `test/clone-shot-video-force-regenerate-bypasses-cloud-cache.smoke.ts`
    - `docs/requirements.md`
- 生效规则：
  - `generateShotClip(...)` 在 `forceRegenerate=true` 时，必须跳过 `getCachedCloudClipResult(...)` 的云端成片缓存复用。
  - 只有普通生成路径才允许继续命中同 prompt / 同首尾帧的历史云端成片缓存。
  - 这样点击“重新生成分镜视频”时，系统会真正重新走视频生成，而不是把旧缓存视频再次当成新结果返回。
- 使用说明：
  - 现在对已成功的分镜视频执行“重新生成”后，最终回写结果应来自新的生成流程，而不是历史缓存成片。
- Windows / Linux 兼容说明：
  - 本轮仅调整 TypeScript 主进程缓存命中条件与 smoke test，不依赖平台专属能力，Windows 开发与 Linux 部署环境通用。
- 验证：
  - `npx tsx test/clone-shot-video-force-regenerate-bypasses-cloud-cache.smoke.ts`
  - `npm run typecheck`

## 2026-06-02 `/clone` 分镜视频提交提示词恢复为之前发布版本

- 目标：
  - 撤回本轮对 `/clone` 分镜视频真实提交 prompt 的硬锁结构化改写，恢复到之前发布版本正在使用的提示词结构，避免视频阶段商品一致性明显变差。
- 本轮最小改动：
  - 调整：
    - `src/main/modules/clone/prompt.ts`
    - `test/storyboard-model-identity-lock.smoke.ts`
    - `docs/requirements.md`
- 生效规则：
  - 分镜视频真实提交链路恢复为之前发布版的结构：
    - `buildOptimizedVideoPrompt(...)` 不再在最终视频正向 prompt 中插入 `[PRODUCT LOCK - HARD CONSTRAINT]` 等整段硬锁分块
    - 恢复为发布版原有的 `CORE RULE / STRICT CONSISTENCY / FRAME CONTINUITY / MOTION / LIGHTING / SHOT EXECUTION` 等组合方式
    - `buildFinalShotVideoPositivePrompt(...)` 恢复为发布版的简短结构化提示词，不再使用本轮新增的 8 段硬锁块
  - 本次回退仅作用于分镜视频真实提交 prompt，不影响分镜图提示词、提交审计日志、批量防重复提交和前端预览精简展示。
- 使用说明：
  - 现在重新提交分镜视频时，实际送模提示词将恢复到之前发布版本的策略，便于先回到已验证过的一致性表现。
- Windows / Linux 兼容说明：
  - 本轮仅调整 TypeScript prompt 组装和 smoke test，不依赖平台专属能力，Windows 开发与 Linux 部署环境通用。
- 验证：
  - `npm run test:storyboard-model-lock`
  - `npm run typecheck`

## 2026-06-02 `/clone` 分镜视频提示词预览弹窗简化为仅显示实际发送参数

- 目标：
  - 简化 `/clone` 分镜视频提示词预览弹窗，避免前端继续展示未实际发送的诊断层、脚本拼接层和历史兼容信息，方便直接核对真正送模的参数。
- 本轮最小改动：
  - 调整：
    - `src/renderer/src/ui/views/CloneView.vue`
    - `docs/requirements.md`
- 生效规则：
  - 分镜视频提示词预览弹窗只保留与真实发送请求直接相关的内容：
    - 请求参数概览
    - 商品参考图
    - 模特主锚点
    - `Video Request Payload (Preview)`
    - `Video Positive Prompt (Final Sent)`
    - `Video Negative Prompt (Final Sent)`
  - 不再显示以下未实际发送或仅用于诊断的内容：
    - `Script Text`
    - `Generation Prompt`
    - `Frame Prompt (Start / End)`
    - `Video Diagnostic Prompt`
    - 硬锁结构拆块预览
    - 兼容诊断层
    - `Video Request JSON`
    - `Video Request Debug Log (Preview)`
    - 脚本接入提示、商品描述高亮、商品源说明等非发送参数说明
  - “复制全部”内容同步收缩为仅复制上述实际发送参数。
- 使用说明：
  - 现在打开 `/clone` 的“分镜视频提示词预览”时，界面会更接近真实送模入参，便于快速核对每条镜头真正提交给视频模型的参数。
- Windows / Linux 兼容说明：
  - 本轮仅调整 Vue 前端展示与复制逻辑，不依赖平台专属能力，Windows 开发与 Linux 部署环境通用。
- 验证：
  - `npm run typecheck`

## 2026-06-02 `/clone` 分镜视频提示词改为硬锁产品一致性结构

- 目标：
  - 强化 `/clone` 分镜视频生成时的产品一致性，避免视频阶段把商品重建、重设计、补全隐藏结构或生成出不一致的新视角。
- 本轮最小改动：
  - 调整：
    - `src/main/modules/clone/prompt.ts`
    - `test/storyboard-model-identity-lock.smoke.ts`
    - `docs/requirements.md`
- 生效规则：
  - 分镜视频最终正向 prompt 统一切换为更硬的结构化约束，明确包含：
    - `[PRODUCT LOCK - HARD CONSTRAINT]`
    - `[SCENE]`
    - `[MOTION]`
    - `[CAMERA]`
    - `[LIGHTING]`
    - `[MATERIAL]`
    - `[STABILITY]`
    - `[STYLE]`
  - 核心规则包括：
    - 产品必须被视为固定的 2D 视觉真值源
    - 不允许重建、重设计、重新诠释产品
    - 不允许推断隐藏结构、隐藏几何关系或生成新的可见侧面
    - 只允许全局画面级轻微运动，不允许产品本体动画、形变或材质增强
    - 光照必须平、稳、漫反射，不允许动态重打光和强反光
    - 产品在所有帧中必须保持视觉一致
- 使用说明：
  - 现在 `/clone` 分镜视频生成会更严格地把商品当作参考图里的固定对象处理，而不是允许模型把它当成三维物体重新演绎。
- Windows / Linux 兼容说明：
  - 本轮仅调整 TypeScript prompt 组装与测试，不依赖平台专属能力，Windows 开发与 Linux 部署环境通用。
- 验证：
  - `npm run test:storyboard-model-lock`

## 2026-06-02 `/clone` 分镜视频创建请求增加提交审计日志

- 目标：
  - 为 `/clone` 分镜视频真正发起云端创建请求的行为补齐持久化审计记录，便于后续排查重复提交、重复扣费、缺失 taskId 和直接出片等问题。
- 本轮最小改动：
  - 调整：
    - `src/main/modules/clone/types.ts`
    - `src/main/modules/clone/repo.ts`
    - `src/main/modules/clone/service.ts`
    - `docs/requirements.md`
- 生效规则：
  - 每次真正调用云端视频创建接口前，系统必须写入一条 `request_started` 审计日志。
  - 当云端返回创建成功、直接出片、缺失 `taskId`、请求失败时，系统必须继续写入对应结果日志。
  - 审计日志需至少包含：
    - `shotId`
    - `shotIndex`
    - `trigger`
    - `provider`
    - `model`
    - `requestCapability`
    - `submissionFingerprint`
    - `firstFramePath`
    - `lastFramePath`
    - `taskId`（如有）
    - `remoteStatus`（如有）
    - `sourceEvent`
    - `status`
    - `createdAt`
  - 日志保存在项目的 `generationQueue.submissionAuditLogs` 中，并限制最大保留数量，避免无限增长。
- 使用说明：
  - 后续如果再出现“同一条分镜被重复提交多次”的情况，可直接读取项目里的 `generationQueue.submissionAuditLogs`，核对每次真实云端创建请求的时间、镜头、触发来源与 taskId。
- Windows / Linux 兼容说明：
  - 本轮仅调整 TypeScript 主进程数据结构、仓储归一化和提交链路日志写入，不依赖平台专属能力，Windows 开发与 Linux 部署环境通用。
- 验证：
  - `npm run typecheck`

## 2026-06-02 `/clone` 分镜视频批量生成增加防重复提交保护

- 目标：
  - 修复 `/clone` 分镜图部分完成后，分镜视频批量生成可能被重复触发，导致同一批镜头反复向云端提交视频任务、产生重复扣费的问题。
- 本轮最小改动：
  - 调整：
    - `src/main/modules/clone/service.ts`
    - `docs/requirements.md`
- 生效规则：
  - 同一个项目的 `generateShotVideosFromStoryboardFrames(...)` 在任一时刻只允许存在一轮批量执行中的任务。
  - 如果同项目在上一轮批量视频生成尚未结束时再次触发，系统必须直接复用当前进行中的批量任务，而不是再开启一轮新的批量提交。
  - 批量 worker 在真正调用云端视频接口前，必须先写入：
    - `submissionFingerprint`
    - `submissionStartedAt`
    - `submissionLockedUntil`
  - 后续重复触发时，只要镜头仍处于相同提交指纹和锁定窗口内，就不允许再次提交同一条分镜视频任务。
- 使用说明：
  - 现在分镜图陆续生成、自动续跑、手动点击“继续生成剩余分镜视频”等场景叠加时，系统应优先复用正在执行的那一轮批量生成，不再对同一批镜头重复发起云端创建任务。
- Windows / Linux 兼容说明：
  - 本轮仅调整 TypeScript 主进程批量视频提交流程与内存级互斥逻辑，不依赖平台专属能力，Windows 开发与 Linux 部署环境通用。
- 验证：
  - `npm run typecheck`

## 2026-06-02 `/clone` 分镜图片提示词强化产品放大与清晰展示

- 目标：
  - 修复 `/clone` 分镜图片生成时，产品在画面里不够大、不够清晰，导致后续分镜视频生成时商品结构和细节不稳定的问题。
- 本轮最小改动：
  - 调整：
    - `src/main/modules/clone/gptImage.ts`
    - `test/storyboard-model-identity-lock.smoke.ts`
    - `docs/requirements.md`
- 生效规则：
  - 分镜图片首尾帧 prompt 在现有商品锁、参考图优先级、人物身份锁基础上，进一步强化：
    - 商品需要尽量采用更紧的构图
    - 当商品细节不够清晰时，优先收紧裁切，让商品在画面中更大
    - 商品细节必须保持清晰可读，不能出现过小、过远、发软或细节糊掉
  - 对佩戴类商品镜头，继续保持“商品优先于人物”的层级，不允许为了人物脸部或身体占比而牺牲商品清晰度。
- 使用说明：
  - 现在重新生成 `/clone` 分镜图片时，系统会自动要求模型把商品拍得更近一些、更清晰一些，降低后续分镜视频阶段把商品画偏或画成不同款式的概率。
- Windows / Linux 兼容说明：
  - 本轮仅调整 TypeScript prompt 组装与测试，不依赖平台专属能力，Windows 开发与 Linux 部署环境通用。
- 验证：
  - `npm run test:storyboard-model-lock`

## 2026-06-02 桌面端重新打包并封版为 v4.1.0

- 目标：
  - 将当前桌面端发布版本从 `v4.0.1` 提升并重新打包为 `v4.1.0`，用于当前代码状态的安装包封版与提交归档。
- 本轮最小改动：
  - 调整：
    - `package.json`
    - `package-lock.json`
    - `docs/requirements.md`
- 生效规则：
  - 应用主版本号统一更新为 `4.1.0`。
  - 后续 `electron-builder` 产物文件名将更新为 `VideoGenerate-4.1.0-Setup.exe`。
  - 本轮不改业务逻辑，只做版本封版、打包与版本记录同步。
- 使用说明：
  - Windows 本地执行 `npm run dist` 后，应在 `release/` 目录看到 `v4.1.0` 对应安装包、`latest.yml` 与 `.blockmap`。
- Windows / Linux 兼容说明：
  - 本轮仅调整 npm 版本元数据与文档记录；Windows 开发打包、Linux 部署发布流程保持兼容。
- 验证：
  - `node -p "require('./package.json').version"`
  - `npm run dist`

## 2026-06-02 TikTok 商品上架助手引入临时多角度图作为商品图主参考

- 目标：
  - 修复 TikTok 商品上架助手直接基于单张原图生成 5 张商品图时，后续图片商品结构漂移、细节替换和角度脑补不稳定的问题。
- 本轮最小改动：
  - 调整：
    - `src/main/modules/tiktok-listing/service.ts`
    - `src/main/modules/tiktok-listing/types.ts`
    - `src/main/modules/tiktok-listing/repo.ts`
    - `src/renderer/src/ui/views/TiktokListingHelperView.vue`
    - `src/renderer/src/ui/components/RuntimeLogDialog.vue`
    - `test/tiktok-listing-plugin.smoke.ts`
- 生效规则：
  - TikTok 商品上架助手的图片链路拆为两阶段：
    - 先生成一张临时 product-only 深层多角度图
    - 再生成 5 张商品图
  - 该临时多角度图只保存在 TikTok 商品记录里：
    - 不写入商品库主产品表
    - 不生成 Product DNA
    - 不接入商品库状态机
  - 商品图参考顺序固定为：
    - 第 1 张：原图 + 临时多角度图
    - 第 2 到第 5 张：原图 + 临时多角度图 + 第 1 张主图
  - 重试与运行日志新增 `analysis-board` 阶段，失败时错误前缀必须为：
    - `analysis-board:`
- 使用说明：
  - 现在点击“生成素材 / 重新生成图片”时，系统会先自动产出一张临时多角度图，再继续生成 5 张商品图。
  - 编辑页结果区会显示当前临时多角度图预览，便于判断这次结构共识是否正确。
- Windows / Linux 兼容说明：
  - 本轮仅调整 TypeScript 主进程 TikTok 插件生成链路与 Vue 页面展示，不依赖平台专属能力，Windows 开发与 Linux 部署环境通用。
- 验证：
  - `npm run typecheck`
  - `npm run test:tiktok-listing-plugin`

## 2026-06-02 TikTok 商品上架助手商品图改为主图锚定整组一致性

- 目标：
  - 修复 TikTok 商品上架助手生成 5 张商品图时，第 1 张商品一致，但第 2 到第 5 张逐步偏离原商品、出现结构和细节变化的问题。
- 本轮最小改动：
  - 调整：
    - `src/main/modules/tiktok-listing/service.ts`
    - `src/main/modules/tiktok-listing/prompts.ts`
    - `test/tiktok-listing-prompts.smoke.ts`
    - `test/tiktok-listing-plugin.smoke.ts`
- 生效规则：
  - 第 1 张商品图继续只使用原始商品参考图生成，作为整组商品图的批准主图。
  - 第 2 到第 5 张商品图生成时，必须同时提交：
    - 原始商品图
    - 第 1 张已生成主图
  - prompt 中必须明确：
    - 原始商品图是最高优先级真值源
    - 第 1 张主图是整组图的已批准外观锚点
    - 后续图片不得出现结构漂移、细节替换、重设计
  - 目标是让整组 5 张图始终围绕同一个商品外观输出，而不是 5 次独立重绘。
- 使用说明：
  - 现在重新生成商品图时，理论上应先得到一张稳定主图，后续 4 张从不同构图继续沿用同一个商品外观。
  - 如果第 1 张主图本身不够准，建议先单独重新生成图片，直到第 1 张正确，再使用该组结果导出。
- Windows / Linux 兼容说明：
  - 本轮仅调整 TypeScript 主进程图片生成入参与 prompt 规则，不依赖平台专属能力，Windows 开发与 Linux 部署环境通用。
- 验证：
  - `npm run typecheck`
  - `npm run test:tiktok-listing-prompts`
  - `npm run test:tiktok-listing-plugin`

## 2026-06-02 TikTok 商品上架助手商品图输出比例改为 1:1

- 目标：
  - 将 TikTok 商品上架助手生成的商品图从竖版比例调整为 1:1 方图，满足用户当前商品图使用需求。
- 本轮最小改动：
  - 调整：
    - `src/main/modules/tiktok-listing/prompts.ts`
    - `src/main/modules/tiktok-listing/service.ts`
    - `src/main/modules/clone/gptImage.ts`
    - `test/tiktok-listing-plugin.smoke.ts`
- 生效规则：
  - TikTok 商品上架助手商品图 prompt 不再要求 `9:16`，统一改为 `Square 1:1 composition`。
  - TikTok 商品上架助手调用底层图片生成时，统一显式请求：
    - `1024x1024`
  - 该尺寸仅作用于 TikTok 商品上架助手，不影响 `/clone` 等其它图片生成链路原有比例。
- 使用说明：
  - 现在重新生成商品图时，5 张图都应按 1:1 方图输出，而不是竖版长图。
- Windows / Linux 兼容说明：
  - 本轮仅调整 TypeScript prompt 与图片生成参数，不依赖平台专属能力，Windows 开发与 Linux 部署环境通用。
- 验证：
  - `npm run typecheck`
  - `npm run test:tiktok-listing-plugin`

## 2026-06-02 TikTok 商品上架助手前端缩略图区块固定 1:1

- 目标：
  - 修复 TikTok 商品上架助手商品图已经改为 1:1 输出后，前端缩略图区块仍沿用旧竖图卡片高度，导致方图显示观感不稳定的问题。
- 本轮最小改动：
  - 调整：
    - `src/renderer/src/ui/views/TiktokListingHelperView.vue`
- 生效规则：
  - 商品结果缩略图卡片与“重新生成图片”卡片统一使用：
    - `aspect-ratio: 1 / 1`
  - 不再依赖旧的竖图 `min-height` 撑高逻辑。
  - 目标是让新生成的 1:1 商品图在页面里按真实方图展示，不被旧样式拉成长图观感。
- 使用说明：
  - 现在在 TikTok 商品上架助手结果区查看商品图时，缩略图卡片应统一为方形。
- Windows / Linux 兼容说明：
  - 本轮仅调整 Vue 页面局部样式，不依赖平台专属能力，Windows 开发与 Linux 部署环境通用。
- 验证：
  - `npm run typecheck`

## 2026-06-01 `/clone` 批量重生成分镜图结果写回改为基于最新项目快照合并

- 目标：
  - 修复 `/clone` 分镜设计页里多条分镜图片已全部提交生成，但批量并发完成后只有部分显示新图，其余镜头又回退成旧图或 `failed` 的问题。
- 本轮最小改动：
  - 调整：
    - `src/main/modules/clone/service.ts`
- 生效规则：
  - 单条分镜图片生成完成后，主进程不能再直接把当前 worker 手里的旧项目快照整包 `upsertProject(...)` 回去。
  - 现在必须先重新读取最新项目，再只合并当前镜头的最新生成结果后保存，避免并发批量时后完成的 worker 把其它镜头刚写回的新状态覆盖掉。
  - `generateAllShotFrames(...)` 在批量结束返回前，还必须基于最新 `blueprint.shots` 统一重建一次 `storyboardFrames`，保证前端拿到的是一致的最终分镜图列表状态。
- 使用说明：
  - 现在全选多条分镜批量重新生成时，不应再出现“明明都提交了，但最后只有 1 条显示新图，其他仍是旧图或 failed”的不稳定结果。
- Windows / Linux 兼容说明：
  - 本轮仅调整 TypeScript 主进程项目写回与分镜帧重建逻辑，不依赖平台专属能力，Windows 开发与 Linux 部署环境通用。
- 验证：
  - `npm run typecheck`

## 2026-06-01 `/clone` 批量重生成分镜图时连续性参考图不得引用已删除旧文件

- 目标：
  - 修复 `/clone` 分镜设计页里批量强制重生成时，第 1 条旧分镜图已先被删除，后续分镜仍把这张已删除图片当作连续性参考图传给图片接口，最终导致后续镜头直接 `failed` 的问题。
- 本轮最小改动：
  - 调整：
    - `src/main/modules/clone/service.ts`
- 生效规则：
  - `previousShotContinuityAnchor(...)` 现在返回上一条分镜连续性参考图前，必须先确认该本地文件真实存在。
  - 如果上一条候选连续性图已经在 `forceRegenerate=true` 时被清理掉，则本轮不允许继续把该失效路径传给图片模型。
  - 这样批量重生成时，后续镜头不会再因为引用已删除的上一条旧图而触发 `ENOENT` 并直接失败。
- 使用说明：
  - 现在多条分镜批量重新生成时，即使前一条旧图已先清除，后续镜头也应继续正常提交生成，而不是全部卡成 `failed`。
- Windows / Linux 兼容说明：
  - 本轮仅调整 TypeScript 主进程连续性参考图路径校验逻辑，不依赖平台专属能力，Windows 开发与 Linux 部署环境通用。
- 验证：
  - `npm run typecheck`

## 2026-06-01 `/clone` 分镜图提示词改为三参考分层优先级结构

- 目标：
  - 修复 `/clone` 分镜图生成时，同时给了商品图、模特图、分镜参考图后，模型默认把“画面/分镜”权重放得过高，导致商品被画面带偏、模特和商品一致性不稳定的问题。
- 本轮最小改动：
  - 调整：
    - `src/main/modules/clone/gptImage.ts`
- 生效规则：
  - `buildGptFramePrompt(...)` 在保持当前正式版主结构不拆掉的前提下，新增三层优先级锁定：
    - 第一优先级：商品图是唯一商品真值源，冲突时永远服从商品图
    - 第二优先级：模特图只负责人物身份，不负责姿势/构图/打光
    - 第三优先级：分镜图只负责姿势、构图、机位、动作节奏，不得改商品结构与细节
  - 同时新增：
    - `Replace only the human identity. Keep the product unchanged.`
    - `Treat the product as a fixed object placed into the scene.`
  - 目标是不靠单纯加长 prompt，而是明确三类参考图“谁说了算”。
- 使用说明：
  - 现在分镜图生成会更明确地优先锁商品，再锁模特身份，最后才用分镜图控制拍法，减少商品被场景或分镜参考图带偏。
- Windows / Linux 兼容说明：
  - 本轮仅调整 TypeScript 分镜图 prompt 组装文案，不依赖平台专属能力，Windows 开发与 Linux 部署环境通用。
- 验证：
  - `npm run typecheck`

## 2026-06-01 `/clone` 分镜图提示词进一步做减法，移除冲突与重复产品规则

- 目标：
  - 修复 `/clone` 分镜图提示词虽然已经加入三参考分层规则，但仍存在“信息过载、产品规则重复、局部冲突句残留”，导致模型对商品一致性的执行不稳定的问题。
- 本轮最小改动：
  - 调整：
    - `src/main/modules/clone/gptImage.ts`
- 生效规则：
  - 分镜图 prompt 进一步收缩为高权重短结构，核心只保留：
    - 商品图是唯一商品真值源
    - 模特图只定义人物身份
    - 分镜图只定义动作、构图、机位
    - 冲突时始终服从商品图
  - 删除会互相打架的表达，尤其：
    - `replace only the product with the user product`
    - 重复的商品锁定说明块
    - 过多重复的 preserve / replace / product must match 口径
  - 新增“商品像直接从参考图拷入场景”的简洁锚点，强化商品不可变思路，但不再堆叠多层重复规则。
- 使用说明：
  - 现在分镜图提示词更短、更集中，重点压在“商品唯一权威 + 角色分工 + 冲突裁决”，减少模型因规则过多而忽略核心商品锁定。
- Windows / Linux 兼容说明：
  - 本轮仅调整 TypeScript 分镜图 prompt 文案结构，不依赖平台专属能力，Windows 开发与 Linux 部署环境通用。
- 验证：
  - `npm run typecheck`

## 2026-06-01 `/clone` 分镜图提示词明确绑定参考图编号与实际提交顺序

- 目标：
  - 修复 `/clone` 分镜图生成时虽然实际已按顺序提交多张参考图，但 prompt 没有明确告诉模型 `Image 1 / Image 2 / Image 3` 分别代表什么，导致模型对多参考图职责理解不稳定的问题。
- 本轮最小改动：
  - 调整：
    - `src/main/modules/clone/gptImage.ts`
- 生效规则：
  - 分镜图 prompt 现在必须显式说明：
    - `Image 1`：商品参考图，只定义商品
    - `Image 2`：模特身份图，只定义人物身份
    - `Image 3`：分镜图或连续性参考图，只定义动作、构图、机位、延续关系
  - 冲突裁决也要按编号写明：
    - 若冲突，始终服从 `Image 1`
  - 该编号说明必须与当前实际提交给图片接口的 `imagePaths` 顺序保持一致，避免提示词口径与真实 URLs 顺序脱节。
- 使用说明：
  - 现在分镜图生成时，模型不仅收到多张参考图，还会被明确告知每一张图在当前顺序里的职责，减少商品、模特、分镜三类参考图互相污染。
- Windows / Linux 兼容说明：
  - 本轮仅调整 TypeScript 分镜图 prompt 文案，不依赖平台专属能力，Windows 开发与 Linux 部署环境通用。
- 验证：
  - `npm run typecheck`

## 2026-06-01 `/clone` 批量重生成分镜图只生成首帧并按真实状态即时刷新

- 目标：
  - 修复 `/clone` 分镜设计页里批量重生成分镜图时：
    - 明明只需要分镜图首帧，却额外触发更多图片生成请求
    - 某些分镜已经生成成功或失败，但页面仍长时间停留在旧状态、没有及时显示“生成中/已生成/失败”
  - 本轮只修分镜图批量重生成状态链路，不改其它页面。
- 本轮最小改动：
  - 调整：
    - `src/renderer/src/composables/useCloneProjectWorkspace.storyboard.ts`
    - `src/renderer/src/ui/views/CloneView.vue`
- 生效规则：
  - 分镜设计页批量重生成入口调用 `generateAllShotFrames(...)` 时，必须显式使用 `which: 'start'`。
  - 不再让分镜图批量重生成默认落到主进程 `both` 分支，避免一条分镜额外再跑尾帧图片生成，导致请求次数异常和状态拖长。
  - 前端分镜列表的“重新生成中”显示不再只依赖本地暂存数组，而要优先联动真实 `gptFrameStatus / frame.status`。
  - 当某条分镜真实进入：
    - `cropped`
    - `failed`
    时，前端要及时把它从本地“重生成中”队列里释放，避免已经出结果了还长时间挂着处理中状态。
- 使用说明：
  - 现在批量重生成 3 条分镜图时，请求次数应贴近 3 条首帧生成，不再出现明显额外的尾帧生成请求。
  - 某条分镜一旦真实成功或失败，页面应更快切换到对应状态，而不是要等整批全部结束后才更新。
- Windows / Linux 兼容说明：
  - 本轮仅调整 Vue 前端分镜状态联动与 TypeScript 桌面端批量入口参数，不依赖平台专属能力，Windows 开发与 Linux 部署环境通用。
- 验证：
  - `npm run typecheck`

## 2026-06-01 `/clone` 分镜设计阶段统一只生成一张首帧

- 目标：
  - 修复 `/clone` 分镜设计阶段无论单条还是批量重新生成，都还可能走到“首帧 + 尾帧”双图生成链路，导致用户看到一条分镜像是同时要生成两张图、请求次数增加、状态变慢的问题。
- 本轮最小改动：
  - 调整：
    - `src/renderer/src/lib/cloneWorkspaceClient.ts`
    - `src/renderer/src/composables/useCloneProjectWorkspace.storyboard.ts`
- 生效规则：
  - 分镜设计阶段的“单条重新生成分镜图”和“批量重新生成分镜图”统一只允许使用：
    - `which: 'start'`
  - 该阶段只生成分镜设计页需要展示的一张首帧，不再在这个阶段生成尾帧。
  - 尾帧如后续确有需要，只允许在分镜视频阶段按对应逻辑生成，不得混入分镜设计阶段。
- 使用说明：
  - 现在在分镜设计页里点击单条或批量重新生成时，应理解为“重新生成这一条分镜展示图”，也就是只生成一张首帧。
- Windows / Linux 兼容说明：
  - 本轮仅调整桌面端 TypeScript 分镜设计阶段调用参数，不依赖平台专属能力，Windows 开发与 Linux 部署环境通用。
- 验证：
  - `npm run typecheck`

## 2026-06-01 `/clone` 分镜图提示词增加禁止结构推理与刚性结构锁

- 目标：
  - 修复当前 `/clone` 分镜图提示词已经接近稳定上限后，仍会在侧面角度、手部遮挡、强光照变化等场景下，对商品不可见部分做结构脑补，导致商品被补形、变形或改材质的问题。
- 本轮最小改动：
  - 调整：
    - `src/main/modules/clone/gptImage.ts`
- 生效规则：
  - 在当前分镜图短 prompt 结构中新增两组高优先级规则：
    - `NO INFERENCE RULE`
    - `STRUCTURE LOCK`
  - 生效口径：
    - 不允许根据遮挡或不可见区域去脑补、补全、重构商品结构
    - 若商品局部被手部或角度遮挡，必须保持与可见参考部分一致，不允许自行猜测缺失结构
    - 商品结构必须保持刚性，不允许因透视、手部交互或构图变化而弯曲、变形、改比例
- 使用说明：
  - 现在分镜图在耳环侧面、局部遮挡、强反光等高风险场景下，会更明确地压制模型的“结构推理”和“自动补形”倾向。
- Windows / Linux 兼容说明：
  - 本轮仅调整 TypeScript 分镜图 prompt 文案，不依赖平台专属能力，Windows 开发与 Linux 部署环境通用。
- 验证：
  - `npm run typecheck`

## 2026-06-01 `/clone` 重新生成分镜视频后必须清空旧成片状态并要求重新合成

- 目标：
  - 修复 `/clone` 分镜视频已经重新生成，但项目里仍保留旧成片输出状态，导致进入“最终成片”后无法基于新分镜视频继续合成、并且缺少明确提示的问题。
- 本轮最小改动：
  - 调整：
    - `src/main/modules/clone/service.ts`
- 生效规则：
  - 当某条分镜视频以 `forceRegenerate=true` 重新生成时，主进程必须同步清空旧的：
    - `finalCompose.outputPath`
    - `finalCompose.coverImagePath`
    - `previewPipeline.previewOutputPath`
    - `previewPipeline.previewReportPath`
  - 同时把最终成片状态重置为：
    - `finalCompose.status = 'idle'`
    - `previewPipeline.status = 'idle'`
  - 并写入明确原因：
    - `分镜视频已更新，需基于最新分镜重新合成成片。`
- 使用说明：
  - 现在只要重新生成过分镜视频，旧成片就不再继续伪装为可用；后续进入“最终成片”时，应按新分镜视频重新合成。
- Windows / Linux 兼容说明：
  - 本轮仅调整桌面端 TypeScript 主进程状态清理逻辑，不依赖平台专属能力，Windows 开发与 Linux 部署环境通用。
- 验证：
  - `npm run typecheck`

## 2026-06-01 `/clone` 成片合成阶段增加直观进度条

- 目标：
  - 修复 `/clone` 最终成片阶段只有按钮和静态状态文案，用户在点击“重新合成/开始合成”后缺少直观进度反馈的问题。
- 本轮最小改动：
  - 调整：
    - `src/renderer/src/ui/views/CloneView.vue`
- 生效规则：
  - 成片阶段头部新增一块轻量进度卡片，展示：
    - 当前合成进度百分比
    - 进度条
    - 当前阶段说明文案
  - 进度值按现有状态推导，不额外引入后端新字段：
    - 已有最终成片：100%
    - 正在合成：90% 以上
    - 分镜视频已齐、可进入合成：80% 左右
    - 尚未准备完成：按已就绪分镜视频数量折算基础进度
  - 若存在门禁阻塞，则进度文案直接显示当前阻塞原因，帮助用户判断为什么还不能顺利完成成片。
- 使用说明：
  - 现在进入“最终成片”后，可以直接看到当前项目距离最终导出的大致进度，而不是只能看按钮状态。
- Windows / Linux 兼容说明：
  - 本轮仅调整 Vue 前端成片页显示，不依赖平台专属能力，Windows 开发与 Linux 部署环境通用。
- 验证：
  - `npm run typecheck`

## 2026-06-01 `/clone` 成片进度条不得被旧成片错误顶到 100%

- 目标：
  - 修复 `/clone` 最终成片页里，只要项目里还残留旧 `finalCompose.outputPath`，进度条就一直显示 `100%`，即使分镜视频其实已经更新、需要重新合成的问题。
- 本轮最小改动：
  - 调整：
    - `src/renderer/src/ui/views/CloneView.vue`
- 生效规则：
  - 成片页不再只根据 `finalCompose.outputPath` 是否存在来判断是否 `100%`。
  - 现在必须同时比较：
    - `finalCompose.updatedAt`
    - 最新 `shotVideoOutputs.updatedAt`
  - 只有当当前成片更新时间不早于最新分镜视频更新时间时，才允许把进度条判定为 `100%`。
  - 如果旧成片仍存在，但分镜视频已经更新，则：
    - 状态显示为 `待重合成`
    - 进度文案显示“检测到旧成片，当前分镜视频已更新，需要重新合成最新成片”
- 使用说明：
  - 现在重新生成过分镜视频后，即使磁盘上还有旧成片文件，成片进度条也不会继续假装已经 100% 完成。
- Windows / Linux 兼容说明：
  - 本轮仅调整 Vue 前端成片进度显示逻辑，不依赖平台专属能力，Windows 开发与 Linux 部署环境通用。
- 验证：
  - `npm run typecheck`

## 2026-06-01 `/clone` 成片页不得继续预览或播放过期旧成片

- 目标：
  - 修复 `/clone` 分镜视频已经更新后，成片页虽然进度条已识别“待重合成”，但页面预览、播放成片、在文件夹中显示、导出成片仍继续指向旧成片文件的问题。
- 本轮最小改动：
  - 调整：
    - `src/renderer/src/ui/views/CloneView.vue`
- 生效规则：
  - 当旧 `finalCompose.outputPath` 已落后于最新 `shotVideoOutputs.updatedAt` 时：
    - 成片大预览不得继续优先显示旧成片
    - 应退回显示当前选中镜头视频预览
  - 同时以下操作必须禁用，避免误操作旧成片：
    - `播放成片`
    - `在文件夹中显示`
    - `导出成片`
    - `发布到 Geelark`
  - 只有当成片是“新鲜的最新成片”时，以上操作才允许恢复可用。
- 使用说明：
  - 现在只要分镜视频更新过、需要重新合成，成片页就不会再继续播放或导出旧成片，而是明确等待你重新合成。
- Windows / Linux 兼容说明：
  - 本轮仅调整 Vue 前端成片页预览与按钮禁用逻辑，不依赖平台专属能力，Windows 开发与 Linux 部署环境通用。
- 验证：
  - `npm run typecheck`

## 2026-06-02 `/clone` 成片页视频预览改为按需加载，减轻界面卡顿

- 目标：
  - 修复 `/clone` 最终成片页在桌面端切换镜头、切到成片页或状态更新时，界面明显卡顿的问题。
- 本轮最小改动：
  - 调整：
    - `src/renderer/src/ui/views/CloneView.vue`
- 生效规则：
  - 成片页大预览视频与当前镜头视频预览统一改为按需加载：
    - `preload="none"`
  - 成片页大预览与当前镜头预览使用稳定的 computed 媒体 URL，避免模板每次响应式刷新时重复拼接媒体地址，减少无意义的 `<video>` 重新加载。
- 使用说明：
  - 现在进入最终成片页或切换当前镜头时，视频元素会更倾向于按需加载，而不是在状态变化时反复抢占资源，有助于降低界面卡顿。
- Windows / Linux 兼容说明：
  - 本轮仅调整 Vue 前端成片页视频预览行为，不依赖平台专属能力，Windows 开发与 Linux 部署环境通用。
- 验证：
  - `npm run typecheck`

## 2026-06-01 `/clone` 选中分镜批量重生成不再被前端残留处理中状态过滤

- 目标：
  - 修复 `/clone` 分镜设计页中，用户明明全选了多条分镜，但前端因为 `regeneratingStoryboardShotIds` 残留状态，导致其中部分已选镜头没有真正进入本轮批量重生成的问题。
- 本轮最小改动：
  - 调整：
    - `src/renderer/src/ui/views/CloneView.vue`
- 生效规则：
  - “重新生成选中分镜”时，当前已选中的镜头必须全部提交到本轮批量重生成。
  - 不再因为前端残留的“正在重生成”标记，把其中某些已选镜头静默过滤掉。
  - 页内状态仍会标记这些镜头正在处理中，但不再影响本次实际提交集合。
- 使用说明：
  - 现在全选 3 条后点击“重新生成选中分镜”，本轮就应按 3 条提交，而不是因为前端旧状态只处理其中 2 条。
- Windows / Linux 兼容说明：
  - 本轮仅调整 Vue 前端批量入口的目标镜头集合，不依赖平台专属能力，Windows 开发与 Linux 部署环境通用。
- 验证：
  - `npm run typecheck`

## 2026-06-01 `/clone` 强制重生成分镜图时必须删除旧分镜文件

- 目标：
  - 修复 `/clone` 分镜图重新生成后，退出界面再进入时又被恢复成旧图、状态也不再是生成中的问题。
- 本轮最小改动：
  - 调整：
    - `src/main/modules/clone/service.ts`
- 生效规则：
  - 分镜图 `forceRegenerate=true` 时，不仅要清空项目里的：
    - `gptFirstFramePath`
    - `gptLastFramePath`
    - `generatedFirstFramePath`
    - `generatedLastFramePath`
    - `storyboardFrames.imagePath`
  - 还必须同时删除该镜头本地旧分镜文件：
    - `shots/{shotId}/gpt-frames/`
    - `shots/{shotId}/first_frame.png`
    - `shots/{shotId}/last_frame.png`
  - 这样重新进入页面时，`recoverLocalStoryboardFrames(...)` 不会再把旧图从本地磁盘捞回项目里。
- 使用说明：
  - 现在点击重新生成分镜图后，旧图会被真正删掉；即使退出页面再回来，也应保持“生成中/无图等待新结果”，不会再显示旧图。
- Windows / Linux 兼容说明：
  - 本轮仅调整 TypeScript 主进程本地文件清理逻辑，不依赖平台专属能力，Windows 开发与 Linux 部署环境通用。
- 验证：
  - `npm run typecheck`

## 2026-06-01 `/clone` 分镜图提示词弹窗精简为核心信息

- 目标：
  - 修复 `/clone` 分镜设计里“提示词预览”弹窗信息过多、干扰查看核心 prompt 的问题。
- 本轮最小改动：
  - 调整：
    - `src/renderer/src/ui/views/CloneView.vue`
- 生效规则：
  - 分镜图提示词弹窗仅保留最核心内容：
    - 简要 meta：模式、商品类型、参考图数量
    - `Start Prompt`
    - `End Prompt`
    - `Negative Prompt`
  - 移除以下非核心展示内容：
    - 编译器 / 哨兵
    - Prompt 健康诊断与长度统计
    - 商品描述高亮
    - 商品源说明
    - 场景氛围锁高亮
    - 模特身份锁高亮
    - 商品参考图 / 模特参考图卡片
    - 请求参数概览与 Start/End JSON
- 使用说明：
  - 现在点击分镜图“提示词预览”后，弹窗会直接聚焦最关键的三段 prompt，减少无关信息干扰。
- Windows / Linux 兼容说明：
  - 本轮仅调整 Vue 前端弹窗展示内容，不依赖平台专属能力，Windows 开发与 Linux 部署环境通用。
- 验证：
  - `npm run typecheck`

## 2026-06-01 `/clone` 分镜图提示词回退到更早正式版口径

- 目标：
  - 修复当前 `/clone` 分镜图生成中商品不一致、模特不一致的问题。
  - 本轮不再只参考 `v3.0`，而是按更早正式版 `12ef32b (release: v1.0.0)` 的分镜图提示词主结构回退。
- 本轮最小改动：
  - 调整：
    - `src/main/modules/clone/gptImage.ts`
- 生效规则：
  - `buildGptFramePrompt(...)` 恢复为更早正式版的主结构：
    - `identityText(...)`
    - `buildShotScriptConstraintText(...)`
    - `buildReferenceLockText(...)`
    - `productLock(...)`
    - `Reference shot translation ...`
    - `Camera motion target ...`
    - 开始帧/结束帧的人物与商品延续说明
  - 移除当前版本中后加的分镜图强控制块对主 prompt 的覆盖，包括：
    - `REFERENCE PRIORITY OVERRIDE`
    - `STORYBOARD ANGLE LOCK`
    - `STORYBOARD SCENE AUTHORITY`
    - `Action: no subject interaction; no human movement ...`
  - 本轮只回退分镜图 prompt 主结构，不改你当前已经确认要保留的参考图顺序修复。
- 使用说明：
  - 分镜图现在会更接近更早正式版的生成方式，优先恢复商品一致性、模特一致性和参考镜头延续关系。
- Windows / Linux 兼容说明：
  - 本轮仅调整 TypeScript 分镜图 prompt 组装逻辑，不依赖平台专属能力，Windows 开发与 Linux 部署环境通用。
- 验证：
  - `npm run typecheck`

## 2026-06-01 `/clone` 分镜图重生成后同路径图片必须强制刷新预览

- 目标：
  - 修复 `/clone` 分镜设计页里重新生成分镜图后，后台已生成新图片，但因为本地文件路径未变，Electron 仍沿用旧缓存，界面继续显示老图的问题。
- 本轮最小改动：
  - 调整：
    - `src/renderer/src/ui/views/CloneView.vue`
- 生效规则：
  - 分镜图预览 URL 需要携带版本参数，基于当前分镜帧的 `updatedAt` 刷新。
  - 对于同一路径的新图片，只要分镜帧更新时间已变化，前端预览就必须重新请求资源，不允许继续显示旧缓存。
  - 该规则同步作用于：
    - 分镜设计列表缩略图
    - 分镜设计右侧大图预览
    - 分镜视频阶段参考分镜图
    - 成片阶段分镜预览
    - 放大查看弹窗
- 使用说明：
  - 重新生成分镜图后，即使后台仍复用同一文件路径，界面也应显示最新生成的图片，而不是旧图。
- Windows / Linux 兼容说明：
  - 本轮仅调整 Vue 前端本地媒体预览 URL，不依赖平台专属能力，Windows 开发与 Linux 部署环境通用。
- 验证：
  - `npm run typecheck`

## 2026-06-01 `/clone` 批量重生成分镜图成功后优先显示已回写图片

- 目标：
  - 修复 `/clone` 分镜设计页里批量重新生成分镜图后，后台已成功生成并回写图片路径，但前端仍因镜头状态短暂残留在 `generating` 而不显示图片的问题。
- 本轮最小改动：
  - 调整：
    - `src/renderer/src/ui/views/CloneView.vue`
- 生效规则：
  - 分镜设计列表在组装缩略图时，只要镜头已经存在：
    - `gptFirstFramePath`
    - `generatedFirstFramePath`
    - 或 `storyboardFrames.imagePath`
    就必须优先显示图片。
  - 只有在“没有任何图片路径”且 `gptFrameStatus==='generating'` 时，才继续显示“生成中”占位态。
- 使用说明：
  - 批量重生成分镜图后，只要后台已经把新图路径写回，页面应立刻显示新图，不再因为状态延迟切换而空白。
- Windows / Linux 兼容说明：
  - 本轮仅调整 Vue 前端图片显示条件，不依赖平台专属能力，Windows 开发与 Linux 部署环境通用。
- 验证：
  - `npm run typecheck`

## 2026-06-01 `/clone` 已有旧任务手动进入分镜设计时不再被自动跳回分镜视频

- 目标：
  - 修复 `/clone` 旧任务已存在分镜图和分镜视频时，用户点击顶部“分镜设计”后界面又立刻被自动切回“分镜视频”的问题。
- 本轮最小改动：
  - 调整：
    - `src/renderer/src/ui/views/CloneView.vue`
- 生效规则：
  - “分镜设计完成后自动切到分镜视频”的 watch 只允许在流程真实处于 `grid` 阶段时触发。
  - 如果当前只是用户手动从旧任务切回查看“分镜设计”，而项目流程实际已经处于 `video` 阶段，则不允许自动再次抢跳到视频页。
- 使用说明：
  - 对于已经跑到分镜视频阶段的旧任务，点击顶部“分镜设计”后应直接稳定停留在分镜设计界面，不需要再点第二次。
- Windows / Linux 兼容说明：
  - 本轮仅调整 Vue 前端阶段切换 watch 条件，不依赖平台专属能力，Windows 开发与 Linux 部署环境通用。
- 验证：
  - `npm run typecheck`

## 2026-06-01 `/clone` 批量重生成分镜导出链路补回

- 目标：
  - 修复 `/clone` 分镜设计页里批量重新生成分镜按钮点击后没有实际触发的问题。
- 本轮最小改动：
  - 调整：
    - `src/renderer/src/composables/useCloneProjectWorkspace.ts`
- 生效规则：
  - `useCloneProjectWorkspaceStoryboard(...)` 已提供的 `regenerateStoryboardFrames(...)` 必须继续透传给页面层。
  - 分镜设计页的“重新生成失败分镜”“重新生成选中分镜”都统一走该批量入口。
- 使用说明：
  - 现在点击批量重生成分镜按钮后，应立即进入批量重生成链路，而不是点击无反应。
- Windows / Linux 兼容说明：
  - 本轮仅补回 TypeScript composable 导出链路，不依赖平台专属能力，Windows 开发与 Linux 部署环境通用。
- 验证：
  - `npm run typecheck`

## 2026-06-01 `/clone` 批量重新生成分镜图片增加即时提示

- 目标：
  - 修复 `/clone` 分镜设计页中点击“重新生成失败分镜”或“重新生成选中分镜”后，页面缺少即时可见反馈，用户不容易判断是否已经开始处理的问题。
- 本轮最小改动：
  - 调整：
    - `src/renderer/src/composables/useCloneProjectWorkspace.storyboard.ts`
    - `src/renderer/src/ui/views/CloneView.vue`
- 生效规则：
  - 批量重新生成分镜图片开始时，运行日志必须立即追加“开始批量重生成”的提示。
  - 提交成功后，运行日志必须追加“已提交”的成功提示，并带上本次处理条数与当前通道。
  - “重新生成选中分镜”按钮在处理中时，按钮文案应切换为 `重生成中… N`，直接显示当前正在处理的选中数量。
  - 当选中的分镜已经全部处于重生成中时，按钮应禁用，避免用户误以为点击无效后继续重复提交。
- 使用说明：
  - 在分镜设计页点击批量重生成后，无需等待图片返回，按钮和运行日志都会立刻给出开始处理的反馈。
- Windows / Linux 兼容说明：
  - 本轮仅调整 Vue 前端交互提示与日志文案，不依赖平台专属能力，Windows 开发与 Linux 部署环境通用。
- 验证：
  - `npm run typecheck`

## 2026-06-01 `/clone` 分镜图片批量重生成前必须先清空旧图

- 目标：
  - 修复 `/clone` 分镜设计页里批量重新生成时，旧分镜图仍继续显示，直到新图返回后才被覆盖，导致用户误以为系统没有真正重新生成的问题。
- 本轮最小改动：
  - 调整：
    - `src/main/modules/clone/service.ts`
    - `src/renderer/src/composables/useCloneProjectWorkspace.storyboard.ts`
    - `src/preload/index.ts`
    - `src/main/index.ts`
- 生效规则：
  - 分镜图片批量重生成入口现在必须显式携带 `forceRegenerate=true`。
  - 主进程 `generateAllShotFrames(...)` 在 `forceRegenerate=true` 时，不再沿用 `onlyMissing` 过滤。
  - 对目标镜头会先清空：
    - `gptFirstFramePath`
    - `gptLastFramePath`
    - `generatedFirstFramePath`
    - `generatedLastFramePath`
    - `storyboardFrames.imagePath`
    - `imagePromptHash`
  - 然后再进入新的分镜图生成流程。
- 使用说明：
  - 在分镜设计页中，无论是“重新生成失败分镜”还是“重新生成选中分镜”，点击后旧图都会先被清掉并进入生成中状态，不会继续挂着旧图假装已刷新。
- Windows / Linux 兼容说明：
  - 本轮仅调整 Electron IPC 参数与 TypeScript 主进程分镜图重生成逻辑，不依赖平台专属能力，Windows 开发与 Linux 部署环境通用。
- 验证：
  - `npm run typecheck`

## 2026-06-01 `/clone` 分镜设计支持批量并发重新生成

- 目标：
  - 修复 `/clone` 分镜设计页里“失败分镜批量重新生成”和“多选分镜重新生成”仍按前端逐条串行提交，导致看起来不能同时重新生成的问题。
- 本轮最小改动：
  - 调整：
    - `src/renderer/src/composables/useCloneProjectWorkspace.storyboard.ts`
    - `src/renderer/src/ui/views/CloneView.vue`
- 生效规则：
  - 分镜设计页的失败项批量重生成不再前端逐条 `await` 串行调用单镜头接口。
  - 现在会一次性把目标 `shotIds` 提交到主进程 `generateAllShotFrames(...)`，由后端并发队列统一调度。
  - 分镜设计表格新增最小多选能力，支持：
    - 全选当前分镜
    - 批量重新生成选中分镜
  - 本轮只增强分镜图批量并发重生成，不改分镜视频、成片合成和其它页面结构。
- 使用说明：
  - 在“分镜设计”阶段，可以直接勾选多条分镜后点击“重新生成选中分镜”。
  - 点击“重新生成失败分镜”时，也会按后端并发队列统一处理，不再前端逐条串行等待。
- Windows / Linux 兼容说明：
  - 本轮仅调整 Vue 前端入口与既有 Electron 批量接口接法，不依赖平台专属能力，Windows 开发与 Linux 部署环境通用。
- 验证：
  - `npm run typecheck`

## 2026-06-01 桌面端发布基线版本提升到 v4.0.0

- 目标：
  - 将当前桌面端发版基线从 `v3.0.0` 提升到 `v4.0.0`，用于后续打包与安装发布。
- 本轮最小改动：
  - 调整：
    - `package.json`
    - `package-lock.json`
- 生效规则：
  - 应用主版本号统一更新为 `4.0.0`。
  - 后续 `electron-builder` 打出的安装包文件名将跟随版本号更新为 `VideoGenerate-4.0.0-Setup.exe`。
  - 本轮只修改发布版本号，不改变业务逻辑与页面结构。
- 使用说明：
  - 后续执行桌面端打包时，安装包与应用内版本基线应统一识别为 `v4.0.0`。
- Windows / Linux 兼容说明：
  - 本轮仅调整 npm 包版本元数据，Windows 开发与 Linux 部署环境通用。
- 验证：
  - `node -p "require('./package.json').version"`

## 2026-06-01 `/clone` 顶部脚本生成阶段切换恢复

- 目标：
  - 修复 `/clone` 详情页顶部阶段条点击“脚本生成”后界面没有反应的问题。
- 本轮最小改动：
  - 调整：
    - `src/renderer/src/ui/views/CloneView.vue`
- 生效规则：
  - 顶部阶段条点击“脚本生成”时，前端必须允许用户显式切回 `variant` 阶段查看和操作脚本候选。
  - 不允许在 `workflowStageKey` 已经进入 `grid/video/compose` 时，又通过额外 watch 立即把 `selectedStageKey='variant'` 清空。
  - 本轮只恢复阶段切换行为，不改变脚本生成、分镜设计、分镜视频和成片阶段的既有业务逻辑。
- 使用说明：
  - 在 `/clone` 详情页中，即使当前流程已经推进到后续阶段，点击顶部“脚本生成”后页面也应立即切换回脚本候选界面。
- Windows / Linux 兼容说明：
  - 本轮仅调整 Vue 前端阶段切换 watch 逻辑，不依赖平台专属能力，Windows 开发与 Linux 部署环境通用。
- 验证：
  - `npm run typecheck`

## 2026-06-01 桌面端视频阶段运行时刷新恢复完整项目快照

- 目标：
  - 恢复桌面端 `/clone` 分镜视频阶段之前已经修过的关键刷新口径，避免主进程和 sqlite 已经回写新状态，但页面仍停留在旧的 `待下载回写 / 缺少任务号 / 下载中` 状态。
- 本轮最小改动：
  - 调整：
    - `src/renderer/src/composables/useCloneProjectWorkspace.project.ts`
- 生效规则：
  - 在 Electron 桌面端通道下，视频阶段运行时刷新不能只拉 runtime 摘要。
  - 桌面端运行时刷新必须优先调用完整 `getProject()`，再合并 runtime pipeline 状态，并按整对象替换当前项目。
  - 这样页面可以及时拿到主进程刚写入的：
    - `shotVideoOutputs`
    - `blueprint.shots[].generatedTaskId`
    - `blueprint.shots[].generatedClipPath`
    - `videoPath/localPath/completedAt`
  - 本轮属于恢复既有正确修复，不扩展新业务逻辑。
- 使用说明：
  - 当主进程已把某条分镜视频回写为成功或更新了任务状态，桌面端视频页下一轮刷新应直接吃到完整项目快照，而不是继续卡在旧摘要状态。

## 2026-06-01 分镜视频操作后的完整项目回写必须整对象替换

- 目标：
  - 修复桌面端 `/clone` 分镜视频阶段里“获取任务 / 同步云端状态 / 强制下载回写 / 重新生成”之后，页面仍可能残留旧 `shotVideoOutputs` 数组状态，表现为同一镜头长期卡在多个历史状态的问题。
- 本轮最小改动：
  - 调整：
    - `src/renderer/src/composables/useCloneProjectWorkspace.video.ts`
- 生效规则：
  - 视频阶段在以下操作后，只要已经重新拉取完整 `getProject()`：
    - 单条获取任务
    - 强制下载回写
    - 同步云端状态
    - 重新生成分镜视频
  - 渲染层就必须按整对象 `replace` 当前项目，而不能继续沿用默认 patch 合并。
  - 这样可以避免旧的：
    - `shotVideoOutputs`
    - `blueprint.shots[].generatedTaskId/generatedClipPath`
    - `error/remoteStatus/status`
    在同 id patch 过程中被局部残留，导致页面看起来像“已经成功但又仍在下载中/待查询”。
- 使用说明：
  - 当分镜视频已经成功生成或已经补回任务号后，再点击“获取任务”或“同步云端状态”，页面应以最新完整项目快照为准，不再把同一镜头展示成多个冲突状态。
- Windows / Linux 兼容说明：
  - 本轮仅调整 Vue composable 的桌面端刷新逻辑，不依赖平台专属能力，Windows 开发与 Linux 部署环境通用。
- 验证：
  - `npm run typecheck`

## 2026-06-01 `/clone` 分镜视频本地已出片后前端状态归一

- 目标：
  - 修复 `/clone` 分镜视频阶段中，某些镜头其实已经成功生成并落地本地视频，但界面仍同时显示失败、待下载回写或运行中等旧状态的问题。
- 本轮最小改动：
  - 调整：
    - `src/renderer/src/ui/views/CloneView.vue`
- 生效规则：
  - 当镜头已经存在本地视频路径时，前端状态组装必须优先归一为 `done`，不再继续沿用旧的：
    - `remote_running`
    - `remote_pending`
    - `remote_succeeded_pending_download`
    - `downloading`
    - `failed_retryable`
    - `failed_terminal`
  - 对于已经归一到 `done` 的镜头：
    - 不再继续显示旧错误文案
    - 不再因为历史错误被统计进失败项
    - 若远端状态已成功，允许继续保留 `remoteStatus=succeeded`
  - 本轮只修复前端状态展示归一，不改主进程任务提交、查询、下载回写和持久化逻辑。
- 使用说明：
  - 在 `/clone` 分镜视频列表里，只要该镜头本地视频已经真实生成出来，就应稳定显示为 `已完成`，不再同时混入失败或待回写状态。
- Windows / Linux 兼容说明：
  - 本轮仅调整 Vue 前端状态映射逻辑，不依赖平台专属能力，Windows 开发与 Linux 部署环境通用。
- 验证：
  - `npm run typecheck`

## 2026-06-01 `/clone` 分镜设计完成后自动切换到分镜视频

- 目标：
  - 修复 `/clone` 分镜设计阶段中，分镜图异步完成后页面没有自动切换到“分镜视频”界面的问题。
- 本轮最小改动：
  - 调整：
    - `src/renderer/src/ui/views/CloneView.vue`
- 生效规则：
  - 当当前页面处于 `分镜设计` 阶段，且项目已实际生成出可用分镜图时：
    - 前端应自动进入 `分镜视频` 阶段
    - 并继续沿用原有自动提交视频生成的判断逻辑
  - 本轮兼容两种场景：
    - 用户点击“开始生成分镜”后同步完成
    - 分镜图在后台异步陆续完成，稍后才真正就绪
  - 本轮只修复自动切换时机，不改分镜图生成、分镜视频生成和“下一步”按钮的既有业务逻辑。
- 使用说明：
  - 在 `/clone` 分镜设计页里，只要首批分镜图已经真正生成出来，界面应自动切到 `分镜视频`，不需要再手动点一次“下一步”。
- Windows / Linux 兼容说明：
  - 本轮仅调整 Vue 前端阶段切换 watch 逻辑，不依赖平台专属能力，Windows 开发与 Linux 部署环境通用。
- 验证：
  - `npm run typecheck`

## 2026-06-01 `/clone` 参考分析阶段商品改为弹窗选择

- 目标：
  - 将 `/clone` 参考视频分析阶段的商品选择方式，从原生下拉框改为与“选择模特”一致的弹窗式选择，减少长列表下拉不易浏览的问题，并保持页面结构统一。
- 本轮最小改动：
  - 调整：
    - `src/renderer/src/ui/views/CloneView.vue`
- 生效规则：
  - 参考分析阶段的商品选择入口改为“选择商品”按钮。
  - 点击后打开商品选择弹窗，按卡片方式展示商品封面、名称、类型和商品 ID。
  - 商品弹窗内新增本地搜索框，可按商品名称、类型、商品 ID 过滤结果。
  - 商品弹窗内需要直接高亮：
    - `当前已绑定商品`
    - `当前已选中待绑定商品`
  - 在弹窗中点击某个商品后，仅更新“当前选中待绑定商品”，不改变既有绑定逻辑。
  - “绑定商品”按钮和原有 `bindSelectedProduct` 行为保持不变，仍需显式点击后才真正绑定到当前项目。
  - 本轮只调整商品选择交互，不改参考分析、商品绑定、商品快照、脚本生成和后续分镜流程逻辑。
- 使用说明：
  - 在 `/clone` 参考分析阶段，点击“选择商品”可像选择模特一样通过弹窗挑选商品。
  - 选中后仍需点击“绑定商品”，商品才会真正进入当前项目。
- Windows / Linux 兼容说明：
  - 本轮仅调整 Vue 前端交互与模板结构，不依赖平台专属能力，Windows 开发与 Linux 部署环境通用。
- 验证：
  - `npm run typecheck`

## 2026-06-01 `/clone` 详情页容错恢复，避免旧任务点击后进不去

- 目标：
  - 修复用户清理过本地商品/素材数据后，`/clone` 列表仍能看到任务，但点击进入详情页会因补商品快照或补运行态失败而无法打开的问题。
- 本轮最小改动：
  - 调整：
    - `src/main/modules/clone/projectWorkspace.ts`
- 生效规则：
  - 复刻详情读取任务时，仍优先执行原有的：
    - 绑定商品快照同步
    - 蓝图层同步
    - 本地分镜帧恢复
    - 运行态补全
  - 若其中某一步因历史任务数据缺失、清库后关联商品不存在、运行态补全异常而失败：
    - 不再直接阻断整个详情页打开
    - 改为记录主进程告警日志
    - 尽量回退到当前已保存的项目数据继续进入详情页
  - 本轮只修复“任务可进入”的容错链路，不改变首页、列表页和复刻详情页既有布局结构。
- 使用说明：
  - 对于清理过商品库或本地素材后的旧复刻任务，点击“进入任务”应优先能打开详情页。
  - 若某些绑定商品或恢复素材确实已缺失，页面内会按当前项目剩余数据展示，后续可在详情页重新绑定商品或补素材。
- Windows / Linux 兼容说明：
  - 本轮仅调整主进程任务读取容错逻辑，不依赖平台专属能力，Windows 开发与 Linux 部署环境通用。
- 验证：
  - `npm run typecheck`

## 2026-06-01 桌面端商品图显示修复与复刻列表补充批量删除

- 目标：
  - 修复桌面端清空数据后商品图不显示、商品库读取失败缺少页内兜底，以及 `/clone` 列表缺少批量删除能力的问题。
- 本轮最小改动：
  - 调整：
    - `src/main/index.ts`
    - `src/renderer/src/ui/views/ProductLibraryView.vue`
    - `src/renderer/src/ui/views/PluginsView.vue`
    - `src/renderer/src/ui/views/CloneTaskListView.vue`
- 生效规则：
  - 本地 `vg://file` 协议新增图片 MIME 映射：
    - `png`
    - `jpg/jpeg`
    - `webp`
    - `gif`
    - `bmp`
    - `svg`
  - 商品库页在本地数据读取失败时不再整页失效，改为列表回退为空并在页面内展示错误提示。
  - 插件市场页在插件服务不可用时继续展示本地兜底插件列表，并给出明确提示。
  - `/clone` 列表在现有多选基础上新增批量删除入口，复用现有单任务删除接口逐条执行。
- 使用说明：
  - 商品图片现在应可继续通过 `vg://file` 正常预览。
  - 即使清空本地商品数据或插件服务暂时异常，商品库和插件市场也应保持可进入、可见。
  - 在 `/clone` 列表勾选多个任务后，可直接执行批量删除。
- Windows / Linux 兼容说明：
  - 本轮仅调整 Electron 本地协议与 Vue 桌面端页面逻辑，不依赖平台专属能力，Windows 开发与 Linux 部署环境通用。
- 验证：
  - `npm run typecheck`

## 2026-06-01 `/clone` 分镜视频重新生成不再弹窗确认

- 目标：
  - 去掉桌面端 `/clone` 分镜视频重新生成时的阻断式确认弹窗，避免用户重复点按钮后频繁被系统弹窗打断。
- 本轮最小改动：
  - 调整：
    - `src/renderer/src/ui/views/CloneView.vue`
- 生效规则：
  - 单个分镜视频重新生成时：
    - 若该镜头已在重新生成中，只保留运行日志提示：`正在重新生成，请不要重复点击。`
    - 首次提交重新生成后，只保留运行日志提示：`已提交重新生成，正在处理中，请勿重复点击。`
  - 批量重新生成失败分镜时：
    - 若批量任务已在执行中，只保留运行日志提示，不再弹出 `window.alert`。
    - 批量提交开始后，只保留运行日志提示，不再弹出 `window.alert`。
  - 本轮只移除重复提交提示弹窗，不修改原有的按钮互斥、运行状态和后台提交逻辑。
- 使用说明：
  - 在 `/clone` 分镜视频阶段点击“重新生成”或“批量重新生成失败分镜”后，界面会继续通过运行日志反馈状态，但不会再弹出确认框打断操作。
- Windows / Linux 兼容说明：
  - 本轮仅调整 Vue 前端提示方式，不依赖平台专属能力，Windows 开发与 Linux 部署环境通用。
- 验证：
  - `npm run typecheck`

## 2026-05-31 `/clone` Grok 视频模型改走 `/v1/video/create`

- 目标：
  - 修复桌面端 `/clone` 在视频平台配置为 `apifox_hub / grok-video-3` 时，分镜视频提交仍错误走 `model/generateVideo` 风格接口，导致云端提交失败、拿不到 taskId 的问题。
- 本轮最小改动：
  - 调整：
    - `src/main/modules/clone/unifiedVideo.ts`
    - `src/main/modules/clone/service.ts`
- 生效规则：
  - 当 `ApifoxHubCredentials.videoProvider === 'grok'` 时：
    - 提交地址改为：`/v1/video/create`
    - 请求体改用 Grok / OpenAI Video 风格：
      - `model`
      - `prompt`
      - `images`
      - `aspect_ratio`
      - `size`
  - 不再让 `grok-video-3` 继续走 `model/generateVideo` 或 `model/prediction` 这套 Vidu / Kling 风格路径。
  - 查询链路仍沿用现有视频任务查询逻辑；本轮只修提交入口与请求体映射。
- 使用说明：
  - 如果设置页里视频模型配置为 `apifox_hub + grok-video-3`，系统提交分镜视频时应与接口示例一致走 `/v1/video/create`，不应再因为接口风格不匹配而在提交初期失败。
- Windows / Linux 兼容说明：
  - 本轮仅修改 TypeScript 主进程请求路由与请求体映射，不依赖平台专属能力，Windows 开发与 Linux 部署环境通用。
- 验证：
  - `npm run typecheck`

## 2026-05-31 `/clone` 分镜视频提交初始态不再误报缺少 taskId

- 目标：
  - 修复 `/clone` 分镜视频刚进入批量提交阶段时，输出状态还是 `submitting`、`sourceEvent=storyboard_video_batch_submit_started`，却被系统过早当成“缺少 taskId 的异常”并显示云端错误上下文的问题。
- 本轮最小改动：
  - 调整：
    - `src/main/modules/clone/service.ts`
    - `src/main/modules/clone/repo.ts`
    - `src/renderer/src/ui/views/CloneView.vue`
- 生效规则：
  - `storyboard_video_batch_submit_started` 视为与 `segment_submit_started` 同级的“提交中”事件。
  - 在分镜视频自动恢复、缺少 taskId 判定、运行中状态保持等链路里，只要 `sourceEvent` 仍处于上述提交中事件，系统必须继续等待远端回写，不能立即误判为终态异常。
  - 前端运行日志中的 `云端调用上下文` 改为普通信息级展示，不再默认按错误日志渲染，避免用户误读为接口报错。
- 使用说明：
  - 当分镜视频界面刚进入提交阶段时，看到 `submitting` 与 `storyboard_video_batch_submit_started` 属于正常过渡态；系统应继续等待任务号回写，而不是立刻报错或中断。
- Windows / Linux 兼容说明：
  - 本轮仅修改 TypeScript 主进程状态判定和 Vue 前端日志级别，不依赖平台专属能力，Windows 开发与 Linux 部署环境通用。
- 验证：
  - `npm run typecheck`

## 2026-05-31 设置页新增 `/clone` 分镜图片并发配置

- 目标：
  - 让用户可以在桌面端设置页手动指定 `/clone` 分镜图片生成并发，而不是继续固定吃默认值，方便在 Windows 开发机上按机器性能调优，并保持 Linux 部署兼容。
- 本轮最小改动：
  - 调整：
    - `src/main/modules/clone/repo.ts`
    - `src/main/modules/clone/service.ts`
    - `src/main/index.ts`
    - `src/preload/index.ts`
    - `src/renderer/src/ui/views/SettingsView.vue`
- 生效规则：
  - `clone-settings.json` 新增独立的 `runtimeOptions` 持久化区，不与模型凭证字段混写语义。
  - 设置页新增“运行性能”配置卡，支持手动设置：
    - `分镜图片单项目并发`
    - `分镜图片全局并发`
  - 取值范围统一限制为 `1 ~ 6`。
  - `generateAllShotFrames(...)` 的并发读取优先级调整为：
    - `调用入参 concurrency`
    - `设置页保存的 runtimeOptions`
    - `环境变量`
    - `默认值`
  - 当前默认值为：
    - 单项目并发：`3`
    - 全局并发：`2`
  - 本轮只影响 `/clone` 分镜图片生成阶段，不影响分镜视频生成并发与恢复逻辑。
  - 主进程运行日志新增关键调试项：
    - `storyboard-frame-concurrency`
    - 用于确认本次真正使用的单项目并发、全局并发以及来源。
- 使用说明：
  - 进入设置页后，在“能力模型”分组下可直接手动设置分镜图片并发。
  - 保存后新发起的分镜图生成任务会按新配置生效；若调用方显式传了 `concurrency`，则仍以调用入参优先。
- Windows / Linux 兼容说明：
  - 本轮只新增 JSON 配置持久化、Electron IPC 和前端表单，不依赖 Windows 专属 API；Windows 开发测试与 Linux 部署环境通用。
- 验证：
  - `npm run typecheck`

## 2026-05-31 `/clone` 分析前商品必须已绑定，且界面区分“已绑定”与“仅选中”

- 目标：
  - 修复桌面端 `/clone` 在参考分析阶段商品状态表达不清的问题，避免用户仅在下拉框选中了商品，就误以为已经成功绑定到当前项目。
- 本轮最小改动：
  - 调整：
    - `src/renderer/src/ui/views/CloneView.vue`
- 生效规则：
  - 点击 `分析脚本` 时，如果当前项目还没有真正绑定 `productId`，前端必须直接阻断，不允许继续发起参考分析。
  - 阻断时必须给出显式提示：
    - 已选中但未绑定：`请先点击“绑定商品”，将当前选中的商品绑定到项目后再分析脚本。`
    - 未选择商品：`请先选择商品并点击“绑定商品”后，再继续分析脚本。`
  - 只要当前 clone 项目已经创建，即使还没有完成参考分析，点击 `绑定商品` 也必须立即触发真实绑定请求，不能再因为缺少 blueprint 而在前端静默短路。
  - 主进程 `bindProjectProduct` 也不能再要求项目必须已生成 `blueprint/baseBlueprint`；只要 clone 项目存在，就允许先绑定商品，再继续后续分析。
  - 商品区块中必须同时区分两种状态：
    - `当前绑定商品`：只显示已经绑定到当前项目上的商品
    - `当前选中待绑定商品`：显示下拉框当前选中的商品
  - 当下拉框商品与项目已绑定商品不同步时，界面必须明确提示“当前只是选中了商品，仍需点击绑定商品后才会真正绑定到当前项目”，不能再让用户误判为已经绑定成功。
  - 当脚本候选已经生成成功，且项目还没有进入分镜图 / 分镜视频 / 成片阶段时，前端必须自动切换到 `分镜设计` 并继续触发分镜图片生成，不能停留在脚本页等待用户再次手动点击。
- 使用说明：
  - 在 `/clone` 参考分析页，下拉框选中商品只是“准备绑定”，只有点击 `绑定商品` 后，该商品才真正进入当前项目并允许继续分析脚本。
- Windows / Linux 兼容说明：
  - 本轮仅修改 Vue 前端交互与文案逻辑，不依赖平台专属能力，Windows 开发环境与 Linux 部署环境通用。
- 验证：
  - `npm run typecheck`

## 2026-05-31 `/clone` 大任务量列表摘要查询继续收紧

- 目标：
  - 继续降低桌面端 `/clone` 在“任务很多、后台持续生成视频”场景下的列表刷新卡顿，避免任务列表每次刷新都先把完整项目 payload 全量规范化一遍。
- 本轮最小改动：
  - 调整：
    - `src/main/modules/clone/repo.ts`
    - `src/main/modules/clone/projectWorkspace.ts`
- 生效规则：
  - 仓储层新增 `cloneRepo.listRawProjects()`，用于直接读取 SQLite 中的项目原始 payload 列表。
  - `/clone` 任务列表使用的 `listProjectSummaries()` 改为基于原始项目 payload 先排序、筛选，再构建摘要，不再默认先对所有项目执行 `normalizeProject()`。
  - 单项目详情页、项目创建、项目保存等需要完整规范化对象的链路保持现状，不受本轮影响。
- 使用说明：
  - 当本地存在大量复刻任务时，进入 `/clone` 任务列表或执行列表刷新，主进程不应再因为整批项目先做完整规范化而放大卡顿。
  - 本轮只优化列表摘要热路径，不改变前端字段协议、筛选逻辑和排序行为。
- Windows / Linux 兼容说明：
  - 本轮仅修改 TypeScript 主进程仓储与摘要服务逻辑，不依赖平台专属能力，Windows 开发环境与 Linux 部署环境通用。
- 验证：
  - `npm run typecheck`

## 2026-05-31 `/clone` 分镜视频自动重试封顶前端提示补齐

- 目标：
  - 当远端分镜视频自动重新生成连续失败并达到 2 次上限后，`/clone` 前端必须明确告诉用户该镜头已经停止自动处理，避免只显示笼统失败状态。
- 本轮最小改动：
  - 调整：
    - `src/renderer/src/ui/views/CloneView.vue`
- 生效规则：
  - 当镜头状态为 `failed_terminal`，且错误标签为 `[retry_limit]` 时，镜头状态卡必须显示：
    - 标题：`已停止处理`
    - 详情：`已自动重试 2 次，仍未成功，请手动检查素材、提示词或模型配置后重新生成`
  - 分镜视频列表中的重试次数文案也必须同步切换为：
    - `已自动重试 2 / 2，已停止处理`
  - 普通失败、普通待重试、普通查询超时仍沿用现有状态文案，不扩大到其他错误类型。
- 使用说明：
  - 当某条分镜视频因为远端失败被系统自动重新生成 2 次后，用户在 `/clone` 视频阶段无需再翻日志判断是否还会继续轮询；列表状态会直接显示该镜头已停止自动处理，需要人工介入后重新生成。

## 2026-05-31 桌面端重启后自动恢复分镜视频续查

- 目标：
  - 修复桌面端软件关闭后重新打开时，`/clone` 分镜视频待查询 / 待下载任务不会自动恢复的问题。
- 本轮最小改动：
  - 调整：
    - `src/main/modules/clone/service.ts`
    - `src/main/index.ts`
- 生效规则：
  - 桌面端 `app.whenReady()` 后，主进程会自动扫描本地 clone 项目。
  - 若项目仍存在待续查的分镜视频远端任务，则主进程自动重新调度该项目的 `reconcileRemoteStoryboardVideos` 后台恢复。
  - 本轮恢复范围只包含：
    - 已有远端 `taskId` 的待查询分镜
    - 远端已成功但待下载回写的分镜
    - 仍属于可恢复状态的分镜视频队列
  - 本轮不恢复整条自动流程：
    - 不会因为软件重启就重新从分析、脚本、分镜图开始自动跑
    - 只恢复分镜视频队列的续查 / 下载闭环
  - 启动恢复会输出关键调试日志：
    - `startup-resume-shot-video-scan`
    - `startup-resume-shot-video-schedule`
- 使用说明：
  - 若你在桌面端关闭软件时，某个 `/clone` 项目仍有分镜视频处于待查询、待下载或可恢复状态，下次重新打开软件后，无需先手动点击“继续查询”，系统会在主进程启动后自动恢复这批分镜视频的后台续查。

## 2026-05-31 `/clone` 历史分镜视频任务按创建时上下文查询

- 目标：
  - 修复桌面端 `/clone` 分镜视频任务在切换视频模型配置后，系统仍拿“当前设置”的 `baseUrl / endpointStyle / model` 去查询历史任务，导致旧 `VectorEngine` 任务被误用 `AI666` 配置查询并出现 `403 无权访问 auto 分组` 的问题。
- 本轮最小改动：
  - 调整：
    - `src/main/modules/clone/types.ts`
    - `src/main/modules/clone/unifiedVideo.ts`
    - `src/main/modules/clone/service.ts`
- 生效规则：
  - 每条分镜视频输出记录都会保留任务创建时的：
    - `provider`
    - `model`
    - `endpointStyle`
    - `baseUrl`
  - 后续继续查询、自动恢复、恢复下载、提交后轮询、已有视频回写等链路，优先使用该任务自身的上下文查询远端。
  - 若历史任务记录里缺少 `baseUrl`，但仍保留了 `model`，系统会尝试按 `model` 反向匹配 `ai666Hub / vectorEngineHub`，尽量恢复到正确视频 hub 再查询。
  - 新提交的视频任务会在 `submitting / remote_running / done` 等阶段持续回写 `baseUrl`，避免后续重启后再次丢失上下文。
- 使用说明：
  - 如果某条旧分镜任务最初是用 `VectorEngine / veo_3_1-fast-4K` 创建的，即使你后来把设置页切成 `AI666 / grok-video-3`，系统仍应继续按旧任务自己的上下文去查询，不应再把 `veo_...:task_...` 发到 AI666 地址上。
  - 当运行日志里看到旧任务号时，应同时看到它匹配的历史查询地址，而不是一律显示当前设置页的新地址。
- Windows / Linux 兼容说明：
  - 本轮仅修改 TypeScript 主进程任务上下文持久化与查询逻辑，不依赖平台专属能力，Windows 开发环境与 Linux 部署环境通用。
- 验证：
  - `npm run typecheck`

## 2026-05-31 `/clone` 脚本变体请求触发时机修复

- 目标：
  - 修复桌面端 `/clone` 在参考分析完成后，界面看起来进入了“脚本生成”阶段，但实际上并没有真正发起脚本变体生成请求的问题。
- 本轮最小改动：
  - 调整：
    - `src/main/modules/clone/service.ts`
    - `src/renderer/src/ui/views/CloneView.vue`
- 生效规则：
  - 参考分析完成后，后端只把 `upload_analyze_script` 标记为 `done`，不再提前把 `generate_script_variants` 伪装成 `running`。
  - 前端参考分析后的自动衔接条件，从“必须已绑定商品库商品 + 模特”改为“已有有效商品参考图 + 模特”，避免已经准备好商品图但尚未手动绑定商品 ID 时，脚本变体请求被前端静默短路。
  - 手动点击“生成候选脚本”后，运行日志会明确记录“开始请求脚本变体生成”，便于确认请求是否真正发出。
  - 手动生成成功后，页面先停留在“脚本生成”页，不再立刻自动切去分镜页，避免误判成“刚到脚本阶段又跳走了”。
- 使用说明：
  - 现在只有真的触发 `generateScriptVariants` 请求后，项目才会进入脚本变体生成阶段。
  - 若参考分析完成后已有商品参考图和模特，系统会继续真正发起脚本变体生成；若仍缺素材，日志会停留在明确的提示文案，而不是假装已经在生成脚本。
- Windows / Linux 兼容说明：
  - 本轮仅修改 TypeScript 主进程工作流状态与 Vue 前端触发条件，不依赖平台专属能力，Windows 开发环境与 Linux 部署环境通用。
- 验证：
  - `npm run typecheck`

## 2026-05-31 `/clone` 多任务场景详情页卡顿止血

- 目标：
  - 修复桌面端在创建多个复刻任务后，进入 `/clone` 详情页时明显卡顿、加载变慢的问题，优先降低单任务详情页对整库数据的重复读取与高频全量刷新。
- 本轮最小改动：
  - 调整：
    - `src/main/modules/clone/repo.ts`
    - `src/renderer/src/composables/useCloneProjectWorkspace.project.ts`
    - `src/renderer/src/ui/views/CloneView.vue`
- 生效规则：
  - `cloneRepo.getProject(id)` 不再通过 `listProjects()` 先把整个项目库全量读出后再 `find`，改为直接读取数据库并按 `id` 命中单项目。
  - 桌面端详情页的 `refreshRuntimeProject()` 不再每次都同时拉 `getProject + getRuntime`；非必要场景下只刷新 runtime，避免把大项目对象整包替换进前端。
  - `/clone` 页面 6 秒定时器中的“非视频阶段定期全量 `loadProject()`”频率从每 4 个 tick 一次，放缓到每 10 个 tick 一次，减少多任务场景下的整项目全量刷新。
- 使用说明：
  - 当本地存在多个体量较大的复刻任务时，打开任一 `/clone/:id` 详情页，不应再因为后台把整库项目反复读出、整包替换而出现明显掉帧。
  - 视频阶段仍保留更积极的同步策略，优先保证分镜视频续查闭环；本轮主要收紧非视频阶段和纯 runtime 刷新。
- Windows / Linux 兼容说明：
  - 本轮仅修改 TypeScript 仓储读取与 Vue 前端刷新策略，不依赖平台专属能力，Windows 开发环境与 Linux 部署环境通用。
- 验证：
  - `npm run typecheck`

## 2026-05-31 `/clone` 多任务大规模场景仓储热路径收紧

- 目标：
  - 继续提升复刻系统在“大量添加视频任务 + 持续生成视频任务”场景下的基础吞吐，避免主进程对单个项目的频繁读写仍退化为整库级操作。
- 本轮最小改动：
  - 调整：
    - `src/main/modules/clone/sqlite.ts`
    - `src/main/modules/clone/repo.ts`
- 生效规则：
  - SQLite 层新增单项目热路径能力：
    - `readCloneProjectByIdFromSqlite`
    - `readCloneProjectsFromSqlite`
    - `upsertCloneProjectInSqlite`
    - `removeCloneProjectFromSqlite`
  - `cloneRepo.getProject()` 改为直接按项目 `id` 读取单条 SQLite 记录并规范化，不再走整库 `readDb()`。
  - `cloneRepo.upsertProject()` 改为只读取当前项目旧记录并执行单条 `INSERT OR REPLACE`，不再为单项目更新重写整个项目库。
  - `cloneRepo.createProject()` 与 `cloneRepo.removeProject()` 也同步切到单项目级 SQLite 读写。
- 使用说明：
  - 当系统里复刻任务很多、且后台持续进行分镜图 / 分镜视频 / 续查 / 下载回写时，单个任务详情页的读取和状态回写不应再反复拖动整个项目库一起读写。
  - 这一步属于后端基础性能改造，会直接影响详情页刷新、后台自动恢复、视频续查和任务列表打开时的响应速度。
- Windows / Linux 兼容说明：
  - 本轮仅修改 TypeScript + SQLite 仓储热路径，不依赖平台专属能力，Windows 开发环境与 Linux 部署环境通用。
- 验证：
  - `npm run typecheck`

## 2026-05-31 `/clone` 大任务量前端重绘与摘要计算收紧

- 目标：
  - 继续朝“大量复刻任务 + 持续生成视频任务时界面尽量丝滑”推进，优先降低任务详情页的大数组重算和任务列表摘要的过重派生计算。
- 本轮最小改动：
  - 调整：
    - `src/renderer/src/ui/views/CloneView.vue`
    - `src/main/modules/clone/service.ts`
- 生效规则：
  - `shotVideoOutputs` 组装逻辑不再对每个镜头执行 `rawShotVideoOutputs.find(...)`，改为先构建 `Map` 再按 `shotId` 读取，避免镜头数增大后退化为 O(n²)。
  - `/clone` 详情页视频阶段两个高频 `watch` 不再对整条 `shotVideoOutputs` 做 `map(...).join('|')` 深签名，而改为基于轻量状态聚合：
    - 总数
    - 已绑定 task 数
    - 已落地本地视频数
    - 运行中数量
    - 下载中数量
    - 待下载数量
    - 最近更新时间
  - 任务列表摘要 `buildProjectSummary(...)` 不再为摘要页展开遍历所有 shots 上的商品参考图路径，优先使用一致性素材、商品快照和原始商品图，减少列表刷新时的深层数组展开。
- 使用说明：
  - 当单个项目镜头较多、且后台持续更新 `shotVideoOutputs` 时，详情页不应再因为数组级字符串签名和 O(n²) 查找导致明显掉帧。
  - 当任务列表数量很多时，列表刷新与进入页面时的摘要构建开销也会进一步下降。
- Windows / Linux 兼容说明：
  - 本轮仅修改 Vue 前端计算属性 / watch 签名与 TypeScript 摘要组装逻辑，不依赖平台专属能力，Windows 开发环境与 Linux 部署环境通用。
- 验证：
  - `npm run typecheck`

## 2026-05-30 `/clone` 运行日志改为右侧悬浮按钮 + 日志弹窗

- 目标：
  - 将桌面端 `/clone` 页面底部内嵌运行日志面板改为右侧悬浮按钮，点击后以弹窗形式查看运行日志，减少主工作区首屏压迫感，并与 `TikTok 商品上架助手` 的日志交互保持一致。
- 本轮最小改动：
  - 仅调整：
    - `src/renderer/src/ui/views/CloneView.vue`
- 生效规则：
  - `/clone` 页面不再默认在页面流中长期占用一整块运行日志区域。
  - 页面右下角固定显示运行日志悬浮按钮：
    - 显示日志数量
    - 有日志时显示激活态指示点
  - 点击悬浮按钮后，以右侧弹窗形式展示日志：
    - 仅保留一套弹窗标题、说明、计数与关闭按钮
    - 日志主体使用轻量卡片列表样式
    - 不再嵌套旧的 `CloneRuntimeConsole` 套娃头部结构
  - `/clone` 运行日志仍继续显示现有：
    - 提交日志
    - 接口返回
    - 阶段切换
    - 错误信息
- 使用说明：
  - 在 `/clone` 页面执行分析、生成、同步、合成等操作后，可通过页面右下角 `运行日志` 按钮查看最新运行记录。
  - 不查看日志时，主工作区不再被日志区长期占用。

## 2026-05-30 运行日志弹窗抽为共享组件

- 目标：
  - 将 `/clone` 与 `TikTok 商品上架助手` 已上线的运行日志弹窗抽成真正的共享组件，避免页面内继续复制模板、样式和文案结构，并为后续模特列表、模特详情等页面复用提供统一入口。
- 本轮最小改动：
  - 新增：
    - `src/renderer/src/ui/components/RuntimeLogDialog.vue`
  - 调整：
    - `src/renderer/src/ui/views/CloneView.vue`
    - `src/renderer/src/ui/views/TiktokListingHelperView.vue`
- 生效规则：
  - 运行日志弹窗统一由共享组件负责：
    - 悬浮按钮
    - 激活态圆点
    - 计数
    - 弹窗头部
    - 摘要提示
    - 日志卡片列表
    - 空状态
  - 共享弹窗默认只显示关键运行日志：
    - 生成开始
    - 导出
    - 提交 / 同步 / 下载 / 合成
    - 阶段切换
    - 模型路由
    - 成功 / 失败 / 错误
  - 共享弹窗支持按分类筛选日志：
    - 全部
    - 生成
    - 导出
    - 同步
    - 阶段
    - 模型
    - 错误
    - 其他
  - 类似 `runtime ready`、打开弹窗、查看记录等低价值噪音日志默认不展示。
  - 共享弹窗默认优先展示用户可读的业务摘要，而不是直接显示技术调试原文：
    - 例如模型路由、生成开始、自动同步、下载回写、导出完成等，需转成简明中文说明
    - 用户能直接看懂“系统正在做什么”，不要求理解 `clone-debug / JSON / repo-upsert-project` 这类内部标记
  - `/clone` 视频阶段的日志摘要需尽量带出“第几镜头 + 当前动作”：
    - 例如“第 3 镜头正在继续查询云端进度”
    - “第 5 镜头云端已完成，开始下载回写”
  - 每条日志卡片顶部需带动作标签，至少区分：
    - 提交
    - 查询
    - 下载
    - 阶段
    - 模型
    - 导出
    - 完成 / 失败
  - 页面侧只保留各自：
    - `logs`
    - 弹窗开关状态
    - 业务文案传参
  - `/clone` 与插件页不再各自维护一整套重复日志样式。
- 使用说明：
  - 后续若模特列表、模特详情等页面也需要显示运行日志，可直接复用 `RuntimeLogDialog.vue`，只传：
    - `v-model`
    - `logs`
    - 标题、说明、hint、空状态文案

## 2026-05-30 复刻任务列表页接入运行日志弹窗

- 目标：
  - 为桌面端复刻任务列表页增加与 `/clone`、`TikTok 商品上架助手` 一致的运行日志弹窗入口，便于在列表页直接查看刷新、新建、删除、打开任务以及主进程桥接过来的 `/clone` 运行日志。
- 本轮最小改动：
  - 调整：
    - `src/renderer/src/ui/views/CloneTaskListView.vue`
  - 复用：
    - `src/renderer/src/ui/components/RuntimeLogDialog.vue`
- 生效规则：
  - 复刻任务列表页右下角显示统一的 `运行日志` 悬浮按钮。
  - 列表页日志来源包括：
    - 列表页本地操作日志：
      - 刷新
      - 新建任务
      - 删除任务
      - 打开任务
      - 批量导出
    - `window.api.clone.onRuntimeLog` 桥接过来的 `/clone` 运行日志
  - 日志条数继续采用前端内存截断策略，不新增持久化。
- 使用说明：
  - 在复刻任务列表页执行刷新、新建、删除、打开任务或批量导出后，可直接点击右下角 `运行日志` 查看最新记录。
  - 用户无需先进入详情页，也能先在列表页看到一部分运行上下文。

## 2026-05-30 插件中心新增 TikTok 商品上架助手

- 目标：
  - 在插件中心内新增独立插件 `tiktok-listing-helper`，用于处理 TikTok 商品图生成与店小秘 Excel 模板导出，不并入 `/clone` 与商品库主页面。
- 本轮最小改动：
  - 新增主进程模块：
    - `src/main/modules/tiktok-listing/types.ts`
    - `src/main/modules/tiktok-listing/repo.ts`
    - `src/main/modules/tiktok-listing/service.ts`
  - 新增 IPC：
    - `src/main/ipc/registerTiktokListingIpc.ts`
  - 接入：
    - `src/main/index.ts`
    - `src/preload/index.ts`
    - `src/renderer/src/router/index.ts`
  - 新增桌面插件工作台：
    - `src/renderer/src/ui/views/TiktokListingHelperView.vue`
  - 更新插件定义：
    - `src/main/modules/web-platform/plugins.ts`
    - `src/main/modules/web-platform/types.ts`
- 生效规则：
  - 插件内每条商品记录独立存储，不依赖 `products.json`。
  - 每条记录至少包含：
    - `id`
    - `sourceImagePath`
    - `category`
    - `sku`
    - `localDisplayPrice`
    - `titleLanguage`
    - `generatedTitle`
    - `generatedDescription`
    - `listingImages`
    - `generationStatus`
    - `generatedAt`
    - `createdAt`
    - `updatedAt`
  - 首轮支持分类：
    - `earring`
    - `ring`
    - `necklace`
    - `phone_case`
    - `bracelet`
  - 标题语言首轮支持：
    - `zh-CN`
    - `en-US`
    - `vi-VN`
  - 素材生成链路必须遵守：
    - `reference image` 优先级最高
    - 锁商品结构
    - 不允许 redesign
    - cinematic 不得覆盖 identity
  - 图片提示词已升级为结构化配置：
    - 现有 5 个分类全部启用品类化 + 角度化模板
    - 每个分类固定输出：
      - 1 张主图模板
      - 4 张佩戴/特写角度模板
    - 其中：
      - `earring`、`ring`、`necklace` 使用佩戴型饰品模板
      - `phone_case` 使用设备展示模板
      - `bracelet` 使用腕部佩戴模板
  - 标题与描述提示词也已升级为 5 分类结构化配置：
    - 按分类拆分标题关键词方向
    - 按分类拆分描述重点
    - 明确限制只能写图片里可见的结构、外观、佩戴或使用场景
  - 模型调用路由规则已补齐：
    - `TikTok 商品上架助手` 复用设置页统一模型配置
    - 图片生成严格按 `图片平台 / 图片模型` 设置走，不再在插件内静默回退到其他平台
    - 标题与描述严格按 `对话平台 / 对话模型` 设置走
  - 运行时会输出 `tiktok-listing-model-routing` 调试日志，仅包含：
      - provider
      - profile
      - model
      - baseUrl
    - 调试日志不得输出 API Key
    - 插件页面内需直接显示与 `tiktok-listing` 相关的运行日志：
      - 至少包括生成开始
      - 模型路由日志
      - 生成成功 / 失败
      - 页面展示方式改为右侧悬浮按钮 + 日志弹窗
  - 每次生成固定输出：
    - 1 条商品标题
    - 1 条商品描述
    - 5 张商品上架图
  - 标题限制：
    - 200 字以内
    - 仅输出最终标题
    - 符合 TikTok 电商标题习惯
  - 导出模板严格对齐用户提供的 `earings_template.xlsx`：
    - 工作表名固定为 `Sheet1`
    - 表头顺序固定复用模板全列结构，不再使用裁剪版 10 列导出
    - 当前导出列包含：
      - `*分类id（必填）`
      - `*产品标题（必填）`
      - `*产品描述（必填）`
      - `品牌`
      - `产品属性`
      - `SKU`
      - `变种属性名称一`
      - `变种属性值一`
      - `变种属性名称二`
      - `变种属性值二`
      - `变种属性名称三`
      - `变种属性值三`
      - `识别码类型`
      - `识别码`
      - `*本地展示价(站点币种)（必填）`
      - `*库存（必填）`
      - `*产品主图(URL)地址（必填）`
      - `附图一` 到 `附图八`
      - `视频链接`
      - `尺码图`
      - `变种主题1图片`
      - `*重量(kg)（必填）`
      - `*长(cm)（必填）`
      - `*宽(cm)（必填）`
      - `*高(cm)（必填）`
      - `*仓库名称（必填）`
      - `货到付款`
      - `来源URL`
  - 本轮按 5 张图执行：
    - 主图写入 `*产品主图(URL)地址（必填）`
    - 第 2 到第 5 张图写入 `附图一` 到 `附图四`
    - `附图五` 到 `附图八` 留空
  - 模板默认值：
    - `品牌`：`无品牌`
    - `*库存（必填）`：`45`
    - `*重量(kg)（必填）`：`0.001`
    - `*长(cm)（必填）`：`1`
    - `*宽(cm)（必填）`：`1`
    - `*高(cm)（必填）`：`1`
    - `*仓库名称（必填）`：`Lys`
    - `货到付款`：`是`
  - `*分类id（必填）` 与 `产品属性` 已改为按分类读取固定配置表：
    - 插件页右上角新增 `导出配置` 按钮
    - 点击后以弹窗形式提前维护 5 个分类各自的：
      - `分类ID`
      - `产品属性 JSON`
    - 导出 Excel 时优先使用用户在弹窗内保存的配置
    - 若用户尚未修改，则使用内置默认配置：
      - `earring`：使用桌面导出样本中已确认的耳环配置
      - `ring`：使用 `earings_template.xlsx` 示例行中已确认的戒指配置
      - `necklace`、`phone_case`、`bracelet`：当前先以内置占位配置启动，后续可直接在弹窗中改为真实值
  - 当前无数据来源的模板字段先保持空值：
    - 变种属性相关列
    - `识别码类型`
    - `识别码`
    - `视频链接`
    - `尺码图`
    - `变种主题1图片`
    - `来源URL`
  - 导出内容只写公网 URL，不写 Windows 或 Linux 本地文件路径。
- 使用说明：
  - 入口位于：
    - 插件中心 `TikTok 商品上架助手`
  - 操作顺序：
    - 选择商品实拍图
    - 选择分类
    - 填写 SKU
    - 填写本地展示价
    - 选择标题语言
    - 如需调整导出分类配置，先点击右上角 `导出配置`，保存各分类的 `分类ID / 产品属性 JSON`
    - 保存商品记录
    - 点击“生成素材”
    - 勾选多条商品后批量导出 Excel
  - 导出前如果缺少：
    - SKU
    - 价格
    - 标题
    - 描述
    - 5 张商品图
    系统必须阻止导出并给出明确提示。
  - 若设置的图片平台或对话平台缺少对应 API Key：
    - 插件生成必须直接报错
    - 不允许误切到其他已配置平台继续偷偷生成

## 2026-05-30 分镜视频提交成功态的显式空任务号回写不得清空已绑定 taskId

- 目标：
  - 修复桌面端 `/clone` 分镜视频现场里“主进程已经创建成功并落过 taskId，但后续旧快照又以 `segment_submit_succeeded / remote_running / created` 回写空任务号，导致页面显示已创建却没有任务 ID”的问题。
- 本轮最小改动：
  - 仅调整 `src/main/modules/clone/repo.ts` 的分镜视频持久化合并保护。
  - 新增 smoke：
    - `test/clone-shot-video-submit-succeeded-explicit-reset-keeps-task-binding.smoke.ts`
- 生效规则：
  - 当镜头已经存在有效 `taskId / generatedTaskId`，且后续 incoming 快照同时满足以下特征时，必须保留已有任务绑定：
    - `status` 仍属于 `generating / submitting / remote_pending / remote_running`
    - 或 `remoteStatus` 仍属于 `created / queued / pending / processing / running`
    - 或 `sourceEvent` 仍是 `segment_submit_started / segment_submit_succeeded`
    - 但 incoming 却把 `taskId / generatedTaskId` 显式回写成空值
  - 这类快照如果没有同时携带“明确替换任务”的信号，例如：
    - `previousTaskIds`
    - `submissionStartedAt`
    - `submissionLockedUntil`
    - 新的视频产物路径
    则持久化层必须视为旧快照或弱快照，继续保留已有的：
    - `shotVideoOutputs[].taskId`
    - `blueprint.shots[].generatedTaskId`
  - 目标是避免出现“状态说明里能看出远端已创建，但任务 ID 区域为空”的分裂状态。
- 使用说明：
  - 当镜头已经进入“已创建 / 云端生成中”后，如果后续又收到一份不完整的旧快照，页面下一轮刷新后仍必须继续显示原有任务号，不能把任务号清空成 `--`。

## 2026-05-30 `/clone` 桌面端 workspace client 改为本地优先单入口

- 目标：
  - 修复桌面端 `/clone` 页面在登录态下可能被隐式切到 `web-api`，导致页面状态与本地真实项目快照分裂的问题。
- 本轮最小改动：
  - 调整 `src/renderer/src/lib/cloneWorkspaceClient.ts`
  - 调整 `src/renderer/src/composables/useCloneProjectWorkspace.project.ts`
  - 调整 `src/renderer/src/ui/views/CloneTaskListView.vue`
  - 调整 `src/main/modules/clone/types.ts`
  - 调整 `src/main/modules/clone/service.ts`
  - 新增 smoke：
    - `test/clone-workspace-client-local-preferred-when-token-exists.smoke.ts`
    - `test/clone-project-refresh-full-project-replaces-stale-shot-state.smoke.ts`
- 生效规则：
  - 桌面端 `/clone` 页面统一只走一套 workspace client 入口。
  - 当桌面端存在登录 token 时，不允许再因为“有 token”就隐式尝试 `web-api`。
  - 现在必须先根据本地主进程返回的项目来源字段判断：
    - `ownership=local` 时，固定走 `electron-ipc`
    - `ownership=web` 时，才允许走 `web-api`
  - 本地主进程返回的 clone 项目摘要与详情必须稳定带上：
    - `ownership`
    - `sourceType`
    - `ownerUserId`
  - 本地项目默认写为：
    - `ownership=local`
    - `sourceType=local`
  - 页面拿到完整项目快照后，必须整对象替换当前项目，不能继续做同 id patch 合并。
- 使用说明：
  - 已登录桌面端后再次打开本地 `/clone` 项目，页面应继续以本地项目为真值源，不再出现“本地数据库没有该 taskId，但页面仍显示旧镜头状态”的分裂现象。

## 2026-05-30 桌面端视频阶段运行时刷新必须拉完整项目快照

- 目标：
  - 修复桌面端 `/clone` 分镜视频阶段里“主进程和 sqlite 已经完成下载回写，但当前页面仍停在 `待下载回写 / 下载中` 旧状态”的显示滞后问题。
- 本轮最小改动：
  - 仅调整 `src/renderer/src/composables/useCloneProjectWorkspace.project.ts` 的 `refreshRuntimeProject()`
- 生效规则：
  - 在 Electron 桌面端通道下，运行时刷新不能只拉：
    - `getProjectSummary`
    - `getClonePipelineStatus`
  - 因为这两类摘要信息不包含完整的：
    - `shotVideoOutputs`
    - `blueprint.shots[].generatedTaskId/generatedClipPath`
  - 桌面端视频阶段的 runtime 刷新现在必须优先调用完整 `getProject()`，再合并 runtime pipeline 状态。
  - 对于完整 `getProject()` 返回的桌面端项目快照，渲染层不允许继续只做“同 id 原地 patch 合并”。
  - 这类完整快照必须按整对象替换当前项目，避免旧的 `shotVideoOutputs / blueprint.shots` 残留字段继续挂在页面上。
  - 目标是保证当主进程已经把镜头落成：
    - `status=done`
    - `videoPath/localPath` 已存在
    页面不会继续挂着旧的 `remote_succeeded_pending_download / downloading` 本地快照。
- 使用说明：
  - 当现场日志或 sqlite 已确认某条分镜视频已经下载完成并回写本地文件后，页面在下一轮自动刷新内应直接变成“已完成”，不能继续长期显示“待下载回写”。

## 2026-05-30 已补回 taskId 的分镜视频绑定不得被旧终态快照回滚

- 目标：
  - 修复桌面端 `/clone` 现场里“某条分镜视频已经人工或自动补回 `taskId`，但运行中的旧内存快照又把它覆盖回 `failed_terminal + 缺 taskId`”的问题。
- 本轮最小改动：
  - 仅调整 `src/main/modules/clone/repo.ts` 的分镜视频持久化合并保护。
  - 新增 smoke：
    - `test/clone-shot-video-repaired-missing-task-binding-persists.smoke.ts`
- 生效规则：
  - 当镜头已经存在有效 `taskId`，且同时满足以下任一条件时，必须视为“已有远端任务绑定事实”，后续弱快照不允许再把它冲掉：
    - `status=failed_retryable`
    - `remoteStatus/remoteRaw.status` 仍属于 `created/queued/pending/processing/running`
    - 已有 `videoUrl/videoPath/localPath`
  - 对这类镜头，如果后续 incoming 快照表现为：
    - 没有 `taskId`
    - 没有本地视频产物
    - 仅把状态回写成 `failed_terminal` 或其他更弱状态
    则持久化层必须继续保留旧的：
    - `taskId`
    - `failed_retryable` 或更强的可恢复状态
    - `remoteStatus`
  - 蓝图层 `blueprint.shots[].generatedTaskId` 也必须应用同样保护，不能被无任务号旧快照清空。
- 使用说明：
  - 当现场已经确认远端任务真实存在，并把任务号补回项目后，即使桌面端里还有旧 worker/旧页面快照继续回写，这条镜头也必须继续保留为“可查询/可恢复”，不能再次退回“请重新生成”的假终态。

## 2026-05-30 分镜视频自动续查优先命中待回写镜头

- 目标：
  - 修复桌面端 `/clone` 分镜视频阶段里“界面仍在自动刷新，但 `结果下载中 / 待下载回写 / 待继续查询` 镜头长时间不推进”的问题。
- 本轮最小改动：
  - 仅调整 `src/renderer/src/ui/views/CloneView.vue` 的视频阶段自动续查派发策略。
  - 更新 smoke：
    - `test/clone-shot-video-auto-remote-sync.smoke.ts`
- 生效规则：
  - 视频阶段定时器触发自动续查时：
    - 只要存在 `hasRemotePendingShotSync=true` 或 `autoVideoPendingCount > 0`
    - 必须优先执行 `syncPendingShotVideos('auto_timer_sync')`
    - 不再只走整体 `refreshRemoteStatus('auto_timer_sync')`
  - 只有在当前处于视频阶段、但前端未识别到明确待回写镜头时，才回退到项目级 `refreshRemoteStatus('auto_timer_sync')`。
  - 自动续查 runtime log 需补充 `mode` 字段，明确区分：
    - `pending_shot_sync`
    - `project_reconcile`
- 使用说明：
  - 当列表里出现：
    - `结果下载中`
    - `待下载回写`
    - `待继续查询`
    且页面停留在分镜视频阶段时，系统现在会优先逐条继续查询/下载这些镜头，而不是只刷新项目快照或只做整项目 reconcile。
  - 现场日志可直接看：
    - `video-stage:auto-remote-sync-dispatch`
    - 其中 `mode=pending_shot_sync` 代表本轮已经命中待回写镜头闭环。

## 2026-05-30 分镜视频自动续查解耦全局 loading 与蓝图任务扫描补齐

- 目标：
  - 修复桌面端 `/clone` 分镜视频阶段里“用户做了别的操作后自动续查停摆”以及“任务号只存在于 `blueprint.shots.generatedTaskId` 时自动续查漏扫”的问题。
- 本轮最小改动：
  - 调整 `src/renderer/src/composables/useCloneProjectWorkspace.video.ts`
  - 调整 `src/renderer/src/ui/views/CloneView.vue`
  - 新增 smoke：
    - `test/clone-shot-video-pending-scan-includes-blueprint-task.smoke.ts`
- 生效规则：
  - `auto_timer_sync / auto_download_recovery` 不再切换页面全局 `loading`。
  - 视频阶段定时器触发自动续查时，也不再要求 `!loading.value` 才能发起。
  - 待回写镜头扫描不再只依赖 `shotVideoOutputs[]`。
  - 现在必须统一合并：
    - `shotVideoOutputs[].taskId`
    - `blueprint.shots[].generatedTaskId`
  - 只要镜头尚无本地 `videoPath`，且状态属于待恢复集合，哪怕输出快照缺项，自动续查也必须能命中该镜头。
- 使用说明：
  - 当镜头在列表里尚未完整落出 `shotVideoOutputs`，但蓝图层已经保留了 `generatedTaskId` 时，页面自动续查和“手动查询待回写”现在都应继续能扫到该镜头。
  - 即使用户正在做页面内其他操作，后台自动续查也不应因为全局 `loading` 被整个卡住。

## 2026-05-30 分镜视频缺任务号恢复分支降级为可重试保活

- 目标：
  - 修复桌面端 `/clone` 分镜视频阶段里“云端疑似已接单，但本地尚未回写 `taskId` 时，很快被 reconcile 打成终态失败”的问题。
- 本轮最小改动：
  - 仅调整 `src/main/modules/clone/service.ts` 的 `reconcileRemoteStoryboardVideosInternal(...)` 缺任务号分支。
  - 新增 smoke：
    - `test/clone-shot-video-reconcile-missing-task-pending-keeps-retryable.smoke.ts`
- 生效规则：
  - 当镜头缺少 `taskId`，但满足以下任一条件时，不再直接落成 `failed_terminal`：
    - `remoteStatus / remoteRaw.status / remoteRaw.data.status` 仍属于 `created / queued / pending / submitted / processing / running`
    - `sourceEvent === 'segment_submit_started'`
    - 已存在非空 `remoteStatus`
  - 这类镜头现在必须优先落成：
    - `shotVideoOutputs[].status = failed_retryable`
    - `error` 保留缺任务号语义
  - 这样自动恢复保活判断仍能继续接住这类镜头，而不是因为一次本地缺任务号就过早终止整条恢复链。
- 使用说明：
  - 当现场日志显示远端仍是 `created / processing / running`，但本地还没有 `taskId` 时，系统现在会先保留为“可继续恢复”的缺任务号状态，而不是立即要求用户手动重生全部镜头。

- 补充说明：
  - 如果缺任务号后的自动 `forceRegenerate` 失败原因属于本地前置条件不足，例如：
    - `未提交视频模型请求`
    - 缺少产品参考图 / 产品锁定信息
    - 缺少首帧
    - 缺少尾帧
  - 则这类错误现在必须直接归类为 `failed_terminal + [local_failed]`，不再继续走“缺任务号可重试保活”。
  - 目标是避免本地素材条件根本不满足时，后台还反复自动恢复造成无意义重试。

## 2026-05-30 分镜视频创建响应顶层 `id` 任务号解析修复

- 目标：
  - 修复桌面端 `/clone` 点击“重新生成”后，远端接口实际已成功创建视频任务，但本地没有识别出 `taskId`，从而误判成“缺少任务号 / 本地失败”的问题。
- 本轮最小改动：
  - 仅调整 `src/main/modules/clone/unifiedVideo.ts` 的 `pickTaskId(...)`
  - 新增 smoke：
    - `test/clone-shot-video-pick-task-id-top-level-id.smoke.ts`
- 生效规则：
  - 视频创建响应的任务号解析必须按“候选字段逐个取第一个非空值”的方式进行，不能再因为某个中间候选是空字符串，就提前截断整个链路。
  - 必须显式支持顶层返回：
    - `id`
    - `taskId`
    - `task_id`
  - 也必须继续支持：
    - `data` 直接是字符串任务号
    - `data.id / data.taskId / data.task_id`
- 使用说明：
  - 当供应商返回类似：
    - `{ "id": "veo_3_1-fast-4K:task_xxx", "status": "queued" }`
    时，本地现在必须直接把该 `id` 识别成任务号并写入项目，而不能再进入“缺 taskId”的错误分支。

## 2026-05-29 分镜视频自动续查闭环与状态口径统一

- 目标：
  - 修复桌面端 `/clone` 分镜视频阶段里“界面持续刷新，但云端查询不继续推进，必须用户反复手动点同步/继续查询”的中断问题。
- 本轮最小改动：
  - 调整 `src/renderer/src/ui/views/CloneView.vue` 的视频阶段定时器与待续查状态判断。
  - 调整 `src/renderer/src/composables/useCloneProjectWorkspace.video.ts` 的云端同步入口日志与静默自动续查行为。
  - 新增 smoke：
    - `test/clone-shot-video-auto-remote-sync.smoke.ts`
    - `test/clone-shot-video-pending-status-unified.smoke.ts`
- 生效规则：
  - 视频阶段定时器不再只做 `loadProject/refreshRuntimeProject` 刷新；当满足以下任一条件时，必须自动触发一次真实云端续查：
    - 当前可见阶段是 `video`
    - 存在 `hasRemotePendingShotSync`
    - 存在 `autoVideoPendingCount > 0`
  - 自动续查必须限流：
    - 本地存在 `autoRemoteSyncInFlight`
    - 最短触发间隔固定为 `25_000ms`
    - `loading=true` 时禁止重入
  - 自动续查失败时只记录 runtime log，不弹窗、不覆盖用户当前操作。
  - 前端待续查状态统一按以下集合判断：
    - `idle`
    - `submitting`
    - `remote_pending`
    - `remote_running`
    - `remote_succeeded_pending_download`
    - `downloading`
    - `polling_timeout`
    - `failed_retryable`
  - 上述状态只在镜头存在有效 `taskId` 且本地还没有 `videoPath` 时，才视为“可继续自动/手动续查”。
  - `继续查询当前镜头`、`手动查询待回写`、自动续查计数与自动续查触发条件，必须共用同一套状态口径，避免前端刷新与主进程续查判断分裂。
- 使用说明：
  - 当镜头停在 `云端生成中 / 待继续查询 / 待下载回写 / 下载中 / 待重试` 且仍保留有效 `taskId` 时，页面在视频阶段停留 30-60 秒内应自动发起后台续查，而不再只是刷新本地项目快照。
  - 运行日志现在必须能看到：
    - `shot-video-sync:start/done/failed`
    - `shot-video-pending-sync:start/done/failed`
    - `video-stage:auto-remote-sync-dispatch`
  - 其中日志会带：
    - `source`
    - `shotCount`
    - `syncedCount`
    - `pendingCount`
    便于现场区分“有没有发起续查”与“发起了但远端仍在 running”。
  - 对于 `sourceEvent=segment_submit_started`、`remoteStatus=created/queued/pending/processing/running`、但过了提交保护窗口仍没有 `taskId` 的镜头，不再直接落成 `failed_terminal`。
  - 如果创建任务当下就出现“供应商已返回成功响应，但本地仍未解析到 `taskId`”：
    - 创建阶段不允许抹掉 `remoteStatus`
    - `sourceEvent` 仍必须保留为 `segment_submit_started`
    - `submissionStartedAt / submissionLockedUntil` 不能在该分支提前清空
  - 这样后续自动 reconcile 才能识别这是一条“远端已受理但任务号缺失”的可恢复链路，而不是在创建阶段把它提前写死。
  - 对于 `remote_succeeded_pending_download / downloading` 状态，如果镜头已经带有有效 `videoUrl`，前端自动续查与手动“查询待回写”都必须继续纳入处理，即使当前 `taskId` 缺失也不能跳过。
  - 这类镜头的自动恢复应优先直接走下载回写分支，而不是因为“没有 taskId”被排除在自动流程外。
  - 后台 reconcile 必须优先执行一次 `forceRegenerate` 自动补救；只有补救仍拿不到 `taskId`，才允许继续进入终态失败。
  - 这样可覆盖现场常见的“云端明显已受理/created，但创建响应未回写 taskId，导致自动续查整条链路被过早判死”的情况。
  - 自动流程保活判断也必须把这类镜头视为“仍有待恢复工作”：
    - `status=failed_terminal`
    - `failureType=missing_task`
    - `sourceEvent=segment_submit_started`
    - `remoteStatus` 仍属于 `created/queued/pending/processing/running`
  - 满足以上条件时：
    - `hasPendingRemoteStoryboardVideoWork(...)` 必须返回 `true`
    - `shouldContinueAutoStoryboardVideos(...)` 必须返回 `true`
  - 这样自动流程不会因为一次“缺 taskId 的假终态”就提前退出 `storyboard_videos` 阶段。

## 2026-05-29 分镜视频缺任务号与自动回写中断补修

- 目标：
  - 修复桌面端 `/clone` 分镜视频阶段里“单个镜头停在 `created` 但没有 taskId”以及“其他镜头已成功但不自动下载回写，必须手动查询待回写”的问题。
- 本轮最小改动：
  - 调整 `src/main/modules/clone/unifiedVideo.ts` 的任务号解析。
  - 调整 `src/main/modules/clone/service.ts` 的单次远端续查收尾逻辑。
  - 新增 smoke：
    - `test/clone-shot-video-pick-task-id-string-data.smoke.ts`
    - `test/clone-shot-video-single-pass-running-does-not-timeout.smoke.ts`
- 生效规则：
  - 视频创建响应若出现 `data` 本身就是字符串任务号的格式，也必须被识别并写入本地 `taskId`。
  - 分镜视频后台 `continueShotVideoResultFlow(...)` 在 `waitMs=0` 的单次续查模式下，如果远端仍是 `running/processing/created`，只能保持 `remote_running`，不能误判成 `failed_retryable / polling timeout`。
  - 这样后台 reconcile 才能持续接力下一轮轮询，直至拿到 `videoUrl` 并自动转入下载回写。
- 使用说明：
  - 如果镜头状态显示 `云端生成中 / created / 重试 0/2`，但界面没有任务号，后续应优先查看创建响应是否是“`data` 直接返回任务号字符串”的供应商格式。
  - 如果镜头已经有任务号且远端仍在运行，后台不能再因为一次单次轮询没完成就把镜头错误打成“超时失败”，否则自动下载链会被中断。

## 2026-05-29 分镜图提示词改为“服从参考图，禁止重建”

- 目标：
  - 收紧桌面端 `/clone` 分镜图片提示词，避免继续向模型传递“理解画面、重新生成场景”的语义。
- 本轮最小改动：
  - 仅调整 `src/main/modules/clone/gptImage.ts`。
  - 不改供应商 API，不改任务调度，不扩展到别的生成阶段。
- 生效规则：
  - 分镜图片 prompt 必须明确强化：
    - `Do not reconstruct or reinterpret the scene.`
    - `Treat the image as final visual truth, not a scene to recreate.`
    - `Continuity must adapt to product, not vice versa.`
  - 参考优先级必须进一步锁死：
    - 产品结构优先于 continuity
    - 产品结构优先于 model fitting
    - cinematic 风格不得覆盖 identity
- 使用说明：
  - 当耳环等高一致性商品进入分镜图阶段时，prompt 的目标是“服从参考图并延续视觉事实”，而不是“理解并重画场景”。

## 2026-05-29 分镜视频首尾帧提交补全与缺任务号排查日志补强

- 目标：
  - 修复桌面端 `/clone` 分镜视频阶段中，最后一个分镜经常进入 `created / 云端生成中` 但没有 `taskId` 的问题。
  - 重点覆盖 `video_start_end_to_video` 提交链，避免首尾帧模式下只发首帧、漏发尾帧，导致云端返回异常或任务号缺失。
- 本轮最小改动：
  - 仅调整 `src/main/modules/clone/service.ts` 中 `ensureAi666SegmentVideoTask(...)` 的提交参数组装与提交前调试日志。
  - 新增 smoke：`test/clone-shot-video-start-end-submit-includes-last-image.smoke.ts`
- 生效规则：
  - 当镜头走 `video_start_end_to_video` 时，如果本地已存在 `lastFramePath`，提交到云端的创建请求必须真实携带尾帧图片 URL，不能再写成 `lastImage: undefined`。
  - 若 `lastFramePath` 与 `firstFramePath` 相同，允许复用首帧上传结果作为尾帧；若不同，必须单独上传尾帧并作为 `lastImage` 发送。
  - 提交前日志 `create-vectorengine-video-task:start` 现在必须补充以下字段，便于现场直接核对：
    - `hasLastFramePath`
    - `localLastFramePath`
    - `uploadedLastImage`
    - `lastImageSent`
- 使用说明：
  - 当最后一个分镜再次提交时，若现场日志里看到：
    - `capability: "video_start_end_to_video"`
    - `hasLastFramePath: true`
    - `lastImageSent: true`
    则说明首尾帧已经都发出，此时若仍缺 `taskId`，应继续排查供应商返回结构，而不是本地漏传尾帧。
  - 若日志里 `hasLastFramePath: true` 但 `lastImageSent: false`，说明本地提交链仍有异常，需要优先检查尾帧路径或上传环节。

## 2026-05-29 分镜视频任务事实保活与下载续跑补强

- 目标：
  - 修复桌面端 `/clone` 分镜视频阶段中，远端任务实际仍可继续查询或已可下载，但本地 `shotVideoOutputs.taskId/status` 被旧快照冲掉，导致自动续查、自动下载中断，只能手动点“继续查询回写”的问题。
- 本轮最小改动：
  - 仅调整 `src/main/modules/clone/repo.ts` 的分镜视频持久化合并保护。
  - 新增 smoke：`test/clone-shot-video-task-binding-regression-guard.smoke.ts`
- 生效规则：
  - 如果镜头当前已经存在有效视频任务绑定（例如已有 `taskId`，且状态为 `remote_running / downloading / remote_succeeded_pending_download`，或已经带有 `videoUrl/videoPath/localPath`），后续无 `taskId`、无 `videoUrl`、无本地视频路径的弱快照，不允许再把这条绑定事实冲掉。
  - 这类弱快照即使 `updatedAt` 更晚，也只能补充无关字段，不能把镜头从“可继续自动恢复”降级成“无任务号 / failed_terminal / 空状态”。
  - 目标是保证后台自动续查、自动下载始终有稳定抓手，不再因为一次旧回写把任务号丢失后整条链路中断。
- 使用说明：
  - 当镜头已经进入 `remote_running / downloading / remote_succeeded_pending_download` 后，即使中途有旧 worker、旧轮询、旧空快照回写，任务号仍应保留，后续点击“同步云端状态”或页面自动恢复时能继续推进到下载回写。
  - 若项目当前仍处于 `autoFlowStatus.status=running` 且 `currentStage=storyboard_videos`，后台远端恢复在每轮 reconcile 结束后，只要仍存在可恢复镜头，就必须继续自调度，不允许因为前端离开页面或某一轮空转后直接停掉。
  - 分镜视频后台 reconcile 每轮处理单镜头时，必须重新从最新项目快照里取 `currentShot/currentOutput`，不能继续沿用循环开始时的旧 `shot` 快照。
  - 这样即使上一轮 worker 已经补回了：
    - `shotVideoOutputs.taskId`
    - `shotVideoOutputs.videoUrl`
    - `blueprint.shots.generatedTaskId`
    后续本轮 reconcile 也不会因为还拿着旧 `shot` 而误判成“缺 taskId / 继续 remote_running / 不触发下载”。
  - 如果镜头仍处于提交保护窗口，即 `submissionLockedUntil > now()`，即使当前 `taskId` 还没回写，也不能在 reconcile 中立刻判成 `missing_task / failed_terminal`。
  - 这类状态必须继续保留为远端运行中，等待任务号回写或下一轮后台恢复接管，避免用户刚打开页面就把“正在提交中的镜头”误杀掉。
  - 现场日志 `shot-video-reconcile:inspect` 现在必须同时打印：
    - `outputTaskId`
    - `blueprintTaskId`
    - `taskId`
    方便对照到底是哪一层任务事实丢了，还是只是本轮仍在消费旧快照。
  - 如果镜头已存在有效 `taskId/generatedTaskId`，后续晚到的“仅带 `remoteStatus=created/queued/pending/processing/running` 但不带 taskId 的远端进行中快照”，不允许把任务号冲成空。
  - 这类快照只能补状态字段，不能把 UI 从“可继续查询的云端任务”降级成“云端生成中但无任务号”的半残状态。
  - 当镜头状态处于 `downloading / remote_succeeded_pending_download`，如果系统标准落盘路径已经存在有效本地视频文件：
    - `viral-clone/<projectId>/shots/<shotId>/generated_clip.mp4`
    - 或 `viral-clone/<projectId>/scene_videos/<shotId>.mp4`
    则后台 reconcile 必须直接自愈回 `done`，不能继续卡在“结果下载中 / 待下载回写”。
  - 仅系统标准落盘路径允许触发这类自愈；任意外部旧路径、临时路径、随机历史路径，不允许在 `downloading` 阶段被误判为当前镜头已完成，避免把陈旧文件错误回灌到新任务。
  - 命中这条自愈链时，主进程必须输出：
    - `shot-video-local-self-heal:done`
    便于现场确认是“远端已成功且本地已落盘，状态正在自动收尾”。

## 2026-05-28 分镜视频提示词面板补充请求参数预览

- 目标：
  - 让桌面端 `/clone` 分镜视频阶段在“提示词预览”弹窗内直接展示本次视频请求的构造参数，方便复制核对实际发送日志格式。
- 本轮最小改动：
  - 仅调整 `src/main/modules/clone/service.ts` 与 `src/renderer/src/ui/views/CloneView.vue`。
  - 不触发真实上传，不改变提交链路，不修改供应商 API 行为。
- 生效规则：
  - 分镜视频提示词预览中新增：
    - 请求元信息：`provider / model / capability / endpointStyle / createUrl`
    - 本地素材来源：`localFirstFramePath / localLastFramePath`
    - 请求体预览：按当前供应商分支生成、接近实际发送结构的 JSON
    - 调试日志预览：对齐现有提交前日志中的关键字段，如 `referenceImageCount / fallbackCandidates`
  - 请求体预览里的图片 URL 不做真实上传，统一以 `UPLOAD_ON_SUBMIT::文件名` 占位，明确表示“提交时才会上传并替换成真实公网 URL”。
- 使用说明：
  - 在桌面端 `/clone` 进入分镜视频阶段，打开任一镜头的“视频 prompt 预览”后，可以直接复制：
    - `Video Request Payload (Preview)`
    - `Video Request Debug Log (Preview)`
  - 该预览用于排查“我到底发了什么参数”，不会额外发起远端任务。
- Windows / Linux 兼容说明：
  - 本轮仅补充 TypeScript 预览组装与前端展示，路径展示基于现有 Node 逻辑，Windows 开发与 Linux 部署兼容。

- 补充说明：
  - 分镜图片提示词预览也同步增加请求 JSON 展示：
    - `Image Request JSON (Start)`
    - `Image Request JSON (End)`
  - 分镜视频提示词预览新增更贴近人工排查的 `Video Request JSON`，字段统一包含：
    - `aspectRatio`
    - `prompt`
    - `negativePrompt`
    - `urls`
    - `model`
    - `webHook`
  - 分镜图片请求 JSON 中的 `urls` 必须与真实分镜图生成入参一致，除商品图和模特图外，还要包含第 3 张分镜参考图或连续性参考图，避免预览与真实发送参数不一致。
  - 分镜视频 prompt 中不允许继续输出模特的具体文字外观描述；只允许声明“模特参考图是唯一人物身份源”，人物身份由绑定模特参考图承担，不再用文本重述。
  - 自动模式下，只要参考分析完成且商品图、模特已绑定，主进程必须直接后台触发后续自动链路（脚本候选 -> 选脚本 -> 分镜图 -> 分镜视频 -> 最终门禁/成片），不再依赖当前 `/clone` 页面继续停留。
  - 自动模式下，如果参考分析已完成，但商品图或模特是在之后补绑成功，主进程也必须在以下入口成功后自动后台续跑：
    - 绑定商品库商品
    - 保存/同步商品图
    - 选择模特
  - 分镜视频生成阶段改为“单分镜参考图直驱”：
    - 只允许向视频模型传 1 张分镜参考图
    - 不再传商品图、模特图、analysis board、多角度图到视频模型
    - 视频 prompt 不再输出产品描述和模特描述，只保留最小执行语义，避免文本重建 identity
    - 视频 prompt 默认收敛为极简多行结构：参考图、产品保持、分镜视觉、运镜、平光、无闪光、最小动作
  - 分镜视频请求参数预览中的 `urls` 顺序固定为：
    - 第 1 张：商品图
    - 第 2 张：模特图
    - 第 3 张：分镜图
  - 分镜视频真实提交链路改回“单分镜图直驱”：
    - 实际发送时只上传分镜图，不再上传商品图和模特图到视频模型 `urls`
    - 预览 JSON 与真实提交参数必须一致，`urls` 只保留当前分镜图
  - 分镜视频英文 prompt 默认使用简短职责说明：
    - 优先级固定为：`image_consistency > product_integrity > camera_motion > script`
    - 分镜图是最终视觉真相，脚本在视频阶段只能作为镜头辅助，不能再主导物体动作、模特动作或场景重建
    - `Use reference image as visual guide.`
    - `Preserve product appearance.`
    - `Scene: Extreme close-up of ear and earring.`
    - `Very subtle movement only, maintaining original viewing angle.`
    - `No new angles or hidden parts revealed.`
    - `Camera: Slow, stable movement only.`
    - `No perspective change.`
    - 视频最终 prompt 不再拼接 `Storyboard script: ...`，避免脚本文案中的“rotate / reveal / angle shift / structure detail”类语义重新引入结构重建风险。
    - 不允许在视频 prompt 中继续强调 `reveal structure / hidden parts / angle shifts / hinged structure / curved post` 这类会诱发模型补全新结构和重建新角度的描述。
    - 默认应约束为“原视角附近的极轻微变化”，避免把单张参考图误用成 3D 旋转任务。
  - 脚本候选生成阶段也必须直接产出英文 `scriptText`：
    - 整片脚本候选生成 prompt 的输出语言固定为 English
    - 每个 `shotScripts[].scriptText` 必须是英文句子，不能输出中文或越南语
    - 候选写回项目时仍需再次做英文归一化，避免偶发非英文内容漏入后续分镜图/分镜视频链路
  - 脚本变体生成新增“安全过滤 + 稳定性优先”机制：
    - 允许的核心语义只保留：`zoom / pan / static / close-up / focus / framing / camera`
    - 禁止高风险语义：`turn / rotate / swing / touch / wear / reveal / hidden parts / structure / shine / sparkle / luxury / premium`
    - 变体生成后必须先做本地安全过滤和自动修复，再进入默认候选选择
    - 默认选变体时，稳定性优先级必须高于表现力，宁可更保守，也不要触发产品结构重建
  - 分镜图片生成失败后必须自动最多重试 2 次：
    - `generateGptShotFrames(...)` 入口自身就要具备 2 次自动重试能力，不能只在整流程自动运行时才重试
    - 连续失败达到 2 次后停止继续自动重试，并保留失败状态供用户手动重试
  - 分镜图片区需要支持“批量查询未完成分镜”：
    - 对没有 `imagePath` 且没有最终失败错误的分镜，允许用户一键批量继续查询/补齐
    - 批量查询只处理未完成项，不允许重复覆盖已完成分镜
    - 查询完成后必须同步刷新 `storyboardFrames` 列表状态，便于直接进入后续分镜视频阶段
  - 分镜图片等待刷新不能被“别的旧成功分镜”提前短路：
    - 单镜重生成或单镜补查时，前端等待逻辑必须按目标 `shotId` 判断成功，不允许项目里已有其他分镜图就直接返回旧快照
  - 重新打开分镜设计页时，必须自动恢复本地已落盘但未回填的分镜图：
    - 如果 `viral-clone/<projectId>/shots/<shotId>/gpt-frames/` 下已经存在 `gpt_first_*` 分镜文件，而库里的 `gptFirstFramePath/storyboardFrames.imagePath` 仍缺失，`getProject()` 必须先补回这些字段再返回给前端
  - 批量“查询未完成分镜”时，也必须先恢复本地已落盘分镜图：
    - 如果目标 `shotId` 在本地 `gpt-frames/` 下已经有 `gpt_first_*` 文件，批量查询入口必须直接补回库字段并返回成功，不允许继续停留在 `generating/待生成`

## 2026-05-27 分镜视频任务链路单一调度中心收口重写

- 目标：
  - 收紧桌面端 `/clone` 分镜视频生成链路，先消除“读取项目即自动补查、前端自动补查、后台恢复链并发写状态”造成的互相打架。
  - 将分镜视频运行时展示改为由主进程统一汇总，避免 `generationQueue.runtime` 长期残留假活跃数。
- 本轮最小改动：
  - 新增 `src/main/modules/clone/shotVideoOrchestrator.ts` 作为镜头级任务调度运行时注册表。
  - 调整 `src/main/modules/clone/projectWorkspace.ts`，`getProject()` 改为纯读，不再触发视频自动恢复/自动补查。
  - 调整 `src/main/modules/clone/service.ts`，项目返回前现场计算分镜视频 runtime 摘要，并让关键 `submit/poll/download` 路径接入镜头级调度注册。
  - 调整 `src/renderer/src/ui/views/CloneView.vue`，移除页面自动 `syncPendingShotVideos` 触发，并停止从 `blueprint.shots.generatedClipPath` 本地反推“已完成”。
- 生效规则：
  - `getProject()` 只返回当前项目快照与只读 runtime 摘要，不再偷偷触发提交、轮询、下载。
  - 前端视频区只优先消费 `shotVideoOutputs`，不再在远端待完成阶段用旧 `generatedClipPath` 补回完成态。
  - 页面自动刷新仍允许调用 `getProject()`，但不再驱动任何视频任务状态推进。
  - 关键视频 worker 路径会把 `submit/poll/download` 活跃态登记到镜头级调度注册表，返回给前端的 runtime 摘要优先基于真实镜头状态与当前 in-flight registry 现场计算。
- 使用说明：
  - 点击“重新生成视频”或“继续查询”后，状态推进仅由主进程命令入口驱动；页面刷新不会再额外创建并发补查链。
  - 若镜头仍处于 `submitting / remote_pending / remote_running / downloading`，界面不应再因为旧本地视频路径而瞬时回到“已完成”。

## 2026-05-27 桌面端 clone 主流程自动阶段切换补强

- 目标：
  - 修复桌面端 `/clone` 中“脚本候选已生成但界面未自动切到分镜设计”、“分镜图已生成但界面未自动切到分镜视频”的阶段停滞问题。
- 本轮最小改动：
  - 仅调整 `src/renderer/src/ui/views/CloneView.vue` 的阶段切换时机。
  - 不修改 IPC 名称，不改主进程任务语义，不扩展到图片/视频状态机。
- 生效规则：
  - 点击“分析脚本”后，只要商品和模特已绑定，仍会自动继续触发脚本候选生成。
  - 脚本候选生成命令完成后，页面先等待一次 Vue 响应式刷新，再切换到 `grid` 阶段；若当前项目还没有分镜图结果，则继续自动触发分镜图生成。
  - 分镜图生成命令完成后，页面先等待一次 Vue 响应式刷新，再切换到 `video` 阶段；若当前项目还没有真实的视频任务或本地视频结果，则继续自动触发分镜视频提交。
  - 若分镜图阶段末尾的直接衔接因响应式时序或刷新覆盖未触发，页面在进入 `video` 阶段后也会执行一次单次自动补提交，保证“切到分镜视频但没发起远端提交”的情况被补救。
  - 自动补提交 watcher 必须同时关注 `visibleStageKey` 与 `loading`；若首次进入 `video` 阶段时仍处于 `loading=true`，待 `loading=false` 后必须重新评估并补触发提交，不能因为第一次跳过后永久失效。
  - 分镜视频列表只以 `shotVideoOutputs` 真实任务事实为准；没有 `taskId / videoPath / 非 idle 状态` 的镜头，默认显示为未开始，不允许再从分镜图的 `generatedTaskId` 误推成“云端生成中”。
  - 阶段切换只基于当前项目快照中的真实 `scriptVariantCandidates` 与 `storyboardFrames.imagePath`，不依赖额外 watcher 补驱动。
- 使用说明：
  - 用户不需要再额外点击“从当前阶段开始运行”来完成“分析脚本 -> 脚本候选 -> 分镜设计出图 -> 分镜视频”的相邻阶段衔接。
  - Windows 开发与 Linux 部署均只依赖现有 Vue 响应式与 IPC 返回，不引入平台相关实现差异。

## 2026-05-27 分镜视频提交 taskId 识别补强

- 目标：
  - 修复桌面端 `/clone` 分镜视频提交后，远端已返回任务标识但本地未识别，最终整批镜头误落为“缺少任务号”的问题。
- 本轮最小改动：
  - 仅调整 `src/main/modules/clone/unifiedVideo.ts` 的视频创建响应解析与诊断日志。
- 生效规则：
  - 视频创建响应在原有 `task_id / taskId / request_id / requestId / id` 基础上，额外识别 `task.id / job_id / prediction_id / result.id / video_id` 等常见字段。
  - 若响应既没有可识别任务号，也没有直出视频地址，主进程会输出 `create-video-task:missing-task-id` 调试日志，并携带原始响应结构，便于继续定位供应商返回格式。
- 使用说明：
  - 再次触发“分镜图 -> 分镜视频”自动推进时，如果供应商实际上已经返回任务号，本地应直接进入 `submitting / remote_running`，不再整批显示“缺少任务号”。

## 2026-05-28 分镜视频持久化并发合并收紧

- 目标：
  - 修复桌面端 `/clone` 分镜视频在同一项目多 worker 并发写库时，晚到旧快照覆盖新镜头状态，导致 `shotVideoOutputs` 丢失、任务号回退、界面显示“没提交/已完成/进行中”乱跳的问题。
- 本轮最小改动：
  - 仅调整 `src/main/modules/clone/repo.ts` 中 `mergeShotVideoOutputsForPersistence(...)` 与 `normalizeProject(...)` 的分镜视频持久化归一逻辑。
  - 新增 smoke：
    - `test/clone-shot-video-persistence-concurrent-merge.smoke.ts`
    - `test/clone-shot-video-latest-replacement-task-only.smoke.ts`
- 生效规则：
  - `shotVideoOutputs` 持久化合并必须按 `shotId` 做稳定并集，不能只按本次 `incoming` 列表覆盖。
  - 晚到旧 worker 的空数组、残缺数组、旧 `taskId`、旧状态，不能抹掉其他镜头已经写入的新状态。
  - 同一镜头若当前库中已存在更新的 replacement task，则旧轮询/旧提交结果不得把 `taskId/sourceEvent/updatedAt/status` 回退到旧任务。
  - `normalizeProject()` 重新组装 `shotVideoOutputs` 时，必须保留 `taskId/previousTaskIds/remoteStatus/remoteRaw/videoUrl/sourceEvent/submissionStartedAt/submissionLockedUntil` 等主状态字段，避免读取后再次丢事实。
- 使用说明：
  - 分镜视频真实提交后，即使多个镜头同时并发提交/轮询/下载，项目库里的 `shotVideoOutputs` 也应稳定保留全部镜头，不再出现“远端明明已提交，但本地又显示没有 taskId/没有提交”的回退现象。

## 2026-05-28 分镜视频提示词回退到接近 v2 强锁

- 目标：
  - 修复桌面端 `/clone` 分镜视频在耳环等高一致性商品上，因视频 prompt 过度压平材质、弱化参考图主导权，导致“结构近似但已不是同一商品”的问题。
- 本轮最小改动：
  - 仅调整 `src/main/modules/clone/prompt.ts` 的视频正向 prompt 生成逻辑。
  - 新增 smoke：`test/clone-shot-video-jewelry-prompt-v2-lock.smoke.ts`。
- 生效规则：
  - 分镜视频 prompt 恢复接近 `release: v2.0.0` 的强锁骨架，重新强调：
    - `reference images are the single source of truth`
    - `product must be directly reused, NOT recreated`
    - `REFERENCE DOMINANCE`
    - `If the product changes in any way: STOP generation`
  - 删除会破坏商品材质身份的过强覆盖词：
    - `Force non-jewelry matte coated appearance`
    - `No metallic behavior`
    - `No crystal behavior`
    - `Treat the object as a painted solid material`
  - 继续保留必要的 anti-glow 负向限制，但只压制夸张发光/闪爆，不再把正常金属、宝石、镜面材质本身一起抹掉。
- 使用说明：
  - 后续重新生成耳环等饰品分镜视频时，模型应优先保持“同一商品 + 同一结构 + 同一材质识别”，而不是仅保留大致轮廓后把材质压成泛化的哑光物体。

## 2026-05-28 商品标准源图并入分镜视频输入链

- 目标：
  - 修复桌面端 `/clone` 分镜视频阶段“只给视频模型首尾帧、不直接给商品标准源图”，导致视频只能间接继承商品一致性的问题。
- 本轮最小改动：
  - 调整 `src/main/modules/clone/service.ts`、`src/main/modules/clone/providers.ts`、`src/main/modules/clone/unifiedVideo.ts`。
  - 新增 smoke：`test/clone-shot-video-reference-images-payload.smoke.ts`。
- 生效规则：
  - 主进程在分镜视频提交前，除首帧/尾帧外，还会收集当前镜头对应的 `productReferenceImagePaths`，优先取商品标准源图并上传为可公网访问的 URL。
  - 对支持多图输入的供应商请求体，商品标准源图必须并入视频模型输入：
    - `openai_video / sora / grok`：追加到 `images`
    - `veo`：追加到 `images`
    - `seedance2`：追加到 `content[].image_url`
  - 分镜视频日志会额外输出 `productReferenceCount / referenceImageCount`，用于确认本次视频提交是否真的带上了商品标准源图。
- 使用说明：
  - 重新生成分镜视频时，当前视频模型看到的输入不再只有首尾帧，还应包含商品标准源图；这样即使首尾帧锁得不够死，视频阶段也仍有直接商品参考可用。

## 2026-05-28 分镜图片强制重生成旧图回灌修复

- 目标：
  - 修复桌面端 `/clone` 单镜头点击“重新生成分镜图片”后，界面虽然进入“生成中”，但退出或刷新后又继续显示上一轮旧图的问题。
- 本轮最小改动：
  - 仅调整 `src/main/modules/clone/service.ts` 与 `src/renderer/src/ui/views/CloneView.vue`。
  - 新增最小 smoke：`test/clone-storyboard-image-force-regenerate-clears-stale-frame.smoke.ts`。
- 生效规则：
  - `generateGptShotFrames(...)` 在 `forceRegenerate=true` 时，必须先清理该镜头旧的 `gpt/generated` 分镜图路径、旧 `generatedTaskId` 与 `imagePromptHash`，并同步清空 `storyboardFrames.imagePath`。
  - 前端分镜图区在 `gptFrameStatus=generating` 时，必须优先显示生成中状态，不允许继续回退展示旧 `gptFirstFramePath / generatedFirstFramePath / storyboardFrames.imagePath`。
  - 如果本轮新生成失败，状态可进入失败态，但不能把上一轮旧图当成本轮结果重新挂回。
- 使用说明：
  - 重新生成分镜图片后，用户刷新页面或重新进入项目时，当前镜头应保持“生成中/失败/新结果”中的真实状态，不再复活旧图。

## 2026-05-28 分镜图片参考图职责映射补强

- 目标：
  - 修复分镜图片生成时，多张参考图虽然已上传，但 prompt 没有明确声明各自职责，导致模型可能混用商品图、模特图和分镜截图。
- 本轮最小改动：
  - 仅调整 `src/main/modules/clone/gptImage.ts` 的分镜图片 prompt 引用职责说明。
- 生效规则：
  - 分镜图片 prompt 必须显式声明：
    - 第 1 张图是 `Product Canonical Source`，只负责商品 identity、结构、材质、比例和连接关系。
    - 第 2 张图是模特身份图，只负责同一人物 identity，不再额外输出模特文字外观描述。
    - 第 3 张图在首帧时只负责脚本分镜角度、裁切、构图和场景布局；在尾帧时只负责起始帧连续性。
  - prompt 必须禁止跨职责污染，不允许用角度参考图或模特图重定义商品。
  - 分镜图片 prompt 不再输出 `Selected model: ...` 这类模特画像文案，模特身份只由上传的模特参考图承担。
- 使用说明：
  - 当提交参数中的 `urls` 顺序为“商品图、模特图、分镜截图/起始帧”时，模型将按照对应职责消费，而不是自行猜测图片用途。

### 产品主流程

- 当前唯一核心工作流以桌面端 `src/renderer` 为主。
- 默认主流程为：登录 -> `/clone` 列表 -> `/clone/[projectId]` -> 绑定商品 -> 生成脚本/分镜/视频 -> 输出结果或失败原因。
- 本轮内 `apps/web` 与 `apps/web-next` 仅保留登录、列表、展示或商业化入口，不作为完整 `/clone` 生产工作台继续扩展。

### 商品库

- 商品库采用单图标准源建模思路，优先保证 `Product DNA`、标准图、多角度图的稳定闭环。
- `/clone` 项目读取商品描述时，优先使用商品详情页已生成的最新 `Product DNA`。
- 商品结构锁定、参考图优先、不允许 redesign 继续作为默认规则。

### /clone 阶段定义

- 当前桌面端 `/clone` 阶段按以下主顺序推进：
  - 参考视频分析
  - 商品与模特一致性准备
  - 脚本候选与脚本选择
  - 分镜图
  - 分镜视频
  - 成片导出
- 任何新开发优先修复以上链路中的阻塞点，不优先扩展 billing、plugins、marketing 等外围页面。

### 测试命令

- 基础检查：
  - `npm run typecheck`
  - `npm run guard:encoding`
- 关键主流程验证：
  - `npm run test:product-library-desktop`
  - `npm run test:web-next-clone-flow`
  - `npm run test:clone-project-workspace`
  - `npm run test:clone-product-binding`
  - `npm run test:clone-remote-storyboard-recovery`
  - `npm run test:clone-storyboard-frame-task-pool-runtime`
  - `npm run test:clone-video-generation-queue-summary`
  - `npm run test:clone-video-task-pool-runtime`

## 2026-05-25 复制视频多任务分镜图全局并发隔离修复

- 目标：
  - 修复桌面端 `/clone` 同时跑多条复制视频任务时，分镜图片生成阶段互相抢占，继而引发部分任务中断、后续分镜视频阶段看起来“停住”的问题。
- 本轮最小改动：
  - 新增 `src/main/modules/clone/storyboardFrameTaskPoolRuntime.ts`，只负责主进程内分镜图任务的全局并发门控。
  - `generateAllShotFrames(...)` 保留现有“单项目内 `PQueue` 限流”，额外增加“跨项目全局限流”。
  - 新增最小 smoke 测试 `test/clone-storyboard-frame-task-pool-runtime.smoke.ts`。
  - 增加 `package.json` 测试脚本，不修改前端页面，不改现有项目数据结构。
- 修复内容：
  - 分镜图阶段默认新增进程级全局并发上限 `2`，避免多个项目各自开本地并发后，把统一图片提供链路同时冲高。
  - 保留原有 `CLONE_STORYBOARD_FRAME_CONCURRENCY` 作为单项目内并发控制。
  - 新增 `CLONE_GLOBAL_STORYBOARD_FRAME_CONCURRENCY` 作为跨项目总并发控制，默认值为 `2`。
- 使用说明：
  - 默认无需额外配置，桌面端多项目同时生成分镜图时会自动排队执行。
  - 若部署环境图片提供链路更稳定，可通过环境变量 `CLONE_GLOBAL_STORYBOARD_FRAME_CONCURRENCY` 调整跨项目总并发。
  - Windows 开发与 Linux 部署都只依赖 Node 运行时与环境变量，不依赖平台专属锁文件或路径。

## 2026-05-25 分镜视频同步补查禁止误触发重新生成

## 2026-05-26 分镜视频重新生成状态机收紧

## 2026-05-27 分镜视频强制重新生成绕过旧提交锁

## 2026-05-27 分镜视频下载中禁止被旧本地文件误判为已完成

- 目标：
  - 修复桌面端 `/clone` 分镜视频在 `downloading` 阶段时，因历史本地 `generated_clip.mp4` 仍存在，被状态归一和持久化合并误判为 `done`，界面出现“结果下载中”和“已完成”来回跳的问题。
- 本轮最小改动：
  - 仅调整 `src/main/modules/clone/repo.ts` 中分镜视频持久化合并的完成态判定。
  - 新增最小 smoke 测试 `test/clone-shot-video-downloading-not-done-with-stale-local.smoke.ts`。
  - 不改 IPC，不改按钮行为，不扩展到其他工作流。
- 修复内容：
  - `downloading` 不再被视为可保留旧完成结果的完成态。
  - 当镜头仍处于 `downloading` 时，即便磁盘上存在历史本地视频，也不能直接在持久化阶段把状态顶回 `done`。
  - 分镜视频恢复链路、批量补查链路、本地素材探测链路，在 `downloading / remote_succeeded_pending_download` 且仍保留当前 `taskId + videoUrl` 时，均不得再用历史本地文件短路为 `done`。
  - 当数据库里已经出现 `status=done` 但 `remoteStatus / remoteRaw.status` 仍是 `created / queued / processing / running` 的脏状态时，状态归一必须优先按远端待完成态自愈，并清掉当前镜头挂载的旧本地视频路径。
  - 只有真正完成当前下载回写后，才允许进入 `done`。
- 使用说明：
  - 对像 `veo_3_1-fast-4K:task_GpksYcFXvB9wY6B1nZYHmKuDbbWRXeUz` 这类还在下载中的镜头，界面应稳定停留在“结果下载中 / 待回写”，不应再瞬间切成“已完成”。
  - 当数据库里已经残留 `done + queued/created/running` 这类脏状态时，单镜头“继续查询 / 同步补查”返回给前端的项目快照也必须同步清掉 `shotVideoOutputs.videoPath/localPath` 与 `blueprint.shots.generatedClipPath`，不能再让旧本地文件在返回阶段复活为完成态。

- 目标：
  - 修复桌面端 `/clone` 分镜视频中，镜头刚提交过一次后仍处于旧 `submission lock` 窗口时，用户点击“重新生成视频”却被旧锁直接拦截，最终没有真正创建新任务、界面继续沿用旧视频的问题。
- 本轮最小改动：
  - 仅调整 `src/main/modules/clone/service.ts` 中 `generateShotClip(...)` 的强制重生成锁判断。
  - 新增最小 smoke 测试 `test/clone-shot-video-force-regenerate-bypass-submission-lock.smoke.ts`。
  - 补充 `package.json` 测试脚本，不改 IPC 结构，不改页面按钮语义。
- 修复内容：
  - 当 `forceRegenerate=true` 时，不再复用旧提交锁 `isShotVideoSubmissionLocked(...)` 的阻塞结果。
  - 强制重生成必须先清空旧 `taskId / videoPath / localPath`，并把旧任务号写入 `previousTaskIds`，然后再进入新的提交流程。
  - 这样即使镜头还处于上一次提交留下的锁窗口，也不会再出现“点击重新生成无效、仍使用旧视频”的假成功现象。
- 使用说明：
  - 对已经生成过旧视频的镜头，点击“重新生成视频”后，应立即脱离旧结果，进入新的 `submitting / remote_running` 链路。
  - 若新的远端提交最终失败，镜头会保留旧任务历史到 `previousTaskIds`，但当前输出不会再自动继续指向旧视频。

- 目标：
  - 修复桌面端 `/clone` 中“强制重新生成已提交新 taskId，但界面仍显示已完成”的错误状态。
  - 明确分镜视频完成态唯一以当前状态机和当前本地回写结果为准，旧本地视频不得在新任务进行中回灌为完成态。
- 本轮最小改动：
  - 收紧 `src/main/modules/clone/service.ts` 中 `normalizeShotVideoState(...)` 与 `syncSegmentVideoOutput(...)` 的旧结果回灌条件。
  - 收紧 `src/renderer/src/ui/views/CloneView.vue` 中分镜视频状态展示优先级，先显示状态机语义，再显示本地文件完成态。
- 生效规则：
  - 当镜头处于 `submitting / remote_pending / remote_running`，且已经进入重新生成替换流程时：
    - 旧 `videoPath / localPath / generatedClipPath` 不允许再自动补回当前输出。
    - 前端必须显示 `创建任务中` 或 `云端生成中`，不能继续显示 `已完成`。
  - 只有当当前状态归一为 `done` 且当前本地文件已存在时，才允许显示 `已完成 / succeeded`。
- 使用说明：
  - 点击“重新生成视频”后，界面应先进入“创建任务中/云端生成中”，待远端完成并本地下载回写后才恢复“已完成”。
  - “继续查询”只允许查询当前有效 taskId，不应再被旧本地视频短路为完成态。

## 2026-05-26 分镜视频物理去发光环境约束

- 目标：
  - 将桌面端 `/clone` 耳环等高反光饰品的 anti-glow 策略，从“仅靠禁词压制”升级为“主动改造物理光照条件”。
- 本轮最小改动：
  - 调整 `src/main/modules/clone/prompt.ts`、`src/main/modules/clone/gptImage.ts`、`src/main/modules/clone/providers.ts`。
  - 不改 IPC，不改页面结构，不改商品库与 Web 端。
- 修复内容：
  - 新增统一的 `ANTI-GLOW LIGHTING ENVIRONMENT` 约束块，要求：
    - `soft diffused lighting`
    - `matte lighting`
    - `studio flat lighting`
    - `low contrast lighting`
    - `overcast lighting`
    - `no specular highlights`
    - `no hard key light`
    - `no point light reflections`
    - `no glossy jewelry rendering`
  - 视频正向 prompt 不再优先保留参考视频原始光感；当参考光照会诱发珠宝闪耀时，允许改写为更平、更软、更暗的布光。
  - 首尾帧 prompt 同步注入同一套“物理去发光环境”约束，减少视频阶段继承闪耀首帧。
  - provider 层视频补充文案同步去掉会重新抬高高光风险的 `premium light / soft highlights` 类语义。
- 使用说明：
  - 后续重新生成的耳环镜头，会优先得到更平、更哑光、低反差、低镜面高光的灯光环境。
  - 若参考视频本身是强镜面反光布光，本轮实现允许覆盖原始光感，以优先压掉首饰发光与爆闪。

## 2026-05-26 分镜视频提示词回退到接近 v2.0 基底

- 目标：
  - 恢复桌面端 `/clone` 分镜视频与首尾帧提示词在 `release: v2.0.0` 时更稳定的产品一致性。
- 本轮最小改动：
  - 调整 `src/main/modules/clone/prompt.ts`、`src/main/modules/clone/providers.ts`、`src/main/modules/clone/gptImage.ts`。
  - 不修改任务状态机、不改页面结构、不改商品库与 Web 端。
- 修复内容：
  - 视频正向 prompt 主体回退到更接近 v2.0 的骨架，不再使用后来新增的大段 `Subject / Action / Scene / Lighting / Camera / Style / Quality` 结构化重写。
  - 首尾帧 prompt 同步回退为更短、更偏锁定式的提示词，不再叠加重型环境重写块。
  - 保留必要的静默商业规则、reference lock、no substitute、模型身份锁。
  - 仅保留一层简洁灯光压制：
    - `soft diffused lighting`
    - `matte lighting`
    - `studio flat lighting`
    - `low contrast lighting`
    - `overcast lighting`
    - `no specular highlights`
    - `no hard key light`
    - `no point light reflections`
  - provider 层不再额外主导场景和材质，只保留最小必要补充与负向词透传。
- 使用说明：
  - 后续重新生成的耳环镜头，会更接近 v2.0 的稳定提示词风格，同时仍保留一层灯光压制来避免珠宝在亮场景里爆闪发光。

- 目标：
  - 修复桌面端 `/clone` 分镜视频区点击“同步补查”后，在旧任务缺失或失效时被后台自动续跑逻辑误判，进而偷偷重新创建视频任务的问题。
- 本轮最小改动：
  - 仅调整 `src/main/modules/clone/service.ts` 中自动续跑阶段的失败重试条件。
  - 不修改前端按钮语义，不修改 IPC 入参，不改“重新生成”显式按钮行为。
- 修复内容：
  - 自动续跑链路现在只会对 `remote_failed` 执行自动重新生成。
  - `missing_task` 明确不再进入 `generateShotClip(... forceRegenerate: true)`。
  - “同步补查 / 继续查询”保持为只查询旧任务、只下载回写，不创建新任务的语义。
  - `generateShotClip(...)` 在非 `forceRegenerate` 情况下，只要镜头还保留旧 `taskId`，就一律优先走继续查询/下载回写，不再静默清空旧任务后重新提交。
  - 分镜视频状态同步新增“完成态不可回退”保护，避免并发轮询把已经拿到本地视频或已进入下载态的镜头，再错误覆盖回 `remote_running / creating / generating`。
  - 单镜头 `继续查询` IPC 改为同步等待本次查询/下载回写结果，不再先后台派发再立即返回旧状态，避免前端明明远端已成功却仍提示“暂未拿到最终结果”。
- 使用说明：
  - 当镜头缺少可继续查询的 `taskId` 时，界面会保留失败提示，用户需要显式点击“重新生成”才会创建新视频任务。
  - 点击“同步补查”或“继续查询”时，不会再因后台自动补偿而隐式新建远端视频任务。

## 2026-05-25 分镜视频显式重新生成绕过本地素材短路

- 目标：
  - 修复桌面端 `/clone` 分镜视频中，镜头处于 `local_video` 复用模式时，用户点击“重新生成”却被本地素材匹配逻辑直接短路，导致没有真正提交新视频任务的问题。
- 本轮最小改动：
  - 仅调整 `src/main/modules/clone/service.ts` 与 `src/renderer/src/composables/useCloneProjectWorkspace.video.ts`。
  - 不修改按钮语义，不改 IPC 结构，不扩展其他页面逻辑。
- 修复内容：
  - `generateShotClip(...)` 在 `forceRegenerate: true` 时明确跳过 `matchLocalAssetsForShot(...)`，避免显式重生成继续走本地素材复用分支。
  - 批量“继续查询”完成后，前端额外执行一次 `getProject()` 全量刷新，减少主进程已回写但界面仍停留旧快照的情况。
- 使用说明：
  - 对已经误落到 `local_video` 复用路径的异常镜头，点击“重新生成”后应真正进入云端视频提交流程，而不是无变化返回。
  - 若远端已成功，点击批量“继续查询”后，界面会更快拿到最新项目快照。

## 2026-05-25 分镜视频强制重生成成功提示口径修正

- 目标：
  - 修正桌面端 `/clone` 分镜视频中“强制重新生成已提交”后的成功提示，避免用瞬时队列统计误导成“0/0 像是没有提交成功”。
- 本轮最小改动：
  - 仅调整 `src/renderer/src/composables/useCloneProjectWorkspace.video.ts` 的提示文案拼接逻辑。
  - 不修改主进程 IPC，不修改提交、轮询、下载的真实执行流程。
- 修复内容：
  - 强制重新生成成功后，前端优先展示新 `taskId`，明确表示这次已经提交到远端。
  - 仅当运行时池里确实存在活跃中的 `submit/poll/download` 数量时，才附带显示当前队列摘要。
  - 不再在活跃数已瞬时归零时继续显示 `提交 0/0，续查 0/0，下载 0/0` 这类易误解文案。
- 使用说明：
  - 看到“强制重新生成已提交，新 taskId=...”即可认为本次已成功创建新的远端视频任务。
  - 后续是否继续轮询、下载，以镜头状态和运行日志为准，不再以瞬时 `0/0` 队列数字判断是否提交成功。

## 2026-05-25 分镜视频远端已完成但本地未回写时禁止提前收尾

- 目标：
  - 修复桌面端 `/clone` 分镜视频阶段中，远端模型已生成成功但本地还未下载回写时，主流程和前端列表被提前判成“已完成”的问题。
- 本轮最小改动：
  - 仅调整 `src/main/modules/clone/service.ts` 与 `src/renderer/src/ui/views/CloneView.vue`。
  - 不修改 IPC 结构，不修改按钮行为，不改数据库结构。
- 修复内容：
  - 主进程视频摘要统计不再把“仅有 `status=done`、但本地没有 `videoPath`”计入完成数。
  - 批量视频链路在轮询拿到 `downloading` 时，必须继续执行下载回写，成功拿到本地 `generated_clip.mp4` 后才允许该镜头记为完成。
  - 前端镜头状态显示不再把“无本地视频路径的 `done`”直接渲染成“已完成”，而是显示为“待下载回写”。
- 使用说明：
  - 只有当镜头真正拿到本地视频文件后，列表和统计才会进入“已完成”。
  - 若远端已成功但本地尚未写回，界面会继续停留在可感知的等待态，而不是假完成后直接结束。

## 2026-05-25 饰品视频强发光特效硬抑制加强

- 目标：
  - 修复桌面端 `/clone` 饰品特别是耳环视频里，模型频繁把首饰生成为夸张星芒、爆闪、白核发光体的问题。
- 本轮最小改动：
  - 仅调整 `src/main/modules/clone/prompt.ts` 与 `src/main/modules/clone/providers.ts` 的视频提示词拼装。
  - 不修改 UI，不修改 IPC，不修改任务链路和数据库结构。
- 修复内容：
  - `buildJewelryLightEffectBanText(...)` 追加更强的硬约束：
    - 首饰绝不能被当成发光体、灯、闪点或白核。
    - 高光不能亮过真实皮肤高光或普通手机镜头下的自然反射。
    - 一旦高光有 VFX / 爆闪倾向，优先压成更钝、更暗、更哑光的反射。
    - 若首饰在任意帧表现为自发光，则视为无效结果。
  - `buildGenerationPromptRestraintText()` 与 `sanitizeJewelryGenerationPrompt()` 增加“宁可更钝也不要更闪”的正向约束。
  - 视频 negative prompt 追加 `no explosive jewelry glint`、`no glowing gemstone`、`no bright white hotspot on jewelry`、`no emissive reflection` 等更直接的禁词。
  - `providers.ts` 中耳环专用 `jewelry realism rule` 再次收紧，明确禁止 luxury-ad sparkle styling，并要求必要时首饰亮度应低于皮肤高光。
- 使用说明：
  - 该改动会自动作用于后续重新生成的饰品视频。
  - 旧视频不会自动变好，必须对问题镜头重新生成后才能看到新的抑制效果。
  - 若新一轮结果仍有明显爆闪，需要继续从模型选择或更强的 fail-fast 规则继续收紧。

## 2026-05-25 视频正向 Prompt 冗余压缩

- 目标：
  - 修复桌面端 `/clone` 视频正向 prompt 中同义规则重复堆叠过多，导致模型更容易抓到“商业珠宝氛围”而不是核心约束的问题。
- 本轮最小改动：
  - 仅调整 `src/main/modules/clone/prompt.ts` 中 `buildOptimizedVideoPrompt(...)` 的正向 prompt 组合。
  - 不修改 negative prompt 透传，不改任务链路，不改 UI。
- 修复内容：
  - 去掉顶层重复的 `SILENT VISUAL COMMERCIAL` 口号行，避免与全局 silent rule 双重堆叠。
  - 去掉与全局规则重复的 `No dialogue or presenter delivery...` 行。
  - `MODEL LOCK` 精简为单行，不再追加重复的 `Use the same selected model identity only.`。
  - 保留真正关键的锁定块：
    - 产品 reference lock
    - no substitute
    - scene lock
    - motion / lighting / fail rule
    - 饰品 anti-glow 规则
- 使用说明：
  - 后续生成的视频正向 prompt 会更短、更集中，减少模型对冗余修辞的注意力分散。
  - 旧视频不会变化，需要重新生成后才会吃到新 prompt。

## 2026-05-25 Generation Prompt 编号残留与脏尾巴清洗

- 目标：
  - 修复桌面端 `/clone` 视频 `Generation Prompt` 中混入分析器编号残留和脏尾巴的问题，例如 `action 3`、`reference video 5`、`static 6`、`no redesign 7`。
- 本轮最小改动：
  - 仅调整 `src/main/modules/clone/prompt.ts` 的 prompt 清洗和 `SHOT EXECUTION` 组装逻辑。
  - 不修改前端，不修改任务链路，不改数据库结构。
- 修复内容：
  - `stripBrokenTail(...)` 新增对编号残留的清洗，去除字段尾部的数字污染。
  - `buildOptimizedVideoPrompt(...)` 不再把整段 `generationPrompt` 原样塞进 `Storyboard visual prompt`。
  - 改为按 `Subject / Action / Scene / Lighting / Camera / Style / Quality` 逐项提取、清洗、回填 fallback。
  - 这样生成到最终视频模型的指令会更干净，不再带无意义编号和重复描述。
- 使用说明：
  - 后续重新生成的视频会自动使用更干净的 `Generation Prompt`。
  - 旧视频不会自动变化，需要重新生成后才会吃到该修复。

## 2026-05-25 饰品高光允许口径改为强抑制口径

- 目标：
  - 去掉桌面端 `/clone` 视频提示词中“饰品可保留 subtle / realistic highlights”这类仍会放行闪亮特效的表述。
- 本轮最小改动：
  - 仅调整 `src/main/modules/clone/prompt.ts` 与 `src/main/modules/clone/service.ts` 的文案口径。
  - 不修改任务链路，不改前端，不改 provider 调用结构。
- 修复内容：
  - `buildGenerationPromptRestraintText()` 不再使用 “keep highlights subtle and camera-realistic only”。
  - 改为明确要求：
    - 强力压制高光
    - 优先近乎哑光、低对比、非发光的材质反馈
    - 必要时把高光压到几乎不可见
    - 不允许任何会吸引注意力的 shine / glint / reflective emphasis
  - `service.ts` 中商品描述增强文案同步改为同一口径，避免上游再把“slight natural highlights”送回视频模型。
- 使用说明：
  - 后续重新生成的饰品视频会按照更强的“压高光”规则执行。
  - 旧视频不会自动变化，需要重新生成后才会看到效果。

## 2026-05-25 分镜视频完成态详情口径统一

- 目标：
  - 修复桌面端 `/clone` 分镜视频列表中，主状态显示“已完成”但副状态仍显示历史远端瞬时态如 `created` 的冲突问题。
- 本轮最小改动：
  - 仅调整 `src/renderer/src/ui/views/CloneView.vue` 与 `src/main/modules/clone/service.ts`。
  - 不修改任务链路，不改按钮行为，不改数据库结构。
- 修复内容：
  - 只要镜头已经拿到本地视频文件，前端详情副状态不再暴露旧的 `created`，统一按最终完成态显示。
  - 主进程在复用已存在本地视频时，不再把 `remoteStatus` 回填为 `done` 或遗留 `created`，而是规范为 `succeeded`。
- 使用说明：
  - 后续如果镜头已真正完成，本地列表状态会保持一致，不会再出现“已完成 / created”这种互相打架的显示。

## 2026-05-25 强制重新生成完成后完成态副状态统一为 succeeded

- 目标：
  - 修复桌面端 `/clone` 中，用户点“重新生成”后镜头已经产出新本地视频，但完成态副状态仍显示 `local_ready` 的问题。
- 本轮最小改动：
  - 仅调整 `src/main/modules/clone/service.ts` 与 `src/renderer/src/ui/views/CloneView.vue`。
  - 不修改任务链路，不改数据库结构，不改按钮逻辑。
- 修复内容：
  - `generateShotClip(...)` 在本地新视频写回成功时，补写 `remoteStatus: succeeded`。
  - 前端完成态副状态不再暴露 `local_ready` 这类内部兜底口径，完成即统一显示 `succeeded`。
- 使用说明：
  - 后续重新生成成功的镜头，状态区会直接显示一致的完成态，不再出现“明明是重新生成成功，却还是 local_ready”的情况。

## 2026-05-25 `/clone` 主链路切换为 SQLite 真源

- 目标：
  - 将桌面端 `/clone` 核心生产数据从 `clone-projects.json` 切换为 `clone-projects.sqlite` 真源，收敛整文件读写、并发脏写和历史 JSON 反向覆盖问题。
- 本轮最小改动：
  - 仅调整 `src/main/modules/clone/repo.ts`、`src/main/modules/clone/sqlite.ts`、测试脚本与需求文档。
  - 不修改渲染层 IPC，不改前端调用参数，不迁商品库与模板库。
- 修复内容：
  - 启动时若 SQLite 为空且存在 `clone-projects.json`，只执行一次 JSON -> SQLite 导入。
  - 一旦 SQLite 已存在数据，后续运行时默认忽略 `clone-projects.json`，不再做双向比较补水，不再将正常写入回刷到 JSON。
  - `/clone` 的项目、分组、模特库、分镜视频状态全部统一从 SQLite 读取并写回。
  - SQLite 表补充最小必要索引，保持当前 `payload TEXT` 快照模式，不在本轮拆分多张关系表。
  - 新增 3 个 smoke：
    - `test:clone-repo-migration`
    - `test:clone-repo-sqlite-source-of-truth`
    - `test:clone-video-recovery-with-sqlite-truth`
- 使用说明：
  - 迁移完成后，`clone-projects.sqlite` 是 `/clone` 主流程唯一事实来源。
  - `clone-projects.json` 仅保留首次导入和必要时的只读诊断导出用途，不再作为正常运行时真源。

### 平台兼容约束

- 开发环境为 Windows，部署环境为 Linux。
- 路径策略必须使用环境变量优先、运行时目录兜底，不允许依赖固定盘符。
- 上传、缓存、预览、导出路径统一通过 `path.join` 和运行时目录构造。
- 新增或修改源码、文档、测试文件时统一使用 UTF-8，避免 Windows/Linux 编码差异。

## 2026-05-23 两周重整第一轮落地

- 目标：
  - 在不改外部接口的前提下，先收敛主进程入口、`clone` 服务边界、文档结构与最小回归测试。
- 本轮最小改动：
  - 主进程 IPC 按领域拆分为独立 registrar。
  - Windows 存储目录逻辑改为环境变量优先，不再硬依赖固定 `E:\\VideoGenerate`。
  - `clone` 服务新增 4 个薄模块入口：项目读写、商品绑定、分镜图、远端分镜视频恢复。
  - 自动视频 `submit/poll/download` 三池摘要补充为独立可测模块，并新增最小 smoke 验证。
  - 自动视频三池运行态刷新与池执行联动补充为独立可测模块，并新增最小 smoke 验证。
  - 新增 `docs/archive/README.md` 作为归档入口。
  - 为 `clone` 主流程补 3 个最小 smoke 验证。
  - `src/main/index.ts` 中 `app/shell/media`、`products`、`templates/tasks` 三组 IPC 已下沉到独立 registrar，主入口仅保留编排与启动职责。
- 使用说明：
  - 若需自定义 Windows 数据目录，可设置 `VIDEOGENERATE_USER_DATA_DIR` 或 `VIDEOGENERATE_WINDOWS_STORAGE_ROOT`。
  - 当前有效规格优先查看本文件顶部“当前生效规格”，历史补丁型记录后续逐步迁移到归档目录。
  - 如需新增桌面端 IPC，优先按领域追加到 `src/main/ipc/` 对应 registrar，避免继续把细节堆回 `src/main/index.ts`。
- Windows / Linux 兼容说明：
  - 本轮路径逻辑改为配置优先 + 平台默认兜底，减少对 Windows 固定盘符的依赖。

## 2026-05-23 商品分析画板失败提示单图口径修正

- 目标：
  - 修正商品详情页“分析画板生成失败”提示文案与当前单图上传流程不一致的问题。
- 本轮最小改动：
  - 仅调整 `src/renderer/src/ui/views/ProductDetailView.vue` 前端失败提示文案。
  - 不修改商品上传逻辑，不修改分析画板生成链路，不修改主进程接口。
- 修复内容：
  - 失败提示从“更清晰、更完整的商品图”调整为“更清晰、无遮挡的单张商品图”。
  - 页面文案与当前商品库单图上传、单图分析的实现保持一致，避免误导为多图流程。
- 使用说明：
  - 当商品分析画板生成失败时，商品详情页会明确提示用户替换单张清晰无遮挡商品图后重试。
- Windows / Linux 兼容说明：
  - 本轮仅修改 Vue 前端文案，不依赖平台专属能力。

## 2026-05-23 商品详情深层多角度图提示词真实性收紧

- 目标：
  - 收紧商品详情页“深层多角度分析画板”的提示词，让生成结果更符合真实商品结构与实际拍摄视角。
- 本轮最小改动：
  - 仅调整 `src/main/modules/clone/productAnalysisBoard.ts` 与 `src/main/modules/clone/productImageSanitizer.ts` 的图片生成提示词。
  - 不修改商品详情页布局，不修改商品数据结构，不修改模型调用接口。
- 修复内容：
  - 多角度分析画板 prompt 明确要求输出“同一实物”的真实电商多视角板。
  - 强化对深度、厚度、弧度、闭合结构、孔位、边缘、连接逻辑、材质反馈的保真约束。
  - 明确禁止模型对不可见面做夸张脑补，禁止新增配件、装饰、背面结构和泛化重设计。
  - 标准源提纯 prompt 同步补强“参考图最高优先级”与“保守还原”规则，减少前置提纯阶段把商品结构抽象化。
  - negative prompt 增加 `invented backside`、`hallucinated detail`、`wrong thickness`、`wrong geometry`、`generic replacement`、`3d render` 等约束词。
- 使用说明：
  - 在商品详情页重新生成多角度分析画板后，新提示词会自动生效。
  - 新结果应更偏真实商品多角度展示，而不是泛化的概念图、重设计图或不符合实际结构的脑补视角图。
- Windows / Linux 兼容说明：
  - 本轮仅修改 TypeScript 提示词拼装逻辑，不依赖平台专属能力。

## 2026-05-24 Web-Next `/clone` 复刻视频列表纠偏

- 目标：
  - 修正 `apps/web-next/app/clone/page.tsx` 中复刻视频列表误做成卡片网格的问题，使其回到参考图对应的表格型任务列表结构。
- 本轮最小改动：
  - 仅调整 `apps/web-next/app/clone/page.tsx` 与 `apps/web-next/app/globals.css`。
  - 不修改后端接口，不修改任务数据结构，不扩展 `/clone/[projectId]` 详情流程。
- 修复内容：
  - 将列表主区域从四列卡片改为顶部统计卡 + 分组标签 + 表格列表。
  - 列表行补齐预览、任务信息、阶段、素材、进度、更新时间、操作列，贴近当前参考图的信息层级。
  - 移除当前页面右侧说明栏，避免首屏主任务区被压缩。
  - 同步整理页面中文文案编码，避免局部乱码继续污染该页面。
- 使用说明：
  - 打开 `apps/web-next` 的 `/clone` 页面后，应优先看到复刻任务列表，而不是卡片瀑布式任务区。
  - Windows 开发环境与 Linux 部署环境均不依赖平台专属路径或能力，本轮仅涉及前端页面结构与样式。

## 2026-05-24 Web-Next `/clone` 分组导航栏样式收口

- 目标：
  - 修正 `/clone` 列表顶部“全部任务 / 未分组 / 分组标签”这一条导航的视觉密度，使其更接近参考图的横向标签栏，而不是普通按钮堆叠。
- 本轮最小改动：
  - 仅调整 `apps/web-next/app/clone/page.tsx` 与 `apps/web-next/app/globals.css` 中分组导航区域。
  - 不修改下方任务表格字段，不修改接口，不新增状态逻辑。
- 修复内容：
  - 分组项改为标签式文本导航，激活项使用底部高亮线。
  - `#26`、`#10十字架` 旁补充独立省略操作按钮，贴近参考图结构。
  - “新建分组”改为独立轻量按钮，和标签导航分层。
- 使用说明：
  - `/clone` 页面分组导航应呈现为一条横向标签栏，主视觉焦点仍然是当前激活分组与右侧视图按钮。

## 2026-05-24 Web-Next `/clone` 爆款视频复刻列表按设计稿高级化对齐

- 目标：
  - 将 `apps/web-next` 的 `/clone` 列表页整体收口到最新设计稿方向，重点提升首屏质感、统计卡层次、顶部控制区和任务表的专业工作台感。
- 本轮最小改动：
  - 仅调整 `apps/web-next/app/clone/page.tsx` 与 `apps/web-next/app/globals.css`。
  - 不修改后端接口，不新增状态管理，不扩展 `/clone/[projectId]` 详情逻辑。
- 修复内容：
  - 列表页主面板改为更完整的深色控制台容器，加入顶部光感层次与整体圆角边界。
  - 头部改成“标题说明 + 批量导出 + 自动/手动运行 + 新建任务”的双区结构，贴近设计稿。
  - 统计区改为五张更有层次的发光信息卡，分别承载全部、进行中、已完成、失败、草稿。
  - 分组导航、排序筛选按钮和任务表头重新排版，统一到更紧凑、更高级的深色工作台视觉。
  - 任务行补强缩略图、模式标签、状态胶囊、进度段位点和操作按钮层次，使列表阅读体验更接近设计稿。
- 使用说明：
  - 打开 `apps/web-next` 的 `/clone` 页面后，首屏应优先呈现高密度、深色控制台风格的复刻任务列表，而不是普通后台表格。
- Windows / Linux 兼容说明：
  - 本轮仅修改 Next 前端页面结构和样式，不依赖平台专属路径或能力。

## 2026-05-24 桌面端 `/clone` 爆款视频复刻列表按设计稿重生成

- 目标：
  - 按最新设计稿重新收口桌面端 `CloneTaskListView.vue`，重点提升头部控制区、统计卡和整体工作台首屏质感。
- 本轮最小改动：
  - 仅调整 `src/renderer/src/ui/views/CloneTaskListView.vue`。
  - 不修改主进程接口，不修改 `/clone/[projectId]` 详情工作流，不改动其他桌面页面。
- 修复内容：
  - 顶部标题区补上设计稿式副标题和更明确的视觉主次。
  - 搜索框、计数块、用户块和操作按钮统一拉齐到更高级的桌面控制台样式。
  - 五张统计卡补齐说明文案，并统一卡片高度、边框、间距和阴影层次。
  - 删除页面内部重复渲染的一套搜索、计数、主按钮和用户位，避免与全局桌面壳层顶部重复。
- 使用说明：
  - 打开桌面端复刻列表后，首屏应更接近设计稿中的“深色 AI 工作台”，而不是普通后台块状拼接。
- Windows / Linux 兼容说明：
  - 本轮仅修改 Vue 桌面前端页面结构与样式，不依赖平台专属能力。

## 2026-05-23 商品详情重新生成分析画板无感问题修复

- 目标：
  - 修复商品详情页在已有多角度分析画板时，点击“重新生成分析画板”看起来只刷新、没有重新生成反馈的问题。
- 本轮最小改动：
  - 仅调整 `src/renderer/src/ui/views/ProductDetailView.vue`、`src/preload/index.ts`、`src/main/index.ts`、`src/main/modules/clone/service.ts`。
  - 不修改商品详情页布局，不修改商品数据结构，不修改模型 provider 接口。
- 修复内容：
  - 前端重生按钮改为显式传递 `force: true`。
  - 主进程商品详情重生入口支持 `force` 参数。
  - 重新生成开始时先清空旧 `analysisBoardPath`，避免页面继续把旧图误判为当前已完成结果。
  - 手动重生分析画板时输出文件名改为带时间戳，避免同路径图片被前端缓存，看起来像没有更新。
- 使用说明：
  - 现在在商品详情页已有多角度图的情况下再次点击“重新生成分析画板”，页面会先进入处理中，再展示新的分析画板结果。
- Windows / Linux 兼容说明：
  - 本轮仅修改 Electron IPC 与 TypeScript 主进程逻辑，不依赖平台专属能力。

## 2026-05-23 商品详情 Product DNA 手动补齐与独立入口

## 2026-05-24 分镜图片失败手动重试与批量重生补齐

- 目标：
  - 补齐分镜图片手动重试机制，避免用户在分镜图失败后只能单次点击且没有明确批量失败重生入口。
- 本轮最小改动：
  - 仅调整 `src/renderer/src/composables/useCloneProjectWorkspace.storyboard.ts` 与 `src/renderer/src/ui/views/CloneView.vue`。
  - 不修改主进程图片生成接口，不改自动流程顺序，不新增外部依赖。
- 修复内容：
  - 手动单镜头“重新生成分镜图”现在会在前端统一包装为最多 `2` 次尝试。
  - 每次手动尝试会写入运行日志，并在分镜区保留明确的“重新生成中”状态提示。
  - 分镜设计页顶部新增“重新生成失败分镜 N”按钮，仅针对当前失败项批量重生，不再误伤全部未锁定镜头。
  - 分镜设计页补充说明文案，明确自动流程与手动流程都支持失败重试口径。
- 使用说明：
  - 当某个分镜图失败时，可直接点击该行“重新生成”，系统会按当前商品图、模特绑定与脚本上下文最多再尝试 2 次。
  - 当有多个失败分镜时，可在分镜设计页顶部点击“重新生成失败分镜 N”依次批量重生失败项。
  - 批量重生期间，单镜头重生按钮会进入禁用，避免重复提交。
- Windows / Linux 兼容说明：
  - 本轮仅修改 Vue 前端与 TypeScript 组合逻辑，不依赖平台专属能力。

## 2026-05-24 分镜视频阶段禁止重复触发商品基础图链路

- 目标：
  - 修复自动进入分镜视频阶段时，仍重复触发商品基础图/冻结参考图前置链路，导致用户误以为视频阶段还在重新生成商品基础数据图片的问题。
- 本轮最小改动：
  - 仅调整 `src/main/modules/clone/service.ts` 自动流程入口判断。
  - 不修改视频 provider，不改 Product DNA 结构，不改前端 IPC 接口。
- 修复内容：
  - 自动流程进入分镜视频前，如果当前项目已经存在可复用的绑定商品快照、冻结参考图与商品描述文本，则不再重复调用 `saveProjectProductImages(...)`。
  - 只有在用户本轮传入了新的商品图，或当前项目缺少可复用冻结参考图时，才重新走商品参考图保存与提纯流程。
- 使用说明：
  - 现在从 `/clone/[projectId]` 自动推进到分镜视频时，默认直接复用当前绑定商品的冻结参考图和 Product DNA，不会因为进入视频阶段而再次生成商品基础图。
- Windows / Linux 兼容说明：
  - 本轮仅修改 TypeScript 主进程判断逻辑，不依赖平台专属能力。

## 2026-05-24 分镜视频失败态旧 taskId 自动清理后重提

- 目标：
  - 修复分镜视频镜头在存在历史脏 `taskId` 时，点击重新生成或自动继续推进仍优先复用旧任务，导致没有真正重新调用视频模型接口的问题。
- 本轮最小改动：
  - 仅调整 `src/main/modules/clone/service.ts` 中 `generateShotClip(...)` 的旧任务复用判断。
  - 不修改视频 provider 接口，不修改前端调用方式。
- 修复内容：
  - 新增旧任务可复用判定，仅允许 `creating / generating / remote_running / downloading(且已有 videoUrl)` 这类明确运行态继续复用。
  - 当镜头处于 `missing_task / remote_timeout / remote_failed / local_failed / download_failed` 等失败态时，会先清空旧 `taskId` 与旧输出状态，再重新提交新的视频模型任务。
- 使用说明：
  - 现在分镜视频失败后再次重新生成，会优先清理历史无效 `taskId`，不再被旧任务状态卡住。
  - 仅当镜头仍明确处于云端运行或下载回写中时，系统才会继续沿用旧任务。
- Windows / Linux 兼容说明：
  - 本轮仅修改 TypeScript 主进程状态判断逻辑，不依赖平台专属能力。

## 2026-05-24 分镜视频任务号污染与任务池自锁修复

- 目标：
  - 修复分镜图 `gpt_frame_*` 任务号污染到分镜视频阶段，导致视频状态误判、恢复空转，以及批量视频提交出现任务池嵌套后整体卡死的问题。
- 本轮最小改动：
  - 调整 `src/main/modules/clone/service.ts` 的视频任务号解析与批量提交路径。
  - 调整 `src/renderer/src/ui/views/CloneView.vue` 的前端视频 taskId 显示回退逻辑。
- 修复内容：
  - 新增统一的视频任务号解析，仅接受真实视频 `taskId`，过滤 `gpt_frame_*`、`mj_*` 这类图片任务号。
  - `resolveShotVideoOutput(...)`、自动恢复、轮询续查、本地回写等路径统一改为只使用有效视频任务号。
  - 批量分镜视频在 `apifox_hub` 下改为在 `submit` 池内直接调用底层 `ensureAi666SegmentVideoTask(...)`，避免 `submit` 池递归调用 `generateShotClip(...)` 后再次进入 `submit` 池造成自锁。
  - 前端视频列表不再把分镜图任务号显示成分镜视频任务号。
- 使用说明：
  - 分镜视频阶段如果出现“云端生成中”“结果下载中”，现在只会基于真实视频任务号推进，不会再被首尾帧图片任务号污染。
  - 批量自动视频任务应可继续推进提交、续查、下载三类状态，不再因为任务池嵌套而整体卡住。
- Windows / Linux 兼容说明：
  - 本轮仅修改 TypeScript 主进程与 Vue 前端逻辑，不依赖平台专属能力。

## 2026-05-24 分镜视频远端失败自动重试 2 次

- 目标：
  - 补齐分镜视频在云端明确返回任务失败时的自动重试能力，避免任务直接停在失败态而不重新提交。
- 本轮最小改动：
  - 仅调整 `src/main/modules/clone/service.ts` 中批量分镜视频调度的失败续处理逻辑。
  - 不修改前端按钮，不新增配置项。
- 修复内容：
  - 当分镜视频已存在远端 `taskId`，续查结果返回 `remote_failed` 或 `missing_task` 时，系统会自动调用 `generateShotClip(..., forceRegenerate: true)` 重新提交。
  - 自动重试上限沿用现有 `AUTO_CLONE_VIDEO_RETRY_LIMIT = 2`。
  - 若自动重试后已重新拿到新视频 `taskId`，镜头状态会继续回到待续查/云端处理中，而不是直接停在失败。
- 使用说明：
  - 现在只要云端任务明确失败，系统会自动重试，最多 2 次；超过上限后才保留最终失败态。
- Windows / Linux 兼容说明：
  - 本轮仅修改 TypeScript 主进程调度逻辑，不依赖平台专属能力。

## 2026-05-24 分镜视频查询卡死与下载停滞修复

- 目标：
  - 修复分镜视频已提交到云端后，桌面端长时间停在“云端生成中”或“结果下载中”且后续任务不再推进的问题。
- 本轮最小改动：
  - 仅调整 `src/main/modules/clone/atlasRetry.ts`、`src/main/modules/clone/unifiedVideo.ts`、`src/main/modules/clone/service.ts`。
  - 不修改前端页面结构，不改视频 provider 接口，不新增外部依赖。
- 修复内容：
  - `getAtlasJson(...)` 查询增加超时保护，避免云端查询长时间挂起时占满 `poll` 池，导致整批视频任务假死。
  - 分镜视频状态归一化补充更多云端状态字段，并放宽成功结果识别；只要查询结果里已经出现真实视频 URL，就不会再一直误判为运行中。
  - 视频输出 URL 提取补充 `download_url`、`metadata`、`result/prediction.videos` 等常见返回位置，减少“云端已成功但本地拿不到地址”的情况。
  - 新增视频结果续流逻辑：手动同步、自动恢复、后台补拉取在 `poll` 拿到 `videoUrl` 后会自动衔接到 `download`，不再停在 `downloading` 等待下一轮整批同步。
  - “强制下载回写/重新拉取结果”链路改为先续查再下载，不再要求镜头必须事先已有本地 `videoUrl` 才能触发。
- 使用说明：
  - 当分镜视频已提交但界面停在“云端生成中”时，再次进入项目或点击单条补拉取，会先续查真实云端状态，再自动接力下载。
  - 当镜头显示“结果下载中”但本地文件未落库时，后台恢复和手动补拉都会优先完成当前下载，而不是卡在原状态。
- Windows / Linux 兼容说明：
  - 本轮仅修改 TypeScript 主进程网络查询与调度逻辑，不依赖平台专属能力。

## 2026-05-24 VectorEngine OpenAI Video 任务查询补诊断

- 目标：
  - 修复 `openai_video + openai_video endpointStyle` 下，任务已提交但查询日志只有 URL、没有结果摘要，导致无法判断是任务号格式问题还是云端查询接口无返回的问题。
- 本轮最小改动：
  - 仅调整 `src/main/modules/clone/unifiedVideo.ts`。
  - 不修改提交流程，不改 provider UI，不改前端页面结构。
- 修复内容：
  - `queryAsyncTask(...)` 现在会对同一个视频任务自动尝试多个查询 `taskId` 口径：
    - 原始 `taskId`
    - 结合模型名前缀补齐后的 `taskId`
    - 去掉模型名前缀后的 `taskId`
  - 每次查询都会输出更完整的调试日志：
    - `query-video-task`
    - `query-video-task:error`
    - `query-video-task:result`
  - 成功日志会补充：
    - 归一化状态
    - 提取到的视频 URL 数量
    - 首个 URL 摘要
    - 顶层 `rawKeys`
    - `dataKeys`
- 使用说明：
  - 当日志中出现类似 `veo_3_1-fast-4K:task_xxx` 的任务号时，系统现在会自动同时尝试带前缀和去前缀两种查询口径。
  - 重新触发分镜视频查询后，如果云端有返回，控制台应至少能看到 `query-video-task:result` 或 `query-video-task:error`，不再只有查询 URL。
- Windows / Linux 兼容说明：
  - 本轮仅修改 TypeScript 主进程查询逻辑与调试输出，不依赖平台专属能力。

## 2026-05-24 分镜视频阶段项目全量自动刷新补强

- 目标：
  - 修复分镜视频阶段后台状态已推进，但前端列表长期停留在旧状态、看起来“继续查询没反应”的问题。
- 本轮最小改动：
  - 仅调整 `src/renderer/src/ui/views/CloneView.vue` 的定时刷新策略。
  - 不修改主进程接口，不改页面结构，不新增外部依赖。
- 修复内容：
  - 当前处于分镜视频阶段时，只要存在未完成镜头，前端定时器会优先拉取完整项目数据，不再多数轮次只刷新 runtime 摘要。
  - 避免后台已经把镜头状态从 `remote_running/downloading` 推进到 `done/failed`，但前端列表仍停在旧状态不更新。
- 使用说明：
  - 在分镜视频阶段点击“继续查询”“强制下载回写”后，即使任务在后台异步推进，列表也会在后续自动刷新周期内更快反映真实状态。
- Windows / Linux 兼容说明：
  - 本轮仅修改 Vue 前端轮询逻辑，不依赖平台专属能力。

## 2026-05-24 分镜视频本地文件丢失兜底与成功结果重下载

- 目标：
  - 修复分镜视频数据库里已有 `videoPath/generatedClipPath`，但本地文件实际不存在时，界面仍误判为已完成或预览空白的问题。
  - 修复远端已成功且已有 `videoUrl` 时，本地文件丢失后不能自动重新下载回写的问题。
- 本轮最小改动：
  - 仅调整 `src/main/modules/clone/service.ts`。
  - 不修改前端调用接口，不修改 provider，不新增外部依赖。
- 修复内容：
  - `checkLocalTaskStatus(...)` 不再只凭字符串路径判断本地视频存在，而是强制校验文件是否真实存在且大小大于 `0`。
  - `continueShotVideoResultFlow(...)` 在继续查询前，会先清理已失效的本地 `videoPath/localPath/generatedClipPath` 引用，避免空路径残留让界面误判。
  - 当镜头已经拿到远端 `videoUrl` 但本地文件缺失时，系统会直接切到 `downloading` 并触发单镜头重新下载回写，不再卡在空预览或假完成状态。
- 使用说明：
  - 如果某条分镜视频此前显示“已完成”但预览为空，重新进入项目或点击“继续查询 / 强制下载回写”后，系统会自动校验本地文件是否真实存在。
  - 若远端结果还在且本地文件丢失，会自动重新下载 `generated_clip.mp4` 并恢复预览。
- Windows / Linux 兼容说明：
  - 本轮仅修改 TypeScript 主进程文件存在性判断与恢复逻辑，不依赖平台专属能力。
- 验证：
  - `npm run typecheck`

## 2026-05-24 脚本阶段与分镜图阶段商品图重复同步裁剪

- 目标：
  - 修复脚本候选生成、分镜图生成、单镜头分镜图重生前，即使商品图未变化也重复调用 `saveProductImages(...)` 的问题。
  - 减少自动流程中的重复前置写回与无效 IPC 调用，提升批量运行时的流畅度。
- 本轮最小改动：
  - 仅调整：
    - `src/renderer/src/composables/useCloneProjectWorkspace.shared.ts`
    - `src/renderer/src/composables/useCloneProjectWorkspace.script.ts`
    - `src/renderer/src/composables/useCloneProjectWorkspace.storyboard.ts`
  - 不修改主进程接口，不改商品数据结构，不新增外部依赖。
- 修复内容：
  - 新增前端商品图引用归一化与对比函数，统一按去重、裁剪后的引用列表判断是否真的发生变化。
  - 脚本候选生成前，只有当前选择的商品图与项目内已保存商品图不一致时，才调用 `saveProductImages(...)`。
  - 分镜图批量生成与单镜头重生前，只有 `productRefsDraft` 与当前项目内商品图不一致时，才调用 `saveProductImages(...)`。
  - 避免同一轮自动链路中反复触发无变化商品图同步，减少重复日志和重复状态写回。
- 使用说明：
  - 现在从脚本阶段进入分镜图阶段，若商品图没有变，不会再重复提示或触发商品图同步。
  - 手动重生单镜头分镜图时，若当前草稿商品图未变化，也不会额外再走一轮商品图保存。
- Windows / Linux 兼容说明：
  - 本轮仅修改 Vue 前端 composable 判断逻辑，不依赖平台专属能力。
- 验证：
  - `npm run typecheck`

- 目标：
  - 补齐商品详情页手动“重新生成分析画板”时没有同步生成 `Product DNA` 的缺口。
  - 增加一个更明确的 `Product DNA` 刷新入口，便于单独触发数据获取。
- 本轮最小改动：
  - 仅调整 `src/main/modules/clone/service.ts` 与 `src/renderer/src/ui/views/ProductDetailView.vue`。
  - 不修改商品数据结构，不新增独立模型接口，不改 `/clone` 复用协议。
- 修复内容：
  - 商品详情页手动刷新分析画板时，同步调用 `analyzeProductStructureWithGrs(...)` 重新生成 `productAnalysis`。
  - 主进程在手动刷新链路成功写回分析画板时，一并把 `productAnalysis` 落库。
  - 新增独立 `products:refreshProductAnalysis` 入口，只调用商品结构分析模型，不重新生成多角度分析画板。
  - `Product DNA` 卡片头部新增“获取产品 DNA”按钮，绑定独立 DNA 获取入口。
  - 占位文案改为明确说明这里会同步调用商品结构分析模型。
  - 独立 `获取产品 DNA` 入口不再静默吞掉模型错误；如果 GRS.AI key 缺失、接口失败或返回解析失败，会直接向前端报错，避免出现“按钮点了但没有真的调模型”的假象。
- 使用说明：
  - 点击“重新生成分析画板”后，系统会生成多角度分析画板，并在成功后自动补齐 `Product DNA`。
  - 点击“获取产品 DNA”后，系统只刷新 `Product DNA`，不会重新生成多角度分析画板。
  - 若图片分析成功，商品详情页与商品库都应看到 `DNA 已生成` 和对应结构化文本。
- Windows / Linux 兼容说明：
  - 本轮仅修改 Vue 前端与 TypeScript 主进程逻辑，不依赖平台专属能力。

## 2026-05-23 /clone 参考分析强制优先使用商品详情 Product DNA

- 目标：
  - 修复 `/clone` 复刻流程“参考分析商品”区域没有优先使用商品详情页最新 `Product DNA` 的问题。
- 本轮最小改动：
  - 仅调整 `src/main/modules/clone/service.ts` 与 `src/renderer/src/ui/views/CloneView.vue`。
  - 不修改复刻流程布局，不修改分镜生成接口，不改商品数据结构。
- 修复内容：
  - `/clone` 前端参考分析面板读取顺序改为：
    - `boundProductSnapshot.productAnalysis`
    - `baseBlueprint.consistencyAssets.productAnalysis`
    - `blueprint.consistencyAssets.productAnalysis`
  - 主进程在同步商品库绑定快照时，将商品详情页最新 `productAnalysis` 同步写回到项目 `consistencyAssets.productAnalysis`。
  - 确保复刻流程里的商品描述、参考分析和后续 prompt 组装优先使用商品详情页已经生成好的最新 DNA，而不是项目里历史残留的旧描述。
  - 脚本候选生成、分镜图生成、分镜视频生成等旁路商品描述拼装，统一改为走 `buildPromptProductDescriptionText(...)`，强制使用商品详情最新 DNA。
  - 进入 `/clone/[projectId]` 时，`getProject()` 会自动强制同步一次绑定商品快照，并立即落库持久化，不再依赖用户手动刷新页面后才把最新商品详情 DNA 带入项目。
- 使用说明：
  - 商品详情页刷新过 `Product DNA` 后，重新进入或刷新 `/clone` 项目，参考分析区应直接显示商品详情页的最新 DNA 内容。
- Windows / Linux 兼容说明：
  - 本轮仅修改 Vue 前端显示优先级与 TypeScript 主进程同步逻辑，不依赖平台专属能力。

## 2026-05-23 商品详情页标题口径切换为深层多角度图

- 目标：
  - 将商品详情页对用户可见的旧口径“标准图 / 分析画板 / 多角度图”统一收敛为“深层多角度图”。
- 本轮最小改动：
  - 仅调整 `src/renderer/src/ui/views/ProductDetailView.vue` 展示文案。
  - 不修改底层字段名，不修改主进程逻辑，不改商品生成链路。
- 修复内容：
  - 商品详情页主按钮、状态标题、结果预览标题、占位说明、Product DNA 副标题等统一改为“深层多角度图”口径。
  - 页面摘要状态同步改为：
    - `深层多角度图 <状态>`
    - `Product DNA <状态>`
- 使用说明：
  - 用户在商品详情页现在看到的是“生成深层多角度图 / 重新生成深层多角度图 / 查看深层多角度图”，不再混用旧的“标准图/分析画板”说法。
- Windows / Linux 兼容说明：
  - 本轮仅修改 Vue 前端文案，不依赖平台专属能力。

## 2026-05-23 分镜图重新生成状态反馈补齐

- 目标：
  - 修复 `/clone/[projectId]` 分镜图重新生成时缺少可见反馈的问题，避免用户点击后无法判断是否已发起任务。
- 本轮最小改动：
  - 仅调整 `src/renderer/src/ui/views/CloneView.vue` 的前端状态展示与按钮交互。
  - 同步补齐 `src/renderer/src/ui/views/ProductDetailView.vue` 残留旧口径文案。
  - 不修改主进程分镜生成接口，不修改数据结构，不改生成链路。
- 修复内容：
  - 分镜设计表格新增单镜头 `重新生成中` 本地状态。
  - 点击单个分镜“重新生成”后：
    - 当前行高亮为处理中
    - 缩略图空态显示 `生成中`
    - 行内增加“正在重新生成分镜图，请稍候自动刷新结果”提示
    - 当前镜头重新生成按钮与提示词按钮临时禁用，避免重复提交
  - 商品详情页用户可见文案继续统一为“深层多角度图”口径，不再混用“标准图/分析画板”。
- 使用说明：
  - 在 `/clone/[projectId]` 的分镜图表格里点击某一行“重新生成”后，该行会立即显示处理中状态，直到接口返回并刷新结果。
  - 在商品详情页点击生成时，页面提示统一显示为“生成深层多角度图 / 重新生成深层多角度图”。
- Windows / Linux 兼容说明：
  - 本轮仅修改 Vue 前端交互与展示文案，不依赖平台专属能力。

## 2026-05-23 分镜 Prompt 商品描述与商品图来源显式化

- 目标：
  - 让 `/clone/[projectId]` 的分镜图、分镜视频提示词预览明确展示“实际使用的 Product DNA 文本”和“实际使用的商品参考图集合”，避免用户误判没有接入商品描述。
- 本轮最小改动：
  - 仅调整 `src/main/modules/clone/service.ts` 的提示词预览返回结构。
  - 仅调整 `src/renderer/src/ui/views/CloneView.vue` 的提示词预览展示。
  - 不修改真正的分镜生成接口，不改模型调用链，不改商品数据结构。
- 修复内容：
  - 分镜图提示词预览新增：
    - `实际使用的 Product DNA`
    - `商品图使用说明`
    - `商品参考图` 全量展示
  - 分镜视频提示词预览同步新增相同说明，确保图片和视频两端口径一致。
  - 商品参考图区明确约定：
    - 第 1 张为主商品锚点
    - 后续图片为辅助商品图
  - 商品图使用说明显式声明当前 prompt 使用的是绑定商品最新 Product DNA，而不是旧项目残留描述。
- 使用说明：
  - 打开分镜图或分镜视频提示词预览后，可以直接看到本次 prompt 使用的 Product DNA 原文，以及主商品图/辅助商品图的具体文件。
- Windows / Linux 兼容说明：
  - 本轮仅修改 TypeScript 与 Vue 展示逻辑，不依赖平台专属能力。

## 2026-05-23 Start Prompt 商品描述前移保留

- 目标：
  - 修复分镜图 `Start Prompt` 中商品描述块容易被后置长文案挤掉，导致预览里看起来没有真正使用 Product DNA 的问题。
- 本轮最小改动：
  - 仅调整 `src/main/modules/clone/gptImage.ts` 的分镜图片 prompt 拼装顺序与局部长度控制。
  - 不修改分镜视频生成链路，不改数据结构，不改前端页面结构。
- 修复内容：
  - `TEXT PRODUCT DESCRIPTION LOCK` 从后置区前移到高优先级区域，紧跟参考图锁与禁止替代规则之后。
  - 商品描述锁标题从 `SUPPORT` 明确收敛为 `LOCK`，便于预览和排查时直接识别。
  - 商品描述文本单独压缩，保留结构、材质、颜色、几何、佩戴/摆放和比例等核心 DNA。
  - `compiledPrompt` 长度上限进一步收紧，避免把前面的 Product DNA 块重新挤出 `Start Prompt`。
- 使用说明：
  - 重新打开分镜图提示词预览后，`Start Prompt` 中应能直接看到 `TEXT PRODUCT DESCRIPTION LOCK`。
  - 若继续重生成分镜图，新的 Start Prompt 会优先保留商品 DNA 描述。
- Windows / Linux 兼容说明：
  - 本轮仅修改 TypeScript 提示词拼装逻辑，不依赖平台专属能力。

## 2026-05-23 分镜视频商品描述与分镜图片统一

- 目标：
  - 修复分镜视频实际生成链路仍可能回退使用 `shot.materialNeed`，导致视频商品描述与分镜图片阶段使用的 Product DNA 不完全一致的问题。
- 本轮最小改动：
  - 仅调整 `src/main/modules/clone/types.ts`、`src/main/modules/clone/service.ts`、`src/main/modules/clone/providers.ts`。
  - 不修改页面结构，不改商品数据结构存储，不改模型接口。
- 修复内容：
  - `ShotSpec` 增加 `productIdentityText`，作为当前镜头统一的商品描述来源。
  - 分镜视频提示词预览构造出的 `effectiveShot` 显式写入 `productIdentityText`。
  - 分镜视频实际生成前构造 `strengthenedShot` 时，同样显式写入 `productIdentityText`。
  - `generateShotVideoByProviderChain(...)` 改为优先使用 `shot.productIdentityText`，只有缺失时才回退到 `shot.materialNeed`。
- 使用说明：
  - 现在分镜视频的商品描述应与分镜图片阶段使用的 Product DNA 保持同一份文本来源。
  - 重新打开分镜视频提示词预览，并重新生成视频后，应与分镜图片中的商品 DNA 口径一致。
- Windows / Linux 兼容说明：
  - 本轮仅修改 TypeScript 提示词与类型逻辑，不依赖平台专属能力。

## 2026-05-23 分镜视频 Prompt 模板主导重构

- 目标：
  - 将分镜视频核心提示词改为模板主导结构，统一按固定标题块输出商品、模特、场景、连续性、运镜、光效和脚本意图。
- 本轮最小改动：
  - 仅调整 `src/main/modules/clone/prompt.ts` 的 `buildOptimizedVideoPrompt(...)`。
  - 同步更新 `src/main/modules/clone/service.ts` 的视频提示词预览哨兵版本。
  - 不修改 provider 调用流程，不改负向词生成入口，不改页面结构。

## 2026-05-23 /clone 进入页分镜视频缺失 taskId 容错修复

- 目标：
  - 修复进入 `/clone/[projectId]` 时，历史分镜视频恢复流程遇到缺失 `taskId` 的脏状态会直接打断 `clone:getProject` 的问题。
- 本轮最小改动：
  - 仅调整 `src/main/modules/clone/service.ts` 的远端分镜视频恢复逻辑。
  - 不修改分镜视频生成接口，不改页面结构，不改 provider 调用链。
- 修复内容：
  - `reconcileRemoteStoryboardVideosInternal(...)` 在处理可恢复分镜时，若实际已无可继续查询的 `taskId`，不再抛异常中断整个项目加载。
  - `pollExistingSegmentTask(...)` 底层续查入口同步增加缺失 `taskId` 容错，避免单镜头自动续查、批量生成前复用旧任务等旁路再次抛错。
  - 缺失 `taskId` 的分镜会被降级标记为失败，并写入明确错误文案，提示用户重新生成该分镜视频。
  - 项目页其余正常分镜仍继续完成本地/远端恢复，不再被单个脏状态拖垮。
- 使用说明：
  - 现在进入 `/clone/[projectId]` 时，即使某个旧分镜视频记录缺少 `taskId`，页面也应正常打开。
  - 对应异常分镜会显示为失败状态，按提示重新生成即可恢复。
- Windows / Linux 兼容说明：
  - 本轮仅修改 TypeScript 主进程恢复逻辑，不依赖平台专属能力。

## 2026-05-23 脚本变体默认选择阈值改为 8.5 分

- 目标：
  - 调整脚本变体自动默认选择规则：评分不高于 `8.5` 分时默认沿用参考视频原脚本，只有高于 `8.5` 分时才自动切到最高分新脚本。
- 本轮最小改动：
  - 仅调整 `src/main/modules/clone/service.ts` 的脚本候选默认选择逻辑与自动流程提示文案。
  - 不修改脚本变体页面结构，不改评分模型，不改候选生成接口。
- 修复内容：
  - 新增统一脚本默认选择规则：
    - 最高分新脚本 `> 8.5`：自动选择该最高分新脚本
    - 最高分新脚本 `<= 8.5`：默认选择 `参考视频原脚本`
  - 整片脚本候选成功路径与逐镜候选回退路径统一复用同一阈值判断，避免两条链路默认结果不一致。
  - 自动流程脚本阶段提示文案同步改为“按 8.5 分阈值选择脚本”。
- 使用说明：
  - 生成脚本变体并完成评分后，如果所有新脚本最高分只有 `8.5` 或更低，系统会继续沿用参考视频原脚本。
  - 只有当新脚本里存在高于 `8.5` 分的候选时，系统才会自动选中该最高分脚本并写回分镜。
- Windows / Linux 兼容说明：
  - 本轮仅修改 TypeScript 主进程选择逻辑，不依赖平台专属能力。

## 2026-05-23 分镜视频 Prompt 改为 Reference Dominance 主导

## 2026-05-23 自动任务并发隔离 V2.1

- 目标：
  - 让 `/clone/[projectId]` 的自动分镜视频任务在桌面端单进程内实现提交、续查、下载三池隔离，减少任务之间互相阻塞，支撑 `100-300` 条视频任务持续推进。
- 本轮最小改动：
  - 仅调整 `src/main/modules/clone/service.ts`、`src/main/modules/clone/types.ts`、`src/main/modules/clone/repo.ts`、`src/main/modules/clone/cloud-queue.ts`。
  - 同步调整 `src/renderer/src/ui/views/CloneView.vue` 与 `src/renderer/src/composables/useCloneProjectWorkspace.video.ts` 的状态摘要展示。
  - 不修改 provider 接口，不改商品 DNA 体系，不改分镜图片链路。
- 修复内容：
  - 主进程视频自动任务拆分为 `submit / poll / download` 三类池化执行路径。
  - 自动视频入口不再在单镜头内部串行执行“提交 + 阻塞轮询 + 下载回写”整链路，改为提交后立即返回，由后台池继续推进。
  - 远端恢复链路复用 `pollPool` 与 `downloadPool`，避免 `getProject()` 首屏加载时被同步恢复阻塞。
  - 单镜头手动“同步任务状态”入口也复用 `pollPool`，避免手动续查再次走阻塞旁路。
  - 单镜头“强制重新生成”成功提示改为明确说明“已提交后台调度”，并附带当前三池摘要。
  - 当前 provider 差异显式保留：
    - `apifox_hub` / 远端 task 型视频：提交即返，后台续查与下载
    - `seedance / kling / grsai` 当前实现：仍是同步拿到本地视频文件后再返回
  - 前端手动重生成提示改为区分：
    - `background_dispatched`
    - `blocking_completed`
  - 新增项目级运行态摘要：
    - `submitActive / submitQueued`
    - `pollActive / pollQueued`
    - `downloadActive / downloadQueued`
  - 前端视频阶段摘要与运行日志改为明确显示三池状态，用户可以区分“后台提交中 / 续查中 / 下载回写中”，不再混成单一“生成中”。
  - 自动视频阶段不再“一轮分发后直接结束”：
    - 若仍有 `pending / polling_timeout / downloading / failed but retryable` 镜头，自动流程保持 `running`
    - 页面定时刷新会继续触发下一轮视频调度，直到全部完成或进入不可恢复失败
  - 自动视频阶段新增进度心跳：
    - 记录 `lastHeartbeatAt / lastProgressAt / idleHeartbeatCount`
    - 若连续多轮没有完成数、待续查数或三池活跃数变化，摘要会明确显示“连续空转 N 轮”
  - 自动视频阶段新增空转纠偏：
    - 连续空转达到阈值后，系统会自动优先续查已有 `taskId` 且处于 `polling_timeout` / `downloading` 的镜头
    - 避免自动流程停留在“有待续查任务但没人继续拉”的状态
  - 自动视频失败结果补充分流标签：
    - `missing_task`
    - `remote_timeout`
    - `download_failed`
    - `remote_failed`
    - `local_failed`
  - 前端分镜视频状态展示优先按以上标签解释失败原因，而不是统一显示“失败 / 待查询”。
- 使用说明：
  - 进入 `/clone/[projectId]` 后，如果有历史云端任务待恢复，页面会先正常打开，再由后台继续续查与下载。
  - 点击“生成分镜视频”或“自动推进到分镜视频阶段”后，状态栏会显示三池摘要，例如：`提交 2/6，续查 4/12，下载 1/3`。
  - 若部分镜头仍在远端执行中，当前轮返回会显示“已进入后台调度”，无需等待整个批次同步结束。
- Windows / Linux 兼容说明：
  - 本轮仅修改 Electron 主进程与 Vue 前端 TypeScript 逻辑，不依赖平台专属 API。

## 2026-05-24 自动分镜视频续跑统计与失败分流补强

- 目标：
  - 修复自动分镜视频在执行一半后看起来“不再自动运行”的问题，统一主进程与前端对待处理镜头的统计口径。
- 本轮最小改动：
  - 调整 `src/main/modules/clone/service.ts` 的分镜视频汇总逻辑。
  - 调整 `src/main/modules/clone/types.ts`、`src/shared/clone-workspace/client.ts`、`src/renderer/src/composables/useCloneProjectWorkspace.shared.ts`、`src/renderer/src/ui/views/CloneView.vue` 的摘要字段与展示。
  - 不修改 provider 接口，不改商品 DNA，不改分镜图片/视频 prompt。
- 修复内容：
  - 分镜视频 `queueSummary.pending` 不再仅等于 `timeout`，而是改为真实待推进总量，覆盖：
    - `creating`
    - `remote_running`
    - `downloading`
    - `polling_timeout`
  - 主进程新增项目级最近一次分镜视频摘要缓存：
    - `generationQueue.lastShotVideoSummary`
    - `generationQueue.lastShotVideoFailureBreakdown`
  - 自动续跑、页面轮询、视频阶段摘要统一优先使用主进程汇总结果，避免前端各处各算各的导致“还有任务但页面误判为已跑完”。
  - 视频阶段新增失败分流摘要展示：
    - `超时待续查`
    - `下载失败`
    - `缺少任务号`
    - `云端失败`
    - `本地失败`
  - 视频列表顶部统计补充关键失败类型数量，方便快速分辨是“远端待续查”还是“必须重生”。
- 使用说明：
  - 自动分镜视频阶段如果仍有远端轮询、下载回写或超时待续查镜头，页面会继续显示待推进数量，不会过早停在“好像已经结束”的状态。
  - 当系统长时间没有推进时，用户可以直接从视频阶段摘要看到当前是卡在超时续查、下载回写还是缺少任务号。
- Windows / Linux 兼容说明：
  - 本轮仅修改 TypeScript / Vue 逻辑，不依赖平台专属能力。

## 2026-05-24 分镜视频下载收尾卡住修复

- 目标：
  - 修复分镜视频云端已成功、页面却长期停在“结果下载中”的问题，避免下载阶段无限挂起并占住下载池。
- 本轮最小改动：
  - 调整 `src/main/modules/clone/atlasRetry.ts` 的媒体下载实现。
  - 调整 `src/main/modules/clone/service.ts` 的 `downloadCompletedSegmentTask(...)` 失败回写逻辑。
  - 不修改 provider 接口，不改前端页面结构。
- 修复内容：
  - 下载远端视频结果时新增硬超时，防止裸 `fetch(url)` 在网络卡死时无限等待。
  - 下载收尾失败后，镜头状态不再继续停留在 `downloading`，而是明确回写为：
    - `status = failed`
    - `error = [download_failed] ...`
  - 下载失败后会释放下载池槽位，避免后续已成功镜头也被前一条卡住。
  - 自动纠偏阶段优先级调整为：
    - `downloading`
    - `polling_timeout`
    - `remote_running / generating`
    先抢救已成功待回写的镜头，减少“结果下载中”堆积。
  - 前端“结果下载中”状态补充已等待时长，避免用户无法判断是否真的卡住。
- 使用说明：
  - 如果远端视频地址可正常下载，镜头会继续自动回写为完成态。
  - 如果远端下载链路异常，镜头会在超时后显示为“下载回写失败”，可以继续重试或手动续查，不会一直假卡在“结果下载中”。
  - 下载超时必须同时覆盖首包响应和响应体读取阶段；即使 `fetch` 已返回 200，只要视频流读取卡死，也必须及时失败回写并释放下载池。
  - 如果云端返回 `video_generating / video_url = null` 这类“仍在生成中”的状态，系统会保持镜头为“云端生成中”，并清掉该任务残留的旧错误上下文，避免用户误以为已经报错。
  - 对于单条 `结果下载中` 且已经拿到 `videoUrl` 的镜头，前端新增单独按钮：
    - `强制下载回写`
    - `强制下载回写当前镜头`
    该操作只处理当前镜头，不走整批同步。
- Windows / Linux 兼容说明：
  - 本轮仅修改 TypeScript 主进程下载与状态回写逻辑，不依赖平台专属能力。

- 目标：
  - 修复分镜视频提示词同时“锁产品”又“用 Product DNA 重定义产品”导致的视频一致性漂移问题，尤其是 VEO 类多模态视频模型下的产品重建偏移。
- 本轮最小改动：
  - 仅调整 `src/main/modules/clone/prompt.ts` 的 `buildOptimizedVideoPrompt(...)`。
  - 不修改分镜图片 prompt，不改视频 provider 接口，不改前端页面结构。
- 修复内容：
  - 分镜视频 prompt 去掉 `TEXT PRODUCT DESCRIPTION LOCK` 与 `PRODUCT VISUAL ANCHOR LOCK` 这类会驱动模型按文字重建产品的主干描述块。
  - 视频 prompt 改为 `Reference Dominance` 结构：
    - 参考图是唯一产品身份来源
    - 文本只负责运镜、动作、脚本和场景执行
    - 不允许通过文字重新定义、重建、重解释商品
  - 新增更明确的 `CORE RULE / STRICT CONSISTENCY / FRAME CONTINUITY / LIGHTING (ANTI-GLOW) / FAIL RULE` 视频约束段，强调“直接复用参考图中的产品，而不是按文字生成一个相似产品”。
  - 保留模特锁、场景锁、连续性锁、anti-glow 和物理/构图约束，但不再让商品 DNA 在视频 prompt 主体里承担产品定义职责。
- 使用说明：
  - 重新生成分镜视频后，模型应优先复用商品参考图中的同一实物，而不是根据 Product DNA 文字重建一个“像但不完全一样”的新产品。
  - 分镜视频提示词里的文本现在主要用于约束镜头运动、动作执行、场景延续和光效抑制。
- Windows / Linux 兼容说明：
  - 本轮仅修改 TypeScript 提示词拼装逻辑，不依赖平台专属能力。

## 2026-05-23 /clone 项目载入改为后台恢复分镜视频

- 目标：
  - 修复进入 `/clone/[projectId]` 时，查询到“视频生产已成功”的远端任务后还要同步下载和落库，导致界面长时间阻塞、项目页迟迟显示不出来的问题。
- 本轮最小改动：
  - 仅调整 `src/main/modules/clone/service.ts` 的 `getProject()` 与分镜视频恢复调度方式。
  - 不修改前端页面结构，不改视频生成接口，不改恢复逻辑本身的查询/下载规则。
- 修复内容：
  - `cloneService.getProject()` 不再同步 `await reconcileRemoteStoryboardVideosInternal(...)`。
  - 项目页载入时改为先返回当前项目快照，再后台异步调度分镜视频远端恢复。
  - 新增项目级 in-flight 去重，避免短时间重复进入或刷新页面时并发启动多次相同恢复任务。
- 使用说明：
  - 现在进入 `/clone/[projectId]` 时，界面应先正常显示。
  - 若后台发现某些分镜视频远端已完成，会在稍后刷新时逐步回写为下载中或完成态，而不是卡住整个项目页。
- Windows / Linux 兼容说明：
  - 本轮仅修改 TypeScript 主进程调度逻辑，不依赖平台专属能力。

## 2026-05-23 /clone 绑定商品优先直用商品详情 DNA 与深层多角度图

- 目标：
  - 修复 `/clone` 参考分析虽然已经读取商品详情 `Product DNA`，但绑定商品时仍会重复触发商品标准源/商品图模型生成的问题。
- 本轮最小改动：
  - 仅调整 `src/main/modules/clone/service.ts` 的商品绑定缓存逻辑。
  - 不修改商品详情页生成链路，不改前端页面结构，不改分镜生成接口。
- 修复内容：
  - `/clone` 绑定商品时，如果商品详情页已经存在：
    - `analysisBoardPath` 已完成
    - `productAnalysis` 已存在
  - 则直接复用这张深层多角度图和对应 `Product DNA` 作为当前项目的商品源。
  - 这种情况下不再重复调用商品标准源提纯或多角度图生成模型，避免用户在参考分析区看到“又去生成商品图片”。
- 使用说明：
  - 商品详情页已经生成过深层多角度图和 `Product DNA` 后，再进入 `/clone` 绑定该商品，系统应直接复用现有结果。
  - 只有商品详情页还没有这些结果时，`/clone` 才会继续走兜底的商品图处理链路。
- Windows / Linux 兼容说明：
  - 本轮仅修改 TypeScript 主进程缓存复用逻辑，不依赖平台专属能力。

## 2026-05-23 自动视频任务改为受控并发并隔离恢复链路

- 目标：
  - 优化自动任务执行时相互影响、串行阻塞明显的问题，为高并发批量生成建立更稳定的基础。
- 本轮最小改动：
  - 仅调整 `src/main/modules/clone/service.ts` 的自动分镜视频执行链路。
  - 不修改前端页面结构，不改模型接口，不改最终成片逻辑。
- 修复内容：
  - `generateShotVideosFromStoryboardFrames(...)` 不再在入口同步等待整批远端恢复完成，而是改为后台调度恢复任务。
  - 自动分镜视频阶段从串行 `for` 循环改为受控并发 worker 执行，并发度直接使用项目 `generationQueue.options.maxConcurrentCloudJobs`。
  - 单个镜头的远端查询、下载、重试、超时不再阻塞整批后续镜头提交，降低任务之间的相互拖慢。
  - 保留每条镜头自己的状态写回、失败记录和超时回写，避免并发后丢失镜头级诊断信息。
- 使用说明：
  - 自动生成分镜视频时，多条镜头会按受控并发同时推进，而不是前一条完全结束后下一条才开始。
  - 项目载入和后台远端恢复不会再直接卡住自动视频提交主链路。
- Windows / Linux 兼容说明：
  - 本轮仅修改 TypeScript 主进程调度与并发执行逻辑，不依赖平台专属能力。

## 2026-05-23 自动任务并发隔离 V2.1 第一阶段落地

- 目标：
  - 在不改现有接口形状的前提下，先把自动视频任务的三池并发基础和前端摘要通路接起来。
- 本轮最小改动：
  - 调整 `src/main/modules/clone/types.ts`、`src/main/modules/clone/repo.ts`、`src/main/modules/clone/cloud-queue.ts`、`src/main/modules/clone/service.ts`。
  - 调整 `src/renderer/src/ui/views/CloneView.vue` 的视频阶段描述摘要。
- 修复内容：
  - `generationQueue.options` 增加：
    - `maxConcurrentSubmitJobs`
    - `maxConcurrentPollJobs`
    - `maxConcurrentDownloadJobs`
  - `generationQueue.runtime` 增加三池实时摘要：
    - `submitActive / pollActive / downloadActive`
    - `submitQueued / pollQueued / downloadQueued`
  - 主进程新增全局三池限流基础和项目级 runtime 写回能力。
  - 自动视频阶段在调度前先完成镜头分类，并把提交/轮询/下载排队摘要写回项目。
  - 视频阶段描述文案开始显示三池摘要，便于区分“排队提交”“后台轮询”“下载回写”。
- 使用说明：
  - 进入视频阶段后，页面说明区域会看到当前任务池摘要。
  - 自动视频批量推进时，主进程会按提交/轮询/下载三个方向分别受控并发，而不是继续只看单一云任务并发。
- Windows / Linux 兼容说明：
  - 本轮仅修改 TypeScript / Vue 逻辑，不依赖平台专属能力。
- 修复内容：
  - 视频 prompt 改为固定 12 段结构：
    - `SILENT VISUAL COMMERCIAL`
    - `GLOBAL CONSISTENCY SYSTEM`
    - `REFERENCE PRIORITY (CRITICAL)`
    - `PRODUCT LOCK (HARD CONSTRAINT)`
    - `MODEL LOCK`
    - `SCENE LOCK`
    - `FRAME CONTINUITY LOCK (CORE)`
    - `MOTION CONTROL`
    - `LIGHTING CONTROL (ANTI-GLOW)`
    - `CAMERA LOCK`
    - `ANTI-DRIFT SYSTEM`
    - `SHOT INSTRUCTION`
  - `PRODUCT LOCK` 强制注入当前绑定商品最新 `Product DNA`。
  - `MODEL LOCK` 强制注入当前选中模特身份文本。
  - `SCENE LOCK` 与 `SHOT INSTRUCTION` 优先使用当前镜头 `visualDescription / generationPrompt / actionDescription / cameraDescription / productFocus / scriptText`。
  - `LIGHTING CONTROL (ANTI-GLOW)` 收敛现有 anti-glow / anti-sparkle 规则，避免继续散落在多段自由文案中。
  - 视频提示词预览哨兵更新为 `shot-video-prompt-2026-05-23-template-driven-v5`，便于确认已切到模板主导版本。
- 使用说明：
  - 重新打开分镜视频提示词预览后，应能直接看到以上 12 个标题块。
  - 重新生成分镜视频后，商品描述、模特描述和场景锁应与模板块一一对应。
- Windows / Linux 兼容说明：
  - 本轮仅修改 TypeScript 提示词逻辑，不依赖平台专属能力。

## 2026-05-23 分镜视频 Prompt 向分镜图片口径回收

- 目标：
  - 修复分镜视频提示词与分镜图片提示词结构和口径偏离过大的问题，让视频重新回到“参考图锁 + 商品描述锁 + 直用锁 + 场景锁 + 连续性锁 + 模特锁”的同源体系。
- 本轮最小改动：
  - 仅调整 `src/main/modules/clone/prompt.ts` 的 `buildOptimizedVideoPrompt(...)`。
  - 同步更新 `src/main/modules/clone/service.ts` 的视频提示词预览哨兵版本。
  - 不修改 provider 调用流程，不改图片 prompt 骨架，不改页面结构。
- 修复内容：
  - 分镜视频 prompt 不再以一整套独立模板替代图片口径，而是回收为接近分镜图片 `Start/End Prompt` 的结构顺序。
  - 视频 prompt 现在优先保留这些核心块：
    - `REFERENCE IMAGE LOCK (CRITICAL)`
    - `NO SUBSTITUTE RULE`
    - `TEXT PRODUCT DESCRIPTION LOCK`
    - `PRODUCT VISUAL ANCHOR LOCK`
    - `FRAME SCENE ATMOSPHERE LOCK`
    - `FRAME CONTINUITY LOCK (CORE)`
    - `STRICT MODEL IDENTITY LOCK`
  - 视频专属部分只补充在后半段：
    - `MOTION CONTROL`
    - `LIGHTING CONTROL (ANTI-GLOW)`
    - `CAMERA LOCK`
    - `ANTI-DRIFT SYSTEM`
    - `SHOT INSTRUCTION`
  - 视频提示词预览哨兵更新为 `shot-video-prompt-2026-05-23-image-aligned-v6`。
- 使用说明：
  - 重新打开分镜视频提示词预览后，应能看到视频 prompt 与分镜图片 prompt 共享相同的核心锁块名称和顺序。
  - 视频仍保留必要的运镜与视频执行说明，但不再脱离图片口径单独说一套。
- Windows / Linux 兼容说明：
  - 本轮仅修改 TypeScript 提示词逻辑，不依赖平台专属能力。

## 2026-05-23 分镜图片/视频一致性回退并融合

- 目标：
  - 将分镜视频 prompt 从近期偏离图片链路的独立结构回退到“控制层 + 执行层 + 风格层”思路，同时保留 Product DNA 同源、anti-glow 和预览可见性能力。
- 本轮最小改动：
  - 仅调整 `src/main/modules/clone/prompt.ts` 的 `buildOptimizedVideoPrompt(...)`。
  - 同步更新 `src/main/modules/clone/service.ts` 的视频提示词预览哨兵版本。
  - 不修改 provider API、IPC、图片 prompt 骨架与前端数据结构。
- 修复内容：
  - 分镜视频 prompt 回退为三层结构：
    - `CONTROL LAYER`
    - `EXECUTION LAYER`
    - `STYLE LAYER`
  - `CONTROL LAYER` 明确保留并对齐分镜图片核心锁块：
    - `REFERENCE IMAGE LOCK (CRITICAL)`
    - `NO SUBSTITUTE RULE`
    - `TEXT PRODUCT DESCRIPTION LOCK`
    - `PRODUCT VISUAL ANCHOR LOCK`
    - `FRAME SCENE ATMOSPHERE LOCK`
    - `FRAME CONTINUITY LOCK`
    - `STRICT MODEL IDENTITY LOCK`
    - `SPATIAL ANCHOR LOCK`
    - `PHYSICS CONSISTENCY`
    - `COMPOSITION LOCK`
  - `EXECUTION LAYER` 只承载脚本、动作、镜头、场景执行和时长，不再承担 identity 锁职责。
  - `STYLE LAYER` 保留 anti-glow / anti-sparkle / 手机真实感约束。
  - 视频提示词预览哨兵升级为 `shot-video-prompt-2026-05-23-rollback-fused-v7`。
- 使用说明：
  - 重新打开分镜视频提示词预览后，应看到视频 prompt 优先表现为与分镜图片同源的控制层锁块，而不是独立 narrative 模板。
  - 分镜视频在保留视频执行说明的同时，应重新贴近分镜图片的一致性锁定方式。
- Windows / Linux 兼容说明：
  - 本轮仅修改 TypeScript 提示词逻辑，不依赖平台专属能力。

## 2026-05-23 商品标准图成功后不中断多角度画板链路

- 目标：
  - 修复商品标准图已经生成成功后，多角度分析画板阶段失败却把标准图状态一并回滚为失败的问题。
- 本轮最小改动：
  - 仅调整 `src/main/modules/clone/service.ts` 商品库建模状态写回顺序。
  - 不修改单图上传规则，不修改标准图生成算法，不修改分析画板生成实现。
- 修复内容：
  - 标准图生成成功后立即单独落库，`canonicalSourceStatus` 先写为 `done`。
  - 多角度画板阶段改为独立第二阶段，失败时只更新 `analysisBoardStatus` 为 `failed`。
  - 第二阶段失败时保留已成功生成的 `canonicalSourcePath`、`canonicalSourceStatus` 和诊断信息，不再错误清空标准图结果。
  - 同步覆盖商品详情页直接触发与后台刷新触发两条商品建模入口。
- 使用说明：
  - 现在点击生成后，若标准图成功但多角度画板失败，页面应保留标准图成功状态，只提示分析画板阶段失败。
  - 后续可直接基于已生成标准图继续排查或重试多角度画板，而不需要重新生成标准图。
- Windows / Linux 兼容说明：
  - 本轮仅修改 TypeScript 主进程状态流转逻辑，不依赖平台专属能力。

## 2026-05-23 商品详情页双阶段状态拆分显示

- 目标：
  - 让商品详情页明确区分“标准图状态”和“多角度分析画板状态”，避免第二阶段失败时用户误以为标准图也失败。
- 本轮最小改动：
  - 仅调整 `src/renderer/src/ui/views/ProductDetailView.vue` 展示层状态绑定。
  - 不修改商品建模主进程逻辑，不修改上传规则，不修改接口字段。
- 修复内容：
  - 页面新增标准图阶段状态与分析画板阶段状态的独立计算。
  - 摘要区与右侧状态卡改为同时显示：
    - `标准图 <状态>`

## 2026-05-24 分镜视频云端同步与结果回写修复

- 目标：
  - 修复 `/clone/[projectId]` 分镜视频阶段点击“同步云端状态”或单条“强制下载回写 / 继续查询”时，界面看起来已触发但实际没有真正等待回写结果的问题。
- 本轮最小改动：
  - 调整 `src/main/modules/clone/service.ts` 单镜头同步与强制下载回写入口。
  - 调整 `src/main/modules/clone/remoteStoryboardRecovery.ts` 项目级恢复链路。
  - 调整 `src/renderer/src/composables/useCloneProjectWorkspace.video.ts` 的“同步云端状态”前端入口。
- 修复内容：
  - “同步云端状态”改为直接调用项目级 `reconcileRemoteStoryboardVideos(...)`，不再只循环派发单镜头后台同步。
  - 当远端任务已经成功并且已有 `videoUrl`，即使本地文件丢失或当前状态未手动切到 `downloading`，恢复链也会直接进入下载回写。
  - 项目级恢复在轮询到 `completed + video_url` 后，不再只返回 `downloading`，而是继续立即进入下载回写，修复“同步云端状态后仍长期停在云端生成中/下载中”的问题。
  - 单条“继续查询”和“强制下载回写”不再只做后台异步派发，而是等待当前镜头同步链完成后再返回最新状态。
  - 本地恢复链补充检查 `viral-clone/<projectId>/shots/<shotId>/generated_clip.mp4`，修复“视频文件其实已经下载完成，但状态仍长期停在 downloading / 云端生成中”的问题。
  - 任务池新增运行时脏计数自愈：若项目库中残留 `pollActive / downloadActive / submitActive` 大于当前进程真实活跃数，会在进入任务池前自动收敛，修复“同步云端状态只有日志但永远不真正执行”的卡死问题。
  - 单次云端续查新增明确最大轮询次数：按 `waitMs / pollMs` 计算最多尝试次数，超出后直接落为 `polling_timeout`，避免无结果时无限查询。
  - `openai_video / sora / grok / veo` 查询候选统一优先走 `/v1/video/query`，并跳过返回 HTML 壳页面的假成功响应，修复与本次 `vectorengine` 相同的错误查询路径问题。
  - “强制下载回写”升级为单镜头硬恢复：直接按当前 `taskId` 直查云端、拉取 `video_url`、下载并落库，绕过整项目恢复队列，专门处理个别顽固卡住的分镜视频。
  - 视频任务查询继续兼容多种 `taskId` / 查询 URL 口径，避免云端已成功但本地一直停留在“云端生成中”。
- 使用说明：
  - 在分镜视频阶段点击“同步云端状态”后，应看到已处理数量、成功回写数量和失败数量，而不是只有静默刷新。
  - 对单条处于“结果下载中 / 云端生成中”的镜头点击“强制下载回写”或“继续查询”后，应等待该镜头拿到实际回写结果或明确错误。
- Windows / Linux 兼容说明：
  - 本轮仅修改 TypeScript / Electron IPC / Vue 逻辑，不依赖平台专属能力。
    - `画板 <状态>`
  - 当标准图成功、画板失败时，页面明确提示可以直接重试画板阶段。
- 使用说明：
  - 商品详情页现在应能直接看出是第一阶段失败，还是第二阶段失败。
  - 若看到“标准图 生成完成 / 画板 生成失败”，说明无需重跑标准图，可直接重试画板。
- Windows / Linux 兼容说明：
  - 本轮仅修改 Vue 前端显示逻辑，不依赖平台专属能力。

## 2026-05-23 商品详情页画板状态误判修正

- 目标：
  - 修复商品详情页在“只有标准图、尚未实际生成分析画板”时，错误提示“多角度分析画板生成失败”的问题。
- 本轮最小改动：
  - 仅调整 `src/renderer/src/ui/views/ProductDetailView.vue` 前端状态判定。
  - 不修改主进程建模逻辑，不修改模型调用，不修改数据结构。
- 修复内容：
  - `analysisBoardPath` 不再回退使用 `canonicalSourcePath`。
  - `analysisBoardReady` 不再因为标准图成功而被判定为分析画板成功。
  - 避免“标准图已生成”被前端误识别成“分析画板已生成或已失败”的错误状态文案。
- 使用说明：
  - 当系统只生成了标准图、尚未真正进入或完成画板阶段时，页面不应再提前提示“画板生成失败”。
- Windows / Linux 兼容说明：
  - 本轮仅修改 Vue 前端计算逻辑，不依赖平台专属能力。

## 2026-05-23 白底商品图直通多角度分析画板

- 目标：
  - 当上传图本身已经是白底、纯商品、无遮挡的标准商品图时，跳过“先提纯标准图”步骤，直接生成多角度分析画板。
- 本轮最小改动：
  - 仅调整 `src/main/modules/clone/service.ts` 商品库建模入口与 `src/main/modules/clone/productImageSanitizer.ts` 图像审查逻辑。
  - 不修改上传规则，不新增界面按钮，不改 `/clone` 使用方式。
- 修复内容：
  - 新增“白底纯商品图直通”审查：
    - 必须是纯商品
    - 必须无人物残留
    - 必须是白底或近白底商品图
    - 必须是干净、完整、可直接用于电商标准源的产品图
  - 若审查通过：
    - 原始上传图直接作为 `canonicalSourcePath`
    - 跳过标准图提纯模型调用
    - 直接基于原图生成多角度分析画板与 Product DNA
  - 若审查不通过：
    - 继续沿用原有“先生成标准图，再生成多角度画板”的单图流程
  - 同步覆盖商品详情页直接触发与后台刷新触发两条建模入口。
- 使用说明：
  - 现在如果直接上传白底纯商品图，系统会优先判断该图是否可以直接作为标准源。
  - 通过后会直接进入多角度分析画板生成，不再额外绕一遍标准图提纯。
- Windows / Linux 兼容说明：
  - 本轮仅修改 TypeScript 主进程逻辑与多模态审查调用，不依赖平台专属能力。

## 2026-05-23 商品详情页文案切换到白底直通主流程

- 目标：
  - 让商品详情页文案与当前“白底纯商品图可直接生成多角度分析画板”的主流程保持一致。
- 本轮最小改动：
  - 仅调整 `src/renderer/src/ui/views/ProductDetailView.vue` 显示文案与状态说明。
  - 不修改主进程流程，不修改接口，不修改上传组件行为。
- 修复内容：
  - 页面主说明从“先生成标准图，再生成多角度图”切换为“白底图优先直通多角度画板，非白底图再走标准源判定”口径。
  - 状态说明优先突出：
    - 商品图上传
    - 白底直通/标准源判定
    - 多角度分析画板生成
    - Product DNA 复用
- 使用说明：
  - 用户在商品详情页应能直接理解当前主流程，不再默认认为所有图片都必须先单独生成标准图。
- Windows / Linux 兼容说明：
  - 本轮仅修改 Vue 前端文案，不依赖平台专属能力。

## 2026-05-21 桌面端数据加载性能与 SQLite 恢复

- 目标：
  - 修复桌面端主流程数据加载慢的问题。
  - 恢复跨平台可用的 SQLite 持久化，避免 Electron 运行时因 `node:sqlite` 不可用而退回 JSON 全量读写。
- 本轮最小改动：
  - 仅调整桌面端主进程 SQLite 适配层与 Web-Next `/clone` 工作台轮询策略。
  - 不修改复刻业务数据结构，不改 IPC 协议，不改页面主布局。
- 修复内容：
  - `web-platform`、`clone`、`prompt-consistency-db` 三处 SQLite 适配层统一增加 `better-sqlite3` 回退实现。
  - 运行时优先尝试 `node:sqlite`，不可用时自动切到 `better-sqlite3`，继续保持 Windows 开发与 Linux 部署兼容。
  - `/clone` 工作台自动轮询从固定 5 秒调整为：
    - 任务活跃时 5 秒
    - 空闲时 15 秒
    - 手动关闭自动刷新时停止轮询
- 使用说明：
  - 本地执行 `npm install` 后重新启动桌面端。
  - 正常启动后不应再看到 `SQLite unavailable, fallback to JSON storage`。
  - `/clone` 页面在无活跃生成任务时，数据刷新频率会自动降低，减少空转加载。
- Windows / Linux 兼容说明：
  - Windows 开发环境下可直接使用 `better-sqlite3` 恢复 SQLite 持久化。
  - Linux 部署环境同样走 Node 原生模块加载，不写死平台路径。
- 若未来运行时恢复支持 `node:sqlite`，当前实现仍可优先使用该内置能力。

## 2026-05-22 分镜视频提示词高光收紧

- 目标：
  - 收紧分镜视频提示词中的高光与闪耀效果控制。
  - 所有商品视频统一压制夸张 sparkle / glow / bloom / VFX 风格，保留真实材质的轻微反光。
- 本轮最小改动：
  - 仅调整主进程视频 prompt 约束层与共享 negative prompt。
  - 不修改页面、不修改视频接口协议、不修改商品数据结构。
- 修复内容：
  - 视频正向 prompt 新增全商品通用 `highlight realism rule`。
  - 允许轻微、真实、克制的材质反光。
  - 禁止夸张闪耀、梦幻发光、爆闪、高能量广告特效、白边高光、过曝亮斑和豪华 VFX。
  - 共享 negative prompt 补充通用反特效闪耀词，覆盖所有商品类型。
  - 保留耳饰专项珠宝规则，但不再只依赖耳饰分支生效。
- 使用说明：
  - 重新生成分镜视频后，新提示词约束会自动生效。
  - 若商品本身有钻面、金属或镜面反光，仍可保留轻微自然亮点，但不会再鼓励夸张特效化闪耀。
- Windows / Linux 兼容说明：
  - 本轮仅修改 TypeScript 提示词拼装逻辑，不依赖 Windows 专属 API。
  - Windows 开发与 Linux 部署均可使用同一套提示词约束。

## 2026-05-22 分镜视频运镜速度收紧

- 目标：
  - 修复分镜视频里推进、推出、平移等镜头速度过快、观感不自然的问题。
  - 让运镜更慢、更连续、更丝滑，避免突然加速和镜头感跳变。
- 本轮最小改动：
  - 仅调整主进程视频 prompt 运镜描述与默认运镜文案。
  - 不修改页面、不修改 provider API、不修改数据结构。
- 修复内容：
  - `zoom_in` / `zoom_out` 的默认运镜描述统一改为：
    - `very slow`
    - `smooth`
    - `continuous`
    - `stable speed`
  - `CAMERA MOTION LOCK` 补充硬约束：
    - 禁止 suddenly accelerate
    - 禁止 rush the pull-back
    - 禁止 snap forward
    - 禁止 cut to a new shot
    - 禁止 regenerate a new framing
    - 禁止 reset composition
  - 默认镜头运动幅度进一步收紧：
    - `zoom_in` 从 `1.00 -> 1.06` 收紧到 `1.00 -> 1.04`
    - `zoom_out` 从 `1.06 -> 1.00` 收紧到 `1.04 -> 1.00`
  - 平移类镜头文案同步改为 `slow and smooth` / `restrained lateral movement`，避免生成过急的横移。
- 使用说明：
  - 对已有分镜点击 `重新生成视频` 后，新的运镜速度约束会自动生效。
  - 在视频提示词预览中，`zoom_in` / `zoom_out` 应能直接看到：
    - `VERY SLOW`
    - `SMOOTH`
    - `CONTINUOUS`
    - `stable camera speed`
- Windows / Linux 兼容说明：
  - 本轮仅修改 TypeScript 提示词逻辑与默认文案，不依赖平台专属能力。
  - Windows 开发与 Linux 部署共用同一实现。

## 2026-05-22 generationPrompt 产品高光收敛

- 目标：
  - 收紧分镜 `generationPrompt` 中对产品高光与钻石/金属反光的描述。
  - 避免产品，尤其是钻石饰品，被导向过闪、过曝、特效化的夸张表现。
- 本轮最小改动：
  - 仅调整 `generationPrompt` 默认生成、AI 分析回填和结构化预览拼装。
  - 不修改 UI、不修改 provider API、不修改数据结构。
- 修复内容：
  - `generationPrompt` 新增统一收敛文案：
    - 产品保持自然、真实、物理可信
    - 钻石、锆石、水晶、镜面金属等仅允许轻微自然反光
    - 禁止 exaggerated sparkle、glow、bloom、starburst shine、magical glitter、luxury VFX、过曝 flashy rendering
  - 默认镜头生成链和 AI 分析回填链都带上同一套收敛规则，避免界面预览与实际生成口径不一致。
- 使用说明：
  - 重新分析或重新生成分镜后，新的 `generationPrompt` 会自动携带更自然的产品高光约束。
- Windows / Linux 兼容说明：
  - 本轮仅修改 TypeScript 提示词逻辑，不依赖平台专属能力。

## 2026-05-22 重新生成图片/视频时强制刷新提示词

- 目标：
  - 点击“重新生成图片”或“重新生成视频”时，确保使用最新提示词，而不是命中旧缓存结果。
- 本轮最小改动：
  - 不修改页面结构，不修改 provider API。
  - 仅调整重生入口的缓存命中策略。
- 修复内容：
  - 重新生成图片时，前端显式传递强制重生标记。
  - `generateGptShotFrames` 收到强制重生标记后跳过已缓存帧结果，改为重新按最新 prompt 生成。
  - 重新生成视频继续沿用现有 `forceRegenerate` 路径，并重新编译视频 prompt。
- 使用说明：
  - 现在点击“重新生成图片”或“重新生成视频”时，会优先按当前最新 prompt 重新生成，不再只是复用旧缓存图/旧任务。
- Windows / Linux 兼容说明：
  - 本轮仅调整 TypeScript 入口与缓存判定逻辑，不依赖平台专属能力。

## 2026-05-22 耳饰视频过闪提示词修复

- 目标：
  - 修复耳饰、钻石、银饰类分镜视频仍然出现过闪、过曝、特效化珠宝广告感的问题。
  - 仅调整提示词链路，不修改 UI、不修改 provider API、不修改主工作流。
- 本轮最小改动：
  - 仅修改 `generationPrompt` 清洗、视频正向 prompt 排序、视频真实负向 prompt 拼装与预览输出。
  - 不新增接口字段，不修改数据库结构。
- 修复内容：
  - 新增耳饰/珠宝 `generationPrompt` 清洗：
    - 将 `sparkling`、`visual impact`、`high-polish`、`sparkling stones` 等强闪耀词替换为更自然的表达。
    - 统一收敛为 `subtle natural highlights`、`restrained realistic reflections`、`natural silver texture`、`soft camera-realistic stone reflections`。
  - 视频正向 prompt 中的 `Highlight realism rule` 和 `Jewelry realism rule` 前移到更靠前位置，降低长 prompt 被截断后丢失反闪耀规则的风险。
  - 视频真实负向 prompt 统一强制补入：
    - `no exaggerated sparkle`
    - `no bloom-heavy highlights`
    - `no fantasy glow`
    - `no starburst highlights`
    - `no magical glitter`
    - `no luxury VFX`
    - `no overexposed jewelry shine`
    - `no glowing product`
  - 视频提示词预览中的 `Video Negative Prompt` 改为展示实际视频链会使用的反闪耀负向词，而不再只显示分镜原始 `negativePrompt`。
- 使用说明：
  - 对已有耳饰分镜，重新点击：
    - `重新生成图片`
    - `重新生成视频`
  - 重新生成后，新的图片与视频会使用更新后的提示词，不再复用旧的闪耀导向 prompt。
  - 在提示词预览中应直接看到：
    - `Generation Prompt` 不再包含 `sparkling stones`、`visual impact`、`high-polish silver texture`
    - `Video Positive Prompt` 明确出现 `slight, realistic, restrained highlights`
    - `Video Negative Prompt` 明确出现反闪耀负向词
- Windows / Linux 兼容说明：
  - 本轮仅修改 TypeScript 提示词逻辑与预览输出，Windows 开发与 Linux 部署共用同一实现。

## 2026-05-22 深层视频 prompt 商品一致性收敛

- 目标：
  - 修复深层视频 prompt 过长、过抽象、重复堆叠，导致视频商品与分镜图/参考图不一致的问题。
  - 只调整视频深层 prompt 链路，不改图片分镜生成链路。
- 本轮最小改动：
  - 新增视频专用短 prompt 构造器。
  - 视频实际发送 prompt 与提示词预览统一切换到短锚点 prompt。
  - 旧 consistency compiler 继续保留作内部辅助来源，但不再直接作为视频最终发送 prompt 文本主骨架。
- 修复内容：
  - 视频最终正向 prompt 改为短、硬、视觉锚点优先：
    - 商品必须与 reference image / storyboard frame 完全一致
    - 同一商品实例
    - 同一模特身份
    - 商品结构、材质、颜色、比例、佩戴点不变
    - 不新增装饰、不改款、不替换成相似商品
  - 镜头运动统一收敛为：
    - `subtle camera movement`
    - `keep the product as the visual anchor`
    - `gentle perspective change only`
  - 删除视频最终发送层里的大段抽象控制文本依赖，例如：
    - `ANTI-RECONSTRUCTION`
    - `fail instead`
    - 多层重复 reference / identity / consistency 大段规则
  - 视频提示词预览中的 `Compiled Prompt` 与 `Video Positive Prompt` 直接展示新的短 prompt，并与实际视频请求保持一致。
- 使用说明：
  - 对已有分镜重新生成视频后，会使用新的深层短 prompt。
  - 在视频提示词预览中，应直接看到简洁的商品锁定句，而不是旧的长层文本。
- Windows / Linux 兼容说明：
  - 本轮仅修改 TypeScript 主进程 prompt 拼装逻辑，不依赖平台专属能力。

## 2026-05-22 视频分镜 prompt 按图片分镜结构对齐

- 目标：
  - 让视频分镜 prompt 回到图片分镜 prompt 已验证有效的结构体系。
  - 视频只额外补充“连续镜头”和“真实轻微反光”要求，不再独立扩写一套长视频深层规则。
- 本轮最小改动：
  - 仅调整视频 prompt 构造器与视频提示词预览输出。
  - 不修改图片分镜 prompt，不修改 provider API，不修改数据 schema。
- 修复内容：
  - 视频 prompt 主结构改为接近图片分镜 prompt 的块顺序：
    - 视频目标说明
    - same-instance / cross-shot lock
    - reference image lock
    - no substitute + human priority
    - model identity lock
    - reference responsibility + product description
    - strict product identity lock
    - video continuity rule
    - minimal shot supplement
    - realism tail
  - 视频连续性文案改为强调“同一镜头的自然延续”，不再使用 `ANTI-RECONSTRUCTION` 这类抽象深层规则作为主骨架。
  - 相机运动统一收敛为：
    - `subtle camera movement`
    - `keep the product as the visual anchor`
    - `gentle perspective change only`
  - 真实高光约束只做轻量补充：
    - 允许轻微自然反光
    - 禁止 exaggerated sparkle / fantasy glow / bloom-heavy highlights / luxury VFX / overexposed jewelry shine
  - 视频提示词预览中的 `Compiled Prompt` / `Video Positive Prompt` 与实际发送给模型的 prompt 保持一致。
- 使用说明：
  - 重新生成视频后，视频 prompt 会直接按图片分镜风格展示商品锁定结构。
  - 若商品是耳饰/珠宝，仍可保留轻微真实反光，但不会再鼓励夸张爆闪和梦幻特效感。
- Windows / Linux 兼容说明：
  - 本轮仅修改 TypeScript 提示词逻辑，Windows 开发与 Linux 部署共用同一实现。

## 2026-05-22 Prompt Engine V4 产品分层策略

- 目标：
  - 把视频提示词引擎从“统一强控的强度系统”升级为“按产品类型切行为的控制系统”。
  - 不同商品不再共用同一种强一致性策略。
- 本轮最小改动：
  - 仅调整视频 prompt builder、视频 negative prompt 和视频预览调试信息。
  - 不修改图片分镜 prompt，不修改 provider API，不修改数据库结构。
- 修复内容：
  - 新增三种视频产品模式：
    - `STRICT`
    - `BALANCED`
    - `EXPRESSIVE`
  - `STRICT`：
    - 面向耳饰、珠宝、小配件等高一致性商品
    - 强调 `visually identical`
    - 强 unseen parts 限制
    - 更保守的镜头表达
  - `BALANCED`：
    - 面向手机壳、包、鞋、普通电商商品
    - 使用 `visually consistent`
    - 允许轻微视角变化
    - 不再默认极限压镜头

## 2026-05-23 商品库界面显示商品描述

- 目标：
  - 让商品库直接展示标准源分析生成的商品描述，便于在进入 `/clone` 前先检查 Product DNA 是否可复用。
  - 确保显示内容来自商品库本身，不依赖 clone 项目局部快照。
- 本轮最小改动：
  - 仅调整桌面端商品库列表页与商品详情页展示层。
  - 不修改商品生成链路、不新增接口字段、不改 prompt 逻辑。
- 修复内容：
  - 商品详情页新增 `商品描述 / Product DNA` 面板。
  - 面板显示 `category`、`summary`、`coreSubject`、`connectionStructure`、`materialDetails`、`wearingPosition`、`surfaceDetails`、`colorDetails`、`geometryDetails`、`sizeScale`、`matchingRules`。
  - 商品列表卡片新增分析状态与摘要预览，区分“已分析 / 未分析”。
  - 若标准源分析尚未生成，界面显示明确占位提示，提醒先生成或刷新 `Product Canonical Source`。
- 使用说明：
  - 打开商品库列表可直接查看每个商品是否已有分析，以及简版商品摘要。
  - 进入商品详情页后，可在 `商品描述 / Product DNA` 面板查看完整结构化分析。
  - 若内容为空，请先在商品详情页点击生成或刷新 `Product Canonical Source`。
- Windows / Linux 兼容说明：
  - 本轮仅修改 Vue 展示层与本地类型映射，不依赖平台专属 API。
  - Windows 开发与 Linux 部署共用同一实现。

## 2026-05-23 商品标准源切换为多图联合分析画板

- 目标：
  - 取消单张 `Product Canonical Source` 作为商品主标准源的模式。
  - 改为基于商品库全部上传图做联合分析，并生成一张商品分析画板作为主参考图。
- 本轮最小改动：
  - 保留现有字段兼容读取，避免旧项目崩溃。
  - 新增商品库 `analysisBoard*` 资产字段，并让 clone 优先消费分析画板。
- 修复内容：
  - 商品库标准源刷新不再逐张净化后选单张图，而是直接读取全部上传图。
  - 生成一张 6 格商品分析画板，作为商品库与 `/clone` 的主视觉参考。
  - `productAnalysis` 改为基于全部上传图联合归纳，不再只基于单张标准源。
  - `boundProductSnapshot`、`resolveStoryboardProductRefs(...)`、商品参考图快照同步切换为分析画板优先。
  - 商品详情页主展示区切换为“商品分析画板”语义，商品描述明确标记为联合分析结果。
- 使用说明：
  - 在商品详情页点击生成/刷新后，会产出一张商品分析画板，并同步刷新 Product DNA。
  - `/clone` 绑定该商品后，后续图片/视频 prompt 会优先使用分析画板和联合分析文本。
- Windows / Linux 兼容说明：
  - 分析画板当前改为复用现有 `ffmpeg` 二进制链路进行 6 格拼板，避免桌面端因 native `sharp` 模块加载失败而崩溃。
  - Windows 开发与 Linux 部署均复用同一套 `ffmpeg-static` 路径解析逻辑，不依赖 Windows 专属路径逻辑。

## 2026-05-23 商品分析画板拼板实现去除 sharp

- 目标：
  - 修复桌面端主进程因 `sharp` native 模块不可用导致无法启动的问题。
  - 保持“多图联合分析 + 分析画板主参考”链路不回退。
- 本轮最小改动：
  - 仅替换 `productAnalysisBoard.ts` 的图片拼板实现。
  - 不改商品库数据结构，不回退分析画板主链路，不引入新依赖。
- 修复内容：
  - 删除 `sharp` 依赖式拼板实现，避免桌面端因 native 模块加载失败崩溃。
  - 商品分析画板主模式改为：把商品库全部上传图作为 `reference images` 一起交给现有图片模型链生成单张分析画板。
  - 本地 `ffmpeg` 6 格拼图仅保留为 provider 失败时的兜底，不再作为主模式。
  - 商品详情页残留“标准源”主语义同步改为“分析画板 / 联合分析”。
- 使用说明：
  - 重新启动桌面端后，主进程不应再因为 `sharp` 报错崩溃。
  - 商品详情页点击“生成分析画板”后，系统会优先把全部上传图提交给图片模型生成联合分析画板。
  - 只有图片模型失败时，才会回退为本地兜底拼图。
- Windows / Linux 兼容说明：
  - 主模式复用现有跨平台图片 provider 链。
  - 兜底模式复用项目已有的 `ffmpeg-static` 二进制链路，Windows 开发与 Linux 部署共用同一实现。
  - 不新增 native Node 模块依赖。

## 2026-05-23 商品分析画板改为纯产品白底多角度

- 目标：
  - 收紧商品分析画板输出，明确禁止出现人物。
  - 分析画板必须表现为纯产品、多角度、白底的结构分析板。
- 本轮最小改动：
  - 仅调整商品分析画板的图片生成 prompt 与 negative prompt。
  - 不修改 `/clone` 主流程，不修改商品分析结构字段。
- 修复内容：
  - 分析画板 prompt 明确要求 `product-only`、`pure white background`、`6-panel`、`multiple angles and structural viewpoints`。
  - 明确禁止：人像、模特、手、耳朵、耳垂、皮肤、头发、脖子、脸、身体部位、佩戴场景、道具、生活化布景。
  - 即使参考图里有人体佩戴场景，也必须先抽离出纯商品本体，再生成白底多角度分析板。
  - 保留软棚拍式产品光照和轻微接触阴影，避免白底纯抠图看不清结构。
- 使用说明：
  - 重新生成商品分析画板后，输出应为无人白底产品面板，而不是佩戴图或生活场景图。
  - 若模型仍带出人物，应继续检查当前图片模型供应商实际返回结果，并回传失败样例。
- Windows / Linux 兼容说明：
  - 本轮仅修改 TypeScript prompt 逻辑，Windows 开发与 Linux 部署共用同一实现。

## 2026-05-23 商品分析画板输入源前移净化

- 目标：
  - 避免分析画板继续直接吃到“耳饰佩戴图/人物耳朵图”作为主参考，导致 panel 中混入人物。
- 本轮最小改动：
  - 仅调整商品分析画板生成前的参考图准备逻辑。
  - 不修改商品详情页结构，不修改 `/clone` 主流程。
- 修复内容：
  - 在生成商品分析画板前，先对商品上传图逐张执行 `product-only` 净化。
  - 优先使用净化后的纯商品图作为分析画板主参考输入。
  - 只要用于分析画板的纯商品净化图为空，就直接报错，不再回退使用原始佩戴图继续生成。
  - 诊断信息里同步记录分析画板输入源净化结果，便于后续排查。
- 使用说明：
  - 对耳饰、首饰这类经常带佩戴图的商品，重新生成分析画板后，系统会只使用抽离人物后的纯商品图生成白底多角度板。
  - 如果净化阶段无法抽离出纯商品图，界面会直接提示先补充无人商品图，而不是继续生成带人物的错误分析板。
- Windows / Linux 兼容说明：
  - 本轮仅修改 TypeScript 主进程链路逻辑，Windows 开发与 Linux 部署共用同一实现。

## 2026-05-23 商品分析画板生成时同步落联合商品描述

- 目标：
  - 商品分析画板生成成功后，右侧 `商品描述 / Product DNA` 必须同时有内容可显示。
  - 不允许出现“分析画板已生成，但联合分析仍为空”的状态。
- 本轮最小改动：
  - 仅调整商品库分析画板生成后的 `productAnalysis` 写入逻辑。
  - 不改页面结构，不改 `/clone` 主流程。
- 修复内容：
  - 分析画板生成成功后，始终同步写入一份 `productAnalysis` 到商品库。
  - 若 AI 结构分析成功，优先写入 AI 联合分析结果。
  - 若 AI 结构分析失败或未配置，则立即写入一份基于多图联合归纳规则的 fallback 商品描述，避免界面空白。
  - fallback 描述统一改为中文“联合分析”语义，不再保留旧的抽象英文通用占位文案。
- 使用说明：
  - 重新生成商品分析画板后，右侧 `商品描述 / Product DNA` 应同步显示结构描述。
  - 即使结构分析模型暂时不可用，界面也会先显示一份可复用的联合商品描述。
- Windows / Linux 兼容说明：
  - 本轮仅修改 TypeScript 数据写入逻辑，Windows 开发与 Linux 部署共用同一实现。

## 2026-05-23 商品分析描述统一为英文

- 目标：
  - 商品库右侧 `Product DNA` 的结构化商品分析统一输出英文。
  - 不论 AI 联合分析成功还是 fallback 生效，描述语言都保持英文一致。
- 本轮最小改动：
  - 仅调整商品分析生成语言和 fallback 商品分析文案。
  - 不修改页面布局，不改分析字段结构。
- 修复内容：
  - 商品库生成分析画板后，调用商品结构分析时统一请求英文输出。
  - fallback 商品分析从中文改为英文结构化描述。
  - 保证 `summary / coreSubject / connectionStructure / materialDetails / matchingRules` 等字段统一为英文。
- 使用说明：
  - 重新生成商品分析画板后，右侧 `Product DNA` 应显示英文描述。
  - 旧的中文 fallback 数据不会自动批量迁移；重新生成后会按新规则覆盖。
- Windows / Linux 兼容说明：
  - 本轮仅修改 TypeScript 业务逻辑，Windows 开发与 Linux 部署共用同一实现。
  - `EXPRESSIVE`：
    - 面向服装、美妆、香水、氛围型商品
    - 商品一致性降为次级目标
    - 保留风格、氛围、motion 表达
    - prompt 更偏广告/氛围镜头指导
  - 视频 negative prompt 也按模式分层：
    - `STRICT` 最严格
    - `BALANCED` 中等收敛
    - `EXPRESSIVE` 只保留底线错误项
  - 视频提示词预览新增 `productMode` 调试字段，便于判断当前镜头使用的是哪种策略模式。
- 使用说明：
  - 现在不同商品类型在视频生成时会自动走不同策略模式。
  - 珠宝类继续优先商品一致性，氛围型商品会保留更多表现空间。
- Windows / Linux 兼容说明：
- 本轮仅修改 TypeScript 主进程提示词逻辑，不依赖平台专属能力。

## 2026-05-22 越南 TikTok 爆款标题批量生成与成片导出

- 目标：
  - 在现有 `video-batch-subtitle` 工作台内扩展“越南 TikTok 爆款标题模式”。
  - 支持批量选视频后，按视频内容线索批量生成越南风格强标题，并直接沿用现有导出链路批量出片。
- 本轮最小改动：
  - 不新增独立页面，不改 `/clone` 主链路。
  - 只扩展批量字幕工作台的标题生成能力、样式预设和少量任务字段。
- 修复内容：
  - 批量字幕任务新增轻量字段：
    - `titleStyleMode`
    - `viralTitleConfig`
    - `titleAnalysisItems`
  - 新增后端接口：
    - `/plugins/video-batch-subtitle/generate-viral-titles`
  - 生成链路改为：
    - 基于每条视频的文件名、时长、封面帧元信息生成轻量内容摘要
    - 调用 AI 为每条视频生成一条越南 TikTok 爆款静态标题
    - 自动写回 `titleItems`，供预览与批量渲染直接复用
  - 工作台新增越南爆款配置：
    - 目标语言
    - 标题语气
    - 符号强度
    - 卖点补充
  - 样式预设新增两套越南爆款标题风格：
    - `VN Viral Bold`
    - `VN Viral Outline`
  - 保持现有 `static_title` + 现有渲染/导出链路不变。
- 使用说明：
  - 打开“视频批量加字幕”工作台，先批量导入视频。
  - 在内容区选择越南爆款标题配置后，点击“AI 批量生成越南爆款标题”。
  - 系统会为每条视频生成单独标题，并可在列表中逐条微调。
  - 之后直接点击批量渲染，沿用现有导出链路生成成片。
- Windows / Linux 兼容说明：
  - Windows 开发环境使用现有本地工作台与 Web API。
  - Linux 部署环境继续使用同一 TypeScript 逻辑与现有导出链路，不写死 Windows 专属路径。

## 2026-05-22 单镜分镜图片重生成模特包误判修复

- 目标：
  - 修复分镜图片页面点击“重新生成图片”时，明明已经选中并确认模特，却仍报“请先生成并确认新模特身份包”的问题。
- 本轮最小改动：
  - 仅补齐单镜重生成链路的 `selectedModelIdentityId` 透传与主进程同步逻辑。
  - 不修改分镜页面结构，不修改图片 provider API，不修改主流程。
- 修复内容：
  - 桌面端 `regenerateStoryboardImage` 现在会透传当前已选模特 ID。
  - `getShotImagePromptPreview` 现在也会透传当前已选模特 ID。
  - 主进程 `generateGptShotFrames` 收到 `selectedModelIdentityId` 后，会先同步当前项目的模特绑定，再执行模特身份包校验。
  - 主进程 `getShotImagePromptPreview` 收到 `selectedModelIdentityId` 后，同样会先同步当前项目的模特绑定，再执行模特身份包校验。
  - 让“批量生成分镜图”和“单镜重新生成图片”两条链路的模特绑定行为保持一致。
  - 让“图片提示词预览”和“重新生成图片”两条链路的模特绑定行为保持一致。
- 使用说明：
  - 已有项目如果已经选中模特并生成过身份包，现在可直接点击单镜“重新生成图片”。
  - 不会再因为前端未透传当前模特 ID 而被误判成“未确认模特包”。
- Windows / Linux 兼容说明：
  - 本轮仅修改 TypeScript 前端调用与主进程参数同步逻辑，不依赖平台专属能力。

## 2026-05-22 桌面端创建模特弹窗双栏与预览优化

- 目标：
  - 优化桌面端“创建模特”弹窗的首屏观感与操作效率。
  - 强化左侧模特设定可读性，并为右侧素材上传区增加真实缩略图预览。
- 本轮最小改动：
  - 仅调整桌面端 `ModelLibraryView.vue` 的创建模特弹窗。
  - 不修改 Web 端页面，不修改创建接口，不修改下游生成流程。
- 修复内容：
  - 弹窗头部升级为“标题 + 副标题 + 右上角关闭”结构。
  - 左侧“模特设定”新增当前已选结果的简洁摘要与标签化展示。
  - 右侧“素材上传”改成更完整的上传面板样式。
  - 右侧新增真实已上传缩略图预览，覆盖主图、细节图、佩戴图、风格图四类素材。
  - 整体间距与高度进一步压缩，尽量提升一屏完成度。
- 使用说明：
  - 打开桌面端模特库，点击“创建模特”即可看到新的双栏工作区。
  - 左侧设定变更会实时更新摘要。
  - 右侧上传素材后会立即显示本地缩略预览。
- Windows / Linux 兼容说明：
  - 本轮仅修改桌面端 Vue 界面与本地文件预览绑定逻辑。

## 2026-05-22 桌面端分镜视频商品自然光约束

- 目标：
  - 收紧桌面端分镜视频生成时的商品光效表现。
  - 商品视频禁止出现很闪的特效，统一改为自然光表达。
- 本轮最小改动：
  - 仅调整桌面端主进程分镜视频 prompt 约束与共享 negative prompt。
  - 不修改页面，不修改 provider API，不修改商品数据结构。
- 修复内容：
  - 视频正向 prompt 明确要求仅使用自然光：
    - `natural daylight`
    - `soft window light`
  - 明确禁止：
    - flashy visual effects
    - strobe-like lighting
    - hard flash bursts
    - dramatic glow passes
    - synthetic lighting tricks
  - 视频共享 negative prompt 追加反闪耀/反爆闪词，避免桌面端分镜视频继续生成很闪的商品特效。
- 使用说明：
  - 在桌面端重新生成分镜视频后，新约束会自动生效。
  - 商品若有金属、镜面、钻面等反光细节，仍允许轻微、真实、克制的自然反光，但不会再鼓励爆闪、炫光、特效化灯感。
- Windows / Linux 兼容说明：
  - 本轮仅修改 TypeScript 提示词拼装逻辑，不依赖 Windows 专属 API。
  - Windows 开发测试与 Linux 部署共用同一套实现。
  - 开发环境 Windows 与部署环境 Linux 共用同一套前端结构，不写死平台分支。

## 2026-05-22 模特生成创建页改为多选项驱动

- 目标：
  - 将“创建模特”从固定模板 + 自由文本，升级为结构化选项为主、补充描述兜底。
  - 同时覆盖 Web 与桌面端创建模特入口，提升模特生成 prompt 的可控性。
- 本轮最小改动：
  - 仅修改创建模特入口、共享类型、共享选项配置、主进程模特 prompt 组装。
  - 不修改下游复刻绑定流程，不修改 provider API 请求结构，不新增数据库字段前提。
- 修复内容：
  - 新增共享 `modelProfileOptions` 结构化字段，支持：
    - 目标市场
    - 性别
    - 年龄段
    - 脸型
    - 发型
    - 发色
    - 肤色
    - 体型
    - 穿搭
    - 气质
    - 场景
    - 表达语言
    - 镜头感
    - 风格倾向
  - 主进程模特身份包生成改为：
    - `productType` 默认 profile 兜底
    - `modelProfileOptions` 覆盖默认项
    - `productPoints` 仅作补充增强
  - Web 创建模特页新增“模特设定”分组选择。
  - 桌面端模特库创建弹窗新增同样的结构化选项组。
  - 两端选项集共用同一份共享配置，避免字段漂移。
- 使用说明：
  - 创建模特时，优先通过选项选择模特画像，再按需要填写“补充描述（可选）”。
  - 若不手动调整选项，系统会根据商品类型自动给出推荐默认值。
  - 创建完成后，模特库列表和后续复刻工作台仍沿用现有绑定方式，无需额外操作。
- Windows / Linux 兼容说明：
  - 本轮仅新增共享 TypeScript 配置与表单字段，不依赖 Windows 专属 API。
  - Windows 开发与 Linux 部署共用同一套结构化选项和 prompt 组装逻辑。

## 2026-05-22 成片合成变速幅度收紧

- 目标：
  - 修复成片合成阶段速度扰动过大，导致画面忽快忽慢、不自然、观感奇怪的问题。
- 本轮最小改动：
  - 仅调整成片渲染链中的速度微扰范围。
  - 不修改页面，不修改任务结构，不修改分镜视频生成接口。
- 修复内容：
  - 模板随机引擎生成的分镜速度扰动范围，从较大波动收紧为极轻微扰动。
  - 最终 FFmpeg 渲染链对 `setpts / atempo` 的速度夹取同步收紧，避免历史模板或异常配置把成片拉成明显快放/慢放。
  - 当前成片速度微扰统一限制在接近原速的小范围内，仅保留非常轻微的人手剪辑感，不再造成明显不自然变速。
- 使用说明：
  - 重新执行成片合成后，新成片会自动使用更克制的速度策略。
  - 已生成的旧成片不会自动重写，需要重新合成一次。
- Windows / Linux 兼容说明：
  - 本轮仅修改 TypeScript 随机规划与 FFmpeg 参数拼装逻辑，不依赖 Windows 专属 API。
  - Windows 开发测试与 Linux 部署共用同一套实现。

## 2026-05-22 桌面端内存占用第一轮收敛

- 目标：
  - 缓解桌面端 `/clone` 工作台在开发测试时的内存占用压力。
  - 优先处理会长期滞留在渲染层内存中的提示词预览数据与本地文件预览 URL。
- 本轮最小改动：
  - 仅调整 `/clone` 提示词预览弹窗状态释放逻辑。
  - 仅调整 `web-next` 参考视频本地预览的 `objectURL` 生命周期。
  - 不修改业务接口、不修改数据库结构、不修改主流程页面布局。
- 修复内容：
  - `src/renderer/src/ui/views/CloneView.vue`
    - 分镜图片提示词预览弹窗关闭后，立即释放缓存的整套 prompt 预览对象。
    - 分镜视频提示词预览弹窗关闭后，立即释放缓存的整套 prompt 预览对象。
    - 保留已加载 `shotId`，避免同一镜头短时间重复请求时影响现有使用习惯。
  - `apps/web-next/app/clone/[projectId]/page.tsx`
    - 参考视频本地预览改为显式管理 `URL.createObjectURL(...)`。
    - 在切换文件或组件卸载时调用 `URL.revokeObjectURL(...)`，避免重复选择本地视频后对象 URL 长驻内存。
- 使用说明：
  - 在 `/clone` 页打开并关闭提示词预览后，renderer 不会继续持有整套大文本 prompt 数据。
  - 在 Web `/clone` 页重复切换本地参考视频时，旧的预览对象 URL 会自动释放。
  - 桌面端开发模式下 Electron / Vite 仍然会比正式打包版占用更多内存，但这轮可先减少工作台长驻内存。
- Windows / Linux 兼容说明：
  - 本轮仅修改 TypeScript / Vue / React 前端逻辑，不依赖 Windows 专属 API。
  - Windows 开发测试与 Linux 部署可共用同一实现。
- 验证方式：
  - `npm run typecheck`

## 2026-05-22 模特创建性别选项拼接修复

- 目标：
  - 修复创建模特时明明选择了男性，最终生成描述和结果却仍偏女性的问题。
  - 确保 `gender` 等结构化选项在主进程 prompt 拼接时按字段精确生效，不被默认东南亚女性推荐项串扰。
- 本轮最小改动：
  - 仅调整共享选项 prompt 查询函数与主进程模特 profile 合并逻辑。
  - 不修改创建页面 UI，不修改 provider API，不修改模特库数据结构。
- 修复内容：
  - 新增按字段读取选项 prompt 的共享方法，避免仅按 value 顺序拼装造成字段 prompt 错位。
  - 主进程 `mergeModelIdentityProfile(...)` 改为：
    - `market` 只读取 `market` 的 prompt
    - `gender` 只读取 `gender` 的 prompt
    - 其他字段同理按 key 精确映射
  - 这样当用户显式选择 `male` 时，不会再被默认 `southeast_asia_female / female` 推荐画像错误覆盖到描述里。
- 使用说明：
  - 重新创建模特后，新生成的身份包会按当前所选性别重新拼装 prompt。
  - 已经生成完成的旧模特不会自动修正，需要重新创建一次。
- Windows / Linux 兼容说明：
  - 本轮仅修改 TypeScript 共享配置读取与主进程 prompt 组装逻辑，不依赖 Windows 专属 API。
  - Windows 开发测试与 Linux 部署共用同一套实现。

## 2026-05-22 模特创建男性画像默认联动修复

- 目标：
  - 修复仅切换“男性”选项时，其余 profile 仍保留整套女性默认画像，导致最终结果继续偏女性的问题。
- 本轮最小改动：
  - 仅调整主进程模特 profile 默认值与男性场景下的推荐联动逻辑。
  - 不修改页面结构，不修改数据库 schema，不修改图片 provider API。
- 修复内容：
  - 当用户显式选择 `gender=male` 时：
    - 主进程基础默认画像切换为男性基线
    - 若其他字段仍停留在女性默认推荐值，则自动替换为男性推荐值
  - 新增更强的性别硬约束：
    - `male only`
    - 禁止女性脸、女性化 styling、女性化 body shape、female-presenting identity
  - 避免出现“性别选了男性，但发型、体型、穿搭、气质、市场默认值还是整套女性电商模特语义”的冲突。
- 使用说明：
  - 重新创建模特后，若只切换性别为男性而未手动改其他项，系统也会自动优先使用男性推荐画像生成。
  - 已生成的旧模特不会自动修复，需要重新创建。
- Windows / Linux 兼容说明：
  - 本轮仅修改 TypeScript 主进程默认值与 prompt 组装逻辑，不依赖 Windows 专属 API。
  - Windows 开发测试与 Linux 部署共用同一套实现。

## 2026-05-21 分镜视频提示词控制层对齐

- 目标：
  - 让分镜视频生成的 prompt 组合方式向分镜图片链路靠齐。
  - 视频提示词预览中明确展示商品标准源图、模特主图和脚本拼接块。
- 本轮最小改动：
  - 仅调整分镜视频 prompt 组装与 `/clone` 分镜视频提示词预览。
  - 不修改视频 provider API 协议。
  - 不修改图片生成链路、不修改页面主流程结构。
- 修复内容：
  - 视频 prompt 前置控制层补齐 `REFERENCE IMAGE LOCK (CRITICAL)`、`FRAME CONTINUITY LOCK`、`HUMAN PRIORITY RULE`、`NO SUBSTITUTE RULE` 与失败导向。
  - 视频 prompt 继续沿用 `scriptText / generationPrompt / visualDescription / actionDescription / cameraDescription / materialNeed` 的脚本拼接方式。
  - 视频预览新增 `scriptSpliceText` 展示块。
  - 视频预览继续展示 `Product Canonical Source`、模特主锚点、商品描述锁、`Compiled Prompt`、`Video Positive Prompt`、`Video Negative Prompt`。
- 使用说明：
  - 在 `/clone` 分镜视频阶段点击“提示词”后，可直接查看商品源图、模特图和脚本拼接块。
- Windows / Linux 兼容说明：
  - 本轮仅调整 TypeScript 主进程 prompt 逻辑与 Vue 预览展示，不依赖 Windows 专属 API。
  - Windows 开发测试与 Linux 部署运行逻辑保持一致。

## 2026-05-21 单帧控制层加固

- 目标：
  - 把 `/clone` 单帧 storyboard / GPT keyframe 生成链路从“约束层”提升到“控制层”。
  - 优先解决产品漂移、模特漂移、start / end 非连续、以及 human-use 语义挤压产品锁的问题。
- 本轮最小改动：
  - 仅调整主进程单帧 prompt 组装、编译逻辑与对应 smoke test。
  - 不修改视频生成链路。
  - 不修改页面、不修改 IPC 入参、不修改数据库 schema。
- 修复内容：
  - 顶层增加 `REFERENCE IMAGE LOCK (CRITICAL)`，作为产品身份唯一来源。
  - 单帧 start / end prompt 增加 `FRAME CONTINUITY LOCK`，end frame 必须是 start frame 的直接延续。
  - 增加 `HUMAN PRIORITY RULE`，明确 human 必须适配 product，冲突时调 human 不调 product。
  - 增加 `NO SUBSTITUTE RULE` 与失败导向，禁止 lookalike / alternative / substitute product。
  - prompt consistency 版本号同步提升，确保旧缓存自然失效。
- 使用说明：
  - 重新生成单帧分镜图后新规则自动生效。
  - 旧任务不会自动回刷，需要重新生成对应单帧。
- Windows / Linux 兼容说明：
  - 本轮仅调整 TypeScript 主进程 prompt 逻辑与测试，不依赖 Windows 专属 API。
  - Windows 开发测试与 Linux 部署运行逻辑保持一致。

## 2026-05-21 商品详情标准源结果展示补齐

- 目标：
  - 修复商品详情页在标准源生成完成后没有结果界面的问题。
- 本轮最小改动：
  - 仅调整 `ProductDetailView` 前端展示。
  - 不修改标准源生成主进程逻辑，不修改商品数据结构。
- 修复内容：
  - 商品详情页新增 `Product Canonical Source` 结果区块。
  - 当 `canonicalSourcePath` 存在时，页面直接展示：
    - 标准源预览图
    - 输出文件名
    - 生成时间
    - 查看标准源入口
  - 当状态为 `processing` / `failed` / `idle` 时，分别显示明确占位说明。
  - 若存在 `canonicalSourceDiagnostics`，页面补充显示处理记录，便于判断是回退原图、成功生成还是处理失败。
- 使用说明：
  - 在商品详情页点击“生成标准源”后，生成成功的结果会直接显示在页面中部的 `Product Canonical Source` 卡片里。
  - 若失败，可根据处理记录和状态说明重新整理商品图后再生成。
- Windows / Linux 兼容说明：
  - 本轮仅调整 Vue 渲染层展示，不依赖 Windows 专属 API。

## 2026-05-21 商品详情名称修改修复

- 目标：
  - 修复商品详情页中商品名称无法修改的问题。
- 本轮最小改动：
  - 仅调整 `ProductDetailView` 前端交互。
  - 继续复用现有 `products.upsert` 保存链路，不新增后端接口。
- 修复内容：
  - 点击商品详情页标题旁编辑按钮后，切换为页内输入框。
  - 支持直接保存商品名称，也支持取消编辑。
  - 新名称为空时阻止提交，并给出提示。
- 使用说明：
  - 进入商品详情页后，点击标题右侧编辑按钮。
  - 输入新的商品名称后点击保存，页面会立即刷新并展示最新名称。
- Windows / Linux 兼容说明：
  - 本轮仅调整 Vue 渲染层交互，不依赖 Windows 专属 API。

## 2026-05-21 商品详情设计稿对齐

- 目标：
  - 按最新设计稿重做商品详情页主工作区布局。
  - 保持商品详情现有主链路可用：
    - 返回列表
    - 修改商品名称
    - 上传图片
    - 删除图片
    - 设置封面
    - 生成标准源
    - 删除商品
    - 保存备注
- 本轮最小改动：
  - 仅调整 `ProductDetailView.vue`
  - 不修改商品后端接口、标准源生成逻辑和商品数据结构。
- 对齐内容：
  - 顶部区域改为：
    - 返回商品列表
    - 商品标题与编辑按钮
    - 右侧三枚主操作按钮
    - 下方一整条商品摘要统计卡
  - 主内容区改为双列：
    - 左侧：
      - 商品图片
      - 生成流程
      - Product Canonical Source
    - 右侧：
      - 状态与标准源
      - 操作日志
      - 商品说明
      - 使用规则
  - 视觉方向对齐设计稿：
    - 深色工作台风格
    - 更扁平的卡片分区
    - 更贴近截图的按钮位置、统计条和流程排布
- 使用说明：
  - 商品详情页现在会优先呈现：
    - 顶部商品信息与主操作
    - 中部图片区
    - 右侧标准源状态
    - 底部标准源结果与说明信息
- Windows / Linux 兼容说明：
  - 本轮仅调整 Vue 渲染层与样式，不依赖 Windows 专属 API。

## 2026-05-21 商品详情设计稿二次贴稿调整

- 目标：
  - 继续把商品详情页收紧到更接近最新设计稿，而不是只做大体结构相似。
- 本轮最小改动：
  - 仅再次调整 `ProductDetailView.vue`
  - 不修改商品接口与业务链路
- 二次调整内容：
  - 顶部区域改为更接近设计稿的三层：
    - 返回入口
    - 标题与右侧主操作按钮并排
    - 一整条摘要统计条
  - 主体区域重新对齐为：
    - 左侧：商品图片、流程、标准源结果
    - 右侧：状态卡、日志卡、备注卡、规则卡
  - 右下区域由原先较松散的布局，改为更接近稿子的“日志 + 说明/规则”组合
  - 图片上传区、标准源卡、状态卡、日志卡的尺寸、圆角和间距进一步压稿
- 使用说明：
  - 当前商品详情页会更贴近设计稿中的信息优先级与卡片密度。
- Windows / Linux 兼容说明：
  - 本轮仅调整 Vue 渲染层结构和样式，不依赖 Windows 专属 API。

## 2026-05-21 商品详情设计稿三次贴稿微调

- 目标：
  - 继续把商品详情页的顶部、摘要条和右侧信息区压缩到更接近当前设计稿的密度与比例。
- 本轮最小改动：
  - 仅调整 `src/renderer/src/ui/views/ProductDetailView.vue`
  - 不修改商品接口、标准源生成逻辑和现有交互链路
- 三次微调内容：
  - 顶部返回区、标题区和主操作按钮尺寸继续收紧
  - 摘要统计条的列宽、字号、内边距和分隔线继续压稿
  - 主内容区左右栏比例微调，右栏状态卡、日志卡、备注卡、规则卡的组合更接近设计稿
  - 图片卡、标准源卡、状态卡、日志卡统一收紧圆角、边框、内边距和字体层级
- 使用说明：
  - 商品详情页功能不变，重点是页面主工作区的视觉贴稿进一步收口。
- Windows / Linux 兼容说明：
  - 本轮仅调整 Vue 渲染层样式，不依赖 Windows 专属 API。

## 2026-05-21 系统菜单顺序调整

- 目标：
  - 将系统侧边菜单顺序调整为：`首页`、`模特`、`商品`、`复刻`、`生产`、`切片`。
- 本轮最小改动：
  - 仅调整 `src/renderer/src/ui/MainLayout.vue`
  - 不修改路由结构、不修改页面功能、不调整生产模块内部入口
- 调整内容：
  - 侧边菜单按用户指定顺序重新排列。
  - 菜单文案从 `模特库`、`商品库` 收口为 `模特`、`商品`。
  - 顶部帮助入口同步按同一语义排序。
- 使用说明：
  - 左侧导航现在按主工作流顺序展示，便于先首页、再模特和商品，再进入复刻与生产。
- Windows / Linux 兼容说明：
  - 本轮仅调整 Vue 渲染层菜单配置，不依赖 Windows 专属 API。

## 2026-05-21 复刻参考分析商品区溢出修复

- 目标：
  - 修复 `/clone` 参考分析阶段右侧商品信息区在长商品名和长 ID 场景下的内容溢出问题。
- 本轮最小改动：
  - 仅调整 `src/renderer/src/ui/views/CloneView.vue`
  - 不修改复刻业务逻辑、不修改商品绑定流程、不改接口
- 修复内容：
  - 商品名称和商品 ID 改为允许强制换行，避免把右侧信息卡撑出容器。
  - 商品说明文案同步允许在长文本场景下自动换行。
  - 商品选择下拉和按钮行补充最小宽度约束，避免控件组合把侧栏横向撑爆。
- 使用说明：
  - 在参考分析阶段绑定长名称商品时，右侧商品卡会在卡内自动换行，不再横向溢出。
- Windows / Linux 兼容说明：
  - 本轮仅调整 Vue 渲染层样式，不依赖 Windows 专属 API。

## 2026-05-21 复刻参考分析商品绑定时机修复

- 目标：
  - 修复 `/clone` 参考分析阶段在蓝图尚未生成前点击“绑定商品”直接报错的问题。
- 本轮最小改动：
  - 仅调整 `src/renderer/src/composables/useCloneProjectWorkspace.materials.ts`
  - 不修改主进程商品绑定接口，不改复刻项目数据结构
- 修复内容：
  - 参考分析前若项目尚未生成可持久化蓝图，商品选择改为先进入前端暂存态，不再直接调用绑定接口。
  - 待参考分析完成后，再按既有链路把商品真正同步到当前复刻项目。
  - 顺手清理该材料层文件里的可见乱码提示文案，统一为正式中文。
- 使用说明：
  - 现在可以先在复刻页选择商品，再执行参考分析。
  - 分析前点击绑定不会再报“复刻项目或蓝图不存在”，而是提示分析完成后自动同步。
- Windows / Linux 兼容说明：
  - 本轮仅调整 Vue/Electron 渲染层组合逻辑，不依赖 Windows 专属 API。

## 2026-05-21 商品列表设计稿对齐

- 目标：
  - 按最新设计稿重做 `/products` 商品列表页主工作区布局。
  - 保留当前商品列表主链路：
    - 新建商品
    - 搜索
    - 类型筛选
    - 状态筛选
    - 排序
    - 网格/列表切换
    - 进入详情
    - 删除商品
- 本轮最小改动：
  - 仅调整 `ProductLibraryView.vue`
  - 不修改商品后端接口、商品详情页与标准源生成逻辑。
- 对齐内容：
  - 顶部改为：
    - 页面标题与说明
    - 右上新建商品按钮
  - 中部新增五张统计摘要卡：
    - 商品总数
    - 待处理
    - 已完成
    - 异常
    - 最近更新
  - 筛选区改为一整块工作条：
    - 搜索
    - 商品类型
    - 状态
    - 筛选按钮
    - 视图切换
    - 排序
  - 标签区改为横向状态 tab：
    - 全部
    - 待处理
    - 生成中
    - 已完成
    - 异常
  - 商品卡片改为更贴近设计稿的两列结构：
    - 左侧封面
    - 右侧标题、ID、状态、元信息与操作按钮
  - 底部保留分页视觉结构。
- 使用说明：
  - 进入 `商品库` 后，先在列表页筛选与浏览商品，再进入详情维护图片和标准源。
- Windows / Linux 兼容说明：
  - 本轮仅调整 Vue 渲染层和样式，不依赖 Windows 专属 API。

## 2026-05-21 商品库上传与桌面端回归测试补齐

- 目标：
  - 修复商品库图片上传在桌面端验证时不可稳定自动化的问题。
  - 补齐商品库核心链路的可重复桌面端冒烟测试。
- 本轮最小改动：
  - 不修改商品库主业务结构。
  - 仅补页面测试钩子、测试脚本、测试选择器和文档说明。
- 修复内容：
  - `ProductLibraryView` 与 `ProductDetailView` 补充统一 `data-testid`，用于桌面端稳定选择。
  - `ProductDetailView` 的上传按钮链路支持读取测试覆盖钩子 `window.__VG_TEST_pickFiles`：
    - 正常用户仍走 `window.api.pickFiles`
    - 仅桌面自动化测试时可注入本地图片路径，避免被系统文件选择框阻塞
  - 新增桌面端商品库冒烟脚本：
    - `test/product-library-desktop.smoke.cjs`
  - 新增测试命令：
    - `npm run test:product-library-desktop`
  - 冒烟覆盖范围：
  - 开发环境登录
  - 打开商品库

## 2026-05-21 复刻分镜提示词补齐商品基础描述

- 目标：
  - 修复复刻分镜深层图片/视频提示词中缺少商品基础描述的问题。
  - 保证 `Product Canonical Source` 作为最高优先级商品图输入时，商品库基础数据也会同步进入最终编译提示词。
- 本轮最小改动：
  - 仅调整 `src/main/modules/clone/prompt-consistency/compiler.ts`
  - 不修改商品库数据结构，不修改前端提示词预览布局，不改变商品图输入顺序。
- 修复内容：
  - 在 `compiledPrompt` 的层级编译中新增 `PRODUCT_DESCRIPTION_LAYER`。
  - 该层直接写入绑定商品快照与商品结构分析合成后的商品描述文本。
  - 文本层明确标注为次级约束：
    - `Product Canonical Source` 与绑定商品参考图优先级最高
    - 商品基础描述仅作为结构、材质、佩戴方式补充说明
    - 若文本与标准源冲突，始终以标准源为准
- 使用说明：
  - 打开复刻分镜提示词预览时，`Compiled Prompt` 现在会实际包含商品基础描述层，而不是只在界面高亮区单独显示。
  - 这样可以直接确认深层生成链路已经拿到商品基础描述。
- Windows / Linux 兼容说明：
  - 本轮仅调整 TypeScript 提示词编译逻辑，不依赖 Windows 专属 API。
    - 新建商品
    - 上传商品图片
    - 保存备注
    - 删除最后一张图片
    - 校验 `coverImagePath` 已清空
- 验证结果：
  - 已在 Windows 桌面端实际运行通过。
  - 最新测试报告：
    - `test/artifacts/product-library-desktop/report-20260521_093242.json`
  - 关键断言：
    - 上传后 `imageCount = 1`
    - 上传后存在 `coverImagePath`
    - 删除最后一张图片后 `imageCount = 0`
    - 删除最后一张图片后 `coverImagePath = ""`
- 使用说明：
  - 本地开发时执行：
    - `npm run typecheck`
    - `npm run build`
    - `npm run test:product-library-desktop`
  - 测试图片默认读取：
    - `test/artifacts/web-next-clone-flow/01-after-login.png`
  - 也可通过环境变量覆盖：
    - `PRODUCT_LIBRARY_TEST_IMAGE`
- Windows / Linux 兼容说明：
  - 本轮测试脚本运行于 Windows 桌面端。
  - 业务代码只新增测试覆盖分支，不依赖 Windows 专属 API，Linux 部署不受影响。

## 2026-05-21 商品库与生产模块联合重构

- 目标：
  - 将 `商品库` 收口为“先商品，后图片”的清晰结构。
  - 将 `生产` 收口为任务执行中心，拆出独立的新建任务页和任务详情页。
- 本轮最小改动：
  - 保留现有 `/clone`、任务队列与模板配置能力。
  - 重点调整商品模型、商品库页面、生产路由结构与模板页边界。
- 修复内容：
  - 商品库改为：
    - 商品列表页
    - 商品详情图片管理
    - 封面设置
    - 商品备注
    - 产品标准源状态与触发
  - 商品模型新增：
    - `images`
    - `coverImagePath`
    - `remark`
  - 旧 `Product.assets` 仅保留兼容读取，不再作为商品库 UI 主模型。
  - `/clone` 读取商品参考图时，优先使用 `images`，兼容回退旧 `assets`。
  - 生产模块路由改为：
    - `/production`
    - `/production/create`
    - `/tasks`
    - `/tasks/:taskId`
    - `/templates`
  - `TasksView` 收口为纯任务列表页。
  - 新增独立任务详情页用于查看日志、错误和输出。
  - `TemplatesView` 移除商品选择、商品段位同步和 `ensureSegmentBucketsFromTemplates()` 主链路依赖。
- 使用说明：
  - 先去 `商品库` 创建商品并上传图片。
  - 再去 `生产 -> 新建任务` 选择商品和模板发起任务。
  - 去 `任务中心` 看列表，点进 `任务详情` 查看日志与失败原因。
- Windows / Linux 兼容说明：
  - 本轮仅涉及 Electron 主进程、预加载层和渲染层 TypeScript/Vue 逻辑。
  - 不依赖 Windows 专属 API，Windows 开发与 Linux 部署保持兼容。

## 2026-05-21 生产模块任务路由统一

- 目标：
  - 将生产模块正式收口为一组统一路由：
    - `/production`
    - `/production/create`
    - `/production/tasks`
    - `/production/tasks/:taskId`
  - 避免任务列表和任务详情继续游离在旧 `/tasks` 路径下。
- 本轮最小改动：
  - 仅调整前端路由和页面跳转，不修改任务队列、任务数据结构和后端 IPC。
- 修复内容：
  - 新增正式生产任务路由：
    - `/production/tasks`
    - `/production/tasks/:taskId`
  - 旧路由改为兼容跳转：
    - `/tasks` -> `/production/tasks`
    - `/tasks/:taskId` -> `/production/tasks/:taskId`
  - `生产首页`、`新建任务`、`任务列表`、`任务详情`、`ProductionTabs`、主布局快捷入口统一改走新的生产任务路由。
  - 生产模块结构最终固定为：
    - 首页
    - 新建任务
    - 任务列表
    - 任务详情
    - 模板中心
- 使用说明：
  - 从 `生产` 进入后，默认先看生产首页。
  - 创建任务走 `/production/create`。
  - 查看任务列表走 `/production/tasks`。
  - 查看任务详情走 `/production/tasks/:taskId`。
  - 旧 `/tasks` 深链仍可访问，但会自动跳到新的生产任务路由。
- Windows / Linux 兼容说明：
  - 本轮仅调整 Vue 路由与页面跳转，不依赖平台专属能力。

## 2026-05-21 商品库与生产模块最终收口

- 目标：
  - 完成商品库与生产模块联合重构的最后一轮收口，确保路由、页面职责、文案和入口全部统一。
- 本轮最小改动：
  - 不修改任务后端接口、队列状态结构和 IPC 协议。
  - 只调整前端页面、可见文案、跳转入口和需求文档。
- 修复内容：
  - 生产模块正式结构固定为：
    - `/production`
    - `/production/create`
    - `/production/tasks`
    - `/production/tasks/:taskId`
    - `/templates`
  - 旧兼容路由保留为跳转：
    - `/tasks` -> `/production/tasks`
    - `/tasks/:taskId` -> `/production/tasks/:taskId`
  - 重写并清理以下页面的可见中文，去掉乱码：
    - `ProductionTabs`
    - `ProductionHomeView`
    - `ProductionCreateTaskView`
    - `TasksView`
    - `TaskDetailView`
    - `ProductLibraryView`
    - `ProductDetailView`
  - 生产首页只保留摘要、最近任务和去新建任务 / 任务中心 / 模板中心的入口。
  - 新建任务页只负责商品、模板、数量、输出目录和提交任务。
  - 任务列表页只保留任务筛选、批量操作和进入任务详情。
  - 任务详情页只保留日志、错误、输出文件和报告入口。
  - 商品库最终固定为两级结构：
    - 商品列表页
    - 商品详情页
  - 商品库职责只保留：
    - 商品列表
    - 图片上传与预览
    - 设为封面
    - 删除图片
    - 商品备注
    - `Product Canonical Source` 状态与触发
- 使用说明：
  - 先在 `商品库` 创建商品并上传图片。
  - 再从 `生产 -> 新建任务` 选择商品和模板发起任务。
  - 查看任务列表统一进入 `/production/tasks`。
  - 查看任务详情统一进入 `/production/tasks/:taskId`。
- Windows / Linux 兼容说明：
  - 本轮仅调整 Vue 渲染层、页面路由和文案，不依赖 Windows 专属能力，Windows 开发与 Linux 部署保持兼容。

## 2026-05-21 商品库列表信息增强

- 目标：
  - 提升商品库左侧商品列表的可读性和稳定性，让商品选择更接近正式管理页，而不是临时素材面板。
- 本轮最小改动：
  - 仅调整 `ProductsView` 的前端渲染与交互，不修改商品后端接口和现有数据结构。
- 修复内容：
  - 商品列表新增排序方式：
    - 按最近更新排序
    - 按商品名称排序
    - 按标准源状态排序
  - 商品卡片补充显示：
    - 商品类型
    - 图片数量
    - 标准源更新时间
  - 商品封面回退逻辑增强：
    - 优先 `coverImagePath`
    - 再取 `images.isCover`
    - 再取第一张图片
    - 最后兼容旧 `assets` 图片
  - 商品库页面乱码文案已清理，统一为正式中文文案。
  - 搜索空状态和无商品空状态分开展示，减少误判。
- 使用说明：
  - 进入 `商品库` 后，可先搜索或排序商品，再进入右侧详情管理图片和标准源。
  - 若商品没有显式封面，系统会自动按既定优先级选择可展示图片，减少列表空白。
- Windows / Linux 兼容说明：
  - 本轮仅调整 Vue 渲染层逻辑和本地时间格式化，不依赖平台专属能力。

## 2026-05-21 商品库路由拆分为列表页与详情页

- 目标：
  - 将商品库从单页左右结构继续收口为真正的两级页面：
    - 商品列表页
    - 商品详情页
- 本轮最小改动：
  - 仅调整商品库前端路由和页面拆分，不修改商品后端接口、`/clone` 绑定链路和生产任务逻辑。
- 修复内容：
  - 新增独立商品列表页：
    - `/products`
    - 只负责商品搜索、排序、创建和进入详情
  - 新增独立商品详情页：
    - `/products/:productId`
    - 只负责图片上传、封面设置、备注、删除图片、标准源刷新
  - 商品库信息架构从“左侧列表 + 右侧详情”改为“先列表，后详情”的明确流程。
  - 新建商品后直接进入对应详情页，减少中间状态。
- 使用说明：
  - 先进入 `商品库` 浏览或新建商品。
  - 点击任意商品进入详情页，再管理图片、封面和标准源。
  - 删除商品后自动返回商品列表页。
- Windows / Linux 兼容说明：
  - 本轮仅调整 Vue 路由与页面拆分，不依赖平台专属能力。

## 2026-05-21 商品库状态引导增强

- 目标：
  - 让商品库列表页和详情页对“无图片 / 待生成 / 生成中 / 失败 / 已完成”状态表达更直接，降低用户判断成本。
- 本轮最小改动：
  - 仅调整商品库两个页面的前端状态展示，不修改商品字段和主进程状态机。
- 修复内容：
  - 商品列表页新增状态引导条，明确说明：
    - 无图片
    - 待生成标准源
    - 生成中 / 失败
  - 商品卡片新增状态标签与一句状态提示：
    - 缺少图片
    - 待生成标准源
    - 标准源生成中
    - 标准源失败
    - 可直接复用
  - 商品详情页新增顶部状态横幅，统一说明当前商品下一步应该做什么。
  - 当商品没有图片时，详情页里的“生成标准源”按钮自动禁用，避免无效操作。
  - 重写商品库两个页面，顺手清理了残留编码污染。
- 使用说明：
  - 进入商品列表后，可以先看状态标签判断哪些商品可直接用于复刻和生产。

## 2026-05-21 商品库列表页与详情页设计对齐收口

- 目标：
  - 基于最新桌面端真实截图，继续把 `/products` 与 `/products/:productId` 主内容区收紧到更接近当前设计稿的结构和密度。
  - 不修改左侧菜单、顶部外壳和其他模块，只处理商品库列表页与详情页。
- 本轮最小改动：
  - 仅重写 `ProductLibraryView` 与 `ProductDetailView` 页面本身。
  - 保留既有商品功能链路：
    - 新建商品
    - 删除商品
    - 上传图片
    - 删除图片
    - 设置封面
    - 保存备注
    - 生成标准源
- 收口内容：
  - 商品列表页：
    - 清理可见乱码文案，统一为正式中文
    - 标题区、筛选区、统计区、分页区和商品卡片尺寸整体压缩
    - 搜索、类型、状态、排序和视图切换保留原功能
    - 卡片三点菜单继续支持查看详情和删除商品
  - 商品详情页：
    - 清理可见乱码文案，统一为正式中文
    - 顶部信息卡、右侧操作按钮、图片区、流程区和侧边信息卡整体收紧
    - 上传、设封面、删图、备注保存、标准源触发保持可用
    - 保留桌面端冒烟测试依赖的 `data-testid`
- 桌面端截图验证：
  - 使用最新构建后的真实截图进行对照，而不是旧构建截图
  - 最新截图产物位于：
    - `test/artifacts/product-library-desktop/01-products-home.png`
    - `test/artifacts/product-library-desktop/02-product-created.png`
    - `test/artifacts/product-library-desktop/03-image-uploaded.png`
    - `test/artifacts/product-library-desktop/05-image-deleted.png`
- 验证命令：
  - `npm run typecheck`
  - `npm run build`
  - `npm run test:product-library-desktop`
- Windows / Linux 兼容说明：
  - 本轮只调整 Vue 渲染层页面和样式，不依赖 Windows 专属 API。
  - 桌面端验证运行在 Windows，Linux 部署兼容性不受影响。
  - 进入商品详情后，优先看顶部状态横幅决定下一步是上传图片、重新生成标准源还是直接复用。
- Windows / Linux 兼容说明：
  - 本轮仅调整 Vue 渲染层和按钮禁用逻辑，不依赖平台专属能力。

## 2026-05-21 商品库导航语义统一

- 目标：
  - 统一主导航、生产辅助导航和顶部搜索的商品库语义，清理旧“产品素材”表达残留。
- 本轮最小改动：
  - 仅调整 `MainLayout` 和 `ProductionTabs` 的前端展示文案，不修改跳转逻辑和业务状态。
- 修复内容：
  - `ProductionTabs` 文案统一改为：
    - `商品库`
    - `模板中心`
    - `任务中心`
  - `ProductionTabs` 描述改为面向当前信息架构：
    - 商品库先选商品，再进详情管理图片与标准源
    - 模板中心只配规则
    - 任务中心只看执行结果
  - 顶部全局搜索占位词从“模板、素材、功能”调整为“商品、模板、任务、功能”。
- 使用说明：
  - 在生产相关页面中，商品入口统一理解为 `商品库 -> 商品详情`，不再是旧的素材工作台。
- Windows / Linux 兼容说明：
  - 本轮仅调整 Vue 组件文案和样式，不依赖平台专属能力。

## 2026-05-21 主布局模块引导收口

- 目标：
  - 让主布局里的帮助入口和模块说明更贴合当前“复刻 / 生产 / 商品库 / 模特库 / 切片”拆分后的职责边界。
- 本轮最小改动：
  - 仅调整 `MainLayout` 的帮助弹窗展示文案和模块说明数据，不修改路由和业务逻辑。
- 修复内容：
  - 帮助弹窗从单行按钮改为：
    - 模块名
    - 一句职责说明
  - 模块引导语义统一为：
    - `复刻`：绑定模特和商品，生成脚本、分镜图与分镜视频
    - `生产`：任务执行中心
    - `商品库`：商品列表与详情管理
    - `模特库`：统一管理模特身份与参考素材
    - `切片`：处理直播长视频切片
- 使用说明：
  - 用户从帮助弹窗进入各模块时，可以直接理解当前模块负责什么，不再需要从旧工作台语义里猜测。
- Windows / Linux 兼容说明：
  - 本轮仅调整 Vue 渲染层文案，不依赖平台专属能力。

## 2026-05-21 /clone 商品绑定区语义对齐商品库

- 目标：
  - 让 `/clone` 的商品绑定区与当前“商品库 -> 商品详情 -> 商品快照”结构保持一致，减少只显示商品 ID 和快照来源不清的问题。
- 本轮最小改动：
  - 仅调整 `CloneView` 商品绑定区的展示文案和状态说明，不修改 `/clone` 绑定逻辑、快照字段和主进程处理链路。
- 修复内容：
  - 当前绑定商品从“仅显示商品 ID”改为优先显示：
    - 商品名
    - 商品 ID
  - 商品绑定区新增明确说明：
    - 当前商品是否只是选中但还未绑定
    - 是否正在同步标准源缓存
    - 是否已经回退原图
    - 当前快照是否可直接用于分镜
  - 商品快照预览说明收口为两类：
    - `商品库原图快照`
    - `产品标准源快照`
  - 快照预览区域新增一句职责说明，明确：
    - 原图快照用于分镜主事实源
    - 标准源快照用于商品锁定和提示词描述
- 使用说明：
  - 在 `/clone` 里绑定商品后，可以直接看当前绑定商品名称、快照状态和快照职责，而不需要再回忆旧链路逻辑。
- Windows / Linux 兼容说明：
  - 本轮仅调整 Vue 渲染层文案，不依赖平台专属能力。

## 2026-05-21 模板页编码污染安全治理

- 目标：
  - 在不触碰复杂模板逻辑的前提下，先清理 `TemplatesView` 中影响维护体验的编码污染。
- 本轮最小改动：
  - 仅清理 `TemplatesView` 的可见区少量文案和高频乱码注释。
  - 不修改模板数据结构、模板保存逻辑、拖拽逻辑和 `i18n` 键体系。
- 修复内容：
  - 模板页头部英文 `Templates` 收口为 `模板中心`，与生产模块语义统一。
  - 清理了一批高频乱码注释，覆盖：
    - 旧字幕池字段说明
    - 标题组结构说明
    - LUT / 贴纸 / ASS 字幕说明
    - 字体导入便捷逻辑说明
    - 字幕分隔规则说明
    - 防抖保存说明
  - 清理模板页底部符号模板库弹窗注释乱码。
- 使用说明：
  - 本轮对用户可见行为影响很小，主要是让模板页文案和后续维护成本更稳定。
- Windows / Linux 兼容说明：
  - 本轮仅调整 Vue 文件中的注释和少量展示文案，不依赖平台专属能力。

## 2026-05-21 模板中心结构精简

- 目标：
  - 将模板中心从混合工作台收口为更清晰的内部结构。
- 本轮最小改动：
  - 不删除模板能力，只重组模板页内部分类与入口。
- 修复内容：
  - 模板页内部分类改为：
    - `结构规则`
    - `音频规则`
    - `字幕与配音`
    - `视觉输出`
  - 删除模板页里继续误导商品联动的结构入口。
  - 保留现有字幕、Edge-TTS、BGM、LUT、贴纸、颜色微扰等配置能力。
- 使用说明：
  - 进入模板中心后，按四类规则编辑模板，不再在模板页里处理商品结构。
- Windows / Linux 兼容说明：
  - 本轮仅调整 Vue 页面组织，不依赖平台专属能力。

## 2026-05-21 任务中心信息增强

- 目标：
  - 提升任务中心列表可读性，让生产模块更接近真正的任务执行中心。
- 本轮最小改动：
  - 不调整任务执行底层，不新增复杂后端接口。
  - 仅增强任务列表展示字段和失败筛选信息。
- 修复内容：
  - 任务列表补充显示：
    - 商品名
    - 模板名
    - 创建时间
    - 进度
    - 输出路径
    - 错误摘要
  - 保留：
    - 全部
    - 运行中
    - 已完成
    - 失败
    - 四类筛选
- 使用说明：
  - 进入 `任务中心` 后，可直接按失败筛选查看出错任务，再进入任务详情处理。
- Windows / Linux 兼容说明：
  - 本轮仅调整 Vue 列表渲染与本地数据映射，不依赖平台专属能力。

## 2026-05-21 生产首页与任务中心文案清理

- 目标：
  - 清理 `生产` 模块首页和任务中心的乱码文案，保证生产模块首屏信息结构清晰一致。
- 本轮最小改动：
  - 仅重写 `ProductionHomeView` 和 `TasksView` 的渲染层文案与展示结构。
  - 不修改任务接口、任务状态机和生产路由。
- 修复内容：
  - `生产首页` 文案恢复为正式中文：
    - 任务执行中心说明
    - 新建任务 / 任务中心 / 模板中心入口卡片
    - 最近任务与模块边界说明
  - `任务中心` 文案恢复为正式中文：
    - 筛选按钮
    - 批量操作按钮
    - 空状态
    - 商品、模板、创建时间、进度、输出路径等字段说明
  - 保持当前页面职责边界：
    - `生产首页` 只做摘要和入口
    - `任务中心` 只做任务列表与筛选
- 使用说明：
  - 进入 `生产` 后先看摘要与入口，再分别进入 `新建任务`、`任务中心`、`模板中心`。
  - 进入 `任务中心` 后可直接按状态筛选任务，再进入详情页处理。
- Windows / Linux 兼容说明：
  - 本轮仅调整 Vue 页面渲染与字符串内容，不依赖平台专属能力。

## 2026-05-21 新建任务页与任务详情页文案清理

- 目标：
  - 继续清理生产模块剩余关键页面的乱码文案，统一 `生产 -> 新建任务 -> 任务中心 -> 任务详情` 链路的首屏体验。
- 本轮最小改动：
  - 仅重写 `ProductionCreateTaskView` 与 `TaskDetailView` 的渲染层文案和说明结构。
  - 不修改任务创建接口、任务详情读取方式和模板业务逻辑。
- 修复内容：
  - `新建任务页` 文案恢复为正式中文：
    - 商品、模板、数量、输出目录字段
    - 创建反馈和跳转按钮
    - 页面说明与摘要卡片
  - `任务详情页` 文案恢复为正式中文：
    - 状态、进度、输出目录摘要
    - 错误详情
    - 输出文件、报告、输出目录操作按钮
    - 日志区和空状态
  - 已确认 `TemplatesView` 当前可见主文案主要走 `i18n` 和已整理过的中文标签，本轮不动其大文件业务实现，避免无关回归。
- 使用说明：
  - 从 `生产 -> 新建任务` 发起任务后，进入 `任务中心` 查看状态，再进入 `任务详情` 查看日志和错误。
- Windows / Linux 兼容说明：
  - 本轮仅调整 Vue 页面渲染与字符串内容，不依赖平台专属能力。

## 2026-05-21 生产模块与商品库模块职责拆分

- 目标：
  - 将 `生产` 与 `商品库` 明确拆成两个并列功能模块。
  - 让 `商品库` 回归商品图片素材管理主职责，不再承担生产入口语义。
- 本轮最小改动：
  - 保留现有任务页、模板页、商品数据结构与 `/clone` 绑定链路。
  - 仅调整导航归属、生产首页入口、商品库页面文案与素材交互优先级。
- 修复内容：
  - 新增独立 `生产` 模块首页，`/production` 作为生产总览入口。
  - 主导航改为并列模块：
    - `模特库`
    - `复刻`
    - `生产`
    - `商品库`
  - `商品库` 页面职责收口为：
    - 商品列表管理
    - 商品图片素材上传与分段整理
    - 商品素材预览
    - 商品标准源缓存相关管理
  - `商品库` 页面主交互改为图片素材优先：
    - 主按钮改为 `上传图片素材`
    - 拖拽导入优先识别图片
    - 素材卡对图片显示 `图片` 标识，而不是默认时长
    - 长视频切分导入降级为辅助入口
  - 商品素材预览弹窗补充图片预览能力，不再只支持视频。
  - 首页原先残留的生产入口跳转从 `/templates` 统一修正为 `/production`。
- 使用说明：
  - 进入 `商品库` 后，优先上传商品图片素材并按段管理。
  - 若需要从长视频中补充素材，可使用 `长视频切分导入`，但这不是主链路。
  - 进入 `生产` 后，统一从生产总览页进入 `任务执行` 或 `模板管理`。
- Windows / Linux 兼容说明：
  - 本轮仅涉及 Electron 渲染层页面、路由与文案调整，不依赖 Windows 专属能力。
  - Windows 开发测试与 Linux 部署运行逻辑保持一致。

## 2026-05-20 /clone 商品图自动净化前置链路

- 目标：
  - 修复上传佩戴图、手持图、带人像商品图后，后续商品分析、分镜图片、分镜视频被人物上下文污染的问题。
  - 把商品图治理前移到 `/clone` 商品图绑定阶段，不再主要依赖 prompt 忽略人物。
- 本轮最小改动：
  - 仅在 `clone` 主链路新增商品图净化服务、状态字段、失败阻断和前端预览切换。
  - 不重构脚本/分镜整体架构，不新增外部依赖。
- 修复内容：
  - 商品图保存改为双轨保存：
    - `originalProductReferenceImagePaths` 保存原图，仅用于留档和排查。
    - `sanitizedProductReferenceImagePaths` 保存净化后的纯商品图，作为唯一消费源。
    - `productReferenceImagePaths` 保留，但语义改为当前生效商品图，始终指向净化结果。
  - 新增商品图净化模块，在商品图绑定时自动去除耳朵、手、脸、头发、衣物和背景人物，只保留商品主体。
  - 新增净化状态：
    - `idle`
    - `processing`
    - `done`
    - `failed`
  - 自动净化失败时不再回退原图，直接阻断，并提示：
    - `商品图包含人物，自动净化失败，请重新上传更干净的商品图。`
  - `consistencyAssets` 追加保存原图、净化图与净化诊断结果。
  - 一致性素材生成默认只读净化图；没有净化图时阻止继续。
  - 桌面端 `/clone` 商品图片区新增净化状态展示，以及“查看净化图 / 查看原图”切换。
- 使用说明：
  - 上传商品图后，系统会先自动净化，成功后才继续进入商品分析、脚本、分镜图片、分镜视频。
  - 后续所有商品锁定都默认基于净化后的商品图，不再直接消费原始佩戴图。
  - 如果净化失败，需要重新上传更干净的商品图后再继续。
- Windows / Linux 兼容说明：
  - 本轮实现基于现有 Node/Electron TypeScript 与图片生成链路，不依赖 Windows 专属能力。
  - Windows 开发测试与 Linux 部署运行逻辑保持一致。

## 2026-05-20 /clone 商品图原图优先修订

- 目标：
  - 修复“AI 重绘净化图替代原图”导致分镜图片生成失败或商品漂移的问题。
  - 恢复原始商品图作为分镜图片与分镜视频的主事实源。
- 本轮最小改动：
  - 保留现有字段结构，不新增复杂接口。
  - 仅修订商品图保存语义、分析消费优先级和前端文案。
- 修复内容：
  - 分镜图片 / 分镜视频改为优先使用 `originalProductReferenceImagePaths`。
  - `sanitizedProductReferenceImagePaths` 改为辅助裁切图，只用于商品分析和提示词商品锁定。
  - 废弃 AI 重绘式净化；当前 v1 改为本地图像诊断优先：
    - 干净白底/高对比商品图直接复用原图作为辅助裁切结果。
    - 佩戴图若暂时无法本地可靠裁切，则记录失败并回退原图优先，不再重绘商品。
  - 裁切失败时允许商品分析继续，但 UI 明确提示“辅助裁切失败，已回退原图优先”。
  - 商品图片区文案从“净化”改为“裁切 / 辅助裁切”。
- 使用说明：
  - 上传商品图后，系统仍会尝试生成辅助裁切结果，但不会再用 AI 新图替换原图作为分镜主参考。
  - 分镜阶段继续优先依据原始商品图保持结构、佩戴方向和细节一致性。
- Windows / Linux 兼容说明：
  - 当前实现基于本地诊断与已有 TypeScript 服务逻辑，不依赖平台专属能力。
  - Windows 开发测试与 Linux 部署运行逻辑保持一致。

## 2026-05-20 /clone 商品图处理切换为 Replicate background remover

- 目标：
  - 将 `/clone` 商品图处理从本地 Python + YOLO/SAM/rembg 切换为 Replicate `851-labs/background-remover`。
  - 继续生成白底商品成品图用于商品分析、提示词商品锁和分镜辅助参考，同时保持原图优先作为分镜主事实源。
- 本轮最小改动：
  - 仅替换主进程商品图处理实现，不改前端接口与项目字段。
  - 主进程 / Web 服务端统一通过环境变量托管 Replicate Token。
- 修复内容：
  - 使用 Replicate `851-labs/background-remover` 远程处理商品图。
  - 请求固定使用白底输出：`background_type=white`、`format=png`。
  - 处理成功后下载白底商品成品图并写入 `sanitizedProductReferenceImagePaths`。
  - 商品分析优先使用商品成品图，分镜图片/视频仍优先使用原始商品图。
  - 只有当全部商品图都提取失败时，才阻断分镜阶段。
  - 新增服务端环境变量：`REPLICATE_API_TOKEN`。
  - 桌面端 `设置 -> 开放平台凭证` 新增 `Replicate API Token` 输入框，保存到本地加密配置后供主进程商品处理链路读取。
  - 未配置 Token 时，商品图区直接进入失败并返回明确错误。
  - 商品图区文案改为“商品提取”语义：
    - `待提取 / 提取中 / 提取完成 / 提取失败`
- 使用说明：
  - 上传并绑定商品图后，系统会自动调用 Replicate 生成白底商品成品图。
  - 桌面端可先在设置页填写 `Replicate API Token`，无需单独配置系统环境变量。
  - 成功时可在商品图区切换查看 `原图 / 商品成品图`。
  - 若全部提取失败，需重新上传更清晰的商品图后再继续分镜阶段。
  - 分镜图片 / 分镜视频实际仍以 `originalProductReferenceImagePaths` 为第一事实源，`sanitizedProductReferenceImagePaths` 只作为商品分析、提示词商品锁和辅助参考。
  - 桌面端触发分镜生成时，显式按“原图优先、商品成品图辅助”顺序传递参考图，避免 UI 预览图替代原图事实源。
- Windows / Linux 兼容说明：
  - Windows 开发与 Linux 部署均通过主进程 / 服务端调用 Replicate，不再依赖本机 Python、torch 或 onnxruntime。
  - 旧本地 Python 商品图提取方案已停用，不再参与主调用链。

## 2026-05-20 /clone Product Canonical Source 商品标准源切换

- 目标：
  - 将 `/clone` 商品图处理从“Replicate 去背景商品成品图”升级为“AI 重建 Product Canonical Source 产品标准源图”。
  - 后续商品分析、分镜图片、分镜视频优先使用产品标准源，而不是继续默认原图优先。
- 本轮最小改动：
  - 复用现有 clone 图片模型链路，不新增独立商品处理服务。
  - 保留现有项目字段，仅调整语义和消费优先级。
- 修复内容：
  - `sanitizedProductReferenceImagePaths` 语义改为 `Product Canonical Source` 输出图。
  - 商品标准源生成提示词固定为：
    - 重建纯商品图
    - 去除全部人物元素
    - 完全保持原商品的形状、结构、材质、颜色、比例
    - 输出到纯净中性背景
  - `consistencyAssets.productImageSanitization.diagnostics` 追加记录：
    - `prompt`
    - `fallbackToOriginal`
  - 分镜图片 / 分镜视频参考顺序切换为：
    - 产品标准源优先
    - 原图作为补充参考与失败回退源
  - 标准源生成失败时：
    - 允许回退原图继续
    - 前端明确提示：`产品标准源生成失败，当前已回退原图继续。`
  - 商品区文案从“商品成品图 / 提取”改为“产品标准源 / 生成”。
- 使用说明：
  - 上传并绑定商品图后，系统会自动生成 `Product Canonical Source`。
  - 成功时，后续商品分析与分镜优先使用标准源图。
  - 失败时，系统会提示已回退原图继续，而不是静默失败。
- Windows / Linux 兼容说明：
  - 本轮仅调整 TypeScript 主进程与桌面端渲染逻辑，继续兼容 Windows 开发与 Linux 部署。

## 2026-05-19 项目日志与临时垃圾清理规范

## 2026-05-19 编码污染治理第 10 轮

- 目标：
  - 阻断仓库继续出现编码乱码和构建产物污染。
  - 优先治理 Windows 开发环境下的持续伪变更问题。
- 本轮最小改动：
  - 仅更新编码门禁脚本、忽略规则与关键文档。
  - 不改任何业务模块，不重构构建链路。
- 修复内容：
  - `scripts/encoding-guard.mjs` 扩展到扫描 `docs / scripts / 根级关键配置`。
  - 新增高风险 mojibake 字符检查：`锛 / 銆 / 鈥 / 鈩 / 锟 / �`。
  - 新增 Git 跟踪构建产物检查：`apps/web-next/.next/**`、`apps/web-next/tsconfig.tsbuildinfo`。
  - `.gitignore` 显式忽略 `apps/web-next/.next` 与 `apps/web-next/tsconfig.tsbuildinfo`。
  - 修复 `package.json`、`README.md`、编码治理文档中的已知乱码文本。
- 使用说明：
  - Windows 开发机建议在当前仓库执行：
    - `git config core.autocrlf false`
    - `git config core.safecrlf true`
  - 提交前执行：
    - `npm run guard:encoding`
  - 若门禁提示 `.next` 仍被 Git 跟踪，需要单独执行索引清理：
    - `git rm -r --cached apps/web-next/.next`
    - `git rm --cached apps/web-next/tsconfig.tsbuildinfo`
- Windows / Linux 兼容说明：
  - 本轮仅涉及 Git / 文档 / Node 门禁脚本治理，不依赖平台专属能力。
  - Windows 开发与 Linux 部署可共用当前治理方案。

## 2026-05-19 分镜图一致性收口与顺序锚定

## 2026-05-19 模特展示耳环镜头被压成静态产品图修复

## 2026-05-19 分镜图跨镜头单实例锁定约束增强

## 2026-05-19 脚本变体默认沿用参考视频原脚本

## 2026-05-19 脚本变体母本对齐修复与高分默认恢复

- 目标：
  - 修复脚本变体未贴合参考视频反推脚本的问题。
  - 恢复评分最高的变体作为默认选项，但前提是所有高分变体都已被母本约束收紧。
  - 修复脚本变体生成后多条候选近乎完全相同、缺少有效差异的问题。
- 本轮最小改动：
  - 仅调整主进程 `clone` 的脚本变体提示词、候选后处理对齐、重复保护和默认选中逻辑。
  - 不改前端接口，不改主数据结构，不移除参考视频原脚本候选。
- 修复内容：
  - `generateWholeScriptVariantsWithAi(...)` 的 prompt 从“强母本锁定”调整为“同片轻变体生成”，保持镜头顺序与大体职责一致即可。
  - 允许 AI 在不改变整片概念的前提下，对措辞、镜头强调点、卖点排序、转场表达、收口语气和细节描述做更明显变化。
  - 服务端后处理不再要求变体字段与母本近似到高重叠率；只要仍属于同一条视频思路，就允许保留。
  - 继续保留整片候选重复保护：若 AI 主路径返回的多条候选在 summary 或逐镜脚本上近乎一致，则自动回退到逐镜候选组合路径，避免桌面端出现“多条候选看起来完全一样”。
  - fallback 路径组装候选时，同样保留“差不多即可”的宽松策略，不再把大部分差异抹平成母本。
  - 若候选仍然过近，服务端会按不同主题角度进行强制差异化整理，例如：
    - 潮流前卫
    - 日常百搭
    - 礼物心动
    - 质感细节
  - 强制差异化会直接作用到每条候选的逐镜 `scriptText / visualDescription / actionDescription / cameraDescription / generationPrompt`，不再只改标题和摘要。
  - 强制差异化不改变镜头顺序与整片基础思路，只改变每镜表达角度和强调点。
  - 参考视频原脚本继续保留为显式候选。
  - 默认 `selectedScriptVariantId` 恢复为评分最高候选，自动流程也恢复选择最高分项。
  - 修复默认脚本应用错误：生成完成后，实际写回项目分镜时明确使用“生成候选中评分最高的那条”，不再因为 `参考视频原脚本` 的固定高分展示而误写回原脚本。
  - 修复桌面端脚本变体页顶部“默认脚本”展示错误：顶部摘要卡和大卡改为跟随 `selectedScriptVariantId / selected`，不再固定显示列表第一条。
- 使用说明：
  - 生成脚本变体后，默认会选评分最高的一条，但不再要求所有候选几乎逐字贴母本。
  - 新生成的脚本变体只要与原片“大体一致、同片可用”即可，允许有更明显的轻改写差异。
  - 如需完全回退，可手动切换到 `参考视频原脚本` 候选。
- Windows / Linux 兼容说明：
  - 本轮仅调整 TypeScript 服务逻辑，不依赖 Windows 专属能力。
  - Windows 开发测试与 Linux 部署运行逻辑保持一致。

## 2026-05-19 参考视频分析强贴视频逐镜还原修复

- 目标：
  - 修复参考视频分析内容与原视频不一致、容易被提示词和 fallback 拉成另一套电商脚本的问题。
  - 让参考视频分析优先做“逐镜事实还原”，而不是“导演化优化”或“卖货逻辑脑补”。
  - 让反推分镜脚本输出更贴近“可直接用于 AI 视频生成的完整提示词”，而不是泛化广告文案。
- 本轮最小改动：
  - 仅调整主进程 `clone` 的参考视频分析提示词与脚本分析 fallback 文案。
  - 不改前端接口，不改项目数据结构，不新增页面参数。
- 修复内容：
  - `aiScriptAnalyzer.ts` 中 `buildInstruction(...)` 改为“strict reference-video forensic analyst”取向。
  - 明确要求：只还原视频中实际可见或可可靠推断的信息，不允许补营销话术、CTA、额外卖点、情绪曲线或模板化销售结构。
  - 明确保留真人佩戴/真人演示语义；若源视频是模特展示商品，不得在分析阶段收缩成静态产品图理解。
  - `fallbackAnalysisResult(...)` 不再自动补 `hook / solution / proof / CTA` 模板结构，也不再默认补 hook 与 CTA 文案。
  - `fallbackShot(...)` 与 `applyScriptAnalysisToShots(...)` 的 `productFocus` fallback 改为更事实化的参考视频观察表述。
  - 每镜 `scriptText` 改为基于镜头真实内容的简明分镜描述，不再优先保留泛营销句式。
  - 每镜 `generationPrompt` 统一重建为 7 个维度：
    - 主体
    - 动作
    - 场景
    - 光影
    - 运镜
    - 风格
    - 画质参数
  - 无论走主模型返回还是 fallback，落库后的每镜视频提示词都按同一套 7 维结构收口。
  - 参考视频分析页“脚本内容”区域改为优先展示 `blueprint.shots[*].scriptText`，不再优先显示 `globalScript.content` 的整片摘要文案。
  - 保存分析结果时，`globalScript.content` 也会回填为逐镜 `scriptText` 汇总，避免首屏再次被泛化营销摘要污染。
- 使用说明：
  - 重新执行参考视频分析后，新规则才会生效。
  - 如果原视频本身信息弱或语音不清，分析结果会更保守，宁可少写，也不会再默认脑补成标准电商短视频结构。
  - 参考视频分析产出的分镜脚本会更偏“可直接喂给 AI 视频模型”的结构化提示词，而不是广告文案摘要。
- Windows / Linux 兼容说明：
  - 本轮仅调整 TypeScript 服务逻辑与提示词文案，不依赖 Windows 专属能力。
  - Windows 开发测试与 Linux 部署运行逻辑保持一致。

- 目标：
  - 修复脚本变体未贴合参考视频反推脚本的问题。
  - 恢复评分最高的变体作为默认选项，但前提是所有高分变体都已被母本约束收紧。
- 本轮最小改动：
  - 仅调整主进程 `clone` 的脚本变体提示词、候选后处理对齐和默认选中逻辑。
  - 不改前端接口，不改数据结构，不移除参考视频原脚本候选。
- 修复内容：
  - `generateWholeScriptVariantsWithAi(...)` 的 prompt 明确 `sourceScript` 是唯一母本，所有变体必须逐镜贴合参考视频反推脚本。
  - 增加服务端逐镜“母本对齐修复”，对越界字段回退到 `baseShots` 母本。
  - fallback 路径组装候选时，同样执行母本对齐，避免降级时自由发散。
  - 参考视频原脚本继续保留为显式候选。
  - 默认 `selectedScriptVariantId` 恢复为评分最高候选，自动流程也恢复选择最高分项。
- 使用说明：
  - 生成脚本变体后，默认会选评分最高的一条，但这条高分脚本应仍然贴合参考视频反推脚本。
  - 如需完全回退，可手动切换到 `参考视频原脚本` 候选。
- Windows / Linux 兼容说明：
  - 本轮仅调整 TypeScript 服务逻辑，不依赖 Windows 专属能力。
  - Windows 开发测试与 Linux 部署运行逻辑保持一致。

- 目标：
  - 调整脚本变体默认选中策略，生成变体后默认继续使用参考视频拆解出的原始脚本内容，不自动切到高分变体。
- 本轮最小改动：
  - 仅调整主进程 `clone` 的脚本变体默认候选与自动流程选择逻辑。
  - 不改前端页面结构，不移除高分变体，不影响手动切换能力。
- 修复内容：
  - 生成脚本变体时，候选列表首项新增 `参考视频原脚本`。
  - `selectedScriptVariantId` 默认指向参考视频原脚本，而不是最高分变体。
  - 自动流程中不再默认“自动选择最高分脚本”，改为“自动生成脚本变体并默认沿用参考视频原脚本”。
  - 高分变体仍然保留在候选列表中，用户可手动切换。
- 使用说明：
  - 生成脚本变体后，系统默认继续使用参考视频拆解出的那条脚本。
  - 如果想用评分更高的脚本，仍可在脚本变体列表中手动选择。
- Windows / Linux 兼容说明：
  - 本轮仅调整 TypeScript 服务逻辑，不依赖 Windows 专属能力。
  - Windows 开发测试与 Linux 部署运行逻辑保持一致。

- 目标：
  - 进一步收紧分镜图跨镜头一致性，明确所有分镜只是“同一个商品实例、同一个模特身份”的不同机位视角，而不是每镜重新生成一个相似新物体。
- 本轮最小改动：
  - 仅增强主进程 `clone` 图片 prompt 顶层约束文案，不改接口、不改页面、不改数据结构。
- 修复内容：
  - 顶层增加 `STRICT PRODUCT LOCK / MODEL LOCK / CONSISTENCY RULE`。
  - 明确：
    - `There is ONLY ONE product instance across all shots`
    - `NOT re-generated per shot`
    - `Different camera views ONLY`
  - 对模特展示镜头保留真人佩戴/真人演示语义，不把“单实例锁”执行成无人静物图。
- 使用说明：
  - 重新生成分镜图后，新的一镜一实例锁定规则才会生效。
  - 旧任务旧图不会自动更新。
- Windows / Linux 兼容说明：
  - 本轮仅调整 TypeScript prompt 文案，不依赖 Windows 专属能力。
  - Windows 开发测试与 Linux 部署运行逻辑保持一致。

- 目标：
  - 修复 `/clone` 中脚本明明是“模特展示耳环”或“佩戴展示”镜头，但生成结果退化成静态产品图、桌面摆拍图或 catalog packshot 的问题。
- 本轮最小改动：
  - 仅调整主进程 `clone` 的图片 prompt 角色约束，不改页面、不改接口。
- 修复内容：
  - 对 `model_scene / model_demo` 类镜头补强“必须保留真人佩戴/真人演示语义”的 prompt 规则。
  - 明确这类镜头不能退化为 isolated product still、tabletop packshot、flat catalog image。
  - 在一致性编译层和图片生成层同时保留“商品 identity 优先”，但不再把“product-led”误解释成“无人静物图”。
  - 继续保留静默商业片规则，但对模特展示镜头不再默认把人物展示语义压没。
- 使用说明：
  - 对已有任务重新生成对应分镜图后，新规则才会生效。
  - 若脚本/参考镜头本身是佩戴展示镜头，新的结果应保留耳部、颈肩、手部或其他自然人体演示上下文。
- Windows / Linux 兼容说明：
  - 本轮仅调整 TypeScript prompt 逻辑，不依赖 Windows 专属能力。
  - Windows 开发测试与 Linux 部署运行逻辑保持一致。

- 目标：
  - 修复 `/clone` 分镜图“各生各的”、提示词混乱、跨镜头商品和模特不稳定的问题。
  - 保持现有分镜图入口不变，仅通过 prompt 收口和顺序锚定提高一致性。
- 本轮最小改动：
  - 仅调整主进程 `clone` 的图片 prompt 拼装、prompt consistency 清洗/风控、参考图优先级。
  - 不改前端页面，不新增接口参数，不重构整体分镜图工作流。
- 修复内容：
  - `compiledPrompt` 提升为图片生成的主 identity 骨架，镜头信息改为从属补充。
  - prompt 清洗增强，过滤调试残留、重复句、冲突文案、容易诱导 redesign / over-style 的描述。
  - 高风险商品、反光材质、强运动/遮挡镜头更容易进入 strict 模式，降低 cinematic 覆盖 identity 的概率。
  - 分镜图新增顺序锚定：第 2 镜及之后优先追加上一镜已生成图作为 continuity anchor；缺失时自动回退。
  - prompt / refs 变化后通过现有 hash 自然失效，不引入额外迁移。
- 使用说明：
  - 用户无需新增手动开关，重新生成分镜图后新规则自动生效。
  - 旧任务不会自动更新，需重新生成对应分镜图。
  - 单镜头重新生成时，如可找到上一镜已生成图，会自动参与一致性锚定。
- 补充说明：
  - 深层分镜图片（尤其是 GPT keyframe start / end prompt）不再只依赖商品参考图。
  - 生成 prompt 时会显式注入商品结构文本描述，内容来自项目内 `consistencyAssets.productAnalysis`，包括：
    - category
    - core subject
    - connection structure
    - material details
    - wearing position
    - surface details
    - color details
    - geometry details
    - size / scale
    - matching rules
  - 目的：避免模型只靠参考图自由猜测商品形态，导致深层分镜生成出与上传商品图不一致的“另一件商品”。
  - 桌面端 `/clone` 的“分镜设计”阶段新增“提示词”预览入口：
    - 每条分镜右侧操作区提供 `提示词` 按钮
    - 点击后以弹窗形式展示当前分镜图片的 `Start Prompt / End Prompt / Negative Prompt`
    - 弹窗支持 `复制全部`，也支持分别复制 `Start / End / Negative`
    - 不再把提示词长文本常驻占用右侧分镜预览区域
    - 若当前项目尚未落库 `productAnalysis`，点击提示词预览时会先自动补跑商品结构分析，再返回带 `TEXT PRODUCT DESCRIPTION LOCK` 的提示词
    - 若结构分析接口临时失败，后端会回退到基于参考图约束的通用商品结构描述，保证提示词中仍然存在非空的商品描述锁定段，而不是完全缺失
  - 若当前项目还没有 `productAnalysis`，则在生成 GPT 分镜图前同步补跑一次商品结构分析并立刻落库，确保本次 prompt 就能带上商品描述，而不是继续等待后台异步补写。
- Windows / Linux 兼容说明：
  - 本轮仅为 TypeScript 主进程逻辑调整，不依赖 Windows 专属能力。
  - Windows 开发测试与 Linux 部署运行逻辑保持一致。

## 2026-05-19 复刻分镜图片统一模特身份锁定修复

- 目标：
  - 修复 `/clone` 复刻链路中，已选择模特后，分镜图片仍被商品参考图中的人物带偏，导致各分镜模特不一致的问题。
  - 明确分镜图片生成阶段必须“模特锁人、商品图锁商品”，禁止商品图中的人物身份覆盖已选模特。
- 本轮最小改动：
  - 仅调整主进程 `clone` 分镜图片生成 prompt、引用图顺序和 prompt consistency 编译逻辑。
  - 不改前端页面结构，不改 `/storyboard-images` 入口协议，不扩散到无关页面。
- 修复内容：
  - 分镜图片 prompt 新增 `STRICT MODEL IDENTITY LOCK` 规则，明确所有分镜图必须使用同一个已选模特身份。
  - 明确 `PRODUCT REFERENCES LOCK PRODUCT ONLY, NOT PERSON IDENTITY`，商品图只用于锁定商品结构、材质、颜色、比例和细节。
  - 当商品图中带有人物时，系统会在 prompt 中明确忽略其中人物的脸、发型、肤色、体态和穿搭身份，只提取商品信息。
  - 分镜图片引用图顺序调整为“模特身份包优先、商品图其后”，降低 provider 被商品图人物带偏的概率。
  - prompt consistency 编译结果新增模特身份锁补丁，统一约束“选中模特身份 > 商品图中的人物信息”。
- 使用说明：
  - 选择模特后，所有分镜图默认强制使用该模特，不需要新增手动开关。
  - 商品图只作为商品身份参考，不再作为人物身份来源。
  - 旧任务需要重新生成分镜图片后，新的统一模特规则才会生效。
  - 可通过 `npm run test:storyboard-model-lock` 做最小 prompt 回归检查。
- Windows / Linux 兼容说明：
  - 本轮仅修改 TypeScript 主进程 prompt 和服务逻辑，不依赖 Windows 专属 API。
  - Windows 开发测试与 Linux 部署运行逻辑保持一致。

## 2026-05-19 饰品分镜高光过假与耳环站立姿态修复

- 目标：
  - 修复饰品类分镜图/分镜视频中，钻石或金属高光被生成得过亮、过闪、过假 的问题。
  - 修复耳环类商品被错误生成成“自己站起来”的不真实姿态问题。
- 本轮最小改动：
  - 仅调整 `clone` 主进程中饰品相关的 prompt 正向约束和负面约束。
  - 不改前端页面，不改任务入口，不新增用户开关。
- 修复内容：
  - 对耳环/饰品类补充“真实反光”规则：
    - 钻石、锆石、金属反光必须是相机真实可见的自然高光。
    - 禁止夸张 sparkle、glow、starburst、magical shimmer、fake luxury VFX。
  - 对耳环类补充“真实支撑/重力”规则：
    - 耳环只能以佩戴在耳朵上、手持、平放或有真实支撑接触点的方式展示。
    - 禁止生成耳环像摆件、雕塑、立牌一样独立直立。
  - 图像 prompt、视频 prompt、anti-variation 和负面提示词同步收口，减少图像和视频阶段语义不一致。
- 使用说明：
  - 用户无需额外操作，重新生成分镜图或分镜视频后新规则自动生效。
  - 旧任务的旧分镜结果不会自动回刷，需要重新生成对应分镜阶段。
- Windows / Linux 兼容说明：
  - 本轮仅为 TypeScript prompt 约束更新，不依赖 Windows 专属 API。
  - Windows 开发测试与 Linux 部署运行逻辑保持一致。

## 2026-05-19 商品素材保存后项目根级引用同步修复

- 目标：
  - 修复复刻项目在保存商品参考图后，仅更新蓝图层 `consistencyAssets / shot.productReferenceImagePaths`，但未同步项目根级 `productReferenceImagePaths`，导致部分旧链路或兼容逻辑读取到旧值的问题。
- 本轮最小改动：
  - 仅调整主进程 `clone` 服务中的商品素材保存逻辑。
  - 不改前端页面结构，不改 IPC 协议，不扩展新的状态字段。
- 修复内容：
  - `generateConsistencyAssets(...)` 在保存商品参考图后，同步回写项目根级 `productReferenceImagePaths`。
  - 异步商品结构分析成功后再次持久化时，同样保持项目根级 `productReferenceImagePaths` 与蓝图层一致。
- 使用说明：
  - 保存商品参考图后，项目级、蓝图级、分镜级商品图引用会保持一致。
  - 依赖旧字段 `productReferenceImagePaths` 的摘要、兼容逻辑或后续流程可以直接读取到最新商品图。
- Windows / Linux 兼容说明：
  - 本轮仅为 TypeScript 主进程字段同步修复，不依赖 Windows 专属 API。
  - Windows 开发测试与 Linux 部署运行逻辑保持一致。

- 目标：
  - 清理仓库根目录中无业务价值的本地日志、临时截图、临时调试目录和冒烟运行残留。
  - 避免 Windows 开发环境产生的大量本地垃圾继续污染仓库，且不影响 Linux 部署内容。
- 本轮最小改动：
  - 仅清理未纳入业务主链的数据垃圾与临时产物。
  - 不删除 `node_modules`、不删除已存在的业务数据库和上传目录、不重构构建流程。
- 清理范围：
  - 根目录运行日志：`*.log`、`*.out`、`*.err`、`*.pid`
  - 临时截图与调试产物：`tmp-*`、`audit-*.png`、`.tmp-*`
  - 临时目录：`logs/`、`tmp/`、`.codex-logs/`、`.tmp-playwright/`
  - 一次性冒烟目录：`.videogenerate-auth-smoke-*`、`.videogenerate-smoke*`、`.videogenerate-staging`、`.videogenerate-production`、`.videogenerate-web-stack-smoke`
- 保留范围：
  - `.videogenerate/` 应用数据目录保留，因为其中包含 `db / cache / web-uploads / viral-clone` 等业务运行数据。
  - `apps/web-next/.next` 当前已有 Git 跟踪内容，本轮不直接删除已纳管文件，只补充后续缓存忽略规则，避免扩大范围。
- 忽略规则补充：
  - `.gitignore` 新增 `*.out`、`*.err`、`*.pid`、`audit-*.png`、`.tmp-*`、冒烟目录和部分 `.next` 缓存路径忽略。
- 使用说明：
  - 日常开发后如需清理，可优先删除上述日志与临时目录，不要直接删除 `.videogenerate/`。
  - 若后续要彻底治理 `apps/web-next/.next` 被跟踪问题，应单独开一轮整理 Git 跟踪策略，不在本轮垃圾清理中混做。
- Windows / Linux 兼容说明：
  - 本轮仅清理本地开发垃圾和补充忽略规则，不引入任何平台专属代码。
  - Windows 开发和 Linux 部署都可共用当前忽略策略。

## 2026-05-18 复刻分镜动作僵硬与成片只取开头修复

- 目标：
  - 修复复刻链路中“分镜视频动作过慢、过僵、每段变化过小”的问题。
  - 修复最终成片仍按原参考镜头时长截短，导致 8 秒分镜只显示开头画面的问题。
- 本轮最小改动：
  - 仅调整主进程复刻后端的分镜视频 prompt 和最终成片拼接策略。
  - 不改前端页面，不新增设置入口，不重做分镜分析器。
- 修复内容：
  - 最终成片合成阶段新增局部取段模式，内部支持：
    - `reference_trim`
    - `smart_middle_tail`
    - `full_generated_clip`
  - 本轮默认使用 `smart_middle_tail`：
    - 当 AI 分镜实际生成 8 秒，但当前镜头目标时长更短时，不再固定从 `0s` 开始裁剪。
    - 优先取中段到后段，避免成片总是只看到每段最前面几秒。
    - 合成报告补充每段实际使用的 `sourceDuration / clipStart / clipDuration / clipMode`，便于排查。
  - 分镜视频 prompt 放松过强动作锁定：
    - 保留商品身份锁、参考图最高优先级、禁止 redesign、cinematic 不覆盖 identity。
    - 将“动作必须极小延续”改为“动作语义一致但允许完整演绎”。
    - 强化手部位移、产品翻转、佩戴展示、镜头推进等动态提示，减少“开头动一下，后面基本静止”。
    - 静默规则继续保留，但只约束“不说话 / 不口播 / 不主持人式讲解”，不再把整体表演压成过度保守。
- 使用说明：
  - 重新生成最终成片后，新的成片会优先使用各分镜的中后段有效画面，而不是固定只取开头。
  - 重新生成分镜视频后，新的 prompt 才会生效，人物和产品动作应更完整、更连续。
  - 旧分镜视频和旧成片不会自动回刷，需要手动重新生成对应阶段。
- Windows / Linux 兼容说明：
  - 继续使用 Node + ffmpeg / ffprobe 的跨平台路径处理，不写死 Windows 专属路径格式。
  - 本轮新增的取段探测与裁剪逻辑保持 Linux 部署兼容。

## 2026-05-19 桌面端侧边栏复刻与模特菜单点击恢复

- 目标：
  - 修复桌面端工作台中左侧 `复刻` 与 `模特` 菜单点击无响应的问题。
- 本轮最小改动：
  - 仅调整桌面端共享壳层 `src/renderer/src/ui/MainLayout.vue` 的侧边导航层级与点击命中。
  - 不改业务路由、不改复刻页和模特库页内部逻辑。
- 修复内容：
  - 为共享侧边栏容器显式补充 `position / z-index / pointer-events`。
  - 为侧边导航项显式补充可点击层级，避免被复刻详情页等主内容浮层误覆盖。
- 使用说明：
  - 在桌面端任意工作台页面，点击左侧 `复刻` 应回到复刻任务列表。
  - 点击左侧 `模特` 应进入模特库页面。
- Windows / Linux 兼容说明：
  - 本轮仅为前端样式壳层修复，不依赖 Windows 专属 API。
  - Electron 开发环境与 Linux 打包后的渲染逻辑保持一致。

## 2026-05-19 Web 复刻任务列表支持修改名称

- 目标：
  - 修复 Web 端 `/clone` 复刻任务列表中任务无法修改名称的问题。
- 本轮最小改动：
  - 仅补齐 Web 端复刻任务标题更新链路。
  - 不改复刻详情页主流程，不改桌面端列表 UI，不扩散到无关模块。
- 修复内容：
  - Web API 客户端新增更新复刻任务元信息方法。
  - Web 平台服务与路由补齐 `POST /clone/projects/:projectId` 标题更新入口，并复用已有 `cloneService.updateProjectMeta(...)`。
  - Web 端 `/clone` 列表任务卡片新增“修改任务名称”入口和保存弹层，保存成功后自动刷新列表。
- 使用说明：
  - 进入 Web 端 `/clone` 复刻任务列表。
  - 点击任务卡片底部操作区的编辑图标。
  - 输入新名称并保存后，列表标题会立即更新。
- Windows / Linux 兼容说明：
  - 本轮仅新增标准 Web API 与 React 交互，不依赖 Windows 专属能力。
  - Windows 开发环境与 Linux 部署环境可共用。

## 2026-05-19 桌面端复刻任务列表支持修改名称

- 目标：
  - 修复桌面端 `src/renderer` 复刻任务列表中任务无法修改名称的问题。
- 本轮最小改动：
  - 仅在桌面端复刻任务列表页补充重命名入口与页内弹层。
  - 不改复刻详情页，不改主进程持久化结构，不改桌面端其他页面。
- 修复内容：
  - 复用既有 `window.api.clone.updateProjectMeta(...)` IPC 链路。
  - 桌面端复刻任务卡片操作区新增编辑按钮。
  - 点击后弹出页内“修改任务名称”面板，保存成功后自动刷新列表。
- 使用说明：
  - 进入桌面端复刻任务列表页。
  - 点击任务卡片底部操作区的编辑图标。
  - 输入新名称并保存后，列表标题会立即更新。
- Windows / Linux 兼容说明：
  - 本轮仅新增 Electron 渲染层交互，依赖现有跨平台 IPC 能力。
  - Windows 开发测试与 Linux 打包部署均可共用。

## 2026-05-19 桌面端复刻任务列表卡片改紧凑列表

- 目标：
  - 修复桌面端复刻任务列表缩略图溢出、卡片过大、首屏占用过高的问题。
- 本轮最小改动：
  - 仅重排 `src/renderer/src/ui/views/CloneTaskListView.vue` 的任务列表视觉结构。
  - 不改任务数据结构、不改筛选分页、不改复刻详情页。
- 调整内容：
  - 原四列大卡片改为单列紧凑列表行。
  - 缩略图改为固定小尺寸左侧预览，不再作为大面积卡片头图。
  - 选择框从图片浮层移出，独立放在最左侧，避免遮挡与溢出。
  - 状态、阶段、进度、素材摘要和操作收进同一行区域，减少纵向占用。
  - 列表样式收紧为更密、更稳的工作台表格式视觉。
- 使用说明：
  - 进入桌面端复刻任务列表页后，任务会以紧凑列表展示。
  - 可继续使用现有选择、打开任务、删除、筛选、分页与批量导出能力。
- Windows / Linux 兼容说明：
  - 本轮仅修改 Electron 渲染层模板与样式，不依赖平台专属 API。
  - Windows 开发测试与 Linux 打包部署均可共用。

## 2026-05-19 桌面端复刻任务列表改表头对齐工作台样式

- 目标：
  - 继续把桌面端复刻任务列表从紧凑列表收口为真正的“表头 + 列对齐”工作台样式。
- 本轮最小改动：
  - 仅调整 `src/renderer/src/ui/views/CloneTaskListView.vue` 的列表行结构和样式对齐方式。
  - 不改任务数据结构，不改筛选分页，不改详情页逻辑。
- 调整内容：
  - 新增列表表头，明确区分：选择、预览、任务信息、阶段、素材、进度、更新时间、操作。
  - 每条任务行按照固定列宽对齐，整体更接近生产系统任务表。
  - 任务信息、阶段、素材、进度、时间和操作不再自由流式排布，而是落在稳定列中。
  - 窄屏下自动回退为前一轮紧凑列表，保持可用性。
- 使用说明：
  - 在桌面端复刻任务列表页，宽屏下会显示表头和列对齐任务行。
  - 在较窄窗口下会自动切回紧凑堆叠布局，不影响操作。
- Windows / Linux 兼容说明：
  - 本轮仅修改 Electron 渲染层模板与样式，不依赖平台专属 API。
  - Windows 开发测试与 Linux 打包部署均可共用。

## 2026-05-19 桌面端复刻任务列表改为稳定左右两栏

- 目标：
  - 去掉列表页顶部冗余统计卡片，并修复右侧说明区挤压覆盖左侧任务列表的问题。
- 本轮最小改动：
  - 仅调整 `src/renderer/src/ui/views/CloneTaskListView.vue` 的页面结构密度与列表列宽。
  - 不改任务数据结构，不改详情页逻辑，不改主进程接口。
- 调整内容：
  - 移除顶部“全部任务 / 进行中 / 已完成 / 失败任务”四个统计卡片。
  - 主内容区明确固定为“左侧任务列表 + 右侧任务说明 / 最近更新”两栏布局。
  - 左侧表格列宽、缩略图尺寸、文字字号和进度区宽度进一步压缩，避免被右栏覆盖。
  - 保留窄屏自动退化逻辑，窗口较小时继续切回单列堆叠。
- 使用说明：
  - 桌面端复刻任务列表页首屏将不再显示顶部统计卡片。
  - 宽屏下左侧为任务表，右侧为任务说明与最近更新，不再互相压住。
- Windows / Linux 兼容说明：
  - 本轮仅修改 Electron 渲染层模板与样式，不依赖平台专属 API。
  - Windows 开发测试与 Linux 打包部署均可共用。

## 2026-05-19 桌面端复刻任务列表补回改名入口

- 目标：
  - 修复桌面端复刻任务列表在后续布局收紧后丢失“修改任务名称”入口的问题。
- 本轮最小改动：
  - 仅在 `src/renderer/src/ui/views/CloneTaskListView.vue` 补回列表页内改名入口和保存弹层。
  - 不改详情页，不改主进程数据结构，不新增共享弹层组件。
- 调整内容：
  - 在每条任务的标题行右侧补回小型编辑图标。
  - 点击后弹出页内“修改任务名称”弹层。
  - 保存时继续复用既有 `window.api.clone.updateProjectMeta(...)` IPC 链路，成功后刷新列表。
  - 改名按钮放在标题区域，不再占用最右侧操作列，避免再次影响列表末列显示。
- 使用说明：
  - 进入桌面端复刻任务列表页。
  - 点击任务标题右侧的编辑图标。
  - 输入新名称并保存后，列表标题会立即更新。
- Windows / Linux 兼容说明：
  - 本轮仅修改 Electron 渲染层交互与样式，依赖既有跨平台 IPC 能力。
  - Windows 开发测试与 Linux 打包部署均可共用。

## 2026-05-19 桌面端复刻任务列表移除默认描述兜底文案

- 目标：
  - 去掉桌面端复刻任务列表中未填写描述时显示的默认说明“从参考视频到成片输出，当前任务正在等待推进。”。
- 本轮最小改动：
  - 仅调整 `src/renderer/src/ui/views/CloneTaskListView.vue` 的描述展示逻辑。
  - 不改任务数据结构，不改详情页，不改主进程逻辑。
- 调整内容：
  - `compactDescription(...)` 在描述为空时不再返回默认兜底文案。
  - 列表中的描述段改为仅在有真实描述内容时才渲染。
- 使用说明：
  - 若任务没有填写描述，列表中将直接隐藏该行说明文字，不再显示默认占位文案。
- Windows / Linux 兼容说明：
  - 本轮仅修改 Electron 渲染层展示逻辑，不依赖平台专属 API。
  - Windows 开发测试与 Linux 打包部署均可共用。

## 2026-05-19 桌面端复刻任务列表增加分组文件夹

## 2026-05-19 脚本变体页空数组脏数据兼容修复

- 目标：
  - 修复桌面端进入脚本变体生成页时，历史任务数据中存在 `null` 数组字段导致页面直接报 `Cannot read properties of null (reading 'length')` 的问题。
- 本轮最小改动：
  - 仅补齐 `/clone` 详情页脚本阶段相关的渲染层数组归一化与项目就地 patch 容错。
  - 不改业务协议，不扩散到无关页面，不重做状态管理。
- 修复内容：
  - `useCloneProjectWorkspace.project.ts` 的项目就地合并逻辑新增数组安全归一化，避免历史数据中的 `null` 列表在 patch 时直接访问 `length`。
  - `CloneView.vue` 中脚本候选、分镜、视频输出、商品图等关键列表统一改为数组安全读取，进入脚本变体页时不再依赖后端字段一定为标准数组。
  - `useCloneProjectWorkspace.shared.ts` 的商品图提取逻辑补充 `null` 容错，避免旧任务在读取商品图绑定时再次触发数组访问异常。
- 使用说明：
  - 旧的本地复刻任务即使历史上写入过 `null` 类型的脚本候选、商品图、分镜或视频输出字段，也应能正常打开脚本变体页。
  - 若任务本身尚未生成脚本候选，页面会保持空态展示，而不是直接报错跳出。
- Windows / Linux 兼容说明：
  - 本轮仅涉及 TypeScript 渲染层与共享 composable 的空值兼容处理，不依赖 Windows 专属能力。
  - Windows 开发测试与 Linux 部署运行逻辑保持一致。

- 目标：
  - 为桌面端复刻任务列表增加真实“分组文件夹”能力，支持把复刻任务提前归到自定义分组中，提升任务查找效率。
- 本轮最小改动：
  - 仅补齐桌面端复刻主进程本地存储、IPC 暴露与 `src/renderer/src/ui/views/CloneTaskListView.vue` 的列表交互。
  - 不扩展到 Web 端，不改复刻详情页主流程，不做拖拽归组和多层嵌套文件夹。
- 调整内容：
  - 复刻任务数据补充 `groupId`、`groupName`。
  - 主进程新增独立分组实体存储，包含 `id`、`name`、`createdAt`、`updatedAt`、`sortOrder`。
  - 主进程新增分组接口：
    - `listCloneGroups`
    - `createCloneGroup`
    - `renameCloneGroup`
    - `removeCloneGroup`
    - `assignCloneProjectsToGroup`
  - 删除分组时不删除任务，原分组下任务自动回退到“未分组”。
  - 桌面端复刻任务列表改为“左侧分组栏 + 中间任务列表 + 右侧轻量摘要”的工作台结构。
  - 左侧分组栏支持：
    - 全部任务
    - 未分组
    - 自定义分组
    - 分组任务数量
    - 新建分组
    - 分组重命名
    - 分组删除
  - 右侧当前分组任务列表继续保留现有搜索、状态筛选、排序、分页和批量导出能力，并且只作用于当前分组视图。
  - 单任务支持从列表行直接“移动到分组”。
  - 批量选择任务后支持一次性“移动到分组”。
  - 任务标题改名入口继续保留在任务名称区域，不与分组操作复用。
- 使用说明：
  - 在桌面端复刻任务列表左侧点击“新建分组”，输入名称后即可创建分组。
  - 点击左侧分组项可切换查看当前分组任务。
  - 点击列表行中的分组按钮可移动单个任务到指定分组。
  - 勾选多个任务后，可在批量操作条中使用“移动到分组”完成批量归组。
  - 删除分组后，原分组任务会自动回到“未分组”，任务本身不会丢失。
- 兼容旧数据说明：
  - 历史未带 `groupId / groupName` 的任务会自动视为“未分组”。
  - 若历史任务指向的分组不存在，会在读取时自动清空失效分组归属，避免脏数据影响列表显示。
- Windows / Linux 兼容说明：
  - 分组数据继续使用现有 Node/Electron 本地存储与 IPC 链路，不依赖 Windows 专属 UI 或路径逻辑。
  - Windows 开发测试与 Linux 打包部署可共用同一套分组结构与接口行为。

## 2026-05-19 桌面端复刻任务列表移除右侧摘要栏

- 目标：
  - 去掉桌面端复刻任务列表右侧“当前筛选 / 任务说明 / 最近更新”摘要栏，避免主任务表被继续压缩导致列表主体显示不完整。
- 本轮最小改动：
  - 仅调整 `src/renderer/src/ui/views/CloneTaskListView.vue` 的页面结构与样式布局。
  - 不改任务数据结构，不改主进程接口，不改分组逻辑。
- 调整内容：
  - 主内容区从“三栏”收口为“左侧分组栏 + 右侧任务列表”两栏。
  - 移除右侧摘要卡、说明卡、最近更新卡及其对应页面依赖。
  - 放宽中间任务列表可用宽度，避免任务表头、操作列、内容区被右侧卡片挤压。
- 使用说明：
  - 桌面端复刻任务列表页将只保留左侧分组栏和右侧任务表。
  - 当前筛选结果直接在主列表区查看，不再额外显示右侧摘要卡。
- Windows / Linux 兼容说明：
  - 本轮仅修改 Electron 渲染层结构与样式，不依赖平台专属 API。
  - Windows 开发测试与 Linux 打包部署均可共用。

## 2026-05-19 桌面端复刻任务列表分组交互改为真实菜单

- 目标：
  - 将分组栏中的文字操作按钮收口为真实“更多操作”下拉菜单。
  - 将任务行中的“移动到分组”从弹层改为轻量下拉选择，减少打断感。
- 本轮最小改动：
  - 仅调整 `src/renderer/src/ui/views/CloneTaskListView.vue` 的分组交互层。
  - 不改主进程接口，不改任务详情页，不改批量移动分组弹层。
- 调整内容：
  - 左侧自定义分组项增加“更多操作”按钮。
  - 点击后显示轻量菜单，菜单项收口为：
    - 重命名
    - 删除
  - 任务行中的分组入口改为就地下拉菜单。
  - 点击目标分组后直接调用归组接口并刷新列表，不再额外弹出单任务分组弹层。
  - 保留批量移动到分组弹层，用于多选任务一次性归组。
  - 点击页面其他区域会自动关闭分组菜单和任务行分组菜单。
- 使用说明：
  - 在左侧分组栏中，点击某个分组右侧“更多”按钮可执行重命名或删除。
  - 在任务行阶段列中，点击当前分组标签可直接展开分组下拉。
  - 选择分组后会立即完成该任务归组。
- Windows / Linux 兼容说明：
  - 本轮仅修改 Electron 渲染层菜单交互与样式，不依赖平台专属 API。
  - Windows 开发测试与 Linux 打包部署均可共用。

## 2026-05-19 桌面端复刻任务列表分组接口缺失兼容兜底

- 目标：
  - 修复桌面端在 preload / 主进程尚未热重载到最新分组 IPC 时，分组创建报错并连带导致任务列表为空的问题。
- 本轮最小改动：
  - 仅调整 `src/renderer/src/ui/views/CloneTaskListView.vue` 的分组接口调用兜底逻辑。
  - 不改主进程接口，不改持久化结构。
- 调整内容：
  - 列表刷新时，先独立拉取任务列表。
  - 若当前运行中的 `window.api.clone` 不存在分组相关方法，则分组栏回退为空分组模式，但任务列表仍正常显示。
  - 新建分组、重命名分组、删除分组、单任务归组、批量归组在接口缺失时，会提示“重启桌面端后再试”，不再抛出 `is not a function` 并打断页面。
- 使用说明：
  - 若看到分组接口缺失提示，说明当前桌面端仍在使用旧 preload 或旧主进程代码。
  - 重启桌面端后，新的分组接口即可生效。
  - 在重启前，原有任务列表、搜索、筛选、分页、打开任务等基础能力仍可继续使用。
- Windows / Linux 兼容说明：
  - 本轮仅为 Electron 渲染层增加运行时兼容判断，不依赖平台专属能力。
  - Windows 开发测试与 Linux 打包部署均可共用。

## 2026-05-19 桌面端复刻任务列表改为顶部横向分组标签

- 目标：
  - 按设计稿将“左侧分组栏 + 右侧列表”结构改为“顶部横向分组标签 + 下方一体化深色任务表”，让分组和列表更像统一工作台。
- 本轮最小改动：
  - 仅调整 `src/renderer/src/ui/views/CloneTaskListView.vue` 的列表页结构与样式。
  - 不改主进程分组接口，不改任务详情页逻辑。
- 调整内容：
  - 分组入口从左侧栏改为顶部横向标签条。
  - 标签条保留：
    - 全部任务
    - 未分组
    - 自定义分组
    - 新建分组
    - 自定义分组更多操作菜单
  - 下方任务区收为一个深色整板表格，表头与数据行落在同一块视觉容器中。
  - 任务行继续保留：
    - 改名
    - 删除
    - 单任务移动到分组
    - 批量移动到分组
  - 视觉方向贴近设计稿：顶部标签、细边框、深色行分隔、一体化工作台表格。
- 使用说明：
  - 在顶部横向标签中切换分组视图。
  - 点击 `新建分组` 可继续创建分组。
  - 点击自定义分组右侧更多按钮，可执行重命名或删除。
  - 在任务行中继续通过“移动到分组”轻量下拉调整归属。
- Windows / Linux 兼容说明：
  - 本轮仅修改 Electron 渲染层模板与样式，不依赖平台专属 API。
  - Windows 开发测试与 Linux 打包部署均可共用。

## 2026-05-19 桌面端复刻任务列表按设计稿高保真重排

- 目标：
  - 将桌面端复刻任务列表按最新设计稿做高保真对齐，统一为更完整的工作台界面。
- 本轮最小改动：
  - 仅调整 `src/renderer/src/ui/views/CloneTaskListView.vue` 的模板与样式。
  - 不改主进程数据结构，不改详情页逻辑，不新增全局共享组件。
- 调整内容：
  - 顶部操作区改为：
    - 页面标题
    - 搜索框
    - 批量导出
    - 自动运行 / 手动运行
    - 新建任务
  - 新增设计稿风格的统计卡区：
    - 全部任务
    - 进行中
    - 已完成
    - 失败任务
    - 草稿箱
  - 统计区右侧补最近更新、素材筛选和筛选按钮样式占位。
  - 分组条继续使用顶部横向标签，并补列表视图 / 网格视图 / 设置工具位。
  - 任务表格继续保留现有交互，但样式收口为更接近设计稿的深色整板表格。
  - 更新时间改为日期与时间两行展示。
  - 行尾操作区补回更多操作按钮，统一为：
    - 打开
    - 删除
    - 更多
  - 分页区调整为更接近设计稿的“总数 + 页码 + 每页条数”结构。
- 使用说明：
  - 现有搜索、筛选、分组切换、改名、删除、单任务归组、批量归组能力继续保留。
  - 页面视觉结构会更接近设计稿中的桌面工作台样式。
- Windows / Linux 兼容说明：
  - 本轮仅修改 Electron 渲染层模板与样式，不依赖平台专属 API。
  - Windows 开发测试与 Linux 打包部署均可共用。

## 2026-05-19 桌面端复刻任务列表视觉细节继续压稿

- 目标：
  - 继续把桌面端复刻任务列表向设计稿做像素级收口，重点压统计卡、表格行高列宽、顶部留白与按钮细节。
- 本轮最小改动：
  - 仅调整 `src/renderer/src/ui/views/CloneTaskListView.vue` 的样式与少量展示结构。
  - 不改主进程逻辑，不改任务数据结构。
- 调整内容：
  - 统计卡补图标头部、字号、内边距、圆角和阴影强度。
  - 顶部标题与页面内容上边距继续压到更接近设计稿。
  - 头部搜索框、筛选按钮、运行模式按钮的圆角、边框和块高统一。
  - 分组工具位补网格图标占位，工具按钮尺寸与圆角统一。
  - 表格表头列宽、任务行高度、缩略图尺寸、标签字号、操作按钮尺寸进一步固定化。
  - 更新时间改为更清晰的双行日期/时间样式。
  - 分页器按钮尺寸、圆角和边框强度继续向设计稿收口。
- 使用说明：
  - 现有任务列表交互不变，只继续提升视觉对齐度。
- Windows / Linux 兼容说明：
  - 本轮仅修改 Electron 渲染层样式，不依赖平台专属 API。
  - Windows 开发测试与 Linux 打包部署均可共用。

## 2026-05-19 桌面端复刻任务列表回拉到参考稿深色体系

- 目标：
  - 修正前一版列表页仍明显偏离参考稿的问题，把多余结构、偏灰紫的大底板和不必要的说明块收回，重新贴近参考稿的深蓝黑工作台。
- 本轮最小改动：
  - 仅调整 `src/renderer/src/ui/views/CloneTaskListView.vue` 的模板和样式。
  - 不改任务数据，不改分组逻辑，不改 IPC。
- 调整内容：
  - 移除参考稿中不存在的中间状态 tab 区。
  - 移除表格上方“全部任务 / 当前共 xx 个任务”说明块。
  - 统计卡区与表格大底板统一回拉到更深的蓝黑色调。
  - 表格表头、数据行、分组条和分页区边框颜色改为更轻、更冷的深色分隔。
  - 顶部搜索、运行模式按钮、分页器、操作按钮圆角和边框强度回拉到更接近参考稿的状态。
  - 表格列宽、行高、缩略图高度、操作按钮间距继续向参考稿收口。
- 使用说明：
  - 现有任务筛选、分组切换、打开、删除、改名、归组能力不变，仅继续贴近设计稿视觉。
- Windows / Linux 兼容说明：
  - 本轮仅修改 Electron 渲染层模板与样式，不依赖平台专属 API。
  - Windows 开发测试与 Linux 打包部署均可共用。

## 2026-05-19 桌面端复刻任务列表按最终稿继续压密度

- 目标：
  - 按最终设计稿继续把列表页压到更扁、更紧、更接近成品工作台的密度。
- 本轮最小改动：
  - 仅调整 `src/renderer/src/ui/views/CloneTaskListView.vue` 的视觉密度与尺寸比例。
  - 不改任务逻辑，不改分组行为，不改主进程接口。
- 调整内容：
  - 统计卡从上下结构改为更接近最终稿的横向紧凑结构。
  - 顶部搜索、批量导出、自动运行、手动运行、新建任务整体块高继续降低。
  - 分组条高度、标签字号、工具按钮尺寸继续贴近最终稿。
  - 表格列宽、缩略图尺寸、行高和操作区宽度继续收口。
  - 分页区高度和底部留白继续压缩，更接近最终稿的贴边感。
- 使用说明：
  - 当前页面仍保留现有搜索、分组切换、改名、删除、归组、分页等交互。
  - 本轮仅继续对齐最终稿的视觉密度。
- Windows / Linux 兼容说明：
  - 本轮仅修改 Electron 渲染层样式，不依赖平台专属 API。
  - Windows 开发测试与 Linux 打包部署均可共用。

## 2026-05-19 桌面端复刻任务列表最终像素校正

- 目标：
  - 对最终设计稿进行最后一轮像素校正，重点处理顶部操作区、统计卡、分组条到表头间距、逐列对齐和按钮边框亮度。
- 本轮最小改动：
  - 仅调整 `src/renderer/src/ui/views/CloneTaskListView.vue` 的样式细节。
  - 不改任务逻辑，不改模板结构，不改主进程能力。
- 调整内容：
  - 顶部搜索、导出、运行模式、新建任务之间的横向间距继续细调。
  - 统计卡图标、标签、数字的相对位置与间隔进一步统一。
  - 分组条与表头之间增加更接近设计稿的过渡间距。
  - 表头与任务行按列继续做左右对齐微调。
  - 操作按钮、筛选按钮、分页器按钮边框亮度继续压低，避免过亮。
- 使用说明：
  - 当前页面能力不变，仅继续贴近最终设计稿的视觉校正。
- Windows / Linux 兼容说明：
  - 本轮仅修改 Electron 渲染层样式，不依赖平台专属 API。
  - Windows 开发测试与 Linux 打包部署均可共用。

## 2026-05-19 桌面端复刻任务列表按对比截图继续回拉

- 目标：
  - 根据“当前页面截图 vs 设计稿截图”的直接对比，继续修正最明显的视觉偏差。
- 本轮最小改动：
  - 仅调整 `src/renderer/src/ui/views/CloneTaskListView.vue` 的样式参数。
  - 不改任务逻辑、不改模板结构、不改主进程能力。
- 调整内容：
  - 统计卡宽高、字号与内部排版继续回拉，避免标题挤成两行。
  - 统计区和主表区的大底板继续去掉偏紫偏灰感，改回更深的蓝黑色。
  - 表格列宽继续收紧，释放右侧操作列显示空间。
  - 分组条、表头、分页区的留白和边界层级继续向设计稿贴近。
- 使用说明：
  - 现有列表功能保持不变，仅继续对齐设计稿视觉。
- Windows / Linux 兼容说明：
  - 本轮仅修改 Electron 渲染层样式，不依赖平台专属 API。
  - Windows 开发测试与 Linux 打包部署均可共用。

## 2026-05-19 桌面端复刻任务列表最终收尾对齐

- 目标：
  - 对顶部统计卡与右侧筛选、表格逐列基线、分组条右上角工具按钮做最后一轮对齐收尾。
- 本轮最小改动：
  - 仅调整 `src/renderer/src/ui/views/CloneTaskListView.vue` 的样式。
  - 不改交互和业务逻辑。
- 调整内容：
  - 统计卡区和右侧筛选控件的纵向中心线继续统一。
  - 表头与数据行按列继续微调左右内边距与文字基线。
  - 分组条右上角列表 / 网格 / 设置按钮尺寸、圆角和右侧位置继续收口。
- 使用说明：
  - 页面能力不变，仅做最终视觉对齐。
- Windows / Linux 兼容说明：
  - 本轮仅修改 Electron 渲染层样式，不依赖平台专属 API。
  - Windows 开发测试与 Linux 打包部署均可共用。

## 2026-05-19 桌面端复刻任务列表分组能力静默降级

- 目标：
  - 修复当前桌面进程仍未加载分组 IPC 时，点击分组入口会弹出兼容提示框，影响列表正常使用的问题。
- 本轮最小改动：
  - 仅调整 `src/renderer/src/ui/views/CloneTaskListView.vue` 的运行时降级策略。
  - 不改主进程接口，不改分组数据结构。
- 调整内容：
  - 分组相关接口若未准备好，不再弹出提示框。
  - 当前进程处于兼容模式时，直接隐藏：
    - 新建分组
    - 单任务移动到分组
  - 任务列表、搜索、筛选、打开、删除、改名等基础能力继续正常使用。
- 使用说明：
  - 若当前桌面端尚未重启到最新分组进程，页面会自动回退为“无分组入口”的兼容模式。
  - 重启桌面端后，分组入口会自动恢复显示。
- Windows / Linux 兼容说明：
  - 本轮仅修改 Electron 渲染层运行时降级逻辑，不依赖平台专属 API。
  - Windows 开发测试与 Linux 打包部署均可共用。

## 2026-05-18 本地最终成片合成去除算力点门禁

- 目标：
  - 修复桌面端执行最终成片合成时，被 Web 平台余额门禁误拦截并提示“算力点不足”的问题。
- 本轮最小改动：
  - 仅调整 `src/main/modules/web-platform/service.ts` 中 `composeFinalVideo` 的封装逻辑。
  - 不改分镜生成、远端视频生成、钱包充值和其它算力点规则。
- 修复内容：
  - 最终成片合成实际走本地 ffmpeg 拼接，不属于远端算力任务。
  - 移除 `compose_final_video` 在 Web 平台封装层中的预扣点检查，不再在合成前调用 `chargeCredits(...)`。
  - 保留项目归属、订阅信息和结果写回逻辑。
- 使用说明：
  - 桌面端重新点击“最终成片合成”后，不会再因为余额为 0 而被本地合成门禁拦截。
  - 若仍然失败，应只会返回真实的本地合成错误，而不是算力点不足。
- 补充说明：
  - 桌面端复刻工作台中的“最终成片合成”按钮现已固定走本地 IPC `clone:composeCloneVideo`。
  - 即使当前桌面端已登录 Web 会话并持有 token，该按钮也不再优先走 Web API 分支，避免再次命中 Web 侧算力点门禁。

## 2026-05-18 视频批量加字幕插件工作台

- 目标：
  - 将 `视频批量加字幕` 从占位式插件页升级为桌面端真实工作台。
  - 按设计稿打通“选择素材 -> 配置字幕 -> 预览效果 -> 批量渲染”闭环。
  - 支持本地上传与现有成片复用，并让字幕增强版成片继续进入 GeeLark 发布可用池。
- 2026-05-18 桌面端实机验收补充：
  - 基于 Electron 实机页面再做一轮视觉收紧，重点修复“首屏过高、底部任务区掉出工作台视口、三栏卡片偏松”的问题。
  - 字幕工作台页面已改为固定工作台高度，主工作区与底部结果区共存于同一桌面视口。
  - 三列区域、步骤条、标题区、预览区和右侧表单控件同步压缩块高、圆角和间距，更接近设计稿中的紧凑深色工作台。
  - 左侧素材列表、右侧样式区、底部任务表和结果区改为各自内部滚动，避免页面整体继续拉长。
- 本轮最小改动：
  - 新增 `video-batch-subtitle` 插件私有任务模型与接口，不改 `/clone` 主链结构。
  - 桌面端新增独立 `VideoBatchSubtitleView.vue`，替换原占位页。
  - 新增主进程批量字幕模块，支持：
    - 本地上传视频
    - 选择已有成片
    - 单标题应用全部
    - 随机标题池
    - AI 批量生成标题
    - 即时预览
    - ASS 烧录生成新成片
  - GeeLark 发布中心候选池新增识别 `batch_subtitle_output` 来源。
- 使用说明：
  - 进入左侧 `插件 -> 视频批量加字幕`。
  - 在左侧选择本地上传或成片库素材。
  - 在右侧配置标题策略、标题内容和样式。
  - 中部实时预览当前视频的字幕效果。
  - 保存配置后执行批量渲染，输出结果会出现在底部结果区。
  - 已成功输出的视频可一键加入 GeeLark 发布可用池。
- 兼容说明：
  - Windows 开发环境下支持中文路径和空格路径。
  - Linux 部署环境继续使用统一 ffmpeg 与字体目录逻辑，不依赖 Windows 分隔符。
  - 字体主推荐 `ttf/otf/ttc`，避免 Linux 下仅依赖 `woff2` 导致命中不稳定。
 - 2026-05-18 渲染闭环补充：
   - 批量字幕导出已将 `fontColor / strokeColor / strokeWidth / shadowColor / shadowBlur / textAlign / position / safeMargin / lineMode` 映射进 ASS 样式，保证预览语义与导出更接近。
   - 随机标题池改为逐视频真实随机抽取，不再按索引轮转。
   - 批量任务改为单条失败不中断整批；成功项继续输出，失败项记录到结果区并展示失败原因。
 - 2026-05-18 字体一致性补充：
   - 批量字幕位图渲染已新增按 `styleConfig.fontName` 解析项目内真实字体资源，不再固定回落到单一默认字体。
   - 当前桌面端可稳定命中的字幕渲染字体链已收口到项目 `resources/fonts` 与系统字体双来源，Windows 开发与 Linux 打包路径保持兼容。
   - 批量字幕的 ASS/libass 真实渲染链已补充运行时常用系统字体并入策略：Windows 开发环境会在字幕临时 `fontsdir` 中自动合并 `Microsoft YaHei / SimHei / SimSun / KaiTi / Arial` 等常用字体，减少因前端选择系统字体但 `fontsdir` 未收录而导致的渲染报错。
   - 样式区“保存为样式预设”已落为本地持久化能力，保存到桌面端 `localStorage`，避免继续出现可点击但无实际效果的假入口。
   - emoji 一致性推进：
     - 批量字幕 overlay 已开始将 emoji 作为独立 run 处理，并优先走固定 SVG 资源混排，不再只依赖系统或字体 fallback。
     - 首轮资源来源为运行时拉取并缓存 `Twemoji SVG` 到本地 `userData/videogenerate/emoji-cache/twemoji-svg`，后续预览和导出复用同一份缓存资源。
     - 当前仍不是最终版 emoji atlas；对复杂 ZWJ 组合、肤色修饰和极少数新 emoji，仍可能回退到字体路径，距离剪映级完全一致还需继续收口。
- 2026-05-18 预览导出稳定性补充：
 - 2026-05-19 页面文案乱码修复：
   - 修复桌面端 `插件 -> 视频批量加字幕` 工作台页头标题与副标题显示为问号的问题。
   - 当前页头文案固定为“视频批量加字幕”和“批量导入素材，实时预览字幕效果并输出可发布成片。”，避免因异常字符落盘导致首屏信息不可读。
  - 批量字幕的 Remotion 预览视频与最终 FFmpeg 封装链路，已补充 `No space left on device` 识别。
  - 当 Windows 开发环境或 Linux 部署环境磁盘空间不足时，页面会优先返回明确中文错误“磁盘空间不足”，不再只暴露长段 FFmpeg tail。
  - 当前预览缓存和中间视频仍写入应用数据目录；若持续高频预览，需定期关注 `userData/.videogenerate/batch-subtitle-preview` 的空间占用。
 - 2026-05-18 Windows 存储目录迁移补充：
   - 为避免 `C` 盘用户目录持续膨胀，桌面端在 Windows 环境下已将 Electron `userData / sessionData / logs` 与项目派生的 `dataDir / db / tmp / cache` 默认根目录迁移到 `E:\\VideoGenerate`。
   - 应用启动时会自动尝试把旧的 `C:\\Users\\Administrator\\AppData\\Roaming\\VideoGenerate` 数据迁移到新目录，尽量保留原有数据库、字体、贴纸、配置和业务数据。
   - 迁移完成后，启动流程会顺带清理旧目录下明显无用的缓存与预览中间文件，包括 `Cache / Code Cache / GPUCache / Dawn* / blob_storage / shared_proto_db / batch-subtitle-preview` 等。
   - Linux 部署环境不受本轮路径迁移影响，仍继续使用环境变量或默认 `userData/.videogenerate` 路径规则。
 - 2026-05-18 TikTok 标题模板补充：
   - 字幕工作台右侧“字体与模板”已补成真实可点击的热门标题预设，不再是静态占位按钮。
   - 当前提供 3 套更贴近热门 TikTok 电商标题的预设：
     - `爆款钩子款`：适合前 3 秒抓停留、反差句式、强情绪钩子。
     - `促单成交款`：适合优惠点、价格利益点、成交导向卖点。
     - `高客单精致款`：适合饰品、美妆、质感单品和偏品牌感素材。
   - 每个预设会同步应用推荐字体、字号、描边、阴影、宽度占比和底部偏移，方便批量生产时快速起稿。
 - 2026-05-18 Remotion 字体与 emoji 一致性补充：
   - 静态标题的 React + Remotion 链路已补充显式字体文件注入，不再只传 `fontFamily` 名称，减少 Chromium 回退到斜体或变量字形导致的“字体发斜”问题。
   - 标题中的 emoji 已改为优先走 Twemoji SVG 图片混排，而不是继续依赖系统字体 fallback，减少预览中显示为黑白符号或异常字形的问题。
   - 当前仍以项目内已有热门安全字体为主，包括 `SimHei / Microsoft YaHei / Noto Sans SC`，优先保证 TikTok 电商标题的可读性、厚重感和跨平台一致性。
 - 2026-05-18 大批量素材队列补充：
   - 当前插件不再以“最多 20 条素材”作为工作台心智限制，前端已切换为大批量队列模式，适配几百条视频连续处理。
   - 本轮不改后端批量渲染主链，不引入高并发导出；渲染仍保持顺序执行，优先保证 Windows 开发机与 Linux 部署环境稳定，避免 CPU / 内存 / 磁盘瞬时打满。
   - 页面素材区改为分页窗口化展示：
     - 首屏仅渲染当前页素材项，默认每页 12 条。
     - 预览区继续只绑定当前选中视频，不会因为导入几百条素材而自动为全部素材生成预览。
     - 底部素材摘要改为展示总条数和当前页范围，避免继续制造“20 条封顶”的误导。
   - 后端批量执行补充为可续跑模式：
     - 再次点击批量渲染时，会自动跳过当前任务中已经成功输出且仍有成片路径的素材项。
     - 已失败项会继续重试，未处理项会接着往后跑，避免上百条任务因为中断或半途失败而整批重头来。
     - 任务进度会基于“已成功项 + 当前处理项”累计计算，更贴近真实大批量排队状态。
   - 后端顺序执行进一步收口为小批次推进：
     - 在保持单条素材顺序渲染的前提下，内部按固定小批次处理并批次写回任务状态。
     - 每个批次结束后会主动让出一次事件循环，减少主进程长时间连续占用带来的卡顿感。
     - 本轮默认批次大小为 `8`，优先保证 Windows 开发机长时间连续跑几百条时更稳，不追求激进吞吐。
   - 任务模型新增内部批次运行时游标：
     - 继续沿用同一个批量字幕任务，不新增新的路由和页面，不拆成多条外显子任务。
     - 在任务内记录当前批次大小、下一批起始索引、总批次数、已完成批次数和最近批次时间戳。
     - 作用是让几百条大任务在中断后恢复时，更准确地从上一次批次位置继续，而不是重新扫描整轮长循环。
   - 工作台已补充批次可视化摘要：
     - 左侧素材队列概览会显示当前任务的批次进度、当前批次范围、剩余条数和每批条数。
     - 底部任务队列会显示每个任务的批次状态摘要，例如当前第几批、总批次数、下一批起始位置或已完成批次数。
     - 保持页面紧凑，不新增额外大卡片，只在现有信息区内补轻量运行态。
   - 工作台升级为可控批量执行：
     - 新增 `暂停任务`：会在当前批次结束后停止继续处理，并将任务状态标记为 `paused`。
     - 新增 `继续任务`：从当前批次游标继续处理未完成项。
     - 新增 `仅重试失败项`：仅对失败输出项重新进入批量执行，不重复渲染已成功素材。
     - 本轮仍采用协作式暂停，不会强杀当前正在运行的单条 FFmpeg / Remotion 进程；优先保证稳定和最小改动。
   - 工作台继续向商用生产线靠拢：
     - 新增任务状态自动轮询：当队列中存在 `queued / processing / paused` 任务时，页面会自动刷新任务与输出状态。
     - 新增队列内直接控制：不必先载入任务，也可在队列行内直接暂停、继续或重试失败项。
     - 新增失败项汇总面板：集中展示失败素材文件名与失败原因，方便快速补跑和排查。
     - 任务队列视觉从横向表格收口为任务卡片列表：
       - 去掉后台式表头和大面积横向对齐。
       - 每个任务改为独立卡片，聚合标题、状态、进度、产出与控制动作。
       - 操作区改为横向轻量按钮组，减少右侧纵向按钮堆叠带来的拥挤和丑陋感。
     - 预览区底部操作条继续收口：
       - 次要动作改为左侧紧凑工具栏式按钮组，不再使用大面积宫格按钮。
       - 主操作只保留一个强 CTA，放在右侧独立强调，避免所有按钮同权导致界面发丑。
     - 主 CTA 点击链路补充稳定性保护：若首次渲染前保存草稿未成功，不再静默无反应，而是明确提示用户当前任务未创建成功。
     - 输出结果区成功项改为优先显示视频预览，不再只显示缩略图封面，避免用户误判“批量渲染只产出图片”。
     - 新上传或新套用素材时，前端会主动解除当前历史任务绑定，避免继续把新素材误写入旧任务上下文或自动回载到历史第一条任务。
     - 点击批量渲染时，会显式把当前草稿中的 `sourceItems` 一并更新回任务，保证实际渲染的就是当前页面上的新视频，而不是旧任务里的历史素材。
   - 快速预览修复：
     - 切换到 `快速预览` 时，前端会立即清空旧的真实视频预览路径，不再错误沿用上一轮 `video` 模式的 mp4。
     - 预览舞台仅在 `真实视频预览` 模式下渲染 `<video>`，快速模式始终优先展示静帧图像，保证模式切换语义明确。
     - 快速预览后端已改为“原视频指定帧 + Remotion 静态字幕图合成”的静帧预览，不再只是原视频抽帧，因此标题和样式修改会立即反映到快速预览图上。
   - 使用说明：
     - 可一次性导入几十到几百条视频素材。
     - 页面编辑和预览只针对当前页与当前选中项，确认样式后可直接整批渲染。
     - 若中途关闭页面、程序重启或部分素材失败，可重新点击同一任务的批量渲染继续补齐剩余项。
     - 若需进一步提升超大批量导出吞吐，后续应继续补“分批提交 / 后台队列调度 / 断点续跑”，本轮先保证页面流畅和机器稳定。

## 2026-05-17 桌面端首页工作台界面优化

- 目标：
  - 让首页更像主工作台，而不是信息堆叠页。
  - 强化首屏主入口、关键统计、最近任务和快捷操作的层级关系。
- 本轮最小改动：
  - 仅调整桌面端 `HomeView.vue`，不改后端接口、不改其他页面业务。
  - 将首页首屏收敛为 Hero 主入口、4 个关键指标卡、最近任务、推荐模板、流程概览和右侧快捷操作。
  - 最近任务卡补充参考视频与成片状态摘要，提升列表可扫读性。
  - 右侧 AI 助手保持轻量入口定位，不扩展为独立聊天工作区。
- 使用说明：
  - 进入首页后，优先看到“新建复刻任务”和“查看任务中心”两个核心入口。
  - 中部可快速判断当前运行中、已完成、异常和总任务数量。
  - 最近任务区用于快速查看主链路推进状态，模板区继续作为复用入口。
  - 若模板真实数据不足，首页会使用静态推荐卡兜底，避免中区出现大面积空白。
- 本轮进一步收紧首屏高度，并将模板卡改为更明确的可点击资源入口，右侧辅助区继续弱化为从属信息列。
- 本轮已按用户最新设计稿将桌面端首页收敛为：左侧品牌导航、顶部搜索与主操作、中部 Hero、指标卡、快速开始、推荐模板，以及右侧快捷操作与 AI 助手。

## 2026-05-17 GeeLark 插件页补齐待发布列表与发布闭环

- 目标：
  - 在 GeeLark 发布中心内直接查看待发布复刻成片，并完成 TikTok 发布提交。
  - 保持 `/clone` 继续只负责复刻生产，发布链路收口到插件页。
- 本轮最小改动：
  - GeeLark 插件页收敛为“插件启用 + API 配置 + 发布账号绑定”设置页。
  - 新增独立 `GeeLark 发布中心` 页面，承接“待发布复刻视频列表 + 发布面板 + 最近任务 + 音乐候选池”工作台。
  - 待发布列表来源于当前用户下已有 `finalOutputPath` 的复刻项目，并按“无发布记录”判定为待发布。
  - 发布表单新增：发布账号、AI 标题/文案、商品 ID、商品展示标题、参考视频 ID、音乐策略、同款音量、原视频音量、AI 标记、分享链接回收。
  - GeeLark 发布请求按仓库内 `Add_video_image_warmup_task.md` 已确认字段透传：`productId`、`productTitle`、`refVideoId`、`sameVideoVolume`、`sourceVideoVolume`、`markAI`、`needShareLink`。
  - 新增 GeeLark 插件页专用接口：
    - 待发布复刻视频列表
    - AI 生成发布标题
    - 本地音乐候选池的增删改查
- 音乐策略说明：
  - 当前仓库未发现 GeeLark 官方“音乐列表/授权音乐搜索”接口文档，因此本轮不对接远端音乐列表。
  - 采用可用降级方案：
    - 本地候选池维护 `label + refVideoId + remark`
    - 发布时优先使用选中的候选项回填 `refVideoId`
    - 也支持手动填写 `refVideoId`
    - 若不提供参考视频 ID，则仍可按音量策略发布
  - 若任务失败命中 `20243 / 20244 / 20252 / 20253`，插件页会提示用户切换候选项或调整音量策略后重发。
- 使用说明：
  - 进入 GeeLark 插件页后，先配置 API 与发布账号。
  - 配置完成后，点击“进入发布中心”打开独立发布工作台。
  - 发布中心中的“待发布复刻视频”只显示当前用户下已生成最终成片且无成功/进行中发布记录的项目。
  - 选择左侧成片后，可在右侧发布面板中：
    - 选择发布账号
    - 点击 AI 生成标题
    - 填写商品 ID / 商品展示标题
    - 选择本地音乐候选项或手动填写参考视频 ID
    - 调整同款音量与原视频音量
    - 提交发布任务
  - 底部最近任务区可回查状态与失败原因。
  - 若当前运行实例尚未热更新到新增接口，发布中心会自动降级：
    - 待发布列表改由 `/clone/projects` + 已有发布任务在前端计算
    - 音乐候选池改用本地 `localStorage`
    - AI 标题生成失败时使用本地标题模板回填
- Windows / Linux 兼容说明：
  - Windows 本地成片路径继续通过统一上传到 GeeLark 临时文件接口，不写死平台分隔符。
  - 发布字段与本地存储逻辑继续使用 Node 跨平台路径处理，保持 Linux 部署兼容。
- 2026-05-17 加载稳定性补充：
  - 修复桌面端 `Geelark 发布中心` 在部分接口无响应或旧实例未完整热更新时，页面可能长期停留在“正在加载发布中心数据”的问题。
  - 处理方式为对待发布候选列表的二次加载继续沿用超时兜底，确保页面能退出加载态并显示本地降级结果或错误提示。
 - 2026-05-17 成片列表显示补充：
   - 修复桌面端 `Geelark 发布中心` 在候选成片实际已返回时，列表仍然不显示的问题。
   - 根因一：首屏 `publish-candidates` 请求未纳入超时保护，请求挂起时页面会一直停留在加载态。
   - 根因二：页面渲染封面时直接调用 `window.api.previewMediaPath`，而当前桌面端预加载层未暴露该方法，导致候选卡片渲染阶段抛错，列表区域整体中断。
   - 处理方式：
     - 首屏候选列表请求统一接入超时与错误兜底，不再无限等待。
     - 页面端对封面预览方法缺失做兼容判断，旧壳层下即使没有预览方法也必须保证列表文本可正常显示。
   - 验证结果：
     - Windows 桌面端实测可退出加载态，并正常渲染待发布成片列表。
     - 本地 Electron 运行态验证 `GeeLark 发布中心` 已显示 `16` 条候选成片。
 - 2026-05-17 成片封面自动生成补充：
   - 修复 `GeeLark 发布中心` 左侧成片列表缺少稳定封面的问题。
   - 当前仓库已具备本地 `ffmpeg` 抽帧缩略图能力，因此本轮不新增依赖，直接复用已有视频缩略图生成模块。
   - 处理方式：
     - 在复刻项目“最终成片”成功产出后，自动从成片视频抽取一帧 JPG 作为封面图。
     - 封面图路径写入项目的 `finalCompose.coverImagePath`。
     - 项目摘要与 GeeLark 待发布候选列表优先使用该封面，而不是继续回退到商品图或视频路径。
   - 使用说明：
     - 该能力对本轮修改之后新生成的最终成片自动生效，无需额外手动操作。
     - 已经历史生成完成、但此前没有封面的项目，不会自动补跑旧数据；如需补封面，可重新触发一次最终成片生成或后续补一个手动回刷入口。
   - Windows / Linux 兼容说明：
   - 封面生成继续走统一 `ffmpeg` 本地能力，不写死平台路径，兼容 Windows 开发环境与 Linux 部署环境。
 - 2026-05-17 GeeLark 发布中心界面继续优化：
   - 目标：让发布中心更像正式工作台，减少“卡片堆叠感”和过强的装饰感。
   - 本轮最小改动：
     - 收紧顶部 Hero 文案与层级，改为更短的工作台标题和辅助说明。
     - 左侧成片列表改为更克制的媒体列表样式，强化封面、标题、成片路径和发布时间的层次。
     - 右侧发布面板、音乐候选池和最近任务统一收敛为更轻量的表单与摘要卡样式。
   - 使用说明：
     - 进入发布中心后，左侧优先浏览待发布成片，右侧直接编辑发布参数。
     - 页面在窄宽度下会自动收敛为单列，保持可用性。
 - 2026-05-17 成片列表分页与性能补充：
   - 修复 `GeeLark 发布中心` 左侧成片列表无法有效滚动、且数据过多时会一次性渲染过多卡片的问题。
   - 处理方式：
     - 左侧成片列表改为分页渲染，每页固定显示少量候选项。
     - 分页切换时只切换当前页的数据，不再把全部候选一次性塞进 DOM。
   - 使用说明：
     - 当待发布成片数量较多时，可通过列表底部翻页按钮查看其它候选。
     - 由于每页只渲染有限数量的视频卡，数量增多时页面卡顿风险明显降低。
 - 2026-05-18 GeeLark 发布中心界面收口补充：
   - 目标：继续修复页面“很奇怪”“大块卡片堆叠感强”的问题，让发布中心更接近正式工作台而不是临时拼装页。
   - 本轮最小改动：
     - 收紧页面外层宽度、顶部 Hero 和工作区间距，减少内容被横向拉散的问题。
     - 左侧成片列表面板改为带上限的固定工作台高度，不再随着视窗无限拉高。
     - 左侧候选卡和右侧“当前选中”摘要统一压薄，减少大封面和大面积空白。
     - 底部音乐候选池、发布记录、提交条和表单分组统一缩小圆角、内边距和块高。
   - 使用说明：

## 2026-05-18 批量字幕切换为 ASR + capcut-mate 导出链

- 目标：
  - 将批量字幕主链从本地 ASS 烧录切换为 `Whisper 兼容 ASR + capcut-mate`。
  - 保留现有手工字幕轨编辑区和 ASS 导出作为回退链路。
  - 让“AI 识别字幕 -> 编辑字幕轨 -> 剪映导出”形成最小闭环。
- 本轮最小改动：
  - 仅调整 `video-batch-subtitle` 插件相关前后端，不改 `/clone` 主工作流。
  - 新增后端外部适配层：
    - `src/main/modules/web-platform/whisperCompatible.ts`
    - `src/main/modules/web-platform/capcutMate.ts`
  - 扩展批量字幕任务模型、API、前端工作台按钮与状态反馈。
- 功能变化：
  - 批量字幕任务新增：
    - `subtitleSource: 'whisper_compatible' | 'manual'`
    - `exportEngine: 'capcut_mate' | 'ass_fallback'`
    - `capcutDraft`
  - 新增接口：
    - `POST /plugins/video-batch-subtitle/jobs/:id/asr`
    - `POST /plugins/video-batch-subtitle/jobs/:id/export-capcut`
  - `POST /plugins/video-batch-subtitle/jobs/:id/run`
    - 默认优先：
      1. 如任务为空轨且来源为 `whisper_compatible`，先调用 ASR 生成字幕轨
      2. 如导出引擎为 `capcut_mate` 且已配置服务地址，则优先走 capcut 导出
      3. 若允许回退且 capcut 失败，则自动退回 ASS 烧录
  - 工作台新增：
    - `AI 识别字幕`
    - `生成剪映成片`
    - 字幕来源切换
    - 导出引擎切换
- 插件配置说明：
  - `video-batch-subtitle` 新增配置项：
    - `whisperBaseUrl`
    - `whisperApiKey`
    - `whisperModel`
    - `capcutMateBaseUrl`
    - `capcutDraftRoot`
    - `capcutExportMode`
    - `requestTimeoutMs`
    - `burnIn`
  - 推荐默认值：
    - `subtitleSource = whisper_compatible`
    - `exportEngine = capcut_mate`
    - `capcutExportMode = draft_and_video`
- 使用说明：
  - 先在插件配置中填写 Whisper 兼容服务和 capcut-mate 服务地址。
  - 进入 `插件 -> 视频批量加字幕`。
  - 选择素材后点击 `AI 识别字幕`，识别结果会进入现有字幕轨编辑区。
  - 如需手工模式，可切换为 `手工字幕轨`，直接编辑时间轴文本。
  - 点击 `生成剪映成片` 可优先走 capcut-mate 导出。
  - 若已开启 `burnIn`，capcut-mate 失败时会自动回退 ASS 导出。
- Windows / Linux 兼容说明：
  - Windows 开发环境下，Whisper 与 capcut-mate 地址使用可配置 URL，不写死本地路径。
  - Linux 部署环境中，任务模型与回退 ASS 链路继续使用 Node 跨平台路径处理。
  - capcut-mate 通常用于 Windows 本地剪映链，Linux 部署若无该服务，可显式切回 `ass_fallback`。
- 验证命令：
  - `npm run typecheck`
     - 桌面端进入 `GeeLark 发布中心` 后，左侧成片区会保持更稳定的面板高度，列表在面板内部滚动。
     - 右侧当前选中摘要改为更轻量的横向信息条，便于把注意力放回发布表单本身。
   - 性能说明：
     - 本轮继续保留分页渲染策略，列表数量变多时仍只渲染当前页，避免首屏卡顿。
 - 2026-05-18 GeeLark 发布中心按设计稿重排：
   - 目标：
     - 让桌面端发布插件页面尽量贴近最新设计稿的工作台结构。
     - 保留现有发布链路和数据接口，只重做视图层级与局部交互。
   - 本轮最小改动：
     - 仅重写桌面端 `GeelarkPublishCenterView.vue` 的模板与样式，不改后端接口协议。
     - 页面结构改为：
       - 顶部工作台 Hero + 三个统计卡 + 刷新按钮
       - 左侧待发布任务列表
       - 右侧发布面板，包含步骤条、成片预览、分步表单和快捷操作区
       - 底部本地音乐候选池与发布记录
     - 新增前端局部交互：
       - 发布步骤切换
       - 发布草稿本地保存
       - 当前成片配置快速导入
     - 继续复用现有发布账号、AI 标题、音乐候选池、发布任务同步等原有能力。
   - 使用说明：
     - 默认先在左侧选择待发布成片。
     - 右侧按“发布内容 / 商品信息 / 策略设置 / 附加选项”逐步填写。
     - 可用“从模板导入”快速复用当前成片的最近配置，也可先保存为草稿。
     - 最后一项步骤会直接提交发布任务。
   - 验证结果：
     - `npm run typecheck` 通过。
     - `npm run build` 通过。
 - 2026-05-18 GeeLark 发布文案语言选择补充：
   - 目标：
     - 支持针对不同国家/地区自由选择发布文案语言，而不是只固定中文。
   - 本轮最小改动：
     - 在桌面端 `GeeLark 发布中心` 的“发布账号与文案”区域新增“文案语言”选择器。
     - 当前支持：
       - 简体中文
       - English
       - Tiếng Việt
       - ไทย
       - Bahasa Indonesia
       - Bahasa Melayu
     - AI 生成标题接口新增前端语言透传，标题生成会按所选语言输出候选文案。
     - 发布草稿会一并保存当前文案语言选择。
   - 使用说明：
     - 选择待发布成片后，可先切换“文案语言”，再点击“AI 生成标题”。
     - 最终提交给 GeeLark 的仍然是 `videoDesc` 文本本身，不额外依赖第三方新增语言字段，因此保持现有发布协议兼容。
   - 验证结果：
     - `npm run typecheck` 通过。
     - `npm run build` 通过。
 - 2026-05-18 GeeLark 标题生成关联商品图补充：
   - 目标：
     - 让发布文案生成不再只围绕成片标题泛化，而是优先参考当前成片绑定的商品图与商品结构信息。
   - 本轮最小改动：
     - 在 `CloneProjectSummary`、`GeeLark` 待发布候选和发布标题接口中补充 `productReferenceImagePaths` 数据链路。
     - 发布中心点击“AI 生成标题”时，会把当前成片绑定的商品图路径一并传到后端。
     - 后端标题生成会优先复用项目已有商品结构分析；若项目还没有结构摘要且已配置 `GRS.AI`，则会基于商品图补做一次轻量商品结构分析，再把结果并入标题 prompt。
     - 若当前环境没有商品结构分析能力，则仍会把商品图数量和文件提示并入 prompt，避免继续生成过于泛化的标题。
   - 使用说明：
     - 先确保当前复刻项目已绑定商品图。
     - 在 `GeeLark 发布中心` 选择待发布成片后，点击“AI 生成标题”。
     - 新生成的标题会优先贴合当前商品，而不是只复述项目名或通用带货文案。
   - 兼容说明：
     - 仅增强标题生成上下文，不修改 GeeLark 第三方发布协议；最终提交字段仍然是原有 `videoDesc`。
     - Windows 开发环境与 Linux 部署环境继续共用同一套路径透传与后端分析逻辑。

## 2026-05-17 桌面端壳层桌面样式回归修复

- 目标：
  - 修复桌面端侧边栏和工作区被全局 compact 样式压缩后，视觉退化成窄栏/类移动端布局的问题。
  - 恢复桌面端首页与工作台壳层的桌面布局密度，不影响小屏断点。
- 本轮最小改动：
  - 仅调整桌面端 `src/renderer/src/ui/MainLayout.vue` 的壳层覆盖样式。
  - 补齐 `src/renderer/src/design-system/layout/MainLayout.vue` 对 `sections` 的透传，保证分组导航仍按当前设计生效。
  - 不改后端接口、不改首页业务数据、不扩展新组件。
- 使用说明：
  - 桌面端重新打开后，左侧品牌导航应恢复为完整宽侧边栏，不再压成窄轨道。
  - 首页主内容区应从侧边栏右侧正常展开，右侧辅助列保持桌面双列结构。
  - 小屏断点仍继续使用现有收缩行为，桌面端优先保持完整信息密度。
  - 若桌面首页出现侧栏过宽或首屏滚动条，本轮继续收紧了桌面侧栏宽度、首页卡片高度和工作区内边距，优先保证首屏完整展示。

## 2026-05-17 Web-Next 插件市场补齐“我的插件”入口闭环

- 目标：
  - 让插件中心从“只能安装”升级为“安装后可以在我的插件里点击使用”。
  - 保持当前插件一期只做入口与状态闭环，不扩展到真实媒体处理执行。
- 本轮最小改动：
  - 保留 `/plugins` 市场页，补充“我的插件”入口与安装成功提示。
  - 新增独立 `/my-plugins` 页面，只显示已安装插件。
  - 新增 3 个插件工作台占位页，作为“使用”按钮的落点。
  - 插件定义、Web API 类型和接口补充 `workspacePath` 与 `GET /plugins/installed`。
- 使用说明：
  - 先在 `/plugins` 安装插件。
  - 安装后进入 `/my-plugins`，可看到已安装插件。
  - 已启用插件可直接点击“使用”进入工作台页。
  - 当前工作台页只展示状态和配置摘要，不执行真实任务。
  - 详见：
    - `docs/requirements-2026-05-17-my-plugins-entry-closure.md`

## 2026-05-17 桌面端插件入口补齐

- 目标：
  - 修复桌面端左侧导航中没有“插件”入口的问题。
  - 让桌面端也能进入插件市场、我的插件和插件工作台闭环。
- 本轮最小改动：
  - 在桌面端 `MainLayout.vue` 补导航入口。
  - 在桌面端 `router/index.ts` 补 `/plugins` 路由。
  - 新增 `PluginsView.vue`，单页承接插件市场、我的插件和工作台三态。
  - 继续复用已有 Web API，不单独复制一套插件后端逻辑。
- 使用说明：
  - 打开桌面端后，可直接从左侧导航进入“插件”。
  - 安装后可在同一页面切到“我的插件”，并继续进入工作台。
  - 当前工作台只完成入口与配置闭环，不执行真实插件任务。
  - 详见：
    - `docs/requirements-2026-05-17-desktop-plugin-entry-fix.md`

## 2026-05-17 桌面端插件内容页按设计稿收敛

- 目标：
  - 将桌面端插件内容页按用户设计稿收敛为深色插件市场布局。
  - 修复插件页“无样式 / 结构散乱 / 文案乱码”问题。
- 本轮最小改动：
  - 仅重写桌面端 `src/renderer/src/ui/views/PluginsView.vue`。
  - 保留现有插件 API 与安装、启用、停用、卸载、配置保存逻辑不变。
  - 保持单页三态结构：插件市场、我的插件、插件工作台。
- 使用说明：
  - 默认进入“插件市场”，顶部显示标题、副标题、搜索框与“我的插件”按钮。
  - 中部按设计稿语义展示分类胶囊、插件卡片栅格和分页占位。
  - 桌面端插件市场默认按高密度卡片栅格展示，一行显示 6 个插件卡片。
  - 安装后进入“我的插件”可继续启用、卸载或点击“使用”进入工作台。
  - 工作台页展示状态、配置摘要和“暂未开放真实执行”说明。
  - 如果本地 Web API 会话失效，页面会先回退到本地预置插件目录，保证市场页仍可渲染。
  - 插件页容器已去掉额外厚重背景，回归系统工作区一致的透明深色底，并补齐页内留白。
- Windows / Linux 兼容说明：
  - 开发测试环境仍为 Windows，部署环境为 Linux。
  - 本轮仅调整桌面端 Vue 页面结构与样式，不写死平台相关文件路径。
  - 插件入口继续通过统一 Web API 获取，保持前后端分离。

## 2026-05-17 桌面端插件菜单顺序调整

- 目标：
  - 将桌面端侧边栏中的“插件”菜单移动到最后，避免处于中间位置。
- 本轮最小改动：
  - 仅调整 `src/renderer/src/ui/MainLayout.vue` 中导航数组顺序。
  - 不修改插件路由、页面逻辑和其他菜单行为。
- 使用说明：
  - 桌面端左侧导航现在按“首页 / 复刻 / 生产 / 切片 / 设置 / 插件”顺序显示。
  - 插件页面入口能力保持不变，只调整展示位置。

## 2026-05-17 桌面端插件菜单分组与设置移除

- 目标：
  - 按设计稿把左侧菜单改成“主菜单 + 插件分组”。
  - 删除左侧导航里的“设置”入口。
- 本轮最小改动：
  - 将 `src/renderer/src/design-system/layout/Sidebar.vue` 增加分组渲染能力。
  - 将桌面端 `MainLayout.vue` 的“插件”改为独立分组，包含“插件市场 / 我的插件”。
  - 删除侧边栏中的“设置”菜单入口，不影响顶部设置按钮与原有设置页路由。
- 使用说明：
  - 左侧先显示首页、模特、复刻、生产、切片。
  - 下方单独显示“插件”分组，突出插件市场与我的插件。
  - 侧边栏不再显示设置入口，若需要进入设置仍可通过其他现有入口进入。
  - 侧边栏导航区现在可滚动，避免底部升级卡片把插件分组挤出可视区。
  - 主菜单采用紧凑列表样式，不再拉伸成大块按钮。

## 2026-05-17 Geelark 云手机发布插件接入

- 目标：
  - 在桌面端插件体系中新增 `Geelark 发布插件`。
  - 打通“复刻成片 -> 选择本地发布账号 -> 绑定云手机 -> 提交 TikTok 发布挂车任务”的最小闭环。
- 本轮最小改动：
  - 新增 Geelark 插件定义、工作台路由与插件市场入口。
  - 新增 Geelark 后端网关、配置存储、发布账号存储、发布记录存储与相关 Web API。
  - 在复刻成片页增加“发布到 Geelark”按钮与弹层提交流程。
  - 保持首期仅支持 TikTok 视频发布，不扩展图集、多平台和批量任务编排。
- 使用说明：
  - 先在插件市场安装并启用 `Geelark 发布插件`。
  - 进入插件工作台填写 `Base URL / App ID / App Secret` 或 `Access Token`。
  - 在插件工作台创建本地发布账号，并绑定 Geelark 云手机。
  - 在复刻成片页生成 `finalOutputPath` 后，点击“发布到 Geelark”。
  - 选择已绑定账号，填写发布文案、商品 ID、商品标题和发布时间后提交。
  - 提交成功后可在 Geelark 插件工作台查看发布记录并手动刷新状态。
- Windows / Linux 兼容说明：
  - Windows 开发环境下直接读取本地成片绝对路径上传到 Geelark。
  - Linux 部署环境同样走标准文件读取与 HTTP 上传，不写死 Windows 路径逻辑。
  - Geelark 请求仅在主进程后端执行，前端不直连第三方接口。

## 2026-05-17 桌面端登录入口切换为手机号登录

- 目标：
  - 让桌面端与插件、Web API 使用同一套登录态。
  - 避免进入桌面端后仍走授权码流程，导致插件保存时提示“登录失效”。
- 本轮最小改动：
  - 将桌面端 `AuthView` 改为手机号验证码登录页。
  - 路由守卫仅校验 Web 登录态，不再使用授权码作为业务页准入条件。
  - 保留底层授权相关代码文件，但不再作为桌面端主入口流程。
- 使用说明：
  - 打开桌面端后，未登录用户会进入手机号登录页。
  - 发送验证码后，输入验证码即可进入桌面端首页。
  - 开发环境若 Web API 返回 `devCode`，登录页会直接显示当前验证码，方便 Windows 本地调试。

## 技术与架构约束

### 分层职责

- `apps/web-next`：Next.js 商业化前端，只负责页面、组件、交互状态与 API 调用装配。
- `services/api`：统一业务后端，负责认证、任务、计费、模型调用与运行时状态。
- 桌面端：保留现有增强能力，但不再作为 Web 商业化主前端。

### 开发要求

- 路径处理必须使用跨平台方式，不允许写死 Windows 专属逻辑。
- 前端不得承载后端业务规则，不把 `services/api` 逻辑搬回页面层。
- UI 改动必须优先遵守统一设计系统，而不是页面各自发挥。
- 新功能与重要重构必须同步补充到 `docs/requirements-*.md`。

## 当前 Web 商业化主前端

当前只推进：

- `apps/web-next`

当前不再继续以下方向作为主实施目标：

- `apps/web`
- Vue Web 旧实现

## 2026-05-16 桌面端爆款视频列表标题与描述精简

- 目标：
  - 爆款视频列表卡片明确显示任务标题与简短描述。
  - 保持首屏信息更聚焦，便于快速扫列表。
- 本轮最小改动：
  - 在桌面端 `CloneTaskListView` 卡片头部下方增加描述文案展示。
  - 描述使用单段精简文案，空描述时给出默认提示。
- 使用说明：
  - 进入桌面端爆款视频列表页后，每张卡片会先展示标题，再展示一行简短描述。
  - 若任务未填写描述，则显示默认说明文案，避免卡片出现信息空洞。
  - 页头区域只保留两行：标题与描述，不再单独显示第三行模式说明。

## 2026-05-16 桌面端爆款视频复刻删除二次确认

- 目标：
  - 列表页删除任务前必须先确认，避免误删。
- 本轮最小改动：
  - 将删除按钮改为先弹出确认提示，再执行删除接口。
  - 保持原有删除流程和加载状态不变。
- 使用说明：
  - 在爆款视频复刻列表点击删除按钮后，先确认提示。
  - 只有在确认后，任务才会真正删除。

## 2026-05-16 桌面端脚本生成标题与描述精简

- 目标：
  - 脚本生成阶段标题更短，描述更聚焦。
  - 辅助状态信息只保留核心字段，减少首屏拥挤。
- 本轮最小改动：
  - 将脚本生成阶段标题收紧为“生成脚本候选”。
  - 将说明文案压缩为一句短描述。
  - 删除辅助栏中的非核心冗余字段，只保留运行模式、当前阶段、候选数、选择状态和商品图数量。
- 使用说明：
  - 进入脚本生成阶段后，顶部标题区会更短更清晰。
  - 辅助信息只显示当前最需要判断的状态。
  - 当前页头只保留两行：标题与描述，不再单独显示第三行状态信息。

## 2026-05-16 桌面端分镜视频标题与描述精简

- 目标：
  - 分镜视频阶段标题和说明更短。
  - 辅助状态栏减少冗余字段，保持首屏更轻。
- 本轮最小改动：
  - 将分镜视频阶段标题收紧为“生成分镜视频”。
  - 将说明文案压缩为一句短描述。
  - 辅助栏只保留运行模式、最终门禁和分镜统计。
- 使用说明：
  - 进入分镜视频阶段后，顶部信息更聚焦。
  - 仍可直接继续生成或进入最终成片。

## 2026-05-16 桌面端成片合成标题与描述精简

- 目标：
  - 成片合成阶段标题和说明更短。
  - 顶部辅助信息只保留门禁与输出状态。
- 本轮最小改动：
  - 将成片合成标题收紧为“最终成片”。
  - 将说明文案压缩为“预览并导出成片”。
  - 辅助栏只保留门禁与状态。
- 使用说明：
  - 进入成片合成阶段后，顶部信息更短、更聚焦。
  - 门禁状态与输出状态仍然清晰可见。

## 2026-05-16 桌面端分镜视频门禁提示收进描述

- 目标：
  - 分镜视频阶段不再单独占用大块门禁提示区。
  - 门禁状态只作为描述后的短后缀展示。
- 本轮最小改动：
  - 将门禁状态拼接到标题描述后面。
  - 移除分镜视频阶段下方的大门禁提示卡。
  - 保留顶部最关键的运行信息与分镜统计。
- 使用说明：
  - 进入分镜视频阶段后，只会看到一行更短的门禁状态。
  - 下面的主工作区会直接进入分镜生成与重试操作。

## 2026-05-16 桌面端各阶段首屏信息统一收紧

- 目标：
  - 脚本生成、分镜视频、成片合成等阶段统一减少首屏占用。
  - 让状态说明尽量贴近标题描述，不再单独占块。
- 本轮最小改动：
  - 删除脚本生成阶段的运行横幅块。
  - 删除分镜视频阶段的大门禁提示块。
  - 删除成片合成阶段的大门禁提示块。
  - 将各阶段辅助信息压缩为短状态标签。
- 使用说明：
  - 进入各阶段后，顶部只保留更短的标题、描述和少量状态。
  - 主要操作区会更靠前显示。

## 2026-05-16 桌面端顶部流程高亮跟随手动切换

- 目标：
  - 点击顶部流程后，高亮样式必须同步变化。
- 本轮最小改动：
  - 顶部流程高亮改为跟随当前可见阶段，而不是只看自动流程步骤。
  - 手动切换阶段后，顶部步骤样式会立即更新。
- 使用说明：
  - 点击顶部任一步骤后，当前页面和高亮都会同步切换。

## 2026-05-16 桌面端成片合成三列布局

- 目标：
  - 成片合成阶段改成三列。
  - 左侧预览，中间分镜片段，右侧导出信息。
- 本轮最小改动：
  - 将合成工作区从两列改为三列。
  - 中间片段区改为按行显示。
  - 右侧只保留导出相关信息面板。
- 使用说明：
  - 进入成片合成阶段后，左侧看预览，中间挑片段，右侧看导出状态。

## 2026-05-16 桌面端成片合成按设计稿重排

- 目标：
  - 成片合成阶段尽量贴近提供的设计稿结构和视觉层级。
- 本轮最小改动：
  - 左侧改为成片预览卡。
  - 中间改为镜头顺序卡，左侧纵向缩略片段，右侧当前片段大预览与提示。
  - 右侧改为导出设置卡。
  - 底部增加小贴士卡片。
- 使用说明：
  - 左侧预览最终成片。
  - 中间选择片段并处理替换。
  - 右侧查看导出信息并执行导出或重新合成。

## 2026-05-16 桌面端成片合成视觉优化与卡顿缓解

- 目标：
  - 让成片合成区更接近产品级质感，同时减少切换和滚动卡顿。
- 本轮最小改动：
  - 统一三列卡片的视觉层级和背景表现。
  - 中间片段缩略区优先使用静态分镜图，减少多视频缩略同时解码。
  - 收紧不必要的悬浮动效，降低重绘压力。
- 使用说明：
  - 成片合成阶段会更稳定，片段列表滚动和切换应更顺。

## 2026-05-16 桌面端顶部流程条与内容区间距收紧

- 目标：
  - 减少顶部流程条和内容区之间的空白。
- 本轮最小改动：
  - 收紧 clone 顶部流程壳层的上下 padding。
  - 收紧成片合成页标题区与内容区之间的首个间距。
- 使用说明：
  - 顶部流程条下方会更贴近内容区，首屏更紧凑。

## 2026-05-16 桌面端成片合成片段操作上移

- 目标：
  - “替换 / 继续查询 / 同步补查”操作进入首屏可见区域。
- 本轮最小改动：
  - 将片段操作按钮从中间列底部移到“镜头顺序”标题右侧。
  - 删除底部重复操作区。
- 使用说明：
  - 进入成片合成后，在镜头顺序头部即可直接执行片段操作。

## 2026-05-16 桌面端成片合成滚动卡顿缓解

- 目标：
  - 缓解成片合成阶段滚动不顺畅的问题。
- 本轮最小改动：
  - 去掉成片合成区高开销的重背景层和多余阴影。
  - 为三列卡片和中间片段滚动区增加局部重绘隔离。
  - 片段缩略图继续优先使用静态图。
  - 页面默认折叠底部运行日志，减少首屏布局压力。
- 使用说明：
  - 进入成片合成后，滚动和切换应更轻一些。

## 2026-05-16 桌面端成片合成按最新设计稿细化

- 目标：
  - 将成片合成阶段进一步贴近当前设计稿结构。
  - 保持首屏信息集中，同时继续降低滚动与切换卡顿。
- 本轮最小改动：
  - 左侧成片预览卡调整为“在文件夹中显示”在前、“播放成片”在后。
  - 中间镜头区改为顶部横向镜头条，下方拆为“镜头预览”和“镜头信息 / 提示”两块。
  - 横向镜头条继续优先使用静态分镜图，避免多视频缩略同时解码。
  - 右侧导出设置继续保留导出信息卡，并维持“导出成片”主按钮与“重新合成”次按钮顺序。
- 使用说明：
  - 进入成片合成后，可先在中间上方横向镜头条切换镜头，再在下方查看当前镜头预览、信息和提示。
  - 左侧用于查看最终成片，右侧用于执行导出和重新合成。

## 2026-05-16 桌面端成片合成滚动性能继续优化

- 目标：
  - 继续降低成片合成页滚动时的卡顿感。
- 本轮最小改动：
  - 主成片预览和当前镜头预览视频改为 `preload=\"none\"`，减少滚动时的媒体元数据预加载压力。
  - 去掉成片合成区多个大容器上的局部布局隔离，避免滚动过程中额外的重排与重绘成本。
  - 横向镜头条卡片背景和悬浮过渡进一步收轻。
  - 收小成片预览区和镜头预览区的默认高度，减少首屏绘制面积。
- 使用说明：
  - 进入成片合成阶段后，滚动时应比上一版更顺，尤其是在镜头较多或视频较大时。
  - 最终成片主预览仍保留视频元数据预加载，以确保时长和进度条可正常显示。

## 2026-05-16 自动模式素材齐备后自动起跑

- 目标：
  - 自动模式不再要求用户在详情页手动点一次“继续自动运行”。
- 本轮最小改动：
  - 在桌面端复刻详情页增加自动起跑监听。
  - 自动模式只有在用户点击“分析脚本”之后，且参考视频、模特、商品图三项都齐备时，才会自动触发后续自动流程。
  - 若三项素材缺一，则不允许自动运行。
  - 同一轮“分析脚本”触发只自动起跑一次，避免重复起跑。
- 使用说明：
  - 自动模式下，先上传参考视频、选择模特、上传商品图，再点击“分析脚本”。
  - 分析成功后，系统会自动进入后续复刻流程。
  - 如果缺少任一素材，即使是自动模式，也不会自动运行。

## 2026-05-16 复刻详情页素材绑定状态修复

- 目标：
  - 修复自动模式下素材上传/选择后的状态串扰问题。
- 本轮最小改动：
  - 修复已有项目中重新上传参考视频时误清空当前项目状态的问题。
  - 新增“仅绑定参考视频”能力，避免在已有项目中上传视频时立刻触发脚本分析。
  - 自动模式自动起跑前，若项目仍未落库参考视频分析结果，会先自动执行参考视频分析绑定。
  - 蓝图未生成前，商品图先保存在前端草稿态；点击“分析脚本”或后续进入脚本阶段时再统一写入项目。
  - 自动流程触发前，将前端响应式数组和字段转换为纯值，再发给 Electron IPC，避免出现“对象不能被复制”。
  - 列表页缩略图增加对参考视频路径的兜底回显。
- 使用说明：
  - 上传商品图后，列表页缩略图不应再长期空白。
  - 上传视频后再选择模特，不应再把当前参考视频显示清空。
  - 上传参考视频本身不会自动分析，只有点击“分析脚本”后才进入分析阶段。
  - 自动模式在素材齐备后会先完成必要的参考视频绑定，再继续自动流程。
  - 自动流程会先完成参考视频蓝图分析，再执行商品图写入，避免首次自动起跑直接失败。
  - 自动流程失败时，界面会优先显示真实错误原因，而不再只显示笼统失败提示。

## 2026-05-15 插件化工具中心一期摘要

- 为避免把“视频解析下载 / 批量加水印 / 批量加字幕”这类工具能力直接塞进 `/clone` 主流程，本轮新增独立插件化工具中心。
- 当前插件化一期只做：
  - 插件注册
  - 安装 / 卸载
  - 启用 / 停用
  - 配置保存
  - Web-Next 页面入口与状态展示
- 当前预置插件：
  - 视频解析下载
  - 视频批量加水印
  - 视频批量加字幕
- 一期定义说明：
  - 安装 = 当前用户可见可用
  - 停用 = 已安装但不可执行
  - 卸载 = 从当前用户工具中心移除，但保留系统内置定义
- 当前阶段不做：
  - 真实媒体处理执行
  - FFmpeg 批处理任务
  - 插件计费与资源隔离
- Web-Next 当前新增独立入口：
  - `/plugins`
- 详见：
  - `docs/requirements-2026-05-15-plugin-center-foundation.md`

### 2026-05-14 分镜图片批量并发优化摘要

- 背景：
  - 分镜图片阶段已做首帧优先、参考图压缩与上传缓存后，剩余主要瓶颈是“批量任务串行执行”。
- 本轮最小变更：
  - 在 `generateAllShotFrames(...)` 内引入 `PQueue`，将批量分镜图片生成改为默认 2 路限流并发。
  - 支持通过 `concurrency` 参数或环境变量 `CLONE_STORYBOARD_FRAME_CONCURRENCY` 调整并发档位，限制范围 `1-3`。
  - 不改页面交互，不改后端接口，不改返回结构。
- 结果：
  - 在保证稳定性的前提下，批量分镜图总体耗时进一步下降。
  - 详细记录见：
    - `docs/requirements-2026-05-14-storyboard-image-concurrency-optimization.md`

## `/clone` 当前 Web 主链路

`/clone` 与 `/clone/[projectId]` 保持以下 5 阶段业务语义：

1. 分析参考视频
2. 脚本变体评分
3. 分镜图片生成
4. 分镜视频生成
5. 合成最终成片

Web 前端只重构视觉层级、布局系统、组件结构与文案体系，不擅自修改后端协议。

## 2026-05-09 Web-Next 当前方向

- `apps/web-next` 已切换到“桌面端主工作台高保真迁移 + Web 定制升级”路线。
- 结构真值来自桌面端 Vue 页面：
  - `src/renderer/src/ui/views/HomeView.vue`
  - `src/renderer/src/ui/views/CloneTaskListView.vue`
  - `src/renderer/src/ui/views/CloneView.vue`
- 页面职责明确为：
  - `/`：总工作台总览
  - `/clone`：复刻任务列表
  - `/clone/[projectId]`：单任务工作台
- 当前视觉基线继续沿用深色高密度专业工作台，但实现框架固定为：
  - React
  - Next.js App Router
  - Tailwind CSS
  - shadcn/ui
- 当前已经完成一轮用户可见中文文案清洗，重点覆盖：
  - 首页
  - `/clone`
  - `/clone/[projectId]`
  - `/account`
  - `/billing`
  - 相关共享组件与工具函数
- Web-Next 当前继续推进“桌面端主工作台高保真迁移”：
  - 左侧工作对象 rail 已成为统一壳层结构的一部分
  - 首页、`/clone`、`/clone/[projectId]` 都需优先对齐桌面端信息分区
  - 不再以自由发挥的 SaaS 首页作为主设计路线

详见：

- `docs/requirements-2026-05-09-web-next-ui-refresh.md`
- `docs/requirements-2026-05-09-web-next-desktop-workspace-migration.md`
- `docs/requirements-2026-05-10-web-next-public-product-site.md`
- `docs/requirements-2026-05-10-web-next-theme-dual-mode.md`

## 2026-05-09 Web-Next 高保真复刻补充

- `apps/web-next` 已按桌面端工作台路线继续重构壳层与主页面。
- 本轮重点统一了以下视觉和布局基线：
  - Sidebar 固定 `240px`
  - Topbar 固定 `72px`
  - 全局根背景统一为 `--bg-root: #060B16`
  - 壳层背景统一为 `--bg-shell: #08111F`
  - 页面标题上限收敛到 `24px`
  - 正文字号统一以 `14px` 为主
- `/`、`/clone`、`/clone/[projectId]` 已切换为固定视口工作台思路：
  - 页面外层不依赖长滚动
  - 列表区、阶段区、运行日志区使用局部滚动
  - Skeleton 用于替代空白等待态
- `/clone/[projectId]` 当前继续保持 5 阶段业务语义：
  1. 分析参考视频
  2. 脚本变体评分
  3. 分镜图片生成
  4. 分镜视频生成
  5. 合成最终成片
- 交互和组件约束：
  - 任务卡统一使用深色卡片样式与 hover 发光描边
  - 进度条统一使用 `linear-gradient(90deg, #6D5DFF, #22D3EE)`
  - 右侧栏保持“弱辅助区”定位，不与主工作区竞争视觉层级
- 使用说明：
  - 本地开发测试环境为 Windows
  - 部署环境为 Linux
  - 页面实现中不得依赖 Windows 专属路径或样式假设
  - `apps/web-next` 保持前后端分离，只消费 API，不回灌业务规则到页面层

## 2026-05-12 `/clone` 列表页设计对齐补充

- `apps/web-next/app/clone/page.tsx` 继续以“最小改动对齐设计稿”为原则，不扩大到 `/clone/[projectId]` 或共享架构重写。
- 列表页首屏继续保持“标题 + 筛选 + 任务网格 + 右侧弱辅助栏”结构，不再在 `/clone` 列表页顶部展示流程导航条。
- `/clone` 页面标题层级收敛到更小字号，避免压缩首屏任务区高度。
- 任务列表在桌面宽度下应优先保持 4 列高密度展示，与设计稿一致；仅在较窄断点下再降到 3 列或 1 列。
- 任务卡样式继续向设计稿收紧：
  - 卡片内边距、正文间距、步骤条高度进一步压缩
  - 封面比例从偏横向大图收敛为更接近设计稿的紧凑缩略图
  - 右侧说明栏与最近切换卡片的 padding、列表间距、缩略图尺寸同步减小
  - 任务卡标题字号、字重、状态标签胶囊样式、底部时间与操作按钮位置继续做像素级对齐
- 使用说明：
  - 本地验证命令：`npm run typecheck:web-next`
  - 验收重点：
    - `/clone` 首屏不再出现顶部流程图
    - 标题视觉尺寸小于此前版本，更接近设计稿
    - 桌面宽屏下任务卡优先展示为 4 列
    - 任务卡高度、封面比例和右侧说明栏密度更接近设计稿

## 2026-05-12 Web-Next `/workspace` 顶栏统一补充

- 本轮继续只处理 `apps/web-next`，不改后端 API 协议。
- 针对 `/workspace` 顶栏与设计稿不一致、且和其他工作台页面风格不统一的问题，公共壳层顶栏已收口为统一结构：
  - 搜索框
  - 新建任务
  - 通知入口
  - 用户入口
- 顶栏中原先偏运营看板风格的状态卡已移除，避免首页头部信息噪音过重，并让 `/workspace` 与其他页面保持同一壳层语言。
- 本轮仍保持：
  - 前后端分离
  - Windows 本地开发与 Linux 部署兼容
  - 最小改动优先，不扩散到无关页面业务逻辑
    - 任务卡标题、状态标签、底部时间和按钮位置更贴近设计稿排布

## 文档维护方式

### 主文档职责

本文档负责：

- 项目总体说明
- 当前有效的架构边界
- 当前主前端与主工作流定义
- 最近的重要版本摘要

### 细分文档职责

详细需求、专题重构和阶段方案写入 `docs/requirements-*.md`，例如：

- `/clone` 流程升级
- Web 商业化基础建设
- Web-Next UI 重构
- 供应商与模型接入修复

### 维护要求

1. 新增功能必须同步更新相关专题文档。
2. 重要重构完成后必须回写本文档摘要。
3. 对已确认的主方向，以新专题文档为准，不继续在旧乱码文档上增量维护。

## 2026-05-15 Web 商业化闭环第一轮摘要

- Web-Next `/clone/[projectId]` 的脚本候选阶段已取消“必须先绑定模特”的强前置，当前只要求已有商品图。
- 分镜图片阶段若缺少模特，页面会直接显示明确提示，不再静默卡住。
- Web 登录已切换为“先发码再登录”，生产环境不再接受固定演示验证码直接登录。
- 生产环境下 clone 生成链路默认禁止 mock 回退，缺少真实模型 Key 时会明确失败。
- `web-platform` 商业数据层已升级为“SQLite 优先、JSON 首次迁移导入、JSON 兜底兼容”模式：
  - 默认正式库文件：`db/web-platform.sqlite`
  - 旧 `db/web-platform.json` 仅作为首次迁移源或 SQLite 不可用时的兜底存储
- `cloneRepo` 也已升级为“SQLite 优先、JSON 首次迁移导入、JSON 兜底兼容”：
  - 默认正式库文件：`db/clone-projects.sqlite`
  - 当前先迁项目元数据与全局模特库索引，不迁视频/图片大文件本体
- `services/api/server.ts` 的数据目录默认值已改为跨平台 `join(process.cwd(), '.videogenerate')`，避免 Linux 下沿用 Windows 路径写法。
- 登录链路已新增 `POST /auth/send-code`，不再鼓励固定验证码直登。
- 开发环境仍可通过开发验证码快速联调；生产环境不再接受固定演示码。
- mock 生成策略已统一收口到环境开关：
  - `VG_APP_ENV=production` 默认禁止 mock
  - `VG_ALLOW_MOCK_GENERATION=false` 可显式禁用 mock
- 支付通道命名已从 `mock_wechat / mock_alipay` 切换到正式口径：
  - `wechat_native`
  - `alipay_native`
- 支付回调已增加 `paymentReference` 校验并保持幂等。
- 详见：
  - `docs/requirements-2026-05-15-web-commercial-closure-round1.md`

## 2026-05-16 Web-Next 页面交互流畅度优化摘要

- 针对 `apps/web-next` 页面点击卡顿问题，本轮优先修复登录态恢复阻塞主流程页面进入的问题。
- 当前改为：
  - 本地已有 token 时先恢复可用登录态
  - 用户资料与订阅信息后台异步补齐
  - token 失效时再回退到登录页
- 同时对公共壳层账户入口、公开页工作台入口补充了非阻塞导航调用，降低点击后的迟滞感。
- 本轮只做前端最小改动，不改后端协议，不扩大到无关页面重构。
- 详见：
  - `docs/requirements-2026-05-16-web-next-interaction-smoothness.md`

## 2026-05-16 Web-Next 主流程性能收紧摘要

- 本轮继续只处理 `apps/web-next` 主流程页，不扩散到无关页面。
- 新增统一导航 hook，用于：
  - 非阻塞路由跳转
  - 主流程页面轻量路由预热
- React Query 默认策略与 clone 主链路查询策略已收紧：
  - 减少短时间重复请求
  - 减少后台标签页无意义轮询
  - 保留详情页必要实时刷新
- 重点覆盖：
  - `/workspace`
  - `/clone`
  - `/clone/[projectId]`
- 详见：
  - `docs/requirements-2026-05-16-web-next-mainflow-performance-tightening.md`

## 2026-05-16 桌面端全局滚动卡顿缓解摘要

- 背景：
  - 用户反馈桌面端多个界面滚动时都有明显掉帧和卡顿，不是单页局部问题。
  - 排查发现主要是共享壳层长期叠加了高开销视觉效果与多层滚动容器：
    - 顶栏 `backdrop-filter`
    - 底部运行日志粘性面板 + 模糊
    - 共享工作区重复 `overflow: auto`
- 本轮最小修复：
  - 共享顶栏移除实时模糊与重阴影兜底。
  - 分镜运行日志面板从 `sticky` 改为普通流式布局，取消日志区平滑滚动。
  - 共享设计系统工作区默认改为 `overflow: hidden`，由实际页面容器接管滚动。
  - 为首页、复刻页、切片页补充统一滚动性能兜底样式，减少多重滚动与重绘。
- 结果：
  - Electron 桌面端滚动时的重绘压力下降。
  - 主页、复刻、切片等共享壳层页面的滚动应更稳定、更顺滑。
- 使用说明：
  - Windows 本地验证命令：`npm run typecheck`
  - 本轮仅修改前端样式和布局层，不改后端协议与任务逻辑。
  - Linux 部署不依赖平台特定能力，保持兼容。
- 详见：
  - `docs/requirements-2026-05-16-desktop-scroll-performance-relief.md`

## 2026-05-16 复刻流程页滚动性能二次收紧摘要

- 背景：
  - 全局壳层减压后，用户继续反馈 `/clone/:projectId` 复刻流程页滚动仍有卡顿感。
  - 排查发现该页自身还保留了页内高频重绘点：
    - 顶部流程条 `sticky`
    - 右侧侧栏 `sticky`
    - 详情页 4 秒轮询导致滚动中频繁刷新
- 本轮最小修复：
  - 复刻流程页顶部流程条取消吸顶。
  - 右侧控制/预览侧栏取消吸顶。
  - 页面主要面板去掉额外模糊。
  - 自动轮询从 `4000ms` 放宽到 `6000ms`，并减少完整 `loadProject` 的触发频率。
- 结果：
  - 复刻详情页滚动时的持续重绘和频繁刷新压力进一步下降。
  - 页面在保持状态更新能力的前提下，滚动手感应更稳定。
- 详见：
  - `docs/requirements-2026-05-16-clone-detail-scroll-performance-tightening.md`

## 2026-05-16 复刻流程条顶部归位摘要

- 背景：
  - 用户明确要求将复刻详情页的 5 步流程条放到顶栏区域，而不是放在页面工作区内容内部。
- 本轮最小修复：
  - 新增轻量 `cloneTopbar` store，用于由复刻详情页向共享顶栏注入步骤数据。
  - `MainLayout` 在 `/clone/:projectId` 路由下，于顶栏搜索区下方渲染流程条。
  - 移除复刻详情页工作区内部原有那条流程条，避免重复显示。
- 结果：
  - 流程条现在真正进入顶栏区域，显示在搜索框和操作按钮下方。
  - 复刻详情页主内容区不再重复显示同一条流程条。

## 2026-05-16 复刻顶栏流程带结构修正与点击修复摘要

- 背景：
  - 用户进一步指出，顶栏流程带应更接近“细长横向导航条”结构，而不是卡片式分段。
  - 同时上一版顶栏流程带存在点击无效问题，只显示状态但不能切换步骤。
- 本轮最小修复：
  - 顶栏流程带改为：
    - 左侧连续步骤导航
    - 右侧状态信息区
  - 新增轻量点击回传机制：
    - 顶栏点击步骤时写入共享 `requestedStageKey`
    - 复刻详情页监听后执行 `selectStage(...)`
- 结果：
  - 顶栏流程带结构更贴近参考图。
  - 流程步骤现在可以正常点击切换，不再是只显示不交互。

## 2026-05-14 模型配置同步修复摘要

- 修复 Web 设置页“只保存到浏览器本地、不写回真实生成配置”的问题。
- `apps/web-next` 新增后端模型凭证读取与保存接口，避免“界面已切模型，但分镜图片仍调用旧模型”。
- 补齐桌面端图片平台 `apifox_hub` 在 `preload` 与 `ipc` 的类型口径，修复开放平台选择异常。
- 图片供应商覆盖逻辑已支持合并 `apifoxHub` 嵌套配置，避免覆盖时丢失 `imageModel / baseUrl / apiKey`。
- 详见：
  - `docs/requirements-2026-05-14-model-credentials-sync-fix.md`

## 2026-05-14 分镜图片性能优化摘要

- 批量分镜图片阶段改为优先只生成首帧，避免当前主链路为每个镜头额外再生成一次尾帧。
- 为七牛公网 URL 转换和 AtlasCloud 参考图上传增加进程内缓存，减少多镜头重复上传相同参考图的耗时。
- 详见：
  - `docs/requirements-2026-05-14-storyboard-image-performance-optimization.md`

## 2026-05-15 桌面设置 AI666 / VectorEngine 保存修复摘要

- 修复桌面端设置页中 `AI666` 与 `VectorEngine` 在能力下拉框中共用同一 `value` 导致的保存冲突问题。
 
## 2026-05-15 桌面正式上线闭环摘要

- 当前桌面端正式上线口径已固定为“Windows 安装包首发 + Linux 生产环境支撑 + 官网下载分发 + 自动更新源”。
- 正式域名职责固定为子域拆分：
  - `www.example.com`
    - 官网、下载页、商业介绍页
  - `api.example.com`
    - Web/API 主业务接口
    - 授权校验、验证码、版本检查接口
  - `update.example.com`
    - Electron 自动更新静态资源
    - 托管 `latest.yml`、`Setup.exe`、`.blockmap`
- 当前发布配置已固定：
  - `package.json` 中 `build.publish.url = https://update.example.com`
  - `production` 环境中 `VG_UPDATE_BASE_URL=https://update.example.com`
- 正式发布顺序固定为：
  1. Windows 本地执行 `npm run setup:fonts`
  2. 执行 `npm run build`
  3. 执行 `npm run dist`
  4. 上传 `release/latest.yml`、`release/*.exe`、`release/*.blockmap` 到更新源站点
  5. Linux 服务器执行 `npm run preflight:production`
  6. 启动 API 与 Web-Next，并验证 `/health`、`/api/health`
- 生产约束继续保持：
  - `VG_APP_ENV=production`
  - `VG_ALLOW_MOCK_GENERATION=false`
  - 必须使用真实 `VG_UPDATE_BASE_URL`
  - Windows 开发、Linux 部署保持同一套跨平台路径与环境变量约束
- 授权与版本检查接口继续复用现有业务站点，不新增 Node 授权服务：
  - `POST /index.php/api/client/verifyLicense`
  - `GET|POST /index.php/api/client/checkUpdate`
- 首发阶段仍只面向 Windows 桌面端，不扩展 macOS / Linux 桌面安装包。
- 若首发时缺少代码签名证书，允许先以“未签名安装包 + 官网分发”方式上线，但必须作为运营风险在上线文档中明确。
- 详见：
  - `docs/requirements-2026-05-15-desktop-production-release.md`
- 改为通过显式平台值和计算属性完成 `provider` 与 `apifoxHubProfile` 的双向映射，不再依赖 `option @click` 临时切换 profile。
- 设置页摘要卡与右侧“当前生效摘要”现已按当前 profile 正确显示 `AI666` 或 `VectorEngine`。
- 详见：
  - `docs/requirements-2026-05-15-desktop-settings-ai666-vectorengine-save-fix.md`

## 2026-05-15 桌面端能力模型独立 profile 修复摘要

- 修复桌面端“能力模型”区域中视频、图片、对话共用一个 `apifoxHubProfile` 导致的联动问题。
- 现已拆分为：
  - `videoApifoxHubProfile`
  - `imageApifoxHubProfile`
  - `chatApifoxHubProfile`
- 实测结果：
  - 视频可设为 `AI666`
  - 图片可单独保持 `VectorEngine`
  - 保存并刷新后不再一起变化
- 已补齐后端视频 / 图片 / 对话链路对旧全局 `apifoxHub` 的残留直读点，避免运行时仍错误读取全局 profile。
- 桌面端补充实测：
  - `视频=AI666 / 图片=VectorEngine` 可独立保存
  - `视频=VectorEngine / 图片=AI666` 可独立保存
  - 配置文件使用加密存储，真实结果以应用读回值为准
- 详见：
  - `docs/requirements-2026-05-15-desktop-capability-profile-separation-fix.md`

## 2026-05-31 AI666 / VectorEngine 视频配置混淆修复

- 目标：
  - 修复用户在设置中将视频平台切到 `AI666` 后，运行日志和实际配置仍表现出 `VectorEngine` 痕迹，导致误判“系统没有按设置使用模型”的问题。
- 本轮最小改动：
  - 调整：
    - `src/renderer/src/ui/views/SettingsView.vue`
    - `src/main/modules/clone/service.ts`
- 生效规则：
  - 设置页保存视频模型配置时，若当前视频 profile 选择的是 `AI666`，但 `AI666 Base URL` 明显仍是 `vectorengine` 域名，则直接阻止保存并提示修正。
  - 若当前视频 profile 选择的是 `VectorEngine`，但 `VectorEngine Base URL` 明显仍是 `ai666` 域名，也直接阻止保存。
  - `/clone` 视频提交链路中的历史 debug 命名不再继续写成 `vectorengine`，统一改为中性的 `apifox-hub` / `apifox video task`，避免与真实 profile 混淆。
  - 下载和缺失 taskId 等错误文案，统一按当前实际生效的 `video profile` 显示 `AI666` 或 `VectorEngine`。
- 使用说明：
  - 若你要使用 `AI666` 视频模型，除了把“视频平台”切到 `AI666`，还必须确认 `AI666 Base URL` 不是 `vectorengine` 地址。
  - 运行日志中的供应商提示应与当前 profile 一致，不应再因为历史命名误导为 `VectorEngine`。

## 2026-05-31 分镜视频远端失败自动重生封顶

- 目标：
  - 修复 `/clone` 分镜视频在远端失败后会反复继续查询、继续处理，无法按用户预期及时止损的问题。
- 生效规则：
  - 当远端视频任务明确失败，系统应自动触发重新生成，而不是一直停留在“继续查询”。
  - 单个分镜视频自动重新生成最多执行 `2` 次。
  - 若自动重新生成 `2` 次后仍失败，则该镜头必须转为终态失败：
    - 不再继续查询
    - 不再继续自动恢复
    - 不再计入待处理 / 待续查分镜
  - 缺少 taskId 但远端仍疑似处理中时，也同样受这条 `2` 次封顶规则约束。
- 使用说明：
  - 超过自动重生上限后，用户需要手动检查：
    - 首尾帧
    - 提示词
    - 商品素材
    - 模型配置
    然后再手动重新生成该镜头。

## 2026-05-15 成片合成时长门禁修复摘要

- 修复复刻项目在“已有分镜视频素材”的情况下，仍因分镜视频时长偏离目标而被最终合成门禁拦截的问题。
- 当前策略调整为：
  - 最终成片合成阶段继续拦截真正不可用素材，例如：
    - 没有可用视频
    - mock 片段
    - 明确失败状态
    - 非时长类生产质检失败
  - 但对“只有时长偏离目标”的已生成分镜视频，不再阻塞最终出片。
- 合成行为保持为：
  - 仍按每个分镜的 `shot.durationSec` 作为目标时长
  - 在合成前通过 FFmpeg `-t` 按复刻分镜时长裁剪已有视频片段
  - 再进入最终拼接
- 结果：
  - 分镜视频只要本身可用，即使原始时长偏长或偏短，也会优先按复刻目标时长裁剪后参与成片合成。

## 2026-05-15 Prompt Consistency SQLite 降级修复摘要

- 修复 Electron 当前 Node 运行时不提供 `node:sqlite` 时，`prompt-consistency` 模块持续输出降级报错噪音的问题。
- 当前策略调整为：
  - 若运行时支持 `node:sqlite`，继续使用本地 `prompt-consistency.sqlite`
  - 若运行时不支持 `node:sqlite`，自动回退为内存编译模式
  - 降级 warning 只输出一次，不再在后续调用中重复刷屏
- 结果：
  - 不影响主流程生成
  - Windows 当前桌面端环境下可稳定使用“内存一致性编译”继续工作

## 2026-05-15 桌面端脚本候选商品图判定修复摘要

- 修复复刻工作台中“商品图已上传并在界面显示，但点击生成候选脚本仍提示请先上传商品图”的问题。
- 当前桌面端脚本候选生成链路改为优先读取项目级已保存商品图：
  - `baseBlueprint.consistencyAssets.productReferenceImages`
  - `blueprint.consistencyAssets.productReferenceImages`
  - 若为空，再回退到各分镜 `shot.productReferenceImagePaths`
- 结果：
  - 只要商品图已成功绑定到当前项目，生成候选脚本不再被错误拦截
  - 与前端 `effectiveProductRefs` 的显示口径保持一致
- 详见：
  - `docs/requirements-2026-05-15-desktop-script-variant-product-image-check-fix.md`

## 2026-05-15 分镜视频临时静默约束摘要

- 按当前需求，分镜视频生成阶段暂时不需要人物说话。
- 本轮最小改动只作用于视频生成 prompt，不改脚本文案、不改字幕、不改图片生成。
- 当前统一在视频 prompt 共享入口增加静默约束：
  - 人物不得开口说话
  - 不做 lip-sync
  - 不生成口播、对白、对镜讲话
- 结果：
  - 所有复用该视频 prompt 链路的供应商都会统一收到“静默表演”限制
  - 不影响分镜图和脚本候选阶段
- 详见：
  - `docs/requirements-2026-05-15-shot-video-no-speaking-rule.md`

## 2026-05-15 全链路静默约束补充摘要

- 当前“人物不说话”限制已从单一分镜视频阶段，扩展为复刻生成相关模块统一约束。
- 本轮补充覆盖：
  - 分镜结构化 prompt
  - GPT 分镜图 prompt
  - Prompt Consistency 编译层
  - 分镜视频 prompt
- 结果：
  - 图片、视频以及一致性编译后的生成提示词都会统一带上“no speaking / no lip-sync / no dialogue”限制
  - 脚本文案内容本身不删改，但生成画面相关链路会统一避免人物呈现说话状态
- 详见：
  - `docs/requirements-2026-05-15-no-speaking-global-rule.md`

## 2026-05-15 分镜视频下载恢复入口修复摘要

- 修复“云端分镜视频实际已生成，但本地下载异常后界面没有继续获取入口”的问题。
- 当前前端“继续查询”入口已扩展到以下状态：
  - `failed`
  - `polling_timeout`
  - `remote_running`
  - `downloading`
  - `remoteStatus = succeeded` 且本地还没有 `videoPath`
- 结果：
  - 当远端任务已经成功、但本地下载未落地时，用户可以直接再次点击“继续查询”重新拉取视频
  - 不必误判为只能“重新生成”
- 详见：
  - `docs/requirements-2026-05-15-shot-video-download-recovery-fix.md`

## 2026-05-15 首页最近任务缩略图补充摘要

- 修复首页“最近任务”列表未正确显示任务缩略图的问题。
- 当前首页任务缩略图已优先读取后端项目摘要里的 `coverAssetPath`，并按以下顺序回退：
  - `coverAssetPath`
  - `finalOutputPath`
  - `previewOutputPath`
  - `referenceVideoPath`
- 结果：
  - 首页最近任务会优先显示真实任务封面
  - 当已有商品图、预览图或最终成片时，不再落回占位图

## 2026-05-15 复刻列表缩略图与单镜 8 秒约束补充

- 列表缩略图回退顺序已补齐到项目摘要层：
  - 优先最终成片
  - 其次预览成片
  - 其次第一张商品参考图
  - 最后参考视频
- 因此当任务尚未上传或生成视频封面时：
  - 若已有商品图，列表与最近更新区默认展示第一张商品图
  - 若没有商品图，继续走原有默认空态图
- 脚本生成与参考视频脚本分析阶段已同步增加“单镜不超过 8 秒”的英文提示词约束：
  - 若某段内容天然超过 8 秒，必须拆成多个连续子镜头
- 本地分段逻辑与结果归一化增加兜底：
  - 分析切段时，任何超过 8 秒的段都会自动拆分
  - 若模型返回的单镜时长仍超过 8 秒，落库前会强制裁到当前镜头起点后 8 秒内
- 使用说明：
  - Windows 本地测试时，直接在 `/clone` 列表查看封面来源是否符合预期
  - 在“分析视频脚本”与“脚本生成”后，检查每个分镜的时长或时间范围，不应超过 `8.0s`
- 验收重点：
  - 有商品图时列表优先显示第一张商品图
  - 无商品图时仍显示默认占位，不出现空白破图
- 脚本分析结果与脚本候选时间范围均不超过 `8.0s`

## 2026-05-15 复刻列表封面优先级与运行日志可见性修复补充

- 修复 `/clone` 列表封面优先级与用户预期不一致的问题：
  - 现改为“有商品图时优先显示第一张商品图”
  - 之后才回退到最终成片、预览成片和参考视频
- 问题背景：
  - 之前列表摘要层把最终成片/预览成片放在商品图前面
  - 导致即使项目已绑定商品图，列表仍可能继续显示旧视频封面，看起来像“没有变化”
- 修复桌面端详情页“运行控制台”看不到主进程调试日志的问题：
  - 之前 `clone-debug / vectorengine-debug / web-platform-debug` 仅输出到 Electron 主进程终端
  - 页面内运行控制台只显示前端手工追加的日志，不显示主进程真实请求链路
  - 现已增加主进程到渲染层的运行日志桥接，详情页可直接看到这些调试日志
- 使用说明：
  - 列表页刷新后，有商品图的任务卡应优先显示第一张商品图
- 打开任务详情页后，再执行分镜图片/分镜视频重新生成，应可在底部“运行控制台”看到主进程实时日志

- 追加修复：
  - 列表页任务卡和最近更新区的封面读取方式，已从 `file:///` 切换为和详情页一致的 `vg://file?path=...`
  - 原因是 Electron 当前环境下，列表页对这类本地图片直接使用 `file:///` 存在显示不稳定或直接不显示的问题
  - 现在商品图、预览图、成片图都统一通过安全协议加载，避免封面路径明明存在但卡片仍显示空白

## 2026-05-15 Prompt Consistency 重新生成静默降级补充

- 继续修复桌面端点击“重新生成”时仍看到 `sqlite unavailable, fallback to in-memory compile only` 的问题。
- 本轮最小变更：
  - `prompt-consistency` 在当前 Electron/Node 运行时不支持 `node:sqlite` 时，改为静默降级
  - 不再在重新生成过程中输出容易被误判为失败的 SQLite warning
  - 保持提示词一致性编译继续在内存中执行，不阻断分镜图片/分镜视频重新生成
- 使用说明：
  - Windows 本地开发测试环境下，若运行时不支持 `node:sqlite`，重新生成会直接走内存编译
  - Linux 若后续运行时支持 `node:sqlite`，仍会自动恢复 SQLite 持久化

## 2026-05-15 单镜分镜图片重新生成链路切换补充

- 修复桌面端“分镜图片点击重新生成看起来没反应，且未走当前图片模型配置”的问题。
- 问题根因：
  - 单镜分镜图片重新生成原先调用的是旧的 `generateShotFrames()` 链路
  - 该链路实际依赖视频能力与首尾帧生成逻辑，不是当前设置页里的图片模型链路
- 本轮最小变更：
  - Web API 的 `regenerateStoryboardImage(...)` 改为调用 `generateGptShotFrames(...)`
  - 桌面端 IPC 分支的单镜重生成也改为调用 `generateGptShotFrames(...)`
  - 统一使用当前图片供应商 / 图片模型 / 图片 API Key 配置
- 结果：
  - 单镜分镜图片重新生成现在会走当前图片模型链路
  - 与批量分镜图片生成保持一致

## 2026-05-15 分镜视频禁字约束补充

- 为分镜视频生成提示词新增英文约束，明确禁止画面中出现任何文字元素。
- 当前补充内容包括：
  - no visible text
  - no titles
  - no subtitles
  - no captions
  - no labels
  - no packaging text
  - no slogans
  - no random letters
  - no typographic elements
- 覆盖范围：
  - 视频主提示词 `buildRealisticPrompt(..., 'video')`
  - 视频兜底负面提示词 `defaultQualityNegativePrompt()`
- 结果：
  - 分镜视频生成时会更强约束不要出现标题、字幕、包装字样或其他任何文字内容

## 2026-05-15 复刻列表缩略图与单镜时长约束补充

- 修复 `/clone` 列表卡片缩略图来源不合理的问题。
- 当前策略调整为：
  - 若项目已上传商品图，列表缩略图优先使用第一张商品参考图
  - 若尚未上传商品图，再退回原有预览/参考视频路径或默认空态
- 同步收紧脚本阶段的单镜时长约束：
  - 整片脚本变体生成提示词新增英文规则：单镜不得超过 8 秒
  - 参考视频脚本分析提示词新增英文规则：反推分析时任何单镜不得超过 8 秒，超长动作必须细拆
  - 本地分镜切分逻辑补充硬约束：任何超过 8 秒的分段会自动拆成多个连续子镜头
- 结果：
  - 列表页缩略图更符合商品导向
  - 分镜脚本和分析阶段都会更稳定地控制单镜时长不超过 8 秒

## 2026-05-15 复刻任务持久化防覆盖修复摘要

- 修复复刻任务在高频创建、后台继续生成或多处异步更新时，偶发只剩 1 条任务的问题。
- 根因是桌面端复刻仓储此前采用：
  - 读取整份 `clone-projects.json`
  - 修改单条任务
  - 再整文件写回
- 当多个异步流程并发执行上述步骤时，后一次写入可能基于旧快照覆盖前一次结果，表现为较早创建的复刻任务“消失”。
- 当前策略调整为：
  - 复刻任务与模特库相关写操作统一进入 `cloneRepo` 进程内串行队列
  - `createProject / upsertProject / removeProject / upsertModelIdentity / deleteModelIdentity`
    都按顺序读取最新文件并落盘
  - 保持现有 JSON 持久化格式不变，避免扩大到全局存储层重构
- 使用说明：
  - Windows 本地开发测试与 Linux 部署都不依赖平台特有行为
  - 复刻任务现在会稳定保存到本地持久化库 `clone-projects.json`
  - 验收时建议连续创建多个复刻任务，并在后台继续生成后刷新列表确认历史任务仍然存在

## 2026-05-13 Prompt Consistency Architecture（SQLite 版）

- 本轮为分镜视频生成链路新增了 `Prompt Consistency Architecture`，目标是降低耳饰、戒指、项链、手链、包、鞋、美妆等高风险商品在视频生成中的产品漂移和结构变异。
- 持久化从“仅项目 JSON 快照”升级为“项目 JSON + SQLite 混合架构”：
  - 项目主数据仍保留 `clone-projects.json`
  - 一致性编译和诊断数据进入 `prompt-consistency.sqlite`
- 新增数据库文件：
  - `getAppPaths().dbDir/prompt-consistency.sqlite`
- 新增后端模块目录：
  - `src/main/modules/clone/prompt-consistency-db`
  - `src/main/modules/clone/prompt-consistency`
- 新增一致性数据表：
  - `pc_rule_sets`
  - `pc_projects`
  - `pc_shot_reports`
  - `pc_shot_anchors`
  - `pc_shot_risk_flags`
  - `pc_shot_patches`
  - `pc_shot_prompt_layers`
  - `pc_compilation_history`
- 分镜视频生成前，系统会执行：
  1. 风险识别
  2. 产品锚点提取
  3. 身份锁生成
  4. 参考图优先级规则生成
  5. Anti-variation patch 生成
  6. Prompt 分层编译
  7. 编译结果写入 SQLite
- 最终 Prompt 固定顺序：
  - `IDENTITY_LAYER`
  - `ANCHOR_LAYER`
  - `CONSISTENCY_LAYER`
  - `SHOT_LAYER`
  - `MOTION_LAYER`
  - `STYLE_LAYER`
  - `NEGATIVE_LAYER`
- 核心原则：
  - 产品身份一致性优先于镜头创意
  - 参考图优先于自由创作 prompt
  - 不重写原始 cinematic prompt，只做 patch 和 layer 增强
  - 不删除镜头逻辑、运镜和构图说明
- 新增查询接口能力：
  - 获取镜头一致性报告
  - 重新编译镜头一致性
  - 获取镜头锚点
  - 获取镜头 patch blocks
- 使用说明：
  - Windows 本地开发无需额外安装数据库服务
  - Linux 部署同样使用本地 SQLite 文件
  - 若分镜视频生成出现商品漂移，可优先调用一致性报告接口查看：
    - 风险等级
    - identity anchors
    - compiled prompt
    - negative prompt
    - consistency patches
- 本地验证命令：
  - `npm run typecheck`
  - `npm run typecheck:api`
  - `npm run typecheck:web-next`

## 2026-05-13 分镜视频生成产品身份锁强化

- 本轮继续只处理分镜视频生成链路，不改页面结构、不改其他阶段协议。
- `src/main/modules/clone/prompt-consistency` 已补强“产品身份锁”提示词约束，适用于分镜视频生成前的最终 prompt 编译。
- 新增最高优先级规则：
  - `STRICT PRODUCT IDENTITY LOCK (HIGHEST PRIORITY)`
  - 明确该任务是 `product replication task`，不是创意生成任务
  - 明确产品必须与参考图集保持 `EXACTLY identical`
- 强化保留项：
  - exact silhouette and outline
  - exact geometry and structure
  - exact proportions and scale
  - exact number of elements and components
  - exact material and reflection behavior
  - exact design details
  - exact accessory type and category
- 强化禁止项：
  - 不允许 redesign
  - 不允许 reinterpret
  - 不允许 improve product
  - 不允许 change shape / thickness / proportions
  - 不允许 add or remove elements
  - 不允许 generate similar but different variations

## 2026-05-14 分镜视频重新生成调用修复

- 本轮只修复“视频复刻工作台里，重新生成分镜视频未真正调用创建视频接口”的主链路问题，不扩散到无关页面和架构。
- 根因定位：分镜视频创建前会先执行 `Prompt Consistency` 编译与 SQLite 持久化；当前 Windows 下的 Electron 运行时不支持 `node:sqlite`，导致流程在发起远端视频请求前就抛错中断，因此日志里看不到创建视频接口请求。
- 修复策略：
  - `src/main/modules/clone/prompt-consistency-db` 增加 SQLite 可用性探测。
  - 当 `node:sqlite` 不可用时，自动降级为“只编译 prompt，不落 SQLite”。
  - 保持产品一致性锁、reference image 优先级、禁止 redesign 等编译规则继续生效，不因降级而跳过 prompt 强化。
- 使用说明：
  - Windows 开发环境下，如果 Electron 未提供 `node:sqlite`，重新生成分镜视频仍会继续调用视频创建接口。
  - Linux 部署环境若具备 `node:sqlite`，则继续使用 SQLite 持久化一致性报告。
  - 若需查看一致性数据库中的历史报告，请在支持 `node:sqlite` 的运行环境下使用。
- 本地验证建议：
  - `npm run typecheck`
  - 在桌面端 `/clone/[projectId]` 点击某个失败分镜的“重新生成”，确认主进程日志不再先报 SQLite 错误，并出现视频创建请求日志。

## 2026-05-14 VectorEngine 图片 base64 结果兼容

- 本轮继续只处理桌面端 `/clone` 主链路，不改页面结构。
- Electron IPC 实测结果：
  - `createDraftProject` 正常
  - `createBlueprint` 正常
  - `generateStoryboardGrids` 阶段不再把 `node:sqlite` 作为当前唯一阻断点
  - 新暴露的问题是 `VectorEngine` 图片接口返回 `b64_json`，但统一图片层原先只识别 URL，导致分镜图阶段报“图片结果为空”
- 修复内容：
  - `src/main/modules/clone/unifiedImage.ts` 增加 `b64_json / base64 / image_base64` 结果提取
  - 当图片接口未返回 URL、但返回 base64 数据时，直接落本地 PNG 文件，不再误判为空结果
- 使用说明：
  - Windows 桌面端重新生成分镜前，请先重启 Electron 主进程，确保加载新的主进程 bundle
  - 若 VectorEngine 图片接口继续返回 base64，本轮已可直接消费
- 验证重点：
  - 分镜图阶段不再因 `b64_json` 被误判为“图片结果为空”
  - 后续链路才能继续进入分镜视频生成与重新生成

## 2026-05-14 VectorEngine 视频模型通道降级重试

- 本轮继续只处理桌面端 `/clone` 的分镜视频生成主链路，不改页面结构与 IPC 协议。
- 复测确认：分镜“重新生成”现在已会真实发起 `VectorEngine /v1/video/create` 请求，不再是“没有请求日志”。
- 新暴露问题：当当前配置模型在云端无可用通道时，接口返回 `503 No available channel for model ...`，导致重试直接失败。
- 修复内容：
  - 文件：`src/main/modules/clone/unifiedVideo.ts`
  - 在 `createVideoTask` 增加模型候选降级重试：
    - 先用当前能力主模型
    - 若返回 `503` 且命中 `No available channel for model`，自动按候选模型继续重试
    - 候选会去重并保留原有 provider / endpointStyle，不改后端协议
- 使用说明：
  - Windows 本地测试和 Linux 部署都会走同一套降级逻辑，无平台专属依赖。
  - 若全部候选模型都无可用通道，仍会明确报错并保留云端返回信息，便于后续排查账号通道。
  - 已追加 `veo_3_1` 作为视频候选模型优先项，用于兼容 `VectorEngine /v1/models` 可见但旧别名不可用的账号配置。
  - 已补充 `veo3.1 / veo3.1-fast / veo3.1-4k / veo3-fast / veo3 / veo2-fast / veo2-pro / veo3-pro` 作为候选模型，用于兼容 `/v1/video/create` 的实际可用命名体系。

## 2026-05-14 VectorEngine 全链路接入

- 本轮将原有 `ai666 / apifox_hub` 聚合供应商对外统一正名为 `VectorEngine`，内部继续保留 `apifoxHub` 配置结构与 `apifox_hub` provider 值，保证历史配置兼容。
- 接入范围覆盖：
  - 对话模型
  - 图片模型
  - 视频模型
- 当前架构仍保持前后端分离：
  - 前端只负责配置输入、展示和 API 调用装配
  - 后端统一模型层负责协议差异、鉴权、任务轮询、结果提取与错误归一化
- 兼容策略：
  - 用户可见文案统一显示 `VectorEngine`
  - 代码与存量数据继续兼容 `apifoxHub / apifox_hub`
  - 不迁移历史本地存储键
- 默认配置收口：
  - 不再使用 `https://api.example.com` 这类示例 Host 作为默认值
  - Windows 本地开发与 Linux 部署均依赖同一套跨平台路径与配置逻辑
- 使用说明：
  - 在设置页填入 `VectorEngine Base URL`、`API Key` 和对应模型名
  - `/clone` 主链路与模特生成链路会通过统一模型层自动消费这些配置
- 验证命令：
  - `npm run typecheck`
  - `npm run typecheck:api`
  - `npm run typecheck:web-next`
  - 不允许 switch to other product styles
- 强化参考图优先级：
  - reference images priority 高于一切 textual descriptions 与 cinematic 指令
  - 若 prompt 与参考图冲突，必须以参考图为准
  - cinematic 不得覆盖 identity
  - silhouette 和 structure 必须始终保持视觉一致
- 使用说明：
  - 本约束在分镜视频生成时由 prompt consistency compiler 自动注入，无需页面额外配置
  - Windows 开发与 Linux 部署均仅涉及 TypeScript 文本编译逻辑，无平台专属依赖
- 本地验证命令：
  - `npm run typecheck`

详见：

- `docs/requirements-2026-05-13-clone-shot-video-product-identity-lock.md`

## 2026-05-13 分镜图片生成产品身份锁同步

- 本轮将与分镜视频相同的强产品约束同步到“分镜图片生成”链路，目标是保证图到视频两阶段使用一致的产品身份锁语义。
- `generateGptShotFrames` 在生成首帧/尾帧前，已显式调用 `promptConsistencyService.compileAndPersist(...)`，并将编译后的 `finalPrompt` 注入图片 prompt。
- 图片链路现在同样继承以下核心原则：
  - `STRICT PRODUCT IDENTITY LOCK (HIGHEST PRIORITY)`
  - `REFERENCE IMAGE PRIORITY`
  - `reference images override all textual descriptions`
  - `if any conflict occurs, follow the reference images, not the prompt`
- 图片链路当前与分镜视频保持一致的保留项：
  - exact silhouette and outline
  - exact geometry and structure
  - exact proportions and scale
  - exact number of elements and components
  - exact material and reflection behavior
  - exact design details
  - exact accessory type and category
- 图片链路当前与分镜视频保持一致的禁止项：
  - 不允许 redesign
  - 不允许 reinterpret
  - 不允许 improve product
  - 不允许 change shape / thickness / proportions
  - 不允许 add or remove elements
  - 不允许 generate similar but different variations
  - 不允许 switch to other product styles
- 图片链路现已优先透传并记录 `compiledNegativePrompt`，用于支持负面提示词的图片提供方。
- 已新增“图片阶段最终 prompt 预览”能力，可读取首帧/尾帧实际使用的正向 prompt、负向 prompt 以及对应的编译结果，便于核对图视频两阶段是否一致。
- 使用说明：
  - 页面层无需额外改动，现有“分镜图片生成”入口保持不变
  - 首尾帧生成将自动复用与分镜视频一致的产品身份锁策略
- 本地验证命令：
  - `npm run typecheck`

详见：

- `docs/requirements-2026-05-13-clone-storyboard-image-product-identity-lock.md`

## 2026-05-09 Web-Next 当前已完成的基础界面结构

- 当前已完成并可访问的页面：
  - `/login`
  - `/`
  - `/clone`
  - `/clone/[projectId]`
  - `/account`
  - `/billing`
  - `/templates`
  - `/models`
  - `/materials`
  - `/live-clips`
  - `/settings`
- 当前统一基础结构：
  - 固定左侧栏 `240px`
  - 固定顶部状态栏 `72px`
  - 全局深色工作台主题与统一卡片、按钮、进度条样式
  - React Query 驱动页面查询与任务变更
  - Session Store 负责登录态、用户、订阅、钱包信息
- 当前主链路功能状态：
  - 登录页已接入 `apiClient.login`
  - `/clone` 已接入任务列表、新建任务、删除任务、搜索筛选、前端分页
  - `/clone/[projectId]` 已接入参考视频分析、商品图上传、模特选择、脚本候选、分镜图片、分镜视频、成片合成相关查询与操作入口
  - `/account` 已接入 `getProfile`
  - `/billing` 已接入套餐列表、订单列表、模拟下单与模拟支付完成
  - `/templates` 已接入模板卡片与基于模板标题的新建任务入口
  - `/models` 已接入 `listCloneModelIdentities`
  - `/materials` 已接入 `listCloneProjects` 的素材聚合展示
  - `/live-clips` 已补基础配置界面与本地持久化
  - `/settings` 已补基础设置中心与本地持久化
- 当前仍需持续精修的范围：
  - 首页与 `/clone/[projectId]` 的视觉密度继续对齐 Stitch 设计稿
  - 少量未被主页面实际引用的旧共享组件仍有历史乱码，后续按引用关系逐步替换，不影响当前主页面运行

## 2026-05-10 Web-Next 功能模块补齐补充

- 本轮继续补齐了左侧导航对应的功能模块页面，避免出现“导航可见但页面不存在”的断层。

## 2026-05-12 Web-Next 设置页桌面端对齐补充

- `apps/web-next/app/settings/page.tsx` 已按用户提供的暗色桌面设计稿进行首屏对齐。
- 页面结构已收敛为：

## 2026-05-12 Web-Next 模特库真实数据与创建补齐

- `apps/web-next/app/models/page.tsx` 已补齐真实模特查询与真实创建闭环。
- `/models` 页面不再以本地假模特作为主数据来源：
  - 列表直接消费 `listCloneModelIdentities`
  - 无数据时展示真实空态
  - 图片仍通过 Web API `/media/file` 访问，兼容 Windows 本地与 Linux 部署
- Web API 已新增 `POST /clone/model-identities`：
  - Web 前端可基于真实复刻项目、商品图和图片供应商配置发起模特生成
  - 后端复用现有 `cloneService.generateModelIdentityPack`，不重复实现业务规则
- 当前 Windows 本地验证方式：
  - `npm run dev`
  - `npm run dev:web-next`
  - `npm run typecheck:web-next`
  - `npm run typecheck`
  - `npm run build:web-next`

## 2026-05-12 Web-Next `/clone` 自动化联调补充

- `apps/web-next` 已新增 `/clone` 主链路浏览器端自动化测试脚本：
  - `test/web-next-clone-flow.e2e.cjs`
- 当前 Windows 本地验证方式：
  - `npm run dev:api`
  - `npm run dev:web-next`
  - `npm run test:web-next-clone-flow`
- 自动化范围覆盖：
  - 登录
  - `/clone` 新建任务
  - `/clone/[projectId]` 参考视频分析
  - 商品图上传
  - 模特选择
  - 脚本候选生成与选择
  - 分镜图片生成
  - 分镜视频生成
  - 最终成片合成
- 本轮仅补齐 `web-next` 的测试锚点和最小可操作入口，不改后端协议。
- Linux 部署兼容性说明：
  - 本轮仍保持前后端分离
  - 仍通过 Web API 协议消费能力
  - 不引入仅适用于 Windows 的路径协议
  - 本轮未做 Linux 部署实测
  - 顶部标题与操作区
  - 顶部四个摘要卡
  - 左侧分类导航
  - 中部模型与通用设置表单
  - 右侧说明与最近状态栏
- 本轮保留的行为：
  - 设置仅保存到当前浏览器本地存储
  - 保留本地读取、保存、重置能力
  - 保留 API Key / Secret Key 的显示切换
- 本轮不改动：
  - 后端接口协议
  - 登录鉴权流程
  - 其他页面布局
- 验证方式：
  - Windows 本地启动 `web-next`
  - 打开 `/settings` 进行桌面端视觉对齐检查
  - 执行 `npm run typecheck:web-next`
- 当前模块完成状态：
  - `模板库`：可查看模板卡片，并直接基于模板标题创建新复刻任务
  - `模特库`：接入现有模型身份接口，展示模特身份、状态、封面和描述
  - `商品素材库`：基于现有任务列表数据聚合展示商品图和分镜数量
  - `直播切片`：已补基础配置页与本地持久化，等待正式直播切片后端协议接入
  - `设置中心`：已补基础设置页与本地持久化，当前不擅自扩展新的服务端设置协议
- 说明：
  - 这轮仍遵守前后端分离原则
  - 有现成后端接口的模块直接接 API
- 没有现成后端协议的模块先提供本地可用配置和明确状态说明，不在前端反向发明一套后端

## 2026-05-12 桌面端 `/clone` 自动复制补充

- 桌面端 Electron + Vue `/clone` 主链路新增“自动继续到分镜视频”能力。
- 自动链路固定顺序为：
  1. 参考视频分析
  2. 一致性素材准备
  3. 脚本候选生成
  4. 自动选择最高分脚本
  5. 分镜图片生成
  6. 分镜视频生成
- 自动终点固定为“分镜视频阶段”，本轮不自动进入最终成片合成。
- 图片与视频均采用固定策略：
  - 每镜头最多自动重试 2 次
  - 超限后保留逐镜头失败原因与重试次数
- 本轮仍严格限定在桌面端主链路，不扩散到 Web-Next。
- 详见：
  - `docs/requirements-2026-05-12-desktop-clone-auto-run.md`

## 2026-05-10 Web-Next 工作台导航与模型配置收口

- 本轮按最新产品要求继续收口了工作台左侧菜单，统一精简为：
  - `首页`
  - `复刻`
  - `模特`
  - `直播`
  - `生产`
  - `会员`
  - `账户`
  - `设置`
- 同时保留“模型配置”能力，但不再额外占用左侧一级导航。
- 当前实现策略：
  - 将“模型配置”收敛到 `设置中心`
  - 在左侧栏项目位空态中提供明确的“模型配置”快捷入口
  - 在设置页中按桌面端思路保留系统级模型接口配置
- 当前 Web 设置中心已补充以下配置分组：
  - 视频模型
  - 图片模型
  - 对话模型
  - 云存储
- 每组配置至少包含以下字段：
  - 供应商
  - Host / Base URL
  - API Key
  - 模型名称
- 云存储配置补充：
  - Bucket
  - 访问域名
  - Access Key
  - Secret Key
  - 上传 Host
  - 资源前缀
- 边界说明：
  - 当前仍不擅自新增服务端设置协议
  - Web 侧模型配置先保存在浏览器本地
  - 字段结构与桌面端设置页保持同源思路，便于后续统一配置源
- 视觉与结构同步调整：
  - 工作台顶部搜索栏文案与状态卡文案清理
  - 左侧底部用户卡文案清理
  - 工作台首页任务卡封面比例、间距和主标题尺寸进一步收紧
  - `生产` 页面继续保留“需客户端”说明，不把本机执行能力伪装成纯 Web 能力
- 验证结果：
  - `npm run build:web-next` 已通过

## 2026-05-10 公开站文案清理与双主题补充

- 本轮继续清理了公开站与工作台高频入口页面中的乱码文案，覆盖：
  - 公开站导航与首页
  - 产品介绍页
  - 定价页
  - 下载页
  - 工作台壳层
  - 登录页
  - 账户页
  - 设置页
- 本轮补齐了双主题切换的使用落地，并将浅色主题从“简单反色”升级为独立浅色体系：
  - 侧栏、顶栏、面板、卡片、输入框、营销页卡片都加入浅色模式专属背景与阴影
  - 公开站与工作台共享主题切换入口，但各自保持独立视觉层级
- 新增专题文档：
  - `docs/requirements-2026-05-10-web-next-theme-dual-mode.md`

## 2026-05-10 工作台入口链路与乱码收口补充

- 本轮继续修复了“点击进入工作台没有反应”的剩余链路问题：
  - 受保护页面统一不再返回空白 `null`
  - 改为显示统一的 `AuthRedirectScreen`
  - 未登录跳转统一携带 `next` 参数
  - 登录成功后优先回跳原目标页，而不是固定跳单一路径
- 本轮同步清理了一批高频页面和壳层中的残留乱码文案，覆盖：
  - 工作台壳层
  - 登录页
  - 工作台首页
  - 账户页
  - 会员结算页
  - 直播切片页
  - 生产中心页
  - 公开站首页
- 这一轮重点目标不是新增协议，而是收口体验稳定性：
  - 降低“点了没反应”的感知
  - 明确跳转过程中的加载反馈
  - 继续保持公开站与工作台分层

## 2026-05-10 Web-Next 模块联动与详情页重写补充

- 本轮已将 `/clone/[projectId]` 从历史乱码页面彻底整页重写，不再继续在旧文件上增量修补。
- 当前任务详情页已补齐并验证通过的联动：
  - `模板库 -> 任务详情`
    - 模板页创建任务后跳转到 `/clone/[projectId]?template=xxx`
    - 详情页展示模板来源提示
  - `模特库 -> 任务详情`
    - 模特页创建任务后跳转到 `/clone/[projectId]?prefillModel=xxx`
    - 详情页会自动消费 query 参数并调用现有模特选择接口完成预绑定
  - `商品素材库 -> 任务详情`
    - 素材页派生任务后跳转到 `/clone/[projectId]?fromProject=xxx`
    - 详情页会读取来源任务的 `productReferenceImagePaths`
    - 再通过现有 `saveCloneProjectProductImages` 接口回填到新任务
- 当前 `/clone/[projectId]` 的结构已进一步固定为：
  - 顶部任务摘要
  - 五阶段导航
  - 左侧阶段主工作区
  - 右侧运行状态、日志、算力流水
- 当前详情页已新增分页与滚动规则修正：
  - 分镜图片阶段支持分页
  - 分镜视频阶段支持分页
  - 成片合成阶段镜头顺序条按分页结果展示
  - 主区保持局部纵向滚动
  - 表格区域保持横向与纵向可滚动
  - 避免出现“无法下滑”“底部被遮挡”“长列表被锁死”的问题
- 当前已新增并接线的前端能力：
  - `useCloneWorkspace` 暴露 `saveProductPathsMutation`
  - 任务详情页可自动处理模板、模特、素材来源 query 参数
  - 模板库、模特库、素材库页面文案已清理为正常中文
- 说明：
  - 本轮仍严格复用现有后端协议
  - 未新增 Web 专属后端接口
  - Windows 开发与 Linux 部署保持兼容

## 2026-05-10 Web-Next 公共壳层与设置模块清理补充

- 本轮继续清理了当前高频入口中的历史乱码和半成品页面，重点覆盖：
  - `apps/web-next/components/app/app-shell.tsx`
  - `apps/web-next/components/clone/clone-stage-nav.tsx`
  - `apps/web-next/app/settings/page.tsx`
  - `apps/web-next/app/live-clips/page.tsx`
- 当前已完成：
  - 左侧固定导航文案恢复为正常中文
  - 顶部状态栏 GPU / API 状态文案恢复为正常中文
  - 设置中心表单与说明文案恢复为正常中文
  - 直播切片配置页恢复为正常中文并保持本地持久化
- 使用说明：
  - 当前设置中心仍以本地配置为主
  - 当前直播切片仍为基础配置模块，等待正式后端协议接入

## 2026-05-10 设置中心行为接线补充

- 本轮设置中心不再只是“可保存页面”，已开始影响实际工作台行为。
- 当前已接入生效的设置项：
  - `API 基地址`
    - 通过 `apps/web-next/lib/app-settings.ts` 本地持久化
    - `apps/web-next/lib/api-client.ts` 读取本地配置后优先覆盖默认 API 地址
  - `默认语言`
    - 新建复刻任务时通过 `useCloneTaskList` 写入 `createCloneProject` 的 `locale`
    - 参考视频分析时通过 `useCloneWorkspace` 写入 `analyzeCloneReference` 的 `locale`
  - `默认脚本数量`
    - 进入 `/clone/[projectId]` 后作为 `variantCount` 初始值
  - `自动刷新任务与运行状态`
    - 进入 `/clone/[projectId]` 后作为 `polling` 初始值
  - `默认输出目录`
    - 进入 `/clone/[projectId]` 后作为成片合成输出目录初始值
- 说明：
  - 本轮仍未发明新的后端设置协议
  - 设置项通过本地持久化驱动前端行为，符合当前前后端边界

## 2026-05-09 `/clone/[projectId]` 阶段页重写补充

- 任务详情页已从旧乱码页面重写为干净中文阶段工作台。
- 当前统一结构为：
  - 顶部任务摘要
  - 五阶段导航
  - 左侧阶段主面板
  - 右侧运行状态与运行日志
- 当前已落实的阶段对齐情况：
  - 参考分析：完成高密度重写
  - 脚本生成：完成按设计稿三栏重写
  - 分镜设计：完成按设计稿工作台重写
  - 分镜视频：完成按设计稿工作台重写
  - 最终成片：完成按设计稿工作台重写
- 滚动策略已调整为：
  - 页面本身允许继续向下滚动
  - 不再把主工作区锁死成无法下滑的固定面板
  - 右侧日志区单独局部滚动
- 当前已补齐的前端工作流交互：
  - 阶段导航支持点击切换
  - 各阶段支持上一步 / 下一步串联
  - 用户可在前端先完整浏览五阶段结构，再逐步替换为更强的后端状态同步
- 当前阶段页已增加数据驱动阶段推导：
  - 存在脚本候选时优先落到脚本阶段
  - 存在分镜图时优先落到分镜设计
  - 存在分镜视频时优先落到分镜视频
  - 存在成片输出时优先落到成片合成
- 当前 `/clone/[projectId]` 已补齐的主要功能入口：
  - 参考视频上传与分析
  - 商品图上传
  - 模特选择
  - 脚本候选生成与选择
  - 分镜图片批量生成与单镜头重生
  - 分镜锁定 / 解锁
  - 分镜视频批量生成、状态同步、单镜头重生
  - 最终成片合成
- 当前 `/clone/[projectId]` 已继续补齐的后端接口能力：
  - 项目阶段写回接口，前端阶段切换不再只依赖 `localStorage`
  - 镜头编辑接口扩展，支持更多分镜基础字段
  - 镜头新增接口
  - 镜头删除接口
  - 镜头顺序保存接口
- 使用说明：
  - Web 前端通过 `src/shared/web-api/client.ts` 统一调用这些接口
  - 本地测试环境仍为 Windows
  - Linux 部署不依赖 Windows 路径语义
- 使用说明：
  - Windows 本地开发时按 `npm run typecheck:web-next`、`npm run build:web-next` 验证
  - Linux 部署不依赖 Windows 路径语义
  - 页面只消费现有 API，不修改后端协议

## 2026-05-10 Web-Next 公开产品站与客户端下载引导补充

- `apps/web-next` 已拆分为两层入口：
  - 公开产品站：
    - `/`
    - `/product`
    - `/pricing`
    - `/download`
  - 登录后工作台：
    - `/login`
    - `/clone`
    - `/clone/[projectId]`
    - `/templates`
    - `/models`
    - `/materials`
    - `/live-clips`
    - `/production`
    - `/settings`
    - `/billing`
    - `/account`
- 公开产品站不复用 `AppShell`，改为独立营销壳层，统一承接：
  - 产品价值表达
  - SaaS 定价说明
  - 桌面客户端下载转化
- 登录后工作台继续保持工具属性，不把公开叙事混进任务台。
- `直播切片` 与 `生产中心` 已补齐“需客户端”边界：
  - 左侧菜单显示 `需客户端` 标签
  - 页面头部显示固定说明卡
  - 明确依赖本机 GPU、本地文件系统与桌面客户端环境
  - Web 页面仅保留配置、说明、任务协同与下载入口
- Web 侧已补齐桌面客户端下载轻量封装：
  - `DesktopReleaseItem`
  - `DesktopReleaseInfo`
  - `getDesktopLatestRelease()`
  - `listDesktopReleases()`
- `/download` 已接入桌面版本查询回退逻辑：
  - 优先尝试现有客户端检查更新接口
  - 接口不可用时回退展示本地版本参考与空状态
- `/pricing` 当前复用 `listPlans()` 作为动态套餐数据来源：
  - 若接口可用则展示动态状态
  - 若接口不可用则回退为静态公开定价展示
- `/login`、`/billing`、`/live-clips` 已同步收口：
  - 清理旧的工作台混杂文案
  - 明确各自职责边界
  - 避免用户误解桌面端执行能力为 Web 可直接运行

## 2026-05-10 Web-Next 入口层与详情页中文收口补充

- 本轮继续对 `apps/web-next` 做入口层和高频工作台页面收口，重点不是新增协议，而是解决历史乱码和工作台主链路观感不稳定的问题。
- 当前已完成：
  - 公开营销首页 `/` 整页文案重写为正常中文
  - `components/marketing/marketing-shell.tsx` 导航与 CTA 文案清理
  - `components/app/app-shell.tsx` 左侧菜单、顶部搜索、状态卡、底部用户卡文案清理
  - `app/workspace/page.tsx` 工作台首页 Hero、最近任务、推荐模板整页中文重写
  - `components/clone/clone-stage-nav.tsx` 五阶段导航文案清理
  - `app/clone/[projectId]/page.tsx` 整页中文重写，覆盖：
    - 顶部任务摘要
    - 五阶段标题与说明
    - 右侧运行状态、日志、算力流水
    - 分镜表格列头
    - 弹窗、按钮、分页、空状态
- 本轮同时修正：
  - `/clone/[projectId]` 未登录时不再返回空白，统一显示 `AuthRedirectScreen`
  - 详情页继续保持局部滚动、表格滚动和分页结构，不回退到长页锁死布局
- 验证结果：
  - `npm run build:web-next` 已通过

## 2026-05-10 `/clone` 列表页版式重排补充

- 本轮继续按最新设计稿重排了 `apps/web-next/app/clone/page.tsx`，不再沿用旧的普通表格列表页。
- 当前 `/clone` 已切换为更接近桌面端工作台的结构：
  - 顶部标题区 + 批量导出 / 新建任务
  - 五张统计概览卡
  - 左侧主任务列表工作区
  - 右侧任务说明与最近切换栏
- 当前列表行已按设计稿式结构重排为：
  - 封面缩略图
  - 标题、模特、素材摘要
  - 五阶段进度节点
  - 进度条
  - 更新时间
  - 快捷进入按钮
- 当前筛选与翻页区已调整为：
  - 顶部状态筛选 Tab
  - 右侧搜索框与筛选入口按钮
  - 底部分页按钮与每页条数展示
- 说明：
  - 本轮仍严格复用现有任务列表接口
  - 不新增 Web 专属后端协议
  - Windows 开发与 Linux 部署保持兼容
- 验证结果：
  - `npm run build:web-next` 已通过

## 2026-05-10 会员中心设计稿重排补充

- 本轮对 `apps/web-next/app/billing/page.tsx` 进行了整页重写，不再在历史乱码页面上做局部修补。
- 新的会员中心页面已按“概览头图 + 权益侧栏 + 套餐 / 订单 / 使用统计”结构重排，继续保持工作台内页属性。
- 当前保留并复用的接口边界：
  - `listPlans()`
  - `listOrders()`
  - `createOrder()`
  - `payMockOrder()`
- 页面实现说明：
  - 顶部展示当前套餐、到期时间、月度额度、剩余算力、累计消费
  - 中部增加会员权益、待支付提示、模拟支付反馈
  - 下部以标签页形式组织套餐选择、我的订单、使用统计
  - 算力补充包保留在同页中，继续走现有下单接口
- 样式说明：
  - 新增会员中心专属样式组，覆盖深色与浅色双主题
  - 浅色主题不是简单反色，而是独立的卡片背景、描边和层次阴影
- 开发约束保持不变：
  - 前后端分离
  - 不新增计费后端协议
  - Windows 开发和 Linux 部署兼容

## 2026-05-10 Hermes 独立自动编程代理接入

- 本轮新增了一套独立于业务代码之外的 Hermes 自动编程代理控制器，不把 Agent 逻辑塞进 `apps/web-next`、`services/api` 或 Electron 主进程。
- 当前新增内容：
  - `scripts/hermes-agent-runner.mjs`
  - `automation/hermes-agent/config.example.json`
  - `automation/hermes-agent/task.example.json`
  - `automation/hermes-agent/README.md`
  - `docs/requirements-2026-05-10-hermes-autocoder-agent.md`
- 当前能力边界：
  - 通过 WSL2 启动 Hermes Gateway
  - 校验仓库写入白名单
  - 校验必读文档
  - 校验命令白名单
  - 拉起本地 API / Web 开发服务
  - 执行健康检查与验收命令
  - 输出 JSON 报告
- 当前仍不直接实现：
  - 业务 API 内嵌 Agent
  - Linux 正式部署自动化
  - 当前仓库外写入
- 使用说明：
  - 环境检查：`npm run hermes:doctor`
  - 执行任务：`npm run hermes:run`
- 本地私有配置建议复制 `automation/hermes-agent/config.example.json` 为 `config.local.json`

## 2026-05-10 Web-Next 工作台稳态修复补充

- 本轮继续只处理 `apps/web-next`，不改后端 API 协议。
- 当前已完成的高价值修复：
  - 清理 `AppShell`、登录页、工作台首页、`/clone` 列表页中的高频乱码文案
  - 去掉工作台顶栏中伪造的 `GPU` 在线数、`API 健康度`、通知数量等假运营指标
  - 顶栏状态改为展示真实可解释的前端信息：
    - 当前会员状态
    - 当前 API 地址来源
  - 修复 `SessionBootstrap` 过早 `markReady()` 的问题，避免有 token 但资料尚未恢复时受保护页误跳登录
  - 公开站“进入工作台”入口补齐 `next=/workspace`，避免已登录和未登录场景跳转不一致
  - `/clone` 列表页恢复真实可点的删除入口，并补充删除中的加载反馈
- 使用说明：
  - 仍保持 Windows 本地开发、Linux 部署兼容
  - 仍保持前后端分离，页面只消费现有 API
- 验证命令继续使用：
  - `npm run typecheck:web-next`
  - `npm run build:web-next`

## 2026-05-11 Web-Next 第三轮页面稳态补丁

- 本轮继续只处理 `apps/web-next`，不改后端 API 协议，也不处理 Hermes 浏览器无法找到 Chrome 的外部问题。
- 本轮重点覆盖页面：
  - `/models`
  - `/live-clips`
  - `/production`
  - `/settings`
  - `/account`
  - `/billing`
  - `/pricing`
  - `/download`
  - `/workspace`
  - 以及已有联动页面 `templates`、`materials`
- 当前已完成的收口：
  - 新增 `components/app/protected-page-gate.tsx`
  - 将多处仍停留在 `ready / authed / redirecting` 直接分支判断的页面统一为“会话恢复中 + 跳登录”两段式门禁
  - 为账户、会员、模特、模板、素材等页面补齐更一致的加载态、错误态、空状态
  - 清理几个明显的占位或死路按钮：
    - `模特库` 的“导入模特”改为进入设置中心
    - `模特库` 的“编辑信息 / 添加标签”改为明确说明当前协议边界
    - `直播切片`、`生产中心` 增加到客户端下载和任务中心的明确下一步入口
    - `下载页` 增加套餐说明入口，并对“有版本但无下载链接”场景补充说明
  - `templates`、`materials` 不再在未恢复或未登录时直接返回空白 `null`
- 使用说明：
  - Windows 本地开发测试继续执行：
    - `npm run typecheck:web-next`
    - `npm run build:web-next`
  - Linux 部署不依赖 Windows 路径语义
  - 当前设置、直播切片和生产页仍遵守前后端分离边界：
    - Web 负责配置、说明、查询与协同
    - 桌面客户端负责本机执行能力

## 2026-05-11 `/clone` 列表任务卡片化补充

- 本轮继续只处理 `apps/web-next`，不改后端 API 协议。
- `apps/web-next/app/clone/page.tsx` 已将任务列表主区域从“表头 + 横向行列”结构调整为纵向堆叠任务卡片。
- 当前每张任务卡保留并展示：
  - 打开任务
  - 删除任务
  - 阶段标签
  - 进度百分比与进度条
  - 更新时间
  - 封面缩略图
  - 标题、描述、参考视频、模特、错误摘要
- 保留不变的能力：
  - 搜索筛选
  - 状态筛选
  - 前端分页
  - 鉴权与会话恢复
  - 新建与删除 mutation
- 新增专题文档：
  - `docs/requirements-2026-05-11-web-next-clone-task-cards.md`

## 2026-05-11 `/clone` 列表页 rail 重排与壳层减重补充

- 本轮继续只处理 `apps/web-next`，不改后端 API 协议。
- `/clone` 列表页继续从“普通任务卡列表”收口为更接近设计稿的任务编排工作区：
  - 中间为任务卡片主区
  - 右侧为独立任务说明 rail
  - 不再把说明信息压在列表底部
- 当前任务卡已进一步重构为三段式结构：
  - 当前阶段
  - 进度编排
  - 素材概览
- 当前壳层已同步减重：
  - 左侧导航更窄
  - 顶部状态条更轻
  - 页面标题区收紧为必要标题、筛选和操作
- 当前保持不变的边界：
  - 不修改后端接口契约
  - 保留任务列表、新建、删除、分页和鉴权逻辑
  - Windows 开发与 Linux 部署继续兼容
- 新增专题文档：
  - `docs/requirements-2026-05-11-web-next-clone-list-rail-refresh.md`

## 2026-05-11 `/clone` 爆款复刻列表页设计稿对齐补充

- 本轮继续只处理 `apps/web-next`，不改后端 API 协议。
- `/clone` 内容区域已按当前设计稿重排为：
  - 左侧主任务区
  - 右侧独立任务说明 rail
- 当前主任务区已对齐为更接近设计稿的卡片式工作区：
  - 顶部标题区 + 批量导出 + 新建任务
  - 状态筛选标签
  - 更新时间排序与视图切换
  - 两列任务卡片网格
  - 底部分页与任务统计
- 当前任务卡继续保留并强化以下信息：
  - 封面缩略图
  - 当前阶段
  - 任务标题
  - 模板、模特、素材摘要
  - 进度百分比与进度条
  - 五阶段步骤条
  - 更新时间
  - 打开任务与删除任务操作
- 右侧 rail 当前只承接：
  - 任务说明
  - 后台持续运行提示
  - 详情页职责提示
  - 最近切换入口
- 使用说明：
  - 本地验证命令继续使用 `npm run typecheck:web-next`
  - 本地验证命令继续使用 `npm run build:web-next`
  - Windows 开发与 Linux 部署继续保持一致的路径与样式策略

## 2026-05-11 桌面端爆款复刻列表页设计稿对齐补充

- 本轮补充处理桌面端 Electron + Vue 页面：
  - `src/renderer/src/ui/views/CloneTaskListView.vue`
- 原因：
  - 当前用户运行并截图确认的实际页面来自桌面端，而不是 `apps/web-next`
- 当前已按设计稿方向调整为：
  - 顶部大标题 Hero 区
  - 五张状态统计卡
  - 主区两列任务卡片网格
  - 右侧独立任务说明 rail
  - 最近切换列表
- 当前任务卡保留并展示：
  - 封面图
  - 状态标签
  - 当前阶段
  - 模板、模特、素材摘要
  - 进度条
  - 五阶段步骤点
  - 更新时间
  - 进入与删除操作
- 桌面端实现说明：
  - 删除任务继续走 Electron preload 暴露的 `window.api.clone.removeProject`
  - 本地封面图路径使用 `file:///` 兼容方式展示
- 使用说明：
  - Windows 本地开发测试继续以桌面端 `npm run dev` 为准
  - 发布环境仍需保持 Linux 兼容，不写死 Windows 专属业务逻辑

## 2026-05-11 Web-Next 首页设计稿对齐补充

- 本轮继续只处理 `apps/web-next`，不改后端 API 协议。
- 当前首页页面：
  - `apps/web-next/app/workspace/page.tsx`
- 当前已按设计稿方向收口为：
  - 顶部大 Hero 区
  - 左侧主文案与双 CTA
  - 右侧 AI 视觉主图
  - 最近任务卡片区
  - 推荐模板卡片区
- 当前首页继续复用已有数据边界：
  - 最近任务继续使用 `listCloneProjects()`
  - 新建任务继续使用 `createCloneProject()`
  - 推荐模板当前仍为前端静态展示入口，不新增后端模板协议
- 实现约束保持不变：
  - 保持前后端分离
  - 不把业务规则回灌到页面层
  - 保持 Windows 开发与 Linux 部署兼容
- 使用说明：
  - 本地验证命令继续使用 `npm run typecheck:web-next`
  - 本地验证命令继续使用 `npm run build:web-next`

## 2026-05-12 桌面端 `/clone` 快速上线优化补充

- 本轮主目标切换为桌面端 Electron + Vue 实际上线链路，优先处理：
  - `src/renderer/src/ui/views/CloneTaskListView.vue`
  - `src/renderer/src/ui/views/CloneView.vue`
  - `src/renderer/src/ui/MainLayout.vue`
- 当前保持不变的业务边界：
  - 不修改 `src/preload/index.ts` 中 `window.api.clone.*` 契约
  - 不修改 `src/main/modules/clone/*` 后端业务逻辑
  - 不新增服务端字段，不改变 `/clone` 与 `/clone/:projectId` 路由语义
- 当前桌面端 `/clone` 上线方向：
  - `/clone` 列表页继续保留搜索、状态筛选、新建、删除、进入详情能力
  - `/clone/:projectId` 继续保持 5 阶段业务语义：
    1. 参考分析
    2. 脚本生成
    3. 分镜设计
    4. 分镜视频
    5. 成片合成
  - 公共壳层继续统一深色工作台视觉，但减弱无关状态信息，突出主工作区
- 使用说明：
  - Windows 本地开发测试以 `npm run typecheck`、`npm run dev` 为准
- Linux 发布环境继续保持兼容，不写死 Windows 专属业务逻辑
- 详细改动见 `docs/requirements-2026-05-12-desktop-clone-launch-optimization.md`

## 2026-05-12 桌面端 `/clone` 主流程测试补充

- 本轮继续以桌面端 Electron + Vue 的 `/clone` 主链路为主，不扩散到 `apps/web-next`。
- 本轮先完成了一个会阻断验收的基础修复：
  - `src/main/modules/web-platform/service.ts`
  - 修正 `updateCloneProjectStage()` 的 `currentStep` 类型写法，恢复 `npm run typecheck` 通过
- 本轮对桌面端复刻模块做了主链路基础测试，优先覆盖：
  - 创建草稿任务
  - 读取任务列表
  - 读取任务详情
  - 删除任务
- 当前已验证通过的最小闭环：
  - `cloneService.createDraftProject()`
  - `cloneService.listProjectSummaries()`
  - `cloneService.getProject()`
  - `cloneService.removeProject()`
- 本地测试结论：
  - 草稿任务可创建
  - 新任务可出现在任务列表中
  - 任务详情可正常读取
  - 删除后任务可从列表移除
- 使用说明：
  - Windows 本地静态校验命令：`npm run typecheck`
  - 桌面端基础链路联调建议：`npm run dev`
  - 若继续验证“分析参考视频 -> 脚本生成 -> 分镜图 -> 分镜视频 -> 成片合成”完整五阶段，需要：
    - 本地可用参考视频文件
    - 已配置的模型供应商凭证
    - 对应图像 / 视频生成额度或可用服务
- 当前已确认的边界：
  - 本轮未修改 `window.api.clone.*` IPC 契约
  - 本轮未改 `src/main/modules/clone/*` 的核心业务协议
  - 本轮测试以 Windows 开发环境为准，未引入 Linux 不兼容逻辑

## 2026-05-12 桌面端 `/clone` 五阶段逐步实测与本地兜底补充

- 本轮继续只围绕桌面端 `/clone` 五阶段主流程，不扩散到其他模块。
- 实测目标：
  - 参考视频分析
  - 模特/商品素材绑定
  - 脚本候选生成与选择
  - 分镜图生成
  - 分镜视频生成
  - 最终成片合成
- 本轮针对 Windows 本地联调补齐了最小可测兜底：
  - 当 `allowMockWhenNoKey=true` 且未配置可用图片 / 视频云端 Key 时
  - 桌面端复刻流程允许走本地测试 fallback
  - 目的仅为打通桌面端 `/clone` 五阶段联调，不替代正式云端出片
- 本轮补齐的桌面端本地测试能力包括：
  - 模特身份包可基于本地商品图生成 mock 图片集合
  - 分镜首尾帧可基于本地参考图生成 mock 帧
  - 分镜视频可基于首尾帧通过 ffmpeg 生成本地 mock 过渡视频
  - 最终成片在本地测试模式下允许使用 mock 分镜继续合成
- 当前已验证通过的桌面端五阶段结果：
  - 参考视频分析通过
  - 模特身份包生成通过
  - 脚本候选生成与选择通过
  - 分镜图生成通过
  - 分镜视频生成通过
  - 最终成片合成通过
- 当前验证产物：
  - 测试项目 `b79f1d94-1ada-43e6-8136-3a42c7b3a411`
  - 最终成片输出：
    - `.videogenerate/viral-clone/b79f1d94-1ada-43e6-8136-3a42c7b3a411/outputs/viral_clone_001.mp4`
- 说明：
  - 这轮通过的是“桌面端本地可回归测试链路”
  - 不是“正式云端供应商出片质量验收”
  - 若切回正式生产模式，仍应以真实 provider key、真实图生视频/首尾帧能力和正式质量门槛为准

## 2026-05-12 桌面端 `/models` 模特库显示修复与设计稿对齐补充

- 本轮只处理桌面端 Electron + Vue 的模特库页面：
  - `src/renderer/src/ui/views/ModelLibraryView.vue`
- 当前问题：
  - 桌面端模特卡片主区显示异常，无法稳定以网格方式展示
  - 页面首屏结构与用户提供的暗色设计稿不一致
- 本轮最小修复策略：
  - 保持 `window.api.clone.*` 现有接口契约不变
  - 不改后端模型身份生成、重命名、删除、绑定逻辑
  - 仅重排 `/models` 页面内容区与交互壳层
- 当前已完成：
  - 将模特卡片从“外层 `button` 包裹内层多个 `button`”的非法嵌套结构，调整为可稳定渲染的卡片容器结构，修复桌面端列表异常显示问题
  - 顶部 Hero 调整为更接近设计稿的“标题 + 描述 + 导入/创建操作”
  - 中部列表区调整为：
    - 顶部分类 tabs
    - 一行筛选器
    - 搜索框与视图切换
    - 四列高密度卡片网格
    - 底部分页与条数选择
  - 右侧详情区调整为：
    - 顶部模特摘要卡
    - 使用模特 / 编辑信息 / 更多操作
    - 基本信息
    - 标签
    - 简介
    - 作品预览
  - 页面可见中文文案同步清理为正常中文
- 使用说明：
- Windows 本地开发测试继续使用 `npm run typecheck`、`npm run dev`
- Linux 发布环境继续兼容，本轮未引入任何 Windows 专属业务逻辑
- 若继续做像素级微调，优先继续收紧卡片标题密度、右侧详情间距和顶部筛选高度

## 2026-05-12 Web-Next `/settings` 设计稿密度对齐补充

- 本轮只处理 `apps/web-next/app/settings/page.tsx`，不改后端协议，不改本地持久化结构。
- 当前问题：
  - `/settings` 页面和暗色设计稿相比，首屏卡片、摘要区、左侧分组导航、表单控件、右侧说明栏整体偏大、偏松。
- 本轮最小改动策略：
  - 只压缩当前页面的三栏比例、圆角、padding、gap、标题字号、正文行高、按钮高度和输入框高度
  - 不修改共享 `Button`、`Card`、`Input` 默认样式，避免影响其他工作台页面
  - 保持设置分组、字段结构、保存/重置/本地读取行为不变
- 当前已完成：
  - 顶部设置中心面板整体收紧
  - 四张摘要卡图标尺寸、数值字号和说明行高同步收紧
  - 左侧导航项高度、图标尺寸、文本缩进和栏宽收紧
  - 中间表单字段间距、输入框高度和云存储卡片内边距收紧
  - 右侧说明卡和最近状态卡的标题、按钮、圆角、内边距收紧
- 使用说明：
  - Windows 本地开发验证命令：`npm run typecheck:web-next`
  - 本地页面联调命令：`npm run dev:web-next`
- 验收重点：
  - `/settings` 首屏视觉密度明显提升
  - 主要控件不再显得过高、过宽
  - 左中右三栏比例更接近设计稿

## 2026-05-12 Web-Next `/settings` 中文清理与第二轮像素收口

- 本轮继续只处理 `apps/web-next/app/settings/page.tsx`，不改后端协议，不扩散到其他页面。
- 当前问题：
  - `/settings` 页面仍残留历史乱码文案
  - 和设计稿相比，标题字号、左栏宽度、右栏高度、输入框纵向节奏仍偏大
- 本轮最小改动策略：
  - 直接重写 `/settings` 页文件，彻底清除乱码文本
  - 保持设置字段结构与本地持久化逻辑不变
  - 继续压缩页面密度，不修改共享组件默认样式
- 当前已完成：
  - 设置页所有页面内中文文案恢复为正常中文
  - 页面标题从偏大尺寸收紧到更接近设计稿的内页层级
  - 左侧导航栏宽度进一步缩小，导航卡片高度、图标、说明行高继续收紧
  - 右侧说明栏和最近状态栏继续压缩高度、圆角、按钮与段落间距
  - 中间表单输入框、下拉框、字段标签、帮助说明进一步压缩纵向节奏
  - API Key 可见性按钮切换为更明确的显示/隐藏图标
- 使用说明：
  - Windows 本地验证命令：`npm run typecheck:web-next`
  - 本地页面联调命令：`npm run dev:web-next`
  - 验收重点：
    - `/settings` 页面不再有乱码中文
    - 首屏纵向占用进一步缩小
    - 左中右三栏比例和控件尺度更接近设计稿

## 2026-05-12 Web-Next `/settings` 第三轮高度压缩与像素微调

- 本轮继续只处理 `apps/web-next/app/settings/page.tsx`，不改后端协议，不扩散到共享组件。
- 用户当前反馈：
  - `/settings` 仍然偏高
  - 与暗色设计稿相比，标题区、左栏、右栏和表单节奏仍偏大
- 本轮最小改动策略：
  - 整页重写设置页内容结构，彻底清除残留乱码文案
  - 保持 `readAppSettings`、`saveAppSettings`、`DEFAULT_APP_SETTINGS` 与字段结构不变
  - 继续收紧顶部摘要条、左侧导航、主表单区、右侧说明卡与输入控件高度
- 当前已完成：
  - 页面内全部中文文案恢复为正常可读文本
  - 顶部标题区字号、说明行高、按钮尺寸和摘要卡 padding 再次压缩
  - 左侧导航栏宽度与单项高度继续缩小，更接近设计稿的扁平密度
  - 中间主表单标题、字段间距、输入框高度从 `h-10` 收紧到 `h-9`
  - 右侧说明栏与最近状态栏继续降低标题区、卡片内边距和按钮高度
- 使用说明：
  - Windows 本地验证命令：`npm run typecheck:web-next`
  - 本地页面联调命令：`npm run dev:web-next`
  - 验收重点：
    - `/settings` 页面不再出现乱码文本
    - 首屏整体高度明显低于前一版
    - 左中右三栏的纵向节奏更接近设计稿

### 2026-05-12 第二轮设计稿收敛

- 基于用户追加要求，已重新拉起桌面端开发进程，并继续按设计稿方向收敛 `/models` 页面视觉密度。
- 本轮继续只改 `src/renderer/src/ui/views/ModelLibraryView.vue`，不改接口协议。
- 已继续调整：
  - 压缩顶部标题区高度与按钮尺寸，使首屏更接近设计稿的紧凑工作台感
  - 收紧 tabs、筛选器、搜索框和分页控件高度
  - 将模特卡片进一步压缩为更高密度展示，缩小边距、圆角、徽标和文案字号
  - 强化右侧详情 rail 的独立面板感，收紧摘要卡、tabs、基本信息和预览区间距
- 说明：
  - 由于当前线程下自动截图拿到的前台窗口存在系统环境干扰，本轮视觉收敛主要依据用户设计稿和当前组件结构直接调整
  - 后续若继续微调，优先建议在桌面端前台停留于 `/models` 页面后再做一次逐像素截图复核

### 2026-05-12 模特创建按钮可用性修复

- 用户反馈：
  - 模特创建弹窗中素材已选择，但“生成新模特”按钮无法点击
- 原因：
  - 前端将 `imageProviderReady` 也纳入了按钮禁用条件
  - 当未配置图片供应商 API Key 时，按钮会被静默禁用，用户无法触发创建逻辑，也看不到明确失败原因
- 本轮修复：
  - 保留后端对 API Key 的真实校验，不改 `generateModelIdentityPack` 服务逻辑
  - 前端按钮禁用条件调整为仅保留：
    - 生成中
    - 未选择来源项目
    - 未提供参考素材
  - 当缺少图片供应商 Key 时：
    - 按钮仍可点击
    - 弹窗内直接显示明确错误提示
    - 点击后仍由现有 `generateModel()` 给出对应 Key 缺失提示
- 使用说明：
  - 当前如果未配置 AtlasCloud / GRS.AI / 图片生成供应商 Key，界面不会再“点不动”
  - 用户会直接看到需要补充的 Key 类型，再去设置中心配置

### 2026-05-12 模特创建页与设置中心图片供应商配置对齐修复

- 用户继续反馈：
  - 设置中心已经配置了 Key，但模特创建弹窗仍提示“请先在设置中心配置图片生成 API Key”
- 根因：
  - 设置中心当前图片供应商默认支持 `apifox_hub(ai666)`
  - 但 `ModelLibraryView.vue` 中模特创建页只识别：
    - `openai`
    - `kling`
    - `grsai`
  - 导致当用户实际在设置中心配置的是 `ai666` 时，模特创建页加载凭证后会错误回退，进而误判为“未配置图片 Key”
- 本轮修复：
  - 模特创建页新增对 `apifox_hub` 图片供应商的识别
  - 同步读取：
    - `apifoxHub.apiKey`
    - `apifoxHub.baseUrl`
    - `apifoxHub.imageModel`
  - `imageProviderReady`、错误提示文案、提交时透传的 `imageProviderCredentials` 一并支持 `apifox_hub`
- 使用说明：
  - 如果设置中心的图片 provider 选的是 `ai666`，模特创建页现在会正确识别该 Key
  - 不再错误提示“未配置图片生成 API Key”

## 2026-05-13 桌面端视频模型显示口径修复

- 本轮只处理桌面端 Electron + Vue `/clone/:projectId` 详情页的视频模型显示问题，不改实际视频生成调用链路。
- 用户问题：
  - 设置中心明明已选择其他视频模型，但任务详情页平台状态仍显示 `veo_3_1-lite`
- 根因：
  - 页面原先将“当前配置模型”和“任务历史产物模型”混用为同一显示来源
  - 当任务已有旧分镜产物，或配置读取回退到默认值时，界面容易误显示为历史模型或默认模型
- 本轮修复：
  - `pipelineStatus` 新增 `configuredProviderSummary`
  - `/clone/:projectId` 视频阶段右侧状态卡改为分开展示：
    - 当前配置视频模型
    - 当前镜头实际产物模型
  - 桌面端设置中心在 `ai666` 视频 provider 下，单个“视频模型”输入会同步写入：
    - `textToVideoModel`
    - `imageToVideoModel`
    - `startEndVideoModel`
    - `referenceVideoModel`
- 使用说明：
- “当前配置视频模型”用于反映设置中心当前生效配置
- “模型标签”用于反映当前选中镜头产物实际使用的 provider / model
- 两者不一致时，以“模型标签”判断该镜头历史实际调用结果，以“当前配置视频模型”判断下一次生成会使用的配置

## 2026-05-13 桌面端视频复刻列表页可用性修复

- 本轮只处理桌面端 Electron + Vue 的 `/clone` 列表页首屏可用性问题，不改详情页主结构，不改后端接口协议。
- 用户目标：
  - 检查桌面端“视频复刻”模块是否还有不恰当的地方，并修复明确问题
- 本轮发现的问题：
  - `/clone` 列表页仍残留一批乱码中文，影响首屏可读性
  - 顶部工具区缺少真正可用的搜索闭环
  - 原“卡片视图”按钮没有实际切换能力，属于伪交互
  - 右侧“最近切换 / 清空”表达与当前页面真实行为不一致，容易误导
- 本轮最小修复策略：
  - 只修改 `src/renderer/src/ui/views/CloneTaskListView.vue`
  - 保持现有数据结构、路由、IPC 和卡片布局不变
  - 优先修复首屏文案、检索和伪交互问题
- 当前已完成：
  - 恢复 `/clone` 列表页状态标签、步骤文案、空状态、侧栏说明等中文文案
  - 顶部工具区补齐任务搜索输入框，支持按任务名、模特名、参考视频名和错误信息过滤
  - 增加“最近更新 / 最早更新”排序切换，直接作用于当前卡片列表
  - 移除无实际功能的顶部“卡片视图”伪切换按钮
  - 将卡片右上角“更多操作”按钮显式置为禁用，避免误导点击
  - 右侧栏从“最近切换 / 清空”调整为“最近更新 / 按更新时间展示”，与真实行为保持一致
  - “查看全部任务”按钮补齐为可用交互，点击后恢复全部状态筛选
- 使用说明：
  - Windows 本地验证命令：`npm run typecheck`
  - Windows 本地联调命令：`npm run dev`
  - Linux 部署说明：
    - 本轮仅修改 Vue 视图层和 TypeScript 前端逻辑
    - 未引入 Windows 专属路径处理或系统依赖，保持 Linux 部署兼容
- 验收重点：
  - `/clone` 列表页不再出现乱码中文
  - 搜索框可直接过滤当前任务卡片
  - 顶部排序切换可按更新时间正反排序
  - 页面不再出现明显“能看到但不能真正使用”的伪交互按钮

## 2026-05-13 视频复刻系统升级：完美成片优先 + 创建时运行模式必选

- 本轮围绕“完美视频、防穿帮、最大化视频效果”的目标，对视频复刻系统做最小闭环升级，重点不是重写架构，而是在现有主链路上补齐运行模式、自动流程目标和最终门禁。

- 后端数据与兼容策略：
  - `CloneProject` / `CloneProjectSummary` 新增 `runMode: 'auto' | 'manual'`
  - 历史任务兼容默认值为 `manual`
  - `autoFlowStatus.targetStage` 已支持 `final_compose`
  - `autoFlowStatus.currentStage` 已补充：
    - `analyze`
    - `materials`
    - `script`
    - `storyboard_images`
    - `storyboard_videos`
    - `quality_gate`
    - `final_compose`

- 自动流程升级：
  - 自动运行模式不再以“到分镜视频”为终点
  - 当自动模式任务完成分镜视频生成后，会继续进入最终门禁检查
  - 只有全部镜头通过硬门禁时，才允许进入最终合成
  - 任一镜头失败、超时未恢复、缺少关键素材或 `canEnterRender !== true` 时，禁止成片

- 最终成片硬门禁：
  - `composeCloneFinalVideo(...)` 在自动/手动两种模式下统一执行总门禁校验
  - 任一镜头满足以下条件，都会拒绝最终成片：
    - `qualityStatus === 'failed'`
    - `canEnterRender !== true`
    - 镜头状态失败或超时
    - 缺少可用于成片的有效视频素材
  - 手动模式不能绕过硬门禁强行出片

- 三端创建入口统一规则：
  - 桌面端 `src/renderer/src/ui/views/CloneTaskListView.vue`
  - Web `apps/web/src/views/WebCloneTaskListView.vue`
  - Web-Next：
    - `apps/web-next/app/clone/page.tsx`
    - `apps/web-next/app/workspace/page.tsx`
  - 创建任务前必须显式选择：
    - `自动运行`
    - `手动运行`

- 本轮前端实现：
  - 桌面端列表页新增创建前运行模式选择，并将 `runMode` 透传到 Electron IPC
  - Web 列表页新增创建前运行模式选择，并将 `runMode` 透传到 Web API
  - Web-Next 新增轻量弹层组件 `apps/web-next/components/clone/run-mode-dialog.tsx`
  - Web-Next 的 `/clone` 和 `/workspace` 创建任务入口已接入模式必选弹层

- API / IPC 透传改动：
  - `src/preload/index.ts`
  - `src/main/index.ts`
  - `src/main/modules/web-platform/service.ts`
  - `src/main/modules/web-platform/webApiRouter.ts`
  - `src/shared/web-api/types.ts`
  - `src/shared/web-api/client.ts`
  - `apps/web-next/hooks/use-clone-task-list.ts`

- 使用说明：
  - 自动运行：
    - 创建后任务以自动模式保存
    - 当参考视频、模特、商品图齐备后，详情页会自动触发自动流程
    - 自动流程启动后，系统会自动推进
    - 失败镜头不会被偷偷带入成片
  - 手动运行：
    - 创建后由用户按阶段推进
    - 但最终合成仍必须通过统一硬门禁

- Windows / Linux 兼容说明：
  - Windows 本地开发验证命令：
    - `npm run typecheck`
    - `npm run typecheck:web`
    - `npm run typecheck:web-next`
  - 本轮改动仅涉及 TypeScript / Vue / React / Electron IPC / Web API 透传与服务逻辑
  - 未引入任何 Windows 专属路径分支，保持 Linux 部署兼容

- 验收重点：
  - 新建任务时未选择运行模式不能提交
  - 创建后 `runMode` 能持久化并参与后续自动流程判断
  - 自动模式在无失败镜头时可继续推进到最终门禁 / 成片
  - 任一失败镜头会阻止最终合成
  - 手动模式点最终合成也不能绕过门禁

### 2026-05-13 第二轮收口：Web-Next 剩余入口 + 桌面端详情页状态展示

- 本轮继续只围绕“运行模式必选”和“最终门禁状态清晰展示”收口，不改无关流程。

- Web-Next 剩余直接创建入口已补齐 `runMode` 必选：
  - `apps/web-next/app/materials/page.tsx`
  - `apps/web-next/app/templates/page.tsx`
  - `apps/web-next/app/models/page.tsx`
- 当前这些入口在创建或派生任务前都会先弹出运行模式选择层：
  - 自动运行
  - 手动运行

- 桌面端 `/clone/:projectId` 详情页展示已补齐到产品口径：
  - `src/renderer/src/ui/views/CloneView.vue`
  - 已新增或补强：
    - 当前运行模式展示
    - 自动流程目标阶段展示
    - 自动流程当前阶段展示
    - 阻塞镜头数展示
    - 是否允许进入最终成片展示
    - 最近一次门禁失败摘要展示

- 桌面端自动/手动运行样式已调整：
  - 自动运行使用更强的青色强调样式
  - 手动运行使用更克制的灰蓝样式
  - 最终门禁通过 / 阻塞使用独立状态卡区分
  - 成片合成按钮在门禁未通过时显示警示态

- 验证命令：
  - `npm run typecheck`
  - `npm run typecheck:web`
  - `npm run typecheck:web-next`

### 2026-05-14 桌面端启动兼容修复：延迟加载 `node:sqlite`

- 本轮只处理桌面端开发启动阻塞，不改主流程页面和接口。
- 问题现象：
  - Windows 本地执行 `npm run dev` 时，Electron 主进程因 `node:sqlite` 不存在而直接退出。
  - 结果是桌面端窗口无法进入可用状态。
- 最小修复：
  - 文件：`src/main/modules/clone/prompt-consistency-db/client.ts`
  - 去掉顶层静态导入 `node:sqlite`
  - 改为真正访问提示词一致性数据库时再运行时加载
  - 若当前 Electron 运行时不支持 `node:sqlite`，则仅在调用该能力时抛出明确错误，不再阻塞整个桌面端启动
- 使用说明：
  - Windows 本地启动继续使用：`npm run dev`
  - Linux 部署环境如果运行时支持 `node:sqlite`，原有一致性数据库逻辑保持不变
- 验收重点：
  - `npm run dev` 可拉起 Electron 主进程
  - 不再因 `node:sqlite` 顶层导入导致桌面端启动失败

### 2026-05-14 设置页模型配置结构调整：平台凭证与能力模型分层

- 本轮只调整桌面端设置页的信息架构，不改后端存储结构和接口协议。
- 用户问题：
  - 原设置页把 `API Key / Base URL` 和“视频 / 图片 / 对话模型”混在每个能力分区里。
  - 同一个开放平台的凭证会在多个区域重复出现，普通用户不容易理解。
- 本轮调整：
  - 文件：`src/renderer/src/ui/views/SettingsView.vue`
  - 新结构改为三段：
    - `开放平台`
      - 单独配置 AtlasCloud、GRS.AI、VectorEngine 的 `API Key / Base URL`
    - `能力模型`
      - 分别选择视频、图片、对话使用哪个平台和哪个模型
    - `云存储`
      - 保持七牛配置独立
  - 视频能力仍保留回退平台和回退模型配置，避免影响现有主链路
  - 保存逻辑保持原样，仍走 `window.api.clone.setModelCredentials`
- 使用说明：
  - 先到“开放平台”填写平台凭证
  - 再到“能力模型”选择视频、图片、对话各自的平台与模型
  - 保存后前端会重新读取当前配置，避免假回显
- 验收重点：
  - 相同平台的凭证只需要维护一份
  - 视频、图片、对话区域不再重复出现同一套 Key / Base URL
  - 保存后配置仍能正确回显

### 2026-05-14 VectorEngine `task_not_exist` 排查与最小修复

- 本轮目标：
  - 排查桌面端日志中 `VectorEngine 查询视频任务 ... task_not_exist` 的真实来源
  - 优先区分“旧 taskId 残留”还是“创建/查询接口不一致”

- 排查结论：
  - `apifox_hub` 是内部 provider 标识，界面展示名是 `VectorEngine`
  - 当前更强证据指向“旧 / 无效 taskId 残留后继续查询”
  - 不是单纯因为用户切换到 VectorEngine 后平台没生效

- 已做最小修复：
  - 文件：`src/main/modules/clone/unifiedVideo.ts`
  - 当查询返回 `400 task_not_exist` 时：
    - 不再当作可继续轮询的超时态
    - 直接识别为 `failed`
  - 新增创建/查询诊断日志：
    - `create-video-task`
    - `query-video-task`
    - 会打印 `provider / endpointStyle / baseUrl / createUrl|queryUrl / model`

- 本轮追加修复：
  - 文件：`src/main/modules/clone/service.ts`
  - 当旧视频任务查询结果明确是 `task_not_exist` 时：
    - 当前 `taskId` 不再继续保留
    - 旧 `taskId` 转存到 `previousTaskIds`
    - 当前镜头改为明确失败态
  - 目的：
    - 避免页面刷新或失败后自动同步时反复继续查询同一个已失效云端任务
  - 文件：`src/main/modules/clone/service.ts`
  - 当用户执行“强制重新生成”时：
    - 在提交新视频任务前清空项目级 `lastError` 和 `lastErrorContext`
  - 目的：
    - 避免前端在刷新项目时继续回放上一次失败任务的 `task_not_exist` 上下文
    - 避免把旧的 `apifox_hub / task_not_exist` 误读成“这次重试仍然在查旧接口”
  - 文件：`src/main/modules/clone/service.ts`
  - 生成 `pipelineStatus` 时，若 `errorContext.taskId` 已不属于任何镜头当前有效的视频任务：
    - 不再继续下发该 `errorContext`
  - 目的：
    - 避免历史视频任务的失败上下文在页面刷新后长期反复显示
    - 避免旧 `taskId` 冒充“当前正在查询的云端任务”

- 使用说明：
  - 重新触发一次对应分镜的视频生成
  - 观察新日志里的创建地址和查询地址是否成对一致
  - 若仍报 `task_not_exist`，优先视为旧 taskId 或无效 taskId 被继续查询

- 验收重点：
  - `task_not_exist` 不再被误记为“本地等待超时但云端可能仍在生成”
  - 调试日志可明确显示创建 URL 与查询 URL

### 2026-05-14 桌面端重新生成被 `node:sqlite` 前置阻断修复

- 本轮目标：
  - 修复桌面端点击“重新生成”时，尚未发起云端视频任务就先在本地 `node:sqlite` 运行时失败的问题
  - 保证 Windows 开发环境缺少 `node:sqlite` 时，不阻断 VectorEngine 视频重新生成主链路

- 问题结论：
  - 触发“重新生成”后，桌面端主进程先执行 `promptConsistencyService.compileAndPersist`
  - 当前 Electron 运行时不支持 `node:sqlite`，导致在本地提示词一致性持久化阶段直接报错
  - 因为新任务根本没有提交到云端，所以日志里只会反复看到旧 `taskId` 的 `task_not_exist`，表现为“重新生成一直不成功、没有新日志”

- 已做最小修复：
  - 文件：`src/main/modules/clone/prompt-consistency/service.ts`
  - 调整为：
    - 提示词一致性“编译”继续执行
    - SQLite 持久化改为 best-effort
    - 若当前桌面端运行时不可用 SQLite，则只打印降级日志，不再阻断视频生成
  - 影响范围：
    - 仅影响桌面端本地一致性分析落库
    - 不改现有视频生成接口、前后端协议和云端调用方式

- 使用说明：
  - 在 Windows 桌面端重新点击一次“重新生成”
  - 现在应能继续看到新的视频创建/查询日志，而不是只停留在旧 `taskId` 报错
  - 若后续仍失败，再根据新产生的 `create-video-task` / `query-video-task` 日志继续排查云端侧问题

- 验收重点：
  - 点击“重新生成”后，不再被 `node:sqlite` 本地异常直接拦截
  - 主进程日志中能出现新的 VectorEngine 创建请求日志
  - 桌面端可继续进入真实的云端生成与查询链路

### 2026-05-14 脚本变体生成对话模型分流修复

- 本轮目标：
  - 修复分镜视频阶段中“整片脚本变体生成”错误使用旧 `GRS.AI` 模型名的问题
  - 保证当对话供应商选择 `VectorEngine` 时，实际请求模型与设置页一致

- 问题结论：
  - 现有 `generateWholeScriptVariantsWithAi()` 固定读取 `grsaiAnalysisModel`
  - 即使设置页已将对话供应商切到 `VectorEngine`，请求仍可能带着旧的 `gpt-5.2`
  - 因此日志会出现“上下文显示 VectorEngine，但实际报 `model not register: gpt-5.2`”的错位现象

- 已做最小修复：
  - 文件：`src/main/modules/clone/service.ts`
  - 当 `chatProviderPrimary === 'apifox_hub'` 时：
    - 整片脚本变体生成改为走 `generateChatCompletion()`
    - 实际请求模型使用 `apifoxHub.chatModel`
    - 解析和返回逻辑保持 JSON-only，不改页面结构和主流程
  - 当 `chatProviderPrimary !== 'apifox_hub'` 时：
    - 继续保留原有 `GRS.AI` 兜底路径

- 使用说明：
  - 到设置页确认“对话”供应商是 `VectorEngine`
  - 填写对应的 `VectorEngine Chat Model`
  - 再重新执行脚本变体生成 / 分镜视频生成

- 验收重点：
  - `VectorEngine` 对话链路不再携带旧 `gpt-5.2`
  - 失败日志中的 `provider / model` 与设置页一致
- 脚本变体生成能继续向后推进到分镜阶段

## 2026-05-15 真实登录短信闭环补充

- `POST /auth/send-code` 已接入最小短信 provider 分发层。
- `development` 下默认返回 `mock` provider，继续支持本地 Windows 快速联调。
- `staging / production` 下可通过 `VG_SMS_PROVIDER=console` 启用最小真实发码通道，避免继续走固定演示码直登。
- 发码接口已增加 60 秒同手机号限频，减少重复发送和裸奔风险。
- 当前仍保持最小闭环策略：
  - 不改既有 token / session 结构
  - 不引入额外认证框架
  - 不扩展邮箱登录

### 2026-05-16 分镜视频待查询状态澄清摘要

- 背景：
  - 分镜视频阶段此前已支持自动轮询、手动查询和云端状态同步。
  - 但“可继续查询”和“缺少任务号”没有清楚区分，导致用户无法判断某个待查询镜头到底还能不能继续查。
- 本轮最小修复：
  - 批量“手动查询待回写”统一复用 fallback 任务号策略：
    - 优先 `shotVideoOutputs[].taskId`
    - 回退 `blueprint.shots[].generatedTaskId`
  - 列表新增明确统计：
    - `可继续查询`
    - `缺少任务号`
  - 对缺少任务号的镜头提供 `同步补查` 入口。
- 结果：
  - 批量查询、单条查询、状态展示三者口径一致。
  - 用户可以明确区分：
    - 可以继续查询的镜头
    - 因缺少任务号而无法继续查询的镜头
- 详细记录：
  - `docs/requirements-2026-05-16-manual-pending-shot-query.md`

### 2026-05-16 分镜视频静默约束补强摘要

- 背景：
  - 用户反馈分镜视频生成后，人物仍出现明显说话口型。
  - 排查发现，真正提交给视频模型的最终 prompt 部分链路优先使用 `compiled.finalPrompt`，此前对“静默商业片”的约束不够强。
- 本轮最小修复：
  - 在 `prompt-consistency` 编译层直接补入完整静默商业规则。
  - 在视频模型提交前，再对最终 prompt 做一次兜底强化。
- 结果：
  - 新生成的分镜视频会更强地约束：
    - 不说话
    - 不做对镜口播
    - 尽量头部不入镜
    - 100% 聚焦产品展示
- 说明：
  - 仅对重新生成的新任务生效。
  - 历史已生成视频不会自动改写。
- 详见：
  - `docs/requirements-2026-05-16-silent-commercial-prompt-trim.md`

### 2026-05-16 分镜视频口播姿态进一步压制摘要

- 在静默商业规则补强后，继续针对“人物像在讲解产品”这一问题追加更硬约束。
- 本轮重点压制：
  - 正对镜头讲解构图
  - 主播/主持人口播姿态
  - 张嘴表情
  - 类似说话的嘴型
- 结果：
  - 新生成视频会更偏向纯产品展示，而不是人物对镜头介绍。
- 详见：
  - `docs/requirements-2026-05-16-silent-commercial-prompt-trim.md`

## 2026-05-16 补充说明：任务卡错误信息弹窗化

- 问题：任务列表卡片直接显示完整错误字符串，会挤压底部信息区和操作区，影响任务卡可读性与按钮可用性。
- 本轮最小修复：
  - 卡片内只显示短错误摘要。
  - 新增 `查看错误` 按钮。
  - 完整错误信息改为弹窗查看。
- 结果：
  - 任务卡片主布局保持稳定。
  - 长错误信息不再覆盖进度和其他操作内容。
  - 需要排查错误时，仍可完整查看原始错误内容。

## 2026-05-16 补充说明：复刻任务列表卡片错误弹窗化

- 问题：`/clone` 任务列表卡片直接渲染完整 `lastError`，长错误会撑坏卡片底部布局。
- 本轮最小修复：
  - 卡片底部错误改为单行摘要。
  - 新增 `查看错误` 按钮。
  - 完整错误改为弹窗查看。
- 结果：
  - 卡片进度、时间、操作按钮不再被长错误覆盖。
  - 排查错误时仍能查看完整原始报文。

## 2026-05-16 补充说明：首页最近任务缩略图修复

- 问题：首页“最近任务”缩略图使用了与复刻任务列表不一致的本地文件 URL 转换方式，导致部分本地封面图不显示。
- 本轮最小修复：
  - `HomeView.vue` 统一改为复用 `vg://file?path=...` 风格的本地文件地址转换逻辑。
- 结果：
  - 首页最近任务与复刻任务列表页的缩略图加载行为保持一致。
  - 本地封面图、预览图、参考视频路径作为封面来源时，显示更稳定。

## 2026-05-16 补充说明：分镜图生成列表改为设计稿表格结构

- 问题：`/clone/[projectId]` 的“分镜图片生成”结果区此前仍是卡片式呈现，和用户提供的设计稿结构不一致，镜头信息、提示词、时长、景别、运镜、旁白与操作入口无法在一行内清晰对照。
- 本轮最小修复：
  - 仅调整 `CloneView.vue` 内 `visibleStageKey === 'grid'` 的分镜图片结果列表。
  - 将结果区改为表格化行结构，按以下列顺序展示：
    - 镜头
    - 画面 / 提示词
    - 时长
    - 景别
    - 运镜
    - 台词 / 旁白
    - 操作
  - 保留原有交互能力：
    - 选中镜头
    - 预览分镜图
    - 锁定 / 解锁
    - 重新生成
  - 修复行点击结构，避免使用外层按钮包裹内层按钮造成交互冲突。
- 结果：
  - 分镜图生成列表的结构更接近设计稿。
  - 镜头缩略图与文案字段在同一行内对齐，信息密度更高。
  - 右侧预览与其他阶段逻辑不受影响。
- 详见：
  - `docs/requirements-2026-05-16-clone-storyboard-list-design-alignment.md`

## 2026-05-16 补充说明：复刻详情顶栏流程带改为三段式结构

- 问题：`/clone/[projectId]` 顶栏此前仍是“普通头部 + 下方流程带”的双层结构，不符合用户设计稿要求，也弱化了流程导航在首屏的主层级。
- 本轮最小修复：
  - 仅调整桌面端 `MainLayout.vue` 中 clone 详情页场景的顶栏渲染。
  - 将 clone 顶栏改为单条三段式结构：
    - 左：流程导航
    - 中：空白过渡
    - 右：GPU / API / 账号状态
  - 保留流程步骤点击切换能力。
  - 普通非 clone 页面仍保持原顶栏结构，不做联动改造。
- 结果：
  - 复刻详情页首屏层级更接近设计稿。
  - 流程导航被提升到顶栏主结构内。
  - 改动范围限制在壳层顶栏，不影响 `CloneView` 阶段数据逻辑。
- 详见：
  - `docs/requirements-2026-05-16-clone-topbar-three-column-alignment.md`

## 2026-05-16 补充说明：分镜设计阶段改为左列表右预览并修正图片比例

- 问题：分镜设计阶段此前仍偏双列表工作区，不符合用户提供的“左侧分镜列表 + 右侧预览”的设计稿；同时缩略图被统一压成近似方图，没有按 9:16 真实比例展示。
- 本轮最小修复：
  - 仅调整 `CloneView.vue` 中 `visibleStageKey === 'grid'` 的分镜设计区域。
  - 改为：
    - 左侧分镜列表
    - 右侧分镜预览
  - 新增 grid 阶段专用选中态，右侧预览直接跟随当前选中镜头。
  - 分镜缩略图与右侧预览图统一改为按 9:16 容器显示，并使用 `contain` 保留真实比例。
- 结果：
  - 分镜设计阶段整体结构更接近设计稿。
  - 9:16 竖图不再被压成 1:1 方图。
  - 右侧可直接查看当前镜头的大图预览和脚本信息。
- 详见：
  - `docs/requirements-2026-05-16-clone-storyboard-preview-ratio-alignment.md`

## 2026-05-16 补充说明：分镜设计头部文案与按钮对齐设计稿

- 问题：分镜设计阶段头部此前仍沿用通用阶段标题样式，标题、描述和右侧主按钮不符合用户提供的设计稿结构。
- 本轮最小修复：
  - 仅调整 `CloneView.vue` 中分镜设计阶段头部。
  - 将头部改为：
    - 左侧：`分镜设计` 标题 + 描述
    - 右侧：`保存项目` + `下一步`
  - 保留当前最小行为：
    - `保存项目` 使用当前项目刷新保存链路
    - 若已存在分镜图，`下一步` 进入视频阶段
    - 若尚未生成分镜图，主按钮继续触发生成
- 结果：
  - 分镜设计头部更接近设计稿。
  - 不影响其他阶段的通用标题组件。
- 详见：
  - `docs/requirements-2026-05-16-clone-storyboard-header-alignment.md`

## 2026-05-16 补充说明：分镜设计列表去除重复文案列

- 问题：分镜设计列表中“台词 / 旁白”列在缺少独立旁白数据时，会回退为脚本文案，导致和“画面 / 提示词”列看起来重复。
- 本轮最小修复：
  - 仅调整 `CloneView.vue` 中 `storyboardDesignRows` 的 `voiceText` 回退逻辑。
  - `台词 / 旁白` 列仅显示真实的 `voiceover` 或 `onScreenText`。
  - 若没有独立旁白数据，则显示 `--`，不再复制主提示词。
- 结果：
  - 列表信息职责更清晰。
  - 避免两列显示同一段文本。

## 2026-05-16 补充说明：参考视频分析首屏头部压缩与结构卡去空白

- 问题：参考视频分析阶段首屏顶部存在两层头部，信息重复且占高；右侧“内容结构”卡片上方也存在明显空白，首屏密度不够。
- 本轮最小修复：
  - 仅调整 `CloneView.vue` 中 `visibleStageKey === 'analyze'` 的首屏布局。
  - 将原 `analyze-topbar` 与 `analyze-hero-card` 合并为单层头部。
  - 把 `爆款复刻 / 项目详情`、标题和按钮收进同一块。
  - 收紧 `analyze-workbench`、`analyze-hero-card`、`analyze-structure-card` 的顶部与内部间距。
- 结果：
  - 参考视频分析首屏更紧凑。
  - 顶部重复结构被消除。
  - 右侧内容结构区域更贴顶，不再留出大块无效空白。

## 2026-05-16 补充说明：模特与商品图片前移到参考视频分析阶段

- 问题：`选择模特` 和 `选择商品图片` 之前只放在脚本生成阶段，用户在主链路上需要等到后一步才补素材，前置准备不够清晰。
- 本轮最小修复：
  - 仅调整 `CloneView.vue` 页面结构。
  - 将 `选择模特` 与 `选择商品图片` 两块素材准备卡前移到 `参考视频分析` 阶段底部。
  - 继续复用现有：
    - 模特选择弹窗
    - 商品图上传 / 删除 / 清空逻辑
    - 当前项目绑定数据
  - 同时从脚本生成阶段左侧摘要栏中移除这两块重复卡片。
- 结果：
  - 用户可在参考视频分析阶段提前完成素材准备。
  - 后续脚本生成、分镜设计、分镜视频阶段继续复用同一份模特和商品图数据。

## 2026-05-16 补充说明：参考视频分析改为三列工作区

- 问题：参考视频分析页此前包含较多额外分析块，结构不够聚焦，和设计稿的“三列工作区”不一致。
- 本轮最小修复：
  - 仅调整 `CloneView.vue` 中 `visibleStageKey === 'analyze'` 的页面结构。
  - 页面改为三列：
    - 第一列：参考视频上传与替换
    - 第二列：脚本结构与内容
    - 第三列：项目名称、模特选择、商品图选择
  - 先隐藏原先不在设计稿主结构内的其他分析块：
    - AI 分析结果大面板
    - AI 引擎状态
    - 底部项目卡
- 结果：
  - 参考视频分析页更接近设计稿主结构。
  - 首屏只保留主链路所需的三块信息。

## 2026-05-16 补充说明：参考视频分析三列继续细化

- 问题：参考视频分析三列结构虽然已经成形，但卡片层级、标签栏和右侧信息密度还不够接近设计稿。
- 本轮最小修复：
  - 继续只调整 `CloneView.vue` 中 `visibleStageKey === 'analyze'` 的布局细节。
  - 中列补充分析结果标签栏。
  - 左列补充视频信息卡。
  - 右列补充项目信息标签，并继续把模特和商品图作为后续复用素材展示。
  - 收紧三列在中宽度下的响应式折叠方式。
- 结果：
  - 分析页的三列结构更接近设计稿。
  - 信息密度更高，但仍只保留主链路内容。

## 2026-05-16 补充说明：自动模式在分析脚本后继续自动运行

- 问题：自动模式下，点击“分析脚本”成功后，详情页没有按预期在脚本候选生成完成后继续进入后续自动流程。
- 本轮最小修复：
  - 仅调整 `CloneView.vue` 中自动起跑判定和自动阶段衔接逻辑。
  - 自动模式改为：先完成参考视频分析，再自动生成脚本候选，只有脚本候选已经生成后，才继续进入后续自动流程。
  - 服务端自动流程会优先复用已生成的脚本候选，避免再次重复生成。
- 结果：
  - 自动模式下，在参考视频、模特、商品图齐备并点击“分析脚本”后，会先自动生成脚本候选，再继续自动推进到分镜视频阶段。
  - 若项目已经产出分镜图、分镜视频或最终成片，则不会重复自动起跑。

## 2026-05-16 补充说明：脚本变体前商品图同步返回值修复

- 问题：参考视频分析完成后，自动切到“生成脚本变体”时，前端会先同步商品图草稿；桌面端这里对 IPC 返回值解包不一致，可能把当前项目状态错误覆盖，导致日志立刻出现“生成脚本变体失败”。
- 本轮最小修复：
  - 仅调整桌面端商品图同步相关前端组合逻辑。
  - 统一按 `{ project }` 结构读取 `saveProjectProductImages` 的 IPC 返回值，避免同步商品图后污染当前项目状态。
- 结果：
  - 自动模式从“参考视频分析”跳到“生成脚本变体”时，商品图草稿会先正确落库，再继续脚本变体生成。
  - 同类商品图同步入口的项目状态回填也保持一致。

## 2026-05-17 补充说明：脚本变体前自动补绑模特

- 问题：用户如果在参考视频分析前就先选了模特，前端本地会记住已选模特，但分析完成后的项目不一定已经真正绑定该模特，导致界面看起来已选，服务端生成脚本变体时仍可能报“请先选择模特”。
- 本轮最小修复：
  - 仅调整 `useCloneProjectWorkspace.script.ts` 的脚本变体生成前置逻辑。
  - 如果本地已选模特 ID 存在、但项目快照里还未绑定，则在生成脚本变体前先自动补绑到当前项目。
  - 同时补充更明确的运行日志，便于区分“模特未真正绑定”和“脚本生成本身失败”。
- 结果：
  - 自动模式从参考视频分析跳到脚本变体阶段时，会先确保模特真实绑定到项目，再继续生成脚本变体。
  - 运行日志会明确显示是否执行了自动补绑模特。

## 2026-05-19 补充说明：复制视频脚本分析后脚本变体生成失败排查修复

- 问题：
  - 桌面端复制视频流程里，参考视频脚本分析刚完成后立即进入“生成脚本变体”时，前端会先用页面层传入的 `hasBoundModel` 和 `effectiveProductRefs` 做一次本地门禁判断。
  - 自动模式或分析后紧接着点击生成时，这两个值可能仍是旧快照，导致还没进入“自动补绑模特 / 同步商品图”的逻辑就被前端提前拦截，表现为“脚本变体生成失败”或提示缺少模特、商品图。
- 本轮最小修复：
  - 仅调整 `src/renderer/src/composables/useCloneProjectWorkspace.script.ts`。
  - 脚本变体生成前，优先从当前项目真实状态解析已绑定商品图与模特，再回退到本地草稿状态。
  - 仅在当前项目商品图与待提交商品图不一致时才执行同步，避免无意义重复保存。
  - 同时整理该文件的中文提示文案编码，避免排查时日志可读性过差。
- 结果：
  - 参考视频分析完成后，自动进入脚本变体阶段时，会正确复用项目内已绑定的商品图和模特状态。
  - 即使页面层传入的是旧快照，只要项目已真实绑定素材，脚本变体仍可继续生成。
- 使用说明：
  1. 在 Windows 开发环境中进入复制视频任务详情页。
  2. 先选择模特、上传商品图，再执行参考视频脚本分析。
  3. 分析完成后直接继续生成脚本变体，或使用自动模式继续流程。
  4. 若项目已真实绑定模特和商品图，不应再被前端提前拦截为缺少素材。
- 验证：
  - `npm run typecheck`

### 2026-05-30 桌面端 SQLite 主链路恢复

- 问题
  - 桌面端此前为了临时绕过启动阻断，把 `clone-repo` 切到了 JSON fallback。
  - 这会导致 Windows 本地开发时读取 `clone-projects.json`，而不是 `clone-projects.sqlite`，从而出现与 SQLite 最新数据不一致的问题，例如分镜图片在界面里看起来“丢失”。
- 根因
  - 当前 Electron 运行时虽然不提供 `node:sqlite`，但已经可以正常加载 `better-sqlite3`。
  - 之前把 Windows 开发态下的 `better-sqlite3` 人为禁用了，属于错误回退，不符合“直接使用 SQLite”的要求。
- 本次修复
  - 恢复 `src/main/modules/clone/sqlite.ts`、`src/main/modules/web-platform/sqlite.ts`、`src/main/modules/clone/prompt-consistency-db/client.ts` 对 `better-sqlite3` 的正常加载。
  - 移除 `src/main/modules/clone/repo.ts` 的 JSON fallback，恢复 clone 仓储以 SQLite 为主链路。
  - 桌面端重新启动后，`clone-repo` 与 `web-platform` 不再打印 `fallback to JSON` 日志。
- 使用说明
  - Windows 本地开发继续使用 `npm run dev`。
  - 当前桌面端会优先尝试 `node:sqlite`，不可用时自动回退到 `better-sqlite3`，仍然属于 SQLite 持久化，不再落回 JSON 主链路。
  - Linux 部署环境保持同样策略，优先 `node:sqlite`，回退 `better-sqlite3`。
- 验证
  - `npm run typecheck`
  - `npm run dev`

  - 桌面端手动验证：
    - 分析完成后立即点击“生成候选脚本”
    - 自动模式下从分析完成自动进入脚本变体阶段

## 2026-05-19 补充说明：Windows 桌面端复刻库 SQLite 空库导致脚本变体失败

- 问题：
  - Windows 桌面端主进程会把实际运行数据目录切到 `E:\\VideoGenerate\\userData\\.videogenerate`。
  - 当前环境里该目录下已经存在真实 `clone-projects.json`、复刻任务、模特库和商品图，但 `clone-projects.sqlite` 为空，甚至未建表。
  - `cloneRepo` 在 SQLite 可用时会优先走 SQLite，导致运行时把复刻任务、模特库读成空数据，进而在复制视频流程里表现为脚本分析后继续生成脚本变体时报错或缺少前置素材。
- 本轮最小修复：
  - 仅调整 `src/main/modules/clone/repo.ts` 的存储读取入口。
  - 在 SQLite 可用时，先确保初始化表结构。
  - 若 SQLite 为空且同目录下旧 JSON 库存在有效数据，则自动把 JSON 数据回填到 SQLite。
  - 若 SQLite 读取异常，则自动降级回 JSON，而不是直接返回空库。
- 实测结果：
  - 真实 Windows 用户目录 `E:\\VideoGenerate\\userData\\.videogenerate` 下，修复后可正确读到：
    - 13 个复刻任务
    - 4 个模特库条目
  - 对现有真实项目 `d50b25d1-a94b-49ce-8b2a-36a8e4e20fee` 直接执行 `generateScriptVariantsForProject(...)` 已成功返回 3 条脚本变体。
- 使用说明：
  1. 重启桌面端，确保主进程重新加载本轮修复后的 `cloneRepo`。
  2. 进入复制视频任务详情页。
  3. 重新执行“脚本分析 -> 生成脚本变体”，或直接在已有分析完成的任务里点击“生成候选脚本”。
  4. 若该任务本身已真实绑定模特和商品图，运行时应不再因为空库误读而失败。
- 验证：
  - `npm run typecheck`
  - 服务级真实验证：
    - 在 `E:\\VideoGenerate\\userData\\.videogenerate` 数据目录下读取复刻库成功
    - 对真实项目调用 `generateScriptVariantsForProject(...)` 成功

## 2026-05-19 补充说明：桌面端已登录 Web 账号时误把本地复刻任务当成 Web 任务

- 问题：
  - 当前桌面端只要检测到本地存在 Web 登录 token，就会在复刻详情页优先走 Web API。
  - 但很多历史复刻任务是本地桌面任务，或者不属于当前登录的 Web 账号。
  - 这时详情页读取、参考视频上传、商品图上传、模特绑定、脚本分析、脚本变体生成等动作会被 Web 平台拒绝，并返回“无权访问该任务”。
  - 用户侧表现为：
    - 任务列表能看到
    - 点击进入详情容易异常
    - 运行控制台提示“无权访问该任务”
    - 参考视频上传 / 脚本分析 / 脚本变体生成失败
- 本轮最小修复：
  - 仅调整桌面端 `src/renderer/src/composables/useCloneProjectWorkspace.*` 组合逻辑。
  - 当 Web API 返回“无权访问该任务”时，不再继续失败，而是自动回退到本地 Electron IPC 链路。
  - 覆盖的最小链路包括：
    - 项目详情读取与轮询
    - 参考视频绑定 / 上传
    - 商品图上传 / 保存
    - 模特绑定
    - 脚本分析
    - 脚本变体生成与选择
  - 同时保留详情页错误停留，不再在初始化失败时立刻强制跳回任务列表，方便继续暴露真实报错。
- 结果：
  - 已登录 Web 账号时，桌面端仍可以继续打开和操作本地复刻任务。
  - 只有真正属于当前 Web 账号的任务才继续走 Web API；被 Web 拒权的任务会自动切回本地桌面链路。
- 使用说明：
  1. 重启桌面端，确保加载最新渲染进程代码。
  2. 从任务列表打开历史本地复刻任务。
  3. 若控制台出现“当前任务不属于已登录 Web 账号，已自动回退到本地桌面任务链路”之类日志，属于预期保护行为。
  4. 后续可继续执行参考视频上传、脚本分析、脚本变体生成，不应再因 Web 拒权而中断。
- 验证：
  - `npm run typecheck`
  - 手动验证：
    - 已登录 Web 账号状态下打开本地历史复刻任务
    - 在该任务中继续执行参考视频绑定 / 脚本分析 / 脚本变体生成

## 2026-05-17 桌面端爆款视频列表支持多选批量导出成片

- 目标：
  - 在爆款视频列表页直接批量选择任务并导出已生成的成片视频。
  - 不改详情页主流程，只补列表页最小闭环。
- 本轮最小改动：
  - 在 `CloneTaskListView.vue` 的任务卡片增加选择框。
  - 页头“批量导出”按钮改为可用，并支持“全选当前列表”。
  - 新增桌面端 `clone:exportFinalVideos` IPC，由主进程统一复制成片到用户选择目录。
  - 对未生成成片或成片文件缺失的任务执行跳过，并返回导出结果汇总。
- 使用说明：
  - 进入桌面端爆款视频列表页后，可勾选一个或多个任务。
  - 点击“批量导出”后选择目标目录，系统会批量复制已生成的成片视频到该目录。
  - 没有最终成片的任务不会中断整体导出，而是自动跳过。
  - 若目标目录中存在同名文件，系统会自动追加序号，避免覆盖原文件。

## 2026-05-17 桌面端批量导出成片修复 `An object could not be cloned`

- 目标：
  - 修复爆款视频列表页批量导出成片时桌面端直接报错，导致导出无法开始的问题。
- 本轮最小改动：
  - 在 `CloneTaskListView.vue` 发起 `clone:exportFinalVideos` IPC 前，将选中的任务 ID 列表转换为纯字符串数组。
  - 同步将导出目录参数规整为普通字符串，避免把 Vue 响应式对象直接传入 Electron IPC。
  - 保持主进程导出逻辑、跳过策略和命名去重逻辑不变。
- 原因说明：
  - 批量导出时传入的是 Vue 响应式数组，Electron 在 `ipcRenderer.invoke` 进行结构化克隆时可能抛出 `An object could not be cloned`。
  - 改为传递纯净 JSON 值后，可兼容 Windows 开发环境与 Linux 部署环境。
- 使用说明：
  - 在桌面端爆款视频列表页勾选任务后，点击“批量导出”并选择目录。
  - 系统会正常进入主进程复制流程，不再在前端 IPC 调用阶段直接报 `An object could not be cloned`。

## 2026-05-17 桌面端爆款视频列表界面继续优化

- 目标：
  - 让爆款视频列表首屏层级更清晰，卡片信息更聚焦，列表看起来更像产品工作台而不是纯卡片堆叠。
- 本轮最小改动：
  - 在列表页头下方补充四个概览统计卡，展示全部、进行中、已完成、失败数量。
  - 将筛选工具栏收进统一容器，减少散点按钮感。
  - 优化任务卡片视觉层级，补充轻量信息标签与进度状态文案。
  - 保持原有分页、批量导出、新建任务和删除行为不变。
- 使用说明：
  - 进入爆款视频列表页后，首屏会先看到整体任务概览。
  - 每张任务卡会优先展示标题、描述、核心标签、进度和当前状态。
  - 筛选、搜索、排序和分页仍按原流程使用，不需要额外学习成本。

## 2026-05-17 桌面端爆款视频列表界面继续细化

- 目标：
  - 进一步增强列表页的工作台感，让卡片阅读更稳定，右侧信息栏更像辅助面板而不是普通附属卡片。
- 本轮最小改动：
  - 主列表区收进统一内容容器，弱化页面散点感。
  - 卡片增加二级摘要信息块，补充参考视频和成片就绪状态。
  - 放大封面比例，增强卡片首屏识别度。
  - 右侧说明与最近更新区域改为更稳定的吸附式辅助栏。
- 使用说明：
  - 浏览列表时，会更容易快速判断某个任务是否已有成片、参考视频来自哪里。
  - 右侧栏在宽屏下会更稳定地跟随页面，便于一边扫列表一边查看辅助信息。

## 2026-05-17 桌面端爆款视频列表右侧栏与卡片细节继续优化

- 目标：
  - 让右侧辅助区的职责更清晰，同时把任务卡头尾进一步压紧，减少松散感。
- 本轮最小改动：
  - 右侧栏新增“当前筛选”摘要卡，和“任务说明”“最近更新”组成三段式辅助面板。
  - 卡片头部、标题、底部按钮尺寸和间距继续收紧。
  - 保持列表主交互、分页、批量导出和删除行为不变。
- 使用说明：
  - 右侧栏现在可以直接看到当前筛选状态、排序方式、搜索关键词和已选任务数。
  - 卡片的浏览节奏会更紧凑，适合更高密度地扫任务。

## 2026-05-17 桌面端爆款视频列表顶部控制台继续收紧

- 目标：
  - 减少顶部统计区和筛选区的分块感，让列表页首屏更像一体化控制台。
- 本轮最小改动：
  - 将顶部统计区和筛选区通过统一边框、背景和圆角关系做成一体化面板。
  - 不改变原有筛选、搜索、排序、分页和批量导出行为。
- 使用说明：
  - 首屏顶部现在会更像一个连续的控制面板，而不是两块独立区域。
  - 统计信息和筛选操作仍保持原位置和原用途，但视觉关系更紧密。

## 2026-05-17 桌面端爆款视频列表任务卡改为媒体优先

- 目标：
  - 让任务卡更像内容生产看板，优先展示媒体预览、阶段和进度，而不是把信息平均摊在整张卡里。
- 本轮最小改动：
  - 放大任务卡封面区，作为更明确的媒体预览区域。
  - 将阶段与进度信息叠加到封面底部预览层。
  - 将任务状态移到封面上方视觉层，正文区继续保留标题、描述和辅助信息。
- 使用说明：
  - 浏览列表时，会更快先看到任务画面、当前阶段和大致推进度。
  - 卡片仍保留原有操作入口，不改变进入详情、删除、分页和批量导出流程。

## 2026-05-17 桌面端爆款视频列表顶部继续减法优化

- 目标：
  - 删除顶部无用装饰和重复说明，让页面更直观地聚焦任务总览、关键操作和当前筛选。
- 本轮最小改动：
  - 隐藏顶部装饰性 eyebrow 和 spark。
  - 将顶部统计区收紧为 3 列关键数字。
  - 去掉统计卡内辅助小字，减少首屏噪音。
- 使用说明：
  - 进入列表页后，顶部会更简洁，第一眼更容易看到关键数字和操作入口。
  - 原有筛选、搜索、批量导出和新建任务流程不受影响。

## 2026-05-17 桌面端爆款视频列表顶部统计卡专业化收紧

- 目标：
  - 让顶部统计卡更像专业后台摘要行，而不是偏展示型大卡片。
- 本轮最小改动：
  - 顶部统计卡恢复为一行 4 个。
  - 收紧统计卡间距、内边距、圆角和数字字号。
  - 保持统计信息本身不变，只调整视觉密度。
- 使用说明：
  - 顶部统计会更紧凑、更专业，适合在同一行快速扫过 4 个关键数字。

## 2026-05-17 桌面端爆款视频列表跟随系统主色并去圆角化

- 目标：
  - 让爆款视频列表页的色彩和形状语言与系统主壳层一致，不再显得像独立的紫色子系统。
- 本轮最小改动：
  - 列表页新增局部强调色变量，跟随系统主色 `--ds-primary`。
  - 将顶部、列表主体、批量条、右侧栏、分页和操作按钮的紫色渐变统一改为系统主色系。
  - 大部分卡片、按钮和列表项从厚重圆角矩形改为更硬朗的 4-8px 小圆角。
  - 右侧图标块改为更克制的描边 + 主色弱渐变，减少廉价装饰感。
- 使用说明：
  - 列表页整体会更贴近系统主界面的配色和专业感。
  - 页面结构与交互方式不变，但观感会更统一、更利落。

## 2026-05-17 桌面端爆款视频列表继续做信息减法

- 目标：
  - 继续压缩任务卡和顶部摘要的冗余信息，让列表浏览更直接、更像专业生产看板。
- 本轮最小改动：
  - 删除任务卡正文中与标签重复的元信息区，只保留标题、描述、标签、摘要、进度和操作。
  - 顶部统计卡进一步收紧尺寸，并改为更克制的主色竖向强调样式。
  - 右侧辅助图标块继续弱化装饰，改成更细的描边和更轻的高光层次。
- 使用说明：
  - 浏览任务卡时，信息层级更短，能更快判断参考视频、成片状态和当前进度。
  - 顶部摘要和右侧辅助区仍保留原有作用，但观感更紧凑、更专业。

## 2026-05-17 桌面端爆款视频列表首屏控制条继续统一

- 目标：
  - 让顶部筛选、批量状态和分页区的语言与视觉结构更一致，减少首屏零散感。
- 本轮最小改动：
  - 批量导出提示条补充独立摘要文案样式，和操作反馈做主次分离。
  - 分页区改为“当前显示区间 / 总数 / 页码”表达，和上方控制条语义统一。
  - 不改变分页、筛选、搜索、批量导出和新建任务行为。
- 使用说明：
  - 页面首屏会更像连续的控制台，不同控制条的阅读逻辑更一致。
  - 批量选择后更容易同时看懂已选数量、可导出数量和导出结果反馈。

## 2026-05-17 桌面端爆款视频列表右侧筛选摘要文案友好化

- 目标：
  - 让右侧“当前筛选”摘要卡更适合业务阅读，不直接暴露内部状态 key。
- 本轮最小改动：
  - 右侧状态摘要改为复用顶部筛选标签文案，而不是直接显示内部枚举值。
  - 排序摘要改为更完整的业务表达，如“最近更新优先”。
  - 不改变筛选、排序和搜索逻辑本身。
- 使用说明：
  - 右侧摘要卡会更容易读懂，尤其是在筛选状态切换后，不需要理解内部英文 key。

## 2026-05-17 桌面端爆款视频列表右侧筛选摘要继续分层

- 目标：
  - 让右侧摘要卡里的核心状态和辅助信息更有主次，不再像四条等权列表。
- 本轮最小改动：
  - “状态 / 排序”两项升级为主摘要样式，强调当前浏览上下文。
  - “关键词 / 已选”两项降为次摘要样式，保留信息但降低视觉抢占。
  - 不改变右侧摘要卡的数据来源和交互行为。
- 使用说明：
  - 右侧摘要卡会更容易一眼先看到当前状态和排序，再补充看搜索关键词和已选数量。

## 2026-05-17 桌面端爆款视频列表右侧最近更新继续压紧

- 目标：
  - 让右侧“最近更新”列表的卡片密度和摘要卡节奏更一致，减少整列松散感。
- 本轮最小改动：
  - 收紧最近更新列表项间距、内边距和缩略图尺寸。
  - 底部“查看全部任务”按钮同步降低高度与上方列表节奏保持一致。
  - 不改变最近更新列表的排序、跳转和图片回显逻辑。
- 使用说明：
  - 右侧整列会更紧凑，扫描最近更新任务时更像同一组辅助面板，而不是独立大卡片堆叠。

## 2026-05-17 桌面端爆款视频列表右侧辅助提示色系统一

- 目标：
  - 让右侧卡头里的辅助提示文字和整页主色体系保持一致，不再出现孤立的旧紫色提示色。
- 本轮最小改动：
  - 将右侧卡头说明小字改为主色弱强调混合色。
  - 将“实时摘要”“按更新时间展示”这类辅助提示改为同一套主色弱强调，并略微提高字重。
  - 不改变右侧卡片结构和交互行为。
- 使用说明：
  - 右侧整列的辅助提示会更统一，不会再出现和页面主色脱节的提示文字。

## 2026-05-17 桌面端爆款视频列表右侧说明卡继续硬朗化

- 目标：
  - 让右侧“任务说明”三项辅助卡和整列摘要卡保持一致，不再保留偏旧版的大圆角说明块观感。
- 本轮最小改动：
  - 将右侧说明卡的圆角从大圆角继续收紧为小圆角。
  - 同步压缩内边距、标题字重和说明文字尺寸。
  - 不改变右侧说明卡的内容和布局结构。
- 使用说明：
  - 右侧“任务说明”会更像专业辅助面板的一部分，和上方筛选摘要、下方最近更新的节奏更一致。

## 2026-05-17 桌面端爆款视频列表顶部区域继续精简

- 目标：
  - 压缩列表页顶部首屏高度，让标题、操作和统计更直接，不再被说明文案和容器包装占据太多空间。
- 本轮最小改动：
  - 移除标题下方的说明文案，只保留页面标题。
  - 收紧页头和统计区之间的间距，并去掉统计区外层的独立包裹感。
  - 顶部 4 个统计卡继续缩短高度和数字字号。
- 使用说明：
  - 进入列表页后，顶部首屏会更薄，第一眼更容易聚焦到操作区和统计结果。

## 2026-05-17 桌面端爆款视频列表顶部统计继续摘要条化

- 目标：
  - 让顶部 4 个统计项更像表头摘要条，而不是独立展示卡片。
- 本轮最小改动：
  - 将统计卡改为更低高度的横向摘要结构。
  - 继续收紧圆角、边框和数字字号。
  - 不改变统计内容本身。
- 使用说明：
  - 顶部统计会更像一排专业后台摘要条，视觉上更轻，也更节省首屏空间。

## 2026-05-17 全局顶部栏继续精简优化

- 目标：
  - 让工作台全局顶部栏更薄、更整齐，减少按钮和状态块的体积感。
- 本轮最小改动：
  - 收紧全局顶栏高度、左右留白和各区块间距。
  - 压缩搜索框、状态摘要、设计联调按钮和右侧操作按钮的高度、圆角和字号。
  - 保持帮助、通知、钱包、更多等入口功能不变，只优化视觉密度。
- 使用说明：
  - 顶部栏会更像一条专业工作台导航，而不是一排偏大的独立按钮。

## 2026-05-17 全局顶部栏视觉收口优化

- 目标：
  - 解决顶部栏按钮块感过重、搜索区与右侧操作区彼此割裂的问题。
- 本轮最小改动：
  - 将通知和设置归入同一组轻量工具容器，弱化一排独立按钮的堆叠感。
  - 压缩搜索框、新建项目按钮和用户卡的高度、圆角、字号与阴影。
  - 保持原有入口与交互不变，只调整顶部栏视觉密度和统一性。
- 使用说明：
  - 顶部栏现在会更接近一体化工作台控制条，首屏观感更紧凑，功能位置不变。

## 2026-05-18 视频批量加字幕桌面端黑屏与交互恢复

- 目标：
  - 修复桌面端 `视频批量加字幕` 工作台黑屏。
  - 恢复上传后预览、结果区点击、步骤条状态和常用按钮的真实交互。
- 本轮最小改动：
  - 仅重整 `src/renderer/src/ui/views/VideoBatchSubtitleView.vue` 页面实现。
  - 不改批量字幕主进程渲染逻辑，不改 GeeLark 发布接口，不扩散到其他页面。
- 修复内容：
  - 清理原页面中被污染的模板和脚本，避免运行时渲染异常导致整页黑屏。
  - 恢复中间视频预览、预览失败提示、顶部“教程与示例”、底部“全部查看”、任务“载入”、结果卡“查看视频 / 打开目录”。
  - 将四步流程条改为更明确的状态型步骤条，完成态和当前态视觉更明显。
  - 结果区支持直接打开输出视频，并可定位到输出目录，便于查看字幕成片保存位置。
- 使用说明：
  - 渲染完成后，可在右下输出结果区点击卡片或“查看视频”直接打开成片。
  - 点击“打开目录”可直接定位到本次字幕成片文件所在目录。
  - 如果某条输出失败，结果卡会展示失败状态和错误信息，不会误点空结果。
- 验证方式：
  - `npm run typecheck`

## 2026-05-20 /clone 商品输入改为商品库绑定 + 商品库级共享标准源缓存

- 目标：
  - `/clone` 不再以每次临时上传商品图作为主入口，统一改为绑定全局商品库商品。
  - `Product Canonical Source` 升级为商品库级共享缓存，多个 clone 项目共享复用。
- 本轮最小改动：
  - 复用现有 `products` 模块与 IPC，不新建独立 clone 商品库。
  - 仅增加 `Product` 级缓存字段、clone 绑定接口和 `/clone` 商品区交互改造。
- 修复内容：
  - `/clone` 项目绑定商品时保存 `productId`。
  - 绑定时自动读取该商品全部可用图片，作为项目的原图快照。
  - 商品库新增共享标准源缓存字段：
    - `canonicalSourcePath`
    - `canonicalSourceStatus`
    - `canonicalSourcePrompt`
    - `canonicalSourceDiagnostics`
    - `canonicalSourceUpdatedAt`
    - `canonicalSourceSourceSignature`
  - 标准源缓存命中时直接复用；缺失或签名失效时按需重建并回写商品库。
  - `/clone` 项目继续保存当次快照：
    - `originalProductReferenceImagePaths`
    - `sanitizedProductReferenceImagePaths`
    - `productReferenceImagePaths`
  - 历史项目默认继续使用自己的快照，不会被商品库缓存更新静默覆盖。
  - `/clone` 商品区主入口改为“选择商品库商品 + 绑定商品”，不再要求每次重新上传商品图。
- 使用说明：
  - 先在商品库维护商品图片素材。
  - 在 `/clone` 中先完成参考视频分析，再选择并绑定商品库商品。
  - 绑定后系统会自动复用或生成该商品的共享 `Product Canonical Source`，并保存到当前项目快照。
  - 后续脚本、分镜图片、分镜视频都基于项目快照运行，保证历史任务可回放。
- Windows / Linux 兼容说明：
  - 本轮仅调整 TypeScript 主进程、仓储和桌面端渲染层逻辑，不引入新的平台专属依赖。
  - Windows 开发测试与 Linux 部署运行逻辑保持一致。
- 验证方式：
  - `npm run typecheck`

## 2026-05-20 商品库导航独立入口

- 目标：
  - 将商品库从“生产”混合入口中拆出，作为主侧边栏独立菜单管理。
  - 导航层级与“模特库”保持一致，便于 `/clone` 绑定商品时快速进入商品库维护素材。
- 本轮最小改动：
  - 仅调整桌面端主侧边栏文案与激活逻辑，不重做商品库页内部结构。
- 修复内容：
  - 主导航中 `/products` 的菜单标签改为“商品库”。
  - “模特”菜单同步收口为“模特库”，与商品库形成同级资源库入口。
  - “商品库”激活态只跟 `/products` 路由绑定，不再混入模板、任务等生产页高亮。
- 使用说明：
  - 现在可直接通过左侧主菜单进入“商品库”管理商品素材。
  - `/clone` 中若缺少商品，可先进入商品库维护，再回到 clone 绑定。
- 验证方式：
  - `npm run typecheck`

## 2026-05-20 商品库改为独立管理页面

- 目标：
  - 将 `/products` 从原先偏“生产工作区”的混合页面改成真正的商品库独立管理页。
  - 管理形态与模特库保持一致：独立资源库入口、独立页头、左侧资源列表、右侧详情与素材管理。
- 本轮最小改动：
  - 仅重构 `ProductsView.vue` 页面骨架与信息架构。
  - 保留现有商品、段位、素材导入、切分、多选删除等核心能力，不重做底层商品数据结构。
- 修复内容：
  - 去除商品库页顶部 `ProductionTabs` 生产工作区壳。
  - 新增商品库独立页头：
    - 商品总数
    - 当前商品素材数
    - 当前段位素材数
  - 页面改为双栏独立管理结构：
    - 左侧：商品列表与新建商品
    - 右侧：当前商品详情、段位、素材视图和工具操作
  - 页面文案明确收口到“商品库”“独立商品管理”，不再使用“生产模块”表述。
- 使用说明：
  - 进入左侧主菜单“商品库”即可独立管理商品。
  - `/clone` 需要绑定商品时，先在商品库维护好商品素材，再回到 clone 选择绑定。
- 验证方式：
  - `npm run typecheck`

## 2026-05-21 生产模块与商品库模块拆分纠偏

- 目标：
  - 修正导航信息架构，明确“生产”和“商品库”是两个并列模块。
  - 避免将商品库误当作生产模块入口。
- 本轮最小改动：
  - 仅调整桌面端主导航和 `/production` 路由落点。
  - 不重做生产页与商品库页内部逻辑。
- 修复内容：
  - 主导航恢复独立“生产”菜单。
  - “商品库”保留为独立资源管理菜单。
  - `/production` 不再重定向到 `/products`，改为落到现有生产执行页链路。
  - 主导航高亮逻辑拆分：
    - 生产：`/production`、`/tasks`、`/templates`
    - 商品库：`/products`
- 使用说明：
  - 生产相关操作从“生产”进入。
  - 商品素材维护从“商品库”进入。
  - `/clone` 需要商品时，先进入商品库维护，再返回 clone 绑定。
- 验证方式：
  - `npm run typecheck`

## 2026-05-21 生产模块独立总览页落地

- 目标：
  - 将 `/production` 从临时跳转入口升级为正式独立生产总览页。
  - 让生产相关首页快捷入口先进入生产模块，而不是直接散落到任务/模板页。
- 本轮最小改动：
  - 新增 `ProductionHomeView` 作为生产模块首页壳。
  - 不重做 `TasksView`、`TemplatesView` 内部业务。
- 修复内容：
  - `/production` 正式落到独立总览页。
  - 总览页固定承接：
    - 任务执行入口
    - 模板管理入口
    - 任务总数 / 运行中 / 模板数摘要
    - 生产与商品模块边界说明
  - 首页中的生产类快捷卡片默认导向 `/production`。
  - 商品库页的显性说明文案继续收口到“商品库内部管理”语义。
- 使用说明：
  - 用户进入“生产”后，先看到生产模块总览，再进入任务中心或模板中心。
  - 商品相关维护仍只在商品库进行。
- 验证方式：
  - `npm run typecheck`

## 2026-05-20 分镜视频列表表格遮挡修复

- 目标：
  - 修复桌面端 `/clone -> 分镜视频` 列表在列数较多时，右侧操作列被遮住、内容显示不完整的问题。
- 本轮最小改动：
  - 仅调整 `src/renderer/src/ui/views/CloneView.vue` 的分镜视频表格结构与局部滚动容器。
  - 不改数据逻辑，不改主进程接口。
- 修复内容：
  - 为分镜视频表头和表体新增统一横向滚动壳 `shot-reference-scroll`。
  - 为 `shot-reference-header / shot-reference-row` 设置最小宽度，避免在中等桌面宽度下被主容器硬压缩。
  - `shot-table-body--reference` 允许按内容宽度展开，交由外层横向滚动显示完整列。
- 使用说明：
  - 在桌面端进入 `分镜视频` 阶段后，若当前窗口宽度不足，表格会出现横向滚动，而不是直接把右侧列裁掉。
- Windows / Linux 兼容说明：
  - 本轮仅调整 Electron 渲染层样式与模板结构，不依赖 Windows 专属 API。
  - Windows 开发测试与 Linux 打包部署逻辑保持一致。
- 验证方式：
  - `npm run typecheck`

## 2026-05-20 分镜视频提示词预览与脚本对齐修复

- 目标：
  - 让桌面端 `/clone` 分镜视频阶段像分镜图片阶段一样可直接查看实际视频提示词。
  - 修复分镜视频生成更偏旧 `aiPrompt`、与当前脚本内容 `scriptText / generationPrompt` 对不上的问题。
- 本轮最小改动：
  - 仅补充分镜视频提示词预览接口与桌面端预览弹窗。
  - 仅调整分镜视频生成时 `buildStructuredShotPrompt(...)` 的脚本字段优先级。
  - 不改视频 provider 接口，不改任务存储结构。
- 修复内容：
  - 新增主进程接口：
    - `clone:getShotVideoPromptPreview`
  - 新增桌面端视频列表每条镜头的 `提示词` 按钮。
  - 新增“视频提示词预览”弹窗，展示：
    - `Script Text`
    - `Generation Prompt`
    - `Video Positive Prompt`
    - `Video Negative Prompt`
    - 商品描述高亮
  - 分镜视频实际生成时，`productPoints` 改为优先拼接：
    - `generationPrompt`
    - `scriptText`
    - `visualDescription`
    - `actionDescription`
    - `cameraDescription`
    - 其次才回退到 `aiPrompt / materialNeed`
  - 目的：让视频模型真正更贴近当前脚本镜头信息，而不是被旧 prompt 残留带偏。
- 使用说明：
  - 在桌面端 `/clone -> 分镜视频` 列表中，点击某条镜头右侧 `提示词`。
  - 可直接对照当前镜头脚本与实际喂给视频模型的 prompt 是否一致。
- Windows / Linux 兼容说明：
  - 本轮仅调整 TypeScript 主进程接口与 Electron 渲染层展示逻辑，不依赖 Windows 专属 API。
  - Windows 开发测试与 Linux 打包部署逻辑保持一致。
- 验证方式：
  - `npm run typecheck`

## 2026-05-20 分镜视频重新生成按钮防重复点击提示

- 目标：
  - 修复桌面端 `/clone` 分镜视频列表中，用户点击“重新生成”后缺少即时反馈，容易连续多次点击的问题。
- 本轮最小改动：
  - 仅调整 `src/renderer/src/ui/views/CloneView.vue` 的按钮交互与本地提示状态。
  - 不改主进程接口，不改分镜视频生成逻辑。
- 修复内容：
  - 为每个 `shotId` 增加本地 `重新生成中` 状态。
  - 用户点击“重新生成”后：
    - 立即写入阶段日志提示：`已提交重新生成，正在处理中，请勿重复点击`
    - 当前镜头按钮立即禁用
    - 按钮文案切换为 `重新生成中…`
  - 若同一镜头在处理中再次触发点击，会提示：`正在重新生成，请不要重复点击`
- 使用说明：
  - 在分镜视频列表点击某条镜头的 `重新生成` 后，按钮会立刻变成 `重新生成中…`。
  - 在请求返回前，当前按钮不可再次点击。
- Windows / Linux 兼容说明：
  - 本轮仅调整 Electron 渲染层本地状态与提示文案，不依赖 Windows 专属 API。
  - Windows 开发测试与 Linux 打包部署逻辑保持一致。
- 验证方式：
  - `npm run typecheck`

## 2026-05-20 分镜视频批量重试按钮防重复点击提示

- 目标：
  - 修复桌面端 `/clone` 分镜视频阶段顶部“重新生成失败项”按钮点击后缺少即时反馈，容易被连续重复点击的问题。
- 本轮最小改动：
  - 仅调整 `src/renderer/src/ui/views/CloneView.vue` 的批量按钮本地交互状态。
  - 不改主进程批量逻辑，不改任务协议。
- 修复内容：
  - 新增批量状态位 `regeneratingFailedShotVideos`。
  - 点击 `重新生成失败项` 后：
    - 立即写阶段日志：`已提交 N 个失败分镜重新生成，正在处理中，请勿重复点击`
    - 按钮立即禁用
    - 按钮文案切换为 `重新生成中… N`
  - 若批量处理中再次点击，会提示：`失败分镜正在批量重新生成，请不要重复点击`
- 使用说明：
  - 在分镜视频列表顶部点击 `重新生成失败项` 后，按钮会立即进入处理中状态，直到本轮批量重试结束。
- Windows / Linux 兼容说明：
  - 本轮仅调整 Electron 渲染层本地状态与提示文案，不依赖 Windows 专属 API。
  - Windows 开发测试与 Linux 打包部署逻辑保持一致。
- 验证方式：
  - `npm run typecheck`

## 2026-05-20 桌面端分镜提示词预览重启阻塞修复与版本哨兵确认

- 目标：
  - 修复桌面端开发态因重复注册 `clone:getShotImagePromptPreview` IPC 导致主进程启动异常的问题。
  - 确保 `/clone` 分镜提示词预览实际加载到最新主进程代码，并可通过版本哨兵确认。
- 本轮最小改动：
  - 仅调整 `src/main/index.ts` 的重复 IPC 注册。
  - 不改提示词拼装逻辑，不改前端交互结构，不扩散到无关模块。
- 修复内容：
  - 删除重复的 `ipcMain.handle('clone:getShotImagePromptPreview', ...)` 注册，只保留一处有效绑定。
  - 保留后端 `promptBuildSentinel` 返回字段与前端哨兵展示，用于确认桌面端是否已切到最新进程。
- 使用说明：
  - Windows 桌面端重启后，进入 `/clone` 分镜设计，打开任意分镜的 `提示词` 预览弹窗。
  - 弹窗中应能看到：
    - `哨兵：shot-image-prompt-2026-05-20-v3`
  - 若看不到该哨兵，说明当前桌面端仍未加载到最新主进程代码，需要继续排查旧进程或旧构建残留。
- Windows / Linux 兼容说明：
  - 本轮仅调整 Electron 主进程 IPC 注册，不依赖 Windows 专属 API。
  - Windows 开发测试与 Linux 打包部署逻辑保持一致。
- 验证方式：
  - `npm run typecheck`
  - `npm run dev`

## 2026-05-20 桌面端分镜提示词核心块显式返回修复

- 目标：
  - 修复桌面端“提示词预览里明明有商品描述生成链路，但前端仍显示商品描述缺失”的误判问题。
- 根因：
  - 前端此前通过字符串截取 `Start Prompt / End Prompt` 来猜测商品描述块和模特锁是否存在。
  - 当后端 prompt 精简、换行变化或块顺序调整时，前端容易提取失败，造成“核心块缺失”的假告警。
- 本轮最小改动：
  - 仅收口 `/clone` 分镜提示词预览接口返回值与桌面端预览弹窗诊断逻辑。
  - 不改图片生成主链路，不改分镜页面结构。
- 修复内容：
  - `src/main/modules/clone/service.ts`
    - `getShotImagePromptPreview(...)` 直接返回：
      - `productDescriptionBlock`
      - `modelIdentityBlock`
      - `referenceResponsibilityBlock`
      - `hasCompiledProductLock`
      - `hasProductDescriptionBlock`
      - `hasModelIdentityBlock`
  - `src/renderer/src/ui/views/CloneView.vue`
    - 提示词预览诊断改为优先消费后端显式返回的核心块布尔值。
    - 商品描述高亮改为直接展示后端返回的 `productDescriptionBlock`。
    - 新增模特身份锁高亮区，直接展示后端返回的 `modelIdentityBlock`。
    - 不再依赖脆弱的字符串切片作为唯一判断依据。
- 使用说明：
  - 桌面端打开 `/clone` 分镜设计的 `提示词` 弹窗后：
    - 若后端已有商品描述，会在“商品描述高亮”中直接显示。
    - 若后端已有模特锁，会在“模特身份锁高亮”中直接显示。
    - 即使整段 prompt 文案继续精简，诊断也不应再误报缺失。
- Windows / Linux 兼容说明：
  - 本轮仅调整 TypeScript 主进程返回结构与 Electron 渲染层展示逻辑，不依赖 Windows 专属 API。
  - Windows 开发测试与 Linux 打包部署逻辑保持一致。
- 验证方式：
  - `npm run typecheck`
  - `npm run dev`

## 2026-05-20 分镜图提示词核心块前置与长度收紧

- 目标：
  - 在商品描述已经存在的前提下，进一步降低分镜图 prompt 因长度偏高而截断核心块的风险。
- 本轮最小改动：
  - 仅调整 `src/main/modules/clone/gptImage.ts` 的 GPT 分镜图 prompt 组装顺序与少量重复文案。
  - 不改接口协议，不改页面结构，不改商品分析链路。
- 修复内容：
  - 将 `TEXT PRODUCT DESCRIPTION LOCK` 前移到 `STRICT PRODUCT IDENTITY LOCK FOR THIS FRAME` 之前，确保商品结构文本更早进入 prompt。
  - 保留 `STRICT MODEL IDENTITY LOCK` 紧跟在核心商品锁之后。
  - 压缩部分重复约束文案，例如：
    - talking-head 约束
    - camera view / crop 重复句
    - 末尾风格包装句
  - 将部分低优先级规则后移，例如 `productLock(productType)`，把前部预算优先留给核心锁定块。
- 结果：
  - 核心顺序进一步收口为：
    - 全局静默商业片规则
    - 分镜 opening / ending 指令
    - 跨镜头单实例锁
    - 商品描述锁
    - 本帧商品 identity 锁
    - 模特身份锁
  - 在相同长度预算下，核心块更靠前，被截断的概率更低。
- 使用说明：
  - 桌面端重新打开分镜 `提示词` 预览，查看 `Start Prompt / End Prompt` 顶部顺序与总长度变化。
- Windows / Linux 兼容说明：
  - 本轮仅调整 TypeScript 文本拼装逻辑，不依赖 Windows 专属 API。
  - Windows 开发测试与 Linux 打包部署逻辑保持一致。
- 验证方式：
  - `npm run typecheck`
  - `npm run dev`

## 2026-05-20 分镜图商品描述锁切换为紧凑版

- 目标：
  - 在不丢失商品结构锁定能力的前提下，进一步压缩分镜图 prompt 长度，降低截断风险。
- 根因：
  - 当前长度主要被 `TEXT PRODUCT DESCRIPTION LOCK` 中的完整商品分析文本占用。
  - 其中 `surface details`、`matching rules` 等字段对“锁结构”帮助次于主体、连接结构、材质、颜色、几何和尺寸。
- 本轮最小改动：
  - 仅调整 `src/main/modules/clone/service.ts` 中分镜图 prompt 使用的商品描述文本版本。
  - 不修改商品分析原始落库结果，不影响其他消费完整商品分析文本的流程。
- 修复内容：
  - `buildProductStructureDescription(...)` 新增 `compact` 模式。
  - 新增 `buildCompactProjectProductAnalysisText(...)`，仅保留：
    - `Category`
    - `Core subject / Summary`
    - `Connection structure`
    - `Material details`
    - `Wearing/display position`
    - `Color details`
    - `Geometry details`
    - `Size/scale`
  - `getShotImagePromptPreview(...)` 改为对分镜图 prompt 使用紧凑版商品描述锁。
- 结果：
  - 商品描述仍在 prompt 最前部。
  - 但其自身长度显著下降，给后续 `STRICT PRODUCT IDENTITY LOCK` 与 `STRICT MODEL IDENTITY LOCK` 留出更多预算。
- 使用说明：
  - 桌面端重新打开 `/clone` 分镜 `提示词` 弹窗后，可继续对比：
    - `Start 长度`
    - `End 长度`
    - 商品描述高亮内容是否仍覆盖结构锁定核心信息
- Windows / Linux 兼容说明：
  - 本轮仅调整 TypeScript 文本组装逻辑，不依赖 Windows 专属 API。
  - Windows 开发测试与 Linux 打包部署逻辑保持一致。
- 验证方式：
  - `npm run typecheck`
  - `npm run dev`

## 2026-05-20 分镜图片提示词缓存失效修复

- 目标：
  - 修复 `/clone` 分镜图片阶段在商品锁描述、模特锁或最终编译提示词已经变化时，仍直接复用旧缓存图片，表现为“提示词看起来没带商品描述、也没有重新调用图片生成接口”的问题。
- 本轮最小改动：
  - 仅调整主进程分镜图片生成缓存键计算与提示词复用逻辑。
  - 不改页面结构，不改前后端接口协议，不新增 UI 开关。
- 实现说明：
  - `src/main/modules/clone/service.ts`
    - 在实际发起分镜首帧/尾帧生成前，先显式生成 `startPrompt` 与 `endPrompt`。
    - 统一复用同一份 `productAnalysisText`，避免缓存计算与真实请求使用不同文本来源。
    - 图片缓存键 `imagePromptHash` 现在额外纳入：
      - 实际正向 prompt
      - 实际负向 prompt
  - `src/main/modules/clone/cache.ts`
    - 扩展 `computeImagePromptHash(...)`，将 `positivePrompt` 与 `negativePrompt` 纳入哈希。
- 结果：
  - 当商品描述、产品结构分析、模特身份锁或 prompt consistency 编译结果变化时，旧分镜图缓存会自然失效。
  - 分镜图片会重新走真实图片生成链路，而不是误命中旧缓存，因此不再表现成“没有调接口”。
- 使用说明：
  - 进入 `/clone/[projectId]` 的分镜图片阶段后，重新生成对应分镜即可。
  - 无需额外配置；只要 prompt 或锁定信息发生变化，系统会自动重新请求图片生成。
- Windows / Linux 兼容说明：
  - 本轮仅调整 TypeScript 主进程纯逻辑，不依赖 Windows 专属 API。
  - Windows 开发测试与 Linux 部署可共用同一实现。
- 验证方式：
  - `npm run typecheck`

## 2026-05-20 分镜图片商品描述被提示词清洗误删修复

- 目标：
  - 修复桌面端 `/clone` 分镜图片提示词中“始终没有商品描述”的问题。
- 根因：
  - 分镜图片 prompt 最终会经过 `sanitizeGeneratedVideoPrompt(...)` 清洗。
  - 该清洗逻辑会过滤 CJK 文本，只保留英文式 prompt 行。
  - 但商品结构分析 `analyzeProductStructureWithGrs(...)` 之前按项目语言输出：
    - `zh-CN` 输出中文
    - `vi-VN` 输出越南语
  - 结果商品分析文本虽然进入了 `buildGptFramePrompt(...)`，但在清洗阶段被整段删除，最终表现为“提示词没有商品描述”。
- 本轮最小改动：
  - `src/main/modules/clone/aiScriptAnalyzer.ts`
    - 商品结构分析固定输出英文，确保可直接注入图片提示词。
  - `src/main/modules/clone/service.ts`
    - 新增旧分析结果刷新判定。
    - 若历史项目里的 `productAnalysis` 仍包含中文/日文/韩文等 CJK 内容，则在分镜预览与分镜图生成前自动重新分析，替换为英文商品描述。
- 结果：
  - 新项目生成的商品结构分析可稳定进入分镜图片 prompt。
  - 老项目无需手工清库；再次打开分镜提示词预览或重新生成分镜图时，会自动修复旧的非英文商品分析。
- 使用说明：
  - 桌面端进入 `/clone/:projectId`。
  - 点击分镜提示词预览或重新生成分镜图即可触发自动修复。
  - 无需额外页面操作或配置开关。
- Windows / Linux 兼容说明：
  - 本轮仅调整 TypeScript 主进程提示词与分析逻辑，不依赖 Windows 专属 API。
  - Windows 开发测试与 Linux 部署可共用。
- 验证方式：
  - `npm run typecheck`

## 2026-05-20 商品描述前移到参考分析阶段

- 目标：
  - 在桌面端 `/clone` 主链路中，用户上传参考视频、模特、商品图片并执行“参考视频分析”后，就提前生成商品结构描述，供后续脚本、分镜图片、分镜视频统一复用。
- 本轮最小改动：
  - 仅调整主进程参考分析完成后的衔接逻辑。
  - 不改页面结构，不新增额外按钮，不改前后端接口协议。
- 实现说明：
  - `src/main/modules/clone/service.ts`
    - 在 `createCloneBlueprintFromReference(...)` 完成参考视频分析并写入 blueprint 后：
      - 立即收集当前项目已保存的商品参考图
      - 自动推断当前商品类型
      - 立即调用 `ensureProjectProductAnalysis(...)`
    - 这样商品结构分析会在“参考分析阶段”就写入：
      - `project.baseBlueprint.consistencyAssets.productAnalysis`
      - `project.blueprint.consistencyAssets.productAnalysis`
- 结果：
  - 后续进入脚本变体、分镜图片提示词预览、分镜图片生成、分镜视频生成时，都可直接复用已经存在的商品描述。
  - 避免把商品分析延迟到分镜阶段才首次补算，减少链路后半段才暴露问题的情况。
- 使用说明：
  - 桌面端在上传商品图后，执行“分析脚本 / 参考视频分析”即可。
  - 若当前项目已绑定商品图，分析完成后系统会自动生成商品描述，无需再到后续阶段补触发。
- Windows / Linux 兼容说明：
  - 本轮仅调整 TypeScript 主进程业务编排，不依赖 Windows 专属 API。
  - Windows 开发测试与 Linux 部署可共用。
- 验证方式：
  - `npm run typecheck`

## 2026-05-20 分镜图片提示词商品描述前置防截断

- 目标：
  - 修复分镜图片实际生成 prompt 中“商品描述已存在但最终看不到”的问题。
- 根因：
  - `buildGptFramePrompt(...)` 最终通过 `prependSilentCommercialGlobalRule(..., 2200)` 做统一清洗和长度裁剪。
  - 之前商品描述 `buildProductDescriptionLockText(...)` 与编译后的产品锁 `compiledPrompt` 排位不够靠前。
  - 当镜头约束、模特锁、参考锁、脚本锁内容较长时，后半段会被 2200 字符上限直接截断，导致商品描述在最终 prompt 中消失。
- 本轮最小改动：
  - `src/main/modules/clone/gptImage.ts`
    - 调整 `buildGptFramePrompt(...)` 的组装顺序：
      - 先放 `compiledPrompt`
      - 再放 `buildProductDescriptionLockText(...)`
      - 再放模特锁、参考职责、产品类别锁等次级信息
- 结果：
  - 即使 prompt 很长，商品描述与严格产品锁也会优先保留在最终分镜图片生成 prompt 中。
  - 后置的补充说明若被裁剪，也不会再把最关键的商品身份描述裁掉。
- 使用说明：
  - 重新打开分镜图片提示词预览或重新生成分镜图即可生效。
- Windows / Linux 兼容说明：
  - 本轮仅调整 TypeScript 主进程 prompt 组装顺序，不依赖 Windows 专属 API。
  - Windows 开发测试与 Linux 部署可共用。
- 验证方式：
  - `npm run typecheck`

## 2026-05-20 分镜图片提示词精简收口

- 目标：
  - 缩短分镜图片实际生成 prompt，减少被长度上限截断的风险。
  - 去除重复表达，优先保留最核心的商品锁、模特锁、参考锁和镜头连续性信息。
- 本轮最小改动：
  - 仅调整 `buildGptFramePrompt(...)` 的文案结构和长度上限。
  - 不改接口协议，不改页面结构，不改图片生成调用方式。
- 精简原则：
  - 必留：
    - `compiledPrompt`
    - `TEXT PRODUCT DESCRIPTION LOCK`
    - 模特身份锁
    - 产品/人物职责边界
    - 分镜连续性
    - 参考动作与构图
  - 压缩：
    - 重复的 silent / no speaking / product lock / model lock 句子
    - 重复的“不要 redesign / 不要 talking head / 不要 product-only still”近义表达
    - 冗长的补充修辞
  - 后置：
    - 风格性、包装性、口语化的次级说明
- 实现说明：
  - `src/main/modules/clone/gptImage.ts`
    - 压缩 `buildCrossShotInstanceLock(...)`
    - 压缩 `buildReferenceResponsibilityText(...)`
    - 压缩 `buildProductDescriptionLockText(...)`
    - 压缩 continuity / supplement 文案
    - 将 `prependSilentCommercialGlobalRule(..., 2200)` 收紧为 `1800`
- 结果：
  - prompt 更短、更硬、更少重复。
  - 被保留的优先级顺序更清晰：
    - 商品严格锁
    - 商品描述
    - 模特锁
    - 参考职责
    - 连续性与参考镜头
    - 镜头补充说明
- 使用说明：
  - 桌面端重新打开提示词预览或重新生成分镜图即可看到新的精简版 prompt。
- Windows / Linux 兼容说明：
  - 本轮仅调整 TypeScript 主进程字符串组装逻辑，不依赖 Windows 专属 API。
  - Windows 开发测试与 Linux 部署可共用。
- 验证方式：
  - `npm run typecheck`

## 2026-05-20 脚本生成前补齐商品描述

## 2026-05-20 分镜视频提示词显式注入脚本文本

- 目标：
  - 修复桌面端 `/clone` 分镜视频提示词预览中，`Video Positive Prompt` 未明确包含 `Script Text` 语义的问题。
  - 保证实际提交给视频模型的正向提示词，不只是展示层看到脚本，而是真正把脚本内容前置进入生成约束。
- 根因：
  - 分镜视频实际 prompt 由 `src/main/modules/clone/providers.ts` 的 `buildRealisticPrompt(..., 'video')` 拼装。
  - 旧逻辑主要依赖 `aiPrompt / generationPrompt / prompt.positive` 作为场景描述，没有把 `shot.scriptText` 作为显式脚本执行块插入最终正向提示词。
  - 结果是桌面端弹窗能展示 `Script Text`，但 `Video Positive Prompt` 本身仍偏泛化，脚本语义不够清晰。
- 本轮最小改动：
  - 仅调整主进程 `clone` 视频 prompt 拼装逻辑与提示词版本哨兵。
  - 不改前端页面结构，不改 IPC 协议，不扩散到图片 prompt。
- 修复内容：
  - `src/main/modules/clone/providers.ts`
    - 为 `phase === 'video'` 新增显式 `scriptExecutionBlock`。
    - 将以下内容压缩后前置注入最终正向提示词：
      - `shot.scriptText`
      - `shot.generationPrompt`
      - `buildShotScriptConstraintText(shot)` 生成的脚本约束摘要
    - 注入顺序位于通用 realism 之后、scene direction 之前，确保脚本语义更早进入模型注意力。
  - `src/main/modules/clone/service.ts`
    - 将分镜视频提示词预览哨兵升级为 `shot-video-prompt-2026-05-20-v2`，便于桌面端确认已加载新 prompt 版本。
- 结果：
  - 桌面端“分镜视频提示词”弹窗中的 `Video Positive Prompt` 会明确出现脚本执行语义，而不是只保留泛化写实描述。
  - 实际视频生成时，脚本内容会更直接参与模型生成，不再只依赖展示层或隐含场景文案。
- 使用说明：
  - 重新打开桌面端后，进入 `/clone` 任务详情页。
  - 打开分镜视频提示词弹窗，确认 `Prompt Build Sentinel` 为 `shot-video-prompt-2026-05-20-v2`。
  - 查看 `Video Positive Prompt`，应能直接看到 `Script text to execute faithfully in this clip` 等脚本执行段落。
- Windows / Linux 兼容说明：
  - 本轮仅修改 TypeScript 主进程字符串拼装逻辑，不依赖 Windows 专属 API。
  - Windows 开发测试与 Linux 部署运行逻辑一致。

## 2026-05-20 分镜视频重新生成提交弹窗提示

- 目标：
  - 修复桌面端 `/clone` 分镜视频页点击“重新生成”后，只有局部日志变化、没有任何即时弹窗反馈的问题。
  - 降低用户因未感知提交成功而连续重复点击的概率。
- 本轮最小改动：
  - 仅调整 `src/renderer/src/ui/views/CloneView.vue` 的重新生成交互提示。
  - 不改主进程接口，不改重新生成执行链路，不新增全局通知系统。
- 修复内容：
  - 单个分镜视频点击“重新生成”时：
    - 立即弹出系统提示：已提交重新生成，正在处理中，请勿重复点击。
  - 若同一分镜已在重新生成中，再次点击时：
    - 立即弹出系统提示：正在重新生成，请不要重复点击。
  - 点击“重新生成失败项”批量重试时：
    - 立即弹出系统提示，告知已提交批量重新生成。
  - 若批量任务已在执行，再次点击时：
    - 立即弹出系统提示，告知不要重复点击。
- 使用说明：
  - 桌面端在分镜视频列表点击 `重新生成` 或 `重新生成失败项` 后，会立刻看到提示弹窗。
  - 原有按钮禁用态、文案 `重新生成中…` 和阶段日志仍然保留。
- Windows / Linux 兼容说明：
  - 本轮仅使用渲染层标准 `window.alert`，Windows 开发测试可直接验证。
  - Linux 打包环境同样可用，不依赖平台专属 API。

## 2026-05-20 分镜视频模特唯一性与商品来源锁定增强

- 目标：
  - 修复分镜视频生成时未严格使用已绑定模特、错误借用了商品图或参考视频中的人物身份的问题。
  - 修复单个分镜中出现两个模特、混合模特身份、或把商品图里的人当成模特的问题。
  - 强化“商品必须来自商品图、参考视频只负责动作和机位”的视频级硬锁定。
- 根因：
  - 分镜视频当前同时存在两条 prompt 生效链路：
    - `compiledPrompt`
    - `buildRealisticPrompt(..., 'video')`
  - 旧逻辑虽有模特锁和商品锁，但对以下风险约束还不够硬：
    - 参考视频人物身份越权
    - 商品图中的人物身份越权
    - 单镜头出现第二个人
    - 视频模型按描述重建商品，而不是严格复制商品图
- 本轮最小改动：
  - 仅增强主进程 `clone` 的视频 prompt 约束文本。
  - 不改前端页面结构，不改 IPC，不改任务数据结构。
- 修复内容：
  - 在 `src/main/modules/clone/providers.ts` 的视频 fallback prompt 中新增：
    - `CRITICAL FIX`
    - `PRODUCT SOURCE LOCK`
    - `INSTANCE RULE`
    - `VIDEO ROLE LIMIT`
    - `ANTI-RECONSTRUCTION`
  - 同时新增视频级人物硬锁：
    - 只能使用已选模特
    - 商品图/参考视频中的人只能被忽略，不能作为模特来源
    - 只允许一个模特
    - 禁止第二个人、背景人、镜像人、混合身份、额外手部来自第二个人
  - 在 `src/main/modules/clone/prompt-consistency/compiler.ts` 中同步加入相同的商品复制锁和模特唯一性锁，确保 `compiledPrompt` 链路同样生效。
  - 在 `src/main/modules/clone/prompt-consistency/patch-engine.ts` 中补强：
    - `Selected model identity` 的唯一人源约束
    - `reference video only guides motion/camera` 规则
    - 负面词中加入 `no second model / no extra person / no background model`
- 结果：
  - 分镜视频应更稳定地使用你绑定的单一模特身份。
  - 商品图中的人物不会再被误当作模特来源。
  - 参考视频只负责动作和镜头语法，不再越权改人物或重建商品。
- 使用说明：
  - 旧任务需要重新生成对应分镜视频后，新规则才会生效。
  - 如需验证，可打开分镜视频提示词弹窗，检查 `Video Positive Prompt` 中是否已包含上述 `CRITICAL FIX / PRODUCT SOURCE LOCK / INSTANCE RULE` 等段落。
- Windows / Linux 兼容说明：
  - 本轮仅调整 TypeScript 主进程 prompt 组装逻辑，不依赖 Windows 专属 API。
  - Windows 开发测试与 Linux 部署运行逻辑一致。

## 2026-05-20 分镜图片模特锁前置与商品图人物排除增强

- 目标：
  - 修复分镜图片生成时，商品图中的佩戴人物压过已选模特，导致生成结果没有以用户上传模特为主的问题。
- 根因：
  - 旧的分镜图片 prompt 虽然包含 `STRICT MODEL IDENTITY LOCK`，但位置偏后。
  - 同时“参考图优先”文案更偏向商品 identity，没有把“商品图中的人物必须完全忽略”写成足够强的硬规则。
- 本轮最小改动：
  - 仅调整图片 prompt 组装顺序和人物排除文案。
  - 不改前端页面结构，不改接口，不改任务数据结构。
- 修复内容：
  - `src/main/modules/clone/gptImage.ts`
    - 将 `buildModelIdentityLockText(...)` 和 `buildReferenceResponsibilityText()` 前置到商品描述锁之前。
    - 明确增加：
      - 商品图中的人物必须完全忽略
      - 商品图只锁商品，不锁脸、发型、肤色、耳型、穿搭或人物身份
      - 有人像时必须替换为已选模特
      - 只允许一个模特，禁止混合身份
  - `src/main/modules/clone/prompt-consistency/reference-priority.ts`
    - 将 `REFERENCE IMAGE PRIORITY` 收紧为：
      - 商品图只定义商品 identity
      - 商品图中的任何人都无效，必须忽略
      - 人物身份只能由 selected model identity 定义
- 结果：
  - 分镜图片生成时，已选模特会更早进入模型注意力。
  - 商品图中的佩戴人物不应再越权成为实际生成模特。
- 使用说明：
  - 旧分镜图片需要重新生成后，新规则才会生效。
  - 可在分镜图片提示词弹窗中确认：
    - `STRICT MODEL IDENTITY LOCK` 出现在更前的位置
    - prompt 中存在 `REFERENCE PERSON EXCLUSION RULE`
- Windows / Linux 兼容说明：
  - 本轮仅调整 TypeScript 主进程 prompt 组装逻辑，不依赖 Windows 专属 API。
  - Windows 开发测试与 Linux 部署运行逻辑一致。

## 2026-05-20 分镜视频提示词对齐分镜图片锁定骨架

- 目标：
  - 修复分镜视频提示词结构与分镜图片提示词不一致，导致视频阶段的模特锁、商品锁、单实例锁和参考职责表达不够硬的问题。
  - 让分镜视频 prompt 更接近分镜图片 prompt 的锁定顺序和语义优先级。
- 根因：
  - 视频阶段虽然已有 `compiledPrompt` 与一致性编译层，但最终 `Video Positive Prompt` 仍然以通用写实描述开头，图片阶段那套更强的锁定骨架没有完整复用。
  - 结果是用户在视频 prompt 预览里看到的内容，对模特 identity 和商品 identity 的强调不如图片 prompt 直观、靠前、稳定。
- 本轮最小改动：
  - 仅调整 `src/main/modules/clone/providers.ts` 的视频正向 prompt 组装顺序。
  - 不改前端页面结构，不改 IPC，不改任务数据结构。
- 修复内容：
  - 在视频 prompt 顶部新增 `imagePromptStyleLock`，直接复用图片 prompt 的核心锁定骨架：
    - `SILENT VISUAL COMMERCIAL`
    - `STRICT PRODUCT LOCK`
    - `Same model identity across all shots`
    - `STRICT MODEL IDENTITY LOCK`
    - `PRODUCT REFERENCES LOCK PRODUCT ONLY, NOT PERSON IDENTITY`
    - `REFERENCE PERSON EXCLUSION RULE`
    - `Exactly one human model is allowed`
  - 该锁定骨架现在位于视频 prompt 最前部，优先级高于通用 realism 段。
  - 分镜视频提示词预览哨兵升级为 `shot-video-prompt-2026-05-20-v3`，便于桌面端确认已加载新版本。
- 结果：
  - 分镜视频 `Video Positive Prompt` 将更接近分镜图片提示词的组织方式。
  - 模特锁、商品锁、商品图人物排除规则会在视频 prompt 中更早出现。
- 使用说明：
  - 重新打开桌面端后，进入分镜视频提示词弹窗。
  - 确认 `Prompt Build Sentinel` 为 `shot-video-prompt-2026-05-20-v3`。
  - 查看 `Video Positive Prompt`，顶部应先出现与分镜图片类似的锁定骨架，而不是先出现泛化写实描述。
- Windows / Linux 兼容说明：
  - 本轮仅调整 TypeScript 主进程 prompt 文本组装逻辑，不依赖 Windows 专属 API。
  - Windows 开发测试与 Linux 部署运行逻辑一致。

## 2026-05-20 分镜视频 compiledPrompt 层级对齐分镜图片

- 目标：
  - 继续收口分镜视频真正提交给模型的 `compiledPrompt`，让它的层级顺序和语义组织更接近分镜图片 prompt，而不是只让 fallback prompt 看起来更像图片 prompt。
- 根因：
  - 视频实际生成优先使用 `compiledPrompt`。
  - 旧的 `compiledPrompt` 虽然有一致性层，但层级名称、出现顺序、模特锁前置程度、参考职责表达方式仍然与分镜图片 prompt 有明显差异。
- 本轮最小改动：
  - 仅调整 `src/main/modules/clone/prompt-consistency/compiler.ts` 的 prompt layer 顺序与文案。
  - 不改接口，不改页面，不改任务结构。
- 修复内容：
  - 新增 `modelIdentityPromptText(...)`：
    - 用更接近分镜图片 prompt 的表达组织模特锁
    - 明确 `STRICT MODEL IDENTITY LOCK`
    - 明确 `SAME PERSON ACROSS ALL STORYBOARD FRAMES`
    - 明确 `Only the selected model identity package defines who the person is`
  - 新增 `referenceResponsibilityPromptText()`：
    - 明确 `PRODUCT REFERENCES LOCK PRODUCT ONLY, NOT PERSON IDENTITY`
    - 明确 `REFERENCE PERSON EXCLUSION RULE`
  - 将 `compiledPrompt` 层级顺序调整为更接近图片 prompt：
    - `CONSISTENCY_LAYER`
    - `IDENTITY_LAYER`
    - `REFERENCE_LAYER`
    - `ANCHOR_LAYER`
    - `SHOT_LAYER`
    - `MOTION_LAYER`
    - `STYLE_LAYER`
    - `PERFORMANCE_LAYER`
  - 分镜视频提示词预览哨兵升级为 `shot-video-prompt-2026-05-20-v4`。
- 结果：
  - 现在分镜视频的 `compiledPrompt` 和 fallback `Video Positive Prompt` 都更接近分镜图片 prompt 的锁定逻辑。
  - 展示内容和实际提交内容的一致性更高。
- 使用说明：
  - 重新打开桌面端后，进入分镜视频提示词弹窗。
  - 确认 `Prompt Build Sentinel` 为 `shot-video-prompt-2026-05-20-v4`。
  - 查看 `compiledPrompt / Video Positive Prompt`，顶部应先看到跨镜头锁、模特锁、参考职责，再进入脚本动作和风格层。
- Windows / Linux 兼容说明：
  - 本轮仅调整 TypeScript 主进程 prompt 组装逻辑，不依赖 Windows 专属 API。
  - Windows 开发测试与 Linux 部署运行逻辑一致。

## 2026-05-20 分镜视频提示词弹窗增加分层拆解

- 目标：
  - 让桌面端可以直接检查分镜视频提示词中的“锁定层 / 执行层 / 风格层”，避免用户只能面对一整段长 prompt 排查问题。
- 本轮最小改动：
  - 仅调整 `src/renderer/src/ui/views/CloneView.vue` 的分镜视频提示词弹窗展示。
  - 不改主进程接口，不改后端数据结构。
- 修复内容：
  - 分镜视频提示词弹窗新增：
    - `Compiled Prompt`
    - `Compiled Lock Layer`
    - `Video Positive Lock Layer`
    - `Execution Layer`
    - `Style Layer`
  - 前端直接基于现有 `compiledPrompt / positivePrompt` 按关键标记做文本拆解展示：
    - 锁定层：模特锁、商品锁、参考职责、单实例锁
    - 执行层：脚本、动作、运镜、镜头连续性
    - 风格层：写实感、静默商业片、材质/珠宝写实规则
  - `复制全部` 现同时包含 `Compiled Prompt`。
- 使用说明：
  - 在桌面端打开分镜视频提示词弹窗后，可先看拆解卡片，再看完整 prompt。
  - 如某一层为空，说明该层在当前 prompt 中可能被截断或未正确组装。
- Windows / Linux 兼容说明：
  - 本轮仅调整 Vue 渲染层展示逻辑，不依赖 Windows 专属 API。
  - Windows 开发测试与 Linux 打包运行逻辑一致。

## 2026-05-20 分镜视频 compiledPrompt 旧缓存自动失效

- 目标：
  - 修复桌面端分镜视频提示词弹窗和实际生成链路仍然读到历史 `compiledPrompt`，导致用户看到的是旧版锁定文案的问题。
- 根因：
  - `promptConsistencyService.getShotConsistencyReport(...)` 之前只要能从本地一致性数据库读到旧 report，就直接返回。
  - 即使编译器逻辑和层级已经更新，历史 report 也不会自动失效。
- 本轮最小改动：
  - 仅调整 prompt consistency 版本号与旧缓存判定逻辑。
  - 不改数据库结构，不做批量迁移。
- 修复内容：
  - `src/main/modules/clone/prompt-consistency/constants.ts`
    - 编译器版本升级为 `pc-1.1.0`
    - 策略版本升级为 `pc-policy-1.3.0`
  - `src/main/modules/clone/prompt-consistency/service.ts`
    - 读取历史 report 时，若 `compilerVersion / policyVersion` 不匹配当前版本，则直接返回 `null`
    - 上层因此会自动走 `previewShotConsistencyPrompt(...)` 或 `compileAndPersist(...)` 重新编译
  - `src/main/modules/clone/service.ts`
    - 分镜视频提示词预览哨兵升级为 `shot-video-prompt-2026-05-20-v5`
- 结果：
  - 旧的分镜视频 `compiledPrompt` 缓存会自动失效。
  - 桌面端重新打开提示词弹窗后，应能拿到新版本编译结果，而不是继续显示旧文案。
- 使用说明：
  - 重新打开桌面端后，进入分镜视频提示词弹窗。
  - 确认哨兵为 `shot-video-prompt-2026-05-20-v5`。
  - 若旧任务此前已生成过一致性缓存，无需手动清库；现在会自动按版本失效并重编译。
- Windows / Linux 兼容说明：
  - 本轮仅调整 TypeScript 主进程版本判断逻辑，不依赖 Windows 专属 API。
  - Windows 开发测试与 Linux 部署运行逻辑一致。

- 目标：
  - 修复桌面端主链路中“参考视频已分析、随后补上传商品图/模特，再点脚本生成时，商品描述仍未生成”的时序问题。
- 根因：
  - 商品描述此前只在两个时机生成：
    - 参考视频分析完成后，若当时已经有商品图
    - 后续分镜提示词预览 / 分镜图生成前
  - 若用户是在参考分析之后才补传商品图，再直接点“脚本生成”，就会出现脚本已生成但商品描述还没补算。
- 本轮最小改动：
  - `src/main/modules/clone/service.ts`
    - 在 `generateScriptVariantsForProject(...)` 开始阶段：
      - 先收集当前项目商品图
      - 推断商品类型
      - 先执行 `ensureProjectProductAnalysis(...)`
      - 再继续脚本变体生成
- 结果：
  - 现在桌面端链路支持以下顺序：
    - 上传视频
    - 参考分析
    - 补传模特 / 商品图
    - 点击脚本生成
  - 在脚本生成真正开始前，商品描述会先被补齐并写入项目。
- 使用说明：
  - 无需额外按钮。
  - 只要脚本生成前商品图已绑定，系统会自动先补做商品描述。
- Windows / Linux 兼容说明：
  - 本轮仅调整 TypeScript 主进程执行顺序，不依赖 Windows 专属 API。
  - Windows 开发测试与 Linux 部署可共用。
- 验证方式：
  - `npm run typecheck`
  - `npm run build`
  - 桌面端进入 `视频批量加字幕` 页面后，页面不再黑屏，上传视频后可预览，渲染结果区按钮可点击。

## 2026-05-18 视频批量加字幕预览字号与导出字号对齐

- 目标：
  - 修复预览区字幕明显偏大、最终导出成片字幕明显偏小的问题。
- 本轮最小改动：
  - 仅调整 `src/renderer/src/ui/views/VideoBatchSubtitleView.vue` 的预览层缩放逻辑。
  - 不修改主进程 ASS 导出基准，不改变现有渲染接口。
- 修复内容：
  - 预览层不再使用简单的 `fontSize / 2` 近似值。
  - 改为按导出 ASS 的 `1080x1920` 基准等比缩放字号、描边、阴影和垂直安全边距。
  - 让桌面端预览与最终成片的字幕尺寸和位置更接近，减少“预览很大、导出很小”的错位感。
- 验证方式：
  - 在桌面端修改字号和安全边距后，预览区与导出成片的标题贴片应保持基本一致。

## 2026-05-18 视频批量加字幕高保真位图预览方案

- 目标：
  - 让桌面端预览和最终导出尽量做到同源一致，包括多行标题、描边、阴影和表情。
- 本轮最小改动：
  - 新增主进程位图字幕层生成逻辑。
  - 预览与导出统一先生成一张透明位图字幕层，再叠加到视频上。
- 实现说明：
  - 不再依赖浏览器 DOM 文字叠层作为主预览结果。
  - 主进程先把标题文案、字体、字号、描边、阴影、对齐、位置渲染成透明 PNG 字幕层。
  - 预览区优先展示真实合成后的预览帧，导出视频也复用同一张字幕层。
  - 若真实预览生成失败，前端才降级回旧预览方式。
- 使用说明：
  - 调整字体、描边、阴影或标题内容后，预览会自动刷新真实位图结果。
  - 结果图与最终导出视频应保持更接近的视觉一致性。

## 2026-05-18 视频批量加字幕动态真实预览

- 目标：
  - 让桌面端预览不再只依赖单帧图，而是直接播放与最终导出同源的短预览视频。
- 本轮最小改动：
  - 批量字幕主进程新增动态预览 clip 生成。
  - 前端预览区优先播放真实动态预览视频，静态图退为 poster/兜底。
- 修复内容：
  - 统一字幕层规格与视频归一化规则。
  - 预览帧、动态预览视频、最终导出视频复用同一张字幕位图层与同一套 overlay 合成链。
  - 中部预览区默认展示 2 到 3 秒真实动态预览，更接近最终成片效果。
- 使用说明：
- 切换标题、字体、描边、阴影、边距后，预览区会自动重新生成短预览视频。
- 若动态预览生成失败，页面仍会降级到静态预览图或旧预览兜底，不会黑屏。

## 2026-05-18 视频批量加字幕升级为时间轴字幕

- 目标：
  - 将批量字幕从“静态标题贴片”升级为“手工时间轴字幕”。
  - 让预览和导出共享同一套 ASS/libass 渲染链。
- 本轮最小改动：
  - 扩展批量字幕任务数据结构，新增字幕轨、字幕样式和排版策略。
  - 新增字幕轨重排接口。
  - 前端工作台增加字幕轨编辑、真实预览和模式切换。
- 使用说明：
  - 先选视频，再在字幕轨编辑区录入时间轴。
  - 按 `开始秒<TAB>结束秒<TAB>文本` 形式编辑。
  - 调整样式后点“重新断句”，再预览确认。
  - 最后点“批量渲染”导出成片。

## 2026-05-18 视频批量加字幕工作台重设计

- 目标：
  - 将 `插件 -> 视频批量加字幕` 重整为更适合 1920 宽屏的现代 AI SaaS 工作台。
  - 在不改变后端接口和批量字幕主链路的前提下，提升首屏层级、视觉统一性和工作流清晰度。
- 本轮最小改动：
  - 仅重构 `src/renderer/src/ui/views/VideoBatchSubtitleView.vue`。
  - 不改 `/clone` 主链路，不改批量字幕主进程逻辑，不新增共享全局主题系统。
- 页面结构：
  - 顶部：大标题区、教程入口、轻量 KPI 概览。
  - 步骤条：选择素材、配置标题、实时预览、批量渲染。
  - 主体三栏：
    - 左栏：上传 / 成片库、素材列表、容量进度。
    - 中栏：9:16 预览舞台、缩略轨道、预览状态、主 CTA。
    - 右栏：字幕内容 / 样式设置双 tab。
  - 底部双区：
    - 任务队列
    - 输出结果与 GeeLark 推送
- 视觉要求：
  - 深色主题保留，继续使用紫色主色但压低饱和度。
  - 所有主卡片统一 `20px` 圆角、极浅边框、柔和阴影、玻璃拟态背景。
  - 保持较强留白和呼吸感，避免传统后台管理系统风格。
- 交互说明：
  - 默认优先展示 `字幕内容`，样式设置收敛为高频控制。
  - 继续复用现有方法：
    - `pickUploadVideos`
    - `applyCloneSources`
    - `runGenerateTitles`
    - `saveCurrentDraft`
    - `renderBatch`
    - `pushToGeelark`
  - AI 文案生成保持增强入口，但不抢主链路。
  - 预览加载、导入字体、批量渲染、GeeLark 推送均需显示统一轻量状态反馈。
- 使用说明：
  1. 进入 `插件 -> 视频批量加字幕`。
  2. 添加本地素材或从成片库导入。
  3. 输入统一标题，并按需使用 AI 生成文案。
  4. 调整字体、字号、描边、阴影、位置等样式参数。
  5. 在中间预览舞台确认真实叠加效果。
  6. 保存当前配置或直接批量渲染。
  7. 在输出结果区查看视频、打开目录或推入 GeeLark 发布池。
- Windows / Linux 兼容说明：
  - Windows 为开发测试环境，Linux 为部署环境。
  - 字体继续遵循 `用户导入 > 项目内置 > 系统兜底`。
  - 若要求两端效果一致，应优先选用项目内置或用户导入字体。
- 验证方式：
  - `npm run typecheck`
  - `npm run build`
- 详细需求文档：
  - `docs/requirements-2026-05-18-video-batch-subtitle-workbench-redesign.md`

## 2026-05-18 视频批量加字幕静态标题改为 React + Remotion 中间视频渲染

- 目标：
  - 将静态标题贴片的字体渲染链路切换为：
    - React 写字幕
    - Remotion 直接渲染中间视频
    - FFmpeg 最终封装 / 转码输出视频
- 本轮最小改动：
  - 仅调整 `video-batch-subtitle` 插件静态标题贴片链路。
  - 不改 `/clone` 主链路，不重写时间轴字幕 ASS 方案。
- 实现说明：
  - 新增主进程 Remotion 字幕层模块，使用 React 组件描述标题排版。
  - 预览与导出都改为先由 Remotion 产出中间视频，再由 FFmpeg 复用原音轨输出最终视频。
  - Remotion 相关依赖改为运行时动态加载，并在 Electron 主进程打包中外置，避免构建冲突。
  - 本插件中的自定义字体导入入口、字体来源提示和批量字幕字体查询接口一并删除。
- 使用说明：
  - 页面操作方式不变。
  - 静态标题模式下，用户看到的预览和导出成片，均走 React + Remotion 中间视频链路。
- 验证方式：
  - `npm run typecheck`
  - `npm run build`

## 2026-05-19 视频批量加字幕新素材误跑旧任务修复

- 目标：
  - 修复 `插件 -> 视频批量加字幕` 中，上传新视频后仍沿用历史第一条任务输出，导致新素材没有被实际渲染的问题。
- 本轮最小改动：
  - 仅补强批量字幕任务草稿更新链路。
  - 不改页面结构，不改 `/clone` 主流程，不新增状态管理。
- 修复内容：
  - `updateBatchSubtitleDraft` 在收到新的 `sourceItems` 时，改为和创建任务一致，先重新做素材标准化补全：
    - 文件名
    - 封面
    - 时长
    - 宽高
  - 当检测到当前任务素材集合已变化时，自动清空旧任务遗留运行态：
    - 旧输出结果
    - 旧批次游标
    - 旧进度
    - 旧错误信息
    - 旧成功计数
  - 素材集发生变化后，任务状态回落为 `draft`，避免后端把旧视频成功项误判为“可跳过已完成项”。
- 使用说明：
  - 上传全新视频后，无需先手动载入或删除历史任务。
  - 直接保存配置或点击批量渲染，当前任务会以新素材重新建模并执行。
  - 若是在旧任务上继续改标题但不换素材，原有续跑和跳过已成功项逻辑保持不变。
- Windows / Linux 兼容说明：
  - 本轮仅调整 Node 侧任务数据归一化与运行态重置逻辑。
  - 不依赖 Windows 专属路径 API，Linux 部署仍可复用同一行为。
- 验证方式：
  - `npm run typecheck`
  - `npm run build`

## 2026-05-19 桌面端复刻任务卡片更多操作菜单收口

- 目标：
  - 将桌面端复刻任务卡片右上角原本禁用的“更多操作”按钮改为真实可用菜单。
- 本轮最小改动：
  - 仅调整桌面端复刻任务列表卡片交互。
  - 不改任务详情页，不改主进程接口，不新增共享组件抽象。
- 修复内容：
  - 卡片右上角 更多操作 按钮改为真实下拉菜单。
  - 菜单项统一收口为 重命名、删除任务。
  - 卡片底部操作区只保留主链路 打开任务，避免重复动作分散视觉重点。
  - 点击页面其他区域会自动关闭菜单。
- 使用说明：
  - 在桌面端复刻任务列表页，点击任务卡片右上角 ...。
  - 可直接选择 重命名 或 删除任务。
- Windows / Linux 兼容说明：
  - 本轮仅新增 Electron 渲染层菜单交互与样式，不依赖平台专属 API。
  - Windows 开发测试与 Linux 打包部署均可共用。

## 2026-05-19 桌面端复刻任务分组入口可用性修复

- 目标：
  - 修复桌面端复刻任务列表中“新建分组点击无反应”以及分组相关入口显示判断过严的问题。
- 本轮最小改动：
  - 仅调整 `src/renderer/src/ui/views/CloneTaskListView.vue` 的分组入口显示条件与交互触发方式。
  - 不改主进程分组存储，不改复刻详情页，不扩展到 Web 端。
- 修复内容：
  - 分组能力判断从单一总开关改为按接口独立判断：
    - 新建分组只依赖 `createCloneGroup`
    - 重命名分组只依赖 `renameCloneGroup`
    - 删除分组只依赖 `removeCloneGroup`
    - 任务移动到分组只依赖 `assignCloneProjectsToGroup`
  - 顶部分组条“新建分组”入口恢复为页内弹层输入，避免桌面端系统 `prompt` 在部分环境下无可见反馈。
  - 分组更多操作菜单中的“重命名”恢复为页内弹层输入，和新建分组保持一致。
  - 批量操作条与任务行内的“移动到分组”入口仅在归组接口可用时显示。
  - 修复 SQLite 持久化遗漏 `projectGroups` 的问题，避免分组创建后保存成功但实际未落库。
  - SQLite 初始化迁移补齐历史 `projectGroups` 导入，保证 JSON 旧数据切换到 SQLite 后分组不丢失。
- 使用说明：
  - 在桌面端复刻任务列表点击“新建分组”后，会打开页内输入弹层。
  - 输入名称并确认后，分组会立即刷新到当前列表页。
  - 点击分组右侧更多操作，可直接重命名或删除分组。
- Windows / Linux 兼容说明：
  - 本轮仅修改 Electron 渲染层交互判断与基础输入方式，不依赖 Windows 专属 API。
  - Windows 开发测试与 Linux 打包部署均可共用。

## 2026-05-19 桌面端复刻任务列表视觉继续精修

- 目标：
  - 继续压缩桌面端复刻任务列表页的视觉偏差，让顶部工具区、统计卡、分组条、表格行和操作按钮的密度与质感更统一。
- 本轮最小改动：
  - 仅调整 `src/renderer/src/ui/views/CloneTaskListView.vue` 的局部样式参数。
  - 不改页面结构，不改数据逻辑，不新增共享组件。
- 调整内容：
  - 顶部标题区、搜索框、运行模式切换、新建任务按钮的高度、横向间距和边框强度再收紧一轮。
  - 统计卡的图标尺寸、数字字号、卡片圆角、阴影和卡片间距进一步压稿。
  - 分组条的高度、标签字号、更多操作按钮、新建分组按钮和右上工具按钮尺寸继续统一。
  - 表格表头高度、行高、列间距、缩略图尺寸、标题字号、胶囊标签、操作按钮和批量条边框亮度进一步微调。
  - 下拉菜单阴影和边框强度同步收敛，避免浮层显得过重。
- 使用说明：
  - 进入桌面端复刻任务列表页即可看到新的视觉密度与边框/阴影细节。
- Windows / Linux 兼容说明：
  - 本轮仅修改 Electron 渲染层样式常量，不依赖 Windows 专属 API。
  - Windows 开发测试与 Linux 打包部署均可共用。

## 2026-05-19 复刻成片重新生成误报未产出视频文件修复

- 目标：
  - 修复复刻详情页“合成成片”阶段点击重新生成时，明明已有分镜视频却提示“最终合成未产出视频文件”的问题。
- 本轮最小改动：
  - 仅调整复刻主进程最终合成前的可渲染镜头映射逻辑。
  - 不改前端页面结构，不改分镜视频生成接口，不重写最终合成器。
- 修复内容：
  - 最终合成前的前置校验会识别 `shotVideoOutputs.videoPath / localPath`，但底层合成器此前只消费 `uploadedAssetPath / generatedClipPath`，导致“校验通过但实际渲染拿不到源视频”。
  - 在 `toRenderableShot(...)` 中补齐可渲染字段回填：
    - 若镜头本身没有 `uploadedAssetPath`，则优先回填 `shotVideoOutputs.videoPath / localPath`
    - 继续保留 `generatedClipPath` 作为兼容来源
  - 这样重新合成时，已有分镜视频输出能稳定进入最终拼接，不再因为字段不一致被误判为空输出。
  - 进一步修复最终合成时 `ffprobe` 可执行路径推导错误的问题：
    - 之前通过字符串替换 `ffmpeg.exe -> ffprobe.exe` 猜路径
    - 但当前依赖布局中 `ffprobe` 实际来自 `ffprobe-static`
    - 现改为统一走 `getFfprobeExecutable()` 取真实二进制路径，避免探测时长阶段直接失败
- 使用说明：
  - 进入复刻详情页“合成成片”阶段。
  - 在已有可用分镜视频的前提下，点击重新生成或重新合成，应可正常继续最终拼接。
- Windows / Linux 兼容说明：
  - 本轮仅调整 Node/Electron 主进程字段映射逻辑，不依赖 Windows 专属 API。
- Windows 开发测试与 Linux 打包部署均可共用。

## 2026-05-19 `/clone` 主链路统一接口层收口

- 目标：
  - 统一 `web-next` 与桌面端 `/clone` 主链路的数据访问接口，减少页面层直接区分 Web HTTP 与 Electron IPC 的分叉逻辑。
- 本轮最小改动：
  - 仅收口 `/clone` 详情主链路。
  - 不扩展到插件、计费、营销页，不重构整套 web 平台 client。
- 实现说明：
  - 新增共享业务接口层 `src/shared/clone-workspace/client.ts`：
    - 定义 `CloneWorkspaceClient`
    - 定义任务归属 `web / local / unknown`
    - 定义统一错误码：
      - `UNAUTHORIZED_TASK`
      - `NOT_FOUND`
      - `VALIDATION_ERROR`
      - `PIPELINE_ERROR`
      - `TRANSPORT_ERROR`
  - Web 端继续复用 `src/shared/web-api/client.ts` 作为底层 HTTP client，但通过 `createWebCloneWorkspaceClient(...)` 暴露统一业务方法。
  - 桌面端新增 `src/renderer/src/lib/cloneWorkspaceClient.ts`：
    - 封装本地 IPC 版 `CloneWorkspaceClient`
    - 提供 `resolveCloneWorkspaceClient(projectId)` 做任务归属解析
  - 桌面端 `/clone` 详情页相关 composable 统一改为依赖 `getWorkspaceClient()`：
    - `useCloneProjectWorkspace.project.ts`
    - `useCloneProjectWorkspace.materials.ts`
    - `useCloneProjectWorkspace.script.ts`
    - `useCloneProjectWorkspace.storyboard.ts`
    - `useCloneProjectWorkspace.video.ts`
    - `useCloneProjectWorkspace.compose.ts`
  - `CloneView.vue` 中原本散落的 `toggleFrameLock` Web/本地分流也改为走统一 client。
- 任务归属判定规则：
  - 不再使用“是否存在 web token”直接决定 `/clone` 详情页接口通道。
  - 优先按桌面端任务元信息判断：
    - `local` 任务走 Electron IPC
    - `web` 任务走 Web API
  - 若归属未知：
    - 先尝试用 Web 端读取任务
    - 若返回 `无权访问该任务`，则判定为本地任务并自动回退到 Electron IPC
  - 仅权限不匹配触发自动回退；普通上传失败、参数错误、服务异常不静默回退。
- 使用说明：
  - 桌面端已登录 Web 账号时，打开历史本地 `/clone` 任务，不会再因为 token 存在而误走 Web API。
  - Web owned 任务在桌面端详情页内仍可继续使用 Web 通道。
  - 阶段日志会展示当前统一接口解析出的通道信息，便于排查问题。
- Windows / Linux 兼容说明：
  - Windows 仍为开发测试环境，Linux 仍为部署环境。
  - 本轮仅调整共享 TypeScript client、Electron 渲染层调用方式与错误归一化，不依赖 Windows 专属路径语义。
  - Linux 部署下 Web 端仍走相同的共享业务接口层；桌面端逻辑不影响服务端部署行为。
- 验证方式：
  - `npm run typecheck`

## 2026-05-21 商品库列表页与详情页专业化改版

- 目标：
  - 将 `/products` 与 `/products/:productId` 的主内容区收口为更专业、更清晰的商品资产管理界面。
  - 保持左侧菜单、路由结构和现有功能不变，只优化商品库主工作区的信息层级与操作表达。
- 本轮最小改动：
  - 仅调整：
    - `src/renderer/src/ui/views/ProductLibraryView.vue`
    - `src/renderer/src/ui/views/ProductDetailView.vue`
  - 不改主导航，不改其它模块页面，不新增后端接口。
- 改版内容：
  - 商品库列表页强化为“商品资产中心”：
    - 增加顶部资产摘要与建档说明。
    - 强化快速建商品区域，明确“创建后进入详情维护”。
    - 提升商品卡片信息密度，突出图片数、标准源状态、更新时间和后续动作提示。
  - 商品详情页强化为“商品资产详情”：
    - 增加商品资产概览卡，统一展示封面、图片数量、创建/更新时间。
    - 将标准源状态卡与重新生成动作放在同一块区域，减少操作分散。
    - 保留图片上传、设封面、删图、备注保存、标准源生成等既有能力。
  - 桌面端实际渲染验证：
    - 新版列表页和详情页已在 Electron 冒烟测试截图中确认生效。
- 使用说明：
  1. 进入 `商品库` 查看商品总览和资产状态。
  2. 在列表页快速创建商品。
  3. 进入商品详情后上传图片、设置封面、维护备注、生成标准源。
  4. 复刻与生产链路继续从商品详情沉淀的图片与标准源复用。
- Windows / Linux 兼容说明：
  - 本轮仅修改 Electron/Vue 渲染层页面结构与样式，不依赖 Windows 专属 API。
  - Windows 开发测试与 Linux 部署可共用。
- 验证方式：
  - `npm run typecheck`
  - `npm run build`
  - `npm run test:product-library-desktop`


## 2026-05-21 ??????????

- ???
  - ?????????????????????????
- ???????
  - ??? `src/renderer/src/ui/views/ProductLibraryView.vue`
  - ????????????????
- ?????
  - ???????????????????????????
  - ?????????????????????????????
  - ?????????????????????
- ?????
  - ??????????????????????
- Windows / Linux ?????
  - ????? Vue ??????? Windows ?? API?


## 2026-05-21 ???????????

- ???
  - ????????????????????????????????????????
- ???????
  - ??? `src/main/modules/clone/service.ts` ? `src/renderer/src/ui/views/ProductDetailView.vue`
  - ??????????????????????
- ?????
  - ???????????????? `processing` ??????
  - ???????????????????????????????
  - ????????????????????????????????
- ?????
  - ???????????????????????
  - ????????????????? `Product Canonical Source` ???
- Windows / Linux ?????
  - ????? Node/Electron ???? Vue ????????? Windows ?? API?


## 2026-05-21 ????????????

- ???
  - ??????????????????????????????????????
- ???????
  - ??? `src/renderer/src/ui/views/ProductDetailView.vue`
  - ??????????????????
- ?????
  - ?????????????????
  - ?????????????????????????
  - ?????????????????
- ?????
  - ??????????????????????????????????????
- Windows / Linux ?????
  - ????? Vue ????????? Windows ?? API?

## 2026-05-21 商品详情流程完成态回显修复

- 需求
  - 商品详情页的深层生成流程在标准源已生成成功后，应立即高亮到完成态，不能长期停留在第二步。
- 变更文件
  - `src/renderer/src/ui/views/ProductDetailView.vue`
- 实现说明
  - 流程高亮改为同时识别 `canonicalSourceStatus === 'done'` 与标准源结果路径存在。
  - 标准源已就绪时，流程文案与完成图标同步切换到最终态。
- 验证
  - 商品详情页生成标准源成功后，流程第 4 步高亮。
  - 标准源结果已显示时，页面不再卡在第 2 步。
- Windows / Linux 兼容说明
  - 仅修改前端 Vue 逻辑，不引入平台相关差异。

## 2026-05-21 商品详情图片四列展示调整

- 需求
  - 商品详情页的图片区域在桌面端需要一行显示四张图片。
- 变更文件
  - `src/renderer/src/ui/views/ProductDetailView.vue`
- 实现说明
  - 商品图片默认栅格调整为四列展示。
  - 在窄屏下保持现有响应式收缩逻辑，避免页面溢出。
- 验证
  - 桌面端商品详情图片区默认四列。
  - 窄屏下自动降为单列，页面可正常浏览。

## 2026-05-21 商品列表首屏文案乱码修复

- 需求
  - 商品列表页标题、描述以及新建商品区域文案不能出现乱码。
- 变更文件
  - `src/renderer/src/ui/views/ProductLibraryView.vue`
- 实现说明
  - 修复商品库首屏标题与描述文案。
  - 同步修复新建商品输入框、商品类型和按钮文案乱码。
- 验证
  - 商品列表页顶部标题与描述正常显示中文。
  - 新建商品区域文案正常显示，不再出现问号乱码。

## 2026-05-21 商品详情商品类型可修改修复

- 需求
  - 商品详情页中的商品类型需要支持修改并保存。
- 变更文件
  - `src/renderer/src/ui/views/ProductDetailView.vue`
- 实现说明
  - 为商品类型摘要项增加编辑入口、类型下拉选择、保存与取消操作。
  - 复用现有商品保存链路，修改后即时刷新当前商品详情数据。
- 验证
  - 商品详情页可切换商品类型并保存成功。
  - 保存后页面展示与商品列表中的类型信息保持一致。

## 2026-05-21 复刻脚本生成商品绑定误判修复

- 需求
  - 复刻模块中已在界面选择商品后，点击生成脚本不应再误报“商品未绑定”。
- 变更文件
  - `src/renderer/src/ui/views/CloneView.vue`
  - `src/renderer/src/composables/useCloneProjectWorkspace.shared.ts`
  - `src/renderer/src/composables/useCloneProjectWorkspace.script.ts`
- 实现说明
  - 生成脚本按钮点击后，若界面已选择商品但项目尚未正式绑定，则先自动绑定商品再继续生成脚本。
  - 在脚本生成工作区层增加同样的自动绑定兜底，避免其他入口触发时再次误判。
- 验证
  - 复刻页选择商品后直接点击“生成脚本”可正常继续。
  - 不再出现已选商品却提示未绑定的错误。

## 2026-05-21 复刻列表绑定商品缩略图修复

- 需求
  - 复刻列表在绑定商品后应显示商品缩略图，不能只显示空白或旧封面。
- 变更文件
  - `src/main/modules/clone/service.ts`
  - `src/renderer/src/ui/views/CloneTaskListView.vue`
- 实现说明
  - 绑定商品时把商品封面同步到复刻项目摘要的 `coverAssetPath`。
  - 复刻列表缩略图优先读取绑定商品封面。
- 验证
  - 复刻列表在绑定商品后可以显示对应商品缩略图。
  - 刷新列表后缩略图仍保持可见。

## 2026-05-21 复刻列表摘要封面字段同步

- 需求
  - 复刻列表摘要需要携带绑定商品封面字段，确保卡片缩略图可稳定显示。
- 变更文件
  - `src/main/modules/clone/types.ts`
  - `src/main/modules/clone/service.ts`
- 实现说明
  - 在复刻项目摘要中增加 `coverAssetPath` 字段。
  - 摘要生成时优先使用项目封面，其次使用绑定商品参考图。
- 验证
  - 复刻列表刷新后能持续读取到封面路径。

## 2026-05-21 分镜图片商品锁提示词优先级修正

- 需求
  - 分镜图片生成时必须以绑定商品参考图为最高优先级，不能因文本商品描述而出现商品不一致。
- 变更文件
  - `src/main/modules/clone/gptImage.ts`
  - `src/main/modules/clone/service.ts`
- 实现说明
  - 将文本商品描述锁降为参考图之下的辅助说明，明确冲突时始终服从绑定商品参考图。
  - 去除服务层将商品锁文本重复塞入 `productDescription` 的做法，避免同一提示词重复放大并互相冲突。
- 验证
  - 分镜图片 prompt 中参考图优先级高于文本描述。
  - 商品结构、材质、颜色和挂载方式应与绑定商品保持一致。

## 2026-05-21 分镜图片参考图顺序修复

- 需求
  - 分镜图片生成时，绑定商品参考图必须比模特参考图拥有更高的输入优先级，避免商品被模特图或连续性图稀释。
- 变更文件
  - `src/main/modules/clone/service.ts`
- 实现说明
  - 分镜图片生成时，参考图数组改为商品图优先，模特图退到次级辅助。
  - 商品参考图数量提升到最多 4 张，增强商品结构、材质和挂载方式锁定。
  - 分镜主商品参考顺序改为优先使用标准源，再回退原图。
- 验证
  - 分镜图片生成时商品图优先进入模型参考输入。
  - 已绑定商品的结构与外观一致性提升。

## 2026-05-21 绑定商品快照主导分镜商品身份

- 需求
  - 复刻项目绑定商品后，分镜图片和一致性预览必须优先使用绑定时冻结的商品快照。
- 变更文件
  - `src/main/modules/clone/types.ts`
  - `src/main/modules/clone/repo.ts`
  - `src/main/modules/clone/service.ts`
  - `src/main/modules/clone/prompt-consistency/compiler.ts`
  - `src/main/modules/clone/prompt-consistency/service.ts`
- 实现说明
  - 绑定商品时冻结商品快照，包括名称、类型、封面、标准源和参考图路径。
  - 分镜图片与一致性报告优先读取商品快照，再回退到商品分析文本。
  - 生成提示词仍以参考图为最高优先级，文本仅作辅助。
- 验证
  - 绑定商品后，分镜商品身份应稳定跟随冻结快照。
  - 商品模块后续修改不应影响已绑定复刻项目。

## 2026-05-21 分镜预览输出绑定商品快照

- 需求
  - 分镜一致性预览和生成日志需要直接输出绑定商品快照，方便确认商品主事实源是否已进入链路。
- 变更文件
  - `src/main/modules/clone/service.ts`
- 实现说明
  - 分镜一致性预览优先读取绑定商品快照文本。
  - 分镜预览返回绑定商品快照摘要，便于界面和日志核对。

## 2026-05-21 分镜视频链路商品快照收口

- 需求
  - 分镜视频预览、批量生成和手动重编译也必须统一使用绑定商品快照，不能再回落到 `materialNeed` 旧文本。
- 变更文件
  - `src/main/modules/clone/service.ts`
- 实现说明
  - 分镜视频预览改为优先展示绑定商品快照文本，不再只展示压缩后的商品分析文本。
  - 视频生成、批量生成和手动重编译在调用 `compileAndPersist(...)` 时统一传入商品快照文本。
  - 视频生成阶段的 `promptHash` 改为基于商品快照文本计算，避免缓存和重试链路继续沿用旧商品描述。
  - 新增 `generate-shot-clip:product-snapshot` 调试日志，直接输出当前 shot 实际读取到的绑定商品快照与商品描述文本。
- 验证
  - 已绑定商品的分镜视频链路应与分镜图片链路保持同一商品身份来源。
  - 查看主进程日志时可直接确认当前 shot 是否读取了绑定商品快照。

## 2026-05-21 提示词预览展示模特图与商品图

- 需求
  - 在复刻分镜的提示词预览区直接展示当前 shot 实际使用的模特参考图和商品参考图，方便确认上传接口是否真的把图片传入了提示词链路。
- 变更文件
  - `src/main/modules/clone/service.ts`
  - `src/renderer/src/ui/views/CloneView.vue`
- 实现说明
  - 图片提示词预览和视频提示词预览统一返回：
    - `productReferenceImagePaths`
    - `productReferenceImageCount`
    - `modelReferenceImagePaths`
    - `modelReferenceImageCount`
  - 前端在提示词弹窗中新增“已上传商品图”“已上传模特图”两块，展示当前 shot 实际用到的缩略图与路径。
  - 若没有对应图片，则明确显示“未上传商品图”或“未上传模特图”。
- 验证
  - 上传商品图后，图片/视频提示词弹窗能看到商品参考图列表。
  - 上传模特图后，图片/视频提示词弹窗能看到模特参考图列表。
  - 未上传时显示明确空态，不会误判为已接入。

## 2026-05-21 商品参考图只走标准源

- 需求
  - 商品参考图只允许走绑定商品的标准源 `canonicalSourcePath`，不再传原图、冻结原图或商品多图集合。
- 变更文件
  - `src/main/modules/clone/service.ts`
  - `src/renderer/src/ui/views/CloneView.vue`
- 实现说明
  - `resolveStoryboardProductRefs(...)` 改为只返回标准源图；没有标准源直接报 `请先为绑定商品生成标准源`。
  - 图片/视频提示词预览、首尾帧生成统一改用单张标准源图。
  - 模特参考图同步收紧为 1 张主锚点图。
  - 提示词区只显示 1 张商品标准源图和 1 张模特主图。
- 验证
  - 商品已有标准源时，提示词区只显示 1 张商品图。
  - 商品无标准源时，预览和生成都被阻止并给出明确提示。
  - 模特图区只显示 1 张图，不再展示整套模特包。

## 2026-05-21 商品深层描述重新注入提示词

- 需求
  - 分镜提示词除了使用 `Product Canonical Source`，还必须带入商品的深层结构描述，避免只剩快照元信息而缺少商品基础描述。
- 变更文件
  - `src/main/modules/clone/service.ts`
- 实现说明
  - 新增统一的商品描述拼装函数，把：
    - 绑定商品快照摘要
    - 商品结构分析文本
    合并为同一份 `productDescription`。
  - 图片提示词预览、视频提示词预览、首尾帧生成、视频链路统一使用这份组合描述。
  - 提示词区展示的商品描述高亮与真实生成使用的商品描述保持一致。
- 验证
  - 提示词区商品描述高亮中能看到商品结构、材质、颜色、挂载等深层描述。
  - 分镜生成时不再只有 `canonicalSourcePath` 和快照元信息。

## 2026-05-21 分镜视频提示词控制层收敛

- 需求
  - 将 `/clone` 分镜视频 prompt 收敛为控制层、执行层、风格层三段结构，补齐空间锚点、物理一致性和构图锁。
- 变更文件
  - `src/main/modules/clone/providers.ts`
  - `src/main/modules/clone/prompt.ts`
  - `src/main/modules/clone/prompt-consistency/compiler.ts`
  - `src/main/modules/clone/prompt-consistency/constants.ts`
  - `src/main/modules/clone/service.ts`
  - `src/renderer/src/ui/views/CloneView.vue`
- 实现说明
  - 删除冲突文案 `Replace only the person identity and product identity.`，改为禁止替代与禁止重生身份。
  - 新增 `SPATIAL ANCHOR LOCK`、`PHYSICS CONSISTENCY`、`COMPOSITION LOCK`，并对耳饰类商品补充耳侧、穿孔点与垂坠方向约束。
  - `Execution Layer` 仅保留脚本拼接与动作/镜头执行语义，控制层前移到预览顶层。
  - 编译器版本与视频提示词预览哨兵同步升级，确保旧缓存失效后重新编译。
- 使用说明
  - 在 `/clone` 分镜视频提示词预览中，先看 `Compiled Lock Layer` 是否包含新的控制块，再看 `Execution Layer` 是否保留脚本拼接文本。
  - 若商品属于饰品类，预览中应能看到更具体的空间锚点和物理约束描述。
- 验证
  - `npm run typecheck`

## 2026-05-25 桌面端 `/clone` 分镜视频单一状态机重构

- 需求
  - 将桌面端 `/clone` 分镜视频链路统一为单一状态机与单一调度入口，修复继续查询误重提、重新生成复用旧本地视频、远端已成功但前端提前结束、历史脏状态长期互相覆盖的问题。
- 变更文件
  - `src/main/modules/clone/service.ts`
  - `src/main/modules/clone/repo.ts`
  - `src/main/modules/clone/types.ts`
  - `src/renderer/src/ui/views/CloneView.vue`
  - `test/clone-shot-video-state-normalization.smoke.ts`
  - `test/clone-shot-video-intent-router.smoke.ts`
  - `test/clone-shot-video-done-requires-local-file.smoke.ts`
  - `test/clone-shot-video-force-regenerate-no-reuse.smoke.ts`
- 实现说明
  - 分镜视频状态统一收敛为：
    - `idle`
    - `submitting`
    - `remote_pending`
    - `remote_running`
    - `remote_succeeded_pending_download`
    - `downloading`
    - `done`
    - `failed_retryable`
    - `failed_terminal`
  - 主进程统一通过 `ensureShotVideoState(projectId, shotId, intent)` 推进状态，`intent` 固定为：
    - `submit_if_needed`
    - `poll_only`
    - `download_if_ready`
    - `force_regenerate`
    - `recover_if_possible`
  - `done` 的唯一事实来源改为本地 `generated_clip.mp4` 已落盘；远端成功但未下载时只能停留在 `remote_succeeded_pending_download / downloading`。
  - “继续查询”被限制为只查询旧任务；“重新生成”必须先清空旧 `videoPath/localPath/videoUrl/generatedClipPath`，不再允许旧本地视频短路复用。
  - 历史 `generatedClipPath` 只用于恢复已完成结果，不再允许在 `submitting / remote_pending / remote_running` 期间把旧视频重新补回当前输出。
  - SQLite 归档层 `shotVideoOutputs.status` 白名单已同步升级，避免新状态落库后被错误回退成 `idle`。
  - 前端镜头列表、失败筛选、状态文案改为消费新状态机，不再直接展示 `creating / generating / polling_timeout / created / local_ready` 这类旧内部状态。
- 使用说明
  - 批量生成只负责提交或接续当前镜头状态，不会再因为“继续查询”隐式创建新远端任务。
  - 强制重新生成后，即便本地还保留旧 `generated_clip.mp4` 文件，也不会再被当前镜头状态直接复用。
  - 若镜头为 `failed_retryable`，优先继续查询或强制下载；若为 `failed_terminal`，需要补素材、补任务条件或重新生成。
- Windows / Linux 兼容说明
  - 本轮仅调整 TypeScript / Vue 业务状态机与 SQLite payload 读写规则，不依赖平台专属路径锁或系统调用。
- 验证
  - `npm run typecheck`
  - `npm run test:clone-shot-video-state-normalization`
  - `npm run test:clone-shot-video-intent-router`
  - `npm run test:clone-shot-video-done-requires-local-file`
  - `npm run test:clone-shot-video-force-regenerate-no-reuse`
  - `test/storyboard-model-identity-lock.smoke.ts` 覆盖新控制层关键词和结束帧连续性文案。

## 2026-05-21 分镜视频 Zoom Out 镜头级控制补强

- 需求
  - 专门补强 `zoom_out` 分镜的镜头轨迹、尺寸比例与耳饰微动控制。
- 变更文件
  - `src/main/modules/clone/prompt.ts`
  - `src/main/modules/clone/providers.ts`
  - `src/main/modules/clone/prompt-consistency/compiler.ts`
  - `src/main/modules/clone/service.ts`
  - `src/renderer/src/ui/views/CloneView.vue`
- 实现说明
  - 新增 `CAMERA MOTION LOCK`、`SCALE CONSISTENCY LOCK`、`MOTION LIMIT`。
  - `zoom_out` 强制为单一连续 pull-back，禁止切镜头、重构构图、重算尺寸。
  - 耳饰类商品补充更严格的耳侧、穿孔点、垂坠方向和微动限制。
  - 预览层 marker 同步显示新镜头锁，避免只能在完整 prompt 中排查。
- 验证
  - `zoom_out` 的 `videoPrompt` 和 `compiled.finalPrompt` 都应显示新镜头锁。
  - `npm run typecheck`

## 2026-05-22 模特创建提示词预览面板

- 需求
  - 创建模特时增加“提示词查看/复制”能力，方便直接拿到实际发送给模型的 prompt，用于排查性别等结构化选项是否拼接正确。
- 变更文件
  - `src/main/modules/clone/gptImage.ts`
  - `src/main/modules/clone/service.ts`
  - `src/main/index.ts`
  - `src/preload/index.ts`
  - `src/renderer/src/ui/views/ModelLibraryView.vue`
- 实现说明
  - 主进程新增 `buildModelIdentityPackPromptPreview(...)`，与真实生成链路共用同一套 profile merge 和 prompt 拼接逻辑。
  - 新增 IPC 接口 `clone:getModelIdentityPromptPreview`，返回最终 prompt、合并后的 profile、描述摘要和参考图数量。
  - 桌面端模特创建面板新增“查看提示词”“复制提示词”入口，并在面板内直接展示当前 prompt 与关键画像摘要。
- 使用说明
  - 在“创建模特”面板中先选择画像和商品参考图，再点击“查看提示词”。
  - 点击“复制提示词”后，可直接把当前实际 prompt 发回来继续排查。
- 验证
  - `npm run typecheck`

## 2026-05-23 分镜图片场景氛围补强

- 需求
  - 分镜视频背景发白的问题需要前移到分镜图片/首尾帧阶段解决，避免首尾帧已经是白底后视频继续继承白底。
- 变更文件
  - `src/main/modules/clone/gptImage.ts`
- 实现说明
  - 首尾帧图片 prompt 新增 `FRAME SCENE ATMOSPHERE LOCK`。
  - 优先使用 `sceneDescription.location/background/lighting/style`，其次使用 `visualDescription`、`generationPrompt`、`visualPrompt` 和 `visual` 作为场景来源。
  - 明确要求真实场景空间、背景深度、自然阴影、接触阴影和轻微环境色。
  - 明确禁止纯白背景、空白棚拍、孤立目录图、无氛围产品渲染。
  - 尾帧延续首帧的场景 setup，不重新生成白底背景。
- 使用说明
  - 重新生成分镜图片后，图片提示词预览的 `Start Prompt` 和 `End Prompt` 应包含 `FRAME SCENE ATMOSPHERE LOCK`。
  - 已有白底分镜需要先重新生成图片，再重新生成视频，让视频继承新的首尾帧场景。
- 验证
  - `npm run typecheck`

## 2026-05-23 耳饰星芒与镜头炫光硬约束

- 需求
  - 耳饰/珠宝类分镜仍会生成星芒、镜头光晕、发光核心和放射光线，需要从首尾帧图片和视频 prompt 两端同时禁止。
- 变更文件
  - `src/main/modules/clone/prompt.ts`
  - `src/main/modules/clone/gptImage.ts`
- 实现说明
  - 新增 `ABSOLUTE JEWELRY LIGHT EFFECT BAN`，明确珠宝不能成为光源。
  - 正向 prompt 禁止 star-shaped flare、radial light rays、lens flare、light burst、glowing white core、rainbow flare、bloom blob、sparkle points、self-luminous jewelry。
  - 将“允许反光”的表述收紧为 tiny low-intensity real specular edges，避免模型把 highlights/reflections 理解成珠宝广告星芒。
  - 珠宝 generationPrompt 清洗不再把 sparkle 替换成 highlights/reflections，而是替换成 realistic material detail。
  - 视频 negative prompt 增加星芒、镜头炫光、自发光、放射光线等负向词。
  - 首尾帧图片 prompt 同步注入同一条硬约束，避免视频继承图片里已经生成的星芒。
- 使用说明
  - 对已有出现星芒的分镜，必须先重新生成分镜图片，再重新生成视频。
  - 在图片提示词预览和视频提示词预览中，应能看到 `ABSOLUTE JEWELRY LIGHT EFFECT BAN`。
- 验证
  - `npm run typecheck`

## 2026-05-23 分镜图片场景氛围锁裁剪修复

- 需求
  - 图片提示词预览中看不到 `FRAME SCENE ATMOSPHERE LOCK`，导致首尾帧图片仍可能生成白底、空背景、无氛围的商品图。
- 变更文件
  - `src/main/modules/clone/gptImage.ts`
  - `src/main/modules/clone/service.ts`
  - `src/renderer/src/ui/views/CloneView.vue`
- 实现说明
  - 将 `FRAME SCENE ATMOSPHERE LOCK` 前移到分镜图片 prompt 的高优先级区域，紧跟 reference lock 和 no substitute rule。
  - 将首尾帧图片 prompt 的最终裁剪上限从 `1800` 提升到 `2600`，只影响分镜图片，不改视频 prompt。
  - 删除图片 prompt 内一处重复的 reference lock，避免低价值重复文案挤掉场景约束。
  - 图片提示词预览新增 `sceneAtmosphereBlock`、`hasSceneAtmosphereBlock` 和“场景锁 在/缺”诊断。
- 使用说明
  - 重新打开分镜图片提示词预览，哨兵应显示 `shot-image-prompt-2026-05-23-scene-v4`。
  - `Start Prompt` 和 `End Prompt` 应包含 `FRAME SCENE ATMOSPHERE LOCK`、`visible background depth`、`natural shadows`、`plain white background` 和 `blank studio void`。
  - 已经生成白底的分镜需要先重新生成分镜图片，再重新生成分镜视频。
- 验证
  - `npm run typecheck`

## 2026-05-23 商品描述 Prompt 去重压缩

- 需求
  - 分镜图片提示词预览中的商品描述过长，且在已有 `Product Canonical Source` 时仍追加通用 reference fallback，形成两套 `Category/Summary` 重复内容。
- 变更文件
  - `src/main/modules/clone/service.ts`
  - `src/main/modules/clone/gptImage.ts`
- 实现说明
  - `buildPromptProductDescriptionText(...)` 在存在绑定商品快照时，直接使用紧凑 Canonical Source 描述，不再追加 `buildProjectProductAnalysisText(...)`。
  - 紧凑描述压缩为最多 5 行，只保留商品唯一来源、同一商品实例、结构/材质/颜色/几何/比例和禁止 redesign/增删部件。
  - 不再把完整本地 `Product Canonical Source path` 写入图片 prompt。
  - 压缩 `TEXT PRODUCT DESCRIPTION SUPPORT` 固定说明头，减少 prompt 长度占用。
- 使用说明
  - 重新打开分镜图片提示词预览后，哨兵应显示 `shot-image-prompt-2026-05-23-compact-product-v5`。
  - 重新打开分镜图片提示词预览后，商品描述不应同时出现 `Use Product Canonical Source only` 与 `Use the uploaded reference images as the only valid product identity source` 两套描述。
  - 已有任务无需迁移，重新生成分镜图片时使用新的压缩 prompt。
- 验证
  - `npm run typecheck`

## 2026-05-23 Model Identity Lock 去重压缩

- 需求
  - 分镜图片提示词预览中的 `Model Identity Lock` 同时输出长版 `Selected model profile` 和 `Selected model identity`，导致身份锁占用过多 prompt 长度。
- 变更文件
  - `src/main/modules/clone/gptImage.ts`
- 实现说明
  - `buildModelIdentityLockText(...)` 改为单一 `Selected model` 摘要。
  - 模特描述限制长度，并保留 gender、age、hair、skin、outfit、scene 等关键身份字段。
  - 商品参考图人物排除规则合并为短句：商品参考只锁商品，不锁人物身份。
  - 保留 one human model only、no mixed identity、no borrowed product-reference person、no gender change 等关键约束。
- 使用说明
  - 重新打开分镜图片提示词预览后，`Model Identity Lock` 不应再同时出现 `Selected model profile` 和 `Selected model identity` 两套长文。
  - 男性模特仍应能看到 `gender male`。
- 验证
  - `npm run typecheck`

## 2026-05-23 分镜图片 Prompt 主体压缩

- 需求
  - 商品描述和模特锁压缩后，完整 `Start Prompt` 仍接近图片 prompt 上限，预览持续提示“长度偏高”。
- 变更文件
  - `src/main/modules/clone/gptImage.ts`
  - `src/renderer/src/ui/views/CloneView.vue`
- 实现说明
  - 仅在分镜图片 prompt 内使用短版 `REFERENCE IMAGE LOCK`、`NO SUBSTITUTE RULE`、`FRAME CONTINUITY LOCK`、`HUMAN PRIORITY RULE`。
  - 压缩 `FRAME SCENE ATMOSPHERE LOCK` 和 `productLock(...)` 文案，保留场景深度、自然阴影、非白底、商品结构不变等关键要求。
  - 压缩 `buildReferenceResponsibilityText(...)`，保留商品图只锁商品、不锁人物身份。
  - End Prompt 头部不再重复追加长版 `FRAME CONTINUITY LOCK`，只保留一个短版连续性锁。
  - 移除分镜图片 prompt 中重复的 reference/script/minimal/fail 文案，编译商品锁压缩到 520 字符。
  - 前端“长度偏高”提示阈值调整为接近 2600 上限时再提醒。
- 使用说明
  - 重新打开分镜图片提示词预览后，哨兵应显示 `shot-image-prompt-2026-05-23-compact-frame-v7`。
  - `Start Prompt` / `End Prompt` 应仍包含核心 marker，目标长度低于 2200。
- 验证
  - `npm run typecheck`

## 2026-05-23 分镜视频闪耀特效负向词修复

- 需求
  - `Video Negative Prompt` 重复、过长且会截断半句，实际生成仍出现夸张闪亮、星芒、镜头炫光等特效。
- 变更文件
  - `src/main/modules/clone/prompt.ts`
  - `src/main/modules/clone/service.ts`
- 实现说明
  - `sanitizeNegativePrompt(...)` 改为按条目保留，不再用字符串 `slice` 截断半句。
  - `buildVideoAntiSparkleNegativePrompt(...)` 将闪耀/VFX 禁令前置，包括 no sparkle、no starburst、no lens flare、no radial light rays、no light burst、no glowing white core、no bloom blob、no self-luminous product。
  - 负向词去重并压缩到短硬约束，减少重复的 product/person identity 词。
  - 视频正向 prompt 新增并前置 `ABSOLUTE VIDEO LIGHTING RULE`，明确自然光、禁止闪亮特效，避免视频模型忽略 negative prompt。
  - 压缩视频正向 prompt 前半段重复的 silent/reference/model/person 排除规则，保证光效硬约束不被截断。
  - 视频提示词预览哨兵更新为 `shot-video-prompt-2026-05-23-anti-vfx-v4`。
- 使用说明
  - 重新打开视频提示词预览后，`Video Negative Prompt` 应优先显示 no sparkle / no starburst / no lens flare 等短禁令，不应出现半句截断。
  - 视频正向 prompt 前几段应包含 `ABSOLUTE VIDEO LIGHTING RULE`。
- 验证
  - `npm run typecheck`

## 2026-05-23 分镜图片商品一致性直用锁

- 需求
  - 商品描述压缩后，分镜图片仍可能把商品按文本重新绘制，导致生成商品与 `Product Canonical Source` 不一致。
- 变更文件
  - `src/main/modules/clone/gptImage.ts`
  - `src/main/modules/clone/service.ts`
  - `src/renderer/src/ui/views/CloneView.vue`
- 实现说明
  - 分镜图片 prompt 新增 `DIRECT PRODUCT REUSE LOCK`，要求直接把 `Product Canonical Source` 作为实际商品视觉来源，而不是松散灵感。
  - 明确保留 silhouette、component count、attachment points、holes、edges、material、color、proportions、scale。
  - 耳饰额外锁定 pair count、dangling chain、connector、stone/pearl placement、hanging direction、ear attachment point。
  - `STRICT PRODUCT IDENTITY LOCK FOR THIS FRAME` 上限从 520 恢复到 900，补回结构细节。
  - 图片提示词预览新增“直用锁 在/缺”诊断。
- 使用说明
  - 重新打开分镜图片提示词预览后，哨兵应显示 `shot-image-prompt-2026-05-23-product-fidelity-v8`。
  - Prompt 统计中应显示“直用锁 在”。
  - 已经商品不一致的分镜需要强制重新生成分镜图片。
- 验证
  - `npm run typecheck`

## 2026-05-23 分镜 Prompt 方向冲突修正

- 需求
  - 当前提示词存在“复制商品实例/重新生成商品”“studio-like 白底/真实氛围”“耳饰佩戴/头出框无脸”之间的方向冲突，导致商品不一致、背景发白、耳饰构图不稳定。
- 变更文件
  - `src/main/modules/clone/gptImage.ts`
  - `src/main/modules/clone/prompt.ts`
  - `src/main/modules/clone/providers.ts`
  - `src/main/modules/clone/service.ts`
  - `src/renderer/src/ui/views/ModelLibraryView.vue`
- 实现说明
  - 将默认耳饰模特场景从 `clean soft studio-like background` 改为真实室内/生活环境、自然光、浅景深和中性居家/梳妆空间。
  - 全局静默商业规则不再强制所有人物无脸/头出框；耳饰和佩戴类允许耳区、下颌和局部脸出现，但脸不能主导。
  - 视频执行 override 同步取消“head out of frame whenever possible”，改为静默、非主播、耳区可见。
  - `DIRECT PRODUCT REUSE LOCK` 改为 `PRODUCT VISUAL ANCHOR LOCK`，用视觉锚点约束商品特征，避免要求模型做不到的像素级复制。
  - 商品描述在存在 Canonical Source 时也会带入紧凑 product analysis / PRODUCT DNA，而不是只显示绑定商品 ID。
  - 耳饰 product analysis fallback 改为明确 DNA：hoop/drop shape、connector、clasp/hinge、chain、attachment relation、metal/stone/pearl、thickness、diameter/length、ear scale。
  - 图片和视频 prompt 增加真实氛围词：背景深度、自然光、柔和皮肤阴影、环境色、真实景深、微反差、轻微不完美真实感。
  - 旧的英文通用 fallback（`general` + `uploaded reference images`）现在会被识别为无效分析并触发重新分析。
  - 图片提示词预览哨兵更新为 `shot-image-prompt-2026-05-23-product-analysis-refresh-v10`。
- 使用说明
  - 重新生成模特或分镜图片后，不应再默认走白底 studio-like 背景。
  - 耳饰分镜应允许耳朵和局部脸/下颌出现，产品仍为视觉主角。
  - 商品一致性应看 `PRODUCT VISUAL ANCHOR LOCK` 和 `Product Canonical Source` 是否同时存在。
- 验证
  - `npm run typecheck`

## 2026-05-23 商品标准源分析前移到商品库

- 需求
  - 商品描述不应在 clone 项目里临时分析后缓存；应在商品库 `Product Canonical Source` 生成完成时就分析并复用。
- 变更文件
  - `src/main/modules/products/types.ts`
  - `src/main/modules/products/repo.ts`
  - `src/main/modules/clone/types.ts`
  - `src/main/modules/clone/repo.ts`
  - `src/main/modules/clone/service.ts`
- 实现说明
  - `Product` 新增 `productAnalysis` 字段，和 `canonicalSourcePath` 一起持久化在商品库。
  - 标准源生成成功后，立即对 canonical source 做商品结构分析，并写回商品库。
  - clone 绑定商品时，`boundProductSnapshot` 同步携带商品库里的 `productAnalysis`。
  - clone 侧构造商品描述时优先读商品库分析，项目内 `consistencyAssets.productAnalysis` 只做镜像缓存。
  - 旧的 `general + uploaded reference images` fallback 不再被视为有效分析。
- 使用说明
  - 重新生成或刷新商品标准源后，后续 clone 项目应直接复用商品库里的商品分析。
  - 图片提示词预览哨兵应显示 `shot-image-prompt-2026-05-23-product-analysis-refresh-v10`。
- 验证
  - `npm run typecheck`

## 2026-05-23 商品分析画板人物残留硬阻断

- 需求
  - 修复耳饰等商品在分析画板中仍出现耳朵、皮肤、人物局部的问题。
  - 商品分析画板必须优先输出纯产品、多角度、白底结果。
- 变更文件
  - `src/main/modules/clone/productImageSanitizer.ts`
  - `src/main/modules/clone/productAnalysisBoard.ts`
- 实现说明
  - 商品上传图先逐张执行 `product-only extraction`。
  - 每张净化结果新增一次多模态纯商品审查：
    - 若仍检测到 `ear`、`skin`、`hair`、`hand`、`face`、`wearing context` 等人物残留，则该净化图直接判失败。
    - 失败图不允许继续进入分析画板输入集合。
  - 分析画板主输出改为基于净化后的纯商品图进行本地白底拼板，避免第二次图片生成重新补回人物。
  - 画板风格统一为纯白背景、商品多角度网格、轻微接地阴影，不再走生活化或佩戴式板图表达。
- 使用说明
  - 在商品详情页点击“重新生成”后，系统会先净化上传图，再审查净化结果是否仍带人物残留。
  - 若净化后仍有人物局部，本轮会直接失败并提示重新上传更干净的商品图，而不是继续产出错误画板。
  - 审查通过后会生成纯白底多角度商品分析画板；英文 `Product DNA` 描述仍同步生成并显示。
- 验证
  - `npm run typecheck`

## 2026-05-23 商品建模流程收敛为单图标准图

- 需求
  - 商品库建模流程从“多图联合分析”收敛为稳定版“单图标准图 -> 多角度图”。
  - 用户只需上传 1 张原始商品图，系统先生成标准图，再基于标准图生成多角度图，并同步生成英文 Product DNA。
- 变更文件
  - `src/main/modules/clone/productImageSanitizer.ts`
  - `src/main/modules/clone/productAnalysisBoard.ts`
  - `src/main/modules/clone/service.ts`
  - `src/renderer/src/ui/views/ProductDetailView.vue`
- 实现说明
  - 商品库上传图输入收紧为单图模式，后续再上传时以替换为主，不再累积多张图片参与建模。
  - 商品标准图生成链改为第一阶段主资产：
    - 原始图 -> AI 提纯标准图
    - 标准图审查失败则整条链失败
  - 多角度图生成链改为第二阶段：
    - 仅基于标准图扩展为白底多角度图板
    - 不再直接从原始上传图集合生成图板
  - `canonicalSourcePath` 恢复为标准图语义，`analysisBoardPath` 保留为多角度图语义。
  - Product DNA fallback 与结构化描述改为 single canonical product source 语义，不再使用 multi-reference 文案。
  - `/clone` 绑定商品时仍优先使用多角度图作为主参考，缺失时回退到标准图。
- 使用说明
  - 商品详情页先上传 1 张标准原图，再点击“生成标准图与多角度图”。
  - 后续若更换原图，再次上传会替换旧图，并按新图重新建模。
  - 若标准图未生成成功，不会继续生成多角度图。
- Windows / Linux 兼容说明
  - 本轮仅修改 TypeScript 主进程与 Vue 页面逻辑。
  - Windows 开发与 Linux 部署复用同一实现，不依赖平台专属路径规则。
- 验证
  - `npm run typecheck`

## 2026-05-22 视频批量加字幕工作台乱码修复

- 需求
  - 修复桌面端 `插件 -> 视频批量加字幕` 工作台首屏与右侧配置区中文文案乱码问题，保证页面可读可操作。
- 变更文件
  - `src/renderer/src/ui/views/VideoBatchSubtitleView.vue`
- 实现说明
  - 仅修复批量字幕工作台页面内的显示文案，不改动主进程渲染链路、任务接口和页面结构。
  - 恢复头部标题、副标题、步骤条、素材区、预览区、任务队列、输出区以及右侧“越南爆款模式”配置区的中文文案。
  - 同步修复页面内状态提示、按钮标签、错误提示和成功提示，避免用户操作时继续看到乱码或问号占位。
- 使用说明
  - 进入 `插件 -> 视频批量加字幕` 后，首屏标题、右侧策略卡片、越南爆款配置项、保存/渲染/推送按钮应全部正常显示中文。
  - 若后续继续扩展该页面，优先在 UTF-8 编码下维护同一文件，避免再次引入乱码常量。
- 验证
  - `npm run typecheck`
  - 手动进入批量字幕工作台，确认截图中出现乱码的位置均已恢复正常中文显示。

## 2026-05-24 模特生成收敛为单张九宫格

- 需求
  - 模特生成不再连续产出多张独立参考图，当前只需要 1 张最终图。
  - 最终输出应为单张九宫格模特参考图，便于快速确认身份，不再增加无效生成成本。
- 变更文件
  - `src/main/modules/clone/gptImage.ts`
- 实现说明
  - `generateModelIdentityPackImages(...)` 从原先循环生成 9 张独立图片，收敛为只生成 1 张图片。
  - 模特生成 prompt 改为明确要求输出“单张 3x3 九宫格 contact sheet”，而不是 9 个分离文件。
  - mock 兜底模式也同步改为只返回 1 张占位图，保持桌面端数据结构兼容。
- 使用说明
  - 现在在模特库点击生成模特后，只会得到 1 张模特图。
  - 该图应为单张九宫格，内部包含 9 个稳定参考视角，用于后续模特身份复用。
- Windows / Linux 兼容说明
  - 本轮仅修改 TypeScript 主进程图片生成逻辑，不依赖平台专属能力。
- 验证
  - `npm run typecheck`

## 2026-05-24 模特九宫格同一身份硬锁补强

- 需求
  - 单张九宫格里的 9 个画面必须是同一个模特，只允许角度和姿态变化，不允许身份漂移。
  - 需要进一步禁止换衣服、换发型、换妆容、换年龄感、换脸型等问题。
- 变更文件
  - `src/main/modules/clone/gptImage.ts`
- 实现说明
  - 模特九宫格 prompt 新增 `IDENTITY CONSISTENCY LOCK`。
  - 明确锁定同一模特的脸型、五官比例、肤色、年龄感、发型、发色、妆容方向和体型表达。
  - 明确锁定同一套服装方向，包括服装类别、颜色方向、领口与整体搭配语言。
  - 明确九宫格内只允许变化镜头角度、裁切、姿态、手位和产品互动视角，不允许出现第二个人或 lookalike。
- 使用说明
  - 现在生成的单张九宫格应表现为“同一个模特的多角度参考图”，而不是 9 个相似但不一致的人。
  - 若仍发现九宫格内身份漂移，优先继续检查当前模型 provider 的实际出图稳定性，而不是回退到多张独立图方案。
- Windows / Linux 兼容说明
  - 本轮仅修改 TypeScript prompt 组装逻辑，不依赖平台专属能力。
- 验证
  - `npm run typecheck`

## 2026-05-24 模特九宫格背景与服装色系统一锁

- 需求
  - 模特九宫格除了必须是同一人，还要尽量保持同一背景逻辑和同一套服装色系，避免 9 格像 9 次不同拍摄。
- 变更文件
  - `src/main/modules/clone/gptImage.ts`
- 实现说明
  - 新增 `WARDROBE COLOR LOCK`，明确要求九宫格内保持同一服装颜色家族、同一面料方向、同一套搭配逻辑。
  - 新增 `BACKGROUND CONSISTENCY LOCK`，明确要求九宫格内保持同一场景家族、同一背景逻辑、同一空间深度感和同一光线方向。
  - 补充负向限制：禁止 outfit recolor、background replacement、scene jump。
- 使用说明
  - 现在的单张九宫格除了同一身份，还应尽量表现为同一场景中的多角度连贯参考图。
  - 若模型仍发生明显换景或换衣服色系，优先继续收紧 provider 侧 prompt 执行强度，不回退到多张图方案。
- Windows / Linux 兼容说明
  - 本轮仅修改 TypeScript prompt 组装逻辑，不依赖平台专属能力。
- 验证
  - `npm run typecheck`

## 2026-05-24 桌面端模特小批量并发生成提效

- 需求
  - 桌面端模特生成一次只能等待单个任务完成，当前效率过低。
  - 需要支持一次发起多个模特生成，同时控制并发，避免图片接口拥堵。
- 变更文件
  - `src/renderer/src/ui/views/ModelLibraryView.vue`
- 实现说明
  - 模特创建面板新增批量生成数量状态，当前支持 `1 / 3 / 5` 个。
  - 前端新增 `generateModelsBatch()`，继续复用现有 `generateModelIdentityPack` 接口，不新增主进程协议。
  - 批量提交采用小并发执行，当前并发上限为 `2`，在效率和稳定性之间取保守平衡。
  - 生成完成后前端会输出批量成功数和失败数摘要。
- 使用说明
  - 现在在桌面端模特库里可以一次发起多个模特生成。
  - 每个模特仍然只产出 `1` 张九宫格参考图，但可以并发排队生成多个模特，减少等待时间。
- Windows / Linux 兼容说明
  - 本轮仅修改 Vue 前端交互逻辑，不依赖平台专属能力。
- 验证
  - `npm run typecheck`

## 2026-05-24 Clone 任务列表密度统一第二轮

- 需求
  - 继续统一 `/clone` 任务列表页的展示密度，避免任务信息区 pill 过多、素材/进度/更新时间像不同组件拼在一起、错误提示过重。
- 变更文件
  - `src/renderer/src/ui/views/CloneTaskListView.vue`
- 实现说明
  - 任务信息区保留关键运行模式 pill，其余“模特 / Ref”改成轻量文本+分隔点，降低视觉噪音。
  - 素材区、进度区、更新时间区统一收紧字号、行距和对齐方式，让整行更像规则表格而不是多个卡片块。
  - 错误提示改成更干净的单行样式，并通过分隔线与主体信息轻度分离，避免整行被大红错误条打散。
- 使用说明
  - 现在 `/clone` 列表页会更偏表格化信息阅读，任务状态、素材数量、进度和更新时间更容易横向扫读。
- Windows / Linux 兼容说明
  - 本轮仅修改 Vue 模板和页面样式，不依赖平台专属能力。
- 验证
  - `npm run typecheck`

## 2026-05-24 Clone 任务列表密度统一第三轮

- 需求
  - 继续把 `/clone` 任务列表页压到更接近复制视频列表的紧凑表格感，重点收缩缩略图、行高、列宽和操作按钮体积。
- 变更文件
  - `src/renderer/src/ui/views/CloneTaskListView.vue`
- 实现说明
  - 行容器列宽重新压缩，任务信息列权重提高，其余列更窄更表格化。
  - 缩略图从 `92x78` 收紧到 `80x68`，行高同步降低，减少首屏占用。
  - 标题、描述、素材数、进度百分比、更新时间字号统一下调一档。
  - 操作按钮从 `32x32` 进一步收紧到 `28x28`，间距同步减小，减少右侧按钮组的体积感。
- 使用说明
  - 现在 `/clone` 任务列表单行更矮、更密，横向扫读时会更接近复制视频列表的工作台感。
- Windows / Linux 兼容说明
  - 本轮仅修改 Vue 页面样式，不依赖平台专属能力。
- 验证
  - `npm run typecheck`

## 2026-05-24 Clone 复刻视频列表按设计稿重做

- 需求
  - 复刻视频列表需要按最新设计稿调整，不能继续维持“半卡片半表格”的过渡态。
  - 重点是让列表区呈现深色工作台、圆角行卡、紧凑表头和更统一的任务表结构。
- 变更文件
  - `src/renderer/src/ui/views/CloneTaskListView.vue`
- 实现说明
  - 列表容器改为独立深色面板底，表头与列表区形成更完整的工作台块。
  - 表头列宽、字体和间距统一收紧，弱化旧的宽松卡片感。
  - 每一行任务改为圆角深色行卡，并补充轻描边、内高光和 hover 态，贴近设计稿中的层次关系。
  - 错误行去掉旧的“压在分隔线下方”的残留表现，改为和整行卡片结构统一。
- 使用说明
  - 现在 `/clone` 列表页的任务区会更贴近设计稿里的工作台表格，而不是普通列表加边框。
- Windows / Linux 兼容说明
  - 本轮仅修改 Vue 页面样式，不依赖平台专属能力。
- 验证
  - `npm run typecheck`

## 2026-05-24 Clone 复刻视频列表顶部与工具区设计稿对齐

- 需求
  - 继续按设计稿收口 `/clone` 复刻视频列表，重点修正顶部工具区、统计卡、分组条和表格列宽，让整体更像成型的复制视频列表，而不是局部修补。
- 变更文件
  - `src/renderer/src/ui/views/CloneTaskListView.vue`
- 实现说明
  - 顶部头部重构为双层结构：首行包含标题、搜索、两个数字计数、主按钮和用户位；次行承载批量导出、自动/手动运行和新建任务。
  - 统计区改为更接近设计稿的五张信息卡，并将末卡口径从“草稿箱”调整为“等待输出”。
  - 分组条、视图工具按钮、表头列宽、任务行高、缩略图尺寸、操作按钮和错误条样式统一压缩，强化复制视频列表那种深色工作台表格感。
- 使用说明
  - 现在 `/clone` 列表页从顶部工具区到任务表会呈现更完整的一致结构，首屏信息层级和横向扫读效率更接近设计稿。
- Windows / Linux 兼容说明
  - 本轮仅修改 Vue 页面结构与样式，不依赖平台专属能力。
- 验证
  - `npm run typecheck`

## 2026-05-24 最终成片门禁误判已有镜头输出修复

- 需求
  - 修复 `/clone/[projectId]` 在分镜视频实际已生成的情况下，最终成片仍提示“镜头未达标”并阻塞合成的问题。
- 变更文件
  - `src/main/modules/clone/service.ts`
  - `src/renderer/src/ui/views/CloneView.vue`
- 实现说明
  - 最终门禁校验改为统一复用镜头的有效输出状态，优先读取 `shotVideoOutputs.videoPath/localPath` 与有效 `generatedClipPath`，不再只依赖旧镜头字段。
  - 对“仅时长偏离目标但已有可用视频片段”的情况继续保持放行，避免被误算进最终阻塞镜头。
  - 前端最终门禁摘要同步按同一口径计算，避免界面把已有片段的镜头继续显示为失败。
- 使用说明
  - 当镜头视频已经真实生成并回写到任务输出列表后，重新点击“重新合成”时，不应再因为旧字段未同步而被误拦截。
- Windows / Linux 兼容说明
  - 本轮仅修改 TypeScript 主进程与 Vue 前端判定逻辑，不依赖平台专属能力。
- 验证
  - `npm run typecheck`

## 2026-05-24 最终门禁残留 canEnterRender=false 兼容修复

- 需求
  - 修复部分历史项目在镜头视频已成功落盘后，`shot.canEnterRender` 仍残留为 `false`，导致自动门禁和手动成片都继续误判失败的问题。
- 变更文件
  - `src/main/modules/clone/service.ts`
  - `src/renderer/src/ui/views/CloneView.vue`
- 实现说明
  - `getEffectiveShotState(...)` 新增兼容口径：当镜头已有 `shotVideoOutputs.status=done` 且存在本地视频路径，同时 `qualityStatus !== failed` 时，允许有效输出覆盖历史残留的 `canEnterRender=false`。
  - 自动流程 `autoRunCloneToFinalGate(...)` 不再直接用旧 `shot.canEnterRender` 作为唯一阻塞依据，改为使用有效镜头状态。
  - 前端门禁摘要同步兼容这类旧标记，避免界面继续把已成功镜头显示成阻塞。
- 使用说明
  - 对于已成功生成并落盘的视频镜头，即使历史项目里残留旧的门禁布尔值，重新合成时也应可继续进入最终成片。
- Windows / Linux 兼容说明
  - 本轮仅修改 TypeScript 主进程与 Vue 前端判定逻辑，不依赖平台专属能力。
- 验证
  - `npm run typecheck`

## 2026-05-25 Clone 分镜视频提交幂等与防重复扣费修复

- 需求
  - 修复 `/clone` 分镜视频阶段在 `creating` 且 `taskId` 尚未回写时被重复提交的问题。
  - 明确约束“同步补查 / 继续查询 / 强制下载”只能查旧任务和下载旧结果，绝不允许隐式重新创建云端视频任务。
  - 防止用户在短时间重复点击“重新生成”或自动流程重入时产生多笔云端视频费用。
- 变更文件
  - `src/main/modules/clone/types.ts`
  - `src/main/modules/clone/repo.ts`
  - `src/main/modules/clone/service.ts`
  - `test/clone-video-submit-idempotency.smoke.ts`
  - `test/clone-video-submission-lock-persistence.smoke.ts`
  - `package.json`
- 实现说明
  - `CloneShotVideoOutput` 新增 `submissionFingerprint / submissionStartedAt / submissionLockedUntil`，并持久化到 SQLite 真源。
  - `ensureAi666SegmentVideoTask(...)` 新增进程内 `in-flight` 提交锁，同一 `projectId + shotId` 在任务创建未完成前只复用同一次提交。
  - 主进程将 `status=creating` 且处于锁定窗口内的镜头视为“正在提交中”，不会因为暂时还没有 `taskId` 而再次调用 `createAi666VideoTask(...)`。
  - 批量分镜视频提交和单镜头“重新生成”都改为复用同一套提交指纹与冷却窗判断，避免自动流程和手工点击双重重提。
  - 查询链路继续保持“只查询、不创建”的语义；当镜头缺少可继续查询的 `taskId` 时，只会回写 `missing_task` 失败态，不会兜底新建云端任务。
- 使用说明
  - 当镜头状态显示“云端生成中”且任务尚在提交窗口内，再点“重新生成”不会再次扣费开新单，而是继续等待当前任务号回写。
  - “同步补查 / 继续查询 / 强制下载”现在只会跟进已有任务号或已有远端结果；如果历史脏状态缺少 `taskId`，需要在失败提示后手动点一次“重新生成”。
- Windows / Linux 兼容说明
  - 本轮仅修改 TypeScript 主进程仓储与服务逻辑，不依赖 Windows 专属 API。
  - 锁字段保存在 SQLite 真源里，Windows 开发环境与 Linux 部署环境使用同一数据语义。
- 验证
  - `npm run typecheck`
  - `npm run test:clone-video-submit-idempotency`
  - `npm run test:clone-video-submission-lock-persistence`

## 2026-05-25 饰品视频高光发光抑制加强

- 需求
  - 修复耳环、宝石、银饰等饰品在分镜视频生成时，即使 negative prompt 已经禁止 sparkle / glow / starburst，成片仍然出现自发光、白核亮点、星芒和珠宝特效的问题。
- 变更文件
  - `src/main/modules/clone/prompt.ts`
  - `src/main/modules/clone/providers.ts`
- 实现说明
  - 强化 `buildJewelryLightEffectBanText(...)`，将饰品光效限制从“弱约束高光收敛”升级为“绝不允许自发光、绝不允许点状亮斑、绝不允许白核、绝不允许脱离表面的亮点感”。
  - 在视频正向 prompt 组装链路中，把饰品光效禁令作为独立控制层注入，不再只依赖 negative prompt。
  - 耳环类 `jewelryRealism` 正向描述同步收紧，明确要求非发光、非特效、非点状高光的平面材质反射。
- 使用说明
  - 重新生成耳环/珠宝类分镜视频后，模型会优先遵守“无星芒、无白核、无自发光、无灯泡感”的正向控制层。
  - 历史已生成的视频不会自动变化，需要对目标镜头重新生成才能应用新规则。
- Windows / Linux 兼容说明
  - 本轮仅修改 TypeScript prompt 组装逻辑，不依赖平台专属能力。
- 验证
  - `npm run typecheck`

## 2026-05-25 分镜视频最终正向 Prompt 防截断修复

- 需求
  - 修复桌面端 `/clone` 分镜视频“最终发送给模型”的正向 prompt 中，饰品 anti-glow / anti-sparkle 硬约束被长文本截断后丢失的问题。
  - 保证提示词预览、调试日志、真实提交三者使用同一份最终正向 prompt。
- 变更文件
  - `src/main/modules/clone/prompt.ts`
  - `src/main/modules/clone/providers.ts`
  - `src/main/modules/clone/service.ts`
- 实现说明
  - 新增 `buildFinalShotVideoPositivePrompt(...)` 作为桌面端分镜视频统一最终正向 prompt 构造入口。
  - 将饰品 `CRITICAL ANTI-GLOW PRODUCT RULE` 前置到最终 prompt 最前方，避免被后续长篇 identity lock 文案截断。
  - `getShotVideoPromptPreview(...)` 与真实提交共用同一 helper，确保弹窗复制内容与日志、实际发给模型的内容一致。
  - 最终 prompt 上限从原先外层 2400 提升到 3200，减少后段约束被截断的概率。
- 使用说明
  - 现在打开分镜视频提示词弹窗时，`Video Positive Prompt (Final Sent)` 应直接包含明确的 anti-glow / anti-sparkle 约束，而不是只体现在 negative prompt 里。
  - 重新生成饰品类分镜视频后，可在日志 `[clone-debug] final-shot-video-prompts` 中直接复制最终发送的完整 prompt。
- Windows / Linux 兼容说明
  - 本轮仅修改 TypeScript prompt 组装逻辑，不依赖平台专属能力。
- 验证
  - `npm run typecheck`

## 2026-05-26 分镜视频饰品 Anti-Glow 触发条件兜底修复

- 需求
  - 修复部分耳环/饰品镜头因为 `productType` 为空、脏值或被归一成 `general`，导致最终视频正向 prompt 没有注入 anti-glow / anti-sparkle 硬约束的问题。
- 变更文件
  - `src/main/modules/clone/prompt.ts`
  - `src/main/modules/clone/providers.ts`
- 实现说明
  - 新增 `buildShotAntiGlowPromptBlock(...)`，不再只依赖 `productType`，改为联合 `productType / generationPrompt / visualDescription / productIdentityText / materialNeed` 识别饰品镜头。
  - 只要任一关键字段出现耳环、珠宝、银饰、钻石、锆石、水晶等语义，就强制前置 anti-glow 正向硬约束。
  - 视频最终 prompt 调试日志新增 `inferredAntiGlowRuleApplied` 与 `productType`，便于快速判断该镜头是否命中了防闪耀规则。
- 使用说明
  - 即使历史镜头的 `productType` 已经脏成 `general`，只要镜头文案里仍然包含饰品语义，重新生成后最终 prompt 也会自动带上 anti-glow 规则。
- Windows / Linux 兼容说明
  - 本轮仅修改 TypeScript prompt 判断与日志逻辑，不依赖平台专属能力。
- 验证
  - `npm run typecheck`

## 2026-05-26 分镜视频 ProductType 回退修复

- 需求
  - 修复部分历史镜头的 `shot.productType` 被洗成 `general` 后，分镜视频预览与最终 prompt 都错误失去饰品语义的问题。
- 变更文件
  - `src/main/modules/clone/service.ts`
- 实现说明
  - 新增 `resolveProjectLevelProductType(...)` 与 `resolveShotPromptProductType(...)`。
  - 当镜头级 `productType` 为 `general` 或脏值时，自动回退到项目级 `baseBlueprint.productCategory / blueprint.productCategory / boundProductSnapshot.productAnalysis.category / boundProductSnapshot.type`。
  - 分镜视频提示词预览日志新增 `shotProductType / resolvedProductType`，便于判断是否发生了项目级回退。
- 使用说明
  - 对于历史脏项目，即使单镜头 `productType` 被写坏，只要项目主商品类别仍然是耳环等饰品，最终视频 prompt 仍会按饰品规则构造。
- Windows / Linux 兼容说明
  - 本轮仅修改 TypeScript 服务层判定逻辑，不依赖平台专属能力。
- 验证
  - `npm run typecheck`

## 2026-05-26 自动运行在脚本生成后停止的衔接修复

- 需求
  - 修复桌面端 `/clone` 自动运行在“参考视频分析完成 -> 脚本候选生成”后未继续推进到后续分镜阶段的问题。
- 变更文件
  - `src/renderer/src/ui/views/CloneView.vue`
- 实现说明
  - 原逻辑在 `generateScriptVariants()` 成功后只写入 `autoBootstrapSignature`，但没有直接继续调用自动运行，导致 watcher 被自己短路后，自动流程停在脚本阶段。
  - 现改为脚本候选生成完成后，若仍处于自动模式且满足自动推进条件，直接调用 `autoRunToStoryboardVideos()` 继续后续流程。
  - 若脚本生成后的自动衔接失败，会清理自动启动签名并刷新项目状态，避免页面停在假运行状态。
- 使用说明
  - 点击自动运行并完成参考视频分析后，脚本候选生成完成应继续自动推进到分镜图和分镜视频阶段，不应停在脚本阶段不动。
- Windows / Linux 兼容说明
  - 本轮仅修改 Vue 前端页面自动衔接逻辑，不依赖平台专属能力。
- 验证
  - `npm run typecheck`

## 2026-05-26 自动运行意图在分析阶段丢失修复

- 需求
  - 修复桌面端 `/clone` 从“自动运行”入口启动后，在参考视频分析完成时因为项目 `runMode` 尚未稳定回写，导致自动续跑标记丢失、流程停在脚本阶段的问题。
- 变更文件
  - `src/renderer/src/ui/views/CloneView.vue`
- 实现说明
  - 新增页面本地状态 `autoRunIntentArmed`，显式记录“本次是自动运行入口触发”的用户意图。
  - `createBlueprint()` 与自动启动 watcher 不再只依赖 `current.runMode === 'auto'`，而是优先使用本地自动运行意图兜底。
  - 当自动续跑成功完成或失败终止时，清理该本地标记，避免后续手动操作被误判成自动模式。
- 使用说明
  - 即使项目 `runMode` 在分析完成时尚未及时刷新，自动运行也会继续推进，不应只停在“脚本分析完成，当前通道：electron-ipc”。
- Windows / Linux 兼容说明
  - 本轮仅修改 Vue 页面本地状态控制逻辑，不依赖平台专属能力。
- 验证
  - `npm run typecheck`

## 2026-05-27 参考分析入口自动续跑意图补齐

- 需求
  - 修复桌面端 `/clone` 在分析页点击主按钮执行参考视频分析时，自动运行意图没有被显式带入，导致分析完成后停在“脚本分析完成”而不继续自动生成脚本的问题。
- 变更文件
  - `src/renderer/src/ui/views/CloneView.vue`
- 实现说明
  - `createBlueprint()` 入口现在会在项目为 `runMode=auto` 时先显式写入 `autoRunIntentArmed`。
  - 这样即使项目快照刷新稍慢，参考视频分析完成后仍会继续进入 `generateScriptVariants()`，不会丢失自动续跑意图。
- 使用说明
  - 自动模式项目在分析页点击主按钮后，分析完成应继续自动生成脚本，不应只停在“脚本分析完成，当前通道：electron-ipc”。
- Windows / Linux 兼容说明
  - 本轮仅修改 Vue 前端页面状态逻辑，不依赖平台专属能力。
- 验证
  - `npm run typecheck`

## 2026-05-27 分镜视频远端成功后自动续查下载补轮

- 需求
  - 修复桌面端 `/clone` 分镜视频中，远端已经生成成功，但本地只完成部分下载，其余镜头一直停留在“云端生成中”，没有继续自动查询并触发下载回写的问题。
- 变更文件
  - `src/main/modules/clone/service.ts`
- 实现说明
  - `reconcileRemoteStoryboardVideosInternal(...)` 结束后，若项目里仍存在“有 taskId 但未落盘”或“已拿到 videoUrl 但未下载”的镜头，会自动延迟挂起下一轮 reconcile。
  - 新增 `hasPendingRemoteStoryboardVideoWork(...)`，统一判断哪些镜头仍需要后台续查或下载。
  - 避免后台只查一轮就停住，导致远端稍后成功的镜头永远没人再去拉取。
- 使用说明
  - 后续分镜视频在远端完成后，即使不是同一瞬间返回，本地也应继续自动续查，并在拿到结果后自动下载回写，不应长期停留在“云端生成中”。
- Windows / Linux 兼容说明
  - 本轮仅修改 TypeScript 主进程后台调度逻辑，不依赖平台专属能力。
- 验证
  - `npm run typecheck`

## 2026-05-27 分镜视频任务号误清空修复

- 需求
  - 修复桌面端 `/clone` 分镜视频阶段里，部分镜头虽然远端视频任务已经成功创建或完成，但本地因残留图片模型标记误判为“图片任务映射”，导致 `taskId` 被清空、界面长期停留在“云端生成中”或“缺少任务号”，且后台停止继续补查的问题。
- 变更文件
  - `src/main/modules/clone/service.ts`
- 实现说明
  - 收紧 `isImageTaskMapping(...)` 判定，只在 `taskId` 本身明确属于历史图片任务号时才认定为图片任务映射，不再根据残留的 `provider/model` 文本直接清空视频任务号。
  - 收紧 `hasInvalidVideoTaskMapping(...)` 清理条件：若当前镜头已经存在可解析的有效视频 `taskId`，则不再因为旧的图片 provider/model 残留而执行清理。
  - 这样可以保留已经提交到云端的视频任务号，让后续 `reconcileRemoteStoryboardVideosInternal(...)` 继续查询、下载并回写远端成功结果。
- 使用说明
  - 若分镜视频列表中已有远端成功结果，但本地历史项目残留了图片模型文案，重新进入项目或触发同步后，镜头应继续保留原视频 `taskId` 并自动续查，不应再无故掉成“缺少任务号”。
- Windows / Linux 兼容说明
  - 本轮仅调整 TypeScript 主进程状态判定逻辑，不依赖平台专属能力，Windows 开发环境与 Linux 部署环境通用。
- 验证
  - `npm run typecheck`

## 2026-05-27 分镜视频前端旧图片任务号覆盖修复

- 需求
  - 修复桌面端 `/clone` 分镜视频阶段中，主进程已经回写新的视频 `taskId`，但前端仍可能回退显示旧的 `gpt_frame_*` 图片任务号或旧图片模型，导致界面显示“待补任务号 / 创建任务中 / 模型为 gpt-image-2”的错乱状态。
- 变更文件
  - `src/renderer/src/composables/useCloneProjectWorkspace.video.ts`
  - `src/renderer/src/ui/views/CloneView.vue`
- 实现说明
  - 前端分镜视频任务号解析新增过滤：`gpt_frame_* / mj_*` 不再作为视频阶段的有效 `taskId` 使用。
  - “强制重新生成已提交”的成功日志优先使用主进程返回的 `res.task.taskId`，避免被页面内旧快照污染。
  - 分镜视频列表与右侧详情栏在合并 `shotVideoOutputs` 与 `blueprint.shots` 时，若旧 `existing.taskId/provider/model` 明显属于图片链路，则优先使用镜头上的最新视频字段。
- 使用说明
  - 重新生成分镜视频后，界面中的任务 ID、模型与状态应优先反映最新视频任务，不应再回退显示 `gpt_frame_*` 或 `grsai-image / gpt-image-2`。
- Windows / Linux 兼容说明
  - 本轮仅修改 Vue 前端状态合并与展示逻辑，不依赖平台专属能力，Windows 开发环境与 Linux 部署环境通用。
- 验证
  - `npm run typecheck`

## 2026-05-27 分镜视频任务号被旧快照回滚修复

- 需求
  - 修复桌面端 `/clone` 在分镜视频阶段并发执行“提交云端任务 / 后台续查 / 手动同步补查 / 页面刷新”时，仓储层使用整库旧快照回写，导致刚生成成功的视频 `taskId` 被旧项目状态覆盖回空值或旧 `gpt_frame_*` 的问题。
- 变更文件
  - `src/main/modules/clone/sqlite.ts`
  - `src/main/modules/clone/repo.ts`
- 实现说明
  - SQLite 写入从“整表删除后全量重写”改为 `INSERT OR REPLACE` + 差集删除，避免并发链路下旧快照整库覆盖新数据。
  - `cloneRepo.upsertProject(...)` 新增项目级持久化合并保护：
    - `shotVideoOutputs` 按 `shotId` 合并，旧空值或旧 `gpt_frame_* / mj_*` 不再覆盖已存在的视频 `taskId`。
    - `blueprint.shots` 按镜头 `id` 合并，`generatedTaskId/generatedProvider/generatedModel/generatedClipPath` 只允许更可信的新视频值覆盖。
  - 新增 `repo-upsert-project` 调试日志，输出当前真实 `dbDir`、项目 ID 和关键镜头的视频任务状态，便于确认任务号实际写入位置。
- 使用说明
  - 重新生成或同步补查后，新的视频 `taskId` 应稳定保存在同一真源中，不应再因为后台或页面并发刷新被覆盖回空值或旧图片任务号。
- Windows / Linux 兼容说明
  - 本轮仅修改 TypeScript 仓储层与 SQLite 写入逻辑，不依赖平台专属能力，Windows 开发环境与 Linux 部署环境通用。
- 验证
  - `npm run typecheck`

## 2026-05-27 分镜视频续查状态归一与轮询降频修复

- 需求
  - 修复桌面端 `/clone` 分镜视频阶段中，部分镜头已经持久化了有效视频 `taskId`，但本地状态仍残留为 `idle`，导致后台把该镜头排除出续查集合，界面长期显示“云端生成中 / 缺少任务号 / --”的问题。
  - 修复 VectorEngine 查询链路在“带模型前缀 taskId 已成功可查”的情况下，仍继续回退请求裸 `task_...`，产生 `task_not_exist` 噪音并干扰状态判断的问题。
  - 降低默认视频轮询频率，避免桌面端调试日志过于频繁。
- 变更文件
  - `src/main/modules/clone/unifiedVideo.ts`
  - `src/main/modules/clone/service.ts`
- 实现说明
  - `service.ts` 将 `idle` 纳入“可恢复视频状态”集合；当镜头已经有有效视频 `taskId` 时，即使状态残留为 `idle`，后台续查与单镜头继续查询也会重新进入远端轮询。
  - `canReuseExistingShotVideoTask(...)` 同步允许 `idle + taskId` 复用旧云端任务，避免错误地把这类镜头当成“无任务可跟进”。
  - `unifiedVideo.ts` 的查询候选构造新增保护：当原始任务号或归一化任务号已经带模型前缀时，不再额外回退查询裸 `task_...`，避免在同一轮里先查到 `running` 又再打出一次 `task_not_exist`。
  - 主进程视频轮询默认最小间隔从 `2s/1s` 收紧到 `5s` 下限，降低日志与接口请求频率；若配置更高间隔，仍以配置值为准。
- 使用说明
  - 对于已经成功提交且本地保留了 `veo_...:task_...` 的镜头，重新进入项目或点击“同步补查 / 继续查询”后，应继续自动续查，不会再因为状态残留 `idle` 而被跳过。
  - 调试日志中不应再看到“同一个带前缀任务先返回 running，紧接着裸 taskId 又返回 task_not_exist”的重复查询噪音。
  - 默认请求频率会比之前更低，减少接口压力和控制台刷屏。
- Windows / Linux 兼容说明
  - 本轮仅修改 TypeScript 主进程查询与状态归一逻辑，不依赖平台专属能力，Windows 开发环境与 Linux 部署环境通用。
- 验证
  - `npm run typecheck`

## 2026-05-27 分镜视频自动续查挂起条件补齐修复

- 需求
  - 修复桌面端 `/clone` 分镜视频阶段中，部分镜头已经保留有效视频 `taskId`，但本地状态残留为 `idle` 时，自动续查调度不再继续挂下一轮，导致只能手动“继续查询”，不会自动补查的问题。
- 变更文件
  - `src/main/modules/clone/service.ts`
- 实现说明
  - `hasPendingRemoteStoryboardVideoWork(...)` 新增 `idle + taskId` 识别。
  - 这样当镜头尚未落本地视频、但已经持久化了远端视频任务号时，即使状态暂时归一成 `idle`，后台仍会继续判定为“还有待补查工作”，并继续挂起下一轮自动 reconcile。
- 使用说明
  - 对于已经拿到 `veo_...:task_...` 但本地还没回写视频的镜头，重新进入项目后应继续自动补查，不需要手动点“继续查询”。
- Windows / Linux 兼容说明
  - 本轮仅修改 TypeScript 主进程调度条件，不依赖平台专属能力，Windows 开发环境与 Linux 部署环境通用。
- 验证
  - `npm run typecheck`

## 2026-05-27 项目打开时自动续查主动恢复修复

- 需求
  - 修复桌面端重启后重新进入 `/clone/[projectId]` 项目详情页时，历史待续查的分镜视频虽然仍有有效 `taskId`，但后台没有立刻重新拉起自动补查链路，只能停留在 `pollQueued > 0` 的假等待状态。
- 变更文件
  - `src/main/modules/clone/projectWorkspace.ts`
  - `src/main/modules/clone/service.ts`
- 实现说明
  - 项目详情 `getProject(...)` 返回前，除了原有 `scheduleRemoteStoryboardVideoReconcile(...)` 以外，新增一次主动 `kickAutoStoryboardVideoRecovery(...)`。
  - 这样在桌面端重启后的首次打开项目场景下，即使旧的后台 in-flight 链条已经丢失，也会立即按镜头恢复逻辑重新拉起待查询任务，而不是只把队列数字显示成 `pollQueued=1`。
- 使用说明
  - 重新打开存在待补查视频任务的项目详情页后，后台应立即恢复自动续查，无需手动点“继续查询”。
- Windows / Linux 兼容说明
  - 本轮仅修改 TypeScript 主进程项目加载与恢复调度逻辑，不依赖平台专属能力，Windows 开发环境与 Linux 部署环境通用。
- 验证
  - `npm run typecheck`

## 2026-05-27 分镜视频页进入后前端主动补查兜底

- 需求
  - 修复部分桌面端场景下，项目页已成功载入、镜头也存在待续查 `taskId`，但主进程自动恢复链路没有及时醒来，导致界面无任何反应、也没有自动继续查询的问题。
- 变更文件
  - `src/renderer/src/ui/views/CloneView.vue`
- 实现说明
  - 项目详情页首次 `loadProject(...)` 成功后，若页面判定存在“待远端补查”的分镜视频，前端会主动调用一次 `syncPendingShotVideosInWorkspace()`。
  - 同时新增页面级 watcher：当项目已载入、存在待补查镜头、且当前不在 `loading` 时，自动再触发一次补查，避免依赖用户手动点击。
- 使用说明
  - 重新进入分镜视频项目页后，如果仍有待查询的远端视频任务，页面应自动发起补查，不需要手动点“继续查询”。
- Windows / Linux 兼容说明
  - 本轮仅修改 Vue 前端页面的项目载入后续查兜底逻辑，不依赖平台专属能力，Windows 开发环境与 Linux 部署环境通用。
- 验证
  - `npm run typecheck`

## 2026-05-27 分镜视频合成前镜头级去高光预处理

- 需求
  - 修复桌面端 `/clone` 中，部分耳环、珠宝、金属反光类分镜视频在最终合成时仍带明显白核高光、爆闪和 bloom 特效的问题。
  - 要求在本地合成前先对问题镜头做保守去高光预处理，再进入最终 concat，不修改云端生成链路。
- 变更文件
  - `src/main/modules/clone/renderViralCloneBatch.ts`
- 实现说明
  - 在 `renderViralCloneBatch(...)` 的 `normalizeClip(...)` 标准化步骤中新增镜头级去高光判断。
  - 仅当镜头命中高光风险条件时，才追加保守型 FFmpeg 滤镜链：
    - 按 `productType` 命中耳环/珠宝等高反光类别
    - 或 `materialNeed / productFocus / visualDescription / generationPrompt` 命中高光、珠宝、金属、sparkle、glow、specular 等语义
  - 去高光实现保持单次 ffmpeg 处理完成，不新增第二次转码，也不回写原始 `generated_clip.mp4`。
  - `batch-report.json` 新增镜头级字段，记录该镜头是否启用了 `highlightSuppression`、所用 preset 和命中原因，便于排查。
- 使用说明
  - 最终成片与预览导出都会自动使用同一套“先去高光，再合成”的逻辑。
  - 仅命中问题镜头的分镜视频会被处理，普通镜头保持原合成口径不变。
- Windows / Linux 兼容说明
  - 本轮仅使用 FFmpeg 原生滤镜组合，不依赖 GPU、外部模型或平台专属插件，Windows 开发环境与 Linux 部署环境通用。
- 验证
  - `npm run typecheck`

## 2026-05-27 分镜视频正向 Prompt 去规则冲突与去诱导闪光收口

- 需求
  - 修复桌面端 `/clone` 分镜视频正向 prompt 中，规则堆叠过多、存在死命令和高光诱导词，导致珠宝/耳环镜头仍被模型自动渲染为广告级闪光特效的问题。
- 变更文件
  - `src/main/modules/clone/prompt.ts`
- 实现说明
  - `buildOptimizedVideoPrompt(...)` 从“多段规则说明书”收口为“两层结构”：
    - 固定全局约束：产品/模特/场景保持一致，禁止 sparkle / glow / highlight flicker / lens flare / dynamic lighting changes
    - 分镜执行层：只保留动作、镜头、场景、商品关注点和时长
  - 去掉或弱化模型难执行的死命令口径，例如 `STOP generation`、大段 `STRICT CONSISTENCY`、过重的 `REFERENCE DOMINANCE` 说明。
  - 去掉会诱导珠宝广告高光的 lighting 文案，统一改为 `soft diffused lighting + even illumination + controlled reflections + no harsh highlights`。
  - 耳环/珠宝镜头额外固定为非发光、弱反射、贴附材质表面的保守反光口径，不再鼓励“高级商业光感”。
- 使用说明
  - 后续重新生成的分镜视频，会优先遵守更短、更可执行的 anti-glow 规则，而不是被长 prompt 中的视觉词带偏到珠宝广告特效风格。
  - 普通镜头仍保留原有动作、镜头和商品展示语义，只是减少了不必要的规则冲突。
- Windows / Linux 兼容说明
  - 本轮仅调整 TypeScript prompt 拼装逻辑，不依赖平台专属能力，Windows 开发环境与 Linux 部署环境通用。
- 验证
  - `npm run typecheck`

## 2026-05-27 珠宝分镜视频工业级防变形模板收口

- 需求
  - 修复桌面端 `/clone` 耳环、珠宝等高风险镜头中，prompt 仍在显式或隐式重述产品结构、材质和细节，导致视频模型把参考商品“重新生成”而不是稳定延续的问题。
- 变更文件
  - `src/main/modules/clone/prompt.ts`
- 实现说明
  - 高风险珠宝镜头的视频正向 prompt 改为固定母模板思路：
    - 固定全局控制层：reference priority、consistency control、anti-reconstruction、lighting control、stability control、style
    - 分镜层只保留镜头、动作、机位、运动
  - 对高风险珠宝镜头，不再在视频 prompt 中继续展开商品结构、材质和细节描述，避免模型按文本重建饰品。
  - 高风险珠宝镜头默认进入“降智生成法”：
    - 极轻微运动
    - 稳定机位
    - 禁止旋转
    - 禁止角度变化
    - 禁止突发细节变化、纹理漂移、形状漂移
  - 该策略目标锁定为“稳定 > 好看 > 创意”，优先保证不变形、不漂移、不闪光、可批量。
- 使用说明
  - 后续耳环/珠宝类分镜视频，会更像“工业化商品延续”，而不是“艺术化珠宝广告重建”。
  - 普通镜头不强制进入这套极限收缩模板，仍保留原有动作和场景表达空间。
- Windows / Linux 兼容说明
  - 本轮仅调整 TypeScript prompt 拼装逻辑，不依赖平台专属能力，Windows 开发环境与 Linux 部署环境通用。
- 验证
  - `npm run typecheck`

## 2026-05-27 云端已成功但本地仍停留云端生成中修复

- 需求
  - 修复桌面端 `/clone` 分镜视频中，远端任务实际上已经产出可下载视频，但本地查询结果仍被归类为 `remote_running`，界面长期显示“云端生成中 / 可继续查询”的问题。
- 变更文件
  - `src/main/modules/clone/unifiedVideo.ts`
- 实现说明
  - 查询远端视频任务时，状态归一不再只依赖显式 `status=succeeded`。
  - 只要查询结果已经带有效视频输出地址，且返回体中没有明确失败语义，就直接视为可下载成功结果。
  - 这样可覆盖部分通道“状态字段仍显示 running，但输出 URL 已就绪”的返回口径，避免本地迟迟不进入下载回写。
- 使用说明
  - 对于 `taskId=veo_...:task_...` 这类远端已成功的分镜，继续查询后应直接进入下载回写或完成态，不应继续卡在“云端生成中”。
- Windows / Linux 兼容说明
  - 本轮仅调整 TypeScript 任务状态归一逻辑，不依赖平台专属能力，Windows 开发环境与 Linux 部署环境通用。
- 验证
  - `npm run typecheck`

## 2026-05-27 分镜视频完成态被旧运行态回滚修复

- 需求
  - 修复桌面端 `/clone` 分镜视频中，同一镜头已经被主进程回写为 `done`，但随后又被并发旧快照以同 `taskId` 覆盖回 `remote_running`，导致界面状态来回跳的问题。
- 变更文件
  - `src/main/modules/clone/repo.ts`
- 实现说明
  - `mergeShotVideoOutputsForPersistence(...)` 新增持久化合并保护。
  - 当同一镜头已经具备本地视频路径或远端视频地址，且当前状态属于 `done / downloading / remote_succeeded_pending_download` 时：
    - 后续同 `taskId` 的旧 `remote_running / remote_pending / submitting / creating / generating` 快照不允许再覆盖完成态
    - 优先保留已完成状态、`remoteStatus` 和 `completedAt`
  - 这样可阻断“刚写成 done，下一次旧快照又写回 remote_running”的状态抖动。
- 使用说明
  - 对于已经完成下载回写的分镜，界面状态应保持稳定完成，不会再在 `done` 和 `云端生成中` 之间来回跳。
- Windows / Linux 兼容说明
  - 本轮仅调整 TypeScript 仓储层合并逻辑，不依赖平台专属能力，Windows 开发环境与 Linux 部署环境通用。
- 验证
  - `npm run typecheck`

## 2026-05-27 珠宝分镜视频材质锁死与商品描述降反射修复

- 需求
  - 修复桌面端 `/clone` 耳环、珠宝等分镜视频中，模型持续按珠宝材质重建，导致高光跳变、闪光、材质不稳定的问题。
- 变更文件
  - `src/main/modules/clone/prompt.ts`
  - `src/main/modules/clone/service.ts`
- 实现说明
  - 高风险珠宝镜头的视频正向 prompt 新增固定 `Material override (CRITICAL)`：
    - 强制非珠宝哑光涂层外观
    - 禁止 metallic / crystal / gemstone 行为
    - 强制 fully diffuse / zero specular / no reflections / no refraction / no transparency
    - 视为 painted solid material，禁止动态光照交互和任意高光生成
  - 商品描述文本对高风险饰品改为“只锁结构，不指导材质渲染”：
    - 继续锁定连接结构、挂点、比例、轮廓、组件数和佩戴位置
    - 不再向视频模型强调 reflective / metallic / crystal / gemstone / glossy / transparent 这类材质行为
  - 目标优先级固定为：稳定、不闪、不漂移、高批量可复用，高于珠宝高级感。
- 使用说明
  - 后续耳环/珠宝类分镜视频会被主动作“低反射工业材质”处理，换取更稳定的电商视频质感。
  - 该策略会主动放弃一部分珠宝通透感和高级感，以换取不闪和不漂移。
- Windows / Linux 兼容说明
  - 本轮仅调整 TypeScript prompt 和商品描述拼装逻辑，不依赖平台专属能力，Windows 开发环境与 Linux 部署环境通用。
- 验证
  - `npm run typecheck`

## 2026-05-27 分镜视频提示词与商品 DNA 防材质误判统一收口

- 需求
  - 修复桌面端 `/clone` 分镜视频里，虽然已经加入 anti-glow 和材质锁死，但不同 prompt 层与商品 DNA 兜底文案仍残留 `metal / gemstone / reflectivity / realistic highlights` 一类旧口径，继续诱导模型按珠宝材质重建的问题。
- 变更文件
  - `src/main/modules/clone/prompt.ts`
  - `src/main/modules/clone/providers.ts`
  - `src/main/modules/clone/service.ts`
- 实现说明
  - `buildProductLockText(...)` 的耳环专用口径改为“只锁结构，不指导材质表现”，去掉 `metal color / zircon placement / gemstone and metal reflections realistic` 这类会继续抬高材质注意力的文案。
  - `buildGenerationPromptRestraintText(...)` 和 `sanitizeJewelryGenerationPrompt(...)` 统一改为“保结构、降材质、降反射”，不再允许 `subtle realistic highlights` 这种仍会给模型发挥空间的口径。
  - `buildOptimizedVideoPrompt(...)` 对高风险珠宝镜头明确改为 `Preserve ... structure only`，并把全局珠宝约束统一为 `non-emissive / materially flattened / matte / diffuse`。
  - `providers.ts` 旧的 `jewelryRealism` 文案改为 `Jewelry material suppression rule`，避免 provider 层再次把材质往 `diamond / crystal / metal reflections` 方向抬回去。
  - `service.ts` 商品分析兜底文案同步收口，耳环与通用商品 fallback 都不再默认强调 reflectivity、metallic tone、decorative material response，而是只保留结构、颜色分组和表面稳定信息。
- 使用说明
  - 重新生成耳环/珠宝分镜视频时，系统会更稳定地把产品当作“低反射、结构优先”的电商展示对象，而不是珠宝广告材质对象。
  - 该策略会继续牺牲一部分珠宝通透感和高级感，以换取不闪光、不漂移和更高批量稳定性。
- Windows / Linux 兼容说明
  - 本轮仅调整 TypeScript prompt 与商品分析拼装逻辑，不依赖平台专属能力，Windows 开发环境与 Linux 部署环境通用。
- 验证
  - `npm run typecheck`

## 2026-05-27 重新生成分镜视频被提前判定已完成修复

- 需求
  - 修复桌面端 `/clone` 中，点击“重新生成分镜视频”后，云端实际上仍在生成，但本地因为查询返回里提前带了 output URL，就被误判成 `已完成` 的问题。
- 变更文件
  - `src/main/modules/clone/unifiedVideo.ts`
- 实现说明
  - 收紧 `inferSucceededFromOutputUrls(...)` 的成功判定规则。
  - 现在不再因为“仅返回 output URL”就直接视为 `succeeded`。
  - 只有满足以下任一条件时，查询结果才会被提升为成功：
    - 远端显式返回 `completed / finished / done / success` 一类完成标记
    - 或返回体里存在明确完成时间、结束时间等完成信号
  - 如果只是生成中阶段提前带了输出地址，但没有明确完成信号，则继续保持 `running`，避免本地状态被过早覆盖成 `已完成`。
- 使用说明
  - 重新生成分镜视频后，界面应继续显示云端生成中，直到远端真正完成并返回明确完成信号，再进入下载回写和完成态。
- Windows / Linux 兼容说明
  - 本轮仅调整 TypeScript 查询状态归一逻辑，不依赖平台专属能力，Windows 开发环境与 Linux 部署环境通用。
- 验证
  - `npm run typecheck`

## 2026-05-27 强制重新生成后前端被旧分镜文件兜底显示已完成修复

- 需求
  - 修复桌面端 `/clone` 中，点击“重新生成分镜视频”后，主进程已经提交了新的 taskId，但前端仍因为旧的 `generatedClipPath / videoPath` 还在内存映射里，被界面直接显示为 `已完成` 的问题。
- 变更文件
  - `src/renderer/src/ui/views/CloneView.vue`
- 实现说明
  - 分镜视频列表组装 `shotVideoOutputs` 时，新增“活动远端任务”判定：
    - `submitting`
    - `remote_pending`
    - `remote_running`
    - `remote_succeeded_pending_download`
    - `downloading`
  - 只要当前镜头处于上述活动态，就不再用历史 `generatedClipPath` 自动回填成本地完成视频。
  - 状态文案 `describeShotSyncState(...)` 同步收紧：
    - 活动态下，即使本地仍残留旧 `videoPath`，也不再优先显示 `已完成`
    - 只有脱离活动态后，且本地确实持有当前完成结果时，才显示 `已完成`
- 使用说明
  - 强制重新生成分镜视频后，界面应优先反映新任务的 `创建中 / 云端生成中 / 下载中` 状态，不再被上一版旧视频结果覆盖显示。
- Windows / Linux 兼容说明
  - 本轮仅调整 Vue 前端状态映射逻辑，不依赖平台专属能力，Windows 开发环境与 Linux 部署环境通用。
- 验证
  - `npm run typecheck`

## 2026-05-27 强制重新生成后主进程复用旧本地视频误回写完成修复

- 需求
  - 修复桌面端 `/clone` 中，点击“强制重新生成分镜视频”后，云端新 task 已提交，但主进程又扫描到本地历史 `generated_clip.mp4 / scene_videos/*.mp4`，误以为当前任务已完成并立刻回写 `done` 的问题。
- 变更文件
  - `src/main/modules/clone/service.ts`
- 实现说明
  - `checkLocalTaskStatus(...)` 原先即使检测到“当前镜头已有新 taskId 且处于活动远端状态，并且 previousTaskIds 已记录旧任务”，后续仍会继续扫描本地旧视频文件。
  - 现在只要命中以下条件，就直接禁止本地旧文件复用：
    - 当前存在有效视频 taskId
    - 当前状态属于活动远端任务
    - `previousTaskIds` 已存在，说明这是新旧任务切换中的镜头
  - 这样强制重新生成后，后台不会再把旧本地视频误判成新任务结果，也不会再把新 task 立即覆盖成 `done`。
- 使用说明
  - 强制重新生成分镜视频后，镜头应先保持 `submitting / remote_running / downloading` 等活动状态，直到新 task 真正完成并回写新结果。
- Windows / Linux 兼容说明
  - 本轮仅调整 TypeScript 主进程本地复用判断逻辑，不依赖平台专属能力，Windows 开发环境与 Linux 部署环境通用。
- 验证
  - `npm run typecheck`

## 2026-05-27 强制重新生成接口返回前被队列刷新覆盖状态修复

- 需求
  - 修复桌面端 `/clone` 中，点击“强制重新生成分镜视频”后，虽然主进程已经提交了新的 taskId，但 `regenerateShotVideo(...)` 在返回给前端前又立即执行一次 `refreshGenerationQueueRuntime(...)`，导致新任务活动态被覆盖回 `done` 的问题。
- 变更文件
  - `src/main/modules/clone/service.ts`
- 实现说明
  - `regenerateShotVideo(...)` 现在会先检查 `ensureShotVideoState(..., 'force_regenerate')` 返回的镜头状态。
  - 如果已经满足以下条件：
    - 存在新的有效 taskId
    - 当前状态属于 `submitting / remote_pending / remote_running / remote_succeeded_pending_download / downloading`
    - 且当前没有本地视频文件
  - 则直接把这份“新任务活动态”返回给前端，不再立刻执行 `refreshGenerationQueueRuntime(...)`。
  - 这样可避免“刚提交成功的新 task 状态，还没来得及展示，就被后续队列刷新污染成旧完成态”。
- 使用说明
  - 强制重新生成分镜视频后，前端应优先看到新任务的活动状态和新 taskId，而不是旧的 `已完成`。
- Windows / Linux 兼容说明
  - 本轮仅调整 TypeScript 主进程接口返回逻辑，不依赖平台专属能力，Windows 开发环境与 Linux 部署环境通用。
- 验证
  - `npm run typecheck`

## 2026-05-27 强制重新生成后旧分镜结果硬隔离修复

- 需求
  - 修复桌面端 `/clone` 中，强制重新生成分镜视频后，虽然新 taskId 已经提交成功，但旧的 `generatedClipPath / videoPath / localPath / done` 痕迹仍会继续参与状态计算，导致镜头被错误显示为 `已完成` 的问题。
- 变更文件
  - `src/main/modules/clone/service.ts`
- 实现说明
  - 在 `resolveShotVideoOutput(...)` 中新增“活动替换任务”判定：
    - 存在有效视频 taskId
    - 当前状态属于 `submitting / remote_pending / remote_running / remote_succeeded_pending_download / downloading`
    - 且镜头已经记录 `previousTaskIds` 或提交锁信息，说明这是新旧任务切换中的镜头
  - 一旦命中该条件：
    - 旧 `videoPath / localPath / generatedClipPath` 一律忽略
    - 不允许再从历史分镜文件自动回填 `done`
    - 状态统一按当前新任务活动态返回
  - 这样旧结果不会再参与任何后续状态解析、界面显示或本地回写判断。
- 使用说明
  - 强制重新生成分镜视频后，镜头状态应完全以新 task 为准，直到新 task 真正完成并产出新结果，旧视频不会再干扰显示。
- Windows / Linux 兼容说明
  - 本轮仅调整 TypeScript 主进程状态解析逻辑，不依赖平台专属能力，Windows 开发环境与 Linux 部署环境通用。
- 验证
  - `npm run typecheck`

## 2026-05-27 强制重新生成入口前置硬清理旧分镜结果

- 需求
  - 修复桌面端 `/clone` 中，用户点击“强制重新生成分镜视频”时，系统应立即清除旧分镜结果，避免旧视频路径、旧完成态、旧回写结果继续干扰新任务状态的问题。
- 变更文件
  - `src/main/modules/clone/service.ts`
- 实现说明
  - `ensureShotVideoState(..., 'force_regenerate')` 不再先执行 `normalizeProjectShotVideoStates(project)`，避免在重生成入口一开始就被历史 `done` 状态重新归一化。
  - 强制重新生成时，除了原有的删除本地 `generated_clip.mp4 / scene_videos/*.mp4` 外，额外前置硬清理以下字段：
    - `videoPath / localPath / videoUrl`
    - `remoteRaw / remoteStatus / completedAt / durationSec`
    - `generatedClipPath / generatedClipDurationSec`
    - `generatedProvider / generatedModel / generatedSource`
    - `outputVideoPath / uploadedAssetPath`
    - `qualityStatus / qualityReasons / canEnterRender`
  - 仅保留 `previousTaskIds` 用于追踪旧任务，不再允许任何旧结果继续参与新任务状态计算。
- 使用说明
  - 点击“强制重新生成分镜视频”后，镜头会从一个真正干净的状态重新提交新 task，不再被旧完成结果干扰。
- Windows / Linux 兼容说明
  - 本轮仅调整 TypeScript 主进程入口清理逻辑，不依赖平台专属能力，Windows 开发环境与 Linux 部署环境通用。
- 验证
  - `npm run typecheck`

## 2026-05-26 自动分镜视频重复提交止血修复

- 需求
  - 修复桌面端 `/clone` 自动运行到分镜视频阶段时，同一项目被前端定时器反复调用总入口，导致少量分镜重复提交出大量云端视频任务的问题。
- 变更文件
  - `src/renderer/src/ui/views/CloneView.vue`
- 实现说明
  - 页面 `setInterval` 原先在 `storyboard_videos` 阶段会每 6 秒再次调用 `autoRunToStoryboardVideosInWorkspace(...)`，这会重新进入整套自动视频流程，而不是单纯刷新状态。
  - 现移除该定时器重入调用，只保留项目状态刷新与运行态轮询。
  - 分镜视频的继续查询、下载回写、后台恢复仍由主进程已有队列和恢复逻辑推进，不再由前端定时器重复触发总入口。
- 使用说明
  - 自动分镜视频阶段不应再因为页面轮询而对同一批镜头重复提交新的云端视频任务。
- Windows / Linux 兼容说明
  - 本轮仅修改 Vue 页面定时器逻辑，不依赖平台专属能力。
- 验证
  - `npm run typecheck`

## 2026-05-26 自动分镜视频主进程重入互斥修复

- 需求
  - 修复桌面端 `/clone` 自动分镜视频总流程被重复调用时，主进程再次整批扫描镜头并重复提交云端视频任务的问题。
- 变更文件
  - `src/main/modules/clone/service.ts`
- 实现说明
  - 新增 `autoRunStoryboardVideosInFlight` 项目级 in-flight 映射。
  - `autoRunCloneToStoryboardVideos(...)` 入口现在按 `cloneProjectId` 做互斥：同一项目若已有自动分镜视频流程在执行，后续重复调用直接复用首次 Promise，不再重新进入整套自动视频流程。
  - 配合前端定时器重入止血后，可同时阻断“页面重复触发”和“主进程总入口重入”两类重复提交来源。
- 使用说明
  - 同一项目在自动分镜视频阶段，即使前端、后台恢复或其他入口短时间内重复触发，总流程也只会保留一条执行链，不应再反复提交同批镜头的视频任务。
- Windows / Linux 兼容说明
  - 本轮仅修改 TypeScript 主进程服务层互斥逻辑，不依赖平台专属能力。
- 验证
  - `npm run typecheck`

## 2026-05-28 分镜视频提示词稳定性收紧

- 需求
  - 收紧 `/clone` 分镜视频生成提示词，降低耳饰等高风险商品在视频阶段的文本重建、反光闪烁和动作扰动问题。
- 变更文件
  - `src/main/modules/clone/prompt.ts`
  - `docs/requirements-2026-05-28-shot-video-prompt-stability-tightening.md`
- 实现说明
  - 分镜视频正向 prompt 的商品定义进一步降文本化，耳饰类镜头不再在执行层直接复述商品外观描述，优先使用 `ear wearing the earring` 这类结构性表达。
  - 耳饰类灯光控制升级为 `flat diffuse lighting / no specular highlights / no reflective response / constant brightness across frames`，减少亮点闪烁。
  - 耳饰类动作控制统一收紧为极轻微动作，避免手部靠近和局部亮度变化造成不稳定。
  - 移除分镜执行层中过重的 `ONLY / MUST / FAIL` 类假锁死文案，只保留必要的结构、空间、构图和人物锁。
- 使用说明
  - 在 `/clone` 分镜视频阶段生成耳饰类镜头时，预览提示词应不再直接描述耳环细节，同时应包含更强的反高光与恒定亮度规则。
- Windows / Linux 兼容说明
  - 本轮仅调整 TypeScript prompt 组装逻辑，不依赖平台专属能力，Windows 开发环境与 Linux 部署环境通用。
- 验证
  - `npm run test:clone-shot-video-jewelry-prompt-v2-lock`

## 2026-05-28 分镜图首尾帧提示词稳定性收紧

- 需求
  - 将分镜视频已收紧的“去商品描述化 + 强反高光 + 微动作”规则同步到分镜图首尾帧链路，避免图片和视频两边提示词策略不一致。
- 变更文件
  - `src/main/modules/clone/gptImage.ts`
  - `test/storyboard-model-identity-lock.smoke.ts`
  - `docs/requirements-2026-05-28-storyboard-frame-prompt-stability-tightening.md`
- 实现说明
  - 耳饰类首尾帧 prompt 改为优先使用 `reference image` 主导和 `ear wearing the earring` 这类结构化表达，不再在执行层继续注入 `TEXT PRODUCT DESCRIPTION LOCK`。
  - 首尾帧灯光控制同步升级为 `flat diffuse lighting / no specular highlights / no reflective response / constant brightness across frames`。
  - 首尾帧动作控制同步收紧为极轻微动作或极轻触碰，减少局部亮度变化和动作扰动。
- 使用说明
  - 在 `/clone` 分镜图首尾帧生成耳饰类镜头时，提示词应与分镜视频保持同一稳定策略，不再由商品文本描述重新定义商品。
- Windows / Linux 兼容说明
  - 本轮仅调整 TypeScript prompt 组装逻辑，不依赖平台专属能力，Windows 开发环境与 Linux 部署环境通用。
- 验证
  - `npm run test:storyboard-model-lock`

## 2026-05-30 分镜视频已下载完成却被旧下载态覆盖修复

- 需求
  - 修复桌面端 `/clone` 分镜视频中，远端任务已经成功、视频也已下载落盘，但项目持久化时又被同一 `taskId` 的旧 `downloading / remote_running` 快照覆盖，导致界面长期停留在“结果下载中 / 待下载回写 / 待继续查询”的问题。
- 变更文件
  - `src/main/modules/clone/repo.ts`
  - `test/clone-shot-video-persistence-keeps-done-over-stale-downloading.smoke.ts`
- 实现说明
  - 仓储层 `mergeShotVideoOutputsForPersistence(...)` 新增更严格的完成态保护。
  - 当同一镜头已经满足以下条件时：
    - 已有本地视频路径或已记录远端成功结果
    - 当前持久化状态为 `done`
    - 后续写入仍是同一 `taskId`
  - 则后续旧的 `downloading / remote_succeeded_pending_download / remote_running` 快照不再允许把该镜头覆盖回活动态。
  - 同时保留“真实下载尚未完成”的原有行为，不会把纯 `downloading` 状态错误提前写成 `done`。
- 使用说明
  - 对于已经成功下载回写的分镜视频，界面应稳定显示 `已完成`，不再反复回退成“结果下载中”。
  - 用户遇到与 `veo_3_1-fast-4K:task_...` 同类的旧任务抖动时，后续刷新项目状态后应自动恢复正确完成态。
- Windows / Linux 兼容说明
  - 本轮仅调整 TypeScript 仓储层状态合并逻辑与 smoke test，不依赖平台专属能力，Windows 开发环境与 Linux 部署环境通用。
- 验证
  - `npx tsx test/clone-shot-video-persistence-keeps-done-over-stale-downloading.smoke.ts`
  - `npx tsx test/clone-shot-video-reconcile-does-not-shortcut-downloading.smoke.ts`
  - `npx tsx test/clone-shot-video-succeeded-url-downloads-from-retryable.smoke.ts`
  - `npm run typecheck`

## 2026-05-31 AI666 Kling 视频模型接入

- 需求
  - 为 `apifox_hub / ai666` 增加 `videoProvider=kling` 的视频接口接入，支持按 ai666 的 `/v1/videos` 协议创建和查询任务。
- 变更文件
  - `src/main/modules/clone/unifiedVideo.ts`
  - `docs/requirements-2026-05-31-ai666-kling-video-integration.md`
- 实现说明
  - 仅在 `video profile=ai666` 且 `videoProvider=kling` 时走新分支，不影响 `vectorengine` 和其它视频供应商。
  - 创建改走 `POST {baseUrl}/v1/videos`，查询改走 `GET {baseUrl}/v1/videos/{taskId}`。
  - 请求体按 ai666 提供的 Kling 示例适配为 `model + prompt + seconds + images + size + metadata.output_config`。
  - 鉴权头兼容原始 token 和 `Bearer token` 两种存储方式。
- 使用说明
  - 在设置中将视频平台选为 `ai666`，供应商选为 `kling`，模型填写例如 `Kling-3.0-Omni` 后即可走新链路。
- Windows / Linux 兼容说明
  - 本轮仅调整 TypeScript 主进程接口适配逻辑，Windows 开发与 Linux 部署通用。
- 验证
  - `npm run typecheck`

## 2026-05-31 AI666 Seedance 2.0 视频模型接入

- 需求
  - 为 `apifox_hub / ai666` 增加 `videoProvider=seedance2` 的视频接口接入，支持按 ai666 的 `/v1/video/generations` 协议创建和查询任务。
- 变更文件
  - `src/main/modules/clone/unifiedVideo.ts`
  - `docs/requirements-2026-05-31-ai666-seedance2-video-integration.md`
- 实现说明
  - 仅在 `video profile=ai666` 且 `videoProvider=seedance2` 时走新分支，不影响现有通用 `seedance2`、`kling`、`vectorengine` 与其它供应商。
  - 创建改走 `POST {baseUrl}/v1/video/generations`，查询改走 `GET {baseUrl}/v1/video/generations/{taskId}`。
  - 请求体按 ai666 提供的 Seedance 示例适配为 `model + content[] + metadata`。
  - `image` 自动映射为 `first_frame`，`lastImage` 自动映射为 `last_frame`。
  - 鉴权头兼容 ai666 常见 `Authorization: sk-xxx` 形式，不再强制补 `Bearer `。
- 使用说明
  - 在设置中将视频平台选为 `ai666`，供应商选为 `seedance2`，模型填写例如 `doubao-seedance-2-0-260128` 后即可走新链路。
- Windows / Linux 兼容说明
  - 本轮仅调整 TypeScript 主进程接口适配逻辑，Windows 开发与 Linux 部署通用。
- 验证
  - `npm run typecheck`

## 2026-05-31 clone 运行日志保留条数扩容

- 需求
  - 当前 `/clone` 运行日志保留条数过少，日志滚动和裁剪太快，不方便复制和回看错误信息。
- 变更文件
  - `src/renderer/src/ui/views/CloneView.vue`
  - `src/renderer/src/ui/views/CloneTaskListView.vue`
  - `apps/web/src/composables/useWebCloneDetailWorkspace.ts`
  - `docs/requirements-2026-05-31-clone-runtime-log-retention-expand.md`
- 实现说明
  - 桌面端 clone 详情页日志保留从 `80` 提高到 `200`。
  - 桌面端 clone 列表页日志保留从 `60` 提高到 `200`。
  - Web 端 clone 详情页日志保留从 `80` 提高到 `200`。
  - 仅调整前端日志裁剪阈值，不改主流程和数据结构。
- 使用说明
  - `/clone` 页面现在会保留更多最近日志，复制报错和接口上下文时不容易被快速清掉。
- Windows / Linux 兼容说明
  - 本轮仅调整前端日志数组裁剪逻辑，Windows 开发与 Linux 部署通用。
- 验证
  - `npm run typecheck`

## 2026-05-31 ai666 Seedance 视频时长参数修复

- 需求
  - 修复 `/clone` 分镜视频强制重新生成时，`ai666 + seedance2` 链路向不支持的 Seedance 模型发送固定 `duration=10`，导致平台返回 `InvalidParameter` 的问题。
- 变更文件
  - `src/main/modules/clone/unifiedVideo.ts`
  - `src/main/modules/clone/service.ts`
  - `docs/requirements-2026-05-31-ai666-seedance-duration-fix.md`
- 实现说明
  - ai666 `seedance2` 专用提交分支改为按镜头时长走安全钳制，不再固定写死 `metadata.duration=10`。
  - 钳制规则为最小 `4`、最大 `15`、默认 `5`。
  - 请求预览同步改成 ai666 Seedance 的 `metadata` 结构，避免预览和真实提交不一致。
- 使用说明
  - 强制重新生成分镜视频时，Seedance duration 会按当前镜头时长自动落到更安全的取值。
- Windows / Linux 兼容说明
  - 本轮仅调整 TypeScript 请求体组装逻辑，Windows 开发与 Linux 部署通用。
- 验证
  - `npm run typecheck`

## 2026-06-02 TikTok 上架助手商品删除确认弹窗

- 需求
  - TikTok 商品上架助手删除商品时不能直接删除，需要先给出更美观的确认弹窗，降低误删风险，并保持当前页面视觉风格统一。
- 变更文件
  - `src/renderer/src/ui/views/TiktokListingHelperView.vue`
  - `docs/requirements.md`
- 实现说明
  - 商品列表表格视图和卡片视图的删除按钮统一改为先打开页面内确认弹窗，不再直接调用删除接口。
  - 弹窗复用当前页已有 `export-config-dialog` 的局部弹窗结构与遮罩样式，避免引入新的全局依赖或共享状态系统。
  - 弹窗内展示删除提示、SKU/标题摘要和危险操作按钮，并增加删除中态，避免重复提交。
- 使用说明
  - 在 TikTok 商品上架助手中点击删除按钮后，会先弹出“删除商品”确认框；点击“确认删除”才会真正删除商品，点击“取消”则关闭弹窗。
- Windows / Linux 兼容说明
  - 本轮仅调整 Vue 前端交互和样式，不依赖平台专属能力，Windows 开发环境与 Linux 部署环境通用。
- 验证
  - `npm run typecheck`

## 2026-06-02 复刻分镜图饰品模特露脸收紧

- 需求
  - 优化 `/clone` 复刻分镜图的饰品类提示词，减少模特全脸正面露出，避免“露脸穿帮”抢走商品主体并放大身份不稳定风险。
- 变更文件
  - `src/main/modules/clone/prompt-consistency/compiler.ts`
  - `src/main/modules/clone/gptImage.ts`
  - `test/storyboard-model-identity-lock.smoke.ts`
  - `docs/requirements.md`
- 实现说明
  - 在分镜图 prompt consistency 编译器中新增更明确的 `FRAMING PRIORITY - PRODUCT FIRST` 控制块，不再只写“少露脸”，而是明确产品必须是画面主角、脸不能成为视觉中心。
  - 对耳饰/饰品佩戴镜头新增 `FACE VISIBILITY CONTROL / COMPOSITION LOCK / JEWELRY PRESENTATION RULE`，明确限制完整正脸、眼神对镜头、脸占据中心，并要求耳部/颈部/手部成为商品展示支撑区域。
  - 在实际送模的 `buildGptFramePrompt(...)` 中同步加入同类构图裁切规则，确保预览规则和真实出图提示词一致，不只停留在预览层。
  - 非饰品但属于模特展示镜头时，也统一补充“product-first、避免全脸居中”的弱化规则，保持商品优先。
- 使用说明
  - 重新生成耳饰等饰品分镜图时，系统会更强地约束模特脸部不要完整露出，优先聚焦耳部、下颌线、脖颈和商品佩戴区域。
- Windows / Linux 兼容说明
  - 本轮仅调整 TypeScript prompt 组装逻辑与 smoke test，不依赖平台专属能力，Windows 开发环境与 Linux 部署环境通用。
- 验证
  - `npm run test:storyboard-model-lock`
  - `npm run typecheck`

## 2026-06-02 分镜图提示词构造全面收紧

- 需求
  - 统一 `/clone` 分镜图片链路的 prompt 构造，解决 opening / ending keyframe 里产品绝对锁仍被模特展示感稀释的问题，尤其是耳饰等佩戴类镜头里模特容易抢主体。
- 变更文件
  - `src/main/modules/clone/gptImage.ts`
  - `src/main/modules/clone/prompt-consistency/compiler.ts`
  - `src/main/modules/clone/service.ts`
  - `test/storyboard-model-identity-lock.smoke.ts`
  - `docs/requirements.md`
- 实现说明
  - 分镜图 prompt 继续以 `buildGptFramePrompt(...)` 为唯一主入口，但不再沿用“说明书式线性堆叠”，而是改为 `Execution Stack` 结构：`ABSOLUTE RULES -> INPUT ROLE MAP -> SHOT CONTROL -> FACE CONTROL -> RESTRICTIONS -> OUTPUT`。
  - `SHOT CONTROL` 现在明确加入 `occupies 40% to 60% of the frame` 与 `Hierarchy: product > hands > body > face`，让模型先执行画面主次，再补细节规则。
  - `gptImage.ts` 中把人物身份描述压缩为最小锚点，不再输出会把镜头推向模特图的人物强化词，如 `camera presence`、`Chinese-speaking social-commerce expression style`、`calm confident expression` 等。
  - 对耳饰、项链、戒指、手链等佩戴类镜头新增更硬的 face crop / composition 规则，明确禁止 `full face`、`face-centered framing`、`face-dominant composition`，并要求产品比面部或身体特征更大、更清晰、更居中。
  - 对耳饰类补强 `connector relation / hanging direction / attachment point` 等 product focus 锁；动作锁统一收紧为极弱动作或极弱触碰，避免头部和表情成为主导。
  - prompt consistency 编译层改写“visible human context”相关文案，改为“仅保留最小必要的人体佩戴/支撑关系”，不再把 `model_scene` 解释成明显的人像展示镜头。
  - `service.ts` 里的 legacy sanitize 逻辑同步过滤会抬高人物权重的遗留表达，保证预览和真实提交不把旧的人物强化词带回分镜图链路。
- 使用说明
  - 重新生成分镜图时，系统会更强地把产品作为唯一视觉主体，人物只保留最小必要的佩戴或手部支撑关系。
  - 耳饰和其他佩戴类镜头默认优先输出局部裁切、偏侧角度、耳颈手区域支撑的构图，不再鼓励完整正脸或模特居中展示。
- Windows / Linux 兼容说明
  - 本轮仅调整 TypeScript prompt 组装逻辑、兼容清洗逻辑和 smoke test，Windows 开发环境与 Linux 部署环境通用。
- 验证
  - `npm run test:storyboard-model-lock`
  - `npm run typecheck`
