'use client'

import type { UserSubscription, WalletAccount, WebUser } from '@shared/web-api/types'
import { create } from 'zustand'

type SessionState = {
  token: string
  user: WebUser | null
  subscription: UserSubscription | null
  wallet: WalletAccount | null
  ready: boolean
  hydrateToken: (token: string) => void
  setSession: (input: {
    token: string
    user: WebUser
    subscription: UserSubscription
    wallet: WalletAccount
  }) => void
  clearSession: () => void
  markReady: () => void
}

export const useSessionStore = create<SessionState>((set) => ({
  token: '',
  user: null,
  subscription: null,
  wallet: null,
  ready: false,
  hydrateToken: (token) =>
    set((state) => ({
      token,
      ready: true,
      user: state.user,
      subscription: state.subscription,
      wallet: state.wallet,
    })),
  setSession: (input) =>
    set({
      token: input.token,
      user: input.user,
      subscription: input.subscription,
      wallet: input.wallet,
      ready: true,
    }),
  clearSession: () =>
    set({
      token: '',
      user: null,
      subscription: null,
      wallet: null,
      ready: true,
    }),
  markReady: () => set({ ready: true }),
}))
