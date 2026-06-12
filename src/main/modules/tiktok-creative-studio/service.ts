import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { cloneRepo } from '../clone/repo'
import { cloneService } from '../clone/service'
import { getAppPaths } from '../../lib/paths'
import { tiktokCreativeStudioRepo } from './repo'
import type { TiktokCreativeShotTask, TiktokCreativeTask, TiktokCreativeTaskLog } from './types'

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
  return {
    ...task,
    ...summary,
  }
}

async function defaultDownloadDir(taskId: string, shotId: string) {
  const dir = join(getAppPaths().dataDir, 'tiktok-creative-studio', taskId, shotId, 'downloads')
  await mkdir(dir, { recursive: true })
  return dir
}

async function defaultBrowserProfileDir() {
  const dir = join(getAppPaths().dataDir, 'tiktok-creative-studio', 'browser-profile')
  await mkdir(dir, { recursive: true })
  return dir
}

async function clickFirstVisible(page: any, selectors: string[]) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first()
    if ((await locator.count()) < 1) continue
    try {
      await locator.waitFor({ state: 'visible', timeout: 1200 })
      await locator.click()
      return selector
    } catch {
      continue
    }
  }
  return ''
}

async function fillFirstVisible(page: any, selectors: string[], value: string) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first()
    if ((await locator.count()) < 1) continue
    try {
      await locator.waitFor({ state: 'visible', timeout: 1200 })
      await locator.click()
      await locator.fill(value)
      return selector
    } catch {
      continue
    }
  }
  return ''
}

async function uploadFirstVisible(page: any, selectors: string[], filePaths: string[]) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first()
    if ((await locator.count()) < 1) continue
    try {
      await locator.setInputFiles(filePaths)
      return selector
    } catch {
      continue
    }
  }
  return ''
}

async function detectLoginState(page: any) {
  const loginSignals = ['text=/log in/i', 'text=/login/i', 'text=/sign in/i', 'input[type="password"]', '[data-testid*="login"]']
  for (const selector of loginSignals) {
    try {
      if ((await page.locator(selector).count()) > 0) return 'login_required'
    } catch {
      continue
    }
  }
  return 'unknown'
}

async function navigateToCreativeStudio(page: any, logs: TiktokCreativeTaskLog[]) {
  const directUrls = [
    'https://ads.tiktok.com/business/creativecenter/tools/image-to-video',
    'https://ads.tiktok.com/creative/',
    'https://ads.tiktok.com/',
  ]
  for (const url of directUrls) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
      await page.waitForTimeout(1200)
      logs.push(buildLog(`[tiktok-creative] navigated to ${url}`))
      return
    } catch (error) {
      logs.push(buildLog(`[tiktok-creative] navigation failed for ${url}: ${getErrorMessage(error, 'navigation failed')}`, 'error'))
    }
  }
}

async function runAutomationPreparation(input: { taskId: string; shot: TiktokCreativeShotTask }) {
  const { chromium } = await import('playwright')
  const profileDir = await defaultBrowserProfileDir()
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    acceptDownloads: true,
    downloadsPath: String(input.shot.downloadDir || '').trim() || undefined,
  })
  const existing = context.pages()[0]
  const page = existing || (await context.newPage())
  const logs: TiktokCreativeTaskLog[] = [buildLog(`[tiktok-creative] browser session opened for shot ${input.shot.shotIndex + 1}`)]
  await navigateToCreativeStudio(page, logs)

  const loginState = await detectLoginState(page)
  if (loginState === 'login_required') {
    logs.push(buildLog('[tiktok-creative] login may be required before automation can continue', 'error'))
  } else {
    logs.push(buildLog('[tiktok-creative] no immediate login gate detected'))
  }

  const clickedEntry = await clickFirstVisible(page, [
    'text=/creative studio/i',
    'text=/image to video/i',
    'text=/video generator/i',
    'button:has-text("Create video")',
    'button:has-text("Generate")',
    '[role="button"]:has-text("Create")',
    'a:has-text("Creative")',
  ])
  if (clickedEntry) {
    logs.push(buildLog(`[tiktok-creative] opened generation entry via selector: ${clickedEntry}`, 'success'))
    await page.waitForTimeout(1200)
  }

  let preparedUpload = false
  let preparedPrompt = false
  let detectedGenerateButton = false

  const uploadSelector = await uploadFirstVisible(page, ['input[type="file"]', 'input[accept*="image"]', 'input[multiple]'], [input.shot.imagePath])
  if (uploadSelector) {
    preparedUpload = true
    logs.push(buildLog(`[tiktok-creative] uploaded shot image via ${uploadSelector}: ${basename(input.shot.imagePath)}`, 'success'))
  } else {
    logs.push(buildLog('[tiktok-creative] no upload input detected, manual upload required', 'error'))
  }

  const promptSelector = await fillFirstVisible(page, ['textarea', '[contenteditable="true"]', 'div[role="textbox"]', 'input[type="text"]'], input.shot.prompt)
  if (promptSelector) {
    preparedPrompt = true
    logs.push(buildLog(`[tiktok-creative] prompt filled via ${promptSelector}`, 'success'))
  } else {
    logs.push(buildLog('[tiktok-creative] no prompt input detected, manual prompt paste required', 'error'))
  }

  const generateButtonSelector = await clickFirstVisible(page, [
    'button:has-text("Generate")',
    'button:has-text("Create")',
    'button:has-text("Start")',
    '[role="button"]:has-text("Generate")',
  ])
  if (generateButtonSelector) {
    detectedGenerateButton = true
    logs.push(buildLog(`[tiktok-creative] generation trigger clicked via ${generateButtonSelector}`, 'success'))
  } else {
    logs.push(buildLog('[tiktok-creative] generation button not confirmed, manual submit may be required'))
  }

  if (preparedUpload || preparedPrompt || detectedGenerateButton) {
    logs.push(buildLog('[tiktok-creative] desktop automation prepared the shot session, manual review may still be required'))
  } else {
    logs.push(buildLog('[tiktok-creative] automation could not prefill page, manual operation required'))
  }

  return { logs, preparedUpload, preparedPrompt, detectedGenerateButton, loginState }
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

export const tiktokCreativeStudioService = {
  async list() {
    return await tiktokCreativeStudioRepo.list()
  },

  async createDraftsFromCloneProjects(input: { cloneProjectIds: string[] }) {
    const ids = Array.from(new Set((Array.isArray(input.cloneProjectIds) ? input.cloneProjectIds : []).map((item) => String(item || '').trim()).filter(Boolean)))
    const results: TiktokCreativeTask[] = []
    for (const cloneProjectId of ids) {
      results.push(await this.createDraftFromCloneProject({ cloneProjectId }))
    }
    return results
  },

  async createDraftFromCloneProject(input: { cloneProjectId: string }) {
    const project = await cloneRepo.getProject(String(input.cloneProjectId || '').trim())
    if (!project || !project.blueprint) throw new Error('Clone project not found')
    const frames = Array.isArray(project.storyboardFrames) ? project.storyboardFrames : []
    const shots = Array.isArray(project.blueprint.shots) ? project.blueprint.shots : []
    const mappedShots: TiktokCreativeShotTask[] = []

    for (let index = 0; index < shots.length; index += 1) {
      const shot = shots[index]
      const frame = frames.find((item) => String(item?.shotId || '').trim() === String(shot?.id || '').trim())
      const imagePath = String(frame?.imagePath || '').trim()
      if (!imagePath) continue
      const preview = await cloneService.getShotVideoPromptPreview({ cloneProjectId: project.id, shotId: shot.id })
      mappedShots.push({
        id: randomUUID(),
        shotId: String(shot.id || '').trim(),
        shotIndex: Number(shot.index ?? index),
        scriptText: String(shot.scriptText || '').trim() || undefined,
        imagePath,
        prompt: String(preview?.positivePrompt || preview?.compiledPrompt || shot.generationPrompt || shot.scriptText || '').trim(),
        durationSec: Math.max(3, Number(shot.durationSec || 5) || 5),
        status: 'draft',
        logs: [buildLog(`[tiktok-creative] shot imported from clone: ${shot.id}`)],
        createdAt: now(),
        updatedAt: now(),
      })
    }

    if (!mappedShots.length) {
      throw new Error('No storyboard frames are ready in the current clone project')
    }

    const task = await tiktokCreativeStudioRepo.create({
      sourceCloneProjectId: project.id,
      sourceCloneProjectTitle: String(project.title || '').trim() || 'Untitled clone project',
      status: 'draft',
      shots: mappedShots,
      lastError: undefined,
      logs: [buildLog(`[tiktok-creative] imported clone project ${project.id} with ${mappedShots.length} storyboard shots`)],
    })
    return task
  },

  async startShot(input: { id: string; shotId: string }) {
    const task = await tiktokCreativeStudioRepo.get(String(input.id || '').trim())
    if (!task) throw new Error('Task not found')
    const target = task.shots.find((item) => item.shotId === String(input.shotId || '').trim())
    if (!target) throw new Error('Shot task not found')
    if (!target.imagePath) throw new Error('Shot image is missing')

    const downloadDir = String(target.downloadDir || '').trim() || (await defaultDownloadDir(task.id, target.shotId))
    let nextTask = await tiktokCreativeStudioRepo.upsert(
      updateShot(task, target.shotId, (shot) => ({
        ...shot,
        downloadDir,
        status: 'running',
        lastError: undefined,
        updatedAt: now(),
        logs: [
          ...(shot.logs || []),
          buildLog('[tiktok-creative] launching Playwright automation for shot'),
          buildLog(`[tiktok-creative] download directory ready: ${downloadDir}`),
        ].slice(-200),
      })),
    )

    try {
      const prepared = await runAutomationPreparation({ taskId: nextTask.id, shot: nextTask.shots.find((item) => item.shotId === target.shotId)! })
      nextTask = await tiktokCreativeStudioRepo.upsert(
        updateShot(nextTask, target.shotId, (shot) => ({
          ...shot,
          status: 'requires_manual',
          updatedAt: now(),
          logs: [...(shot.logs || []), ...prepared.logs].slice(-200),
        })),
      )
      return nextTask
    } catch (error) {
      nextTask = await tiktokCreativeStudioRepo.upsert(
        updateShot(nextTask, target.shotId, (shot) => ({
          ...shot,
          status: 'failed',
          lastError: getErrorMessage(error, 'automation start failed'),
          updatedAt: now(),
          logs: [...(shot.logs || []), buildLog(`[tiktok-creative] automation launch failed: ${getErrorMessage(error, 'unknown error')}`, 'error')].slice(-200),
        })),
      )
      return nextTask
    }
  },

  async startNextPendingShot(input: { id: string }) {
    const task = await tiktokCreativeStudioRepo.get(String(input.id || '').trim())
    if (!task) throw new Error('Task not found')
    const nextShot =
      task.shots.find((item) => item.status === 'draft') ||
      task.shots.find((item) => item.status === 'failed') ||
      task.shots.find((item) => item.status === 'requires_manual' && !String(item.resultVideoPath || '').trim())
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
