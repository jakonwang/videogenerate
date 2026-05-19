'use client'

import { useRouter } from 'next/navigation'
import { startTransition, useCallback } from 'react'

export function useAppNavigation() {
  const router = useRouter()

  const navigate = useCallback(
    (href: string) => {
      startTransition(() => {
        router.push(href)
      })
    },
    [router],
  )

  const prefetch = useCallback(
    (href: string) => {
      router.prefetch(href)
    },
    [router],
  )

  const prefetchMany = useCallback(
    (hrefs: Array<string | null | undefined>) => {
      hrefs.forEach((href) => {
        if (!href) return
        router.prefetch(href)
      })
    },
    [router],
  )

  return {
    navigate,
    prefetch,
    prefetchMany,
  }
}
