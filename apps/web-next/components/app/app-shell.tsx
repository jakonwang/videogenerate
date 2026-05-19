'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { startTransition } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  Bell,
  ChevronDown,
  CirclePlay,
  CreditCard,
  Home,
  Plus,
  Puzzle,
  Scissors,
  Search,
  Settings,
  Sparkles,
  Users,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useSessionStore } from '@/store/session-store'

const links: ReadonlyArray<{ href: string; title: string; icon: LucideIcon; badge?: string }> = [
  { href: '/workspace', title: '首页', icon: Home },
  { href: '/clone', title: '复刻', icon: Sparkles },
  { href: '/models', title: '模特', icon: Users },
  { href: '/live-clips', title: '直播', icon: Scissors, badge: '客户端' },
  { href: '/production', title: '生产', icon: CirclePlay, badge: '客户端' },
  { href: '/plugins', title: '插件市场', icon: Puzzle },
  { href: '/my-plugins', title: '我的插件', icon: Puzzle },
  { href: '/billing', title: '会员', icon: CreditCard },
  { href: '/account', title: '账户', icon: Users },
  { href: '/settings', title: '设置', icon: Settings },
] as const

export function AppShell({
  children,
  sidebarContent,
  headerSearchPlaceholder,
  onCreateTask,
  creatingTask = false,
}: {
  children: React.ReactNode
  sidebarContent?: React.ReactNode
  headerSearchPlaceholder?: string
  onCreateTask?: () => void
  creatingTask?: boolean
}) {
  const pathname = usePathname()
  const router = useRouter()
  const user = useSessionStore((state) => state.user)
  const subscription = useSessionStore((state) => state.subscription)

  const pushRoute = (href: string) => {
    startTransition(() => {
      router.push(href)
    })
  }

  const navIsActive = (href: string) => {
    if (href === '/workspace') return pathname === '/workspace'
    return pathname?.startsWith(href)
  }

  const userName = user?.displayName || '测试用户'
  const userInitial = userName.slice(0, 1) || '测'
  const planName = subscription?.planName || '专业会员'

  return (
    <div className="app-frame">
      <div className="workspace-grid">
        <aside className="workspace-sidebar">
          <div className="workspace-sidebar__inner">
            <div className="workspace-brand">
              <div className="workspace-brand__mark">
                <div className="workspace-brand__mark-core" />
              </div>
              <div className="workspace-brand__copy">
                <div className="workspace-brand__title-row">
                  <strong>VideoGen</strong>
                  <span className="workspace-brand__ai-badge">AI</span>
                </div>
                <p>企业级视频生产工作台</p>
              </div>
            </div>

            <nav className="workspace-nav">
              {links.map((item) => {
                const Icon = item.icon
                const active = navIsActive(item.href)

                return (
                  <Link key={`${item.href}-${item.title}`} href={item.href} className={cn('workspace-nav__item', active && 'is-active')}>
                    <span className="workspace-nav__icon">
                      <Icon className="h-[20px] w-[20px]" />
                    </span>
                    <span className="workspace-nav__label">{item.title}</span>
                    {item.badge ? <span className="workspace-nav__badge">{item.badge}</span> : null}
                  </Link>
                )
              })}
            </nav>

            {sidebarContent ? <div className="workspace-sidebar__project">{sidebarContent}</div> : <div />}

            <div className="workspace-sidebar__footer">
              <button type="button" className="workspace-account-card" onClick={() => pushRoute('/account')}>
                <div className="workspace-account-card__head">
                  <div className="workspace-account-card__avatar">{userInitial}</div>
                  <div className="workspace-account-card__copy">
                    <strong>{userName}</strong>
                    <div className="workspace-account-card__plan-row">
                      <span className="workspace-account-card__plan-badge">{planName}</span>
                    </div>
                  </div>
                  <ChevronDown className="h-4 w-4 text-[var(--text-muted)]" />
                </div>
                <div className="workspace-account-card__meta">
                  <span>ID: test_1688</span>
                  <span>算力 380</span>
                </div>
                <div className="workspace-account-card__logout">退出登录</div>
              </button>
            </div>
          </div>
        </aside>

        <div className="workspace-main">
          <header className="workspace-header">
            <div className="workspace-header__inner">
              <div className="workspace-header__search">
                <Search className="h-[18px] w-[18px] text-[var(--text-muted)]" />
                <input placeholder={headerSearchPlaceholder || '搜索任务、模型、模板或设置项'} />
                <span className="workspace-header__shortcut">Ctrl K</span>
              </div>

              <div className="workspace-header__right">
                {onCreateTask ? (
                  <Button size="sm" onClick={onCreateTask} disabled={creatingTask} className="workspace-header__primary">
                    <Plus className="h-4 w-4" />
                    {creatingTask ? '创建中...' : '新建任务'}
                  </Button>
                ) : null}

                <button type="button" className="workspace-header__icon-button workspace-notify" aria-label="通知">
                  <Bell className="h-5 w-5" />
                  <span className="workspace-header__notice">12</span>
                </button>

                <button type="button" className="workspace-user-pill" onClick={() => pushRoute('/account')}>
                  <div className="workspace-user-pill__avatar">{userInitial}</div>
                  <div className="workspace-user-pill__copy">
                    <strong>{userName}</strong>
                    <span>{planName}</span>
                  </div>
                  <ChevronDown className="h-4 w-4 text-[var(--text-muted)]" />
                </button>
              </div>
            </div>
          </header>

          <main className="workspace-content">{children}</main>
        </div>
      </div>
    </div>
  )
}
