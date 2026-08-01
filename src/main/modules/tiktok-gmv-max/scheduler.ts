import { gmvMaxService } from './service'

const SIX_HOURS_MS = 6 * 60 * 60 * 1000
const THIRTY_MINUTES_MS = 30 * 60 * 1000
let interval: NodeJS.Timeout | null = null
let initialTimer: NodeJS.Timeout | null = null
let running = false
let lastFullSyncAt = 0

async function runCycle() {
  if (running) return
  running = true
  gmvMaxService.updateSchedulerState({ running: true, lastError: undefined })
  try {
    if (!gmvMaxService.hasConnectedConnection()) return
    const errors: string[] = []
    const runStage = async (label: string, task: () => Promise<unknown>) => {
      try {
        await task()
        return true
      } catch (error) {
        errors.push(`${label}: ${error instanceof Error ? error.message : String(error)}`)
        return false
      }
    }
    await runStage('verification', async () => await gmvMaxService.verifyPendingActions())
    await runStage('realtime sync', async () => await gmvMaxService.syncRealtime())
    if (Date.now() - lastFullSyncAt >= SIX_HOURS_MS) {
      const synchronized = await runStage('full sync', async () => await gmvMaxService.syncAll())
      if (synchronized) lastFullSyncAt = Date.now()
    }
    await runStage('SOP automation', async () => await gmvMaxService.runSopAutomation())
    await runStage('optimization', async () => await gmvMaxService.runOptimization())
    await runStage('daily summary', async () => await gmvMaxService.sendDailySummary())
    const completedAt = Date.now()
    gmvMaxService.updateSchedulerState(errors.length
      ? {
          lastRunAt: completedAt,
          lastError: errors.join(' | '),
          consecutiveFailures: gmvMaxService.schedulerState.consecutiveFailures + 1,
          recoveryTaskCount: gmvMaxService.pendingRecoveryTaskCount(),
        }
      : {
          lastRunAt: completedAt,
          lastSuccessfulRunAt: completedAt,
          lastError: undefined,
          consecutiveFailures: 0,
          recoveryTaskCount: gmvMaxService.pendingRecoveryTaskCount(),
        })
  } catch (error) {
    gmvMaxService.updateSchedulerState({
      lastRunAt: Date.now(),
      lastError: error instanceof Error ? error.message : String(error),
      consecutiveFailures: gmvMaxService.schedulerState.consecutiveFailures + 1,
      recoveryTaskCount: gmvMaxService.pendingRecoveryTaskCount(),
    })
  } finally {
    running = false
    gmvMaxService.updateSchedulerState({ running: false, nextRunAt: Date.now() + THIRTY_MINUTES_MS })
  }
}

export const gmvMaxScheduler = {
  start() {
    if (interval) return
    gmvMaxService.updateSchedulerState({ nextRunAt: Date.now() + 60_000 })
    initialTimer = setTimeout(() => void runCycle(), 60_000)
    interval = setInterval(() => void runCycle(), THIRTY_MINUTES_MS)
  },
  async runNow() { await runCycle() },
  stop() {
    if (initialTimer) clearTimeout(initialTimer)
    if (interval) clearInterval(interval)
    initialTimer = null
    interval = null
    running = false
    lastFullSyncAt = 0
    gmvMaxService.updateSchedulerState({ running: false, nextRunAt: undefined })
  },
}
