'use client'

import { createCloudClient } from '@shared/cloud/client'

const TOKEN_KEY = 'videogen.admin.token'

export function getCloudApiBaseUrl() {
  return process.env.NEXT_PUBLIC_CLOUD_API_BASE_URL?.trim() || 'http://127.0.0.1:18300'
}

export function getAdminToken() {
  if (typeof window === 'undefined') return ''
  try {
    return window.localStorage.getItem(TOKEN_KEY) || ''
  } catch {
    return ''
  }
}

export function setAdminToken(token: string) {
  if (typeof window === 'undefined') return
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token)
    else window.localStorage.removeItem(TOKEN_KEY)
  } catch {
    // 无痕模式等场景下存储不可用，只影响「记住登录」
  }
}

export const adminClient = createCloudClient({
  getBaseUrl: getCloudApiBaseUrl,
  getToken: getAdminToken,
  onUnauthorized: () => {
    setAdminToken('')
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/admin/login')) {
      window.location.href = `/admin/login?next=${encodeURIComponent(window.location.pathname)}`
    }
  },
})
