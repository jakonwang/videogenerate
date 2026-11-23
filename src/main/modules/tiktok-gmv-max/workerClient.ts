import { Worker } from 'node:worker_threads'
import { join } from 'node:path'
import { getAppPaths, getMainRuntimeDir } from '../../lib/paths'
import { gmvMaxAuthStore } from './authStore'
import type { GmvMaxOAuthSecrets, GmvMaxSyncProgress } from './types'

type WorkerResponse = { id?: number; result?: unknown; error?: string; type?: string; progress?: GmvMaxSyncProgress; authRequestId?: number; action?: string; payload?: Record<string, unknown> }

let worker: Worker | null = null
let sequence = 0
let progressListener: ((progress: GmvMaxSyncProgress) => void) | null = null
const pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>()

async function handleAuthRequest(current: Worker, message: WorkerResponse) {
  const authRequestId = Number(message.authRequestId)
  try {
    const connectionId = String(message.payload?.connectionId || '')
    let result: unknown
    if (message.action === 'read') result = await gmvMaxAuthStore.read(connectionId)
    else if (message.action === 'write') result = await gmvMaxAuthStore.write(connectionId, message.payload?.secrets as GmvMaxOAuthSecrets)
    else if (message.action === 'remove') result = await gmvMaxAuthStore.remove(connectionId)
    else throw new Error(`Unsupported GMV MAX auth action: ${message.action}`)
    current.postMessage({ authRequestId, result })
  } catch (error) {
    current.postMessage({ authRequestId, error: error instanceof Error ? error.message : String(error) })
  }
}

function getWorker() {
  if (worker) return worker
  const paths = getAppPaths()
  const current = new Worker(join(getMainRuntimeDir(), 'gmvMaxWorker.js'), {
    workerData: {
      userDataDir: paths.userData,
      dataDir: paths.dataDir,
      encryptionAvailable: gmvMaxAuthStore.encryptionAvailable(),
    },
  })
  worker = current
  current.on('message', (message: WorkerResponse) => {
    if (message.type === 'auth-request') {
      void handleAuthRequest(current, message)
      return
    }
    if (message.type === 'progress' && message.progress) {
      progressListener?.(message.progress)
      return
    }
    if (typeof message.id !== 'number') return
    const request = pending.get(message.id)
    if (!request) return
    pending.delete(message.id)
    if (message.error) request.reject(new Error(message.error))
    else request.resolve(message.result)
  })
  current.on('error', (error) => {
    const reason = error instanceof Error ? error : new Error(String(error))
    for (const request of pending.values()) request.reject(reason)
    pending.clear()
    if (worker === current) worker = null
  })
  current.on('exit', (code) => {
    if (code !== 0) {
      const error = new Error(`GMV MAX worker exited with code ${code}.`)
      for (const request of pending.values()) request.reject(error)
      pending.clear()
    }
    if (worker === current) worker = null
  })
  return current
}

function call<T>(method: string, args: unknown[] = []) {
  const id = ++sequence
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve, reject })
    getWorker().postMessage({ id, method, args })
  })
}

export const gmvMaxWorkerClient = {
  call,
  startSyncJob(input: { action: 'data' | 'catalog' }, emit: (progress: GmvMaxSyncProgress) => void) {
    let resolveStarted: (progress: GmvMaxSyncProgress) => void
    let rejectStarted: (error: Error) => void
    const started = new Promise<GmvMaxSyncProgress>((resolve, reject) => {
      resolveStarted = resolve
      rejectStarted = reject
    })
    let didStart = false
    progressListener = (progress) => {
      emit(progress)
      if (!didStart) {
        didStart = true
        resolveStarted(progress)
      }
    }
    void call('runSyncJob', [input]).catch((error) => {
      if (!didStart) rejectStarted(error instanceof Error ? error : new Error(String(error)))
    }).finally(() => {
      progressListener = null
    })
    return started
  },
  async close() {
    const current = worker
    worker = null
    if (current) await current.terminate()
  },
}
