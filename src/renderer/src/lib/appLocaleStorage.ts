import { normalizeAppLocale, type AppLocale, isAppLocale } from '../../../shared/locale'

export const APP_SETTINGS_STORAGE_KEY = 'videogenerate-app-settings'

export type StoredAppSettings = {
  locale: AppLocale
}

export function readStoredLocale(): AppLocale | null {
  try {
    const raw = localStorage.getItem(APP_SETTINGS_STORAGE_KEY)
    if (!raw) return null
    const j = JSON.parse(raw) as Partial<StoredAppSettings>
    if (j?.locale && isAppLocale(j.locale)) return j.locale
  } catch {
    // ignore
  }
  return null
}

export function getInitialAppLocale(): AppLocale {
  const stored = readStoredLocale()
  if (stored) return stored
  return normalizeAppLocale(typeof navigator !== 'undefined' ? navigator.language : 'zh-CN')
}

export function persistAppLocale(locale: AppLocale) {
  const payload: StoredAppSettings = { locale }
  localStorage.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify(payload))
}
