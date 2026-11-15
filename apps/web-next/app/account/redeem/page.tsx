'use client'

import { useState } from 'react'
import { LoaderCircle } from 'lucide-react'

import { AccountCard, AccountPageTitle, Notice } from '@/components/account-center/account-shell'
import { formatDate, useCloudUser, userClient } from '@/lib/cloud-user'

export default function RedeemPage() {
  const { load } = useCloudUser()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setMessage(null)
    try {
      const { entitlement } = await userClient.redeem(code)
      setCode('')
      await load(true)
      setMessage({ tone: 'success', text: `兑换成功：${entitlement.planName ?? '会员'}，有效期至 ${entitlement.unlimited ? '长期' : formatDate(entitlement.expiresAt)}` })
    } catch (err) {
      setMessage({ tone: 'danger', text: (err as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="max-w-[640px]">
      <AccountPageTitle title="兑换码" desc="输入从客服或渠道获得的兑换码，立即开通或续期会员。" />
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
      <AccountCard>
        <form onSubmit={submit} className="grid gap-4">
          <label className="grid gap-2 text-sm font-medium">
            兑换码
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="XXXX-XXXX-XXXX-XXXX"
              autoComplete="off"
              spellCheck={false}
              className="h-12 rounded-xl border border-[var(--border-base)] bg-[var(--bg-input)] px-4 font-mono text-[16px] tracking-[0.08em] text-[var(--text-main)] outline-none focus:border-[var(--primary-border)] focus:shadow-[0_0_0_3px_var(--primary-soft)]"
              required
            />
          </label>
          <button
            type="submit"
            disabled={busy || !code.trim()}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[var(--primary)] text-sm font-semibold text-white transition hover:bg-[var(--primary-hover)] disabled:opacity-50"
          >
            {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null} 兑换
          </button>
        </form>
        <p className="mt-4 text-xs text-[var(--text-muted)]">兑换后时长叠加到当前会员上。每个兑换码只能使用一次。</p>
      </AccountCard>
    </div>
  )
}
