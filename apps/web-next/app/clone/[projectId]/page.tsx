'use client'

import {
  CheckCircle2,
  Copy,
  FolderOpen,
  ImageIcon,
  Lock,
  PauseCircle,
  Pencil,
  PlayCircle,
  Plus,
  RefreshCcw,
  Sparkles,
  Trash2,
  Unlock,
  Upload,
  Video,
  X,
} from 'lucide-react'
import { useParams, useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { AppShell } from '@/components/app/app-shell'
import { AuthRedirectScreen } from '@/components/app/auth-redirect-screen'
import { EmptyState, ErrorState } from '@/components/app/page-state'
import { CloneStageNav } from '@/components/clone/clone-stage-nav'
import { StatusBadge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useAuthGuard } from '@/hooks/use-auth-guard'
import { useCloneWorkspace } from '@/hooks/use-clone-workspace'
import { apiClient } from '@/lib/api-client'
import { cn, compactText, formatDateTime, formatPercent, formatStepLabel, toFileName } from '@/lib/utils'

type CloneStage =
  | 'upload_analyze_script'
  | 'generate_script_variants'
  | 'generate_storyboard_grids'
  | 'generate_shot_videos'
  | 'compose_final_video'

type PreviewState = {
  title: string
  src: string
  type: 'image' | 'video'
}

type StoryboardRow = {
  shotId: string
  order: number
  duration: number
  scriptText: string
  visualDescription: string
  cameraMovement: string
  subtitle: string
  materialNeed: string
  imageSrc: string
  videoSrc: string
  locked: boolean
}

type ShotDraft = {
  shotId: string
  scriptText: string
  visualDescription: string
  cameraMovement: string
  subtitleSuggestion: string
  materialNeed: string
  durationSec: string
}

const STAGES: CloneStage[] = [
  'upload_analyze_script',
  'generate_script_variants',
  'generate_storyboard_grids',
  'generate_shot_videos',
  'compose_final_video',
]

function normalizeStage(step?: string): CloneStage {
  if (step === 'select_script_variant') return 'generate_script_variants'
  if (step === 'review_replace_shots') return 'generate_shot_videos'
  if (step === 'export_final') return 'compose_final_video'
  if (STAGES.includes((step as CloneStage) || 'upload_analyze_script')) return step as CloneStage
  return 'upload_analyze_script'
}

function getNextStage(stage: CloneStage) {
  const index = STAGES.indexOf(stage)
  return STAGES[Math.min(index + 1, STAGES.length - 1)]
}

function getPrevStage(stage: CloneStage) {
  const index = STAGES.indexOf(stage)
  return STAGES[Math.max(index - 1, 0)]
}

function deriveStage(workspace: ReturnType<typeof useCloneWorkspace>): CloneStage {
  const explicit = normalizeStage(workspace.project?.workflowV2?.currentStep || workspace.project?.currentStep)
  const hasCompose = Boolean(String(workspace.project?.finalCompose?.outputPath || workspace.project?.finalOutputPath || '').trim())
  const hasVideos = workspace.shotVideoOutputs.some((item: any) => Boolean(String(item?.videoPath || item?.localPath || '').trim()))
  const hasImages = workspace.storyboardFrames.some((item: any) => Boolean(String(item?.imagePath || '').trim()))
  const hasVariants = workspace.scriptCandidates.length > 0 || Boolean(String(workspace.selectedVariantId || '').trim())

  if (hasCompose) return 'compose_final_video'
  if (hasVideos) return 'generate_shot_videos'
  if (hasImages) return 'generate_storyboard_grids'
  if (hasVariants) return 'generate_script_variants'
  return explicit
}

function buildRows(workspace: ReturnType<typeof useCloneWorkspace>): StoryboardRow[] {
  const sourceShots = workspace.shots.length
    ? workspace.shots
    : Array.from({ length: 6 }).map((_, index) => ({
        id: `draft-${index + 1}`,
        durationSec: index % 2 === 0 ? 3 : 4,
        scriptText: `镜头 ${index + 1}：突出商品核心卖点，节奏紧凑，适合短视频转化。`,
        visualDescription: '高质感产品展示，强调材质、佩戴效果与生活方式场景。',
        cameraMovement: index % 2 === 0 ? '推进' : '跟拍',
        subtitle: '三秒抓住注意力，快速建立记忆点。',
        materialNeed: '商品特写 / 模特半身 / 氛围场景素材',
        locked: false,
      }))

  return sourceShots.map((shot: any, index: number) => {
    const shotId = String(shot?.id || `shot-${index + 1}`)
    const frame = workspace.helpers.frameForShot(shotId)
    const video = workspace.helpers.videoForShot(shotId)
    return {
      shotId,
      order: index + 1,
      duration: Math.max(2, Number(shot?.durationSec || 3)),
      scriptText: compactText(shot?.scriptText || shot?.actionDescription || shot?.narrationText, '暂无脚本文案'),
      visualDescription: compactText(shot?.visualDescription, '等待生成分镜提示词'),
      cameraMovement: compactText(shot?.cameraMovement || shot?.cameraDescription, '固定镜头'),
      subtitle: compactText(shot?.subtitleSuggestion || shot?.subtitle || shot?.onScreenText, '等待字幕建议'),
      materialNeed: compactText(shot?.materialNeed, '等待补充分镜素材'),
      imageSrc: workspace.helpers.previewSrc(frame?.imagePath || ''),
      videoSrc: workspace.helpers.previewSrc(video?.videoPath || video?.localPath || ''),
      locked: Boolean(shot?.locked),
    }
  })
}

function GlassCard({ className, children }: { className?: string; children: ReactNode }) {
  return <Card className={cn('border-white/10 bg-[rgba(10,18,32,0.88)] backdrop-blur-xl', className)}>{children}</Card>
}

function SectionHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string
  title: string
  description?: string
  actions?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="grid gap-1">
        <span className="text-[11px] uppercase tracking-[0.24em] text-slate-500">{eyebrow}</span>
        <h2 className="text-[22px] font-semibold leading-8 text-white">{title}</h2>
        {description ? <p className="max-w-3xl text-[13px] leading-6 text-slate-400">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}

function Metric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-[18px] border border-white/8 bg-white/[0.03] px-4 py-3">
      <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">{label}</div>
      <div className="mt-2 text-[22px] font-semibold text-white">{value}</div>
      <div className="mt-1 text-[12px] text-slate-400">{hint}</div>
    </div>
  )
}

function Chip({ children, active }: { children: ReactNode; active?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-medium',
        active
          ? 'border-[rgba(109,93,255,0.42)] bg-[rgba(109,93,255,0.12)] text-white'
          : 'border-white/10 bg-white/[0.03] text-slate-300',
      )}
    >
      {children}
    </span>
  )
}

function StageBadge({ children }: { children: ReactNode }) {
  return <Chip active>{children}</Chip>
}

function SkeletonBlock({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-[16px] bg-white/[0.05]', className)} />
}

function StageSection({
  title,
  description,
  children,
  className,
}: {
  title: string
  description: string
  children: ReactNode
  className?: string
}) {
  return (
    <GlassCard className={cn('p-5', className)}>
      <div className="grid gap-5">
        <div className="grid gap-1 border-b border-white/8 pb-4">
          <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">核心工作区</div>
          <div className="text-[18px] font-semibold text-white">{title}</div>
          <div className="text-[13px] leading-6 text-slate-400">{description}</div>
        </div>
        {children}
      </div>
    </GlassCard>
  )
}

function ShotCard({
  row,
  title,
  preview,
  meta,
  summary,
  detail,
  actions,
}: {
  row: StoryboardRow
  title: string
  preview: ReactNode
  meta?: ReactNode
  summary: Array<{ label: string; value: ReactNode }>
  detail: Array<{ label: string; value: ReactNode; tone?: 'default' | 'muted' }>
  actions?: ReactNode
}) {
  return (
    <div className="rounded-[22px] border border-white/8 bg-white/[0.03] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
      <div className="grid gap-4 lg:grid-cols-[116px_minmax(0,1fr)] lg:items-start">
        <div className="grid gap-3">
          <div className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/[0.03] text-sm font-semibold text-white">{row.order}</span>
            {row.locked ? <Lock className="h-4 w-4 text-amber-300" /> : null}
            {meta ? <div className="flex flex-wrap items-center gap-2">{meta}</div> : null}
          </div>
          {preview}
        </div>

        <div className="grid min-w-0 gap-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="grid min-w-0 gap-1">
              <h3 className="text-[16px] font-semibold text-white">{title}</h3>
              <div className="flex flex-wrap gap-2 text-[12px] text-slate-400">
                {summary.map((item) => (
                  <span key={item.label} className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-1">
                    <span className="text-slate-500">{item.label}：</span>
                    <span className="text-slate-200">{item.value}</span>
                  </span>
                ))}
              </div>
            </div>
            {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
          </div>

          <div className="grid gap-3 xl:grid-cols-2">
            {detail.map((item) => (
              <div key={item.label} className="min-w-0 rounded-[18px] border border-white/8 bg-[rgba(7,14,25,0.48)] px-4 py-3">
                <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{item.label}</div>
                <div className={cn('mt-2 break-words text-[13px] leading-6', item.tone === 'muted' ? 'text-slate-400' : 'text-slate-200')}>
                  {item.value}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function PreviewDialog({ preview, onClose }: { preview: PreviewState | null; onClose: () => void }) {
  if (!preview?.src) return null

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-6 backdrop-blur-sm">
      <div className="grid max-h-[92vh] w-full max-w-6xl gap-4 rounded-[24px] border border-white/10 bg-[#0a1220] p-6">
        <div className="flex items-center justify-between gap-4">
          <div className="grid gap-1">
            <strong className="text-base text-white">{preview.title}</strong>
            <span className="break-all text-xs text-slate-500">{preview.src}</span>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
            关闭
          </Button>
        </div>
        <div className="overflow-hidden rounded-[20px] bg-black">
          {preview.type === 'image' ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview.src} alt={preview.title} className="max-h-[76vh] w-full object-contain" />
          ) : (
            <video src={preview.src} controls autoPlay className="max-h-[76vh] w-full object-contain" />
          )}
        </div>
      </div>
    </div>
  )
}

function ShotEditDialog({
  open,
  draft,
  saving,
  onClose,
  onChange,
  onSubmit,
}: {
  open: boolean
  draft: ShotDraft | null
  saving: boolean
  onClose: () => void
  onChange: (patch: Partial<ShotDraft>) => void
  onSubmit: () => void
}) {
  if (!open || !draft) return null

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-6 backdrop-blur-sm">
      <div className="grid w-full max-w-3xl gap-4 rounded-[24px] border border-white/10 bg-[#091220] p-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">镜头编辑</div>
            <h3 className="mt-1 text-[20px] font-semibold text-white">{draft.shotId}</h3>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-2 text-sm text-slate-300">
            <span>时长（秒）</span>
            <Input value={draft.durationSec} onChange={(event) => onChange({ durationSec: event.target.value })} />
          </label>
          <label className="grid gap-2 text-sm text-slate-300">
            <span>运镜方式</span>
            <Input value={draft.cameraMovement} onChange={(event) => onChange({ cameraMovement: event.target.value })} />
          </label>
          <label className="grid gap-2 text-sm text-slate-300 md:col-span-2">
            <span>脚本文案</span>
            <textarea className="min-h-[96px] rounded-xl border border-white/10 bg-[var(--bg-input)] px-4 py-3 text-sm text-white outline-none" value={draft.scriptText} onChange={(event) => onChange({ scriptText: event.target.value })} />
          </label>
          <label className="grid gap-2 text-sm text-slate-300 md:col-span-2">
            <span>视觉描述</span>
            <textarea className="min-h-[96px] rounded-xl border border-white/10 bg-[var(--bg-input)] px-4 py-3 text-sm text-white outline-none" value={draft.visualDescription} onChange={(event) => onChange({ visualDescription: event.target.value })} />
          </label>
          <label className="grid gap-2 text-sm text-slate-300">
            <span>字幕建议</span>
            <Input value={draft.subtitleSuggestion} onChange={(event) => onChange({ subtitleSuggestion: event.target.value })} />
          </label>
          <label className="grid gap-2 text-sm text-slate-300">
            <span>素材需求</span>
            <Input value={draft.materialNeed} onChange={(event) => onChange({ materialNeed: event.target.value })} />
          </label>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            取消
          </Button>
          <Button onClick={onSubmit} disabled={saving}>
            <Pencil className="h-4 w-4" />
            {saving ? '保存中...' : '保存镜头'}
          </Button>
        </div>
      </div>
    </div>
  )
}

function RuntimeSidebar({ workspace, rows, compact = false }: { workspace: ReturnType<typeof useCloneWorkspace>; rows: StoryboardRow[]; compact?: boolean }) {
  const runtimeStatus = workspace.runtime?.pipeline?.status || workspace.project?.status || 'draft'
  const progressValue = Number(workspace.project?.progressPercent || rows.filter((item) => item.videoSrc).length * 18)
  const logs = workspace.consoleLines
  const billingLogs = workspace.runtime?.recentBillingLogs || []
  const runtimeError = compactText(
    workspace.project?.lastError || workspace.runtime?.pipeline?.errorContext?.message || workspace.runtime?.pipeline?.errorContext?.responseSnippet,
    '',
  )

  return (
    <div className={cn('grid h-full min-h-0 gap-4', compact && 'gap-3')}>
      <GlassCard className="overflow-hidden p-0">
        <div className="relative">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.16),transparent_32%),linear-gradient(180deg,rgba(8,17,31,0.96),rgba(7,14,25,0.88))]" />
          <div className={cn('relative grid gap-4 px-4 py-4', compact && 'gap-3 px-3.5 py-3.5')}>
            <div className="flex items-start justify-between gap-3">
              <div className="grid gap-1">
                <div className="text-[11px] uppercase tracking-[0.24em] text-cyan-100/70">运行总览</div>
                <div className={cn('font-semibold text-white', compact ? 'text-[16px]' : 'text-[18px]')}>任务运行板</div>
                {!compact ? <div className="text-[12px] leading-5 text-slate-400">聚焦当前阶段、错误状态和最新日志，避免信息过度干扰操作。</div> : null}
              </div>
              <StatusBadge status={runtimeStatus} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Metric label="当前阶段" value={formatStepLabel(workspace.project?.currentStep || workspace.project?.workflowV2?.currentStep || '')} hint="流程进度" />
              <Metric label="镜头输出" value={`${rows.filter((item) => item.videoSrc).length}/${rows.length}`} hint="已生成视频" />
            </div>
          </div>
        </div>
      </GlassCard>

      <GlassCard className={cn('p-4', compact && 'p-3.5')}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">运行状态</div>
            <div className="mt-2 flex items-center gap-3">
              <StatusBadge status={runtimeStatus} />
              <span className="text-[12px] text-slate-400">最后更新 {formatDateTime(workspace.project?.updatedAt)}</span>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => workspace.refreshAll()}>
            <RefreshCcw className="h-4 w-4" />
            刷新
          </Button>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/[0.06]">
          <div className="h-full rounded-full bg-[linear-gradient(90deg,#6D5DFF,#22D3EE)]" style={{ width: `${Math.max(8, Math.min(progressValue, 100))}%` }} />
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3">
          <Metric label="完成进度" value={formatPercent(progressValue)} hint="按任务输出估算" />
        </div>
        {runtimeError ? (
          <div className="mt-4 rounded-[16px] border border-rose-400/20 bg-rose-500/10 px-4 py-3">
            <div className="text-[11px] uppercase tracking-[0.18em] text-rose-200/80">当前错误</div>
            <div className="mt-2 break-words text-[12px] leading-6 text-rose-100">{runtimeError}</div>
          </div>
        ) : null}
      </GlassCard>

      <GlassCard className={cn('p-4', compact && 'p-3.5')}>
        <div className="flex items-center justify-between">
          <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">运行日志</div>
          <Button variant="ghost" size="sm" onClick={() => workspace.setPolling(!workspace.polling)}>
            {workspace.polling ? <PauseCircle className="h-4 w-4" /> : <PlayCircle className="h-4 w-4" />}
            {workspace.polling ? '暂停轮询' : '恢复轮询'}
          </Button>
        </div>
        <div className="mt-4 max-h-[360px] overflow-y-auto pr-1">
          <div className="grid gap-2">
            {logs.length ? (
              logs.map((line, index) => (
                <div key={`${line}-${index}`} className="rounded-[14px] border border-white/6 bg-black/20 px-3 py-2 text-[12px] leading-5 text-slate-300">
                  {line}
                </div>
              ))
            ) : (
              <div className="rounded-[14px] border border-dashed border-white/10 px-4 py-6 text-center text-[12px] text-slate-500">当前还没有新的运行日志。</div>
            )}
          </div>
        </div>
      </GlassCard>

      <GlassCard className={cn('p-4', compact && 'p-3.5')}>
        <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">算力流水</div>
        <div className="mt-4 grid max-h-[220px] gap-2 overflow-y-auto pr-1">
          {billingLogs.length ? (
            billingLogs.map((item: any) => (
              <div key={item.id} className="rounded-[14px] border border-white/6 bg-white/[0.03] px-3 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[13px] text-white">{compactText(item.note, '算力变更')}</span>
                  <span className="text-[12px] text-cyan-300">{item.amountCredits > 0 ? `+${item.amountCredits}` : item.amountCredits}</span>
                </div>
                <div className="mt-1 text-[11px] text-slate-500">{formatDateTime(item.createdAt)}</div>
              </div>
            ))
          ) : (
            <div className="rounded-[14px] border border-dashed border-white/10 px-4 py-6 text-center text-[12px] text-slate-500">暂无算力流水。</div>
          )}
        </div>
      </GlassCard>
    </div>
  )
}

function AnalyzeStage({
  workspace,
  templateHint,
  projectSourceHint,
  onNext,
}: {
  workspace: ReturnType<typeof useCloneWorkspace>
  templateHint?: string
  projectSourceHint?: string
  onNext: () => void
}) {
  const analysis = workspace.project?.analysis || workspace.project?.analysisResult || workspace.project?.referenceAnalysis
  const referenceVideoName = toFileName(workspace.project?.referenceVideoPath || workspace.project?.referenceVideoName || workspace.referenceFile?.name || '')
  const canAnalyze = Boolean(workspace.referenceFile || workspace.project?.referenceVideoPath)
  const referencePreview = workspace.referenceFile ? URL.createObjectURL(workspace.referenceFile) : workspace.helpers.previewSrc(workspace.project?.referenceVideoPath || '')
  const analysisReady = Boolean(analysis)
  const analysisStatus = analysisReady ? '已完成' : workspace.analyzeMutation.isPending ? '分析中' : '待分析'
  const structureCards = [
    { time: '0-3s', title: '开场抓点', copy: '前几秒直接抛出商品和记忆点。' },
    { time: '3-15s', title: '卖点建立', copy: '快速讲清主卖点与体验感受。' },
    { time: '15-45s', title: '场景展开', copy: '切入实际使用场景，提高代入感。' },
    { time: '45-70s', title: '价值强化', copy: '补充细节优势与转化信息。' },
    { time: '70s+', title: '结尾召回', copy: '统一品牌语气并引导下一步行动。' },
  ]
  const insightCards = [
    {
      title: '结构节奏',
      copy: compactText(analysis?.structure || analysis?.pace || analysis?.summary, '已完成结构节奏拆解，可直接进入脚本生成。'),
      icon: 'S',
    },
    {
      title: '视觉风格',
      copy: compactText(analysis?.visualStyle || analysis?.shots || analysis?.camera, '已提取画面氛围、景别变化和运镜方式。'),
      icon: 'V',
    },
    {
      title: '卖点提炼',
      copy: compactText(analysis?.sellingPoints || analysis?.highlights || analysis?.keyPoints, '已整理功能亮点、情绪价值和转化表达。'),
      icon: 'P',
    },
  ]
  const scriptPreview = compactText(analysis?.scriptPreview || analysis?.summary || analysis?.structure, '参考视频的核心节奏和卖点已经准备好，可以直接生成脚本。')

  return (
    <div className="grid gap-4">
      <SectionHeader
        eyebrow="阶段 01"
        title="参考分析"
        description="先拆解参考视频结构、节奏和卖点，为后续脚本、分镜和成片生成提供统一基础。"
        actions={
          <>
            <Button variant="secondary" onClick={() => workspace.analyzeMutation.mutate()} disabled={!canAnalyze || workspace.analyzeMutation.isPending}>
              <RefreshCcw className="h-4 w-4" />
              {workspace.analyzeMutation.isPending ? '分析中...' : '重新分析'}
            </Button>
            <Button onClick={onNext} disabled={!analysisReady}>
              进入脚本生成
            </Button>
          </>
        }
      />

      <div className="rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(109,93,255,0.14),transparent_28%),linear-gradient(180deg,rgba(8,14,28,0.98),rgba(7,12,23,0.98))] p-5 shadow-[0_24px_60px_rgba(3,8,19,0.42)]">
        <div className="grid gap-4 xl:grid-cols-[1.02fr_minmax(0,1.58fr)]">
          <div className="rounded-[24px] border border-white/8 bg-[rgba(255,255,255,0.03)] p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">参考视频</div>
                <div className="mt-2 text-[16px] font-semibold text-white">{referenceVideoName || '暂未上传参考视频'}</div>
              </div>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-[12px] font-medium text-slate-200 transition hover:border-violet-300/30 hover:bg-violet-500/10">
                <Upload className="h-4 w-4" />
                {referenceVideoName ? '重新上传' : '上传视频'}
                <input type="file" accept="video/*" className="hidden" onChange={(event) => workspace.setReferenceFile(event.target.files?.[0] || null)} />
              </label>
            </div>

            <div className="overflow-hidden rounded-[20px] border border-white/8 bg-black/40">
              {canAnalyze ? (
                <video src={referencePreview} controls className="aspect-video w-full object-cover" />
              ) : (
                <div className="grid aspect-video place-items-center bg-[radial-gradient(circle_at_top,rgba(109,93,255,0.18),transparent_40%),rgba(7,12,23,0.96)] p-8 text-center">
                  <div className="grid max-w-md gap-3 text-slate-300">
                    <Video className="mx-auto h-8 w-8 text-violet-200" />
                    <strong className="text-base text-white">等待参考视频</strong>
                    <span className="text-[13px] leading-6 text-slate-400">上传一段高转化参考视频，系统会自动提取结构、镜头和卖点节奏。</span>
                  </div>
                </div>
              )}
            </div>

            {(templateHint || projectSourceHint) ? (
              <div className="mt-4 rounded-[18px] border border-white/8 bg-white/[0.03] px-4 py-3 text-[12px] leading-6 text-slate-400">
                {templateHint ? <div>模板来源：{templateHint}</div> : null}
                {projectSourceHint ? <div>素材回填：{projectSourceHint}</div> : null}
              </div>
            ) : null}
          </div>

          <div className="rounded-[24px] border border-white/8 bg-[rgba(255,255,255,0.03)] p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">分析概览</div>
                <div className="mt-2 text-[16px] font-semibold text-white">结构分段与节奏节点</div>
              </div>
              <span className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-1 text-[12px] text-slate-300">{analysisStatus}</span>
            </div>

            <div className="grid gap-3 xl:grid-cols-5">
              {structureCards.map((item, index) => (
                <div
                  key={item.title}
                  className={cn(
                    'rounded-[18px] border px-4 py-4',
                    index === 0 ? 'border-[rgba(109,93,255,0.48)] bg-[rgba(109,93,255,0.12)] shadow-[0_0_0_1px_rgba(109,93,255,0.14)]' : 'border-white/8 bg-white/[0.03]',
                  )}
                >
                  <div className="text-[15px] font-medium text-white">{item.time}</div>
                  <div className="mt-2 text-[16px] font-semibold text-white">{item.title}</div>
                  <div className="mt-1 text-[13px] text-slate-400">{item.copy}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-[1.12fr_1.1fr_320px]">
          <div className="rounded-[24px] border border-white/8 bg-[rgba(255,255,255,0.03)] p-4">
            <div className="mb-4 text-[16px] font-semibold text-white">AI 分析结果</div>
            <div className="grid gap-3 xl:grid-cols-3">
              {insightCards.map((item) => (
                <div key={item.title} className="rounded-[18px] border border-white/8 bg-white/[0.03] px-4 py-4">
                  <div className="grid h-12 w-12 place-items-center rounded-[16px] bg-[rgba(109,93,255,0.14)] text-[16px] font-semibold text-violet-200">{item.icon}</div>
                  <div className="mt-4 text-[18px] font-semibold text-white">{item.title}</div>
                  <div className="mt-2 text-[13px] leading-6 text-slate-400">{item.copy}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[24px] border border-white/8 bg-[rgba(255,255,255,0.03)] p-4">
            <div className="mb-4 text-[16px] font-semibold text-white">脚本预览</div>
            <div className="rounded-[18px] border border-white/8 bg-white/[0.03] px-5 py-5">
              <div className="text-[14px] leading-8 text-slate-300">{scriptPreview}</div>
              <Button className="mt-5 w-full" onClick={onNext} disabled={!analysisReady}>
                同步到脚本阶段
              </Button>
            </div>
          </div>

          <div className="rounded-[24px] border border-white/8 bg-[rgba(255,255,255,0.03)] p-4">
            <div className="mb-4 text-[16px] font-semibold text-white">AI 状态</div>
            <div className="grid place-items-center rounded-[22px] border border-white/8 bg-[radial-gradient(circle_at_center,rgba(109,93,255,0.12),transparent_52%),rgba(255,255,255,0.02)] px-4 py-8 text-center">
              <div className="grid h-36 w-36 place-items-center rounded-full border-[10px] border-violet-500/60 border-t-violet-300 border-r-violet-400/70 text-violet-100">
                <div className="grid h-16 w-16 place-items-center rounded-full border border-white/18 bg-white/[0.03] text-2xl">AI</div>
              </div>
              <div className="mt-6 text-[32px] font-semibold tracking-[-0.04em] text-white">{analysisStatus}</div>
              <div className="mt-2 text-[14px] text-slate-400">准备完成后可进入脚本生成</div>
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap justify-center gap-4">
          <Button className="min-w-[320px]" onClick={() => (analysisReady ? onNext() : workspace.analyzeMutation.mutate())} disabled={workspace.analyzeMutation.isPending || (!analysisReady && !canAnalyze)}>
            {analysisReady ? '进入脚本生成' : workspace.analyzeMutation.isPending ? '分析中...' : '开始分析'}
          </Button>
          <Button variant="secondary" className="min-w-[260px]" onClick={() => workspace.analyzeMutation.mutate()} disabled={!canAnalyze || workspace.analyzeMutation.isPending}>
            <RefreshCcw className="h-4 w-4" />
            重新分析
          </Button>
        </div>
      </div>
    </div>
  )
}

function ScriptStage({ workspace, onPrev, onNext }: { workspace: ReturnType<typeof useCloneWorkspace>; onPrev: () => void; onNext: () => void }) {
  const referenceVideoName = toFileName(workspace.project?.referenceVideoPath || workspace.project?.referenceVideoName || '')
  const referencePreview = workspace.helpers.previewSrc(workspace.project?.referenceVideoPath || '')
  const currentModel = workspace.models.find((model: any) => model.id === workspace.selectedModelId) || workspace.models[0] || null
  const selectedVariant = workspace.scriptCandidates.find((item: any, index: number) => {
    const variantId = String(item.id || item.variantId || `variant-${index}`)
    return workspace.selectedVariantId === variantId
  })

  return (
    <div className="grid gap-4">
      <SectionHeader
        eyebrow="阶段 02"
        title="脚本生成"
        description="确认参考视频和分析结果后，从候选脚本中选出最适合继续做分镜的一版。"
        actions={
          <>
            <Button variant="secondary">导出脚本</Button>
            <Button onClick={onNext} disabled={!workspace.selectedVariantId}>
              进入分镜图片
            </Button>
          </>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)_308px]">
        <GlassCard className="p-4">
          <div className="grid gap-4">
            <div>
              <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">参考视频</div>
              <div className="mt-2 text-[16px] font-semibold text-white">{referenceVideoName || '暂未上传参考视频'}</div>
            </div>

            <div className="overflow-hidden rounded-[20px] border border-white/8 bg-black/40">
              {referencePreview ? (
                <video src={referencePreview} controls className="aspect-[4/5] w-full object-cover" />
              ) : (
                <div className="grid aspect-[4/5] place-items-center text-slate-500">
                  <Video className="h-6 w-6" />
                </div>
              )}
            </div>

            <div className="rounded-[20px] border border-emerald-400/18 bg-emerald-500/8 px-4 py-4">
              <div className="flex items-center gap-2 text-emerald-300">
                <CheckCircle2 className="h-4 w-4" />
                <span className="text-[15px] font-medium">分析已完成</span>
              </div>
              <div className="mt-3 text-[13px] leading-6 text-slate-300">已经提取参考视频的节奏、口播信息和镜头结构，现在可以挑选最合适的脚本版本。</div>
            </div>
          </div>
        </GlassCard>

        <GlassCard className="p-4">
          <div className="grid gap-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">脚本候选</div>
                <div className="mt-2 text-[16px] font-semibold text-white">选择 1 个主版本</div>
              </div>
              <Chip active>{workspace.scriptCandidates.length || 0} 个版本</Chip>
            </div>

            <div className="grid max-h-[620px] gap-4 overflow-y-auto pr-1">
              {workspace.generateVariantsMutation.isPending ? (
                Array.from({ length: 3 }).map((_, index) => <SkeletonBlock key={index} className="h-40" />)
              ) : workspace.scriptCandidates.length ? (
                workspace.scriptCandidates.map((item: any, index: number) => {
                  const variantId = String(item.id || item.variantId || `variant-${index}`)
                  const active = workspace.selectedVariantId === variantId
                  const score = Number(item.score || item.totalScore || 92 - index * 4)
                  return (
                    <button
                      key={variantId}
                      type="button"
                      onClick={() => workspace.chooseVariantMutation.mutate(variantId)}
                      className={cn(
                        'rounded-[22px] border px-5 py-5 text-left transition',
                        active
                          ? 'border-[rgba(109,93,255,0.55)] bg-[linear-gradient(180deg,rgba(109,93,255,0.16),rgba(10,18,32,0.94))] shadow-[0_0_0_1px_rgba(109,93,255,0.18)]'
                          : 'border-white/8 bg-white/[0.03] hover:border-white/15',
                      )}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex items-center gap-3">
                            <span className={cn('h-5 w-5 rounded-full border', active ? 'border-violet-300 bg-violet-400/20' : 'border-white/20')} />
                            <span className="text-[15px] font-semibold text-white">{`版本 ${String(index + 1).padStart(2, '0')}`}</span>
                            {index === 0 ? <span className="rounded-lg bg-violet-500/18 px-2 py-1 text-[11px] font-medium text-violet-100">推荐</span> : null}
                          </div>
                          <p className="mt-4 line-clamp-3 text-[14px] leading-7 text-slate-300">
                            {compactText(item.script || item.text || item.content || item.description, '暂无脚本内容')}
                          </p>
                        </div>

                        <div className="min-w-[88px] text-right">
                          <div className="text-[12px] text-slate-500">评分</div>
                          <div className="mt-3 text-[52px] font-semibold leading-none tracking-[-0.04em] text-violet-400">{score}</div>
                          <div className="mt-1 text-[13px] text-violet-200">分</div>
                        </div>
                      </div>
                    </button>
                  )
                })
              ) : (
                <div className="rounded-[18px] border border-dashed border-white/10 px-5 py-12 text-center text-[13px] text-slate-500">
                  还没有生成脚本候选，先点击下方按钮生成一批候选版本。
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-3">
              <Button variant="secondary" onClick={() => workspace.generateVariantsMutation.mutate()} disabled={!workspace.canGenerateVariants || workspace.generateVariantsMutation.isPending}>
                <RefreshCcw className="h-4 w-4" />
                {workspace.generateVariantsMutation.isPending ? '生成中...' : '重新生成'}
              </Button>
              <div className="text-[12px] text-slate-500">{selectedVariant ? '已选择脚本版本，可继续进入分镜图片。' : '请先选择一个脚本版本。'}</div>
            </div>
          </div>
        </GlassCard>

        <GlassCard className="p-4">
          <div className="grid gap-5">
            <div>
              <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">脚本生成设置</div>
              <div className="mt-2 text-[16px] font-semibold text-white">生成参数</div>
            </div>

            <div className="grid gap-3">
              <div className="text-[13px] text-slate-300">风格倾向</div>
              <div className="flex flex-wrap gap-2">
                {['种草转化', '产品测评', '口播带货', '生活方式'].map((label, index) => (
                  <button
                    key={label}
                    type="button"
                    className={cn(
                      'rounded-[14px] border px-4 py-3 text-[14px] transition',
                      index === 0 ? 'border-violet-400/40 bg-violet-500/20 text-white' : 'border-white/8 bg-white/[0.03] text-slate-300',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-3">
              <div className="text-[13px] text-slate-300">目标时长</div>
              <div className="flex flex-wrap gap-2">
                {[15, 30, 60, 90].map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={cn(
                      'rounded-[14px] border px-5 py-3 text-[14px] transition',
                      value === 60 ? 'border-violet-400/40 bg-violet-500/20 text-white' : 'border-white/8 bg-white/[0.03] text-slate-300',
                    )}
                  >
                    {value}s
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-3">
              <div className="text-[13px] text-slate-300">输出语言</div>
              <div className="rounded-[16px] border border-white/8 bg-white/[0.03] px-4 py-4 text-[14px] text-white">中文</div>
            </div>

            <div className="grid gap-3">
              <div className="text-[13px] text-slate-300">生成数量</div>
              <div className="rounded-[16px] border border-white/8 bg-white/[0.03] px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[14px] text-white">{workspace.variantCount} 个候选</span>
                  <Input
                    className="h-9 w-24 border-white/8 bg-transparent text-right"
                    value={String(workspace.variantCount)}
                    onChange={(event) => workspace.setVariantCount(Math.max(1, Number(event.target.value || 1)))}
                  />
                </div>
              </div>
            </div>

            <div className="rounded-[20px] border border-white/8 bg-white/[0.03] px-4 py-4">
              <div className="text-[12px] text-slate-500">当前模特</div>
              <div className="mt-2 text-[14px] text-white">{currentModel?.name || workspace.selectedModelId || '未选择模特'}</div>
              <div className="mt-3 text-[12px] leading-6 text-slate-400">候选脚本会结合当前模特、时长和风格倾向生成，并保留多版本供你筛选。</div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="secondary" className="flex-1" onClick={onPrev}>
                返回参考分析
              </Button>
              <Button className="flex-1" onClick={onNext} disabled={!workspace.selectedVariantId}>
                进入分镜图片
              </Button>
            </div>
          </div>
        </GlassCard>
      </div>
    </div>
  )
}

function StoryboardStage({
  workspace,
  rows,
  page,
  totalPages,
  pagedRows,
  onPageChange,
  onPreview,
  onEdit,
  onPrev,
  onNext,
}: {
  workspace: ReturnType<typeof useCloneWorkspace>
  rows: StoryboardRow[]
  page: number
  totalPages: number
  pagedRows: StoryboardRow[]
  onPageChange: (page: number) => void
  onPreview: (preview: PreviewState) => void
  onEdit: (row: StoryboardRow) => void
  onPrev: () => void
  onNext: () => void
}) {
  const completedFrames = rows.filter((row) => row.imageSrc).length
  const lockedRows = rows.filter((row) => row.locked).length
  const [activeShotId, setActiveShotId] = useState('')
  const activeRow = pagedRows.find((row) => row.shotId === activeShotId) || rows.find((row) => row.shotId === activeShotId) || pagedRows[0] || rows[0] || null
  const storyboardSuggestions = [
    { title: '统一主体角度', copy: '保持产品主视角一致，避免镜头切换后主体比例突变。' },
    { title: '强调卖点层级', copy: '把核心功能放在前 2 个镜头里，后续镜头承接细节与氛围。' },
    { title: '压缩单镜时长', copy: '当前节奏偏松，可将长镜头压缩到 4 秒以内。' },
  ]
  const materialLibrary = ['特写', '半身', '场景', '手部', '细节', '包装']

  useEffect(() => {
    if (!activeShotId && pagedRows[0]?.shotId) setActiveShotId(pagedRows[0].shotId)
  }, [activeShotId, pagedRows])

  useEffect(() => {
    if (activeShotId && !pagedRows.some((row) => row.shotId === activeShotId) && pagedRows[0]?.shotId) {
      setActiveShotId(pagedRows[0].shotId)
    }
  }, [activeShotId, pagedRows])

  return (
    <div className="grid gap-4">
      <SectionHeader
        eyebrow="阶段 03"
        title="分镜图片"
        description="将脚本拆成可执行镜头，集中查看画面、提示词、字幕和锁定状态。"
        actions={
          <>
            <Chip active>已生成 {completedFrames}/{rows.length}</Chip>
            <Button variant="secondary" onClick={() => workspace.createShotMutation.mutate(rows.at(-1)?.shotId)}>
              <Plus className="h-4 w-4" />
              添加镜头
            </Button>
            <Button onClick={() => workspace.generateImagesMutation.mutate()} disabled={!workspace.canGenerateImages || workspace.generateImagesMutation.isPending}>
              <ImageIcon className="h-4 w-4" />
              {workspace.generateImagesMutation.isPending ? '生成中...' : '智能生成分镜'}
            </Button>
          </>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_312px]">
        <div className="grid gap-4">
          <GlassCard className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" className="rounded-xl px-4">主视图</Button>
                <Button variant="ghost" size="sm" className="rounded-xl border border-white/8 bg-white/[0.02] px-4 text-slate-300">脚本视图</Button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="secondary" size="sm">
                  <Sparkles className="h-4 w-4" />
                  一键优化
                </Button>
                <Button variant="secondary" size="sm">分镜设置</Button>
              </div>
            </div>
          </GlassCard>

          <StageSection title="分镜列表" description="查看当前页镜头草图、提示词、时长、景别、运镜和字幕信息。">
            <div className="grid gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="secondary" size="sm" onClick={() => workspace.generateImagesMutation.mutate()} disabled={!workspace.canGenerateImages || workspace.generateImagesMutation.isPending}>
                    <Sparkles className="h-4 w-4" />
                    {workspace.generateImagesMutation.isPending ? '生成中...' : '批量生成分镜'}
                  </Button>
                  <Button variant="secondary" size="sm">
                    <Copy className="h-4 w-4" />
                    批量复制
                  </Button>
                  <Button variant="secondary" size="sm">镜头模板</Button>
                  <Button variant="secondary" size="sm">调色风格</Button>
                  <Button variant="secondary" size="sm">画面比例 9:16</Button>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-[12px] text-slate-400">
                  <span>共 {rows.length} 个镜头</span>
                  <span className="rounded-full border border-[rgba(109,93,255,0.3)] bg-[rgba(109,93,255,0.12)] px-3 py-1 text-violet-100">已锁定 {lockedRows}</span>
                </div>
              </div>

              <div className="overflow-hidden rounded-[22px] border border-white/8 bg-[rgba(5,12,22,0.68)]">
                <div className="grid grid-cols-[84px_minmax(280px,1.7fr)_92px_72px_72px_minmax(180px,0.9fr)_88px] gap-0 border-b border-white/8 bg-white/[0.03] px-4 py-3 text-[12px] font-medium text-slate-400">
                  <div>镜头</div>
                  <div>画面 / 提示词</div>
                  <div>时长</div>
                  <div>景别</div>
                  <div>运镜</div>
                  <div>字幕 / 备注</div>
                  <div className="text-right">操作</div>
                </div>

                <div className="grid max-h-[720px] overflow-y-auto">
                  {pagedRows.map((row) => {
                    const selected = activeRow?.shotId === row.shotId
                    return (
                      <button
                        key={row.shotId}
                        type="button"
                        onClick={() => setActiveShotId(row.shotId)}
                        className={cn(
                          'grid grid-cols-[84px_minmax(280px,1.7fr)_92px_72px_72px_minmax(180px,0.9fr)_88px] items-stretch gap-0 border-b border-white/6 px-4 py-3 text-left transition',
                          selected ? 'bg-[rgba(109,93,255,0.08)]' : 'hover:bg-white/[0.025]',
                        )}
                      >
                        <div className="flex items-center gap-3 pr-3">
                          <div className="grid h-12 w-12 place-items-center rounded-[14px] border border-white/10 bg-white/[0.03] text-[13px] font-semibold text-white">
                            {String(row.order).padStart(2, '0')}
                          </div>
                        </div>

                        <div className="grid min-w-0 grid-cols-[156px_minmax(0,1fr)] gap-3 pr-4">
                          <div className="overflow-hidden rounded-[14px] border border-white/8 bg-black/40">
                            {row.imageSrc ? (
                              <img src={row.imageSrc} alt={`shot-${row.order}`} className="aspect-[16/10] h-full w-full object-cover" />
                            ) : (
                              <div className="grid aspect-[16/10] place-items-center text-slate-500">
                                <ImageIcon className="h-5 w-5" />
                              </div>
                            )}
                          </div>
                          <div className="min-w-0 py-1">
                            <div className="line-clamp-2 text-[13px] leading-6 text-white">{row.visualDescription}</div>
                            <div className="mt-2 line-clamp-2 text-[12px] leading-5 text-slate-400">{row.scriptText}</div>
                            <div className="mt-2 flex flex-wrap gap-2">
                              <span className="rounded-lg border border-white/8 bg-white/[0.03] px-2 py-1 text-[11px] text-slate-400">{row.materialNeed}</span>
                              {row.locked ? <span className="rounded-lg border border-amber-300/20 bg-amber-400/10 px-2 py-1 text-[11px] text-amber-100">已锁定</span> : null}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center text-[13px] text-slate-200">{`00:0${Math.min(row.duration, 9)}`}</div>
                        <div className="flex items-center text-[13px] text-slate-300">{row.duration >= 4 ? '远景' : row.duration <= 2 ? '特写' : '中景'}</div>
                        <div className="flex items-center text-[13px] text-slate-300">{row.cameraMovement}</div>
                        <div className="flex items-center pr-3 text-[13px] leading-6 text-slate-300">{row.subtitle}</div>

                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            className="rounded-lg border border-white/8 bg-white/[0.03] p-2 text-slate-200 transition hover:border-white/15 hover:bg-white/[0.06]"
                            onClick={(event) => {
                              event.stopPropagation()
                              onEdit(row)
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            className="rounded-lg border border-white/8 bg-white/[0.03] p-2 text-slate-200 transition hover:border-white/15 hover:bg-white/[0.06]"
                            onClick={(event) => {
                              event.stopPropagation()
                              workspace.regenerateImageMutation.mutate(row.shotId)
                            }}
                          >
                            <RefreshCcw className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            className="rounded-lg border border-white/8 bg-white/[0.03] p-2 text-slate-200 transition hover:border-white/15 hover:bg-white/[0.06]"
                            onClick={(event) => {
                              event.stopPropagation()
                              workspace.toggleLockMutation.mutate({ shotId: row.shotId, locked: !row.locked })
                            }}
                          >
                            {row.locked ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                          </button>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>

              <button
                type="button"
                onClick={() => workspace.createShotMutation.mutate(rows.at(-1)?.shotId)}
                className="flex h-16 items-center justify-center gap-2 rounded-[20px] border border-dashed border-[rgba(109,93,255,0.32)] bg-[rgba(109,93,255,0.06)] text-[14px] font-medium text-violet-100 transition hover:bg-[rgba(109,93,255,0.1)]"
              >
                <Plus className="h-4 w-4" />
                新增镜头
              </button>
            </div>
          </StageSection>
        </div>

        <div className="grid content-start gap-4 xl:sticky xl:top-[88px] xl:self-start">
          <GlassCard className="overflow-hidden p-0">
            <div className="border-b border-white/8 px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">镜头预览</div>
                  <div className="mt-2 text-[18px] font-semibold text-white">{activeRow ? `镜头 ${String(activeRow.order).padStart(2, '0')}` : '未选择镜头'}</div>
                </div>
                <span className="text-[12px] text-slate-400">{rows.length ? `${activeRow?.order || 1} / ${rows.length}` : '0 / 0'}</span>
              </div>
            </div>
            <div className="p-4">
              <button
                type="button"
                className="w-full overflow-hidden rounded-[18px] border border-white/8 bg-black/40"
                onClick={() => activeRow?.imageSrc && onPreview({ title: `镜头 ${activeRow.order}`, src: activeRow.imageSrc, type: 'image' })}
              >
                {activeRow?.imageSrc ? (
                  <img src={activeRow.imageSrc} alt={`active-shot-${activeRow.order}`} className="aspect-[4/3] w-full object-cover" />
                ) : (
                  <div className="grid aspect-[4/3] place-items-center text-slate-500">
                    <ImageIcon className="h-6 w-6" />
                  </div>
                )}
              </button>
              <div className="mt-3 rounded-[16px] border border-white/8 bg-white/[0.03] px-3 py-3">
                <div className="text-[12px] text-slate-500">字幕建议</div>
                <div className="mt-2 text-[13px] leading-6 text-slate-200">{activeRow?.subtitle || '等待字幕建议'}</div>
              </div>
            </div>
          </GlassCard>

          <GlassCard className="p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">AI 建议</div>
                <div className="mt-2 text-[18px] font-semibold text-white">精修方向</div>
              </div>
            </div>
            <div className="grid gap-3">
              {storyboardSuggestions.map((item) => (
                <div key={item.title} className="rounded-[18px] border border-white/8 bg-white/[0.03] px-4 py-4">
                  <div className="text-[14px] font-medium text-white">{item.title}</div>
                  <div className="mt-2 text-[12px] leading-6 text-slate-400">{item.copy}</div>
                  <Button variant="secondary" size="sm" className="mt-3 w-full">保持当前风格</Button>
                </div>
              ))}
            </div>
          </GlassCard>

          <GlassCard className="p-4">
            <div className="mb-3">
              <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">素材参考</div>
              <div className="mt-2 text-[18px] font-semibold text-white">画面方向</div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {materialLibrary.map((label) => (
                <div key={label} className="overflow-hidden rounded-[14px] border border-white/8 bg-[linear-gradient(180deg,rgba(146,212,255,0.08),rgba(14,22,35,0.78))]">
                  <div className="aspect-square bg-[radial-gradient(circle_at_top_left,rgba(162,89,255,0.24),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(34,211,238,0.18),transparent_35%),rgba(9,16,27,0.96)]" />
                  <div className="px-2 py-2 text-center text-[11px] text-slate-300">{label}</div>
                </div>
              ))}
            </div>
          </GlassCard>

          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={onPrev}>返回脚本生成</Button>
            <Button className="flex-1" onClick={onNext}>进入分镜视频</Button>
          </div>
        </div>
      </div>

      <PaginationBar page={page} totalPages={totalPages} totalCount={rows.length} onPageChange={onPageChange} />
    </div>
  )
}

function ShotVideoStage({
  workspace,
  rows,
  page,
  totalPages,
  pagedRows,
  onPageChange,
  onPreview,
  onPrev,
  onNext,
}: {
  workspace: ReturnType<typeof useCloneWorkspace>
  rows: StoryboardRow[]
  page: number
  totalPages: number
  pagedRows: StoryboardRow[]
  onPageChange: (page: number) => void
  onPreview: (preview: PreviewState) => void
  onPrev: () => void
  onNext: () => void
}) {
  const completedCount = rows.filter((item) => item.videoSrc).length

  return (
    <div className="grid gap-4">
      <SectionHeader
        eyebrow="阶段 04"
        title="分镜视频"
        description="按镜头卡片查看当前视频输出、进度和操作，不再使用拥挤表格。"
        actions={
          <>
            <Chip active>{completedCount}/{rows.length} 已完成</Chip>
            <Button onClick={() => workspace.generateVideosMutation.mutate()} disabled={!workspace.canGenerateVideos || workspace.generateVideosMutation.isPending}>
              <Video className="h-4 w-4" />
              {workspace.generateVideosMutation.isPending ? '提交中...' : '批量生成视频'}
            </Button>
          </>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_252px]">
        <StageSection title="镜头视频列表" description="每个镜头独立展示参考图、视频预览和生成状态，减少横向滚动。">
          <div className="grid max-h-[660px] gap-4 overflow-y-auto pr-1">
            {pagedRows.map((row, index) => {
              const status = row.videoSrc ? 'completed' : index === 0 && workspace.generateVideosMutation.isPending ? 'running' : 'queued'
              return (
                <ShotCard
                  key={row.shotId}
                  row={row}
                  title={`镜头 ${row.order} 视频生成`}
                  preview={
                    <div className="grid gap-3 sm:grid-cols-2">
                      <button
                        type="button"
                        className="overflow-hidden rounded-[16px] border border-white/8 bg-white/[0.03]"
                        onClick={() => row.imageSrc && onPreview({ title: `分镜 ${row.order}`, src: row.imageSrc, type: 'image' })}
                      >
                        {row.imageSrc ? (
                          <img src={row.imageSrc} alt={row.shotId} className="h-24 w-full object-cover" />
                        ) : (
                          <div className="grid h-24 place-items-center text-slate-500">
                            <ImageIcon className="h-5 w-5" />
                          </div>
                        )}
                      </button>
                      <button
                        type="button"
                        className="overflow-hidden rounded-[16px] border border-white/8 bg-white/[0.03]"
                        onClick={() => row.videoSrc && onPreview({ title: `镜头视频 ${row.order}`, src: row.videoSrc, type: 'video' })}
                      >
                        {row.videoSrc ? (
                          <video src={row.videoSrc} className="h-24 w-full object-cover" muted />
                        ) : (
                          <div className="grid h-24 place-items-center text-slate-500">
                            <Video className="h-5 w-5" />
                          </div>
                        )}
                      </button>
                    </div>
                  }
                  meta={<StatusBadge status={status} />}
                  summary={[
                    { label: '镜头序号', value: row.order },
                    { label: '时长', value: `${row.duration}s` },
                  ]}
                  detail={[
                    { label: '提示词', value: row.scriptText },
                    { label: '运镜方式', value: row.cameraMovement, tone: 'muted' },
                    { label: '字幕建议', value: row.subtitle, tone: 'muted' },
                  ]}
                  actions={
                    <>
                      <Button variant="ghost" size="sm" onClick={() => workspace.syncVideoMutation.mutate(row.shotId)}>
                        <RefreshCcw className="h-4 w-4" />
                        同步
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => workspace.regenerateVideoMutation.mutate(row.shotId)}>
                        <Sparkles className="h-4 w-4" />
                        重生
                      </Button>
                    </>
                  }
                />
              )
            })}
          </div>
        </StageSection>

        <div className="grid gap-4">
          <GlassCard className="p-5">
            <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">关键进度</div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/[0.06]">
              <div className="h-full rounded-full bg-[linear-gradient(90deg,#6D5DFF,#22D3EE)]" style={{ width: `${Math.max(8, Math.round((completedCount / Math.max(rows.length, 1)) * 100))}%` }} />
            </div>
            <div className="mt-4 grid gap-3">
              <Metric label="完成度" value={formatPercent((completedCount / Math.max(rows.length, 1)) * 100)} hint="镜头视频状态" />
            </div>
          </GlassCard>

          <GlassCard className="p-5">
            <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">关键设置</div>
            <div className="mt-4 grid gap-3">
              <div className="rounded-[18px] border border-white/8 bg-white/[0.03] px-4 py-4">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] text-slate-400">模型通道</span>
                  <span className="text-[13px] text-white">{workspace.selectedModelId || '默认通道'}</span>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" className="flex-1" onClick={onPrev}>上一步</Button>
                <Button className="flex-1" onClick={onNext}>下一步</Button>
              </div>
            </div>
          </GlassCard>
        </div>
      </div>

      <PaginationBar page={page} totalPages={totalPages} totalCount={rows.length} onPageChange={onPageChange} />
    </div>
  )
}

function ComposeStage({
  workspace,
  rows,
  page,
  totalPages,
  pagedRows,
  onPageChange,
  activeShotId,
  setActiveShotId,
  onPreview,
  onEdit,
  onPrev,
}: {
  workspace: ReturnType<typeof useCloneWorkspace>
  rows: StoryboardRow[]
  page: number
  totalPages: number
  pagedRows: StoryboardRow[]
  onPageChange: (page: number) => void
  activeShotId: string
  setActiveShotId: (shotId: string) => void
  onPreview: (preview: PreviewState) => void
  onEdit: (row: StoryboardRow) => void
  onPrev: () => void
}) {
  const activeRow = rows.find((item) => item.shotId === activeShotId) || rows[0] || null
  const activeIndex = rows.findIndex((item) => item.shotId === activeRow?.shotId)
  const canMovePrev = activeIndex > 0
  const canMoveNext = activeIndex >= 0 && activeIndex < rows.length - 1
  const outputPath = workspace.project?.finalCompose?.outputPath || workspace.project?.finalOutputPath || ''

  const moveShot = (direction: -1 | 1) => {
    if (!activeRow) return
    const currentIndex = rows.findIndex((item) => item.shotId === activeRow.shotId)
    const targetIndex = currentIndex + direction
    if (targetIndex < 0 || targetIndex >= rows.length) return
    const reordered = [...rows]
    const [current] = reordered.splice(currentIndex, 1)
    reordered.splice(targetIndex, 0, current)
    workspace.reorderShotsMutation.mutate(reordered.map((item) => item.shotId))
    setActiveShotId(current.shotId)
  }

  return (
    <div className="grid gap-4">
      <SectionHeader
        eyebrow="阶段 05"
        title="成片输出"
        description="优先看成片预览和镜头顺序，再处理导出目录和成片合成。"
        actions={
          <>
            <Chip active>{outputPath ? '已有成片输出' : workspace.composeMutation.isPending ? '合成中' : '待合成'}</Chip>
            <Button variant="secondary" onClick={() => activeRow && onEdit(activeRow)} disabled={!activeRow}>
              <Pencil className="h-4 w-4" />
              编辑当前镜头
            </Button>
            <Button onClick={() => workspace.composeMutation.mutate()} disabled={!workspace.canCompose || workspace.composeMutation.isPending}>
              <Video className="h-4 w-4" />
              {workspace.composeMutation.isPending ? '合成中...' : '合成最终成片'}
            </Button>
          </>
        }
      />

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_248px]">
        <div className="grid gap-4">
          <GlassCard className="p-5">
            <div className="overflow-hidden rounded-[22px] border border-white/8 bg-black">
              {outputPath ? (
                <video src={workspace.helpers.previewSrc(outputPath)} controls className="aspect-video w-full object-contain" />
              ) : activeRow?.videoSrc ? (
                <video src={activeRow.videoSrc} controls className="aspect-video w-full object-contain" />
              ) : (
                <div className="grid aspect-video place-items-center text-slate-500">
                  <div className="grid justify-items-center gap-3">
                    <Video className="h-7 w-7" />
                    <span className="text-[13px]">等待成片输出</span>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">当前镜头</div>
                <div className="mt-1 text-[16px] font-semibold text-white">{activeRow ? `镜头 ${activeRow.order}` : '未选择镜头'}</div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="secondary" onClick={() => moveShot(-1)} disabled={!canMovePrev}>前移</Button>
                <Button variant="secondary" onClick={() => moveShot(1)} disabled={!canMoveNext}>后移</Button>
                <Button variant="secondary" onClick={() => activeRow?.imageSrc && onPreview({ title: `分镜 ${activeRow.order}`, src: activeRow.imageSrc, type: 'image' })} disabled={!activeRow?.imageSrc}>
                  <ImageIcon className="h-4 w-4" />
                  查看分镜
                </Button>
                <Button variant="danger" onClick={() => activeRow && workspace.removeShotMutation.mutate(activeRow.shotId)} disabled={!activeRow}>
                  <Trash2 className="h-4 w-4" />
                  删除镜头
                </Button>
              </div>
            </div>
          </GlassCard>

          <StageSection title="镜头顺序" description="纵向镜头卡片更接近设计稿，也更便于调整当前镜头的出场顺序。">
            <div className="grid gap-3">
              {pagedRows.map((row) => {
                const active = row.shotId === activeRow?.shotId
                return (
                  <button
                    key={row.shotId}
                    type="button"
                    onClick={() => setActiveShotId(row.shotId)}
                    className={cn(
                      'grid grid-cols-[84px_minmax(0,1fr)_auto] items-center gap-3 rounded-[18px] border px-3 py-3 text-left transition',
                      active ? 'border-[rgba(109,93,255,0.42)] bg-[rgba(109,93,255,0.12)]' : 'border-white/8 bg-white/[0.03] hover:border-white/15',
                    )}
                  >
                    <div className="overflow-hidden rounded-[14px] bg-black">
                      {row.videoSrc ? (
                        <video src={row.videoSrc} className="aspect-[4/5] w-full object-cover" muted />
                      ) : row.imageSrc ? (
                        <img src={row.imageSrc} alt={row.shotId} className="aspect-[4/5] w-full object-cover" />
                      ) : (
                        <div className="grid aspect-[4/5] place-items-center text-slate-500">
                          <Video className="h-5 w-5" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="text-[14px] font-medium text-white">镜头 {row.order}</div>
                      <div className="mt-1 line-clamp-2 text-[12px] leading-5 text-slate-400">{row.scriptText}</div>
                    </div>
                    <div className="text-right text-[12px] text-slate-500">{row.duration}s</div>
                  </button>
                )
              })}
            </div>
          </StageSection>

          <PaginationBar page={page} totalPages={totalPages} totalCount={rows.length} onPageChange={onPageChange} />
        </div>

        <div className="grid gap-4">
          <GlassCard className="p-5">
            <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">导出设置</div>
            <div className="mt-4 grid gap-3">
              <Metric label="总时长" value={`${rows.reduce((sum, item) => sum + item.duration, 0)} 秒`} hint="镜头累计时长" />
              <Metric label="镜头数量" value={`${rows.length}`} hint="参与合成条目" />
              <label className="grid gap-2 text-[13px] text-slate-300">
                <span>输出目录</span>
                <div className="flex items-center gap-2">
                  <Input value={workspace.composeOutputDir} onChange={(event) => workspace.setComposeOutputDir(event.target.value)} placeholder="可选：填写输出目录" />
                  <Button variant="secondary">
                    <FolderOpen className="h-4 w-4" />
                  </Button>
                </div>
              </label>
              <div className="rounded-[18px] border border-white/8 bg-white/[0.03] px-4 py-4">
                <div className="text-[12px] text-slate-500">最终输出</div>
                <div className="mt-2 break-all text-[13px] text-white">{outputPath || '尚未生成最终成片'}</div>
              </div>
            </div>
          </GlassCard>

          <StageSection title="快捷操作" description="保留导出、预览和回退操作，移除无关信息块。">
            <div className="grid gap-2">
              <Button variant="secondary" onClick={() => activeRow?.shotId && workspace.regenerateVideoMutation.mutate(activeRow.shotId)} disabled={!activeRow}>
                <Sparkles className="h-4 w-4" />
                重生当前镜头
              </Button>
              <Button variant="secondary" onClick={() => outputPath && onPreview({ title: '最终成片', src: workspace.helpers.previewSrc(outputPath), type: 'video' })} disabled={!outputPath}>
                <PlayCircle className="h-4 w-4" />
                预览最终成片
              </Button>
              <Button variant="secondary" disabled={!outputPath}>
                <Copy className="h-4 w-4" />
                复制输出路径
              </Button>
              <Button variant="secondary" onClick={onPrev}>上一步</Button>
            </div>
          </StageSection>
        </div>
      </div>
    </div>
  )
}

function PaginationBar({
  page,
  totalPages,
  totalCount,
  onPageChange,
}: {
  page: number
  totalPages: number
  totalCount: number
  onPageChange: (page: number) => void
}) {
  if (totalPages <= 1) return null

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[20px] border border-white/8 bg-white/[0.03] px-4 py-3">
      <div className="text-[12px] text-slate-400">共 {totalCount} 条数据，当前第 {page} / {totalPages} 页</div>
      <div className="flex items-center gap-2">
        <Button variant="secondary" size="sm" onClick={() => onPageChange(Math.max(1, page - 1))} disabled={page <= 1}>上一页</Button>
        <Button variant="secondary" size="sm" onClick={() => onPageChange(Math.min(totalPages, page + 1))} disabled={page >= totalPages}>下一页</Button>
      </div>
    </div>
  )
}

export default function CloneProjectDetailPage() {
  const params = useParams<{ projectId: string }>()
  const searchParams = useSearchParams()
  const projectId = String(params?.projectId || '')
  const { ready, authed, redirecting, sessionRestoring } = useAuthGuard()
  const workspace = useCloneWorkspace(projectId)

  const rows = useMemo(() => buildRows(workspace), [workspace])
  const derivedStage = useMemo(() => deriveStage(workspace), [workspace])
  const [currentStage, setCurrentStage] = useState<CloneStage>('upload_analyze_script')
  const [preview, setPreview] = useState<PreviewState | null>(null)
  const [activeShotId, setActiveShotId] = useState('')
  const [editDraft, setEditDraft] = useState<ShotDraft | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [storyboardPage, setStoryboardPage] = useState(1)
  const [videoPage, setVideoPage] = useState(1)
  const [composePage, setComposePage] = useState(1)
  const prefilledModelRef = useRef<string>('')
  const importedProjectRef = useRef<string>('')

  const templateHint = searchParams.get('template') || ''
  const prefillModel = searchParams.get('prefillModel') || ''
  const fromProject = searchParams.get('fromProject') || ''
  const pageSize = 8

  const storyboardTotalPages = Math.max(1, Math.ceil(rows.length / pageSize))
  const videoTotalPages = Math.max(1, Math.ceil(rows.length / pageSize))
  const composeTotalPages = Math.max(1, Math.ceil(rows.length / pageSize))

  const storyboardRows = rows.slice((storyboardPage - 1) * pageSize, storyboardPage * pageSize)
  const videoRows = rows.slice((videoPage - 1) * pageSize, videoPage * pageSize)
  const composeRows = rows.slice((composePage - 1) * pageSize, composePage * pageSize)

  useEffect(() => {
    setCurrentStage(derivedStage)
  }, [derivedStage])

  useEffect(() => {
    if (!activeShotId && rows[0]?.shotId) setActiveShotId(rows[0].shotId)
  }, [activeShotId, rows])

  useEffect(() => {
    setStoryboardPage(1)
    setVideoPage(1)
    setComposePage(1)
  }, [rows.length])

  useEffect(() => {
    if (!prefillModel || !workspace.models.length) return
    if (workspace.selectedModelId === prefillModel) return
    if (prefilledModelRef.current === `${projectId}:${prefillModel}`) return
    if (!workspace.models.some((item: any) => item.id === prefillModel)) return
    prefilledModelRef.current = `${projectId}:${prefillModel}`
    workspace.selectModelMutation.mutate(prefillModel)
  }, [prefillModel, projectId, workspace.models, workspace.selectedModelId, workspace.selectModelMutation])

  useEffect(() => {
    async function importSourceProject() {
      if (!fromProject || !projectId) return
      if (workspace.productImages.length > 0) return
      if (importedProjectRef.current === `${projectId}:${fromProject}`) return
      importedProjectRef.current = `${projectId}:${fromProject}`
      try {
        const result = await apiClient.getCloneProject(fromProject)
        const paths = result.project?.productReferenceImagePaths || []
        if (Array.isArray(paths) && paths.length) workspace.saveProductPathsMutation.mutate(paths)
      } catch {
        importedProjectRef.current = ''
      }
    }

    void importSourceProject()
  }, [fromProject, projectId, workspace.productImages.length, workspace.saveProductPathsMutation])

  if (sessionRestoring || (!ready && !authed)) {
    return <AuthRedirectScreen title="正在恢复任务工作台" description="系统正在校验登录状态并同步当前任务详情。" />
  }

  if (redirecting || !authed) return <AuthRedirectScreen />

  const updateStage = (stage: CloneStage) => {
    setCurrentStage(stage)
    workspace.updateStageMutation.mutate(stage)
  }

  const openEdit = (row: StoryboardRow) => {
    setEditDraft({
      shotId: row.shotId,
      scriptText: row.scriptText,
      visualDescription: row.visualDescription,
      cameraMovement: row.cameraMovement,
      subtitleSuggestion: row.subtitle,
      materialNeed: row.materialNeed,
      durationSec: String(row.duration),
    })
    setEditOpen(true)
  }

  const submitEdit = () => {
    if (!editDraft) return
    workspace.updateShotMutation.mutate({
      shotId: editDraft.shotId,
      scriptText: editDraft.scriptText,
      visualDescription: editDraft.visualDescription,
      cameraMovement: editDraft.cameraMovement,
      subtitleSuggestion: editDraft.subtitleSuggestion,
      materialNeed: editDraft.materialNeed,
      durationSec: Math.max(1, Number(editDraft.durationSec || 1)),
    })
    setEditOpen(false)
  }

  let content: ReactNode = null

  if (workspace.loading) {
    content = (
      <div className="grid gap-4">
        <SkeletonBlock className="h-40" />
        <SkeletonBlock className="h-[420px]" />
        <SkeletonBlock className="h-[320px]" />
      </div>
    )
  } else if (workspace.error) {
    content = (
      <ErrorState
        title="任务详情加载失败"
        description={workspace.error instanceof Error ? workspace.error.message : '当前无法读取任务详情，请稍后重试。'}
        onRetry={() => void workspace.refreshAll()}
      />
    )
  } else if (!workspace.project) {
    content = (
      <EmptyState
        title="任务不存在或暂未同步"
        description="可能任务已被删除，或者当前项目数据还未同步完成。你可以返回任务列表重新选择。"
        actionLabel="返回任务列表"
        href="/clone"
      />
    )
  } else if (currentStage === 'upload_analyze_script') {
    content = (
      <AnalyzeStage
        workspace={workspace}
        templateHint={templateHint || ''}
        projectSourceHint={fromProject ? `已从任务 ${fromProject} 回填商品素材` : ''}
        onNext={() => updateStage(getNextStage(currentStage))}
      />
    )
  } else if (currentStage === 'generate_script_variants') {
    content = <ScriptStage workspace={workspace} onPrev={() => updateStage(getPrevStage(currentStage))} onNext={() => updateStage(getNextStage(currentStage))} />
  } else if (currentStage === 'generate_storyboard_grids') {
    content = (
      <StoryboardStage
        workspace={workspace}
        rows={rows}
        page={storyboardPage}
        totalPages={storyboardTotalPages}
        pagedRows={storyboardRows}
        onPageChange={setStoryboardPage}
        onPreview={setPreview}
        onEdit={openEdit}
        onPrev={() => updateStage(getPrevStage(currentStage))}
        onNext={() => updateStage(getNextStage(currentStage))}
      />
    )
  } else if (currentStage === 'generate_shot_videos') {
    content = (
      <ShotVideoStage
        workspace={workspace}
        rows={rows}
        page={videoPage}
        totalPages={videoTotalPages}
        pagedRows={videoRows}
        onPageChange={setVideoPage}
        onPreview={setPreview}
        onPrev={() => updateStage(getPrevStage(currentStage))}
        onNext={() => updateStage(getNextStage(currentStage))}
      />
    )
  } else {
    content = (
      <ComposeStage
        workspace={workspace}
        rows={rows}
        page={composePage}
        totalPages={composeTotalPages}
        pagedRows={composeRows}
        onPageChange={setComposePage}
        activeShotId={activeShotId}
        setActiveShotId={setActiveShotId}
        onPreview={setPreview}
        onEdit={openEdit}
        onPrev={() => updateStage(getPrevStage(currentStage))}
      />
    )
  }

  return (
    <AppShell sidebarContent={null}>
      <div className="grid gap-3">
        <div className="grid gap-2.5 rounded-[24px] border border-white/8 bg-[linear-gradient(180deg,rgba(10,18,32,0.96),rgba(7,14,25,0.92))] px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="grid gap-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <StageBadge>爆款复刻</StageBadge>
                <StatusBadge status={workspace.project?.status} />
              </div>
              <h1 className="text-[16px] font-semibold leading-6 text-white xl:text-[18px]">{workspace.project?.title || '爆款复刻工作台'}</h1>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[12px] text-slate-400">
              <Chip>进度 {formatPercent(workspace.project?.progressPercent)}</Chip>
              <Chip>{workspace.project?.updatedAt ? `更新 ${formatDateTime(workspace.project?.updatedAt).slice(11)}` : '等待同步'}</Chip>
            </div>
          </div>
          <CloneStageNav currentStep={currentStage} onStepChange={(stage) => updateStage(stage as CloneStage)} />
        </div>

        <div
          className={cn(
            'grid min-h-0 flex-1 gap-4',
            currentStage === 'upload_analyze_script' || currentStage === 'generate_script_variants' || currentStage === 'generate_storyboard_grids'
              ? 'xl:grid-cols-[minmax(0,1fr)]'
              : 'xl:grid-cols-[minmax(0,1fr)_280px]',
          )}
        >
          <div className="min-h-0 overflow-hidden rounded-[24px] border border-white/8 bg-[rgba(7,14,25,0.68)] p-4">
            <div className="h-full min-h-0 overflow-y-auto pr-1">{content}</div>
          </div>

          {currentStage === 'upload_analyze_script' || currentStage === 'generate_script_variants' || currentStage === 'generate_storyboard_grids' ? null : (
            <div className="min-h-0 overflow-hidden rounded-[24px] border border-white/8 bg-[rgba(7,14,25,0.64)] p-3.5">
              <div className="h-full min-h-0 overflow-y-auto pr-1">
                <RuntimeSidebar workspace={workspace} rows={rows} compact />
              </div>
            </div>
          )}
        </div>
      </div>

      <PreviewDialog preview={preview} onClose={() => setPreview(null)} />
      <ShotEditDialog
        open={editOpen}
        draft={editDraft}
        saving={workspace.updateShotMutation.isPending}
        onClose={() => setEditOpen(false)}
        onChange={(patch) => setEditDraft((current) => (current ? { ...current, ...patch } : current))}
        onSubmit={submitEdit}
      />
    </AppShell>
  )
}
