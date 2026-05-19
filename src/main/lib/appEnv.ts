export type VideoGenerateAppEnv = 'development' | 'staging' | 'production'

export function getAppEnv(): VideoGenerateAppEnv {
  const raw = String(process.env.VG_APP_ENV || process.env.NODE_ENV || 'development')
    .trim()
    .toLowerCase()
  if (raw === 'production') return 'production'
  if (raw === 'staging') return 'staging'
  return 'development'
}

export function isProductionEnv() {
  return getAppEnv() === 'production'
}

export function isStagingEnv() {
  return getAppEnv() === 'staging'
}

export function isDevelopmentEnv() {
  return getAppEnv() === 'development'
}

export function isNonProductionEnv() {
  return !isProductionEnv()
}
