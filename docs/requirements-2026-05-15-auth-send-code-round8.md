# 2026-05-15 真实登录短信闭环第八轮

## 背景

Web 商业化链路已经完成登录页和 `POST /auth/login` 的最小真实化改造，但 `POST /auth/send-code` 仍缺少两项上线前必需约束：

- 非开发环境必须经过明确 provider，而不是只把验证码写入本地存储
- 发码接口必须有最小频率限制，避免同手机号连续请求

本轮继续遵循最小改动原则，只处理认证服务层和共享 API 返回结构，不扩散到无关页面与大范围架构。

## 本轮改动

### 1. 增加最小短信 provider 分发层

- 文件：`src/main/modules/web-platform/sms.ts`
- 新增 `sendSmsCode(...)`
- 当前支持：
  - `development`：返回 `mock`
  - `VG_SMS_PROVIDER=console`：输出控制台日志，返回 `console`
- 生产/预发布若未配置 provider，会直接报错，避免继续走无感知伪发送

### 2. 发码接口增加最小频率限制

- 文件：`src/main/modules/web-platform/service.ts`
- `sendLoginCode(...)` 已增加同手机号 60 秒 cooldown
- 判断依据继续复用现有 `loginCodes.updatedAt`
- 不新增表结构，不改 repo 对外接口

### 3. 发码返回结构补充 provider

- 文件：
  - `src/main/modules/web-platform/service.ts`
  - `src/shared/web-api/client.ts`
- `POST /auth/send-code` 返回新增 `provider`
- 用途：
  - 区分当前是否走开发 mock
  - 为后续 Web / 桌面端展示“真实发码 / 调试发码”提供基础字段

## 使用说明

### Windows 本地开发

```bash
VG_APP_ENV=development
VG_DEV_LOGIN_CODE=123456
```

- 登录页先请求 `/auth/send-code`
- 返回 provider 应为 `mock`
- 返回中仍可带 `devCode`

### Linux 预发布 / 生产

```bash
VG_APP_ENV=staging
VG_ALLOW_MOCK_GENERATION=false
VG_SMS_PROVIDER=console
```

或：

```bash
VG_APP_ENV=production
VG_ALLOW_MOCK_GENERATION=false
VG_SMS_PROVIDER=console
```

- 登录页先请求 `/auth/send-code`
- 返回 provider 应为 `console`
- 60 秒内同手机号重复发码应直接失败

## 验收标准

- `development` 环境下，`POST /auth/send-code` 可正常返回 `mock`
- `staging / production` 未配置 provider 时会明确报错
- `VG_SMS_PROVIDER=console` 时，非开发环境可成功返回 `console`
- 同手机号在 60 秒内重复发码会被拒绝
- `staging` 返回中不得再暴露 `devCode`
- `staging` 返回文案不得再显示“开发环境”
- `npm run typecheck:api` 通过
- `npm run typecheck` 通过
- `npm run build` 通过

## 自动化验证

```bash
npm run smoke:auth-send-code
```

当前 smoke 会验证：

- development 首次发码成功，provider 为 `mock`
- development 同手机号二次发码会命中 60 秒 cooldown
- staging + `VG_SMS_PROVIDER=console` 首次发码成功，provider 为 `console`
- staging 不返回 `devCode`
- staging 返回文案不再误用开发环境提示

## 后续建议

- 下一轮优先把 `service.ts` 中历史乱码文案统一清理为 UTF-8 中文，降低后续认证维护成本
- 若进入真实商用，再把 `console` provider 替换为正式短信供应商 SDK

## 乱码原因说明

- 当前仓库内部分旧文件存在历史编码污染，不是单纯终端显示问题。
- 典型成因是：
  - 原始中文内容曾以 UTF-8 保存
  - 后续被按 GBK / ANSI 等错误编码读取
  - 再次保存后形成 mojibake（乱码固化到文件内容）
- 因此会看到类似 `楠岃瘉鐮?` 这类文本。
- 本轮处理原则：
  - 先清理认证主链路中用户真实可见的报错和文案
  - 不在同一轮里做全仓编码大重写，避免误伤大量无关逻辑

## 当前收口状态

- `web-platform/service.ts` 中旧的乱码实现块仍然物理存在于文件中。
- 但认证主链路运行时已切到新的干净实现：
  - `sendLoginCode`
  - `login`
  - `authByToken`
- 当前优先级是保证：
  - 用户真实收到的接口返回文案正确
  - smoke/typecheck 稳定通过
- 当前已在文件内显式添加注释，标记旧块为历史 mojibake 残留、运行时已绕过。
- 当前认证运行时实现已进一步抽离到独立 UTF-8 模块：
  - `src/main/modules/web-platform/authRuntime.ts`
- `service.ts` 当前只负责安装认证运行时覆写，后续若继续物理清理旧块，风险已明显降低。
- 若下一轮继续清理，应做“物理删除旧乱码块”的纯整理轮，不再混入新功能。
