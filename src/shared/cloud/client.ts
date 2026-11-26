/**
 * 云端服务的轻量 fetch 客户端：桌面端主进程与 Web 管理后台共用。不依赖 Node 专有模块。
 */
import type {
  CloudAdminStats,
  CloudAdminUserDetail,
  CloudAdminUserPatch,
  CloudAuditLog,
  CloudConfigEntry,
  CloudCreateOrderRequest,
  CloudDevice,
  CloudDeviceActivateRequest,
  CloudDeviceActivateResponse,
  CloudEntitlement,
  CloudErrorCode,
  CloudLoginRequest,
  CloudLoginResponse,
  CloudMeResponse,
  CloudOrder,
  CloudPage,
  CloudPayChannel,
  CloudPlan,
  CloudPlansResponse,
  CloudRedeemCode,
  CloudUser,
  CloudUserRole,
} from './types'
import type { ManagedSecretField, ManagedSoftwareSettings } from './managedSettings'
import type { AdminDataFile, AdminDataRecord, AdminFileLinks, AdminGeneration, AdminGenerationQuery, AdminUserDataSummary } from './adminData'
import type { AiChatRequest, AiChatResponse, AiGenerationJob, AiGenerationRequest, AiUsageResponse } from './ai'
import type { SyncChange, SyncPullResponse, SyncPushResponse, SyncUploadResponse, SyncUsageResponse } from './sync'
import type {
  AiModelEntry,
  BillingCapability,
  BillingDefaults,
  CloudRedeemKind,
  CreditsResponse,
  PricingResponse,
  UsageHold,
  UsageHoldRequest,
} from './billing'

export type CloudRedeemResult = {
  entitlement: CloudEntitlement
  redeemed: { kind: CloudRedeemKind; days: number; credits: number; planName: string | null }
  credits: number
}

export type CloudGenerateRedeemInput = {
  kind: CloudRedeemKind
  planCode?: string
  days?: number | null
  credits?: number | null
  count: number
  note?: string
  channel?: string
  expiresAt?: number | null
}

export type CloudBillingOverview = { defaults: BillingDefaults; models: AiModelEntry[] }

import type { SceneSwapBatch, SceneSwapCreateInput, SceneSwapInfo, SceneSwapScene, SwapModel } from '../sceneSwap'

export type CloudUsageStats = {
  topUsers: Array<{ userId: string; account: string; planCode: string | null; calls: number; points: number; costFen: number }>
  days: number
  outstandingCredits: number
  models: Array<{ capability: BillingCapability; platform: string; model: string; calls: number; failed: number; points: number; users: number; costFen: number; unknownCost: number }>
}

export class CloudClientError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: CloudErrorCode | 'NETWORK',
    public readonly details?: unknown,
  ) {
    super(message)
  }
}

export type CloudClientOptions = {
  getBaseUrl: () => string
  getToken?: () => string | null | undefined
  onUnauthorized?: () => void
  timeoutMs?: number
}

export type CloudAdminOrder = CloudOrder & { account: string }

export function createCloudClient(options: CloudClientOptions) {
  async function request<T>(method: string, path: string, body?: unknown, timeoutMs?: number): Promise<T> {
    const base = options.getBaseUrl().replace(/\/+$/, '')
    const headers: Record<string, string> = { Accept: 'application/json' }
    const token = options.getToken?.()
    if (token) headers.Authorization = `Bearer ${token}`
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    let res: Response
    try {
      res = await fetch(`${base}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs ?? options.timeoutMs ?? 20_000),
      })
    } catch (error) {
      throw new CloudClientError(`无法连接云端服务：${(error as Error)?.message ?? error}`, 0, 'NETWORK')
    }
    let json: any = null
    try {
      json = await res.json()
    } catch {
      json = null
    }
    if (!res.ok || !json || json.ok !== true) {
      if (res.status === 401) options.onUnauthorized?.()
      throw new CloudClientError(String(json?.error || `请求失败（HTTP ${res.status}）`), res.status, json?.code || 'INTERNAL', json?.details)
    }
    return json as T
  }

  const qs = (params: Record<string, string | number | undefined>) => {
    const search = new URLSearchParams()
    for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== '') search.set(key, String(value))
    const text = search.toString()
    return text ? `?${text}` : ''
  }

  /** 二进制上传 / 下载（文件同步），不走 JSON 封装 */
  async function binary(method: 'PUT' | 'GET', path: string, body?: Blob | ArrayBuffer | Uint8Array, mime?: string): Promise<Response> {
    const base = options.getBaseUrl().replace(/\/+$/, '')
    const headers: Record<string, string> = {}
    const token = options.getToken?.()
    if (token) headers.Authorization = `Bearer ${token}`
    if (mime) headers['Content-Type'] = mime
    let res: Response
    try {
      res = await fetch(`${base}${path}`, { method, headers, body: body as BodyInit | undefined, signal: AbortSignal.timeout(options.timeoutMs ?? 120_000) })
    } catch (error) {
      throw new CloudClientError(`无法连接云端服务：${(error as Error)?.message ?? error}`, 0, 'NETWORK')
    }
    if (!res.ok) {
      if (res.status === 401) options.onUnauthorized?.()
      let json: any = null
      try {
        json = await res.json()
      } catch {
        json = null
      }
      throw new CloudClientError(String(json?.error || `请求失败（HTTP ${res.status}）`), res.status, json?.code || 'INTERNAL', json?.details)
    }
    return res
  }

  return {
    request,
    /** 电脑代办：网页调电脑端功能；电脑端长轮询取请求、回传结果 */
    relay: {
      /** target 'server'：由服务器复刻引擎执行（复刻页面里的商品列表等）；复刻调用本身总是在服务器上 */
      call: <T = unknown>(ns: string, method: string, args: unknown[], target?: 'server') =>
        request<{ result: T }>('POST', '/api/v1/relay/call', { ns, method, args, target }, 11 * 60_000).then((r) => r.result),
      status: () => request<{ online: boolean }>('GET', '/api/v1/relay/status'),
      next: (waitMs = 25_000) => request<{ calls: import('./relay').RelayCall[] }>('GET', `/api/v1/relay/next${qs({ wait: waitMs })}`, undefined, waitMs + 15_000),
      result: (result: import('./relay').RelayResult) => request<{ ok: boolean }>('POST', '/api/v1/relay/result', result, 120_000),
    },
    sync: {
      pull: (since: number, collections?: string[], limit?: number) =>
        request<SyncPullResponse>('GET', `/api/v1/sync/changes${qs({ since, collections: collections?.join(','), limit })}`),
      push: (changes: SyncChange[]) => request<SyncPushResponse>('POST', '/api/v1/sync/push', { changes }),
      usage: () => request<SyncUsageResponse>('GET', '/api/v1/sync/usage'),
      uploadFile: async (body: Blob | ArrayBuffer | Uint8Array, mime: string) =>
        (await (await binary('PUT', '/api/v1/files', body, mime)).json()) as SyncUploadResponse,
      downloadFile: async (fileId: string) => (await binary('GET', `/api/v1/files/${encodeURIComponent(fileId)}`)).blob(),
    },
    /** AI 修图 · 批量换景（批次和队列都在云端） */
    sceneSwap: {
      // 云端比软件旧时没有 models / task，按空列表和换场景处理
      info: () => request<SceneSwapInfo>('GET', '/api/v1/scene-swap/info').then((r) => ({ ...r, models: r.models ?? [] })),
      addScene: (input: { fileId: string; name: string; category?: string }) => request<{ scene: SceneSwapScene }>('POST', '/api/v1/scene-swap/scenes', input).then((r) => r.scene),
      removeScene: (id: string) => request<object>('DELETE', `/api/v1/scene-swap/scenes/${encodeURIComponent(id)}`),
      addModel: (input: { fileId: string; name: string; gender?: string; skin?: string; body?: string }) => request<{ model: SwapModel }>('POST', '/api/v1/scene-swap/models', input).then((r) => r.model),
      removeModel: (id: string) => request<object>('DELETE', `/api/v1/scene-swap/models/${encodeURIComponent(id)}`),
      list: () => request<{ batches: SceneSwapBatch[] }>('GET', '/api/v1/scene-swap/batches').then((r) => r.batches.map((batch) => ({ ...batch, task: batch.task ?? 'scene' }))),
      get: (id: string) => request<{ batch: SceneSwapBatch }>('GET', `/api/v1/scene-swap/batches/${encodeURIComponent(id)}`).then((r) => r.batch),
      create: (input: SceneSwapCreateInput) => request<{ batch: SceneSwapBatch }>('POST', '/api/v1/scene-swap/batches', input, 60_000).then((r) => r.batch),
      remove: (id: string) => request<object>('DELETE', `/api/v1/scene-swap/batches/${encodeURIComponent(id)}`),
      action: (id: string, action: 'run' | 'pause' | 'resume' | 'retrial') => request<{ batch: SceneSwapBatch }>('POST', `/api/v1/scene-swap/batches/${encodeURIComponent(id)}/${action}`, {}).then((r) => r.batch),
      item: (id: string, itemId: string, action: 'redo' | 'accept' | 'reject', reasons: string[] = []) =>
        request<{ batch: SceneSwapBatch }>('POST', `/api/v1/scene-swap/batches/${encodeURIComponent(id)}/items/${encodeURIComponent(itemId)}/${action}`, { reasons }).then((r) => r.batch),
    },
    ai: {
      chat: (input: AiChatRequest) => request<AiChatResponse>('POST', '/api/v1/ai/chat', input, 130_000),
      usage: () => request<AiUsageResponse>('GET', '/api/v1/ai/usage'),
      createJob: (input: AiGenerationRequest) => request<{ job: AiGenerationJob }>('POST', '/api/v1/ai/jobs', input),
      getJob: (id: string) => request<{ job: AiGenerationJob }>('GET', `/api/v1/ai/jobs/${encodeURIComponent(id)}`),
      listJobs: (ids: string[]) => request<{ jobs: AiGenerationJob[] }>('GET', `/api/v1/ai/jobs${qs({ ids: ids.join(',') })}`),
      /** 网页上显示自己的图片 / 视频：签名的相对链接（12 小时有效，末尾带 &t=扩展名） */
      fileLinks: (fileIds: string[]) => request<{ links: Record<string, string>; expiresAt: number }>('POST', '/api/v1/sync/file-links', { fileIds }),
      /** 图片的对外链接（上架导出用；七牛或签名链接，days 为签名链接有效天数，最长 30） */
      publicUrls: (fileIds: string[], days?: number) => request<{ urls: Record<string, string>; days: number }>('POST', '/api/v1/ai/public-urls', { fileIds, days }, 120_000),
    },
    health: () => request<{ status: string }>('GET', '/api/v1/health'),
    getConfig: () => request<{ values: Record<string, unknown>; version: string; managedAi?: boolean }>('GET', '/api/v1/client/config'),
    listPlans: () => request<CloudPlansResponse>('GET', '/api/v1/plans'),

    login: (input: CloudLoginRequest) => request<CloudLoginResponse>('POST', '/api/v1/auth/login', input),
    register: (input: { account: string; password: string; displayName?: string }) => request<CloudLoginResponse>('POST', '/api/v1/auth/register', input),
    logout: () => request<object>('POST', '/api/v1/auth/logout'),
    me: () => request<CloudMeResponse>('GET', '/api/v1/me'),
    changePassword: (oldPassword: string, newPassword: string) => request<object>('POST', '/api/v1/me/password', { oldPassword, newPassword }),

    activateDevice: (input: CloudDeviceActivateRequest) => request<CloudDeviceActivateResponse>('POST', '/api/v1/devices/activate', input),
    unbindDevice: (deviceId: string) => request<{ devices: CloudDevice[] }>('DELETE', `/api/v1/devices/${encodeURIComponent(deviceId)}`),

    createOrder: (input: CloudCreateOrderRequest) => request<{ order: CloudOrder }>('POST', '/api/v1/orders', input),
    getOrder: (orderNo: string) => request<{ order: CloudOrder }>('GET', `/api/v1/orders/${encodeURIComponent(orderNo)}`),
    listOrders: (page = 1) => request<CloudPage<CloudOrder>>('GET', `/api/v1/orders${qs({ page })}`),
    mockPay: (orderNo: string) => request<{ order: CloudOrder }>('POST', `/api/v1/orders/${encodeURIComponent(orderNo)}/mock-pay`),
    getManagedSettings: (machineId: string) =>
      request<{ settings: ManagedSoftwareSettings | null; version: string; proxyToken: string | null }>('GET', `/api/v1/client/managed-settings${qs({ machineId })}`),
    /** 托管模式：向云端要七牛单次上传凭证（七牛 AK/SK 不下发到电脑） */
    qiniuUploadGrant: (input: { machineId: string; fileName: string; keyPrefix?: string }) =>
      request<{ token: string; key: string; uploadHost: string; domain: string }>('POST', '/api/v1/client/qiniu-upload-grant', input),
    redeem: (code: string) => request<CloudRedeemResult>('POST', '/api/v1/redeem', { code }),

    /* 点数计费 */
    pricing: () => request<PricingResponse>('GET', '/api/v1/pricing'),
    credits: (page = 1) => request<CreditsResponse>('GET', `/api/v1/credits${qs({ page })}`),
    holdUsage: (input: UsageHoldRequest) => request<{ hold: UsageHold }>('POST', '/api/v1/usage/hold', input),
    settleUsage: (holdId: string, ok: boolean, reason?: string) =>
      request<{ hold: UsageHold }>('POST', `/api/v1/usage/holds/${encodeURIComponent(holdId)}/settle`, { ok, reason }),

    admin: {
      listScenes: () => request<{ scenes: SceneSwapScene[] }>('GET', '/api/v1/admin/scenes'),
      addScene: (input: { fileId: string; name: string; category: string }) => request<{ scene: SceneSwapScene }>('POST', '/api/v1/admin/scenes', input),
      removeScene: (id: string) => request<object>('DELETE', `/api/v1/admin/scenes/${encodeURIComponent(id)}`),
      listModels: () => request<{ models: SwapModel[] }>('GET', '/api/v1/admin/models'),
      addModel: (input: { fileId: string; name: string; gender: string; skin: string; body: string }) => request<{ model: SwapModel }>('POST', '/api/v1/admin/models', input),
      removeModel: (id: string) => request<object>('DELETE', `/api/v1/admin/models/${encodeURIComponent(id)}`),
      uploadFile: async (body: Blob, mime: string) => (await (await binary('PUT', '/api/v1/admin/files', body, mime)).json()) as SyncUploadResponse,
      downloadFile: async (fileId: string) => (await binary('GET', `/api/v1/admin/files/${encodeURIComponent(fileId)}`)).blob(),
      stats: () => request<{ stats: CloudAdminStats; channels: CloudPayChannel[] }>('GET', '/api/v1/admin/stats'),
      listUsers: (q: { keyword?: string; role?: string; status?: string; page?: number }) =>
        request<CloudPage<CloudUser>>('GET', `/api/v1/admin/users${qs(q)}`),
      createUser: (input: { account: string; password: string; displayName?: string; role?: CloudUserRole; planCode?: string; days?: number }) =>
        request<CloudAdminUserDetail>('POST', '/api/v1/admin/users', input),
      getUser: (id: string) => request<CloudAdminUserDetail>('GET', `/api/v1/admin/users/${encodeURIComponent(id)}`),
      patchUser: (id: string, patch: CloudAdminUserPatch) => request<CloudAdminUserDetail>('PATCH', `/api/v1/admin/users/${encodeURIComponent(id)}`, patch),
      revokeDevice: (userId: string, deviceId: string) =>
        request<CloudAdminUserDetail>('DELETE', `/api/v1/admin/users/${encodeURIComponent(userId)}/devices/${encodeURIComponent(deviceId)}`),
      listPlans: () => request<{ plans: CloudPlan[] }>('GET', '/api/v1/admin/plans'),
      savePlan: (plan: Partial<CloudPlan> & { code: string }) => request<{ plan: CloudPlan }>('PUT', `/api/v1/admin/plans/${encodeURIComponent(plan.code)}`, plan),
      listOrders: (q: { keyword?: string; status?: string; userId?: string; page?: number }) =>
        request<CloudPage<CloudAdminOrder>>('GET', `/api/v1/admin/orders${qs(q)}`),
      refundOrder: (orderNo: string, input: { revokeDays: boolean; note?: string }) =>
        request<{ order: CloudOrder }>('POST', `/api/v1/admin/orders/${encodeURIComponent(orderNo)}/refund`, input),
      listRedeemCodes: (q: { keyword?: string; status?: string; batchId?: string; page?: number }) =>
        request<CloudPage<CloudRedeemCode>>('GET', `/api/v1/admin/redeem-codes${qs(q)}`),
      generateRedeemCodes: (input: CloudGenerateRedeemInput) => request<{ batchId: string; codes: string[] }>('POST', '/api/v1/admin/redeem-codes', input),
      exportRedeemBatch: (batchId: string) => request<{ codes: CloudRedeemCode[] }>('GET', `/api/v1/admin/redeem-batches/${encodeURIComponent(batchId)}`),
      setRedeemBatchStatus: (batchId: string, status: 'unused' | 'disabled') =>
        request<{ changed: number }>('PATCH', `/api/v1/admin/redeem-batches/${encodeURIComponent(batchId)}`, { status }),
      adjustCredits: (userId: string, delta: number, note: string) =>
        request<CloudAdminUserDetail>('POST', `/api/v1/admin/users/${encodeURIComponent(userId)}/credits`, { delta, note }),
      getBilling: () => request<CloudBillingOverview>('GET', '/api/v1/admin/billing'),
      saveBillingDefaults: (defaults: BillingDefaults) => request<CloudBillingOverview>('PUT', '/api/v1/admin/billing/defaults', defaults),
      saveModel: (model: Partial<AiModelEntry>) => request<CloudBillingOverview>('POST', '/api/v1/admin/billing/models', model),
      deleteModel: (id: string) => request<CloudBillingOverview>('DELETE', `/api/v1/admin/billing/models/${encodeURIComponent(id)}`),
      usageStats: (days = 30) => request<CloudUsageStats>('GET', `/api/v1/admin/billing/usage${qs({ days })}`),
      setRedeemStatus: (code: string, status: 'unused' | 'disabled') =>
        request<{ code: CloudRedeemCode }>('PATCH', `/api/v1/admin/redeem-codes/${encodeURIComponent(code)}`, { status }),
      listConfig: () => request<{ entries: CloudConfigEntry[] }>('GET', '/api/v1/admin/config'),
      saveConfig: (entry: { key: string; value: unknown; scope?: 'public' | 'private'; description?: string }) =>
        request<{ entry: CloudConfigEntry }>('PUT', `/api/v1/admin/config/${encodeURIComponent(entry.key)}`, entry),
      deleteConfig: (key: string) => request<object>('DELETE', `/api/v1/admin/config/${encodeURIComponent(key)}`),
      getSoftwareSettings: () => request<{ settings: ManagedSoftwareSettings; updatedAt: number }>('GET', '/api/v1/admin/software-settings'),
      saveSoftwareSettings: (settings: ManagedSoftwareSettings) =>
        request<{ settings: ManagedSoftwareSettings; updatedAt: number }>('PUT', '/api/v1/admin/software-settings', { settings }),
      revealSoftwareSecret: (field: ManagedSecretField) => request<{ value: string }>('POST', '/api/v1/admin/software-settings/reveal', { field }),
      listAudit: (q: { keyword?: string; page?: number }) => request<CloudPage<CloudAuditLog>>('GET', `/api/v1/admin/audit${qs(q)}`),
      /* 用户数据（只读，仅超级管理员） */
      userDataSummary: (userId: string) => request<{ summary: AdminUserDataSummary }>('GET', `/api/v1/admin/users/${encodeURIComponent(userId)}/data/summary`),
      userDataRecords: (userId: string, q: { collection: string; keyword?: string; includeDeleted?: '1' | ''; page?: number }) =>
        request<CloudPage<AdminDataRecord>>('GET', `/api/v1/admin/users/${encodeURIComponent(userId)}/data/records${qs(q)}`),
      userDataFiles: (userId: string, q: { kind?: string; page?: number }) =>
        request<CloudPage<AdminDataFile>>('GET', `/api/v1/admin/users/${encodeURIComponent(userId)}/data/files${qs(q)}`),
      listGenerations: (q: AdminGenerationQuery) => request<CloudPage<AdminGeneration>>('GET', `/api/v1/admin/generations${qs(q)}`),
      fileLinks: (files: Array<{ userId: string; fileId: string }>) => request<AdminFileLinks>('POST', '/api/v1/admin/file-links', { files }),
    },
  }
}

export type CloudClient = ReturnType<typeof createCloudClient>

export function formatFen(fen: number): string {
  return `¥${(fen / 100).toFixed(2)}`
}
