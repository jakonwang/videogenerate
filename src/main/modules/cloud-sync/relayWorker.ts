import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import { CloudClientError } from '../../../shared/cloud/client'
import { relayAllows, relayChannel, type RelayCall, type RelayNamespace, type RelayResult, parseCloudFileRef } from '../../../shared/cloud/relay'

/**
 * 电脑代办（实时）：网页上的 GMV Max、达人中心页面调用的功能由这台电脑执行（TikTok 登录在这里）。
 * 长轮询云端取请求，用和电脑端页面完全相同的 IPC 处理函数执行，再把结果交回。
 */

type Handler = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown
const handlers = new Map<string, Handler>()

/** Wraps ipcMain for a module's register function so its handlers can also serve web calls. */
export function recordIpcHandlers(ipc: IpcMain): IpcMain {
  return new Proxy(ipc, {
    get(target, prop, receiver) {
      if (prop === 'handle') {
        return (channel: string, handler: Handler) => {
          handlers.set(channel, handler)
          return target.handle(channel, handler as any)
        }
      }
      const value = Reflect.get(target, prop, receiver)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
}

/**
 * Records every handler registered on ipcMain from now on (call once at startup, before registering).
 * Only the namespaces / methods RELAY_MODULES allows can ever be reached from the web.
 */
export function recordAllIpcHandlers(ipc: IpcMain) {
  const original = ipc.handle.bind(ipc)
  ipc.handle = ((channel: string, handler: Handler) => {
    handlers.set(channel, handler)
    return original(channel, handler as any)
  }) as IpcMain['handle']
}

/** A handler that only the web can call (nothing in the desktop renderer uses it). */
export function registerRelayHandler(channel: string, handler: Handler) {
  handlers.set(channel, handler)
}

/** 仅测试使用 */
export function registerRelayHandlerForTest(channel: string, handler: Handler) {
  handlers.set(channel, handler)
}

type RelayClient = {
  next: (waitMs?: number) => Promise<{ calls: RelayCall[] }>
  result: (result: RelayResult) => Promise<unknown>
}
type ClientSource = () => Promise<RelayClient | null>

let clientSource: ClientSource = async () => {
  const session = await (await import('../../lib/cloudLicense')).getCloudSyncSession()
  return session?.canWrite ? session.client.relay : null
}

/** 仅测试使用：替换云端客户端 */
export function setRelayClientSource(source: ClientSource) {
  clientSource = source
}

/** Cloud files named in the arguments (`cloudfile:<id>/<name>`) are downloaded first and replaced by their local path. */
async function materializeCloudFiles(args: unknown[]): Promise<unknown[]> {
  return materializeCloudFileArgs(args, async (fileId, name) => (cloudFileDownloader ?? (await defaultCloudFileDownloader()))(fileId, name))
}

/** 参数里的云端文件引用下载到本地并换成本地路径（服务器上的复刻引擎也用） */
export async function materializeCloudFileArgs(args: unknown[], download: (fileId: string, name: string) => Promise<string>): Promise<unknown[]> {
  const refs = new Map<string, { fileId: string; name: string }>()
  const collect = (value: unknown) => {
    if (typeof value === 'string') {
      const ref = parseCloudFileRef(value)
      if (ref) refs.set(value, ref)
    } else if (Array.isArray(value)) value.forEach(collect)
    else if (value && typeof value === 'object') Object.values(value).forEach(collect)
  }
  args.forEach(collect)
  if (!refs.size) return args
  const local = new Map<string, string>()
  for (const [raw, ref] of refs) local.set(raw, await download(ref.fileId, ref.name))
  const swap = (value: unknown): unknown => {
    if (typeof value === 'string') return local.get(value) ?? value
    if (Array.isArray(value)) return value.map(swap)
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, swap(v)]))
    return value
  }
  return args.map(swap)
}

type CloudFileDownloader = (fileId: string, name: string) => Promise<string>
let cloudFileDownloader: CloudFileDownloader | null = null
/** 仅测试使用：替换云端文件下载 */
export function setCloudFileDownloaderForTest(download: CloudFileDownloader | null) {
  cloudFileDownloader = download
}
async function defaultCloudFileDownloader(): Promise<CloudFileDownloader> {
  const [{ getCloudSyncSession }, { getAppPaths }, fs, path] = await Promise.all([import('../../lib/cloudLicense'), import('../../lib/paths'), import('node:fs/promises'), import('node:path')])
  return async (fileId, name) => {
    const dir = path.join(getAppPaths().dataDir, 'web-files', fileId)
    const target = path.join(dir, name)
    const exists = await fs.stat(target).then(() => true).catch(() => false)
    if (!exists) {
      const session = await getCloudSyncSession()
      if (!session) throw new Error('电脑端没有登录，无法下载网页选的文件')
      await fs.mkdir(dir, { recursive: true })
      await fs.writeFile(target, Buffer.from(await (await session.client.sync.downloadFile(fileId)).arrayBuffer()))
    }
    return target
  }
}

// A web page never runs on this computer, so progress events sent to the "sender" go nowhere.
const fakeEvent = { sender: { send: () => undefined, isDestroyed: () => false, id: -1 } } as unknown as IpcMainInvokeEvent

export async function runRelayCall(call: RelayCall): Promise<RelayResult> {
  try {
    if (!relayAllows(call.ns, call.method)) return { id: call.id, ok: false, error: '这个操作需要在电脑端完成' }
    const handler = handlers.get(relayChannel(call.ns as RelayNamespace, call.method))
    if (!handler) return { id: call.id, ok: false, error: '电脑端版本不支持这个操作，请更新 Vidloom' }
    const args = await materializeCloudFiles(Array.isArray(call.args) ? call.args : [])
    const result = await handler(fakeEvent, ...args)
    // Same shape the desktop page gets over IPC (structured clone ≈ JSON here).
    return { id: call.id, ok: true, result: result === undefined ? null : JSON.parse(JSON.stringify(result)) }
  } catch (error) {
    return { id: call.id, ok: false, error: String((error as Error)?.message ?? error).slice(0, 500) }
  }
}

let running = false
let stopped = false

/** Keeps a long poll open while this computer is signed in; stops quietly when signed out. */
export function startRelayWorker() {
  stopped = false
  if (running) return
  running = true
  void (async () => {
    while (!stopped) {
      const client = await clientSource().catch(() => null)
      if (!client) {
        await new Promise((resolve) => setTimeout(resolve, 30_000).unref?.())
        continue
      }
      try {
        const { calls } = await client.next(25_000)
        for (const call of calls) void runRelayCall(call).then((result) => client.result(result)).catch(() => undefined)
      } catch (error) {
        // Offline / server restart: back off a little, never spin.
        const wait = error instanceof CloudClientError && error.code === 'NETWORK' ? 10_000 : 5_000
        await new Promise((resolve) => setTimeout(resolve, wait).unref?.())
      }
    }
    running = false
  })()
}

export function stopRelayWorker() {
  stopped = true
}
