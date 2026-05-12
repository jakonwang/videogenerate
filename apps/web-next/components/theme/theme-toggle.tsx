'use client'

import { MoonStar, SunMedium } from 'lucide-react'

import { useThemeMode } from '@/components/theme/theme-provider'

export function ThemeToggle() {
  const { theme, setTheme } = useThemeMode()

  return (
    <div className="inline-flex items-center rounded-full border border-[var(--border-base)] bg-[var(--theme-toggle-bg)] p-1 shadow-[0_8px_24px_rgba(15,23,42,0.12)]">
      <button
        type="button"
        onClick={() => setTheme('light')}
        className={`inline-flex h-9 items-center gap-2 rounded-full px-3.5 text-sm font-medium transition ${
          theme === 'light' ? 'bg-[var(--theme-toggle-active)] text-[var(--text-main)] shadow-[0_6px_16px_rgba(109,93,255,0.12)]' : 'text-[var(--text-muted)]'
        }`}
      >
        <SunMedium className="h-4 w-4" />
        浅色
      </button>
      <button
        type="button"
        onClick={() => setTheme('dark')}
        className={`inline-flex h-9 items-center gap-2 rounded-full px-3.5 text-sm font-medium transition ${
          theme === 'dark' ? 'bg-[var(--theme-toggle-active)] text-[var(--text-main)] shadow-[0_6px_16px_rgba(109,93,255,0.12)]' : 'text-[var(--text-muted)]'
        }`}
      >
        <MoonStar className="h-4 w-4" />
        深色
      </button>
    </div>
  )
}
