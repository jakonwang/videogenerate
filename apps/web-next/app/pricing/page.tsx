'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Check, Cpu, Download, Users } from 'lucide-react'

import { ErrorState } from '@/components/app/page-state'
import { MarketingShell } from '@/components/marketing/marketing-shell'
import { apiClient } from '@/lib/api-client'

const packageCards = [
  {
    name: '基础版',
    price: '¥699',
    hint: '/ 月',
    team: '1-2 人团队',
    credits: '含 800 算力 / 月',
    features: ['爆款复刻工作台', '模板与素材管理', '基础任务协同', '桌面客户端接入'],
    featured: false,
  },
  {
    name: '专业版',
    price: '¥1,999',
    hint: '/ 月',
    team: '3-8 人团队',
    credits: '含 3,000 算力 / 月',
    features: ['多项目并行生产', '更高任务额度', '批量任务调度', '优先支持与治理能力'],
    featured: true,
  },
  {
    name: '团队版',
    price: '定制',
    hint: '',
    team: '8 人以上团队',
    credits: '按团队规模和产能定制',
    features: ['团队权限与协同治理', '部署与交付支持', '专属客户成功', '更灵活的算力方案'],
    featured: false,
  },
] as const

export default function PricingPage() {
  const plansQuery = useQuery({
    queryKey: ['public-pricing-plans'],
    queryFn: () => apiClient.listPlans(),
  })

  return (
    <MarketingShell active="pricing">
      <section className="marketing-panel-surface grid gap-4 rounded-[24px] p-8 max-[960px]:p-6">
        <div className="marketing-kicker-chip inline-flex w-fit items-center rounded-full px-3 py-1 text-xs font-semibold">Pricing</div>
        <h1 className="m-0 text-[clamp(36px,4.4vw,56px)] font-bold leading-[1.06] tracking-[-0.06em] text-[var(--text-main)]">会员能力 + 算力包的企业级定价结构</h1>
        <p className="m-0 max-w-4xl text-sm leading-8 text-[var(--text-secondary)]">
          工作台能力和桌面端执行能力统一交付，但计费表达保持清晰分层。会员负责承载工作台权限与基础生产能力，算力包负责覆盖更高频和更大规模的执行需求。
        </p>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {packageCards.map((item) => (
          <div
            key={item.name}
            className={`grid gap-4 rounded-[22px] p-6 ${
              item.featured
                ? 'marketing-card-surface shadow-[0_0_0_1px_rgba(109,93,255,0.14),0_24px_64px_rgba(109,93,255,0.16)]'
                : 'marketing-card-surface'
            }`}
          >
            <div className="grid gap-2">
              <strong className="text-xl text-[var(--text-main)]">{item.name}</strong>
              <span className="text-sm text-[var(--text-secondary)]">{item.team}</span>
            </div>
            <div className="flex items-baseline gap-2">
              <strong className="text-4xl leading-none text-[var(--text-main)]">{item.price}</strong>
              <span className="text-sm text-[var(--text-muted)]">{item.hint}</span>
            </div>
            <div className="grid gap-1">
              <strong className="text-sm text-[var(--text-main)]">{item.credits}</strong>
              <span className="text-sm leading-7 text-[var(--text-secondary)]">适用于企业级 AI 视频生产工作台与桌面端协同链路。</span>
            </div>
            <ul className="grid gap-2">
              {item.features.map((feature) => (
                <li key={feature} className="flex items-center gap-3 text-sm text-[var(--text-secondary)]">
                  <Check className="h-4 w-4 text-cyan-500" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="marketing-panel-surface grid gap-4 rounded-[24px] p-8 max-[960px]:p-6">
          <div className="marketing-kicker-chip inline-flex w-fit items-center rounded-full px-3 py-1 text-xs font-semibold">Compute Packs</div>
          <h2 className="m-0 text-2xl font-semibold text-[var(--text-main)]">算力包用于覆盖额外生产需求</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {[200, 500, 1000].map((credits) => (
              <div key={credits} className="marketing-card-surface grid gap-2 rounded-[18px] p-[22px]">
                <Cpu className="h-5 w-5 text-violet-500" />
                <strong className="text-base text-[var(--text-main)]">{credits} 算力包</strong>
                <p className="m-0 text-sm leading-7 text-[var(--text-secondary)]">适合活动期冲量、批量导出或高密度内容生产。</p>
              </div>
            ))}
          </div>
          {plansQuery.isPending ? (
            <div className="skeleton min-h-[110px] rounded-[18px] border border-[var(--border-base)] bg-[var(--marketing-card-bg)]" />
          ) : plansQuery.isError ? (
            <div className="marketing-card-surface rounded-[18px] p-0">
              <ErrorState
                compact
                title="动态套餐信息暂时不可用"
                description={plansQuery.error instanceof Error ? `${plansQuery.error.message}，页面已回退为静态公开定价。` : '当前无法读取动态套餐接口，页面已回退为静态公开定价。'}
                onRetry={() => void plansQuery.refetch()}
              />
            </div>
          ) : plansQuery.data?.length ? (
            <div className="marketing-card-surface grid gap-2 rounded-[18px] p-[22px]">
              <strong className="text-base text-[var(--text-main)]">已接入当前后端套餐接口</strong>
              <p className="m-0 text-sm leading-7 text-[var(--text-secondary)]">公开定价页已复用 `listPlans()` 作为动态数据来源，后续可以直接切换为正式计费文案与价格体系。</p>
            </div>
          ) : (
            <div className="rounded-[16px] border border-dashed border-[var(--border-base)] px-5 py-4 text-sm text-[var(--text-muted)]">
              当前未读取到动态套餐列表，页面已回退为静态定价展示，不影响公开演示。正式报价与签约细节请联系商务或直接进入工作台查看会员中心。
            </div>
          )}
        </div>

        <div className="marketing-panel-surface grid gap-4 rounded-[24px] p-8 max-[960px]:p-6">
          <div className="marketing-kicker-chip inline-flex w-fit items-center rounded-full px-3 py-1 text-xs font-semibold">Decision Guide</div>
          <h2 className="m-0 text-2xl font-semibold text-[var(--text-main)]">客户决策辅助</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="marketing-card-surface grid gap-2 rounded-[18px] p-[22px]">
              <Users className="h-5 w-5 text-cyan-500" />
              <strong className="text-base text-[var(--text-main)]">适合谁使用</strong>
              <p className="m-0 text-sm leading-7 text-[var(--text-secondary)]">内容团队、电商矩阵团队、短视频代运营和有批量出片需求的业务团队。</p>
            </div>
            <div className="marketing-card-surface grid gap-2 rounded-[18px] p-[22px]">
              <Download className="h-5 w-5 text-violet-500" />
              <strong className="text-base text-[var(--text-main)]">运行方式</strong>
              <p className="m-0 text-sm leading-7 text-[var(--text-secondary)]">直播切片与成片生产依赖桌面客户端；Web 工作台用于配置、查看与协同。</p>
            </div>
          </div>
          <Link href="/download" className="inline-flex min-h-[44px] w-fit items-center gap-2 rounded-xl border border-[rgba(109,93,255,0.4)] bg-[linear-gradient(135deg,#6d5dff,#8b5cf6)] px-5 text-sm font-semibold text-white shadow-[0_12px_32px_rgba(109,93,255,0.28)]">
            查看客户端安装方式
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </MarketingShell>
  )
}
