import { cn } from '@/lib/utils'

import { Card } from '@/components/ui/card'

export function CloneStageCard({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string
  description: string
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <Card className={cn('grid gap-6 p-6', className)}>
      <div className="flex items-start justify-between gap-5 border-b border-white/[0.06] pb-5 max-[900px]:grid">
        <div className="grid gap-2">
          <span className="eyebrow">Current Step</span>
          <div className="grid gap-2">
            <h2 className="text-[20px] font-semibold tracking-[-0.03em] text-white">{title}</h2>
            <p className="max-w-3xl text-[14px] leading-7 text-[#97a5c4]">{description}</p>
          </div>
        </div>
        {action ? <div className="flex items-center gap-3 max-[900px]:justify-start">{action}</div> : null}
      </div>
      {children}
    </Card>
  )
}
