import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { normalizeLivePhotoReplacementRegion } from '../live-photo/replacementRegion'
import type { MuseImage, MuseJob, MuseQueue, MuseRegion } from './types'

const MAX_POLLS = 360
const MAX_ACTIVE = 2

export type MusePrepareImage = (input: {
  workflowId: string
  referenceImagePath: string
  productId: string
  outputRoot: string
  state?: Record<string, unknown>
  promptVersion: { id: string; version: number; prompt: string }
  autoLocate: boolean
}) => Promise<{ pending: boolean; preparedImagePath?: string; failed?: boolean; error?: string; state: Record<string, unknown> }>

/** `[code] detail` → the detail in Chinese where it is a known case. */
export function friendlyImageError(error: unknown) {
  const text = error instanceof Error ? error.message : String(error || '换图失败')
  if (/replacement_region_required|locate_failed/.test(text)) return '没能自动找到要替换的商品位置，请手动框选区域'
  if (/structured product reference|authoritative/i.test(text)) return '这个商品还没有可用的参考图，请先在商品库生成或指定'
  if (/Selected product does not exist/i.test(text)) return '商品不存在'
  return text.replace(/^\[[\w-]+\]\s*/, '').slice(0, 300)
}

/**
 * Product swap before a job reaches Muse. Each submission is paid, so one is only made when the queue is not
 * paused, and a submission cut off by a restart is never repeated without the user.
 */
export function createMuseImages(options: {
  queue: () => Promise<MuseQueue>
  get: (id: string) => Promise<MuseJob>
  patch: (id: string, apply: (job: MuseJob) => Partial<MuseJob>, log?: string, level?: 'info' | 'success' | 'error') => Promise<void>
  root: () => string
  prepare: MusePrepareImage
  onQueued: () => void
  timing?: { tickMs?: number; pollMs?: number }
}) {
  const timing = { tickMs: 2000, pollMs: 10_000, ...options.timing }
  const active = new Set<string>()
  const dueAt = new Map<string, number>()
  let timer: ReturnType<typeof setTimeout> | undefined
  let stopped = false
  let ticking = false

  function schedule(delay = timing.tickMs) {
    if (stopped) return
    clearTimeout(timer)
    timer = setTimeout(() => void tick(), delay)
    timer.unref?.()
  }

  async function tick() {
    if (stopped || ticking) return
    ticking = true
    try {
      const { jobs, paused } = await options.queue()
      const swapping = jobs.filter((job) => job.status === 'swapping').sort((a, b) => a.createdAt - b.createdAt || (a.order ?? 0) - (b.order ?? 0))
      for (const job of swapping) {
        if (active.size >= MAX_ACTIVE) break
        if (active.has(job.id) || (dueAt.get(job.id) ?? 0) > Date.now()) continue
        if (paused && !job.image?.waiting) continue
        active.add(job.id)
        void step(job.id)
          .catch((error) => console.error('[muse-creative] image step failed', error instanceof Error ? error.message : error))
          .finally(() => {
            active.delete(job.id)
            schedule(0)
          })
      }
      if (swapping.length) schedule()
    } catch (error) {
      console.error('[muse-creative] image queue failed', error instanceof Error ? error.message : error)
      schedule()
    } finally {
      ticking = false
    }
  }

  async function step(id: string) {
    const job = await options.get(id)
    const runId = job.image?.runId
    if (job.status !== 'swapping' || !job.image || !runId) return
    const { image } = job
    // Style reference with a closing frame: the opening frame is swapped first, then this one.
    const closing = Boolean(job.preparedImagePath && job.lastFrameSourcePath)
    const stateOf = (value: MuseImage) => (closing ? value.lastState : value.state)
    const withState = (state: Record<string, unknown> | undefined) => (closing ? { lastState: state } : { state })
    const label = closing ? '尾帧换图' : '换图'
    // Stopped or restarted meanwhile: the answer belongs to an older run and is dropped.
    const finish = (apply: (current: MuseJob) => Partial<MuseJob>, log?: string, level?: 'info' | 'success' | 'error') =>
      options.get(id).then(async (current) => {
        if (current.status !== 'swapping' || current.image?.runId !== runId) return false
        await options.patch(id, apply, log, level)
        return true
      })
    /** Ends the swap without a picture. A missing closing frame does not stop the job: the opening frame is zoomed instead. */
    const giveUp = async (message: string, state: Record<string, unknown> | undefined) => {
      const error = closing ? `${message}，将用首帧放大作为尾帧` : message
      const toQueue = closing && !image.review
      const moved = await finish((current) => ({
        status: toQueue ? 'queued' : 'image_review',
        stage: 'preparing',
        error,
        image: { ...current.image!, ...withState(state), submitting: false, waiting: false, ...(closing ? { lastFailed: true } : {}) },
      }), error, 'error')
      if (moved && toQueue) options.onQueued()
    }
    if (!image.waiting) await finish((current) => ({ image: { ...current.image!, submitting: true } }), `提交${label}`)
    try {
      const result = await options.prepare({
        workflowId: `${id}-${runId.slice(0, 8)}${closing ? '-last' : ''}`,
        referenceImagePath: closing ? job.lastFrameSourcePath! : job.imagePath,
        productId: job.productId || '',
        outputRoot: join(options.root(), id, closing ? 'last-image' : 'image'),
        state: stateOf(image),
        promptVersion: { id: image.promptVersionId || 'muse-image', version: image.promptVersion || 1, prompt: image.prompt },
        autoLocate: image.autoLocate,
      })
      if (result.failed) throw new Error(result.error || '换图失败')
      if (result.pending || !result.preparedImagePath) {
        const polls = (image.polls ?? 0) + 1
        dueAt.set(id, Date.now() + timing.pollMs)
        if (polls >= MAX_POLLS) {
          await giveUp(`${label}一直没有结果`, result.state)
          return
        }
        await finish((current) => ({ image: { ...current.image!, ...withState(result.state), submitting: false, waiting: true, polls } }))
        return
      }
      if (!existsSync(result.preparedImagePath)) throw new Error('换图文件不存在')
      const region = result.state.replacementRegion as MuseRegion | undefined
      const more = !closing && needsClosing(job)
      const moved = await finish((current) => ({
        status: more ? 'swapping' : current.image!.review ? 'image_review' : 'queued',
        stage: 'preparing',
        ...(closing ? { preparedLastFramePath: result.preparedImagePath } : { preparedImagePath: result.preparedImagePath }),
        error: undefined,
        image: { ...current.image!, ...withState(result.state), ...(closing ? { lastRegion: region, lastFailed: undefined } : { region }), retryCount: 0, submitting: false, waiting: false, polls: 0, attempts: (current.image!.attempts ?? 0) + 1 },
      }), image.review && !more ? `${label}完成，等待确认` : `${label}完成`, 'success')
      if (moved && !more && !image.review) options.onQueued()
    } catch (error) {
      const message = friendlyImageError(error)
      const needsRegion = /replacement_region_required|locate_failed/.test(String(error instanceof Error ? error.message : error))
      const retryCount = image.retryCount + 1
      // A failed poll keeps the paid task and only asks again later.
      const keepTask = Boolean(image.waiting)
      const again = !needsRegion && retryCount <= image.retryLimit
      dueAt.set(id, Date.now() + timing.pollMs)
      if (!again) {
        await giveUp(closing ? `尾帧换图失败：${message}` : message, clearTask(stateOf(image)))
        return
      }
      await finish((current) => ({
        error: message,
        image: { ...current.image!, submitting: false, waiting: keepTask, retryCount },
      }), `${label}失败：${message}`, 'error')
    }
  }

  const needsClosing = (job: MuseJob) => Boolean(job.lastFrameSourcePath && !job.preparedLastFramePath && !job.image?.lastFailed)

  function clearTask(state: Record<string, unknown> = {}) {
    const { productSnapshot, replacementRegion, sceneInteraction, generationAttempts } = state
    return { productSnapshot, replacementRegion, sceneInteraction, generationAttempts }
  }

  return {
    start: () => schedule(0),
    stop() {
      stopped = true
      clearTimeout(timer)
    },

    /** The user accepted the swapped picture: hand the job to the Muse queue. */
    async approve(ids: string[]) {
      let done = 0
      for (const id of ids) {
        const job = await options.get(id)
        if (job.status !== 'image_review' || !job.preparedImagePath || !existsSync(job.preparedImagePath)) continue
        await options.patch(id, (current) => (current.status === 'image_review' ? { status: 'queued', stage: 'preparing', error: undefined } : {}), '换图已确认')
        done += 1
      }
      if (!done) throw new Error('没有可以确认的换图')
      options.onQueued()
      return { done }
    },

    /** Paid: submits a new swap, optionally for a region drawn by the user. */
    async redo(input: { id: string; region?: { x: number; y: number; width: number; height: number }; closing?: boolean }) {
      const job = await options.get(input.id)
      if (job.status !== 'image_review' || !job.image) throw new Error('只有待确认的换图可以重做')
      const closing = Boolean(input.closing)
      if (closing && (!job.lastFrameSourcePath || !job.preparedImagePath)) throw new Error('没有可以重做的尾帧')
      const state = clearTask(closing ? job.image.lastState : job.image.state)
      if (input.region) {
        const previous = state.replacementRegion as { revision?: number } | undefined
        const revision = Math.max(1, Number(previous?.revision || 0) + 1)
        const region = normalizeLivePhotoReplacementRegion({ ...input.region, source: 'manual', revision, updatedAt: Date.now() })
        if (!region) throw new Error('框选区域无效')
        state.replacementRegion = region
        // Without it the shared workflow would locate the product again and discard the drawn region.
        state.sceneInteraction = state.sceneInteraction ?? { mode: 'unknown', confidence: 0, revision, updatedAt: Date.now() }
      }
      await options.patch(input.id, (current) => (current.status !== 'image_review' ? {} : {
        status: 'swapping',
        error: undefined,
        ...(closing ? { preparedLastFramePath: undefined } : { preparedImagePath: undefined }),
        image: { ...current.image!, runId: randomUUID(), ...(closing ? { lastState: state, lastRegion: state.replacementRegion as MuseRegion | undefined, lastFailed: undefined } : { state, region: state.replacementRegion as MuseRegion | undefined }), retryCount: 0, polls: 0, submitting: false, waiting: false },
      }), input.region ? '按框选区域重新换图' : '重新换图')
      dueAt.delete(input.id)
      schedule(0)
    },
  }
}
