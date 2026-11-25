import Link from 'next/link'
import { KeyRound, MonitorSmartphone, RefreshCcw, ShieldCheck } from 'lucide-react'

import { PlanCards } from '@/components/site/plan-cards'
import { SectionHeading, SiteShell } from '@/components/site/site-shell'

const NOTES = [
  { icon: ShieldCheck, title: '额度写清楚', desc: '功能与插件按套餐开放；AI 生成额度以套餐卡片上写的为准。' },
  { icon: RefreshCcw, title: '时长叠加', desc: '会员期内续费，时长在原到期时间上顺延。' },
  { icon: MonitorSmartphone, title: '多台电脑', desc: '按套餐绑定电脑，可在用户中心自助解绑更换。' },
  { icon: KeyRound, title: '兑换码', desc: '从渠道购买的兑换码，可在用户中心直接开通。' },
]

export default function PricingPage() {
  return (
    <SiteShell>
      <section className="mx-auto grid w-full max-w-[1200px] gap-12 px-4 py-16 sm:px-6 lg:py-20">
        <SectionHeading center eyebrow="价格" title="选择适合你的套餐" desc="联系客服购买卡密，兑换后立即开通。" />
        <PlanCards />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {NOTES.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="grid gap-2 rounded-2xl border border-[var(--border-base)] p-5">
              <Icon className="h-5 w-5 text-[var(--primary)]" />
              <h3 className="font-semibold">{title}</h3>
              <p className="text-sm leading-relaxed text-[var(--text-secondary)]">{desc}</p>
            </div>
          ))}
        </div>
        <p className="text-center text-sm text-[var(--text-muted)]">
          已经有兑换码？
          <Link href="/account/redeem" className="ml-1 font-medium text-[var(--primary)] hover:underline">
            去兑换
          </Link>
        </p>
      </section>
    </SiteShell>
  )
}
