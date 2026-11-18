'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { LoaderCircle } from 'lucide-react'

import type { CloudOrder, CloudPage } from '@shared/cloud/types'
import { AccountCard, AccountPageTitle, Notice } from '@/components/account-center/account-shell'
import { formatDate, formatYuan, userClient } from '@/lib/cloud-user'

const STATUS: Record<string, { label: string; color: string }> = {
  paid: { label: '已支付', color: 'var(--success)' },
  pending: { label: '待支付', color: 'var(--warning)' },
  closed: { label: '已关闭', color: 'var(--text-muted)' },
  refunded: { label: '已退款', color: 'var(--danger)' },
}
const CHANNEL: Record<string, string> = { wechat: '微信支付', alipay: '支付宝', mock: '模拟支付' }

export default function OrdersPage() {
  const [page, setPage] = useState(1)
  const [data, setData] = useState<CloudPage<CloudOrder> | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    userClient
      .listOrders(page)
      .then(setData)
      .catch((err) => setError((err as Error).message))
  }, [page])

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1

  return (
    <div>
      <AccountPageTitle title="订单记录" />
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <AccountCard>
        {!data ? (
          <div className="flex justify-center py-10 text-[var(--text-muted)]">
            <LoaderCircle className="h-5 w-5 animate-spin" />
          </div>
        ) : data.items.length ? (
          <>
            <ul className="divide-y divide-[var(--border-base)]">
              {data.items.map((o) => {
                const s = STATUS[o.status] ?? { label: o.status, color: 'var(--text-muted)' }
                return (
                  <li key={o.orderNo} className="flex flex-wrap items-center gap-x-6 gap-y-1 py-4 first:pt-0 last:pb-0">
                    <div className="grid min-w-[180px] flex-1 gap-0.5">
                      <span className="font-medium">{o.planName}</span>
                      <span className="font-mono text-xs text-[var(--text-muted)]">{o.orderNo}</span>
                    </div>
                    <span className="text-sm text-[var(--text-secondary)]">{CHANNEL[o.channel] ?? o.channel}</span>
                    <span className="text-sm text-[var(--text-secondary)]">{formatDate(o.paidAt ?? o.createdAt, true)}</span>
                    <span className="w-20 text-right font-semibold tabular-nums">{formatYuan(o.amountFen)}</span>
                    <span className="w-16 text-right text-sm font-medium" style={{ color: s.color }}>
                      {s.label}
                    </span>
                  </li>
                )
              })}
            </ul>
            {pages > 1 ? (
              <div className="mt-4 flex items-center justify-end gap-2 text-sm">
                <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded-lg border border-[var(--border-base)] px-3 py-1.5 disabled:opacity-40">
                  上一页
                </button>
                <span className="text-[var(--text-muted)]">
                  {page} / {pages}
                </span>
                <button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)} className="rounded-lg border border-[var(--border-base)] px-3 py-1.5 disabled:opacity-40">
                  下一页
                </button>
              </div>
            ) : null}
          </>
        ) : (
          <p className="py-8 text-center text-sm text-[var(--text-muted)]">
            还没有订单。
            <Link href="/account/buy" className="ml-1 text-[var(--primary)] hover:underline">
              去购买
            </Link>
          </p>
        )}
      </AccountCard>
    </div>
  )
}
