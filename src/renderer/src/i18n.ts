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
import cloudZhCN from './locales/cloud/zh-CN.json'
import cloudEnUS from './locales/cloud/en-US.json'
import cloudViVN from './locales/cloud/vi-VN.json'
import cloneUiZhCN from './locales/clone-ui/zh-CN.json'
import cloneUiEnUS from './locales/clone-ui/en-US.json'
import cloneUiViVN from './locales/clone-ui/vi-VN.json'
import { autoUiEnUS, autoUiViVN, autoUiZhCN } from './locales/auto-ui'
import aiZhCN from './locales/ai/zh-CN.json'
import aiEnUS from './locales/ai/en-US.json'
import aiViVN from './locales/ai/vi-VN.json'
import gmvV2ZhCN from './locales/gmv-v2/zh-CN.json'
import gmvV2EnUS from './locales/gmv-v2/en-US.json'
import gmvV2ViVN from './locales/gmv-v2/vi-VN.json'
import bsxZhCN from './locales/batch-subtitle/zh-CN.json'
import bsxEnUS from './locales/batch-subtitle/en-US.json'
import bsxViVN from './locales/batch-subtitle/vi-VN.json'
import sellerInvZhCN from './locales/seller-inventory/zh-CN.json'
import sellerInvEnUS from './locales/seller-inventory/en-US.json'
import sellerInvViVN from './locales/seller-inventory/vi-VN.json'
import shopsZhCN from './locales/shops/zh-CN.json'
import shopsEnUS from './locales/shops/en-US.json'
import shopsViVN from './locales/shops/vi-VN.json'

export const i18n = createI18n({
  legacy: false,
  locale: getInitialAppLocale(),
  fallbackLocale: 'zh-CN',
  messages: {
    'zh-CN': { ...zhCN, gmvMaxHelp: gmvMaxHelpZhCN, creatorHub: creatorHubZhCN, cloud: cloudZhCN, cloneUi: cloneUiZhCN, autoUi: autoUiZhCN, ai: aiZhCN, gmvV2: gmvV2ZhCN, bsx: bsxZhCN, sellerInv: sellerInvZhCN, shops: shopsZhCN },
    'en-US': { ...enUS, gmvMaxHelp: gmvMaxHelpEnUS, creatorHub: creatorHubEnUS, cloud: cloudEnUS, cloneUi: cloneUiEnUS, autoUi: autoUiEnUS, ai: aiEnUS, gmvV2: gmvV2EnUS, bsx: bsxEnUS, sellerInv: sellerInvEnUS, shops: shopsEnUS },
    'vi-VN': { ...viVN, gmvMaxHelp: gmvMaxHelpViVN, creatorHub: creatorHubViVN, cloud: cloudViVN, cloneUi: cloneUiViVN, autoUi: autoUiViVN, ai: aiViVN, gmvV2: gmvV2ViVN, bsx: bsxViVN, sellerInv: sellerInvViVN, shops: shopsViVN },
  },
})
