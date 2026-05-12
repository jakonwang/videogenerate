import type { CloneProjectSummary } from '@shared/web-api/types'

import { formatDateTime, formatStepLabel } from '@/lib/utils'

export function CloneHistoryRail({
  tasks,
  activeTaskId,
  onOpen,
}: {
  tasks: CloneProjectSummary[]
  activeTaskId?: string | null
  onOpen: (projectId: string) => void
}) {
  return (
    <div className="grid h-full min-h-0 gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3">
      <div className="grid gap-1 px-1">
        <span className="eyebrow">Recent Tasks</span>
        <span className="text-xs text-zinc-500">最近推进的复刻任务</span>
      </div>

      <div className="rail-scroll grid min-h-0 gap-1 overflow-auto pr-1">
        {tasks.length ? (
          tasks.slice(0, 8).map((task) => {
            const active = activeTaskId === task.id
            return (
              <button
                key={task.id}
                type="button"
                onClick={() => onOpen(task.id)}
                className={`grid gap-1 rounded-xl px-3 py-2 text-left transition duration-200 ease-out ${
                  active ? 'bg-white/[0.08] text-white' : 'text-zinc-400 hover:bg-white/[0.04] hover:text-white'
                }`}
              >
                <strong className="truncate text-sm font-medium">{normalizeTaskTitle(task.title)}</strong>
                <span className="truncate text-xs text-zinc-500">{formatStepLabel(task.currentStep)}</span>
                <span className="truncate text-[11px] text-zinc-600">{formatDateTime(task.updatedAt)}</span>
              </button>
            )
          })
        ) : (
          <div className="px-3 py-4 text-xs text-zinc-500">还没有历史任务</div>
        )}
      </div>
    </div>
  )
}

function normalizeTaskTitle(title?: string) {
  const raw = String(title || '').trim()
  return raw || '未命名任务'
}
