import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

function env(name: string, fallback = ''): string {
  const value = process.env[name]
  return value === undefined ? fallback : value.trim()
}

function envInt(name: string, fallback: number): number {
  const raw = env(name)
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

const DAY = 24 * 60 * 60 * 1000

export type CloudConfig = ReturnType<typeof loadCloudConfig>

export function loadCloudConfig() {
  const dataDir = resolve(env('CLOUD_DATA_DIR', join(process.cwd(), 'services', 'cloud', 'data')))
  const keysDir = join(dataDir, 'keys')
  const isProduction = env('NODE_ENV') === 'production'
  const mockPay = env('CLOUD_PAY_MOCK') === '1'

  return {
    isProduction,
    host: env('CLOUD_HOST', '127.0.0.1'),
    port: envInt('CLOUD_PORT', 18300),
    dataDir,
    dbPath: join(dataDir, 'cloud.sqlite'),
    keysDir,
    /** 对外访问根地址，用于拼支付回调地址，如 https://api.example.com */
    publicBaseUrl: env('CLOUD_PUBLIC_BASE_URL').replace(/\/+$/, ''),
    /** 允许跨域访问的前端来源（管理后台、用户 Web 端），逗号分隔 */
    corsOrigins: env('CLOUD_CORS_ORIGINS', 'http://127.0.0.1:18280,http://localhost:18280')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
      // 手机端（Capacitor WebView）的固定来源
      .concat(['https://localhost', 'capacitor://localhost']),
    /** 反向代理后取真实 IP */
    trustProxy: env('CLOUD_TRUST_PROXY') === '1',
    /** 云端 AI 网关：每个账号每分钟 / 每天最多调用次数 */
    aiPerMinute: envInt('CLOUD_AI_PER_MINUTE', 20),
    aiPerDay: envInt('CLOUD_AI_PER_DAY', 500),
    /** 水印、字幕用的中文字体目录（部署时运行 npm run setup:fonts 准备） */
    fontsDir: resolve(env('CLOUD_FONTS_DIR', join(process.cwd(), 'resources', 'fonts'))),
    /** 云端同时执行的图片 / 视频生成任务数 */
    aiJobConcurrency: envInt('CLOUD_AI_JOB_CONCURRENCY', 4),
    /** 服务器 ffmpeg 处理（合成、水印、字幕、切片、混剪）同时跑几个；按 CPU 核数调 */
    ffmpegConcurrency: envInt('CLOUD_FFMPEG_CONCURRENCY', 1),
    /** 每个账号 24 小时内最多几个服务器视频处理任务，0 = 不限 */
    ffmpegPerDay: envInt('CLOUD_FFMPEG_PER_DAY', 60),
    /** 服务器复刻引擎：最多同时几个用户的引擎进程、空闲几分钟后退出 */
    cloneEngineMaxWorkers: envInt('CLOUD_CLONE_ENGINE_MAX_WORKERS', 4),
    cloneEngineIdleMinutes: envInt('CLOUD_CLONE_ENGINE_IDLE_MINUTES', 20),
    /** 服务器复刻：每个账号每天最多向 AI 平台发起几次生成请求（一条成片大约 30～50 次），0 = 不限 */
    cloneEnginePerDay: envInt('CLOUD_CLONE_ENGINE_PER_DAY', 300),
    /** 仅开发 / 测试：没配置平台密钥时用模拟结果走通复刻流程（生产环境无效） */
    cloneEngineAllowMock: env('CLOUD_CLONE_ENGINE_ALLOW_MOCK') === '1',
    /** 没有任何记录引用的文件保留几天后清理，0 = 不清理 */
    orphanFileDays: envInt('CLOUD_ORPHAN_FILE_DAYS', 7),
    /** 网页版静态文件目录（apps/mobile 的 npm run build:web 产物），在 /app/ 提供 */
    webAppDir: resolve(env('CLOUD_WEB_APP_DIR', join(process.cwd(), 'apps', 'mobile', 'dist-web'))),
    /** 每个账号的多端同步文件空间（图片、视频） */
    syncQuotaBytes: envInt('CLOUD_SYNC_QUOTA_MB', 2048) * 1024 * 1024,
    allowRegistration: env('CLOUD_ALLOW_REGISTRATION', '1') === '1',

    entitlementPrivateKeyPath: env('CLOUD_ENTITLEMENT_PRIVATE_KEY', join(keysDir, 'entitlement-private.pem')),
    /** 普通用户令牌离线可用时长 */
    entitlementTtlMs: envInt('CLOUD_ENTITLEMENT_TTL_DAYS', 7) * DAY,
    /** 不受限账号令牌离线可用时长 */
    unlimitedEntitlementTtlMs: envInt('CLOUD_UNLIMITED_TTL_DAYS', 30) * DAY,

    sessionTtlMs: envInt('CLOUD_SESSION_TTL_DAYS', 30) * DAY,
    adminSessionTtlMs: envInt('CLOUD_ADMIN_SESSION_TTL_HOURS', 12) * 60 * 60 * 1000,

    loginMaxFailures: 5,
    loginLockMs: 15 * 60 * 1000,
    /** 用户自助解绑设备：30 天内最多次数 */
    /** 每个会员另含的手机名额（不占电脑名额），0 表示不限 */
    maxMobileDevices: envInt('CLOUD_MAX_MOBILE_DEVICES', 1),
    deviceUnbindPer30d: envInt('CLOUD_DEVICE_UNBIND_PER_30D', 3),

    orderExpireMs: 30 * 60 * 1000,
    /** 仅本地联调：模拟支付。生产环境即使设置也会拒绝启动 */
    mockPay,

    wechat: {
      mchid: env('WECHATPAY_MCHID'),
      appid: env('WECHATPAY_APPID'),
      merchantSerialNo: env('WECHATPAY_SERIAL_NO'),
      merchantPrivateKeyPath: env('WECHATPAY_PRIVATE_KEY_PATH', join(keysDir, 'wechatpay_apiclient_key.pem')),
      apiV3Key: env('WECHATPAY_APIV3_KEY'),
      platformPublicKeyPath: env('WECHATPAY_PLATFORM_PUBLIC_KEY_PATH', join(keysDir, 'wechatpay_platform_public.pem')),
      platformSerial: env('WECHATPAY_PLATFORM_SERIAL'),
      apiBase: env('WECHATPAY_API_BASE', 'https://api.mch.weixin.qq.com'),
    },
    alipay: {
      appId: env('ALIPAY_APP_ID'),
      appPrivateKeyPath: env('ALIPAY_APP_PRIVATE_KEY_PATH', join(keysDir, 'alipay_app_private.pem')),
      alipayPublicKeyPath: env('ALIPAY_PUBLIC_KEY_PATH', join(keysDir, 'alipay_public.pem')),
      /** 沙箱：https://openapi-sandbox.dl.alipaydev.com/gateway.do */
      gateway: env('ALIPAY_GATEWAY', 'https://openapi.alipay.com/gateway.do'),
    },
  }
}

export function readKeyFile(path: string): string | null {
  if (!path || !existsSync(path)) return null
  return readFileSync(path, 'utf8')
}
