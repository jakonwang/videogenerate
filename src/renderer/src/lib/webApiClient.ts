import { createWebApiClient } from '../../../shared/web-api/client'
export type {
  BatchSubtitleCaptionStyle,
  BatchSubtitleExportEngine,
  BatchSubtitleFontOption,
  BatchSubtitleJob,
  BatchSubtitleLayoutPolicy,
  BatchSubtitleMode,
  BatchSubtitleOutputItem,
  BatchSubtitleOverlayImageConfig,
  BatchSubtitleSourceEngine,
  BatchSubtitleSourceItem,
  BatchSubtitleStyleConfig,
  BatchSubtitleTitleConfig,
  BatchSubtitleTitleItem,
  BatchSubtitleTitleRenderMode,
  BatchSubtitleTrack,
  BatchSubtitleCue,
  BatchSubtitlePreviewResult,
  BatchSubtitleTitleAnalysisItem,
  BatchSubtitleTitleStyleMode,
  BatchSubtitleViralTitleConfig,
  BillingOrder,
  CloneProjectSummary,
  CloneRuntimeResponse,
  GeelarkClonePublishCandidate,
  GeelarkCloudPhoneSummary,
  GeelarkMusicPreset,
  GeelarkPluginConfigPayload,
  GeelarkPluginConfigSummary,
  GeelarkPublishAccount,
  GeelarkPublishTaskDetail,
  GeelarkPublishTaskSummary,
  PluginConfigField,
  PluginDetail,
  PluginSummary,
  SubscriptionPlan,
  UserSubscription,
  WalletAccount,
  WalletTransaction,
  WebUser,
} from '../../../shared/web-api/types'

const WEB_TOKEN_STORAGE_KEY = 'videogen-web-token'

let baseUrlCache = ''

async function resolveBaseUrl() {
  if (baseUrlCache) return baseUrlCache
  let baseUrl = ''
  try {
    const info = await window.api.getWebApiInfo()
    baseUrl = String(info?.baseUrl || '').trim()
  } catch {
    baseUrl = 'http://127.0.0.1:18080'
  }
  if (!baseUrl) throw new Error('本地 Web API 服务尚未启动')
  baseUrlCache = baseUrl
  return baseUrl
}

export function getStoredWebToken() {
  return localStorage.getItem(WEB_TOKEN_STORAGE_KEY)?.trim() || ''
}

export function hasStoredWebToken() {
  return Boolean(getStoredWebToken())
}

export function setStoredWebToken(token: string) {
  const value = String(token || '').trim()
  if (!value) {
    localStorage.removeItem(WEB_TOKEN_STORAGE_KEY)
    return
  }
  localStorage.setItem(WEB_TOKEN_STORAGE_KEY, value)
}

export function clearStoredWebToken() {
  localStorage.removeItem(WEB_TOKEN_STORAGE_KEY)
}

export async function validateStoredWebSession() {
  const token = getStoredWebToken()
  if (!token) return false
  try {
    await webApiClient.getProfile()
    return true
  } catch {
    clearStoredWebToken()
    return false
  }
}

export const webApiClient = createWebApiClient({
  getBaseUrl: resolveBaseUrl,
  getToken: getStoredWebToken,
  onUnauthorized: clearStoredWebToken,
})
