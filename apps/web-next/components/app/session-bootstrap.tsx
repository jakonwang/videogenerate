'use client'

import { useEffect } from 'react'

import { apiClient, getSessionToken, setSessionToken } from '@/lib/api-client'
import { useSessionStore } from '@/store/session-store'

export function SessionBootstrap() {
  const setSession = useSessionStore((state) => state.setSession)
  const clearSession = useSessionStore((state) => state.clearSession)
  const markReady = useSessionStore((state) => state.markReady)

  useEffect(() => {
    const token = getSessionToken()
    if (!token) {
      clearSession()
      return
    }

    apiClient
      .getProfile()
      .then((result) => {
        setSession({
          token,
          user: result.user,
          subscription: result.subscription,
          wallet: result.wallet,
        })
      })
      .catch(() => {
        setSessionToken('')
        clearSession()
      })
      .finally(() => {
        markReady()
      })
  }, [clearSession, markReady, setSession])

  return null
}
