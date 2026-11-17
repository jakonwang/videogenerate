/**
 * 云端服务（services/cloud）与桌面端 / Web 管理后台之间的接口契约。
 * 时间字段统一为毫秒时间戳；金额统一为「分」。
 */

export type CloudUserRole = 'user' | 'admin' | 'super_admin'
export type CloudUserStatus = 'active' | 'disabled'
export type CloudClientKind = 'desktop' | 'mobile' | 'web' | 'admin'
export type CloudPayChannel = 'wechat' | 'alipay' | 'mock'
export type CloudOrderStatus = 'pending' | 'paid' | 'closed' | 'refunded'
export type CloudRedeemStatus = 'unused' | 'used' | 'disabled'

/** 永久授权的到期时间（9999-12-31） */
export const CLOUD_PERMANENT_EXPIRES_AT = 253402214400000

/** 功能模块标识；套餐 features 里写 '*' 表示全部 */
export const CLOUD_FEATURES = [
  'clone',
  'production',
  'models',
  'asset-library',
  'product-research',
  'plugins',
  'gmv-max',
  'creator-hub',
] as const
export type CloudFeature = (typeof CLOUD_FEATURES)[number] | '*'

export type CloudApiOk<T> = { ok: true } & T
export type CloudApiError = { ok: false; error: string; code?: CloudErrorCode; details?: unknown }

export type CloudErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'BAD_REQUEST'
  | 'RATE_LIMITED'
  | 'DEVICE_LIMIT'
  | 'NO_ENTITLEMENT'
  | 'ACCOUNT_DISABLED'
  | 'CONFLICT'
  | 'QUOTA_EXCEEDED'
  | 'INTERNAL'

export type CloudUser = {
  id: string
  account: string
  displayName: string
  role: CloudUserRole
  status: CloudUserStatus
  planCode: string | null
  planExpiresAt: number | null
  /** 管理员手动设为不受限 */
  unlimited: boolean
  createdAt: number
  lastLoginAt: number | null
}

export type CloudEntitlement = {
  active: boolean
  unlimited: boolean
  planCode: string | null
  planName: string | null
  expiresAt: number | null
  features: CloudFeature[]
  /** 可绑定的电脑数，0 表示不限 */
  maxDevices: number
  /** 可同时登录的手机数（与电脑名额分开），0 表示不限；新手机登录会顶掉最久未用的旧手机 */
  maxMobileDevices: number
}

/** 电脑和手机各自占用独立的设备名额 */
export type CloudDeviceKind = 'computer' | 'mobile'

export function deviceKindOf(platform: string | null | undefined): CloudDeviceKind {
  return /^(android|ios)$/i.test(String(platform || '').trim()) ? 'mobile' : 'computer'
}

/** 套餐设备名额的中文描述，如「2 台电脑 + 1 部手机」 */
export function describeDeviceAllowance(maxDevices: number, maxMobileDevices: number): string {
  const computers = maxDevices === 0 ? '不限电脑' : `${maxDevices} 台电脑`
  const phones = maxMobileDevices === 0 ? '不限手机' : `${maxMobileDevices} 部手机`
  return `${computers} + ${phones}`
}

export type CloudDevice = {
  id: string
  machineId: string
  name: string
  platform: string
  appVersion: string
  createdAt: number
  lastSeenAt: number
  kind: CloudDeviceKind
}

export type CloudPlan = {
  code: string
  name: string
  description: string
  /** 0 表示永久 */
  days: number
  amountFen: number
  maxDevices: number
  features: CloudFeature[]
  active: boolean
  sort: number
}

export type CloudOrder = {
  orderNo: string
  userId: string
  planCode: string
  planName: string
  days: number
  amountFen: number
  channel: CloudPayChannel
  status: CloudOrderStatus
  qrContent: string
  transactionId: string | null
  paidAt: number | null
  expireAt: number
  createdAt: number
  refundedAt: number | null
  note: string
}

export type CloudRedeemCode = {
  code: string
  planCode: string
  days: number
  status: CloudRedeemStatus
  batchId: string
  note: string
  createdAt: number
  usedBy: string | null
  usedAt: number | null
}

export type CloudConfigEntry = {
  key: string
  value: unknown
  /** public：下发给客户端；private：仅服务端使用 */
  scope: 'public' | 'private'
  description: string
  updatedAt: number
}

export type CloudAuditLog = {
  id: number
  actorUserId: string | null
  actorAccount: string | null
  action: string
  target: string
  detail: unknown
  ip: string
  createdAt: number
}

/* ------------------------------------------------------------------ 授权令牌 */

/** 签名授权令牌载荷（Ed25519）。桌面端离线时凭它判断授权，最多用到 exp */
export type EntitlementTokenPayload = {
  v: 1
  /** 用户 id */
  sub: string
  acc: string
  role: CloudUserRole
  /** 机器码 */
  mid: string
  /** 设备 id */
  did: string
  plan: string | null
  feat: CloudFeature[]
  unl: boolean
  /** 授权本身到期（毫秒，0 = 不限） */
  lexp: number
  iat: number
  /** 令牌失效时间（毫秒） */
  exp: number
}

/* ------------------------------------------------------------------ 请求 / 响应 */

export type CloudLoginRequest = {
  account: string
  password: string
  client: CloudClientKind
  machineId?: string
  deviceName?: string
  platform?: string
  appVersion?: string
}

export type CloudLoginResponse = {
  sessionToken: string
  user: CloudUser
  entitlement: CloudEntitlement
}

export type CloudMeResponse = {
  user: CloudUser
  entitlement: CloudEntitlement
  devices: CloudDevice[]
}

export type CloudDeviceActivateRequest = {
  machineId: string
  deviceName?: string
  platform?: string
  appVersion?: string
}

export type CloudDeviceActivateResponse = {
  entitlement: CloudEntitlement
  entitlementToken: string
  device: CloudDevice
}

export type CloudCreateOrderRequest = { planCode: string; channel: CloudPayChannel }

export type CloudPlansResponse = { plans: CloudPlan[]; channels: CloudPayChannel[]; /** 每个会员另含的手机名额 */ maxMobileDevices: number }

export type CloudAdminStats = {
  users: number
  activeSubscribers: number
  newUsers7d: number
  paidOrders30d: number
  revenue30dFen: number
  revenueTodayFen: number
  devices: number
  /** 近 14 天每日收入（北京时间，含今天） */
  revenueTrend: Array<{ date: string; fen: number; count: number }>
}

export type CloudPage<T> = { items: T[]; total: number; page: number; pageSize: number }

export type CloudAdminUserDetail = {
  user: CloudUser
  entitlement: CloudEntitlement
  devices: CloudDevice[]
  orders: CloudOrder[]
}

export type CloudAdminUserPatch = {
  displayName?: string
  role?: CloudUserRole
  status?: CloudUserStatus
  unlimited?: boolean
  planCode?: string | null
  planExpiresAt?: number | null
  /** 在当前到期时间基础上增加天数（与 planExpiresAt 二选一） */
  extendDays?: number
  password?: string
}
