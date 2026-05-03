/**
 * 与 docs/client-desktop-api.md 一致；可通过环境变量 VG_LICENSE_API_BASE 覆盖（无尾斜杠）。
 * 生产默认：https://videotool.banono-us.com
 */
export const LICENSE_API_BASE_DEFAULT = 'https://videotool.banono-us.com'

export function getLicenseApiBase(): string {
  const raw = (typeof process !== 'undefined' && process.env?.VG_LICENSE_API_BASE?.trim()) || LICENSE_API_BASE_DEFAULT
  return raw.replace(/\/+$/, '')
}

export function getLicenseVerifyUrl(): string {
  return `${getLicenseApiBase()}/index.php/api/client/verifyLicense`
}

/** 渲染进程 localStorage 键，须与路由守卫一致 */
export const LICENSE_STORAGE_KEY = 'videogenerate-license-key'
