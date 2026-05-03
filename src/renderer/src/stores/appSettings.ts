import { defineStore } from 'pinia'
import type { AppLocale } from '../../../shared/locale'
import { APP_LOCALES } from '../../../shared/locale'
import { getInitialAppLocale, persistAppLocale } from '@/lib/appLocaleStorage'
import { i18n } from '@/i18n'

export const useAppSettingsStore = defineStore('appSettings', {
  state: (): { locale: AppLocale } => ({
    locale: getInitialAppLocale(),
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
