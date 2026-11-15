# TiktokCut 云端服务（services/cloud）

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
