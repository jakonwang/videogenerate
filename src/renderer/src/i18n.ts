import { createI18n } from 'vue-i18n'
import { getInitialAppLocale } from './lib/appLocaleStorage'
import zhCN from './locales/zh-CN.json'
import enUS from './locales/en-US.json'
import viVN from './locales/vi-VN.json'
import gmvMaxHelpZhCN from './locales/gmv-max-help/zh-CN.json'
import gmvMaxHelpEnUS from './locales/gmv-max-help/en-US.json'
import gmvMaxHelpViVN from './locales/gmv-max-help/vi-VN.json'
import creatorHubZhCN from './locales/creator-hub/zh-CN.json'
import creatorHubEnUS from './locales/creator-hub/en-US.json'
import creatorHubViVN from './locales/creator-hub/vi-VN.json'
import { autoUiEnUS, autoUiViVN, autoUiZhCN } from './locales/auto-ui'

export const i18n = createI18n({
  legacy: false,
  locale: getInitialAppLocale(),
  fallbackLocale: 'zh-CN',
  messages: {
    'zh-CN': { ...zhCN, gmvMaxHelp: gmvMaxHelpZhCN, creatorHub: creatorHubZhCN, autoUi: autoUiZhCN },
    'en-US': { ...enUS, gmvMaxHelp: gmvMaxHelpEnUS, creatorHub: creatorHubEnUS, autoUi: autoUiEnUS },
    'vi-VN': { ...viVN, gmvMaxHelp: gmvMaxHelpViVN, creatorHub: creatorHubViVN, autoUi: autoUiViVN },
  },
})
