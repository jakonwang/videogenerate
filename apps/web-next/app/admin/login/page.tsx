'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { LoaderCircle, Play, ShieldCheck } from 'lucide-react'

import { AdminThemeToggle } from '@/components/admin/admin-theme'
import { AdminField } from '@/components/admin/admin-ui'
import { Button, Input } from '@/components/admin/controls'
import { adminClient, setAdminToken } from '@/lib/admin-client'

function AdminLoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  const [account, setAccount] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      const result = await adminClient.login({ account, password, client: 'admin' })
      setAdminToken(result.sessionToken)
      const next = params.get('next') || '/admin'
      router.replace(next.startsWith('/admin') && !next.startsWith('/admin/login') ? next : '/admin')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={submit} className="vg-card grid w-full max-w-[380px] gap-4 !p-6 shadow-[var(--theme-shadow-dialog)]">
      <div className="flex items-center gap-3">
        <span className="vg-page-head__icon">
          <ShieldCheck size={20} />
        </span>
        <div className="grid gap-0.5">
          <h1 className="text-[18px] font-extrabold">登录管理后台</h1>
          <p className="vg-muted text-[12px]">仅管理员账号可登录，登录有效期 12 小时</p>
        </div>
      </div>
      <AdminField label="账号">
        <Input value={account} placeholder="手机号或邮箱" onChange={(e) => setAccount(e.target.value)} autoComplete="username" required className="!h-10" />
      </AdminField>
      <AdminField label="密码">
        <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required className="!h-10" />
      </AdminField>
      {error ? <div className="vg-field__error">{error}</div> : null}
      <Button type="submit" size="lg" disabled={submitting} className="w-full">
        {submitting ? <LoaderCircle size={16} className="vg-spin" /> : null} 登录
      </Button>
    </form>
  )
}

export default function AdminLoginPage() {
  return (
    <div className="flex min-h-screen flex-col bg-[var(--theme-root)]">
      <header className="flex h-12 items-center gap-2.5 border-b border-[var(--theme-border)] px-4">
        <span className="admin-brand__mark">
          <Play size={13} fill="currentColor" />
        </span>
        <span className="admin-brand__name">TiktokCut</span>
        <span className="admin-brand__tag">管理后台</span>
        <div className="ml-auto">
          <AdminThemeToggle />
        </div>
      </header>
      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <Suspense>
          <AdminLoginForm />
        </Suspense>
      </div>
    </div>
  )
}
