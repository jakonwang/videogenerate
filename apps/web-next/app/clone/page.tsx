'use client'

import {
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock3,
  Edit3,
  Filter,
  Folder,
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
import type { CloneRunMode } from '@shared/web-api/types'

import { AuthRedirectScreen } from '@/components/app/auth-redirect-screen'
import { AppShell } from '@/components/app/app-shell'
import { EmptyState, ErrorState } from '@/components/app/page-state'
import { RunModeDialog } from '@/components/clone/run-mode-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAppNavigation } from '@/hooks/use-app-navigation'
import { useAuthGuard } from '@/hooks/use-auth-guard'
import { useCloneTaskList } from '@/hooks/use-clone-task-list'
import { cn, compactText, formatDateTime, formatPercent, formatStatusTone, formatStepLabel, toPreviewSrc } from '@/lib/utils'

const STATUS_FILTERS = [
  { key: 'all', label: '全部任务' },
  { key: 'running', label: '进行中' },
  { key: 'completed', label: '已完成' },
  { key: 'failed', label: '失败任务' },
  { key: 'draft', label: '草稿箱' },
] as const

const TASK_GROUPS = [
  { key: 'all', label: '全部任务', count: 25 },
  { key: 'ungrouped', label: '未分组', count: 19 },
  { key: 'ref26', label: '#26', count: 6 },
  { key: 'cross10', label: '#10十字架', count: 0 },
] as const

const STAGE_KEYS = [
  'upload_analyze_script',
  'generate_script_variants',
  'generate_storyboard_grids',
  'generate_shot_videos',
  'compose_final_video',
] as const

const PAGE_SIZE = 12

type StatusFilter = (typeof STATUS_FILTERS)[number]['key']

export default function ClonePage() {
  const { navigate, prefetchMany } = useAppNavigation()
  const { ready, authed, redirecting, sessionRestoring } = useAuthGuard()
  const { projectsQuery, createMutation, removeMutation, renameMutation } = useCloneTaskList()
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [page, setPage] = useState(1)
  const [runModeOpen, setRunModeOpen] = useState(false)
  const [selectedRunMode, setSelectedRunMode] = useState<CloneRunMode | null>(null)
  const [renameState, setRenameState] = useState<{ projectId: string; title: string } | null>(null)

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

  useEffect(() => {
    prefetchMany(['/download', ...rows.slice(0, 6).map((item) => `/clone/${item.id}`)])
  }, [prefetchMany, rows])

  const createTask = () => setRunModeOpen(true)

  const confirmCreateTask = () => {
    if (!selectedRunMode) return
    createMutation.mutate(selectedRunMode, {
      onSuccess: (result) => {
        setRunModeOpen(false)
        setSelectedRunMode(null)
        if (result.project?.id) navigate(`/clone/${result.project.id}`)
      },
    })
  }

  const confirmRenameTask = () => {
    if (!renameState) return
    const title = String(renameState.title || '').trim()
    if (!title) return
    renameMutation.mutate(
      { projectId: renameState.projectId, title },
      {
        onSuccess: () => setRenameState(null),
      },
    )
  }

  if (sessionRestoring || (!ready && !authed)) {
    return <AuthRedirectScreen title="正在恢复工作台会话" description="系统正在校验登录状态并准备复刻任务列表。" />
  }

  if (redirecting || !authed) {
    return <AuthRedirectScreen />
  }

  return (
    <AppShell headerSearchPlaceholder="搜索商品、模板、任务、功能..." onCreateTask={createTask} creatingTask={createMutation.isPending}>
      <div className="page-shell page-shell--fixed clone-page" data-testid="clone-list-page">
        <RunModeDialog
          open={runModeOpen}
          creating={createMutation.isPending}
          selectedMode={selectedRunMode}
          onSelect={setSelectedRunMode}
          onCancel={() => {
            if (createMutation.isPending) return
            setRunModeOpen(false)
            setSelectedRunMode(null)
          }}
          onConfirm={confirmCreateTask}
        />

        {renameState ? (
          <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/65 px-4" onClick={() => !renameMutation.isPending && setRenameState(null)}>
            <div
              className="w-full max-w-md rounded-[28px] border border-white/10 bg-[rgba(11,15,25,0.96)] p-6 shadow-[0_24px_120px_rgba(0,0,0,0.45)]"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mb-4 grid gap-1">
                <h2 className="text-lg font-semibold tracking-[-0.03em] text-white">修改任务名称</h2>
                <p className="text-sm text-slate-400">仅更新当前复刻任务标题，不改任务内容和流程状态。</p>
              </div>
              <div className="grid gap-3">
                <Input
                  autoFocus
                  maxLength={120}
                  value={renameState.title}
                  onChange={(event) => setRenameState((current) => (current ? { ...current, title: event.target.value } : current))}
                  placeholder="输入新的任务名称"
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      confirmRenameTask()
                    }
                  }}
                />
                {renameMutation.isError ? (
                  <p className="text-xs text-rose-300">{renameMutation.error instanceof Error ? renameMutation.error.message : '任务重命名失败，请稍后重试。'}</p>
                ) : null}
              </div>
              <div className="mt-5 flex justify-end gap-3">
                <Button variant="ghost" onClick={() => setRenameState(null)} disabled={renameMutation.isPending}>
                  取消
                </Button>
                <Button onClick={confirmRenameTask} disabled={renameMutation.isPending || !String(renameState.title || '').trim()}>
                  {renameMutation.isPending ? '保存中...' : '保存'}
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        <section className="clone-workspace clone-workspace--wide">
          <div className="clone-workspace__main panel clone-workspace__main--full clone-console">
            <div className="clone-console__header">
              <div className="clone-console__intro">
                <div className="clone-console__title-row">
                  <h1 className="clone-console__title">爆款视频复刻</h1>
                  <Sparkles className="clone-console__title-icon" />
                </div>
                <p className="clone-console__subtitle">智能复刻热门视频，快速生成优质内容</p>
              </div>

              <div className="clone-console__hero-actions">
                <Button variant="secondary" className="clone-console__action-button" onClick={() => navigate('/download')}>
                  批量导出
                </Button>
                <button type="button" className="clone-console__run-pill clone-console__run-pill--active">
                  自动运行
                </button>
                <button type="button" className="clone-console__run-pill">
                  手动运行
                </button>
                <Button className="clone-console__action-button clone-console__action-button--primary" onClick={createTask} disabled={createMutation.isPending}>
                  <Plus className="h-4 w-4" />
                  {createMutation.isPending ? '新建中...' : '新建任务'}
                </Button>
              </div>
            </div>

            <div className="clone-summary-strip">
              <SummaryCard icon={PackageOpen} label="全部任务" value={stats.total} helper="总任务数" tone="violet" />
              <SummaryCard icon={LoaderCircle} label="进行中" value={stats.running} helper="任务处理中" tone="blue" />
              <SummaryCard icon={CheckCircle2} label="已完成" value={stats.completed} helper="任务已完成" tone="green" />
              <SummaryCard icon={CircleAlert} label="失败任务" value={stats.failed} helper="任务失败" tone="red" />
              <SummaryCard icon={Folder} label="草稿箱" value={stats.draft} helper="草稿存储" tone="cyan" />
            </div>

            <div className="clone-list-head clone-list-head--designed">
              <div className="clone-list-head__tabs">
                {TASK_GROUPS.map((group) => (
                  <button key={group.key} type="button" className={cn('clone-list-tab', group.key === 'all' && 'is-active')}>
                    <span className="clone-list-tab__label">{group.label}</span>
                    <span className="clone-list-tab__count">({group.count})</span>
                  </button>
                ))}
                <button type="button" className="clone-list-tab clone-list-tab--ghost">
                  <Plus className="h-4 w-4" />
                  新建分组
                </button>
              </div>

              <div className="clone-list-head__tools">
                <button type="button" className="clone-toolbar-chip clone-toolbar-chip--dense">
                  最近更新
                  <ChevronDown className="h-4 w-4" />
                </button>
                <button type="button" className="clone-toolbar-chip clone-toolbar-chip--dense">
                  全部素材
                  <ChevronDown className="h-4 w-4" />
                </button>
                <button type="button" className="clone-toolbar-icon" aria-label="筛选设置">
                  <Filter className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="clone-content">
              {projectsQuery.isLoading ? (
                <div className="clone-task-table">
                  <div className="clone-task-table__header">
                    <span />
                    <span>预览</span>
                    <span>任务信息</span>
                    <span>阶段</span>
                    <span>素材</span>
                    <span>进度</span>
                    <span>更新时间</span>
                    <span>操作</span>
                  </div>
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
                <div className="clone-task-table">
                  <div className="clone-task-table__header">
                    <span>
                      <input type="checkbox" aria-label="全选任务" />
                    </span>
                    <span>预览</span>
                    <span>任务信息</span>
                    <span>阶段</span>
                    <span>素材</span>
                    <span>进度</span>
                    <span>更新时间</span>
                    <span>操作</span>
                  </div>
                  {pagedRows.map((item) => (
                    <CloneTaskRow
                      key={item.id}
                      item={item}
                      removing={removeMutation.isPending && removeMutation.variables === item.id}
                      onOpen={() => navigate(`/clone/${item.id}`)}
                      onRename={() =>
                        setRenameState({
                          projectId: item.id,
                          title: String(item.title || '').trim(),
                        })
                      }
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
                    12 条 / 页
                    <ChevronDown className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </AppShell>
  )
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  helper,
  tone,
}: {
  icon: any
  label: string
  value: number
  helper: string
  tone: 'violet' | 'blue' | 'green' | 'red' | 'cyan'
}) {
  return (
    <article className={cn('clone-summary-card', `clone-summary-card--${tone}`)}>
      <span className="clone-summary-card__icon">
        <Icon className="h-5 w-5" />
      </span>
      <div className="clone-summary-card__copy">
        <strong>{label}</strong>
        <small>{helper}</small>
      </div>
      <b>{value}</b>
    </article>
  )
}

function CloneTaskRow({
  item,
  removing,
  onOpen,
  onRename,
  onRemove,
}: {
  item: any
  removing: boolean
  onOpen: () => void
  onRename: () => void
  onRemove: () => void
}) {
  const stageIndex = getStageIndex(item.currentStep)
  const cover = toPreviewSrc(item.coverAssetPath || item.referenceCoverPath || item.referenceVideoPath || '')
  const progress = formatPercent(item.progressPercent)
  const progressNumber = Math.max(0, Math.min(100, Number.parseFloat(progress) || 0))
  const updatedAt = formatDateTime(item.updatedAt)
  const title = compactText(item.title, '未命名任务')
  const subtitle = compactText(item.referenceTemplateTitle || item.referenceTemplateName || '自动运行 · AI模特 003', '自动运行')
  const stageLabel = formatStepLabel(item.currentStep)
  const statusTone = formatStatusTone(item.status)
  const statusLabel = statusTone === 'success' ? '已完成' : statusTone === 'danger' ? '失败' : statusTone === 'running' ? '进行中' : '等待中'
  const statusClass =
    statusTone === 'success'
      ? 'is-success'
      : statusTone === 'danger'
        ? 'is-danger'
        : statusTone === 'running'
          ? 'is-running'
          : 'is-idle'
  const materialCount = item.productReferenceImageCount || 0
  const videoCount = Math.max(1, item.generatedVideoCount || 0)
  const modelName = compactText(item.selectedModelIdentityName, 'Output Pending')
  const errorText = compactText(item.lastError || item.errorMessage, '')
  const durationText = `${String(Math.max(4, Math.min(59, Math.round(videoCount * 4)))).padStart(2, '0')}:07`

  return (
    <article className="clone-task-row">
      <div className="clone-task-row__select">
        <input type="checkbox" aria-label={`选择任务 ${title}`} />
      </div>

      <div className="clone-task-row__preview">
        <div className="clone-task-row__thumb">
          {cover ? (
            <img src={cover} alt={item.title || 'cover'} />
          ) : (
            <div className="clone-task-row__thumb-empty">
              <Video className="h-5 w-5" />
            </div>
          )}
        </div>
        <span className="clone-task-row__duration">{durationText}</span>
      </div>

      <div className="clone-task-row__info">
        <div className="clone-task-row__title">
          <strong>{title}</strong>
          <button type="button" onClick={onRename} className="clone-task-row__edit" aria-label="修改任务名称">
            <Edit3 className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="clone-task-row__meta">
          <span className="clone-task-row__mode-tag">自动运行</span>
          <span>{subtitle}</span>
        </div>
      </div>

      <div className="clone-task-row__stage">
        <span className={cn('clone-task-row__badge', statusClass)}>{statusLabel}</span>
        <button type="button" className="clone-task-row__stage-link">
          移动到分组
          <ChevronDown className="h-4 w-4" />
        </button>
      </div>

      <div className="clone-task-row__material">
        <strong>
          {videoCount} 段 / {materialCount} 素材
        </strong>
        <span>{modelName}</span>
      </div>

      <div className="clone-task-row__progress">
        <strong>{progress}</strong>
        <div className="clone-task-row__progress-bar">
          <i style={{ width: progress }} />
        </div>
        <div className="clone-task-row__steps">
          {STAGE_KEYS.map((step, index) => {
            const active = index === stageIndex
            const done = index < stageIndex || progressNumber >= 100
            const failed = statusTone === 'danger' && index === stageIndex

            return (
              <span key={step} className={cn('clone-task-row__step', active && 'is-active', done && 'is-done', failed && 'is-failed')}>
                {done ? <CheckCircle2 className="h-3 w-3" /> : index + 1}
              </span>
            )
          })}
        </div>
        {errorText ? (
          <div className="clone-task-row__alert">
            <CircleAlert className="h-4 w-4" />
            <span>{errorText}</span>
          </div>
        ) : null}
      </div>

      <div className="clone-task-row__time">
        <Clock3 className="h-4 w-4" />
        <span>{updatedAt}</span>
      </div>

      <div className="clone-task-row__actions">
        <button type="button" onClick={onOpen} className="clone-task-row__action" aria-label="打开任务">
          <Play className="h-4 w-4" />
        </button>
        <button type="button" onClick={onRemove} disabled={removing} className="clone-task-row__action clone-task-row__action--danger" aria-label="删除任务">
          {removing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
        </button>
        <button type="button" className="clone-task-row__action" aria-label="更多操作">
          <MoreVertical className="h-4 w-4" />
        </button>
      </div>

      <div className="clone-task-row__mobile-stage">
        <Clock3 className="h-3.5 w-3.5" />
        <span>{stageLabel}</span>
      </div>
    </article>
  )
}

function TaskSkeleton() {
  return (
    <div className="clone-task-row clone-task-row--skeleton">
      <div className="skeleton h-5 w-5 rounded-md" />
      <div className="skeleton h-[74px] w-[96px] rounded-[16px]" />
      <div className="grid gap-2">
        <div className="skeleton h-5 w-36 rounded-lg" />
        <div className="skeleton h-4 w-56 rounded-lg" />
      </div>
      <div className="grid gap-2">
        <div className="skeleton h-6 w-16 rounded-full" />
        <div className="skeleton h-4 w-24 rounded-lg" />
      </div>
      <div className="grid gap-2">
        <div className="skeleton h-5 w-24 rounded-lg" />
        <div className="skeleton h-4 w-20 rounded-lg" />
      </div>
      <div className="grid gap-2">
        <div className="skeleton h-5 w-12 rounded-lg" />
        <div className="skeleton h-2 w-40 rounded-full" />
      </div>
      <div className="skeleton h-10 w-28 rounded-lg" />
      <div className="flex gap-2">
        <div className="skeleton h-9 w-9 rounded-xl" />
        <div className="skeleton h-9 w-9 rounded-xl" />
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
