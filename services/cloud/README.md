# Klipmill 云端服务（services/cloud）

账号、会员授权、扫码支付、兑换码、全局配置与管理后台 API。桌面端和 Web 管理后台（`apps/web-next/app/admin`）都连这里。

- 运行时：Node 22.13+（使用内置 `node:sqlite`，无需原生模块编译）
- 数据：单个 SQLite 文件（WAL），默认 `services/cloud/data/cloud.sqlite`
- 所有接口前缀：`/api/v1`

## 本地开发

```bash
npm run cloud:keygen
```

```bash
CLOUD_ADMIN_ACCOUNT=you@example.com CLOUD_ADMIN_PASSWORD='至少8位的强密码' npm run cloud:create-admin
```

```bash
npm run dev:cloud
```

```bash
npm run dev:web-next
```

管理后台：<http://127.0.0.1:18280/admin>。`services/cloud/dev.env` 默认打开了模拟支付（`CLOUD_PAY_MOCK=1`），本地可以完整走通下单 → 支付 → 开通。

桌面端本地联调商业版（强制登录）：

```bash
npm run dev:enforced
```

## 两个桌面端版本

| 命令 | 授权模式 | 用途 |
|---|---|---|
| `npm run dist` | `enforced` | 商业版：必须登录且会员有效才能用业务功能 |
| `npm run dist:internal` | `off` | 内部版：不做任何限制，安装包名带 `Internal` |

模式在**编译时**写死（`electron.vite.config.ts` 的 `__VG_LICENSE_MODE__`），用户无法通过环境变量或配置文件切换。
商业版打包前必须设置云端地址：`VG_CLOUD_API_BASE=https://api.你的域名`。

「我自己的账号不受限」：在后台把账号设为**超级管理员**，或勾选**不受限账号**。商业版用这个账号登录即可使用全部功能，不看到期时间、不限设备数，并可在后台随时停用。

## 授权是怎么工作的

1. 桌面端登录后，用机器码（sha256 后的值）调用 `POST /devices/activate`。
2. 云端校验会员是否有效、设备数是否超限，然后用 **Ed25519 私钥**签发授权令牌（含账号、机器码、功能列表、到期时间）。
3. 桌面端用内置公钥（`src/shared/cloud/entitlementPublicKey.ts`）离线验签。普通用户令牌最长 7 天，不受限账号最长 30 天；在线时每 6 小时自动续签。
4. 主进程拦截所有业务 IPC 和本地 API（127.0.0.1）。未授权时只放行登录、窗口控制、更新等白名单通道，所以绕过界面直接调用也没用。
5. 把系统时间往回调来延长离线授权会被识别（`clock_rollback`），需要联网刷新。

## 点数计费与卡密

云端是唯一的账本（`services/cloud/src/billing.ts`，共用定义在 `src/shared/cloud/billing.ts`）。

- **计什么**：每次视频生成、每次图片生成。对话（文案、拆解）不计费。只有用后台配置的平台密钥时才计费；用户在电脑端填自己的 Key 不计费。
- **怎么算**：套餐里给视频 / 图片各选一种方式：不限次数、每月免费 N 次后扣点、每次扣点、不可用。扣多少点在后台「计费与模型」里设：先按模型价目匹配（同平台优先，再「任意平台」），没有就用默认价。模型可以停用或限定套餐。
- **流程**：生成前 `POST /usage/hold` 冻结（点数不足、套餐不含、模型停用时直接拒绝，错误信息给用户看），成功后确认，失败退回。每个账号 24 小时内自动退回的次数有上限（默认 50，后台可改），防止刷退款。客户端没回报的冻结 12 小时后自动确认。
- **接入点**：电脑端商业版的生成请求走云端 AI 代理（见下节），扣点在云端完成；服务器复刻引擎用 `src/main/modules/clone/usageMeter.ts` 的挂钩；网页 / 手机的云端任务在 `generate.ts` 创建时冻结、结束时结算。超管和不受限账号记录用量但不扣点。
- **点数来源**：购买套餐（套餐「赠送点数」）、兑换卡密、后台调整（仅超管，必须填原因，进操作日志）。订单退款会收回该订单送的点数，最多扣到 0。
- **卡密**：套餐卡（时长 + 套餐送的点数，可覆盖）和点数卡；可设兑换截止日、销售渠道，按批次导出 CSV、整批作废。用户输入时大小写、空格、分隔符都可以随意。
- **升级兼容**：老套餐默认「不限次数」，升级后已付费用户的使用方式不变；在后台改了套餐规则才开始扣点。

**上线前必须做**：发布走云端代理的新版桌面端，并在后台「公告与开关」把 `client.minVersion` 设成这个版本。云端已不再下发平台密钥，旧版桌面端拿不到 Key 将无法生成。

## 电脑端 AI 代理（平台密钥只在服务器）

`services/cloud/src/aiProxy.ts`。后台「软件设置」里的平台 Key、TikHub Key、七牛 AK/SK **不会下发到电脑**：

- `/api/v1/client/managed-settings` 只返回去掉密钥的设置 + 一个**代理令牌**（`vgp1.…`，绑定账号、会话和本机，30 天有效，每次同步换新）。电脑端把各平台地址改成 `{云端}/api/v1/ai-proxy/<平台>`、Key 改成代理令牌，原有的平台适配代码不用改。
- 代理每次都会检查：令牌签名、会话没退出、账号正常、会员有效、本机没解绑。任何一项不满足立即拒绝。
- **扣点**：按「方法 + 路径 + 模型」判断是不是一次生成（视频提交、图片提交、对话里用图片 / 视频模型），转发前冻结点数。平台报错立即退点；返回任务号的，之后查询进度时看到失败退点、成功确认（只认响应里原样带着这个任务号的结果），没人查的 12 小时后自动确认。查询进度、上传素材、普通对话、TikHub 不扣点。
- **未识别的提交接口一律拒绝**，日志里会打印 `[ai-proxy] 未识别的接口`；平台新增接口时在 `aiProxy.ts` 的路径表里补上。查后台账户余额之类的接口也被拒。
- **七牛**：电脑端上传参考图前调 `POST /api/v1/client/qiniu-upload-grant` 拿「只能写这一个文件、1 小时有效」的上传凭证，文件仍从电脑直传七牛。
- Nginx 需要给 `/api/v1/ai-proxy/` 放宽请求体（64 MB）、超时（15 分钟）并关闭缓冲，见 `deploy/nginx.conf.example`。
- 环境变量：`CLOUD_AI_PROXY_MAX_BODY_MB`（默认 64）、`CLOUD_TIKHUB_BASE_URL`（默认官方地址）。

## 支付安全

- 微信支付 APIv3 回调：校验平台公钥签名、`Wechatpay-Serial`、时间戳（±5 分钟），AES-256-GCM 解密后核对商户号、AppID、订单号、金额、币种。
- 支付宝回调：RSA2 验签，核对 AppID、订单号、金额、交易状态。
- 到账处理是幂等的，在事务里完成；重复回调不会重复加时长。
- 回调丢失时，客户端轮询订单会触发主动查单（应答同样验签）兜底。
- 生产环境开启 `CLOUD_PAY_MOCK` 会直接拒绝启动。

## 生产部署

完整的服务器部署、客户端打包与自动更新流程见 `docs/commercial-deployment.md`；Nginx / PM2 / 环境变量模板在 `services/cloud/deploy/`。

1. 在安全的机器上执行 `npm run cloud:keygen`：把私钥 `data/keys/entitlement-private.pem` 放到服务器，把生成的公钥文件提交进仓库，再打包桌面端。**换密钥后旧版客户端会全部失效。**
2. 用 Nginx 反向代理并开启 HTTPS，设置 `CLOUD_TRUST_PROXY=1`。
3. 用 pm2 或 systemd 运行 `npm run start:cloud`，并设置 `NODE_ENV=production`。
4. 定期备份 `CLOUD_DATA_DIR`（SQLite 文件和私钥）。

### 环境变量

| 变量 | 说明 |
|---|---|
| `NODE_ENV=production` | 生产模式 |
| `CLOUD_HOST` / `CLOUD_PORT` | 监听地址，默认 `127.0.0.1:18300` |
| `CLOUD_DATA_DIR` | 数据目录（数据库、密钥） |
| `CLOUD_PUBLIC_BASE_URL` | 对外地址，用来拼支付回调 URL，如 `https://api.example.com`。不填则不开放微信 / 支付宝渠道 |
| `CLOUD_CORS_ORIGINS` | 管理后台、Web 端的来源，逗号分隔 |
| `CLOUD_TRUST_PROXY=1` | 在反向代理后取真实 IP |
| `CLOUD_ALLOW_REGISTRATION` | `1` 开放自助注册（默认），`0` 只能后台建号 |
| `CLOUD_ENTITLEMENT_TTL_DAYS` / `CLOUD_UNLIMITED_TTL_DAYS` | 离线授权时长，默认 7 / 30 天 |
| `CLOUD_DEVICE_UNBIND_PER_30D` | 用户 30 天内可自助解绑设备的次数，默认 3 |
| `CLOUD_AI_PROXY_MAX_BODY_MB` | 电脑端 AI 代理单个请求体上限，默认 64 |
| `CLOUD_TIKHUB_BASE_URL` | TikHub 上游地址，默认 `https://api.tikhub.io` |
| `WECHATPAY_MCHID` `WECHATPAY_APPID` `WECHATPAY_SERIAL_NO` `WECHATPAY_APIV3_KEY` | 微信支付商户信息 |
| `WECHATPAY_PRIVATE_KEY_PATH` | 商户 API 私钥（`apiclient_key.pem`） |
| `WECHATPAY_PLATFORM_PUBLIC_KEY_PATH` `WECHATPAY_PLATFORM_SERIAL` | 微信支付公钥及其 ID（`PUB_KEY_ID_...`） |
| `ALIPAY_APP_ID` `ALIPAY_APP_PRIVATE_KEY_PATH` `ALIPAY_PUBLIC_KEY_PATH` | 支付宝应用信息（公钥模式） |
| `ALIPAY_GATEWAY` | 沙箱用 `https://openapi-sandbox.dl.alipaydev.com/gateway.do` |

回调地址（填到商户后台或由下单接口自动携带）：

- 微信：`{CLOUD_PUBLIC_BASE_URL}/api/v1/pay/notify/wechat`
- 支付宝：`{CLOUD_PUBLIC_BASE_URL}/api/v1/pay/notify/alipay`

## 测试

```bash
npm run test:cloud
```

```bash
npx electron-vite build
```

```bash
npm run test:cloud-license:e2e
```

第一条是服务端冒烟测试，覆盖伪造签名、金额篡改、设备上限、后台权限等。后两条先按商业模式构建，再用 Electron 跑真实的桌面端授权流程。
