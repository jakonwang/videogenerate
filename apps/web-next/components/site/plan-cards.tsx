'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Check, LoaderCircle } from 'lucide-react'

import type { CloudFeature, CloudPlan } from '@shared/cloud/types'
import { formatYuan, useCloudUser, userClient } from '@/lib/cloud-user'
import { cn } from '@/lib/utils'

const FEATURE_LABELS: Record<string, string> = {
  clone: '爆款视频复刻',
  production: '批量生产与任务中心',
  models: 'AI 模特库',
  'asset-library': '素材库',
  'product-research': '选品调研',
  plugins: '插件市场',
  'gmv-max': 'GMV Max 投放助手',
  'creator-hub': '达人管理中心',
}

function featureList(features: CloudFeature[]) {
  if (features.includes('*')) return ['全部功能与插件', '爆款复刻与批量生产', 'GMV Max 与达人中心']
  return features.map((f) => FEATURE_LABELS[f] ?? f)
}

function perDay(plan: CloudPlan) {
  if (!plan.days) return null
  return `约 ${formatYuan(Math.round(plan.amountFen / plan.days))} / 天`
}

export function PlanCards({ compact = false }: { compact?: boolean }) {
  const { me } = useCloudUser()
  const [plans, setPlans] = useState<CloudPlan[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    userClient
      .listPlans()
      .then((result) => setPlans(result.plans))
      .catch((err) => setError((err as Error).message))
  }, [])

  if (error) return <p className="text-center text-sm text-[var(--text-muted)]">价格暂时加载不出来：{error}</p>
  if (!plans) {
    return (
      <div className="flex justify-center py-10 text-[var(--text-muted)]">
        <LoaderCircle className="h-5 w-5 animate-spin" />
      </div>
    )
  }

  const featuredIndex = plans.length >= 3 ? 1 : -1

  return (
    <div className={cn('grid gap-4', plans.length >= 3 ? 'md:grid-cols-3' : 'md:grid-cols-2')}>
      {plans.map((plan, index) => {
        const featured = index === featuredIndex
        const target = `/account/buy?plan=${encodeURIComponent(plan.code)}`
        const href = me ? target : `/login?next=${encodeURIComponent(target)}`
        return (
          <article
            key={plan.code}
            className={cn(
              'relative flex flex-col gap-5 rounded-2xl border p-6',
              featured ? 'border-[var(--primary-border)] bg-[var(--bg-panel)] shadow-[0_24px_60px_rgba(109,93,255,0.18)]' : 'border-[var(--border-base)] bg-[var(--bg-panel)]',
            )}
          >
            {featured ? (
              <span className="absolute -top-3 left-6 rounded-full bg-[var(--primary)] px-3 py-1 text-xs font-semibold text-white">最受欢迎</span>
            ) : null}
            <div className="grid gap-1.5">
              <h3 className="text-lg font-semibold">{plan.name}</h3>
              {plan.description ? <p className="text-sm text-[var(--text-muted)]">{plan.description}</p> : null}
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-[40px] font-semibold leading-none tracking-[-0.03em] tabular-nums">{formatYuan(plan.amountFen)}</span>
              <span className="text-sm text-[var(--text-muted)]">/ {plan.days === 0 ? '永久' : `${plan.days} 天`}</span>
            </div>
            {perDay(plan) ? <span className="-mt-3 text-xs text-[var(--text-muted)]">{perDay(plan)}</span> : null}
            {!compact ? (
              <ul className="grid gap-2.5 text-sm text-[var(--text-secondary)]">
                {[...featureList(plan.features), plan.maxDevices === 0 ? '不限设备数' : `可绑定 ${plan.maxDevices} 台电脑`].map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--success)]" /> {item}
                  </li>
                ))}
              </ul>
            ) : (
              <span className="text-sm text-[var(--text-secondary)]">{plan.maxDevices === 0 ? '不限设备数' : `可绑定 ${plan.maxDevices} 台电脑`}</span>
            )}
            <Link
              href={href}
              className={cn(
                'mt-auto inline-flex h-11 items-center justify-center rounded-xl text-sm font-semibold transition',
                featured
                  ? 'bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)]'
                  : 'border border-[var(--border-strong)] text-[var(--text-main)] hover:border-[var(--primary-border)] hover:text-[var(--primary)]',
              )}
            >
              立即购买
            </Link>
          </article>
        )
      })}
    </div>
  )
}
