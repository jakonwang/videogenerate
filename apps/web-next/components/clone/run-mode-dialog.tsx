'use client'

import type { CloneRunMode } from '@shared/web-api/types'

import { Button } from '@/components/ui/button'

type RunModeDialogProps = {
  open: boolean
  creating?: boolean
  selectedMode: CloneRunMode | null
  title?: string
  description?: string
  onSelect: (mode: CloneRunMode) => void
  onCancel: () => void
  onConfirm: () => void
}

export function RunModeDialog({
  open,
  creating,
  selectedMode,
  title = '选择运行模式',
  description = '创建任务时必须选择自动运行或手动运行。自动运行会自动推进并在最终成片前执行硬门禁；手动运行按阶段推进，但最终合成同样不能绕过门禁。',
  onSelect,
  onCancel,
  onConfirm,
}: RunModeDialogProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-[rgba(8,11,18,0.72)] px-4">
      <div className="w-full max-w-xl rounded-[28px] border border-white/10 bg-[#0e1628] p-6 text-white shadow-[0_30px_120px_rgba(0,0,0,0.45)]">
        <div className="grid gap-2">
          <h3 className="text-xl font-semibold">{title}</h3>
          <p className="text-sm leading-6 text-slate-300">{description}</p>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <button
            type="button"
            onClick={() => onSelect('auto')}
            className={`rounded-3xl border p-4 text-left transition ${
              selectedMode === 'auto'
                ? 'border-cyan-400 bg-cyan-400/10 shadow-[0_0_0_1px_rgba(34,211,238,0.35)]'
                : 'border-white/10 bg-white/[0.03] hover:border-cyan-300/60 hover:bg-white/[0.05]'
            }`}
          >
            <strong className="block text-base">自动运行</strong>
            <span className="mt-2 block text-sm leading-6 text-slate-300">系统自动推进并自动尝试出成片，未达标会自动停下，不会带瑕疵出片。</span>
          </button>

          <button
            type="button"
            onClick={() => onSelect('manual')}
            className={`rounded-3xl border p-4 text-left transition ${
              selectedMode === 'manual'
                ? 'border-slate-200 bg-slate-200/10 shadow-[0_0_0_1px_rgba(226,232,240,0.28)]'
                : 'border-white/10 bg-white/[0.03] hover:border-slate-300/60 hover:bg-white/[0.05]'
            }`}
          >
            <strong className="block text-base">手动运行</strong>
            <span className="mt-2 block text-sm leading-6 text-slate-300">创建后由用户逐阶段控制，但最终合成仍受硬门禁约束，不能绕过质检。</span>
          </button>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" onClick={onCancel} disabled={creating}>
            取消
          </Button>
          <Button onClick={onConfirm} disabled={!selectedMode || creating}>
            {creating ? '创建中...' : '确认创建'}
          </Button>
        </div>
      </div>
    </div>
  )
}
