'use client'

import { create } from 'zustand'

import { CloudClientError, createCloudClient } from '@shared/cloud/client'
import type { CloudMeResponse } from '@shared/cloud/types'
import { getCloudApiBaseUrl } from '@/lib/admin-client'

const TOKEN_KEY = 'tiktokcut.user.token'

function readToken() {
  if (typeof window === 'undefined') return ''
  try {
    return window.localStorage.getItem(TOKEN_KEY) || ''
  } catch {
    return ''
  }
}

export function setUserToken(token: string) {
  if (typeof window === 'undefined') return
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token)
    else window.localStorage.removeItem(TOKEN_KEY)
  } catch {
    // 存储不可用时只影响「记住登录」
  }
}

/** 用户端（官网 / 用户中心）使用的云端客户端，与管理后台的登录态分开 */
export const userClient = createCloudClient({
  getBaseUrl: getCloudApiBaseUrl,
  getToken: readToken,
})

type CloudUserState = {
  me: CloudMeResponse | null
  status: 'idle' | 'loading' | 'ready' | 'anonymous'
  load: (force?: boolean) => Promise<CloudMeResponse | null>
  setMe: (me: CloudMeResponse | null) => void
  logout: () => Promise<void>
}

export const useCloudUser = create<CloudUserState>((set, get) => ({
  me: null,
  status: 'idle',
  async load(force = false) {
    if (!force && (get().status === 'ready' || get().status === 'anonymous')) return get().me
    if (!readToken()) {
      set({ me: null, status: 'anonymous' })
      return null
    }
    set({ status: get().me ? 'ready' : 'loading' })
    try {
      const me = await userClient.me()
      set({ me, status: 'ready' })
      return me
    } catch (error) {
      if (error instanceof CloudClientError && (error.status === 401 || error.status === 403)) setUserToken('')
      set({ me: null, status: 'anonymous' })
      return null
    }
  },
  setMe(me) {
    set({ me, status: me ? 'ready' : 'anonymous' })
  },
  async logout() {
    try {
      await userClient.logout()
    } catch {
      // 会话已失效也照样退出
    }
    setUserToken('')
    set({ me: null, status: 'anonymous' })
  },
}))

export const PERMANENT_AT = 253402214400000

export function formatDate(ms: number | null | undefined, withTime = false) {
  if (!ms) return '—'
  if (ms >= PERMANENT_AT) return '永久'
  return new Date(ms).toLocaleString('zh-CN', withTime ? { hour12: false } : { year: 'numeric', month: '2-digit', day: '2-digit' })
}

export function formatYuan(fen: number) {
  const yuan = fen / 100
  return Number.isInteger(yuan) ? `¥${yuan}` : `¥${yuan.toFixed(2)}`
}
