import { cn } from '@/lib/utils'

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'card-surface rounded-[14px] p-4 shadow-[0_24px_60px_rgba(0,0,0,0.26),inset_0_1px_0_rgba(255,255,255,0.04)]',
        className,
      )}
      {...props}
    />
  )
}
