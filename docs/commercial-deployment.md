# Vidloom 商业化部署与运营手册

本文说明 Vidloom 上线后的真实使用流程、服务器部署方式，以及客户端发版和自动更新。
云端服务的接口与环境变量细节见 `services/cloud/README.md`。

---

## 1. 整体结构

```
用户电脑（Windows 客户端 Vidloom）
   │  登录、激活设备、拉取授权令牌与软件设置、扫码购买
   ▼
api.你的域名  ── 云端服务 services/cloud（Node + SQLite，端口 18300）
   ▲            账号 / 设备 / 授权签名 / 订单 / 支付回调 / 兑换码 / 配置 / 日志
   │
www.你的域名  ── Next.js（apps/web-next，端口 18280）
                 官网、价格、下载、用户中心（/account）、管理后台（/admin）
update.你的域名 ─ 静态目录：客户端安装包 + 自动更新文件（latest.yml）
```

- 所有收费、授权判断都在云端；客户端只保存云端签名过的授权令牌，离线最多可用 7 天（不受限账号 30 天）。
- AI 平台 Key 由管理后台「软件设置」统一下发，用户不需要自己配置。

---

## 2. 真实使用场景

### 2.1 你（运营方）的日常

| 场景 | 在哪里做 |
|---|---|
| 看收入、新用户、在用设备 | 管理后台 → 数据看板 |
| 调整价格 / 新增套餐 | 管理后台 → 套餐与价格（只影响新订单） |
| 线下成交、送试用 | 管理后台 → 用户管理 → 新建账号并直接开通；或生成兑换码发给客户 |
| 渠道 / 代理销售 | 兑换码 → 批量生成，备注写渠道名，方便对账 |
| 客户说换电脑登录不上 | 用户详情 → 绑定设备 → 解绑旧电脑（用户也可以在用户中心自助解绑） |
| 客户要退款 | 先在微信 / 支付宝商户后台完成退款，再到 订单 → 标记退款（可选择扣回天数） |
| 账号违规 / 共享 | 用户详情 → 停用账号，所有设备立即失去授权（离线令牌最迟 7 天内失效） |
| 更换或轮换 AI Key | 软件设置 → 修改后保存，客户端启动时或 6 小时内自动同步 |
| 发公告、强制升级、临时关闭某个功能 | 公告与开关 |
| 查谁改了什么 | 操作日志 |

你自己和团队成员使用：把账号设为「超级管理员」或勾选「不受限账号」即可，不需要购买，也不限设备。
内部人员也可以直接安装「内部版」（见第 5 节），完全不做授权检查。

### 2.2 客户的使用流程

1. 在官网下载页下载安装包并安装。
2. 打开客户端 → 注册 / 登录（手机号或邮箱）。
3. 没有会员时，登录页直接显示套餐：选择套餐 → 微信 / 支付宝扫码 → 到账后自动进入软件。
   也可以在「兑换码」里输入兑换码开通。
4. 正常使用。会员快到期时在客户端「账号与会员」或官网「用户中心」续费，时长自动叠加。
5. 换电脑：在用户中心「我的设备」解绑旧电脑，然后在新电脑登录。

---

## 3. 上线前准备清单

- [ ] 一台 Linux 云服务器（2 核 4G 起步），开放 80 / 443 端口
- [ ] 域名与 HTTPS 证书：`www`、`api`、`update` 三个子域名
- [ ] 企业主体的微信支付商户号（Native 支付）和 / 或支付宝开放平台应用（当面付）
- [ ] 软件名称确认：名称里含有「TikTok」字样，商用前建议评估商标风险，必要时更换名称
- [ ] Windows 代码签名证书（OV / EV）：没有签名时，用户安装会看到「未知发布者」警告，部分杀毒软件可能拦截
- [ ] 用户协议、隐私政策、退款说明（官网页脚链接，支付平台审核也会要求）

---

## 4. 部署云端与网站（服务器上）

以下命令以 Ubuntu 为例，项目放在 `/srv/tiktokcut/app`。

### 4.1 安装环境

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs nginx git
```

```bash
sudo npm install -g pm2
```

### 4.2 拉取代码并安装依赖

```bash
sudo mkdir -p /srv/tiktokcut && cd /srv/tiktokcut && git clone https://github.com/jakonwang/videogenerate.git app
```

```bash
cd /srv/tiktokcut/app && npm ci --ignore-scripts
```

（服务器不需要 Electron，`--ignore-scripts` 可以跳过桌面端原生模块编译。）

### 4.3 签名密钥（只做一次）

授权令牌的签名私钥只能存在服务器上。在服务器执行：

```bash
cd /srv/tiktokcut/app && CLOUD_DATA_DIR=/srv/tiktokcut/data npm run cloud:keygen
```

这会生成私钥 `/srv/tiktokcut/data/keys/entitlement-private.pem`，并更新仓库里的
`src/shared/cloud/entitlementPublicKey.ts`（公钥）。**把这个公钥文件提交回仓库**，之后打包的客户端才能验证这台服务器签发的令牌。
私钥一旦丢失或更换，所有旧客户端都需要重新安装新版本，所以请把 `/srv/tiktokcut/data` 做好备份。

### 4.4 配置环境变量

```bash
cp services/cloud/deploy/cloud.env.example /srv/tiktokcut/cloud.env && chmod 600 /srv/tiktokcut/cloud.env
```

按注释填写域名和支付参数，微信 / 支付宝的证书文件放到 `/srv/tiktokcut/data/keys/`。
支付回调地址会自动设为：

- 微信：`https://api.你的域名/api/v1/pay/notify/wechat`
- 支付宝：`https://api.你的域名/api/v1/pay/notify/alipay`

### 4.5 创建你的超级管理员账号

```bash
CLOUD_DATA_DIR=/srv/tiktokcut/data CLOUD_ADMIN_ACCOUNT=你的邮箱 CLOUD_ADMIN_PASSWORD='强密码' npm run cloud:create-admin
```

### 4.6 构建网站（官网 + 用户中心 + 管理后台）

网站里的云端地址是构建时写入的：

```bash
cd /srv/tiktokcut/app/apps/web-next && NEXT_PUBLIC_CLOUD_API_BASE_URL=https://api.你的域名 npx next build
```

### 4.7 启动并设置开机自启

```bash
cd /srv/tiktokcut/app && pm2 start services/cloud/deploy/ecosystem.config.cjs && pm2 save && pm2 startup
```

### 4.8 Nginx 与 HTTPS

参考 `services/cloud/deploy/nginx.conf.example`，把域名和证书路径换成你的，放到 `/etc/nginx/sites-enabled/` 后：

```bash
sudo nginx -t && sudo systemctl reload nginx
```

### 4.9 上线后的第一次配置（管理后台）

1. 打开 `https://www.你的域名/admin`，用 4.5 创建的账号登录。
2. 套餐与价格：确认价格、天数、设备数。
3. 软件设置：填 AI 平台 Key、默认模型、七牛存储 → 打开「统一下发」→ 保存。
4. 公告与开关：填客服联系方式、下载地址、最新版本号。
5. 自己用一个普通账号走一遍：注册 → 扫码支付 1 分钱测试套餐（可以临时建一个 0.01 元的测试套餐，测完下架）→ 客户端解锁。

---

## 5. 打包客户端

在你的 Windows 开发机上执行。三个地址都在**打包时**写入安装包，用户无法修改：

| 变量 | 作用 |
|---|---|
| `VG_CLOUD_API_BASE` | 云端地址，例如 `https://api.你的域名` |
| `VG_UPDATE_BASE_URL` | 自动更新地址，例如 `https://update.你的域名/win` |
| `VG_LICENSE_MODE` | 一般不用设：`dist` 默认商业版，`dist:internal` 默认内部版 |

PowerShell 中：

```powershell
$env:VG_CLOUD_API_BASE = "https://api.你的域名"; $env:VG_UPDATE_BASE_URL = "https://update.你的域名/win"; npm run dist
```

内部不限制版（给团队用，安装包名带 `Internal`）：

```powershell
$env:VG_CLOUD_API_BASE = "https://api.你的域名"; npm run dist:internal
```

打包结果在 `release/` 目录：

- `Vidloom-<版本>-Setup.exe`：安装包
- `Vidloom-<版本>-Setup.exe.blockmap`：增量更新用
- `latest.yml`：更新描述文件（客户端靠它发现新版本）

打包前务必确认 `src/shared/cloud/entitlementPublicKey.ts` 是 4.3 生成的正式公钥。

---

## 6. 发布新版本与自动更新

客户端内置自动更新（electron-updater）：启动约 8 秒后检查 `VG_UPDATE_BASE_URL/latest.yml`，有新版本就在后台下载，下载完弹窗提示「重启更新」。

每次发版：

1. 修改 `package.json` 的 `version`（例如 `5.0.129` → `5.0.130`）。版本号必须比线上的大，否则客户端不会更新。
2. 按第 5 节打包（`VG_UPDATE_BASE_URL` 要和之前保持一致）。
3. 把 `release/` 里的 `Setup.exe`、`.blockmap`、`latest.yml` 三个文件上传到更新目录（例如服务器上的 `/srv/tiktokcut/releases/win/`）。
   **最后上传 `latest.yml`**，避免客户端发现新版本时安装包还没传完。
4. 管理后台 → 公告与开关：更新「最新版本」和「安装包下载地址」（官网下载页会显示），需要的话写更新说明或公告。
5. 有严重问题、必须让旧版本升级时，设置「最低可用版本」，低于该版本的客户端会显示更新提醒。

回滚：把上一个版本的三个文件重新放回更新目录（`latest.yml` 指向旧版本）。注意已经升级的用户不会自动降级，需要重新安装旧版安装包。

云端或网站更新（服务器上）：

```bash
cd /srv/tiktokcut/app && git pull && npm ci --ignore-scripts && (cd apps/web-next && NEXT_PUBLIC_CLOUD_API_BASE_URL=https://api.你的域名 npx next build) && pm2 restart all
```

数据库结构变化会在云端服务启动时自动迁移。

---

## 7. 日常运维

- **备份**：每天备份 `/srv/tiktokcut/data`（`cloud.sqlite` 加 `keys/`）到对象存储，至少保留 7 天。示例 crontab：
  `0 3 * * * tar czf /srv/backup/tiktokcut-$(date +\%F).tgz -C /srv/tiktokcut data`
- **日志**：`pm2 logs tiktokcut-cloud`；支付回调验签失败、主动查单失败都会打印出来。
- **监控**：用任意拨测服务监控 `https://api.你的域名/api/v1/health`。
- **安全**：只开放 80 / 443；`cloud.env` 和 `data/keys` 权限 600；管理员密码足够长；定期查看操作日志。
- **AI 成本**：在各 AI 平台控制台给下发给客户端的 Key 设置额度上限，定期轮换。

---

## 8. 本地开发与测试

```bash
npm run dev:cloud
```

```bash
npm run dev:web-next
```

```bash
npm run dev:enforced
```

- 本地默认开启模拟支付，可以完整走通下单到开通；生产环境开启会被拒绝启动。
- 自动化测试：`npm run test:cloud`（云端），`npx electron-vite build && npm run test:cloud-license:e2e`（桌面端完整流程）。
