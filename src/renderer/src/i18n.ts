import { createI18n } from 'vue-i18n'
import { getInitialAppLocale } from './lib/appLocaleStorage'
import zhCN from './locales/zh-CN.json'
import enUS from './locales/en-US.json'
import viVN from './locales/vi-VN.json'
import { autoUiEnUS, autoUiViVN, autoUiZhCN } from './locales/auto-ui'

export const i18n = createI18n({
  legacy: false,
  locale: getInitialAppLocale(),
  fallbackLocale: 'zh-CN',
  messages: {
    'zh-CN': { ...zhCN, autoUi: autoUiZhCN },
    'en-US': { ...enUS, autoUi: autoUiEnUS },
    'vi-VN': { ...viVN, autoUi: autoUiViVN },
  },
})
