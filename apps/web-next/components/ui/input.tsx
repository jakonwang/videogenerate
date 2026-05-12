import { cn } from '@/lib/utils'

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'h-[42px] w-full rounded-xl border border-[rgba(148,163,184,0.16)] bg-[var(--bg-input)] px-4 text-sm text-white outline-none transition duration-200 ease-out placeholder:text-slate-500 focus:border-[rgba(34,211,238,0.5)] focus:shadow-[0_0_0_1px_rgba(34,211,238,0.15),inset_0_0_16px_rgba(34,211,238,0.06)] focus:ring-0',
        className,
      )}
      {...props}
    />
  )
}
