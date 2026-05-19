# 2026-05-12 Web-Next 模特库真实数据与创建补齐

## 背景

- 目标页面：`apps/web-next/app/models/page.tsx`
- 用户反馈：
  - `web-next` 无法创建模特
  - 模特列表不是实时真实数据
- 本轮目标：
  - 补齐 `web-next` 模特库的真实查询与真实创建闭环
  - 保持前后端分离，不把桌面端业务直接搬到页面层
  - Windows 本地测试可用，Linux 部署逻辑兼容

## 本轮范围

- 仅处理 `apps/web-next` 模特页与其依赖的 Web API
- 不重构其他页面
- 不重写桌面端 `cloneService` 生成逻辑，只通过 Web API 透传已有能力

## 实现说明

### 1. 模特列表改为真实数据

- `apps/web-next/app/models/page.tsx`
  - 通过 `apiClient.listCloneModelIdentities()` 读取真实模特库
  - 不再使用本地假模特作为主展示数据
  - 无数据时展示真实空态，而不是伪造卡片
- 图片预览继续通过 `toPreviewSrc()` 转换本地路径到 `/media/file`

### 2. Web API 新增模特创建接口

- 新增 Web API 路由：
  - `POST /clone/model-identities`
- 后端调用链：
  - `web-next` 页面
  - `src/shared/web-api/client.ts`
  - `src/main/modules/web-platform/webApiRouter.ts`
  - `src/main/modules/web-platform/service.ts`
  - `src/main/modules/clone/service.ts#generateModelIdentityPack`

### 3. 创建模特页面闭环

- `apps/web-next/app/models/page.tsx`
  - 新增创建模特弹层
  - 支持选择真实复刻项目
  - 支持上传商品参考图
  - 支持填写商品卖点
  - 支持填写 OpenAI 图像能力配置
  - 创建时先上传商品图，再调用真实模特生成接口
  - 成功后刷新模特列表并选中新模特

## 使用说明

### Windows 本地开发

1. 启动 Electron 主进程能力和 Web API：
   - `npm run dev`
2. 启动 `web-next`：
   - `npm run dev:web-next`
3. 打开：
   - `http://127.0.0.1:18280/models`
4. 登录测试账号：
   - 手机号：`13800138000`
   - 验证码：`123456`

### 创建模特步骤

1. 进入 `/models`
2. 点击“创建模特”
3. 选择一个已有复刻项目
4. 上传至少一张商品图
5. 填写商品卖点
6. 配置可用的 `OpenAI API Key`
7. 点击“开始创建”

## 验证命令

- `npm run typecheck:web-next`
- `npm run typecheck`
- `npm run build:web-next`

## 验收结果

- 模特库列表来自真实接口，不再默认展示假数据
- `web-next` 可以直接发起真实模特创建
- 创建成功后列表会刷新，且新模特可继续用于 `/clone/[projectId]`
- 实现保持前后端分离，页面层只消费 Web API
