import type { UserSubscription, WebUser } from '@shared/web-api/types'

import { formatDateTime } from '@/lib/utils'

import { StatusBadge } from '../ui/badge'
import { Card } from '../ui/card'

export function AccountIdentityCard({
  user,
  subscription,
}: {
  user: WebUser | null | undefined
  subscription: UserSubscription | null | undefined
}) {
  return (
    <Card className="grid gap-6 bg-white/[0.04] p-5">
      <div className="grid gap-2">
        <span className="eyebrow">Identity</span>
        <h2 className="page-title text-[24px]">账户身份</h2>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Info label="显示名称" value={user?.displayName || '--'} />
        <Info label="手机号" value={user?.phone || '--'} />
        <Info label="当前套餐" value={subscription?.planName || '未开通'} />
        <Info label="账户状态" value={<StatusBadge status={user?.status} />} />
        <Info label="会员状态" value={<StatusBadge status={subscription?.status} />} />
        <Info label="最近更新" value={formatDateTime(user?.updatedAt)} />
      </div>
    </Card>
  )
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid gap-1">
      <span className="eyebrow">{label}</span>
      <div className="text-sm font-medium text-white">{value}</div>
    </div>
  )
}
