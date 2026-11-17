'use client'

import { useEffect, useState } from 'react'
import { Laptop, Smartphone } from 'lucide-react'

import { AccountCard, AccountPageTitle, Notice } from '@/components/account-center/account-shell'
import { formatDate, useCloudUser, userClient } from '@/lib/cloud-user'

export default function DevicesPage() {
  const { me, load } = useCloudUser()
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)

  useEffect(() => {
    void load(true)
  }, [load])

  if (!me) return null
  const max = me.entitlement.maxDevices
  const maxMobile = me.entitlement.maxMobileDevices ?? 1
  const computers = me.devices.filter((d) => d.kind !== 'mobile')
  const phones = me.devices.filter((d) => d.kind === 'mobile')
  const fallbackName = (kind: string | undefined) => (kind === 'mobile' ? '未命名手机' : '未命名电脑')

  const unbind = async (id: string, name: string) => {
    if (!window.confirm(`解绑「${name}」后，该设备需要重新登录。30 天内自助解绑次数有限，确定解绑？`)) return
    setBusy(id)
    setMessage(null)
    try {
      await userClient.unbindDevice(id)
      await load(true)
      setMessage({ tone: 'success', text: `已解绑「${name}」` })
    } catch (err) {
      setMessage({ tone: 'danger', text: (err as Error).message })
    } finally {
      setBusy('')
    }
  }

  return (
    <div>
      <AccountPageTitle
        title="我的设备"
        desc={`电脑 ${computers.length} / ${max === 0 ? '不限' : max} 台，手机 ${phones.length} / ${maxMobile === 0 ? '不限' : maxMobile} 部。换电脑时先在这里解绑旧电脑；换手机直接在新手机上登录，旧手机会自动退出。`}
      />
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
      <AccountCard>
        {me.devices.length ? (
          <ul className="divide-y divide-[var(--border-base)]">
            {me.devices.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-4 py-4 first:pt-0 last:pb-0">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--bg-panel-soft)] text-[var(--text-secondary)]">
                  {d.kind === 'mobile' ? <Smartphone className="h-5 w-5" /> : <Laptop className="h-5 w-5" />}
                </span>
                <div className="grid min-w-0 flex-1 gap-0.5">
                  <span className="truncate font-medium">{d.name || fallbackName(d.kind)}</span>
                  <span className="text-sm text-[var(--text-muted)]">
                    {d.platform || '—'} · 客户端 {d.appVersion || '—'} · 最近使用 {formatDate(d.lastSeenAt, true)}
                  </span>
                </div>
                <button
                  type="button"
                  disabled={busy === d.id}
                  onClick={() => void unbind(d.id, d.name || fallbackName(d.kind))}
                  className="h-9 rounded-lg border border-[var(--border-base)] px-4 text-sm text-[var(--text-secondary)] transition hover:border-[var(--danger)] hover:text-[var(--danger)] disabled:opacity-50"
                >
                  解绑
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-8 text-center text-sm text-[var(--text-muted)]">还没有设备登录过。下载电脑客户端或手机 App 并登录后会显示在这里。</p>
        )}
      </AccountCard>
    </div>
  )
}
