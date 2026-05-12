'use client'

import { createWebApiClient } from '@shared/web-api/client'
import { readAppSettings } from '@/lib/app-settings'

const TOKEN_KEY = 'videogen.web.token'

export function getApiBaseUrl() {
  if (typeof window !== 'undefined') {
    const localValue = readAppSettings().apiBaseUrl.trim()
    if (localValue) return localValue
  }
  return process.env.NEXT_PUBLIC_WEB_API_BASE_URL?.trim() || 'http://127.0.0.1:18080'
}

export function getSessionToken() {
  if (typeof window === 'undefined') return ''
  return window.localStorage.getItem(TOKEN_KEY) || ''
}

export function setSessionToken(token: string) {
  if (typeof window === 'undefined') return
  if (token.trim()) {
    window.localStorage.setItem(TOKEN_KEY, token)
  } else {
    window.localStorage.removeItem(TOKEN_KEY)
  }
}

export const apiClient = createWebApiClient({
  getBaseUrl: getApiBaseUrl,
  getToken: getSessionToken,
  onUnauthorized: () => {
    if (typeof window !== 'undefined') {
      const currentPath = window.location.pathname || ''
      const isCloneRoute = currentPath === '/clone' || currentPath.startsWith('/clone/')
      if (isCloneRoute) {
        return
      }
      setSessionToken('')
      if (currentPath !== '/login') {
        const next = `${currentPath}${window.location.search || ''}`
        window.location.href = `/login?next=${encodeURIComponent(next || '/workspace')}`
      }
    }
  },
})
