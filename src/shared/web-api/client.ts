import type {
  BatchSubtitleCaptionStyle,
  BatchSubtitleExportEngine,
  BatchSubtitleFontOption,
  BatchSubtitleJob,
  BatchSubtitleLayoutPolicy,
  BatchSubtitleMode,
  BatchSubtitleOutputItem,
  BatchSubtitleOverlayImageConfig,
  BatchSubtitlePreviewResult,
  BatchSubtitleTitleAnalysisItem,
  BatchSubtitleSourceEngine,
  BatchSubtitleTrack,
  BatchSubtitleSourceItem,
  BatchSubtitleStyleConfig,
  BatchSubtitleTitleItem,
  BatchSubtitleTitleConfig,
  BatchSubtitleTitleRenderMode,
  BatchSubtitleTitleStyleMode,
  BatchSubtitleViralTitleConfig,
  BillingOrder,
  GeelarkCloudPhoneSummary,
  GeelarkClonePublishCandidate,
  GeelarkMusicPreset,
  GeelarkPluginConfigPayload,
  GeelarkPluginConfigSummary,
  GeelarkPublishAccount,
  GeelarkPublishTaskDetail,
  GeelarkPublishTaskSummary,
  PluginConfigPayload,
  PluginDetail,
  PluginSummary,
  ProductImageMaterialBatch,
  ProductImageMaterialCategory,
  ProductImageMaterialItem,
  ProductImageMaterialProductSummary,
  CloneModelIdentityCreateInput,
  CloneModelCredentialsPayload,
  CloneModelIdentitySummary,
  CloneProjectSummary,
  CloneRunMode,
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
    async sendLoginCode(input: { phone: string; channel?: 'sms' }) {
      return await request<{
        ok: true
        message: string
        provider: 'mock' | 'console'
        devCode?: string
        expiresInSec: number
      }>('/auth/send-code', {
        method: 'POST',
        body: JSON.stringify(input),
      })
    },

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
      paymentChannel?: 'wechat_native' | 'alipay_native'
      credits?: number
    }) {
      return await request<{
        order: {
          id: string
          amountCny: number
          status: string
          type: 'subscription' | 'compute_pack'
        }
        payment: {
          provider: 'wechat_native' | 'alipay_native'
          payUrl: string
          qrText: string
          reference: string
        }
      }>('/billing/orders', {
        method: 'POST',
        body: JSON.stringify(input),
      })
    },

    async confirmOrderPayment(orderId: string, input: { paymentReference?: string }) {
      return await request(`/payments/notify/${encodeURIComponent(orderId)}`, {
        method: 'POST',
        body: JSON.stringify(input),
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

    async listPlugins() {
      const result = await request<{ plugins: PluginSummary[] }>('/plugins', {
        method: 'GET',
      })
      return result.plugins || []
    },

    async listInstalledPlugins() {
      const result = await request<{ plugins: PluginSummary[] }>('/plugins/installed', {
        method: 'GET',
      })
      return result.plugins || []
    },

    async getPlugin(pluginId: string) {
      const result = await request<{ plugin: PluginDetail }>(`/plugins/${encodeURIComponent(pluginId)}`, {
        method: 'GET',
      })
      return result.plugin
    },

    async installPlugin(pluginId: string) {
      return await request<{ plugin: PluginDetail }>(`/plugins/${encodeURIComponent(pluginId)}/install`, {
        method: 'POST',
      })
    },

    async uninstallPlugin(pluginId: string) {
      return await request<{ plugin: PluginDetail }>(`/plugins/${encodeURIComponent(pluginId)}/uninstall`, {
        method: 'POST',
      })
    },

    async enablePlugin(pluginId: string) {
      return await request<{ plugin: PluginDetail }>(`/plugins/${encodeURIComponent(pluginId)}/enable`, {
        method: 'POST',
      })
    },

    async disablePlugin(pluginId: string) {
      return await request<{ plugin: PluginDetail }>(`/plugins/${encodeURIComponent(pluginId)}/disable`, {
        method: 'POST',
      })
    },

    async setPluginConfig(pluginId: string, input: PluginConfigPayload) {
      return await request<{ plugin: PluginDetail }>(`/plugins/${encodeURIComponent(pluginId)}/config`, {
        method: 'POST',
        body: JSON.stringify(input),
      })
    },

    async listProductImageMaterialCategories() {
      const result = await request<{ items: ProductImageMaterialCategory[] }>('/plugins/product-image-materials/categories', {
        method: 'GET',
      })
      return result.items || []
    },

    async listProductImageMaterialProducts() {
      const result = await request<{ items: ProductImageMaterialProductSummary[] }>('/plugins/product-image-materials/products', {
        method: 'GET',
      })
      return result.items || []
    },

    async createProductImageMaterialBatch(input: {
      category: ProductImageMaterialCategory
      sourceVideoPaths: string[]
      segmentTimeSec?: number
    }) {
      const result = await request<{ item: ProductImageMaterialBatch }>('/plugins/product-image-materials/batches', {
        method: 'POST',
        body: JSON.stringify(input),
      })
      return result.item
    },

    async listProductImageMaterialBatches() {
      const result = await request<{ items: ProductImageMaterialBatch[] }>('/plugins/product-image-materials/batches', {
        method: 'GET',
      })
      return result.items || []
    },

    async retryProductImageMaterialBatch(batchId: string) {
      const result = await request<{ item: ProductImageMaterialBatch }>(
        `/plugins/product-image-materials/batches/${encodeURIComponent(batchId)}/retry`,
        {
          method: 'POST',
        },
      )
      return result.item
    },

    async listProductImageMaterials(filters?: {
      category?: ProductImageMaterialCategory | 'all'
      usageStatus?: 'unused' | 'used' | 'all'
      boundProductId?: string
    }) {
      const params = new URLSearchParams()
      if (filters?.category) params.set('category', filters.category)
      if (filters?.usageStatus) params.set('usageStatus', filters.usageStatus)
      if (filters?.boundProductId) params.set('boundProductId', filters.boundProductId)
      const query = params.toString()
      const result = await request<{ items: ProductImageMaterialItem[] }>(
        `/plugins/product-image-materials/materials${query ? `?${query}` : ''}`,
        { method: 'GET' },
      )
      return result.items || []
    },

    async createProductImageMaterialBackgroundVariants(input: {
      materialIds: string[]
      variantCount: number
    }) {
      const result = await request<{ ok: true; count: number; created: ProductImageMaterialItem[]; failedCount: number; errors: string[] }>(
        '/plugins/product-image-materials/background-variants',
        {
          method: 'POST',
          body: JSON.stringify(input),
        },
      )
      return result
    },

    async updateProductImageMaterialStatus(materialId: string, usageStatus: 'unused' | 'used') {
      const result = await request<{ item: ProductImageMaterialItem }>(
        `/plugins/product-image-materials/materials/${encodeURIComponent(materialId)}/status`,
        {
          method: 'POST',
          body: JSON.stringify({ usageStatus }),
        },
      )
      return result.item
    },

    async bindProductImageMaterial(materialId: string, productId?: string) {
      const result = await request<{ item: ProductImageMaterialItem }>(
        `/plugins/product-image-materials/materials/${encodeURIComponent(materialId)}/bind-product`,
        {
          method: 'POST',
          body: JSON.stringify({ productId }),
        },
      )
      return result.item
    },

    async getGeelarkPluginConfig() {
      const result = await request<{ config: GeelarkPluginConfigSummary }>('/plugins/geelark-publisher/config', {
        method: 'GET',
      })
      return result.config
    },

    async saveGeelarkPluginConfig(input: GeelarkPluginConfigPayload) {
      const result = await request<{ config: GeelarkPluginConfigSummary }>('/plugins/geelark-publisher/config', {
        method: 'POST',
        body: JSON.stringify(input),
      })
      return result.config
    },

    async listGeelarkCloudPhones() {
      const result = await request<{ items: GeelarkCloudPhoneSummary[] }>('/plugins/geelark-publisher/cloud-phones', {
        method: 'GET',
      })
      return result.items || []
    },

    async listGeelarkPublisherAccounts() {
      const result = await request<{ items: GeelarkPublishAccount[] }>('/plugins/geelark-publisher/accounts', {
        method: 'GET',
      })
      return result.items || []
    },

    async listGeelarkPublishCandidates() {
      const result = await request<{ items: GeelarkClonePublishCandidate[] }>(
        '/plugins/geelark-publisher/publish-candidates',
        {
          method: 'GET',
        },
      )
      return result.items || []
    },

    async listGeelarkMusicPresets() {
      const result = await request<{ items: GeelarkMusicPreset[] }>('/plugins/geelark-publisher/music-presets', {
        method: 'GET',
      })
      return result.items || []
    },

    async saveGeelarkMusicPreset(input: { id?: string; label: string; refVideoId: string; remark?: string }) {
      const result = await request<{ item: GeelarkMusicPreset }>('/plugins/geelark-publisher/music-presets', {
        method: 'POST',
        body: JSON.stringify(input),
      })
      return result.item
    },

    async deleteGeelarkMusicPreset(id: string) {
      return await request<{ ok: true }>(`/plugins/geelark-publisher/music-presets/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      })
    },

    async generateGeelarkPublishTitle(input: {
      cloneProjectId: string
      contentLanguage?: string
      productTitle?: string
      productId?: string
      productReferenceImagePaths?: string[]
    }) {
      return await request<{
        candidates: string[]
        content: string
        provider: string
        model: string
      }>('/plugins/geelark-publisher/publish-title', {
        method: 'POST',
        body: JSON.stringify(input),
      })
    },

    async createGeelarkPublisherAccount(input: Omit<GeelarkPublishAccount, 'id' | 'createdAt' | 'updatedAt'>) {
      const result = await request<{ item: GeelarkPublishAccount }>('/plugins/geelark-publisher/accounts', {
        method: 'POST',
        body: JSON.stringify(input),
      })
      return result.item
    },

    async updateGeelarkPublisherAccount(
      id: string,
      input: Partial<Omit<GeelarkPublishAccount, 'id' | 'createdAt' | 'updatedAt'>>,
    ) {
      const result = await request<{ item: GeelarkPublishAccount }>(
        `/plugins/geelark-publisher/accounts/${encodeURIComponent(id)}`,
        {
          method: 'POST',
          body: JSON.stringify(input),
        },
      )
      return result.item
    },

    async deleteGeelarkPublisherAccount(id: string) {
      return await request<{ ok: true }>(`/plugins/geelark-publisher/accounts/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      })
    },

    async publishGeelarkVideo(input: {
      cloneProjectId?: string
      videoPath: string
      publishAccountId: string
      videoDesc?: string
      productId?: string
      productTitle?: string
      refVideoId?: string
      sameVideoVolume?: number
      sourceVideoVolume?: number
      markAI?: boolean
      musicMode?: 'library_ref' | 'manual_ref' | 'volume_only'
      musicLabel?: string
      scheduleAt?: number
      needShareLink?: boolean
    }) {
      const result = await request<{ item: GeelarkPublishTaskDetail }>('/plugins/geelark-publisher/publish', {
        method: 'POST',
        body: JSON.stringify(input),
      })
      return result.item
    },

    async listGeelarkPublishTasks() {
      const result = await request<{ items: GeelarkPublishTaskSummary[] }>('/plugins/geelark-publisher/tasks', {
        method: 'GET',
      })
      return result.items || []
    },

    async getGeelarkPublishTask(id: string) {
      const result = await request<{ item: GeelarkPublishTaskDetail }>(
        `/plugins/geelark-publisher/tasks/${encodeURIComponent(id)}`,
        { method: 'GET' },
      )
      return result.item
    },

    async syncGeelarkPublishTask(id: string) {
      const result = await request<{ item: GeelarkPublishTaskDetail }>(
        `/plugins/geelark-publisher/tasks/${encodeURIComponent(id)}/sync`,
        { method: 'POST' },
      )
      return result.item
    },

    async listBatchSubtitleJobs() {
      const result = await request<{ items: BatchSubtitleJob[] }>('/plugins/video-batch-subtitle/jobs', {
        method: 'GET',
      })
      return result.items || []
    },

    async createBatchSubtitleJob(input: {
      name: string
      sourceItems: BatchSubtitleSourceItem[]
      subtitleMode?: BatchSubtitleMode
      subtitleSource?: BatchSubtitleSourceEngine
      exportEngine?: BatchSubtitleExportEngine
      titleRenderMode?: BatchSubtitleTitleRenderMode
      titleConfig?: Partial<BatchSubtitleTitleConfig>
      titleItems?: BatchSubtitleTitleItem[]
      titleStyleMode?: BatchSubtitleTitleStyleMode
      viralTitleConfig?: BatchSubtitleViralTitleConfig
      titleAnalysisItems?: BatchSubtitleTitleAnalysisItem[]
      overlayImageConfig?: Partial<BatchSubtitleOverlayImageConfig>
      styleConfig?: Partial<BatchSubtitleStyleConfig>
      captionStyle?: Partial<BatchSubtitleCaptionStyle>
      layoutPolicy?: Partial<BatchSubtitleLayoutPolicy>
    }) {
      const result = await request<{ item: BatchSubtitleJob }>('/plugins/video-batch-subtitle/jobs', {
        method: 'POST',
        body: JSON.stringify(input),
      })
      return result.item
    },

    async updateBatchSubtitleDraft(
      jobId: string,
      input: Partial<{
        name: string
        sourceItems: BatchSubtitleSourceItem[]
        subtitleMode: BatchSubtitleMode
        subtitleSource: BatchSubtitleSourceEngine
        exportEngine: BatchSubtitleExportEngine
        titleRenderMode: BatchSubtitleTitleRenderMode
        titleConfig: Partial<BatchSubtitleTitleConfig>
        titleItems: BatchSubtitleTitleItem[]
        titleStyleMode: BatchSubtitleTitleStyleMode
        viralTitleConfig: BatchSubtitleViralTitleConfig
        titleAnalysisItems: BatchSubtitleTitleAnalysisItem[]
        overlayImageConfig: Partial<BatchSubtitleOverlayImageConfig>
        styleConfig: Partial<BatchSubtitleStyleConfig>
        captionStyle: Partial<BatchSubtitleCaptionStyle>
        layoutPolicy: Partial<BatchSubtitleLayoutPolicy>
        subtitleTracks: BatchSubtitleTrack[]
        capcutDraft: BatchSubtitleJob['capcutDraft']
      }>,
    ) {
      const result = await request<{ item: BatchSubtitleJob }>(
        `/plugins/video-batch-subtitle/jobs/${encodeURIComponent(jobId)}`,
        {
          method: 'POST',
          body: JSON.stringify(input),
        },
      )
      return result.item
    },

    async runBatchSubtitleJob(jobId: string) {
      const result = await request<{ item: BatchSubtitleJob }>(
        `/plugins/video-batch-subtitle/jobs/${encodeURIComponent(jobId)}/run`,
        {
          method: 'POST',
        },
      )
      return result.item
    },

    async pauseBatchSubtitleJob(jobId: string) {
      const result = await request<{ item: BatchSubtitleJob }>(
        `/plugins/video-batch-subtitle/jobs/${encodeURIComponent(jobId)}/pause`,
        {
          method: 'POST',
        },
      )
      return result.item
    },

    async resumeBatchSubtitleJob(jobId: string, input?: { retryFailedOnly?: boolean }) {
      const result = await request<{ item: BatchSubtitleJob }>(
        `/plugins/video-batch-subtitle/jobs/${encodeURIComponent(jobId)}/resume`,
        {
          method: 'POST',
          body: JSON.stringify(input || {}),
        },
      )
      return result.item
    },

    async transcribeBatchSubtitleJob(jobId: string, input?: { sourceItemId?: string }) {
      const result = await request<{ item: BatchSubtitleJob }>(
        `/plugins/video-batch-subtitle/jobs/${encodeURIComponent(jobId)}/asr`,
        {
          method: 'POST',
          body: JSON.stringify(input || {}),
        },
      )
      return result.item
    },

    async exportBatchSubtitleJobWithCapcut(jobId: string) {
      const result = await request<{ item: BatchSubtitleJob }>(
        `/plugins/video-batch-subtitle/jobs/${encodeURIComponent(jobId)}/export-capcut`,
        {
          method: 'POST',
        },
      )
      return result.item
    },

    async listBatchSubtitleOutputs() {
      const result = await request<{ items: BatchSubtitleOutputItem[] }>('/plugins/video-batch-subtitle/outputs', {
        method: 'GET',
      })
      return result.items || []
    },

    async previewBatchSubtitleFrame(input: {
      sourceItem: BatchSubtitleSourceItem
      titleConfig: BatchSubtitleTitleConfig
      titleItems?: BatchSubtitleTitleItem[]
      titleRenderMode?: BatchSubtitleTitleRenderMode
      overlayImageConfig?: BatchSubtitleOverlayImageConfig
      styleConfig: BatchSubtitleStyleConfig
      subtitleMode?: BatchSubtitleMode
      captionStyle?: BatchSubtitleCaptionStyle
      layoutPolicy?: BatchSubtitleLayoutPolicy
      subtitleTrack?: BatchSubtitleTrack
      previewAtSec?: number
      includeVideo?: boolean
    }) {
      const result = await request<{ item: BatchSubtitlePreviewResult }>('/plugins/video-batch-subtitle/preview-frame', {
        method: 'POST',
        body: JSON.stringify(input),
      })
      return result.item
    },

    async reflowBatchSubtitleJob(jobId: string, input?: { sourceItemId?: string }) {
      const result = await request<{ item: BatchSubtitleJob }>(
        `/plugins/video-batch-subtitle/jobs/${encodeURIComponent(jobId)}/reflow`,
        {
          method: 'POST',
          body: JSON.stringify(input || {}),
        },
      )
      return result.item
    },

    async pushBatchSubtitleOutputsToGeelarkPool(jobId: string) {
      const result = await request<{ item: BatchSubtitleJob }>(
        `/plugins/video-batch-subtitle/jobs/${encodeURIComponent(jobId)}/push-to-geelark`,
        {
          method: 'POST',
        },
      )
      return result.item
    },

    async generateBatchSubtitleTitles(input: { prompt: string; count?: number; contentLanguage?: string }) {
      return await request<{
        titles: string[]
        content: string
        provider: string
        model: string
      }>('/plugins/video-batch-subtitle/generate-titles', {
        method: 'POST',
        body: JSON.stringify(input),
      })
    },

    async generateBatchSubtitleViralTitles(input: {
      jobId?: string
      sourceItems: BatchSubtitleSourceItem[]
      language?: 'vi' | 'en' | 'zh'
      tone?: 'hook' | 'conversion' | 'emotional'
      sellingPoints?: string
      symbolIntensity?: 'low' | 'medium' | 'high'
    }) {
      return await request<{
        titleItems: BatchSubtitleTitleItem[]
        analysisItems: BatchSubtitleTitleAnalysisItem[]
        titleStyleMode: BatchSubtitleTitleStyleMode
        content: string
        provider: string
        model: string
      }>('/plugins/video-batch-subtitle/generate-viral-titles', {
        method: 'POST',
        body: JSON.stringify(input),
      })
    },

    async listCloneModelIdentities() {
      const result = await request<{ items: CloneModelIdentitySummary[] }>('/clone/model-identities', {
        method: 'GET',
      })
      return result.items || []
    },

    async createCloneModelIdentity(input: CloneModelIdentityCreateInput) {
      return await request<{
        project?: { id: string; selectedModelIdentityId?: string }
        model?: CloneModelIdentitySummary
      }>('/clone/model-identities', {
        method: 'POST',
        body: JSON.stringify(input),
      })
    },

    async getCloneModelCredentials() {
      const result = await request<{ credentials: CloneModelCredentialsPayload }>('/clone/model-credentials', {
        method: 'GET',
      })
      return result.credentials
    },

    async setCloneModelCredentials(input: CloneModelCredentialsPayload) {
      return await request<{ ok: true; credentials: CloneModelCredentialsPayload }>('/clone/model-credentials', {
        method: 'POST',
        body: JSON.stringify(input),
      })
    },

    async createCloneProject(input?: {
      title?: string
      description?: string
      locale?: 'zh-CN' | 'vi-VN'
      runMode?: CloneRunMode
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

    async updateCloneProjectMeta(projectId: string, input: { title?: string; description?: string }) {
      return await request<{ project?: any; summary?: CloneProjectSummary }>(`/clone/projects/${encodeURIComponent(projectId)}`, {
        method: 'POST',
        body: JSON.stringify(input),
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

    async bindCloneProjectProduct(projectId: string, input: { productId: string }) {
      return await request<{ project?: any }>(`/clone/projects/${encodeURIComponent(projectId)}/bind-product`, {
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
      input: { productReferenceImagePaths?: string[]; selectedModelIdentityId?: string; shotIds?: string[]; onlyMissing?: boolean },
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

    async getCloneShotConsistencyReport(projectId: string, shotId: string) {
      return await request<any>(
        `/clone/projects/${encodeURIComponent(projectId)}/shot-videos/${encodeURIComponent(shotId)}/consistency`,
      )
    },

    async getCloneShotImagePromptPreview(projectId: string, shotId: string) {
      return await request<any>(
        `/clone/projects/${encodeURIComponent(projectId)}/shot-videos/${encodeURIComponent(shotId)}/image-prompt-preview`,
      )
    },

    async recompileCloneShotConsistency(projectId: string, shotId: string) {
      return await request<any>(
        `/clone/projects/${encodeURIComponent(projectId)}/shot-videos/${encodeURIComponent(shotId)}/consistency/recompile`,
        {
          method: 'POST',
        },
      )
    },

    async listCloneShotConsistencyAnchors(projectId: string, shotId: string) {
      return await request<any>(
        `/clone/projects/${encodeURIComponent(projectId)}/shot-videos/${encodeURIComponent(shotId)}/consistency/anchors`,
      )
    },

    async listCloneShotConsistencyPatches(projectId: string, shotId: string) {
      return await request<any>(
        `/clone/projects/${encodeURIComponent(projectId)}/shot-videos/${encodeURIComponent(shotId)}/consistency/patches`,
      )
    },

    async getCloneShotConsistencyAnchors(projectId: string, shotId: string) {
      return await this.listCloneShotConsistencyAnchors(projectId, shotId)
    },

    async getCloneShotConsistencyPatches(projectId: string, shotId: string) {
      return await this.listCloneShotConsistencyPatches(projectId, shotId)
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
