'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'
import type { LucideIcon } from 'lucide-react'
import { CreditCard, Download, KeyRound, LayoutGrid, LoaderCircle, LogOut, MonitorSmartphone, ReceiptText, ShieldCheck } from 'lucide-react'

import { BrandMark } from '@/components/site/site-shell'
import { ThemeToggle } from '@/components/theme/theme-toggle'
import { useCloudUser } from '@/lib/cloud-user'
import { cn } from '@/lib/utils'

const NAV: ReadonlyArray<{ href: string; label: string; icon: LucideIcon }> = [
  { href: '/account', label: '概览', icon: LayoutGrid },
  { href: '/account/buy', label: '购买续费', icon: CreditCard },
  { href: '/account/redeem', label: '兑换码', icon: KeyRound },
  { href: '/account/devices', label: '我的设备', icon: MonitorSmartphone },
  { href: '/account/orders', label: '订单记录', icon: ReceiptText },
  { href: '/account/security', label: '账号安全', icon: ShieldCheck },
]

export function AccountShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { me, status, load, logout } = useCloudUser()

  useEffect(() => {
    void load().then((result) => {
      if (!result) router.replace(`/login?next=${encodeURIComponent(pathname || '/account')}`)
    })
  }, [load, pathname, router])

  const isActive = (href: string) => (href === '/account' ? pathname === '/account' : pathname?.startsWith(href))

  if (status !== 'ready' || !me) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg-root)] text-[var(--text-muted)]">
        <LoaderCircle className="h-5 w-5 animate-spin" />
      </div>
    )
  }

  const name = me.user.displayName || me.user.account

  return (
    <div className="min-h-screen bg-[var(--bg-root)] text-[var(--text-main)]">
      <header className="sticky top-0 z-30 border-b border-[var(--border-base)] bg-[color-mix(in_srgb,var(--bg-root)_85%,transparent)] backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-[1200px] items-center gap-4 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <BrandMark size={30} />
            <span className="font-semibold">Klipmill</span>
          </Link>
          <span className="hidden text-sm text-[var(--text-muted)] sm:inline">用户中心</span>
          <div className="ml-auto flex items-center gap-2">
            <div className="hidden sm:block">
              <ThemeToggle />
            </div>
            <Link
              href="/download"
              className="hidden h-9 items-center gap-1.5 rounded-lg border border-[var(--border-base)] px-3 text-sm text-[var(--text-secondary)] transition hover:text-[var(--text-main)] sm:inline-flex"
            >
              <Download className="h-4 w-4" /> 下载客户端
            </Link>
            <button
              type="button"
              onClick={() => void logout().then(() => router.replace('/login'))}
              className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-sm text-[var(--text-secondary)] transition hover:text-[var(--text-main)]"
            >
              <LogOut className="h-4 w-4" /> 退出
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-[1200px] gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[220px_1fr] lg:py-10">
        <aside className="grid min-w-0 content-start gap-4">
          <div className="hidden min-w-0 items-center gap-3 overflow-hidden px-2 lg:flex">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--primary-soft)] font-semibold text-[var(--primary)]">
              {name.slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold" title={name}>{name}</div>
              {name !== me.user.account ? <div className="truncate text-xs text-[var(--text-muted)]">{me.user.account}</div> : <div className="text-xs text-[var(--text-muted)]">{me.entitlement.planName ?? '未开通会员'}</div>}
            </div>
          </div>
          <nav className="-mx-4 flex gap-1 overflow-x-auto px-4 lg:mx-0 lg:grid lg:px-0">
            {NAV.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition',
                  isActive(href)
                    ? 'bg-[var(--primary-soft)] font-medium text-[var(--primary)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-panel)] hover:text-[var(--text-main)]',
                )}
              >
                <Icon className="h-4 w-4" /> {label}
              </Link>
            ))}
          </nav>
        </aside>
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  )
}

export function AccountPageTitle({ title, desc, actions }: { title: string; desc?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="grid gap-1">
        <h1 className="text-[24px] font-semibold tracking-[-0.02em]">{title}</h1>
        {desc ? <p className="text-sm text-[var(--text-secondary)]">{desc}</p> : null}
      </div>
      {actions}
    </div>
  )
}

export function AccountCard({ title, children, className, actions }: { title?: string; children: React.ReactNode; className?: string; actions?: React.ReactNode }) {
  return (
    <section className={cn('rounded-2xl border border-[var(--border-base)] bg-[var(--bg-panel)] p-5 sm:p-6', className)}>
      {title || actions ? (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title ? <h2 className="text-base font-semibold">{title}</h2> : <span />}
          {actions}
        </div>
      ) : null}
      {children}
    </section>
  )
}

export function Notice({ tone, children }: { tone: 'success' | 'danger' | 'info'; children: React.ReactNode }) {
  const color = tone === 'success' ? 'var(--success)' : tone === 'danger' ? 'var(--danger)' : 'var(--primary)'
  return (
    <div className="mb-4 rounded-xl px-4 py-3 text-sm" style={{ color, background: `color-mix(in srgb, ${color} 12%, transparent)` }}>
      {children}
    </div>
  )
}
