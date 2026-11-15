'use client'

import * as React from 'react'

import { cn } from '@/lib/utils'

type ButtonVariant = 'default' | 'secondary' | 'ghost' | 'danger' | 'soft'
type ButtonSize = 'sm' | 'md' | 'lg'

/** 后台按钮：对应桌面端 .vg-btn。default = 主按钮，secondary = 普通按钮 */
export const Button = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }>(
  ({ className, variant = 'default', size = 'md', type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(
        'vg-btn',
        variant === 'default' && 'vg-btn--primary',
        variant === 'ghost' && 'vg-btn--ghost',
        variant === 'danger' && 'vg-btn--danger',
        variant === 'soft' && 'vg-btn--soft',
        size === 'sm' && 'vg-btn--sm',
        size === 'lg' && 'vg-btn--lg',
        className,
      )}
      {...props}
    />
  ),
)
Button.displayName = 'AdminButton'

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn('vg-input w-full', className)} {...props} />
))
Input.displayName = 'AdminInput'

/** 开关：对应 .vg-switch */
export function Switch({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: React.ReactNode; hint?: React.ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn('vg-switch border-0 bg-transparent p-0 text-left disabled:cursor-not-allowed disabled:opacity-50', checked && 'is-on')}
    >
      <span className="vg-switch__track" />
      {label || hint ? (
        <span className="grid gap-0.5">
          {label ? <span>{label}</span> : null}
          {hint ? <small>{hint}</small> : null}
        </span>
      ) : null}
    </button>
  )
}
