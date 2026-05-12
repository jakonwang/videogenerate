import type { CloneProjectSummary } from '@shared/web-api/types'
import { ArrowUpRight, FolderPlus, ImageIcon, PlayCircle, Sparkles, Video } from 'lucide-react'

import { formatDateTime, formatPercent, formatStepLabel, toFileName } from '@/lib/utils'

import { Card } from '../ui/card'
import { StatusBadge } from '../ui/badge'
import { Button } from '../ui/button'
import { IconFrame } from '../ui/icon-frame'

const quickActions = [
  {
    key: 'analyze',
    title: '上传参考视频',
    description: '从参考视频开始建立整条复刻生产线。',
    icon: Sparkles,
  },
  {
    key: 'variant',
    title: '继续脚本变体',
    description: '查看并选择当前最优脚本候选。',
    icon: ArrowUpRight,
  },
  {
    key: 'image',
    title: '生成分镜图片',
    description: '按当前脚本与素材生成分镜图。',
    icon: ImageIcon,
  },
  {
    key: 'video',
    title: '进入分镜视频',
    description: '继续生成或检查镜头视频结果。',
    icon: Video,
  },
  {
    key: 'final',
    title: '查看最终成片',
    description: '检查输出结果并继续最终合成。',
    icon: PlayCircle,
  },
]

export function CloneTaskHero({
  task,
  onOpenTask,
  onCreateTask,
}: {
  task: CloneProjectSummary | null
  onOpenTask?: (projectId: string) => void
  onCreateTask?: () => void
}) {
  if (!task) {
    return (
      <Card className="grid gap-6 bg-white/[0.035] p-5">
        <div className="grid gap-2">
          <span className="eyebrow">Current Focus</span>
          <h2 className="text-[24px] font-semibold tracking-[-0.05em] text-white">从第一条复刻任务开始。</h2>
          <p className="body-copy max-w-xl text-sm">
            创建任务后，整个工作台会围绕参考分析、脚本、分镜图、分镜视频和最终成片展开。
          </p>
        </div>
        {onCreateTask ? (
          <div>
            <Button onClick={onCreateTask}>
              <FolderPlus className="h-4 w-4" />
              新建复刻任务
            </Button>
          </div>
        ) : null}
      </Card>
    )
  }

  return (
    <div className="grid gap-6">
      <Card className="grid gap-8 bg-white/[0.035] p-5">
        <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_250px] xl:items-start">
          <div className="grid gap-6">
            <div className="flex items-center gap-3">
              <StatusBadge status={task.status} />
              <span className="text-sm text-zinc-500">最近更新 {formatDateTime(task.updatedAt)}</span>
            </div>

            <div className="grid gap-4">
              <div className="grid gap-2">
                <span className="eyebrow">Current Focus</span>
                <h2 className="max-w-2xl text-[24px] font-semibold leading-[1.08] tracking-[-0.05em] text-white">
                  {normalizeTaskTitle(task.title)}
                </h2>
                <span className="text-sm text-zinc-500">{formatStepLabel(task.currentStep)}</span>
              </div>

              <p className="body-copy max-w-xl text-[14px]">
                {task.description || toFileName(task.referenceVideoName || task.referenceVideoPath) || '任务已创建，等待继续推进当前阶段。'}
              </p>
            </div>

            <div className="grid gap-5 border-t border-white/[0.06] pt-5 md:grid-cols-4">
              <Metric label="当前阶段" value={formatStepLabel(task.currentStep)} />
              <Metric label="任务进度" value={formatPercent(task.progressPercent)} />
              <Metric label="图片 / 视频" value={`${task.generatedImageCount} / ${task.generatedVideoCount}`} />
              <Metric label="商品图 / 分镜" value={`${task.productReferenceImageCount} / ${task.shotCount}`} />
            </div>
          </div>

          <div className="grid gap-2 rounded-2xl border border-white/[0.06] bg-black/20 p-4">
            <span className="eyebrow">Actions</span>
            {task.id && onOpenTask ? (
              <Button onClick={() => onOpenTask(task.id)}>
                继续任务
                <ArrowUpRight className="h-4 w-4" />
              </Button>
            ) : null}
            {onCreateTask ? (
              <Button variant="secondary" onClick={onCreateTask}>
                <FolderPlus className="h-4 w-4" />
                新建任务
              </Button>
            ) : null}
          </div>
        </div>
      </Card>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {quickActions.map((item) => {
          const Icon = item.icon
          return (
            <button
              key={item.key}
              type="button"
              className="grid gap-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 text-left transition duration-200 ease-out hover:border-white/[0.12] hover:bg-white/[0.035]"
            >
              <IconFrame>
                <Icon className="h-4 w-4" />
              </IconFrame>
              <div className="grid gap-1">
                <strong className="text-sm font-medium text-white">{item.title}</strong>
                <p className="text-sm leading-6 text-zinc-500">{item.description}</p>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1">
      <span className="eyebrow">{label}</span>
      <strong className="text-sm font-medium text-white">{value}</strong>
    </div>
  )
}

function normalizeTaskTitle(title?: string) {
  const raw = String(title || '').trim()
  return raw || '未命名复刻任务'
}
