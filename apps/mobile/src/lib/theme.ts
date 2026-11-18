/** App themes shared with the desktop (themes.css: html[data-app-theme=…]). Stored per browser. */
export type AppTheme = 'dark-teal' | 'light-teal' | 'mono'
export const APP_THEMES: Array<{ key: AppTheme; label: string }> = [
  { key: 'dark-teal', label: '暗色青绿' },
  { key: 'light-teal', label: '绿白工作台' },
  { key: 'mono', label: '黑白简洁' },
]
const KEY = 'tiktokcut:app-theme'

export function currentTheme(): AppTheme {
  try {
    const value = localStorage.getItem(KEY)
    if (value === 'light-teal' || value === 'mono' || value === 'dark-teal') return value
  } catch {
    // storage unavailable
  }
  return 'dark-teal'
}

export function applyTheme(theme: AppTheme = currentTheme()) {
  document.documentElement.dataset.appTheme = theme
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    // ignore
  }
}
