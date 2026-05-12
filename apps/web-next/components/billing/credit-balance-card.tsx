import type { WalletAccount } from '@shared/web-api/types'

import { Card } from '../ui/card'

export function CreditBalanceCard({ wallet }: { wallet: WalletAccount | null | undefined }) {
  return (
    <Card className="grid gap-6 p-5">
      <div className="grid gap-2">
        <span className="eyebrow">Credits</span>
        <h2 className="page-title text-[24px]">{wallet?.balanceCredits ?? 0}</h2>
        <p className="body-copy text-sm">算力用于高成本的参考分析、出图、出视频和最终合成。</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Stat label="累计充值" value={String(wallet?.totalChargedCredits ?? 0)} />
        <Stat label="累计退款" value={String(wallet?.totalRefundedCredits ?? 0)} />
      </div>
    </Card>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1">
      <span className="eyebrow">{label}</span>
      <strong className="text-sm text-white">{value}</strong>
    </div>
  )
}
