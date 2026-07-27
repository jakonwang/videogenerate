import { randomUUID } from 'node:crypto'
import { copyFile, mkdir, rm } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { getAppPaths } from '../../lib/paths'
import { tiktokCreativeStudioRepo } from './repo'
import { tiktokCreativeAccounts } from './accounts'
import { TiktokOfficialClient } from './officialClient'
import { prepareReferenceImageForExternalWorkflow } from '../live-photo/service'
import { normalizeLivePhotoReplacementRegion } from '../live-photo/replacementRegion'
import { productsRepo } from '../products/repo'
import { tiktokCreativePromptVersions } from './promptVersions'
import type { TiktokCreativePromptVersion } from './promptVersions'
import { createBatchSubtitleJob, runBatchSubtitleJob } from '../web-platform/batchSubtitle'
import { webPlatformRepo } from '../web-platform/repo'
import { normalizeTiktokPreparedImageAspect } from './imageAspect'
import { runFfmpeg } from '../ffmpeg/runner'
import { probeMedia } from '../ffmpeg/probe'
import type { TiktokCreativeAccount, TiktokCreativeShotTask, TiktokCreativeTask, TiktokCreativeTaskLog } from './types'

const TIKTOK_IMAGE_RETRY_LIMIT = 2

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
const accountLocks = new Map<string, Promise<void>>()
const DEFAULT_DURATION_SEC = 10
const DEFAULT_PROMPT = 'Create a smooth ten-second product showcase with a gentle camera orbit and natural lighting.'

function taskCreditCost(durationSec: number) {
  return durationSec >= 10 ? 10 : 5
}

function shotKey(taskId: string, shotId: string) {
  return `${taskId}:${shotId}`
}

function scheduleShot(taskId: string, shotId: string, delayMs = 0) {
  const timer = setTimeout(() => {
    void processReferenceShot(taskId, shotId)
  }, delayMs)
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

async function chooseAccount(requiredCredit: number) {
  const accounts = (await tiktokCreativeAccounts.list()).filter((account) => account.enabled)
  if (!accounts.length) throw new Error('No enabled TikTok account is configured')
  const errors: string[] = []
  for (const account of accounts) {
    const client = await accountClient(account)
    let selected = false
    try {
      const result = await client.queryCredit()
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
      return { account, client }
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
    await runFfmpeg({
      args: [
        '-y',
        '-i',
        sourceVideoPath,
        '-map',
        '0:v:0',
        '-map',
        '0:a:0?',
        '-vf',
        'fps=30,format=yuv420p',
        '-c:v',
        'libx264',
        '-profile:v',
        'baseline',
        '-level:v',
        '3.1',
        '-preset',
        'veryfast',
        '-crf',
        '20',
        '-c:a',
        'aac',
        '-b:a',
        '128k',
        '-ar',
        '44100',
        '-ac',
        '2',
        '-movflags',
        '+faststart',
        videoPath,
      ],
    })
    const media = await probeMedia(videoPath)
    if (media.videoCodec !== 'h264' || !media.width || !media.height || media.durationSec <= 0) {
      throw new Error('Normalized TikTok video failed media validation')
    }
    await rm(sourceVideoPath, { force: true })
  } catch (error) {
    await rm(videoPath, { force: true })
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

async function pollOfficialTask(taskId: string, shotId: string, shot: TiktokCreativeShotTask) {
  if (!shot.accountId || !shot.officialTaskId) throw new Error('Official task binding is incomplete')
  if (Number(shot.pollAttempts || 0) >= 180) {
    await persistShot(taskId, shotId, (current) => ({
      ...current,
      status: 'requires_manual',
      remoteStatus: 'paused_error',
      lastError: 'TikTok task is still processing after 30 minutes',
      remoteStatusUpdatedAt: now(),
      updatedAt: now(),
    }))
    return
  }
  const account = (await tiktokCreativeAccounts.list()).find((item) => item.id === shot.accountId)
  if (!account) throw new Error('The account bound to this task no longer exists')
  const client = await accountClient(account)
  try {
    const result = await client.checkTask(shot.officialTaskId)
    if (result.completed && result.videoUrl) {
      const downloaded = await downloadResult({ taskId, shotId, client, videoUrl: result.videoUrl, posterUrl: result.posterUrl })
      await persistShot(taskId, shotId, (current) => ({
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
      await persistShot(taskId, shotId, (current) => ({
        ...current,
        status: 'running',
        remoteStatus: 'processing',
        pollAttempts: Number(current.pollAttempts || 0) + 1,
        requestTrace: [...(current.requestTrace || []), ...(result.requestTrace || [])].slice(-30),
        remoteStatusUpdatedAt: now(),
        updatedAt: now(),
      }))
      scheduleShot(taskId, shotId, 10000)
      return
    }
    throw new Error(`TikTok task failed with status ${String(result.status ?? 'unknown')}`)
  } finally {
    await client.close()
  }
}

async function processReferenceShot(taskId: string, shotId: string) {
  const key = shotKey(taskId, shotId)
  if (activeShots.has(key)) return
  activeShots.add(key)
  try {
    const task = await tiktokCreativeStudioRepo.get(taskId)
    const shot = task?.shots.find((item) => item.shotId === shotId)
    if (!task || !shot || shot.status === 'completed') return
    if (shot.officialTaskId) {
      await pollOfficialTask(taskId, shotId, shot)
      return
    }

    const activePromptVersion = await tiktokCreativePromptVersions.getActive()
    const promptVersion = shot.imagePreparation?.promptVersionId
      ? {
          id: shot.imagePreparation.promptVersionId,
          version: shot.imagePreparation.promptVersion || activePromptVersion.version,
          prompt: shot.imagePreparation.replacementPrompt || activePromptVersion.prompt,
          promptHash: shot.imagePreparation.promptHash || activePromptVersion.promptHash,
        }
      : activePromptVersion
    const prepared = await prepareReferenceImageForExternalWorkflow({
      workflowId: `${taskId}-${shotId}`,
      referenceImagePath: shot.referenceImagePath || shot.imagePath,
      productId: String(task.productId || '').trim(),
      outputRoot: await defaultShotRoot(taskId, shotId),
      state: shot.imagePreparation,
      promptVersion,
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
      if (retryCount < TIKTOK_IMAGE_RETRY_LIMIT) {
        const nextRetryCount = retryCount + 1
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
          imageRetryLimit: TIKTOK_IMAGE_RETRY_LIMIT,
          status: 'running',
          remoteStatus: 'queued',
          lastError: prepared.error,
          updatedAt: now(),
          logs: [
            ...(current.logs || []),
            buildLog(`[tiktok-creative] image quality failed; automatic retry ${nextRetryCount}/${TIKTOK_IMAGE_RETRY_LIMIT}`),
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
    const aspectResult = await normalizeTiktokPreparedImageAspect(
      prepared.preparedImagePath,
      join(await defaultShotRoot(taskId, shotId), 'generated-still'),
    )
    const preparedImagePath = aspectResult.path
    await persistShot(taskId, shotId, (current) => ({
      ...current,
      imagePreparation: {
        ...prepared.state,
        generatedStillPath: preparedImagePath,
      },
      preparedImagePath,
      updatedAt: now(),
      logs: aspectResult.normalized
        ? [
            ...(current.logs || []),
            buildLog(`[tiktok-creative] image aspect normalized: ${aspectResult.sourceWidth}x${aspectResult.sourceHeight} -> ${aspectResult.width}x${aspectResult.height} (9:16)`, 'success'),
          ].slice(-200)
        : current.logs,
    }))

    await withAccountLock('__account_scheduler__', async () => {
      const selected = await chooseAccount(taskCreditCost(shot.durationSec || 5))
      try {
        await withAccountLock(selected.account.id, async () => {
          let created: Awaited<ReturnType<TiktokOfficialClient['createTask']>>
          try {
            created = await selected.client.createTask({
              imagePaths: [preparedImagePath],
              prompt: shot.prompt || DEFAULT_PROMPT,
              durationSec: shot.durationSec || 5,
            })
          } catch (error) {
            const message = getErrorMessage(error, 'Official task creation failed')
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
            scheduleShot(taskId, shotId, 10000)
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

async function syncPendingPromptVersion(promptVersion: TiktokCreativePromptVersion) {
  const tasks = await tiktokCreativeStudioRepo.list()
  for (const task of tasks) {
    let changed = false
    const shots = task.shots.map((shot) => {
      if (shot.sourceType !== 'reference_image' || shot.officialTaskId || shot.imagePreparation?.qualityReport?.decision === 'pass') return shot
      changed = true
      return {
        ...shot,
        imagePreparation: {
          ...shot.imagePreparation,
          promptVersionId: promptVersion.id,
          promptVersion: promptVersion.version,
          promptHash: promptVersion.promptHash,
          replacementPrompt: promptVersion.prompt,
          imagePromptPreview: undefined,
        },
        updatedAt: now(),
      }
    })
    if (changed) await tiktokCreativeStudioRepo.upsert({ ...task, shots, updatedAt: now() })
  }
}

export const tiktokCreativeStudioService = {
  async list() {
    return await tiktokCreativeStudioRepo.list()
  },

  async listAccounts() {
    return { encryptionAvailable: tiktokCreativeAccounts.encryptionAvailable(), accounts: await tiktokCreativeAccounts.list() }
  },

  async listPromptVersions() {
    return await tiktokCreativePromptVersions.list()
  },

  async createPromptVersion(input: { name: string; prompt: string }) {
    return await tiktokCreativePromptVersions.save(input)
  },

  async updatePromptVersion(input: { id: string; name: string; prompt: string }) {
    const saved = await tiktokCreativePromptVersions.save(input)
    if (saved.active) await syncPendingPromptVersion(saved)
    return saved
  },

  async activatePromptVersion(input: { id: string }) {
    const activated = await tiktokCreativePromptVersions.activate(input.id)
    await syncPendingPromptVersion(activated)
    return activated
  },

  async rollbackPromptVersion(input: { id: string }) {
    const activated = await tiktokCreativePromptVersions.rollback(input.id)
    await syncPendingPromptVersion(activated)
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
    const client = await accountClient(account)
    try {
      const result = await client.queryCredit()
      const state = !result.authenticated ? 'expired' : result.credit !== undefined && result.credit < 5 ? 'insufficient_credit' : result.credit === undefined ? 'error' : 'ready'
      return await tiktokCreativeAccounts.updateState(account.id, {
        state,
        credit: result.credit,
        lastError: state === 'ready' ? undefined : state === 'expired' ? 'Login expired' : state === 'insufficient_credit' ? 'Insufficient credit' : 'Credit could not be read',
      })
    } finally {
      await client.close()
    }
  },

  async createFromReference(input: { referenceImagePaths: string[]; productId: string; prompt?: string; durationSec?: number }) {
    const referenceImagePaths = Array.from(new Set((Array.isArray(input.referenceImagePaths) ? input.referenceImagePaths : []).map((item) => String(item || '').trim()).filter(Boolean)))
    if (!referenceImagePaths.length) throw new Error('Reference images are required')
    const productId = String(input.productId || '').trim()
    const product = (await productsRepo.list()).find((item) => item.id === productId)
    if (!product) throw new Error('Product does not exist')
    const timestamp = now()
    const promptVersion = await tiktokCreativePromptVersions.getActive()
    const shots: TiktokCreativeShotTask[] = referenceImagePaths.map((referenceImagePath, index) => ({
      id: randomUUID(),
      shotId: randomUUID(),
      shotIndex: index,
      imagePath: referenceImagePath,
      referenceImagePath,
      sourceType: 'reference_image',
      prompt: DEFAULT_PROMPT,
      durationSec: DEFAULT_DURATION_SEC,
      status: 'running',
      remoteStatus: 'queued',
      imagePreparation: {
        promptVersionId: promptVersion.id,
        promptVersion: promptVersion.version,
        promptHash: promptVersion.promptHash,
        replacementPrompt: promptVersion.prompt,
      },
      imageRetryCount: 0,
      imageRetryLimit: TIKTOK_IMAGE_RETRY_LIMIT,
      logs: [buildLog('[tiktok-creative] reference image task created')],
      createdAt: timestamp,
      updatedAt: timestamp,
    }))
    const task = await tiktokCreativeStudioRepo.create({
      productId,
      productName: String(product.name || '').trim() || 'Product',
      status: 'running',
      shots,
      logs: [buildLog(`[tiktok-creative] queued ${shots.length} reference image tasks`)],
    })
    task.shots.forEach((shot) => scheduleShot(task.id, shot.shotId))
    return task
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
    const promptVersion = await tiktokCreativePromptVersions.getActive()
    const updated = await tiktokCreativeStudioRepo.upsert(updateShot(task, shotId, (shot) => ({
      ...shot,
      status: 'running',
      remoteStatus: shot.officialTaskId ? 'processing' : 'queued',
      imagePreparation: shot.officialTaskId || shot.imagePreparation?.qualityReport?.decision === 'pass'
        ? shot.imagePreparation
        : {
            ...shot.imagePreparation,
            replacementRegion: manualReplacementRegion || shot.imagePreparation?.replacementRegion,
            promptVersionId: promptVersion.id,
            promptVersion: promptVersion.version,
            promptHash: promptVersion.promptHash,
            replacementPrompt: promptVersion.prompt,
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
      imageRetryCount: shot.officialTaskId ? shot.imageRetryCount : 0,
      imageRetryLimit: TIKTOK_IMAGE_RETRY_LIMIT,
      lastError: undefined,
      updatedAt: now(),
      logs: [
        ...(shot.logs || []),
        buildLog(
          manualReplacementRegion
            ? `[tiktok-creative] replacement region corrected manually; revision=${manualReplacementRegion.revision}; image retries reset to 0/${TIKTOK_IMAGE_RETRY_LIMIT}`
            : `[tiktok-creative] task retried; image retries reset to 0/${TIKTOK_IMAGE_RETRY_LIMIT}`,
        ),
      ].slice(-200),
    })))
    scheduleShot(updated.id, shotId)
    return updated
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
