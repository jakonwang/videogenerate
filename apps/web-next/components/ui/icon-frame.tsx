import { cn } from '@/lib/utils'

export function IconFrame({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        'flex h-10 w-10 items-center justify-center rounded-2xl border border-white/[0.08] bg-[rgba(109,93,255,0.08)] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]',
        className,
      )}
    >
      {children}
    </div>
  )
}
