/**
 * 服务器上的复刻引擎（每个用户一个子进程，由 ../src/cloneEngine.ts 启动）。
 *
 * 跑的是电脑端同一套复刻代码（registerCloneIpc 注册的处理函数 + cloneService），数据放在这个用户自己的目录里，
 * 用后台配置的平台密钥生成。项目、商品、模特经云端同步和电脑端互通（cloud-sync 的 clone-engine 模式）。
 *
 * 父进程消息：init（会话、密钥）→ call（ns、method、args）；回复 ready / result。
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import type { ModelCredentials } from '../../../src/main/modules/clone/types'
import { isMeteredRequest } from './meterRule'

type InitMessage = { type: 'init'; baseUrl: string; token: string; userId: string; credentials: ModelCredentials; idleMs: number }
type CallMessage = { type: 'call'; id: string; ns: string; method: string; args: unknown[] }
type Handler = (event: unknown, ...args: unknown[]) => unknown

/** 服务器上不提供的复刻操作：密钥和运行参数归后台管；tk创意室要用电脑上的 TikTok 账号 */
const SERVER_BLOCKED = new Set([
  'clone:debugLog',
  'clone:getModelCredentials',
  'clone:setModelCredentials',
  'clone:getRuntimeOptions',
  'clone:setRuntimeOptions',
  'clone:getGrsAiCredits',
  'clone:sendProjectToCreative',
  'clone:sendShotToCreative',
])
const READ_ONLY = /^(get|list|describe)[A-Z]/

const handlers = new Map<string, Handler>()
let lastCallAt = Date.now()
let syncTimer: NodeJS.Timeout | null = null
let ready: Promise<void> | null = null
let lastSyncAt = 0

async function runSync() {
  const sync = await import('../../../src/main/modules/cloud-sync/service')
  await sync.runCloudSync().catch(() => undefined)
  lastSyncAt = Date.now()
}

/** 打开列表 / 项目前，取一下电脑端最近的改动（最多等几秒） */
async function syncIfStale() {
  if (Date.now() - lastSyncAt < 10_000) return
  await Promise.race([runSync(), new Promise((resolve) => setTimeout(resolve, 5_000))])
}
const REFRESH_BEFORE = new Set(['clone:listProjectSummaries', 'clone:getProject', 'clone:getProjectSummary'])

const send = (message: unknown) => process.send?.(message)

/* ------------------------------------------------------------------ 每日生成次数（父进程计数） */

const meterWaiters = new Map<string, (result: { ok: boolean; error?: string }) => void>()
let meterSeq = 0
function askMeter(): Promise<void> {
  const id = String(++meterSeq)
  return new Promise<void>((resolveMeter, rejectMeter) => {
    const timer = setTimeout(() => {
      meterWaiters.delete(id)
      rejectMeter(new Error('生成次数校验超时，请稍后重试'))
    }, 15_000)
    meterWaiters.set(id, (result) => {
      clearTimeout(timer)
      if (result.ok) resolveMeter()
      else rejectMeter(new Error(result.error || '今天的生成次数已用完'))
    })
    send({ type: 'meter', id })
  })
}

/** 复刻代码向 AI 平台发起的每次生成都先经父进程计数（超过每日上限直接失败，原因显示在复刻页面上） */
function installFetchMeter(cloudBaseUrl: string) {
  const original = globalThis.fetch
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const method = init?.method || (typeof input === 'object' && 'method' in input ? input.method : 'GET')
    if (isMeteredRequest(url, method, cloudBaseUrl)) await askMeter()
    return original(input as never, init)
  }) as typeof fetch
}

async function init(message: InitMessage) {
  installFetchMeter(message.baseUrl)
  const dataDir = process.env.VIDEOGENERATE_DATA_DIR!
  await mkdir(join(dataDir, 'db'), { recursive: true })
  const [{ createCloudClient }, sync, { cloneService }, { registerCloneIpc }, { registerClonePromptTemplatesIpc }] = await Promise.all([
    import('../../../src/shared/cloud/client'),
    import('../../../src/main/modules/cloud-sync/service'),
    import('../../../src/main/modules/clone/service'),
    import('../../../src/main/ipc/registerCloneIpc'),
    import('../../../src/main/ipc/registerClonePromptTemplatesIpc'),
  ])
  const client = createCloudClient({ getBaseUrl: () => message.baseUrl, getToken: () => message.token })
  ;(globalThis as { __cloneEngineClient?: unknown }).__cloneEngineClient = client
  // 服务器复刻用的是后台的平台密钥：每次视频 / 图片生成都按这个用户的套餐扣点
  const { setUsageMeter, createCloudUsageMeter } = await import('../../../src/main/modules/clone/usageMeter')
  setUsageMeter(createCloudUsageMeter({ client: () => client, clientKind: 'web' }))
  sync.setCloudSyncMode('clone-engine')
  sync.setCloudSyncSessionSource(() => ({ client, userId: message.userId, canWrite: true }))
  await cloneService.setModelCredentials(message.credentials)

  const host = { handle: (channel: string, handler: Handler) => void handlers.set(channel, handler) }
  registerCloneIpc(host as never)
  registerClonePromptTemplatesIpc(host as never)
  for (const channel of SERVER_BLOCKED) handlers.delete(channel)

  // The first sync brings in projects / products made on the computer; don't keep the page waiting too long for it.
  await Promise.race([runSync(), new Promise((resolve) => setTimeout(resolve, 20_000))])
  setInterval(() => void runSync(), 30_000).unref()
  setInterval(() => void maybeExit(message.idleMs), 60_000).unref()
}

/** 改动之后尽快推送，让电脑端也看到 */
function scheduleSync() {
  if (syncTimer) clearTimeout(syncTimer)
  syncTimer = setTimeout(() => {
    syncTimer = null
    void runSync()
  }, 2_000)
}

/** 一段时间没人用、也没有项目在生成，就同步一次后退出（下次调用时再启动） */
async function maybeExit(idleMs: number) {
  if (Date.now() - lastCallAt < idleMs) return
  const { cloneRepo } = await import('../../../src/main/modules/clone/repo')
  const projects = await cloneRepo.listRawProjects().catch(() => [])
  const busy = projects.some((project) => project.status === 'generating' || Date.now() - Number(project.updatedAt || 0) < 3 * 60_000)
  if (busy) return
  await runSync()
  process.exit(0)
}

type EngineClient = { sync: { downloadFile(fileId: string): Promise<Blob>; uploadFile(body: Blob, mime: string): Promise<{ fileId: string }> } }
const engineClient = () => (globalThis as { __cloneEngineClient?: EngineClient }).__cloneEngineClient!

/** 网页上传的文件（cloudfile:…）先下载到这个用户的数据目录 */
async function downloadCloudFile(fileId: string, name: string) {
  const { getAppPaths } = await import('../../../src/main/lib/paths')
  const dir = join(getAppPaths().dataDir, 'cloud-files', fileId)
  const target = join(dir, name.replace(/[\\/:*?"<>|]+/g, '_') || 'file')
  if (!existsSync(target)) {
    await mkdir(dir, { recursive: true })
    const blob = await engineClient().sync.downloadFile(fileId)
    await writeFile(target, Buffer.from(await blob.arrayBuffer()))
  }
  return target
}

let mediaDeps: Promise<import('../../../src/main/modules/cloud-sync/relayMedia').RelayMediaDeps> | null = null
async function publishMedia(input: { path?: string; width?: number }) {
  const [{ publishLocalMedia, defaultRelayMediaDeps }] = await Promise.all([import('../../../src/main/modules/cloud-sync/relayMedia')])
  mediaDeps ??= defaultRelayMediaDeps().then((deps) => ({
    ...deps,
    upload: (body: Buffer, mime: string) => engineClient().sync.uploadFile(new Blob([new Uint8Array(body)], { type: mime }), mime),
  }))
  return publishLocalMedia(await mediaDeps, input)
}

/** 参数里的本地路径只能在这个用户自己的目录里（不能读服务器上的其它文件或别人的数据） */
function assertOwnPaths(value: unknown) {
  const root = resolve(process.env.VIDEOGENERATE_USER_DATA_DIR!)
  const check = (item: unknown) => {
    if (typeof item === 'string') {
      if (item.length > 2048) return
      if (/^(?:[A-Za-z]:[\\/]|[\\/]|file:|\.\.)/i.test(item) || /(^|[\\/])\.\.([\\/]|$)/.test(item)) {
        const full = resolve(item.replace(/^file:[\\/]*/i, process.platform === 'win32' ? '' : '/'))
        if (full !== root && !full.startsWith(root + sep)) throw new Error('只能使用自己上传的文件')
      }
    } else if (Array.isArray(item)) item.forEach(check)
    else if (item && typeof item === 'object') Object.values(item).forEach(check)
  }
  check(value)
}

async function handle(message: CallMessage): Promise<unknown> {
  const { materializeCloudFileArgs } = await import('../../../src/main/modules/cloud-sync/relayWorker')
  const args = await materializeCloudFileArgs(Array.isArray(message.args) ? message.args : [], downloadCloudFile)
  assertOwnPaths(args)
  if (message.ns === 'media' && message.method === 'publish') return publishMedia((args[0] ?? {}) as { path?: string; width?: number })
  if (message.ns === 'products' && message.method === 'list') {
    const { productsRepo } = await import('../../../src/main/modules/products/repo')
    return productsRepo.list()
  }
  if (message.ns !== 'clone') throw new Error('服务器上没有这个功能')
  const channel = `clone:${message.method}`
  const handler = handlers.get(channel)
  if (handler && REFRESH_BEFORE.has(channel)) await syncIfStale()
  if (!handler) throw new Error(SERVER_BLOCKED.has(channel) ? '这个操作需要在电脑端完成' : `服务器上没有这个操作：${message.method}`)
  const result = await handler({ sender: { send: () => undefined } }, ...args)
  if (!READ_ONLY.test(message.method)) scheduleSync()
  return result
}

process.on('message', (raw: unknown) => {
  const message = raw as InitMessage | CallMessage
  if (message?.type === 'init') {
    ready = init(message)
    ready.then(() => send({ type: 'ready' })).catch((error) => send({ type: 'fatal', error: String((error as Error)?.message || error) }))
    return
  }
  if ((message as { type?: string })?.type === 'meterResult') {
    const result = message as unknown as { id: string; ok: boolean; error?: string }
    meterWaiters.get(String(result.id))?.(result)
    meterWaiters.delete(String(result.id))
    return
  }
  if (message?.type === 'call') {
    lastCallAt = Date.now()
    void (async () => {
      try {
        await ready
        const result = await handle(message)
        send({ type: 'result', id: message.id, ok: true, result: result === undefined ? null : JSON.parse(JSON.stringify(result)) })
      } catch (error) {
        send({ type: 'result', id: message.id, ok: false, error: String((error as Error)?.message || error).slice(0, 500) })
      }
    })()
  }
})

process.on('disconnect', () => process.exit(0))
process.on('unhandledRejection', (error) => console.warn('[clone-engine] unhandled', (error as Error)?.message || error))
