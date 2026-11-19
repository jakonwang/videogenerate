import { ipcMain } from 'electron'
import { performance } from 'node:perf_hooks'

/**
 * 记录慢的 IPC 处理：主进程一卡，整个窗口就点不动、画面不刷新。
 * syncMs = 处理函数同步执行（第一个 await 之前）占住主线程的时间；totalMs = 到返回结果的总时间。
 * 主线程卡顿诊断（main-event-loop-delay）会带上最近的记录，方便定位是哪个功能卡住了主进程。
 */
type SlowIpcRecord = { channel: string; syncMs: number; totalMs: number; at: string }

const SLOW_SYNC_MS = 50
const SLOW_TOTAL_MS = 3_000
const MAX_RECORDS = 30
const records: SlowIpcRecord[] = []
let installed = false

function record(channel: string, syncMs: number, totalMs: number) {
  if (syncMs < SLOW_SYNC_MS && totalMs < SLOW_TOTAL_MS) return
  records.push({ channel, syncMs: Math.round(syncMs), totalMs: Math.round(totalMs), at: new Date().toISOString() })
  if (records.length > MAX_RECORDS) records.splice(0, records.length - MAX_RECORDS)
  if (syncMs >= 200) console.warn('[performance] ipc handler blocked main thread', { channel, syncMs: Math.round(syncMs) })
}

export function installIpcTiming() {
  if (installed) return
  installed = true
  const originalHandle = ipcMain.handle.bind(ipcMain)
  ipcMain.handle = ((channel: string, listener: Parameters<typeof ipcMain.handle>[1]) =>
    originalHandle(channel, (event, ...args) => {
      const startedAt = performance.now()
      let result: unknown
      try {
        result = listener(event, ...args)
      } catch (error) {
        record(channel, performance.now() - startedAt, performance.now() - startedAt)
        throw error
      }
      const syncMs = performance.now() - startedAt
      if (result && typeof (result as Promise<unknown>).then === 'function') {
        const done = () => record(channel, syncMs, performance.now() - startedAt)
        ;(result as Promise<unknown>).then(done, done)
      } else {
        record(channel, syncMs, syncMs)
      }
      return result
    })) as typeof ipcMain.handle
}

/** 最近 windowMs 内的慢 IPC 记录（同步占用最多的排前面） */
export function getRecentSlowIpc(windowMs = 60_000) {
  const since = Date.now() - windowMs
  return records
    .filter((item) => Date.parse(item.at) >= since)
    .sort((a, b) => b.syncMs - a.syncMs || b.totalMs - a.totalMs)
    .slice(0, 10)
}
