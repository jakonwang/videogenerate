import { cn, formatStatusLabel, formatStatusTone } from '@/lib/utils'

export function StatusBadge({ status }: { status?: string }) {
  const tone = formatStatusTone(status)
  return (
    <span
      className={cn(
        'inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-medium tracking-[0.12em]',
        tone === 'success' && 'border-emerald-400/18 bg-emerald-400/10 text-emerald-100',
        tone === 'danger' && 'border-rose-400/18 bg-rose-400/10 text-rose-100',
        tone === 'running' && 'border-cyan-400/18 bg-cyan-400/10 text-cyan-100',
        tone === 'idle' && 'border-white/[0.08] bg-white/[0.03] text-slate-300',
      )}
    >
      <span className="status-dot" data-tone={tone} />
      <span>{formatStatusLabel(status)}</span>
    </span>
  )
}
