import { createI18n } from 'vue-i18n'
import { getInitialAppLocale } from './lib/appLocaleStorage'
import zhCN from './locales/zh-CN.json'
import enUS from './locales/en-US.json'
import viVN from './locales/vi-VN.json'

export const i18n = createI18n({
  legacy: false,
  locale: getInitialAppLocale(),
  fallbackLocale: 'zh-CN',
  messages: {
    'zh-CN': zhCN,
    'en-US': enUS,
    'vi-VN': viVN,
  },
})
