'use client'

import { useState } from 'react'
import { LoaderCircle } from 'lucide-react'

import { AccountCard, AccountPageTitle, Notice } from '@/components/account-center/account-shell'
import { formatDate, useCloudUser, userClient } from '@/lib/cloud-user'

const inputClass =
  'h-11 rounded-xl border border-[var(--border-base)] bg-[var(--bg-input)] px-4 text-[15px] text-[var(--text-main)] outline-none focus:border-[var(--primary-border)] focus:shadow-[0_0_0_3px_var(--primary-soft)]'

export default function SecurityPage() {
  const { me } = useCloudUser()
  const [form, setForm] = useState({ old: '', next: '', confirm: '' })
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setMessage(null)
    if (form.next !== form.confirm) {
      setMessage({ tone: 'danger', text: '两次输入的新密码不一致' })
      return
    }
    setBusy(true)
    try {
      await userClient.changePassword(form.old, form.next)
      setForm({ old: '', next: '', confirm: '' })
      setMessage({ tone: 'success', text: '密码已修改，其它电脑和浏览器上的登录已全部退出。' })
    } catch (err) {
      setMessage({ tone: 'danger', text: (err as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid max-w-[640px] gap-5">
      <AccountPageTitle title="账号安全" />
      <AccountCard title="账号信息">
        <dl className="grid gap-3 text-sm sm:grid-cols-[120px_1fr]">
          <dt className="text-[var(--text-muted)]">登录账号</dt>
          <dd>{me?.user.account}</dd>
          <dt className="text-[var(--text-muted)]">注册时间</dt>
          <dd>{formatDate(me?.user.createdAt, true)}</dd>
          <dt className="text-[var(--text-muted)]">最近登录</dt>
          <dd>{formatDate(me?.user.lastLoginAt, true)}</dd>
        </dl>
      </AccountCard>
      <AccountCard title="修改密码">
        {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
        <form onSubmit={submit} className="grid gap-4">
          <label className="grid gap-2 text-sm font-medium">
            当前密码
            <input className={inputClass} type="password" value={form.old} onChange={(e) => setForm({ ...form, old: e.target.value })} autoComplete="current-password" required />
          </label>
          <label className="grid gap-2 text-sm font-medium">
            新密码
            <input className={inputClass} type="password" minLength={8} value={form.next} onChange={(e) => setForm({ ...form, next: e.target.value })} autoComplete="new-password" required />
            <span className="text-xs font-normal text-[var(--text-muted)]">至少 8 位</span>
          </label>
          <label className="grid gap-2 text-sm font-medium">
            确认新密码
            <input className={inputClass} type="password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} autoComplete="new-password" required />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="inline-flex h-11 w-fit items-center gap-2 rounded-xl bg-[var(--primary)] px-6 text-sm font-semibold text-white transition hover:bg-[var(--primary-hover)] disabled:opacity-50"
          >
            {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null} 保存新密码
          </button>
        </form>
      </AccountCard>
    </div>
  )
}
