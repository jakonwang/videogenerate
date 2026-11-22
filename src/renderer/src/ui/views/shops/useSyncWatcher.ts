import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { SiSyncProgress } from '../../../../../shared/sellerInventory'

/**
 * Follows shop syncs for a page: polls quickly while a sync runs (slowly otherwise, so the hourly
 * background update also shows up), refreshes the page only when the data actually changed and
 * at most every few seconds, and reports how a sync the user started ended.
 */
export function useSyncWatcher(options: { refresh: () => Promise<void> | void; onFinished?: (jobs: SiSyncProgress[]) => void }) {
  const api = window.api.sellerInventory
  const progress = ref<SiSyncProgress[]>([])
  const syncing = computed(() => progress.value.some((item) => item.status === 'running'))
  const running = computed(() => progress.value.filter((item) => item.status === 'running'))
  let lastVersion = -1
  let lastRefreshAt = 0
  let timer: ReturnType<typeof setTimeout> | null = null
  let stopped = false
  let wasRunning = new Set<string>()

  async function refreshIfChanged(force = false) {
    const version = await api.dataVersion().catch(() => lastVersion)
    const due = Date.now() - lastRefreshAt >= 8_000
    if (version !== lastVersion && (force || due || !syncing.value)) {
      lastVersion = version
      lastRefreshAt = Date.now()
      await options.refresh()
    }
  }

  async function tick() {
    if (stopped) return
    try {
      progress.value = await api.getProgress()
      const nowRunning = new Set(running.value.map((item) => item.shopKey))
      const finished = progress.value.filter((item) => wasRunning.has(item.shopKey) && !nowRunning.has(item.shopKey))
      wasRunning = nowRunning
      await refreshIfChanged(finished.length > 0)
      if (finished.length && !syncing.value) options.onFinished?.(finished)
    } catch {
      // The next tick tries again.
    } finally {
      if (!stopped) timer = setTimeout(() => { void tick() }, syncing.value ? 3_000 : 15_000)
    }
  }

  /** Call after starting a sync so the page switches to fast polling at once. */
  async function started() {
    if (timer) clearTimeout(timer)
    progress.value = await api.getProgress().catch(() => progress.value)
    wasRunning = new Set(running.value.map((item) => item.shopKey))
    timer = setTimeout(() => { void tick() }, 1_500)
  }

  /** The page loaded fresh data itself: remember its version so it is not loaded twice. */
  async function markLoaded() {
    lastVersion = await api.dataVersion().catch(() => lastVersion)
    lastRefreshAt = Date.now()
  }

  onMounted(() => { void tick() })
  onBeforeUnmount(() => {
    stopped = true
    if (timer) clearTimeout(timer)
  })

  return { progress, syncing, running, started, markLoaded }
}
