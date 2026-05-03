export type AppLocale = 'zh-CN' | 'en-US' | 'vi-VN'

export const APP_LOCALES: AppLocale[] = ['zh-CN', 'en-US', 'vi-VN']

export function isAppLocale(s: string): s is AppLocale {
  return (APP_LOCALES as string[]).includes(s)
}

/** 将系统或存储的语言标记规范为应用支持的 BCP-47 标签 */
export function normalizeAppLocale(raw: string | undefined | null): AppLocale {
  const s = (raw ?? '').trim().replace(/_/g, '-').toLowerCase()
  if (s.startsWith('vi')) return 'vi-VN'
  if (s.startsWith('en')) return 'en-US'
  if (s === 'zh-cn' || s.startsWith('zh')) return 'zh-CN'
  return 'zh-CN'
}
