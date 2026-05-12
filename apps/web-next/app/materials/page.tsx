'use client'

import { useMutation, useQuery } from '@tanstack/react-query'
import { FolderOpen } from 'lucide-react'
import { useRouter } from 'next/navigation'

import { AppShell } from '@/components/app/app-shell'
import { EmptyState, ErrorState, LoadingState } from '@/components/app/page-state'
import { ProtectedPageGate } from '@/components/app/protected-page-gate'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useAuthGuard } from '@/hooks/use-auth-guard'
import { apiClient } from '@/lib/api-client'
import { formatDateTime } from '@/lib/utils'

export default function MaterialsPage() {
  const router = useRouter()
  const auth = useAuthGuard()
  const projectsQuery = useQuery({
    queryKey: ['clone-projects'],
    queryFn: () => apiClient.listCloneProjects(),
  })

  const createMutation = useMutation({
    mutationFn: (item: any) =>
      apiClient.createCloneProject({
        title: `${item.title || '素材派生任务'} - 派生`,
        description: '从现有任务继承商品素材，继续进行复刻生产。',
        locale: 'zh-CN',
      }),
    onSuccess: (result, item) => {
      if (result.project?.id) router.push(`/clone/${result.project.id}?fromProject=${item.id}`)
    },
  })

  const gate = ProtectedPageGate({
    auth,
    restoringTitle: '正在恢复素材库',
    restoringDescription: '系统正在同步任务素材和商品图统计。',
  })

  if (gate) return gate

  const rows = projectsQuery.data || []
  const totalImages = rows.reduce((sum, item) => sum + item.productReferenceImageCount, 0)

  return (
    <AppShell>
      <div className="page-shell">
        <section className="panel grid gap-4 px-6 py-5">
          <div className="page-header">
            <div className="page-header__copy">
              <h1 className="page-title">商品素材库</h1>
              <p className="body-copy max-w-3xl">按任务聚合商品图和复刻素材使用情况，统一回看每个任务的素材投入与产出关系。</p>
            </div>
            <div className="page-header__actions">
              <Button variant="secondary" onClick={() => router.push('/clone')}>
                去任务中心补素材
              </Button>
            </div>
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
          <div className="grid gap-3">
            {projectsQuery.isPending ? <LoadingState compact title="正在加载素材任务" description="请稍候，系统正在读取商品图和分镜统计。" /> : null}

            {projectsQuery.isError ? (
              <ErrorState
                compact
                title="素材库加载失败"
                description={projectsQuery.error instanceof Error ? projectsQuery.error.message : '当前无法读取素材任务，请稍后重试。'}
                onRetry={() => void projectsQuery.refetch()}
              />
            ) : null}

            {!projectsQuery.isPending && !projectsQuery.isError && rows.map((item) => (
              <Card key={item.id} className="grid gap-4 p-5">
                <div className="flex items-center justify-between gap-4">
                  <div className="stack-title">
                    <strong className="text-base text-white">{item.title || '未命名复刻任务'}</strong>
                    <span className="stack-copy">最后更新：{formatDateTime(item.updatedAt)}</span>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" onClick={() => router.push(`/clone/${item.id}`)}>
                      <FolderOpen className="h-4 w-4" />
                      打开任务
                    </Button>
                    <Button size="sm" onClick={() => createMutation.mutate(item)} disabled={createMutation.isPending}>
                      派生新任务
                    </Button>
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="soft-card soft-card--dense meta-list">
                    <strong>商品图数量</strong>
                    <span>{item.productReferenceImageCount}</span>
                  </div>
                  <div className="soft-card soft-card--dense meta-list">
                    <strong>分镜数量</strong>
                    <span>{item.shotCount}</span>
                  </div>
                  <div className="soft-card soft-card--dense meta-list">
                    <strong>当前阶段</strong>
                    <span>{item.currentStep}</span>
                  </div>
                </div>
              </Card>
            ))}
            {!projectsQuery.isPending && !projectsQuery.isError && !rows.length ? (
              <EmptyState
                compact
                title="暂无素材任务"
                description="先在复刻任务中上传商品图，素材库会自动按任务聚合展示。"
                actionLabel="去任务中心补素材"
                onAction={() => router.push('/clone')}
              />
            ) : null}
          </div>

          <aside className="grid gap-4">
            <Card className="grid gap-4 p-5">
              <h2 className="section-title">素材总览</h2>
              <div className="soft-card soft-card--panel meta-list">
                <strong>任务数量</strong>
                <span>{rows.length}</span>
              </div>
              <div className="soft-card soft-card--panel meta-list">
                <strong>商品图总数</strong>
                <span>{totalImages}</span>
              </div>
            </Card>

            <Card className="grid gap-4 p-5">
              <h2 className="section-title">模块职责</h2>
              <div className="soft-card soft-card--dense meta-list">
                <strong>当前实现</strong>
                <span>素材库按现有任务数据聚合，不额外发明新的素材中心后端协议。</span>
              </div>
            </Card>
          </aside>
        </section>
      </div>
    </AppShell>
  )
}
