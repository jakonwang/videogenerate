'use client'

import type { SubscriptionPlan } from '@shared/web-api/types'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowRight,
  Check,
  ChevronRight,
  Clock3,
  CreditCard,
  Crown,
  Gem,
  Headset,
  ShieldCheck,
  Sparkles,
  Wand2,
  Wallet,
  Zap,
} from 'lucide-react'
import { useMemo, useState } from 'react'

import { AppShell } from '@/components/app/app-shell'
import { ErrorState, LoadingState } from '@/components/app/page-state'
import { ProtectedPageGate } from '@/components/app/protected-page-gate'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useAuthGuard } from '@/hooks/use-auth-guard'
import { apiClient } from '@/lib/api-client'
import { cn, formatDateTime, formatStatusLabel } from '@/lib/utils'
import { useSessionStore } from '@/store/session-store'

const rights = [
  { icon: Zap, title: '高优先级任务处理', description: '任务处理优先级提升，减少排队等待时间。' },
  { icon: Wand2, title: '导出无水印', description: '导出视频不带平台水印。' },
  { icon: ShieldCheck, title: '商业许可', description: '生成内容可用于商业用途。' },
  { icon: Headset, title: '专属客服支持', description: '7 × 12 小时专属客服通道。' },
] as const

export default function BillingPage() {
  const auth = useAuthGuard()
  const queryClient = useQueryClient()
  const wallet = useSessionStore((state) => state.wallet)
  const subscription = useSessionStore((state) => state.subscription)
  const user = useSessionStore((state) => state.user)
  const [paymentHint, setPaymentHint] = useState('')
  const [activeTab, setActiveTab] = useState<'plans' | 'orders' | 'usage'>('plans')

  const plansQuery = useQuery({
    queryKey: ['billing-plans'],
    queryFn: () => apiClient.listPlans(),
  })

  const ordersQuery = useQuery({
    queryKey: ['billing-orders'],
    queryFn: () => apiClient.listOrders(),
  })

  const createOrderMutation = useMutation({
    mutationFn: (input: { type: 'subscription' | 'compute_pack'; planId?: string; credits?: number }) =>
      apiClient.createOrder({
        ...input,
        paymentChannel: 'mock_wechat',
      }),
    onSuccess: async (result) => {
      setPaymentHint(`订单 ${result.order.id} 已创建，可在右侧完成模拟支付。`)
      await queryClient.invalidateQueries({ queryKey: ['billing-orders'] })
    },
  })

  const payOrderMutation = useMutation({
    mutationFn: (orderId: string) => apiClient.payMockOrder(orderId),
    onSuccess: async () => {
      setPaymentHint('模拟支付已完成，会员信息和算力余额已同步刷新。')
      await queryClient.invalidateQueries({ queryKey: ['billing-orders'] })
      await queryClient.invalidateQueries({ queryKey: ['profile'] })
    },
  })

  const plans = plansQuery.data?.length ? plansQuery.data : fallbackPlans()
  const orders = ordersQuery.data || []
  const latestPendingOrder = orders.find((item) => item.status === 'pending')
  const paidOrders = orders.filter((item) => item.status === 'paid')
  const totalSpent = paidOrders.reduce((sum, item) => sum + item.amountCny, 0)

  const totalCredits = wallet?.balanceCredits ?? 380
  const totalChargedCredits = wallet?.totalChargedCredits ?? 420
  const totalRefundedCredits = wallet?.totalRefundedCredits ?? 0
  const usedCredits = Math.max(totalChargedCredits - totalCredits - totalRefundedCredits, 0)
  const currentPlanName = subscription?.planName || '专业会员'
  const expiresText = subscription?.expiresAt ? formatDateTime(subscription.expiresAt) : '长期有效'
  const statusText = subscription?.status === 'active' ? '自动续费中' : subscription?.status === 'expired' ? '已过期' : '未开通'
  const userName = user?.displayName || '测试用户'
  const planId = subscription?.planId

  const currentPlan = useMemo(() => {
    return plans.find((item) => item.id === planId) || plans[1] || plans[0]
  }, [planId, plans])

  const monthlyAllowance = currentPlan?.monthlyComputeCredits ?? 420
  const usagePercent = monthlyAllowance > 0 ? Math.min((usedCredits / monthlyAllowance) * 100, 100) : 0
  const monthlyUsed = Math.min(monthlyAllowance, Math.max(usedCredits, 320))
  const concurrentTasks = currentPlan?.id === 'team' ? 10 : currentPlan?.id === 'basic' ? 2 : 3

  const gate = ProtectedPageGate({
    auth,
    restoringTitle: '正在恢复会员中心',
    restoringDescription: '系统正在同步套餐、订单和算力余额。',
  })

  if (gate) return gate

  const billingPending = plansQuery.isPending && ordersQuery.isPending && !subscription && !wallet
  const billingError = plansQuery.isError && ordersQuery.isError && !orders.length

  return (
    <AppShell headerSearchPlaceholder="搜索套餐、模型、模版或设置项">
      <div className="page-shell grid gap-5">
        <section className="grid gap-2">
          <div className="flex items-center gap-3">
            <h1 className="text-[24px] font-semibold tracking-[-0.04em] text-white">会员中心</h1>
            <Gem className="h-5 w-5 text-violet-400" />
          </div>
          <p className="text-[14px] text-slate-400">管理您的会员套餐、算力使用和订单记录</p>
        </section>

        {billingPending ? <LoadingState title="正在加载会员信息" description="请稍候，系统正在读取套餐、订单和算力使用情况。" /> : null}

        {billingError ? (
          <ErrorState
            title="会员数据加载失败"
            description="当前无法同时读取套餐和订单信息，请稍后重试。"
            onRetry={() => {
              void plansQuery.refetch()
              void ordersQuery.refetch()
            }}
          />
        ) : null}

        {!billingPending && !billingError ? (
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_560px]">
            <div className="grid gap-5">
              <Card className="rounded-[26px] border-white/6 bg-[linear-gradient(135deg,rgba(30,33,86,0.96),rgba(12,20,34,0.96))] p-0 shadow-[0_20px_48px_rgba(4,10,24,0.28)]">
                <div className="grid gap-5 px-7 py-7 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)] xl:items-center">
                  <div className="grid gap-4">
                    <div className="flex items-center gap-5">
                      <div className="grid h-[116px] w-[116px] place-items-center rounded-[34px] bg-[radial-gradient(circle_at_top,rgba(153,128,255,0.9),rgba(77,58,219,0.92))] shadow-[0_24px_50px_rgba(90,70,255,0.3)]">
                        <div className="grid h-[82px] w-[82px] place-items-center rounded-[28px] border border-white/18 bg-[linear-gradient(180deg,rgba(255,255,255,0.12),rgba(255,255,255,0.04))]">
                          <Crown className="h-9 w-9 text-white" />
                        </div>
                      </div>

                      <div className="grid gap-2">
                        <span className="text-[14px] font-medium text-cyan-300">当前套餐</span>
                        <div className="text-[24px] font-semibold text-white">{currentPlanName}</div>
                        <div className="text-[14px] text-slate-300">有效期至 {expiresText}</div>
                        <span className="inline-flex w-fit items-center rounded-full bg-violet-500/16 px-3 py-1 text-[12px] font-medium text-violet-100">
                          {statusText}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 border-t border-white/6 pt-4 xl:grid-cols-3 xl:border-l xl:border-t-0 xl:pt-0 xl:pl-6">
                    <MetricBlock label="剩余算力" value={String(totalCredits)} sub={` / ${monthlyAllowance} 算力`} />
                    <MetricBlock label="每日重置量" value={String(monthlyAllowance)} sub="算力 / 天" />
                    <MetricBlock label="并发任务" value={String(concurrentTasks)} sub="任务并发" />
                  </div>
                </div>
              </Card>

              <div className="flex items-center gap-10 border-b border-white/8 px-2">
                {[
                  { id: 'plans', label: '套餐选择' },
                  { id: 'orders', label: '我的订单' },
                  { id: 'usage', label: '使用统计' },
                ].map((tab) => {
                  const active = activeTab === tab.id
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveTab(tab.id as 'plans' | 'orders' | 'usage')}
                      className={cn(
                        'border-b-2 px-2 pb-4 text-[15px] font-medium transition',
                        active ? 'border-violet-400 text-cyan-300' : 'border-transparent text-slate-400 hover:text-white',
                      )}
                    >
                      {tab.label}
                    </button>
                  )
                })}
              </div>

              {activeTab === 'plans' ? (
                <div className="grid gap-5 xl:grid-cols-3">
                  {plans.map((plan, index) => {
                    const mapped = mapPlan(plan, index)
                    const isCurrent = planId ? plan.id === planId : index === 1
                    const isRecommended = plan.id === 'pro' || index === 1

                    return (
                      <Card
                        key={plan.id}
                        className={cn(
                          'rounded-[24px] border-white/8 bg-[linear-gradient(180deg,rgba(12,20,34,0.96),rgba(9,15,27,0.98))] p-0 shadow-none',
                          isCurrent && 'border-violet-400/70 shadow-[0_0_0_1px_rgba(109,93,255,0.2)]',
                        )}
                      >
                        <div className="grid gap-5 px-5 py-5">
                          <div className="flex items-start justify-between gap-3">
                            <div className="grid gap-3">
                              <div className="text-[16px] font-semibold text-white">{mapped.title}</div>
                              <div className="flex items-end gap-1 text-white">
                                <strong className="text-[21px] font-semibold">¥ {plan.priceCny}</strong>
                                <span className="pb-0.5 text-[15px] text-slate-300">/ 月</span>
                              </div>
                            </div>
                            {isCurrent ? (
                              <span className="grid h-7 w-7 place-items-center rounded-full bg-violet-500 text-white">
                                <Check className="h-4 w-4" />
                              </span>
                            ) : isRecommended ? (
                              <span className="rounded-full bg-violet-500/18 px-3 py-1 text-[12px] font-medium text-violet-100">推荐</span>
                            ) : null}
                          </div>

                          <div className="grid gap-3 text-[14px] text-slate-300">
                            {mapped.features.map((feature) => (
                              <div key={feature} className="flex items-center gap-3">
                                <Check className="h-4 w-4 text-violet-300" />
                                <span>{feature}</span>
                              </div>
                            ))}
                          </div>

                          <Button
                            className={cn('h-11 rounded-[14px]', isRecommended ? '' : 'bg-transparent')}
                            variant={isRecommended ? 'default' : 'secondary'}
                            disabled={loadingDisabled(createOrderMutation.isPending, payOrderMutation.isPending) || !plan.enabled}
                            onClick={() => createOrderMutation.mutate({ type: 'subscription', planId: plan.id })}
                          >
                            {isCurrent ? '当前套餐' : mapped.title === '企业会员' ? '联系我们' : '立即升级'}
                          </Button>
                        </div>
                      </Card>
                    )
                  })}
                </div>
              ) : null}

              {activeTab === 'usage' || activeTab === 'plans' ? (
                <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(280px,0.4fr)]">
                  <Card className="rounded-[24px] border-white/8 bg-[linear-gradient(180deg,rgba(12,20,34,0.96),rgba(9,15,27,0.98))] px-6 py-5 shadow-none">
                    <div className="grid gap-5">
                      <div className="flex items-center gap-4">
                        <div className="grid h-[92px] w-[92px] place-items-center rounded-full bg-[conic-gradient(from_180deg_at_50%_50%,#6d5dff_0deg,#24d0ff_270deg,rgba(255,255,255,0.08)_270deg,rgba(255,255,255,0.08)_360deg)]">
                          <div className="grid h-[76px] w-[76px] place-items-center rounded-full bg-[#0d1626]">
                            <span className="text-[20px] font-semibold text-white">{Math.round(usagePercent || 76)}%</span>
                          </div>
                        </div>
                        <div className="grid gap-2">
                          <div className="text-[14px] text-slate-400">今日已使用</div>
                          <div className="text-[17px] text-white">
                            <strong className="text-[20px] font-semibold">{monthlyUsed}</strong>
                            <span className="text-slate-400"> / {monthlyAllowance} 算力</span>
                          </div>
                        </div>
                      </div>

                      <div className="grid h-[92px] grid-cols-24 items-end gap-2 rounded-[18px] border border-white/6 bg-[rgba(255,255,255,0.02)] px-4 py-4">
                        {Array.from({ length: 24 }).map((_, index) => {
                          const height = 14 + ((index * 7) % 48)
                          const active = index < 13
                          return (
                            <div key={index} className="flex h-full items-end justify-center">
                              <div
                                className={cn(
                                  'w-full rounded-full',
                                  active ? 'bg-[linear-gradient(180deg,#5a59ff,#2fc8ff)]' : 'bg-white/10',
                                )}
                                style={{ height }}
                              />
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </Card>

                  <Card className="rounded-[24px] border-white/8 bg-[linear-gradient(180deg,rgba(12,20,34,0.96),rgba(9,15,27,0.98))] px-6 py-5 shadow-none">
                    <div className="grid gap-3">
                      <div className="text-[14px] text-slate-400">本月累计使用</div>
                      <div className="text-[20px] font-semibold text-white">2,450 算力</div>
                      <div className="text-[13px] text-slate-500">剩余 3,550 算力</div>
                    </div>
                  </Card>
                </div>
              ) : null}

              {activeTab === 'orders' ? (
                <Card className="rounded-[24px] border-white/8 bg-[linear-gradient(180deg,rgba(12,20,34,0.96),rgba(9,15,27,0.98))] px-6 py-5 shadow-none">
                  <div className="grid gap-4">
                    {orders.length ? (
                      orders.map((order) => (
                        <div key={order.id} className="grid grid-cols-[minmax(0,1fr)_120px_120px] items-center gap-4 border-b border-white/8 pb-4 last:border-b-0 last:pb-0">
                          <div className="grid gap-1">
                            <strong className="text-[15px] text-white">
                              {order.planName || (order.type === 'compute_pack' ? `${order.credits ?? 0} 算力包` : '会员订单')}
                            </strong>
                            <span className="text-[13px] text-slate-500">订单号：{order.id}</span>
                          </div>
                          <div className="text-right text-[15px] font-semibold text-white">¥ {order.amountCny}</div>
                          <div className="text-right text-[14px] text-emerald-400">{formatStatusLabel(order.status)}</div>
                        </div>
                      ))
                    ) : (
                      <div className="text-[14px] text-slate-500">暂无订单记录</div>
                    )}
                  </div>
                </Card>
              ) : null}
            </div>

            <div className="grid content-start gap-5">
              <Card className="rounded-[24px] border-white/8 bg-[linear-gradient(180deg,rgba(12,20,34,0.96),rgba(9,15,27,0.98))] p-6 shadow-none">
                <div className="mb-5 flex items-center justify-between gap-4">
                  <h3 className="text-[18px] font-semibold text-white">会员权益</h3>
                  <button type="button" className="inline-flex items-center gap-1 text-[14px] text-slate-400 transition hover:text-white">
                    查看全部
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
                <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_220px]">
                  <div className="grid gap-4">
                    {rights.map((item) => {
                      const Icon = item.icon
                      return (
                        <div key={item.title} className="flex items-start gap-4">
                          <div className="grid h-10 w-10 place-items-center rounded-full bg-[linear-gradient(180deg,rgba(103,83,255,0.24),rgba(91,68,255,0.12))] text-violet-300">
                            <Icon className="h-4 w-4" />
                          </div>
                          <div className="grid gap-1">
                            <strong className="text-[15px] text-white">{item.title}</strong>
                            <span className="text-[13px] leading-6 text-slate-400">{item.description}</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  <div className="grid place-items-center rounded-[22px] bg-[radial-gradient(circle_at_center,rgba(96,76,255,0.2),transparent_60%),linear-gradient(180deg,rgba(21,28,47,0.8),rgba(10,16,28,0.88))]">
                    <Crown className="h-28 w-28 text-violet-300/90 drop-shadow-[0_0_24px_rgba(109,93,255,0.45)]" />
                  </div>
                </div>
              </Card>

              <Card className="rounded-[24px] border-white/8 bg-[linear-gradient(180deg,rgba(12,20,34,0.96),rgba(9,15,27,0.98))] p-6 shadow-none">
                <div className="mb-5 flex items-center justify-between gap-4">
                  <h3 className="text-[18px] font-semibold text-white">最近订单</h3>
                  <button type="button" className="inline-flex items-center gap-1 text-[14px] text-slate-400 transition hover:text-white">
                    查看全部
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>

                <div className="grid gap-3">
                  {orders.slice(0, 4).map((order) => (
                    <div key={order.id} className="grid grid-cols-[44px_minmax(0,1fr)_90px_120px] items-center gap-4 border-b border-white/8 pb-4 last:border-b-0 last:pb-0">
                      <div className={cn('grid h-11 w-11 place-items-center rounded-2xl text-white', order.type === 'compute_pack' ? 'bg-[linear-gradient(180deg,#f59e0b,#b45309)]' : 'bg-[linear-gradient(180deg,#6d5dff,#4f46e5)]')}>
                        <CreditCard className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-[15px] font-medium text-white">
                          {order.planName || (order.type === 'compute_pack' ? `${order.credits ?? 0} 算力包` : '会员订单')}
                        </div>
                        <div className="truncate text-[13px] text-slate-500">订单号：{order.id}</div>
                      </div>
                      <div className="text-right text-[15px] font-semibold text-white">¥ {order.amountCny}</div>
                      <div className="text-right">
                        <div className="text-[14px] font-medium text-emerald-400">{formatStatusLabel(order.status)}</div>
                        <div className="text-[12px] text-slate-500">{formatDateTime(order.updatedAt).slice(0, 16)}</div>
                      </div>
                    </div>
                  ))}

                  {!orders.length && !ordersQuery.isPending ? <div className="text-[14px] text-slate-500">暂无订单记录</div> : null}
                </div>

                <button type="button" className="mt-5 inline-flex items-center gap-2 text-[15px] font-medium text-cyan-300 transition hover:text-white">
                  查看全部订单
                  <ArrowRight className="h-4 w-4" />
                </button>
              </Card>

              {latestPendingOrder ? (
                <Card className="rounded-[24px] border-white/8 bg-[linear-gradient(180deg,rgba(12,20,34,0.96),rgba(9,15,27,0.98))] p-6 shadow-none">
                  <div className="grid gap-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="grid gap-1">
                        <span className="text-[13px] text-slate-400">待支付订单</span>
                        <strong className="text-[16px] text-white">{latestPendingOrder.id}</strong>
                        <span className="text-[13px] text-slate-500">金额 ¥ {latestPendingOrder.amountCny}</span>
                      </div>
                      <Button size="sm" disabled={payOrderMutation.isPending} onClick={() => payOrderMutation.mutate(latestPendingOrder.id)}>
                        {payOrderMutation.isPending ? '支付处理中...' : '完成支付'}
                      </Button>
                    </div>
                    {paymentHint ? <div className="rounded-[16px] border border-white/8 bg-white/[0.03] px-4 py-3 text-[13px] leading-6 text-slate-300">{paymentHint}</div> : null}
                  </div>
                </Card>
              ) : null}

              <Card className="rounded-[24px] border-white/8 bg-[linear-gradient(180deg,rgba(12,20,34,0.96),rgba(9,15,27,0.98))] p-6 shadow-none">
                <div className="mb-4 flex items-center justify-between gap-4">
                  <div>
                    <span className="text-[13px] text-slate-400">账户摘要</span>
                    <h3 className="mt-1 text-[18px] font-semibold text-white">当前账户状态</h3>
                  </div>
                  <Clock3 className="h-4 w-4 text-slate-500" />
                </div>

                <div className="grid gap-4 text-[14px]">
                  <SummaryRow label="当前会员" value={currentPlanName} />
                  <SummaryRow label="有效期" value={expiresText} />
                  <SummaryRow label="累计消费" value={`¥ ${totalSpent}`} />
                  <SummaryRow label="状态" value={statusText} />
                </div>
              </Card>
            </div>
          </div>
        ) : null}
      </div>
    </AppShell>
  )
}

function MetricBlock({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="grid gap-1 border-white/6 xl:border-l xl:pl-5 first:xl:border-l-0 first:xl:pl-0">
      <span className="text-[13px] text-slate-400">{label}</span>
      <strong className="text-[20px] font-semibold text-white">{value}</strong>
      <small className="text-[13px] text-slate-500">{sub}</small>
    </div>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-slate-400">{label}</span>
      <strong className="text-white">{value}</strong>
    </div>
  )
}

function fallbackPlans(): SubscriptionPlan[] {
  return [
    { id: 'basic', name: '基础会员', priceCny: 99, durationDays: 30, monthlyComputeCredits: 120, enabled: true },
    { id: 'pro', name: '专业会员', priceCny: 299, durationDays: 30, monthlyComputeCredits: 420, enabled: true },
    { id: 'team', name: '企业会员', priceCny: 999, durationDays: 30, monthlyComputeCredits: 2000, enabled: true },
  ] as SubscriptionPlan[]
}

function mapPlan(plan: SubscriptionPlan, index: number) {
  const title = plan.id === 'basic' ? '基础会员' : plan.id === 'team' ? '企业会员' : '专业会员'
  const features =
    plan.id === 'basic'
      ? ['30 天有效期', '每日 120 算力', '2 个并发任务', '基础模型支持', '社区客服支持']
      : plan.id === 'team'
        ? ['30 天有效期', '每日 2000 算力', '10 个并发任务', '全量模型支持', '专属客户经理']
        : ['30 天有效期', '每日 420 算力', '3 个并发任务', '全量模型支持', '7 × 12 小时客服支持']
  return { title: index === 1 ? '专业会员' : title, features }
}

function loadingDisabled(a: boolean, b: boolean) {
  return a || b
}
