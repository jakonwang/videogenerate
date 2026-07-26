import { defineStore } from 'pinia'
import type { AppLocale } from '../../../shared/locale'
import { APP_LOCALES } from '../../../shared/locale'
import { APP_SETTINGS_STORAGE_KEY, getInitialAppLocale, persistAppLocale } from '@/lib/appLocaleStorage'
import { i18n } from '@/i18n'

export type AppTheme = 'dark-teal' | 'soft-mint' | 'warm-paper' | 'clear-sky'

const THEME_STORAGE_KEY = 'videogenerate.ui.theme'
const ACCESS_KEY_STORAGE_KEY = 'videogenerate.access.key'

function getInitialTheme(): AppTheme {
  let storedTheme = ''
  try {
    const settings = JSON.parse(localStorage.getItem(APP_SETTINGS_STORAGE_KEY) || '{}') as { theme?: string }
    storedTheme = String(settings.theme || '')
  } catch {
    storedTheme = ''
  }
  const value = String(storedTheme || localStorage.getItem(THEME_STORAGE_KEY) || '').trim()
  if (value === 'soft-mint' || value === 'warm-paper' || value === 'clear-sky') return value
  return 'dark-teal'
}

function getInitialAccessKey() {
  return String(localStorage.getItem(ACCESS_KEY_STORAGE_KEY) || '')
}

export const useAppSettingsStore = defineStore('appSettings', {
  state: (): { locale: AppLocale; theme: AppTheme; accessKey: string } => ({
    locale: getInitialAppLocale(),
    theme: getInitialTheme(),
    accessKey: getInitialAccessKey(),
  }),
  getters: {
    localeOptions(): { value: AppLocale; label: string }[] {
      return [
        { value: 'zh-CN', label: '简体中文' },
        { value: 'en-US', label: 'English' },
        { value: 'vi-VN', label: 'Tiếng Việt' },
      ].filter((o): o is { value: AppLocale; label: string } => APP_LOCALES.includes(o.value as AppLocale))
    },
  },
  actions: {
    applyTheme() {
      document.documentElement.dataset.appTheme = this.theme
    },
    setTheme(theme: AppTheme) {
      this.theme = theme
      localStorage.setItem(THEME_STORAGE_KEY, theme)
      let current: Record<string, unknown> = {}
      try {
        current = JSON.parse(localStorage.getItem(APP_SETTINGS_STORAGE_KEY) || '{}') as Record<string, unknown>
      } catch {
        current = {}
      }
      localStorage.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify({ ...current, theme }))
      this.applyTheme()
    },
    saveAccessKey(value: string) {
      this.accessKey = String(value || '').trim()
      if (this.accessKey) localStorage.setItem(ACCESS_KEY_STORAGE_KEY, this.accessKey)
      else localStorage.removeItem(ACCESS_KEY_STORAGE_KEY)
    },
    async setLocale(loc: AppLocale) {
      if (this.locale === loc) {
        await this.syncLocaleToMain()
        return
      }
      this.locale = loc
      persistAppLocale(loc)
      i18n.global.locale.value = loc
      await this.syncLocaleToMain()
    },
    async syncLocaleToMain() {
      try {
        await window.api.setUiLocale(this.locale)
      } catch {
        // preload 未就绪时忽略
      }
    },
  },
})
