import { parentPort, workerData } from 'node:worker_threads'
import { configureAppPathRuntime } from '../lib/paths'
import { configureGmvMaxAuthRuntime } from '../modules/tiktok-gmv-max/authStore'
import type { GmvMaxOAuthSecrets, GmvMaxSyncProgress } from '../modules/tiktok-gmv-max/types'

type Request = { id: number; method: string; args?: unknown[] }
type AuthResponse = { authRequestId: number; result?: unknown; error?: string }

let authSequence = 0
const authPending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>()

function authCall<T>(action: string, payload: Record<string, unknown>) {
  const authRequestId = ++authSequence
  return new Promise<T>((resolve, reject) => {
    authPending.set(authRequestId, { resolve, reject })
    parentPort?.postMessage({ type: 'auth-request', authRequestId, action, payload })
  })
}

configureAppPathRuntime({
  userDataDir: String(workerData.userDataDir || ''),
  dataDir: String(workerData.dataDir || ''),
})
configureGmvMaxAuthRuntime({
  encryptionAvailable: () => Boolean(workerData.encryptionAvailable),
  read: (connectionId) => authCall<GmvMaxOAuthSecrets>('read', { connectionId }),
  write: (connectionId, secrets) => authCall<void>('write', { connectionId, secrets }),
  remove: (connectionId) => authCall<void>('remove', { connectionId }),
})

parentPort?.on('message', async (message: Request | AuthResponse) => {
  if ('authRequestId' in message) {
    const request = authPending.get(message.authRequestId)
    if (!request) return
    authPending.delete(message.authRequestId)
    if (message.error) request.reject(new Error(message.error))
    else request.resolve(message.result)
    return
  }

  try {
    const { gmvMaxService } = await import('../modules/tiktok-gmv-max/service')
    const service = gmvMaxService as unknown as Record<string, (...args: any[]) => any>
    const method = service[message.method]
    if (typeof method !== 'function') throw new Error(`Unsupported GMV MAX worker method: ${message.method}`)
    const args = Array.isArray(message.args) ? message.args : []
    if (message.method === 'runSyncJob') {
      const emit = (progress: GmvMaxSyncProgress) => parentPort?.postMessage({ type: 'progress', progress })
      const result = await method.apply(service, [...args, emit])
      parentPort?.postMessage({ id: message.id, result })
      return
    }
    parentPort?.postMessage({ id: message.id, result: await method.apply(service, args) })
  } catch (error) {
    parentPort?.postMessage({ id: message.id, error: error instanceof Error ? error.message : String(error) })
  }
})
