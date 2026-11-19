import type { App } from 'vue'
import type { Router } from 'vue-router'

/**
 * 发版后，还开着的旧页面去加载「还没打开过的页面」时，旧文件名在服务器上已经没有了（404），
 * 点菜单就没反应、页面停在原地。遇到这种加载失败时，直接刷新到要去的页面，拿到新版本。
 * 用 sessionStorage 记一下，短时间内只自动刷新一次，避免网络真坏了时反复刷新。
 */
const RELOAD_KEY = 'vg:chunk-reload-at'
const RELOAD_COOLDOWN_MS = 30_000

export function isChunkLoadError(error: unknown): boolean {
  const message = String((error as { message?: unknown })?.message ?? error ?? '')
  return /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS|Loading (CSS )?chunk .* failed/i.test(message)
}

export function reloadForNewVersion(targetHash?: string): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0)
    if (Date.now() - last < RELOAD_COOLDOWN_MS) return false
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()))
  } catch {
    // sessionStorage 不可用时照样刷新一次
  }
  if (targetHash && targetHash !== location.hash) location.hash = targetHash
  location.reload()
  return true
}

export function installChunkReload(app: App, router: Router) {
  router.onError((error, to) => {
    if (isChunkLoadError(error)) reloadForNewVersion(`#${to.fullPath}`)
  })
  // 页面内部按需加载的部分（如网页上复用的电脑端页面）加载失败
  window.addEventListener('vite:preloadError', (event) => {
    if (reloadForNewVersion()) event.preventDefault()
  })
  const previous = app.config.errorHandler
  app.config.errorHandler = (error, instance, info) => {
    if (isChunkLoadError(error) && reloadForNewVersion()) return
    if (previous) previous(error, instance, info)
    else console.error(error)
  }
}
