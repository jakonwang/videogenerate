import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import PQueue from 'p-queue'
import { runFfmpeg } from '../ffmpeg/runner'
import { getAppPaths } from '../../lib/paths'
import { productsRepo } from '../products/repo'
import { cloneRepo } from '../clone/repo'
import { analyzeProductStructureWithGrs, type ProductAnalysisResult } from '../clone/aiScriptAnalyzer'
import {
  buildGptFramePrompt,
  generateGptShotFrameImage,
  generateScopedGptShotFrameImage,
  hasStrictImageEditProviderCredential,
} from '../clone/gptImage'
import { buildStoryboardImageNegativePrompt } from '../clone/service'
import { buildVideoNegativePrompt, generateShotVideoByProviderChain } from '../clone/providers'
import { buildFinalShotVideoPositivePrompt, detectProductMode } from '../clone/prompt'
import { createGrsImageTask, createGrsVideoTask, queryGrsTask } from '../clone/grsai'
import { toPublicUrlViaQiniu } from '../clone/qiniu'
import { resolveApifoxHubCredentials } from '../clone/apifoxProfile'
import { generateImage as generateApifoxImage } from '../clone/unifiedImage'
import { Ai666TaskTimeoutError, createVideoTask, queryAsyncTask, syncRemoteTaskResult } from '../clone/unifiedVideo'
import { extractJsonObjectText, extractModelMessageContent } from '../clone/aiResponse'
import { canUseMockGeneration } from '../clone/mockPolicy'
import { livePhotoRepo } from './repo'
import { packageLivePhoto } from './packager'
import type {
  CreateCloneShotLivePhotosInput,
  CreateReferenceLivePhotoInput,
  ExportLivePhotoItemsInput,
  ExportLivePhotoItemsResult,
  LivePhotoItemSummary,
  LivePhotoCloneShotSnapshot,
  LivePhotoItem,
  LivePhotoMotionTemplate,
  LivePhotoProductSnapshot,
  LivePhotoRequestPreview,
  LivePhotoTaskLog,
  LivePhotoAutoFlowStatus,
  LivePhotoWorkflow,
  LivePhotoWorkflowStep,
  RetryLivePhotoItemInput,
} from './types'
import type { AiProviderName, CloneProductType, ModelCredentials, ShotSpec } from '../clone/types'
import type { Product } from '../products/types'

type LivePhotoServiceDependencies = {
  runFfmpeg: typeof runFfmpeg
  generateGptShotFrameImage: typeof generateGptShotFrameImage
  generateShotVideoByProviderChain: typeof generateShotVideoByProviderChain
  analyzeProductStructureWithGrs: typeof analyzeProductStructureWithGrs
  reviewReferenceReplacementStillStrict: typeof reviewReferenceReplacementStillStrict
  reviewReferenceReplacementStillVisual: typeof reviewReferenceReplacementStillVisual
}

type LivePhotoVisualReviewResult = {
  passed: boolean
  skipped: boolean
  reason: string
  score: number
  verdict: 'pass' | 'fail'
  failures: string[]
  notes: string[]
  checks: Record<string, unknown>
}

type LivePhotoStrictReviewResult = {
  passed: boolean
  skipped: boolean
  reason: string
  score: number
  matchedPhrases: string[]
  missingPhrases: string[]
  negativeSignals: string[]
  analyzed: ProductAnalysisResult | null
}

type LivePhotoStillValidationResult = {
  passed: boolean
  skipped: boolean
  reason?: string
  score: number
  matched: string[]
  missing: string[]
  criticalMatchedGroups: number
  criticalGroupCount: number
  negativeSignals: string[]
  analyzed?: ProductAnalysisResult | null
  strictReview: LivePhotoStrictReviewResult
  visualReview: LivePhotoVisualReviewResult
}

type LivePhotoReplacementStrategy = 'default' | 'erase_first' | 'anchor_closeup'

type LivePhotoReplacementRenderConfig = {
  normalizeOutput: 'preserve'
  outputSize: string
  providerScope: 'live_photo_replace'
}

const livePhotoDeps: LivePhotoServiceDependencies = {
  runFfmpeg,
  generateGptShotFrameImage,
  generateShotVideoByProviderChain,
  analyzeProductStructureWithGrs,
  reviewReferenceReplacementStillStrict,
  reviewReferenceReplacementStillVisual,
}

const LIVE_PHOTO_AUTO_FLOW_CONCURRENCY = 2
const LIVE_PHOTO_AUTO_FLOW_REQUEUE_COOLDOWN_MS = 8_000
const LIVE_PHOTO_AUTO_RETRY_LIMIT = 2
const LIVE_PHOTO_REFERENCE_STILL_TIMEOUT_MS = 10 * 60 * 1000
const LIVE_PHOTO_REFERENCE_PACKAGING_TIMEOUT_MS = 90 * 1000
const LIVE_PHOTO_VIDEO_REMOTE_RETRY_MS = 5_000
const LIVE_PHOTO_VISUAL_REVIEW_REQUIRED_CHECKS = [
  'product_identity',
  'source_contamination',
  'material_color',
  'attachment_structure',
  'scale',
  'scene_preservation',
] as const

function getLivePhotoVisualMissingChecks(checks: Record<string, unknown> | null | undefined): string[] {
  const normalizedChecks = checks && typeof checks === 'object' ? checks : {}
  return LIVE_PHOTO_VISUAL_REVIEW_REQUIRED_CHECKS.filter((key) => {
    const value = String((normalizedChecks as Record<string, unknown>)?.[key] || '').trim().toLowerCase()
    return value !== 'pass' && value !== 'fail'
  })
}
const livePhotoAutoFlowQueue = new PQueue({ concurrency: LIVE_PHOTO_AUTO_FLOW_CONCURRENCY })
const livePhotoAutoFlowScheduled = new Set<string>()
const livePhotoAutoFlowLastQueuedAt = new Map<string, number>()
const livePhotoPendingTimers = new Set<ReturnType<typeof setTimeout>>()

class LivePhotoAutoFlowHandledError extends Error {
  terminal: boolean

  constructor(message: string, terminal: boolean) {
    super(message)
    this.name = 'LivePhotoAutoFlowHandledError'
    this.terminal = terminal
  }
}

function normalizeLivePhotoFailureReasonSafe(reason: string, stage?: LivePhotoWorkflowStep) {
  const text = String(reason || '').trim()
  const lower = text.toLowerCase()
  if (text.includes('[remote_pending]')) {
    const remoteTaskId = extractTaskIdFromText(text)
    const label = stage === 'video_generation' ? '视频任务已提交，正在等待远端结果。' : '图片任务已提交，正在等待远端结果。'
    return remoteTaskId ? `[remote_pending] ${label}taskId=${remoteTaskId}` : `[remote_pending] ${label}`
  }
  const imageStage = stage === 'image_generation'
  if (imageStage && isRetryableLivePhotoReviewLoadError(text)) {
    return '[remote_pending] Image validation review service is overloaded and may still recover automatically.'
  }
  const timeoutLike =
    lower.includes('timed out after') ||
    lower.includes('timeout') ||
    lower.includes('gateway timeout')
  if (imageStage && timeoutLike) {
    return '[remote_pending] Image generation timed out while waiting. The remote task may still be processing.'
  }
  if (timeoutLike) {
    return '[retryable_timeout] Current step timed out while waiting. Please retry later or inspect the task log.'
  }
  return text || 'Unknown error'
}

function extractTaskIdFromText(input: string) {
  const match = String(input || '').match(/(?:taskId|askId)=([^\s,]+)/i)
  return String(match?.[1] || '').trim()
}

function extractRemoteTaskIdFromErrorLike(input: unknown) {
  if (input && typeof input === 'object') {
    const directTaskId = String((input as { taskId?: unknown }).taskId || '').trim()
    if (directTaskId) return directTaskId
  }
  return extractTaskIdFromText(String((input as any)?.message || input || ''))
}

function buildRemotePendingError(stage: 'image' | 'video', taskId?: string) {
  const normalizedTaskId = String(taskId || '').trim()
  const label = stage === 'video' ? '视频任务已提交，正在等待远端结果。' : '图片任务已提交，正在等待远端结果。'
  return normalizedTaskId ? `[remote_pending] ${label}taskId=${normalizedTaskId}` : `[remote_pending] ${label}`
}

function normalizeRemotePendingTimeoutReason(
  item: Pick<LivePhotoItem, 'imageTaskId' | 'videoTaskId'>,
  stage: LivePhotoWorkflowStep,
  reason: string,
) {
  const text = String(reason || '').trim()
  if (!text.includes('[retryable_timeout]')) return text
  if (stage === 'image_generation') {
    const remoteTaskId = String(item.imageTaskId || '').trim()
    if (remoteTaskId) return buildRemotePendingError('image', remoteTaskId)
  }
  if (stage === 'video_generation') {
    const remoteTaskId = String(item.videoTaskId || '').trim()
    if (remoteTaskId) return buildRemotePendingError('video', remoteTaskId)
  }
  return text
}

function normalizeLivePhotoFailureReason(reason: string, stage?: LivePhotoWorkflowStep) {
  const text = String(reason || '').trim()
  const lower = text.toLowerCase()
  if (text.includes('[remote_pending]')) {
    const remoteTaskId = extractTaskIdFromText(text)
    const label = stage === 'video_generation' ? '视频任务已提交，正在等待远端结果。' : '图片任务已提交，正在等待远端结果。'
    return remoteTaskId ? `[remote_pending] ${label}taskId=${remoteTaskId}` : `[remote_pending] ${label}`
  }
  const imageStage = stage === 'image_generation'
  if (imageStage && isRetryableLivePhotoReviewLoadError(text)) {
    return '[remote_pending] Image validation review service is overloaded and may still recover automatically.'
  }
  const timeoutLike =
    lower.includes('timed out after') ||
    lower.includes('timeout') ||
        lower.includes('gateway timeout')
  if (imageStage && timeoutLike) {
    return '[remote_pending] Image generation timed out while waiting. The remote task may still be processing.'
  }
  if (timeoutLike) {
    return '[retryable_timeout] Current step timed out while waiting. Please retry later or inspect the task log.'
  }
  return text || 'Unknown error'
}

function now() {
  return Date.now()
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isRetryableLivePhotoReviewLoadError(input: unknown) {
  const text = String(input || '').toLowerCase()
  return (
    text.includes('model load is too high') ||
    text.includes('try again later') ||
    text.includes('rix_api_error')
  )
}

function mimeForImage(filePath: string) {
  const ext = extname(filePath).toLowerCase()
  if (ext === '.png') return 'image/png'
  if (ext === '.webp') return 'image/webp'
  return 'image/jpeg'
}

async function imageDataUrl(filePath: string) {
  const buf = await readFile(filePath)
  return `data:${mimeForImage(filePath)};base64,${buf.toString('base64')}`
}

function buildLivePhotoLog(message: string, level: LivePhotoTaskLog['level'] = 'info'): LivePhotoTaskLog {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    level,
    message: String(message || '').trim(),
    time: now(),
  }
}

function appendLivePhotoLogs(item: LivePhotoItem, logs: LivePhotoTaskLog[]) {
  return {
    ...item,
    logs: [...(Array.isArray(item.logs) ? item.logs : []), ...logs].slice(-200),
  }
}

function hydrateLivePhotoArtifactPaths<T extends LivePhotoItem>(item: T): T {
  const itemId = String(item?.id || '').trim()
  if (!itemId) return item
  const root = livePhotoRoot(itemId)
  const fallbackGeneratedStillPath = join(root, 'still.png')
  const fallbackMotionVideoPath = join(root, 'motion.mp4')
  const fallbackPreviewVideoPath = join(root, 'preview.mp4')
  const fallbackPosterPath = join(root, 'poster.jpg')
  const fallbackLivePhotoImagePath = join(root, 'live-photo.jpg')
  const fallbackLivePhotoVideoPath = join(root, 'live-photo.mov')
  const fallbackManifestPath = join(root, 'live-photo.json')
  return {
    ...item,
    generatedStillPath:
      String(item.generatedStillPath || '').trim() || (existsSync(fallbackGeneratedStillPath) ? fallbackGeneratedStillPath : undefined),
    motionVideoPath:
      String(item.motionVideoPath || '').trim() || (existsSync(fallbackMotionVideoPath) ? fallbackMotionVideoPath : undefined),
    previewVideoPath:
      String(item.previewVideoPath || '').trim() || (existsSync(fallbackPreviewVideoPath) ? fallbackPreviewVideoPath : undefined),
    posterPath:
      String(item.posterPath || '').trim() || (existsSync(fallbackPosterPath) ? fallbackPosterPath : undefined),
    livePhotoImagePath:
      String(item.livePhotoImagePath || '').trim() || (existsSync(fallbackLivePhotoImagePath) ? fallbackLivePhotoImagePath : undefined),
    livePhotoVideoPath:
      String(item.livePhotoVideoPath || '').trim() || (existsSync(fallbackLivePhotoVideoPath) ? fallbackLivePhotoVideoPath : undefined),
    packagingManifestPath:
      String(item.packagingManifestPath || '').trim() || (existsSync(fallbackManifestPath) ? fallbackManifestPath : undefined),
  }
}

function toLivePhotoItemSummary(item: LivePhotoItem): LivePhotoItemSummary {
  const hydrated = hydrateLivePhotoArtifactPaths(item)
  const {
    logs: _logs,
    promptPreview: _promptPreview,
    imagePromptPreview: _imagePromptPreview,
    videoPromptPreview: _videoPromptPreview,
    ...summary
  } = hydrated
  return summary
}

function safeName(input: string, fallback: string) {
  const value = String(input || '')
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '-')
    .replace(/\s+/g, ' ')
    .slice(0, 80)
  return value || fallback
}

function safeExportName(input: string, fallback: string) {
  const value = String(input || '')
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '-')
    .replace(/\s+/g, ' ')
    .slice(0, 48)
    .trim()
  return value || fallback
}

function livePhotoRoot(id: string) {
  return join(getAppPaths().dataDir, 'plugin-live-photo', id)
}

function exportRoot() {
  return join(getAppPaths().dataDir, 'exports', 'live-photo')
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

async function ensureDir(path: string) {
  await mkdir(path, { recursive: true })
}

async function downloadUrlToFile(input: { url: string; filePath: string }) {
  const res = await fetch(input.url)
  if (!res.ok) throw new Error(`Download failed HTTP ${res.status}: ${input.url}`)
  const buffer = Buffer.from(await res.arrayBuffer())
  await writeFile(input.filePath, buffer)
  return input.filePath
}

async function renderPosterFromVideo(input: { videoPath: string; posterPath: string }) {
  await livePhotoDeps.runFfmpeg({
    args: ['-y', '-ss', '0.3', '-i', input.videoPath, '-frames:v', '1', input.posterPath],
  })
}

async function normalizePreviewVideo(input: { sourceVideoPath: string; outputPath: string }) {
  await livePhotoDeps.runFfmpeg({
    args: [
      '-y',
      '-i',
      input.sourceVideoPath,
      '-t',
      '6',
      '-vf',
      'scale=720:-2:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2:black,fps=30',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-an',
      input.outputPath,
    ],
  })
}

function buildReferencePromptPreview(input: { product: LivePhotoProductSnapshot; referenceImagePath: string }) {
  return {
    title: 'Reference Replace Lock',
    instructions: [
      'Keep the same person identity, pose, framing, scene layout, lighting direction, and camera angle.',
      'Replace only the original product with the selected product.',
      `Use selected product "${input.product.name}" as the only valid product identity source.`,
      `Reference image path: ${input.referenceImagePath}`,
    ],
  }
}

function defaultWorkflowStepStatus() {
  return {
    status: 'idle' as const,
    updatedAt: now(),
    error: '',
  }
}

function buildDefaultWorkflow(): LivePhotoWorkflow {
  return {
    currentStep: 'queued',
    stepStatus: {
      queued: { status: 'running', updatedAt: now() },
      image_generation: defaultWorkflowStepStatus(),
      video_generation: defaultWorkflowStepStatus(),
      live_photo_packaging: defaultWorkflowStepStatus(),
      completed: defaultWorkflowStepStatus(),
    },
    updatedAt: now(),
  }
}

function buildDefaultAutoFlowStatus(): LivePhotoAutoFlowStatus {
  return {
    enabled: true,
    status: 'idle',
    retryLimit: LIVE_PHOTO_AUTO_RETRY_LIMIT,
    retryCount: 0,
    currentStage: 'queued',
    lastError: '',
  }
}

function ensureAutoFlowStatus(item: LivePhotoItem) {
  const current = item.autoFlowStatus || buildDefaultAutoFlowStatus()
  item.autoFlowStatus = {
    enabled: current.enabled !== false,
    status:
      current.status === 'running' ||
      current.status === 'done' ||
      current.status === 'failed_retryable' ||
      current.status === 'failed_terminal'
        ? current.status
        : 'idle',
    paused: Boolean(current.paused),
    retryLimit: Number(current.retryLimit ?? LIVE_PHOTO_AUTO_RETRY_LIMIT) || LIVE_PHOTO_AUTO_RETRY_LIMIT,
    retryCount: Math.max(0, Number(current.retryCount ?? 0) || 0),
    currentStage: current.currentStage || 'queued',
    lastStartedAt: Number(current.lastStartedAt ?? 0) || undefined,
    lastCompletedAt: Number(current.lastCompletedAt ?? 0) || undefined,
    lastError: String(current.lastError || '').trim() || '',
  }
  return item.autoFlowStatus
}

function patchAutoFlowStatus(
  item: LivePhotoItem,
  currentStage: LivePhotoWorkflowStep,
  status: LivePhotoAutoFlowStatus['status'],
  error = '',
) {
  const current = ensureAutoFlowStatus(item)
  item.autoFlowStatus = {
    ...current,
    status,
    currentStage,
    lastStartedAt: status === 'running' ? now() : current.lastStartedAt,
    lastCompletedAt: status === 'done' ? now() : current.lastCompletedAt,
    lastError: status === 'failed_retryable' || status === 'failed_terminal' ? String(error || '').trim() : '',
  }
  return item.autoFlowStatus
}

function patchWorkflow(
  workflow: LivePhotoWorkflow | undefined,
  currentStep: LivePhotoWorkflowStep,
  step: LivePhotoWorkflowStep,
  status: 'idle' | 'running' | 'done' | 'failed',
  error = '',
): LivePhotoWorkflow {
  const base = workflow || buildDefaultWorkflow()
  return {
    ...base,
    currentStep,
    stepStatus: {
      ...base.stepStatus,
      [step]: {
        status,
        updatedAt: now(),
        error: status === 'failed' ? String(error || '') : '',
      },
    },
    updatedAt: now(),
  }
}

function livePhotoVideoProviderChain(credentials: ModelCredentials): AiProviderName[] {
  if (
    canUseMockGeneration(credentials) &&
    !String(credentials.seedanceApiKey || '').trim() &&
    !String(credentials.klingApiKey || '').trim() &&
    !String(credentials.grsaiApiKey || '').trim() &&
    !String(resolveApifoxHubCredentials(credentials, 'video')?.apiKey || '').trim()
  ) {
    return []
  }
  const primary = credentials.videoProviderPrimary
  if (primary === 'apifox_hub') {
    const cfg = resolveApifoxHubCredentials(credentials, 'video')
    if (!cfg?.enabled || !String(cfg.apiKey || '').trim()) {
      throw new Error('Current video provider is selected as XIBAPI/Apifox Hub, but it is not enabled or missing API key.')
    }
  }
  const preferred = [
    credentials.videoProviderPrimary,
    credentials.videoProviderFallback,
    'seedance',
    'kling',
    'grsai',
    'apifox_hub',
  ].filter((value, index, list): value is AiProviderName => Boolean(value) && list.indexOf(value) === index)
  const chain: AiProviderName[] = []
  for (const provider of preferred) {
    if (provider === 'apifox_hub') {
      const cfg = resolveApifoxHubCredentials(credentials, 'video')
      if (cfg?.enabled && String(cfg.apiKey || '').trim()) chain.push(provider)
      continue
    }
    if (provider === 'grsai') {
      if (String(credentials.grsaiApiKey || '').trim()) chain.push(provider)
      continue
    }
    if (provider === 'seedance') {
      if (String(credentials.seedanceApiKey || '').trim()) chain.push(provider)
      continue
    }
    if (provider === 'kling') {
      if (String(credentials.klingApiKey || '').trim()) chain.push(provider)
      continue
    }
    chain.push(provider)
  }
  return chain.length ? chain : ['grsai']
}

function livePhotoMotionText(template: LivePhotoMotionTemplate) {
  if (template === 'push_out') return 'single slow pull-back motion with stable framing'
  if (template === 'ambient_sway') return 'very subtle handheld micro-motion only, with stable composition'
  return 'single slow push-in motion with stable framing'
}

function buildLivePhotoVideoPrompts(input: {
  shot: ShotSpec
  item: LivePhotoItem
}) {
  const normalizedAnalysis = normalizeLivePhotoProductAnalysis(input.item.productSnapshot?.productAnalysis)
  const categorySpecificRules = input.item.productSnapshot
    ? buildLivePhotoCategorySpecificPromptRules(input.item.productSnapshot, 'video')
    : []
  const referenceImagePath = String(input.item.generatedStillPath || input.item.referenceImagePath || '').trim()
  const providerRolePrefix = referenceImagePath
    ? [
        'PROVIDER INPUT ROLE LOCK:',
        'The uploaded image array contains exactly 1 image.',
        'The uploaded image is the locked still scene and product anchor image.',
        'Treat this single image as the only visual truth for every frame in the video.',
        'Do not consult, infer, blend, or synthesize any alternate product view.',
        `Locked still path: ${referenceImagePath}.`,
      ].join('\n')
    : ''
  const positivePrompt = [
    ...(providerRolePrefix ? [providerRolePrefix, ''] : []),
    'ROLE:',
    'You are a product-motion video system for a locked still image.',
    '',
    'GOAL:',
    'Create a realistic 6-second product close-up clip with extremely subtle motion.',
    '',
    'CORE LOCK:',
    '',
    'Keep:',
    '',
    '* same crop',
    '* same pose',
    '* same framing',
    '* same scene',
    '* same visible subject portion',
    '* same exact visible product instance',
    '* same exact product size',
    '',
    '---',
    '',
    'STRUCTURE LOCK:',
    '',
    '* Preserve the exact visible structure, silhouette, proportions, connection points, orientation, and local anchor placement from the locked still.',
    '* Preserve the exact same visible product geometry from the locked still.',
    '* The product in every frame must remain the same single product instance, not a regenerated approximation.',
    '* Keep exact clasp logic, hinge logic, connector spacing, stone count, edge rhythm, thickness, and attachment layout when visible.',
    '* The locked still image is the master product structure reference for the video stage.',
    '',
    'NO INFERENCE RULE:',
    '',
    '* Do not infer, reconstruct, redesign, beautify, simplify, or generate unseen product parts.',
    '* Do not average multiple possible shapes.',
    '* Do not fabricate a cleaner, more symmetric, or more readable version of the product.',
    '* If a detail is ambiguous, keep the locked-still interpretation instead of inventing a new structure.',
    '* If motion would require rebuilding the product, suppress motion instead of changing product structure.',
    '',
    'FRAME-TO-FRAME IDENTITY LOCK:',
    '',
    '* Treat the product as the exact same frozen object instance across all frames.',
    '* Do not morph, wobble, stretch, re-topologize, thicken, thin, bend, or re-attach any product part between frames.',
    '* Do not introduce new perspective-derived product geometry that is not already supported by the locked still.',
    '* If any frame starts to change product silhouette or connector layout, keep the previous frame identity instead.',
    '',
    'REFERENCE PRIORITY:',
    '',
    '* The locked still image is both the scene anchor and the product identity anchor for the video stage.',
    '* Do not introduce any alternate product interpretation beyond what is already visible in the locked still image.',
    '* The locked still anchor controls scene, crop, pose, anchor position, visible product pose, and visible product structure.',
    '* If motion conflicts with exact product identity, preserve the locked still identity and suppress motion.',
    '',
    ...(categorySpecificRules.length ? [...categorySpecificRules, ''] : []),
    ...(normalizedAnalysis
      ? [
          'PRODUCT DNA LOCK:',
          '',
          normalizedAnalysis.category ? `Category: ${normalizedAnalysis.category}.` : '',
          normalizedAnalysis.summary ? `Summary: ${normalizedAnalysis.summary}.` : '',
          normalizedAnalysis.coreSubject ? `Core subject: ${normalizedAnalysis.coreSubject}.` : '',
          normalizedAnalysis.connectionStructure ? `Connection structure: ${normalizedAnalysis.connectionStructure}.` : '',
          normalizedAnalysis.materialDetails ? `Material details: ${normalizedAnalysis.materialDetails}.` : '',
          normalizedAnalysis.surfaceDetails ? `Surface details: ${normalizedAnalysis.surfaceDetails}.` : '',
          normalizedAnalysis.colorDetails ? `Color details: ${normalizedAnalysis.colorDetails}.` : '',
          normalizedAnalysis.geometryDetails ? `Geometry details: ${normalizedAnalysis.geometryDetails}.` : '',
          normalizedAnalysis.sizeScale ? `Size scale: ${normalizedAnalysis.sizeScale}.` : '',
          normalizedAnalysis.wearingPosition ? `Wearing position: ${normalizedAnalysis.wearingPosition}.` : '',
          ...(Array.isArray(normalizedAnalysis.matchingRules)
            ? normalizedAnalysis.matchingRules.map((rule, index) => `Matching rule ${index + 1}: ${rule}.`)
            : []),
          '',
        ].filter(Boolean)
      : []),
    'FAIL-CLOSED PRODUCT IDENTITY RULE:',
    '',
    '* Do not add any pearl, pendant, charm, extra dangling drop, extra loop, extra bow layer, extra gemstone cluster, or extra decorative volume that is not clearly present in the locked still image.',
    '* Do not upscale a petite or small product into a larger statement piece.',
    '* Do not convert a simple product into a richer, heavier, longer, or more luxurious-looking version.',
    '* If motion would cause the product to become larger, more decorative, or structurally richer, keep the product exactly as shown in the locked still image and suppress motion further.',
    '',
    'SCALE LOCK:',
    '',
    '* Keep the exact same product footprint size and product-to-scene ratio from the locked still.',
    '* Do not enlarge the product for readability, drama, or emphasis.',
    '* Do not shrink the surrounding scene, face, ear, hand, or body area to make the product appear larger.',
    '* The apparent product size change across the full clip must stay tiny and come only from the ultra slow micro push-in.',
    '* If any frame tends to enlarge, stylize, or simplify the product, keep the earlier locked-still scale instead.',
    '',
    '---',
    '',
    'CAMERA:',
    '',
    'Use ONLY one motion:',
    '',
    '-> ultra slow micro push-in',
    '',
    'STRICT RULES:',
    '',
    '* total movement distance is very small (barely noticeable)',
    '* apparent size change across the full clip must remain minimal',
    '* movement must be uniform and linear across full 6 seconds',
    '* treat the clip as a near-static hold with only a tiny residual push-in',
    '* if motion causes any structure drift, reduce motion further until the product stays stable',
    '* no acceleration',
    '* no deceleration',
    '* no reverse motion',
    '* no handheld swing',
    '* no floating drift larger than a tiny micro shift',
    '* no jitter',
    '* no vibration',
    '',
    'FORBIDDEN:',
    '',
    '* fast push or pull',
    '* zoom in then out',
    '* noticeable camera travel',
    '* multi-direction movement',
    '* side-to-side sway',
    '* orbiting motion',
    '* reframing during the clip',
    '* fast approach toward the product',
    '* scale pumping',
    '',
    'The video should feel almost static.',
    '',
    '---',
    '',
    'LIGHTING:',
    '',
    '* natural daylight only',
    '* soft, diffused light',
    '* stable exposure across entire clip',
    '',
    'FORBIDDEN:',
    '',
    '* lighting change',
    '* flicker',
    '* artificial glow or bloom',
    '',
    'ALLOW:',
    '',
    '* normal real-world reflections (metal, glass, leather)',
    '',
    '---',
    '',
    'PRODUCT BEHAVIOR (IMPORTANT):',
    '',
    'Adjust based on product type:',
    '',
    '* rigid products -> no deformation',
    '* flexible products -> allow natural deformation',
    '* reflective products -> allow natural reflections',
    '',
    'DO NOT:',
    '',
    '* distort structure',
    '* redesign product',
    '* re-interpret the product shape',
    '* replace the product with a cleaner substitute',
    '',
    '---',
    '',
    'MOTION RULE:',
    '',
    '* only micro natural movement allowed',
    '* no exaggerated motion',
    '* no intentional animation',
    '* do not expand the crop to reveal new visible face regions or new body regions',
    '* if the starting still has no visible hands or fingers, every frame must remain completely free of added hands, fingers, palms, wrists, forearms, or skin-contact gestures',
    '* if the starting still is a product-only or flat-lay scene, keep it product-only and do not introduce any new body parts at all',
    '',
    'BODY-CONTROL RULE:',
    '',
    '* preserve the exact same visible crop boundaries from the starting still',
    '* do not reveal a full face, eyes, nose, mouth, or a wider identity-bearing portrait view',
    '* keep the clip as a partial non-identity-bearing crop only',
    '* do not transform the partial crop into a recognizable real-person portrait',
    '* do not sharpen, uncover, reconstruct, complete, or reveal identity-bearing face details',
    '* do not add hands, fingers, palms, wrists, forearms, or skin-contact gestures that are not already visible in the starting still',
    '* do not introduce holding, pinching, gripping, presenting, or touching actions around the product',
    '* do not let any hand enter from the edge of the frame later in the clip',
    '* do not add any off-frame person presence whose body parts newly appear in frame',
    '',
    'If a partial body crop already exists:',
    '',
    '* keep it partial and non-identity-bearing',
    '* allow only tiny natural movement without revealing more anatomy',
    '',
    '---',
    '',
    'STYLE:',
    '',
    '* natural product close-up capture',
    '* clean casual e-commerce realism',
    '* soft everyday camera feel',
    '',
    '---',
    '',
    'ANTI-OVERGENERATION:',
    '',
    'Do NOT make the product:',
    '',
    '* bigger',
    '* clearer',
    '* shinier',
    '* more prominent',
    '',
    '---',
    '',
    'OUTPUT:',
    '',
    '* 6-second video',
    '* extremely subtle motion',
    '* visually almost static',
    '* perfect product consistency',
    '* no newly revealed identity-bearing face content',
    '* zero product reconstruction',
    '',
    'The product must remain visually identical across all frames.',
  ].join('\n')
  const negativePrompt = [
    'product reconstruction',
    'product redesign',
    'wrong product identity',
    'product morphing',
    'product silhouette drift',
    'wrong product scale',
    'scale drift',
    'camera jitter',
    'strong shake',
    'fast zoom',
    'extra pearl',
    'dangling pearl',
    'extra bow',
    'extra dangling ornament',
    'statement earring',
    'chandelier earring',
    'luxury oversized earring',
    buildVideoNegativePrompt(
    input.shot,
    [
      'different visible crop',
      'identity drift',
      'newly revealed face',
      'full face reveal',
      'recognizable face',
      'identity-bearing portrait',
      'clear real-person face',
      'celebrity',
      'public figure',
      'eyes',
      'nose',
      'mouth',
      'different pose',
      'different scene',
      'different product',
      'new body parts',
      'extra hands',
      'extra fingers',
      'palms',
      'wrists',
      'forearms',
      'arms',
      'product redesign',
      'distorted structure',
      'exaggerated structure',
      'forced human interaction',
      'hand entering frame',
      'hand from edge',
      'skin contact',
      'holding product',
      'gripping product',
      'pinching product',
      'presenting gesture',
      'direct touching',
      'touching product',
      'exaggerated animation',
      'sudden movement',
      'fast zoom',
      'rapid push in',
      'camera jitter',
      'camera vibration',
      'handheld sway',
      'reframing',
      'crop drift',
      'strong shake',
      'oversized product',
      'enlarged product',
      'wrong product scale',
      'scale drift',
      'product size drift',
      'product morphing',
      'product warping',
      'product wobble',
      'product silhouette drift',
      'connector drift',
      'parallax stretch',
      'perspective drift',
      'glow',
      'sparkle',
      'bloom',
      'artificial highlights',
      'cinematic lighting',
      'camera sweep',
      'camera orbit',
      'over-stabilized',
      'over-clean',
      'talking',
      'text',
      'watermark',
      'logo',
    ].join(', '),
    ),
  ]
    .filter(Boolean)
    .join(', ')
  return { positivePrompt, negativePrompt }
}

function resolveLivePhotoProductReferencePaths(product: Product) {
  const livePhotoReferenceImagePath = String((product as any).livePhotoReferenceImagePath || '').trim()
  const analysisBoardPath = String((product as any).analysisBoardPath || '').trim()
  const canonicalSourcePath = String((product as any).canonicalSourcePath || '').trim()
  const preferredRefs = analysisBoardPath
    ? [analysisBoardPath]
    : canonicalSourcePath
    ? [canonicalSourcePath]
    : livePhotoReferenceImagePath
    ? [livePhotoReferenceImagePath]
    : []
  return Array.from(new Set(preferredRefs.filter(Boolean))).filter((item) => existsSync(item))
}

function resolveLivePhotoAuthoritativeReferencePath(product: Product, fallbackRefs: string[] = []) {
  const livePhotoReferenceImagePath = String((product as any).livePhotoReferenceImagePath || '').trim()
  const analysisBoardPath = String((product as any).analysisBoardPath || '').trim()
  const canonicalSourcePath = String((product as any).canonicalSourcePath || '').trim()
  const coverImagePath = String((product as any).coverImagePath || '').trim()
  const candidates = [
    analysisBoardPath,
    canonicalSourcePath,
    ...fallbackRefs.map((item) => String(item || '').trim()),
    livePhotoReferenceImagePath,
    coverImagePath,
  ].filter(Boolean)
  return candidates.find((item) => existsSync(item)) || ''
}

function resolveAuthoritativeProductReferencePath(product: Pick<LivePhotoProductSnapshot, 'authoritativeProductReferencePath' | 'imagePaths' | 'coverImagePath'>) {
  const candidates = [
    String(product.authoritativeProductReferencePath || '').trim(),
    ...(Array.isArray(product.imagePaths) ? product.imagePaths.map((item) => String(item || '').trim()) : []),
    String(product.coverImagePath || '').trim(),
  ].filter(Boolean)
  return candidates.find((item) => existsSync(item)) || ''
}

function resolveExplicitLivePhotoReferenceImagePath(product: Product) {
  const livePhotoReferenceImagePath = String((product as any).livePhotoReferenceImagePath || '').trim()
  const analysisBoardPath = String((product as any).analysisBoardPath || '').trim()
  const canonicalSourcePath = String((product as any).canonicalSourcePath || '').trim()
  if (!livePhotoReferenceImagePath || !existsSync(livePhotoReferenceImagePath)) return ''
  if (analysisBoardPath && livePhotoReferenceImagePath === analysisBoardPath && existsSync(analysisBoardPath)) return livePhotoReferenceImagePath
  if (canonicalSourcePath && livePhotoReferenceImagePath === canonicalSourcePath && existsSync(canonicalSourcePath)) return livePhotoReferenceImagePath
  if (!analysisBoardPath && !canonicalSourcePath) return ''
  return ''
}

function hasLivePhotoStructuredProductReference(product: Product) {
  const livePhotoReferenceImagePath = String((product as any).livePhotoReferenceImagePath || '').trim()
  const analysisBoardPath = String((product as any).analysisBoardPath || '').trim()
  const canonicalSourcePath = String((product as any).canonicalSourcePath || '').trim()
  return Boolean(
    (livePhotoReferenceImagePath && existsSync(livePhotoReferenceImagePath)) ||
    (analysisBoardPath && existsSync(analysisBoardPath)) ||
    (canonicalSourcePath && existsSync(canonicalSourcePath)) ||
    false,
  )
}

function buildLivePhotoVideoShotSpec(input: {
  item: LivePhotoItem
  product?: LivePhotoProductSnapshot
  template: LivePhotoMotionTemplate
  startFramePath: string
}): ShotSpec {
  const sourceLabel = input.item.sourceShotLabel || input.product?.name || 'live photo'
  const shot: ShotSpec = {
    id: input.item.id,
    index: 0,
    purpose: 'solution',
    startSec: 0,
    endSec: 6,
    durationSec: 6,
    motion: input.template === 'push_out' ? 'zoom_out' : input.template === 'ambient_sway' ? 'shake' : 'zoom_in',
    replaceMode: 'ai_generate',
    productType:
      String(input.product?.type || '').trim().toLowerCase() === 'earring' ||
      String(input.product?.type || '').trim().toLowerCase() === 'earrings'
        ? 'earrings'
        : input.product?.type === 'phone_case' || input.product?.type === 'clothes' || input.product?.type === 'toy'
          ? input.product.type
          : 'general',
    productReferenceImagePaths: [],
    productMainImage: input.product?.coverImagePath || input.startFramePath,
    generatedFirstFramePath: input.startFramePath,
    generatedLastFramePath: input.startFramePath,
    scriptText: `Live Photo motion preview for ${sourceLabel}.`,
    scriptRole: 'show',
    visualDescription: 'Keep the same exact product instance, exact visible structure, correct proportions, and exact anchor placement from the locked still.',
    actionDescription: 'Generate only ultra-minimal natural camera motion, with zero product reconstruction, zero added body parts, and zero scene reinterpretation.',
    cameraDescription: 'Locked close-up camera with an ultra slow micro push-in only, nearly static across the full 6 seconds, with no noticeable shake, drift, or reframing.',
    productFocus: 'Preserve the exact same product identity, structure, micro-details, and anchor placement shown in the locked reference still.',
    generationPrompt: [
      'Create a realistic 6-second product close-up video.',
      'Keep the same exact product instance, correct proportions, exact anchor placement, and exact visible geometry.',
      'Use an ultra slow micro push-in only, with nearly static framing and no noticeable shake or drift.',
      'Do not infer unseen structure, do not rebuild the product, and do not redesign any visible detail.',
      'Do not add any person, hand, finger, palm, wrist, or body interaction that is not already visible in the starting still.',
      'Natural ambient light only, with real-world reflections and no artificial enhancement.',
    ].join(' '),
    scriptConfidence: 1,
    framing: 'closeup',
    cameraMovement: 'Ultra slow micro push-in only with nearly static framing and no noticeable shake',
    action: 'Minimal camera motion only, with zero product reconstruction, zero reframing, and zero added human interaction or added body parts.',
    productVisibility: 'high',
    replacementMode: 'ai_generate',
    aiDifficulty: 'low',
    realismRisk: 'low',
    realismStyle: 'product_closeup',
    forceAi: true,
    locked: true,
    status: 'ready',
    visual: `${sourceLabel} live photo motion clip`,
    subtitleSuggestion: '',
    materialNeed: 'selected product snapshot and locked still frame',
    sourceMode: 'ai',
    uploadedAssetIds: [],
    aiEnabled: true,
    reviewStatus: 'pending',
    consistencyMode: 'strict',
    promptCompilerVersion: 'live-photo-v1',
    prompt: {
      positive: '',
      negative: '',
      cameraMotion: 'Ultra slow micro push-in only with nearly static framing and no noticeable shake',
      aspectRatio: '9:16',
    },
  }
  const { positivePrompt, negativePrompt } = buildLivePhotoVideoPrompts({ shot, item: input.item })
  return {
    ...shot,
    promptHint: positivePrompt,
    negativePromptHint: negativePrompt,
    aiPrompt: positivePrompt,
    negativePrompt,
    compiledPrompt: positivePrompt,
    compiledNegativePrompt: negativePrompt,
    prompt: {
      positive: positivePrompt,
      negative: negativePrompt,
      cameraMotion: 'Ultra slow micro push-in only with nearly static framing and no noticeable shake',
      aspectRatio: '9:16',
    },
  }
}

async function generateAiMotionVideoFromStill(input: {
  item: LivePhotoItem
  product?: LivePhotoProductSnapshot
  stillPath: string
  outputDir: string
  template: LivePhotoMotionTemplate
}) {
  const credentials = await cloneRepo.getCredentials()
  const shot = buildLivePhotoVideoShotSpec({
    item: input.item,
    product: input.product,
    template: input.template,
    startFramePath: input.stillPath,
  })
  const generated = await livePhotoDeps.generateShotVideoByProviderChain({
    shot,
    outDir: input.outputDir,
    startFramePath: input.stillPath,
    endFramePath: input.stillPath,
    consistencyMode: 'hard',
    credentials,
    chain: livePhotoVideoProviderChain(credentials),
    compiledPrompt: shot.prompt?.positive,
    compiledNegativePrompt: shot.prompt?.negative,
  })
  return generated.outputFilePath
}

async function pollLivePhotoVideoTask(input: {
  item: LivePhotoItem
  credentials: ModelCredentials
  outputDir: string
}) {
  const taskId = String(input.item.videoTaskId || '').trim()
  if (!taskId) throw new Error('Please generate or assign a structured product reference before creating a Live Photo task.')
  if (String(input.item.videoTaskProvider || '').trim() === 'grsai') {
    const snapshot = await queryGrsTask(input.credentials, taskId)
    if (snapshot.status === 'failed' || snapshot.status === 'error' || snapshot.status === 'cancelled' || snapshot.status === 'canceled') {
      throw new Error(snapshot.errorMessage || `GRS.AI video task failed: ${taskId}`)
    }
    if (!snapshot.outputUrl) return { synced: false as const, outputPath: undefined, raw: snapshot.raw }
    await ensureDir(input.outputDir)
    const outputPath = join(input.outputDir, `live_photo_${Date.now()}_${randomUUID()}.mp4`)
    await downloadUrlToFile({ url: snapshot.outputUrl, filePath: outputPath })
    return { synced: true as const, outputPath, raw: snapshot.raw }
  }
  const synced = await syncRemoteTaskResult({
    credentials: input.credentials,
    taskId,
    outDir: input.outputDir,
    baseUrl: input.item.videoTaskBaseUrl,
    endpointStyle: input.item.videoTaskEndpointStyle,
    model: input.item.videoTaskModel,
  })
  return synced
}

async function buildProductSnapshot(productId: string): Promise<LivePhotoProductSnapshot> {
  const products = await productsRepo.list()
  const product = products.find((item) => item.id === productId)
  if (!product) throw new Error('Selected product does not exist')
  if (!hasLivePhotoStructuredProductReference(product)) {
    throw new Error('Please generate or assign a structured product reference before creating a Live Photo task.')
  }
  const imagePaths = resolveLivePhotoProductReferencePaths(product)
  if (!imagePaths.length) {
    throw new Error('Please generate or assign a structured product reference before creating a Live Photo task.')
  }
  const authoritativeProductReferencePath = resolveLivePhotoAuthoritativeReferencePath(product, imagePaths)
  if (!authoritativeProductReferencePath) {
    throw new Error('Selected product does not have a valid authoritative Live Photo reference image.')
  }
  const productAnalysis = await ensureLivePhotoProductAnalysis(product, authoritativeProductReferencePath)
  const coverImagePath = authoritativeProductReferencePath || imagePaths[0] || undefined
  return {
    id: product.id,
    name: product.name,
    type: product.type,
    coverImagePath,
    authoritativeProductReferencePath,
    imagePaths: [authoritativeProductReferencePath],
    productAnalysis,
  }
}

function scheduleLivePhotoTimer(callback: () => void, delayMs: number) {
  const timer = setTimeout(() => {
    livePhotoPendingTimers.delete(timer)
    callback()
  }, delayMs)
  livePhotoPendingTimers.add(timer)
  return timer
}

function clearLivePhotoPendingTimers() {
  for (const timer of livePhotoPendingTimers) clearTimeout(timer)
  livePhotoPendingTimers.clear()
}

async function drainLivePhotoAutoFlowForTests() {
  clearLivePhotoPendingTimers()
  await Promise.race([
    livePhotoAutoFlowQueue.onIdle(),
    new Promise<void>((resolve) => {
      scheduleLivePhotoTimer(resolve, 2_000)
    }),
  ])
}

function toCloneProductType(productType: string): CloneProductType {
  const normalized = String(productType || '').trim().toLowerCase()
  if (normalized === 'earrings' || normalized === 'earring') return 'earrings'
  if (normalized === 'phone_case') return 'phone_case'
  if (normalized === 'clothes') return 'clothes'
  if (normalized === 'toy') return 'toy'
  return 'general'
}

function containsCjkText(value: string) {
  return /[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(String(value || ''))
}

function shouldRefreshLivePhotoProductAnalysis(product: Product, productAnalysis: any) {
  if (!productAnalysis || typeof productAnalysis !== 'object') return false
  const expectedType = toCloneProductType(String(product.type || '').trim())
  const normalizedCategory = String(productAnalysis?.category || '').trim().toLowerCase()
  const normalizedSummary = String(productAnalysis?.summary || '').trim().toLowerCase()
  const normalizedCoreSubject = String(productAnalysis?.coreSubject || '').trim().toLowerCase()
  const normalizedConnection = String(productAnalysis?.connectionStructure || '').trim().toLowerCase()
  const normalizedGeometry = String(productAnalysis?.geometryDetails || '').trim().toLowerCase()
  const fields = [
    productAnalysis.summary,
    productAnalysis.coreSubject,
    productAnalysis.connectionStructure,
    productAnalysis.materialDetails,
    productAnalysis.wearingPosition,
    productAnalysis.surfaceDetails,
    productAnalysis.colorDetails,
    productAnalysis.geometryDetails,
    productAnalysis.sizeScale,
    productAnalysis.rawDescription,
    ...(Array.isArray(productAnalysis.matchingRules) ? productAnalysis.matchingRules : []),
  ]
  const joined = fields.map((item) => String(item || '').trim()).filter(Boolean).join('\n')
  if (!joined) return false
  if (containsCjkText(joined)) return true
  if (expectedType === 'earrings' && normalizedCategory !== 'earrings') return true
  const looksGenericFallback =
    normalizedCategory === 'general' &&
    (
      normalizedSummary.includes('single-source product dna for the same product') ||
      normalizedCoreSubject.includes('the same single product instance with no replacement and no redesign') ||
      normalizedConnection.includes('keep all stable connection points') ||
      normalizedGeometry.includes('keep silhouette, thickness, length, proportions, curvature, component count, and relative placement')
    )
  return looksGenericFallback
}

async function ensureLivePhotoProductAnalysis(product: Product, authoritativeProductReferencePath: string) {
  const currentAnalysis = (product as any).productAnalysis
  if (!shouldRefreshLivePhotoProductAnalysis(product, currentAnalysis)) {
    return currentAnalysis
  }
  const fallbackType = toCloneProductType(String(product.type || '').trim())
  const analyzed = await livePhotoDeps.analyzeProductStructureWithGrs({
    credentials: await cloneRepo.getCredentials(),
    productReferenceImagePaths: [authoritativeProductReferencePath],
    productCategory: fallbackType,
    locale: 'zh-CN',
  })
  const normalized = {
    category: String(analyzed.category || fallbackType).trim().toLowerCase() === 'earring' ? 'earrings' : String(analyzed.category || fallbackType).trim(),
    summary: String(analyzed.summary || '').trim(),
    coreSubject: String(analyzed.coreSubject || '').trim(),
    connectionStructure: String(analyzed.connectionStructure || '').trim(),
    materialDetails: String(analyzed.materialDetails || '').trim(),
    wearingPosition: String(analyzed.wearingPosition || '').trim(),
    surfaceDetails: String(analyzed.surfaceDetails || '').trim(),
    colorDetails: String(analyzed.colorDetails || '').trim(),
    geometryDetails: String(analyzed.geometryDetails || '').trim(),
    sizeScale: String(analyzed.sizeScale || '').trim(),
    matchingRules: Array.isArray(analyzed.matchingRules) ? analyzed.matchingRules.map((item) => String(item || '').trim()).filter(Boolean) : [],
    rawDescription: String(analyzed.rawDescription || '').trim(),
    updatedAt: now(),
  }
  await productsRepo.upsert({
    ...product,
    productAnalysis: normalized,
  } as any)
  return normalized
}

function resolveAuthoritativeLivePhotoProductRefs(product: Pick<LivePhotoProductSnapshot, 'authoritativeProductReferencePath' | 'imagePaths' | 'coverImagePath'>) {
  const candidates = [
    String(product.authoritativeProductReferencePath || '').trim(),
    ...(Array.isArray(product.imagePaths) ? product.imagePaths.map((item) => String(item || '').trim()) : []),
    String(product.coverImagePath || '').trim(),
  ].filter(Boolean)
  const deduped = Array.from(new Set(candidates)).filter((item) => existsSync(item))
  return deduped.length ? [deduped[0]] : []
}

function resolveLivePhotoReferenceImagePayload(input: {
  referenceImagePath: string
  product: Pick<LivePhotoProductSnapshot, 'authoritativeProductReferencePath' | 'imagePaths' | 'coverImagePath'>
}) {
  const referenceImagePath = String(input.referenceImagePath || '').trim()
  if (!referenceImagePath || !existsSync(referenceImagePath)) {
    throw new Error('Reference image does not exist')
  }
  const productReferenceImagePaths = resolveAuthoritativeLivePhotoProductRefs(input.product)
  if (!productReferenceImagePaths.length) {
    throw new Error('Selected product does not have usable reference images')
  }
  const imagePaths = [referenceImagePath, productReferenceImagePaths[0]].filter(Boolean)
  if (imagePaths.length !== 2) {
    throw new Error('Live Photo image generation requires exactly two bound reference images.')
  }
  return {
    referenceImagePath,
    productReferenceImagePaths,
    imagePaths,
  }
}

function normalizeLivePhotoProductAnalysis(input: LivePhotoProductSnapshot['productAnalysis']) {
  if (!input) return undefined
  return {
    category: String(input.category || '').trim(),
    summary: String(input.summary || '').trim(),
    coreSubject: String(input.coreSubject || '').trim(),
    connectionStructure: String(input.connectionStructure || '').trim(),
    materialDetails: String(input.materialDetails || '').trim(),
    wearingPosition: String(input.wearingPosition || '').trim(),
    surfaceDetails: String(input.surfaceDetails || '').trim(),
    colorDetails: String(input.colorDetails || '').trim(),
    geometryDetails: String(input.geometryDetails || '').trim(),
    sizeScale: String(input.sizeScale || '').trim(),
    matchingRules: Array.isArray(input.matchingRules) ? input.matchingRules.map((item) => String(item || '').trim()).filter(Boolean) : [],
    rawDescription: String(input.rawDescription || '').trim(),
  }
}

function isEarringLikeLivePhotoProduct(product: Pick<LivePhotoProductSnapshot, 'type' | 'productAnalysis'>) {
  const normalizedType = String(product.type || '').trim().toLowerCase()
  const normalizedCategory = String(product.productAnalysis?.category || '').trim().toLowerCase()
  const analysisHints = [
    product.productAnalysis?.summary,
    product.productAnalysis?.coreSubject,
    product.productAnalysis?.connectionStructure,
    product.productAnalysis?.geometryDetails,
    ...(Array.isArray(product.productAnalysis?.matchingRules) ? product.productAnalysis?.matchingRules : []),
  ]
    .map((item) => String(item || '').trim().toLowerCase())
    .filter(Boolean)
    .join('\n')
  return (
    normalizedType === 'earring' ||
    normalizedType === 'earrings' ||
    normalizedCategory === 'earring' ||
    normalizedCategory === 'earrings' ||
    analysisHints.includes(' earring') ||
    analysisHints.startsWith('earring') ||
    analysisHints.includes('earrings') ||
    analysisHints.includes('hoop earring')
  )
}

function isStructuralLivePhotoMatchingRule(rule: string) {
  const text = String(rule || '').trim().toLowerCase()
  if (!text) return false
  if (
    text.includes('casual wear') ||
    text.includes('semi-formal') ||
    text.includes('formal wear') ||
    text.includes('everyday wear') ||
    text.includes('elegant') ||
    text.includes('pairing') ||
    text.includes('accessories') ||
    text.includes('display on clean') ||
    text.includes('celestial themes')
  ) {
    return false
  }
  return true
}

function inferLivePhotoReplacementStrategy(input: { item: LivePhotoItem; product: LivePhotoProductSnapshot }): LivePhotoReplacementStrategy {
  const retryCount = Math.max(0, Number(input.item.autoFlowStatus?.retryCount ?? 0) || 0)
  const failureSignals = [
    String(input.item.autoFlowStatus?.lastError || '').trim(),
    String(input.item.error || '').trim(),
    ...(Array.isArray(input.item.logs)
      ? input.item.logs.slice(-12).map((entry) => String(entry?.message || '').trim())
      : []),
  ]
    .filter(Boolean)
    .join('\n')
    .toLowerCase()
  const isEarring = isEarringLikeLivePhotoProduct(input.product)
  const analysis = normalizeLivePhotoProductAnalysis(input.product.productAnalysis)
  const isWearableContext = Boolean(
    analysis?.wearingPosition ||
      String(analysis?.category || '').trim().toLowerCase() === 'jewelry' ||
      String(analysis?.category || '').trim().toLowerCase() === 'earrings' ||
      analysis?.sizeScale ||
      analysis?.connectionStructure,
  )
  if ((isEarring || isWearableContext) && retryCount <= 0) {
    return 'anchor_closeup'
  }
  if (
    (retryCount >= 1 || failureSignals.includes('validation_category:')) &&
    isEarring &&
    (
      failureSignals.includes('original_product_retained') ||
      failureSignals.includes('source_contamination') ||
      failureSignals.includes('attachment_drift') ||
      failureSignals.includes('missing_structure') ||
      failureSignals.includes('oversized_product') ||
      failureSignals.includes('wrong scale') ||
      failureSignals.includes('visual_check_failed:scale') ||
      failureSignals.includes('visual_check_missing:scale')
    )
  ) {
    return 'anchor_closeup'
  }
  if (retryCount >= 1 || failureSignals.includes('[image_validation_failed]')) return 'erase_first'
  return 'default'
}

function resolveLivePhotoReplacementRenderConfig(
  strategy: LivePhotoReplacementStrategy,
  product: LivePhotoProductSnapshot,
): LivePhotoReplacementRenderConfig {
  const analysis = normalizeLivePhotoProductAnalysis(product.productAnalysis)
  const isWearableContext = Boolean(
    analysis?.wearingPosition ||
      String(analysis?.category || '').trim().toLowerCase() === 'jewelry' ||
      String(analysis?.category || '').trim().toLowerCase() === 'earrings' ||
      analysis?.sizeScale ||
      analysis?.connectionStructure,
  )
  if (strategy === 'anchor_closeup' && (isEarringLikeLivePhotoProduct(product) || isWearableContext)) {
    return {
      normalizeOutput: 'preserve',
      outputSize: '1024x1536',
      providerScope: 'live_photo_replace',
    }
  }
  return {
    normalizeOutput: 'preserve',
    outputSize: '1024x1536',
    providerScope: 'live_photo_replace',
  }
}

function shouldAttemptInlineReplacementEscalation(input: {
  strategy: LivePhotoReplacementStrategy
  product: LivePhotoProductSnapshot
  validationCategories: string[]
}) {
  if (input.strategy === 'anchor_closeup') return false
  if (!isEarringLikeLivePhotoProduct(input.product)) return false
  const categories = new Set((input.validationCategories || []).map((item) => String(item || '').trim().toLowerCase()))
  return (
    categories.has('original_product_retained') ||
    categories.has('source_contamination') ||
    categories.has('attachment_drift') ||
    categories.has('missing_structure')
  )
}

function tokenizeLivePhotoValidationText(value: string) {
  return Array.from(
    new Set(
      String(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]+/g, ' ')
        .split(/\s+/)
        .map((item) => item.trim())
        .filter((item) => item.length >= 4),
    ),
  )
}

const LIVE_PHOTO_NEGATIVE_VALIDATION_PHRASES = [
  'wrong product',
  'different product',
  'different accessory',
  'different jewelry',
  'different earring',
  'different necklace',
  'different ring',
  'different bracelet',
  'mismatch',
  'mismatched',
  'incorrect',
  'wrong geometry',
  'wrong proportion',
  'wrong proportions',
  'wrong scale',
  'oversized',
  'too large',
  'larger than',
  'missing clasp',
  'missing part',
  'missing parts',
  'extra part',
  'extra parts',
  'rounded geometry mismatch',
  'deformed structure',
  'structural deviation',
]

function buildLivePhotoValidationNeedles(product: LivePhotoProductSnapshot) {
  const analysis = normalizeLivePhotoProductAnalysis(product.productAnalysis)
  const fields = [
    analysis?.coreSubject,
    analysis?.connectionStructure,
    analysis?.materialDetails,
    analysis?.surfaceDetails,
    analysis?.colorDetails,
    analysis?.geometryDetails,
    analysis?.sizeScale,
    ...((analysis?.matchingRules ?? []).filter((item) => isStructuralLivePhotoMatchingRule(item))),
  ].filter(Boolean)
  return Array.from(new Set(fields.flatMap((item) => tokenizeLivePhotoValidationText(String(item || '')))))
}

function buildLivePhotoCriticalValidationGroups(product: LivePhotoProductSnapshot) {
  const analysis = normalizeLivePhotoProductAnalysis(product.productAnalysis)
  return [
    analysis?.coreSubject,
    analysis?.connectionStructure,
    analysis?.geometryDetails,
    analysis?.sizeScale,
  ]
    .map((item) => Array.from(new Set(tokenizeLivePhotoValidationText(String(item || '')))))
    .filter((tokens) => tokens.length > 0)
}

function scoreLivePhotoStructureMatch(input: { product: LivePhotoProductSnapshot; analyzed: ProductAnalysisResult }) {
  const needles = buildLivePhotoValidationNeedles(input.product)
  if (!needles.length) {
    return {
      passed: true,
      score: 1,
      matched: [] as string[],
      missing: [] as string[],
      criticalMatchedGroups: 0,
      criticalGroupCount: 0,
      negativeSignals: [] as string[],
    }
  }
  const analyzedText = [
    input.analyzed.summary,
    input.analyzed.coreSubject,
    input.analyzed.connectionStructure,
    input.analyzed.materialDetails,
    input.analyzed.surfaceDetails,
    input.analyzed.colorDetails,
    input.analyzed.geometryDetails,
    input.analyzed.sizeScale,
    ...(input.analyzed.matchingRules ?? []),
  ]
    .filter(Boolean)
    .join(' ')
  const haystack = tokenizeLivePhotoValidationText(analyzedText)
  const haystackSet = new Set(haystack)
  const matched = needles.filter((item) => haystackSet.has(item))
  const missing = needles.filter((item) => !haystackSet.has(item))
  const score = matched.length / Math.max(needles.length, 1)
  const criticalGroups = buildLivePhotoCriticalValidationGroups(input.product)
  const criticalMatchedGroups = criticalGroups.filter((group) => group.some((token) => haystackSet.has(token))).length
  const criticalGroupCount = criticalGroups.length
  const loweredAnalyzedText = analyzedText.toLowerCase()
  const negativeSignals = LIVE_PHOTO_NEGATIVE_VALIDATION_PHRASES.filter((phrase) => loweredAnalyzedText.includes(phrase))
  const minimumCriticalMatches = criticalGroupCount <= 1 ? criticalGroupCount : Math.max(1, criticalGroupCount - 1)
  return {
    passed: score >= 0.68 && (criticalGroupCount === 0 || criticalMatchedGroups >= minimumCriticalMatches) && negativeSignals.length === 0,
    score,
    matched,
    missing,
    criticalMatchedGroups,
    criticalGroupCount,
    negativeSignals,
  }
}

async function validateReferenceReplacementStill(input: {
  product: LivePhotoProductSnapshot
  stillPath: string
  referenceImagePath: string
}): Promise<LivePhotoStillValidationResult> {
  const analysis = normalizeLivePhotoProductAnalysis(input.product.productAnalysis)
  if (!analysis) {
    const visualReview = await livePhotoDeps.reviewReferenceReplacementStillVisual({
      product: input.product,
      referenceImagePath: input.referenceImagePath,
      stillPath: input.stillPath,
    })
    return {
      passed: visualReview.passed,
      skipped: visualReview.skipped,
      reason: 'missing_product_analysis',
      score: 1,
      matched: [] as string[],
      missing: [] as string[],
      criticalMatchedGroups: 0,
      criticalGroupCount: 0,
      negativeSignals: [] as string[],
      strictReview: {
        passed: true,
        skipped: true,
        reason: 'missing_product_analysis',
        score: 1,
        matchedPhrases: [] as string[],
        missingPhrases: [] as string[],
        negativeSignals: [] as string[],
        analyzed: null,
      },
      visualReview: {
        ...visualReview,
        reason: visualReview.reason || 'missing_product_analysis',
      },
    }
  }
  const credentials = await cloneRepo.getCredentials()
  const analyzed = await livePhotoDeps.analyzeProductStructureWithGrs({
    credentials,
    productReferenceImagePaths: [resolveAuthoritativeProductReferencePath(input.product), input.stillPath].filter(Boolean),
    productCategory: String(analysis.category || input.product.type || 'general').trim() || 'general',
    locale: 'zh-CN',
  })
  const verdict = scoreLivePhotoStructureMatch({ product: input.product, analyzed })
  const strictReview = await livePhotoDeps.reviewReferenceReplacementStillStrict({
    product: input.product,
    stillPath: input.stillPath,
  })
  const visualReview = await livePhotoDeps.reviewReferenceReplacementStillVisual({
    product: input.product,
    referenceImagePath: input.referenceImagePath,
    stillPath: input.stillPath,
  })
  return {
    ...verdict,
    passed: visualReview.passed && (verdict.passed || strictReview.passed),
    skipped: false,
    analyzed,
    strictReview,
    visualReview,
  }
}

function buildStrictReplacementReviewNeedles(product: LivePhotoProductSnapshot) {
  const analysis = normalizeLivePhotoProductAnalysis(product.productAnalysis)
  return [
    analysis?.coreSubject,
    analysis?.connectionStructure,
    analysis?.geometryDetails,
    analysis?.sizeScale,
    ...((analysis?.matchingRules ?? []).filter((item) => isStructuralLivePhotoMatchingRule(item)).slice(0, 6)),
  ]
    .filter(Boolean)
    .map((item) => String(item || '').trim())
}

function scoreStrictReplacementReview(input: {
  product: LivePhotoProductSnapshot
  analyzed: ProductAnalysisResult
}) {
  const needles = buildStrictReplacementReviewNeedles(input.product)
  const analyzedText = [
    input.analyzed.summary,
    input.analyzed.coreSubject,
    input.analyzed.connectionStructure,
    input.analyzed.materialDetails,
    input.analyzed.surfaceDetails,
    input.analyzed.colorDetails,
    input.analyzed.geometryDetails,
    input.analyzed.sizeScale,
    ...(input.analyzed.matchingRules ?? []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  const analyzedTokens = new Set(tokenizeLivePhotoValidationText(analyzedText))
  const matchedPhrases = needles.filter((item) => {
    const phraseTokens = tokenizeLivePhotoValidationText(String(item || ''))
    if (!phraseTokens.length) return false
    const matchedCount = phraseTokens.filter((token) => analyzedTokens.has(token)).length
    return matchedCount / phraseTokens.length >= 0.5
  })
  const missingPhrases = needles.filter((item) => !matchedPhrases.includes(item))
  const negativeSignals = LIVE_PHOTO_NEGATIVE_VALIDATION_PHRASES.filter((phrase) => analyzedText.includes(phrase))
  const score = matchedPhrases.length / Math.max(needles.length, 1)
  return {
    passed: score >= 0.4 && negativeSignals.length === 0,
    score,
    matchedPhrases,
    missingPhrases,
    negativeSignals,
  }
}

async function reviewReferenceReplacementStillStrict(input: {
  product: LivePhotoProductSnapshot
  stillPath: string
}): Promise<LivePhotoStrictReviewResult> {
  const analysis = normalizeLivePhotoProductAnalysis(input.product.productAnalysis)
  if (!analysis) {
    return {
      passed: true,
      skipped: true,
      reason: 'missing_product_analysis',
      score: 1,
      matchedPhrases: [] as string[],
      missingPhrases: [] as string[],
      negativeSignals: [] as string[],
      analyzed: null,
    }
  }
  const credentials = await cloneRepo.getCredentials()
  let analyzed: ProductAnalysisResult | null = null
  let lastError: unknown = null
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      analyzed = await livePhotoDeps.analyzeProductStructureWithGrs({
        credentials,
        productReferenceImagePaths: [resolveAuthoritativeProductReferencePath(input.product), input.stillPath].filter(Boolean),
        productCategory: String(analysis.category || input.product.type || 'general').trim() || 'general',
        locale: 'zh-CN',
      })
      break
    } catch (error) {
      lastError = error
      if (attempt < 2 && isRetryableLivePhotoReviewLoadError(error)) {
        await sleep(1500 * (attempt + 1))
        continue
      }
      throw error
    }
  }
  if (!analyzed) throw lastError instanceof Error ? lastError : new Error(String(lastError || 'Unknown error'))
  const verdict = scoreStrictReplacementReview({
    product: input.product,
    analyzed,
  })
  return {
    ...verdict,
    reason: '',
    skipped: false,
    analyzed,
  }
}

async function reviewReferenceReplacementStillVisual(input: {
  product: LivePhotoProductSnapshot
  referenceImagePath: string
  stillPath: string
}): Promise<LivePhotoVisualReviewResult> {
  const analysis = normalizeLivePhotoProductAnalysis(input.product.productAnalysis)
  const credentials = await cloneRepo.getCredentials()
  const key = String(credentials.grsaiApiKey || '').trim()
  if (!key) {
    return {
      passed: true,
      skipped: true,
      reason: 'missing_grsai_api_key',
      score: 1,
      verdict: 'pass',
      failures: [] as string[],
      notes: [] as string[],
      checks: {} as Record<string, unknown>,
    }
  }
  const productRefPath = resolveAuthoritativeProductReferencePath(input.product)
  if (!productRefPath || !existsSync(productRefPath) || !existsSync(String(input.referenceImagePath || '').trim()) || !existsSync(String(input.stillPath || '').trim())) {
    return {
      passed: true,
      skipped: true,
      reason: 'missing_visual_review_inputs',
      score: 1,
      verdict: 'pass',
      failures: [] as string[],
      notes: [] as string[],
      checks: {} as Record<string, unknown>,
    }
  }
  const host = String(credentials.grsaiHost || 'https://grsaiapi.com').trim().replace(/\/+$/, '') || 'https://grsaiapi.com'
  const model = String(credentials.grsaiAnalysisModel || 'gemini-3.1-pro').trim() || 'gemini-3.1-pro'
  const content: any[] = [
    {
      type: 'text',
      text: [
        'You are a strict visual reviewer for product replacement results.',
        'You must judge whether the generated result correctly replaced the product in Image 1 with the exact product from Image 2.',
        'Image 1 = base scene reference.',
        'Image 2 = authoritative product reference.',
        'Image 3 = generated replacement result.',
        'Return JSON only with this exact shape:',
        '{"verdict":"pass","score":0,"failures":[],"notes":[],"checks":{"product_identity":"pass","source_contamination":"pass","material_color":"pass","attachment_structure":"pass","scale":"pass","scene_preservation":"pass"}}',
        'Scoring rules:',
        '- verdict=pass only if Image 3 keeps the Image 1 scene and uses the exact Image 2 product identity.',
        '- This is a zero-tolerance review. If product identity is uncertain, the result must fail.',
        '- Fail if product shape, structure, proportions, attachment logic, or size relative to scene drift away from Image 2.',
        '- Fail if product appears enlarged, beautified, simplified, or structurally altered.',
        '- Fail if a wearable product occupies too much ear, neck, hand, wrist, or body area compared with the selected product real-world ratio from Image 2 and Product DNA.',
        '- Fail if the product looks oversized relative to the nearby ear lobe, ear rim, piercing zone, finger width, wrist width, or other local body anchor.',
        '- Fail if Image 3 keeps the original product from Image 1 instead of replacing it with Image 2.',
        '- Fail if Image 3 mixes Image 1 product features with Image 2 product features.',
        '- Fail if Image 3 preserves the Image 1 product material, color family, stone layout, connector layout, or silhouette.',
        '- In checks.product_identity, judge whether the final product is the exact same product instance as Image 2.',
        '- In checks.source_contamination, judge whether Image 1 product silhouette or design language still remains.',
        '- In checks.material_color, judge whether material, finish, tone, and color match Image 2.',
        '- In checks.attachment_structure, judge whether clasp, hinge, link, connector, and attachment logic match Image 2.',
        '- In checks.scale, judge whether product size matches the selected product real-world proportion from Image 2 and Product DNA, while preserving the same contact point and wearable/body relation from Image 1.',
        '- In checks.scale, fail if the product becomes visually oversized at the local body anchor even when the contact point is correct.',
        '- In checks.scale, for earrings specifically, compare the product against ear-lobe height, ear-rim span, piercing-to-lobe distance, and visible ear area instead of the replaced Image 1 product footprint.',
        '- In checks.scene_preservation, judge whether pose, fingers, framing, background, and lighting remain unchanged from Image 1.',
        '- Each check value must be exactly "pass" or "fail".',
        '- Every required check must be present in the JSON output.',
        '- If any required check is uncertain, return "fail" for that check and set verdict=fail.',
        '- score range: 0 to 1.',
        `Selected product name: ${String(input.product.name || '').trim()}.`,
        ...(analysis
          ? [
              analysis.coreSubject ? `Exact core subject to preserve from Image 2: ${analysis.coreSubject}.` : '',
              analysis.connectionStructure ? `Exact connection structure to preserve from Image 2: ${analysis.connectionStructure}.` : '',
              analysis.geometryDetails ? `Exact geometry to preserve from Image 2: ${analysis.geometryDetails}.` : '',
              analysis.materialDetails ? `Exact material details to preserve from Image 2: ${analysis.materialDetails}.` : '',
              analysis.colorDetails ? `Exact color details to preserve from Image 2: ${analysis.colorDetails}.` : '',
            ].filter(Boolean)
          : []),
      ].join('\n'),
    },
    { type: 'text', text: `Image 1 base scene reference: ${input.referenceImagePath}` },
    { type: 'image_url', image_url: { url: await imageDataUrl(input.referenceImagePath) } },
    { type: 'text', text: `Image 2 authoritative product reference: ${productRefPath}` },
    { type: 'image_url', image_url: { url: await imageDataUrl(productRefPath) } },
    { type: 'text', text: `Image 3 generated replacement result: ${input.stillPath}` },
    { type: 'image_url', image_url: { url: await imageDataUrl(input.stillPath) } },
  ]
  const requestBody = JSON.stringify({
    model,
    stream: false,
    temperature: 0.1,
    messages: [
      { role: 'system', content: 'You are a strict JSON-only visual replacement reviewer.' },
      { role: 'user', content },
    ],
  })
  let text = ''
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const res = await fetch(`${host}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: requestBody,
    })
    text = await res.text()
    if (res.ok) break
    if (attempt < 2 && isRetryableLivePhotoReviewLoadError(text)) {
      await sleep(1500 * (attempt + 1))
      continue
    }
    throw new Error(`Live Photo visual review failed HTTP ${res.status}: ${text.slice(0, 500)}`)
  }
  const contentText = extractModelMessageContent(text)
  const jsonText = extractJsonObjectText(contentText)
  let parsed: any
  try {
    parsed = JSON.parse(jsonText)
  } catch (error: any) {
    throw new Error(`Live Photo visual review parse failed: ${String(error?.message || error)} response=${contentText.slice(0, 320)}`)
  }
  const verdict = String(parsed?.verdict || '').trim().toLowerCase() === 'pass' ? 'pass' : 'fail'
  const score = Math.max(0, Math.min(1, Number(parsed?.score || 0)))
  const failures = Array.isArray(parsed?.failures) ? parsed.failures.map((item: unknown) => String(item || '').trim()).filter(Boolean) : []
  const notes = Array.isArray(parsed?.notes) ? parsed.notes.map((item: unknown) => String(item || '').trim()).filter(Boolean) : []
  const checks = parsed?.checks && typeof parsed.checks === 'object' ? parsed.checks : {}
  const missingChecks = getLivePhotoVisualMissingChecks(checks)
  const failedChecks = Object.entries(checks)
    .filter(([_, value]) => String(value || '').trim().toLowerCase() === 'fail')
    .map(([key]) => String(key || '').trim())
    .filter(Boolean)
  const derivedFailures = [
    ...failures,
    ...missingChecks.map((key) => `visual_check_missing:${key}`),
    ...failedChecks.map((key) => `visual_check_failed:${key}`),
  ]
  return {
    passed: verdict === 'pass' && score >= 0.8 && missingChecks.length === 0 && derivedFailures.length === 0,
    skipped: false,
    reason: '',
    score,
    verdict,
    failures: derivedFailures,
    notes: missingChecks.length ? [...notes, `Missing visual checks: ${missingChecks.join(', ')}`] : notes,
    checks,
  }
}

function buildReferenceReplacementPrompt(input: {
  product: LivePhotoProductSnapshot
  productReferenceImagePaths: string[]
  referenceImagePath: string
  retryGuidance?: string[]
  strategy?: LivePhotoReplacementStrategy
}) {
  const normalizedAnalysis = normalizeLivePhotoProductAnalysis(input.product.productAnalysis)
  const strategy = input.strategy || 'default'
  const uploadFileNames = buildLivePhotoUploadFileNames()
  const authoritativeProductPath = String(
    input.productReferenceImagePaths[0] ||
      resolveAuthoritativeProductReferencePath(input.product) ||
      input.product.coverImagePath ||
      '',
  ).trim()
  return [
    'MASTER PRODUCT REPLACEMENT SYSTEM (SOURCE-BOUND | ZERO-RECONSTRUCTION | FINAL)',
    '',
    'ROLE:',
    'You are a deterministic product mapping system.',
    'You do NOT generate.',
    'You do NOT redesign.',
    'You do NOT interpret.',
    'You ONLY transfer the product from Image 2 into Image 1.',
    'The final product must be a full replacement, not a hybrid, not a blend, and not a new structure made from Image 1 plus Image 2.',
    '',
    'INPUT STRUCTURE (EXACTLY 2 IMAGES):',
    '- Image 1 = Base reference (human / scene / composition / pose)',
    '- Image 2 = Product reference (the ONLY valid product identity source)',
    '- Image 2 can be a single multi-angle product board image',
    '- The FIRST uploaded image is always Image 1.',
    '- The SECOND uploaded image is always Image 2.',
    `- Uploaded file name for Image 1 = ${uploadFileNames[0]}.`,
    `- Uploaded file name for Image 2 = ${uploadFileNames[1]}.`,
    '- Follow upload order exactly. Never swap, blend, average, or reinterpret the two image roles.',
    '',
    'INPUT BINDING LOCK (ABSOLUTE):',
    'Image 1 defines ONLY:',
    '- human identity when a person is actually visible',
    '- pose and gesture when a person is actually visible',
    '- composition and framing',
    '- camera angle and perspective',
    '- lighting direction',
    '- environment and background',
    '- spatial structure',
    'Image 2 defines ONLY:',
    '- product structure',
    '- shape and geometry',
    '- proportions',
    '- material and texture',
    '- all product details',
    '',
    'STRICT SOURCE SEPARATION:',
    '- ALL scene information MUST come from Image 1 ONLY',
    '- ALL product information MUST come from Image 2 ONLY',
    '- Do NOT use product design from Image 1',
    '- Do NOT use pose or scene information from Image 2',
    '- Do NOT mix roles between images',
    '',
    'PRODUCT SOURCE OVERRIDE:',
    'If Image 1 already contains a product, ignore its design completely.',
    'Use the original product in Image 1 ONLY as a placement placeholder for:',
    '- position',
    '- orientation',
    '- contact point',
    '- attachment relation',
    'Do NOT preserve any visible shape, color, material, structure, edge, stone, logo, engraving, or attachment from the Image 1 product.',
    '',
    'NO CROSS-CONTAMINATION:',
    '- Do NOT blend product features between Image 1 and Image 2',
    '- Do NOT partially keep Image 1 product identity',
    '- Do NOT merge visible structure from Image 1 and Image 2 into a new hybrid product.',
    '- The replacement product must be a full substitute from Image 2 only, not a blended reconstruction.',
    '- The final visible product must be 100 percent derived from Image 2',
    '',
    'STRICT REPLACEMENT RULE:',
    'Replace ONLY the product in Image 1 with the product from Image 2.',
    'Do NOT change anything else.',
    'This is a pure substitution task, NOT a redesign task.',
    '',
    'FLAT-LAY / TABLETOP REFERENCE LOCK:',
    '- If Image 1 is a flat lay, tabletop, product-only, or no-person reference, do NOT add any hands, fingers, arms, or human interaction.',
    '- Do NOT introduce touching, holding, lifting, pinching, gripping, or presenting gestures around the product.',
    '- If Image 1 contains no visible human body parts, the final image must also contain no visible human body parts.',
    '- If Image 1 contains no visible hands or fingers, the final image must contain no visible hands, fingers, nails, palms, wrists, or skin-contact presentation cues.',
    '',
    'GLOBAL PRIORITY ORDER:',
    '1. Product identity from Image 2',
    '2. Product real-world scale from Image 2 and Product DNA',
    '3. Product placement from Image 1 anchor',
    '4. Scene preservation from Image 1',
    '5. Realism',
    ...(strategy === 'erase_first'
      ? [
          '',
          'ERASE-FIRST REPLACEMENT MODE:',
          '- First mentally delete the entire original product from Image 1.',
          '- Remove its silhouette, contour rhythm, material cue, stone layout, and attachment trace completely.',
          '- Only after the Image 1 product has been fully erased, place the intact Image 2 product into the same anchor.',
          '- Never blend the Image 2 product into the leftover Image 1 shape.',
        ]
      : []),
    ...(strategy === 'anchor_closeup'
      ? [
          '',
          'ANCHOR CLOSE-UP REPLACEMENT MODE:',
          '- Treat this as a local close-up replacement around the wearable anchor only.',
          '- Focus on the ear attachment zone and the exact body contact relation first.',
          '- Keep only the minimum surrounding ear, skin, hair, and scene context needed to preserve realism.',
          '- Prioritize a clean exact product transfer over smooth blending across the old object boundary.',
          '- If the old object contour conflicts with Image 2, delete the old contour entirely and keep the full Image 2 structure.',
        ]
      : []),
    '',
    'PRODUCT IDENTITY LOCK (HIGHEST PRIORITY):',
    'The final product MUST be a structurally identical instance of Image 2.',
    'Strictly match:',
    '- silhouette',
    '- geometry',
    '- proportions',
    '- structure',
    '- spacing between parts',
    '- real-world size from Image 2 and Product DNA while preserving the same anchor relation in Image 1',
    '- material response',
    '- micro details',
    '- all visible design elements',
    'Forbidden:',
    '- redesign',
    '- simplification',
    '- beautification',
    '- stylization',
    '- detail hallucination',
    '- symmetry correction',
    '- structural completion from imagination',
    '- improvement, enhancement, or reinterpretation of the product',
    '- making the replacement product larger or smaller than the selected product real-world scale from Image 2 and Product DNA',
    '- upscaling the wearable or accessory to make it more obvious',
    '- enlarging the product for readability',
    '',
    'VIEW SELECTION AND ISOLATION:',
    'If Image 2 contains multiple angles, use Image 2 as a single product identity source only.',
    'Image 2 may be a single product board with multiple small angle thumbnails. This is still one product reference image.',
    'Use only the visible product identity cues needed to preserve the exact same product instance at the Image 1 anchor.',
    'Do NOT combine different thumbnails, do NOT borrow details from multiple angles, and do NOT reconstruct a new composite view.',
    'If the Image 1 anchor view and the Image 2 board are not perfectly aligned, keep the product identity exact and avoid inventing hidden geometry.',
    '',
    'ZERO-RECONSTRUCTION RULE:',
    '- Do NOT reconstruct shapes',
    '- Do NOT approximate geometry',
    '- Do NOT reinterpret edges',
    '- Do NOT infer unseen sides',
    '- Do NOT complete hidden structure',
    'Only transfer what is EXACTLY visible in Image 2.',
    'If a detail is unclear in Image 2, keep it unclear and do NOT invent it.',
    '',
    'GEOMETRY LOCK:',
    'The spatial relationship between the product and the surrounding body or environment in Image 1 must remain EXACTLY the same.',
    'Including:',
    '- position',
    '- anchor point',
    '- orientation',
    '- rotation',
    '- depth alignment',
    '- contact points',
    '- occlusion order',
    'No shift is allowed.',
    '',
    'SCALE LOCK (CRITICAL):',
    '- Use Image 2 and Product DNA as the source of truth for the product real-world size and product-to-body proportion.',
    '- Do NOT inherit the old product size from Image 1 when that old size conflicts with the selected product real-world scale.',
    '- Preserve the selected product real-world proportion relative to ear, neck, hand, wrist, body, or support area as defined by Image 2 and Product DNA size signals.',
    '- Maintain correct body-to-product size relationship for the selected product, even if the old product in Image 1 was visibly larger or smaller.',
    '- When Image 1 is a model reference, keep the selected product at its own correct wearable scale. Do not resize it to mimic the old product footprint from Image 1.',
    '- If the scene contains a person or model, keep the product close to the body anchor and never float it outward.',
    '- If uncertainty exists, preserve the selected product real-world scale from Image 2 and Product DNA instead of copying the old product size from Image 1.',
    '',
    'MODEL REFERENCE LOCK:',
    '- If Image 1 is a model reference, treat the body as a strict anchor, not a layout surface.',
    '- Keep the product at the same body contact point, but use the selected product wearable size rather than the replaced product size from Image 1.',
    '- Do not bias the product smaller or larger when preserving identity.',
    '- Do not upscale jewelry, accessories, or wearable products to improve readability.',
    '- Do not downscale jewelry, accessories, or wearable products to make the model look cleaner or more spacious.',
    '- Do not center the product in the frame or detach it from the body anchor.',
    '- Preserve the selected product wearable proportion exactly even when the model pose is open or spacious.',
    '- Keep the selected product-to-body dominance relationship correct for that product. Do not let the old Image 1 product size force a wrong ratio.',
    '- If the original product is partially occluded, preserve that occlusion while still matching the selected product scale.',
    '- If body anatomy, pose, or crop conflicts with the selected product size, adjust the human integration locally while keeping the product scale locked.',
    '',
    'PERSPECTIVE LOCK:',
    '- keep original perspective from Image 1',
    '- keep lens distortion consistent',
    '- keep the same vanishing direction',
    '- do NOT correct or beautify perspective',
    '',
    'ENVIRONMENT MATCHING:',
    '- preserve Image 1 scene exactly',
    '- preserve background exactly',
    '- preserve pose exactly when a person is actually visible',
    '- preserve framing exactly',
    '- preserve only the human body parts that are already visible in Image 1',
    '- if Image 1 has no visible hands or fingers, do not output any hands or fingers',
    '- preserve lighting direction and shadow logic exactly',
    '',
    'LIGHTING ADAPTATION (LIMITED):',
    'Allowed:',
    '- slight brightness adjustment',
    '- slight contrast adjustment',
    '- slight color temperature matching',
    'Not allowed:',
    '- new highlights',
    '- stronger reflections',
    '- glow',
    '- sparkle',
    '- bloom',
    '- material enhancement',
    '',
    'ANTI-OVERGENERATION:',
    'Do NOT make the product:',
    '- bigger',
    '- clearer',
    '- shinier',
    '- more detailed',
    '- more centered',
    '- more prominent',
    '- more separated from the body anchor',
    '- more billboard-like',
    '- more readable than the original object',
    '- more dominant than the body anchor',
    'It must sit naturally inside Image 1 with the correct visual importance for the selected product real-world size, while keeping 100 percent of the product identity from Image 2 with zero blending.',
    '',
    'FAILSAFE RULE:',
    'If exact structure cannot be preserved, reduce detail but NEVER introduce structural deviation.',
    'If realism conflicts with product identity, preserve product identity.',
    'If scene blending conflicts with product structure, preserve product structure.',
    'If identity is not perfect, the output is incorrect.',
    '',
    'OUTPUT:',
    'A single photorealistic image where:',
    '- product = Image 2',
    '- size = selected product real-world size and Product DNA proportion',
    '- position = Image 1 original object position',
    '- scene = untouched',
    '- zero structural deviation is allowed',
    '',
    'AUTHORITATIVE INPUT BINDING:',
    '',
    `Image 1 source = ${input.referenceImagePath}.`,
    `Image 2 source = ${authoritativeProductPath}.`,
    `Image 1 file path: ${input.referenceImagePath}.`,
    `Image 2 file path: ${authoritativeProductPath}.`,
    `Image 1 uploaded file name: ${uploadFileNames[0]}.`,
    `Image 2 uploaded file name: ${uploadFileNames[1]}.`,
    'Use Image 1 only for scene, pose, composition, contact, lighting, and framing.',
    'Use Image 2 only for exact product identity.',
    '',
    `Selected product name: ${input.product.name}.`,
    `Authoritative product reference path: ${authoritativeProductPath}.`,
    `Reference photo path: ${input.referenceImagePath}.`,
    ...buildLivePhotoCategorySpecificPromptRules(input.product),
    ...(normalizedAnalysis
      ? [
          '',
          'PRODUCT DNA LOCK:',
          '',
          normalizedAnalysis.category ? `Category: ${normalizedAnalysis.category}.` : '',
          normalizedAnalysis.summary ? `Summary: ${normalizedAnalysis.summary}.` : '',
          normalizedAnalysis.coreSubject ? `Core subject: ${normalizedAnalysis.coreSubject}.` : '',
          normalizedAnalysis.connectionStructure ? `Connection structure: ${normalizedAnalysis.connectionStructure}.` : '',
          normalizedAnalysis.materialDetails ? `Material details: ${normalizedAnalysis.materialDetails}.` : '',
          normalizedAnalysis.surfaceDetails ? `Surface details: ${normalizedAnalysis.surfaceDetails}.` : '',
          normalizedAnalysis.colorDetails ? `Color details: ${normalizedAnalysis.colorDetails}.` : '',
          normalizedAnalysis.geometryDetails ? `Geometry details: ${normalizedAnalysis.geometryDetails}.` : '',
          normalizedAnalysis.sizeScale ? `Size scale: ${normalizedAnalysis.sizeScale}.` : '',
          normalizedAnalysis.wearingPosition ? `Wearing position: ${normalizedAnalysis.wearingPosition}.` : '',
          ...(Array.isArray(normalizedAnalysis.matchingRules)
            ? normalizedAnalysis.matchingRules.map((rule, index) => `Matching rule ${index + 1}: ${rule}.`)
            : []),
        ].filter(Boolean)
      : []),
    '',
    'FINAL DECISION RULE:',
    '',
    'If realism conflicts with product identity, preserve product identity.',
    'If scene blending conflicts with product structure, preserve product structure.',
    'If any ambiguity remains, keep the result closer to Image 2 and never invent extra structure.',
    ...(Array.isArray(input.retryGuidance) && input.retryGuidance.length
      ? [
          '',
          'RETRY CORRECTION LOCK:',
          ...input.retryGuidance.map((item) => `- ${item}`),
        ]
      : []),
  ].join('\n')
}

function buildLivePhotoCategorySpecificPromptRules(product: LivePhotoProductSnapshot, context: 'replacement' | 'video' = 'replacement') {
  const analysis = normalizeLivePhotoProductAnalysis(product.productAnalysis)
  const isEarring = isEarringLikeLivePhotoProduct(product)
  const isWearableContext = Boolean(
    analysis?.wearingPosition ||
      String(analysis?.category || '').trim().toLowerCase() === 'jewelry' ||
      String(analysis?.category || '').trim().toLowerCase() === 'earrings' ||
      analysis?.sizeScale ||
      analysis?.connectionStructure,
  )
  const rules: string[] = []
  if (isWearableContext) {
    rules.push(
      '',
      'WEARABLE SCALE LOCK:',
      '- Treat the product as a body-anchored wearable with a fixed real-world size, not as a free-scaling decoration.',
      context === 'video'
        ? '- Keep the same product-to-body scale relationship already visible in the locked still.'
        : '- Keep the same product-to-body scale relationship that is correct for the selected product, not the replaced product from Image 1.',
      context === 'video'
        ? '- Preserve the exact contact point and attachment relation already visible in the locked still.'
        : '- Preserve the exact contact point and attachment relation from Image 1.',
      '- Do NOT enlarge the product to improve readability.',
      '- Do NOT shrink the product to make the model, face, hand, or body read more cleanly.',
      '- Do NOT move the product away from the body anchor.',
      '- If the product is partially occluded, preserve that occlusion instead of resizing the product.',
      context === 'video'
        ? '- Keep the product locked to the exact wearable proportion already visible in the locked still.'
        : '- Keep the product locked to the correct selected-product wearable proportion. Do not let the old Image 1 product footprint override that proportion.',
    )
  }
  if (!isEarring) return rules
  rules.push(
    '',
    'EARRING STRUCTURE LOCK:',
    context === 'video'
      ? '- Opening or closing state is part of product identity and must remain exactly the same as in the locked still.'
      : '- Opening or closing state is part of product identity and must match Image 2 exactly.',
    '- Treat a huggie earring as a huggie earring specifically. Do NOT reinterpret it as a generic hoop, ring, cuff, or abstract jewelry loop.',
    '- A closed hoop earring must remain a closed hoop earring.',
    context === 'video'
      ? '- Keep the hoop outline and curvature exactly as shown in the locked still. Do NOT ovalize, flatten, stretch, widen, or re-arc the hoop body.'
      : '- Keep the hoop outline and curvature exactly as shown in Image 2. Do NOT ovalize, flatten, stretch, widen, or re-arc the hoop body.',
    '- Do NOT convert a closed hoop into an open ear cuff, ring, open band, or partial arc.',
    context === 'video'
      ? '- Preserve hinge, clasp, latch, post, connector spacing, and closure logic exactly when visible in the locked still.'
      : '- Preserve hinge, clasp, latch, post, connector spacing, and closure logic exactly when visible in Image 2.',
    '- Do NOT replace a curved huggie snap-closure post with a straight post, rigid pin, or simplified straight attachment bar.',
    context === 'video'
      ? '- If the locked still shows a snap closure, the final result must keep the same snap-closure logic and the same curved closure path.'
      : '- If Image 2 shows a snap closure, the final result must keep the same snap-closure logic and the same curved closure path.',
    context === 'video'
      ? '- If the locked still shows a continuous closed loop, the final result must also show a continuous closed loop unless the same area remains occluded.'
      : '- If Image 2 shows a continuous closed loop, the final result must also show a continuous closed loop unless the same area is occluded in Image 1.',
    '- Keep the hoop body as one single hoop body only. Do NOT split it into a double band, twin rail, layered ring wall, or parallel outer-inner hoop look.',
    '- Do NOT flatten the hoop band, compress the hoop thickness, or simplify the circular band into a flat strip or oval loop.',
    context === 'video'
      ? '- Preserve the exact front ornament attachment visible in the locked still. If the locked still shows a front-fixed bow mounted on the front of the hoop, keep that same front-fixed bow placement and attachment logic.'
      : '- Preserve the exact front ornament attachment from Image 2. If Image 2 shows a front-fixed bow mounted on the front of the hoop, keep that same front-fixed bow placement and attachment logic.',
    context === 'video'
      ? '- Keep the exact visible stone count and dangling crystal count from the locked still. Do NOT remove, merge, or simplify any bow tail crystal.'
      : '- Keep the exact stone count and dangling crystal count from Image 2. Do NOT remove, merge, or simplify any bow tail crystal.',
    context === 'video'
      ? '- If the locked still shows three baguette tail stones below the bow, the final result must also show exactly three baguette tail stones below the bow.'
      : '- If the selected Image 2 view shows three baguette tail stones below the bow, the final result must also show exactly three baguette tail stones below the bow.',
    context === 'video'
      ? '- Preserve the bow front shape and stone articulation exactly. Keep the visible faceted stone geometry, transparent crystal look, and front-facing placement from the locked still.'
      : '- Preserve the bow front shape and stone articulation exactly. Keep the visible faceted stone geometry, transparent crystal look, and front-facing placement from Image 2.',
    context === 'video'
      ? '- Keep the exact ear attachment relation and hanging direction visible in the locked still.'
      : '- Keep the exact ear attachment relation and hanging direction from the selected Image 2 view.',
    context === 'video'
      ? '- Do NOT preserve any open ring, open cuff, split arc, or incomplete loop trace not present in the locked still.'
      : '- Do NOT preserve any open ring, open cuff, split arc, or incomplete loop trace from Image 1.',
    context === 'video'
      ? '- Keep the final earring at the exact real-world size already visible in the locked still. Do NOT enlarge it or reinterpret its wearable scale.'
      : '- Keep the final earring at the exact real-world size that matches the selected earring from Image 2 and Product DNA. Do NOT inherit the replaced earring size from Image 1 when it conflicts.',
  )
  return rules
}

function buildReferenceReplacementNegativePrompt(input?: {
  product?: LivePhotoProductSnapshot
  strategy?: LivePhotoReplacementStrategy
}) {
  const negatives = [
      'different person',
      'different face',
      'different pose',
      'different framing',
      'different background',
      'different lighting direction',
      'extra product',
      'wrong product',
      'product redesign',
      'split panel',
      'collage',
      'deformed hand',
      'deformed body',
      'blurry product',
      'soft focus product',
      'motion blur on product',
      'low resolution product details',
      'muddy texture',
      'smeared edges',
      'out of focus jewelry',
      'foggy details',
      'oversized product',
      'enlarged product',
      'wrong product scale',
      'original product retained',
      'leftover original product',
      'original silhouette remains',
      'mixed product features',
      'source contamination',
      'same-category lookalike',
      'wrong connector layout',
      'wrong attachment structure',
      'open ear cuff',
      'open cuff',
      'ring instead of earring',
      'open band',
      'broken hoop',
      'missing closure',
      'upscaled wearable',
      'upscaled jewelry',
      'extra hands',
      'extra fingers',
      'hand holding product',
      'hand touching product',
      'fingers touching product',
      'gripping product',
      'wrong metal color',
      'wrong material finish',
      'product identity drift',
      'geometry drift',
      'structure drift',
      'sparkle effect',
      'glow effect',
      'glitter',
      'shiny flare',
      'light burst',
      'lens flare on product',
      'hands',
      'fingers',
      'arms',
      'human interaction',
      'touching product',
      'holding product',
      'product larger than original anchor',
      'product larger than original footprint',
      'larger than the original visible product',
    ]
  const strategy = input?.strategy || 'default'
  if (strategy === 'erase_first' || strategy === 'anchor_closeup') {
    negatives.push(
      'leftover anchor silhouette',
      'old product contour',
      'partial replacement',
      'hybrid product',
      'blended product identity',
      'product residue from image 1',
    )
  }
  if (input?.product && isEarringLikeLivePhotoProduct(input.product)) {
    negatives.push(
      'double hoop',
      'double band earring',
      'missing hinge',
      'missing clasp',
      'wrong dangling stone count',
      'wrong bow shape',
      'open hoop when source is closed',
      'oval hoop',
      'flattened hoop band',
      'straight post instead of curved snap closure',
      'simplified attachment bar',
    )
  }
  return buildStoryboardImageNegativePrompt(negatives.join(', '))
}

function buildLivePhotoProviderRolePrefix(input: {
  referenceImagePath: string
  productReferenceImagePath: string
  mode?: 'image_replace' | 'video_reference_lock'
}) {
  if (input.mode === 'video_reference_lock') {
    return [
      'PROVIDER INPUT ROLE LOCK:',
      'The uploaded image array is ordered and role-bound.',
      'The uploaded image array contains exactly 2 images.',
      'Array item 1 is the locked still scene anchor image.',
      'Array item 2 is the authoritative product reference image.',
      'Array item 1 defines the locked scene, crop, pose, and product anchor.',
      'Array item 2 defines the only valid product identity source.',
      'Never swap these two image roles.',
      'Never average these two images.',
      'Never treat array item 2 as a scene, pose, crop, or composition reference.',
      'Never treat array item 1 as a product redesign reference.',
      'If array item 2 is a multi-angle product board, use it only as a product identity source.',
      'Do not merge multiple thumbnails from array item 2 into a reconstructed new product view.',
      `Array item 1 path: ${input.referenceImagePath}.`,
      `Array item 2 path: ${input.productReferenceImagePath}.`,
    ].join('\n')
  }
  const uploadFileNames = buildLivePhotoUploadFileNames()
  return [
    'PROVIDER INPUT ROLE LOCK:',
    'The uploaded image array is ordered and role-bound.',
    'The uploaded image array contains exactly 2 images.',
    'Array item 1 is the base scene image.',
    'Array item 2 is the authoritative product reference image.',
    'Array item 1 must be treated as Image 1 only.',
    'Array item 2 must be treated as Image 2 only.',
    `Uploaded file name for array item 1: ${uploadFileNames[0]}.`,
    `Uploaded file name for array item 2: ${uploadFileNames[1]}.`,
    'Never swap these two images.',
    'Never average these two images.',
    'Never treat both images as equal product references.',
    'Array item 2 may be a single multi-angle product board image.',
    'If array item 2 is a multi-angle board, use it only as a product identity source.',
    'Do not merge angles from array item 2.',
    'Do not combine multiple thumbnails into a reconstructed product view.',
    'Do not use array item 2 to introduce scene props, hands, pose, or composition.',
    'Do not treat array item 2 as a scene or composition reference.',
    `Array item 1 path: ${input.referenceImagePath}.`,
    `Array item 2 path: ${input.productReferenceImagePath}.`,
  ].join('\n')
}

function buildLivePhotoUploadFileNames() {
  return ['image_1_base_scene.png', 'image_2_product_reference.png']
}

function buildLivePhotoUploadKeyPrefixes() {
  return ['grsai-input/live-photo/base-scene', 'grsai-input/live-photo/product-reference']
}

function buildLivePhotoRetryEscalationGuidance(item: LivePhotoItem, product?: LivePhotoProductSnapshot) {
  const retryCount = Math.max(0, Number(item.autoFlowStatus?.retryCount ?? 0) || 0)
  if (retryCount <= 0) return [] as string[]
  const guidance = new Set<string>()
  guidance.add('Retry escalation is active. Use a stricter replacement strategy than the previous attempt.')
  guidance.add('This is a product substitution task only. Do not generate a new product interpretation.')
  guidance.add('Completely remove the original product identity from Image 1 before inserting Image 2.')
  guidance.add('Match the exact same product instance from Image 2. Do not output a same-category lookalike, adjacent variant, or simplified substitute.')
  guidance.add('The same single product instance with no replacement and no redesign.')
  guidance.add('Keep all stable connection points, assembly relations, opening or closing structures, and component count unchanged.')
  guidance.add('Keep silhouette, thickness, length, proportions, curvature, component count, and relative placement.')
  guidance.add('Keep the same realistic scale relation and display proportion shown across the references.')
  guidance.add('same single product instance, no redesign, no extra parts, no missing parts.')
  if (retryCount >= 1) {
    guidance.add('Force exact source separation: Image 1 contributes scene only, Image 2 contributes product only.')
    guidance.add('Treat any leftover Image 1 product feature as an incorrect result.')
    guidance.add('Enter zero-tolerance replacement mode: preserve Image 2 product structure exactly, even if scene blending becomes less smooth.')
    guidance.add('Do not preserve any silhouette, edge rhythm, connector layout, color grouping, or material cue from the original product in Image 1.')
    guidance.add('If uncertain, reduce detail instead of introducing any structural deviation from Image 2.')
    guidance.add('Remove all original-product contamination from Image 1. Do not preserve the original silhouette, edge rhythm, or visible design language.')
    guidance.add('Correct the product material and color response to match Image 2 exactly. Do not keep the original product color family, finish, or reflection style.')
    guidance.add('Correct the attachment and connector layout to match Image 2 exactly. Keep hinges, clasps, links, charm joints, and mounting logic identical to Image 2.')
    guidance.add('Keep the replacement product at the correct selected-product real-world size. Do not let the replaced Image 1 product footprint override it.')
    guidance.add('Restore all missing structural components from Image 2 exactly, including attachments, edges, connectors, clasps, stones, and dangling parts.')
    guidance.add('Undo all geometry drift. Keep edges, angles, spacing, thickness, and proportions identical to Image 2.')
    guidance.add('Visual review failed on product identity. Replace the visible product with the exact same product instance from Image 2 only.')
    guidance.add('Visual review failed on source contamination. Remove every visible design trace of the original Image 1 product before placing Image 2.')
    guidance.add('Visual review failed on material and color. Match Image 2 metal tone, finish, stone color, and reflection response exactly.')
    guidance.add('Visual review failed on attachment structure. Match Image 2 hinges, clasps, links, mounting points, and connector spacing exactly.')
    guidance.add('Visual review failed on scale. Match the selected product real-world size and preserve the correct body-to-product scale relationship for that product.')
    guidance.add('If the product looks too large on the model, shrink it back to the selected product wearable ratio before changing anything else.')
    guidance.add('For earrings, keep the selected product proportion relative to ear-lobe height, ear-rim span, and piercing area. Do not size it by the replaced earring from Image 1.')
    guidance.add('Remove the original product identity from Image 1 completely. The final visible product must come only from Image 2.')
    guidance.add('Use the exact product identity from Image 2 only. Do not output a similar item, substitute design, or same-category variant.')
  }
  if (retryCount >= 2) {
    guidance.add('Ultimate replacement lock: output is incorrect unless the final visible product is a direct visual clone of Image 2 at the Image 1 anchor position while preserving the selected product real-world size.')
  }
  if (product && isEarringLikeLivePhotoProduct(product)) {
    guidance.add('Closed hoop identity lock: if Image 2 shows a closed hoop, the final result must remain a closed hoop with the same closure logic.')
    guidance.add('Preserve huggie identity exactly when present in Image 2. Do not simplify it into a generic hoop, ring, cuff, or abstract loop.')
    guidance.add('Do not convert the earring into an open cuff, open band, split arc, broken hoop, or ring-like substitute.')
    guidance.add('Keep hinge, clasp, latch, post, connector spacing, and hanging direction identical to Image 2 when visible.')
    guidance.add('If Image 2 shows a snap closure, preserve the exact snap-closure geometry and curved closure path.')
    guidance.add('Do not add a second band, double rail, extra loop, or any extra dangling part.')
    guidance.add('Do not ovalize or flatten the hoop body. Keep the same circular hoop curvature and band thickness from Image 2.')
    guidance.add('Do not replace the curved snap-closure post with a straight post, straight pin, or simplified rigid bar.')
    guidance.add('Keep the front ornament attachment identical to Image 2. If the ornament is a front-fixed bow mounted on the front of the hoop, preserve that exact front-mounted attachment.')
    guidance.add('Keep the exact bow face, faceted stone geometry, transparent crystal look, and dangling stone count from Image 2.')
  }
  return Array.from(guidance)
}

function buildLivePhotoRetryGuidance(item: LivePhotoItem, product?: LivePhotoProductSnapshot) {
  const reason = String(item.autoFlowStatus?.lastError || item.error || '').trim().toLowerCase()
  const guidance = new Set<string>()
  for (const entry of buildLivePhotoRetryEscalationGuidance(item, product)) {
    guidance.add(entry)
  }
  if (!reason) {
    return Array.from(guidance)
  }
  guidance.add('Correct the previous failure exactly. Do not repeat the prior replacement mistake.')
  if (reason.includes('[validation_category:original_product_retained]')) {
    guidance.add('Delete the original product from Image 1 completely before placing Image 2. No visible product feature from Image 1 may remain.')
  }
  if (reason.includes('[validation_category:wrong_product_identity]')) {
    guidance.add('Match the exact same product instance from Image 2. Do not output a same-category lookalike, adjacent variant, or simplified substitute.')
  }
  if (reason.includes('[validation_category:source_contamination]')) {
    guidance.add('Remove all original-product contamination from Image 1. Do not preserve the original silhouette, edge rhythm, or visible design language.')
  }
  if (reason.includes('[validation_category:material_color_drift]')) {
    guidance.add('Correct the product material and color response to match Image 2 exactly. Do not keep the original product color family, finish, or reflection style.')
  }
  if (reason.includes('[validation_category:attachment_drift]')) {
    guidance.add('Correct the attachment and connector layout to match Image 2 exactly. Keep hinges, clasps, links, charm joints, and mounting logic identical to Image 2.')
  }
  if (reason.includes('[validation_category:oversized_product]')) {
    guidance.add('Correct the replacement product back to the selected product real-world size. Do not let the replaced Image 1 product size remain in control.')
    guidance.add('If the product appears oversized on the model, reduce only the product scale until the local body-anchor ratio matches the selected product from Image 2 and Product DNA.')
    guidance.add('For earrings, match ear-lobe coverage and piercing-area proportion to the selected product. Do not keep the larger visible dominance from Image 1.')
  }
  if (reason.includes('[validation_category:missing_structure]')) {
    guidance.add('Restore all missing structural components from Image 2 exactly, including attachments, edges, connectors, clasps, stones, and dangling parts.')
  }
  if (reason.includes('[validation_category:source_contamination]') && reason.includes('[validation_category:missing_structure]')) {
    guidance.add('Combined failure lock: first erase the entire original Image 1 product silhouette and attachment trace, then place the full intact Image 2 product structure back at the same anchor.')
    guidance.add('Do not blend replacement into the old shape. Replace the whole object as one complete unit from Image 2.')
    guidance.add('The final visible product must contain every major structural part from Image 2 and zero structural residue from Image 1.')
    guidance.add('If the original anchor in Image 1 is incompatible with the full Image 2 structure, preserve the full Image 2 structure and adjust local integration or occlusion before changing size.')
  }
  if (reason.includes('[validation_category:geometry_drift]')) {
    guidance.add('Undo all geometry drift. Keep edges, angles, spacing, thickness, and proportions identical to Image 2.')
  }
  if (reason.includes('[validation_category:scene_drift]')) {
    guidance.add('Restore the Image 1 scene exactly. Do not alter pose, fingers, framing, background, lighting direction, or contact geometry.')
    guidance.add('If Image 1 is a flat lay, tabletop, product-only, or no-person reference, remove any introduced hands, fingers, arms, or human interaction completely.')
  }
  if (reason.includes('visual_check_failed:product_identity') || reason.includes('failed visual checks: product_identity') || reason.includes('product_identity')) {
    guidance.add('Visual review failed on product identity. Replace the visible product with the exact same product instance from Image 2 only.')
  }
  if (reason.includes('visual_check_missing:product_identity')) {
    guidance.add('Visual review could not confirm product identity. Make Image 2 product identity unmistakable and reject any ambiguous or blended result.')
  }
  if (reason.includes('visual_check_failed:source_contamination') || reason.includes('source_contamination')) {
    guidance.add('Visual review failed on source contamination. Remove every visible design trace of the original Image 1 product before placing Image 2.')
  }
  if (reason.includes('visual_check_missing:source_contamination')) {
    guidance.add('Visual review could not clear source contamination. Remove all original-product silhouette and design-language traces from Image 1.')
  }
  if (reason.includes('visual_check_failed:material_color') || reason.includes('material_color')) {
    guidance.add('Visual review failed on material and color. Match Image 2 material response, finish, and color family exactly.')
  }
  if (reason.includes('visual_check_missing:material_color')) {
    guidance.add('Visual review could not confirm material and color. Make Image 2 finish, tone, and material response explicit and exact.')
  }
  if (reason.includes('visual_check_failed:attachment_structure') || reason.includes('attachment_structure')) {
    guidance.add('Visual review failed on attachment structure. Match Image 2 hinges, clasps, links, mounting points, and connector spacing exactly.')
    guidance.add('Do not turn the hoop into a double-band or layered ring body. Keep the exact single-hoop body structure from Image 2.')
    guidance.add('Do not drop any bow tail crystal. Keep the exact same dangling crystal count shown in Image 2.')
    guidance.add('Do not replace the curved snap-closure post with a straight post or straight pin. Keep the exact closure geometry from Image 2.')
    guidance.add('Restore the exact front-fixed bow attachment from Image 2. Keep the bow mounted on the front of the hoop, not floating, not side-mounted, and not reattached elsewhere.')
  }
  if (reason.includes('visual_check_missing:attachment_structure')) {
    guidance.add('Visual review could not confirm attachment structure. Make hinges, clasps, links, hooks, and connector spacing match Image 2 unambiguously.')
  }
  if (reason.includes('visual_check_failed:scale') || reason.includes('failed visual checks: scale') || reason.includes('scale')) {
    guidance.add('Visual review failed on scale. Restore the replacement product to the selected product real-world size and keep the correct body-to-product size relationship.')
    guidance.add('If the result still looks oversized on the model, shrink the product to the correct ear-lobe, ear-rim, or body-anchor proportion without moving the anchor point.')
  }
  if (reason.includes('visual_check_missing:scale')) {
    guidance.add('Visual review could not confirm scale. Match the replacement product to the selected product real-world proportion from Image 2 and Product DNA.')
    guidance.add('Make the body-to-product ratio unmistakable. For earrings, keep a believable ear-lobe coverage ratio for the selected product instead of following the old earring size from Image 1.')
  }
  if (reason.includes('visual_check_failed:scene_preservation') || reason.includes('scene_preservation')) {
    guidance.add('Visual review failed on scene preservation. Keep Image 1 pose, framing, fingers, lighting, and background unchanged.')
    guidance.add('If Image 1 is a flat lay, tabletop, product-only, or no-person reference, keep the final image completely free of hands, fingers, arms, and human interaction.')
  }
  if (reason.includes('visual_check_missing:scene_preservation')) {
    guidance.add('Visual review could not confirm scene preservation. Keep Image 1 pose, framing, fingers, lighting, and background unchanged and explicit.')
    guidance.add('If Image 1 is a flat lay, tabletop, product-only, or no-person reference, make the no-human scene explicit and remove any hand-like or body-part residue.')
  }
  if (reason.includes('original product') || reason.includes('replacement incomplete')) {
    guidance.add('Remove the original product identity from Image 1 completely. The final visible product must come only from Image 2.')
  }
  if (reason.includes('oversized') || reason.includes('too large') || reason.includes('larger than')) {
    guidance.add('Correct product scale back to the selected product real-world size. Do not enlarge it and do not overcorrect by shrinking it.')
  }
  if (reason.includes('wrong product') || reason.includes('different product') || reason.includes('mismatch')) {
    guidance.add('Use the exact product identity from Image 2 only. Do not output a similar item, substitute design, or same-category variant.')
  }
  if (reason.includes('missing clasp') || reason.includes('missing part') || reason.includes('missing exact phrases')) {
    guidance.add('Preserve every key structural part from Image 2. Do not drop clasps, charms, links, stones, edges, or attachment components.')
  }
  if (reason.includes('two baguette stones') || reason.includes('three seen in the reference')) {
    guidance.add('Correct the bow tail crystal count to exactly match Image 2. If Image 2 shows three tail stones, output exactly three tail stones.')
  }
  if (reason.includes('double band') || reason.includes('single solid band')) {
    guidance.add('Correct the hoop body to match Image 2 exactly. Keep one single hoop body and never render a double-band or layered hoop.')
  }
  if (reason.includes('opening or closing structures')) {
    guidance.add('Keep the exact opening or closing state from Image 2. Do not turn a closed structure into an open one and do not remove the closure mechanism.')
  }
  if (reason.includes('wrong geometry') || reason.includes('wrong proportion') || reason.includes('structural deviation')) {
    guidance.add('Correct the product geometry and proportions to match Image 2 exactly. No reshaping, rounding, stretching, or beautifying.')
  }
  if (reason.includes('oval hoop') || reason.includes('oval') || reason.includes('flattened')) {
    guidance.add('Correct the hoop outline to match Image 2 exactly. Do not ovalize, flatten, widen, or compress the circular hoop body.')
  }
  if (reason.includes('straight post') || reason.includes('straight attachment') || reason.includes('straight bar')) {
    guidance.add('Correct the attachment geometry to match Image 2 exactly. Restore the curved huggie snap-closure post and remove any straight-post substitute.')
  }
  if (
    reason.includes('huggie') ||
    reason.includes('snap') ||
    reason.includes('closure') ||
    reason.includes('fixed') ||
    reason.includes('front')
  ) {
    guidance.add('Restore huggie snap-closure identity exactly as shown in Image 2. Keep the closed hoop, curved snap closure, and front-fixed attachment structure unchanged.')
  }
  if (
    reason.includes('bow') ||
    reason.includes('stone') ||
    reason.includes('facets') ||
    reason.includes('faceted') ||
    reason.includes('transparent')
  ) {
    guidance.add('Restore the exact bow-and-stone structure from Image 2. Keep the front-facing bow, faceted transparent stones, and exact dangling crystal arrangement unchanged.')
  }
  if (
    reason.includes('silhouette') ||
    reason.includes('original contour') ||
    reason.includes('leftover contour') ||
    reason.includes('design language')
  ) {
    guidance.add('Do not preserve any contour or silhouette cue from the original product in Image 1. Keep only the Image 2 shape language.')
  }
  if (
    reason.includes('wrong material') ||
    reason.includes('wrong color') ||
    reason.includes('color drift') ||
    reason.includes('material drift') ||
    reason.includes('finish mismatch')
  ) {
    guidance.add('Match Image 2 material and color exactly. Correct metal finish, coating, tone, gem color, and reflection behavior.')
  }
  if (
    reason.includes('wrong connector') ||
    reason.includes('wrong attachment') ||
    reason.includes('connector drift') ||
    reason.includes('attachment drift') ||
    reason.includes('visual_check_failed:attachment_structure')
  ) {
    guidance.add('Match the exact connector and attachment logic from Image 2. Do not keep the original clasp, hinge, post, hook, or joint layout.')
  }
  if (reason.includes('visual failures')) {
    guidance.add('Prioritize a clean visual replacement result: exact product identity from Image 2, unchanged scene from Image 1, no leftover original object.')
  }
  const analysis = normalizeLivePhotoProductAnalysis(item.productSnapshot?.productAnalysis)
  if (analysis?.coreSubject) {
    guidance.add(`Keep the exact core product identity from Image 2: ${analysis.coreSubject}.`)
  }
  if (analysis?.connectionStructure) {
    guidance.add(`Keep the exact connection and attachment structure from Image 2: ${analysis.connectionStructure}.`)
  }
  if (analysis?.geometryDetails) {
    guidance.add(`Keep the exact geometry from Image 2: ${analysis.geometryDetails}.`)
  }
  if (analysis?.sizeScale) {
    guidance.add(`Keep the selected product real-world scale from Image 2 and Product DNA: ${analysis.sizeScale}.`)
  }
  return Array.from(guidance)
}

function inferLivePhotoValidationCategories(input: {
  missing: string[]
  negativeSignals: string[]
  strictReview?: {
    missingPhrases?: string[]
    negativeSignals?: string[]
  }
  visualReview?: {
    failures?: string[]
    notes?: string[]
    checks?: Record<string, unknown>
  }
}) {
  const categories = new Set<string>()
  const visualChecks = input.visualReview?.checks && typeof input.visualReview.checks === 'object'
    ? input.visualReview.checks
    : {}
  const visualFailedChecks = Object.entries(visualChecks)
    .filter(([_, value]) => String(value || '').trim().toLowerCase() === 'fail')
    .map(([key]) => `visual_check_failed:${String(key || '').trim()}`)
    .filter(Boolean)
  const visualMissingChecks = getLivePhotoVisualMissingChecks(visualChecks)
    .map((key) => `visual_check_missing:${key}`)
    .filter(Boolean)
  const text = [
    ...(input.missing || []),
    ...(input.negativeSignals || []),
    ...(input.strictReview?.missingPhrases || []),
    ...(input.strictReview?.negativeSignals || []),
    ...(input.visualReview?.failures || []),
    ...(input.visualReview?.notes || []),
    ...visualFailedChecks,
    ...visualMissingChecks,
  ]
    .join(' ')
    .toLowerCase()
  if (
    text.includes('original product') ||
    text.includes('replacement incomplete') ||
    text.includes('leftover original') ||
    text.includes('preserves the original')
  ) {
    categories.add('original_product_retained')
  }
  if (
    text.includes('wrong product') ||
    text.includes('different product') ||
    text.includes('mismatch') ||
    text.includes('lookalike') ||
    text.includes('same-category') ||
    text.includes('visual_check_failed:product_identity') ||
    text.includes('visual_check_missing:product_identity')
  ) {
    categories.add('wrong_product_identity')
  }
  if (
    text.includes('silhouette') ||
    text.includes('original contour') ||
    text.includes('leftover contour') ||
    text.includes('design language') ||
    text.includes('mixed product features') ||
    text.includes('mixes image 1 product features') ||
    text.includes('visual_check_failed:source_contamination') ||
    text.includes('visual_check_missing:source_contamination')
  ) {
    categories.add('source_contamination')
  }
  if (
    text.includes('wrong material') ||
    text.includes('wrong color') ||
    text.includes('color drift') ||
    text.includes('material drift') ||
    text.includes('finish mismatch') ||
    text.includes('preserves the image 1 product material') ||
    text.includes('preserves the image 1 product color') ||
    text.includes('visual_check_failed:material_color') ||
    text.includes('visual_check_missing:material_color')
  ) {
    categories.add('material_color_drift')
  }
  if (
    text.includes('wrong connector') ||
    text.includes('wrong attachment') ||
    text.includes('connector drift') ||
    text.includes('attachment drift') ||
    text.includes('connector layout') ||
    text.includes('attachment logic') ||
    text.includes('visual_check_failed:attachment_structure') ||
    text.includes('visual_check_missing:attachment_structure')
  ) {
    categories.add('attachment_drift')
  }
  if (
    text.includes('oversized') ||
    text.includes('too large') ||
    text.includes('larger than') ||
    text.includes('enlarged product') ||
    text.includes('wrong scale') ||
    text.includes('visual_check_failed:scale') ||
    text.includes('visual_check_missing:scale')
  ) {
    categories.add('oversized_product')
  }
  if (
    text.includes('missing clasp') ||
    text.includes('missing part') ||
    text.includes('missing parts') ||
    text.includes('missing exact phrases') ||
    text.includes('missing structural') ||
    text.includes('missing component')
  ) {
    categories.add('missing_structure')
  }
  if (
    text.includes('wrong geometry') ||
    text.includes('wrong proportion') ||
    text.includes('wrong proportions') ||
    text.includes('structural deviation') ||
    text.includes('deformed structure') ||
    text.includes('geometry drift')
  ) {
    categories.add('geometry_drift')
  }
  if (
    text.includes('different pose') ||
    text.includes('different scene') ||
    text.includes('different framing') ||
    text.includes('different background') ||
    text.includes('different lighting direction') ||
    text.includes('deformed hand') ||
    text.includes('deformed body') ||
    text.includes('visual_check_failed:scene_preservation') ||
    text.includes('visual_check_missing:scene_preservation')
  ) {
    categories.add('scene_drift')
  }
  return Array.from(categories)
}

async function generateReferenceReplacementStill(input: {
  item: LivePhotoItem
  product: LivePhotoProductSnapshot
  referenceImagePath: string
  strategyOverride?: LivePhotoReplacementStrategy
}) {
  const credentials = await cloneRepo.getCredentials()
  const root = livePhotoRoot(input.item.id)
  const stillDir = join(root, 'generated-still')
  await ensureDir(stillDir)

  const payload = resolveLivePhotoReferenceImagePayload({
    referenceImagePath: input.referenceImagePath,
    product: input.product,
  })
  const replacementStrategy = input.strategyOverride || inferLivePhotoReplacementStrategy({ item: input.item, product: input.product })
  const renderConfig = resolveLivePhotoReplacementRenderConfig(replacementStrategy, input.product)
  const retryGuidance = buildLivePhotoRetryGuidance(input.item, input.product)
  const providerRolePrefix = buildLivePhotoProviderRolePrefix({
    referenceImagePath: payload.referenceImagePath,
    productReferenceImagePath: payload.productReferenceImagePaths[0] || '',
  })
  const negativePrompt = buildReferenceReplacementNegativePrompt({
    product: input.product,
    strategy: replacementStrategy,
  })
  const imageGenerator =
    livePhotoDeps.generateGptShotFrameImage === generateGptShotFrameImage
      ? generateScopedGptShotFrameImage
      : livePhotoDeps.generateGptShotFrameImage
  const stillPath = await imageGenerator({
    credentials,
    prompt: `${providerRolePrefix}\n\n${buildReferenceReplacementPrompt({
      product: input.product,
      productReferenceImagePaths: payload.productReferenceImagePaths,
      referenceImagePath: payload.referenceImagePath,
      retryGuidance,
      strategy: replacementStrategy,
    })}`,
    negativePrompt,
    imagePaths: payload.imagePaths,
    uploadFileNames: buildLivePhotoUploadFileNames(),
    uploadKeyPrefixes: buildLivePhotoUploadKeyPrefixes(),
    outDir: stillDir,
    filePrefix: 'reference_replace',
    normalizeOutput: renderConfig.normalizeOutput,
    outputSize: renderConfig.outputSize,
    providerScope: renderConfig.providerScope,
  })

  return {
    stillPath,
    productReferenceImagePaths: payload.productReferenceImagePaths,
    strategy: replacementStrategy,
  }
}

async function submitReferenceReplacementStillTask(input: {
  item: LivePhotoItem
  product: LivePhotoProductSnapshot
  referenceImagePath: string
  strategyOverride?: LivePhotoReplacementStrategy
}) {
  const credentials = await cloneRepo.getCredentials()
  const root = livePhotoRoot(input.item.id)
  const stillDir = join(root, 'generated-still')
  await ensureDir(stillDir)
  const payload = resolveLivePhotoReferenceImagePayload({
    referenceImagePath: input.referenceImagePath,
    product: input.product,
  })
  const replacementStrategy = input.strategyOverride || inferLivePhotoReplacementStrategy({ item: input.item, product: input.product })
  const renderConfig = resolveLivePhotoReplacementRenderConfig(replacementStrategy, input.product)
  const retryGuidance = buildLivePhotoRetryGuidance(input.item, input.product)
  const providerRolePrefix = buildLivePhotoProviderRolePrefix({
    referenceImagePath: payload.referenceImagePath,
    productReferenceImagePath: payload.productReferenceImagePaths[0] || '',
  })
  const prompt = `${providerRolePrefix}\n\n${buildReferenceReplacementPrompt({
    product: input.product,
    productReferenceImagePaths: payload.productReferenceImagePaths,
    referenceImagePath: payload.referenceImagePath,
    retryGuidance,
    strategy: replacementStrategy,
  })}`
  const negativePrompt = buildReferenceReplacementNegativePrompt({
    product: input.product,
    strategy: replacementStrategy,
  })
  const imagePaths = payload.imagePaths
  const providers = livePhotoImageProviderChain(credentials)
  for (const provider of providers) {
    if (provider === 'grsai') {
      try {
        const uploadKeyPrefixes = buildLivePhotoUploadKeyPrefixes()
        const urls = await Promise.all(
          imagePaths.map(async (item, index) =>
            /^https?:\/\//i.test(item)
              ? item
              : await toPublicUrlViaQiniu(
                  credentials,
                  item,
                  String(uploadKeyPrefixes[index] || '').trim() || 'grsai-input/images',
                ),
          ),
        )
        const created = await createGrsImageTask({
          credentials: { ...credentials, imageProviderPrimary: 'grsai' },
          prompt,
          negativePrompt,
          aspectRatio: inferAspectRatioFromOutputSizeSafe(renderConfig.outputSize),
          urls,
        })
        if (created.directUrl) {
          const directPath = await generateReferenceReplacementStill({
            ...input,
            strategyOverride: replacementStrategy,
          })
          return {
            mode: 'direct' as const,
            stillPath: directPath.stillPath,
            provider,
            model: created.model,
            productReferenceImagePaths: payload.productReferenceImagePaths,
          }
        }
        if (created.taskId) {
          return {
            mode: 'remote' as const,
            taskId: created.taskId,
            provider,
            model: created.model,
            productReferenceImagePaths: payload.productReferenceImagePaths,
          }
        }
      } catch (error: any) {
        const reason = String(error?.message || error || '').trim()
        console.warn('[live-photo] grsai reference replacement failed, falling back', {
          itemId: input.item.id,
          provider,
          reason,
        })
        if (!providers.includes('apifox_hub') || providers[providers.length - 1] === 'grsai') {
          throw error
        }
        continue
      }
    }
    if (provider === 'apifox_hub') {
      const generated = await generateApifoxImage({
        credentials: { ...credentials, imageProviderPrimary: 'apifox_hub' },
        prompt,
        negativePrompt,
        imagePaths,
        uploadFileNames: buildLivePhotoUploadFileNames(),
        outDir: stillDir,
        filePrefix: 'reference_replace',
        capability: 'image_edit',
      })
      if (generated.taskId) {
        return {
          mode: 'remote' as const,
          taskId: generated.taskId,
          provider,
          model: generated.model,
          baseUrl: generated.baseUrl,
          endpointStyle: generated.endpointStyle,
          productReferenceImagePaths: payload.productReferenceImagePaths,
        }
      }
      return {
        mode: 'direct' as const,
        stillPath: generated.outputPath,
        provider,
        model: generated.model,
        productReferenceImagePaths: payload.productReferenceImagePaths,
      }
    }
  }
  const generated = await generateReferenceReplacementStill({
    ...input,
    strategyOverride: replacementStrategy,
  })
  return {
    mode: 'direct' as const,
    stillPath: generated.stillPath,
    provider: resolveImagePreviewProvider(credentials),
    model: resolveImagePreviewModel(credentials),
    productReferenceImagePaths: payload.productReferenceImagePaths,
  }
}

async function pollReferenceReplacementStillTask(input: {
  item: LivePhotoItem
  outputDir: string
}) {
  const credentials = await cloneRepo.getCredentials()
  const taskId = String(input.item.imageTaskId || '').trim()
  if (!taskId) throw new Error('Please generate or assign a structured product reference before creating a Live Photo task.')
  if (String(input.item.imageTaskProvider || '').trim() === 'grsai') {
    const snapshot = await queryGrsTask(credentials, taskId)
    if (snapshot.status === 'failed' || snapshot.status === 'error') {
      throw new Error(snapshot.errorMessage || `GRS.AI image task failed: ${taskId}`)
    }
    if (!snapshot.outputUrl) return { synced: false as const, outputPath: undefined, raw: snapshot.raw }
    await ensureDir(input.outputDir)
    const outputPath = join(input.outputDir, `reference_replace_${Date.now()}_${randomUUID()}.png`)
    await downloadUrlToFile({ url: snapshot.outputUrl, filePath: outputPath })
    return { synced: true as const, outputPath, raw: snapshot.raw }
  }
  if (String(input.item.imageTaskProvider || '').trim() === 'apifox_hub') {
    const generated = await generateApifoxImage({
      credentials: { ...credentials, imageProviderPrimary: 'apifox_hub' },
      prompt: String(input.item.imagePromptPreview?.prompt || '').trim(),
      negativePrompt: String(input.item.imagePromptPreview?.negativePrompt || '').trim() || undefined,
      imagePaths: input.item.imagePromptPreview?.referenceImagePaths || [],
      outDir: input.outputDir,
      filePrefix: 'reference_replace_resume',
      capability: 'image_edit',
    })
    return { synced: true as const, outputPath: generated.outputPath, raw: generated.raw }
  }
  if (String(input.item.generatedStillPath || '').trim() && existsSync(String(input.item.generatedStillPath || '').trim())) {
    return { synced: true as const, outputPath: String(input.item.generatedStillPath || '').trim(), raw: null }
  }
  return { synced: false as const, outputPath: undefined, raw: null }
}

async function submitLivePhotoVideoTask(input: {
  item: LivePhotoItem
  product?: LivePhotoProductSnapshot
  stillPath: string
  template: LivePhotoMotionTemplate
}) {
  const credentials = await cloneRepo.getCredentials()
  if (livePhotoDeps.generateShotVideoByProviderChain !== generateShotVideoByProviderChain) {
    const outputPath = await generateAiMotionVideoFromStill({
      item: input.item,
      product: input.product,
      stillPath: input.stillPath,
      outputDir: join(livePhotoRoot(input.item.id), 'generated-video'),
      template: input.template,
    })
    return {
      mode: 'direct' as const,
      outputPath,
      provider: livePhotoVideoProviderChain(credentials)[0],
      model: String(credentials.videoModelPrimary || credentials.videoModelFallback || credentials.grsaiVideoModel || '').trim() || undefined,
    }
  }
  const shot = buildLivePhotoVideoShotSpec({
    item: input.item,
    product: input.product,
    template: input.template,
    startFramePath: input.stillPath,
  })
  const chain = livePhotoVideoProviderChain(credentials)
  const provider = chain[0]
  const providerModel = resolveLivePhotoVideoModel(credentials, provider)
  if (provider === 'apifox_hub') {
    const firstFrameUrl = await toPublicUrlViaQiniu(credentials, input.stillPath, 'cloud-video-input/live-photo-first-frame')
    const requestCapability = 'video_image_to_video'
    let created: Awaited<ReturnType<typeof createVideoTask>>
    try {
      created = await createVideoTask({
        credentials,
        capability: requestCapability,
        prompt: shot.prompt?.positive || shot.compiledPrompt || '',
        negativePrompt: shot.prompt?.negative || shot.compiledNegativePrompt || '',
        image: firstFrameUrl,
        lastImage: undefined,
        referenceImages: [],
        durationSec: 6,
        aspectRatio: '9:16',
        motionStrength: 1,
        enhancePrompt: false,
      })
    } catch (error: any) {
      const remoteTaskId = extractRemoteTaskIdFromErrorLike(error)
      if (error instanceof Ai666TaskTimeoutError || (remoteTaskId && String(error?.name || '').includes('Ai666TaskTimeoutError'))) {
        return {
          mode: 'remote' as const,
          taskId: remoteTaskId,
          provider,
          model: providerModel,
          baseUrl: String(resolveApifoxHubCredentials(credentials, 'video')?.baseUrl || '').trim() || undefined,
          endpointStyle: String(resolveApifoxHubCredentials(credentials, 'video')?.videoEndpointStyle || '').trim() || undefined,
        }
      }
      throw error
    }
    if (created.directOutputUrl) {
      const outputDir = join(livePhotoRoot(input.item.id), 'generated-video')
      await ensureDir(outputDir)
      const outputPath = join(outputDir, `live_photo_video_${Date.now()}_${randomUUID()}.mp4`)
      await downloadUrlToFile({ url: created.directOutputUrl, filePath: outputPath })
      return { mode: 'direct' as const, outputPath, provider, model: created.model }
    }
    if (created.taskId) {
      return {
        mode: 'remote' as const,
        taskId: created.taskId,
        provider,
        model: created.model,
        baseUrl: created.baseUrl,
        endpointStyle: created.endpointStyle,
      }
    }
  }
  if (provider === 'grsai') {
    const firstFrameUrl = await toPublicUrlViaQiniu(credentials, input.stillPath, 'grsai-video-input/live-photo-first-frame')
    const created = await createGrsVideoTask({
      credentials,
      model: providerModel,
      prompt: shot.prompt?.positive || shot.compiledPrompt || '',
      negativePrompt: shot.prompt?.negative || shot.compiledNegativePrompt || '',
      firstFrameUrl,
    })
    if (created.directUrl) {
      const outputDir = join(livePhotoRoot(input.item.id), 'generated-video')
      await ensureDir(outputDir)
      const outputPath = join(outputDir, `live_photo_video_${Date.now()}_${randomUUID()}.mp4`)
      await downloadUrlToFile({ url: created.directUrl, filePath: outputPath })
      return { mode: 'direct' as const, outputPath, provider, model: created.model }
    }
    if (created.taskId) {
      return {
        mode: 'remote' as const,
        taskId: created.taskId,
        provider,
        model: created.model,
      }
    }
  }
  const directOutput = await generateAiMotionVideoFromStill({
    item: input.item,
    product: input.product,
    stillPath: input.stillPath,
    outputDir: join(livePhotoRoot(input.item.id), 'generated-video'),
    template: input.template,
  })
  return { mode: 'direct' as const, outputPath: directOutput, provider, model: String(credentials.videoModelPrimary || credentials.videoModelFallback || '').trim() || undefined }
}

function buildImageRequestPreview(input: {
  provider?: string
  model?: string
  prompt: string
  negativePrompt?: string
  referenceImagePaths: string[]
}): LivePhotoRequestPreview {
  return {
    provider: String(input.provider || '').trim() || undefined,
    model: String(input.model || '').trim() || undefined,
    prompt: input.prompt,
    negativePrompt: String(input.negativePrompt || '').trim() || undefined,
    referenceImagePaths: input.referenceImagePaths,
  }
}

function resolveImagePreviewProvider(credentials: ModelCredentials) {
  return String(credentials.imageProviderPrimary || '').trim() || 'openai'
}

function resolveImagePreviewModel(credentials: ModelCredentials) {
  const provider = resolveImagePreviewProvider(credentials)
  if (provider === 'openai') return String(credentials.openaiImageModel || '').trim() || 'gpt-image-1'
  if (provider === 'grsai') return String(credentials.grsaiImageModel || '').trim() || 'gemini-2.5-flash-image'
  if (provider === 'kling') return 'kling-image'
  return String(credentials.openaiImageModel || credentials.grsaiImageModel || '').trim() || 'image-model'
}

function resolveLivePhotoImageExecutionProvider(credentials: ModelCredentials) {
  const preferred = String(credentials.imageProviderPrimary || '').trim()
  const hasApifox = hasStrictImageEditProviderCredential(credentials, 'apifox_hub')
  const hasOpenAi = hasStrictImageEditProviderCredential(credentials, 'openai')
  const hasGrs = hasStrictImageEditProviderCredential(credentials, 'grsai')
  if (preferred === 'grsai' && hasGrs) return 'grsai'
  if (preferred === 'openai' && hasOpenAi) return 'openai'
  if (preferred === 'apifox_hub' && hasApifox) return 'apifox_hub'
  if (preferred === 'grsai' && hasApifox) return 'apifox_hub'
  if (preferred === 'openai' && hasApifox) return 'apifox_hub'
  if (hasGrs) return 'grsai'
  if (hasOpenAi) return 'openai'
  if (hasApifox) return 'apifox_hub'
  return resolveImagePreviewProvider(credentials)
}

function resolveLivePhotoImageExecutionModel(credentials: ModelCredentials, provider: string) {
  if (provider === 'apifox_hub') {
    const cfg = resolveApifoxHubCredentials(credentials, 'image')
    return String(cfg?.imageEditModel || cfg?.imageModel || '').trim() || 'image-edit-model'
  }
  if (provider === 'openai') return String(credentials.openaiImageModel || '').trim() || 'gpt-image-1'
  if (provider === 'grsai') return String(credentials.grsaiImageModel || '').trim() || 'gpt-image-2'
  return resolveImagePreviewModel(credentials)
}

function livePhotoImageProviderChain(credentials: ModelCredentials) {
  const provider = resolveLivePhotoImageExecutionProvider(credentials)
  return provider ? [provider] : []
}

function ensureLivePhotoStrictImageEditProvider(credentials: ModelCredentials) {
  if (canUseMockGeneration(credentials)) return
  const preferred = String(credentials.imageProviderPrimary || '').trim()
  const hasApifox = hasStrictImageEditProviderCredential(credentials, 'apifox_hub')
  const hasOpenAi = hasStrictImageEditProviderCredential(credentials, 'openai')
  const hasGrs = hasStrictImageEditProviderCredential(credentials, 'grsai')
  const hasStrictProvider = hasApifox || hasOpenAi || hasGrs
  if (hasStrictProvider) return
  throw new Error(
    `Live Photo replacement requires a strict image-edit provider. Current preferred provider: ${preferred || 'openai'}. Configure Apifox Hub, OpenAI image edit, or GRS.AI image edit before running replacement.`,
  )
}

function inferAspectRatioFromOutputSizeSafe(outputSize: string | undefined): '1:1' | '9:16' | '16:9' {
  const value = String(outputSize || '').trim().toLowerCase()
  const match = value.match(/^(\d+)\s*x\s*(\d+)$/)
  if (!match) return '9:16'
  const width = Number(match[1])
  const height = Number(match[2])
  if (!width || !height) return '9:16'
  if (width === height) return '1:1'
  return width > height ? '16:9' : '9:16'
}

function buildVideoRequestPreview(input: {
  item: LivePhotoItem
  product?: LivePhotoProductSnapshot
  template: LivePhotoMotionTemplate
  startFramePath: string
  credentials: ModelCredentials
}): LivePhotoRequestPreview {
  const shot = buildLivePhotoVideoShotSpec({
    item: input.item,
    product: input.product,
    template: input.template,
    startFramePath: input.startFramePath,
  })
  let provider: AiProviderName | undefined
  try {
    provider = livePhotoVideoProviderChain(input.credentials)[0] || undefined
  } catch {
    provider = undefined
  }
  const model =
    provider === 'apifox_hub'
      ? String(
          resolveApifoxHubCredentials(input.credentials, 'video')?.referenceVideoModel ||
            resolveApifoxHubCredentials(input.credentials, 'video')?.startEndVideoModel ||
            resolveApifoxHubCredentials(input.credentials, 'video')?.imageToVideoModel ||
            resolveApifoxHubCredentials(input.credentials, 'video')?.textToVideoModel ||
            '',
        ).trim() || undefined
      : provider === 'grsai'
        ? String(input.credentials.grsaiVideoModel || '').trim() || undefined
        : String(input.credentials.videoModelPrimary || input.credentials.videoModelFallback || '').trim() || undefined
  return {
    provider,
    model,
    prompt: shot.prompt?.positive || shot.compiledPrompt || '',
    negativePrompt: shot.prompt?.negative || shot.compiledNegativePrompt || '',
    referenceImagePaths: [input.startFramePath].filter(Boolean),
  }
}

function resolveLivePhotoVideoPreview(item: LivePhotoItem, credentials: ModelCredentials): LivePhotoRequestPreview | undefined {
  const startFramePath =
    String(item.generatedStillPath || '').trim() ||
    String(item.referenceImagePath || '').trim() ||
    String(item.cloneShotSnapshot?.imagePath || '').trim() ||
    String(item.cloneShotSnapshot?.videoPath || '').trim()
  if (!startFramePath) return item.videoPromptPreview
  return buildVideoRequestPreview({
    item,
    product: item.productSnapshot,
    template: item.sourceType === 'reference_replace' ? 'push_in' : 'ambient_sway',
    startFramePath,
    credentials,
  })
}

function resolveLivePhotoVideoModel(credentials: ModelCredentials, provider: AiProviderName | undefined) {
  if (provider === 'apifox_hub') {
    const cfg = resolveApifoxHubCredentials(credentials, 'video')
    return (
      String(cfg?.referenceVideoModel || '').trim() ||
      String(cfg?.startEndVideoModel || '').trim() ||
      String(cfg?.imageToVideoModel || '').trim() ||
      String(cfg?.textToVideoModel || '').trim() ||
      undefined
    )
  }
  if (provider === 'grsai') {
    return String(credentials.grsaiVideoModel || '').trim() || undefined
  }
  return String(credentials.videoModelPrimary || credentials.videoModelFallback || '').trim() || undefined
}

function resolveLivePhotoImagePreview(item: LivePhotoItem, credentials: ModelCredentials): LivePhotoRequestPreview | undefined {
  const referenceImagePath = String(item.referenceImagePath || '').trim()
  if (!item.productSnapshot) return item.imagePromptPreview
  try {
    const productSnapshot = item.productSnapshot as LivePhotoProductSnapshot
    return buildReferenceReplacementImagePromptPreview({
      product: productSnapshot,
      referenceImagePath,
      credentials,
      retryGuidance: buildLivePhotoRetryGuidance(item, productSnapshot),
    })
  } catch {
    return item.imagePromptPreview
  }
}

function buildReferenceReplacementImagePromptPreview(input: {
  product: LivePhotoProductSnapshot
  referenceImagePath: string
  credentials: ModelCredentials
  retryGuidance?: string[]
}) {
  const payload = resolveLivePhotoReferenceImagePayload({
    referenceImagePath: input.referenceImagePath,
    product: input.product,
  })
  const replacementStrategy: LivePhotoReplacementStrategy =
    Array.isArray(input.retryGuidance) && input.retryGuidance.length
      ? (isEarringLikeLivePhotoProduct(input.product) ? 'anchor_closeup' : 'erase_first')
      : 'default'
  const provider = resolveLivePhotoImageExecutionProvider(input.credentials)
  return buildImageRequestPreview({
    provider,
    model: resolveLivePhotoImageExecutionModel(input.credentials, provider),
    prompt: `${buildLivePhotoProviderRolePrefix({
      referenceImagePath: payload.referenceImagePath,
      productReferenceImagePath: payload.productReferenceImagePaths[0] || '',
    })}\n\n${buildReferenceReplacementPrompt({
      product: input.product,
      productReferenceImagePaths: payload.productReferenceImagePaths,
      referenceImagePath: payload.referenceImagePath,
      retryGuidance: input.retryGuidance,
      strategy: replacementStrategy,
    })}`,
    negativePrompt: buildReferenceReplacementNegativePrompt({
      product: input.product,
      strategy: replacementStrategy,
    }),
    referenceImagePaths: payload.imagePaths,
  })
}

function canResumeLivePhotoAutoFlow(item: LivePhotoItem) {
  const autoFlow = ensureAutoFlowStatus(item)
  if (!autoFlow.enabled) return false
  if (autoFlow.paused) return false
  if (item.packagingStatus === 'completed') return false
  if (autoFlow.status === 'failed_terminal') return false
  const hasRemoteTask = Boolean(String(item.imageTaskId || '').trim() || String(item.videoTaskId || '').trim())
  if (autoFlow.status === 'running' && !hasRemoteTask) return false
  if (!['idle', 'running', 'failed_retryable'].includes(autoFlow.status)) return false
  return item.sourceType === 'reference_replace' || item.sourceType === 'clone_shot'
}

function shouldUpgradeFailedItemToTerminal(item: LivePhotoItem) {
  const autoFlow = ensureAutoFlowStatus(item)
  if (item.packagingStatus !== 'failed') return false
  if (autoFlow.status !== 'failed_retryable') return false
  if (String(item.videoTaskId || '').trim()) return true
  return false
}

function resolveLivePhotoFailureStage(item: LivePhotoItem, fallback: LivePhotoWorkflowStep): LivePhotoWorkflowStep {
  if (String(item.videoTaskId || '').trim()) return 'video_generation'
  if (String(item.imageTaskId || '').trim()) return 'image_generation'
  return fallback
}

function shouldForceTerminalLivePhotoFailure(stage: LivePhotoWorkflowStep, reason: string) {
  if (String(reason || '').includes('[remote_pending]')) return false
  return stage === 'video_generation'
}

function isLivePhotoImageValidationFailure(reason: string) {
  return String(reason || '').includes('[image_validation_failed]')
}

function resolveShotLabel(input: { shotId: string; shot?: any }) {
  const role = String(input.shot?.scriptRole || input.shot?.role || '').trim()
  const text = String(input.shot?.scriptText || input.shot?.narrationText || '').trim()
  return safeName([role, text].filter(Boolean).join(' - '), input.shotId)
}

function pickCloneShotMedia(project: any, shotId: string): LivePhotoCloneShotSnapshot {
  const shot = Array.isArray(project?.blueprint?.shots) ? project.blueprint.shots.find((item: any) => item?.id === shotId) : null
  const frame = Array.isArray(project?.storyboardFrames) ? project.storyboardFrames.find((item: any) => item?.shotId === shotId) : null
  const output = Array.isArray(project?.shotVideoOutputs) ? project.shotVideoOutputs.find((item: any) => item?.shotId === shotId) : null
  const imagePath = String(frame?.imagePath || '').trim() || undefined
  const videoPath = String(output?.videoPath || output?.localPath || '').trim() || undefined
  if (!imagePath && !videoPath) throw new Error(`Shot ${shotId} does not have storyboard frame or shot video`)
  return {
    shotId,
    shotLabel: resolveShotLabel({ shotId, shot }),
    imagePath,
    videoPath,
  }
}

async function materializeItem(input: {
  item: LivePhotoItem
  stillSourcePath: string
  videoSourcePath?: string
  motionTemplate: LivePhotoMotionTemplate
  product?: LivePhotoProductSnapshot
}) {
  const root = livePhotoRoot(input.item.id)
  await ensureDir(root)
  const stillPath = join(root, `still${extname(input.stillSourcePath) || '.jpg'}`)
  const posterPath = join(root, 'poster.jpg')
  const previewVideoPath = join(root, 'preview.mp4')
  const liveImagePath = join(root, 'live-photo.jpg')
  const liveVideoPath = join(root, 'live-photo.mov')
  const manifestPath = join(root, 'live-photo.json')
  await copyFile(input.stillSourcePath, stillPath)

  let motionVideoPath = input.videoSourcePath ? join(root, `motion${extname(input.videoSourcePath) || '.mp4'}`) : join(root, 'motion.mp4')
  if (input.videoSourcePath) {
    await normalizePreviewVideo({ sourceVideoPath: input.videoSourcePath, outputPath: motionVideoPath })
  } else {
    const generatedVideoPath = await generateAiMotionVideoFromStill({
      item: input.item,
      product: input.product,
      stillPath,
      outputDir: join(root, 'generated-video'),
      template: input.motionTemplate,
    })
    await normalizePreviewVideo({ sourceVideoPath: generatedVideoPath, outputPath: motionVideoPath })
  }

  await renderPosterFromVideo({ videoPath: motionVideoPath, posterPath })
  await copyFile(stillPath, liveImagePath)
  await copyFile(motionVideoPath, liveVideoPath)
  await writeFile(
    manifestPath,
    JSON.stringify(
      {
        itemId: input.item.id,
        type: 'apple_live_photo_manifest',
        image: basename(liveImagePath),
        video: basename(liveVideoPath),
      },
      null,
      2,
    ),
    'utf-8',
  )
  await normalizePreviewVideo({ sourceVideoPath: motionVideoPath, outputPath: previewVideoPath })

  return {
    generatedStillPath: stillPath,
    motionVideoPath,
    livePhotoImagePath: liveImagePath,
    livePhotoVideoPath: liveVideoPath,
    packagingManifestPath: manifestPath,
    previewVideoPath,
    posterPath,
    packagingStatus: 'completed' as const,
    error: undefined,
  }
}

async function finalizeReferenceItem(input: {
  item: LivePhotoItem
  product: LivePhotoProductSnapshot
  referenceImagePath: string
  motionTemplate: LivePhotoMotionTemplate
}) {
  const credentials = await cloneRepo.getCredentials()
  const stillOutputDir = join(livePhotoRoot(input.item.id), 'generated-still')
  const workflowCurrentStep = String(input.item.workflow?.currentStep || '').trim()
  const autoFlowCurrentStage = String(input.item.autoFlowStatus?.currentStage || '').trim()
  const hasPendingOrGeneratedVideo =
    Boolean(String(input.item.videoTaskId || '').trim()) ||
    Boolean(String(input.item.motionVideoPath || '').trim() && existsSync(String(input.item.motionVideoPath || '').trim()))
  const requestedVideoStageResume =
    workflowCurrentStep === 'video_generation' || autoFlowCurrentStage === 'video_generation'
  const shouldResumeFromVideoStage =
    (hasPendingOrGeneratedVideo || requestedVideoStageResume) &&
    Boolean(String(input.item.generatedStillPath || '').trim() && existsSync(String(input.item.generatedStillPath || '').trim()))

  if (shouldResumeFromVideoStage) {
    const imageDoneItem: LivePhotoItem = {
      ...input.item,
      productSnapshot: input.product,
      workflow: patchWorkflow(input.item.workflow, 'video_generation', 'video_generation', 'running'),
      autoFlowStatus: patchAutoFlowStatus(input.item, 'video_generation', 'running'),
      updatedAt: now(),
    }
    await livePhotoRepo.upsert({
      ...appendLivePhotoLogs(imageDoneItem, [
        buildLivePhotoLog('[live-photo] resuming from video_generation stage'),
      ]),
      updatedAt: now(),
    })

    let latestVideoItem = imageDoneItem
    let materialized: Awaited<ReturnType<typeof materializeItem>>
    if (String(imageDoneItem.videoTaskId || '').trim()) {
      const synced = await pollLivePhotoVideoTask({
        item: imageDoneItem,
        credentials,
        outputDir: join(livePhotoRoot(imageDoneItem.id), 'generated-video'),
      })
      if (!synced.synced || !synced.outputPath) {
        throw new Error(`[remote_pending] 视频任务已提交，正在等待远端结果。taskId=${imageDoneItem.videoTaskId}`)
      }
      latestVideoItem = {
        ...imageDoneItem,
        motionVideoPath: synced.outputPath,
        videoTaskId: undefined,
        videoTaskProvider: undefined,
        videoTaskModel: undefined,
        videoTaskBaseUrl: undefined,
        videoTaskEndpointStyle: undefined,
        logs: [
          ...(Array.isArray(imageDoneItem.logs) ? imageDoneItem.logs : []),
          buildLivePhotoLog(`[live-photo] video task synced: taskId=${imageDoneItem.videoTaskId}`, 'success'),
        ],
        updatedAt: now(),
      }
      materialized = await withTimeout(
        materializeItem({
          item: latestVideoItem,
          stillSourcePath: String(imageDoneItem.generatedStillPath || '').trim(),
          videoSourcePath: synced.outputPath,
          motionTemplate: input.motionTemplate,
          product: input.product,
        }),
        LIVE_PHOTO_REFERENCE_PACKAGING_TIMEOUT_MS,
        'Reference live photo packaging',
      )
    } else {
      materialized = await withTimeout(
        materializeItem({
          item: imageDoneItem,
          stillSourcePath: String(imageDoneItem.generatedStillPath || '').trim(),
          videoSourcePath: String(imageDoneItem.motionVideoPath || '').trim() || undefined,
          motionTemplate: input.motionTemplate,
          product: input.product,
        }),
        LIVE_PHOTO_REFERENCE_PACKAGING_TIMEOUT_MS,
        'Reference live photo packaging',
      )
    }

    return {
      ...appendLivePhotoLogs(latestVideoItem, [
        buildLivePhotoLog('[live-photo] video_generation completed and live photo package materialized', 'success'),
        buildLivePhotoLog('[live-photo] stage live_photo_packaging completed', 'success'),
      ]),
      ...(await withTimeout(
        Promise.resolve(materialized),
        1000,
        'Reference finalize materialize',
      )),
      productSnapshot: input.product,
      updatedAt: now(),
    }
  }

  await livePhotoRepo.upsert({
    ...appendLivePhotoLogs(input.item, [
      buildLivePhotoLog('[live-photo] stage image_generation started'),
      buildLivePhotoLog(`[live-photo] image refs ready: reference=${input.referenceImagePath} productRefs=${input.product.imagePaths.length}`),
    ]),
    workflow: patchWorkflow(input.item.workflow, 'image_generation', 'image_generation', 'running'),
    autoFlowStatus: patchAutoFlowStatus(input.item, 'image_generation', 'running'),
    updatedAt: now(),
  })
  let generated: { stillPath: string; productReferenceImagePaths: string[] }
  if (String(input.item.generatedStillPath || '').trim() && existsSync(String(input.item.generatedStillPath || '').trim())) {
    generated = {
      stillPath: String(input.item.generatedStillPath || '').trim(),
      productReferenceImagePaths: input.product.imagePaths,
    }
  } else if (String(input.item.imageTaskId || '').trim()) {
    const polled = await pollReferenceReplacementStillTask({
      item: input.item,
      outputDir: stillOutputDir,
    })
    if (!polled.synced || !polled.outputPath) {
      throw new Error(buildRemotePendingError('image', input.item.imageTaskId))
    }
    generated = {
      stillPath: polled.outputPath,
      productReferenceImagePaths: input.product.imagePaths,
    }
  } else {
    const submitted = await withTimeout(
      submitReferenceReplacementStillTask({
        item: input.item,
        product: input.product,
        referenceImagePath: input.referenceImagePath,
      }),
      LIVE_PHOTO_REFERENCE_STILL_TIMEOUT_MS,
      'Reference still generation',
    )
    if (submitted.mode === 'remote') {
      await livePhotoRepo.upsert({
        ...appendLivePhotoLogs(input.item, [
          buildLivePhotoLog(`[live-photo] image task submitted: provider=${submitted.provider} taskId=${submitted.taskId}`),
        ]),
        imageTaskId: submitted.taskId,
        imageTaskProvider: submitted.provider,
        imageTaskModel: submitted.model,
        imageTaskBaseUrl: submitted.baseUrl,
        imageTaskEndpointStyle: submitted.endpointStyle,
        workflow: patchWorkflow(input.item.workflow, 'image_generation', 'image_generation', 'running'),
        autoFlowStatus: patchAutoFlowStatus(input.item, 'image_generation', 'running'),
        updatedAt: now(),
      })
      throw new Error(buildRemotePendingError('image', submitted.taskId))
    }
    generated = {
      stillPath: submitted.stillPath,
      productReferenceImagePaths: submitted.productReferenceImagePaths,
    }
  }
  const validation = await validateReferenceReplacementStill({
    product: input.product,
    stillPath: generated.stillPath,
    referenceImagePath: input.referenceImagePath,
  })
  let effectiveValidation = validation
  const autoFlowLogs = [] as ReturnType<typeof buildLivePhotoLog>[]
  if (!effectiveValidation.passed) {
    const validationCategories = inferLivePhotoValidationCategories({
      missing: effectiveValidation.missing || [],
      negativeSignals: effectiveValidation.negativeSignals || [],
      strictReview: effectiveValidation.strictReview,
      visualReview: effectiveValidation.visualReview,
    })
    const baseStrategy = inferLivePhotoReplacementStrategy({ item: input.item, product: input.product })
    if (shouldAttemptInlineReplacementEscalation({ strategy: baseStrategy, product: input.product, validationCategories })) {
      const escalationItem: LivePhotoItem = {
        ...input.item,
        error: '[image_validation_failed] inline escalation requested',
        autoFlowStatus: {
          ...ensureAutoFlowStatus(input.item),
          retryCount: Math.max(1, Number(input.item.autoFlowStatus?.retryCount ?? 0) || 0),
          lastError: validationCategories.map((item) => `[validation_category:${item}]`).join(' '),
        },
      }
      const escalated = await withTimeout(
        generateReferenceReplacementStill({
          item: escalationItem,
          product: input.product,
          referenceImagePath: input.referenceImagePath,
          strategyOverride: 'anchor_closeup',
        }),
        LIVE_PHOTO_REFERENCE_STILL_TIMEOUT_MS,
        'Reference still inline escalation',
      )
      const escalatedValidation = await validateReferenceReplacementStill({
        product: input.product,
        stillPath: escalated.stillPath,
        referenceImagePath: input.referenceImagePath,
      })
      autoFlowLogs.push(
        buildLivePhotoLog(
          `[live-photo] [image_validation_failed] image validation requested inline anchor-closeup escalation${validationCategories.length ? ` ${validationCategories.map((item) => `[validation_category:${item}]`).join(' ')}` : ''}`,
          'info',
        ),
      )
      if (escalatedValidation.passed) {
        generated = {
          stillPath: escalated.stillPath,
          productReferenceImagePaths: escalated.productReferenceImagePaths,
        }
        effectiveValidation = escalatedValidation
        autoFlowLogs.push(
          buildLivePhotoLog(`[live-photo] image validation passed after inline escalation: score=${effectiveValidation.score.toFixed(2)}`, 'success'),
        )
      }
    }
  }
  if (!effectiveValidation.passed) {
    const validationCategories = inferLivePhotoValidationCategories({
      missing: effectiveValidation.missing || [],
      negativeSignals: effectiveValidation.negativeSignals || [],
      strictReview: effectiveValidation.strictReview,
      visualReview: effectiveValidation.visualReview,
    })
    const visualChecks = effectiveValidation.visualReview?.checks && typeof effectiveValidation.visualReview.checks === 'object'
      ? effectiveValidation.visualReview.checks
      : {}
    const visualFailedChecks = Object.entries(visualChecks)
      .filter(([_, value]) => String(value || '').trim().toLowerCase() === 'fail')
      .map(([key]) => String(key || '').trim())
      .filter(Boolean)
    const visualMissingChecks = getLivePhotoVisualMissingChecks(visualChecks)
    const failureReason = effectiveValidation.skipped
      ? 'Live Photo image validation skipped because Product DNA is missing.'
      : `Live Photo image validation failed: structure match score ${effectiveValidation.score.toFixed(2)} is below threshold. Missing signals: ${(effectiveValidation.missing || []).slice(0, 12).join(', ')}${effectiveValidation.negativeSignals?.length ? `. Negative signals: ${effectiveValidation.negativeSignals.slice(0, 8).join(', ')}` : ''}${effectiveValidation.strictReview && !effectiveValidation.strictReview.passed ? `. Strict replacement review score ${Number(effectiveValidation.strictReview.score || 0).toFixed(2)} failed. Missing exact phrases: ${(effectiveValidation.strictReview.missingPhrases || []).slice(0, 8).join(', ')}${effectiveValidation.strictReview.negativeSignals?.length ? `. Strict negative signals: ${effectiveValidation.strictReview.negativeSignals.slice(0, 8).join(', ')}` : ''}` : ''}${effectiveValidation.visualReview && !effectiveValidation.visualReview.passed ? `. Visual replacement review score ${Number(effectiveValidation.visualReview.score || 0).toFixed(2)} failed. Visual failures: ${(effectiveValidation.visualReview.failures || []).slice(0, 8).join(', ')}${visualFailedChecks.length ? `. Failed visual checks: ${visualFailedChecks.join(', ')}` : ''}${visualMissingChecks.length ? `. Missing visual checks: ${visualMissingChecks.join(', ')}` : ''}` : ''}${validationCategories.length ? `. Validation categories: ${validationCategories.join(', ')}` : ''}${validationCategories.length ? ` ${validationCategories.map((item) => `[validation_category:${item}]`).join(' ')}` : ''}${visualMissingChecks.length ? ` ${visualMissingChecks.map((item) => `[visual_check_missing:${item}]`).join(' ')}` : ''}`
    await livePhotoRepo.upsert({
      ...appendLivePhotoLogs(input.item, [
        ...autoFlowLogs,
        buildLivePhotoLog(`[live-photo] image_generation completed: ${generated.stillPath}`, 'success'),
        buildLivePhotoLog(`[live-photo] image validation failed: ${failureReason}`, 'error'),
      ]),
      error: failureReason,
      updatedAt: now(),
    })
    throw new Error(`[image_validation_failed] ${failureReason}`)
  }
  const imageDoneItem: LivePhotoItem = {
    ...appendLivePhotoLogs(input.item, [
      ...autoFlowLogs,
      buildLivePhotoLog(`[live-photo] image_generation completed: ${generated.stillPath}`, 'success'),
      buildLivePhotoLog(`[live-photo] image validation passed: score=${effectiveValidation.score.toFixed(2)}`, 'success'),
      buildLivePhotoLog('[live-photo] stage video_generation started'),
    ]),
    generatedStillPath: generated.stillPath,
    videoPromptPreview: buildVideoRequestPreview({
      item: {
        ...input.item,
        generatedStillPath: generated.stillPath,
      },
      product: input.product,
      template: input.motionTemplate,
      startFramePath: generated.stillPath,
      credentials,
    }),
    imageTaskId: undefined,
    imageTaskProvider: undefined,
    imageTaskModel: undefined,
    imageTaskBaseUrl: undefined,
    imageTaskEndpointStyle: undefined,
    workflow: patchWorkflow(input.item.workflow, 'video_generation', 'image_generation', 'done'),
    autoFlowStatus: patchAutoFlowStatus(input.item, 'video_generation', 'running'),
    updatedAt: now(),
  }
  await livePhotoRepo.upsert(imageDoneItem)

  await livePhotoRepo.upsert({
    ...imageDoneItem,
    workflow: patchWorkflow(imageDoneItem.workflow, 'video_generation', 'video_generation', 'running'),
    autoFlowStatus: patchAutoFlowStatus(imageDoneItem, 'video_generation', 'running'),
    updatedAt: now(),
  })
  let latestVideoItem = imageDoneItem
  let materialized: Awaited<ReturnType<typeof materializeItem>>
  if (String(imageDoneItem.videoTaskId || '').trim()) {
    const synced = await pollLivePhotoVideoTask({
      item: imageDoneItem,
      credentials,
      outputDir: join(livePhotoRoot(imageDoneItem.id), 'generated-video'),
    })
    if (!synced.synced || !synced.outputPath) {
      throw new Error(buildRemotePendingError('video', imageDoneItem.videoTaskId))
    }
    latestVideoItem = {
      ...imageDoneItem,
      motionVideoPath: synced.outputPath,
      videoTaskId: undefined,
      videoTaskProvider: undefined,
      videoTaskModel: undefined,
      videoTaskBaseUrl: undefined,
      videoTaskEndpointStyle: undefined,
      logs: [
        ...(Array.isArray(imageDoneItem.logs) ? imageDoneItem.logs : []),
        buildLivePhotoLog(`[live-photo] video task synced: taskId=${imageDoneItem.videoTaskId}`, 'success'),
      ],
      updatedAt: now(),
    }
    materialized = await withTimeout(
      materializeItem({
        item: latestVideoItem,
        stillSourcePath: generated.stillPath,
        videoSourcePath: synced.outputPath,
        motionTemplate: input.motionTemplate,
        product: input.product,
      }),
      LIVE_PHOTO_REFERENCE_PACKAGING_TIMEOUT_MS,
      'Reference live photo packaging',
    )
  } else {
    const submitted = await submitLivePhotoVideoTask({
      item: imageDoneItem,
      product: input.product,
      stillPath: generated.stillPath,
      template: input.motionTemplate,
    })
    if (submitted.mode === 'remote') {
      await livePhotoRepo.upsert({
        ...appendLivePhotoLogs(imageDoneItem, [
          buildLivePhotoLog(`[live-photo] video task submitted: provider=${submitted.provider} taskId=${submitted.taskId}`),
        ]),
        videoTaskId: submitted.taskId,
        videoTaskProvider: submitted.provider,
        videoTaskModel: submitted.model,
        videoTaskBaseUrl: submitted.baseUrl,
        videoTaskEndpointStyle: submitted.endpointStyle,
        workflow: patchWorkflow(imageDoneItem.workflow, 'video_generation', 'video_generation', 'running'),
        autoFlowStatus: patchAutoFlowStatus(imageDoneItem, 'video_generation', 'running'),
        updatedAt: now(),
      })
      throw new Error(buildRemotePendingError('video', submitted.taskId))
    }
    const materializedResult = await withTimeout(
      materializeItem({
        item: imageDoneItem,
        stillSourcePath: generated.stillPath,
        videoSourcePath: submitted.outputPath,
        motionTemplate: input.motionTemplate,
        product: input.product,
      }),
      LIVE_PHOTO_REFERENCE_PACKAGING_TIMEOUT_MS,
      'Reference live photo packaging',
    )
    materialized = materializedResult
  }

  return {
    ...appendLivePhotoLogs(latestVideoItem, [
      buildLivePhotoLog('[live-photo] video_generation completed and live photo package materialized', 'success'),
      buildLivePhotoLog('[live-photo] stage live_photo_packaging completed', 'success'),
    ]),
    ...(await withTimeout(
      Promise.resolve(materialized),
      1000,
      'Reference finalize materialize',
    )),
    productSnapshot: input.product,
    updatedAt: now(),
  }
}

async function finalizeCloneShotItem(input: {
  item: LivePhotoItem
  motionTemplate: LivePhotoMotionTemplate
}) {
  const snapshot = input.item.cloneShotSnapshot
  if (!snapshot) throw new Error('Clone shot snapshot is missing')
  await livePhotoRepo.upsert({
    ...appendLivePhotoLogs(input.item, [
      buildLivePhotoLog('[live-photo] stage video_generation started'),
      buildLivePhotoLog(`[live-photo] clone source loaded: shot=${snapshot?.shotId || 'unknown'} video=${snapshot?.videoPath || 'none'}`),
    ]),
    workflow: patchWorkflow(input.item.workflow, 'video_generation', 'video_generation', 'running'),
    autoFlowStatus: patchAutoFlowStatus(input.item, 'video_generation', 'running'),
    updatedAt: now(),
  })
  const stillSourcePath = snapshot.imagePath || snapshot.videoPath || ''
  const normalizedStillPath = snapshot.imagePath || join(livePhotoRoot(input.item.id), 'derived-still.jpg')
  if (!snapshot.imagePath && snapshot.videoPath) {
    await ensureDir(livePhotoRoot(input.item.id))
    await renderPosterFromVideo({ videoPath: snapshot.videoPath, posterPath: normalizedStillPath })
  }
  return {
    ...appendLivePhotoLogs(input.item, [
      buildLivePhotoLog('[live-photo] clone motion source normalized'),
      buildLivePhotoLog('[live-photo] stage live_photo_packaging started'),
    ]),
    workflow: patchWorkflow(input.item.workflow, 'live_photo_packaging', 'video_generation', 'done'),
    autoFlowStatus: patchAutoFlowStatus(input.item, 'live_photo_packaging', 'running'),
    ...(await materializeItem({
      item: {
        ...input.item,
        workflow: patchWorkflow(input.item.workflow, 'live_photo_packaging', 'video_generation', 'done'),
      },
      stillSourcePath: normalizedStillPath || stillSourcePath,
      videoSourcePath: snapshot.videoPath,
      motionTemplate: input.motionTemplate,
    })),
    updatedAt: now(),
  }
}

async function runLivePhotoItemAutoFlow(
  itemId: string,
  motionTemplate?: LivePhotoMotionTemplate,
) {
  const latest = await livePhotoRepo.get(itemId)
  if (!latest) return null
  if (!canResumeLivePhotoAutoFlow(latest)) return latest
  patchAutoFlowStatus(latest, latest.workflow?.currentStep || 'queued', 'running')
  await livePhotoRepo.upsert({
    ...appendLivePhotoLogs(latest, [
      buildLivePhotoLog(`[live-photo] auto-flow dispatch: ${latest.sourceType}`),
      buildLivePhotoLog(`[live-photo] current stage: ${latest.workflow?.currentStep || 'queued'}`),
    ]),
    updatedAt: now(),
  })

  try {
    if (latest.sourceType === 'reference_replace') {
      const referenceImagePath = String(latest.referenceImagePath || '').trim()
      if (!referenceImagePath || !existsSync(referenceImagePath)) {
        throw new Error('Reference image does not exist')
      }
      const product = latest.productSnapshot || (latest.productId ? await buildProductSnapshot(latest.productId) : null)
      if (!product) throw new Error('Selected product does not exist')
      const next = await finalizeReferenceItem({
        item: {
          ...latest,
          productId: product.id,
          productSnapshot: product,
          promptPreview: buildReferencePromptPreview({ product, referenceImagePath }),
        },
        product,
        referenceImagePath,
        motionTemplate: motionTemplate || 'push_in',
      })
      return await livePhotoRepo.upsert({
        ...appendLivePhotoLogs(next, [
          buildLivePhotoLog('[live-photo] task completed', 'success'),
        ]),
        packagingStatus: 'completed',
        error: undefined,
        autoFlowStatus: {
          ...ensureAutoFlowStatus(next),
          status: 'done',
          currentStage: 'completed',
          lastCompletedAt: now(),
          lastError: '',
        },
        workflow: patchWorkflow(
          patchWorkflow(next.workflow, 'live_photo_packaging', 'live_photo_packaging', 'done'),
          'completed',
          'completed',
          'done',
        ),
        updatedAt: now(),
      })
    }

    const next = await finalizeCloneShotItem({
      item: latest,
      motionTemplate: motionTemplate || 'ambient_sway',
    })
    return await livePhotoRepo.upsert({
      ...appendLivePhotoLogs(next, [
        buildLivePhotoLog('[live-photo] task completed', 'success'),
      ]),
      packagingStatus: 'completed',
      error: undefined,
      autoFlowStatus: {
        ...ensureAutoFlowStatus(next),
        status: 'done',
        currentStage: 'completed',
        lastCompletedAt: now(),
        lastError: '',
      },
      workflow: patchWorkflow(
        patchWorkflow(next.workflow, 'live_photo_packaging', 'live_photo_packaging', 'done'),
        'completed',
        'completed',
        'done',
      ),
      updatedAt: now(),
    })
  } catch (error: any) {
    const latestPersisted = (await livePhotoRepo.get(itemId)) || latest
    const current = ensureAutoFlowStatus(latestPersisted)
    const currentStage = resolveLivePhotoFailureStage(
      latestPersisted,
      latestPersisted.workflow?.currentStep || current.currentStage || 'queued',
    )
    const reason = normalizeRemotePendingTimeoutReason(
      latestPersisted,
      currentStage,
      normalizeLivePhotoFailureReasonSafe(String(error?.message || error || 'Unknown error'), currentStage),
    )
    const nextRetryCount = Math.min(current.retryLimit, Number(current.retryCount ?? 0) + 1)
    const terminalByStage = shouldForceTerminalLivePhotoFailure(currentStage, reason)
    const terminal = terminalByStage || nextRetryCount >= current.retryLimit
    const imageValidationFailure = currentStage === 'image_generation' && isLivePhotoImageValidationFailure(reason)
    if (reason.includes('[remote_pending]')) {
      const remoteTaskId = extractTaskIdFromText(reason)
      const pending = await livePhotoRepo.upsert({
        ...appendLivePhotoLogs(latestPersisted, [
          buildLivePhotoLog(`[live-photo] remote task pending: ${reason}`),
          ...(remoteTaskId ? [buildLivePhotoLog(`[live-photo] remote task persisted: taskId=${remoteTaskId}`)] : []),
        ]),
        packagingStatus: 'processing',
        imageTaskId: currentStage === 'image_generation' ? (remoteTaskId || latestPersisted.imageTaskId) : latestPersisted.imageTaskId,
        imageTaskProvider: latestPersisted.imageTaskProvider,
        imageTaskModel: latestPersisted.imageTaskModel,
        imageTaskBaseUrl: latestPersisted.imageTaskBaseUrl,
        imageTaskEndpointStyle: latestPersisted.imageTaskEndpointStyle,
        videoTaskId: currentStage === 'video_generation' ? (remoteTaskId || latestPersisted.videoTaskId) : latestPersisted.videoTaskId,
        videoTaskProvider: latestPersisted.videoTaskProvider,
        videoTaskModel: latestPersisted.videoTaskModel,
        videoTaskBaseUrl: latestPersisted.videoTaskBaseUrl,
        videoTaskEndpointStyle: latestPersisted.videoTaskEndpointStyle,
        autoFlowStatus: {
          ...current,
          status: 'running',
          currentStage,
          lastError: reason,
        },
        workflow: patchWorkflow(
          latestPersisted.workflow,
          currentStage,
          currentStage,
          'running',
          reason,
        ),
        error: reason,
        updatedAt: now(),
      })
      throw new LivePhotoAutoFlowHandledError(pending.error || 'Live Photo remote task pending', false)
    }
    const failed = await livePhotoRepo.upsert({
      ...appendLivePhotoLogs(latestPersisted, [
        buildLivePhotoLog(`[live-photo] task failed: ${reason}`, 'error'),
        buildLivePhotoLog(
          terminal
            ? terminalByStage
              ? '[live-photo] video generation failed and was marked terminal'
              : `[live-photo] retry limit reached: ${current.retryLimit}`
            : `[live-photo] marked retryable failure: retry ${nextRetryCount}/${current.retryLimit}`,
          terminal ? 'error' : 'info',
        ),
      ]),
      packagingStatus: 'failed',
      generatedStillPath: imageValidationFailure ? undefined : latestPersisted.generatedStillPath,
      imageTaskId: imageValidationFailure ? undefined : latestPersisted.imageTaskId,
      imageTaskProvider: imageValidationFailure ? undefined : latestPersisted.imageTaskProvider,
      imageTaskModel: imageValidationFailure ? undefined : latestPersisted.imageTaskModel,
      imageTaskBaseUrl: imageValidationFailure ? undefined : latestPersisted.imageTaskBaseUrl,
      imageTaskEndpointStyle: imageValidationFailure ? undefined : latestPersisted.imageTaskEndpointStyle,
      autoFlowStatus: {
        ...current,
        retryCount: nextRetryCount,
        status: terminal ? 'failed_terminal' : 'failed_retryable',
        currentStage,
        lastError: reason,
      },
      workflow: patchWorkflow(
        latestPersisted.workflow,
        currentStage,
        currentStage,
        'failed',
        terminal ? `[retry_limit] ${reason}` : reason,
      ),
      error: terminal ? `[retry_limit] Live Photo auto retry reached ${current.retryLimit} times. Please check the source material and retry manually.` : reason,
      updatedAt: now(),
    })
    throw new LivePhotoAutoFlowHandledError(failed.error || 'Live Photo auto flow failed', terminal)
  }
}

function enqueueLivePhotoAutoFlow(
  itemId: string,
  motionTemplate: LivePhotoMotionTemplate | undefined,
  reason: string,
  options?: { bypassCooldown?: boolean },
) {
  const safeItemId = String(itemId || '').trim()
  if (!safeItemId) return
  const currentTime = now()
  const lastQueuedAt = Number(livePhotoAutoFlowLastQueuedAt.get(safeItemId) ?? 0) || 0
  if (!options?.bypassCooldown && lastQueuedAt > 0 && currentTime - lastQueuedAt < LIVE_PHOTO_AUTO_FLOW_REQUEUE_COOLDOWN_MS) return
  if (livePhotoAutoFlowScheduled.has(safeItemId)) return
  livePhotoAutoFlowScheduled.add(safeItemId)
  livePhotoAutoFlowLastQueuedAt.set(safeItemId, currentTime)
  void livePhotoAutoFlowQueue
    .add(async () => {
      console.log('[live-photo-debug] auto-flow:queue-start', {
        itemId: safeItemId,
        reason,
        queueSize: livePhotoAutoFlowQueue.size,
        queuePending: livePhotoAutoFlowQueue.pending,
      })
      await runLivePhotoItemAutoFlow(safeItemId, motionTemplate)
    })
    .catch(async (error: any) => {
      if (error instanceof LivePhotoAutoFlowHandledError) {
        if (!error.terminal) {
          const latest = await livePhotoRepo.get(safeItemId)
          if (!latest) return
          const current = ensureAutoFlowStatus(latest)
          const shouldRetry =
            latest.packagingStatus === 'processing' ||
            current.status === 'running' ||
            current.status === 'failed_retryable'
          if (shouldRetry) {
            scheduleLivePhotoTimer(() => {
              enqueueLivePhotoAutoFlow(safeItemId, motionTemplate, 'auto_retry', { bypassCooldown: true })
            }, LIVE_PHOTO_VIDEO_REMOTE_RETRY_MS)
          }
        }
        return
      }
      const latest = await livePhotoRepo.get(safeItemId)
      if (!latest) return
      const current = ensureAutoFlowStatus(latest)
      const currentStage = resolveLivePhotoFailureStage(
        latest,
        latest.workflow?.currentStep || current.currentStage || 'queued',
      )
      const reason = normalizeRemotePendingTimeoutReason(
        latest,
        currentStage,
        normalizeLivePhotoFailureReason(String(error?.message || error || 'Unknown error'), currentStage),
      )
      const nextRetryCount = Math.min(current.retryLimit, Number(current.retryCount ?? 0) + 1)
      const terminal = shouldForceTerminalLivePhotoFailure(currentStage, reason) || nextRetryCount >= current.retryLimit
      await livePhotoRepo.upsert({
        ...appendLivePhotoLogs(latest, [
          buildLivePhotoLog(`[live-photo] queue-level failure: ${reason}`, 'error'),
        ]),
        packagingStatus: 'failed',
        autoFlowStatus: {
          ...current,
          retryCount: nextRetryCount,
          status: terminal ? 'failed_terminal' : 'failed_retryable',
          currentStage,
          lastError: reason,
        },
        error: terminal
          ? `[retry_limit] Live Photo auto retry reached ${current.retryLimit} times. Please check the source material and retry manually.`
          : reason,
        updatedAt: now(),
      })
      if (!terminal) {
        scheduleLivePhotoTimer(() => {
          enqueueLivePhotoAutoFlow(safeItemId, motionTemplate, 'auto_retry', { bypassCooldown: true })
        }, 0)
      }
    })
    .finally(() => {
      livePhotoAutoFlowScheduled.delete(safeItemId)
      console.log('[live-photo-debug] auto-flow:queue-finish', {
        itemId: safeItemId,
        reason,
        queueSize: livePhotoAutoFlowQueue.size,
        queuePending: livePhotoAutoFlowQueue.pending,
      })
    })
}

async function createReferenceProcessingItems(input: CreateReferenceLivePhotoInput) {
  const referenceImagePaths = Array.from(
    new Set(
      [
        String(input.referenceImagePath || '').trim(),
        ...(Array.isArray(input.referenceImagePaths) ? input.referenceImagePaths.map((item) => String(item || '').trim()) : []),
      ].filter(Boolean),
    ),
  )
  if (!referenceImagePaths.length) throw new Error('Reference image does not exist')
  const missingPath = referenceImagePaths.find((item) => !existsSync(item))
  if (missingPath) throw new Error(`Reference image does not exist: ${missingPath}`)
  const product = await buildProductSnapshot(String(input.productId || '').trim())
  const credentials = await cloneRepo.getCredentials()
  ensureLivePhotoStrictImageEditProvider(credentials)
  const motionTemplate = input.motionTemplate || 'push_in'
  const created: LivePhotoItem[] = []
  for (const referenceImagePath of referenceImagePaths) {
    const timestamp = now()
    const imagePromptPreview = buildReferenceReplacementImagePromptPreview({
      product,
      referenceImagePath,
      credentials,
    })
    const item: LivePhotoItem = {
      id: randomUUID(),
      sourceType: 'reference_replace',
      productId: product.id,
      productSnapshot: product,
      referenceImagePath,
      packagingStatus: 'processing',
      promptPreview: buildReferencePromptPreview({ product, referenceImagePath }),
      imagePromptPreview: imagePromptPreview,
      videoPromptPreview: buildVideoRequestPreview({
        item: {
          id: 'preview',
          sourceType: 'reference_replace',
          productId: product.id,
          productSnapshot: product,
          referenceImagePath,
          packagingStatus: 'processing',
          createdAt: timestamp,
          updatedAt: timestamp,
        },
        product,
        template: motionTemplate,
        startFramePath: referenceImagePath,
        credentials,
      }),
      workflow: buildDefaultWorkflow(),
      logs: [
        buildLivePhotoLog('[live-photo] reference task created'),
        buildLivePhotoLog(`[live-photo] reference image selected: ${referenceImagePath}`),
        buildLivePhotoLog(`[live-photo] product selected: ${product.name}`),
      ],
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    created.push(await livePhotoRepo.upsert(item))
  }
  return { created, product, referenceImagePaths, motionTemplate }
}

function startReferenceCompletionBatch(input: {
  created: LivePhotoItem[]
  product: LivePhotoProductSnapshot
  referenceImagePaths: string[]
  motionTemplate: LivePhotoMotionTemplate
}) {
  scheduleLivePhotoTimer(() => {
    input.created.forEach((item) => {
      enqueueLivePhotoAutoFlow(item.id, input.motionTemplate, 'reference_batch_start')
    })
  }, 0)
}

async function createCloneProcessingItems(input: CreateCloneShotLivePhotosInput) {
  const project = await cloneRepo.getProject(String(input.cloneProjectId || '').trim())
  if (!project) throw new Error('Clone project does not exist')
  const credentials = await cloneRepo.getCredentials()
  const shotIds = Array.isArray(input.shotIds) ? input.shotIds.map((item) => String(item || '').trim()).filter(Boolean) : []
  if (!shotIds.length) throw new Error('Shot ids are required')
  const motionTemplate = input.motionTemplate || 'ambient_sway'
  const created: LivePhotoItem[] = []
  for (const shotId of shotIds) {
    const snapshot = pickCloneShotMedia(project, shotId)
    const timestamp = now()
    const item: LivePhotoItem = {
      id: randomUUID(),
      sourceType: 'clone_shot',
      sourceProjectId: project.id,
      sourceProjectTitle: project.title,
      sourceShotId: snapshot.shotId,
      sourceShotLabel: snapshot.shotLabel,
      cloneShotSnapshot: snapshot,
      referenceImagePath: snapshot.imagePath,
      packagingStatus: 'processing',
      videoPromptPreview: buildVideoRequestPreview({
        item: {
          id: 'preview',
          sourceType: 'clone_shot',
          sourceProjectId: project.id,
          sourceProjectTitle: project.title,
          sourceShotId: snapshot.shotId,
          sourceShotLabel: snapshot.shotLabel,
          cloneShotSnapshot: snapshot,
          referenceImagePath: snapshot.imagePath,
          packagingStatus: 'processing',
          createdAt: timestamp,
          updatedAt: timestamp,
        },
        template: motionTemplate,
        startFramePath: snapshot.imagePath || snapshot.videoPath || '',
        credentials,
      }),
      workflow: buildDefaultWorkflow(),
      logs: [
        buildLivePhotoLog('[live-photo] clone-shot task created'),
        buildLivePhotoLog(`[live-photo] source clone project: ${project.title}`),
        buildLivePhotoLog(`[live-photo] source shot: ${snapshot.shotLabel}`),
      ],
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    created.push(await livePhotoRepo.upsert(item))
  }
  return { created, motionTemplate }
}

function startCloneCompletionBatch(input: {
  created: LivePhotoItem[]
  motionTemplate: LivePhotoMotionTemplate
}) {
  scheduleLivePhotoTimer(() => {
    input.created.forEach((item) => {
      enqueueLivePhotoAutoFlow(item.id, input.motionTemplate, 'clone_batch_start')
    })
  }, 0)
}

export const livePhotoService = {
  setTestDependencies(input: Partial<LivePhotoServiceDependencies>) {
    if (input.runFfmpeg) livePhotoDeps.runFfmpeg = input.runFfmpeg
    if (input.generateGptShotFrameImage) livePhotoDeps.generateGptShotFrameImage = input.generateGptShotFrameImage
    if (input.generateShotVideoByProviderChain) livePhotoDeps.generateShotVideoByProviderChain = input.generateShotVideoByProviderChain
    if (input.analyzeProductStructureWithGrs) livePhotoDeps.analyzeProductStructureWithGrs = input.analyzeProductStructureWithGrs
    if (input.reviewReferenceReplacementStillStrict) livePhotoDeps.reviewReferenceReplacementStillStrict = input.reviewReferenceReplacementStillStrict
    if (input.reviewReferenceReplacementStillVisual) livePhotoDeps.reviewReferenceReplacementStillVisual = input.reviewReferenceReplacementStillVisual
  },

  async resetTestDependencies() {
    await drainLivePhotoAutoFlowForTests()
    livePhotoDeps.runFfmpeg = runFfmpeg
    livePhotoDeps.generateGptShotFrameImage = generateGptShotFrameImage
    livePhotoDeps.generateShotVideoByProviderChain = generateShotVideoByProviderChain
    livePhotoDeps.analyzeProductStructureWithGrs = analyzeProductStructureWithGrs
    livePhotoDeps.reviewReferenceReplacementStillStrict = reviewReferenceReplacementStillStrict
    livePhotoDeps.reviewReferenceReplacementStillVisual = reviewReferenceReplacementStillVisual
    clearLivePhotoPendingTimers()
    livePhotoAutoFlowScheduled.clear()
    livePhotoAutoFlowLastQueuedAt.clear()
  },

  async list() {
    const items = await livePhotoRepo.list()
    return items.map((item) => hydrateLivePhotoArtifactPaths(item))
  },

  async listSummaries(input?: { page?: number; pageSize?: number; filter?: 'all' | 'failed' | 'running' | 'paused' }) {
    const page = Math.max(1, Number(input?.page || 1) || 1)
    const pageSize = Math.max(1, Math.min(200, Number(input?.pageSize || 24) || 24))
    const filter = input?.filter === 'failed' || input?.filter === 'running' || input?.filter === 'paused' ? input.filter : 'all'
    const allItems = await livePhotoRepo.list()
    const items =
      filter === 'failed'
        ? allItems.filter(
            (item) =>
              item.packagingStatus === 'failed' ||
              item.autoFlowStatus?.status === 'failed_retryable' ||
              item.autoFlowStatus?.status === 'failed_terminal',
          )
        : filter === 'running'
          ? allItems.filter((item) => item.packagingStatus === 'processing' || item.autoFlowStatus?.status === 'running')
          : filter === 'paused'
            ? allItems.filter((item) => Boolean(item.autoFlowStatus?.paused))
            : allItems
    const total = items.length
    const totalPages = Math.max(1, Math.ceil(total / pageSize))
    const safePage = Math.min(page, totalPages)
    const start = (safePage - 1) * pageSize
    const pagedItems = items.slice(start, start + pageSize)
    return {
      items: pagedItems.map(toLivePhotoItemSummary),
      filter,
      page: safePage,
      pageSize,
      total,
      totalPages,
    }
  },

  async getSettings() {
    return await livePhotoRepo.getSettings()
  },

  async saveSettings(input: any) {
    return await livePhotoRepo.saveSettings(input || {})
  },

  async get(id: string) {
    const item = await livePhotoRepo.get(String(id || '').trim())
    if (!item) return null
    const hydrated = hydrateLivePhotoArtifactPaths(item)
    const credentials = await cloneRepo.getCredentials()
    return {
      ...hydrated,
      imagePromptPreview: resolveLivePhotoImagePreview(hydrated, credentials),
      videoPromptPreview: resolveLivePhotoVideoPreview(hydrated, credentials),
    }
  },

  async enqueueReferenceItems(input: CreateReferenceLivePhotoInput) {
    const queued = await createReferenceProcessingItems(input)
    return queued.referenceImagePaths.length === 1 ? queued.created[0] : queued.created
  },

  async startReferenceItems(input: { ids: string[]; motionTemplate?: LivePhotoMotionTemplate }) {
    const ids = Array.isArray(input.ids) ? input.ids.map((item) => String(item || '').trim()).filter(Boolean) : []
    if (!ids.length) return { ok: true as const, queued: 0 }
    const items = (await Promise.all(ids.map((id) => livePhotoRepo.get(id)))).filter(Boolean) as LivePhotoItem[]
    if (!items.length) return { ok: true as const, queued: 0 }
    const motionTemplate = input.motionTemplate || 'push_in'
    items.forEach((item) => {
      if (item.sourceType !== 'reference_replace') return
      enqueueLivePhotoAutoFlow(item.id, motionTemplate, 'start_reference_items')
    })
    return { ok: true as const, queued: items.length }
  },

  async enqueueCloneItems(input: CreateCloneShotLivePhotosInput) {
    const queued = await createCloneProcessingItems(input)
    return queued.created
  },

  async startCloneItems(input: { ids: string[]; motionTemplate?: LivePhotoMotionTemplate }) {
    const ids = Array.isArray(input.ids) ? input.ids.map((item) => String(item || '').trim()).filter(Boolean) : []
    if (!ids.length) return { ok: true as const, queued: 0 }
    const items = (await Promise.all(ids.map((id) => livePhotoRepo.get(id)))).filter(Boolean) as LivePhotoItem[]
    if (!items.length) return { ok: true as const, queued: 0 }
    const motionTemplate = input.motionTemplate || 'ambient_sway'
    items.forEach((item) => {
      if (item.sourceType !== 'clone_shot') return
      enqueueLivePhotoAutoFlow(item.id, motionTemplate, 'start_clone_items')
    })
    return { ok: true as const, queued: items.length }
  },

  async createFromReference(input: CreateReferenceLivePhotoInput) {
    const queued = await createReferenceProcessingItems(input)
    startReferenceCompletionBatch(queued)
    return queued.referenceImagePaths.length === 1 ? queued.created[0] : queued.created
  },

  async createFromCloneShots(input: CreateCloneShotLivePhotosInput) {
    const queued = await createCloneProcessingItems(input)
    startCloneCompletionBatch(queued)
    return queued.created
  },

  async exportItems(input: ExportLivePhotoItemsInput): Promise<ExportLivePhotoItemsResult> {
    const savedSettings = await livePhotoRepo.getSettings()
    const effectiveSettings = { ...savedSettings, ...(input.settings || {}) }
    const ids = Array.isArray(input.ids) ? input.ids.map((item) => String(item || '').trim()).filter(Boolean) : []
    if (!ids.length) throw new Error('Please generate or assign a structured product reference before creating a Live Photo task.')
    const outputDir = String(input.outputDir || '').trim() || join(exportRoot(), safeName(`${Date.now()}`, 'batch'))
    await ensureDir(outputDir)
    const exported: ExportLivePhotoItemsResult['exported'] = []
    const skipped: ExportLivePhotoItemsResult['skipped'] = []
    for (const id of ids) {
      const item = await livePhotoRepo.get(id)
      if (!item) {
        skipped.push({ id, reason: 'Item does not exist' })
        continue
      }
      if (item.packagingStatus !== 'completed' || !item.livePhotoImagePath || !item.livePhotoVideoPath) {
        skipped.push({ id, reason: 'Item is not export-ready' })
        continue
      }
      const baseName = safeName(
        [item.sourceProjectTitle, item.sourceShotLabel, item.productSnapshot?.name, item.id.slice(0, 8)].filter(Boolean).join('-'),
        item.id,
      )
      const targetDir = join(outputDir, safeExportName(baseName, item.id.slice(0, 8)))
      const packaged = await packageLivePhoto(
        { runFfmpeg: livePhotoDeps.runFfmpeg },
        {
          itemId: item.id,
          sourceStillPath: item.livePhotoImagePath,
          sourceVideoPath: item.livePhotoVideoPath,
          exportDir: targetDir,
          baseName,
          outputResolution: effectiveSettings.outputResolution,
          frameRate: effectiveSettings.frameRate,
          quality: effectiveSettings.quality,
        },
      )
      exported.push({
        id: item.id,
        targetDir,
        imagePath: packaged.imagePath,
        videoPath: packaged.videoPath,
        bundlePath: packaged.bundlePath,
        metadataBridgePath: packaged.metadataBridgePath,
        assetIdentifier: packaged.assetIdentifier,
        videoMetadataMode: packaged.videoMetadataMode,
        imageMetadataMode: packaged.imageMetadataMode,
      })
      await livePhotoRepo.upsert({
        ...item,
        exportBundlePath: packaged.bundlePath,
        packagingAssetIdentifier: packaged.assetIdentifier,
        packagingMetadataBridgePath: packaged.metadataBridgePath,
        videoMetadataMode: packaged.videoMetadataMode,
        imageMetadataMode: packaged.imageMetadataMode,
        logs: [
          ...(Array.isArray(item.logs) ? item.logs : []),
          buildLivePhotoLog(
            `[live-photo] export settings used: resolution=${effectiveSettings.outputResolution} frameRate=${effectiveSettings.frameRate} quality=${effectiveSettings.quality}`,
          ),
        ],
        updatedAt: now(),
      })
    }
    return {
      outputDir,
      total: ids.length,
      exported,
      skipped,
    }
  },

  async retry(input: RetryLivePhotoItemInput) {
    const id = String(input.id || '').trim()
    if (!id) throw new Error('Please generate or assign a structured product reference before creating a Live Photo task.')
    const existing = await livePhotoRepo.get(id)
    if (!existing) throw new Error('Please generate or assign a structured product reference before creating a Live Photo task.')
    const preservedStillPath = String(existing.generatedStillPath || '').trim()
    const canRetryFromVideoStage = Boolean(
      preservedStillPath &&
        existsSync(preservedStillPath) &&
        (String(existing.videoTaskId || '').trim() ||
          String(existing.motionVideoPath || '').trim() ||
          ensureAutoFlowStatus(existing).currentStage === 'video_generation'),
    )
    const credentials = await cloneRepo.getCredentials()
    const refreshedProductSnapshot =
      existing.productId && (existing.sourceType === 'reference_replace' || existing.sourceType === 'clone_shot')
        ? await buildProductSnapshot(existing.productId)
        : existing.productSnapshot
    const refreshedImagePromptPreview =
      refreshedProductSnapshot && existing.referenceImagePath
        ? buildReferenceReplacementImagePromptPreview({
            product: refreshedProductSnapshot,
            referenceImagePath: existing.referenceImagePath,
            credentials,
            retryGuidance: buildLivePhotoRetryGuidance(existing, refreshedProductSnapshot),
          })
        : existing.imagePromptPreview
    const refreshedVideoPromptPreview =
      refreshedProductSnapshot && existing.referenceImagePath
        ? buildVideoRequestPreview({
            item: {
              ...existing,
              productSnapshot: refreshedProductSnapshot,
            },
            product: refreshedProductSnapshot,
            template: input.motionTemplate || (existing.sourceType === 'reference_replace' ? 'push_in' : 'ambient_sway'),
            startFramePath: existing.generatedStillPath || existing.referenceImagePath,
            credentials,
          })
        : existing.videoPromptPreview

    const processingItem: LivePhotoItem = {
      ...existing,
      productSnapshot: refreshedProductSnapshot,
      packagingStatus: 'processing',
      error: undefined,
      livePhotoImagePath: undefined,
      livePhotoVideoPath: undefined,
      previewVideoPath: undefined,
      posterPath: undefined,
      videoTaskId: undefined,
      videoTaskProvider: undefined,
      videoTaskModel: undefined,
      videoTaskBaseUrl: undefined,
      videoTaskEndpointStyle: undefined,
      exportBundlePath: undefined,
      packagingAssetIdentifier: undefined,
      packagingMetadataBridgePath: undefined,
      videoMetadataMode: undefined,
      imageMetadataMode: undefined,
      imagePromptPreview: refreshedImagePromptPreview,
      videoPromptPreview: refreshedVideoPromptPreview,
      updatedAt: now(),
    }
    if (canRetryFromVideoStage) {
      processingItem.generatedStillPath = preservedStillPath
      processingItem.motionVideoPath = undefined
      processingItem.imageTaskId = undefined
      processingItem.imageTaskProvider = undefined
      processingItem.imageTaskModel = undefined
      processingItem.imageTaskBaseUrl = undefined
      processingItem.imageTaskEndpointStyle = undefined
      processingItem.workflow = patchWorkflow(
        patchWorkflow(existing.workflow, 'video_generation', 'image_generation', 'done'),
        'video_generation',
        'video_generation',
        'idle',
      )
      processingItem.autoFlowStatus = {
        ...ensureAutoFlowStatus(existing),
        enabled: true,
        status: 'idle',
        paused: false,
        retryCount: 0,
        currentStage: 'video_generation',
        lastStartedAt: undefined,
        lastCompletedAt: undefined,
        lastError: '',
      }
      processingItem.logs = [
        ...(Array.isArray(existing.logs) ? existing.logs : []),
        buildLivePhotoLog('[live-photo] manual retry preserved generated still and restarted from video_generation stage'),
      ].slice(-200)
    } else {
      processingItem.generatedStillPath = undefined
      processingItem.motionVideoPath = undefined
      processingItem.imageTaskId = undefined
      processingItem.imageTaskProvider = undefined
      processingItem.imageTaskModel = undefined
      processingItem.imageTaskBaseUrl = undefined
      processingItem.imageTaskEndpointStyle = undefined
      processingItem.workflow = buildDefaultWorkflow()
      processingItem.autoFlowStatus = {
        ...buildDefaultAutoFlowStatus(),
        enabled: true,
        status: 'idle',
        paused: false,
        retryCount: 0,
        currentStage: 'queued',
      }
      processingItem.logs = [
        ...(Array.isArray(existing.logs) ? existing.logs : []),
        buildLivePhotoLog('[live-photo] manual retry restarted from image_generation stage'),
      ].slice(-200)
    }
    await livePhotoRepo.upsert(processingItem)
    enqueueLivePhotoAutoFlow(
      processingItem.id,
      input.motionTemplate || (processingItem.sourceType === 'reference_replace' ? 'push_in' : 'ambient_sway'),
      'manual_retry',
      { bypassCooldown: true },
    )
    return (await livePhotoRepo.get(processingItem.id)) || processingItem
  },

  async resumePendingTasksOnStartup() {
    const items = await livePhotoRepo.list()
    for (const item of items) {
      if (!shouldUpgradeFailedItemToTerminal(item)) continue
      const current = ensureAutoFlowStatus(item)
      await livePhotoRepo.upsert({
        ...appendLivePhotoLogs(item, [
          buildLivePhotoLog('[live-photo] startup normalized failed video task to terminal state'),
        ]),
        autoFlowStatus: {
          ...current,
          status: 'failed_terminal',
          currentStage: 'video_generation',
        },
        workflow: patchWorkflow(
          item.workflow,
          'video_generation',
          'video_generation',
          'failed',
          String(item.error || 'Live Photo video task failed').trim() || 'Live Photo video task failed',
        ),
        updatedAt: now(),
      })
    }
    const normalizedItems = await livePhotoRepo.list()
    const resumable = normalizedItems.filter((item) => canResumeLivePhotoAutoFlow(item))
    console.log('[live-photo-debug] startup-resume-scan', {
      totalItemCount: normalizedItems.length,
      resumableCount: resumable.length,
      itemIds: resumable.map((item) => item.id),
    })
    resumable.forEach((item, index) => {
      const delayMs = Math.min(index, 6) * 900
      scheduleLivePhotoTimer(() => {
        enqueueLivePhotoAutoFlow(item.id, undefined, 'startup_resume')
      }, delayMs)
    })
    return {
      totalItemCount: normalizedItems.length,
      resumableCount: resumable.length,
      itemIds: resumable.map((item) => item.id),
    }
  },

  async pauseAutoFlow(input: { id: string }) {
    const id = String(input.id || '').trim()
    if (!id) throw new Error('Please generate or assign a structured product reference before creating a Live Photo task.')
    const existing = await livePhotoRepo.get(id)
    if (!existing) throw new Error('Please generate or assign a structured product reference before creating a Live Photo task.')
    const current = ensureAutoFlowStatus(existing)
    const next = await livePhotoRepo.upsert({
      ...existing,
      autoFlowStatus: {
        ...current,
        paused: true,
        status: existing.packagingStatus === 'completed' ? 'done' : 'idle',
      },
      updatedAt: now(),
    })
    return next
  },

  async resumeAutoFlow(input: { id: string; motionTemplate?: LivePhotoMotionTemplate }) {
    const id = String(input.id || '').trim()
    if (!id) throw new Error('Please generate or assign a structured product reference before creating a Live Photo task.')
    const existing = await livePhotoRepo.get(id)
    if (!existing) throw new Error('Please generate or assign a structured product reference before creating a Live Photo task.')
    const current = ensureAutoFlowStatus(existing)
    const next = await livePhotoRepo.upsert({
      ...existing,
      autoFlowStatus: {
        ...current,
        paused: false,
        status: existing.packagingStatus === 'completed' ? 'done' : 'idle',
      },
      updatedAt: now(),
    })
    if (next.packagingStatus !== 'completed') {
      enqueueLivePhotoAutoFlow(
        next.id,
        input.motionTemplate || (next.sourceType === 'reference_replace' ? 'push_in' : 'ambient_sway'),
        'manual_resume',
        { bypassCooldown: true },
      )
    }
    return next
  },

  async remove(id: string) {
    return await livePhotoRepo.remove(String(id || '').trim())
  },
}
