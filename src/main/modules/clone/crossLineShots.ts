/**
 * Clone shots ⇄ the other production lines (product plan X2 / X7):
 * - list videos that tk创意室 / 图生视频 already made for a clone shot,
 * - swap one of them into the shot,
 * - send a single shot to tk创意室 and swap the result in automatically when it finishes.
 */
import { createHash } from 'node:crypto'
import { closeSync, existsSync, openSync, readSync, statSync } from 'node:fs'
import { Notification } from 'electron'
import { cloneRepo } from './repo'
import { cloneService } from './service'
import { livePhotoRepo } from '../live-photo/repo'
import { onTiktokCreativeTaskChanged, tiktokCreativeStudioRepo } from '../tiktok-creative-studio/repo'
import { tiktokCreativeStudioService } from '../tiktok-creative-studio/service'
import type { TiktokCreativeShotTask, TiktokCreativeTask } from '../tiktok-creative-studio/types'
import { lineage } from '../content-hub/stores'
import { museCreativeStudioService } from '../muse-creative-studio/service'
import type { MuseJob } from '../muse-creative-studio/types'

export type CloneShotAlternative = {
  ref: string
  line: 'creative' | 'muse' | 'livephoto'
  shotId: string
  status: 'ready' | 'running' | 'failed'
  videoPath?: string
  posterPath?: string
  durationSec?: number
  error?: string
  /** tk创意室 will swap this in by itself when it finishes. */
  autoReplace: boolean
  inUse: boolean
  createdAt: number
}

type ProjectLike = {
  id: string
  title?: string
  productId?: string
  storyboardFrames?: Array<{ shotId?: string; imagePath?: string }>
  shotVideoOutputs?: Array<{ shotId: string; videoPath?: string; localPath?: string }>
}

function text(value: unknown) {
  return String(value ?? '').trim()
}

function fileExists(path: unknown) {
  const value = text(path)
  return Boolean(value) && existsSync(value)
}

function currentShotVideo(project: ProjectLike, shotId: string) {
  const output = (project.shotVideoOutputs || []).find((item) => item.shotId === shotId)
  return text(output?.videoPath || output?.localPath)
}

const fingerprintCache = new Map<string, string>()
const FINGERPRINT_CHUNK = 64 * 1024

/**
 * Content identity of a video file. Clone copies swapped-in videos into its own managed folder
 * (always under the same file name), so paths can't tell two videos apart.
 */
export function videoFingerprint(path: unknown) {
  const file = text(path)
  if (!file || !existsSync(file)) return ''
  try {
    const stat = statSync(file)
    const cacheKey = `${file}|${stat.size}|${stat.mtimeMs}`
    const cached = fingerprintCache.get(cacheKey)
    if (cached) return cached
    const fd = openSync(file, 'r')
    const hash = createHash('sha1')
    try {
      const head = Buffer.alloc(Math.min(FINGERPRINT_CHUNK, stat.size))
      readSync(fd, head, 0, head.length, 0)
      hash.update(head)
      if (stat.size > FINGERPRINT_CHUNK) {
        const tail = Buffer.alloc(Math.min(FINGERPRINT_CHUNK, stat.size - FINGERPRINT_CHUNK))
        readSync(fd, tail, 0, tail.length, stat.size - tail.length)
        hash.update(tail)
      }
    } finally {
      closeSync(fd)
    }
    const value = `${stat.size}:${hash.digest('hex')}`
    if (fingerprintCache.size > 500) fingerprintCache.clear()
    fingerprintCache.set(cacheKey, value)
    return value
  } catch {
    return ''
  }
}

function currentShotFingerprint(project: ProjectLike, shotId: string) {
  return videoFingerprint(currentShotVideo(project, shotId))
}

function shotNumber(project: ProjectLike, shotId: string) {
  const index = (project.storyboardFrames || []).findIndex((frame) => text(frame.shotId) === shotId)
  return index >= 0 ? index + 1 : 0
}

async function loadProject(cloneProjectId: string) {
  const project = (await cloneRepo.getProject(text(cloneProjectId))) as ProjectLike | null
  if (!project) throw new Error('复刻项目不存在')
  return project
}

function creativeStatus(shot: TiktokCreativeShotTask): CloneShotAlternative['status'] {
  if (shot.status === 'completed' && fileExists(shot.resultVideoPath)) return 'ready'
  if (shot.status === 'failed' || shot.status === 'requires_manual' || shot.status === 'completed') return 'failed'
  return 'running'
}

/** An unclear Muse result still waits for a person, so it counts as running. */
function museStatus(job: MuseJob): CloneShotAlternative['status'] {
  if (job.status === 'completed') return fileExists(job.result?.videoPath) ? 'ready' : 'failed'
  return job.status === 'failed' ? 'failed' : 'running'
}

export async function listCloneShotAlternatives(input: { cloneProjectId: string }): Promise<CloneShotAlternative[]> {
  const project = await loadProject(input.cloneProjectId)
  const result: CloneShotAlternative[] = []
  const tasks = (await tiktokCreativeStudioRepo.list()).filter((task) => task.sourceCloneProjectId === project.id)
  for (const task of tasks) {
    for (const shot of task.shots) {
      const shotId = text(shot.sourceCloneShotId)
      if (!shotId) continue
      const status = creativeStatus(shot)
      const videoPath = status === 'ready' ? text(shot.resultVideoPath) : undefined
      result.push({
        ref: `creative:${task.id}:${shot.shotId}`,
        line: 'creative',
        shotId,
        status,
        videoPath,
        posterPath: fileExists(shot.posterPath) ? text(shot.posterPath) : undefined,
        durationSec: shot.durationSec,
        error: status === 'failed' ? text(shot.lastError) || undefined : undefined,
        autoReplace: shot.cloneBackfill?.status === 'waiting',
        inUse: Boolean(videoPath) && videoFingerprint(videoPath) === currentShotFingerprint(project, shotId),
        createdAt: shot.createdAt || task.createdAt,
      })
    }
  }
  for (const job of (await museCreativeStudioService.listJobs()).jobs) {
    if (job.clone?.projectId !== project.id || job.status === 'cancelled') continue
    const status = museStatus(job)
    const videoPath = status === 'ready' ? text(job.result?.videoPath) : undefined
    result.push({
      ref: `muse:${job.id}`,
      line: 'muse',
      shotId: job.clone.shotId,
      status,
      videoPath,
      posterPath: fileExists(job.posterPath) ? text(job.posterPath) : undefined,
      durationSec: job.result ? Math.round(job.result.durationSec) : job.durationSec,
      error: status === 'failed' ? job.error : undefined,
      autoReplace: job.clone.status === 'waiting',
      inUse: Boolean(videoPath) && videoFingerprint(videoPath) === currentShotFingerprint(project, job.clone.shotId),
      createdAt: job.createdAt,
    })
  }
  const livePhotos = (await livePhotoRepo.list()).filter((item) => item.sourceProjectId === project.id && text(item.sourceShotId))
  for (const item of livePhotos) {
    const shotId = text(item.sourceShotId)
    const video = [item.motionVideoPath, item.livePhotoVideoPath].map(text).find((path) => path && existsSync(path))
    const status: CloneShotAlternative['status'] = video ? 'ready' : item.packagingStatus === 'failed' ? 'failed' : 'running'
    result.push({
      ref: `livephoto:${item.id}`,
      line: 'livephoto',
      shotId,
      status,
      videoPath: video,
      posterPath: [item.livePhotoImagePath, item.generatedStillPath].map(text).find((path) => path && existsSync(path)),
      error: status === 'failed' ? text((item as { lastError?: string }).lastError) || undefined : undefined,
      autoReplace: false,
      inUse: Boolean(video) && videoFingerprint(video) === currentShotFingerprint(project, shotId),
      createdAt: item.createdAt,
    })
  }
  return result.sort((a, b) => b.createdAt - a.createdAt)
}

export async function useCloneShotAlternative(input: { cloneProjectId: string; shotId: string; ref: string }) {
  const project = await loadProject(input.cloneProjectId)
  const shotId = text(input.shotId)
  const candidate = (await listCloneShotAlternatives({ cloneProjectId: project.id })).find((item) => item.ref === text(input.ref) && item.shotId === shotId)
  if (!candidate) throw new Error('找不到这个镜头的可用结果')
  if (candidate.status !== 'ready' || !candidate.videoPath) throw new Error('这个结果还没有生成完成')
  const replaced = await cloneService.replaceShotVideoForProject({ cloneProjectId: project.id, shotId, videoPath: candidate.videoPath })
  await lineage.record({ fromRef: candidate.ref, toRef: `clone:${project.id}`, relation: 'derived_from', productId: text(project.productId) || undefined, meta: { shotId, use: 'shot_video' } }).catch(() => null)
  return replaced
}

export async function sendCloneShotToCreative(input: { cloneProjectId: string; shotId: string }) {
  const project = await loadProject(input.cloneProjectId)
  const shotId = text(input.shotId)
  const productId = text(project.productId)
  if (!productId) throw new Error('这个复刻项目还没有绑定商品，绑定后才能交给 tk创意室')
  const frame = (project.storyboardFrames || []).find((item) => text(item.shotId) === shotId)
  if (!frame || !fileExists(frame.imagePath)) throw new Error('这个镜头还没有分镜图，请先完成分镜设计')
  const existing = (await listCloneShotAlternatives({ cloneProjectId: project.id })).find((item) => item.line === 'creative' && item.shotId === shotId && item.status === 'running')
  if (existing) throw new Error('这个镜头已经在 tk创意室出片中')

  const created = await tiktokCreativeStudioService.createFromReference({ referenceImagePaths: [text(frame.imagePath)], productId })
  const task = await tiktokCreativeStudioRepo.get(created.id)
  if (!task) throw new Error('tk创意室任务创建失败')
  const timestamp = Date.now()
  const saved = await tiktokCreativeStudioRepo.upsert({
    ...task,
    sourceCloneProjectId: project.id,
    sourceCloneProjectTitle: text(project.title) || task.sourceCloneProjectTitle,
    shots: task.shots.map((shot) => ({
      ...shot,
      sourceCloneShotId: shotId,
      cloneBackfill: { baselineFingerprint: currentShotFingerprint(project, shotId) || undefined, status: 'waiting', updatedAt: timestamp },
    })),
  })
  for (const shot of saved.shots) {
    await lineage.record({ fromRef: `clone:${project.id}`, toRef: `creative:${saved.id}:${shot.shotId}`, relation: 'sent_to', productId, meta: { shotId } }).catch(() => null)
  }
  return { taskId: saved.id }
}

/** One shot (swapped in when finished) or, without shotIds, every frame of the project (kept as options). */
export async function sendCloneShotsToMuse(input: { cloneProjectId: string; shotIds?: string[]; autoReplace?: boolean }) {
  const project = await loadProject(input.cloneProjectId)
  const productId = text(project.productId)
  if (!productId) throw new Error('这个复刻项目还没有绑定商品，绑定后才能交给 Muse创意室')
  if (!(await museCreativeStudioService.list()).accounts.some((account) => account.enabled)) throw new Error('还没有启用的 Muse 账号')
  const wanted = new Set((input.shotIds || []).map(text))
  const frames = (project.storyboardFrames || []).filter((frame) => text(frame.shotId) && fileExists(frame.imagePath) && (!wanted.size || wanted.has(text(frame.shotId))))
  if (!frames.length) throw new Error('这个镜头还没有分镜图，请先完成分镜设计')
  const busy = (await listCloneShotAlternatives({ cloneProjectId: project.id })).filter((item) => item.line === 'muse' && item.status === 'running').map((item) => item.shotId)
  const free = frames.filter((frame) => !busy.includes(text(frame.shotId)))
  if (!free.length) throw new Error('这个镜头已经在 Muse创意室出片中')
  const jobs = await museCreativeStudioService.createFromClone({
    projectId: project.id,
    productId,
    frames: free.map((frame) => ({
      imagePath: text(frame.imagePath),
      shotId: text(frame.shotId),
      autoReplace: Boolean(input.autoReplace),
      baseline: currentShotFingerprint(project, text(frame.shotId)),
    })),
  })
  for (const job of jobs) await lineage.record({ fromRef: `clone:${project.id}`, toRef: `muse:${job.id}`, relation: 'sent_to', productId, meta: { shotId: job.clone?.shotId } }).catch(() => null)
  return { jobIds: jobs.map((job) => job.id) }
}

/** Swaps a finished Muse video into its clone shot. Safe to call repeatedly. */
export async function runMuseShotBackfill(job: MuseJob) {
  const link = job.clone
  if (link?.status !== 'waiting') return false
  const status = museStatus(job)
  const key = `muse:${job.id}`
  if ((status === 'running' && job.status !== 'cancelled') || backfillInFlight.has(key)) return false
  backfillInFlight.add(key)
  try {
    const set = (next: 'done' | 'skipped' | 'failed', error?: string) => museCreativeStudioService.patchClone(job.id, { status: next, error })
    if (job.status === 'cancelled') { await set('skipped', '任务已取消'); return false }
    if (status === 'failed') { await set('failed', job.error || 'Muse 出片失败'); return false }
    const project = (await cloneRepo.getProject(link.projectId)) as ProjectLike | null
    if (!project) { await set('skipped', '复刻项目已删除'); return false }
    const label = `「${text(project.title) || '复刻项目'}」镜头 ${shotNumber(project, link.shotId) || '?'}`
    if (text(link.baseline) !== currentShotFingerprint(project, link.shotId)) {
      await set('skipped', '镜头视频已被手动更换')
      notify('Muse创意室出片完成', `${label} 已有新视频，未自动替换，可在替换视频里选用`)
      return false
    }
    try {
      await cloneService.replaceShotVideoForProject({ cloneProjectId: project.id, shotId: link.shotId, videoPath: text(job.result?.videoPath) })
    } catch (error) {
      await set('failed', error instanceof Error ? error.message : String(error))
      return false
    }
    await set('done')
    await lineage.record({ fromRef: key, toRef: `clone:${project.id}`, relation: 'derived_from', productId: text(project.productId) || undefined, meta: { shotId: link.shotId, use: 'shot_video' } }).catch(() => null)
    notify('Muse创意室出片完成', `已换上${label}，可以重新合成成片`)
    return true
  } finally {
    backfillInFlight.delete(key)
  }
}

/** Sends every storyboard frame of a project to tk创意室 (no auto-swap; results show up under 替换视频). */
export async function sendCloneProjectToCreative(input: { cloneProjectId: string }) {
  const project = await loadProject(input.cloneProjectId)
  const productId = text(project.productId)
  if (!productId) throw new Error('这个复刻项目还没有绑定商品，绑定后才能交给 tk创意室')
  const frames = (project.storyboardFrames || []).filter((frame) => text(frame.shotId) && fileExists(frame.imagePath))
  if (!frames.length) throw new Error('这个复刻项目还没有分镜图，请先完成分镜设计')
  const created = await tiktokCreativeStudioService.createFromReference({ referenceImagePaths: frames.map((frame) => text(frame.imagePath)), productId })
  await tagCreativeTaskWithCloneShots(created.id, project.id, frames.map((frame) => text(frame.shotId)), project.title)
  await lineage.record({ fromRef: `clone:${project.id}`, toRef: `creative:${created.id}`, relation: 'sent_to', productId }).catch(() => null)
  return { taskId: created.id, shotCount: frames.length }
}

/** Tags tk创意室 shots made from clone frames (one shot per frame, same order) with their clone shot ids. */
export async function tagCreativeTaskWithCloneShots(taskId: string, cloneProjectId: string, cloneShotIds: string[], title?: string) {
  const task = await tiktokCreativeStudioRepo.get(taskId)
  if (!task) return
  await tiktokCreativeStudioRepo.upsert({
    ...task,
    sourceCloneProjectId: cloneProjectId,
    sourceCloneProjectTitle: text(title) || task.sourceCloneProjectTitle,
    shots: task.shots.map((shot) => ({ ...shot, sourceCloneShotId: shot.sourceCloneShotId || cloneShotIds[shot.shotIndex] || undefined })),
  })
}

function notify(title: string, body: string) {
  try {
    if (Notification.isSupported()) new Notification({ title, body }).show()
  } catch {
    // best effort
  }
}

const backfillInFlight = new Set<string>()

async function patchBackfill(taskId: string, shotKey: string, patch: Partial<NonNullable<TiktokCreativeShotTask['cloneBackfill']>>) {
  const task = await tiktokCreativeStudioRepo.get(taskId)
  if (!task) return
  await tiktokCreativeStudioRepo.upsert({
    ...task,
    shots: task.shots.map((shot) => shot.shotId === shotKey && shot.cloneBackfill
      ? { ...shot, cloneBackfill: { ...shot.cloneBackfill, ...patch, updatedAt: Date.now() } }
      : shot),
  })
}

/** Swaps finished tk创意室 videos into their clone shots. Safe to call repeatedly. */
export async function runCloneShotBackfill(task: TiktokCreativeTask) {
  if (!task.sourceCloneProjectId) return 0
  let swapped = 0
  for (const shot of task.shots) {
    if (shot.cloneBackfill?.status !== 'waiting' || !shot.sourceCloneShotId) continue
    const status = creativeStatus(shot)
    if (status === 'running') continue
    const key = `${task.id}:${shot.shotId}`
    if (backfillInFlight.has(key)) continue
    backfillInFlight.add(key)
    try {
      if (status === 'failed') {
        await patchBackfill(task.id, shot.shotId, { status: 'failed', error: text(shot.lastError) || 'tk创意室出片失败' })
        continue
      }
      const project = (await cloneRepo.getProject(task.sourceCloneProjectId)) as ProjectLike | null
      if (!project) {
        await patchBackfill(task.id, shot.shotId, { status: 'skipped', error: '复刻项目已删除' })
        continue
      }
      const label = `镜头 ${shotNumber(project, shot.sourceCloneShotId) || '?'}`
      // The user swapped this shot by hand after sending it: keep their choice, leave ours as an option.
      if (text(shot.cloneBackfill.baselineFingerprint) !== currentShotFingerprint(project, shot.sourceCloneShotId)) {
        await patchBackfill(task.id, shot.shotId, { status: 'skipped', error: '镜头视频已被手动更换' })
        notify('tk创意室出片完成', `「${text(project.title) || '复刻项目'}」${label} 已有新视频，未自动替换，可在替换视频里选用`)
        continue
      }
      try {
        await cloneService.replaceShotVideoForProject({ cloneProjectId: project.id, shotId: shot.sourceCloneShotId, videoPath: text(shot.resultVideoPath) })
        await patchBackfill(task.id, shot.shotId, { status: 'done', error: undefined })
        await lineage.record({ fromRef: `creative:${task.id}:${shot.shotId}`, toRef: `clone:${project.id}`, relation: 'derived_from', productId: text(project.productId) || undefined, meta: { shotId: shot.sourceCloneShotId, use: 'shot_video' } }).catch(() => null)
        notify('tk创意室出片完成', `已换上「${text(project.title) || '复刻项目'}」${label}，可以重新合成成片`)
        swapped += 1
      } catch (error) {
        await patchBackfill(task.id, shot.shotId, { status: 'failed', error: error instanceof Error ? error.message : String(error) })
      }
    } finally {
      backfillInFlight.delete(key)
    }
  }
  return swapped
}

export async function sweepCloneShotBackfills() {
  let swapped = 0
  for (const task of await tiktokCreativeStudioRepo.list()) {
    if (task.shots.some((shot) => shot.cloneBackfill?.status === 'waiting')) swapped += await runCloneShotBackfill(task)
  }
  for (const job of (await museCreativeStudioService.listJobs()).jobs) if (await runMuseShotBackfill(job)) swapped += 1
  return swapped
}

let started = false
export function startCloneShotBackfillWatcher() {
  if (started) return
  started = true
  onTiktokCreativeTaskChanged((taskId) => {
    void tiktokCreativeStudioRepo.get(taskId).then((task) => (task ? runCloneShotBackfill(task) : 0)).catch((error) => {
      console.warn('[clone] shot backfill failed', error)
    })
  })
  museCreativeStudioService.onJobStatus((job) => void runMuseShotBackfill(job).catch((error) => console.warn('[clone] Muse backfill failed', error)))
  // Finishes that happened while the app was closed.
  setTimeout(() => void sweepCloneShotBackfills().catch(() => undefined), 15_000)
}
