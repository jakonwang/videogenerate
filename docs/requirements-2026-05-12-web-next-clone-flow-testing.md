# 2026-05-12 Web-Next `/clone` 复制视频流程自动化跑通测试

## 背景

- 本轮目标是为 `apps/web-next` 建立一套可重复执行的浏览器端自动化联调方案。
- 测试范围聚焦主链路：
  - `/login`
  - `/clone`
  - `/clone/[projectId]`
- 验收标准对齐桌面端完整复制视频流程，默认要求跑到最终成片合成，不停留在分镜视频阶段。

## 本轮范围

- 新增浏览器端 E2E 脚本：
  - `test/web-next-clone-flow.e2e.cjs`
- 新增测试执行命令：
  - `npm run test:web-next-clone-flow`
- 最小补齐 `web-next` 页面测试锚点与必要交互入口：
  - 登录页 `data-testid`
  - `/clone` 列表页新建任务按钮 `data-testid`
  - `/clone/[projectId]` 五阶段根节点与关键动作按钮 `data-testid`
  - 分析阶段补出商品图上传和模特选择入口，供真实联调与自动化驱动

## 自动化链路

### 启动命令

- Windows 本地联调先启动：
  - `npm run dev:api`
  - `npm run dev:web-next`
- 然后执行：
  - `npm run test:web-next-clone-flow`

### 默认登录信息

- 手机号：`13800138000`
- 验证码：`123456`
- 显示名默认使用脚本内置值，可通过环境变量覆盖

### 默认环境变量

- `WEB_NEXT_BASE_URL`
  - 默认：`http://127.0.0.1:18280`
- `WEB_API_BASE_URL`
  - 默认：`http://127.0.0.1:18080`
- `WEB_NEXT_TEST_PHONE`
- `WEB_NEXT_TEST_CODE`
- `WEB_NEXT_TEST_DISPLAY_NAME`
- `WEB_NEXT_TEST_TIMEOUT_MS`

## 素材策略

- 优先复用仓库内 `.videogenerate` 下已有真实视频和商品图素材。
- 参考视频优先查找：
  - `.videogenerate/viral-clone/b79f1d94-1ada-43e6-8136-3a42c7b3a411/outputs/viral_clone_001.mp4`
  - `.videogenerate/viral-clone/b79f1d94-1ada-43e6-8136-3a42c7b3a411/outputs/job_001_try_1/joined.mp4`
- 若上述路径不存在，则回退到 `.videogenerate` 目录内递归查找首个可用视频文件。
- 商品图从 `.videogenerate` 目录递归挑选最多 3 张现有图片。

## 执行步骤

1. 校验 API 服务和 Web-Next 服务可访问。
2. 打开登录页并使用默认账号登录。
3. 进入 `/clone`，点击“新建任务”。
4. 进入 `/clone/[projectId]` 详情页。
5. 上传参考视频。
6. 上传商品图。
7. 选择一个可用模特。
8. 执行参考视频分析。
9. 生成脚本候选，并选择一个候选。
10. 生成分镜图片。
11. 生成分镜视频。
12. 合成最终成片。

## 验收标准

- 登录成功并进入 `/clone`
- 能创建新任务并跳转详情页
- 模特列表接口可返回数据
- 分析阶段能产生真实分析结果
- 脚本阶段能生成候选并完成选中
- 分镜图片阶段能返回至少一张真实图片输出
- 分镜视频阶段能返回至少一个真实视频输出
- 最终合成阶段能返回成片输出路径

## 失败处理与证据输出

- 脚本会在 `test/artifacts/web-next-clone-flow/` 输出：
  - 登录截图
  - 新建任务截图
  - 各阶段完成截图
  - 失败截图
  - JSON 报告
- 失败时不允许降级为“mock 已通过”。
- 若真实模型联调失败，报告中必须保留：
  - 失败阶段
  - 失败消息
  - 对应截图

## 排查顺序

1. 检查 `npm run dev:api` 是否已启动且监听 `18080`
2. 检查 `npm run dev:web-next` 是否已启动且监听 `18280`
3. 检查登录账号是否可用
4. 检查 `listCloneModelIdentities` 是否返回可选模特
5. 检查真实供应商配置、额度和网络状态
6. 检查项目详情接口中：
  - `analysis` / `analysisResult`
  - `scriptVariants`
  - `storyboardFrames`
  - `shotVideoOutputs`
  - `finalCompose.outputPath`

## 兼容性说明

- 本地开发测试环境为 Windows。
- 本轮没有引入 Windows 专属业务协议。
- 发布环境仍为 Linux，本轮只保证路径与接口消费方式保持跨平台兼容，不在本轮验证 Linux 部署。
