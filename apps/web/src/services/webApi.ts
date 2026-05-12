import { createWebApiClient } from '@shared/web-api/client'
export type {
  BillingOrder,
  CloneModelIdentitySummary,
  CloneProjectSummary,
  CloneRuntimeResponse,
  SubscriptionPlan,
  UserSubscription,
  WalletAccount,
  WalletTransaction,
  WebUser,
} from '@shared/web-api/types'

const WEB_TOKEN_STORAGE_KEY = 'videogen-web-token'

declare global {
  interface Window {
    __VIDEOGEN_WEB_API_BASE__?: string
  }
}

export function getStoredWebToken() {
  return window.localStorage.getItem(WEB_TOKEN_STORAGE_KEY)?.trim() || ''
}

export function hasStoredWebToken() {
  return Boolean(getStoredWebToken())
}

export function setStoredWebToken(token: string) {
  const value = String(token || '').trim()
  if (!value) {
    window.localStorage.removeItem(WEB_TOKEN_STORAGE_KEY)
    return
  }
  window.localStorage.setItem(WEB_TOKEN_STORAGE_KEY, value)
}

export function clearStoredWebToken() {
  window.localStorage.removeItem(WEB_TOKEN_STORAGE_KEY)
}

async function resolveBaseUrl() {
  return String(window.__VIDEOGEN_WEB_API_BASE__ || 'http://127.0.0.1:18080').trim()
}

export const webApiClient = createWebApiClient({
  getBaseUrl: resolveBaseUrl,
  getToken: getStoredWebToken,
  onUnauthorized: clearStoredWebToken,
})

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
