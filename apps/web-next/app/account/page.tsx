'use client'

import Link from 'next/link'
import { useEffect } from 'react'
import { ArrowRight, CalendarClock, Crown, Download, KeyRound, MonitorSmartphone } from 'lucide-react'

import { AccountCard, AccountPageTitle } from '@/components/account-center/account-shell'
import { PERMANENT_AT, formatDate, useCloudUser } from '@/lib/cloud-user'

const DAY = 24 * 60 * 60 * 1000

export default function AccountOverviewPage() {
  const { me, load } = useCloudUser()

  useEffect(() => {
    void load(true)
  }, [load])

  if (!me) return null
  const { entitlement, devices, user } = me
  const daysLeft =
    entitlement.expiresAt && entitlement.expiresAt < PERMANENT_AT ? Math.max(0, Math.ceil((entitlement.expiresAt - Date.now()) / DAY)) : null
  const expiringSoon = entitlement.active && !entitlement.unlimited && daysLeft !== null && daysLeft <= 7

  const statusText = entitlement.unlimited ? '不受限' : entitlement.active ? '生效中' : user.planExpiresAt ? '已过期' : '未开通'
  const statusColor = entitlement.active ? 'var(--success)' : 'var(--warning)'

  return (
    <div className="grid gap-5">
      <AccountPageTitle title="概览" desc="会员状态、设备与快捷操作" />

      <section className="relative overflow-hidden rounded-2xl border border-[var(--primary-border)] bg-[var(--bg-panel)] p-6 sm:p-8">
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-[var(--primary-soft)] blur-3xl" />
        <div className="relative grid gap-6 sm:grid-cols-[1fr_auto] sm:items-end">
          <div className="grid gap-3">
            <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
              <Crown className="h-4 w-4 text-[var(--primary)]" /> 当前会员
              <span className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ color: statusColor, background: `color-mix(in srgb, ${statusColor} 14%, transparent)` }}>
                {statusText}
              </span>
            </div>
            <div className="text-[30px] font-semibold tracking-[-0.02em]">{entitlement.planName || '尚未开通会员'}</div>
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-[var(--text-secondary)]">
              <span className="inline-flex items-center gap-1.5">
                <CalendarClock className="h-4 w-4" />
                {entitlement.unlimited ? '长期有效' : entitlement.expiresAt ? `到期 ${formatDate(entitlement.expiresAt)}` : '—'}
                {daysLeft !== null && entitlement.active ? `（剩余 ${daysLeft} 天）` : ''}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <MonitorSmartphone className="h-4 w-4" />
                已绑定 {devices.length} / {entitlement.maxDevices === 0 ? '不限' : entitlement.maxDevices} 台
              </span>
            </div>
            {expiringSoon ? <p className="text-sm text-[var(--warning)]">会员即将到期，续费后时长自动叠加。</p> : null}
          </div>
          {!entitlement.unlimited ? (
            <Link href="/account/buy" className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[var(--primary)] px-6 text-sm font-semibold text-white transition hover:bg-[var(--primary-hover)]">
              {entitlement.active ? '续费' : '立即开通'} <ArrowRight className="h-4 w-4" />
            </Link>
          ) : null}
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-3">
        {[
          { href: '/download', icon: Download, title: '下载客户端', desc: '安装后用本账号登录即可使用' },
          { href: '/account/redeem', icon: KeyRound, title: '使用兑换码', desc: '输入兑换码直接开通会员' },
          { href: '/account/devices', icon: MonitorSmartphone, title: '管理设备', desc: '换电脑时解绑旧设备' },
        ].map(({ href, icon: Icon, title, desc }) => (
          <Link
            key={href}
            href={href}
            className="group grid gap-2 rounded-2xl border border-[var(--border-base)] bg-[var(--bg-panel)] p-5 transition hover:border-[var(--primary-border)]"
          >
            <Icon className="h-5 w-5 text-[var(--primary)]" />
            <span className="flex items-center gap-1 font-semibold">
              {title} <ArrowRight className="h-4 w-4 opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
            </span>
            <span className="text-sm text-[var(--text-secondary)]">{desc}</span>
          </Link>
        ))}
      </div>

      <AccountCard title="使用说明">
        <ol className="grid gap-2 text-sm text-[var(--text-secondary)]">
          <li>1. 下载并安装 Windows 客户端。</li>
          <li>2. 打开客户端，用 {user.account} 登录。</li>
          <li>3. AI 平台和模型已由我们统一配置，登录后即可开始复刻、批量生成视频。</li>
        </ol>
      </AccountCard>
    </div>
  )
}
