'use client'

import { LoaderCircle, LockKeyhole } from 'lucide-react'

export function AuthRedirectScreen({
  title = '正在进入登录页',
  description = '当前页面需要先登录工作台，系统正在恢复会话或跳转到登录页。',
}: {
  title?: string
  description?: string
}) {
  return (
    <main className="grid min-h-screen place-items-center bg-[var(--theme-app-bg)] px-6">
      <div className="panel grid w-full max-w-[520px] gap-5 px-8 py-8 text-center">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-[20px] bg-[rgba(109,93,255,0.14)] text-violet-300 shadow-[0_16px_40px_rgba(109,93,255,0.22)]">
          <LockKeyhole className="h-7 w-7" />
        </div>
        <div className="grid gap-2">
          <h1 className="page-title">{title}</h1>
          <p className="body-copy">{description}</p>
        </div>
        <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-[var(--border-base)] bg-[rgba(255,255,255,0.04)] px-4 py-2 text-sm text-[var(--text-secondary)]">
          <LoaderCircle className="h-4 w-4 animate-spin" />
          请稍候...
        </div>
      </div>
    </main>
  )
}
