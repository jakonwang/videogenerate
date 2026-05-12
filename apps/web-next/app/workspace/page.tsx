'use client'

import { useMutation, useQuery } from '@tanstack/react-query'
import { ChevronRight, CirclePlay, Plus, Sparkles, Upload, Video } from 'lucide-react'
import { useRouter } from 'next/navigation'

import { AppShell } from '@/components/app/app-shell'
import { EmptyState, ErrorState } from '@/components/app/page-state'
import { ProtectedPageGate } from '@/components/app/protected-page-gate'
import { Button } from '@/components/ui/button'
import { useAuthGuard } from '@/hooks/use-auth-guard'
import { apiClient } from '@/lib/api-client'
import { compactText, formatPercent, formatStepLabel, toPreviewSrc } from '@/lib/utils'

const templatePresets = [
  {
    id: 'fashion',
    title: '穿搭模板',
    desc: '简约清新风格',
    image: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=1200&q=80',
  },
  {
    id: 'beauty',
    title: '美妆模板',
    desc: '精致测评风格',
    image: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=1200&q=80',
  },
  {
    id: 'product',
    title: '产品模板',
    desc: '专业测评风格',
    image: 'https://images.unsplash.com/photo-1516724562728-afc824a36e84?auto=format&fit=crop&w=1200&q=80',
  },
  {
    id: 'food',
    title: '美食模板',
    desc: '诱人展示风格',
    image: 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=1200&q=80',
  },
] as const

const fallbackTasks = [
  {
    id: 'demo-1',
    title: '夏季穿搭合集复刻',
    status: '分镜视频生成中',
    progress: 75,
    image: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=1200&q=80',
  },
  {
    id: 'demo-2',
    title: '美妆测评视频',
    status: '分镜设计中',
    progress: 40,
    image: 'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=1200&q=80',
  },
  {
    id: 'demo-3',
    title: '3C 产品测评视频',
    status: '脚本生成中',
    progress: 20,
    image: 'https://images.unsplash.com/photo-1516724562728-afc824a36e84?auto=format&fit=crop&w=1200&q=80',
  },
] as const

export default function WorkspacePage() {
  const router = useRouter()
  const auth = useAuthGuard()

  const projectsQuery = useQuery({
    queryKey: ['workspace-projects'],
    queryFn: () => apiClient.listCloneProjects(),
    staleTime: 30_000,
    gcTime: 5 * 60_000,
  })

  const createMutation = useMutation({
    mutationFn: (input?: { title?: string; description?: string }) =>
      apiClient.createCloneProject({
        title: input?.title,
        description: input?.description,
        locale: 'zh-CN',
      }),
    onSuccess: (result) => {
      if (result.project?.id) router.push(`/clone/${result.project.id}`)
    },
  })

  const rows = projectsQuery.data || []
  const recentTasks = rows.slice(0, 3)

  const gate = ProtectedPageGate({
    auth,
    restoringTitle: '正在恢复工作台会话',
    restoringDescription: '系统正在准备首页概览、最近任务和模板入口。',
  })

  if (gate) return gate

  return (
    <AppShell
      headerSearchPlaceholder="搜索模板、任务、素材..."
      onCreateTask={() => createMutation.mutate({ title: '新建视频任务' })}
      creatingTask={createMutation.isPending}
    >
      <div className="workspace-home">
        <section className="workspace-hero panel">
          <div className="workspace-hero__copy">
            <span className="workspace-hero__eyebrow">
              <Sparkles className="h-4 w-4" />
              AI 视频生产工作台
            </span>
            <div className="workspace-hero__headline">
              <h1>让 AI 帮你生成视频</h1>
              <p>从灵感到爆款，只需 3 步</p>
            </div>
            <div className="workspace-hero__actions">
              <Button size="lg" onClick={() => createMutation.mutate({ title: '新建视频任务' })} disabled={createMutation.isPending}>
                <Plus className="h-5 w-5" />
                {createMutation.isPending ? '创建中...' : '开始创作'}
              </Button>
              <Button size="lg" variant="secondary" onClick={() => router.push('/clone')}>
                <Upload className="h-5 w-5" />
                导入参考视频
              </Button>
            </div>
          </div>

          <div className="workspace-hero__visual" aria-hidden="true">
            <div className="workspace-hero__orbit workspace-hero__orbit--sm" />
            <div className="workspace-hero__orbit workspace-hero__orbit--md" />
            <div className="workspace-hero__orbit workspace-hero__orbit--lg" />
            <div className="workspace-hero__glow" />
            <div className="workspace-hero__cube">
              <div className="workspace-hero__cube-core">
                <CirclePlay className="h-18 w-18" />
              </div>
            </div>
            <FloatingBadge className="workspace-hero__badge workspace-hero__badge--left" icon={<Sparkles className="h-5 w-5" />} />
            <FloatingBadge className="workspace-hero__badge workspace-hero__badge--top" icon={<Upload className="h-5 w-5" />} />
            <FloatingBadge className="workspace-hero__badge workspace-hero__badge--bottom" icon={<Video className="h-5 w-5" />} />
          </div>
        </section>

        <WorkspaceSection
          title="最近任务"
          actionLabel="查看全部"
          onAction={() => router.push('/clone')}
        >
          {projectsQuery.isPending
            ? Array.from({ length: 4 }).map((_, index) => (
                <div key={`workspace-skeleton-${index}`} className="workspace-media-card workspace-media-card--skeleton">
                  <div className="skeleton workspace-media-card__media" />
                  <div className="workspace-media-card__body">
                    <div className="skeleton h-6 w-2/3 rounded-lg" />
                    <div className="skeleton h-2.5 w-full rounded-full" />
                    <div className="skeleton h-10 w-full rounded-lg" />
                  </div>
                </div>
              ))
            : null}

          {!projectsQuery.isPending && projectsQuery.isError ? (
            <div className="workspace-section__feedback">
              <ErrorState
                compact
                title="首页任务概览加载失败"
                description={projectsQuery.error instanceof Error ? projectsQuery.error.message : '当前无法读取最近任务，请稍后重试。'}
                onRetry={() => void projectsQuery.refetch()}
              />
            </div>
          ) : null}

          {!projectsQuery.isPending &&
            !projectsQuery.isError &&
            (recentTasks.length ? recentTasks : fallbackTasks).map((item, index) => {
              const isRealTask = 'currentStep' in item
              const cover = isRealTask ? toPreviewSrc(item.coverAssetPath || item.referenceVideoPath || '') : item.image
              const title = isRealTask ? compactText(item.title, '未命名任务') : item.title
              const progress = isRealTask ? Number(item.progressPercent || 0) : item.progress
              const status = isRealTask
                ? compactText(item.selectedModelIdentityName || formatStepLabel(item.currentStep), '继续推进当前链路')
                : item.status

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => (isRealTask ? router.push(`/clone/${item.id}`) : router.push('/clone'))}
                  className="workspace-media-card"
                >
                  <div className="workspace-media-card__media">
                    {cover ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={cover} alt={title} className="workspace-media-card__image" />
                    ) : (
                      <div className="workspace-media-card__image workspace-media-card__image--empty">
                        <Video className="h-6 w-6" />
                      </div>
                    )}
                    <span className="workspace-media-card__play">
                      <CirclePlay className="h-4 w-4" />
                    </span>
                  </div>

                  <div className="workspace-media-card__body">
                    <strong className="workspace-media-card__title">{title}</strong>

                    <div className="workspace-media-card__progress-row">
                      <div className="workspace-media-card__progress">
                        <i style={{ width: `${Math.max(0, Math.min(progress, 100))}%` }} />
                      </div>
                      <span>{isRealTask ? formatPercent(progress) : `${progress}%`}</span>
                    </div>

                    <div className="workspace-media-card__footer">
                      <span className="workspace-media-card__status">
                        <span className="status-dot" data-tone="running" />
                        {status}
                      </span>
                      <span className="workspace-media-card__cta">继续</span>
                    </div>
                  </div>
                </button>
              )
            })}

          {!projectsQuery.isPending && !projectsQuery.isError ? (
            <button type="button" onClick={() => createMutation.mutate({ title: '新建视频任务' })} className="workspace-media-card workspace-media-card--create">
              <span className="workspace-media-card__create-icon">
                <Plus className="h-8 w-8" />
              </span>
              <span className="workspace-media-card__create-text">新建任务</span>
            </button>
          ) : null}

          {!projectsQuery.isPending && !projectsQuery.isError && !recentTasks.length ? (
            <div className="workspace-section__feedback">
              <EmptyState
                compact
                title="还没有最近任务"
                description="从参考视频开始创建第一条复刻任务后，首页会持续展示最近进展和快捷入口。"
                actionLabel="新建任务"
                onAction={() => createMutation.mutate({ title: '新建视频任务' })}
              />
            </div>
          ) : null}
        </WorkspaceSection>

        <WorkspaceSection
          title="推荐模板"
          actionLabel="查看全部"
          onAction={() => router.push('/templates')}
        >
          {templatePresets.map((item) => (
            <button key={item.id} type="button" onClick={() => router.push('/templates')} className="workspace-template-card">
              <div className="workspace-template-card__overlay" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.image} alt={item.title} className="workspace-template-card__image" />
              <div className="workspace-template-card__body">
                <strong>{item.title}</strong>
                <span>{item.desc}</span>
              </div>
            </button>
          ))}
        </WorkspaceSection>
      </div>
    </AppShell>
  )
}

function WorkspaceSection({
  title,
  actionLabel,
  onAction,
  children,
}: {
  title: string
  actionLabel: string
  onAction: () => void
  children: React.ReactNode
}) {
  return (
    <section className="workspace-section panel">
      <div className="workspace-section__head">
        <h2>{title}</h2>
        <button type="button" className="workspace-section__action" onClick={onAction}>
          {actionLabel}
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="workspace-section__grid">{children}</div>
    </section>
  )
}

function FloatingBadge({ icon, className }: { icon: React.ReactNode; className?: string }) {
  return <div className={className}>{icon}</div>
}
