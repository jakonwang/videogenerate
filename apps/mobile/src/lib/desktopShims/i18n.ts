/**
 * 网页版替身：电脑端的 vue-i18n 实例（src/renderer/src/i18n.ts），只带中文文案。
 * 网页版界面固定中文（lib/desktopI18n），电脑端原版会把中 / 英 / 越三份文案一起打包（约 1 MB），这里只留中文。
 * 文案分组和电脑端保持一致：电脑端新增分组时，这里也要加上。
 */
import { createI18n } from 'vue-i18n'
import zhCN from '../../../../../src/renderer/src/locales/zh-CN.json'
import gmvMaxHelpZhCN from '../../../../../src/renderer/src/locales/gmv-max-help/zh-CN.json'
import creatorHubZhCN from '../../../../../src/renderer/src/locales/creator-hub/zh-CN.json'
import cloudZhCN from '../../../../../src/renderer/src/locales/cloud/zh-CN.json'
import cloneUiZhCN from '../../../../../src/renderer/src/locales/clone-ui/zh-CN.json'
import { autoUiZhCN } from '../../../../../src/renderer/src/locales/auto-ui'
import aiZhCN from '../../../../../src/renderer/src/locales/ai/zh-CN.json'
import gmvV2ZhCN from '../../../../../src/renderer/src/locales/gmv-v2/zh-CN.json'
import bsxZhCN from '../../../../../src/renderer/src/locales/batch-subtitle/zh-CN.json'
import sellerInvZhCN from '../../../../../src/renderer/src/locales/seller-inventory/zh-CN.json'
import shopsZhCN from '../../../../../src/renderer/src/locales/shops/zh-CN.json'
import lpTaskZhCN from '../../../../../src/renderer/src/locales/live-photo-task/zh-CN.json'

export const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  fallbackLocale: 'zh-CN',
  messages: {
    'zh-CN': { ...zhCN, gmvMaxHelp: gmvMaxHelpZhCN, creatorHub: creatorHubZhCN, cloud: cloudZhCN, cloneUi: cloneUiZhCN, autoUi: autoUiZhCN, ai: aiZhCN, gmvV2: gmvV2ZhCN, bsx: bsxZhCN, sellerInv: sellerInvZhCN, shops: shopsZhCN, lpTask: lpTaskZhCN },
  },
})
