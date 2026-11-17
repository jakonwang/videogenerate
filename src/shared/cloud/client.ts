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
import type { ManagedSoftwareSettings } from './managedSettings'
import type { AiChatRequest, AiChatResponse, AiGenerationJob, AiGenerationRequest, AiUsageResponse } from './ai'
import type { SyncChange, SyncPullResponse, SyncPushResponse, SyncUploadResponse, SyncUsageResponse } from './sync'

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
    sync: {
      pull: (since: number, collections?: string[], limit?: number) =>
        request<SyncPullResponse>('GET', `/api/v1/sync/changes${qs({ since, collections: collections?.join(','), limit })}`),
      push: (changes: SyncChange[]) => request<SyncPushResponse>('POST', '/api/v1/sync/push', { changes }),
      usage: () => request<SyncUsageResponse>('GET', '/api/v1/sync/usage'),
      uploadFile: async (body: Blob | ArrayBuffer | Uint8Array, mime: string) =>
        (await (await binary('PUT', '/api/v1/files', body, mime)).json()) as SyncUploadResponse,
      downloadFile: async (fileId: string) => (await binary('GET', `/api/v1/files/${encodeURIComponent(fileId)}`)).blob(),
    },
    ai: {
      chat: (input: AiChatRequest) => request<AiChatResponse>('POST', '/api/v1/ai/chat', input, 130_000),
      usage: () => request<AiUsageResponse>('GET', '/api/v1/ai/usage'),
      createJob: (input: AiGenerationRequest) => request<{ job: AiGenerationJob }>('POST', '/api/v1/ai/jobs', input),
      getJob: (id: string) => request<{ job: AiGenerationJob }>('GET', `/api/v1/ai/jobs/${encodeURIComponent(id)}`),
      listJobs: (ids: string[]) => request<{ jobs: AiGenerationJob[] }>('GET', `/api/v1/ai/jobs${qs({ ids: ids.join(',') })}`),
    },
    health: () => request<{ status: string }>('GET', '/api/v1/health'),
    getConfig: () => request<{ values: Record<string, unknown>; version: string }>('GET', '/api/v1/client/config'),
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
      request<{ settings: ManagedSoftwareSettings | null; version: string }>('GET', `/api/v1/client/managed-settings${qs({ machineId })}`),
    redeem: (code: string) => request<{ entitlement: CloudEntitlement }>('POST', '/api/v1/redeem', { code }),

    admin: {
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
      generateRedeemCodes: (input: { planCode: string; days?: number; count: number; note?: string }) =>
        request<{ batchId: string; codes: string[] }>('POST', '/api/v1/admin/redeem-codes', input),
      setRedeemStatus: (code: string, status: 'unused' | 'disabled') =>
        request<{ code: CloudRedeemCode }>('PATCH', `/api/v1/admin/redeem-codes/${encodeURIComponent(code)}`, { status }),
      listConfig: () => request<{ entries: CloudConfigEntry[] }>('GET', '/api/v1/admin/config'),
      saveConfig: (entry: { key: string; value: unknown; scope?: 'public' | 'private'; description?: string }) =>
        request<{ entry: CloudConfigEntry }>('PUT', `/api/v1/admin/config/${encodeURIComponent(entry.key)}`, entry),
      deleteConfig: (key: string) => request<object>('DELETE', `/api/v1/admin/config/${encodeURIComponent(key)}`),
      getSoftwareSettings: () => request<{ settings: ManagedSoftwareSettings; updatedAt: number }>('GET', '/api/v1/admin/software-settings'),
      saveSoftwareSettings: (settings: ManagedSoftwareSettings) =>
        request<{ settings: ManagedSoftwareSettings; updatedAt: number }>('PUT', '/api/v1/admin/software-settings', { settings }),
      listAudit: (q: { keyword?: string; page?: number }) => request<CloudPage<CloudAuditLog>>('GET', `/api/v1/admin/audit${qs(q)}`),
    },
  }
}

export type CloudClient = ReturnType<typeof createCloudClient>

export function formatFen(fen: number): string {
  return `¥${(fen / 100).toFixed(2)}`
}
