import { computed, reactive } from 'vue'
import { refreshAccount, session } from '@/lib/session'

/**
 * 网页版替身：电脑端「账号与会员」页用的 `useCloudAuthStore()`，状态来自网页的登录会话。
 * 字段和电脑端 CloudLicenseStatus 一致（网页没有离线令牌，tokenExpiresAt 为空）。
 */

export type WebLicenseStatus = ReturnType<typeof statusFromSession>

export function statusFromSession() {
  const e = session.entitlement
  const loggedIn = Boolean(session.token && session.user)
  return {
    mode: 'enforced' as const,
    licensed: Boolean(e?.active),
    loggedIn,
    reason: !loggedIn ? ('not_logged_in' as const) : e?.active ? ('ok' as const) : ('no_entitlement' as const),
    account: session.user?.account ?? null,
    displayName: session.user?.displayName ?? null,
    role: session.user?.role ?? null,
    unlimited: Boolean(e?.unlimited),
    planName: e?.planName ?? null,
    planExpiresAt: e?.expiresAt ?? null,
    tokenExpiresAt: null as number | null,
    features: e?.features ?? [],
    offline: Boolean(session.offlineReason),
    cloudApiBase: session.baseUrl,
    machineId: session.deviceId,
    managedSettings: true,
    announcement: '',
    supportContact: '',
    updateRequired: false,
    minVersion: '',
    disabledFeatures: [],
  }
}

const store = reactive({
  status: computed(() => statusFromSession()),
  async refresh() {
    await refreshAccount()
    return statusFromSession()
  },
  /** 网页的状态总是从会话读，这里只需要触发一次刷新 */
  setStatus(_next?: unknown) {
    void refreshAccount()
  },
  async ensure() {
    return statusFromSession()
  },
})

export function useCloudAuthStore() {
  return store
}
