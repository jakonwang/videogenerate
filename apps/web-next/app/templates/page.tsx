'use client'

import { useMutation, useQuery } from '@tanstack/react-query'
import { ArrowRight, CopyPlus, Layers3 } from 'lucide-react'
import { useRouter } from 'next/navigation'

import { AppShell } from '@/components/app/app-shell'
import { EmptyState, ErrorState, LoadingState } from '@/components/app/page-state'
import { ProtectedPageGate } from '@/components/app/protected-page-gate'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useAuthGuard } from '@/hooks/use-auth-guard'
import { apiClient } from '@/lib/api-client'

const templates = [
  {
    id: 'tiktok-seeding',
    name: '种草带货模板',
    desc: '适合 15-30 秒电商种草视频，强调开头抓人、卖点密集和结尾转化。',
    stage: '参考分析 -> 成片合成',
  },
  {
    id: 'ugc-review',
    name: 'UGC 口播测评',
    desc: '偏真实口播和生活场景，适合护肤、穿搭、3C 测评类内容。',
    stage: '脚本评分 -> 分镜视频',
  },
  {
    id: 'fast-matrix',
    name: '矩阵批量派生',
    desc: '固定商品、固定人设、快速派生多版本，用于广告投放和矩阵账号。',
    stage: '脚本变体 -> 批量出片',
  },
] as const

export default function TemplatesPage() {
  const router = useRouter()
  const auth = useAuthGuard()

  const plansQuery = useQuery({
    queryKey: ['billing-plans'],
    queryFn: () => apiClient.listPlans(),
  })

  const createMutation = useMutation({
    mutationFn: (template: (typeof templates)[number]) =>
      apiClient.createCloneProject({
        title: template.name,
        description: template.desc,
        locale: 'zh-CN',
      }),
    onSuccess: (result, template) => {
      if (result.project?.id) router.push(`/clone/${result.project.id}?template=${template.id}`)
    },
  })

  const gate = ProtectedPageGate({
    auth,
    restoringTitle: '正在恢复模板库',
    restoringDescription: '系统正在准备模板入口和套餐能力摘要。',
  })

  if (gate) return gate

  return (
    <AppShell>
      <div className="page-shell">
        <section className="panel grid gap-4 px-6 py-5">
          <div className="page-header">
            <div className="page-header__copy">
              <h1 className="page-title">模板库</h1>
              <p className="body-copy max-w-3xl">集中管理适合当前工作台的生产模板，统一沉淀适用场景、阶段链路和开任务入口。</p>
            </div>
            <div className="page-header__actions">
              <Button variant="secondary" onClick={() => router.push('/clone')}>
                查看任务中心
              </Button>
            </div>
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {templates.length ? templates.map((template) => (
              <Card key={template.id} className="grid gap-4 p-5">
                <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[rgba(109,93,255,0.12)] text-violet-200">
                  <Layers3 className="h-5 w-5" />
                </div>
                <div className="stack-title">
                  <strong className="text-base text-white">{template.name}</strong>
                  <span className="stack-copy">{template.desc}</span>
                </div>
                <div className="soft-card soft-card--dense meta-list">
                  <strong>适用链路</strong>
                  <span>{template.stage}</span>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => createMutation.mutate(template)} disabled={createMutation.isPending}>
                    <CopyPlus className="h-4 w-4" />
                    使用模板
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => router.push('/clone')}>
                    <ArrowRight className="h-4 w-4" />
                    去任务中心
                  </Button>
                </div>
              </Card>
            )) : (
              <EmptyState compact title="暂无可用模板" description="当前还没有整理好的工作台模板，请先从任务中心手动创建任务。" actionLabel="去任务中心" onAction={() => router.push('/clone')} />
            )}
          </div>

          <aside className="grid gap-4">
            <Card className="grid gap-4 p-5">
              <h2 className="section-title">使用说明</h2>
              <div className="grid gap-2">
                <div className="soft-card soft-card--dense meta-list">
                  <strong>模板职责</strong>
                  <span>模板页负责沉淀生产方式，不反向承载任务编辑逻辑。</span>
                </div>
                <div className="soft-card soft-card--dense meta-list">
                  <strong>创建行为</strong>
                  <span>点击“使用模板”会直接创建一个新的复刻任务，并进入详情工作台。</span>
                </div>
              </div>
            </Card>

            <Card className="grid gap-4 p-5">
              <h2 className="section-title">套餐能力</h2>
              <div className="grid gap-2">
                {plansQuery.isPending ? <LoadingState compact title="正在加载套餐信息" description="请稍候，系统正在读取当前可用套餐。" /> : null}
                {plansQuery.isError ? (
                  <ErrorState
                    compact
                    title="套餐信息加载失败"
                    description={plansQuery.error instanceof Error ? plansQuery.error.message : '当前无法读取套餐信息。'}
                    onRetry={() => void plansQuery.refetch()}
                  />
                ) : null}
                {!plansQuery.isPending && !plansQuery.isError && (plansQuery.data || []).slice(0, 3).map((plan) => (
                  <div key={plan.id} className="soft-card soft-card--dense meta-list">
                    <strong>{plan.name}</strong>
                    <span>{plan.durationDays} 天 · 每月 {plan.monthlyComputeCredits} 算力</span>
                  </div>
                ))}
                {!plansQuery.isPending && !plansQuery.isError && !plansQuery.data?.length ? <div className="soft-card soft-card--dense text-sm text-slate-500">暂无套餐信息</div> : null}
              </div>
            </Card>
          </aside>
        </section>
      </div>
    </AppShell>
  )
}
