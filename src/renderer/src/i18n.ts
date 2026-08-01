import { createI18n } from 'vue-i18n'
import { getInitialAppLocale } from './lib/appLocaleStorage'
import zhCN from './locales/zh-CN.json'
import enUS from './locales/en-US.json'
import viVN from './locales/vi-VN.json'
import gmvMaxHelpZhCN from './locales/gmv-max-help/zh-CN.json'
import gmvMaxHelpEnUS from './locales/gmv-max-help/en-US.json'
import gmvMaxHelpViVN from './locales/gmv-max-help/vi-VN.json'
import { autoUiEnUS, autoUiViVN, autoUiZhCN } from './locales/auto-ui'

export const i18n = createI18n({
  legacy: false,
  locale: getInitialAppLocale(),
  fallbackLocale: 'zh-CN',
  messages: {
    'zh-CN': { ...zhCN, gmvMaxHelp: gmvMaxHelpZhCN, autoUi: autoUiZhCN },
    'en-US': { ...enUS, gmvMaxHelp: gmvMaxHelpEnUS, autoUi: autoUiEnUS },
    'vi-VN': { ...viVN, gmvMaxHelp: gmvMaxHelpViVN, autoUi: autoUiViVN },
  },
})
