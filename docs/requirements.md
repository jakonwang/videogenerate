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
