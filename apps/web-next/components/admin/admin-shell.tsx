'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  Coins,
  FileClock,
  KeyRound,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  Megaphone,
  Package,
  ReceiptText,
  SlidersHorizontal,
  Users,
} from 'lucide-react'

import type { CloudPayChannel, CloudUser } from '@shared/cloud/types'
import { AdminThemeToggle } from '@/components/admin/admin-theme'
import { AdminPasswordPanel } from '@/components/admin/admin-password'
import { AdminAvatar, roleLabel } from '@/components/admin/admin-ui'
import { adminClient, getAdminToken, setAdminToken } from '@/lib/admin-client'
import { cn } from '@/lib/utils'

type NavItem = { href: string; title: string; icon: LucideIcon }

const NAV: ReadonlyArray<{ section: string; items: NavItem[] }> = [
  {
    section: '运营',
    items: [
      { href: '/admin', title: '数据看板', icon: LayoutDashboard },
      { href: '/admin/users', title: '用户管理', icon: Users },
      { href: '/admin/orders', title: '订单', icon: ReceiptText },
    ],
  },
  {
    section: '收费',
    items: [
      { href: '/admin/plans', title: '套餐与价格', icon: Package },
      { href: '/admin/billing', title: '计费与模型', icon: Coins },
      { href: '/admin/redeem-codes', title: '卡密', icon: KeyRound },
    ],
  },
  {
    section: '系统',
    items: [
      { href: '/admin/software', title: '软件设置', icon: SlidersHorizontal },
      { href: '/admin/config', title: '公告与开关', icon: Megaphone },
      { href: '/admin/audit', title: '操作日志', icon: FileClock },
    ],
  },
]

function findCurrent(pathname: string | null) {
  for (const group of NAV) {
    for (const item of group.items) {
      const active = item.href === '/admin' ? pathname === '/admin' : pathname?.startsWith(item.href)
      if (active) return { section: group.section, item }
    }
  }
  return null
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [me, setMe] = useState<CloudUser | null>(null)
  const [channels, setChannels] = useState<CloudPayChannel[]>([])
  const [changingPassword, setChangingPassword] = useState(false)

  useEffect(() => {
    if (!getAdminToken()) {
      router.replace(`/admin/login?next=${encodeURIComponent(pathname || '/admin')}`)
      return
    }
    adminClient
      .me()
      .then((result) => {
        if (result.user.role === 'user') {
          setAdminToken('')
          router.replace('/admin/login')
          return
        }
        setMe(result.user)
        // 初始管理员改密码前，后台接口都会被拒绝，不用去拉统计
        if (result.user.mustChangePassword) return
        adminClient.admin
          .stats()
          .then((r) => setChannels(r.channels))
          .catch(() => {})
      })
      .catch(() => router.replace('/admin/login'))
    // 只在进入后台时校验一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const logout = async () => {
    try {
      await adminClient.logout()
    } catch {
      // 会话已失效也照样退出
    }
    setAdminToken('')
    router.replace('/admin/login')
  }

  const current = findCurrent(pathname)

  return (
    <div className="admin-shell">
      <header className="admin-topbar">
        <Link href="/admin" className="admin-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand-logo.png" alt="" className="admin-brand__mark" draggable={false} />
          <span className="admin-brand__name">Klipmill</span>
          <span className="admin-brand__tag">管理后台</span>
        </Link>
        <nav className="admin-crumbs" aria-label="当前位置">
          {current ? (
            <>
              <span>{current.section}</span>
              <span>/</span>
              <b>{current.item.title}</b>
            </>
          ) : null}
        </nav>
        <div className="admin-topbar__right">
          {channels.includes('mock') ? (
            <span className="vg-pill vg-pill--amber vg-pill--dot" title="CLOUD_PAY_MOCK=1，仅限测试环境">
              模拟支付已开启
            </span>
          ) : null}
          <AdminThemeToggle />
          {me ? (
            <>
              <span className="admin-user" title={me.account}>
                <AdminAvatar name={me.displayName || me.account} />
                <span className="max-w-[160px] truncate">{me.displayName || me.account}</span>
                <small>{roleLabel(me.role)}</small>
              </span>
              <button type="button" className="vg-icon-btn" onClick={() => setChangingPassword(true)} title="修改密码" aria-label="修改密码">
                <LockKeyhole size={16} />
              </button>
              <button type="button" className="vg-icon-btn" onClick={() => void logout()} title="退出登录" aria-label="退出登录">
                <LogOut size={16} />
              </button>
            </>
          ) : null}
        </div>
      </header>

      <div className="admin-body">
        <aside className="admin-nav">
          {NAV.map((group) => (
            <div key={group.section} className="admin-nav__group">
              <div className="admin-nav__section">{group.section}</div>
              {group.items.map((item) => {
                const Icon = item.icon
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={item.title}
                    className={cn('admin-nav__item', current?.item.href === item.href && 'is-active')}
                  >
                    <Icon />
                    <span className="admin-nav__label">{item.title}</span>
                  </Link>
                )
              })}
            </div>
          ))}
          <div className="admin-nav__foot">
            <span>云端服务 · 已连接</span>
          </div>
        </aside>
        <main className="admin-main">
          {me && (me.mustChangePassword || changingPassword) ? (
            <AdminPasswordPanel
              forced={me.mustChangePassword}
              onCancel={() => setChangingPassword(false)}
              onDone={() => {
                setChangingPassword(false)
                setMe({ ...me, mustChangePassword: false })
                adminClient.admin
                  .stats()
                  .then((r) => setChannels(r.channels))
                  .catch(() => {})
              }}
            />
          ) : me ? (
            children
          ) : (
            <div className="vg-page">
              <div className="vg-skeleton h-10 w-60" />
              <div className="vg-skeleton h-24" />
              <div className="vg-skeleton h-64" />
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
