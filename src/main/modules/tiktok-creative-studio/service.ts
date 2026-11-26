import { randomUUID } from 'node:crypto'
import { copyFile, mkdir, rename, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import PQueue from 'p-queue'
import { getAppPaths } from '../../lib/paths'
import { onTiktokCreativeTaskChanged, tiktokCreativeStudioRepo } from './repo'
import { tiktokCreativeAccounts } from './accounts'
import { TiktokOfficialClient } from './officialClient'
import { prepareReferenceImageForExternalWorkflow } from '../live-photo/service'
import { hashLivePhotoPrompt } from '../live-photo/promptVersions'
import { normalizeLivePhotoReplacementRegion } from '../live-photo/replacementRegion'
import { productsRepo } from '../products/repo'
import { isImageReplacementPrompt, tiktokCreativePromptVersions } from './promptVersions'
import type { TiktokCreativePromptVersion } from './promptVersions'
import { createBatchSubtitleJob, runBatchSubtitleJob } from '../web-platform/batchSubtitle'
import { webPlatformRepo } from '../web-platform/repo'
import {
  isTiktokOfficialTaskResultPendingError,
  resolveTiktokImageRetryFailure,
  resolveTiktokOfficialTaskPollDelay,
} from './retryPolicy'
import { runFfmpeg } from '../ffmpeg/runner'
import { probeMedia } from '../ffmpeg/probe'
import type { TiktokCreativeAccount, TiktokCreativeShotTask, TiktokCreativeTask, TiktokCreativeTaskLog } from './types'
import { createTiktokZoomedLastFrame } from './imageAspect'
import { buildStyleReferenceMotionPrompt, styleReferenceService } from '../style-reference/service'

// Keep paid image retries bounded. The limit counts automatic retries after
// the initial image generation attempt.
const TIKTOK_IMAGE_RETRY_LIMIT = 2
async function getTiktokImageRetryLimit() {
  const plugin = await webPlatformRepo.ensurePluginRecord('desktop-tiktok-creative-studio', 'tiktok-creative-studio')
  const value = Number((plugin.config || {}).imageRetryLimit)
  return Number.isFinite(value) ? Math.max(0, Math.min(20, Math.floor(value))) : TIKTOK_IMAGE_RETRY_LIMIT
}

async function getTiktokQualityCheckerEnabled() {
  const plugin = await webPlatformRepo.ensurePluginRecord('desktop-tiktok-creative-studio', 'tiktok-creative-studio')
  return plugin.config?.qualityCheckerEnabled !== false
}

function normalizeTiktokImageRetryLimit(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(0, Math.min(20, Math.floor(parsed))) : TIKTOK_IMAGE_RETRY_LIMIT
}

function now() {
  return Date.now()
}

function buildLog(message: string, level: TiktokCreativeTaskLog['level'] = 'info'): TiktokCreativeTaskLog {
  return {
    id: randomUUID(),
    level,
    message,
    time: now(),
  }
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message || fallback
  const text = String(error ?? '').trim()
  return text || fallback
}

function resolveGeneratedImagePath(shot: TiktokCreativeShotTask) {
  const attemptPaths = [...(shot.imagePreparation?.generationAttempts || [])]
    .reverse()
    .map((attempt) => String(attempt?.outputPath || '').trim())
  return [shot.preparedImagePath, shot.imagePreparation?.generatedStillPath, ...attemptPaths]
    .map((value) => String(value || '').trim())
    .find((value) => value && existsSync(value))
}

function withResolvedImagePaths(task: TiktokCreativeTask): TiktokCreativeTask {
  return {
    ...task,
    shots: task.shots.map((shot): TiktokCreativeShotTask => {
      const generatedImagePath = resolveGeneratedImagePath(shot)
      return {
        ...shot,
        preparedImagePath: generatedImagePath,
        imagePreparation: shot.imagePreparation
          ? {
              ...shot.imagePreparation,
              generatedStillPath: generatedImagePath,
            }
          : undefined,
      }
    }),
  }
}

function summarizeTaskForList(task: TiktokCreativeTask): TiktokCreativeTask {
  return {
    ...task,
    logs: [],
    shots: task.shots.map((shot) => {
      const preparation = shot.imagePreparation as (Record<string, any> & { generationAttempts?: unknown[] }) | undefined
      const { generationAttempts, ...restPreparation } = preparation || {}
      return {
        ...shot,
        logs: [],
        requestTrace: undefined,
        imagePreparation: preparation
          ? {
              ...restPreparation,
              generationAttemptCount: Array.isArray(generationAttempts) ? generationAttempts.length : 0,
            } as TiktokCreativeShotTask['imagePreparation']
          : undefined,
      }
    }),
  }
}

function isAmbiguousCreationError(message: string) {
  return /timeout|timed out|waiting for.*create_generate_task|net::|connection|429|5\d\d/i.test(message)
}

function isLegacyPageCreationFailure(shot: TiktokCreativeShotTask) {
  if (shot.officialTaskId || shot.accountId) return false
  if ((shot.requestTrace || []).some((entry) => entry.stage === 'create')) return false
  const message = String(shot.lastError || '')
  return message.includes('id="video"')
    && message.includes("TikTok's Creative GenAl Terms")
    && /intercepts pointer events/i.test(message)
}

function shotPrompt(base: string, suffix: unknown) {
  const extra = String(suffix || '').trim()
  return extra ? `${base}\n${extra}` : base
}

function resolveOfficialVideoPrompt(prompt: unknown) {
  const value = String(prompt || '').trim()
  if (!value) throw new Error('TikTok video prompt is required')
  if (isImageReplacementPrompt(value)) {
    throw new Error('The selected prompt is an image-replacement template and is not supported by Reference to video. Select a video-motion template.')
  }
  return value
}

// Image preparation and Reference-to-video use different prompt contracts.
// Keep the image prompt independent from the user-configured motion prompt.
async function getTikTokImagePromptVersion() {
  return await tiktokCreativePromptVersions.getActive('image')
}

function summarizeShots(shots: TiktokCreativeShotTask[]) {
  return {
    totalShots: shots.length,
    completedShots: shots.filter((item) => item.status === 'completed').length,
    failedShots: shots.filter((item) => item.status === 'failed').length,
    waitingShots: shots.filter((item) => item.status === 'requires_manual').length,
  }
}

function applyTaskSummary(task: TiktokCreativeTask) {
  const summary = summarizeShots(task.shots || [])
  const status = summary.totalShots > 0 && summary.completedShots === summary.totalShots
    ? 'completed'
    : summary.failedShots > 0 && summary.failedShots + summary.completedShots === summary.totalShots
      ? 'failed'
      : task.shots.some((item) => item.status === 'running')
        ? 'running'
        : task.status
  return {
    ...task,
    ...summary,
    status,
  }
}

async function defaultDownloadDir(taskId: string, shotId: string) {
  const dir = join(getAppPaths().dataDir, 'tiktok-creative-studio', taskId, shotId, 'downloads')
  await mkdir(dir, { recursive: true })
  return dir
}

async function defaultShotRoot(taskId: string, shotId: string) {
  const dir = join(getAppPaths().dataDir, 'tiktok-creative-studio', taskId, shotId)
  await mkdir(dir, { recursive: true })
  return dir
}

async function appendTaskLogs(task: TiktokCreativeTask, logs: TiktokCreativeTaskLog[]) {
  return await tiktokCreativeStudioRepo.upsert(
    applyTaskSummary({
      ...task,
      logs: [...(Array.isArray(task.logs) ? task.logs : []), ...logs].slice(-200),
      updatedAt: now(),
    }),
  )
}

function updateShot(task: TiktokCreativeTask, shotId: string, updater: (shot: TiktokCreativeShotTask) => TiktokCreativeShotTask) {
  return applyTaskSummary({
    ...task,
    shots: task.shots.map((item) => (item.shotId === shotId ? updater(item) : item)),
    updatedAt: now(),
  })
}

const activeShots = new Set<string>()
const queuedShots = new Set<string>()
const scheduledShots = new Map<string, { timer: ReturnType<typeof setTimeout>; dueAt: number }>()
// Chromium persistent contexts are expensive and fragile under concurrent
// startup on Windows. Serialize the complete TikTok workflow instead of
// launching multiple browser processes for a large batch.
const shotProcessingQueue = new PQueue({ concurrency: 1 })
const accountLocks = new Map<string, Promise<void>>()
const DEFAULT_DURATION_SEC = 10
const DEFAULT_GENERATION_MODE = 'reference_to_video' as const

function resolveGenerationMode(value: unknown) {
  return value === 'image_to_video' ? 'image_to_video' as const : DEFAULT_GENERATION_MODE
}

function resolveZoomPercent(value: unknown) {
  const numeric = Number(value)
  return [10, 20, 30, 40, 50, 60, 70, 80].includes(numeric) ? numeric : 20
}

/**
 * Closing frame for image-to-video: the 同款模板 closing frame with the product swapped in
 * when there is one, otherwise a zoomed copy of the opening frame (a plain push-in).
 */
async function resolveClosingFramePath(input: { taskId: string; shotId: string; firstFramePath: string; zoomPercent?: number }) {
  const task = await tiktokCreativeStudioRepo.get(input.taskId)
  const shot = task?.shots.find((item) => item.shotId === input.shotId)
  const templateClosing = String(shot?.lastFramePreparation?.generatedStillPath || '').trim()
  if (shot?.lastFrameReferencePath && !shot.lastFrameFallback && templateClosing && existsSync(templateClosing)) return templateClosing
  return (await createTiktokZoomedLastFrame(input.firstFramePath, await defaultShotRoot(input.taskId, input.shotId), resolveZoomPercent(input.zoomPercent ?? shot?.zoomPercent))).path
}

function taskCreditCost(durationSec: number) {
  return durationSec >= 10 ? 10 : 5
}

function shotKey(taskId: string, shotId: string) {
  return `${taskId}:${shotId}`
}

function scheduleShot(taskId: string, shotId: string, delayMs = 0) {
  const key = shotKey(taskId, shotId)
  const normalizedDelayMs = Math.max(0, Number(delayMs) || 0)
  const dueAt = now() + normalizedDelayMs
  const existing = scheduledShots.get(key)
  if (existing && existing.dueAt <= dueAt) return
  if (existing) clearTimeout(existing.timer)
  const timer = setTimeout(() => {
    scheduledShots.delete(key)
    if (queuedShots.has(key)) return
    queuedShots.add(key)
    console.info('[tiktok-creative] queueScheduled', {
      taskId,
      shotId,
      queueLength: shotProcessingQueue.size,
    })
    void shotProcessingQueue.add(
      async () => {
        try {
          await processReferenceShot(taskId, shotId)
        } finally {
          queuedShots.delete(key)
        }
      },
      { priority: normalizedDelayMs === 0 ? 10 : 0 },
    ).catch(async (error) => {
      queuedShots.delete(key)
      const message = getErrorMessage(error, 'TikTok task queue failed')
      await persistShot(taskId, shotId, (current) => ({
        ...current,
        status: 'failed',
        remoteStatus: 'failed',
        lastError: message,
        updatedAt: now(),
        logs: [...(current.logs || []), buildLog(`[tiktok-creative] ${message}`, 'error')].slice(-200),
      })).catch(() => undefined)
    })
  }, normalizedDelayMs)
  scheduledShots.set(key, { timer, dueAt })
  timer.unref?.()
}

async function persistShot(taskId: string, shotId: string, updater: (shot: TiktokCreativeShotTask) => TiktokCreativeShotTask) {
  const task = await tiktokCreativeStudioRepo.get(taskId)
  if (!task) throw new Error('Task not found')
  return await tiktokCreativeStudioRepo.upsert(updateShot(task, shotId, updater))
}

async function withAccountLock<T>(accountId: string, worker: () => Promise<T>): Promise<T> {
  const previous = accountLocks.get(accountId) || Promise.resolve()
  let release: () => void = () => undefined
  const current = new Promise<void>((resolve) => {
    release = resolve
  })
  const queued = previous.then(() => current)
  accountLocks.set(accountId, queued)
  await previous
  try {
    return await worker()
  } finally {
    release()
    if (accountLocks.get(accountId) === queued) accountLocks.delete(accountId)
  }
}

async function accountClient(account: TiktokCreativeAccount) {
  const cookies = await tiktokCreativeAccounts.getCookies(account.id)
  return new TiktokOfficialClient({ cookies, accountId: account.id })
}

// Recently read credit balances. Avoids re-checking every account (and
// possibly opening its page) before each task creation.
const CREDIT_CACHE_MS = 2 * 60_000
const creditCache = new Map<string, { credit: number; at: number }>()

function rememberCredit(accountId: string, credit: number | undefined) {
  if (credit === undefined) creditCache.delete(accountId)
  else creditCache.set(accountId, { credit, at: now() })
}

function consumeCachedCredit(accountId: string, amount: number) {
  const cached = creditCache.get(accountId)
  if (cached) cached.credit -= amount
}

async function chooseAccount(requiredCredit: number) {
  const accounts = (await tiktokCreativeAccounts.list()).filter((account) => account.enabled)
  if (!accounts.length) throw new Error('No enabled TikTok account is configured')
  const errors: string[] = []
  for (const account of accounts) {
    const cached = creditCache.get(account.id)
    if (cached && now() - cached.at < CREDIT_CACHE_MS) {
      if (cached.credit >= requiredCredit) {
        return { account, client: await accountClient(account), requiredCredit }
      }
      errors.push(`${account.name}: insufficient credit`)
      continue
    }
    const client = await accountClient(account)
    let selected = false
    try {
      const result = await client.queryCredit()
      rememberCredit(account.id, result.authenticated ? result.credit : undefined)
      if (!result.authenticated) {
        await tiktokCreativeAccounts.updateState(account.id, { state: 'expired', lastError: 'Login expired' })
        errors.push(`${account.name}: login expired`)
        continue
      }
      if (result.credit === undefined) {
        await tiktokCreativeAccounts.updateState(account.id, { state: 'error', lastError: 'Credit could not be read' })
        errors.push(`${account.name}: credit could not be read`)
        continue
      }
      if (result.credit < requiredCredit) {
        await tiktokCreativeAccounts.updateState(account.id, { state: 'insufficient_credit', credit: result.credit, lastError: 'Insufficient credit' })
        errors.push(`${account.name}: insufficient credit`)
        continue
      }
      await tiktokCreativeAccounts.updateState(account.id, { state: 'ready', credit: result.credit })
      selected = true
      return { account, client, requiredCredit }
    } catch (error) {
      const message = getErrorMessage(error, 'Account check failed')
      await tiktokCreativeAccounts.updateState(account.id, { state: /login|auth|401|403/i.test(message) ? 'expired' : 'error', lastError: message })
      errors.push(`${account.name}: ${message}`)
    } finally {
      if (!selected) await client.close()
    }
  }
  throw new Error(errors.join('; ') || 'No TikTok account is available')
}

async function downloadResult(input: { taskId: string; shotId: string; client: TiktokOfficialClient; videoUrl: string; posterUrl?: string }) {
  const dir = await defaultDownloadDir(input.taskId, input.shotId)
  const sourceVideoPath = join(dir, 'result.source.mp4')
  const videoPath = join(dir, 'result.mp4')
  await input.client.download(input.videoUrl, sourceVideoPath)
  try {
    const sourceMedia = await probeMedia(sourceVideoPath)
    const canKeepOriginal = sourceMedia.videoCodec === 'h264'
      && Boolean(sourceMedia.width && sourceMedia.height && sourceMedia.durationSec > 0)
    if (canKeepOriginal) {
      // TikTok's MainUrl is the generated master. Keep its original bitrate,
      // resolution, and frame rate instead of introducing a lossy transcode.
      await rename(sourceVideoPath, videoPath)
    } else {
      // Compatibility fallback for an unexpected codec or malformed source.
      await runFfmpeg({
        args: [
          '-y',
          '-i',
          sourceVideoPath,
          '-map',
          '0:v:0',
          '-map',
          '0:a:0?',
          '-c:v',
          'libx264',
          '-preset',
          'medium',
          '-crf',
          '18',
          '-pix_fmt',
          'yuv420p',
          '-c:a',
          'aac',
          '-b:a',
          '192k',
          '-movflags',
          '+faststart',
          videoPath,
        ],
      })
    }
    const media = await probeMedia(videoPath)
    if (media.videoCodec !== 'h264' || !media.width || !media.height || media.durationSec <= 0) {
      throw new Error('Normalized TikTok video failed media validation')
    }
    await rm(sourceVideoPath, { force: true })
  } catch (error) {
    await rm(videoPath, { force: true })
    await rm(sourceVideoPath, { force: true })
    throw error
  }
  let posterPath: string | undefined
  if (input.posterUrl) {
    try {
      posterPath = join(dir, 'poster.jpg')
      await input.client.download(input.posterUrl, posterPath)
    } catch {
      posterPath = undefined
    }
  }
  return { dir, videoPath, posterPath }
}

// ---------------------------------------------------------------------------
// Official task status polling.
//
// All shots waiting on TikTok are tracked in one in-memory registry and checked
// by a single loop. Due shots are grouped per account and checked with one
// client (one warm page at most), instead of every shot creating its own
// client, loading the Creative Studio page and closing it again.
// ---------------------------------------------------------------------------
type OfficialPollEntry = {
  taskId: string
  shotId: string
  accountId: string
  dueAt: number
  authFailures: number
}

const officialPollEntries = new Map<string, OfficialPollEntry>()
const OFFICIAL_POLL_TICK_MS = 5000
const OFFICIAL_POLL_MAX_ATTEMPTS = 180
// Consecutive 401 responses tolerated before the shot is paused for re-login.
const OFFICIAL_POLL_MAX_AUTH_FAILURES = 6
let officialPollTimer: ReturnType<typeof setInterval> | undefined
let officialPollRunning = false

function registerOfficialPoll(taskId: string, shotId: string, accountId: string, delayMs = 0) {
  const key = shotKey(taskId, shotId)
  const dueAt = now() + Math.max(0, delayMs)
  const existing = officialPollEntries.get(key)
  if (existing) {
    existing.accountId = accountId
    existing.dueAt = Math.min(existing.dueAt, dueAt)
  } else {
    officialPollEntries.set(key, { taskId, shotId, accountId, dueAt, authFailures: 0 })
  }
  ensureOfficialPollTimer()
}

function rescheduleOfficialPoll(entry: OfficialPollEntry, delayMs: number) {
  entry.dueAt = now() + Math.max(0, delayMs)
}

function ensureOfficialPollTimer() {
  if (officialPollTimer) return
  officialPollTimer = setInterval(() => { void runOfficialPollTick() }, OFFICIAL_POLL_TICK_MS)
  officialPollTimer.unref?.()
}

function stopOfficialPollTimerIfIdle() {
  if (officialPollEntries.size || !officialPollTimer) return
  clearInterval(officialPollTimer)
  officialPollTimer = undefined
}

async function runOfficialPollTick() {
  if (officialPollRunning) return
  officialPollRunning = true
  try {
    const timestamp = now()
    const due = Array.from(officialPollEntries.values()).filter((entry) => entry.dueAt <= timestamp)
    if (!due.length) return
    const byAccount = new Map<string, OfficialPollEntry[]>()
    for (const entry of due) {
      const group = byAccount.get(entry.accountId) || []
      group.push(entry)
      byAccount.set(entry.accountId, group)
    }
    const accounts = await tiktokCreativeAccounts.list()
    for (const [accountId, entries] of byAccount) {
      const account = accounts.find((item) => item.id === accountId)
      if (!account) {
        for (const entry of entries) {
          officialPollEntries.delete(shotKey(entry.taskId, entry.shotId))
          await failOfficialPoll(entry, 'The account bound to this task no longer exists').catch(() => undefined)
        }
        continue
      }
      await withAccountLock(accountId, async () => {
        const client = await accountClient(account)
        try {
          for (const entry of entries) {
            await pollOneOfficialTask(entry, client).catch(async (error) => {
              await handleOfficialPollError(entry, error).catch(() => undefined)
            })
          }
        } finally {
          await client.close()
        }
      }).catch((error) => {
        console.warn('[tiktok-creative] pollGroupFailed', { accountId, error: getErrorMessage(error, 'poll failed') })
        for (const entry of entries) rescheduleOfficialPoll(entry, 30_000)
      })
    }
  } finally {
    officialPollRunning = false
    stopOfficialPollTimerIfIdle()
  }
}

async function failOfficialPoll(entry: OfficialPollEntry, message: string, status: 'failed' | 'requires_manual' = 'failed', remoteStatus: TiktokCreativeShotTask['remoteStatus'] = 'failed') {
  await persistShot(entry.taskId, entry.shotId, (current) => ({
    ...current,
    status,
    remoteStatus,
    lastError: message,
    remoteStatusUpdatedAt: now(),
    updatedAt: now(),
    logs: [...(current.logs || []), buildLog(`[tiktok-creative] ${message}`, 'error')].slice(-200),
  }))
}

async function handleOfficialPollError(entry: OfficialPollEntry, error: unknown) {
  const key = shotKey(entry.taskId, entry.shotId)
  const message = getErrorMessage(error, 'TikTok task status check failed')
  // Transient network / rate-limit errors: keep the shot and try again later.
  if (isAmbiguousCreationError(message)) {
    const task = await tiktokCreativeStudioRepo.get(entry.taskId)
    const attempts = Number(task?.shots.find((item) => item.shotId === entry.shotId)?.pollAttempts || 0)
    rescheduleOfficialPoll(entry, resolveTiktokOfficialTaskPollDelay(attempts + 1, key))
    return
  }
  officialPollEntries.delete(key)
  const authPaused = /login|cookie|auth|verification|captcha/i.test(message)
  await failOfficialPoll(
    entry,
    message,
    authPaused ? 'requires_manual' : 'failed',
    authPaused ? 'paused_auth' : 'failed',
  )
}

async function pollOneOfficialTask(entry: OfficialPollEntry, client: TiktokOfficialClient) {
  const key = shotKey(entry.taskId, entry.shotId)
  const task = await tiktokCreativeStudioRepo.get(entry.taskId)
  const shot = task?.shots.find((item) => item.shotId === entry.shotId)
  if (!task || !shot || !shot.officialTaskId || shot.status !== 'running') {
    officialPollEntries.delete(key)
    return
  }
  const pollAttempts = Number(shot.pollAttempts || 0)
  if (pollAttempts >= OFFICIAL_POLL_MAX_ATTEMPTS) {
    officialPollEntries.delete(key)
    await persistShot(entry.taskId, entry.shotId, (current) => ({
      ...current,
      status: 'requires_manual',
      remoteStatus: 'paused_error',
      lastError: 'TikTok task is still processing after 30 minutes',
      remoteStatusUpdatedAt: now(),
      updatedAt: now(),
    }))
    return
  }
  const markProcessing = async (trace: TiktokCreativeShotTask['requestTrace']) => {
    await persistShot(entry.taskId, entry.shotId, (current) => ({
      ...current,
      status: 'running',
      remoteStatus: 'processing',
      pollAttempts: Number(current.pollAttempts || 0) + 1,
      requestTrace: [...(current.requestTrace || []), ...(trace || [])].slice(-30),
      lastError: undefined,
      remoteStatusUpdatedAt: now(),
      updatedAt: now(),
    }))
    rescheduleOfficialPoll(entry, resolveTiktokOfficialTaskPollDelay(pollAttempts + 1, key))
  }

  let result: Awaited<ReturnType<TiktokOfficialClient['checkTask']>>
  try {
    result = await client.checkTask(shot.officialTaskId)
  } catch (error) {
    if (!isTiktokOfficialTaskResultPendingError(error)) throw error
    entry.authFailures += 1
    if (entry.authFailures >= OFFICIAL_POLL_MAX_AUTH_FAILURES) {
      officialPollEntries.delete(key)
      await failOfficialPoll(
        entry,
        `TikTok returned 401 for ${entry.authFailures} consecutive status checks; re-import the account cookies and retry`,
        'requires_manual',
        'paused_auth',
      )
      return
    }
    await markProcessing(client.getRequestTrace())
    return
  }
  entry.authFailures = 0

  if (result.completed && result.videoUrl) {
    officialPollEntries.delete(key)
    const downloaded = await downloadResult({ taskId: entry.taskId, shotId: entry.shotId, client, videoUrl: result.videoUrl, posterUrl: result.posterUrl })
    await persistShot(entry.taskId, entry.shotId, (current) => ({
      ...current,
      status: 'completed',
      remoteStatus: 'completed',
      officialVideoId: result.videoId,
      resultVideoPath: downloaded.videoPath,
      posterPath: downloaded.posterPath,
      requestTrace: [...(current.requestTrace || []), ...(result.requestTrace || [])].slice(-30),
      downloadDir: downloaded.dir,
      remoteStatusUpdatedAt: now(),
      updatedAt: now(),
      logs: [...(current.logs || []), buildLog(`[tiktok-creative] video downloaded: ${downloaded.videoPath}`, 'success')].slice(-200),
    }))
    return
  }
  if (result.processing || result.status === 2) {
    await markProcessing(result.requestTrace)
    return
  }
  officialPollEntries.delete(key)
  const reason = String(result.failureReason || '').trim()
  const rawSummary = result.raw === undefined
    ? ''
    : JSON.stringify(result.raw).slice(0, 1600)
  const message = `TikTok task failed with status ${String(result.status ?? 'unknown')}${reason ? `: ${reason}` : ''}`
  await persistShot(entry.taskId, entry.shotId, (current) => ({
    ...current,
    status: 'failed',
    remoteStatus: 'failed',
    lastError: message,
    requestTrace: [...(current.requestTrace || []), ...(result.requestTrace || [])].slice(-30),
    remoteStatusUpdatedAt: now(),
    updatedAt: now(),
    logs: [
      ...(current.logs || []),
      buildLog(`[tiktok-creative] ${message}`, 'error'),
      ...(rawSummary ? [buildLog(`[tiktok-creative] TikTok failure response: ${rawSummary}`, 'error')] : []),
    ].slice(-200),
  }))
}

async function processReferenceShot(taskId: string, shotId: string) {
  const key = shotKey(taskId, shotId)
  if (activeShots.has(key)) return
  activeShots.add(key)
  try {
    const task = await tiktokCreativeStudioRepo.get(taskId)
    const shot = task?.shots.find((item) => item.shotId === shotId)
    if (!task || !shot || shot.status === 'completed') return
    console.info('[tiktok-creative] taskStarted', {
      taskId,
      shotId,
      accountId: shot.accountId || '__unbound__',
      queueLength: shotProcessingQueue.size,
    })
    if (shot.officialTaskId) {
      if (!shot.accountId) throw new Error('Official task binding is incomplete')
      // Status checks run in the shared batched poller, outside this queue.
      registerOfficialPoll(taskId, shotId, shot.accountId, 0)
      return
    }

    const configuredImageRetryLimit = await getTiktokImageRetryLimit()
    const imageRetryLimit = Math.max(0, Math.min(20, Math.floor(Number(shot.imageRetryLimit ?? configuredImageRetryLimit) || 0)))
    const promptVersion = shot.imagePreparation?.replacementPrompt
      ? {
          id: shot.imagePreparation.promptVersionId || 'task-image-prompt',
          version: shot.imagePreparation.promptVersion || 1,
          prompt: shot.imagePreparation.replacementPrompt,
          promptHash: shot.imagePreparation.promptHash || hashLivePhotoPrompt(shot.imagePreparation.replacementPrompt),
          kind: 'image' as const,
          active: false,
          createdAt: now(),
          updatedAt: now(),
        }
      : await getTikTokImagePromptVersion()
    const bypassedImagePath = shot.imageValidationBypassed
      ? [shot.preparedImagePath, shot.imagePreparation?.generatedStillPath, shot.referenceImagePath, shot.imagePath]
          .map((value) => String(value || '').trim())
          .find((value) => value && existsSync(value))
      : undefined
    const qualityCheckerEnabled = await getTiktokQualityCheckerEnabled()
    const prepared = bypassedImagePath
      ? { pending: false, failed: false, error: undefined, preparedImagePath: bypassedImagePath, state: shot.imagePreparation || {} }
      : await prepareReferenceImageForExternalWorkflow({
          workflowId: `${taskId}-${shotId}`,
          referenceImagePath: shot.referenceImagePath || shot.imagePath,
          productId: String(task.productId || '').trim(),
          outputRoot: await defaultShotRoot(taskId, shotId),
          state: shot.imagePreparation,
          promptVersion,
          qualityCheckerEnabled,
        })
    await persistShot(taskId, shotId, (current) => ({
      ...current,
      imagePreparation: prepared.state,
      preparedImagePath: prepared.preparedImagePath || current.preparedImagePath,
      status: 'running',
      updatedAt: now(),
    }))
    if (prepared.failed) {
      const retryCount = Math.max(0, Number(shot.imageRetryCount || 0) || 0)
      const qualityDecision = prepared.state.qualityReport?.decision
      const retryDecision = resolveTiktokImageRetryFailure({ retryCount, retryLimit: imageRetryLimit, retryMode: shot.imageRetryMode, qualityDecision })
      if (retryDecision.shouldRetry) {
        const nextRetryCount = retryDecision.nextRetryCount
        await persistShot(taskId, shotId, (current) => ({
          ...current,
          imagePreparation: {
            ...prepared.state,
            imagePromptPreview: undefined,
            generatedStillPath: undefined,
            qualityReport: undefined,
            imageTaskId: undefined,
            imageTaskProvider: undefined,
            imageTaskModel: undefined,
            imageTaskBaseUrl: undefined,
            imageTaskEndpointStyle: undefined,
          },
          preparedImagePath: undefined,
          imageRetryCount: nextRetryCount,
          imageRetryLimit,
          imageRetryMode: 'auto',
          status: 'running',
          remoteStatus: 'queued',
          lastError: prepared.error,
          updatedAt: now(),
          logs: [
            ...(current.logs || []),
            buildLog(`[tiktok-creative] image quality failed; automatic retry ${nextRetryCount}/${imageRetryLimit}`),
          ].slice(-200),
        }))
        scheduleShot(taskId, shotId, 1000)
        return
      }
      throw new Error(`[image_retry_exhausted] ${prepared.error || 'Reference image quality validation failed'}`)
    }
    if (prepared.pending || !prepared.preparedImagePath) {
      scheduleShot(taskId, shotId, 10000)
      return
    }
    // 同款模板 in image-to-video: swap the product into the template's closing frame too,
    // so the model interpolates between two real frames of the reference.
    if (resolveGenerationMode(shot.mode) === 'image_to_video' && shot.lastFrameReferencePath && !shot.lastFrameFallback) {
      const lastPrepared = await prepareReferenceImageForExternalWorkflow({
        workflowId: `${taskId}-${shotId}-last`,
        referenceImagePath: shot.lastFrameReferencePath,
        productId: String(task.productId || '').trim(),
        outputRoot: join(await defaultShotRoot(taskId, shotId), 'last-frame'),
        state: shot.lastFramePreparation,
        promptVersion,
        qualityCheckerEnabled,
      })
      await persistShot(taskId, shotId, (current) => ({
        ...current,
        lastFramePreparation: lastPrepared.state,
        lastFrameFallback: lastPrepared.failed ? true : current.lastFrameFallback,
        updatedAt: now(),
        logs: lastPrepared.failed
          ? [...(current.logs || []), buildLog(`[tiktok-creative] closing frame swap failed, using zoomed opening frame: ${lastPrepared.error || 'unknown'}`, 'error')].slice(-200)
          : current.logs,
      }))
      if (!lastPrepared.failed && (lastPrepared.pending || !lastPrepared.preparedImagePath)) {
        scheduleShot(taskId, shotId, 10000)
        return
      }
    }
    // Preserve the provider output dimensions. The official API accepts the
    // generated image as returned; downstream video encoding handles framing.
    const preparedImagePath = prepared.preparedImagePath
    await persistShot(taskId, shotId, (current) => ({
      ...current,
      imagePreparation: {
        ...prepared.state,
        generatedStillPath: preparedImagePath,
      },
      preparedImagePath,
      updatedAt: now(),
      logs: current.logs,
    }))

    await withAccountLock('__account_scheduler__', async () => {
      const selected = await chooseAccount(taskCreditCost(shot.durationSec || 5))
      try {
        await withAccountLock(selected.account.id, async () => {
          let created: Awaited<ReturnType<TiktokOfficialClient['createTask']>>
          try {
            const mode = resolveGenerationMode(shot.mode)
            await persistShot(taskId, shotId, (current) => ({ ...current, mode, updatedAt: now() }))
            const lastFramePath = mode === 'image_to_video'
              ? await resolveClosingFramePath({ taskId, shotId, firstFramePath: preparedImagePath, zoomPercent: shot.zoomPercent })
              : undefined
            await persistShot(taskId, shotId, (current) => ({
              ...current,
              mode,
              firstFramePath: preparedImagePath,
              lastFramePath,
              updatedAt: now(),
            }))
            const imagePaths = lastFramePath ? [preparedImagePath, lastFramePath] : [preparedImagePath]
            created = await selected.client.createTask({
              imagePaths,
              mode,
              prompt: resolveOfficialVideoPrompt(shot.prompt),
              durationSec: shot.durationSec || 5,
            })
          } catch (error) {
            const message = getErrorMessage(error, 'Official task creation failed')
            await persistShot(taskId, shotId, (current) => ({
              ...current,
              accountId: selected.account.id,
              requestTrace: [...(current.requestTrace || []), ...selected.client.getRequestTrace()].slice(-30),
              lastError: `[official_create_unconfirmed] ${message}`,
              updatedAt: now(),
            })).catch(() => undefined)
            creditCache.delete(selected.account.id)
            throw new Error(`[official_create_unconfirmed] ${message}`)
          }
          await persistShot(taskId, shotId, (current) => ({
            ...current,
            accountId: selected.account.id,
            officialTaskId: created.taskId,
            officialVideoId: created.videoId,
            requestTrace: created.requestTrace,
            remoteStatus: created.videoUrl ? 'completed' : 'processing',
            remoteStatusUpdatedAt: now(),
            updatedAt: now(),
            logs: [...(current.logs || []), buildLog(`[tiktok-creative] official task created: ${created.taskId}`, 'success')].slice(-200),
          }))
          consumeCachedCredit(selected.account.id, selected.requiredCredit)
          if (created.videoUrl) {
            const downloaded = await downloadResult({ taskId, shotId, client: selected.client, videoUrl: created.videoUrl, posterUrl: created.posterUrl })
            await persistShot(taskId, shotId, (current) => ({
              ...current,
              status: 'completed',
              remoteStatus: 'completed',
              resultVideoPath: downloaded.videoPath,
              posterPath: downloaded.posterPath,
              downloadDir: downloaded.dir,
              updatedAt: now(),
            }))
          } else {
            registerOfficialPoll(taskId, shotId, selected.account.id, 10000)
          }
        })
      } finally {
        await selected.client.close()
      }
    })
  } catch (error) {
    const message = getErrorMessage(error, 'TikTok task failed')
    const authPaused = /login|cookie|auth|verification|captcha/i.test(message)
    const ambiguousCreation = message.includes('[official_create_unconfirmed]') && isAmbiguousCreationError(message)
    const imageRetryExhausted = message.includes('[image_retry_exhausted]')
    await persistShot(taskId, shotId, (current) => ({
      ...current,
      status: authPaused || ambiguousCreation || imageRetryExhausted ? 'requires_manual' : 'failed',
      remoteStatus: authPaused ? 'paused_auth' : ambiguousCreation || imageRetryExhausted ? 'paused_error' : 'failed',
      lastError: message,
      updatedAt: now(),
      logs: [...(current.logs || []), buildLog(`[tiktok-creative] ${message}`, 'error')].slice(-200),
    })).catch(() => undefined)
  } finally {
    activeShots.delete(key)
  }
}

async function syncPendingPromptVersion(_promptVersion: TiktokCreativePromptVersion) {
  const imagePromptVersion = await getTikTokImagePromptVersion()
  const tasks = await tiktokCreativeStudioRepo.list()
  for (const task of tasks) {
    let changed = false
    const shots = task.shots.map((shot) => {
      if (
        shot.sourceType !== 'reference_image'
        || shot.officialTaskId
        || shot.imagePreparation?.qualityReport?.decision === 'pass'
        || Boolean(String(shot.imagePreparation?.replacementPrompt || '').trim())
      ) return shot
      changed = true
      return {
        ...shot,
        imagePreparation: {
          ...shot.imagePreparation,
          promptVersionId: imagePromptVersion.id,
          promptVersion: imagePromptVersion.version,
          promptHash: imagePromptVersion.promptHash,
          replacementPrompt: imagePromptVersion.prompt,
          imagePromptPreview: undefined,
        },
        updatedAt: now(),
      }
    })
    if (changed) await tiktokCreativeStudioRepo.upsert({ ...task, shots, updatedAt: now() })
  }
}

export const tiktokCreativeStudioService = {
  async getSettings() {
    return { imageRetryLimit: await getTiktokImageRetryLimit(), qualityCheckerEnabled: await getTiktokQualityCheckerEnabled() }
  },

  async saveSettings(input: { imageRetryLimit?: number; qualityCheckerEnabled?: boolean }) {
    const plugin = await webPlatformRepo.ensurePluginRecord('desktop-tiktok-creative-studio', 'tiktok-creative-studio')
    const imageRetryLimit = normalizeTiktokImageRetryLimit(input?.imageRetryLimit)
    await webPlatformRepo.upsertPluginRecord({
      ...plugin,
      config: { ...(plugin.config || {}), imageRetryLimit, qualityCheckerEnabled: input.qualityCheckerEnabled !== false },
    })
    return { imageRetryLimit, qualityCheckerEnabled: input.qualityCheckerEnabled !== false }
  },

  async list() {
    const tasks = await tiktokCreativeStudioRepo.list()
    return tasks.map(withResolvedImagePaths)
  },

  // Lightweight rows for the library grid: drops logs, request traces and
  // image attempt history, which make up most of the payload.
  async listSummary(input?: { ids?: string[] }) {
    const ids = Array.isArray(input?.ids) ? input.ids.map((id) => String(id || '').trim()).filter(Boolean) : undefined
    const tasks = ids
      ? (await Promise.all(ids.map((id) => tiktokCreativeStudioRepo.get(id)))).filter((task): task is TiktokCreativeTask => Boolean(task))
      : await tiktokCreativeStudioRepo.list()
    return tasks.map((task) => summarizeTaskForList(withResolvedImagePaths(task)))
  },

  async getTask(id: string) {
    const task = await tiktokCreativeStudioRepo.get(String(id || '').trim())
    return task ? withResolvedImagePaths(task) : null
  },

  subscribeChanges(listener: (taskIds: string[]) => void) {
    let pending = new Set<string>()
    let timer: ReturnType<typeof setTimeout> | undefined
    const unsubscribe = onTiktokCreativeTaskChanged((taskId) => {
      pending.add(taskId)
      if (timer) return
      // Coalesce bursts of writes (several persistShot calls per poll).
      timer = setTimeout(() => {
        timer = undefined
        const taskIds = Array.from(pending)
        pending = new Set()
        listener(taskIds)
      }, 500)
    })
    return () => {
      if (timer) clearTimeout(timer)
      unsubscribe()
    }
  },

  async listAccounts() {
    return { encryptionAvailable: tiktokCreativeAccounts.encryptionAvailable(), accounts: await tiktokCreativeAccounts.list() }
  },

  async listPromptVersions(kind: 'image' | 'video' = 'video') {
    if (kind === 'video') await tiktokCreativePromptVersions.getActive('video')
    return await tiktokCreativePromptVersions.list(kind)
  },

  async createPromptVersion(input: { name: string; prompt: string; kind?: 'image' | 'video' }) {
    return await tiktokCreativePromptVersions.save(input)
  },

  async updatePromptVersion(input: { id: string; name: string; prompt: string; kind?: 'image' | 'video' }) {
    const saved = await tiktokCreativePromptVersions.save(input)
    if (saved.active && saved.kind === 'image') await syncPendingPromptVersion(saved)
    return saved
  },

  async activatePromptVersion(input: { id: string; kind?: 'image' | 'video' }) {
    const activated = await tiktokCreativePromptVersions.activate(input.id, input.kind)
    if (activated.kind === 'image') await syncPendingPromptVersion(activated)
    return activated
  },

  async rollbackPromptVersion(input: { id: string; kind?: 'image' | 'video' }) {
    const activated = await tiktokCreativePromptVersions.rollback(input.id, input.kind)
    if (activated.kind === 'image') await syncPendingPromptVersion(activated)
    return activated
  },

  async importAccount(input: { id?: string; name: string; cookieJson: string }) {
    return await tiktokCreativeAccounts.import(input)
  },

  async updateAccount(input: { id: string; name?: string; enabled?: boolean; priority?: number }) {
    return await tiktokCreativeAccounts.update(input)
  },

  async removeAccount(id: string) {
    return await tiktokCreativeAccounts.remove(String(id || '').trim())
  },

  async testAccount(id: string) {
    const account = (await tiktokCreativeAccounts.list()).find((item) => item.id === String(id || '').trim())
    if (!account) throw new Error('TikTok account does not exist')
    return await withAccountLock(account.id, async () => {
      const client = await accountClient(account)
      try {
        const result = await client.queryCredit()
        rememberCredit(account.id, result.authenticated ? result.credit : undefined)
        const state =!result.authenticated ? 'expired' : result.credit !== undefined && result.credit < 5 ? 'insufficient_credit' : result.credit === undefined ? 'error' : 'ready'
        return await tiktokCreativeAccounts.updateState(account.id, {
          state,
          credit: result.credit,
          lastError: state === 'ready' ? undefined : state === 'expired' ? 'Login expired' : state === 'insufficient_credit' ? 'Insufficient credit' : 'Credit could not be read',
        })
      } finally {
        await client.close()
      }
    })
  },

  async createFromReference(input: { referenceImagePaths: string[]; productId: string; prompt?: string; /** 一键上新：每条视频追加一句不同的拍法（按参考图顺序） */ shotPromptSuffixes?: string[]; promptKind?: 'image' | 'video'; promptVersionId?: string; durationSec?: number; mode?: 'reference_to_video' | 'image_to_video'; zoomPercent?: number; styleReferenceId?: string }) {
    const styleReference = input.styleReferenceId ? await styleReferenceService.get(input.styleReferenceId) : undefined
    if (input.styleReferenceId && !styleReference) throw new Error('同款模板不存在，请重新上传参考视频')
    const referenceImagePaths = styleReference
      ? [styleReference.firstFramePath]
      : Array.from(new Set((Array.isArray(input.referenceImagePaths) ? input.referenceImagePaths : []).map((item) => String(item || '').trim()).filter(Boolean)))
    if (!referenceImagePaths.length) throw new Error('Reference images are required')
    const productId = String(input.productId || '').trim()
    const product = (await productsRepo.list()).find((item) => item.id === productId)
    if (!product) throw new Error('Product does not exist')
    const timestamp = now()
    const imageRetryLimit = await getTiktokImageRetryLimit()
    const promptKind = input.promptKind === 'image' ? 'image' : 'video'
    const videoPromptVersion = await tiktokCreativePromptVersions.getActive('video')
    const activeImagePromptVersion = await getTikTokImagePromptVersion()
    const selectedImagePromptVersion = promptKind === 'image' && input.promptVersionId
      ? (await tiktokCreativePromptVersions.list('image')).find((item) => item.id === input.promptVersionId) || activeImagePromptVersion
      : activeImagePromptVersion
    const promptVersion = videoPromptVersion
    const templatePrompt = String(promptVersion?.prompt || '').trim()
    const imagePrompt = promptKind === 'image'
      ? String(input.prompt || '').trim() || selectedImagePromptVersion.prompt
      : selectedImagePromptVersion.prompt
    const mode = resolveGenerationMode(input.mode)
    const videoPrompt = styleReference
      ? buildStyleReferenceMotionPrompt({ ...styleReference, hasLastFrame: mode === 'image_to_video' })
      : (promptKind === 'video' ? String(input.prompt || '').trim() : '') || templatePrompt
    const effectiveVideoPrompt = resolveOfficialVideoPrompt(videoPrompt)
    // TikTok only offers 5s and 10s; pick the one closest to the reference shot.
    const durationSec = styleReference ? (styleReference.durationSec <= 7 ? 5 : 10) : DEFAULT_DURATION_SEC
    const zoomPercent = resolveZoomPercent(input.zoomPercent)
    const shots: TiktokCreativeShotTask[] = referenceImagePaths.map((referenceImagePath, index) => ({
      id: randomUUID(),
      shotId: randomUUID(),
      shotIndex: index,
      imagePath: referenceImagePath,
      referenceImagePath,
      sourceType: 'reference_image',
      mode,
      zoomPercent,
      prompt: shotPrompt(effectiveVideoPrompt, input.shotPromptSuffixes?.[index]),
      durationSec,
      ...(styleReference ? {
        styleReferenceId: styleReference.id,
        lastFrameReferencePath: mode === 'image_to_video' ? styleReference.lastFramePath : undefined,
      } : {}),
      status: 'running',
      remoteStatus: 'queued',
      imagePreparation: {
        promptVersionId: selectedImagePromptVersion.id,
        promptVersion: selectedImagePromptVersion.version,
        promptHash: hashLivePhotoPrompt(imagePrompt),
        replacementPrompt: imagePrompt,
      },
      imageRetryCount: 0,
      imageRetryLimit,
      imageRetryMode: 'auto',
      logs: [buildLog('[tiktok-creative] reference image task created')],
      createdAt: timestamp,
      updatedAt: timestamp,
    }))
    const task = await tiktokCreativeStudioRepo.create({
      productId,
      productName: String(product.name || '').trim() || 'Product',
      status: 'running',
      shots,
      logs: [buildLog(styleReference
        ? `[tiktok-creative] queued 同款 task from ${styleReference.videoName} (${durationSec}s, ${mode})`
        : `[tiktok-creative] queued ${shots.length} reference image tasks`)],
    })
    task.shots.forEach((shot) => scheduleShot(task.id, shot.shotId))
    return task
  },

  /** 同款批量：one task per product, all copying the same reference clip. */
  async createFromStyleReference(input: { styleReferenceId: string; productIds: string[]; mode?: 'reference_to_video' | 'image_to_video' }) {
    const productIds = Array.from(new Set((Array.isArray(input.productIds) ? input.productIds : []).map((id) => String(id || '').trim()).filter(Boolean)))
    if (!productIds.length) throw new Error('请至少选择一个商品')
    const tasks: TiktokCreativeTask[] = []
    for (const productId of productIds) {
      tasks.push(await this.createFromReference({ referenceImagePaths: [], productId, styleReferenceId: input.styleReferenceId, mode: input.mode }))
    }
    return { count: tasks.length, taskIds: tasks.map((task) => task.id) }
  },

  async resumePending() {
    const tasks = await tiktokCreativeStudioRepo.list()
    let resumed = 0
    let migratedLegacy = 0
    for (const task of tasks) {
      for (const shot of task.shots) {
        if (shot.sourceType !== 'reference_image') continue
        if (isLegacyPageCreationFailure(shot)) {
          await persistShot(task.id, shot.shotId, (current) => ({
            ...current,
            status: 'running',
            remoteStatus: 'queued',
            lastError: undefined,
            updatedAt: now(),
            logs: [
              ...(current.logs || []),
              buildLog('[tiktok-creative] legacy page failure migrated to official API processing'),
            ].slice(-200),
          }))
          scheduleShot(task.id, shot.shotId, 1000)
          resumed += 1
          migratedLegacy += 1
          continue
        }
        if (shot.status === 'running' || shot.remoteStatus === 'queued' || shot.remoteStatus === 'processing') {
          scheduleShot(task.id, shot.shotId, 1000)
          resumed += 1
        }
      }
    }
    return { resumed, migratedLegacy }
  },

  async retryShot(input: {
    id: string
    shotId: string
    replacementRegion?: { x: number; y: number; width: number; height: number }
    retryMode?: 'auto' | 'manual_once'
  }) {
    const task = await tiktokCreativeStudioRepo.get(String(input.id || '').trim())
    if (!task) throw new Error('Task not found')
    const shotId = String(input.shotId || '').trim()
    const existingShot = task.shots.find((shot) => shot.shotId === shotId)
    if (!existingShot) throw new Error('Shot task not found')
    if (input.replacementRegion && existingShot.officialTaskId) {
      throw new Error('The image region cannot be changed after the official video task has been created')
    }
    const manualReplacementRegion = input.replacementRegion
      ? normalizeLivePhotoReplacementRegion({
          ...input.replacementRegion,
          source: 'manual',
          revision: Math.max(1, Number(existingShot.imagePreparation?.replacementRegion?.revision || 0) + 1),
          updatedAt: now(),
        })
      : null
    if (input.replacementRegion && !manualReplacementRegion) throw new Error('Invalid replacement region')
    const imagePromptVersion = await getTikTokImagePromptVersion()
    const configuredImageRetryLimit = await getTiktokImageRetryLimit()
    const imageRetryLimit = Math.max(0, Math.min(20, Math.floor(Number(existingShot.imageRetryLimit ?? configuredImageRetryLimit) || 0)))
    const imageRetryMode = input.retryMode === 'manual_once' ? 'manual_once' : 'auto'
    const updated = await tiktokCreativeStudioRepo.upsert(updateShot(task, shotId, (shot) => ({
      ...shot,
      status: 'running',
      remoteStatus: shot.officialTaskId ? 'processing' : 'queued',
      imagePreparation: shot.officialTaskId || shot.imagePreparation?.qualityReport?.decision === 'pass'
        ? shot.imagePreparation
        : {
            ...shot.imagePreparation,
            replacementRegion: manualReplacementRegion || shot.imagePreparation?.replacementRegion,
            promptVersionId: imagePromptVersion.id,
            promptVersion: imagePromptVersion.version,
            promptHash: imagePromptVersion.promptHash,
            replacementPrompt: imagePromptVersion.prompt,
            imagePromptPreview: undefined,
            generatedStillPath: undefined,
            qualityReport: undefined,
            imageTaskId: undefined,
            imageTaskProvider: undefined,
            imageTaskModel: undefined,
            imageTaskBaseUrl: undefined,
            imageTaskEndpointStyle: undefined,
          },
      preparedImagePath: shot.officialTaskId ? shot.preparedImagePath : undefined,
      firstFramePath: shot.officialTaskId ? shot.firstFramePath : undefined,
      lastFramePath: shot.officialTaskId ? shot.lastFramePath : undefined,
      imageRetryCount: shot.officialTaskId || imageRetryMode === 'manual_once' ? shot.imageRetryCount : 0,
      imageRetryLimit,
      imageRetryMode: shot.officialTaskId ? shot.imageRetryMode : imageRetryMode,
      pollAttempts: shot.officialTaskId ? 0 : shot.pollAttempts,
      lastError: undefined,
      updatedAt: now(),
      logs: [
        ...(shot.logs || []),
        buildLog(
          shot.officialTaskId
            ? `[tiktok-creative] existing official task queued for result sync: ${shot.officialTaskId}`
            : manualReplacementRegion
            ? `[tiktok-creative] replacement region corrected manually; revision=${manualReplacementRegion.revision}; one image attempt queued`
            : imageRetryMode === 'manual_once'
              ? '[tiktok-creative] one manual image attempt queued'
              : '[tiktok-creative] task retry queued with automatic image retries',
        ),
      ].slice(-200),
    })))
    scheduleShot(updated.id, shotId)
    return updated
  },

  async continueWithVideo(input: { id: string; shotId: string }) {
    const task = await tiktokCreativeStudioRepo.get(String(input.id || '').trim())
    if (!task) throw new Error('Task not found')
    const shotId = String(input.shotId || '').trim()
    const target = task.shots.find((item) => item.shotId === shotId)
    if (!target) throw new Error('Shot task not found')
    if (
      target.status !== 'requires_manual' ||
      !String(target.lastError || '').includes('[image_retry_exhausted]') ||
      target.officialTaskId
    ) {
      throw new Error('This shot is not paused after image validation retries')
    }
    const imagePath = resolveGeneratedImagePath(target)
    if (!imagePath) throw new Error('The image for this shot is unavailable')
    await persistShot(task.id, shotId, (current) => ({
      ...current,
      imageValidationBypassed: true,
      status: 'running',
      remoteStatus: 'queued',
      lastError: undefined,
      updatedAt: now(),
      logs: [...(current.logs || []), buildLog('[tiktok-creative] image validation bypassed by user; continuing with video generation', 'info')].slice(-200),
    }))
    const latestTask = await tiktokCreativeStudioRepo.get(task.id)
    const latestShot = latestTask?.shots.find((item) => item.shotId === shotId)
    if (!latestTask || !latestShot) throw new Error('Shot task disappeared')
    try {
      await withAccountLock('__account_scheduler__', async () => {
        const selected = await chooseAccount(taskCreditCost(latestShot.durationSec || 5))
        try {
          await withAccountLock(selected.account.id, async () => {
          let created: Awaited<ReturnType<TiktokOfficialClient['createTask']>>
          try {
            const mode = resolveGenerationMode(latestShot.mode)
            await persistShot(task.id, shotId, (current) => ({ ...current, mode, updatedAt: now() }))
            const lastFramePath = mode === 'image_to_video'
              ? await resolveClosingFramePath({ taskId: task.id, shotId, firstFramePath: imagePath, zoomPercent: latestShot.zoomPercent })
              : undefined
            await persistShot(task.id, shotId, (current) => ({
              ...current,
              mode,
              firstFramePath: imagePath,
              lastFramePath,
              updatedAt: now(),
            }))
            const imagePaths = lastFramePath ? [imagePath, lastFramePath] : [imagePath]
            created = await selected.client.createTask({
              imagePaths,
              mode,
              prompt: resolveOfficialVideoPrompt(latestShot.prompt),
              durationSec: latestShot.durationSec || 5,
            })
          } catch (error) {
            const message = getErrorMessage(error, 'Official task creation failed')
            await persistShot(task.id, shotId, (current) => ({
              ...current,
              accountId: selected.account.id,
              requestTrace: [...(current.requestTrace || []), ...selected.client.getRequestTrace()].slice(-30),
              lastError: `[official_create_unconfirmed] ${message}`,
              updatedAt: now(),
            })).catch(() => undefined)
            creditCache.delete(selected.account.id)
            throw new Error(`[official_create_unconfirmed] ${message}`)
          }
          await persistShot(task.id, shotId, (current) => ({
            ...current,
            accountId: selected.account.id,
            officialTaskId: created.taskId,
            officialVideoId: created.videoId,
            requestTrace: created.requestTrace,
            remoteStatus: created.videoUrl ? 'completed' : 'processing',
            remoteStatusUpdatedAt: now(),
            updatedAt: now(),
            logs: [...(current.logs || []), buildLog(`[tiktok-creative] official task created from bypassed image: ${created.taskId}`, 'success')].slice(-200),
          }))
          consumeCachedCredit(selected.account.id, selected.requiredCredit)
          if (created.videoUrl) {
            const downloaded = await downloadResult({ taskId: task.id, shotId, client: selected.client, videoUrl: created.videoUrl, posterUrl: created.posterUrl })
            await persistShot(task.id, shotId, (current) => ({
              ...current,
              status: 'completed',
              remoteStatus: 'completed',
              resultVideoPath: downloaded.videoPath,
              posterPath: downloaded.posterPath,
              downloadDir: downloaded.dir,
              updatedAt: now(),
            }))
          } else {
            registerOfficialPoll(task.id, shotId, selected.account.id, 10000)
          }
          })
        } finally {
          await selected.client.close()
        }
      })
    } catch (error) {
      const message = getErrorMessage(error, 'Official task creation failed')
      await persistShot(task.id, shotId, (current) => ({
        ...current,
        status: 'requires_manual',
        remoteStatus: 'paused_error',
        lastError: message,
        updatedAt: now(),
        logs: [...(current.logs || []), buildLog(`[tiktok-creative] ${message}`, 'error')].slice(-200),
      })).catch(() => undefined)
      throw error
    }
    return await tiktokCreativeStudioRepo.get(task.id)
  },

  async exportItems(input: { taskId: string; shotIds: string[]; outputDir: string }) {
    const task = await tiktokCreativeStudioRepo.get(String(input.taskId || '').trim())
    if (!task) throw new Error('Task not found')
    const ids = new Set((Array.isArray(input.shotIds) ? input.shotIds : []).map((item) => String(item || '').trim()).filter(Boolean))
    const outputDir = String(input.outputDir || '').trim()
    if (!outputDir) throw new Error('Export directory is required')
    await mkdir(outputDir, { recursive: true })
    const exported: Array<{ shotId: string; videoPath: string }> = []
    const skipped: Array<{ shotId: string; reason: string }> = []
    const exportedByShotId = new Map<string, { videoPath: string; exportedAt: number }>()
    for (const shot of task.shots.filter((item) => !ids.size || ids.has(item.shotId))) {
      const sourceVideoPath = shot.subtitleVideoPath || shot.resultVideoPath
      if (shot.status !== 'completed' || !sourceVideoPath) {
        skipped.push({ shotId: shot.shotId, reason: 'Item is not completed' })
        continue
      }
      const extension = extname(sourceVideoPath) || '.mp4'
      const outputPath = join(outputDir, `${task.productName || 'tiktok'}-${shot.shotIndex + 1}-${shot.shotId.slice(0, 8)}${extension}`)
      await copyFile(sourceVideoPath, outputPath)
      exported.push({ shotId: shot.shotId, videoPath: outputPath })
      exportedByShotId.set(shot.shotId, { videoPath: outputPath, exportedAt: now() })
    }
    if (exportedByShotId.size) {
      await tiktokCreativeStudioRepo.upsert(applyTaskSummary({
        ...task,
        shots: task.shots.map((shot) => {
          const exportInfo = exportedByShotId.get(shot.shotId)
          return exportInfo ? { ...shot, exportedAt: exportInfo.exportedAt, exportedVideoPath: exportInfo.videoPath } : shot
        }),
        updatedAt: now(),
      }))
    }
    return { outputDir, exported, skipped, total: ids.size || task.shots.length }
  },

  async removeShot(input: { taskId: string; shotId: string }) {
    const task = await tiktokCreativeStudioRepo.get(String(input.taskId || '').trim())
    if (!task) throw new Error('Task not found')
    const shotId = String(input.shotId || '').trim()
    const shots = task.shots.filter((item) => item.shotId !== shotId)
    if (shots.length === task.shots.length) throw new Error('Shot task not found')
    if (!shots.length) return await tiktokCreativeStudioRepo.remove(task.id)
    return await tiktokCreativeStudioRepo.upsert(applyTaskSummary({ ...task, shots, updatedAt: now() }))
  },

  async generateSubtitles(input: {
    items: Array<{ taskId: string; shotId: string }>
    titleText?: string
    titleConfig?: { strategy?: 'single_for_all' | 'random_pool'; singleText?: string; titlePool?: string[] }
    captionStyle?: Record<string, unknown>
    overlayImageConfig?: Record<string, unknown>
    layoutPolicy?: Record<string, unknown>
  }) {
    const selected = Array.isArray(input.items) ? input.items : []
    const sourceItems: Array<{
      id: string
      sourceType: 'upload'
      sourceVideoPath: string
      sourceProjectId: string
      sourceProjectTitle: string
      fileName: string
      coverImagePath?: string
    }> = []
    const sourceMap = new Map<string, { taskId: string; shotId: string }>()
    for (const item of selected) {
      const task = await tiktokCreativeStudioRepo.get(String(item.taskId || '').trim())
      const shot = task?.shots.find((entry) => entry.shotId === String(item.shotId || '').trim())
      if (!task || !shot?.resultVideoPath) continue
      const sourceId = `${task.id}:${shot.shotId}`
      sourceMap.set(sourceId, { taskId: task.id, shotId: shot.shotId })
      sourceItems.push({
        id: sourceId,
        sourceType: 'upload',
        sourceVideoPath: shot.resultVideoPath,
        sourceProjectId: task.id,
        sourceProjectTitle: task.productName || 'TikTok Creative Studio',
        fileName: basename(shot.resultVideoPath),
        coverImagePath: shot.posterPath,
      })
    }
    if (!sourceItems.length) throw new Error('Please select completed videos')
    const titleConfig = input.titleConfig || { strategy: 'single_for_all' as const, singleText: String(input.titleText || '').trim(), titlePool: [] }
    if (titleConfig.strategy !== 'random_pool' && !String(titleConfig.singleText || '').trim()) throw new Error('Subtitle title is required')
    const userId = 'desktop-tiktok-creative-studio'
    const plugin = await webPlatformRepo.ensurePluginRecord(userId, 'video-batch-subtitle')
    if (plugin.status !== 'installed' || plugin.runtimeState !== 'enabled') {
      await webPlatformRepo.upsertPluginRecord({ ...plugin, status: 'installed', runtimeState: 'enabled' })
    }
    const job = await createBatchSubtitleJob({
      userId,
      name: `TikTok Creative Studio ${new Date().toISOString()}`,
      sourceItems,
      subtitleMode: 'static_title',
      subtitleSource: 'manual',
      exportEngine: 'ass_fallback',
      titleRenderMode: 'overlay_image',
      titleConfig,
      overlayImageConfig: input.overlayImageConfig,
      captionStyle: input.captionStyle,
      layoutPolicy: input.layoutPolicy,
    })
    const completed = await runBatchSubtitleJob({ userId, jobId: job.id })
    const successfulOutputs = (completed.outputs || []).filter((output) => output.renderStatus === 'success' && output.outputVideoPath)
    if (!successfulOutputs.length) {
      throw new Error(completed.error || '字幕生成失败，请检查视频编码和字幕配置')
    }
    for (const output of completed.outputs || []) {
      if (output.renderStatus !== 'success' || !output.outputVideoPath) continue
      const target = sourceMap.get(output.sourceItemId)
      if (!target) continue
      await persistShot(target.taskId, target.shotId, (shot) => ({
        ...shot,
        subtitleVideoPath: output.outputVideoPath,
        subtitleCoverImagePath: output.coverImagePath,
        subtitleJobId: completed.id,
        subtitleAppliedAt: now(),
        updatedAt: now(),
        logs: [...(shot.logs || []), buildLog(`[tiktok-creative] subtitle video generated: ${output.outputVideoPath}`, 'success')].slice(-200),
      }))
    }
    return completed
  },

  async revertSubtitles(input: { taskId: string; shotId: string }) {
    const task = await tiktokCreativeStudioRepo.get(String(input.taskId || '').trim())
    if (!task) throw new Error('Task not found')
    const shot = task.shots.find((item) => item.shotId === String(input.shotId || '').trim())
    if (!shot) throw new Error('Shot task not found')
    const subtitleVideoPath = String(shot.subtitleVideoPath || '').trim()
    const subtitleCoverImagePath = String(shot.subtitleCoverImagePath || '').trim()
    const saved = await tiktokCreativeStudioRepo.upsert(updateShot(task, shot.shotId, (current) => ({
      ...current,
      subtitleVideoPath: undefined,
      subtitleCoverImagePath: undefined,
      subtitleJobId: undefined,
      subtitleAppliedAt: undefined,
      updatedAt: now(),
      logs: [...(current.logs || []), buildLog('[tiktok-creative] subtitle version reverted', 'info')].slice(-200),
    })))
    if (subtitleVideoPath) await rm(subtitleVideoPath, { force: true }).catch(() => undefined)
    if (subtitleCoverImagePath) await rm(subtitleCoverImagePath, { force: true }).catch(() => undefined)
    return saved
  },
  async revertSubtitlesBatch(input: { items: Array<{ taskId: string; shotId: string }> }) {
    const results = []
    for (const item of Array.isArray(input.items) ? input.items : []) {
      try { results.push(await this.revertSubtitles(item)) } catch { /* continue */ }
    }
    return { reverted: results.length, items: results }
  },

  async createDraftsFromCloneProjects(input: { cloneProjectIds: string[] }) {
    void input
    throw new Error('Creating TikTok Creative Studio tasks from clone projects is no longer supported')
  },

  async createDraftFromCloneProject(input: { cloneProjectId: string }) {
    void input
    throw new Error('Creating TikTok Creative Studio tasks from clone projects is no longer supported')
  },

  async startShot(input: { id: string; shotId: string }) {
    const task = await tiktokCreativeStudioRepo.get(String(input.id || '').trim())
    if (!task) throw new Error('Task not found')
    const target = task.shots.find((item) => item.shotId === String(input.shotId || '').trim())
    if (!target) throw new Error('Shot task not found')
    if (!target.imagePath) throw new Error('Shot image is missing')
    if (target.sourceType !== 'reference_image') {
      throw new Error('Legacy clone tasks are read-only and cannot be submitted')
    }
    const updated = await tiktokCreativeStudioRepo.upsert(updateShot(task, target.shotId, (shot) => ({
      ...shot,
      status: 'running',
      remoteStatus: shot.officialTaskId ? 'processing' : 'queued',
      lastError: undefined,
      updatedAt: now(),
      logs: [...(shot.logs || []), buildLog('[tiktok-creative] queued for official API processing')].slice(-200),
    })))
    scheduleShot(updated.id, target.shotId)
    return updated
  },

  async startNextPendingShot(input: { id: string }) {
    const task = await tiktokCreativeStudioRepo.get(String(input.id || '').trim())
    if (!task) throw new Error('Task not found')
    const referenceShots = task.shots.filter((item) => item.sourceType === 'reference_image')
    const nextShot =
      referenceShots.find((item) => item.status === 'draft') ||
      referenceShots.find((item) => item.status === 'failed') ||
      referenceShots.find((item) => item.status === 'requires_manual' && !String(item.resultVideoPath || '').trim())
    if (!nextShot) throw new Error('No pending shot available')
    return await this.startShot({ id: task.id, shotId: nextShot.shotId })
  },

  async markShotCompleted(input: { id: string; shotId: string; resultVideoPath: string }) {
    const task = await tiktokCreativeStudioRepo.get(String(input.id || '').trim())
    if (!task) throw new Error('Task not found')
    return await tiktokCreativeStudioRepo.upsert(
      updateShot(task, String(input.shotId || '').trim(), (shot) => ({
        ...shot,
        resultVideoPath: String(input.resultVideoPath || '').trim(),
        status: 'completed',
        lastError: undefined,
        updatedAt: now(),
        logs: [...(shot.logs || []), buildLog('[tiktok-creative] shot marked completed', 'success')].slice(-200),
      })),
    )
  },

  async markShotFailed(input: { id: string; shotId: string; error: string }) {
    const task = await tiktokCreativeStudioRepo.get(String(input.id || '').trim())
    if (!task) throw new Error('Task not found')
    return await tiktokCreativeStudioRepo.upsert(
      updateShot(task, String(input.shotId || '').trim(), (shot) => ({
        ...shot,
        status: 'failed',
        lastError: String(input.error || '').trim() || 'Unknown error',
        updatedAt: now(),
        logs: [...(shot.logs || []), buildLog(`[tiktok-creative] failed: ${String(input.error || '').trim() || 'Unknown error'}`, 'error')].slice(-200),
      })),
    )
  },

  async remove(id: string) {
    return await tiktokCreativeStudioRepo.remove(id)
  },

  async appendProjectLog(input: { id: string; message: string; level?: TiktokCreativeTaskLog['level'] }) {
    const task = await tiktokCreativeStudioRepo.get(String(input.id || '').trim())
    if (!task) throw new Error('Task not found')
    return await appendTaskLogs(task, [buildLog(String(input.message || '').trim(), input.level || 'info')])
  },
}
