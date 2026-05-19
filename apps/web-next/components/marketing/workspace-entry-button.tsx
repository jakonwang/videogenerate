'use client'

import { LogIn } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { startTransition } from 'react'

import { getSessionToken } from '@/lib/api-client'

export function WorkspaceEntryButton({
  className,
  label = '进入工作台',
}: {
  className?: string
  label?: string
}) {
  const router = useRouter()

  const handleClick = () => {
    const token = getSessionToken()
    startTransition(() => {
      router.push(token ? '/workspace' : '/login?next=%2Fworkspace')
    })
  }

  return (
    <button type="button" onClick={handleClick} className={className}>
      <LogIn className="h-4 w-4" />
      {label}
    </button>
  )
}
