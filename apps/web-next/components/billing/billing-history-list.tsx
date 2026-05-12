import type { BillingOrder, WalletTransaction } from '@shared/web-api/types'

import { formatDateTime } from '@/lib/utils'

import { StatusBadge } from '../ui/badge'
import { Button } from '../ui/button'
import { Card } from '../ui/card'

export function BillingHistoryList({
  orders,
  transactions,
  onPay,
  paying,
}: {
  orders: BillingOrder[]
  transactions: WalletTransaction[]
  onPay: (orderId: string) => void
  paying: boolean
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card className="grid gap-4 p-5">
        <div className="grid gap-2">
          <span className="eyebrow">Orders</span>
          <h3 className="section-title">订单记录</h3>
        </div>
        <div className="grid gap-3">
          {orders.length ? (
            orders.map((order) => (
              <div key={order.id} className="grid gap-3 rounded-2xl bg-black/20 px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="grid gap-1">
                    <strong className="text-sm text-white">{order.planName || order.type}</strong>
                    <span className="text-xs text-zinc-500">{formatDateTime(order.createdAt)}</span>
                  </div>
                  <StatusBadge status={order.status} />
                </div>
                <div className="grid gap-1 text-sm text-zinc-400">
                  <span>金额：¥{order.amountCny}</span>
                  <span>渠道：{order.paymentChannel}</span>
                </div>
                {order.status === 'pending' ? (
                  <Button size="sm" variant="secondary" disabled={paying} onClick={() => onPay(order.id)}>
                    模拟支付完成
                  </Button>
                ) : null}
              </div>
            ))
          ) : (
            <div className="rounded-2xl bg-black/20 px-4 py-5 text-sm text-zinc-500">暂无订单记录</div>
          )}
        </div>
      </Card>

      <Card className="grid gap-4 p-5">
        <div className="grid gap-2">
          <span className="eyebrow">Transactions</span>
          <h3 className="section-title">算力流水</h3>
        </div>
        <div className="grid gap-3">
          {transactions.length ? (
            transactions.map((item) => (
              <div key={item.id} className="grid gap-2 rounded-2xl bg-black/20 px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <strong className="text-sm text-white">{item.note}</strong>
                  <span className="text-sm text-zinc-300">
                    {item.amountCredits > 0 ? '+' : ''}
                    {item.amountCredits}
                  </span>
                </div>
                <div className="grid gap-1 text-xs text-zinc-500">
                  <span>类型：{item.type}</span>
                  <span>余额：{item.balanceAfter}</span>
                  <span>时间：{formatDateTime(item.createdAt)}</span>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-2xl bg-black/20 px-4 py-5 text-sm text-zinc-500">暂无算力流水</div>
          )}
        </div>
      </Card>
    </div>
  )
}
