'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import { AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, Inbox, LoaderCircle, Search, UserRound } from 'lucide-react'

import { cn } from '@/lib/utils'

/** 简单的数据加载 hook：deps 变化时重新请求，返回 reload */
export function useAdminData<T>(loader: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const loaderRef = useRef(loader)
  loaderRef.current = loader

  const reload = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setData(await loaderRef.current())
    } catch (err) {
      setError((err as Error)?.message ?? String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return { data, error, loading, reload, setData }
}

/** 页面容器：对应桌面端 .vg-page */
export function AdminPage({ children }: { children: React.ReactNode }) {
  return <div className="vg-page">{children}</div>
}

export function AdminPageHeader({ title, description, actions, icon: Icon }: { title: string; description?: string; actions?: React.ReactNode; icon?: LucideIcon }) {
  return (
    <header className="vg-page-head">
      {Icon ? (
        <span className="vg-page-head__icon">
          <Icon size={20} />
        </span>
      ) : null}
      <div className="vg-page-head__text">
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="vg-page-head__actions">{actions}</div> : null}
    </header>
  )
}

export function AdminPanel({
  title,
  subtitle,
  icon: Icon,
  actions,
  children,
  className,
  flush,
}: {
  title?: string
  subtitle?: string
  icon?: LucideIcon
  actions?: React.ReactNode
  children: React.ReactNode
  className?: string
  /** 无内边距（表格卡片） */
  flush?: boolean
}) {
  return (
    <section className={cn('vg-card', flush && 'vg-card--flush admin-table-card', className)}>
      {title || actions ? (
        <div className={cn('vg-card__head', flush && 'pb-3')}>
          {title ? (
            <span className="vg-card__title">
              {Icon ? <Icon size={16} /> : null}
              {title}
              {subtitle ? <small>{subtitle}</small> : null}
            </span>
          ) : (
            <span />
          )}
          {actions ? <div className="vg-card__actions">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  )
}

export function AdminTable({ head, children, empty, emptyText }: { head: Array<string | { label: string; align?: 'right' | 'center' }>; children: React.ReactNode; empty?: boolean; emptyText?: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="vg-table">
        <thead>
          <tr>
            {head.map((h, i) => {
              const cell = typeof h === 'string' ? { label: h } : h
              return (
                <th key={`${cell.label}-${i}`} className={cell.align === 'right' ? 'num' : cell.align === 'center' ? 'center' : undefined}>
                  {cell.label}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
      {empty ? (
        <div className="vg-empty">
          <span className="vg-empty__icon">
            <Inbox size={24} />
          </span>
          <p>{emptyText ?? '暂无数据'}</p>
        </div>
      ) : null}
    </div>
  )
}

type Tone = 'success' | 'danger' | 'warning' | 'info' | 'violet' | 'idle'

export function AdminTag({ tone = 'idle', dot, children }: { tone?: Tone; dot?: boolean; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'vg-pill',
        dot && 'vg-pill--dot',
        tone === 'success' && 'vg-pill--green',
        tone === 'danger' && 'vg-pill--red',
        tone === 'warning' && 'vg-pill--amber',
        tone === 'info' && 'vg-pill--blue',
        tone === 'violet' && 'vg-pill--violet',
      )}
    >
      {children}
    </span>
  )
}

/** 页码：显示首尾与当前页附近，中间用省略号 */
export function AdminPager({ page, pageSize, total, onChange }: { page: number; pageSize: number; total: number; onChange: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const items: Array<number | 'gap'> = []
  for (let p = 1; p <= pages; p++) {
    if (p === 1 || p === pages || Math.abs(p - page) <= 1) items.push(p)
    else if (items[items.length - 1] !== 'gap') items.push('gap')
  }
  return (
    <div className="vg-pager">
      <span>
        共 <b className="vg-num text-[var(--theme-text)]">{total}</b> 条
      </span>
      <div className="vg-pager__group">
        <button type="button" className="vg-pg" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="上一页">
          <ChevronLeft size={14} />
        </button>
        {items.map((item, i) =>
          item === 'gap' ? (
            <span key={`gap-${i}`} className="vg-pg is-gap">
              …
            </span>
          ) : (
            <button key={item} type="button" className={cn('vg-pg', item === page && 'is-active')} onClick={() => onChange(item)}>
              {item}
            </button>
          ),
        )}
        <button type="button" className="vg-pg" disabled={page >= pages} onClick={() => onChange(page + 1)} aria-label="下一页">
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  )
}

export function AdminLoading({ rows = 4 }: { rows?: number }) {
  return (
    <div className="grid gap-2 p-4" aria-busy="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="vg-skeleton h-8" style={{ opacity: 1 - i * 0.15 }} />
      ))}
    </div>
  )
}

export function AdminSpinner() {
  return (
    <div className="flex items-center gap-2 py-8 text-[var(--theme-text-muted)]">
      <LoaderCircle size={16} className="vg-spin" /> 加载中…
    </div>
  )
}

export function AdminError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="vg-notice vg-notice--danger items-center">
      <AlertCircle size={15} />
      <span className="flex-1">{message}</span>
      {onRetry ? (
        <button type="button" className="vg-btn vg-btn--sm" onClick={onRetry}>
          重试
        </button>
      ) : null}
    </div>
  )
}

export function AdminNotice({ tone = 'success', children }: { tone?: 'success' | 'danger' | 'warning' | 'info'; children: React.ReactNode }) {
  return (
    <div className={cn('vg-notice', tone === 'success' && 'vg-notice--accent', tone === 'danger' && 'vg-notice--danger', tone === 'warning' && 'vg-notice--warning')}>
      {tone === 'success' ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
      <span>{children}</span>
    </div>
  )
}

export function AdminField({ label, hint, children, className }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn('vg-field', className)}>
      <span className="vg-field__label">{label}</span>
      {children}
      {hint ? <span className="vg-field__hint">{hint}</span> : null}
    </label>
  )
}

/** 列表页工具条里的搜索框 */
export function AdminSearch({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="vg-search">
      <Search size={15} />
      <input className="vg-input" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}

export function AdminStat({ label, value, icon: Icon, tone, hint }: { label: string; value: React.ReactNode; icon: LucideIcon; tone?: 'blue' | 'amber' | 'violet' | 'red'; hint?: React.ReactNode }) {
  return (
    <div className="vg-stat">
      <span className={cn('vg-stat__icon', tone && `vg-stat__icon--${tone}`)}>
        <Icon size={17} />
      </span>
      <span className="vg-stat__body">
        <span className="vg-stat__label">{label}</span>
        <span className="vg-stat__value">{value}</span>
        {hint ? <span className="text-[11px] text-[var(--theme-text-muted)]">{hint}</span> : null}
      </span>
    </div>
  )
}

/** 账号头像：邮箱 / 昵称取首字母，手机号显示人像图标 */
export function AdminAvatar({ name, className }: { name: string; className?: string }) {
  const first = name.trim().charAt(0)
  return <span className={cn('vg-avatar', className)}>{!first || /[0-9+]/.test(first) ? <UserRound size={15} /> : first.toUpperCase()}</span>
}

export const selectClass = 'vg-select w-full'
export const textareaClass = 'vg-textarea w-full admin-mono'

export const PERMANENT_AT = 253402214400000

export function formatDateTime(ms: number | null | undefined) {
  if (!ms) return '—'
  if (ms >= PERMANENT_AT) return '永久'
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function roleLabel(role: string) {
  return role === 'super_admin' ? '超级管理员' : role === 'admin' ? '管理员' : '用户'
}

export function OrderStatusTag({ status }: { status: string }) {
  const map: Record<string, { tone: Tone; label: string }> = {
    paid: { tone: 'success', label: '已支付' },
    pending: { tone: 'warning', label: '待支付' },
    closed: { tone: 'idle', label: '已关闭' },
    refunded: { tone: 'danger', label: '已退款' },
  }
  const item = map[status] ?? { tone: 'idle' as const, label: status }
  return (
    <AdminTag tone={item.tone} dot>
      {item.label}
    </AdminTag>
  )
}

export function channelLabel(channel: string) {
  return channel === 'wechat' ? '微信支付' : channel === 'alipay' ? '支付宝' : channel === 'mock' ? '模拟支付' : channel
}
