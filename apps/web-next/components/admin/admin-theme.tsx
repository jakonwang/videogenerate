'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'

type AdminTheme = 'dark' | 'light'
const STORAGE_KEY = 'tiktokcut.admin.theme'

const ThemeContext = createContext<{ theme: AdminTheme; toggle: () => void }>({ theme: 'dark', toggle: () => {} })

/** 后台主题根节点：深色（dark-teal）/ 浅色（light-teal），与桌面客户端一致 */
export function AdminThemeRoot({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<AdminTheme>('dark')

  useEffect(() => {
    try {
      if (window.localStorage.getItem(STORAGE_KEY) === 'light') setTheme('light')
    } catch {
      // 读取失败时保持默认深色
    }
  }, [])

  const toggle = () =>
    setTheme((current) => {
      const next = current === 'dark' ? 'light' : 'dark'
      try {
        window.localStorage.setItem(STORAGE_KEY, next)
      } catch {
        // 只影响记住选择
      }
      return next
    })

  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      <div className="admin-app vg-scope" data-theme={theme}>
        {children}
      </div>
    </ThemeContext.Provider>
  )
}

export function AdminThemeToggle() {
  const { theme, toggle } = useContext(ThemeContext)
  return (
    <button type="button" className="vg-icon-btn" onClick={toggle} title={theme === 'dark' ? '切换到浅色' : '切换到深色'} aria-label="切换主题">
      {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  )
}
