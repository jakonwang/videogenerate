# 2026-05-15 Web 商业化闭环第一轮

## 背景

- 当前 `apps/web-next` 已经具备商业化主前端形态，但默认主链路仍依赖手工前置数据。
- 当前登录、支付和 mock 生成策略仍带有明显演示环境特征。
- 本轮只做最小闭环，不做大规模重构。

## 本轮改动

### 1. Web-Next `/clone/[projectId]` 主链路前置收口

- 脚本候选生成阶段不再强依赖已绑定模特。
- 当前策略调整为：
  - 生成脚本候选只要求已有商品图
  - 模特绑定要求延后到分镜图片阶段
- 当分镜图片阶段缺少模特时：
  - 页面直接显示明确提示
  - 不再表现为“按钮点不动但无解释”

### 2. 统一开发 / 生产 mock 生成开关

- 新增统一 mock 策略模块：
  - `src/main/modules/clone/mockPolicy.ts`
- 当前规则：
  - `VG_APP_ENV=production` 时，禁止 mock 生成
  - 或 `VG_ALLOW_MOCK_GENERATION=false` 时，禁止 mock 生成
  - 仅开发环境允许 `allowMockWhenNoKey` 生效
- 覆盖范围：
  - 模特图生成
  - 分镜图生成
  - 分镜视频 mock 兜底

### 3. 登录从固定验证码切换为“先发码再登录”

- 新增接口：
  - `POST /auth/send-code`
- 当前登录规则：
  - 必须先发送验证码
  - 再通过 `POST /auth/login` 登录
- 开发环境说明：
  - 默认仍可通过 `VG_DEV_LOGIN_CODE` 控制开发验证码
  - 仅开发环境返回 `devCode`
- 生产环境说明：
  - 不再接受固定写死验证码直接登录

### 4. 支付通道名称从 mock 口径切换为正式口径

- 前后端订单支付通道统一改为：
  - `wechat_native`
  - `alipay_native`
- `POST /billing/orders` 返回结构改为：
  - `payment.provider`
  - `payment.payUrl`
  - `payment.qrText`
  - `payment.reference`
- `POST /payments/notify/:orderId` 新增 `paymentReference` 校验
- 若订单已支付，再次回调时保持幂等

### 5. Web 平台登录验证码持久化

- `web-platform.json` 新增 `loginCodes`
- 说明：
  - 当前仍沿用现有 JSON 存储
  - 先保证登录流程不再依赖固定验证码
  - 后续数据库化再整体替换

## 使用说明

### Windows 本地开发

- 启动 API：
  - `npm run dev:api`
- 启动 Web-Next：
  - `npm run dev:web-next`
- 默认开发环境可直接点“发送验证码”，页面会显示开发验证码提示。

### 生产 / 预发布建议

- 至少设置以下环境变量：

```bash
VG_APP_ENV=production
VG_ALLOW_MOCK_GENERATION=false
VG_UPDATE_BASE_URL=https://your-update-host.example.com
NEXT_PUBLIC_WEB_API_BASE_URL=https://your-api-host.example.com
```

- 生产环境下若缺少真实模型 Key：
  - 分镜图 / 分镜视频不会再自动走 mock
  - 页面和接口会直接返回明确失败原因

## 验收重点

- 空模特库状态下，用户仍可推进到脚本候选生成阶段
- 分镜图片阶段缺模特时，页面有明确提示
- 开发环境可以先发码再登录
- 生产环境不会再接受固定演示验证码
- 生产环境不会再走 `mock-image` / `mock-i2v` / `mock-image2video`
- 订单回调重复触发时不会重复入账
