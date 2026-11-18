import type { App } from 'vue'

/**
 * 电脑端页面用 vue-i18n（useI18n / $t）。只有打开这些页面时才加载电脑端的文案包，网页其余部分不受影响。
 * 网页版界面只有中文，电脑端页面也固定用中文（否则会跟着浏览器语言变成英文，和网页其余部分混在一起）。
 */
let installed: Promise<void> | null = null

export function ensureDesktopI18n(app: App) {
  pinChineseSetting()
  installed ??= import('@desktop-src/i18n').then(({ i18n }) => {
    const global = (i18n as unknown as { global: { locale: string | { value: string } } }).global
    if (typeof global.locale === 'string') global.locale = 'zh-CN'
    else global.locale.value = 'zh-CN'
    document.documentElement.lang = 'zh-CN'
    app.use(i18n)
  })
  return installed
}

/** 电脑端的 appSettings store 和 i18n 启动时从这里读语言：网页上始终写成中文 */
function pinChineseSetting() {
  const key = 'videogenerate-app-settings'
  try {
    const current = JSON.parse(localStorage.getItem(key) || '{}') as Record<string, unknown>
    if (current.locale !== 'zh-CN') localStorage.setItem(key, JSON.stringify({ ...current, locale: 'zh-CN' }))
  } catch {
    // 无痕模式等拿不到 localStorage：上面直接设 i18n 仍然生效
  }
}
