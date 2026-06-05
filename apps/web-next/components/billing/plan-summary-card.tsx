import type { UserSubscription } from '@shared/web-api/types'

import { StatusBadge } from '../ui/badge'
import { Card } from '../ui/card'

export function PlanSummaryCard({ subscription }: { subscription: UserSubscription | null | undefined }) {
  return (
    <Card className="grid gap-6 bg-white/[0.04] p-5">
      <div className="grid gap-2">
        <span className="eyebrow">Current Plan</span>
        <h2 className="page-title text-[24px]">{subscription?.planName || '未开通套餐'}</h2>
        <p className="body-copy text-sm">会员套餐决定当前可用能力与每月基础算力额度。</p>
      </div>
      <div className="flex items-center gap-3">
        <StatusBadge status={subscription?.status} />
      </div>
    </Card>
  )
}
