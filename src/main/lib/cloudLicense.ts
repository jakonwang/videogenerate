/**
 * 桌面端云端授权：账号登录、设备激活、签名授权令牌的离线校验与定时刷新，以及购买 / 兑换。
 *
 * 构建模式（编译期常量，用户无法在运行时修改）：
 *   enforced：商业版，必须登录且会员有效才能使用业务功能
 *   off     ：内部版，不做授权限制（登录仍可用，只是不强制）
 */
import { app, BrowserWindow, ipcMain } from 'electron'
import { existsSync } from 'node:fs'
import { readFile, rename, rm, writeFile } from 'node:fs/promises'
import { hostname } from 'node:os'
import { join } from 'node:path'
import { machineIdSync } from 'node-machine-id'
import { CloudClientError, createCloudClient } from '../../shared/cloud/client'
import { checkEntitlementToken } from '../../shared/cloud/entitlementToken'
import { ENTITLEMENT_PUBLIC_KEY_PEM } from '../../shared/cloud/entitlementPublicKey'
import type { CloudDevice, CloudEntitlement, CloudFeature, CloudPayChannel, CloudUser, EntitlementTokenPayload } from '../../shared/cloud/types'
import { AI_PROXY_PATH, applyManagedSettings, SECRET_MASK_PREFIX, toProxiedManagedSettings, type LocalModelCredentials, type ManagedSoftwareSettings } from '../../shared/cloud/managedSettings'
import { decryptRuntimeString, encryptRuntimeString } from './runtimeCrypto'
import { setQiniuUploadGrantProvider } from '../modules/clone/qiniu'
import { setTikhubBaseUrlOverride } from '../modules/video-parser-download/tikhub'

declare const __VG_LICENSE_MODE__: string | undefined
declare const __VG_CLOUD_API_BASE__: string | undefined

export type LicenseMode = 'enforced' | 'off'

export type CloudLicenseStatus = {
  mode: LicenseMode
  /** 是否可以使用业务功能（off 模式恒为 true） */
  licensed: boolean
  loggedIn: boolean
  /** 未授权原因 */
  reason: 'ok' | 'not_logged_in' | 'no_entitlement' | 'device_limit' | 'expired' | 'invalid_token' | 'clock_rollback' | 'account_disabled'
  account: string | null
  displayName: string | null
  role: CloudUser['role'] | null
  unlimited: boolean
  planName: string | null
  planExpiresAt: number | null
  tokenExpiresAt: number | null
  features: CloudFeature[]
  /** 最近一次刷新是否因为网络失败而使用了离线令牌 */
  offline: boolean
  cloudApiBase: string
  machineId: string
  /** 软件设置（平台 Key、模型、存储）是否由后台统一下发 */
  managedSettings: boolean
  /** 后台「公告与开关」下发的内容 */
  announcement: string
  supportContact: string
  /** 当前版本低于后台设置的最低可用版本 */
  updateRequired: boolean
  minVersion: string
  /** 后台关闭的功能模块（商业版生效） */
  disabledFeatures: CloudFeature[]
}

type PersistedState = {
  sessionToken: string
  user: CloudUser | null
  entitlement: CloudEntitlement | null
  entitlementToken: string | null
  lastSeenAt: number
  reason?: CloudLicenseStatus['reason']
  /** 本机当前是否在使用后台下发的设置 */
  managedActive?: boolean
  managedVersion?: string
}

const REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000
const IPC_ALLOW_PREFIXES = ['app:', 'window:', 'cloud:', 'updater:']

export function getLicenseMode(): LicenseMode {
  const raw = typeof __VG_LICENSE_MODE__ !== 'undefined' ? __VG_LICENSE_MODE__ : 'off'
  return raw === 'enforced' ? 'enforced' : 'off'
}

export function getCloudApiBase(): string {
  const builtIn = (typeof __VG_CLOUD_API_BASE__ !== 'undefined' && __VG_CLOUD_API_BASE__) || 'http://127.0.0.1:18300'
  // 只有开发环境允许用环境变量改地址，避免打包后被指向伪造的授权服务器
  const override = !app.isPackaged ? process.env.VG_CLOUD_API_BASE?.trim() : ''
  return (override || builtIn).replace(/\/+$/, '')
}

function getPublicKeyPem(): string {
  const override = !app.isPackaged ? process.env.VG_ENTITLEMENT_PUBLIC_KEY_PEM?.trim() : ''
  return override || ENTITLEMENT_PUBLIC_KEY_PEM
}

let cachedMachineId = ''
export function getMachineId(): string {
  if (!cachedMachineId) {
    try {
      // 默认返回 sha256 后的机器码，不上传原始硬件标识
      cachedMachineId = machineIdSync().slice(0, 128)
    } catch {
      cachedMachineId = `fallback-${hostname()}`.slice(0, 128)
    }
  }
  return cachedMachineId
}

const statePath = () => join(app.getPath('userData'), 'cloud-session.dat')

let state: PersistedState | null = null

type RemoteClientConfig = { announcement: string; supportContact: string; minVersion: string; disabledFeatures: CloudFeature[] }
let remoteConfig: RemoteClientConfig = { announcement: '', supportContact: '', minVersion: '', disabledFeatures: [] }

/** 简单比较 x.y.z 版本号：a < b 返回负数 */
export function compareVersions(a: string, b: string): number {
  const pa = String(a).split('.').map((n) => Number.parseInt(n, 10) || 0)
  const pb = String(b).split('.').map((n) => Number.parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

/** 拉取后台公开配置（公告、最低版本、功能开关）；失败时保留上一次的值 */
async function syncRemoteConfig() {
  try {
    const { values } = await client.getConfig()
    const flags = (values['client.featureFlags'] ?? {}) as Record<string, unknown>
    remoteConfig = {
      announcement: String(values['client.announcement'] ?? '').trim(),
      supportContact: String(values['support.contact'] ?? '').trim(),
      minVersion: String(values['client.minVersion'] ?? '').trim(),
      disabledFeatures: Object.entries(flags)
        .filter(([, on]) => on === false)
        .map(([key]) => key as CloudFeature),
    }
  } catch {
    // 离线时沿用上一次的配置
  }
}
let offline = false
let refreshTimer: NodeJS.Timeout | null = null
let refreshInflight: Promise<CloudLicenseStatus> | null = null

const client = createCloudClient({
  getBaseUrl: getCloudApiBase,
  getToken: () => state?.sessionToken ?? null,
  timeoutMs: 20_000,
})

async function loadState() {
  if (!existsSync(statePath())) return
  try {
    const raw = await readFile(statePath(), 'utf8')
    const json = raw.startsWith('plain:') ? raw.slice(6) : decryptRuntimeString(raw)
    if (!json) return
    const parsed = JSON.parse(json) as PersistedState
    if (parsed && typeof parsed.sessionToken === 'string') state = parsed
  } catch (error) {
    console.warn('[cloud-license] 读取登录状态失败，需要重新登录', (error as Error).message)
    state = null
  }
}

async function saveState() {
  if (!state) {
    await rm(statePath(), { force: true })
    return
  }
  const json = JSON.stringify(state)
  const encrypted = encryptRuntimeString(json)
  const tmp = `${statePath()}.tmp`
  await writeFile(tmp, encrypted ?? `plain:${json}`, 'utf8')
  await rename(tmp, statePath())
}

function verifyLocalToken(): { ok: true; payload: EntitlementTokenPayload } | { ok: false; reason: CloudLicenseStatus['reason'] } {
  if (!state?.entitlementToken) return { ok: false, reason: state?.reason ?? (state ? 'no_entitlement' : 'not_logged_in') }
  const check = checkEntitlementToken({
    token: state.entitlementToken,
    publicKeyPem: getPublicKeyPem(),
    machineId: getMachineId(),
    now: Date.now(),
    lastSeenAt: state.lastSeenAt,
  })
  if (check.ok) return check
  if (check.reason === 'machine_mismatch' || check.reason === 'invalid') return { ok: false, reason: 'invalid_token' }
  return { ok: false, reason: check.reason }
}

export function getCloudLicenseStatus(): CloudLicenseStatus {
  const mode = getLicenseMode()
  const check = verifyLocalToken()
  const payload = check.ok ? check.payload : null
  if (check.ok && state && Date.now() > state.lastSeenAt) state.lastSeenAt = Date.now()
  return {
    mode,
    licensed: mode === 'off' || check.ok,
    loggedIn: Boolean(state),
    reason: check.ok ? 'ok' : check.reason,
    account: state?.user?.account ?? null,
    displayName: state?.user?.displayName ?? null,
    role: state?.user?.role ?? null,
    unlimited: Boolean(payload?.unl),
    planName: state?.entitlement?.planName ?? null,
    planExpiresAt: payload ? (payload.lexp || null) : (state?.entitlement?.expiresAt ?? null),
    tokenExpiresAt: payload?.exp ?? null,
    features: payload?.feat ?? (mode === 'off' ? ['*'] : []),
    offline,
    cloudApiBase: getCloudApiBase(),
    machineId: getMachineId(),
    managedSettings: Boolean(state?.managedActive),
    announcement: remoteConfig.announcement,
    supportContact: remoteConfig.supportContact,
    minVersion: remoteConfig.minVersion,
    updateRequired: Boolean(remoteConfig.minVersion) && compareVersions(app.getVersion(), remoteConfig.minVersion) < 0,
    disabledFeatures: mode === 'enforced' ? remoteConfig.disabledFeatures : [],
  }
}

export function isFeatureAllowed(feature: CloudFeature): boolean {
  const status = getCloudLicenseStatus()
  if (status.mode === 'off') return true
  if (status.disabledFeatures.includes(feature)) return false
  return status.licensed && (status.features.includes('*') || status.features.includes(feature))
}

function broadcast() {
  const status = getCloudLicenseStatus()
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('cloud:statusChanged', status)
  }
}

function deviceInfo() {
  return {
    machineId: getMachineId(),
    deviceName: hostname().slice(0, 80),
    platform: `${process.platform}-${process.arch}`,
    appVersion: app.getVersion(),
  }
}

/* ------------------------------------------------------------------ 后台下发的软件设置 */

type ManagedCredentialsBridge = {
  load: () => Promise<Record<string, unknown>>
  save: (payload: Record<string, unknown>) => Promise<unknown>
}

let managedBridge: ManagedCredentialsBridge | null = null
let managedCache: ManagedSoftwareSettings | null = null
let managedSyncPending = false

/** 由 index.ts 在注册凭据 IPC 时提供读写本地凭据的方法 */
export function registerManagedCredentialsBridge(bridge: ManagedCredentialsBridge) {
  managedBridge = bridge
  if (managedSyncPending) void syncManagedSettings()
}

const HUB_FIELDS = ['ai666Hub', 'xibapiHub', 'gaoruiHub', 'apifoxHub'] as const
const FLAT_SECRET_FIELDS = ['grsaiApiKey', 'tikhubApiKey', 'qiniuAccessKey', 'qiniuSecretKey'] as const

/** 托管模式下给渲染进程的凭据：后台下发的密钥只给掩码 */
export function maskManagedCredentialsForRenderer<T>(creds: T): T {
  if (!state?.managedActive || !creds || typeof creds !== 'object') return creds
  const copy = JSON.parse(JSON.stringify(creds)) as Record<string, any>
  const mask = (v: unknown) => (v ? `${SECRET_MASK_PREFIX}${String(v).slice(-4)}` : '')
  for (const field of FLAT_SECRET_FIELDS) if (field in copy) copy[field] = mask(copy[field])
  for (const field of HUB_FIELDS) if (copy[field] && typeof copy[field] === 'object') copy[field] = { ...copy[field], apiKey: mask(copy[field].apiKey) }
  return copy as T
}

/** 托管模式下保存设置：后台负责的字段始终用后台的值覆盖（掩码不会被写回） */
export function overlayManagedCredentials(payload: Record<string, unknown>): Record<string, unknown> {
  if (!state?.managedActive) return payload
  if (!managedCache) throw new Error('当前设置由管理员统一配置，请联网同步后再修改')
  return applyManagedSettings(payload as LocalModelCredentials, managedCache)
}

/** 托管模式下，七牛上传凭证和 TikHub 请求都改走云端（AK/SK、TikHub Key 不在本机） */
function installManagedProxyHooks(active: boolean) {
  if (!active) {
    setQiniuUploadGrantProvider(null)
    setTikhubBaseUrlOverride(null)
    return
  }
  setQiniuUploadGrantProvider(async (input) => {
    if (!state?.sessionToken) throw new Error('请先登录账号再上传素材')
    return await client.qiniuUploadGrant({ machineId: getMachineId(), fileName: input.fileName, keyPrefix: input.keyPrefix })
  })
  setTikhubBaseUrlOverride(`${getCloudApiBase().replace(/\/+$/, '')}${AI_PROXY_PATH}/tikhub`)
}

/**
 * 拉取后台设置。平台 Key 不会下发：云端返回去密钥的设置 + 代理令牌，
 * 本机把各平台地址改成云端代理地址、Key 改成代理令牌，生成请求由云端转发并扣点。
 */
async function syncManagedSettings() {
  if (!state?.entitlementToken) return
  if (!managedBridge) {
    managedSyncPending = true
    return
  }
  managedSyncPending = false
  try {
    const result = await client.getManagedSettings(getMachineId())
    if (!state) return
    if (result.settings && result.proxyToken) {
      const proxied = toProxiedManagedSettings(result.settings, { cloudBaseUrl: getCloudApiBase(), token: result.proxyToken })
      managedCache = proxied
      const current = (await managedBridge.load()) as LocalModelCredentials
      await managedBridge.save(applyManagedSettings(current, proxied))
      state.managedActive = true
      state.managedVersion = result.version
      installManagedProxyHooks(true)
      await saveState()
    } else if (state.managedActive) {
      await clearManagedCredentials()
    }
  } catch (error) {
    // 离线时沿用已应用的设置；其它错误只记日志，不影响授权
    if (!(error instanceof CloudClientError && error.code === 'NETWORK')) {
      console.warn('[cloud-license] 同步软件设置失败', (error as Error)?.message ?? error)
    }
  }
}

/** 退出登录 / 授权失效 / 后台关闭下发时，从本机删除代理令牌和代理地址 */
async function clearManagedCredentials() {
  const wasActive = Boolean(state?.managedActive)
  managedCache = null
  installManagedProxyHooks(false)
  if (state) {
    state.managedActive = false
    state.managedVersion = undefined
  }
  if (!wasActive || !managedBridge) return
  try {
    const current = (await managedBridge.load()) as Record<string, any>
    const proxyRoot = `${getCloudApiBase().replace(/\/+$/, '')}${AI_PROXY_PATH}`
    const isProxyUrl = (value: unknown) => String(value || '').startsWith(proxyRoot)
    for (const field of FLAT_SECRET_FIELDS) current[field] = ''
    if (isProxyUrl(current.grsaiHost)) current.grsaiHost = ''
    for (const field of HUB_FIELDS) {
      if (!current[field] || typeof current[field] !== 'object') continue
      current[field] = { ...current[field], apiKey: '', ...(isProxyUrl(current[field].baseUrl) ? { baseUrl: '' } : {}) }
    }
    await managedBridge.save(current)
  } catch (error) {
    console.warn('[cloud-license] 清除下发的设置失败', (error as Error)?.message ?? error)
  }
}

type ActivateResult = { ok: true } | { ok: false; reason: CloudLicenseStatus['reason']; message: string; devices?: CloudDevice[]; maxDevices?: number }

/** 用当前会话向云端激活本机并拿新令牌。网络失败时保留旧令牌（离线宽限） */
async function activate(): Promise<ActivateResult> {
  if (!state) return { ok: false, reason: 'not_logged_in', message: '请先登录' }
  try {
    const result = await client.activateDevice(deviceInfo())
    offline = false
    state.entitlement = result.entitlement
    state.entitlementToken = result.entitlementToken
    state.reason = 'ok'
    state.lastSeenAt = Math.max(state.lastSeenAt, Date.now())
    await saveState()
    await syncManagedSettings()
    return { ok: true }
  } catch (error) {
    if (!(error instanceof CloudClientError)) throw error
    console.warn('[cloud-license] activate failed', error.status, error.code, error.message)
    if (error.code === 'NETWORK' || error.status >= 500) {
      offline = true
      return { ok: false, reason: verifyLocalToken().ok ? 'ok' : 'not_logged_in', message: error.message }
    }
    offline = false
    if (error.status === 401 || error.code === 'ACCOUNT_DISABLED') {
      await clearManagedCredentials()
      state = null
      await saveState()
      return { ok: false, reason: error.code === 'ACCOUNT_DISABLED' ? 'account_disabled' : 'not_logged_in', message: error.message }
    }
    if (error.code === 'NO_ENTITLEMENT' || error.code === 'DEVICE_LIMIT') {
      const details = (error.details ?? {}) as { devices?: CloudDevice[]; maxDevices?: number; entitlement?: CloudEntitlement }
      await clearManagedCredentials()
      state.entitlementToken = null
      state.reason = error.code === 'NO_ENTITLEMENT' ? 'no_entitlement' : 'device_limit'
      if (details.entitlement) state.entitlement = details.entitlement
      await saveState()
      return { ok: false, reason: state.reason, message: error.message, devices: details.devices, maxDevices: details.maxDevices }
    }
    return { ok: false, reason: 'invalid_token', message: error.message }
  }
}

async function doRefresh(): Promise<CloudLicenseStatus> {
  await syncRemoteConfig()
  if (state) {
    try {
      const me = await client.me()
      state.user = me.user
      state.entitlement = me.entitlement
    } catch (error) {
      if (error instanceof CloudClientError && (error.status === 401 || error.code === 'ACCOUNT_DISABLED')) {
        await clearManagedCredentials()
        state = null
        await saveState()
        return getCloudLicenseStatus()
      }
    }
    await activate()
  }
  return getCloudLicenseStatus()
}

export function refreshCloudLicense(): Promise<CloudLicenseStatus> {
  if (refreshInflight) return refreshInflight
  // 先保存 promise 再在 finally 里按引用清理：doRefresh 同步完成时也不会留下陈旧的 inflight
  const current = doRefresh().finally(() => {
    if (refreshInflight === current) refreshInflight = null
    broadcast()
  })
  refreshInflight = current
  return current
}

function errorPayload(error: unknown) {
  if (error instanceof CloudClientError) return { ok: false as const, error: error.message, code: error.code, details: error.details }
  return { ok: false as const, error: (error as Error)?.message ?? String(error), code: 'INTERNAL' }
}

/**
 * 给所有 ipcMain.handle 套上授权检查：未授权时只放行登录、窗口控制等白名单通道。
 * 必须在注册任何业务 IPC 之前调用。
 */
export function installIpcLicenseGuard() {
  if (getLicenseMode() !== 'enforced') return
  const originalHandle = ipcMain.handle.bind(ipcMain)
  ipcMain.handle = ((channel: string, listener: Parameters<typeof ipcMain.handle>[1]) =>
    originalHandle(channel, async (event, ...args) => {
      if (!IPC_ALLOW_PREFIXES.some((prefix) => channel.startsWith(prefix)) && !getCloudLicenseStatus().licensed) {
        throw new Error('LICENSE_REQUIRED: 请先登录并开通会员')
      }
      return listener(event, ...args)
    })) as typeof ipcMain.handle
}

/** 本地 Web API 服务（127.0.0.1）是否放行 */
export function isLocalApiAllowed(): boolean {
  return getCloudLicenseStatus().licensed
}

/** 多端同步使用的云端会话：已登录才返回（离线令牌期间也返回，请求失败由调用方处理） */
export function getCloudSyncSession(): { client: typeof client; userId: string; canWrite: boolean } | null {
  if (!state?.sessionToken || !state.user) return null
  return { client, userId: state.user.id, canWrite: Boolean(state.entitlement?.active) }
}

export async function initCloudLicense() {
  await loadState()
  // 商业版托管模式：生成请求走云端代理，由云端扣点（本机不再持有平台密钥，也不在本机计费）。
  // 上次退出时仍是托管状态：先装上七牛 / TikHub 的云端钩子，同步完成前也能用。
  installManagedProxyHooks(Boolean(state?.managedActive))
  if (refreshTimer) clearInterval(refreshTimer)
  refreshTimer = setInterval(() => void refreshCloudLicense(), REFRESH_INTERVAL_MS)
  refreshTimer.unref?.()
  // 启动时后台刷新，不阻塞窗口显示；离线时继续用本地令牌
  void refreshCloudLicense()
}

export function registerCloudLicenseIpc() {
  ipcMain.handle('cloud:getStatus', async () => getCloudLicenseStatus())
  ipcMain.handle('cloud:refresh', async () => refreshCloudLicense())

  ipcMain.handle('cloud:login', async (_e, input: { account: string; password: string }) => {
    try {
      const result = await client.login({ account: input.account, password: input.password, client: 'desktop', ...deviceInfo() })
      await clearManagedCredentials()
      state = { sessionToken: result.sessionToken, user: result.user, entitlement: result.entitlement, entitlementToken: null, lastSeenAt: Date.now() }
      await saveState()
      const activation = await activate()
      broadcast()
      return { ok: true as const, status: getCloudLicenseStatus(), activation }
    } catch (error) {
      return errorPayload(error)
    }
  })

  ipcMain.handle('cloud:register', async (_e, input: { account: string; password: string; displayName?: string }) => {
    try {
      await client.register(input)
      // 注册拿到的是 web 会话，桌面端再以 desktop 身份登录一次
      const result = await client.login({ account: input.account, password: input.password, client: 'desktop', ...deviceInfo() })
      await clearManagedCredentials()
      state = { sessionToken: result.sessionToken, user: result.user, entitlement: result.entitlement, entitlementToken: null, lastSeenAt: Date.now() }
      await saveState()
      const activation = await activate()
      broadcast()
      return { ok: true as const, status: getCloudLicenseStatus(), activation }
    } catch (error) {
      return errorPayload(error)
    }
  })

  ipcMain.handle('cloud:logout', async () => {
    try {
      if (state) await client.logout()
    } catch {
      // 离线或会话已失效时直接清本地
    }
    await clearManagedCredentials()
    state = null
    offline = false
    await saveState()
    broadcast()
    return { ok: true as const, status: getCloudLicenseStatus() }
  })

  ipcMain.handle('cloud:me', async () => {
    try {
      const me = await client.me()
      return { ok: true as const, ...me }
    } catch (error) {
      return errorPayload(error)
    }
  })

  ipcMain.handle('cloud:unbindDevice', async (_e, deviceId: string) => {
    try {
      const result = await client.unbindDevice(String(deviceId))
      const activation = await activate()
      broadcast()
      return { ok: true as const, devices: result.devices, activation, status: getCloudLicenseStatus() }
    } catch (error) {
      return errorPayload(error)
    }
  })

  ipcMain.handle('cloud:listPlans', async () => {
    try {
      return { ok: true as const, ...(await client.listPlans()) }
    } catch (error) {
      return errorPayload(error)
    }
  })

  ipcMain.handle('cloud:createOrder', async (_e, input: { planCode: string; channel: CloudPayChannel }) => {
    try {
      return { ok: true as const, ...(await client.createOrder({ planCode: String(input.planCode), channel: input.channel })) }
    } catch (error) {
      return errorPayload(error)
    }
  })

  ipcMain.handle('cloud:getOrder', async (_e, orderNo: string) => {
    try {
      const result = await client.getOrder(String(orderNo))
      if (result.order.status === 'paid') await refreshCloudLicense()
      return { ok: true as const, ...result, status: getCloudLicenseStatus() }
    } catch (error) {
      return errorPayload(error)
    }
  })

  ipcMain.handle('cloud:mockPay', async (_e, orderNo: string) => {
    try {
      const result = await client.mockPay(String(orderNo))
      await refreshCloudLicense()
      return { ok: true as const, ...result, status: getCloudLicenseStatus() }
    } catch (error) {
      return errorPayload(error)
    }
  })

  ipcMain.handle('cloud:listOrders', async () => {
    try {
      return { ok: true as const, ...(await client.listOrders(1)) }
    } catch (error) {
      return errorPayload(error)
    }
  })

  ipcMain.handle('cloud:redeem', async (_e, code: string) => {
    try {
      const result = await client.redeem(String(code))
      const status = await refreshCloudLicense()
      return { ok: true as const, status, redeemed: result.redeemed, credits: result.credits }
    } catch (error) {
      return errorPayload(error)
    }
  })

  ipcMain.handle('cloud:credits', async (_e, page?: number) => {
    try {
      return { ok: true as const, ...(await client.credits(Math.max(1, Math.floor(Number(page) || 1)))) }
    } catch (error) {
      return errorPayload(error)
    }
  })

  ipcMain.handle('cloud:pricing', async () => {
    try {
      return { ok: true as const, ...(await client.pricing()) }
    } catch (error) {
      return errorPayload(error)
    }
  })

  ipcMain.handle('cloud:getConfig', async () => {
    try {
      return { ok: true as const, ...(await client.getConfig()) }
    } catch (error) {
      return errorPayload(error)
    }
  })
}
