import { Preferences } from '@capacitor/preferences'
import { reactive } from 'vue'
import { createCloudClient, CloudClientError } from '@shared/cloud/client'
import type { CloudEntitlement, CloudUser } from '@shared/cloud/types'

/**
 * 登录状态与云端客户端。会话令牌、云端地址、本机设备 id 存在 Preferences（Android SharedPreferences）。
 */

const KEYS = { token: 'session.token', baseUrl: 'cloud.baseUrl', deviceId: 'device.id', user: 'session.user' }
const BUILT_IN_BASE = (import.meta.env.VITE_CLOUD_API_BASE || '').replace(/\/+$/, '')
export const APP_VERSION = '0.1.0'

export const session = reactive({
  ready: false,
  token: '' as string,
  baseUrl: BUILT_IN_BASE,
  deviceId: '',
  user: null as CloudUser | null,
  entitlement: null as CloudEntitlement | null,
  /** 最近一次在线校验失败的原因（离线时仍可用本地数据） */
  offlineReason: '',
})

export const cloud = createCloudClient({
  getBaseUrl: () => session.baseUrl,
  getToken: () => session.token,
  onUnauthorized: () => {
    void signOut(false)
  },
})

async function readPref(key: string) {
  return (await Preferences.get({ key })).value || ''
}

function randomId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

function deviceName() {
  const ua = navigator.userAgent
  const match = /Android [\d.]+; ([^;)]+)/.exec(ua)
  return match ? match[1].replace(/ Build\/.*$/, '').trim() : 'Android'
}

export async function initSession() {
  session.baseUrl = (await readPref(KEYS.baseUrl)) || BUILT_IN_BASE
  session.token = await readPref(KEYS.token)
  session.deviceId = await readPref(KEYS.deviceId)
  if (!session.deviceId) {
    session.deviceId = `mobile-${randomId()}`
    await Preferences.set({ key: KEYS.deviceId, value: session.deviceId })
  }
  const cachedUser = await readPref(KEYS.user)
  if (cachedUser) {
    try {
      session.user = JSON.parse(cachedUser)
    } catch {
      session.user = null
    }
  }
  session.ready = true
  if (session.token) void refreshAccount()
}

export async function setBaseUrl(value: string) {
  session.baseUrl = value.trim().replace(/\/+$/, '')
  await Preferences.set({ key: KEYS.baseUrl, value: session.baseUrl })
}

export async function signIn(account: string, password: string) {
  if (!session.baseUrl) throw new Error('请先设置服务器地址')
  const result = await cloud.login({
    account,
    password,
    client: 'mobile',
    machineId: session.deviceId,
    deviceName: deviceName(),
    platform: 'android',
    appVersion: APP_VERSION,
  })
  session.token = result.sessionToken
  session.user = result.user
  session.entitlement = result.entitlement
  await Preferences.set({ key: KEYS.token, value: result.sessionToken })
  await Preferences.set({ key: KEYS.user, value: JSON.stringify(result.user) })
  // Registers this phone as one of the account's devices (counts towards the plan's device limit).
  await cloud.activateDevice({ machineId: session.deviceId, deviceName: deviceName(), platform: 'android', appVersion: APP_VERSION })
}

export async function refreshAccount() {
  try {
    const me = await cloud.me()
    session.user = me.user
    session.entitlement = me.entitlement
    session.offlineReason = ''
    await Preferences.set({ key: KEYS.user, value: JSON.stringify(me.user) })
  } catch (error) {
    if (error instanceof CloudClientError && error.code === 'NETWORK') session.offlineReason = '网络不可用，正在使用本地数据'
    else if (!(error instanceof CloudClientError && error.status === 401)) session.offlineReason = (error as Error).message
  }
}

export async function signOut(callServer = true) {
  if (callServer && session.token) {
    try {
      await cloud.logout()
    } catch {
      /* 已离线也允许退出 */
    }
  }
  session.token = ''
  session.user = null
  session.entitlement = null
  await Preferences.remove({ key: KEYS.token })
  await Preferences.remove({ key: KEYS.user })
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}
