import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-xl border text-sm font-medium transition duration-200 ease-out disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default:
          'border-[var(--button-primary-border)] bg-[var(--button-primary-bg)] px-5 py-2.5 text-[var(--button-primary-text)] shadow-[var(--button-primary-shadow)] hover:brightness-110',
        secondary:
          'border-[var(--button-secondary-border)] bg-[var(--button-secondary-bg)] px-4 py-2.5 text-[var(--button-secondary-text)] shadow-[var(--button-secondary-shadow)] hover:border-[var(--button-secondary-hover-border)] hover:bg-[var(--button-secondary-hover-bg)] hover:text-[var(--button-secondary-hover-text)]',
        ghost:
          'border-transparent bg-transparent px-3 py-2 text-[var(--button-ghost-text)] hover:bg-[var(--button-ghost-hover-bg)] hover:text-[var(--button-ghost-hover-text)]',
        danger:
          'border-[var(--button-danger-border)] bg-[var(--button-danger-bg)] px-4 py-2.5 text-[var(--button-danger-text)] hover:bg-[var(--button-danger-hover-bg)]',
      },
      size: {
        sm: 'h-9 px-3 text-xs',
        md: 'h-10 px-4',
        lg: 'h-11 px-5 text-sm',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  },
)

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, children, ...props }, ref) => {
  return (
    <button className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props}>
      <span className="inline-flex items-center justify-center gap-2">{children}</span>
    </button>
  )
})

Button.displayName = 'Button'

export { Button, buttonVariants }
