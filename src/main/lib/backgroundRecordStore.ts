import { Worker } from 'node:worker_threads'
import { join } from 'node:path'
import { getAppPaths, getMainRuntimeDir } from './paths'

type WorkerResponse = { id: number; result?: unknown; error?: string }
type Page<T> = { items: T[]; total: number; offset: number; limit: number }

let worker: Worker | null = null
let sequence = 0
const pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>()

function getWorker() {
  if (worker) return worker
  worker = new Worker(join(getMainRuntimeDir(), 'backgroundRecordStoreWorker.js'), {
    workerData: { databasePath: join(getAppPaths().dbDir, 'background-records.sqlite') },
  })
  worker.on('message', (message: WorkerResponse) => {
    const request = pending.get(message.id)
    if (!request) return
    pending.delete(message.id)
    if (message.error) request.reject(new Error(message.error))
    else request.resolve(message.result)
  })
  worker.on('error', (error: Error) => {
    for (const request of pending.values()) request.reject(error)
    pending.clear()
    worker = null
  })
  worker.on('exit', (code) => {
    if (code !== 0) {
      const error = new Error(`Background record worker exited with code ${code}.`)
      for (const request of pending.values()) request.reject(error)
      pending.clear()
    }
    worker = null
  })
  return worker
}

function call<T>(payload: Record<string, unknown>) {
  const id = ++sequence
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve, reject })
    getWorker().postMessage({ id, ...payload })
  })
}

export const backgroundRecordStore = {
  migrate(namespace: string, filePath: string, rootKey: string) {
    return call<{ migrated: number }>({ action: 'migrate', namespace, filePath, rootKey })
  },
  list<T>(namespace: string, input: { offset?: number; limit?: number } = {}) {
    return call<Page<T>>({ action: 'list', namespace, ...input })
  },
  get<T>(namespace: string, key: string) {
    return call<T | null>({ action: 'get', namespace, key })
  },
  upsert<T extends Record<string, unknown>>(namespace: string, value: T) {
    return call<T>({ action: 'upsert', namespace, value })
  },
  upsertMany<T extends Record<string, unknown>>(namespace: string, values: T[]) {
    return call<T[]>({ action: 'upsertMany', namespace, values })
  },
  async remove(namespace: string, key: string) {
    return (await call<{ removed: boolean }>({ action: 'remove', namespace, key })).removed
  },
  async close() {
    const current = worker
    worker = null
    if (current) await current.terminate()
  },
}
