import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
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
import { generateThumbnailJpg } from '../media/thumbnail'
import { createBatchSubtitleJob, runBatchSubtitleJob } from '../web-platform/batchSubtitle'
import { webPlatformRepo } from '../web-platform/repo'
import { productImageMaterialsService } from '../product-image-materials/service'
import { livePhotoRepo } from './repo'
import { livePhotoPromptVersionService } from './promptVersions'
import { buildLivePhotoQualityCacheKey, livePhotoQualityCache } from './qualityCache'
import { LIVE_PHOTO_QUALITY_CHECKER_VERSION, runLocalLivePhotoQualityCheck } from './qualityChecker'
import { submitLivePhotoImageGeneration, type LivePhotoImageProviderAdapter } from './imageGenerationAdapter'
import { resolveAuthoritativeProductReferencePath } from './productInput'
import { bindLivePhotoReplacementInputs, normalizeLivePhotoScenePaths } from './sceneInput'
import { buildLivePhotoReplacementPrompt } from './promptBuilder'
import { prepareLivePhotoProductReference, type LivePhotoProductReferenceVariant } from './productReference'
import {
  LIVE_PHOTO_DEFAULT_RETRY_LIMIT,
  LIVE_PHOTO_IMAGE_RETRY_LIMIT,
  resolveLivePhotoRetryLimit,
} from './retryPolicy'
import type {
  CreateCloneShotLivePhotosInput,
  CreateReferenceLivePhotoInput,
  ExportLivePhotoItemsInput,
  ExportLivePhotoItemsResult,
  LivePhotoItemSummary,
  LivePhotoCloneShotSnapshot,
  LivePhotoItem,
  LivePhotoMotionTemplate,
  LivePhotoPromptVersion,
  LivePhotoProductSnapshot,
  LivePhotoRequestPreview,
  LivePhotoTaskLog,
  LivePhotoAutoFlowStatus,
  LivePhotoGenerationAttempt,
  LivePhotoQualityReport,
  LivePhotoWorkflow,
  LivePhotoWorkflowStep,
  RetryLivePhotoItemInput,
  LivePhotoSubtitleOverlay,
} from './types'
import type { BatchSubtitleTitleRenderMode } from '../../../shared/web-api/types'
import type { AiProviderName, CloneProductType, ModelCredentials, ShotSpec } from '../clone/types'
import type { Product } from '../products/types'

type LivePhotoServiceDependencies = {
  runFfmpeg: typeof runFfmpeg
  generateGptShotFrameImage: typeof generateGptShotFrameImage
  generateShotVideoByProviderChain: typeof generateShotVideoByProviderChain
  analyzeProductStructureWithGrs: typeof analyzeProductStructureWithGrs
  reviewReferenceReplacementStillStrict: typeof reviewReferenceReplacementStillStrict
  reviewReferenceReplacementStillVisual: typeof reviewReferenceReplacementStillVisual
  runLocalQualityCheck: typeof runLocalLivePhotoQualityCheck
}

const LIVE_PHOTO_SUBTITLE_USER_ID = 'desktop-live-photo'

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
  runLocalQualityCheck: runLocalLivePhotoQualityCheck,
}

const LIVE_PHOTO_AUTO_FLOW_CONCURRENCY = 2
const LIVE_PHOTO_AUTO_FLOW_REQUEUE_COOLDOWN_MS = 8_000
const LIVE_PHOTO_REFERENCE_STILL_TIMEOUT_MS = 10 * 60 * 1000
const LIVE_PHOTO_REFERENCE_PACKAGING_TIMEOUT_MS = 90 * 1000
const LIVE_PHOTO_IMAGE_REMOTE_RETRY_MS = 1_000
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
    text.includes('rix_api_error') ||
    text.includes('overloaded') ||
    text.includes('over load') ||
    text.includes('too many requests') ||
    text.includes('rate limit') ||
    text.includes('http 429') ||
    text.includes('http 503') ||
    text.includes('status 429') ||
    text.includes('status 503')
  )
}

function buildRetryableStrictReviewFallback(): LivePhotoStrictReviewResult {
  return {
    passed: true,
    skipped: true,
    reason: 'review_service_overloaded',
    score: 1,
    matchedPhrases: [],
    missingPhrases: [],
    negativeSignals: [],
    analyzed: null,
  }
}

function buildRetryableVisualReviewFallback(): LivePhotoVisualReviewResult {
  return {
    passed: true,
    skipped: true,
    reason: 'review_service_overloaded',
    score: 1,
    verdict: 'pass',
    failures: [],
    notes: ['Review service overloaded; visual review deferred.'],
    checks: {},
  }
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
  const resolveArtifactPath = (currentPath: string | undefined, fallbackPath: string) => {
    const current = String(currentPath || '').trim()
    if (current && existsSync(current)) return current
    return existsSync(fallbackPath) ? fallbackPath : undefined
  }
  const resolveFirstExistingPath = (...candidates: Array<string | undefined>) => {
    for (const candidate of candidates) {
      const normalized = String(candidate || '').trim()
      if (normalized && existsSync(normalized)) return normalized
    }
    return undefined
  }
  const resolvedGeneratedStillPath = resolveArtifactPath(item.generatedStillPath, fallbackGeneratedStillPath)
  const resolvedMotionVideoPath = resolveArtifactPath(item.motionVideoPath, fallbackMotionVideoPath)
  const resolvedPreviewVideoPath = resolveArtifactPath(item.previewVideoPath, fallbackPreviewVideoPath)
  const resolvedLivePhotoImagePath = resolveArtifactPath(item.livePhotoImagePath, fallbackLivePhotoImagePath)
  const resolvedLivePhotoVideoPath = resolveArtifactPath(item.livePhotoVideoPath, fallbackLivePhotoVideoPath)
  return {
    ...item,
    generatedStillPath: resolvedGeneratedStillPath,
    motionVideoPath: resolvedMotionVideoPath,
    previewVideoPath: resolvedPreviewVideoPath,
    posterPath: resolveFirstExistingPath(item.posterPath, fallbackPosterPath, resolvedLivePhotoImagePath, resolvedGeneratedStillPath, item.referenceImagePath),
    livePhotoImagePath: resolvedLivePhotoImagePath,
    livePhotoVideoPath: resolvedLivePhotoVideoPath,
    packagingManifestPath: resolveArtifactPath(item.packagingManifestPath, fallbackManifestPath),
  }
}

function getLivePhotoSubtitleTargetPath(item: LivePhotoItem) {
  return (
    [
      String(item.livePhotoVideoPath || '').trim(),
      String(item.previewVideoPath || '').trim(),
      String(item.motionVideoPath || '').trim(),
    ].find((candidate) => candidate && existsSync(candidate)) || ''
  )
}

function getLivePhotoSubtitleOverlay(item: LivePhotoItem) {
  const overlay = item.subtitleOverlay
  if (!overlay || typeof overlay !== 'object') return undefined
  const subtitleOutputPath = String(overlay.subtitleOutputPath || '').trim()
  if (!subtitleOutputPath) return undefined
  return {
    active: Boolean(overlay.active),
    originalOutputPath: String(overlay.originalOutputPath || '').trim(),
    originalCoverImagePath: String(overlay.originalCoverImagePath || '').trim() || undefined,
    subtitleOutputPath,
    subtitleCoverImagePath: String(overlay.subtitleCoverImagePath || '').trim() || undefined,
    appliedAt: Number(overlay.appliedAt || 0) || now(),
  } satisfies LivePhotoSubtitleOverlay
}

function getLivePhotoExportSourcePath(item: LivePhotoItem) {
  const subtitleOutputPath = String(item.subtitleOutputPath || '').trim()
  const overlaySubtitleOutputPath = String(item.subtitleOverlay?.subtitleOutputPath || '').trim()
  const subtitleSourcePath = subtitleOutputPath || overlaySubtitleOutputPath
  if (subtitleSourcePath) {
    return existsSync(subtitleSourcePath) ? subtitleSourcePath : ''
  }
  return (
    [
      String(item.livePhotoVideoPath || '').trim(),
      String(item.previewVideoPath || '').trim(),
      String(item.motionVideoPath || '').trim(),
    ].find((candidate) => candidate && existsSync(candidate)) || ''
  )
}

function toLivePhotoItemSummary(item: LivePhotoItem): LivePhotoItemSummary {
  const hydrated = hydrateLivePhotoArtifactPaths(item)
  const overlay = getLivePhotoSubtitleOverlay(hydrated)
  const {
    logs: _logs,
    promptPreview: _promptPreview,
    imagePromptPreview: _imagePromptPreview,
    videoPromptPreview: _videoPromptPreview,
    ...summary
  } = hydrated
  return {
    ...summary,
    subtitleOverlayActive: Boolean(overlay?.active),
    subtitleOriginalOutputPath: String(overlay?.originalOutputPath || '').trim() || '',
    subtitleOutputPath: String(overlay?.subtitleOutputPath || '').trim() || '',
    subtitleCoverImagePath: String(overlay?.subtitleCoverImagePath || '').trim() || undefined,
    subtitleAppliedAt: Number(overlay?.appliedAt || 0) || undefined,
  }
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

async function backfillMissingPosterArtifact(item: LivePhotoItem, logMessage: string) {
  const root = livePhotoRoot(item.id)
  const posterPath = join(root, 'poster.jpg')
  if (existsSync(posterPath)) {
    if (String(item.posterPath || '').trim() === posterPath) return item
    return await livePhotoRepo.upsert({
      ...item,
      posterPath,
      updatedAt: now(),
    })
  }

  const hydrated = hydrateLivePhotoArtifactPaths(item)
  const sourceVideoPath =
    [
      String(hydrated.livePhotoVideoPath || '').trim(),
      String(hydrated.previewVideoPath || '').trim(),
      String(hydrated.motionVideoPath || '').trim(),
    ].find((candidate) => candidate && existsSync(candidate)) || ''
  const sourceImagePath =
    [
      String(hydrated.livePhotoImagePath || '').trim(),
      String(hydrated.generatedStillPath || '').trim(),
      String(hydrated.referenceImagePath || '').trim(),
    ].find((candidate) => candidate && existsSync(candidate) && /\.jpe?g$/i.test(candidate)) || ''

  if (!sourceVideoPath && !sourceImagePath) return item

  await ensureDir(root)
  if (sourceVideoPath) {
    await renderPosterFromVideo({ videoPath: sourceVideoPath, posterPath })
  } else if (sourceImagePath) {
    await copyFile(sourceImagePath, posterPath)
  }

  if (!existsSync(posterPath)) return item

  return await livePhotoRepo.upsert({
    ...item,
    posterPath,
    logs: [
      ...(Array.isArray(item.logs) ? item.logs : []),
      buildLivePhotoLog(logMessage),
    ].slice(-200),
    updatedAt: now(),
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
      image_validation: defaultWorkflowStepStatus(),
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
    retryLimit: LIVE_PHOTO_DEFAULT_RETRY_LIMIT,
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
    retryLimit: Number(current.retryLimit ?? LIVE_PHOTO_DEFAULT_RETRY_LIMIT) || LIVE_PHOTO_DEFAULT_RETRY_LIMIT,
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
  if (template === 'push_out') return 'product fully frozen, with only extremely subtle non-product micro-movement and no pull-back'
  if (template === 'ambient_sway') return 'product fully frozen, with only extremely subtle non-product micro-movement'
  return 'product fully frozen, with only extremely subtle non-product micro-movement and no push-in'
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
    '* Treat the product pixels as fully frozen across the full clip and do not animate the product body itself.',
    '* Do not morph, wobble, stretch, re-topologize, thicken, thin, bend, or re-attach any product part between frames.',
    '* Do not translate, rotate, swing, bounce, breathe, sway, or drift any visible product region.',
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
    '* The apparent product size change across the full clip must remain negligible and must not rely on push-in, pull-back, refocus behavior, or any simulated camera approach.',
    '* If any frame tends to enlarge, stylize, or simplify the product, keep the earlier locked-still scale instead.',
    '* Do not move the product relative to the frame, scene anchor, or supporting body anchor at all.',
    '',
    '---',
    '',
    'CAMERA:',
    '',
    'Use ONLY one motion style:',
    '',
    '-> locked-camera near-static hold with the product fully frozen and only tiny non-product micro-movement already implied by the still',
    '',
    'STRICT RULES:',
    '',
    '* keep the camera effectively locked in place',
    '* total visible movement must be extremely small and barely noticeable',
    '* apparent size change across the full clip must remain negligible',
    '* treat the clip as a still image where the product stays fully frozen and only non-product regions may acquire a faint natural sense of life',
    '* if motion causes any structure drift, reduce motion further until the product stays stable',
    '* no camera travel',
    '* no lens breathing feel',
    '* no floating drift larger than a tiny micro shift',
    '* no jitter',
    '* no vibration',
    '',
    'FORBIDDEN:',
    '',
    '* any push-in motion',
    '* any pull-back motion',
    '* zoom in then out',
    '* noticeable camera travel',
    '* simulated camera approach',
    '* simulated camera retreat',
    '* multi-direction movement',
    '* side-to-side sway',
    '* orbiting motion',
    '* reframing during the clip',
    '* fast approach toward the product',
    '* focus breathing',
    '* rack focus',
    '* refocusing behavior',
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
    '* all products -> product body remains fully frozen with no self-motion',
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
    '* move the product itself',
    '* animate the product itself',
    '',
    '---',
    '',
    'MOTION RULE:',
    '',
    '* the product itself must remain completely still across all frames',
    '* only tiny non-product micro-movement already consistent with the locked still is allowed',
    '* allowed motion must come from non-product regions only, such as a minute lighting shimmer, hair micro-shift, fabric micro-shift, or body micro-breathing that does not move the product anchor',
    '* no exaggerated motion',
    '* no intentional animation',
    '* do not introduce any new camera move to create energy',
    '* do not let any allowed ambient motion drag, swing, rotate, deform, or reposition the product',
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
    '* product remains fully frozen',
    '',
    'The product must remain visually identical across all frames.',
  ].join('\n')
  const negativePrompt = [
    'product reconstruction',
    'product redesign',
    'wrong product identity',
    'product morphing',
    'product movement',
    'product translation',
    'product rotation',
    'product swing',
    'product bounce',
    'product breathing',
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
      'product motion',
      'product translation',
      'product rotation',
      'product swing',
      'product bounce',
      'product breathing',
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
    motion: 'static',
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
    actionDescription: 'Generate only a near-static hold with the product fully frozen, only tiny non-product micro-movement, zero product reconstruction, zero added body parts, and zero scene reinterpretation.',
    cameraDescription: 'Locked close-up camera that stays effectively fixed across the full 6 seconds, with no push-in, no pull-back, no refocus, no camera travel, the product fully frozen, and only faint non-product micro-movement already implied by the still.',
    productFocus: 'Preserve the exact same frozen product identity, structure, micro-details, and anchor placement shown in the locked reference still.',
    generationPrompt: [
      'Create a realistic 6-second product close-up video.',
      'Keep the same exact product instance, correct proportions, exact anchor placement, and exact visible geometry.',
      'Keep the camera effectively locked, keep the product fully frozen, and allow only faint non-product micro-movement already implied by the still, with no push-in, no pull-back, no refocus, and no noticeable shake or drift.',
      'Do not infer unseen structure, do not rebuild the product, and do not redesign any visible detail.',
      'Do not add any person, hand, finger, palm, wrist, or body interaction that is not already visible in the starting still.',
      'Natural ambient light only, with real-world reflections and no artificial enhancement.',
    ].join(' '),
    scriptConfidence: 1,
    framing: 'closeup',
    cameraMovement: 'Locked-camera near-static hold only, with the product fully frozen, no push-in, no pull-back, no refocus, no camera travel, and only faint non-product micro-movement',
    action: 'Near-static hold only, with the product fully frozen, zero product reconstruction, zero reframing, and zero added human interaction or added body parts.',
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
      cameraMotion: 'Locked-camera near-static hold only, with the product fully frozen, no push-in, no pull-back, no refocus, no camera travel, and only faint non-product micro-movement',
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
      cameraMotion: 'Locked-camera near-static hold only, with the product fully frozen, no push-in, no pull-back, no refocus, no camera travel, and only faint non-product micro-movement',
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
    provider: input.item.videoTaskProvider,
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
    return 'erase_first'
  }
  if (
    (retryCount >= 1 || failureSignals.includes('validation_category:')) &&
    isEarring &&
    (
      failureSignals.includes('original_product_retained') ||
      failureSignals.includes('source_contamination') ||
      failureSignals.includes('attachment_drift') ||
      failureSignals.includes('missing_structure') ||
      failureSignals.includes('product_structure_consistency') ||
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
  let analyzed: ProductAnalysisResult | null = null
  let verdict = {
    passed: true,
    score: 1,
    matched: [] as string[],
    missing: [] as string[],
    criticalMatchedGroups: 0,
    criticalGroupCount: 0,
    negativeSignals: [] as string[],
  }
  try {
    analyzed = await livePhotoDeps.analyzeProductStructureWithGrs({
      credentials,
      productReferenceImagePaths: [resolveAuthoritativeProductReferencePath(input.product), input.stillPath].filter(Boolean),
      productCategory: String(analysis.category || input.product.type || 'general').trim() || 'general',
      locale: 'zh-CN',
    })
    verdict = scoreLivePhotoStructureMatch({ product: input.product, analyzed })
  } catch (error) {
    if (!isRetryableLivePhotoReviewLoadError(error)) throw error
  }
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

async function validateGeneratedStillWithPipeline(input: {
  item: LivePhotoItem
  product: LivePhotoProductSnapshot
  scenePath: string
  stillPath: string
}) {
  const settings = await livePhotoRepo.getSettings()
  const passThreshold = Math.max(0.5, Math.min(1, Number(settings.qualityPassThreshold ?? 0.88)))
  const retryFloor = Math.max(0, Math.min(passThreshold, Number(settings.qualityRetryFloor ?? 0.65)))
  const productPath = resolveAuthoritativeProductReferencePath(input.product)
  if (settings.qualityCheckerEnabled !== false && productPath) {
    const local = await livePhotoDeps.runLocalQualityCheck({
      scenePath: input.scenePath,
      productPath,
      generatedPath: input.stillPath,
      passThreshold,
      retryFloor,
    })
    if (local.available && local.report) return local.report
    const fallback = await validateReferenceReplacementStill({
      product: input.product,
      stillPath: input.stillPath,
      referenceImagePath: input.scenePath,
    })
    const score = Math.max(0, Math.min(1, Number(fallback.visualReview?.score ?? fallback.score ?? 0)))
    const decision = fallback.passed ? 'pass' : score >= retryFloor ? 'retry' : 'reject'
    return {
      checkerVersion: LIVE_PHOTO_QUALITY_CHECKER_VERSION,
      mode: 'remote_fallback',
      decision,
      score,
      threshold: passThreshold,
      retryFloor,
      components: {
        clip: 0,
        dinov2: 0,
        orb: 0,
        ssim: 0,
        scenePreservation: String(fallback.visualReview?.checks?.scene_preservation || '').toLowerCase() === 'fail' ? 0 : score,
        textConsistency: score,
      },
      hardFailures: [
        ...(fallback.negativeSignals || []),
        ...(fallback.strictReview?.negativeSignals || []),
        ...(fallback.visualReview?.failures || []),
      ],
      notes: [
        `Local checker unavailable: ${local.reason || 'unknown'}`,
        ...(fallback.visualReview?.notes || []),
      ],
      fallbackReason: local.reason || 'local_checker_unavailable',
      durationMs: Number(fallback.visualReview?.score === undefined ? 0 : 1),
      checkedAt: now(),
    } satisfies LivePhotoQualityReport
  }
  const fallback = await validateReferenceReplacementStill({
    product: input.product,
    stillPath: input.stillPath,
    referenceImagePath: input.scenePath,
  })
  const score = Math.max(0, Math.min(1, Number(fallback.visualReview?.score ?? fallback.score ?? 0)))
  return {
    checkerVersion: LIVE_PHOTO_QUALITY_CHECKER_VERSION,
    mode: 'remote_fallback',
    decision: fallback.passed ? 'pass' : score >= retryFloor ? 'retry' : 'reject',
    score,
    threshold: passThreshold,
    retryFloor,
    components: { clip: 0, dinov2: 0, orb: 0, ssim: 0, scenePreservation: score, textConsistency: score },
    hardFailures: [...(fallback.negativeSignals || []), ...(fallback.visualReview?.failures || [])],
    notes: fallback.visualReview?.notes || [],
    fallbackReason: settings.qualityCheckerEnabled === false ? 'local_checker_disabled' : 'product_reference_missing',
    durationMs: 0,
    checkedAt: now(),
  } satisfies LivePhotoQualityReport
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
      if (isRetryableLivePhotoReviewLoadError(error)) {
        if (attempt < 2) {
          await sleep(1500 * (attempt + 1))
          continue
        }
        return buildRetryableStrictReviewFallback()
      }
      throw error
    }
  }
  if (!analyzed) {
    if (isRetryableLivePhotoReviewLoadError(lastError)) {
      return buildRetryableStrictReviewFallback()
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError || 'Unknown error'))
  }
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
    if (isRetryableLivePhotoReviewLoadError(text)) {
      if (attempt < 2) {
        await sleep(1500 * (attempt + 1))
        continue
      }
      return buildRetryableVisualReviewFallback()
    }
    throw new Error(`Live Photo visual review failed HTTP ${res.status}: ${text.slice(0, 500)}`)
  }
  if (isRetryableLivePhotoReviewLoadError(text)) {
    return buildRetryableVisualReviewFallback()
  }
  const contentText = extractModelMessageContent(text)
  const jsonText = extractJsonObjectText(contentText)
  let parsed: any
  try {
    parsed = JSON.parse(jsonText)
  } catch (error: any) {
    if (isRetryableLivePhotoReviewLoadError(contentText) || isRetryableLivePhotoReviewLoadError(text)) {
      return buildRetryableVisualReviewFallback()
    }
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

function buildReferenceReplacementPrompt(_input: {
  product: LivePhotoProductSnapshot
  productReferenceImagePaths: string[]
  referenceImagePath: string
  retryGuidance?: string[]
  strategy?: LivePhotoReplacementStrategy
  prompt?: string
}) {
  const basePrompt = buildLivePhotoReplacementPrompt(_input.prompt)
  const strategy = _input.strategy || 'default'
  const executionRules = [
    buildLivePhotoProviderRolePrefix({
      referenceImagePath: _input.referenceImagePath,
      productReferenceImagePath: _input.productReferenceImagePaths[0] || '',
      mode: 'image_replace',
    }),
    '',
    'REPLACEMENT EXECUTION ORDER:',
    '- First erase the entire original product from Image 1, including its silhouette, connector, closure, dangling parts, shadows, highlights, and reflections.',
    '- Then place the product from Image 2 into the same physical anchor position.',
    '- Do not use Image 1 to infer, complete, or reconstruct any product geometry.',
    '- Do not blend the original product with the replacement product, even when both products are in the same category.',
  ]
  if (strategy === 'erase_first') {
    executionRules.push(
      '- This is an erase-first replacement: the old product must be fully removed before the new product is rendered.',
      '- Preserve only the ear, skin, hair, clothing, background, and non-product lighting from Image 1.',
    )
  }
  if (strategy === 'anchor_closeup') {
    executionRules.push(
      '- This is a local anchor replacement. Modify only the smallest area containing the original product and its contact point.',
      '- Keep every pixel outside the product replacement area visually identical to Image 1.',
      '- Render exactly one product instance from Image 2 at the anchor. Do not retain a second hoop, duplicate, or overlapping original product.',
    )
  }
  executionRules.push(...buildLivePhotoCategorySpecificPromptRules(_input.product, 'replacement'))
  if (_input.retryGuidance?.length) {
    executionRules.push('', 'RETRY CORRECTION RULES:', ..._input.retryGuidance.map((item) => `- ${item}`))
  }
  return [basePrompt, '', ...executionRules].join('\n')
}

export function buildLivePhotoCategorySpecificPromptRules(product: LivePhotoProductSnapshot, context: 'replacement' | 'video' = 'replacement') {
  const analysis = normalizeLivePhotoProductAnalysis(product.productAnalysis)
  const isEarring = isEarringLikeLivePhotoProduct(product)
  const analysisText = [
    analysis?.summary,
    analysis?.coreSubject,
    analysis?.connectionStructure,
    analysis?.geometryDetails,
    analysis?.rawDescription,
    ...(Array.isArray(analysis?.matchingRules) ? analysis.matchingRules : []),
  ]
    .map((item) => String(item || '').trim().toLowerCase())
    .filter(Boolean)
    .join('\n')
  const isHoop = /\b(?:huggie|hoop)\b/.test(analysisText)
  const hasSnapClosure = /\b(?:snap closure|snaps into|u-catch|curved post|hinged closure)\b/.test(analysisText)
  const hasBowMotif = /\bbow\b/.test(analysisText)
  const hasStarMotif = /\b(?:star|five-pointed|five point)\b/.test(analysisText)
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
    context === 'video'
      ? '- Preserve hinge, clasp, latch, post, connector spacing, and closure logic exactly when visible in the locked still.'
      : '- Preserve hinge, clasp, latch, post, connector spacing, and closure logic exactly when visible in Image 2.',
    context === 'video'
      ? '- Preserve the exact front ornament motif and attachment visible in the locked still. Do not substitute a different motif.'
      : '- Preserve the exact front ornament motif and attachment from Image 2. Do not substitute a different motif.',
    context === 'video'
      ? '- Keep the exact visible stone, charm, and dangling-element count from the locked still.'
      : '- Keep the exact stone, charm, and dangling-element count from Image 2.',
    context === 'video'
      ? '- Do NOT preserve any open ring, open cuff, split arc, or incomplete loop trace not present in the locked still.'
      : '- Do NOT preserve any open ring, open cuff, split arc, or incomplete loop trace from Image 1.',
    context === 'video'
      ? '- Keep the final earring at the exact real-world size already visible in the locked still. Do NOT enlarge it or reinterpret its wearable scale.'
      : '- Keep the final earring at the exact real-world size that matches the selected earring from Image 2 and Product DNA. Do NOT inherit the replaced earring size from Image 1 when it conflicts.',
  )
  if (analysis?.coreSubject) rules.push(`- Product identity from Product DNA: ${analysis.coreSubject}`)
  if (analysis?.connectionStructure) rules.push(`- Product connection structure from Product DNA: ${analysis.connectionStructure}`)
  if (analysis?.geometryDetails) rules.push(`- Product geometry from Product DNA: ${analysis.geometryDetails}`)
  if (isHoop) {
    rules.push(
      '- Treat the selected hoop or huggie as a hoop earring specifically. Do NOT reinterpret it as a ring, cuff, or abstract jewelry loop.',
      '- Keep the hoop outline and curvature exactly as defined by the authoritative product source.',
      '- Keep the hoop body count and band structure exactly as defined by the authoritative product source.',
    )
  }
  if (hasSnapClosure) {
    rules.push('- Preserve the exact hinged snap-closure path, curved post, and catch geometry from the authoritative product source.')
  }
  if (hasStarMotif) {
    rules.push('- Preserve the exact star motif and point count. Do NOT convert it into a bow, butterfly, heart, flower, or generic gemstone.')
  }
  if (hasBowMotif) {
    rules.push('- Preserve the exact bow motif, loop shape, tail structure, and stone articulation. Do NOT substitute a star, butterfly, heart, or flower.')
  }
  return rules
}

export function buildReferenceReplacementNegativePrompt(input?: {
  product?: LivePhotoProductSnapshot
  strategy?: LivePhotoReplacementStrategy
}) {
  const productNegatives: string[] = []
  const negatives = [
      'different pose',
      'different head angle',
      'different ear position',
      'different hair shape',
      'different skin area',
      'different framing',
      'different crop',
      'different background',
      'different person',
      'different face',
      'newly staged scene',
      'newly photographed scene',
      'different lighting direction',
      'oversized product',
      'enlarged product',
      'wrong product scale',
      'product larger than original anchor',
      'product larger than original footprint',
      'larger than the original visible product',
      'original product retained',
      'leftover original product',
      'original silhouette remains',
      'mixed product features',
      'source contamination',
      'wrong product',
      'product redesign',
      'extra product',
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
    const analysis = normalizeLivePhotoProductAnalysis(input.product.productAnalysis)
    const analysisText = [
      analysis?.summary,
      analysis?.coreSubject,
      analysis?.connectionStructure,
      analysis?.geometryDetails,
      analysis?.rawDescription,
      ...(Array.isArray(analysis?.matchingRules) ? analysis.matchingRules : []),
    ]
      .map((item) => String(item || '').trim().toLowerCase())
      .filter(Boolean)
      .join('\n')
    const hasBowMotif = /\bbow\b/.test(analysisText)
    const hasStarMotif = /\b(?:star|five-pointed|five point)\b/.test(analysisText)
    productNegatives.push('wrong earring motif', 'wrong ornament attachment', 'wrong charm or stone count')
    if (hasBowMotif) productNegatives.push('wrong bow shape', 'star ornament instead of bow ornament')
    if (hasStarMotif) productNegatives.push('wrong star point count', 'bow ornament instead of star ornament')
  }
  const priorityNegatives = [
    'original product retained',
    'leftover original product',
    ...productNegatives,
    'different pose',
    'different head angle',
    'different ear position',
    'different framing',
    'different crop',
    'different background',
    'newly photographed scene',
    'oversized product',
    'wrong product scale',
  ]
  const remainingNegatives = negatives.filter((item) => !priorityNegatives.includes(item))
  return buildStoryboardImageNegativePrompt([...priorityNegatives, ...remainingNegatives].join(', '))
}

function buildLivePhotoProviderRolePrefix(input: {
  referenceImagePath: string
  productReferenceImagePath: string
  mode?: 'image_replace' | 'video_reference_lock'
}) {
  if (input.mode === 'video_reference_lock') {
    return [
      'PROVIDER INPUT ROLE LOCK:',
      'You will receive exactly 2 uploaded images.',
      'The first uploaded image is Image 1, the locked still scene anchor image.',
      'The second uploaded image is Image 2, the authoritative product reference image.',
      'Image 1 defines the locked scene, crop, pose, and product anchor.',
      'Image 2 defines the only valid product identity source.',
      'Never swap these two image roles.',
      'Never average these two images.',
      'Never treat Image 2 as a scene, pose, crop, or composition reference.',
      'Never treat Image 1 as a product redesign reference.',
      'If Image 2 is a multi-angle product board, use it only as a product identity source.',
      'Do not merge multiple thumbnails from Image 2 into a reconstructed new product view.',
      `Image 1 path: ${input.referenceImagePath}.`,
      `Image 2 path: ${input.productReferenceImagePath}.`,
    ].join('\n')
  }
  return [
    'PROVIDER INPUT ROLE LOCK:',
    'You will receive exactly 2 uploaded images.',
    'The first uploaded image is Image 1, the base scene reference.',
    'The second uploaded image is Image 2, the product reference.',
    'Never swap these two images.',
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
  guidance.add('Retry escalation is active. Cleanly replace the product instead of reinterpreting it.')
  guidance.add('Completely remove the original product from Image 1 before placing the product from Image 2.')
  guidance.add('Edit only the original product area and leave all non-product content from Image 1 unchanged.')
  guidance.add('Keep the exact same crop, pose, ear position, hair, skin, and background from Image 1.')
  guidance.add('Use only the product from Image 2 and do not blend any product feature from Image 1.')
  guidance.add('Keep everything except the product unchanged.')
  if (retryCount >= 2) guidance.add('Make the replacement cleaner and more exact than the previous attempt.')
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
  if (
    reason.includes('original product') ||
    reason.includes('replacement incomplete') ||
    reason.includes('source_contamination')
  ) {
    guidance.add('Remove every visible trace of the original product from Image 1 before placing the product from Image 2.')
  }
  if (reason.includes('wrong product') || reason.includes('different product') || reason.includes('mismatch') || reason.includes('product_identity')) {
    guidance.add('Match the exact product from Image 2 and do not output a similar product.')
  }
  if (reason.includes('scene_preservation') || reason.includes('scene drift')) {
    guidance.add('Keep Image 1 pose, framing, lighting, background, and visible body parts unchanged.')
    guidance.add('Keep the exact same head angle, ear position, hair shape, skin area, and crop from Image 1.')
    guidance.add('Do not redraw or replace non-product regions from Image 1.')
  }
  if (reason.includes('scale') || reason.includes('oversized') || reason.includes('too large') || reason.includes('larger than')) {
    guidance.add('Keep the same anchor in Image 1 but correct the product scale to look natural for the selected product.')
  }
  if (reason.includes('missing part') || reason.includes('missing structure') || reason.includes('attachment')) {
    guidance.add('Keep the product from Image 2 complete and do not drop visible product parts.')
  }
  if (reason.includes('product_structure_consistency') || reason.includes('structure drift')) {
    guidance.add('Match the exact single-product silhouette, hoop count, closure path, connector layout, and ornament attachment from Image 2.')
    guidance.add('Output exactly one replacement product at the original anchor. Do not combine it with any original hoop or product contour from Image 1.')
  }
  return Array.from(guidance)
}

function resolveLivePhotoProductReferenceVariant(item: LivePhotoItem): LivePhotoProductReferenceVariant {
  const reason = String(item.autoFlowStatus?.lastError || item.error || '').trim().toLowerCase()
  return reason.includes('product_structure_consistency') || reason.includes('structure drift')
    ? 'structure_retry'
    : 'primary'
}

async function bindPreparedLivePhotoReplacementInputs(input: {
  item: LivePhotoItem
  product: LivePhotoProductSnapshot
  referenceImagePath: string
  outputDir: string
}) {
  const sourceProductPath = resolveAuthoritativeProductReferencePath(input.product)
  const prepared = await prepareLivePhotoProductReference({
    sourcePath: sourceProductPath,
    outputDir: input.outputDir,
    variant: resolveLivePhotoProductReferenceVariant(input.item),
  })
  const payload = bindLivePhotoReplacementInputs({
    referenceImagePath: input.referenceImagePath,
    product: {
      ...input.product,
      authoritativeProductReferencePath: prepared.path,
      imagePaths: [prepared.path],
      coverImagePath: prepared.path,
    },
  })
  return { ...payload, prepared }
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

  const payload = await bindPreparedLivePhotoReplacementInputs({
    item: input.item,
    product: input.product,
    referenceImagePath: input.referenceImagePath,
    outputDir: join(root, 'product-reference'),
  })
  const replacementStrategy = input.strategyOverride || inferLivePhotoReplacementStrategy({ item: input.item, product: input.product })
  const renderConfig = resolveLivePhotoReplacementRenderConfig(replacementStrategy, input.product)
  const retryGuidance = buildLivePhotoRetryGuidance(input.item, input.product)
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
    prompt: buildReferenceReplacementPrompt({
      product: input.product,
      productReferenceImagePaths: payload.productReferenceImagePaths,
      referenceImagePath: payload.referenceImagePath,
      retryGuidance,
      strategy: replacementStrategy,
      prompt: input.item.imagePromptPreview?.prompt,
    }),
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
  const payload = await bindPreparedLivePhotoReplacementInputs({
    item: input.item,
    product: input.product,
    referenceImagePath: input.referenceImagePath,
    outputDir: join(root, 'product-reference'),
  })
  const replacementStrategy = input.strategyOverride || inferLivePhotoReplacementStrategy({ item: input.item, product: input.product })
  const renderConfig = resolveLivePhotoReplacementRenderConfig(replacementStrategy, input.product)
  const retryGuidance = buildLivePhotoRetryGuidance(input.item, input.product)
  const prompt = buildReferenceReplacementPrompt({
    product: input.product,
    productReferenceImagePaths: payload.productReferenceImagePaths,
    referenceImagePath: payload.referenceImagePath,
    retryGuidance,
    strategy: replacementStrategy,
    prompt: input.item.imagePromptPreview?.prompt,
  })
  const negativePrompt = buildReferenceReplacementNegativePrompt({
    product: input.product,
    strategy: replacementStrategy,
  })
  const imagePaths = payload.imagePaths
  const providers = livePhotoImageProviderChain(credentials)
  const adapters: LivePhotoImageProviderAdapter[] = providers.map((provider) => ({
    provider,
    submit: async () => {
      if (provider === 'grsai') {
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
        return null
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
      return null
    },
  }))
  adapters.push({
    provider: resolveImagePreviewProvider(credentials),
    submit: async () => {
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
    },
  })
  return await submitLivePhotoImageGeneration({
    adapters,
    onProviderError: (provider, error, hasFallback) => {
      console.warn('[live-photo] image provider failed', {
        itemId: input.item.id,
        provider,
        hasFallback,
        reason: String(error instanceof Error ? error.message : error || '').trim(),
      })
    },
  })
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
      prompt: item.imagePromptPreview?.prompt,
      retryGuidance: buildLivePhotoRetryGuidance(item, productSnapshot),
    })
  } catch {
    return item.imagePromptPreview
  }
}

function resolveLivePhotoReferenceImagePath(item: LivePhotoItem) {
  const candidates = [
    String(item.referenceImagePath || '').trim(),
    ...(Array.isArray(item.imagePromptPreview?.referenceImagePaths) ? item.imagePromptPreview.referenceImagePaths : []),
    ...(Array.isArray(item.videoPromptPreview?.referenceImagePaths) ? item.videoPromptPreview.referenceImagePaths : []),
    String(item.generatedStillPath || '').trim(),
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  return ''
}

function buildReferenceReplacementImagePromptPreview(input: {
  product: LivePhotoProductSnapshot
  referenceImagePath: string
  credentials: ModelCredentials
  retryGuidance?: string[]
  prompt?: string
}) {
  const payload = bindLivePhotoReplacementInputs({
    referenceImagePath: input.referenceImagePath,
    product: input.product,
  })
  const replacementStrategy: LivePhotoReplacementStrategy =
    isEarringLikeLivePhotoProduct(input.product) || (Array.isArray(input.retryGuidance) && input.retryGuidance.length)
      ? 'erase_first'
      : 'default'
  const provider = resolveLivePhotoImageExecutionProvider(input.credentials)
  return buildImageRequestPreview({
    provider,
    model: resolveLivePhotoImageExecutionModel(input.credentials, provider),
    prompt: buildReferenceReplacementPrompt({
      product: input.product,
      productReferenceImagePaths: payload.productReferenceImagePaths,
      referenceImagePath: payload.referenceImagePath,
      retryGuidance: input.retryGuidance,
      strategy: replacementStrategy,
      prompt: input.prompt,
    }),
    negativePrompt: buildReferenceReplacementNegativePrompt({
      product: input.product,
      strategy: replacementStrategy,
    }),
    referenceImagePaths: payload.imagePaths,
  })
}

function canSyncLivePhotoPromptVersion(item: LivePhotoItem) {
  if (item.sourceType !== 'reference_replace') return false
  if (item.packagingStatus === 'completed') return false
  if (String(item.generatedStillPath || '').trim()) return false
  if (String(item.imageTaskId || '').trim()) return false
  return true
}

async function syncLivePhotoPromptVersionToPendingItems(promptVersion: LivePhotoPromptVersion) {
  const credentials = await cloneRepo.getCredentials()
  const items = await livePhotoRepo.list()
  let syncedCount = 0

  for (const item of items) {
    if (!canSyncLivePhotoPromptVersion(item) || !item.productSnapshot) continue
    const referenceImagePath = resolveLivePhotoReferenceImagePath(item)
    if (!referenceImagePath) continue
    const imagePromptPreview = buildReferenceReplacementImagePromptPreview({
      product: item.productSnapshot,
      referenceImagePath,
      credentials,
      retryGuidance: buildLivePhotoRetryGuidance(item, item.productSnapshot),
      prompt: promptVersion.prompt,
    })
    await livePhotoRepo.upsert({
      ...item,
      imagePromptPreview,
      promptVersionId: promptVersion.id,
      promptVersion: promptVersion.version,
      promptHash: promptVersion.promptHash,
      cacheKey: undefined,
      cacheHit: false,
      logs: [
        ...(Array.isArray(item.logs) ? item.logs : []),
        buildLivePhotoLog(`[live-photo] prompt synchronized to V${promptVersion.version}`),
      ].slice(-200),
      updatedAt: now(),
    })
    syncedCount += 1
  }

  return syncedCount
}

async function ensureVideoCoverImage(videoPath?: string) {
  const source = String(videoPath || '').trim()
  if (!source) return undefined
  return (await generateThumbnailJpg({ filePath: source, atSec: 1 })) || undefined
}

async function copyMotionSourceVideo(input: { sourceVideoPath: string; outputPath: string }) {
  await copyFile(input.sourceVideoPath, input.outputPath)
}

async function writeLivePhotoVideoPreservingSource(input: { sourceVideoPath: string; outputPath: string }) {
  try {
    await livePhotoDeps.runFfmpeg({
      args: [
        '-y',
        '-i',
        input.sourceVideoPath,
        '-map',
        '0:v:0',
        '-c',
        'copy',
        '-movflags',
        'use_metadata_tags+faststart',
        '-an',
        input.outputPath,
      ],
    })
    return
  } catch {
    await livePhotoDeps.runFfmpeg({
      args: [
        '-y',
        '-i',
        input.sourceVideoPath,
        '-map',
        '0:v:0',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-movflags',
        'use_metadata_tags+faststart',
        '-an',
        input.outputPath,
      ],
    })
  }
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

function resolveLivePhotoRemoteRetryDelayMs(stage: LivePhotoWorkflowStep) {
  return stage === 'image_generation'
    ? LIVE_PHOTO_IMAGE_REMOTE_RETRY_MS
    : LIVE_PHOTO_VIDEO_REMOTE_RETRY_MS
}

function readExistingMaterializedArtifacts(itemId: string) {
  const root = livePhotoRoot(itemId)
  const livePhotoImagePath = join(root, 'live-photo.jpg')
  const livePhotoVideoPath = join(root, 'live-photo.mov')
  const previewVideoPath = join(root, 'preview.mp4')
  const posterPath = join(root, 'poster.jpg')
  const packagingManifestPath = join(root, 'live-photo.json')
  const motionVideoPath = existsSync(join(root, 'motion.mp4'))
    ? join(root, 'motion.mp4')
    : existsSync(join(root, 'motion.mov'))
      ? join(root, 'motion.mov')
      : undefined
  const generatedStillPath = existsSync(join(root, 'still.jpg'))
    ? join(root, 'still.jpg')
    : existsSync(join(root, 'still.png'))
      ? join(root, 'still.png')
      : undefined

  if (
    !existsSync(livePhotoImagePath) ||
    !existsSync(livePhotoVideoPath) ||
    !existsSync(previewVideoPath) ||
    !existsSync(packagingManifestPath)
  ) {
    return null
  }

  return {
    generatedStillPath,
    motionVideoPath,
    livePhotoImagePath,
    livePhotoVideoPath,
    previewVideoPath,
    posterPath: existsSync(posterPath) ? posterPath : undefined,
    packagingManifestPath,
    packagingStatus: 'completed' as const,
    error: undefined,
  }
}

async function restoreCompletedMaterializedItem(item: LivePhotoItem, logMessage: string) {
  const materialized = readExistingMaterializedArtifacts(item.id)
  if (!materialized) return null
  return await livePhotoRepo.upsert({
    ...appendLivePhotoLogs(item, [
      buildLivePhotoLog(logMessage, 'success'),
      buildLivePhotoLog('[live-photo] task completed', 'success'),
    ]),
    ...materialized,
    packagingStatus: 'completed',
    error: undefined,
    videoTaskId: undefined,
    videoTaskProvider: undefined,
    videoTaskModel: undefined,
    videoTaskBaseUrl: undefined,
    videoTaskEndpointStyle: undefined,
    autoFlowStatus: {
      ...ensureAutoFlowStatus(item),
      status: 'done',
      currentStage: 'completed',
      lastCompletedAt: now(),
      lastError: '',
    },
    workflow: patchWorkflow(
      patchWorkflow(item.workflow, 'live_photo_packaging', 'live_photo_packaging', 'done'),
      'completed',
      'completed',
      'done',
    ),
    updatedAt: now(),
  })
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

  let originalMotionVideoPath = String(input.videoSourcePath || '').trim()
  let motionVideoPath = input.videoSourcePath ? join(root, `motion${extname(input.videoSourcePath) || '.mp4'}`) : join(root, 'motion.mp4')
  if (input.videoSourcePath) {
    await copyMotionSourceVideo({ sourceVideoPath: input.videoSourcePath, outputPath: motionVideoPath })
  } else {
    const generatedVideoPath = await generateAiMotionVideoFromStill({
      item: input.item,
      product: input.product,
      stillPath,
      outputDir: join(root, 'generated-video'),
      template: input.motionTemplate,
    })
    originalMotionVideoPath = generatedVideoPath
    motionVideoPath = join(root, `motion${extname(generatedVideoPath) || '.mp4'}`)
    await copyMotionSourceVideo({ sourceVideoPath: generatedVideoPath, outputPath: motionVideoPath })
  }

  await renderPosterFromVideo({ videoPath: motionVideoPath, posterPath })
  await copyFile(stillPath, liveImagePath)
  await writeLivePhotoVideoPreservingSource({ sourceVideoPath: motionVideoPath, outputPath: liveVideoPath })
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
    originalMotionVideoPath: originalMotionVideoPath || undefined,
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
  let generated: { stillPath: string; productReferenceImagePaths: string[] } | undefined
  let qualityReport: LivePhotoQualityReport | undefined
  let generationAttempts = [...(input.item.generationAttempts || [])]
  let cacheKey: string | undefined
  let cacheHit = false
  const autoFlowLogs = [] as ReturnType<typeof buildLivePhotoLog>[]
  const promptVersion = livePhotoPromptVersionService.getActive()
  const promptHash = String(input.item.promptHash || promptVersion.promptHash).trim()
  const previewProvider = String(input.item.imagePromptPreview?.provider || '').trim()
  const previewModel = String(input.item.imagePromptPreview?.model || '').trim()
  const replacementStrategy = inferLivePhotoReplacementStrategy({ item: input.item, product: input.product })
  const replacementNegativePrompt = buildReferenceReplacementNegativePrompt({
    product: input.product,
    strategy: replacementStrategy,
  })
  if (!String(input.item.generatedStillPath || '').trim() && !String(input.item.imageTaskId || '').trim()) {
    const revalidationCandidate = [...generationAttempts]
      .reverse()
      .find((attempt) =>
        String(attempt.outputPath || '').trim() &&
        existsSync(String(attempt.outputPath || '').trim()) &&
        String(attempt.quality?.checkerVersion || '').trim() !== LIVE_PHOTO_QUALITY_CHECKER_VERSION,
      )
    if (revalidationCandidate) {
      try {
        const revalidated = await validateGeneratedStillWithPipeline({
          item: input.item,
          product: input.product,
          scenePath: input.referenceImagePath,
          stillPath: revalidationCandidate.outputPath,
        })
        generationAttempts = generationAttempts.map((attempt) =>
          attempt.id === revalidationCandidate.id ? { ...attempt, quality: revalidated } : attempt,
        )
        if (revalidated.decision === 'pass') {
          generated = {
            stillPath: revalidationCandidate.outputPath,
            productReferenceImagePaths: input.product.imagePaths,
          }
          qualityReport = revalidated
          autoFlowLogs.push(
            buildLivePhotoLog(
              `[live-photo] previous image passed revalidation with ${LIVE_PHOTO_QUALITY_CHECKER_VERSION}: score=${revalidated.score}`,
              'success',
            ),
          )
        }
      } catch (error) {
        autoFlowLogs.push(buildLivePhotoLog(`[live-photo] previous image revalidation skipped: ${String(error)}`))
      }
    }
  }
  try {
    if (!String(input.item.generatedStillPath || '').trim() && !String(input.item.imageTaskId || '').trim()) {
      cacheKey = await buildLivePhotoQualityCacheKey({
          scenePath: input.referenceImagePath,
          productPath: resolveAuthoritativeProductReferencePath(input.product),
          promptHash,
          provider: previewProvider,
          model: previewModel,
          outputSize: (await livePhotoRepo.getSettings()).outputResolution,
          generationParams: {
            strategy: replacementStrategy,
            negativePrompt: replacementNegativePrompt,
          },
          checkerVersion: LIVE_PHOTO_QUALITY_CHECKER_VERSION,
        })
      const cached = cacheKey ? await livePhotoQualityCache.get(cacheKey) : null
      if (cached) {
        const cachePath = join(stillOutputDir, `reference_replace_cache_${randomUUID()}.png`)
        await copyFile(cached.imagePath, cachePath)
        generated = { stillPath: cachePath, productReferenceImagePaths: input.product.imagePaths }
        qualityReport = cached.quality
        cacheHit = true
        generationAttempts = [
          ...generationAttempts,
          {
            id: randomUUID(),
            index: generationAttempts.length + 1,
            outputPath: cachePath,
            provider: previewProvider,
            model: previewModel,
            strategy: 'cache',
            cacheHit: true,
            quality: cached.quality,
            createdAt: now(),
          },
        ]
      }
    }
  } catch (error) {
    appendLivePhotoLogs(input.item, [buildLivePhotoLog(`[live-photo] quality cache lookup skipped: ${String(error)}`)])
  }
  if (!generated && String(input.item.generatedStillPath || '').trim() && existsSync(String(input.item.generatedStillPath || '').trim())) {
    generated = {
      stillPath: String(input.item.generatedStillPath || '').trim(),
      productReferenceImagePaths: input.product.imagePaths,
    }
  } else if (!generated && String(input.item.imageTaskId || '').trim()) {
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
  } else if (!generated) {
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
  if (!generated) throw new Error('Reference still generation did not produce an output')
  if (!qualityReport) {
    await livePhotoRepo.upsert({
      ...input.item,
      generatedStillPath: generated.stillPath,
      workflow: patchWorkflow(input.item.workflow, 'image_validation', 'image_validation', 'running'),
      autoFlowStatus: patchAutoFlowStatus(input.item, 'image_validation', 'running'),
      updatedAt: now(),
    })
    qualityReport = await validateGeneratedStillWithPipeline({
      item: input.item,
      product: input.product,
      scenePath: input.referenceImagePath,
      stillPath: generated.stillPath,
    })
    const attempt: LivePhotoGenerationAttempt = {
      id: randomUUID(),
      index: generationAttempts.length + 1,
      outputPath: generated.stillPath,
      provider: previewProvider,
      model: previewModel,
      strategy: replacementStrategy,
      negativePrompt: replacementNegativePrompt,
      cacheHit: false,
      quality: qualityReport,
      createdAt: now(),
    }
    generationAttempts = [...generationAttempts, attempt]
    await livePhotoRepo.upsert({
      ...input.item,
      generatedStillPath: generated.stillPath,
      qualityReport,
      generationAttempts,
      cacheKey,
      cacheHit: false,
      workflow: patchWorkflow(input.item.workflow, 'image_validation', 'image_validation', qualityReport.decision === 'pass' ? 'done' : 'failed', qualityReport.hardFailures.join(', ')),
      updatedAt: now(),
    })
    if (qualityReport.decision !== 'pass') {
      throw new Error(`[image_validation_failed] ${qualityReport.decision}: ${qualityReport.hardFailures.join(', ') || `quality score ${qualityReport.score}`}`)
    }
    if (cacheKey) await livePhotoQualityCache.put({ key: cacheKey, sourcePath: generated.stillPath, quality: qualityReport })
  }
  const imageDoneItem: LivePhotoItem = {
    ...appendLivePhotoLogs(input.item, [
      ...autoFlowLogs,
      buildLivePhotoLog(`[live-photo] image_generation completed: ${generated.stillPath}`, 'success'),
      buildLivePhotoLog(`[live-photo] image validation passed: score=${qualityReport?.score ?? 0}`, 'success'),
      buildLivePhotoLog('[live-photo] stage video_generation started'),
    ]),
    generatedStillPath: generated.stillPath,
    qualityReport,
    generationAttempts,
    cacheKey,
    cacheHit,
    checkerFallbackReason: qualityReport?.fallbackReason,
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
    workflow: patchWorkflow(patchWorkflow(input.item.workflow, 'image_validation', 'image_validation', 'done'), 'video_generation', 'image_generation', 'done'),
    autoFlowStatus: {
      ...patchAutoFlowStatus(input.item, 'video_generation', 'running'),
      retryLimit: LIVE_PHOTO_DEFAULT_RETRY_LIMIT,
      retryCount: 0,
    },
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
      buildLivePhotoLog('[live-photo] clone motion source prepared'),
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
  const restoredBeforeResume = await restoreCompletedMaterializedItem(
    latest,
    '[live-photo] restored completed package from existing artifacts',
  )
  if (restoredBeforeResume) return restoredBeforeResume
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
      const referenceImagePath = resolveLivePhotoReferenceImagePath(latest)
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
    const retryLimit = resolveLivePhotoRetryLimit(currentStage)
    const nextRetryCount = Math.min(retryLimit, Number(current.retryCount ?? 0) + 1)
    const terminalByStage = shouldForceTerminalLivePhotoFailure(currentStage, reason)
    const terminal = terminalByStage || nextRetryCount >= retryLimit
    const imageValidationFailure =
      (currentStage === 'image_generation' || currentStage === 'image_validation') && isLivePhotoImageValidationFailure(reason)
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
              : `[live-photo] retry limit reached: ${retryLimit}`
            : `[live-photo] marked retryable failure: retry ${nextRetryCount}/${retryLimit}`,
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
        retryLimit,
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
      error: terminal ? `[retry_limit] Live Photo auto retry reached ${retryLimit} times. Please check the source material and retry manually.` : reason,
      updatedAt: now(),
    })
    const restoredAfterFailure = await restoreCompletedMaterializedItem(
      failed,
      '[live-photo] restored completed package after failure because artifacts already existed',
    )
    if (restoredAfterFailure) return restoredAfterFailure
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
          const currentStage = resolveLivePhotoFailureStage(
            latest,
            latest.workflow?.currentStep || current.currentStage || 'queued',
          )
          const shouldRetry =
            latest.packagingStatus === 'processing' ||
            current.status === 'running' ||
            current.status === 'failed_retryable'
          if (shouldRetry) {
            scheduleLivePhotoTimer(() => {
              enqueueLivePhotoAutoFlow(safeItemId, motionTemplate, 'auto_retry', { bypassCooldown: true })
            }, resolveLivePhotoRemoteRetryDelayMs(currentStage))
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
      const retryLimit = resolveLivePhotoRetryLimit(currentStage)
      const nextRetryCount = Math.min(retryLimit, Number(current.retryCount ?? 0) + 1)
      const terminal = shouldForceTerminalLivePhotoFailure(currentStage, reason) || nextRetryCount >= retryLimit
      await livePhotoRepo.upsert({
        ...appendLivePhotoLogs(latest, [
          buildLivePhotoLog(`[live-photo] queue-level failure: ${reason}`, 'error'),
        ]),
        packagingStatus: 'failed',
        autoFlowStatus: {
          ...current,
          retryLimit,
          retryCount: nextRetryCount,
          status: terminal ? 'failed_terminal' : 'failed_retryable',
          currentStage,
          lastError: reason,
        },
        error: terminal
          ? `[retry_limit] Live Photo auto retry reached ${retryLimit} times. Please check the source material and retry manually.`
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
  const referenceImagePaths = normalizeLivePhotoScenePaths(input)
  const product = await buildProductSnapshot(String(input.productId || '').trim())
  const credentials = await cloneRepo.getCredentials()
  const promptVersion = livePhotoPromptVersionService.getActive()
  ensureLivePhotoStrictImageEditProvider(credentials)
  const motionTemplate = input.motionTemplate || 'push_in'
  await productImageMaterialsService.markMaterialsUsedByLocalImagePaths(referenceImagePaths)
  const created: LivePhotoItem[] = []
  for (const referenceImagePath of referenceImagePaths) {
    const timestamp = now()
    const imagePromptPreview = buildReferenceReplacementImagePromptPreview({
      product,
      referenceImagePath,
      credentials,
      prompt: promptVersion.prompt,
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
      promptVersionId: promptVersion.id,
      promptVersion: promptVersion.version,
      promptHash: promptVersion.promptHash,
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
    if (input.runLocalQualityCheck) livePhotoDeps.runLocalQualityCheck = input.runLocalQualityCheck
  },

  async resetTestDependencies() {
    await drainLivePhotoAutoFlowForTests()
    livePhotoDeps.runFfmpeg = runFfmpeg
    livePhotoDeps.generateGptShotFrameImage = generateGptShotFrameImage
    livePhotoDeps.generateShotVideoByProviderChain = generateShotVideoByProviderChain
    livePhotoDeps.analyzeProductStructureWithGrs = analyzeProductStructureWithGrs
    livePhotoDeps.reviewReferenceReplacementStillStrict = reviewReferenceReplacementStillStrict
    livePhotoDeps.reviewReferenceReplacementStillVisual = reviewReferenceReplacementStillVisual
    livePhotoDeps.runLocalQualityCheck = runLocalLivePhotoQualityCheck
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
    const sortedItems = items.slice().sort((a, b) => {
      const delta = Number(b.createdAt || 0) - Number(a.createdAt || 0)
      if (delta) return delta
      return Number(b.updatedAt || 0) - Number(a.updatedAt || 0)
    })
    const start = (safePage - 1) * pageSize
    const pagedItems = sortedItems.slice(start, start + pageSize)
    const repairedPagedItems = await Promise.all(
      pagedItems.map((item) =>
        backfillMissingPosterArtifact(item, '[live-photo] poster artifact backfilled during library listing'),
      ),
    )
    return {
      items: repairedPagedItems.map(toLivePhotoItemSummary),
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

  async listPromptVersions() {
    return livePhotoPromptVersionService.list()
  },

  async createPromptVersion(input: { name: string; prompt: string }) {
    return livePhotoPromptVersionService.save(input)
  },

  async updatePromptVersion(input: { id: string; name: string; prompt: string }) {
    const updated = livePhotoPromptVersionService.save(input)
    if (updated.active) await syncLivePhotoPromptVersionToPendingItems(updated)
    return updated
  },

  async activatePromptVersion(input: { id: string }) {
    const active = livePhotoPromptVersionService.activate(String(input?.id || '').trim())
    await syncLivePhotoPromptVersionToPendingItems(active)
    return active
  },

  async rollbackPromptVersion(input: { id: string }) {
    const active = livePhotoPromptVersionService.rollback(String(input?.id || '').trim())
    await syncLivePhotoPromptVersionToPendingItems(active)
    return active
  },

  async getQualityMetrics() {
    const items = (await livePhotoRepo.list()).filter((item) => item.sourceType === 'reference_replace')
    const reports = items.map((item) => item.qualityReport).filter(Boolean) as LivePhotoQualityReport[]
    const passed = reports.filter((item) => item.decision === 'pass').length
    const fallback = reports.filter((item) => item.mode === 'remote_fallback').length
    const retries = items.reduce((sum, item) => sum + Math.max(0, Number(item.autoFlowStatus?.retryCount || 0)), 0)
    const cacheHits = items.filter((item) => item.cacheHit).length
    return {
      totalTasks: items.length,
      checkedTasks: reports.length,
      passedTasks: passed,
      passRate: reports.length ? passed / reports.length : 0,
      averageScore: reports.length ? reports.reduce((sum, item) => sum + Number(item.score || 0), 0) / reports.length : 0,
      retryCount: retries,
      fallbackCount: fallback,
      cacheHitCount: cacheHits,
      checkerVersion: LIVE_PHOTO_QUALITY_CHECKER_VERSION,
    }
  },

  async get(id: string) {
    const item = await livePhotoRepo.get(String(id || '').trim())
    if (!item) return null
    const repaired = await backfillMissingPosterArtifact(item, '[live-photo] poster artifact backfilled during item open')
    const hydrated = hydrateLivePhotoArtifactPaths(repaired)
    const credentials = await cloneRepo.getCredentials()
    return {
      ...hydrated,
      imagePromptPreview: resolveLivePhotoImagePreview(hydrated, credentials),
      videoPromptPreview: resolveLivePhotoVideoPreview(hydrated, credentials),
    }
  },

  async listReusableCompletedItemsByProduct(input: { productId: string; limit?: number }) {
    const productId = String(input.productId || '').trim()
    if (!productId) throw new Error('productId is required')
    const limit = Math.max(1, Math.min(50, Number(input.limit || 12) || 12))
    const items = await livePhotoRepo.list()
    return items
      .filter((item) => {
        if (String(item.productId || '').trim() !== productId) return false
        if (item.packagingStatus !== 'completed') return false
        if (item.usageStatus === 'used') return false
        const videoPath =
          String(item.livePhotoVideoPath || '').trim() ||
          String(item.previewVideoPath || '').trim() ||
          String(item.motionVideoPath || '').trim()
        return Boolean(videoPath)
      })
      .sort((a, b) => {
        const createdDelta = Number(b.createdAt || 0) - Number(a.createdAt || 0)
        if (createdDelta !== 0) return createdDelta
        return Number(b.updatedAt || 0) - Number(a.updatedAt || 0)
      })
      .slice(0, limit)
      .map((item) => hydrateLivePhotoArtifactPaths(item))
  },

  async markItemUsed(input: { id: string; channel?: string; userId?: string }) {
    const id = String(input.id || '').trim()
    if (!id) throw new Error('id is required')
    const existing = await livePhotoRepo.get(id)
    if (!existing) throw new Error('Live Photo item does not exist')
    return await livePhotoRepo.upsert({
      ...existing,
      usageStatus: 'used',
      usedAt: now(),
      usedChannel: String(input.channel || '').trim() || existing.usedChannel,
      usedUserId: String(input.userId || '').trim() || existing.usedUserId,
      updatedAt: now(),
    })
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
      const exportSourceVideoPath =
        getLivePhotoExportSourcePath(item) ||
        [
          String(item.cloneShotSnapshot?.videoPath || '').trim(),
          String(item.originalMotionVideoPath || '').trim(),
          String(item.motionVideoPath || '').trim(),
          String(item.livePhotoVideoPath || '').trim(),
        ].find((candidate) => candidate && existsSync(candidate)) ||
        ''
      if (item.packagingStatus !== 'completed' || !item.livePhotoImagePath || !exportSourceVideoPath) {
        skipped.push({ id, reason: 'Item is not export-ready' })
        continue
      }
      const baseName = safeName(
        [item.sourceProjectTitle, item.sourceShotLabel, item.productSnapshot?.name, item.id.slice(0, 8)].filter(Boolean).join('-'),
        item.id,
      )
      const fileBaseName = safeExportName(`${baseName}-${item.id.slice(0, 8)}`, item.id.slice(0, 8))
      const sourceExt = extname(exportSourceVideoPath) || '.mov'
      const videoPath = join(outputDir, `${fileBaseName}${sourceExt}`)
      await copyFile(exportSourceVideoPath, videoPath)
      exported.push({
        id: item.id,
        videoPath,
      })
      await livePhotoRepo.upsert({
        ...item,
        exportBundlePath: videoPath,
        logs: [
          ...(Array.isArray(item.logs) ? item.logs : []),
          buildLivePhotoLog(
            `[live-photo] export video copied: ${videoPath}`,
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

  async applySubtitleVideoToItem(input: {
    id: string
    subtitleVideoPath: string
    subtitleCoverImagePath?: string
  }) {
    const id = String(input.id || '').trim()
    if (!id) throw new Error('id is required')
    const existing = await livePhotoRepo.get(id)
    if (!existing) throw new Error('Live Photo item does not exist')
    const subtitleVideoPath = String(input.subtitleVideoPath || '').trim()
    if (!subtitleVideoPath) throw new Error('Subtitle video does not exist')
    if (!existsSync(subtitleVideoPath)) throw new Error('Subtitle video does not exist')
    const currentOutputPath = getLivePhotoSubtitleTargetPath(existing)
    if (!currentOutputPath) throw new Error('Current Live Photo item has no output video to replace')
    const currentCoverImagePath = String(existing.posterPath || '').trim() || undefined
    const previousOverlay = getLivePhotoSubtitleOverlay(existing)
    const originalOutputPath =
      previousOverlay?.active && previousOverlay.originalOutputPath
        ? String(previousOverlay.originalOutputPath || '').trim()
        : currentOutputPath
    const originalCoverImagePath =
      previousOverlay?.active && previousOverlay.originalCoverImagePath
        ? String(previousOverlay.originalCoverImagePath || '').trim() || undefined
        : currentCoverImagePath
    const subtitleCoverImagePath =
      String(input.subtitleCoverImagePath || '').trim() || (await ensureVideoCoverImage(subtitleVideoPath))
    const saved = await livePhotoRepo.upsert({
      ...existing,
      posterPath: subtitleCoverImagePath,
      subtitleOverlay: {
        active: true,
        originalOutputPath,
        originalCoverImagePath,
        subtitleOutputPath: subtitleVideoPath,
        subtitleCoverImagePath,
        appliedAt: now(),
      },
      updatedAt: now(),
    })
    return saved
  },

  async revertSubtitleVideoFromItem(input: { id: string }) {
    const id = String(input.id || '').trim()
    if (!id) throw new Error('id is required')
    const existing = await livePhotoRepo.get(id)
    if (!existing) throw new Error('Live Photo item does not exist')
    const overlay = getLivePhotoSubtitleOverlay(existing)
    if (!overlay?.active) throw new Error('Current Live Photo item has no subtitle version to revert')
    const subtitleVideoPath = String(overlay.subtitleOutputPath || '').trim()
    const subtitleCoverImagePath = String(overlay.subtitleCoverImagePath || '').trim()
    const originalCoverImagePath = String(overlay.originalCoverImagePath || '').trim()
    const saved = await livePhotoRepo.upsert({
      ...existing,
      posterPath: originalCoverImagePath || undefined,
      subtitleOverlay: undefined,
      exportBundlePath: undefined,
      updatedAt: now(),
    })
    if (subtitleVideoPath) {
      await rm(subtitleVideoPath, { force: true }).catch(() => undefined)
    }
    if (subtitleCoverImagePath && subtitleCoverImagePath !== originalCoverImagePath) {
      await rm(subtitleCoverImagePath, { force: true }).catch(() => undefined)
    }
    return saved
  },

  async generateSubtitleVideosForItems(input: {
    name: string
    sourceItems: Array<{
      id: string
      sourceType: 'upload' | 'clone_final'
      sourceVideoPath: string
      sourceProjectId?: string
      sourceProjectTitle?: string
      fileName: string
      coverImagePath?: string
    }>
    subtitleMode?: 'static_title' | 'timed_caption' | 'hybrid'
    subtitleSource?: 'whisper_compatible' | 'manual'
    exportEngine?: 'capcut_mate' | 'ass_fallback'
    titleRenderMode?: BatchSubtitleTitleRenderMode
    titleConfig?: {
      strategy?: 'single_for_all' | 'random_pool'
      singleText?: string
      titlePool?: string[]
    }
    titleItems?: Array<{ sourceItemId: string; text: string; updatedAt: number }>
    overlayImageConfig?: {
      canvasWidth?: number
      canvasHeight?: number
      fontName?: string
      fontSize?: number
      fontColor?: string
      strokeColor?: string
      strokeWidth?: number
      shadowColor?: string
      shadowBlur?: number
      position?: 'top' | 'center' | 'bottom'
      safeMargin?: number
      textAlign?: 'left' | 'center' | 'right'
      maxLines?: number
      maxWidthRatio?: number
      lineGap?: number
      bottomMargin?: number
    }
    captionStyle?: {
      fontName?: string
      fontSize?: number
      fontColor?: string
      strokeColor?: string
      strokeWidth?: number
      shadowColor?: string
      shadowBlur?: number
      position?: 'top' | 'center' | 'bottom'
      safeMargin?: number
      textAlign?: 'left' | 'center' | 'right'
      maxLines?: number
      maxWidthRatio?: number
      lineGap?: number
      bottomMargin?: number
    }
    layoutPolicy?: {
      maxLines?: number
      maxWidthRatio?: number
      reflowStrategy?: 'balanced' | 'punctuation'
      avoidPosition?: 'auto' | 'top' | 'bottom'
    }
  }) {
    const userId = LIVE_PHOTO_SUBTITLE_USER_ID
    const plugin = await webPlatformRepo.ensurePluginRecord(userId, 'video-batch-subtitle')
    if (plugin.status !== 'installed' || plugin.runtimeState !== 'enabled') {
      await webPlatformRepo.upsertPluginRecord({
        ...plugin,
        status: 'installed',
        runtimeState: 'enabled',
      })
    }
    const job = await createBatchSubtitleJob({
      userId,
      name: input.name,
      sourceItems: input.sourceItems,
      subtitleMode: input.subtitleMode,
      subtitleSource: input.subtitleSource,
      exportEngine: input.exportEngine,
      titleRenderMode: input.titleRenderMode,
      titleConfig: input.titleConfig,
      titleItems: input.titleItems,
      overlayImageConfig: input.overlayImageConfig,
      captionStyle: input.captionStyle,
      layoutPolicy: input.layoutPolicy,
    })
    return await runBatchSubtitleJob({ userId, jobId: job.id })
  },

  async retry(input: RetryLivePhotoItemInput) {
    const id = String(input.id || '').trim()
    if (!id) throw new Error('Please generate or assign a structured product reference before creating a Live Photo task.')
    const existing = await livePhotoRepo.get(id)
    if (!existing) throw new Error('Please generate or assign a structured product reference before creating a Live Photo task.')
    const activePromptVersion = livePhotoPromptVersionService.getActive()
    const promptChanged = Boolean(
      String(existing.promptHash || '').trim() &&
        String(existing.promptHash || '').trim() !== activePromptVersion.promptHash,
    )
    const preservedStillPath = String(existing.generatedStillPath || '').trim()
    const canRetryFromVideoStage = Boolean(
      !promptChanged &&
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
    const recoveredReferenceImagePath = resolveLivePhotoReferenceImagePath(existing)
    const refreshedImagePromptPreview =
      refreshedProductSnapshot && recoveredReferenceImagePath
        ? buildReferenceReplacementImagePromptPreview({
            product: refreshedProductSnapshot,
            referenceImagePath: recoveredReferenceImagePath,
            credentials,
            retryGuidance: buildLivePhotoRetryGuidance(existing, refreshedProductSnapshot),
            prompt: canRetryFromVideoStage ? existing.imagePromptPreview?.prompt : activePromptVersion.prompt,
          })
        : existing.imagePromptPreview
    const refreshedVideoPromptPreview =
      refreshedProductSnapshot && recoveredReferenceImagePath
        ? buildVideoRequestPreview({
            item: {
              ...existing,
              productSnapshot: refreshedProductSnapshot,
            },
            product: refreshedProductSnapshot,
            template: input.motionTemplate || (existing.sourceType === 'reference_replace' ? 'push_in' : 'ambient_sway'),
            startFramePath: existing.generatedStillPath || recoveredReferenceImagePath,
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
      exportBundlePath: undefined,
      packagingAssetIdentifier: undefined,
      packagingMetadataBridgePath: undefined,
      videoMetadataMode: undefined,
      imageMetadataMode: undefined,
      imagePromptPreview: refreshedImagePromptPreview,
      videoPromptPreview: refreshedVideoPromptPreview,
      promptVersionId: canRetryFromVideoStage ? existing.promptVersionId : activePromptVersion.id,
      promptVersion: canRetryFromVideoStage ? existing.promptVersion : activePromptVersion.version,
      promptHash: canRetryFromVideoStage ? existing.promptHash : activePromptVersion.promptHash,
      updatedAt: now(),
    }
    if (canRetryFromVideoStage) {
      processingItem.generatedStillPath = preservedStillPath
      processingItem.originalMotionVideoPath = undefined
      processingItem.motionVideoPath = undefined
      processingItem.imageTaskId = undefined
      processingItem.imageTaskProvider = undefined
      processingItem.imageTaskModel = undefined
      processingItem.imageTaskBaseUrl = undefined
      processingItem.imageTaskEndpointStyle = undefined
      processingItem.videoTaskId = undefined
      processingItem.videoTaskProvider = undefined
      processingItem.videoTaskModel = undefined
      processingItem.videoTaskBaseUrl = undefined
      processingItem.videoTaskEndpointStyle = undefined
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
        retryLimit: LIVE_PHOTO_DEFAULT_RETRY_LIMIT,
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
      processingItem.originalMotionVideoPath = undefined
      processingItem.motionVideoPath = undefined
      processingItem.imageTaskId = undefined
      processingItem.imageTaskProvider = undefined
      processingItem.imageTaskModel = undefined
      processingItem.imageTaskBaseUrl = undefined
      processingItem.imageTaskEndpointStyle = undefined
      processingItem.videoTaskId = undefined
      processingItem.videoTaskProvider = undefined
      processingItem.videoTaskModel = undefined
      processingItem.videoTaskBaseUrl = undefined
      processingItem.videoTaskEndpointStyle = undefined
      processingItem.qualityReport = undefined
      processingItem.cacheKey = undefined
      processingItem.cacheHit = false
      processingItem.workflow = buildDefaultWorkflow()
      processingItem.autoFlowStatus = {
        ...buildDefaultAutoFlowStatus(),
        enabled: true,
        status: 'idle',
        paused: false,
        retryCount: 0,
        retryLimit: LIVE_PHOTO_IMAGE_RETRY_LIMIT,
        currentStage: 'queued',
      }
      processingItem.logs = [
        ...(Array.isArray(existing.logs) ? existing.logs : []),
        buildLivePhotoLog('[live-photo] manual retry restarted from image_generation stage'),
      ].slice(-200)
    }
    if (existing.sourceType === 'reference_replace' && recoveredReferenceImagePath) {
      processingItem.referenceImagePath = recoveredReferenceImagePath
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
      await restoreCompletedMaterializedItem(item, '[live-photo] startup restored completed package from existing artifacts')
    }
    const refreshedItems = await livePhotoRepo.list()
    for (const item of refreshedItems) {
      await backfillMissingPosterArtifact(item, '[live-photo] startup backfilled missing poster artifact')
    }
    const repairedItems = await livePhotoRepo.list()
    for (const item of repairedItems) {
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
