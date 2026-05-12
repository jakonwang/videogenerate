import type { CloneProjectSummary } from '@shared/web-api/types'
import { ArrowUpRight, Trash2 } from 'lucide-react'

import { formatDateTime, formatPercent, formatStepLabel, toFileName } from '@/lib/utils'

import { StatusBadge } from '../ui/badge'
import { Button } from '../ui/button'
import { Card } from '../ui/card'

export function CloneTaskList({
  tasks,
  onOpen,
  onRemove,
  removing,
}: {
  tasks: CloneProjectSummary[]
  onOpen: (projectId: string) => void
  onRemove: (projectId: string) => void
  removing: boolean
}) {
  if (!tasks.length) {
    return (
      <Card className="grid gap-2 border-dashed bg-transparent p-6">
        <h3 className="page-title text-[24px]">没有符合条件的任务</h3>
        <p className="body-copy text-sm">可以直接创建新任务，或调整搜索关键字继续查找。</p>
      </Card>
    )
  }

  return (
    <div className="grid gap-3">
      {tasks.map((task) => (
        <Card key={task.id} className="grid gap-4 bg-white/[0.02] p-5">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_220px] xl:items-start">
            <div className="grid gap-3">
              <div className="flex items-center gap-3">
                <StatusBadge status={task.status} />
                <span className="text-sm text-zinc-500">{formatDateTime(task.updatedAt)}</span>
              </div>

              <div className="grid gap-1">
                <h3 className="text-[16px] font-medium tracking-[-0.02em] text-white">{task.title || '未命名复刻任务'}</h3>
                <p className="body-copy max-w-2xl text-sm">
                  {task.description || toFileName(task.referenceVideoName || task.referenceVideoPath) || task.lastError || '尚未上传参考视频。'}
                </p>
              </div>

              <div className="grid gap-4 border-t border-white/[0.06] pt-4 md:grid-cols-4">
                <MetaItem label="阶段" value={formatStepLabel(task.currentStep)} />
                <MetaItem label="进度" value={formatPercent(task.progressPercent)} />
                <MetaItem label="素材" value={`商品图 ${task.productReferenceImageCount} · 分镜 ${task.shotCount}`} />
                <MetaItem label="产出" value={`图片 ${task.generatedImageCount} · 视频 ${task.generatedVideoCount}`} />
              </div>
            </div>

            <div className="grid gap-2 rounded-2xl border border-white/[0.06] bg-black/20 p-4">
              <span className="eyebrow">Actions</span>
              <Button variant="secondary" size="sm" onClick={() => onOpen(task.id)}>
                打开任务
                <ArrowUpRight className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" disabled={removing} onClick={() => onRemove(task.id)}>
                <Trash2 className="h-4 w-4" />
                删除
              </Button>
            </div>
          </div>
        </Card>
      ))}
    </div>
  )
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1">
      <span className="eyebrow">{label}</span>
      <span className="text-sm text-white">{value}</span>
    </div>
  )
}
