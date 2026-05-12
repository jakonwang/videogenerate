import type {
  BillingOrder,
  CloneModelIdentitySummary,
  CloneProjectSummary,
  CloneRuntimeResponse,
  CloneWorkflowStep,
  DesktopReleaseInfo,
  DesktopReleaseItem,
  SubscriptionPlan,
  UserSubscription,
  WalletAccount,
  WalletTransaction,
  WebUser,
} from './types'

type WebApiEnvelope<T> = T & {
  ok: boolean
  error?: string
}

export type WebApiClientOptions = {
  getBaseUrl: () => Promise<string> | string
  getToken?: () => string
  onUnauthorized?: () => void
}

export function createWebApiClient(options: WebApiClientOptions) {
  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const baseUrl = String(await options.getBaseUrl()).trim()
    if (!baseUrl) throw new Error('Web API 服务地址未配置')
    const token = options.getToken?.() || ''
    const headers = new Headers(init?.headers || {})
    if (!headers.has('Content-Type') && init?.body) {
      headers.set('Content-Type', 'application/json')
    }
    if (token) {
      headers.set('Authorization', `Bearer ${token}`)
    }
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers,
    })
    const payload = (await response.json().catch(() => ({}))) as WebApiEnvelope<T>
    if (response.status === 401) {
      options.onUnauthorized?.()
    }
    if (!response.ok || payload?.ok === false) {
      throw new Error(String(payload?.error || `请求失败: ${response.status}`))
    }
    return payload as T
  }

  async function getDesktopLatestReleaseFallback() {
    const baseUrl = String(await options.getBaseUrl()).trim().replace(/\/+$/, '')
    const candidates = [
      `${baseUrl}/index.php/api/client/checkUpdate?current_version=0.0.0`,
      `${baseUrl}/api/client/checkUpdate?current_version=0.0.0`,
    ]

    for (const url of candidates) {
      try {
        const response = await fetch(url)
        const payload = (await response.json().catch(() => ({}))) as {
          code?: number
          data?: {
            version?: string
            release_notes?: string
            download_url?: string
            is_mandatory?: number
          }
        }
        if (!response.ok || payload.code !== 0) continue
        const version = String(payload.data?.version || '').trim()
        const downloadUrl = String(payload.data?.download_url || '').trim()
        const latest: DesktopReleaseItem | null = version || downloadUrl
          ? {
              version: version || '最新版本',
              releaseNotes: String(payload.data?.release_notes || '').trim(),
              downloadUrl,
              isMandatory: Number(payload.data?.is_mandatory || 0) === 1,
              platform: 'Windows',
            }
          : null
        return { latest, items: latest ? [latest] : [] } satisfies DesktopReleaseInfo
      } catch {
        continue
      }
    }

    return { latest: null, items: [] } satisfies DesktopReleaseInfo
  }

  return {
    async login(input: { phone: string; code: string; displayName?: string }) {
      return await request<{
        token: string
        user: WebUser
        subscription: UserSubscription
        wallet: WalletAccount
      }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify(input),
      })
    },

    async logout() {
      return await request<{ ok: true }>('/auth/logout', {
        method: 'POST',
      })
    },

    async getProfile() {
      return await request<{
        user: WebUser
        subscription: UserSubscription
        wallet: WalletAccount
      }>('/me', {
        method: 'GET',
      })
    },

    async listPlans() {
      const result = await request<{ plans: SubscriptionPlan[] }>('/billing/plans', {
        method: 'GET',
      })
      return result.plans || []
    },

    async createOrder(input: {
      type: 'subscription' | 'compute_pack'
      planId?: string
      paymentChannel?: 'mock_wechat' | 'mock_alipay'
      credits?: number
    }) {
      return await request<{
        order: {
          id: string
          amountCny: number
          status: string
          type: 'subscription' | 'compute_pack'
        }
        paymentMock: {
          payUrl: string
          qrText: string
        }
      }>('/billing/orders', {
        method: 'POST',
        body: JSON.stringify(input),
      })
    },

    async payMockOrder(orderId: string) {
      return await request(`/payments/notify/${encodeURIComponent(orderId)}`, {
        method: 'POST',
      })
    },

    async listOrders() {
      const result = await request<{ orders: BillingOrder[] }>('/billing/orders', {
        method: 'GET',
      })
      return result.orders || []
    },

    async listTransactions() {
      const result = await request<{ transactions: WalletTransaction[] }>('/billing/transactions', {
        method: 'GET',
      })
      return result.transactions || []
    },

    async listCloneProjects() {
      const result = await request<{ projects: CloneProjectSummary[] }>('/clone/projects', {
        method: 'GET',
      })
      return result.projects || []
    },

    async listCloneModelIdentities() {
      const result = await request<{ items: CloneModelIdentitySummary[] }>('/clone/model-identities', {
        method: 'GET',
      })
      return result.items || []
    },

    async createCloneProject(input?: {
      title?: string
      description?: string
      locale?: 'zh-CN' | 'vi-VN'
    }) {
      return await request<{
        project: { id: string }
        summary?: CloneProjectSummary
      }>('/clone/projects', {
        method: 'POST',
        body: JSON.stringify(input || {}),
      })
    },

    async getCloneProject(projectId: string) {
      return await request<{ project: any }>(`/clone/projects/${encodeURIComponent(projectId)}`, {
        method: 'GET',
      })
    },

    async updateCloneProjectStage(projectId: string, input: { currentStep: CloneWorkflowStep }) {
      return await request<{ project?: any }>(`/clone/projects/${encodeURIComponent(projectId)}/stage`, {
        method: 'POST',
        body: JSON.stringify(input),
      })
    },

    async getCloneRuntime(projectId: string) {
      return await request<CloneRuntimeResponse>(`/clone/projects/${encodeURIComponent(projectId)}/runtime`, {
        method: 'GET',
      })
    },

    async analyzeCloneReference(projectId: string, input: { videoPath: string; locale?: 'zh-CN' | 'vi-VN' }) {
      return await request<{ project?: any }>(`/clone/projects/${encodeURIComponent(projectId)}/analyze`, {
        method: 'POST',
        body: JSON.stringify(input),
      })
    },

    async uploadCloneReferenceVideo(
      projectId: string,
      input: { fileName: string; base64Data: string; mimeType?: string },
    ) {
      return await request<{ project?: any; asset?: any }>(
        `/clone/projects/${encodeURIComponent(projectId)}/reference-video/upload`,
        {
          method: 'POST',
          body: JSON.stringify(input),
        },
      )
    },

    async generateCloneScriptVariants(projectId: string, input: { variantCount: number }) {
      return await request<{ project?: any }>(`/clone/projects/${encodeURIComponent(projectId)}/script-variants`, {
        method: 'POST',
        body: JSON.stringify(input),
      })
    },

    async selectCloneScriptVariant(projectId: string, input: { variantId: string }) {
      return await request<{ project?: any }>(
        `/clone/projects/${encodeURIComponent(projectId)}/select-script-variant`,
        {
          method: 'POST',
          body: JSON.stringify(input),
        },
      )
    },

    async saveCloneProjectProductImages(projectId: string, input: { productReferenceImagePaths?: string[] }) {
      return await request<{ project?: any }>(`/clone/projects/${encodeURIComponent(projectId)}/product-images`, {
        method: 'POST',
        body: JSON.stringify(input),
      })
    },

    async uploadCloneProductImages(
      projectId: string,
      input: { files: Array<{ fileName: string; base64Data: string; mimeType?: string }> },
    ) {
      return await request<{ project?: any; assets?: any[] }>(
        `/clone/projects/${encodeURIComponent(projectId)}/product-images/upload`,
        {
          method: 'POST',
          body: JSON.stringify(input),
        },
      )
    },

    async selectCloneProjectModelIdentity(projectId: string, input: { identityId: string }) {
      return await request<{ project?: any }>(`/clone/projects/${encodeURIComponent(projectId)}/select-model-identity`, {
        method: 'POST',
        body: JSON.stringify(input),
      })
    },

    async generateStoryboardImages(
      projectId: string,
      input: { productReferenceImagePaths?: string[]; selectedModelIdentityId?: string },
    ) {
      return await request<any>(`/clone/projects/${encodeURIComponent(projectId)}/storyboard-images`, {
        method: 'POST',
        body: JSON.stringify(input),
      })
    },

    async regenerateStoryboardImage(
      projectId: string,
      shotId: string,
      input: { productReferenceImagePaths?: string[] },
    ) {
      return await request<{ project?: any }>(
        `/clone/projects/${encodeURIComponent(projectId)}/storyboard-images/${encodeURIComponent(shotId)}/regenerate`,
        {
          method: 'POST',
          body: JSON.stringify(input),
        },
      )
    },

    async updateCloneShot(
      projectId: string,
      shotId: string,
      input: {
        locked?: boolean
        scriptText?: string
        narrationText?: string
        onScreenText?: string
        visualDescription?: string
        actionDescription?: string
        cameraDescription?: string
        durationSec?: number
        cameraMovement?: string
        subtitleSuggestion?: string
        materialNeed?: string
        order?: number
      },
    ) {
      return await request<{ project?: any }>(
        `/clone/projects/${encodeURIComponent(projectId)}/shots/${encodeURIComponent(shotId)}`,
        {
          method: 'POST',
          body: JSON.stringify(input),
        },
      )
    },

    async createCloneShot(projectId: string, input?: { afterShotId?: string }) {
      return await request<{ project?: any }>(`/clone/projects/${encodeURIComponent(projectId)}/shots`, {
        method: 'POST',
        body: JSON.stringify(input || {}),
      })
    },

    async reorderCloneShots(projectId: string, input: { shotIds: string[] }) {
      return await request<{ project?: any }>(`/clone/projects/${encodeURIComponent(projectId)}/shots/reorder`, {
        method: 'POST',
        body: JSON.stringify(input),
      })
    },

    async removeCloneShot(projectId: string, shotId: string) {
      return await request<{ project?: any }>(
        `/clone/projects/${encodeURIComponent(projectId)}/shots/${encodeURIComponent(shotId)}`,
        {
          method: 'DELETE',
        },
      )
    },

    async generateCloneShotVideos(projectId: string) {
      return await request<any>(`/clone/projects/${encodeURIComponent(projectId)}/shot-videos`, {
        method: 'POST',
      })
    },

    async syncCloneShotVideoTask(projectId: string, shotId: string) {
      return await request<any>(
        `/clone/projects/${encodeURIComponent(projectId)}/shot-videos/${encodeURIComponent(shotId)}/sync`,
        {
          method: 'POST',
        },
      )
    },

    async regenerateCloneShotVideo(projectId: string, shotId: string) {
      return await request<any>(
        `/clone/projects/${encodeURIComponent(projectId)}/shot-videos/${encodeURIComponent(shotId)}/regenerate`,
        {
          method: 'POST',
        },
      )
    },

    async composeCloneFinalVideo(projectId: string, input?: { outputDir?: string }) {
      return await request<{ project?: any }>(`/clone/projects/${encodeURIComponent(projectId)}/compose`, {
        method: 'POST',
        body: JSON.stringify(input || {}),
      })
    },

    async getDesktopLatestRelease() {
      return await getDesktopLatestReleaseFallback()
    },

    async listDesktopReleases() {
      return await getDesktopLatestReleaseFallback()
    },

    async removeCloneProject(projectId: string) {
      return await request<{ ok: true }>(`/clone/projects/${encodeURIComponent(projectId)}`, {
        method: 'DELETE',
      })
    },
  }
}
