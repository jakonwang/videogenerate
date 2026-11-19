import { fork, type ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { CloudError, badRequest } from './security'
import type { ModelCredentials } from '../../../src/main/modules/clone/types'

/**
 * 服务器上的复刻引擎：网页的复刻页面（和电脑端同一个页面）调用的复刻功能在服务器上执行，不需要电脑开着。
 *
 * 每个用户一个子进程（engine/cloneWorker.ts），跑电脑端同一套复刻代码，数据在 dataDir/clone-engine/<用户>/ 下；
 * 空闲一段时间且没有项目在生成就退出。项目经云端同步和电脑端互通。
 */

const CALL_TIMEOUT_MS = 10 * 60_000
const WORKER_PATH = resolve(__dirname, '../engine/cloneWorker.ts')

export type CloneEngineDeps = {
  dataDir: string
  baseUrl: () => string
  /** 给子进程用的登录会话（子进程通过本机 HTTP 同步数据） */
  issueToken: (userId: string) => string
  revokeToken: (token: string) => void
  credentials: () => ModelCredentials
  /** 子进程每次向 AI 平台发起生成前计数；超过每日上限时抛错（错误信息会显示在复刻页面上） */
  meter: (userId: string) => void
  maxWorkers: number
  idleMs: number
  /** 字幕渲染（Remotion 无界面浏览器）全服务器同时最多几个，所有用户的子进程共用；默认 1 */
  renderSlots?: number
  /** 字幕用的字体目录（和服务器视频工具共用 CLOUD_FONTS_DIR） */
  fontsDir?: string
}

type Pending = { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }
type Worker = { child: ChildProcess; token: string; ready: Promise<void>; pending: Map<string, Pending>; lastUsedAt: number }

export function createCloneEngine(deps: CloneEngineDeps) {
  const workers = new Map<string, Worker>()

  /* 渲染名额：子进程要渲染字幕前先申请（slot），做完归还（slotDone）；子进程退出时它占着的名额自动归还 */
  const slotLimit = Math.max(1, deps.renderSlots ?? 1)
  const slotHolders = new Map<string, ChildProcess>()
  const slotQueue: Array<{ key: string; child: ChildProcess; id: string }> = []
  function grantSlots() {
    while (slotHolders.size < slotLimit && slotQueue.length) {
      const next = slotQueue.shift()!
      if (!next.child.connected) continue
      slotHolders.set(next.key, next.child)
      next.child.send({ type: 'slotGranted', id: next.id })
    }
  }
  function releaseSlotsOf(child: ChildProcess) {
    for (const [key, holder] of slotHolders) if (holder === child) slotHolders.delete(key)
    for (let i = slotQueue.length - 1; i >= 0; i -= 1) if (slotQueue[i]!.child === child) slotQueue.splice(i, 1)
    grantSlots()
  }
  const userRoot = (userId: string) => join(deps.dataDir, 'clone-engine', userId.replace(/[^a-zA-Z0-9_-]/g, '_'))

  function stop(userId: string) {
    const worker = workers.get(userId)
    if (!worker) return
    workers.delete(userId)
    deps.revokeToken(worker.token)
    for (const pending of worker.pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(new CloudError('ENGINE_STOPPED', '复刻引擎已重启，请重试', 503))
    }
    if (worker.child.connected) worker.child.disconnect()
  }

  function start(userId: string): Worker {
    if (workers.size >= deps.maxWorkers) {
      // Make room by stopping the least recently used idle worker.
      const idle = [...workers.entries()].filter(([, worker]) => !worker.pending.size).sort((a, b) => a[1].lastUsedAt - b[1].lastUsedAt)[0]
      if (!idle) throw new CloudError('RATE_LIMITED', '服务器复刻任务繁忙，请稍后再试', 429)
      stop(idle[0])
    }
    const root = userRoot(userId)
    mkdirSync(join(root, 'data'), { recursive: true })
    const child = fork(WORKER_PATH, [], {
      cwd: root,
      env: { ...process.env, VIDEOGENERATE_USER_DATA_DIR: root, VIDEOGENERATE_DATA_DIR: join(root, 'data'), VIDEOGENERATE_CLONE_ENGINE: '1', ...(deps.fontsDir ? { VIDEOGENERATE_FONTS_DIR: deps.fontsDir } : {}) },
      // The desktop clone code logs a lot of debug lines to stdout; keep warnings / errors (stderr) only.
      stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
    })
    const token = deps.issueToken(userId)
    const worker: Worker = { child, token, pending: new Map(), lastUsedAt: Date.now(), ready: Promise.resolve() }
    worker.ready = new Promise<void>((resolveReady, rejectReady) => {
      child.on('message', (raw: any) => {
        if (raw?.type === 'ready') return resolveReady()
        if (raw?.type === 'fatal') return rejectReady(new Error(String(raw.error || '复刻引擎启动失败')))
        if (raw?.type === 'slot') {
          slotQueue.push({ key: `${child.pid}:${raw.id}`, child, id: String(raw.id) })
          return grantSlots()
        }
        if (raw?.type === 'slotDone') {
          slotHolders.delete(`${child.pid}:${raw.id}`)
          return grantSlots()
        }
        if (raw?.type === 'meter') {
          let error = ''
          try {
            deps.meter(userId)
          } catch (meterError) {
            error = (meterError as Error).message || '今天的生成次数已用完'
          }
          if (child.connected) child.send({ type: 'meterResult', id: raw.id, ok: !error, error })
          return
        }
        if (raw?.type !== 'result') return
        const pending = worker.pending.get(String(raw.id))
        if (!pending) return
        clearTimeout(pending.timer)
        worker.pending.delete(String(raw.id))
        if (raw.ok) pending.resolve(raw.result)
        else pending.reject(new CloudError('ENGINE_FAILED', String(raw.error || '复刻执行失败').slice(0, 500), 502))
      })
      child.once('exit', () => {
        releaseSlotsOf(child)
        rejectReady(new Error('复刻引擎已退出'))
        if (workers.get(userId) === worker) stop(userId)
      })
    })
    worker.ready.catch(() => undefined)
    child.send({ type: 'init', baseUrl: deps.baseUrl(), token, userId, credentials: deps.credentials(), idleMs: deps.idleMs })
    workers.set(userId, worker)
    return worker
  }

  /** 网页调用一个复刻功能（与电脑端页面的 window.api.clone.* 同名同参数） */
  async function call(userId: string, ns: string, method: string, args: unknown[]): Promise<{ result: unknown }> {
    if (!/^[a-zA-Z][a-zA-Z0-9]{0,63}$/.test(method)) throw badRequest('方法名不合法')
    let worker = workers.get(userId)
    if (!worker || !worker.child.connected) worker = start(userId)
    worker.lastUsedAt = Date.now()
    try {
      await worker.ready
    } catch (error) {
      stop(userId)
      throw new CloudError('ENGINE_FAILED', `复刻引擎启动失败：${(error as Error).message}`.slice(0, 300), 502)
    }
    const id = randomUUID()
    const result = await new Promise<unknown>((resolvePromise, reject) => {
      const timer = setTimeout(() => {
        worker!.pending.delete(id)
        reject(new CloudError('ENGINE_TIMEOUT', '复刻执行超时，请稍后刷新查看', 504))
      }, CALL_TIMEOUT_MS)
      worker!.pending.set(id, { resolve: resolvePromise, reject, timer })
      worker!.child.send({ type: 'call', id, ns, method, args })
    })
    return { result }
  }

  /** 这个路径是不是这个用户在服务器复刻引擎里的文件（网页显示复刻里的图片 / 视频时用） */
  function ownsPath(userId: string, path: unknown) {
    const text = String(path || '').trim()
    if (!text) return false
    const root = resolve(userRoot(userId))
    const full = resolve(text)
    return full === root || full.startsWith(root + sep)
  }

  function close() {
    for (const userId of [...workers.keys()]) stop(userId)
  }

  return { call, ownsPath, close, running: () => workers.size }
}

export type CloneEngine = ReturnType<typeof createCloneEngine>

/** 复刻的这些操作留在电脑端（模型密钥、运行参数是电脑自己的设置），其余都由服务器执行 */
const DESKTOP_CLONE_METHODS = new Set(['getModelCredentials', 'setModelCredentials', 'getRuntimeOptions', 'setRuntimeOptions', 'getGrsAiCredits', 'debugLog'])

/** 网页的一次调用由服务器复刻引擎执行（true）还是转给电脑（false） */
export function routesToCloneEngine(engine: CloneEngine, userId: string, body: { ns?: unknown; method?: unknown; args?: unknown; target?: unknown }) {
  const ns = String(body?.ns || '')
  const method = String(body?.method || '')
  if (ns === 'clone') return !DESKTOP_CLONE_METHODS.has(method)
  // 图生视频、批量字幕（电脑端本地 Web API）：网页和电脑端同一个页面，在服务器引擎上执行
  if (ns === 'livePhoto' || ns === 'webApi') return true
  if (ns === 'products' && method === 'list') return body?.target === 'server'
  if (ns === 'media' && method === 'publish') {
    const input = Array.isArray(body?.args) ? (body.args[0] as { path?: unknown } | undefined) : undefined
    return engine.ownsPath(userId, input?.path)
  }
  return false
}
