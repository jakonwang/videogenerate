'use client'

import { useQuery } from '@tanstack/react-query'
import { CreditCard, FolderKanban, RefreshCcw, ShieldCheck, Wallet } from 'lucide-react'
import { useRouter } from 'next/navigation'

import { AppShell } from '@/components/app/app-shell'
import { ErrorState, LoadingState } from '@/components/app/page-state'
import { ProtectedPageGate } from '@/components/app/protected-page-gate'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useAuthGuard } from '@/hooks/use-auth-guard'
import { apiClient } from '@/lib/api-client'
import { formatDateTime } from '@/lib/utils'
import { useSessionStore } from '@/store/session-store'

export default function AccountPage() {
  const router = useRouter()
  const auth = useAuthGuard()
  const sessionUser = useSessionStore((state) => state.user)
  const sessionSubscription = useSessionStore((state) => state.subscription)
  const sessionWallet = useSessionStore((state) => state.wallet)

  const profileQuery = useQuery({
    queryKey: ['profile'],
    queryFn: () => apiClient.getProfile(),
  })

  const gate = ProtectedPageGate({
    auth,
    restoringTitle: '正在恢复账户会话',
    restoringDescription: '系统正在同步账户资料、订阅信息和钱包余额。',
  })

  if (gate) return gate

  const user = profileQuery.data?.user || sessionUser
  const subscription = profileQuery.data?.subscription || sessionSubscription
  const wallet = profileQuery.data?.wallet || sessionWallet
  const userName = user?.displayName || user?.phone || '当前用户'
  const hasFallbackData = Boolean(sessionUser || sessionSubscription || sessionWallet)

  return (
    <AppShell>
      <div className="page-shell">
        <section className="panel grid gap-4 px-6 py-5">
          <div className="page-header">
            <div className="page-header__copy">
              <h1 className="page-title">账户中心</h1>
              <p className="body-copy max-w-3xl">这里聚合账户身份、订阅状态、算力余额和运行环境说明，不再堆叠传统后台式设置页。</p>
            </div>
            <div className="page-header__actions">
              <Button variant="secondary" onClick={() => profileQuery.refetch()} disabled={profileQuery.isFetching}>
                <RefreshCcw className="h-4 w-4" />
                {profileQuery.isFetching ? '刷新中...' : '刷新信息'}
              </Button>
            </div>
          </div>
        </section>

        {profileQuery.isPending && !hasFallbackData ? (
          <LoadingState title="正在加载账户资料" description="请稍候，系统正在读取当前账户、订阅和钱包信息。" />
        ) : null}

        {profileQuery.isError && !hasFallbackData ? (
          <ErrorState
            title="账户资料加载失败"
            description={profileQuery.error instanceof Error ? profileQuery.error.message : '当前无法读取账户资料，请稍后重试。'}
            onRetry={() => void profileQuery.refetch()}
          />
        ) : null}

        {!profileQuery.isPending && !profileQuery.isError && !user ? (
          <ErrorState
            title="账户资料暂不可用"
            description="当前没有读取到有效的账户资料，请重新登录后再试。"
            onRetry={() => void profileQuery.refetch()}
          />
        ) : null}

        {user ? (
        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="grid gap-4">
            <Card className="grid gap-5 p-5">
              <div className="flex items-center gap-4">
                <div className="grid h-16 w-16 place-items-center rounded-full bg-[linear-gradient(135deg,rgba(109,93,255,0.95),rgba(34,211,238,0.45))] text-xl font-semibold text-white">
                  {userName.slice(0, 1)}
                </div>
                <div className="grid gap-1">
                  <strong className="text-[22px] font-semibold text-[var(--text-main)]">{userName}</strong>
                  <span className="text-sm text-[var(--text-muted)]">ID: {user?.id || '10086'}</span>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <Metric label="手机号" value={user?.phone || '未绑定'} />
                <Metric label="当前套餐" value={subscription?.planName || '专业会员'} />
                <Metric label="剩余算力" value={`${wallet?.balanceCredits ?? 0}`} />
              </div>
            </Card>

            <Card className="grid gap-4 p-5">
              <h2 className="section-title">账户动作</h2>
              <div className="grid gap-3 md:grid-cols-3">
                <ActionCard icon={<CreditCard className="h-5 w-5" />} title="查看账单" desc="进入会员与算力页面查看订单、支付和套餐。" onClick={() => router.push('/billing')} />
                <ActionCard icon={<FolderKanban className="h-5 w-5" />} title="任务中心" desc="回到任务列表页，继续筛选和切换项目。" onClick={() => router.push('/clone')} />
                <ActionCard icon={<Wallet className="h-5 w-5" />} title="算力状态" desc="查看当前余额和最近消费记录。" onClick={() => router.push('/billing')} />
              </div>
            </Card>
          </div>

          <aside className="grid gap-4">
            <Card className="grid gap-4 p-5">
              <h2 className="section-title">环境状态</h2>
              <Metric label="订阅更新时间" value={formatDateTime(subscription?.updatedAt)} />
              <Metric label="接口环境" value="商业化 Web API" />
              <Metric label="运行平台" value="Windows 开发 / Linux 部署" />
              <Metric label="账户状态" value={user?.status === 'disabled' ? '已停用' : '正常'} />
            </Card>

            <Card className="grid gap-3 p-5">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-2xl bg-emerald-400/12 text-emerald-300">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm font-medium text-[var(--text-main)]">当前会话正常</div>
                  <div className="text-[12px] text-[var(--text-muted)]">账户、订阅和钱包信息均由统一 API 提供。</div>
                </div>
              </div>
            </Card>
          </aside>
        </section>
        ) : null}
      </div>
    </AppShell>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="card-surface grid gap-1 p-3">
      <span className="eyebrow">{label}</span>
      <strong className="text-sm text-[var(--text-main)]">{value}</strong>
    </div>
  )
}

function ActionCard({
  icon,
  title,
  desc,
  onClick,
}: {
  icon: React.ReactNode
  title: string
  desc: string
  onClick: () => void
}) {
  return (
    <button type="button" onClick={onClick} className="soft-card soft-card--panel grid gap-3 text-left transition hover:border-[rgba(109,93,255,0.42)]">
      <div className="grid h-10 w-10 place-items-center rounded-2xl bg-[rgba(109,93,255,0.12)] text-violet-200">{icon}</div>
      <div className="stack-title">
        <strong className="text-sm text-[var(--text-main)]">{title}</strong>
        <span className="stack-copy">{desc}</span>
      </div>
    </button>
  )
}
