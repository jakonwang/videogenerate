'use client'

import Link from 'next/link'
import { AlertCircle, FileSearch, LoaderCircle, RefreshCcw } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

type PageStateProps = {
  icon?: React.ReactNode
  title: string
  description: string
  actionLabel?: string
  onAction?: () => void
  href?: string
  secondaryAction?: React.ReactNode
  compact?: boolean
}

export function PageState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  href,
  secondaryAction,
  compact = false,
}: PageStateProps) {
  const action =
    actionLabel && href ? (
      <Link
        href={href}
        className="inline-flex min-h-[40px] items-center justify-center rounded-xl border border-[var(--button-secondary-border)] bg-[var(--button-secondary-bg)] px-4 text-sm font-medium text-[var(--button-secondary-text)] shadow-[var(--button-secondary-shadow)] transition hover:border-[var(--button-secondary-hover-border)] hover:bg-[var(--button-secondary-hover-bg)] hover:text-[var(--button-secondary-hover-text)]"
      >
        {actionLabel}
      </Link>
    ) : actionLabel && onAction ? (
      <Button variant="secondary" onClick={onAction}>
        {actionLabel}
      </Button>
    ) : null

  return (
    <Card className={`grid place-items-center border-dashed px-6 text-center ${compact ? 'min-h-[220px] py-10' : 'min-h-[320px] py-16'}`}>
      <div className="grid max-w-[520px] justify-items-center gap-4">
        <div className="grid h-14 w-14 place-items-center rounded-[18px] bg-white/[0.05] text-slate-300">
          {icon}
        </div>
        <div className="grid gap-2">
          <strong className="text-[18px] text-white">{title}</strong>
          <p className="text-sm leading-7 text-slate-400">{description}</p>
        </div>
        {action || secondaryAction ? (
          <div className="flex flex-wrap items-center justify-center gap-3">
            {action}
            {secondaryAction}
          </div>
        ) : null}
      </div>
    </Card>
  )
}

export function LoadingState({
  title = '正在加载内容',
  description = '请稍候，系统正在读取当前页面所需的数据。',
  compact,
}: {
  title?: string
  description?: string
  compact?: boolean
}) {
  return <PageState icon={<LoaderCircle className="h-6 w-6 animate-spin" />} title={title} description={description} compact={compact} />
}

export function ErrorState({
  title = '页面加载失败',
  description = '当前数据暂时无法读取，你可以稍后重试。',
  onRetry,
  compact,
}: {
  title?: string
  description?: string
  onRetry?: () => void
  compact?: boolean
}) {
  return (
    <PageState
      icon={<AlertCircle className="h-6 w-6 text-rose-300" />}
      title={title}
      description={description}
      actionLabel={onRetry ? '重新加载' : undefined}
      onAction={onRetry}
      compact={compact}
      secondaryAction={
        onRetry ? (
          <Button variant="ghost" onClick={() => window.location.reload()}>
            <RefreshCcw className="h-4 w-4" />
            刷新页面
          </Button>
        ) : null
      }
    />
  )
}

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
  href,
  compact,
}: {
  title: string
  description: string
  actionLabel?: string
  onAction?: () => void
  href?: string
  compact?: boolean
}) {
  return <PageState icon={<FileSearch className="h-6 w-6 text-slate-300" />} title={title} description={description} actionLabel={actionLabel} onAction={onAction} href={href} compact={compact} />
}
