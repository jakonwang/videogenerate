import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { copyFile, mkdir, rm, stat } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { readJsonFile, writeJsonFile } from '../../lib/storeJson'
import { IMAGE_TYPES, MAX_DETAIL_IMAGES, MAX_IMAGE_BYTES } from './details'
import { buildMusePrompt, MuseGenerateError, type MuseRunInput, type MuseVideoResult } from './generate'
import type { MuseAccount, MuseJob, MuseJobLog, MuseJobStage, MuseQueue, MuseSettings } from './types'

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024
const MAX_BATCH = 50
const MAX_LOGS = 100
const STAGE_LOG: Record<MuseJobStage, string> = {
  preparing: '开始准备',
  submitting: '点击发送',
  generating: '提示词已发出，等待生成',
  collecting: '打开原对话找结果',
  downloading: '发现视频，开始下载',
}
const MAX_UNSENT_ATTEMPTS = 3
const MAX_QUOTA_SWITCHES = 5

export type MuseRunContext = Pick<MuseRunInput, 'prompt' | 'outputDir' | 'signal' | 'onStage' | 'onThread' | 'imagePath' | 'lastFramePath' | 'detailImagePaths' | 'threadPath'>

/** The account could not be used; nothing was sent and the job simply waits for another turn. */
export class MuseAccountUnavailable extends Error {}

type Db = { jobs: MuseJob[]; paused?: boolean; concurrency?: number; settings?: Partial<MuseSettings> }

export const museSettings = (value: Partial<MuseSettings> = {}): MuseSettings => ({
  imageRetryLimit: Math.max(0, Math.min(5, Math.floor(Number(value.imageRetryLimit) || 0))),
  autoLocate: value.autoLocate !== false,
})

export type MuseBatch = {
  entries: Array<{ imagePath: string; lastFramePath?: string; detailImagePaths?: string[]; productId?: string; productName?: string; clone?: MuseJob['clone'] }>
  prompt: string
  durationSec: number
  aspect: string
  accountId?: string
  styleReferenceId?: string
  zoomPercent?: number
  image?: { review: boolean; prompt: string; promptVersionId?: string; promptVersion?: number }
}
type Running = { accountId: string; abort: AbortController; done: Promise<void> }

/**
 * Queue rules:
 * - one job per account, at most `concurrency` in total;
 * - a prompt is sent once. It is sent again only when Muse was certainly not reached, when Muse answered that
 *   the account is out of quota, or when the user retries a failed job;
 * - unclear outcomes wait for a person. Collecting only reads the saved conversation.
 */
export function createMuseJobs(options: {
  path: () => string
  root: () => string
  listAccounts: () => Promise<MuseAccount[]>
  accountBusy: (id: string) => boolean
  onQuota: (accountId: string) => Promise<void>
  /** Re-tests an account after a temporary proxy or network failure. */
  recheck: (accountId: string) => Promise<void>
  run: (accountId: string, context: MuseRunContext) => Promise<MuseVideoResult>
  makeLastFrame: (firstFramePath: string, outputDir: string, zoomPercent: number) => Promise<string>
  /** After a job changed status. */
  onStatus?: (job: MuseJob) => void
  timing?: { tickMs?: number; retryMs?: number; recheckMs?: number }
}) {
  const timing = { tickMs: 5000, retryMs: 20_000, recheckMs: 5 * 60_000, ...options.timing }
  const running = new Map<string, Running>()
  const nextAt = new Map<string, number>()
  const recheckedAt = new Map<string, number>()
  let queue: Promise<unknown> = Promise.resolve()
  let restored: Promise<void> | null = null
  let shuttingDown = false
  let ticking = false
  let tickAgain = false
  let timer: ReturnType<typeof setTimeout> | undefined

  const read = () => readJsonFile<Db>(options.path(), { jobs: [] })
  const mutate = <T>(change: (db: Db) => T): Promise<T> => {
    const run = queue.then(async () => {
      const db = await read()
      const result = change(db)
      await writeJsonFile(options.path(), db)
      return result
    })
    queue = run.catch(() => undefined)
    return run
  }
  const find = (db: Db, id: string) => {
    const job = db.jobs.find((item) => item.id === id)
    if (!job) throw new Error('任务不存在')
    return job
  }
  const addLog = (job: MuseJob, message: string, level: MuseJobLog['level'] = 'info') => {
    job.logs = [...(job.logs ?? []), { id: randomUUID(), level, message, time: Date.now() }].slice(-MAX_LOGS)
  }
  const update = async (id: string, apply: (job: MuseJob) => Partial<MuseJob>, log?: string, level?: MuseJobLog['level']) => {
    const changed = await mutate((db) => {
      const job = find(db, id)
      const before = job.status
      Object.assign(job, apply(job), { updatedAt: Date.now() })
      if (log) addLog(job, log, level)
      return job.status === before ? null : { ...job }
    })
    if (changed) options.onStatus?.(changed)
  }

  /** After a restart: collect what was sent, hold back everything that would send. */
  const restore = () => (restored ??= mutate((db) => {
    for (const job of db.jobs) {
      if (job.status === 'swapping' && job.image?.submitting && !job.image.waiting) {
        addLog(job, '应用重启')
        Object.assign(job, { status: 'image_review', error: '应用退出时正在提交换图，不确定是否已扣费，可重新换图', image: { ...job.image, submitting: false, lastFailed: job.preparedImagePath && job.lastFrameSourcePath ? true : job.image.lastFailed }, updatedAt: Date.now() })
      }
      if (job.status !== 'running') continue
      job.updatedAt = Date.now()
      addLog(job, '应用重启')
      if (!job.submitted) job.status = 'queued'
      else if (job.threadPath) Object.assign(job, { status: 'queued', collect: true, stage: 'collecting' })
      else Object.assign(job, { status: 'needs_review', error: '应用在等待结果时退出，且没有拿到对话地址，请到 Muse 网页查看' })
    }
    if (db.jobs.some((job) => (job.status === 'queued' && !job.collect) || (job.status === 'swapping' && !job.image?.waiting))) db.paused = true
  }))

  function schedule(delay = timing.tickMs) {
    if (shuttingDown) return
    clearTimeout(timer)
    timer = setTimeout(() => void tick(), delay)
    timer.unref?.()
  }

  async function tick() {
    if (shuttingDown) return
    if (ticking) {
      tickAgain = true
      return
    }
    ticking = true
    try {
      do {
        tickAgain = false
        await assign()
      } while (tickAgain && !shuttingDown)
      if ((await read()).jobs.some((job) => job.status === 'queued')) schedule()
    } catch (error) {
      console.error('[muse-creative] queue failed', error instanceof Error ? error.message : error)
      schedule()
    } finally {
      ticking = false
    }
  }

  async function assign() {
    await restore()
    await queue
    const db = await read()
    const waiting = db.jobs
      .filter((job) => job.status === 'queued' && (job.collect || !db.paused) && (nextAt.get(job.id) ?? 0) <= Date.now())
      .sort((a, b) => Number(Boolean(b.collect)) - Number(Boolean(a.collect)) || a.createdAt - b.createdAt || (a.order ?? 0) - (b.order ?? 0))
    if (!waiting.length) return
    const accounts = await options.listAccounts()
    const used = new Set([...running.values()].map((item) => item.accountId))
    for (const job of waiting) {
      if (running.size >= (db.concurrency ?? 2) || shuttingDown) break
      const wanted = job.collect ? job.accountId : job.requestedAccountId
      const account = accounts.find((item) =>
        item.enabled && item.state === 'ready' && !used.has(item.id) && !options.accountBusy(item.id)
        && (!wanted || item.id === wanted)
        && (job.collect || !(Number(item.quotaUntil) > Date.now())))
      if (!account) continue
      const claimed = await mutate((current) => {
        const fresh = current.jobs.find((item) => item.id === job.id)
        if (!fresh || fresh.status !== 'queued' || (current.paused && !fresh.collect)) return null
        Object.assign(fresh, {
          status: 'running',
          accountId: account.id,
          error: undefined,
          updatedAt: Date.now(),
          stage: fresh.collect ? 'collecting' : 'preparing',
          timeline: fresh.collect ? fresh.timeline : { startedAt: Date.now() },
        })
        addLog(fresh, `${fresh.collect ? '开始找回' : '开始处理'}，账号 ${account.name}`)
        return { ...fresh }
      })
      if (!claimed) continue
      used.add(account.id)
      start(claimed, account.id)
    }
    // Temporary failures would otherwise stall the queue until someone clicks "test".
    for (const account of accounts) {
      if (!account.enabled || !['proxy_error', 'error'].includes(account.state) || options.accountBusy(account.id)) continue
      if (Date.now() - Math.max(recheckedAt.get(account.id) ?? 0, account.updatedAt) < timing.recheckMs) continue
      recheckedAt.set(account.id, Date.now())
      void options.recheck(account.id).then(() => schedule(0), () => undefined)
    }
  }

  function start(job: MuseJob, accountId: string) {
    const abort = new AbortController()
    const done = execute(job, accountId, abort.signal)
      .catch((error) => console.error('[muse-creative] job could not be saved', error instanceof Error ? error.message : error))
      .finally(() => {
        running.delete(job.id)
        schedule(0)
      })
    running.set(job.id, { accountId, abort, done })
  }

  async function execute(job: MuseJob, accountId: string, signal: AbortSignal) {
    const collecting = Boolean(job.collect)
    const mark = (values: Partial<MuseJob>, time: 'sentAt' | 'threadAt' | 'videoAt' | undefined, log: string) => update(job.id, (current) => ({
      ...values,
      ...(time ? { timeline: { ...current.timeline, [time]: current.timeline?.[time] ?? Date.now() } } : {}),
    }), log)
    try {
      const firstFrame = job.preparedImagePath || job.imagePath
      const result = await options.run(accountId, {
        prompt: job.sentPrompt,
        outputDir: join(options.root(), job.id),
        signal,
        imagePath: collecting ? undefined : firstFrame,
        lastFramePath: collecting || !job.zoomPercent ? undefined : job.preparedLastFramePath && existsSync(job.preparedLastFramePath) ? job.preparedLastFramePath : await options.makeLastFrame(firstFrame, join(options.root(), job.id), job.zoomPercent),
        detailImagePaths: collecting ? undefined : job.detailImagePaths,
        threadPath: collecting ? job.threadPath : undefined,
        onStage: (stage) => mark(
          stage === 'submitting' ? { stage, submitted: true } : { stage },
          stage === 'generating' ? 'sentAt' : stage === 'downloading' ? 'videoAt' : undefined,
          STAGE_LOG[stage],
        ),
        onThread: (threadPath) => mark({ threadPath }, 'threadAt', '已保存对话地址'),
      })
      await update(job.id, () => ({ status: 'completed', collect: false, error: undefined, result }), '视频已下载', 'success')
    } catch (error) {
      // Left as "running" on purpose: the next start decides from what was already recorded.
      if (shuttingDown) return
      const message = error instanceof Error ? error.message : '任务失败'
      const known = error instanceof MuseGenerateError ? error : null
      if (known?.reason === 'quota') await options.onQuota(accountId)
      await update(job.id, (now) => {
        const review: Partial<MuseJob> = { status: 'needs_review', collect: false, error: message }
        if (error instanceof MuseAccountUnavailable) {
          if (!signal.aborted) {
            nextAt.set(job.id, Date.now() + timing.retryMs)
            return { status: 'queued', error: message }
          }
          return collecting ? { ...review, error: '已停止找回' } : { status: 'cancelled', error: undefined }
        }
        const unsent = !collecting && (known ? known.outcome === 'unsent' : !now.submitted)
        if (unsent) {
          if (signal.aborted) return { status: 'cancelled', submitted: false, error: undefined }
          const attempts = (now.attempts ?? 0) + 1
          nextAt.set(job.id, Date.now() + timing.retryMs)
          return { status: attempts < MAX_UNSENT_ATTEMPTS ? 'queued' : 'failed', submitted: false, attempts, error: message }
        }
        if (known?.outcome !== 'failed' || signal.aborted) return review
        const quotaSwitches = (now.quotaSwitches ?? 0) + (known.reason === 'quota' ? 1 : 0)
        if (known.reason === 'quota' && !collecting && quotaSwitches < MAX_QUOTA_SWITCHES) {
          return { status: 'queued', submitted: false, threadPath: undefined, quotaSwitches, error: message }
        }
        return { status: 'failed', collect: false, quotaSwitches, error: message }
      }, message, 'error')
    }
  }

  return {
    async list(): Promise<MuseQueue> {
      await restore()
      const db = await read()
      return {
        jobs: db.jobs.map(({ logs: _logs, ...job }) => (job.image ? { ...job, image: { ...job.image, state: undefined, lastState: undefined } } : job)).sort((a, b) => b.createdAt - a.createdAt || (a.order ?? 0) - (b.order ?? 0)),
        paused: Boolean(db.paused),
        concurrency: db.concurrency ?? 2,
        settings: museSettings(db.settings),
      }
    },

    async saveSettings(input: Partial<MuseSettings>) {
      return await mutate((db) => (db.settings = museSettings({ ...db.settings, ...input })))
    },

    kick: () => schedule(0),

    async get(id: string) {
      return find(await read(), id)
    },

    patch: update,

    async createBatch(input: MuseBatch) {
      await restore()
      const prompt = String(input.prompt || '').trim()
      if (!prompt) throw new Error('请填写提示词')
      if (prompt.length > 4000) throw new Error('提示词过长')
      const { entries } = input
      if (!entries.length) throw new Error('请选择参考图')
      if (entries.length > MAX_BATCH) throw new Error(`一次最多 ${MAX_BATCH} 条`)
      const sizes = new Map<string, number>()
      for (const path of new Set(entries.flatMap((entry) => [entry.imagePath, ...(entry.lastFramePath ? [entry.lastFramePath] : []), ...(entry.detailImagePaths ?? [])]))) {
        if (!IMAGE_TYPES.has(extname(path).toLowerCase())) throw new Error('参考图只支持 JPG、PNG、WebP')
        const info = await stat(path).catch(() => null)
        if (!info?.isFile() || !info.size) throw new Error('有参考图不存在')
        if (info.size > MAX_IMAGE_BYTES) throw new Error('单张参考图不能超过 40 MB')
        sizes.set(path, info.size)
      }
      for (const entry of entries) {
        const details = entry.detailImagePaths ?? []
        if (details.length > MAX_DETAIL_IMAGES) throw new Error(`商品细节图最多 ${MAX_DETAIL_IMAGES} 张`)
        const total = [entry.imagePath, entry.lastFramePath, ...details].reduce((sum, path) => sum + (path ? sizes.get(path) ?? 0 : 0), 0)
        if (total > MAX_UPLOAD_BYTES) throw new Error('每条视频的图片合计不能超过 100 MB')
      }
      const durationSec = [5, 6, 8, 10].includes(Number(input.durationSec)) ? Number(input.durationSec) : 5
      const aspect = ['9:16', '16:9', '1:1'].includes(input.aspect) ? input.aspect : '9:16'
      const createdAt = Date.now()
      const settings = museSettings((await read()).settings)
      const created: MuseJob[] = []
      for (const [order, entry] of entries.entries()) {
        const source = entry.imagePath
        const id = randomUUID()
        const dir = join(options.root(), id)
        await mkdir(dir, { recursive: true })
        const imagePath = join(dir, `reference${extname(source).toLowerCase()}`)
        await copyFile(source, imagePath)
        const lastFrameSourcePath = entry.lastFramePath && join(dir, `closing-reference${extname(entry.lastFramePath).toLowerCase()}`)
        if (entry.lastFramePath && lastFrameSourcePath) await copyFile(entry.lastFramePath, lastFrameSourcePath)
        const detailImagePaths: string[] = []
        for (const [index, path] of (entry.detailImagePaths ?? []).entries()) {
          const target = join(dir, `detail-${index + 1}${extname(path).toLowerCase()}`)
          await copyFile(path, target)
          detailImagePaths.push(target)
        }
        created.push({
          id,
          order,
          accountId: '',
          requestedAccountId: String(input.accountId || '') || undefined,
          productId: entry.productId,
          productName: entry.productName?.slice(0, 200),
          styleReferenceId: input.styleReferenceId,
          lastFrameSourcePath,
          detailImagePaths: detailImagePaths.length ? detailImagePaths : undefined,
          zoomPercent: input.zoomPercent,
          clone: entry.clone,
          image: input.image && { ...input.image, autoLocate: settings.autoLocate, retryLimit: settings.imageRetryLimit, retryCount: 0, runId: randomUUID() },
          imagePath,
          prompt,
          sentPrompt: buildMusePrompt({ prompt, durationSec, aspect, lastFrame: Boolean(input.zoomPercent), details: detailImagePaths.length }),
          durationSec,
          aspect,
          status: input.image ? 'swapping' : 'queued',
          stage: 'preparing',
          submitted: false,
          logs: [{ id: randomUUID(), level: 'info', message: '任务已创建', time: createdAt }],
          createdAt,
          updatedAt: createdAt,
        })
      }
      await mutate((db) => { db.jobs.push(...created) })
      schedule(0)
      return created
    },

    async setPaused(paused: boolean) {
      await restore()
      await mutate((db) => { db.paused = Boolean(paused) })
      if (!paused) schedule(0)
    },

    async setConcurrency(value: number) {
      await mutate((db) => { db.concurrency = Number(value) === 1 ? 1 : 2 })
      schedule(0)
    },

    /** Stops one job. Before sending it is cancelled; afterwards it needs a person. */
    async cancel(id: string) {
      if (!running.has(id)) {
        await update(id, (job) => (job.status === 'swapping' || job.status === 'image_review')
          ? { status: 'cancelled', error: undefined, image: job.image && { ...job.image, runId: randomUUID(), submitting: false, waiting: false } }
          : job.status !== 'queued'
            ? {}
            : { status: job.collect ? 'needs_review' : 'cancelled', collect: false, error: undefined })
      }
      const active = running.get(id)
      active?.abort.abort()
      await active?.done
    },

    async cancelQueued() {
      return await mutate((db) => {
        const jobs = db.jobs.filter((job) => (job.status === 'queued' && !job.collect) || (job.status === 'swapping' && !job.image?.submitting && !job.image?.waiting))
        for (const job of jobs) Object.assign(job, { status: 'cancelled', error: undefined, updatedAt: Date.now() })
        return jobs.length
      })
    },

    /** Sends again, so only for jobs known to have produced nothing. */
    async retry(id: string) {
      await update(id, (job) => {
        if (job.status !== 'failed' && job.status !== 'cancelled') throw new Error('只有失败或已取消的任务可以重试')
        const swap = job.image && !job.preparedImagePath
        // A clone shot waiting for this video gets it after a successful retry too.
        const clone = job.clone?.autoReplace ? { ...job.clone, status: 'waiting' as const, error: undefined } : job.clone
        return { clone, status: swap ? 'swapping' : 'queued', ...(swap ? { image: { ...job.image!, runId: randomUUID(), retryCount: 0, polls: 0, submitting: false, waiting: false, state: undefined, lastState: undefined, lastFailed: undefined } } : {}), stage: 'preparing', submitted: false, collect: false, threadPath: undefined, attempts: 0, quotaSwitches: 0, error: undefined, timeline: undefined }
      }, '手动重试')
      nextAt.delete(id)
      schedule(0)
    },

    async collect(id: string) {
      await update(id, (job) => {
        if (job.status !== 'needs_review') throw new Error('该任务不需要找回')
        if (!job.threadPath) throw new Error('没有保存对话地址，请到 Muse 网页查看')
        return { status: 'queued', stage: 'collecting', collect: true, error: undefined }
      }, '手动找回')
      nextAt.delete(id)
      schedule(0)
    },

    /** The user looked on muse.ai and there is nothing to collect. */
    async dismiss(id: string) {
      await update(id, (job) => {
        if (job.status !== 'needs_review') throw new Error('该任务不需要确认')
        return { status: 'failed', error: '已人工确认没有结果' }
      }, '已人工确认没有结果')
    },

    async remove(id: string) {
      await mutate((db) => {
        const job = find(db, id)
        if (['running', 'queued', 'swapping'].includes(job.status)) throw new Error('请先停止任务')
        db.jobs = db.jobs.filter((item) => item.id !== id)
      })
      await rm(join(options.root(), id), { recursive: true, force: true }).catch(() => undefined)
    },

    activeCount: () => running.size,

    /** Called once at startup: collects interrupted jobs, sends nothing until the user continues. */
    async resume() {
      await restore()
      schedule(0)
      const queued = (await read()).jobs.filter((job) => job.status === 'queued' || job.status === 'swapping')
      return { collecting: queued.filter((job) => job.collect).length, held: queued.filter((job) => !job.collect).length }
    },

    async stopAll() {
      shuttingDown = true
      clearTimeout(timer)
      for (const item of running.values()) item.abort.abort()
      await Promise.all([...running.values()].map((item) => item.done))
      await queue
    },
  }
}
