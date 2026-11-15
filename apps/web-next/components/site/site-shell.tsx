'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Download, Menu, Play, UserRound, X } from 'lucide-react'

import { ThemeToggle } from '@/components/theme/theme-toggle'
import { useCloudUser } from '@/lib/cloud-user'
import { cn } from '@/lib/utils'

const NAV = [
  { href: '/', label: '首页' },
  { href: '/#features', label: '功能' },
  { href: '/pricing', label: '价格' },
  { href: '/download', label: '下载' },
]

export function BrandMark({ size = 36 }: { size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-[10px] bg-[var(--primary)] text-white shadow-[0_8px_24px_rgba(109,93,255,0.35)]"
      style={{ width: size, height: size }}
    >
      <Play className="ml-[2px]" style={{ width: size * 0.45, height: size * 0.45 }} fill="currentColor" />
    </span>
  )
}

export function SiteShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { me, status, load } = useCloudUser()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => setOpen(false), [pathname])

  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname?.startsWith(href.replace('/#features', '/__none')))

  const accountButton =
    status === 'ready' && me ? (
      <Link
        href="/account"
        className="inline-flex h-10 items-center gap-2 rounded-xl border border-[var(--border-base)] px-3 text-sm font-medium text-[var(--text-main)] transition hover:border-[var(--border-strong)]"
      >
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[var(--primary-soft)] text-xs font-semibold text-[var(--primary)]">
          {(me.user.displayName || me.user.account).slice(0, 1).toUpperCase()}
        </span>
        用户中心
      </Link>
    ) : (
      <Link href="/login" className="inline-flex h-10 items-center rounded-xl px-3 text-sm font-medium text-[var(--text-secondary)] transition hover:text-[var(--text-main)]">
        登录
      </Link>
    )

  return (
    <div className="min-h-screen bg-[var(--bg-root)] text-[var(--text-main)]">
      <header className="sticky top-0 z-30 border-b border-[var(--border-base)] bg-[color-mix(in_srgb,var(--bg-root)_82%,transparent)] backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-[1200px] items-center gap-6 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <BrandMark size={32} />
            <span className="text-[17px] font-semibold tracking-[-0.01em]">TiktokCut</span>
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'rounded-lg px-3 py-2 text-sm transition',
                  isActive(item.href) ? 'text-[var(--text-main)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-main)]',
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto hidden items-center gap-2 md:flex">
            <ThemeToggle />
            {accountButton}
            <Link
              href="/download"
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-[var(--primary)] px-4 text-sm font-semibold text-white transition hover:bg-[var(--primary-hover)]"
            >
              <Download className="h-4 w-4" /> 下载客户端
            </Link>
          </div>

          <button
            type="button"
            className="ml-auto inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--border-base)] md:hidden"
            aria-label={open ? '关闭菜单' : '打开菜单'}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {open ? (
          <div className="border-t border-[var(--border-base)] px-4 pb-4 md:hidden">
            <nav className="grid py-2">
              {NAV.map((item) => (
                <Link key={item.href} href={item.href} className="rounded-lg px-2 py-3 text-[15px] text-[var(--text-secondary)]">
                  {item.label}
                </Link>
              ))}
              <Link href={me ? '/account' : '/login'} className="flex items-center gap-2 rounded-lg px-2 py-3 text-[15px] text-[var(--text-secondary)]">
                <UserRound className="h-4 w-4" /> {me ? '用户中心' : '登录 / 注册'}
              </Link>
            </nav>
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <Link href="/download" className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--primary)] text-sm font-semibold text-white">
                <Download className="h-4 w-4" /> 下载客户端
              </Link>
            </div>
          </div>
        ) : null}
      </header>

      <main>{children}</main>

      <footer className="border-t border-[var(--border-base)]">
        <div className="mx-auto flex w-full max-w-[1200px] flex-wrap items-center justify-between gap-4 px-4 py-8 text-sm text-[var(--text-muted)] sm:px-6">
          <div className="flex items-center gap-2.5">
            <BrandMark size={24} />
            <span>© {new Date().getFullYear()} TiktokCut · AI 短视频批量生产</span>
          </div>
          <div className="flex flex-wrap gap-5">
            <Link href="/pricing" className="hover:text-[var(--text-main)]">价格</Link>
            <Link href="/download" className="hover:text-[var(--text-main)]">下载</Link>
            <Link href="/account" className="hover:text-[var(--text-main)]">用户中心</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}

/** 区块标题 */
export function SectionHeading({ eyebrow, title, desc, center }: { eyebrow?: string; title: string; desc?: string; center?: boolean }) {
  return (
    <div className={cn('grid gap-3', center && 'mx-auto max-w-[640px] text-center')}>
      {eyebrow ? <span className="text-[13px] font-semibold tracking-[0.08em] text-[var(--primary)]">{eyebrow}</span> : null}
      <h2 className="text-[clamp(1.6rem,3vw,2.25rem)] font-semibold leading-[1.15] tracking-[-0.02em]">{title}</h2>
      {desc ? <p className="text-[15px] leading-relaxed text-[var(--text-secondary)]">{desc}</p> : null}
    </div>
  )
}
