import type { WalletAccount } from '@shared/web-api/types'

import { getApiBaseUrl } from '@/lib/api-client'
import { formatDateTime } from '@/lib/utils'

import { Card } from '../ui/card'

export function AccountSessionCard({
  wallet,
  subscriptionUpdatedAt,
}: {
  wallet: WalletAccount | null | undefined
  subscriptionUpdatedAt?: number
}) {
  return (
    <div className="grid gap-4">
      <Card className="grid gap-5 p-5">
        <div className="grid gap-2">
          <span className="eyebrow">Environment</span>
          <h2 className="section-title">运行环境</h2>
        </div>
        <Info label="Web API" value={getApiBaseUrl()} mono />
        <Info label="前端架构" value="Next.js App Router + CSR" />
        <Info label="会员更新时间" value={formatDateTime(subscriptionUpdatedAt)} />
      </Card>

      <Card className="grid gap-5 p-5">
        <div className="grid gap-2">
          <span className="eyebrow">Wallet</span>
          <h2 className="section-title">算力信息</h2>
        </div>
        <Info label="当前余额" value={String(wallet?.balanceCredits ?? 0)} emphasis />
        <Info label="累计充值" value={String(wallet?.totalChargedCredits ?? 0)} />
        <Info label="累计退款" value={String(wallet?.totalRefundedCredits ?? 0)} />
        <Info label="最近更新" value={formatDateTime(wallet?.updatedAt)} />
      </Card>
    </div>
  )
}

function Info({
  label,
  value,
  mono,
  emphasis,
}: {
  label: string
  value: string
  mono?: boolean
  emphasis?: boolean
}) {
  return (
    <div className="grid gap-1">
      <span className="eyebrow">{label}</span>
      <div className={`${mono ? 'break-all font-mono text-xs' : emphasis ? 'text-[24px] font-semibold tracking-tight' : 'text-sm'} text-white`}>
        {value}
      </div>
    </div>
  )
}
