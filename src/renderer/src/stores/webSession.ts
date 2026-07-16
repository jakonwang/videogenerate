import { defineStore } from 'pinia'
import {
  clearStoredWebToken,
  getStoredWebToken,
  setStoredWebToken,
  type SubscriptionPlan,
  type UserSubscription,
  type WalletAccount,
  type WebUser,
  webApiClient,
} from '@/lib/webApiClient'

type WebSessionState = {
  token: string
  user: WebUser | null
  subscription: UserSubscription | null
  wallet: WalletAccount | null
  plans: SubscriptionPlan[]
  restoring: boolean
  loading: boolean
  error: string
}

export const useWebSessionStore = defineStore('webSession', {
  state: (): WebSessionState => ({
    token: getStoredWebToken(),
    user: null,
    subscription: null,
    wallet: null,
    plans: [],
    restoring: false,
    loading: false,
    error: '',
  }),
  getters: {
    isLoggedIn: (state) => Boolean(state.user),
    displayName: (state) => state.user?.displayName || state.user?.phone || '访客',
  },
  actions: {
    applySession(payload: {
      token: string
      user: WebUser
      subscription: UserSubscription
      wallet: WalletAccount
    }) {
      this.token = String(payload.token || '').trim()
      this.user = payload.user
      this.subscription = payload.subscription
      this.wallet = payload.wallet
      this.error = ''
      if (this.token) {
        setStoredWebToken(this.token)
      } else {
        clearStoredWebToken()
      }
    },

    clearSession() {
      this.token = ''
      this.user = null
      this.subscription = null
      this.wallet = null
      this.error = ''
      clearStoredWebToken()
    },

    async restoreSession() {
      this.restoring = true
      try {
        const profile = await webApiClient.getProfile()
        this.applySession({
          token: getStoredWebToken(),
          user: profile.user,
          subscription: profile.subscription,
          wallet: profile.wallet,
        })
        return true
      } catch (error: any) {
        this.error = error?.message ?? String(error)
        this.clearSession()
        return false
      } finally {
        this.restoring = false
      }
    },

    async login(input: { phone: string; code: string; displayName?: string }) {
      this.loading = true
      this.error = ''
      try {
        const result = await webApiClient.login(input)
        this.applySession(result)
        return true
      } catch (error: any) {
        this.error = error?.message ?? String(error)
        return false
      } finally {
        this.loading = false
      }
    },

    async logout() {
      this.loading = true
      try {
        if (getStoredWebToken()) {
          await webApiClient.logout().catch(() => undefined)
        }
      } finally {
        this.clearSession()
        this.loading = false
      }
    },

    async refreshProfile() {
      this.loading = true
      try {
        const profile = await webApiClient.getProfile()
        this.applySession({
          token: getStoredWebToken(),
          user: profile.user,
          subscription: profile.subscription,
          wallet: profile.wallet,
        })
        return true
      } catch (error: any) {
        this.error = error?.message ?? String(error)
        return false
      } finally {
        this.loading = false
      }
    },

    async loadPlans() {
      try {
        this.plans = await webApiClient.listPlans()
      } catch (error: any) {
        this.error = error?.message ?? String(error)
      }
    },
  },
})
