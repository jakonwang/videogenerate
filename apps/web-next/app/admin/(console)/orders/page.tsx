'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ReceiptText } from 'lucide-react'

import { formatFen } from '@shared/cloud/client'
import {
  AdminError,
  AdminLoading,
  AdminNotice,
  AdminPage,
  AdminPageHeader,
  AdminPager,
  AdminPanel,
  AdminSearch,
  AdminTable,
  OrderStatusTag,
  channelLabel,
  formatDateTime,
  useAdminData,
} from '@/components/admin/admin-ui'
import { Button } from '@/components/admin/controls'
import { adminClient } from '@/lib/admin-client'
import { cn } from '@/lib/utils'

const STATUS_TABS = [
  { value: '', label: '全部' },
  { value: 'paid', label: '已支付' },
  { value: 'pending', label: '待支付' },
  { value: 'closed', label: '已关闭' },
  { value: 'refunded', label: '已退款' },
]

export default function AdminOrdersPage() {
  const [keyword, setKeyword] = useState('')
  const [query, setQuery] = useState({ keyword: '', status: '', page: 1 })
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)
  const orders = useAdminData(() => adminClient.admin.listOrders(query), [query])

  const refund = async (orderNo: string) => {
    const note = window.prompt('退款备注（请先在微信 / 支付宝商户后台完成实际退款）：', '')
    if (note === null) return
    const revokeDays = window.confirm('是否同时扣回该订单增加的会员天数？\n确定 = 扣回，取消 = 只标记退款')
    try {
      await adminClient.admin.refundOrder(orderNo, { revokeDays, note })
      setNotice({ tone: 'success', text: `订单 ${orderNo} 已标记退款${revokeDays ? '，并扣回天数' : ''}` })
      await orders.reload()
    } catch (err) {
      setNotice({ tone: 'danger', text: (err as Error).message })
    }
  }

  return (
    <AdminPage>
      <AdminPageHeader icon={ReceiptText} title="订单" description="扫码支付订单。实际退款请在微信 / 支付宝商户后台操作，这里只做标记与扣回时长。" />
      {notice ? <AdminNotice tone={notice.tone}>{notice.text}</AdminNotice> : null}

      <AdminPanel flush>
        <div className="vg-tabs px-3">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              className={cn('vg-tabs__btn', query.status === tab.value && 'is-active')}
              onClick={() => setQuery({ ...query, status: tab.value, page: 1 })}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <form
          className="admin-filters"
          onSubmit={(e) => {
            e.preventDefault()
            setQuery({ ...query, keyword, page: 1 })
          }}
        >
          <AdminSearch value={keyword} onChange={setKeyword} placeholder="订单号、账号或交易流水号" />
          <Button type="submit" variant="secondary">
            搜索
          </Button>
        </form>
        {orders.error ? (
          <div className="p-4">
            <AdminError message={orders.error} onRetry={() => void orders.reload()} />
          </div>
        ) : null}
        {orders.loading && !orders.data ? <AdminLoading /> : null}
        {orders.data ? (
          <>
            <AdminTable
              head={['订单号', '账号', '套餐', { label: '金额', align: 'right' }, '渠道', '状态', '交易流水', '时间', { label: '', align: 'right' }]}
              empty={!orders.data.items.length}
              emptyText="没有符合条件的订单"
            >
              {orders.data.items.map((o) => (
                <tr key={o.orderNo}>
                  <td className="admin-mono">{o.orderNo}</td>
                  <td>
                    <Link className="admin-link" href={`/admin/users/${o.userId}`}>
                      {o.account}
                    </Link>
                  </td>
                  <td>{o.planName}</td>
                  <td className="num font-semibold">{formatFen(o.amountFen)}</td>
                  <td className="text-[var(--theme-text-secondary)]">{channelLabel(o.channel)}</td>
                  <td>
                    <OrderStatusTag status={o.status} />
                  </td>
                  <td className="admin-mono max-w-[180px] truncate text-[var(--theme-text-muted)]" title={o.transactionId ?? ''}>
                    {o.transactionId || '—'}
                  </td>
                  <td className="whitespace-nowrap text-[var(--theme-text-muted)]">{formatDateTime(o.paidAt ?? o.createdAt)}</td>
                  <td className="num">
                    {o.status === 'paid' ? (
                      <Button size="sm" variant="ghost" onClick={() => void refund(o.orderNo)}>
                        标记退款
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </AdminTable>
            <AdminPager page={orders.data.page} pageSize={orders.data.pageSize} total={orders.data.total} onChange={(page) => setQuery({ ...query, page })} />
          </>
        ) : null}
      </AdminPanel>
    </AdminPage>
  )
}
