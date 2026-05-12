'use client'

import {
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock3,
  Grid2X2,
  LoaderCircle,
  MoreVertical,
  PackageOpen,
  Play,
  Plus,
  Sparkles,
  Trash2,
  Video,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

import { AuthRedirectScreen } from '@/components/app/auth-redirect-screen'
import { AppShell } from '@/components/app/app-shell'
import { EmptyState, ErrorState } from '@/components/app/page-state'
import { Button } from '@/components/ui/button'
import { useAuthGuard } from '@/hooks/use-auth-guard'
import { useCloneTaskList } from '@/hooks/use-clone-task-list'
import { cn, compactText, formatDateTime, formatPercent, formatStatusTone, formatStepLabel, toPreviewSrc } from '@/lib/utils'

const STATUS_FILTERS = [
  { key: 'all', label: '全部' },
  { key: 'draft', label: '草稿' },
  { key: 'running', label: '进行中' },
  { key: 'completed', label: '已完成' },
  { key: 'failed', label: '失败' },
] as const

const STAGE_KEYS = [
  'upload_analyze_script',
  'generate_script_variants',
  'generate_storyboard_grids',
  'generate_shot_videos',
  'compose_final_video',
] as const

const PAGE_SIZE = 12

const RAIL_FEATURES = [
  {
    icon: Sparkles,
    title: '后台持续运行',
    body: '任务在后台执行，离开当前页面也不会影响主流程推进。',
  },
  {
    icon: Grid2X2,
    title: '详情页职责',
    body: '脚本、分镜、镜头与日志都在任务详情中继续处理与追踪。',
  },
  {
    icon: PackageOpen,
    title: '快捷入口',
    body: '常用任务会保留在右侧最近切换区域，便于快速回到工作上下文。',
  },
] as const

type StatusFilter = (typeof STATUS_FILTERS)[number]['key']

export default function ClonePage() {
  const router = useRouter()
  const { ready, authed, redirecting, sessionRestoring } = useAuthGuard()
  const { projectsQuery, createMutation, removeMutation } = useCloneTaskList()
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [page, setPage] = useState(1)

  const rows = projectsQuery.data || []

  const filteredRows = useMemo(() => {
    return rows.filter((item) => {
      const status = String(item.status || '').toLowerCase()
      const isRunning =
        status.includes('running') || status.includes('generating') || status.includes('processing') || status === 'analyzed'
      const isCompleted = status.includes('done') || status.includes('complete') || status.includes('success')
      const isFailed = status.includes('fail') || status.includes('error')
      const isDraft = !status || status === 'draft'

      if (statusFilter === 'draft' && !isDraft) return false
      if (statusFilter === 'running' && !isRunning) return false
      if (statusFilter === 'completed' && !isCompleted) return false
      if (statusFilter === 'failed' && !isFailed) return false
      return true
    })
  }, [rows, statusFilter])

  const stats = useMemo(() => {
    const getTone = (status?: string) => formatStatusTone(status)
    return {
      total: rows.length,
      draft: rows.filter((item) => getTone(item.status) === 'idle').length,
      running: rows.filter((item) => getTone(item.status) === 'running').length,
      completed: rows.filter((item) => getTone(item.status) === 'success').length,
      failed: rows.filter((item) => getTone(item.status) === 'danger').length,
    }
  }, [rows])

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE))

  useEffect(() => {
    setPage(1)
  }, [statusFilter])

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  const pagedRows = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE
    return filteredRows.slice(start, start + PAGE_SIZE)
  }, [filteredRows, page])

  const createTask = () =>
    createMutation.mutate(undefined, {
      onSuccess: (result) => {
        if (result.project?.id) router.push(`/clone/${result.project.id}`)
      },
    })

  if (sessionRestoring || (!ready && !authed)) {
    return <AuthRedirectScreen title="正在恢复工作台会话" description="系统正在校验登录状态并准备复刻任务列表。" />
  }

  if (redirecting || !authed) {
    return <AuthRedirectScreen />
  }

  return (
    <AppShell headerSearchPlaceholder="搜索任务、模型、模板或设置项">
      <div className="page-shell page-shell--fixed clone-page">
        <section className="clone-workspace clone-workspace--wide">
          <div className="clone-workspace__main panel">
            <div className="clone-hero clone-hero--compact">
              <div className="clone-hero__copy">
                <h1 className="clone-hero__title">
                  爆款视频复刻
                  <Sparkles className="clone-hero__title-icon" />
                </h1>
                <p className="clone-hero__summary">从参考视频到成片输出，AI 帮你高效复刻爆款内容</p>
              </div>

              <div className="clone-hero__actions">
                <Button variant="secondary" onClick={() => router.push('/download')}>
                  批量导出
                </Button>
                <Button onClick={createTask} disabled={createMutation.isPending}>
                  <Plus className="h-4 w-4" />
                  {createMutation.isPending ? '创建中...' : '新建任务'}
                </Button>
              </div>
            </div>

            <div className="clone-toolbar clone-toolbar--stack">
              <div className="clone-filters">
                {STATUS_FILTERS.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setStatusFilter(item.key)}
                    className={cn('clone-filter-pill', statusFilter === item.key && 'is-active')}
                  >
                    <span>
                      {item.label} (
                      {item.key === 'all'
                        ? stats.total
                        : item.key === 'draft'
                          ? stats.draft
                          : item.key === 'running'
                            ? stats.running
                            : item.key === 'completed'
                              ? stats.completed
                              : stats.failed}
                      )
                    </span>
                  </button>
                ))}
              </div>

              <div className="clone-toolbar__right">
                <button type="button" className="clone-toolbar-chip">
                  更新时间
                  <ChevronDown className="h-4 w-4" />
                </button>
                <button type="button" className="clone-toolbar-icon is-active" aria-label="网格视图">
                  <Grid2X2 className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="clone-content">
              {projectsQuery.isLoading ? (
                <div className="clone-task-grid clone-task-grid--wide">
                  {Array.from({ length: PAGE_SIZE }).map((_, index) => (
                    <TaskSkeleton key={index} />
                  ))}
                </div>
              ) : projectsQuery.isError ? (
                <ErrorState
                  compact
                  title="任务列表加载失败"
                  description={projectsQuery.error instanceof Error ? projectsQuery.error.message : '当前无法读取复刻任务列表，请稍后重试。'}
                  onRetry={() => void projectsQuery.refetch()}
                />
              ) : pagedRows.length ? (
                <div className="clone-task-grid clone-task-grid--wide">
                  {pagedRows.map((item) => (
                    <CloneTaskCard
                      key={item.id}
                      item={item}
                      removing={removeMutation.isPending && removeMutation.variables === item.id}
                      onOpen={() => router.push(`/clone/${item.id}`)}
                      onRemove={() => removeMutation.mutate(item.id)}
                    />
                  ))}
                </div>
              ) : (
                <EmptyState
                  compact
                  title={projectsQuery.isFetching ? '正在读取任务列表' : '还没有复刻任务'}
                  description={projectsQuery.isFetching ? '请稍候，系统正在同步最新任务。' : '可以直接新建第一条任务，从参考视频开始搭建完整复刻链路。'}
                  actionLabel="新建任务"
                  onAction={createTask}
                />
              )}
            </div>

            {!projectsQuery.isLoading && filteredRows.length > 0 ? (
              <div className="clone-footer">
                <div className="clone-footer__meta">共 {filteredRows.length} 条任务</div>
                <div className="clone-pagination">
                  <button
                    type="button"
                    className="clone-pagination__ghost"
                    disabled={page <= 1}
                    onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <div className="clone-pagination__numbers">
                    {buildPageNumbers(page, totalPages).map((pageNumber) => {
                      if (pageNumber === 'ellipsis-left' || pageNumber === 'ellipsis-right') {
                        return (
                          <span key={pageNumber} className="clone-pagination__ellipsis">
                            ...
                          </span>
                        )
                      }

                      return (
                        <button
                          key={pageNumber}
                          type="button"
                          onClick={() => setPage(pageNumber)}
                          className={cn('clone-pagination__number', page === pageNumber && 'is-active')}
                        >
                          {pageNumber}
                        </button>
                      )
                    })}
                  </div>
                  <button
                    type="button"
                    className="clone-pagination__ghost"
                    disabled={page >= totalPages}
                    onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                  <button type="button" className="clone-pagination__page-size">
                    12 条/页
                    <ChevronDown className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          <aside className="clone-workspace__rail panel clone-workspace__rail--light">
            <div className="clone-rail-card clone-rail-card--soft">
              <div className="clone-rail-card__head">
                <h2>任务说明</h2>
                <p>右侧只保留轻量提示和最近切换列表，不再占用过多高度。</p>
              </div>

              <div className="clone-rail-feature-list">
                {RAIL_FEATURES.map((item) => {
                  const Icon = item.icon
                  return (
                    <div key={item.title} className="clone-rail-feature">
                      <span className="clone-rail-feature__icon">
                        <Icon className="h-5 w-5" />
                      </span>
                      <div>
                        <strong>{item.title}</strong>
                        <p>{item.body}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="clone-rail-card clone-rail-card--soft">
              <div className="clone-rail-card__head clone-rail-card__head--row">
                <h2>最近切换</h2>
                <button type="button" className="clone-rail-clear" onClick={() => setStatusFilter('all')}>
                  清空
                </button>
              </div>

              <div className="clone-rail-switches">
                {rows.slice(0, 4).map((item) => {
                  const thumb = toPreviewSrc(item.coverAssetPath || item.referenceVideoPath || '')
                  return (
                    <button key={item.id} type="button" className="clone-rail-switch" onClick={() => router.push(`/clone/${item.id}`)}>
                      <span className="clone-rail-switch__thumb">{thumb ? <img src={thumb} alt={item.title || 'cover'} /> : <Video className="h-4 w-4" />}</span>
                      <span className="clone-rail-switch__copy">
                        <strong>{compactText(item.title, '未命名任务')}</strong>
                        <em>{formatRelativeTime(item.updatedAt)}</em>
                      </span>
                    </button>
                  )
                })}

                <Button variant="secondary" className="w-full" onClick={() => router.push('/clone')}>
                  查看全部任务
                </Button>
              </div>
            </div>
          </aside>
        </section>
      </div>
    </AppShell>
  )
}

function CloneTaskCard({
  item,
  removing,
  onOpen,
  onRemove,
}: {
  item: any
  removing: boolean
  onOpen: () => void
  onRemove: () => void
}) {
  const stageIndex = getStageIndex(item.currentStep)
  const cover = toPreviewSrc(item.coverAssetPath || item.referenceCoverPath || '')
  const progress = formatPercent(item.progressPercent)
  const progressNumber = Math.max(0, Math.min(100, Number.parseFloat(progress) || 0))
  const updatedAt = formatDateTime(item.updatedAt)
  const modelName = compactText(item.selectedModelIdentityName, '未绑定')
  const materialCount = item.productReferenceImageCount || 0
  const videoCount = item.generatedVideoCount || 0
  const title = compactText(item.title, '未命名任务')
  const stageLabel = formatStepLabel(item.currentStep)
  const sourceLabel = compactText(item.referenceTemplateTitle || item.referenceTemplateName || '参考视频复刻', '参考视频复刻')
  const statusTone = formatStatusTone(item.status)
  const statusLabel =
    statusTone === 'success' ? '完成' : statusTone === 'danger' ? '失败' : statusTone === 'running' ? '进行中' : '草稿'
  const statusClass =
    statusTone === 'success'
      ? 'is-success'
      : statusTone === 'danger'
        ? 'is-danger'
        : statusTone === 'running'
          ? 'is-running'
          : 'is-idle'
  const errorText = compactText(item.lastError || item.errorMessage, '')

  return (
    <article className="clone-task-card clone-task-card--wide">
      <div className="clone-task-card__head">
        <div className="clone-task-card__media">
          <span className={cn('clone-task-card__status', statusClass)}>{sourceLabel}</span>
          {cover ? (
            <img src={cover} alt={item.title || 'cover'} />
          ) : (
            <div className="clone-task-card__media-empty">
              <Video className="h-7 w-7" />
            </div>
          )}
          <div className="clone-task-card__media-fade" />
          <button type="button" className="clone-task-card__more" aria-label="更多操作">
            <MoreVertical className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="clone-task-card__body">
        <div className="clone-task-card__title-row">
          <div className="clone-task-card__title-stack">
            <h3>{title}</h3>
            <span className="clone-task-card__stage">{statusLabel}</span>
          </div>
        </div>

        <div className="clone-task-card__meta">
          <span>模特：{modelName}</span>
          <span>
            素材：{materialCount} 张图片 / {Math.max(1, videoCount || (cover ? 1 : 0))} 个视频
          </span>
        </div>

        <div className="clone-task-card__progress-head">
          <strong>{progress}</strong>
        </div>
        <div className="clone-task-card__progress">
          <i style={{ width: progress }} />
        </div>

        <div className="clone-task-card__steps">
          {STAGE_KEYS.map((step, index) => {
            const active = index === stageIndex
            const done = index < stageIndex || progressNumber >= 100
            const failed = statusTone === 'danger' && index === stageIndex
            return (
              <span key={step} className={cn('clone-task-card__step', active && 'is-active', done && 'is-done', failed && 'is-failed')}>
                {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : index + 1}
              </span>
            )
          })}
        </div>

        <div className="clone-task-card__footer">
          <span className="clone-task-card__time">{updatedAt}</span>
          <div className="clone-task-card__actions">
            <button type="button" onClick={onOpen} className="clone-task-card__icon-btn clone-task-card__icon-btn--primary">
              <Play className="h-4 w-4" />
            </button>
            <button type="button" onClick={onRemove} disabled={removing} className="clone-task-card__icon-btn clone-task-card__icon-btn--danger">
              {removing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {errorText ? (
          <div className="clone-task-card__alert">
            <CircleAlert className="h-4 w-4" />
            <span>{errorText}</span>
          </div>
        ) : null}

        <div className="clone-task-card__updated">
          <Clock3 className="h-3.5 w-3.5" />
          <span>阶段：{stageLabel}</span>
        </div>
      </div>
    </article>
  )
}

function TaskSkeleton() {
  return (
    <div className="clone-task-card clone-task-card--wide clone-task-card--skeleton">
      <div className="skeleton h-[84px] rounded-[18px]" />
      <div className="mt-4 grid gap-3">
        <div className="skeleton h-6 w-44 rounded-lg" />
        <div className="skeleton h-4 w-full rounded-lg" />
        <div className="skeleton h-4 w-4/5 rounded-lg" />
        <div className="skeleton h-2 w-full rounded-full" />
        <div className="flex gap-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="skeleton h-8 w-8 rounded-full" />
          ))}
        </div>
      </div>
    </div>
  )
}

function getStageIndex(step?: string) {
  const value = String(step || '')
  const normalized =
    value === 'select_script_variant'
      ? 'generate_script_variants'
      : value === 'review_replace_shots'
        ? 'generate_shot_videos'
        : value === 'export_final'
          ? 'compose_final_video'
          : value
  return Math.max(0, STAGE_KEYS.indexOf(normalized as (typeof STAGE_KEYS)[number]))
}

function buildPageNumbers(page: number, totalPages: number) {
  if (totalPages <= 5) {
    return Array.from({ length: totalPages }, (_, index) => index + 1)
  }

  if (page <= 3) {
    return [1, 2, 3, 4, 'ellipsis-right', totalPages] as const
  }

  if (page >= totalPages - 2) {
    return [1, 'ellipsis-left', totalPages - 3, totalPages - 2, totalPages - 1, totalPages] as const
  }

  return [1, 'ellipsis-left', page - 1, page, page + 1, 'ellipsis-right', totalPages] as const
}

function formatRelativeTime(value?: number | string | null) {
  if (!value) return '刚刚'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '刚刚'
  const diff = Date.now() - date.getTime()
  const minutes = Math.max(1, Math.floor(diff / 60000))
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  return `${days} 天前`
}
