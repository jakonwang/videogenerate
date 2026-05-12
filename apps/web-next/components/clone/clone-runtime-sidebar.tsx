import type { CloneProjectSummary, CloneRuntimeResponse } from '@shared/web-api/types'
import { PauseCircle, PlayCircle, RefreshCw } from 'lucide-react'

import { formatDateTime, formatStepLabel } from '@/lib/utils'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

export function CloneRuntimeSidebar({
  summary,
  runtime,
  logs,
  polling,
  onRefresh,
  onTogglePolling,
}: {
  summary: CloneProjectSummary | null
  runtime: CloneRuntimeResponse | null
  logs: string[]
  polling: boolean
  onRefresh: () => void
  onTogglePolling: () => void
}) {
  return (
    <div className="grid gap-4">
      <Card className="grid gap-5">
        <div className="grid gap-4 border-b border-white/[0.06] pb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="grid gap-2">
              <span className="eyebrow">Runtime Console</span>
              <h3 className="section-title">运行控制台</h3>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={onTogglePolling}>
                {polling ? <PauseCircle className="mr-2 h-4 w-4" /> : <PlayCircle className="mr-2 h-4 w-4" />}
                {polling ? '暂停' : '恢复'}
              </Button>
              <Button variant="ghost" size="sm" onClick={onRefresh}>
                <RefreshCw className="mr-2 h-4 w-4" />
                刷新
              </Button>
            </div>
          </div>
          <div className="grid gap-3 rounded-2xl border border-white/[0.05] bg-black/20 p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="eyebrow">Current Stage</span>
              <span className="text-sm text-zinc-500">{formatDateTime(summary?.updatedAt)}</span>
            </div>
            <strong className="text-base font-medium text-white">{formatStepLabel(summary?.currentStep)}</strong>
            <span className="text-sm leading-6 text-zinc-500">右侧只保留真实运行状态、同步信息和日志，不与主工作区争抢视觉层级。</span>
          </div>
        </div>

        <div className="grid gap-3">
          <Metric label="分镜图片" value={String(summary?.generatedImageCount ?? 0)} />
          <Metric label="分镜视频" value={String(summary?.generatedVideoCount ?? 0)} />
          <Metric label="剩余算力" value={String(runtime?.wallet?.balanceCredits ?? 0)} />
          <Metric label="最后同步" value={formatDateTime(summary?.updatedAt)} />
        </div>
      </Card>

      <Card className="grid gap-4">
        <div className="grid gap-2">
          <span className="eyebrow">Console Log</span>
          <h3 className="section-title">运行日志</h3>
        </div>
        <div className="max-h-[420px] overflow-auto rounded-2xl border border-white/[0.04] bg-[linear-gradient(180deg,rgba(4,6,12,0.88),rgba(8,12,20,0.96))] p-4">
          <div className="grid gap-2 text-sm leading-7 text-zinc-300">
            {logs.length ? logs.map((item) => <div key={item}>{item}</div>) : <div className="text-zinc-500">暂无日志</div>}
          </div>
        </div>
      </Card>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 rounded-2xl bg-black/20 px-4 py-3">
      <span className="eyebrow">{label}</span>
      <strong className="text-sm font-medium text-white">{value}</strong>
    </div>
  )
}
