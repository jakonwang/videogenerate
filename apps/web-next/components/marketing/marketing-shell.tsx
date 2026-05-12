import Link from 'next/link'
import { ArrowRight, Download, LogIn } from 'lucide-react'

import { ThemeToggle } from '@/components/theme/theme-toggle'

type MarketingShellProps = {
  active?: 'home' | 'product' | 'pricing' | 'download'
  children: React.ReactNode
}

const navItems = [
  { href: '/', label: '产品首页', key: 'home' },
  { href: '/product', label: '产品介绍', key: 'product' },
  { href: '/pricing', label: '产品定价', key: 'pricing' },
  { href: '/download', label: '客户端下载', key: 'download' },
] as const

export function MarketingShell({ active, children }: MarketingShellProps) {
  return (
    <div className="min-h-screen bg-[var(--theme-marketing-bg)] text-[var(--text-main)]">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top,rgba(109,93,255,0.18),transparent_30%),radial-gradient(circle_at_80%_10%,rgba(34,211,238,0.08),transparent_24%)]" />

      <header className="sticky top-0 z-20 border-b border-[var(--border-base)] bg-[var(--marketing-nav-bg)] backdrop-blur-xl">
        <div className="mx-auto flex min-h-[78px] w-[min(1280px,calc(100%-48px))] flex-wrap items-center justify-between gap-5 max-[960px]:w-[min(100%,calc(100%-32px))]">
          <Link href="/" className="flex items-center gap-3">
            <div className="h-[42px] w-[42px] rounded-[14px] bg-[radial-gradient(circle_at_34%_28%,rgba(255,255,255,0.24),transparent_26%),linear-gradient(135deg,#6d5dff,#22d3ee)] shadow-[0_16px_36px_rgba(109,93,255,0.28)]" />
            <div className="grid gap-[2px]">
              <strong className="text-[17px] leading-[1.1] text-[var(--text-main)]">VideoGen</strong>
              <span className="text-xs text-[var(--text-muted)]">企业级 AI 视频生产平台</span>
            </div>
          </Link>

          <nav className="flex flex-wrap items-center gap-2 max-[960px]:w-full">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-xl px-3.5 py-2.5 text-sm transition ${
                  active === item.key
                    ? 'bg-[rgba(109,93,255,0.16)] text-[var(--text-main)]'
                    : 'text-[var(--text-secondary)] hover:bg-[rgba(109,93,255,0.08)] hover:text-[var(--text-main)]'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="flex flex-wrap items-center gap-3 max-[960px]:w-full">
            <ThemeToggle />
            <Link
              href="/login?next=/workspace"
              className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-xl border border-[var(--border-base)] bg-[color:var(--bg-card)] px-4 text-sm font-semibold text-[var(--text-main)] transition hover:border-[var(--border-strong)]"
            >
              <LogIn className="h-4 w-4" />
              进入工作台
            </Link>
            <Link
              href="/download"
              className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-xl border border-[rgba(109,93,255,0.4)] bg-[linear-gradient(135deg,#6d5dff,#8b5cf6)] px-4 text-sm font-semibold text-white shadow-[0_12px_32px_rgba(109,93,255,0.28)] transition hover:-translate-y-[1px]"
            >
              <Download className="h-4 w-4" />
              下载客户端
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto grid w-[min(1280px,calc(100%-48px))] gap-6 py-12 max-[960px]:w-[min(100%,calc(100%-32px))] max-[960px]:py-8">
        {children}
      </main>
    </div>
  )
}
