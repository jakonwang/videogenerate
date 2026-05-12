import { cn } from '@/lib/utils'

export function PageHero({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: string
  title: string
  description: string
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <section className={cn('grid gap-5', className)}>
      <div className="flex items-start justify-between gap-10 max-[900px]:grid max-[900px]:gap-4">
        <div className="grid max-w-[640px] gap-3">
          {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
          <div className="grid gap-3">
            <h1 className="max-w-3xl text-[clamp(1.9rem,3vw,3rem)] font-semibold leading-[1.02] tracking-[-0.05em] text-white">
              {title}
            </h1>
            <p className="body-copy max-w-lg text-[14px]">{description}</p>
          </div>
        </div>
        {actions ? <div className="flex items-start gap-3 pt-2 max-[900px]:justify-start max-[900px]:pt-0">{actions}</div> : null}
      </div>
    </section>
  )
}
