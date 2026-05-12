'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'

import { useSessionStore } from '@/store/session-store'

export function useAuthGuard() {
  const router = useRouter()
  const pathname = usePathname()
  const ready = useSessionStore((state) => state.ready)
  const token = useSessionStore((state) => state.token)
  const sessionRestoring = !ready
  const redirecting = ready && !token

  useEffect(() => {
    if (ready && !token) {
      const search = typeof window !== 'undefined' ? window.location.search : ''
      const next = search ? `${pathname}${search}` : pathname
      router.replace(`/login?next=${encodeURIComponent(next || '/workspace')}`)
    }
  }, [pathname, ready, router, token])

  return {
    ready,
    authed: Boolean(token),
    sessionRestoring,
    redirecting,
  }
}
