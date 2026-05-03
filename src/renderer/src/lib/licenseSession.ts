import { LICENSE_STORAGE_KEY } from '../../../shared/licenseApi'

let sessionOk: boolean | null = null
let inflight: Promise<boolean> | null = null

export function resetLicenseSession() {
  sessionOk = null
  inflight = null
}

export function markLicensedAfterActivate() {
  sessionOk = true
}

/**
 * 启动/路由进入业务页前静默校验：本地卡密 + 主进程请求发卡平台。
 * 同一会话内成功一次则缓存，避免每次路由跳转都打接口。
 */
export async function ensureLicensed(): Promise<boolean> {
  if (sessionOk === true) return true
  if (inflight) return inflight

  inflight = (async () => {
    const key = localStorage.getItem(LICENSE_STORAGE_KEY)?.trim()
    if (!key) {
      sessionOk = false
      return false
    }
    try {
      const res = await window.api.license.verify(key)
      if (res && res.code === 0 && res.data?.valid === true) {
        sessionOk = true
        return true
      }
      localStorage.removeItem(LICENSE_STORAGE_KEY)
      sessionOk = false
      return false
    } catch {
      sessionOk = false
      return false
    }
  })()

  const out = await inflight
  inflight = null
  return out
}
