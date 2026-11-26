/**
 * 服务器上的复刻引擎（每个用户一个子进程，由 ../src/cloneEngine.ts 启动）。
 *
 * 跑的是电脑端同一套复刻、图生视频、批量字幕代码（registerCloneIpc / registerLivePhotoIpc 注册的处理函数、本地 Web API），数据放在这个用户自己的目录里，
 * 用后台配置的平台密钥生成。项目、商品、模特经云端同步和电脑端互通（cloud-sync 的 clone-engine 模式）。
 *
 * 父进程消息：init（会话、密钥）→ call（ns、method、args）；回复 ready / result。
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import type { ModelCredentials } from '../../../src/main/modules/clone/types'
import { isMeteredRequest } from './meterRule'
import { AI_PROXY_PATH } from '../../../src/shared/cloud/managedSettings'
import { WEB_API_RENDER, assertWebApiPath } from './webApiPath'
import { assertOwnPaths as assertOwnPathsIn } from './ownPaths'
import { stripCredentialOverrides } from './credentialArgs'

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
  // 导入的字体 / 贴纸只在电脑上生效（模板在电脑上成片）
  'stickers:import',
  'fonts:import',
])
/** 要用 Remotion 渲染字幕的操作：先向父进程申请渲染名额（全服务器限量） */
const RENDER_CHANNELS = new Set(['plugin:livePhoto:generateSubtitleVideosForItems'])
/** 网页调用的命名空间 → 电脑端 IPC 前缀 */
const CHANNEL_PREFIX: Record<string, string> = {
  clone: 'clone:',
  livePhoto: 'plugin:livePhoto:',
  // 模板库（网页上是电脑端同一个页面）：模板读写、导入视频 AI 识别；内置 LUT / 贴纸 / 字体列表
  templates: 'templates:',
  luts: 'luts:',
  stickers: 'stickers:',
  fonts: 'fonts:',
  // 商品库（网页上是电脑端同一个页面）：读写商品、提示词版本、AI 分析 / 标准源图
  products: 'products:',
  // 一键上新（网页上是电脑端同一个页面）：出图、写各国文案、图生视频
  productLaunch: 'productLaunch:',
}
const READ_ONLY = /^(get|list|describe)[A-Z]/

const handlers = new Map<string, Handler>()
let lastCallAt = Date.now()
let syncTimer: NodeJS.Timeout | null = null
let ready: Promise<void> | null = null
let lastSyncAt = 0

async function runSync() {
  const sync = await import('../../../src/main/modules/cloud-sync/service')
  await sync.runCloudSync().catch(() => undefined)
  await publishLivePhotoOutputs().catch((error) => console.warn('[clone-engine] publish live photo outputs failed', (error as Error)?.message || error))
  lastSyncAt = Date.now()
}

/* ------------------------------------------------------------------ 图生视频成片 → 作品库 / 审核收件箱 */

/**
 * 做好的图生视频上传到云端，记一条 generations（purpose = image-to-video），网页和手机的作品库、审核收件箱都能看到。
 * 已发布的记在这个用户目录的 live-photo-published.json（换了成片文件会重新发布，同一条记录覆盖）。
 */
async function publishLivePhotoOutputs() {
  const client = (globalThis as { __cloneEngineClient?: { sync: { push(changes: unknown[]): Promise<unknown>; uploadFile(body: Blob, mime: string): Promise<{ fileId: string }> } } }).__cloneEngineClient
  if (!client) return
  const { readFile: read } = await import('node:fs/promises')
  const { livePhotoRepo } = await import('../../../src/main/modules/live-photo/repo')
  const stateFile = join(process.env.VIDEOGENERATE_DATA_DIR!, 'live-photo-published.json')
  const published: Record<string, string> = existsSync(stateFile) ? JSON.parse(await read(stateFile, 'utf8').catch(() => '{}')) : {}
  let changed = false
  for (const item of await livePhotoRepo.list()) {
    if (item.packagingStatus !== 'completed') continue
    const videoPath = [item.livePhotoVideoPath, item.previewVideoPath, item.motionVideoPath].map((path) => String(path || '').trim()).find((path) => path && existsSync(path))
    if (!videoPath || published[item.id] === videoPath) continue
    const video = await client.sync.uploadFile(new Blob([new Uint8Array(await read(videoPath))], { type: 'video/mp4' }), 'video/mp4')
    const posterPath = [item.posterPath, item.generatedStillPath].map((path) => String(path || '').trim()).find((path) => path && existsSync(path))
    const poster = posterPath ? await client.sync.uploadFile(new Blob([new Uint8Array(await read(posterPath))], { type: 'image/jpeg' }), 'image/jpeg').catch(() => null) : null
    const productName = String((item.productSnapshot as { name?: string } | undefined)?.name || '').trim() || undefined
    await client.sync.push([
      {
        collection: 'generations',
        id: `lp_${item.id}`.slice(0, 64),
        updatedAt: Date.now(),
        deleted: false,
        data: { kind: 'video', purpose: 'image-to-video', jobId: '', status: 'succeeded', productName, sourceFileId: poster?.fileId || video.fileId, label: productName ? `图生视频 · ${productName}` : '图生视频', outputFileId: video.fileId, outputMime: 'video/mp4', review: 'pending', createdAt: Number(item.createdAt) || Date.now() },
      },
    ])
    published[item.id] = videoPath
    changed = true
  }
  if (changed) await writeFile(stateFile, JSON.stringify(published), 'utf8')
}

/** 打开列表 / 项目前，取一下电脑端最近的改动（最多等几秒） */
async function syncIfStale() {
  if (Date.now() - lastSyncAt < 10_000) return
  await Promise.race([runSync(), new Promise((resolve) => setTimeout(resolve, 5_000))])
}
const REFRESH_BEFORE = new Set(['clone:listProjectSummaries', 'clone:getProject', 'clone:getProjectSummary', 'templates:list', 'products:list'])

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

/* ------------------------------------------------------------------ 七牛上传凭证（父进程签发，子进程拿不到 SK） */

const grantWaiters = new Map<string, (result: { ok: boolean; grant?: unknown; error?: string }) => void>()
let grantSeq = 0
function askQiniuGrant(input: { fileName: string; keyPrefix?: string }): Promise<any> {
  const id = String(++grantSeq)
  return new Promise((resolveGrant, rejectGrant) => {
    const timer = setTimeout(() => {
      grantWaiters.delete(id)
      rejectGrant(new Error('获取上传凭证超时，请稍后重试'))
    }, 15_000)
    grantWaiters.set(id, (result) => {
      clearTimeout(timer)
      if (result.ok && result.grant) resolveGrant(result.grant)
      else rejectGrant(new Error(result.error || '获取上传凭证失败'))
    })
    send({ type: 'qiniuGrant', id, fileName: input.fileName, keyPrefix: input.keyPrefix })
  })
}

/**
 * 复刻代码向 AI 平台发起的每次生成都先经父进程计数（超过每日上限直接失败，原因显示在复刻页面上）。
 * 发往云端 AI 代理的请求带上 x-vg-client: web，后台统计时能和电脑端分开。
 */
function installFetchMeter(cloudBaseUrl: string) {
  const original = globalThis.fetch
  const proxyRoot = `${cloudBaseUrl.replace(/\/+$/, '')}${AI_PROXY_PATH}/`
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const method = init?.method || (typeof input === 'object' && 'method' in input ? input.method : 'GET')
    if (isMeteredRequest(url, method, cloudBaseUrl)) await askMeter()
    if (url.startsWith(proxyRoot)) {
      const headers = new Headers(init?.headers ?? (typeof input === 'object' && !(input instanceof URL) ? input.headers : undefined))
      headers.set('x-vg-client', 'web')
      return original(input as never, { ...init, headers })
    }
    return original(input as never, init)
  }) as typeof fetch
}

async function init(message: InitMessage) {
  installFetchMeter(message.baseUrl)
  const dataDir = process.env.VIDEOGENERATE_DATA_DIR!
  await mkdir(join(dataDir, 'db'), { recursive: true })
  const [{ createCloudClient }, sync, { cloneService }, { registerCloneIpc }, { registerClonePromptTemplatesIpc }, { registerLivePhotoIpc }] = await Promise.all([
    import('../../../src/shared/cloud/client'),
    import('../../../src/main/modules/cloud-sync/service'),
    import('../../../src/main/modules/clone/service'),
    import('../../../src/main/ipc/registerCloneIpc'),
    import('../../../src/main/ipc/registerClonePromptTemplatesIpc'),
    import('../../../src/main/ipc/registerLivePhotoIpc'),
  ])
  const client = createCloudClient({ getBaseUrl: () => message.baseUrl, getToken: () => message.token })
  ;(globalThis as { __cloneEngineClient?: unknown }).__cloneEngineClient = client
  // 生成请求走云端 AI 代理（凭据里的平台地址就是代理），由代理按次扣点，这里不再自己冻结点数，避免重复扣
  const [{ setQiniuUploadGrantProvider }, { setTikhubBaseUrlOverride }] = await Promise.all([
    import('../../../src/main/modules/clone/qiniu'),
    import('../../../src/main/modules/video-parser-download/tikhub'),
  ])
  setQiniuUploadGrantProvider((input) => askQiniuGrant(input))
  setTikhubBaseUrlOverride(`${message.baseUrl.replace(/\/+$/, '')}${AI_PROXY_PATH}/tikhub`)
  sync.setCloudSyncMode('clone-engine')
  sync.setCloudSyncSessionSource(() => ({ client, userId: message.userId, canWrite: true }))
  await cloneService.setModelCredentials(message.credentials)

  const host = { handle: (channel: string, handler: Handler) => void handlers.set(channel, handler) }
  registerCloneIpc(host as never)
  registerClonePromptTemplatesIpc(host as never)
  registerLivePhotoIpc(host as never)
  await registerTemplateHandlers()
  await registerProductHandlers()
  await registerProductLaunchHandlers()
  for (const channel of SERVER_BLOCKED) handlers.delete(channel)

  // The first sync brings in projects / products made on the computer; don't keep the page waiting too long for it.
  await Promise.race([runSync(), new Promise((resolve) => setTimeout(resolve, 20_000))])
  setInterval(() => void runSync(), 30_000).unref()
  setInterval(() => void maybeExit(message.idleMs), 60_000).unref()
  // 和电脑端启动时一样：上次退出时还没做完的图生视频任务接着做
  void import('../../../src/main/modules/live-photo/service')
    .then(({ livePhotoService }) => livePhotoService.resumePendingTasksOnStartup())
    .catch((error) => console.warn('[clone-engine] live photo resume failed', (error as Error)?.message || error))
}

/**
 * 模板库：和电脑端 registerTemplatesTasksIpc 里的模板部分相同（生产任务队列不在服务器上跑），
 * 加上内置 LUT / 贴纸 / 字体列表。导入字体 / 贴纸只在电脑端做（见 SERVER_BLOCKED）。
 */
async function registerTemplateHandlers() {
  const [{ templatesRepo }, { analyzeVideoToTemplateDraft }, { registerMediaAssetsIpc }] = await Promise.all([
    import('../../../src/main/modules/templates/repo'),
    import('../../../src/main/modules/templates/analyzeVideoTemplate'),
    import('../../../src/main/ipc/registerMediaAssetsIpc'),
  ])
  handlers.set('templates:list', async () => templatesRepo.list())
  handlers.set('templates:upsert', async (_e, payload) => templatesRepo.upsert(payload as never))
  handlers.set('templates:remove', async (_e, id) => templatesRepo.remove(String(id ?? '')))
  handlers.set('templates:analyzeVideo', async (_e, payload) => {
    const input = (payload ?? {}) as { videoPath?: string; locale?: string }
    return analyzeVideoToTemplateDraft({ videoPath: String(input.videoPath ?? ''), locale: input.locale })
  })
  // stickers:import / fonts:import are dropped with SERVER_BLOCKED right after this.
  registerMediaAssetsIpc({ handle: (channel: string, handler: Handler) => void handlers.set(channel, handler) } as never)
}

/** 商品库：和电脑端 registerProductsIpc 相同，另加「本机商品 id → 云端 id」（交给电脑的调用要用云端 id） */
async function registerProductHandlers() {
  const [{ registerProductsIpc }, sync] = await Promise.all([
    import('../../../src/main/ipc/registerProductsIpc'),
    import('../../../src/main/modules/cloud-sync/service'),
  ])
  registerProductsIpc({ handle: (channel: string, handler: Handler) => void handlers.set(channel, handler) } as never)
  handlers.set('products:cloudIdOf', async (_e, id) => sync.cloudProductIdForLocal(String(id ?? '')))
  handlers.set('products:localIdOf', async (_e, id) => sync.localProductIdForCloud(String(id ?? '')))
}

/**
 * 一键上新：和电脑端同一个流水线。服务器上没有 TikTok 创意账号，只开放图生视频；
 * 「进审核收件箱」换成同步一次（图生视频成片由 publishLivePhotoOutputs 发到作品库 / 审核收件箱）。
 */
async function registerProductLaunchHandlers() {
  const [{ configureProductLaunch }, { registerProductLaunchIpc }] = await Promise.all([
    import('../../../src/main/modules/product-launch/service'),
    import('../../../src/main/ipc/registerProductLaunchIpc'),
  ])
  configureProductLaunch({ videoEngines: ['livePhoto'], syncInbox: () => runSync() })
  registerProductLaunchIpc({ handle: (channel: string, handler: Handler) => void handlers.set(channel, handler) } as never)
}

async function productLaunchBusy() {
  const { productLaunchService } = await import('../../../src/main/modules/product-launch/service')
  return await productLaunchService.busy().catch(() => false)
}

/** 有图生视频任务在跑（或 3 分钟内有改动）时不退出：任务在这个进程里后台执行 */
async function livePhotoBusy() {
  const { livePhotoService } = await import('../../../src/main/modules/live-photo/service')
  const running = (await livePhotoService.listSummaries({ filter: 'running', page: 1, pageSize: 1 }).catch(() => null)) as { total?: number; items?: unknown[] } | null
  if (running && (Number(running.total) > 0 || (running.items?.length ?? 0) > 0)) return true
  const { livePhotoRepo } = await import('../../../src/main/modules/live-photo/repo')
  const items = await livePhotoRepo.list().catch(() => [])
  return items.some((item) => Date.now() - Number(item.updatedAt || 0) < 3 * 60_000)
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
  if (busy || (await livePhotoBusy()) || (await productLaunchBusy())) return
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
  assertOwnPathsIn(value, process.env.VIDEOGENERATE_USER_DATA_DIR!)
}

/* ------------------------------------------------------------------ 渲染名额（父进程统一分配） */

const slotWaiters = new Map<string, () => void>()
let slotSeq = 0
async function withRenderSlot<T>(run: () => Promise<T> | T): Promise<T> {
  const id = `r${++slotSeq}`
  await new Promise<void>((resolveSlot) => {
    slotWaiters.set(id, resolveSlot)
    send({ type: 'slot', id })
  })
  try {
    return await run()
  } finally {
    send({ type: 'slotDone', id })
  }
}

/* ------------------------------------------------------------------ 电脑端本地 Web API（批量字幕页面用） */

/**
 * 电脑端「视频批量字幕」页面调用的是本机 Web API（src/main/modules/web-platform/webApiRouter.ts）。
 * 这里在子进程里起同一个 API（只监听 127.0.0.1 的随机端口），网页的请求原样转过来；不带登录令牌，
 * 由 web-platform 用本机默认用户处理——每个子进程只属于一个用户、数据在他自己的目录里。
 * 只开放批量字幕插件和复刻项目列表；用 node:http 发请求，不经过 fetch 计数（真正的 AI 请求在 API 里面照常计数）。
 */
type WebApiRequest = { method?: string; path?: string; body?: unknown }
let webApiPort: Promise<number> | null = null

async function ensureWebApi() {
  webApiPort ??= (async () => {
    const http = await import('node:http')
    const { handleWebApiRequest } = await import('../../../src/main/modules/web-platform/webApiRouter')
    const server = http.createServer((req, res) => void handleWebApiRequest(req, res))
    await new Promise<void>((resolveListen, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => resolveListen())
    })
    return (server.address() as { port: number }).port
  })()
  return webApiPort
}

async function webApiRequest(input: WebApiRequest) {
  const method = String(input.method || 'GET').toUpperCase()
  if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) throw new Error('请求方法不合法')
  const { path, requestPath } = assertWebApiPath(method, String(input.path || ''))
  const port = await ensureWebApi()
  const send = async () => {
    const http = await import('node:http')
    const body = input.body === undefined || method === 'GET' ? undefined : JSON.stringify(input.body)
    return await new Promise<{ status: number; text: string }>((resolveReq, reject) => {
      const req = http.request({ host: '127.0.0.1', port, path: requestPath, method, headers: body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } : {} }, (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk: Buffer) => chunks.push(chunk))
        res.on('end', () => resolveReq({ status: res.statusCode || 0, text: Buffer.concat(chunks).toString('utf8') }))
        res.on('error', reject)
      })
      req.on('error', reject)
      if (body) req.write(body)
      req.end()
    })
  }
  const response = WEB_API_RENDER.test(path) ? await withRenderSlot(send) : await send()
  let payload: { ok?: boolean; error?: string } & Record<string, unknown>
  try {
    payload = JSON.parse(response.text || '{}')
  } catch {
    throw new Error(`请求失败: ${response.status}`)
  }
  if (response.status >= 400 || payload.ok === false) throw new Error(String(payload.error || `请求失败: ${response.status}`))
  return payload
}

async function handle(message: CallMessage): Promise<unknown> {
  const { materializeCloudFileArgs } = await import('../../../src/main/modules/cloud-sync/relayWorker')
  const raw = Array.isArray(message.args) ? message.args : []
  const args = await materializeCloudFileArgs(message.ns === 'clone' ? (stripCredentialOverrides(raw) as unknown[]) : raw, downloadCloudFile)
  // webApi: the API path itself ("/plugins/…") is not a file; only the request body can carry file paths.
  assertOwnPaths(message.ns === 'webApi' ? (args[0] as WebApiRequest | undefined)?.body : args)
  if (message.ns === 'media' && message.method === 'publish') return publishMedia((args[0] ?? {}) as { path?: string; width?: number })
  if (message.ns === 'webApi' && message.method === 'request') return webApiRequest((args[0] ?? {}) as WebApiRequest)
  const prefix = CHANNEL_PREFIX[message.ns]
  if (!prefix) throw new Error('服务器上没有这个功能')
  const channel = `${prefix}${message.method}`
  // 导出：只能导到这个用户自己的目录（网页再从这里下载）
  if (channel === 'plugin:livePhoto:exportItems' && args[0] && typeof args[0] === 'object') {
    const { getAppPaths } = await import('../../../src/main/lib/paths')
    ;(args[0] as { outputDir?: string }).outputDir = join(getAppPaths().dataDir, 'exports', 'live-photo', String(Date.now()))
  }
  const handler = handlers.get(channel)
  if (handler && REFRESH_BEFORE.has(channel)) await syncIfStale()
  if (!handler) throw new Error(SERVER_BLOCKED.has(channel) ? '这个操作需要在电脑端完成' : `服务器上没有这个操作：${message.method}`)
  const run = () => handler({ sender: { send: () => undefined } }, ...args)
  const result = RENDER_CHANNELS.has(channel) ? await withRenderSlot(run) : await run()
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
  if ((message as { type?: string })?.type === 'slotGranted') {
    const id = String((message as unknown as { id: string }).id)
    slotWaiters.get(id)?.()
    slotWaiters.delete(id)
    return
  }
  if ((message as { type?: string })?.type === 'qiniuGrantResult') {
    const result = message as unknown as { id: string; ok: boolean; grant?: unknown; error?: string }
    grantWaiters.get(String(result.id))?.(result)
    grantWaiters.delete(String(result.id))
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
