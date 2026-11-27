import { copyFile, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import PQueue from 'p-queue'
import { runFfmpeg } from '../ffmpeg/runner'
import { onCloudEngine, replaceWithLink } from './linkFile'
import { getAppPaths } from '../../lib/paths'
import { productsRepo } from '../products/repo'
import { cloneRepo } from '../clone/repo'
import { buildStyleReferenceMotionPrompt, styleReferenceService } from '../style-reference/service'
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
import { createTiktokZoomedLastFrame } from '../tiktok-creative-studio/imageAspect'
import {
  canUsePasteReplace,
  defaultProductPlacement,
  ensureProductCutout,
  eraseRegionProduct,
  checkReferenceSuitability,
  integratePlacedProduct,
  PASTE_STILL_CANDIDATES,
  pasteUsableBoardViews,
  resolveCutoutPair,
  normalizeProductPlacement,
  pickProductViewByAngle,
  readImageSize,
  splitAnalysisBoard,
  renderPlacementGuide,
} from './pasteReplace'
import { CATALOG_VIDEO_PROVIDER, listAvailableCatalogVideoModels, pickCatalogVideoModel, queryCatalogVideoTask, submitCatalogVideoTask } from '../clone/catalogVideo'
import { extractJsonObjectText, extractModelMessageContent } from '../clone/aiResponse'
import { canUseMockGeneration } from '../clone/mockPolicy'
import { generateThumbnailJpg } from '../media/thumbnail'
import { createBatchSubtitleJob, runBatchSubtitleJob } from '../web-platform/batchSubtitle'
import { webPlatformRepo } from '../web-platform/repo'
import { productImageMaterialsService } from '../product-image-materials/service'
import { livePhotoRepo } from './repo'
import {
  DEFAULT_LIVE_PHOTO_REPLACEMENT_PROMPT,
  hashLivePhotoPrompt,
  fillLivePhotoVideoPrompt,
  isStillLivePhotoVideoPrompt,
  livePhotoPromptVersionService,
} from './promptVersions'
import { submitLivePhotoImageGeneration, type LivePhotoImageProviderAdapter } from './imageGenerationAdapter'
import { resolveLivePhotoPhaseStartedAt } from '../../../shared/livePhotoProgress'
import { resolveAuthoritativeProductReferencePath } from './productInput'
import { bindLivePhotoReplacementInputs, normalizeLivePhotoScenePaths } from './sceneInput'
import { buildLivePhotoReplacementPrompt } from './promptBuilder'
import { prepareLivePhotoProductReference, type LivePhotoProductReferenceVariant } from './productReference'
import {
  compositeLivePhotoReplacementCrop,
  normalizeAutoLocatedLivePhotoReplacementRegion,
  normalizeLivePhotoReplacementRegion,
  prepareLivePhotoPlacementReviewCrops,
  prepareLivePhotoReplacementCrop,
} from './replacementRegion'
import {
  buildLivePhotoSceneInteractionNegativeTerms,
  buildLivePhotoSceneInteractionPromptRules,
  normalizeLivePhotoSceneInteraction,
} from './sceneInteraction'
import {
  LIVE_PHOTO_DEFAULT_RETRY_LIMIT,
  LIVE_PHOTO_IMAGE_RETRY_LIMIT,
  resolveLivePhotoImageRetryFailure,
  resolveLivePhotoRetryLimit,
  resolveLivePhotoStage,
  resolveLivePhotoStageRetryCount,
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
  LivePhotoReplacementRegion,
  LivePhotoSceneInteraction,
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
  reviewLivePhotoReplacementPlacement: typeof reviewLivePhotoReplacementPlacement
  /** 下载重试间隔（测试里设短一点） */
  downloadRetryDelaysMs?: number[]
}

const LIVE_PHOTO_QUALITY_CHECKER_VERSION = 'disabled'

const LIVE_PHOTO_SUBTITLE_USER_ID = 'desktop-live-photo'
async function getConfiguredLivePhotoRetryLimit() {
  const settings = await livePhotoRepo.getSettings()
  const value = Number(settings.retryLimit)
  return Number.isFinite(value) ? Math.max(0, Math.min(20, Math.floor(value))) : LIVE_PHOTO_DEFAULT_RETRY_LIMIT
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
  reviewLivePhotoReplacementPlacement,
}

const LIVE_PHOTO_AUTO_FLOW_CONCURRENCY = 2
const LIVE_PHOTO_AUTO_FLOW_REQUEUE_COOLDOWN_MS = 8_000
const LIVE_PHOTO_REFERENCE_STILL_TIMEOUT_MS = 10 * 60 * 1000
/** 定位参考图里的商品（一次对话模型视觉调用）的超时 */
const LIVE_PHOTO_LOCATE_TIMEOUT_MS = 2 * 60 * 1000
const LIVE_PHOTO_REFERENCE_PACKAGING_TIMEOUT_MS = 90 * 1000
const LIVE_PHOTO_IMAGE_REMOTE_RETRY_MS = 1_000
const LIVE_PHOTO_VIDEO_REMOTE_RETRY_MS = 5_000
const LIVE_PHOTO_VISUAL_REVIEW_REQUIRED_CHECKS = [
  'product_identity',
  'source_contamination',
  'material_color',
  'attachment_structure',
  'scale',
  'scene_interaction',
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
  return normalizeLivePhotoFailureReason(reason, stage)
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

/**
 * 把各种报错归一成带标签的原因。只有真的拿到远端任务号时才算「已提交远端、等待结果」（[remote_pending]，不计重试次数）；
 * 没有任务号的超时 / 网络错误 / 服务繁忙都是普通的可重试失败，会计入重试次数，到上限就停，
 * 不能再标成「已提交远端」无限循环（以前定位商品的对话调用失败也会这样，每轮都重新扣一次对话模型的钱）。
 */
function normalizeLivePhotoFailureReason(reason: string, stage?: LivePhotoWorkflowStep) {
  const text = String(reason || '').trim()
  const lower = text.toLowerCase()
  if (text.includes('[remote_pending]')) {
    const remoteTaskId = extractTaskIdFromText(text)
    const label = stage === 'video_generation' ? '视频任务已提交，正在等待远端结果。' : '图片任务已提交，正在等待远端结果。'
    return remoteTaskId ? `[remote_pending] ${label}taskId=${remoteTaskId}` : `[remote_pending] ${label}`
  }
  if (text.includes('[locate_failed]') || text.includes('[replacement_region_required]') || text.includes('[reference_unsuitable]')) return text
  const imageStage = stage === 'image_generation' || stage === 'image_validation'
  if (stage === 'image_validation' && isRetryableLivePhotoReviewLoadError(text)) {
    return '[remote_pending] Image validation review service is overloaded and may still recover automatically.'
  }
  const timeoutLike =
    lower.includes('timed out after') ||
    lower.includes('timeout') ||
    lower.includes('gateway timeout')
  if (imageStage && timeoutLike) {
    // 有图片任务号时 normalizeRemotePendingTimeoutReason 会把它升级成 [remote_pending] 继续查结果
    return '[retryable_timeout] Image generation timed out while waiting. The remote task may still be processing.'
  }
  if (imageStage && (isTransientLivePhotoRemoteError(text) || isRetryableLivePhotoReviewLoadError(text))) {
    return `[retryable_remote] Remote image service is temporarily unavailable. ${text.slice(0, 200)}`.trim()
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

function isTransientLivePhotoRemoteError(input: unknown) {
  const text = String(input || '').toLowerCase()
  return (
    text.includes('fetch failed') ||
    text.includes('network error') ||
    text.includes('network request failed') ||
    text.includes('socket hang up') ||
    text.includes('socket closed') ||
    text.includes('econnreset') ||
    text.includes('econnrefused') ||
    text.includes('enotfound') ||
    text.includes('etimedout') ||
    text.includes('connection reset') ||
    text.includes('connection refused')
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

async function locateLivePhotoReplacementRegion(input: {
  item: LivePhotoItem
  product: LivePhotoProductSnapshot
  scenePath: string
}): Promise<{ region: LivePhotoReplacementRegion; sceneInteraction: LivePhotoSceneInteraction; modelCall?: LivePhotoModelCall }> {
  const existing = normalizeLivePhotoReplacementRegion(input.item.replacementRegion)
  const existingInteraction = normalizeLivePhotoSceneInteraction(input.item.sceneInteraction)
  if (existing && existingInteraction) return { region: existing, sceneInteraction: existingInteraction }
  const credentials = await cloneRepo.getCredentials()
  if (livePhotoDeps.generateGptShotFrameImage !== generateGptShotFrameImage) {
    const region = existing || {
      x: 0.25,
      y: 0.25,
      width: 0.5,
      height: 0.5,
      source: 'auto',
      confidence: 1,
      revision: 1,
      updatedAt: now(),
    }
    return {
      region,
      sceneInteraction: existingInteraction || {
        mode: 'unknown',
        confidence: 0,
        revision: region.revision,
        updatedAt: now(),
      },
    }
  }
  const key = String(credentials.grsaiApiKey || '').trim()
  if (!key) {
    if (existing) {
      return {
        region: existing,
        sceneInteraction: {
          mode: 'unknown',
          confidence: 0,
          revision: existing.revision,
          updatedAt: now(),
        },
      }
    }
    if (canUseMockGeneration(credentials)) {
      return {
        region: {
          x: 0.25,
          y: 0.25,
          width: 0.5,
          height: 0.5,
          source: 'auto',
          confidence: 0,
          revision: 1,
          updatedAt: now(),
        },
        sceneInteraction: {
          mode: 'unknown',
          confidence: 0,
          revision: 1,
          updatedAt: now(),
        },
      }
    }
    throw new Error('[replacement_region_required] Automatic product localization is unavailable. Select the replacement region manually.')
  }
  // 同一张参考图（同一文件、同一商品类目）只定位一次：多个任务共用一张参考图、自动重试，都不再重复调用对话模型
  const locateCacheKey = await buildLivePhotoLocateCacheKey(input.scenePath, String(input.product.type || '').trim())
  const cachedLocate = locateCacheKey ? await readLivePhotoLocateCache(locateCacheKey) : null
  if (cachedLocate) {
    const region = existing || normalizeAutoLocatedLivePhotoReplacementRegion(cachedLocate, now())
    if (region) {
      const sceneInteraction = normalizeLivePhotoSceneInteraction(cachedLocate.interaction, { revision: region.revision, updatedAt: now() }) || {
        mode: 'unknown' as const,
        confidence: 0,
        revision: region.revision,
        updatedAt: now(),
      }
      return { region, sceneInteraction, modelCall: { step: 'locate_product', provider: 'grsai', model: cachedLocate.model, endpoint: '/v1/chat/completions', cached: true } }
    }
  }
  const host = String(credentials.grsaiHost || 'https://grsaiapi.com').trim().replace(/\/+$/, '') || 'https://grsaiapi.com'
  const model = String(credentials.grsaiAnalysisModel || 'gemini-3.1-pro').trim() || 'gemini-3.1-pro'
  const analysis = normalizeLivePhotoProductAnalysis(input.product.productAnalysis)
  const content = [
    {
      type: 'text',
      text: [
        'Locate the existing product that must be replaced in the supplied scene image.',
        'Return JSON only with this exact shape:',
        '{"x":0,"y":0,"width":0,"height":0,"confidence":0,"interaction":{"mode":"held","confidence":0,"support":"","occlusion":""}}',
        'All coordinates must be normalized to the full image range from 0 to 1.',
        'The rectangle must tightly include the complete visible product and its contact point.',
        ...locateFullSpanRules(input.product.type),
        'Do not include unrelated hands, face, body, clothing, or background unless required to include the product contact point.',
        'Classify interaction.mode as exactly one of: worn, held, placed, hanging, attached, none, unknown.',
        'Use held when fingers or a hand pinch, grip, support, or present the product without wearing it.',
        'Use worn only when the product is actually attached around or through a body part in its normal wearing position.',
        'Describe the physical support and which parts occlude each other.',
        `Product category: ${String(input.product.type || analysis?.category || 'general').trim()}.`,
        analysis?.wearingPosition ? `Expected wearing position: ${analysis.wearingPosition}.` : '',
      ].filter(Boolean).join('\n'),
    },
    { type: 'image_url', image_url: { url: await imageDataUrl(input.scenePath) } },
  ]
  let response: Response
  let text = ''
  try {
    response = await fetch(`${host}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        stream: false,
        temperature: 0,
        messages: [
          { role: 'system', content: 'You are a precise JSON-only product localization system.' },
          { role: 'user', content },
        ],
      }),
      signal: AbortSignal.timeout(LIVE_PHOTO_LOCATE_TIMEOUT_MS),
    })
    text = await response.text()
  } catch (error) {
    // 网络错误 / 超时：普通可重试失败（计入重试次数），不是「已提交远端」
    const reason = String((error as Error)?.message || error || '').trim()
    throw new Error(`[locate_failed] Product localization request failed: model=${model} ${reason}`.trim())
  }
  if (!response.ok) {
    if (isRetryableLivePhotoReviewLoadError(text) || response.status >= 500) {
      throw new Error(`[locate_failed] Product localization service is temporarily unavailable: model=${model} HTTP ${response.status}`)
    }
    throw new Error(`[replacement_region_required] Automatic product localization failed: HTTP ${response.status}`)
  }
  let parsed: (Partial<LivePhotoReplacementRegion> & { interaction?: Partial<LivePhotoSceneInteraction> }) | null = null
  try {
    parsed = JSON.parse(extractJsonObjectText(extractModelMessageContent(text)))
  } catch {
    throw new Error('[replacement_region_required] Automatic product localization returned invalid coordinates. Select the replacement region manually.')
  }
  const region = existing || normalizeAutoLocatedLivePhotoReplacementRegion(parsed, now())
  if (!region) {
    throw new Error('[replacement_region_required] Automatic product localization is invalid or below confidence 0.75. Select the replacement region manually.')
  }
  const sceneInteraction = normalizeLivePhotoSceneInteraction(parsed?.interaction, {
    revision: region.revision,
    updatedAt: now(),
  }) || {
    mode: 'unknown',
    confidence: 0,
    revision: region.revision,
    updatedAt: now(),
  }
  if (locateCacheKey && parsed) await writeLivePhotoLocateCache(locateCacheKey, { ...parsed, model })
  return { region, sceneInteraction, modelCall: { step: 'locate_product', provider: 'grsai', model, endpoint: '/v1/chat/completions', cached: false } }
}

type LivePhotoLocateCacheEntry = Partial<LivePhotoReplacementRegion> & { interaction?: Partial<LivePhotoSceneInteraction>; model?: string }

export type LivePhotoModelCall = { step: string; provider: string; model?: string; endpoint: string; cached: boolean }

function livePhotoLocateCachePath() {
  return join(getAppPaths().cacheDir, 'live-photo-locate.json')
}

/**
 * 项链、手链这类「一整条」的商品：框要包住看得见的整条链子，不能只框吊坠。
 * 否则擦除只擦掉吊坠，旧链子留在脖子上，换上去会出现两条链（2026-11-27 实测）。
 */
function locateFullSpanRules(productType?: string) {
  const type = String(productType || '').toLowerCase()
  if (/neck|pendant|chain|choker|项链|吊坠|锁骨/.test(type)) {
    return ['This is a necklace: the rectangle must include the WHOLE visible necklace — the pendant AND the entire visible chain on both sides of the neck up to where it leaves the frame or goes behind the neck — not only the pendant.']
  }
  if (/brace|bangle|anklet|手链|手镯|脚链/.test(type)) {
    return ['This is a bracelet: the rectangle must include the whole visible bracelet around the wrist, not only one charm.']
  }
  return []
}

async function buildLivePhotoLocateCacheKey(scenePath: string, productType: string) {
  try {
    const info = await stat(scenePath)
    // v2：项链 / 手链框整条链子（规则变了，旧缓存的框只框了吊坠）
    return createHash('sha1').update([scenePath, info.size, info.mtimeMs, productType, 'v2'].join('|')).digest('hex')
  } catch {
    return ''
  }
}

async function readLivePhotoLocateCacheFile(): Promise<Record<string, LivePhotoLocateCacheEntry>> {
  try {
    const parsed = JSON.parse(await readFile(livePhotoLocateCachePath(), 'utf-8'))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

async function readLivePhotoLocateCache(key: string) {
  const entry = (await readLivePhotoLocateCacheFile())[key]
  return entry && typeof entry === 'object' ? entry : null
}

async function writeLivePhotoLocateCache(key: string, entry: LivePhotoLocateCacheEntry) {
  try {
    const all = await readLivePhotoLocateCacheFile()
    all[key] = entry
    const keys = Object.keys(all)
    // 只留最近 500 张参考图
    for (const stale of keys.slice(0, Math.max(0, keys.length - 500))) delete all[stale]
    await ensureDir(getAppPaths().cacheDir)
    await writeFile(livePhotoLocateCachePath(), JSON.stringify(all), 'utf-8')
  } catch (error) {
    console.warn('[live-photo] locate cache write failed', (error as Error)?.message || error)
  }
}

/** 记录一次模型调用（界面「技术详情 → 模型调用」读这一行），格式固定，别随便改 */
function buildLivePhotoModelCallLog(call: LivePhotoModelCall) {
  return buildLivePhotoLog(
    `[live-photo] model call: step=${call.step} provider=${call.provider} model=${call.model || '--'} endpoint=${call.endpoint}${call.cached ? ' cached=1' : ''}`,
  )
}

function livePhotoImageEndpoint(provider: string) {
  if (provider === 'grsai') return '/v1/draw/completions'
  if (provider === 'apifox_hub') return '/v1/images/edits'
  if (provider === 'openai') return '/v1/images/edits'
  return provider
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
  // 复刻分镜：视频就是复刻里的原片，导出原片；livePhotoVideoPath 是重新编码、补了黑边的版本
  if (item.sourceType === 'clone_shot') {
    const original = [String(item.cloneShotSnapshot?.videoPath || '').trim(), String(item.originalMotionVideoPath || '').trim()].find(
      (candidate) => candidate && existsSync(candidate),
    )
    if (original) return original
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
    videoPromptSent: _videoPromptSent,
    ...summary
  } = hydrated
  return {
    ...summary,
    subtitleOverlayActive: Boolean(overlay?.active),
    subtitleOriginalOutputPath: String(overlay?.originalOutputPath || '').trim() || '',
    subtitleOutputPath: String(overlay?.subtitleOutputPath || '').trim() || '',
    subtitleCoverImagePath: String(overlay?.subtitleCoverImagePath || '').trim() || undefined,
    subtitleAppliedAt: Number(overlay?.appliedAt || 0) || undefined,
    stageStartedAt: resolveLivePhotoPhaseStartedAt(hydrated),
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

/** 下载失败属于临时问题（网关超时、限流、断网），远端结果还在，可以稍后再下 */
export class TransientDownloadError extends Error {
  readonly transient = true
}

function isTransientDownloadStatus(status: number) {
  return status === 408 || status === 425 || status === 429 || status >= 500
}

/**
 * 下载远端结果到本地。平台的文件服务器偶尔返回 502/504 或断流（2026-11-26 小扳手 CDN 504 导致成片被判失败），
 * 所以临时错误重试几次；仍失败抛 TransientDownloadError，调用方应当「稍后再下」而不是判任务失败。
 */
async function downloadUrlToFile(input: { url: string; filePath: string }) {
  const delays = livePhotoDeps.downloadRetryDelaysMs ?? [2000, 6000, 15000]
  let lastError: unknown
  for (let attempt = 0; attempt <= delays.length; attempt += 1) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, delays[attempt - 1]))
    try {
      const res = await fetch(input.url, { signal: AbortSignal.timeout(180_000) })
      if (!res.ok) {
        const message = `Download failed HTTP ${res.status}: ${input.url}`
        if (!isTransientDownloadStatus(res.status)) throw new Error(message)
        lastError = new TransientDownloadError(message)
        continue
      }
      const buffer = Buffer.from(await res.arrayBuffer())
      if (!buffer.length) {
        lastError = new TransientDownloadError(`Download returned empty body: ${input.url}`)
        continue
      }
      await writeFile(input.filePath, buffer)
      return input.filePath
    } catch (error) {
      if (error instanceof Error && !(error instanceof TransientDownloadError) && /^Download failed HTTP/.test(error.message)) throw error
      lastError = error instanceof TransientDownloadError ? error : new TransientDownloadError(`Download interrupted: ${String((error as Error)?.message || error)} ${input.url}`)
    }
  }
  throw lastError
}

/** 远端已出结果但下载暂时失败：当作「还在等」，下次轮询再下，不计入生成失败 */
function isTransientDownloadFailure(error: unknown) {
  if (error instanceof TransientDownloadError) return true
  const message = String((error as Error)?.message || error || '')
  return /Download failed HTTP (408|425|429|5\d\d)\b|Download interrupted|fetch failed|ECONNRESET|ETIMEDOUT|socket hang up/i.test(message)
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
  const hasGeneratedArtifact = Boolean(
    String(hydrated.livePhotoVideoPath || '').trim() ||
      String(hydrated.previewVideoPath || '').trim() ||
      String(hydrated.motionVideoPath || '').trim() ||
      String(hydrated.livePhotoImagePath || '').trim() ||
      String(hydrated.generatedStillPath || '').trim(),
  )
  if (!hasGeneratedArtifact) return item
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
    imageRetryCount: 0,
    videoRetryCount: 0,
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
    imageRetryMode: current.imageRetryMode === 'manual_once' ? 'manual_once' : 'auto',
    retryLimit: Math.max(0, Math.min(20, Math.floor(Number(current.retryLimit ?? LIVE_PHOTO_DEFAULT_RETRY_LIMIT) || 0))),
    retryCount: Math.max(0, Number(current.retryCount ?? 0) || 0),
    imageRetryCount: Math.max(0, Number(current.imageRetryCount ?? current.retryCount ?? 0) || 0),
    videoRetryCount: Math.max(0, Number(current.videoRetryCount ?? 0) || 0),
    failedStage: current.failedStage === 'video' ? 'video' : current.failedStage === 'image' ? 'image' : undefined,
    retryScope: current.retryScope === 'video' ? 'video' : current.retryScope === 'image' ? 'image' : undefined,
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

/** 允许镜头和画面微动时用：只守住商品和画面，不禁止推近 */
const MOVING_LIVE_PHOTO_NEGATIVE_PROMPT = [
  'product reconstruction',
  'product redesign',
  'wrong product identity',
  'different product',
  'product morphing',
  'product warping',
  'wrong product scale',
  'scale drift',
  'extra product parts',
  'extra hands',
  'extra fingers',
  'distorted hands',
  'scene change',
  'hard cut',
  'camera jitter',
  'flicker',
  'text',
  'watermark',
  'logo',
].join(', ')

/**
 * 同款模板: copy the reference clip's camera work and look instead of the default
 * near-static hold. The default negative list bans push-ins, orbits and handheld
 * movement, so this branch uses its own lean list that only guards the product.
 */
function buildStyleReferenceLivePhotoVideoPrompts(input: { item: LivePhotoItem; styleReference: NonNullable<LivePhotoItem['styleReference']> }) {
  const categorySpecificRules = input.item.productSnapshot
    ? buildLivePhotoCategorySpecificPromptRules(input.item.productSnapshot, 'video')
    : []
  const positivePrompt = [
    buildStyleReferenceMotionPrompt({ ...input.styleReference, durationSec: 6, hasLastFrame: false }),
    ...(categorySpecificRules.length ? ['', ...categorySpecificRules] : []),
  ].join('\n')
  const negativePrompt = MOVING_LIVE_PHOTO_NEGATIVE_PROMPT
  return { positivePrompt, negativePrompt }
}

function buildLivePhotoVideoPrompts(input: {
  shot: ShotSpec
  item: LivePhotoItem
}) {
  if (input.item.styleReference) return buildStyleReferenceLivePhotoVideoPrompts({ item: input.item, styleReference: input.item.styleReference })
  const normalizedAnalysis = normalizeLivePhotoProductAnalysis(input.item.productSnapshot?.productAnalysis)
  const categorySpecificRules = input.item.productSnapshot
    ? buildLivePhotoCategorySpecificPromptRules(input.item.productSnapshot, 'video')
    : []
  // 商品特征（分类规则 + 商品分析）只填进「视频」提示词里写了 {product_rules} 的位置；没写就不加。
  // 提示词版本原样发送，前面不再拼任何系统文字（以前会加一段 PROVIDER INPUT ROLE LOCK 和本机图片路径）
  const productRules = [
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
  ].join('\n').trim()
  const template = livePhotoPromptVersionService.getActive('video').prompt
  const positivePrompt = fillLivePhotoVideoPrompt(template, productRules)
  if (!isStillLivePhotoVideoPrompt(template)) return { positivePrompt, negativePrompt: MOVING_LIVE_PHOTO_NEGATIVE_PROMPT, moving: true }
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
  const prompts: { positivePrompt: string; negativePrompt: string; moving?: boolean } = buildLivePhotoVideoPrompts({ shot, item: input.item })
  const { positivePrompt, negativePrompt } = prompts
  // 镜头描述默认写死「锁定不动」，用别的提示词时跟着提示词走
  const camera = prompts.moving ? 'Follow the camera movement described in the prompt; keep the product unchanged.' : shot.cameraMovement
  return {
    ...shot,
    ...(prompts.moving ? { cameraDescription: camera, cameraMovement: camera, action: camera, actionDescription: camera, generationPrompt: positivePrompt } : {}),
    promptHint: positivePrompt,
    negativePromptHint: negativePrompt,
    aiPrompt: positivePrompt,
    negativePrompt,
    compiledPrompt: positivePrompt,
    compiledNegativePrompt: negativePrompt,
    prompt: {
      positive: positivePrompt,
      negative: negativePrompt,
      cameraMotion: camera || '',
      aspectRatio: '9:16',
    },
  }
}

/** 记下这一次真正提交给视频模型的提示词和版本，任务详情显示它（不是按当前版本重新拼一份） */
async function recordLivePhotoVideoPromptSent(input: { item: LivePhotoItem; shot: ShotSpec; stillPath: string; provider?: string; model?: string }) {
  try {
    const latest = await livePhotoRepo.get(input.item.id)
    if (!latest) return
    const version = input.item.styleReference ? undefined : livePhotoPromptVersionService.getActive('video')
    await livePhotoRepo.upsert({
      ...latest,
      videoPromptSent: {
        provider: String(input.provider || '').trim() || undefined,
        model: String(input.model || '').trim() || undefined,
        prompt: input.shot.prompt?.positive || input.shot.compiledPrompt || '',
        negativePrompt: input.shot.prompt?.negative || input.shot.compiledNegativePrompt || '',
        referenceImagePaths: [input.stillPath].filter(Boolean),
        promptVersion: version?.version,
        promptVersionName: input.item.styleReference ? `同款模板: ${input.item.styleReference.videoName || ''}`.trim() : version?.name,
        sentAt: now(),
      },
    })
  } catch (error) {
    console.warn('[live-photo] record sent video prompt failed', (error as Error)?.message || error)
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
  await recordLivePhotoVideoPromptSent({
    item: input.item,
    shot,
    stillPath: input.stillPath,
    provider: livePhotoVideoProviderChain(credentials)[0],
    model: String(credentials.videoModelPrimary || credentials.videoModelFallback || credentials.grsaiVideoModel || '').trim() || undefined,
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

/**
 * 任务用哪个图生视频模型：选了就校验（被后台关掉 / 平台没 Key 会直接报错），
 * 没选就用后台默认模型；都没有 = 沿用设置里的视频接口（旧逻辑）。
 */
function resolveLivePhotoVideoChoice(
  credentials: ModelCredentials,
  input: { videoModelId?: string; videoDurationSec?: number; videoResolution?: string; videoZoomPercent?: number },
) {
  const requested = String(input.videoModelId || '').trim()
  const spec = requested
    ? pickCatalogVideoModel(credentials, requested)
    : credentials.videoDefaultModelId
      ? pickCatalogVideoModelSafe(credentials, credentials.videoDefaultModelId)
      : undefined
  const duration = Number(input.videoDurationSec)
  const resolution = String(input.videoResolution || '').trim()
  return {
    videoModelId: spec?.id,
    videoDurationSec: spec && Number.isFinite(duration) && duration > 0 ? Math.round(duration) : undefined,
    videoResolution: spec && spec.resolutions.includes(resolution) ? resolution : undefined,
    videoZoomPercent: spec?.lastFrame ? normalizeLivePhotoZoomPercent(input.videoZoomPercent) : undefined,
  }
}

/** 尾帧放大比例：0（只传首帧）或 10–80；没传按 tk创意室默认 20 */
const LIVE_PHOTO_ZOOM_OPTIONS = [0, 10, 20, 30, 40, 50, 60, 70, 80]
function normalizeLivePhotoZoomPercent(value: unknown) {
  if (value === undefined || value === null || value === '') return 20
  const numeric = Number(value)
  return LIVE_PHOTO_ZOOM_OPTIONS.includes(numeric) ? numeric : 20
}

/**
 * 图生视频的尾帧（参考 tk创意室）：
 * - 用了同款模板：把模板结尾帧换上商品，模型在两张真实画面之间过渡；换失败就退回放大首帧；
 * - 没用模板：把首帧放大 videoZoomPercent% 当尾帧，做出镜头推近；0 = 只传首帧。
 */
async function resolveLivePhotoClosingFrame(input: { item: LivePhotoItem; stillPath: string }): Promise<string | undefined> {
  const cached = String(input.item.videoLastFramePath || '').trim()
  if (cached && existsSync(cached)) return cached
  const zoomPercent = normalizeLivePhotoZoomPercent(input.item.videoZoomPercent)
  const outputDir = join(livePhotoRoot(input.item.id), 'last-frame')
  let closingPath = ''
  const template = input.item.styleReference?.id ? await styleReferenceService.get(input.item.styleReference.id).catch(() => undefined) : undefined
  const templateClosing = String((template as { lastFramePath?: string } | undefined)?.lastFramePath || '').trim()
  if (templateClosing && existsSync(templateClosing) && input.item.productId) {
    try {
      const settings = await livePhotoRepo.getSettings()
      let state: ExternalReferenceImagePreparationState | undefined
      const deadline = Date.now() + 15 * 60 * 1000
      while (Date.now() < deadline) {
        const prepared = await prepareReferenceImageForExternalWorkflow({
          workflowId: `${input.item.id}-last`,
          referenceImagePath: templateClosing,
          productId: input.item.productId,
          outputRoot: outputDir,
          state,
          promptVersion: livePhotoPromptVersionService.getActive('image'),
          qualityCheckerEnabled: settings.qualityCheckerEnabled,
        })
        state = prepared.state
        if (prepared.failed) throw new Error(prepared.error || '模板结尾帧换商品失败')
        if (!prepared.pending && prepared.preparedImagePath) {
          closingPath = prepared.preparedImagePath
          break
        }
        await new Promise((resolve) => setTimeout(resolve, 10_000))
      }
      if (!closingPath) throw new Error('模板结尾帧换商品超时')
    } catch (error: any) {
      const latest = await livePhotoRepo.get(input.item.id)
      if (latest) await livePhotoRepo.upsert(appendLivePhotoLogs(latest, [buildLivePhotoLog(`模板结尾帧换商品失败，改用放大首帧当尾帧：${String(error?.message || error)}`, 'error')]))
    }
  }
  if (!closingPath) {
    // 模板换失败时也要有尾帧：选了「只传首帧」就按默认 20% 推近
    const zoom = templateClosing ? zoomPercent || 20 : zoomPercent
    if (!zoom) return undefined
    closingPath = (await createTiktokZoomedLastFrame(input.stillPath, outputDir, zoom)).path
  }
  // 调用方之后会拿手里这个任务对象整体保存，所以对象本身也要带上，不然会被覆盖
  input.item.videoLastFramePath = closingPath
  const latest = await livePhotoRepo.get(input.item.id)
  if (latest) await livePhotoRepo.upsert({ ...latest, videoLastFramePath: closingPath, updatedAt: now() })
  return closingPath
}

function pickCatalogVideoModelSafe(credentials: ModelCredentials, id: string) {
  try {
    return pickCatalogVideoModel(credentials, id)
  } catch {
    return undefined
  }
}

async function pollLivePhotoVideoTask(input: {
  item: LivePhotoItem
  credentials: ModelCredentials
  outputDir: string
}) {
  const taskId = String(input.item.videoTaskId || '').trim()
  if (!taskId) throw new Error('Please generate or assign a structured product reference before creating a Live Photo task.')
  if (String(input.item.videoTaskProvider || '').trim() === CATALOG_VIDEO_PROVIDER) {
    const snapshot = await queryCatalogVideoTask({ credentials: input.credentials, modelId: String(input.item.videoTaskModel || ''), taskId })
    if (snapshot.status === 'failed') throw new Error(snapshot.error || `视频任务失败：${taskId}`)
    if (snapshot.status !== 'succeeded' || !snapshot.url) return { synced: false as const, outputPath: undefined, raw: snapshot }
    await ensureDir(input.outputDir)
    const outputPath = join(input.outputDir, `live_photo_${Date.now()}_${randomUUID()}.mp4`)
    try {
      await downloadUrlToFile({ url: snapshot.url, filePath: outputPath })
    } catch (error) {
      if (isTransientDownloadFailure(error)) return { synced: false as const, outputPath: undefined, raw: { ...snapshot, downloadPending: String((error as Error)?.message || error) } }
      throw error
    }
    return { synced: true as const, outputPath, raw: snapshot }
  }
  if (String(input.item.videoTaskProvider || '').trim() === 'grsai') {
    const snapshot = await queryGrsTask(input.credentials, taskId)
    if (snapshot.status === 'failed' || snapshot.status === 'error' || snapshot.status === 'cancelled' || snapshot.status === 'canceled') {
      throw new Error(snapshot.errorMessage || `GRS.AI video task failed: ${taskId}`)
    }
    if (!snapshot.outputUrl) return { synced: false as const, outputPath: undefined, raw: snapshot.raw }
    await ensureDir(input.outputDir)
    const outputPath = join(input.outputDir, `live_photo_${Date.now()}_${randomUUID()}.mp4`)
    try {
      await downloadUrlToFile({ url: snapshot.outputUrl, filePath: outputPath })
    } catch (error) {
      if (isTransientDownloadFailure(error)) return { synced: false as const, outputPath: undefined, raw: snapshot.raw }
      throw error
    }
    return { synced: true as const, outputPath, raw: snapshot.raw }
  }
  try {
    return await syncRemoteTaskResult({
      credentials: input.credentials,
      taskId,
      outDir: input.outputDir,
      provider: input.item.videoTaskProvider,
      baseUrl: input.item.videoTaskBaseUrl,
      endpointStyle: input.item.videoTaskEndpointStyle,
      model: input.item.videoTaskModel,
    })
  } catch (error) {
    if (isTransientDownloadFailure(error)) return { synced: false as const, outputPath: undefined, raw: { downloadPending: String((error as Error)?.message || error) } }
    throw error
  }
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
  const coverImagePath = authoritativeProductReferencePath || imagePaths[0] || undefined
  return {
    id: product.id,
    name: product.name,
    type: product.type,
    coverImagePath,
    authoritativeProductReferencePath,
    imagePaths: [authoritativeProductReferencePath],
    // 不再带商品分析：图生视频不用它
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

/**
 * 商品分析不再用在图生视频的任何提示词里（2026-11-26 用户要求）。
 * 所有提示词都经这里读分析，统一返回「没有分析」；旧任务快照里存着的分析也不会再写进提示词。
 */
function normalizeLivePhotoProductAnalysis(_input: LivePhotoProductSnapshot['productAnalysis']): LivePhotoProductSnapshot['productAnalysis'] | undefined {
  return undefined
}

function isEarringLikeLivePhotoProduct(product: Pick<LivePhotoProductSnapshot, 'type' | 'productAnalysis'>) {
  const normalizedType = String(product.type || '').trim().toLowerCase()
  return normalizedType === 'earring' || normalizedType === 'earrings'
}

function isRingLikeLivePhotoProduct(product: Pick<LivePhotoProductSnapshot, 'type' | 'productAnalysis'>) {
  const normalizedType = String(product.type || '').trim().toLowerCase()
  return normalizedType === 'ring' || normalizedType === 'rings'
}

/** 是否佩戴类商品：只看商品类型（不再参考商品分析） */
function isWearableLikeLivePhotoProduct(product: Pick<LivePhotoProductSnapshot, 'type' | 'productAnalysis'>) {
  const normalizedType = String(product.type || '').trim().toLowerCase()
  return ['earring', 'earrings', 'ring', 'rings', 'necklace', 'bracelet', 'anklet', 'jewelry', 'watch', 'hair_accessory'].includes(normalizedType)
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
  const isRing = isRingLikeLivePhotoProduct(input.product)
  const isWearableContext = isWearableLikeLivePhotoProduct(input.product)
  if ((isEarring || isRing || isWearableContext) && retryCount <= 0) {
    return 'erase_first'
  }
  if (
    (retryCount >= 1 || failureSignals.includes('validation_category:')) &&
    (isEarring || isRing) &&
    (
      failureSignals.includes('original_product_retained') ||
      failureSignals.includes('original product') ||
      failureSignals.includes('preserves the original') ||
      failureSignals.includes('leftover original') ||
      failureSignals.includes('source_contamination') ||
      failureSignals.includes('attachment_drift') ||
      failureSignals.includes('missing_structure') ||
      failureSignals.includes('product_structure_consistency') ||
      failureSignals.includes('oversized_product') ||
      failureSignals.includes('appears enlarged') ||
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
  const isWearableContext = isWearableLikeLivePhotoProduct(product)
  if (strategy === 'anchor_closeup' && (isEarringLikeLivePhotoProduct(product) || isRingLikeLivePhotoProduct(product) || isWearableContext)) {
    return {
      normalizeOutput: 'preserve',
      outputSize: '1024x1024',
      providerScope: 'live_photo_replace',
    }
  }
  return {
    normalizeOutput: 'preserve',
    outputSize: '1024x1024',
    providerScope: 'live_photo_replace',
  }
}

function shouldAttemptInlineReplacementEscalation(input: {
  strategy: LivePhotoReplacementStrategy
  product: LivePhotoProductSnapshot
  validationCategories: string[]
}) {
  if (input.strategy === 'anchor_closeup') return false
  if (!isEarringLikeLivePhotoProduct(input.product) && !isRingLikeLivePhotoProduct(input.product)) return false
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

type LivePhotoPlacementReview = {
  skipped: boolean
  placement: 'pass' | 'fail'
  scale: 'pass' | 'too_large' | 'too_small'
  reason: string
}

/**
 * 替换图的位置和大小检查（一次对话模型视觉调用）。
 * 原图（画了框）和结果图按同一块区域裁出来给 AI 对比：框只代表「放在哪」，
 * 商品大小按商品真实比例对照耳朵、手指等参照物判断，不按框的大小。
 * 没 Key、请求失败、解析失败都算跳过，不挡流程。
 */
export async function reviewLivePhotoReplacementPlacement(input: {
  item: LivePhotoItem
  product: LivePhotoProductSnapshot
  scenePath: string
  stillPath: string
}): Promise<LivePhotoPlacementReview> {
  const skipped = (reason: string): LivePhotoPlacementReview => ({ skipped: true, placement: 'pass', scale: 'pass', reason })
  const region = normalizeLivePhotoReplacementRegion(input.item.replacementRegion)
  const productRefPath = resolveAuthoritativeProductReferencePath(input.product)
  if (!region || !productRefPath || !existsSync(productRefPath) || !existsSync(input.scenePath) || !existsSync(input.stillPath)) {
    return skipped('missing_inputs')
  }
  const credentials = await cloneRepo.getCredentials()
  const key = String(credentials.grsaiApiKey || '').trim()
  if (!key) return skipped('missing_grsai_api_key')
  const host = String(credentials.grsaiHost || 'https://grsaiapi.com').trim().replace(/\/+$/, '') || 'https://grsaiapi.com'
  const model = String(credentials.grsaiAnalysisModel || 'gemini-3.1-pro').trim() || 'gemini-3.1-pro'
  const reviewDir = join(livePhotoRoot(input.item.id), 'placement-review')
  const stamp = `${Date.now()}-${randomUUID().slice(0, 8)}`
  const sceneCrop = join(reviewDir, `scene-${stamp}.png`)
  const stillCrop = join(reviewDir, `still-${stamp}.png`)
  try {
    await prepareLivePhotoPlacementReviewCrops({ scenePath: input.scenePath, stillPath: input.stillPath, region, sceneOutputPath: sceneCrop, stillOutputPath: stillCrop })
    const content = [
      {
        type: 'text',
        text: [
          'You check a product replacement for placement and size only. Ignore color, style, and small detail differences.',
          'Image 1 = the original scene crop. The cyan rectangle marks where the ORIGINAL product sits. The rectangle shows position only, not the size the new product should have.',
          'Image 2 = the new product that should now be in the scene.',
          'Image 3 = the same crop of the result after replacement (no rectangle).',
          'placement: "pass" if the new product in Image 3 sits on the same contact point as the original product (same piercing, finger, or support point). "fail" if it moved to another spot, floats, or is missing.',
          'scale: judge the new product size against nearby body or scene anchors in Image 3 (ear lobe height, ear rim, finger width, wrist, neck), using the real-world proportion of the product in Image 2.',
          'scale: "too_large" if clearly bigger than this product would really look, "too_small" if clearly smaller, otherwise "pass". Do NOT require it to match the rectangle size: a small product inside a big rectangle is correct.',
          'Only fail when the problem is obvious to a normal viewer.',
          'Return JSON only: {"placement":"pass","scale":"pass","reason":""}',
          `Product category: ${String(input.product.type || 'general').trim() || 'general'}. Product name: ${String(input.product.name || '').trim()}.`,
        ].join('\n'),
      },
      { type: 'image_url', image_url: { url: await imageDataUrl(sceneCrop) } },
      { type: 'image_url', image_url: { url: await imageDataUrl(productRefPath) } },
      { type: 'image_url', image_url: { url: await imageDataUrl(stillCrop) } },
    ]
    const res = await fetch(`${host}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        stream: false,
        temperature: 0,
        messages: [
          { role: 'system', content: 'You are a precise JSON-only placement reviewer.' },
          { role: 'user', content },
        ],
      }),
      signal: AbortSignal.timeout(LIVE_PHOTO_LOCATE_TIMEOUT_MS),
    })
    const text = await res.text()
    if (!res.ok) return skipped(`http_${res.status}`)
    const parsed = JSON.parse(extractJsonObjectText(extractModelMessageContent(text)))
    const placement = String(parsed?.placement || '').trim().toLowerCase() === 'fail' ? 'fail' : 'pass'
    const rawScale = String(parsed?.scale || '').trim().toLowerCase()
    const scale = rawScale === 'too_large' || rawScale === 'too_small' ? rawScale : 'pass'
    return { skipped: false, placement, scale, reason: String(parsed?.reason || '').trim().slice(0, 300) }
  } catch (error) {
    return skipped(`error: ${String((error as Error)?.message || error).slice(0, 200)}`)
  } finally {
    await rm(reviewDir, { recursive: true, force: true }).catch(() => undefined)
  }
}

/** 替换图检查最多触发一次自动重画：已经重画过的直接放行，不让任务卡死在这一步 */
const LIVE_PHOTO_PLACEMENT_REVIEW_MAX_IMAGE_RETRIES = 1

async function validateGeneratedStillWithPipeline(input: {
  item: LivePhotoItem
  product: LivePhotoProductSnapshot
  scenePath: string
  stillPath: string
}): Promise<LivePhotoQualityReport> {
  const startedAt = Date.now()
  // 贴真实商品：位置、大小由程序摆好，不再让 AI 检查（检查本身也不稳定）
  if (input.item.replaceMode === 'paste') {
    return {
      checkerVersion: LIVE_PHOTO_QUALITY_CHECKER_VERSION,
      mode: 'remote_fallback',
      decision: 'pass',
      score: 1,
      threshold: 1,
      retryFloor: 0,
      components: { clip: 0, dinov2: 0, orb: 0, ssim: 0, scenePreservation: 1, textConsistency: 1 },
      hardFailures: [],
      notes: ['quality_checker_skipped', 'paste_replace'],
      durationMs: 0,
      checkedAt: now(),
    } satisfies LivePhotoQualityReport
  }
  // 测试里换掉了出图、又没换掉这个检查时，不去真请求
  const skipInTests = livePhotoDeps.reviewLivePhotoReplacementPlacement === reviewLivePhotoReplacementPlacement
    && livePhotoDeps.generateGptShotFrameImage !== generateGptShotFrameImage
  const status = input.item.autoFlowStatus
  const imageRetries = Number(status?.imageRetryCount || 0)
  // 只有失败后确定会自动重画时才检查（手动单次重试、重试次数设为 0 时检查不通过会直接判失败）
  const canAutoRetry = resolveLivePhotoImageRetryFailure({ retryCount: imageRetries, retryLimit: status?.retryLimit ?? LIVE_PHOTO_IMAGE_RETRY_LIMIT, retryMode: status?.imageRetryMode }).shouldRetry
  let placementNote = 'placement_review:not_run'
  if (!skipInTests && canAutoRetry && imageRetries < LIVE_PHOTO_PLACEMENT_REVIEW_MAX_IMAGE_RETRIES) {
    const review = await livePhotoDeps.reviewLivePhotoReplacementPlacement(input)
    placementNote = review.skipped
      ? `placement_review:skipped ${review.reason}`
      : `placement_review:placement=${review.placement} scale=${review.scale}${review.reason ? ` ${review.reason}` : ''}`
    const hardFailures = [
      ...(review.placement === 'fail' ? ['visual_check_failed:placement'] : []),
      ...(review.scale !== 'pass' ? [`visual_check_failed:scale ${review.scale}`] : []),
    ]
    if (!review.skipped && hardFailures.length) {
      return {
        checkerVersion: LIVE_PHOTO_QUALITY_CHECKER_VERSION,
        mode: 'remote_fallback',
        decision: 'retry',
        score: 0,
        threshold: 1,
        retryFloor: 0,
        components: { clip: 0, dinov2: 0, orb: 0, ssim: 0, scenePreservation: 1, textConsistency: 1 },
        hardFailures: review.reason ? [...hardFailures, review.reason] : hardFailures,
        notes: ['placement_review_failed'],
        durationMs: Date.now() - startedAt,
        checkedAt: now(),
      } satisfies LivePhotoQualityReport
    }
  }
  return {
    checkerVersion: LIVE_PHOTO_QUALITY_CHECKER_VERSION,
    mode: 'remote_fallback',
    decision: 'pass',
    score: 1,
    threshold: 1,
    retryFloor: 0,
    components: { clip: 0, dinov2: 0, orb: 0, ssim: 0, scenePreservation: 1, textConsistency: 1 },
    hardFailures: [],
    notes: ['quality_checker_skipped', placementNote],
    fallbackReason: 'quality_checker_skipped',
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
        '{"verdict":"pass","score":0,"failures":[],"notes":[],"checks":{"product_identity":"pass","source_contamination":"pass","material_color":"pass","attachment_structure":"pass","scale":"pass","scene_interaction":"pass","scene_preservation":"pass"}}',
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
        '- In checks.scale, for rings specifically, compare the product against finger width, knuckle span, visible finger-wrap coverage, head-to-band proportion, and whether the full band remains visible instead of collapsing into only the top setting.',
        '- In checks.scene_interaction, determine whether Image 1 shows the product worn, held, placed, hanging, attached, or unsupported, then fail if Image 3 changes that interaction.',
        '- In checks.scene_interaction, a ring pinched between fingers is held, not worn. It must not be moved onto a finger.',
        '- In checks.scene_interaction, preserve the same supporting fingers, surface, suspension point, mounting point, contact shadow, depth order, and occlusion that are visible in Image 1.',
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

export function buildReferenceReplacementPrompt(_input: {
  product: LivePhotoProductSnapshot
  productReferenceImagePaths: string[]
  referenceImagePath: string
  sceneInteraction?: LivePhotoSceneInteraction
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
    '- The original product in Image 1 only marks WHERE the replacement goes. It does not define how big the replacement is.',
    '- Size the Image 2 product by its real-world proportion against nearby body or scene anchors in Image 1 (ear lobe, ear rim, fingers, wrist, neck, table edge), not by the footprint of the original product.',
    '- Do not stretch or shrink the replacement to fill the original product footprint. A smaller product stays small; a larger product may extend beyond it.',
    '- Keep the replacement centered on the same contact point as the original product (the same piercing, finger, or support point).',
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
  executionRules.push(...buildLivePhotoSceneInteractionPromptRules(_input.sceneInteraction))
  executionRules.push(...buildLivePhotoCategorySpecificPromptRules(_input.product, 'replacement'))
  if (_input.retryGuidance?.length) {
    executionRules.push('', 'RETRY CORRECTION RULES:', ..._input.retryGuidance.map((item) => `- ${item}`))
  }
  return [basePrompt, '', ...executionRules].join('\n')
}

export function buildLivePhotoCategorySpecificPromptRules(product: LivePhotoProductSnapshot, context: 'replacement' | 'video' = 'replacement') {
  const analysis = normalizeLivePhotoProductAnalysis(product.productAnalysis)
  const isEarring = isEarringLikeLivePhotoProduct(product)
  const isRing = isRingLikeLivePhotoProduct(product)
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
  const hasHaloCluster = /\b(?:halo|cluster|surround|pave|micro-pave|micro pave)\b/.test(analysisText)
  const isWearableContext = isWearableLikeLivePhotoProduct(product)
  const rules: string[] = []
  if (isWearableContext) {
    rules.push(
      '',
      'WEARABLE SCALE LOCK:',
      '- Treat the product as a scene-anchored wearable with a fixed real-world size, not as a free-scaling decoration.',
      context === 'video'
        ? '- Keep the same product-to-body scale relationship already visible in the locked still.'
        : '- Keep the same product-to-body scale relationship that is correct for the selected product, not the replaced product from Image 1.',
      context === 'video'
        ? '- Preserve the exact contact point and attachment relation already visible in the locked still.'
        : '- Preserve the exact contact point and attachment relation from Image 1.',
      '- Do NOT enlarge the product to improve readability.',
      '- Do NOT shrink the product to make the model, face, hand, or body read more cleanly.',
      '- Do NOT move the product away from the original supporting body or object anchor.',
      '- If the product is partially occluded, preserve that occlusion instead of resizing the product.',
      context === 'video'
        ? '- Keep the product locked to the exact wearable proportion already visible in the locked still.'
        : '- Keep the product locked to the correct selected-product wearable proportion. Do not let the old Image 1 product footprint override that proportion.',
    )
  }
  if (isEarring) {
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
  }
  if (isRing) {
    rules.push(
      '',
      'RING STRUCTURE LOCK:',
      context === 'video'
        ? '- Preserve the full ring silhouette already visible in the locked still, including the entire band, shoulders, head, gallery, and setting.'
        : '- Match Image 2 exactly with a complete ring silhouette, including the full band, shoulders, head, gallery, and setting.',
      context === 'video'
        ? '- Keep the same shank width profile, band split or taper, and visible finger-wrap geometry already present in the locked still.'
        : '- Keep the exact shank width profile, band split or taper, band curvature, and visible shank geometry from Image 2.',
      context === 'video'
        ? '- Preserve the exact visible center-stone shape, halo outline, prong count, and side-stone count already visible in the locked still.'
        : '- Preserve the exact center-stone shape, halo outline, prong count, and side-stone count from Image 2.',
      context === 'video'
        ? '- Do NOT let the ring collapse into only the top ornament, flower head, gemstone cluster, or a partial crown without the band.'
        : '- Do NOT replace the ring with only the top ornament, flower head, gemstone cluster, or a partial crown from Image 1.',
      context === 'video'
        ? '- Keep the exact visible metal tone and material finish already present in the locked still.'
        : '- Keep the exact metal tone and material finish from Image 2. Do not preserve the metal color from Image 1 when it conflicts.',
      context === 'video'
        ? '- Keep the final ring at the exact real-world finger scale already visible in the locked still.'
        : '- Keep the final ring at the exact real-world finger scale that matches Image 2 and Product DNA. Do NOT enlarge the head or shrink the band.',
    )
    if (hasHaloCluster) {
      rules.push('- Preserve the exact halo or clustered-stone outline. Do NOT remove outer stones, merge them into a solid head, or simplify them into one gem mass.')
    }
    if (hasStarMotif) {
      rules.push('- Preserve the exact star-like or flower-like head outline and point count only when it already belongs to the selected ring design.')
    }
  }
  if (analysis?.coreSubject) rules.push(`- Product identity from Product DNA: ${analysis.coreSubject}`)
  if (analysis?.connectionStructure) rules.push(`- Product connection structure from Product DNA: ${analysis.connectionStructure}`)
  if (analysis?.geometryDetails) rules.push(`- Product geometry from Product DNA: ${analysis.geometryDetails}`)
  return rules
}

export function buildReferenceReplacementNegativePrompt(input?: {
  product?: LivePhotoProductSnapshot
  strategy?: LivePhotoReplacementStrategy
  sceneInteraction?: LivePhotoSceneInteraction
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
    ]
  const interactionNegatives = buildLivePhotoSceneInteractionNegativeTerms(input?.sceneInteraction)
  negatives.push(...interactionNegatives)
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
  if (input?.product && isRingLikeLivePhotoProduct(input.product)) {
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
    const hasHaloCluster = /\b(?:halo|cluster|surround|pave|micro-pave|micro pave)\b/.test(analysisText)
    productNegatives.push(
      'missing ring band',
      'missing shank',
      'ring head only',
      'partial ring silhouette',
      'wrong ring setting',
      'wrong prong count',
      'wrong stone count',
      'wrong ring metal color',
    )
    if (hasHaloCluster) productNegatives.push('missing halo stones', 'collapsed halo cluster')
  }
  const priorityNegatives = [
    'original product retained',
    'leftover original product',
    ...interactionNegatives,
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
  if (reason.includes('too_large')) {
    guidance.add('The previous result made the product too large. Render it smaller, at its real-world size relative to the ear, fingers, or other nearby anchors.')
  }
  if (reason.includes('too_small')) {
    guidance.add('The previous result made the product too small. Render it larger, at its real-world size relative to the ear, fingers, or other nearby anchors.')
  }
  if (reason.includes('placement')) {
    guidance.add('Place the product exactly on the same contact point as the original product in Image 1 (same piercing, finger, or support point). Do not move it elsewhere.')
  }
  if (reason.includes('scene_interaction') || reason.includes('worn instead of held') || reason.includes('held instead of worn')) {
    guidance.add('Restore the exact physical interaction from Image 1. Do not change whether the product is worn, held, placed, hanging, or attached.')
    guidance.add('Preserve the same contact points, supporting fingers or object, depth order, and occlusion from Image 1.')
  }
  if (reason.includes('missing part') || reason.includes('missing structure') || reason.includes('attachment')) {
    guidance.add('Keep the product from Image 2 complete and do not drop visible product parts.')
  }
  if (reason.includes('product_structure_consistency') || reason.includes('structure drift')) {
    guidance.add('Match the exact single-product silhouette, hoop count, closure path, connector layout, and ornament attachment from Image 2.')
    guidance.add('Output exactly one replacement product at the original anchor. Do not combine it with any original hoop or product contour from Image 1.')
  }
  if (product && isRingLikeLivePhotoProduct(product)) {
    guidance.add('Keep the full ring visible with a complete band and head. Do not output only the stone cluster or top ornament.')
    guidance.add('Preserve the exact ring band thickness, stone count, prong structure, and metal color from Image 2.')
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
    hint: {
      type: input.product.type,
    },
  })
  if (livePhotoDeps.generateGptShotFrameImage !== generateGptShotFrameImage) {
    const payload = bindLivePhotoReplacementInputs({
      referenceImagePath: input.referenceImagePath,
      product: {
        ...input.product,
        authoritativeProductReferencePath: prepared.path,
        imagePaths: [prepared.path],
        coverImagePath: prepared.path,
      },
    })
    return { ...payload, prepared, originalReferenceImagePath: input.referenceImagePath }
  }
  const region = normalizeLivePhotoReplacementRegion(input.item.replacementRegion)
  if (!region) throw new Error('[replacement_region_required] Select the replacement region before image generation.')
  const sceneCrop = await prepareLivePhotoReplacementCrop({
    scenePath: input.referenceImagePath,
    outputPath: join(input.outputDir, `scene-crop-r${region.revision}.png`),
    region,
  })
  const payload = bindLivePhotoReplacementInputs({
    referenceImagePath: sceneCrop.path,
    product: {
      ...input.product,
      authoritativeProductReferencePath: prepared.path,
      imagePaths: [prepared.path],
      coverImagePath: prepared.path,
    },
  })
  return {
    ...payload,
    prepared,
    originalReferenceImagePath: input.referenceImagePath,
    replacementGeometry: sceneCrop.geometry,
  }
}

async function finalizeGeneratedLivePhotoReplacement(input: {
  item: LivePhotoItem
  scenePath: string
  generatedCropPath: string
  outputRoot?: string
}) {
  if (livePhotoDeps.generateGptShotFrameImage !== generateGptShotFrameImage) return input.generatedCropPath
  if (basename(input.generatedCropPath).startsWith('localized-replacement-')) return input.generatedCropPath
  const region = normalizeLivePhotoReplacementRegion(input.item.replacementRegion)
  if (!region) throw new Error('[replacement_region_required] Select the replacement region before image generation.')
  const root = input.outputRoot || livePhotoRoot(input.item.id)
  const context = await prepareLivePhotoReplacementCrop({
    scenePath: input.scenePath,
    outputPath: join(root, 'product-reference', `scene-crop-r${region.revision}.png`),
    region,
  })
  const outputPath = join(root, 'generated-still', `localized-replacement-r${region.revision}-${Date.now()}-${randomUUID()}.png`)
  await ensureDir(join(root, 'generated-still'))
  await compositeLivePhotoReplacementCrop({
    scenePath: input.scenePath,
    generatedCropPath: input.generatedCropPath,
    outputPath,
    geometry: context.geometry,
  })
  return outputPath
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
  if (
    text.includes('scene_interaction') ||
    text.includes('interaction mismatch') ||
    text.includes('held instead of worn') ||
    text.includes('worn instead of held') ||
    text.includes('moved onto a finger') ||
    text.includes('wrong support relation')
  ) {
    categories.add('scene_interaction_mismatch')
  }
  return Array.from(categories)
}

async function generateReferenceReplacementStill(input: {
  item: LivePhotoItem
  product: LivePhotoProductSnapshot
  referenceImagePath: string
  strategyOverride?: LivePhotoReplacementStrategy
  outputRoot?: string
}) {
  const credentials = await cloneRepo.getCredentials()
  const root = input.outputRoot || livePhotoRoot(input.item.id)
  const stillDir = join(
    root,
    livePhotoDeps.generateGptShotFrameImage === generateGptShotFrameImage ? 'generated-crops' : 'generated-still',
  )
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
    sceneInteraction: input.item.sceneInteraction,
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
      sceneInteraction: input.item.sceneInteraction,
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
  outputRoot?: string
}) {
  const credentials = await cloneRepo.getCredentials()
  const root = input.outputRoot || livePhotoRoot(input.item.id)
  const stillDir = join(
    root,
    livePhotoDeps.generateGptShotFrameImage === generateGptShotFrameImage ? 'generated-crops' : 'generated-still',
  )
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
    sceneInteraction: input.item.sceneInteraction,
    retryGuidance,
    strategy: replacementStrategy,
    prompt: input.item.imagePromptPreview?.prompt,
  })
  const negativePrompt = buildReferenceReplacementNegativePrompt({
    product: input.product,
    strategy: replacementStrategy,
    sceneInteraction: input.item.sceneInteraction,
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
          // 平台直接给了图：下载这张就行，别再生成一次（会多扣一次费）
          const stillPath = join(stillDir, `reference_replace_${Date.now()}_${randomUUID()}.png`)
          await downloadUrlToFile({ url: created.directUrl, filePath: stillPath })
          return {
            mode: 'direct' as const,
            stillPath,
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
  // 只用选中的那一个图片平台：选中的是 grsai / apifox_hub 就只走上面那个，失败直接报错，
  // 不再自动换别的平台；选中的是 openai 等其它平台（或测试替身）才走通用生成。
  const selected = providers[0]
  if (selected !== 'grsai' && selected !== 'apifox_hub') adapters.splice(0, adapters.length)
  if (!adapters.length) adapters.push({
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
  outputRoot?: string
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
    const product = input.item.productSnapshot
    const scenePath = resolveLivePhotoReferenceImagePath(input.item)
    const preparedPayload = product && scenePath
      ? await bindPreparedLivePhotoReplacementInputs({
          item: input.item,
          product,
          referenceImagePath: scenePath,
          outputDir: join(input.outputRoot || livePhotoRoot(input.item.id), 'product-reference'),
        })
      : null
    const generated = await generateApifoxImage({
      credentials: { ...credentials, imageProviderPrimary: 'apifox_hub' },
      prompt: String(input.item.imagePromptPreview?.prompt || '').trim(),
      negativePrompt: String(input.item.imagePromptPreview?.negativePrompt || '').trim() || undefined,
      imagePaths: preparedPayload?.imagePaths || input.item.imagePromptPreview?.referenceImagePaths || [],
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
  // 选了清单里的模型：按模型自己的平台和请求格式提交
  const catalogSpec = input.item.videoModelId ? pickCatalogVideoModel(credentials, input.item.videoModelId) : undefined
  if (catalogSpec) {
    await recordLivePhotoVideoPromptSent({ item: input.item, shot, stillPath: input.stillPath, provider: CATALOG_VIDEO_PROVIDER, model: catalogSpec.id })
    const firstFrameUrl = await toPublicUrlViaQiniu(credentials, input.stillPath, 'cloud-video-input/live-photo-first-frame')
    const lastFramePath = catalogSpec.lastFrame ? await resolveLivePhotoClosingFrame({ item: input.item, stillPath: input.stillPath }) : undefined
    const lastFrameUrl = lastFramePath ? await toPublicUrlViaQiniu(credentials, lastFramePath, 'cloud-video-input/live-photo-last-frame') : undefined
    const created = await submitCatalogVideoTask({
      credentials,
      spec: catalogSpec,
      params: {
        prompt: shot.prompt?.positive || shot.compiledPrompt || '',
        firstFrameUrl,
        lastFrameUrl,
        durationSec: input.item.videoDurationSec,
        resolution: input.item.videoResolution,
        aspectRatio: '9:16',
      },
    })
    if (created.snapshot.status === 'succeeded' && created.snapshot.url) {
      const outputDir = join(livePhotoRoot(input.item.id), 'generated-video')
      await ensureDir(outputDir)
      const outputPath = join(outputDir, `live_photo_video_${Date.now()}_${randomUUID()}.mp4`)
      await downloadUrlToFile({ url: created.snapshot.url, filePath: outputPath })
      return { mode: 'direct' as const, outputPath, provider: CATALOG_VIDEO_PROVIDER, model: catalogSpec.id }
    }
    if (!created.taskId) throw new Error(`${catalogSpec.label} 没有返回任务 id，无法查询结果`)
    return { mode: 'remote' as const, taskId: created.taskId, provider: CATALOG_VIDEO_PROVIDER, model: catalogSpec.id }
  }
  const chain = livePhotoVideoProviderChain(credentials)
  const provider = chain[0]
  const providerModel = resolveLivePhotoVideoModel(credentials, provider)
  if (provider === 'apifox_hub' || provider === 'grsai') {
    await recordLivePhotoVideoPromptSent({ item: input.item, shot, stillPath: input.stillPath, provider, model: providerModel })
  }
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
      sceneInteraction: item.sceneInteraction,
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
  sceneInteraction?: LivePhotoSceneInteraction
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
      sceneInteraction: input.sceneInteraction,
      retryGuidance: input.retryGuidance,
      strategy: replacementStrategy,
      prompt: input.prompt,
    }),
    negativePrompt: buildReferenceReplacementNegativePrompt({
      product: input.product,
      strategy: replacementStrategy,
      sceneInteraction: input.sceneInteraction,
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
      sceneInteraction: item.sceneInteraction,
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
  await replaceWithLink(input.sourceVideoPath, input.outputPath, livePhotoRoot(''))
}

async function writeLivePhotoVideoPreservingSource(input: { sourceVideoPath: string; outputPath: string }) {
  if (onCloudEngine()) await rm(input.outputPath, { force: true })
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
  const explicitStage = resolveLivePhotoStage({
    failedStage: item.autoFlowStatus?.failedStage,
    currentStage: item.autoFlowStatus?.currentStage || fallback,
    imageTaskId: item.imageTaskId,
    videoTaskId: item.videoTaskId,
  })
  if (explicitStage === 'video') return 'video_generation'
  if (explicitStage === 'image') return 'image_generation'
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

async function clearMaterializedArtifactsForImageRetry(itemId: string) {
  const root = livePhotoRoot(itemId)
  await Promise.all(
    [
      'still.jpg',
      'still.png',
      'poster.jpg',
      'preview.mp4',
      'live-photo.jpg',
      'live-photo.mov',
      'live-photo.json',
      'motion.mp4',
      'motion.mov',
    ].map((fileName) => rm(join(root, fileName), { force: true })),
  )
}

async function clearMaterializedArtifactsForVideoRetry(itemId: string) {
  const root = livePhotoRoot(itemId)
  await Promise.all(
    [
      'poster.jpg',
      'preview.mp4',
      'live-photo.jpg',
      'live-photo.mov',
      'live-photo.json',
      'motion.mp4',
      'motion.mov',
    ].map((fileName) => rm(join(root, fileName), { force: true })),
  )
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
  if (String(reason || '').includes('[replacement_region_required]')) return true
  // 参考图本身不合适，重试也一样：直接停，让用户换图
  if (String(reason || '').includes('[reference_unsuitable]')) return true
  return stage === 'video_generation'
}

function isLivePhotoImageValidationFailure(reason: string) {
  return String(reason || '').includes('[image_validation_failed]')
}

function classifyLivePhotoQualityFailures(hardFailures: string[]) {
  const text = hardFailures.join(' ').toLowerCase()
  const categories: string[] = []
  if (text.includes('outside_scene_drift') || text.includes('scene_preservation') || text.includes('scene drift')) {
    categories.push('[scene_drift]')
  }
  if (text.includes('output_canvas_mismatch')) {
    categories.push('[output_canvas_mismatch]')
  }
  if (text.includes('scene_interaction')) {
    categories.push('[scene_interaction_error]')
  }
  if (
    text.includes('product_structure') ||
    text.includes('ring_structure') ||
    text.includes('attachment') ||
    text.includes('geometry') ||
    text.includes('wrong product')
  ) {
    categories.push('[product_structure_error]')
  }
  if (
    text.includes('cropped') ||
    text.includes('cut off') ||
    text.includes('partial product') ||
    text.includes('missing ring band') ||
    text.includes('missing shank') ||
    text.includes('ring head only')
  ) {
    categories.push('[product_cropped]')
  }
  return categories.join(' ')
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
  await replaceWithLink(input.stillSourcePath, stillPath, livePhotoRoot(''))

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
  await replaceWithLink(stillPath, liveImagePath, livePhotoRoot(''))
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

/** 自动挑图的版本：2 = 六视图按分隔处识别 3×2 / 2×3（1 版按横竖猜，竖图的 3×2 板会切错）；3 = 不再给背面两格；4 = 先数件数，一对配一对的图 */
const LIVE_PHOTO_CUTOUT_PICK_VERSION = 6

/** 按角度挑图的候选：商品库里这个商品的原图 + 六视图分析板切出来的各个角度 */
async function collectLivePhotoProductViews(item: LivePhotoItem, product: LivePhotoProductSnapshot) {
  const paths: string[] = []
  const stored = item.productId ? (await productsRepo.list().catch(() => [])).find((entry) => entry.id === item.productId) : undefined
  for (const path of [stored?.coverImagePath, ...((stored?.images || []).map((image) => image.filePath))]) {
    const value = String(path || '').trim()
    if (value && existsSync(value) && !paths.includes(value)) paths.push(value)
  }
  const board = String(product.authoritativeProductReferencePath || '').trim()
  if (board && existsSync(board) && /analysis[-_]board/i.test(board)) {
    const views = await splitAnalysisBoard(board, join(livePhotoRoot(item.id), 'paste', 'views')).catch(() => [] as string[])
    paths.push(...pasteUsableBoardViews(views))
  }
  return paths.slice(0, 10)
}

/** 抠图用的商品图：任务里选的那张 > 商品主图 > 第一张商品图 */
function resolveLivePhotoCutoutSourcePath(item: LivePhotoItem, product: LivePhotoProductSnapshot) {
  const candidates = [item.cutoutSourcePath, product.coverImagePath, ...(product.imagePaths || [])]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
  const found = candidates.find((value) => existsSync(value))
  if (!found) throw new Error('找不到商品图，没法抠图。请先在商品库给这个商品上传一张单只、白底的商品图')
  return found
}

/** 擦除 + 抠图（贴真实商品的前两步），做过的不重做；框改过（revision 变了）就重新擦、摆放回到默认 */
async function preparePasteReplacementInputs(input: {
  item: LivePhotoItem
  product: LivePhotoProductSnapshot
  referenceImagePath: string
  credentials: ModelCredentials
}) {
  let item = input.item
  const region = normalizeLivePhotoReplacementRegion(item.replacementRegion)
  if (!region) throw new Error('[replacement_region_required] Select the replacement region before image generation.')
  const root = livePhotoRoot(item.id)
  // 擦图（花钱）前先看参考图能不能贴：侧面、背面朝镜头或商品太小的，直接让用户换参考图（同一个框只看一次）
  if (item.productViewCheck?.regionRevision !== region.revision) {
    const check = await checkReferenceSuitability({
      credentials: input.credentials,
      referenceScenePath: input.referenceImagePath,
      region,
      productType: input.product.type,
    })
    item = await livePhotoRepo.upsert({
      ...appendLivePhotoLogs(item, [
        buildLivePhotoLog(`[live-photo] 参考图检查：商品朝向=${check.view}，大小约 ${check.sizePx} 像素，${check.suitable ? '可以贴真实商品' : '不适合'}`, check.suitable ? 'info' : 'error'),
      ]),
      productViewCheck: { ...check, regionRevision: region.revision },
      updatedAt: now(),
    })
  }
  if (item.productViewCheck && !item.productViewCheck.suitable) {
    throw new Error(`[reference_unsuitable] ${item.productViewCheck.reason || '这张参考图不适合贴真实商品，请换一张商品正面朝镜头的参考图'}`)
  }
  const erasedReady = Boolean(item.erasedScenePath && existsSync(item.erasedScenePath) && item.erasedRegionRevision === region.revision)
  if (!erasedReady) {
    item = await livePhotoRepo.upsert({
      ...appendLivePhotoLogs(item, [buildLivePhotoLog('[live-photo] 贴真实商品：擦掉参考图里的旧商品')]),
      updatedAt: now(),
    })
    const erased = await eraseRegionProduct({
      credentials: input.credentials,
      scenePath: input.referenceImagePath,
      region,
      outputPath: join(root, 'paste', `erased-r${region.revision}-${now()}.png`),
    })
    item = await livePhotoRepo.upsert({
      ...appendLivePhotoLogs(item, [
        buildLivePhotoModelCallLog({ step: 'image_generation', provider: 'grsai', model: erased.model, endpoint: '/v1/api/generate', cached: false }),
        buildLivePhotoLog('[live-photo] 旧商品已擦掉', 'success'),
      ]),
      erasedScenePath: erased.path,
      erasedRegionRevision: region.revision,
      // 框变了：之前的摆放作废，回到默认
      placement: item.erasedRegionRevision === undefined || item.erasedRegionRevision === region.revision ? item.placement : undefined,
      updatedAt: now(),
    })
  }
  // 自动挑的图如果是旧版切格挑出来的（六视图切错了格，会混进几只商品），作废重挑
  if (item.cutoutSourceChosenBy === 'auto' && item.cutoutPickVersion !== LIVE_PHOTO_CUTOUT_PICK_VERSION) {
    item = await livePhotoRepo.upsert({
      ...appendLivePhotoLogs(item, [buildLivePhotoLog('[live-photo] 商品图是旧版自动挑的，重新按角度挑一次')]),
      cutoutSourceChosenBy: undefined,
      cutoutSourcePath: undefined,
      cutoutPair: undefined,
      productCutoutPath: undefined,
      placement: undefined,
      updatedAt: now(),
    })
  }
  // 没手动选抠图用的商品图：按参考图里原商品的角度，从商品图和六视图里挑最接近的一张（只挑一次）
  if ((!item.productCutoutPath || !existsSync(item.productCutoutPath)) && !item.cutoutSourceChosenBy) {
    const candidates = await collectLivePhotoProductViews(item, input.product)
    const picked = await pickProductViewByAngle({
      credentials: input.credentials,
      referenceScenePath: input.referenceImagePath,
      region,
      candidatePaths: candidates,
      workDir: join(root, 'paste'),
    })
    item = await livePhotoRepo.upsert({
      ...appendLivePhotoLogs(item, [
        buildLivePhotoLog(
          picked
            ? `[live-photo] 按原商品的角度选了第 ${picked.index} 张商品图（共 ${candidates.length} 张）：${basename(picked.path)}，${picked.pair ? '成对' : '单只'}`
            : `[live-photo] 没能按角度挑商品图（候选 ${candidates.length} 张），用默认商品图`,
        ),
      ]),
      cutoutSourcePath: picked?.path ?? item.cutoutSourcePath,
      cutoutSourceChosenBy: 'auto',
      cutoutPickVersion: LIVE_PHOTO_CUTOUT_PICK_VERSION,
      cutoutPair: picked ? resolveCutoutPair(picked.pair, item.sceneInteraction?.mode) : undefined,
      updatedAt: now(),
    })
  }
  const cutoutSourcePath = resolveLivePhotoCutoutSourcePath(item, input.product)
  if (!item.productCutoutPath || !existsSync(item.productCutoutPath)) {
    // 是一对还是一只：挑图时看过参考图就按它说的；否则拿着 / 放着（常常一对一起展示）保留成对，戴着只留一只
    const keepPair = typeof item.cutoutPair === 'boolean' ? item.cutoutPair : ['held', 'placed', 'none'].includes(String(item.sceneInteraction?.mode || ''))
    const cutout = await ensureProductCutout(cutoutSourcePath, { keepPair })
    item = await livePhotoRepo.upsert({
      ...appendLivePhotoLogs(item, [buildLivePhotoLog(`[live-photo] 商品抠图完成：${basename(cutoutSourcePath)}`, 'success')]),
      productCutoutPath: cutout.path,
      updatedAt: now(),
    })
  }
  const scene = await readImageSize(String(item.erasedScenePath))
  const cutout = await readImageSize(String(item.productCutoutPath))
  const defaultPlacement = defaultProductPlacement({ region, sceneWidth: scene.width, sceneHeight: scene.height, cutoutWidth: cutout.width, cutoutHeight: cutout.height, foreshortened: item.productViewCheck?.view === 'flat' })
  let placement = normalizeProductPlacement(item.placement)
  if (!placement) {
    placement = defaultPlacement
    item = await livePhotoRepo.upsert({ ...item, placement, updatedAt: now() })
  }
  return { item, region, cutoutSourcePath, scene, cutout, placement, defaultPlacement }
}

/**
 * 贴真实商品（见 pasteReplace.ts）：擦除 → 抠图 → 按摆放贴上 → AI 把商品画进场景，一次出几张 → 用户挑一张 → 视频。
 * 选了「生成前让我确认」且还没确认时，抛 [awaiting_placement] 停下来等用户；出好几张图后抛 [awaiting_still_pick] 等用户挑。
 */
async function runPasteReplacement(input: {
  item: LivePhotoItem
  product: LivePhotoProductSnapshot
  referenceImagePath: string
  credentials: ModelCredentials
}) {
  const prepared = await preparePasteReplacementInputs(input)
  let item = prepared.item
  if (item.placementMode === 'confirm' && !prepared.placement.confirmedAt) {
    throw new Error('[awaiting_placement] 等你确认商品摆放')
  }
  // 已经挑好了：直接用挑的那张（重试、续跑都不再重新生成）
  const candidates = (item.stillCandidates || []).filter((candidate) => candidate.path && existsSync(candidate.path))
  const picked = typeof item.pickedStillIndex === 'number' ? item.stillCandidates?.[item.pickedStillIndex] : undefined
  if (picked?.path && existsSync(picked.path)) return picked.path
  if (candidates.length) throw new Error('[awaiting_still_pick] 等你挑一张图')
  const root = livePhotoRoot(item.id)
  const guidePath = join(root, 'paste', `guide-${now()}.png`)
  const guide = await renderPlacementGuide({
    erasedScenePath: String(item.erasedScenePath),
    cutoutPath: String(item.productCutoutPath),
    placement: prepared.placement,
    outputPath: guidePath,
  })
  item = await livePhotoRepo.upsert({
    ...appendLivePhotoLogs(item, [buildLivePhotoLog(`[live-photo] 商品已按摆放贴好，开始融合（一次出 ${PASTE_STILL_CANDIDATES} 张）`)]),
    updatedAt: now(),
  })
  // 款式依据：抠图用的那张 + 其它角度（商品图、六视图正面 / 3/4 正面），最多 3 张
  const views = [prepared.cutoutSourcePath, ...(await collectLivePhotoProductViews(item, input.product))]
    .filter((path, index, all) => path && all.indexOf(path) === index)
    .slice(0, 3)
  const integrated = await integratePlacedProduct({
    credentials: input.credentials,
    referenceScenePath: input.referenceImagePath,
    guidePath,
    erasedScenePath: String(item.erasedScenePath),
    productMaskPath: guide.maskPath,
    productViewPaths: views,
    productType: input.product.type,
    productBounds: guide.bounds,
    region: prepared.region,
    interactionMode: item.sceneInteraction?.mode,
    outputDir: join(root, 'generated-still'),
  })
  await livePhotoRepo.upsert({
    ...appendLivePhotoLogs(item, [
      buildLivePhotoModelCallLog({ step: 'image_generation', provider: 'grsai', model: integrated.model, endpoint: '/v1/api/generate', cached: false }),
      buildLivePhotoLog(`[live-photo] 融合出了 ${integrated.candidates.length} 张图${integrated.failed ? `（${integrated.failed} 张失败）` : ''}，等你挑一张`, 'success'),
    ]),
    stillCandidates: integrated.candidates,
    pickedStillIndex: undefined,
    awaitingPlacement: false,
    updatedAt: now(),
  })
  throw new Error('[awaiting_still_pick] 等你挑一张图')
}

async function finalizeReferenceItem(input: {
  item: LivePhotoItem
  product: LivePhotoProductSnapshot
  referenceImagePath: string
  motionTemplate: LivePhotoMotionTemplate
}) {
  const credentials = await cloneRepo.getCredentials()
  const stillOutputDir = join(livePhotoRoot(input.item.id), 'generated-still')
  const cropOutputDir = join(livePhotoRoot(input.item.id), 'generated-crops')
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
      error: undefined,
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
      const existingMotion = String(imageDoneItem.motionVideoPath || '').trim()
      let videoSourcePath = existingMotion && existsSync(existingMotion) ? existingMotion : undefined
      if (!videoSourcePath) {
        // 从视频这步重来（例如手动重试清掉了旧任务）：按任务选的模型正常提交一次。
        // 以前这里直接进打包，打包发现没视频就用旧的生成链现做——不看所选模型、失败还会换平台多次提交，
        // 而且套在打包超时里：超时判失败后后台仍在生成，最后视频做好了任务却停在「失败」。
        const submitted = await submitLivePhotoVideoTask({
          item: imageDoneItem,
          product: input.product,
          stillPath: String(imageDoneItem.generatedStillPath || '').trim(),
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
        videoSourcePath = submitted.outputPath
      }
      materialized = await withTimeout(
        materializeItem({
          item: imageDoneItem,
          stillSourcePath: String(imageDoneItem.generatedStillPath || '').trim(),
          videoSourcePath,
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

  if (!input.item.replacementRegion || !input.item.sceneInteraction) {
    input.item = await livePhotoRepo.upsert({
      ...appendLivePhotoLogs(input.item, [buildLivePhotoLog('[live-photo] stage locate_product started')]),
      updatedAt: now(),
    })
  }
  const locatedScene = await locateLivePhotoReplacementRegion({
    item: input.item,
    product: input.product,
    scenePath: input.referenceImagePath,
  })
  const replacementRegion = locatedScene.region
  const sceneInteraction = locatedScene.sceneInteraction
  if (
    !input.item.replacementRegion ||
    input.item.replacementRegion.updatedAt !== replacementRegion.updatedAt ||
    !input.item.sceneInteraction ||
    input.item.sceneInteraction.updatedAt !== sceneInteraction.updatedAt
  ) {
    input.item = await livePhotoRepo.upsert({
      ...appendLivePhotoLogs(input.item, [
        buildLivePhotoLog(
          `[live-photo] replacement region ready: source=${replacementRegion.source} confidence=${replacementRegion.confidence ?? 1} revision=${replacementRegion.revision}`,
          'success',
        ),
        buildLivePhotoLog(
          `[live-photo] scene interaction ready: mode=${sceneInteraction.mode} confidence=${sceneInteraction.confidence}`,
          'success',
        ),
        ...(locatedScene.modelCall ? [buildLivePhotoModelCallLog(locatedScene.modelCall)] : []),
      ]),
      replacementRegion,
      sceneInteraction,
      updatedAt: now(),
    })
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
  const promptVersion = livePhotoPromptVersionService.getActive('image')
  const previewProvider = String(input.item.imagePromptPreview?.provider || '').trim()
  const previewModel = String(input.item.imagePromptPreview?.model || '').trim()
  const replacementStrategy = inferLivePhotoReplacementStrategy({ item: input.item, product: input.product })
  const replacementNegativePrompt = buildReferenceReplacementNegativePrompt({
    product: input.product,
    strategy: replacementStrategy,
    sceneInteraction: input.item.sceneInteraction,
  })
  const existingStill = String(input.item.generatedStillPath || '').trim()
  if (!generated && input.item.replaceMode === 'paste' && !(existingStill && existsSync(existingStill))) {
    generated = {
      stillPath: await runPasteReplacement({ item: input.item, product: input.product, referenceImagePath: input.referenceImagePath, credentials }),
      productReferenceImagePaths: input.product.imagePaths,
    }
    input.item = (await livePhotoRepo.get(input.item.id)) || input.item
  }
  if (!generated && String(input.item.generatedStillPath || '').trim() && existsSync(String(input.item.generatedStillPath || '').trim())) {
    generated = {
      stillPath: String(input.item.generatedStillPath || '').trim(),
      productReferenceImagePaths: input.product.imagePaths,
    }
  } else if (!generated && String(input.item.imageTaskId || '').trim()) {
    const polled = await pollReferenceReplacementStillTask({
      item: input.item,
      outputDir: cropOutputDir,
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
    const imageCallLog = buildLivePhotoModelCallLog({
      step: 'image_generation',
      provider: submitted.provider,
      model: submitted.model,
      endpoint: livePhotoImageEndpoint(submitted.provider),
      cached: false,
    })
    if (submitted.mode === 'remote') {
      await livePhotoRepo.upsert({
        ...appendLivePhotoLogs(input.item, [
          imageCallLog,
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
    input.item = await livePhotoRepo.upsert({ ...appendLivePhotoLogs(input.item, [imageCallLog]), updatedAt: now() })
    generated = {
      stillPath: submitted.stillPath,
      productReferenceImagePaths: submitted.productReferenceImagePaths,
    }
  }
  if (!generated) throw new Error('Reference still generation did not produce an output')
  if (!qualityReport) {
    generated = {
      ...generated,
      stillPath: await finalizeGeneratedLivePhotoReplacement({
        item: input.item,
        scenePath: input.referenceImagePath,
        generatedCropPath: generated.stillPath,
      }),
    }
  }
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
      regionRevision: input.item.replacementRegion?.revision,
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
      const category = classifyLivePhotoQualityFailures(qualityReport.hardFailures)
      throw new Error(`[image_validation_failed]${category ? ` ${category}` : ''} ${qualityReport.decision}: ${qualityReport.hardFailures.join(', ') || `quality score ${qualityReport.score}`}`)
    }
  }
  // Preserve the provider output dimensions. Video packaging handles the
  // target frame independently and must not rewrite the returned still.
  const imageDoneItem: LivePhotoItem = {
    ...appendLivePhotoLogs(input.item, [
      ...autoFlowLogs,
      buildLivePhotoLog(`[live-photo] image_generation completed: ${generated.stillPath}`, 'success'),
      buildLivePhotoLog(`[live-photo] image validation passed: score=${qualityReport?.score ?? 0} ${(qualityReport?.notes ?? []).filter((note) => note.startsWith('placement_review')).join(' ')}`.trim(), 'success'),
      buildLivePhotoLog('[live-photo] stage video_generation started'),
    ]),
    generatedStillPath: generated.stillPath,
    error: undefined,
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
      retryLimit: ensureAutoFlowStatus(input.item).retryLimit,
      retryCount: 0,
      imageRetryCount: ensureAutoFlowStatus(input.item).imageRetryCount,
      videoRetryCount: ensureAutoFlowStatus(input.item).videoRetryCount,
      failedStage: undefined,
      retryScope: 'video',
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
          failedStage: undefined,
          retryScope: undefined,
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
        failedStage: undefined,
        retryScope: undefined,
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
    // 「生成前让我确认」：擦好、抠好图后停下来，等用户在「调整摆放」里确认（不算失败、不计重试）
    if (String(error?.message || '').includes('[awaiting_placement]')) {
      await livePhotoRepo.upsert({
        ...appendLivePhotoLogs(latestPersisted, [buildLivePhotoLog('[live-photo] 等待确认商品摆放')]),
        awaitingPlacement: true,
        packagingStatus: 'processing',
        error: undefined,
        autoFlowStatus: { ...current, status: 'idle', paused: true, currentStage: 'image_generation', failedStage: undefined, lastError: '' },
        workflow: patchWorkflow(latestPersisted.workflow, 'image_generation', 'image_generation', 'idle'),
        updatedAt: now(),
      })
      throw new LivePhotoAutoFlowHandledError('Live Photo waiting for placement confirmation', false)
    }
    // 融合出了几张图：停下来等用户挑一张（不算失败、不计重试）
    if (String(error?.message || '').includes('[awaiting_still_pick]')) {
      await livePhotoRepo.upsert({
        ...appendLivePhotoLogs(latestPersisted, [buildLivePhotoLog('[live-photo] 等待挑图')]),
        awaitingStillPick: true,
        packagingStatus: 'processing',
        error: undefined,
        autoFlowStatus: { ...current, status: 'idle', paused: true, currentStage: 'image_generation', failedStage: undefined, lastError: '' },
        workflow: patchWorkflow(latestPersisted.workflow, 'image_generation', 'image_generation', 'idle'),
        updatedAt: now(),
      })
      throw new LivePhotoAutoFlowHandledError('Live Photo waiting for the user to pick a still', false)
    }
    const currentStage = resolveLivePhotoFailureStage(
      latestPersisted,
      latestPersisted.workflow?.currentStep || current.currentStage || 'queued',
    )
    const reason = normalizeRemotePendingTimeoutReason(
      latestPersisted,
      currentStage,
      normalizeLivePhotoFailureReasonSafe(String(error?.message || error || 'Unknown error'), currentStage),
    )
    const retryLimit = resolveLivePhotoRetryLimit(currentStage, current.retryLimit)
    const failureStage = currentStage === 'image_generation' || currentStage === 'image_validation' ? 'image' as const : 'video' as const
    const stageRetryCount = resolveLivePhotoStageRetryCount({
      stage: failureStage,
      retryCount: current.retryCount,
      imageRetryCount: current.imageRetryCount,
      videoRetryCount: current.videoRetryCount,
    })
    const regionRequired = reason.includes('[replacement_region_required]')
    const imageValidationFailure =
      (currentStage === 'image_generation' || currentStage === 'image_validation') && isLivePhotoImageValidationFailure(reason)
    const manualImageAttempt = current.imageRetryMode === 'manual_once' &&
      (currentStage === 'image_generation' || currentStage === 'image_validation')
    const imageRetryDecision = resolveLivePhotoImageRetryFailure({
      retryCount: stageRetryCount,
      retryLimit,
      retryMode: current.imageRetryMode,
    })
    const canAutoRetryImage = imageValidationFailure && imageRetryDecision.shouldRetry
    const nextRetryCount = regionRequired || manualImageAttempt
      ? stageRetryCount
      : canAutoRetryImage
        ? imageRetryDecision.nextRetryCount
        : Math.min(retryLimit, stageRetryCount + 1)
    const terminalByStage = shouldForceTerminalLivePhotoFailure(currentStage, reason)
    const terminal = manualImageAttempt || terminalByStage || (imageValidationFailure ? !canAutoRetryImage : nextRetryCount >= retryLimit)
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
          failedStage: undefined,
          retryScope: undefined,
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
      generatedStillPath: canAutoRetryImage ? undefined : latestPersisted.generatedStillPath,
      imageTaskId: imageValidationFailure ? undefined : latestPersisted.imageTaskId,
      imageTaskProvider: imageValidationFailure ? undefined : latestPersisted.imageTaskProvider,
      imageTaskModel: imageValidationFailure ? undefined : latestPersisted.imageTaskModel,
      imageTaskBaseUrl: imageValidationFailure ? undefined : latestPersisted.imageTaskBaseUrl,
      imageTaskEndpointStyle: imageValidationFailure ? undefined : latestPersisted.imageTaskEndpointStyle,
      autoFlowStatus: {
        ...current,
        retryLimit,
        retryCount: nextRetryCount,
        imageRetryCount: failureStage === 'image' ? nextRetryCount : current.imageRetryCount,
        videoRetryCount: failureStage === 'video' ? nextRetryCount : current.videoRetryCount,
        failedStage: failureStage,
        retryScope: failureStage,
        status: terminal ? 'failed_terminal' : 'failed_retryable',
        paused: (imageValidationFailure || manualImageAttempt) && terminal ? true : current.paused,
        currentStage,
        lastError: reason,
      },
      workflow: patchWorkflow(
        latestPersisted.workflow,
        currentStage,
        currentStage,
        'failed',
        terminal && !regionRequired ? `[retry_limit] ${reason}` : reason,
      ),
      error: terminal && !regionRequired
        ? `[retry_limit] ${failureStage === 'video' ? 'Video generation' : 'Image generation'} retry limit reached after ${retryLimit} attempts. ${reason}`
        : reason,
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
      const retryLimit = resolveLivePhotoRetryLimit(currentStage, current.retryLimit)
      const failureStage = currentStage === 'image_generation' || currentStage === 'image_validation' ? 'image' as const : 'video' as const
      const stageRetryCount = resolveLivePhotoStageRetryCount({
        stage: failureStage,
        retryCount: current.retryCount,
        imageRetryCount: current.imageRetryCount,
        videoRetryCount: current.videoRetryCount,
      })
      const regionRequired = reason.includes('[replacement_region_required]')
      const imageValidationFailure =
        (currentStage === 'image_generation' || currentStage === 'image_validation') && isLivePhotoImageValidationFailure(reason)
      const manualImageAttempt = current.imageRetryMode === 'manual_once' &&
        (currentStage === 'image_generation' || currentStage === 'image_validation')
      const imageRetryDecision = resolveLivePhotoImageRetryFailure({
        retryCount: stageRetryCount,
        retryLimit,
        retryMode: current.imageRetryMode,
      })
      const canAutoRetryImage = imageValidationFailure && imageRetryDecision.shouldRetry
      const nextRetryCount = regionRequired || manualImageAttempt
        ? stageRetryCount
        : canAutoRetryImage
          ? imageRetryDecision.nextRetryCount
          : Math.min(retryLimit, stageRetryCount + 1)
      const terminal = manualImageAttempt || shouldForceTerminalLivePhotoFailure(currentStage, reason) ||
        (imageValidationFailure ? !canAutoRetryImage : nextRetryCount >= retryLimit)
      await livePhotoRepo.upsert({
        ...appendLivePhotoLogs(latest, [
          buildLivePhotoLog(`[live-photo] queue-level failure: ${reason}`, 'error'),
        ]),
        packagingStatus: 'failed',
        autoFlowStatus: {
          ...current,
          retryLimit,
          retryCount: nextRetryCount,
          imageRetryCount: failureStage === 'image' ? nextRetryCount : current.imageRetryCount,
          videoRetryCount: failureStage === 'video' ? nextRetryCount : current.videoRetryCount,
          failedStage: failureStage,
          retryScope: failureStage,
          status: terminal ? 'failed_terminal' : 'failed_retryable',
          paused: (imageValidationFailure || manualImageAttempt) && terminal ? true : current.paused,
          currentStage,
          lastError: reason,
        },
        error: terminal
          ? (regionRequired
            ? reason
            : `[retry_limit] ${failureStage === 'video' ? 'Video generation' : 'Image generation'} retry limit reached after ${retryLimit} attempts. ${reason}`)
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
  const template = input.styleReferenceId ? await styleReferenceService.get(input.styleReferenceId) : undefined
  if (input.styleReferenceId && !template) throw new Error('同款模板不存在，请重新上传参考视频')
  const styleReference: LivePhotoItem['styleReference'] = template
    ? {
        id: template.id,
        videoName: template.videoName,
        camera: template.camera,
        action: template.action,
        lighting: template.lighting,
        background: template.background,
        style: template.style,
      }
    : undefined
  const referenceImagePaths = template ? [template.firstFramePath] : normalizeLivePhotoScenePaths(input)
  const product = await buildProductSnapshot(String(input.productId || '').trim())
  const credentials = await cloneRepo.getCredentials()
  const videoChoice = resolveLivePhotoVideoChoice(credentials, input)
  // 这里存的是「替换商品图」用的图片提示词；视频提示词在提交视频时才用
  const promptVersion = livePhotoPromptVersionService.getActive('image')
  ensureLivePhotoStrictImageEditProvider(credentials)
  const motionTemplate = input.motionTemplate || 'push_in'
  const retryLimit = await getConfiguredLivePhotoRetryLimit()
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
      styleReference,
      ...videoChoice,
      // 贴真实商品：能抠图（已登录）且有 GRS.AI 时默认用；否则走原来的 AI 直接画
      ...(canUsePasteReplace(credentials)
        ? {
            replaceMode: 'paste' as const,
            placementMode: input.placementMode === 'confirm' ? ('confirm' as const) : ('auto' as const),
            cutoutSourcePath: String(input.cutoutSourcePath || '').trim() || undefined,
            cutoutSourceChosenBy: String(input.cutoutSourcePath || '').trim() ? ('user' as const) : undefined,
          }
        : {}),
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
          styleReference,
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
      autoFlowStatus: {
        ...buildDefaultAutoFlowStatus(),
        retryLimit,
        imageRetryMode: 'auto',
      },
      logs: [
        buildLivePhotoLog('[live-photo] reference task created'),
        buildLivePhotoLog(`[live-photo] reference image selected: ${referenceImagePath}`),
        buildLivePhotoLog(`[live-photo] product selected: ${product.name}`),
        ...(styleReference ? [buildLivePhotoLog(`[live-photo] 同款模板: ${styleReference.videoName}`)] : []),
      ],
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    created.push(await livePhotoRepo.upsert(item))
  }
  return { created, product, referenceImagePaths, motionTemplate }
}

export type ExternalReferenceImagePreparationState = {
  productSnapshot?: LivePhotoProductSnapshot
  imagePromptPreview?: LivePhotoRequestPreview
  promptVersionId?: string
  promptVersion?: number
  promptHash?: string
  replacementPrompt?: string
  replacementRegion?: LivePhotoReplacementRegion
  sceneInteraction?: LivePhotoSceneInteraction
  generationAttempts?: LivePhotoGenerationAttempt[]
  qualityReport?: LivePhotoQualityReport
  generatedStillPath?: string
  imageTaskId?: string
  imageTaskProvider?: string
  imageTaskModel?: string
  imageTaskBaseUrl?: string
  imageTaskEndpointStyle?: string
}

export async function prepareReferenceImageForExternalWorkflow(input: {
  workflowId: string
  referenceImagePath: string
  productId: string
  outputRoot: string
  state?: ExternalReferenceImagePreparationState
  promptVersion?: {
    id: string
    version: number
    prompt: string
    promptHash: string
  }
  qualityCheckerEnabled?: boolean
}) {
  const timestamp = now()
  const product = input.state?.productSnapshot || await buildProductSnapshot(String(input.productId || '').trim())
  const credentials = await cloneRepo.getCredentials()
  ensureLivePhotoStrictImageEditProvider(credentials)
  const externalPrompt = String(input.state?.replacementPrompt || input.promptVersion?.prompt || DEFAULT_LIVE_PHOTO_REPLACEMENT_PROMPT).trim()
  const externalPromptHash = input.promptVersion?.promptHash || hashLivePhotoPrompt(externalPrompt)
  const imagePromptPreview = input.state?.imagePromptPreview || buildReferenceReplacementImagePromptPreview({
    product,
    referenceImagePath: input.referenceImagePath,
    credentials,
    prompt: externalPrompt,
  })
  let item: LivePhotoItem = {
    id: String(input.workflowId || '').trim(),
    sourceType: 'reference_replace',
    productId: product.id,
    productSnapshot: product,
    referenceImagePath: input.referenceImagePath,
    packagingStatus: 'processing',
    imagePromptPreview,
    promptVersionId: input.state?.promptVersionId || input.promptVersion?.id || 'shared-reference-replacement-default',
    promptVersion: input.state?.promptVersion || input.promptVersion?.version || 1,
    promptHash: input.state?.promptHash || externalPromptHash,
    replacementRegion: input.state?.replacementRegion,
    sceneInteraction: input.state?.sceneInteraction,
    generationAttempts: input.state?.generationAttempts || [],
    qualityReport: input.state?.qualityReport,
    generatedStillPath: input.state?.generatedStillPath,
    imageTaskId: input.state?.imageTaskId,
    imageTaskProvider: input.state?.imageTaskProvider,
    imageTaskModel: input.state?.imageTaskModel,
    imageTaskBaseUrl: input.state?.imageTaskBaseUrl,
    imageTaskEndpointStyle: input.state?.imageTaskEndpointStyle,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  const toState = (current: LivePhotoItem): ExternalReferenceImagePreparationState => ({
    productSnapshot: product,
    imagePromptPreview,
    promptVersionId: current.promptVersionId,
    promptVersion: current.promptVersion,
    promptHash: current.promptHash,
    replacementPrompt: externalPrompt,
    replacementRegion: current.replacementRegion,
    sceneInteraction: current.sceneInteraction,
    generationAttempts: current.generationAttempts,
    qualityReport: current.qualityReport,
    generatedStillPath: current.generatedStillPath,
    imageTaskId: current.imageTaskId,
    imageTaskProvider: current.imageTaskProvider,
    imageTaskModel: current.imageTaskModel,
    imageTaskBaseUrl: current.imageTaskBaseUrl,
    imageTaskEndpointStyle: current.imageTaskEndpointStyle,
  })
  if (item.generatedStillPath && existsSync(item.generatedStillPath) && (input.qualityCheckerEnabled === false || item.qualityReport?.decision === 'pass')) {
    return { pending: false, preparedImagePath: item.generatedStillPath, state: toState(item) }
  }
  if (!item.replacementRegion || !item.sceneInteraction) {
    if (input.qualityCheckerEnabled === false) {
      // Quality scoring off also disables optional AI localization.
      const fallbackRegion = item.replacementRegion || {
        x: 0.25,
        y: 0.25,
        width: 0.5,
        height: 0.5,
        source: 'auto' as const,
        confidence: 0,
        revision: 1,
        updatedAt: now(),
      }
      item = {
        ...item,
        replacementRegion: fallbackRegion,
        sceneInteraction: item.sceneInteraction || {
          mode: 'unknown',
          confidence: 0,
          revision: fallbackRegion.revision,
          updatedAt: now(),
        },
        updatedAt: now(),
      }
    } else {
      const located = await locateLivePhotoReplacementRegion({ item, product, scenePath: input.referenceImagePath })
      item = { ...item, replacementRegion: located.region, sceneInteraction: located.sceneInteraction, updatedAt: now() }
    }
  }
  let generatedPath = ''
  if (item.imageTaskId) {
    const polled = await pollReferenceReplacementStillTask({
      item,
      outputDir: join(input.outputRoot, 'generated-crops'),
      outputRoot: input.outputRoot,
    })
    if (!polled.synced || !polled.outputPath) {
      return { pending: true, preparedImagePath: '', state: toState(item) }
    }
    generatedPath = polled.outputPath
    item = {
      ...item,
      imageTaskId: undefined,
      imageTaskProvider: undefined,
      imageTaskModel: undefined,
      imageTaskBaseUrl: undefined,
      imageTaskEndpointStyle: undefined,
    }
  } else {
    const submitted = await withTimeout(
      submitReferenceReplacementStillTask({
        item,
        product,
        referenceImagePath: input.referenceImagePath,
        outputRoot: input.outputRoot,
      }),
      LIVE_PHOTO_REFERENCE_STILL_TIMEOUT_MS,
      'Reference still generation',
    )
    if (submitted.mode === 'remote') {
      item = {
        ...item,
        imageTaskId: submitted.taskId,
        imageTaskProvider: submitted.provider,
        imageTaskModel: submitted.model,
        imageTaskBaseUrl: submitted.baseUrl,
        imageTaskEndpointStyle: submitted.endpointStyle,
        updatedAt: now(),
      }
      return { pending: true, preparedImagePath: '', state: toState(item) }
    }
    generatedPath = submitted.stillPath
  }
  const preparedImagePath = await finalizeGeneratedLivePhotoReplacement({
    item,
    scenePath: input.referenceImagePath,
    generatedCropPath: generatedPath,
    outputRoot: input.outputRoot,
  })
  const qualityReport = undefined
  const attempt: LivePhotoGenerationAttempt = {
    id: randomUUID(),
    index: (item.generationAttempts || []).length + 1,
    outputPath: preparedImagePath,
    provider: imagePromptPreview.provider,
    model: imagePromptPreview.model,
    strategy: inferLivePhotoReplacementStrategy({ item, product }),
    negativePrompt: buildReferenceReplacementNegativePrompt({ product, sceneInteraction: item.sceneInteraction }),
    cacheHit: false,
    quality: qualityReport,
    regionRevision: item.replacementRegion?.revision,
    createdAt: now(),
  }
  item = {
    ...item,
    generatedStillPath: preparedImagePath,
    qualityReport,
    generationAttempts: [...(item.generationAttempts || []), attempt],
    updatedAt: now(),
  }
  return {
    pending: false,
    preparedImagePath,
    failed: false,
    error: undefined,
    state: toState(item),
  }
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
  const videoChoice = resolveLivePhotoVideoChoice(credentials, input)
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
      ...videoChoice,
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
    if (input.reviewLivePhotoReplacementPlacement) livePhotoDeps.reviewLivePhotoReplacementPlacement = input.reviewLivePhotoReplacementPlacement
    if (input.downloadRetryDelaysMs) livePhotoDeps.downloadRetryDelaysMs = input.downloadRetryDelaysMs
  },

  async resetTestDependencies() {
    await drainLivePhotoAutoFlowForTests()
    livePhotoDeps.runFfmpeg = runFfmpeg
    livePhotoDeps.generateGptShotFrameImage = generateGptShotFrameImage
    livePhotoDeps.generateShotVideoByProviderChain = generateShotVideoByProviderChain
    livePhotoDeps.analyzeProductStructureWithGrs = analyzeProductStructureWithGrs
    livePhotoDeps.reviewReferenceReplacementStillStrict = reviewReferenceReplacementStillStrict
    livePhotoDeps.reviewReferenceReplacementStillVisual = reviewReferenceReplacementStillVisual
    livePhotoDeps.reviewLivePhotoReplacementPlacement = reviewLivePhotoReplacementPlacement
    livePhotoDeps.downloadRetryDelaysMs = undefined
    clearLivePhotoPendingTimers()
    livePhotoAutoFlowScheduled.clear()
    livePhotoAutoFlowLastQueuedAt.clear()
  },

  async list() {
    const items = await livePhotoRepo.list()
    return items.map((item) => hydrateLivePhotoArtifactPaths(item))
  },

  async listSummaries(input?: { page?: number; pageSize?: number; filter?: 'all' | 'failed' | 'running' | 'paused' | 'success_not_exported' | 'success_exported' | 'success_not_subtitled' }) {
    const page = Math.max(1, Number(input?.page || 1) || 1)
    const pageSize = Math.max(1, Math.min(200, Number(input?.pageSize || 24) || 24))
    const filter = ['failed', 'running', 'paused', 'success_not_exported', 'success_exported', 'success_not_subtitled'].includes(String(input?.filter)) ? input?.filter as string : 'all'
    const allItems = await livePhotoRepo.list()
    const isFailed = (item: LivePhotoItem) =>
      item.packagingStatus === 'failed' ||
      item.autoFlowStatus?.status === 'failed_retryable' ||
      item.autoFlowStatus?.status === 'failed_terminal'
    const isRunning = (item: LivePhotoItem) =>
      item.packagingStatus === 'processing' || item.autoFlowStatus?.status === 'running'
    const isPaused = (item: LivePhotoItem) => Boolean(item.autoFlowStatus?.paused)
    const stats = {
      total: allItems.length,
      running: allItems.filter(isRunning).length,
      failed: allItems.filter(isFailed).length,
      paused: allItems.filter(isPaused).length,
    }
    const items =
      filter === 'failed'
        ? allItems.filter(isFailed)
        : filter === 'running'
          ? allItems.filter(isRunning)
          : filter === 'paused'
            ? allItems.filter(isPaused)
            : filter === 'success_exported'
              ? allItems.filter((item) => item.packagingStatus === 'completed' && Boolean(item.exportBundlePath))
              : filter === 'success_not_exported'
                ? allItems.filter((item) => item.packagingStatus === 'completed' && !item.exportBundlePath)
                : filter === 'success_not_subtitled'
                  ? allItems.filter((item) => item.packagingStatus === 'completed' && !item.subtitleOverlay?.active)
            : allItems
    const total = items.length
    const totalPages = Math.max(1, Math.ceil(total / pageSize))
    const safePage = Math.min(page, totalPages)
    const sortedItems = items.slice().sort((a, b) => {
      const delta = Number(b.createdAt || 0) - Number(a.createdAt || 0)
      if (delta) return delta
      return String(b.id).localeCompare(String(a.id))
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
      stats,
    }
  },

  async getSettings() {
    return await livePhotoRepo.getSettings()
  },

  async saveSettings(input: any) {
    return await livePhotoRepo.saveSettings(input || {})
  },

  async listPromptVersions(kind: 'image' | 'video' = 'image') {
    return livePhotoPromptVersionService.list(kind)
  },

  async createPromptVersion(input: { name: string; prompt: string; kind?: 'image' | 'video' }) {
    return livePhotoPromptVersionService.save(input)
  },

  async updatePromptVersion(input: { id: string; name: string; prompt: string; kind?: 'image' | 'video' }) {
    const updated = livePhotoPromptVersionService.save(input)
    if (updated.active && updated.kind === 'image') await syncLivePhotoPromptVersionToPendingItems(updated)
    return updated
  },

  async activatePromptVersion(input: { id: string; kind?: 'image' | 'video' }) {
    const active = livePhotoPromptVersionService.activate(String(input?.id || '').trim())
    if (active.kind === 'image') await syncLivePhotoPromptVersionToPendingItems(active)
    return active
  },

  async rollbackPromptVersion(input: { id: string; kind?: 'image' | 'video' }) {
    const active = livePhotoPromptVersionService.rollback(String(input?.id || '').trim())
    if (active.kind === 'image') await syncLivePhotoPromptVersionToPendingItems(active)
    return active
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
      // 已提交过就显示当时真正发出去的；还没到视频这步才按当前启用的版本预览
      videoPromptPreview: hydrated.videoPromptSent?.prompt ? hydrated.videoPromptSent : resolveLivePhotoVideoPreview(hydrated, credentials),
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

  /** 图生视频可选模型：后台打开了、平台有 Key 的；页面用它做模型下拉 */
  async listVideoModels() {
    return listAvailableCatalogVideoModels(await cloneRepo.getCredentials())
  },

  async createFromReference(input: CreateReferenceLivePhotoInput) {
    const queued = await createReferenceProcessingItems(input)
    startReferenceCompletionBatch(queued)
    return queued.referenceImagePaths.length === 1 ? queued.created[0] : queued.created
  },

  /** 同款批量：one item per product, all copying the same reference clip. */
  async createFromStyleReference(input: { styleReferenceId: string; productIds: string[]; videoModelId?: string; videoDurationSec?: number; videoResolution?: string; videoZoomPercent?: number }) {
    const productIds = Array.from(new Set((Array.isArray(input.productIds) ? input.productIds : []).map((id) => String(id || '').trim()).filter(Boolean)))
    if (!productIds.length) throw new Error('请至少选择一个商品')
    const batches = []
    for (const productId of productIds) {
      batches.push(
        await createReferenceProcessingItems({
          productId,
          styleReferenceId: input.styleReferenceId,
          videoModelId: input.videoModelId,
          videoDurationSec: input.videoDurationSec,
          videoResolution: input.videoResolution,
          videoZoomPercent: input.videoZoomPercent,
        }),
      )
    }
    batches.forEach((queued) => startReferenceCompletionBatch(queued))
    return { count: batches.length, ids: batches.flatMap((queued) => queued.created.map((item) => item.id)) }
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
  async revertSubtitleVideosFromItems(input: { ids: string[] }) {
    const results = []
    for (const id of Array.isArray(input.ids) ? input.ids : []) {
      try { results.push(await this.revertSubtitleVideoFromItem({ id })) } catch { /* continue */ }
    }
    return { reverted: results.length, items: results }
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
    // 重试时换了模型 / 时长：记下新选择，丢掉旧的视频任务，视频这一步重新提交
    if (input.videoModelId !== undefined || input.videoDurationSec !== undefined || input.videoResolution !== undefined || input.videoZoomPercent !== undefined) {
      const choice = resolveLivePhotoVideoChoice(await cloneRepo.getCredentials(), {
        videoModelId: input.videoModelId ?? existing.videoModelId,
        videoDurationSec: input.videoDurationSec ?? existing.videoDurationSec,
        videoResolution: input.videoResolution ?? existing.videoResolution,
        videoZoomPercent: input.videoZoomPercent ?? existing.videoZoomPercent,
      })
      const changed =
        choice.videoModelId !== existing.videoModelId ||
        choice.videoDurationSec !== existing.videoDurationSec ||
        choice.videoResolution !== existing.videoResolution ||
        choice.videoZoomPercent !== existing.videoZoomPercent
      if (changed) {
        Object.assign(existing, choice, {
          videoLastFramePath: choice.videoZoomPercent !== existing.videoZoomPercent ? undefined : existing.videoLastFramePath,
          videoTaskId: undefined,
          videoTaskProvider: undefined,
          videoTaskModel: undefined,
          videoTaskBaseUrl: undefined,
          videoTaskEndpointStyle: undefined,
          updatedAt: now(),
        })
        await livePhotoRepo.upsert(existing)
      }
    }
    const imageRetryMode = input.retryMode === 'manual_once' ? 'manual_once' : 'auto'
    const existingAutoFlowStatus = ensureAutoFlowStatus(existing)
    const manualReplacementRegion = input.replacementRegion
      ? normalizeLivePhotoReplacementRegion({
          ...input.replacementRegion,
          source: 'manual',
          revision: Math.max(1, Number(existing.replacementRegion?.revision || 0) + 1),
          updatedAt: now(),
        })
      : null
    if (input.replacementRegion && !manualReplacementRegion) throw new Error('Invalid Live Photo replacement region')
    const activePromptVersion = livePhotoPromptVersionService.getActive('image')
    const preservedStillPath = String(existing.generatedStillPath || '').trim()
    const persistedStage = resolveLivePhotoStage({
      failedStage: existingAutoFlowStatus.failedStage,
      currentStage: existingAutoFlowStatus.currentStage || existing.workflow?.currentStep,
      imageTaskId: existing.imageTaskId,
      videoTaskId: existing.videoTaskId,
    })
    const videoStageCandidate = Boolean(
      !manualReplacementRegion &&
      !input.forceImageStage &&
      persistedStage === 'video' &&
      preservedStillPath &&
      existsSync(preservedStillPath) &&
      (String(existing.videoTaskId || '').trim() ||
        String(existing.motionVideoPath || '').trim() ||
        ensureAutoFlowStatus(existing).currentStage === 'video_generation'),
    )
    const promptChanged = Boolean(
      String(existing.promptHash || '').trim() &&
        String(existing.promptHash || '').trim() !== activePromptVersion.promptHash,
    )
    // 视频那步失败、但首帧图已经不在（比如任务文件被清理）：没法只重做视频，
    // 以前这里直接报错，任务就再也救不回来了；现在从生成图片那步重做，并记一笔日志
    if (existingAutoFlowStatus.failedStage === 'video' && (!preservedStillPath || !existsSync(preservedStillPath))) {
      existing.logs = [
        ...(Array.isArray(existing.logs) ? existing.logs : []),
        buildLivePhotoLog('[live-photo] 首帧图已不在，重试改为从生成图片开始重做', 'error'),
      ].slice(-200)
    }
    const canRetryFromVideoStage = videoStageCandidate && !promptChanged
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
            sceneInteraction: existing.sceneInteraction,
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
      replacementRegion: manualReplacementRegion || existing.replacementRegion,
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
      await clearMaterializedArtifactsForVideoRetry(existing.id)
      processingItem.generatedStillPath = preservedStillPath
      processingItem.originalMotionVideoPath = undefined
      processingItem.motionVideoPath = undefined
      processingItem.imageTaskId = undefined
      processingItem.imageTaskProvider = undefined
      processingItem.imageTaskModel = undefined
      processingItem.imageTaskBaseUrl = undefined
      processingItem.imageTaskEndpointStyle = undefined
      // 上次是远端已出片、只是下载失败（例如文件服务器 504）：保留远端任务，重试只重新下载，不重新生成扣费
      const keepRemoteVideoTask =
        Boolean(String(existing.videoTaskId || '').trim()) &&
        isTransientDownloadFailure(existing.error || ensureAutoFlowStatus(existing).lastError)
      if (!keepRemoteVideoTask) {
        processingItem.videoTaskId = undefined
        processingItem.videoTaskProvider = undefined
        processingItem.videoTaskModel = undefined
        processingItem.videoTaskBaseUrl = undefined
        processingItem.videoTaskEndpointStyle = undefined
      }
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
        retryCount: ensureAutoFlowStatus(existing).retryCount,
        imageRetryCount: ensureAutoFlowStatus(existing).imageRetryCount,
        videoRetryCount: ensureAutoFlowStatus(existing).videoRetryCount,
        retryLimit: ensureAutoFlowStatus(existing).retryLimit,
        imageRetryMode: canRetryFromVideoStage ? 'auto' : imageRetryMode,
        currentStage: 'video_generation',
        failedStage: undefined,
        retryScope: 'video',
        lastStartedAt: undefined,
        lastCompletedAt: undefined,
        lastError: '',
      }
      processingItem.logs = [
        ...(Array.isArray(existing.logs) ? existing.logs : []),
        buildLivePhotoLog('[live-photo] manual retry preserved generated still and restarted from video_generation stage'),
      ].slice(-200)
    } else {
      await clearMaterializedArtifactsForImageRetry(existing.id)
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
      processingItem.packagingManifestPath = undefined
      processingItem.cacheKey = undefined
      processingItem.cacheHit = false
      processingItem.workflow = buildDefaultWorkflow()
      processingItem.autoFlowStatus = {
        ...buildDefaultAutoFlowStatus(),
        enabled: true,
        status: 'idle',
        paused: false,
        retryCount: imageRetryMode === 'manual_once' ? existingAutoFlowStatus.retryCount : 0,
        imageRetryCount: imageRetryMode === 'manual_once' ? existingAutoFlowStatus.imageRetryCount : 0,
        videoRetryCount: existingAutoFlowStatus.videoRetryCount,
        retryLimit: existingAutoFlowStatus.retryLimit,
        currentStage: 'queued',
        failedStage: undefined,
        retryScope: 'image',
        imageRetryMode,
      }
      processingItem.logs = [
        ...(Array.isArray(existing.logs) ? existing.logs : []),
        buildLivePhotoLog(
          manualReplacementRegion
            ? `[live-photo] replacement region corrected manually: revision=${manualReplacementRegion.revision}`
            : persistedStage === 'video'
              ? '[live-photo] manual retry preserved generated still and restarted from video_generation stage; legacy still missing, regenerated image'
              : '[live-photo] manual retry restarted from image_generation stage',
        ),
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

  /**
   * 「调整摆放」弹窗要的数据：擦好旧商品的参考图、抠好的商品、当前摆放和默认摆放（大小 100% = 和原商品一样大）。
   * 擦除、抠图还没做完时 ready=false。
   */
  async getPlacement(input: { id: string }) {
    const existing = await livePhotoRepo.get(String(input?.id || '').trim())
    if (!existing) throw new Error('任务不存在')
    if (existing.replaceMode !== 'paste') throw new Error('这个任务不是「贴真实商品」方式生成的，不能调整摆放')
    const region = normalizeLivePhotoReplacementRegion(existing.replacementRegion)
    const erased = String(existing.erasedScenePath || '').trim()
    const cutoutPath = String(existing.productCutoutPath || '').trim()
    if (!region || !erased || !existsSync(erased) || !cutoutPath || !existsSync(cutoutPath)) {
      return { ready: false as const, message: '还在擦除旧商品、抠图，稍等一下再调整' }
    }
    const scene = await readImageSize(erased)
    const cutout = await readImageSize(cutoutPath)
    const defaultPlacement = defaultProductPlacement({ region, sceneWidth: scene.width, sceneHeight: scene.height, cutoutWidth: cutout.width, cutoutHeight: cutout.height, foreshortened: existing.productViewCheck?.view === 'flat' })
    return {
      ready: true as const,
      erasedScenePath: erased,
      cutoutPath,
      sceneWidth: scene.width,
      sceneHeight: scene.height,
      cutoutWidth: cutout.width,
      cutoutHeight: cutout.height,
      region: { x: region.x, y: region.y, width: region.width, height: region.height },
      placement: normalizeProductPlacement(existing.placement) ?? defaultPlacement,
      defaultPlacement,
    }
  },

  /** 确认摆放：记下摆放，从出图那步重做（融合 → 视频）。擦除和抠图结果复用，不重复扣费 */
  async confirmPlacement(input: { id: string; placement: unknown; motionTemplate?: LivePhotoMotionTemplate }) {
    const existing = await livePhotoRepo.get(String(input?.id || '').trim())
    if (!existing) throw new Error('任务不存在')
    if (existing.replaceMode !== 'paste') throw new Error('这个任务不是「贴真实商品」方式生成的，不能调整摆放')
    const placement = normalizeProductPlacement(input.placement)
    if (!placement) throw new Error('摆放数据不对，请重新调整')
    await livePhotoRepo.upsert({
      ...appendLivePhotoLogs(existing, [buildLivePhotoLog(`[live-photo] 确认商品摆放：宽 ${(placement.width * 100).toFixed(1)}%，角度 ${Math.round(placement.rotation)}°`)]),
      placement: { ...placement, confirmedAt: now() },
      awaitingPlacement: false,
      // 摆放变了：之前融合出的几张作废，重新出
      stillCandidates: undefined,
      pickedStillIndex: undefined,
      awaitingStillPick: false,
      updatedAt: now(),
    })
    return await this.retry({ id: existing.id, motionTemplate: input.motionTemplate, forceImageStage: true })
  },

  /** 「挑图」弹窗要的数据：融合出的几张图、原参考图 */
  async getStillCandidates(input: { id: string }) {
    const existing = await livePhotoRepo.get(String(input?.id || '').trim())
    if (!existing) throw new Error('任务不存在')
    const candidates = (existing.stillCandidates || []).map((candidate, index) => ({ index, path: candidate.path, ok: Boolean(candidate.path && existsSync(candidate.path)) }))
    return {
      referenceImagePath: resolveLivePhotoReferenceImagePath(existing) || '',
      region: normalizeLivePhotoReplacementRegion(existing.replacementRegion) || null,
      candidates: candidates.filter((candidate) => candidate.ok).map(({ index, path }) => ({ index, path })),
      pickedIndex: typeof existing.pickedStillIndex === 'number' ? existing.pickedStillIndex : null,
    }
  },

  /** 挑一张：记下挑的那张，从出图那步续跑（直接用挑的图，不再生成），接着做视频 */
  async pickStill(input: { id: string; index: number; motionTemplate?: LivePhotoMotionTemplate }) {
    const existing = await livePhotoRepo.get(String(input?.id || '').trim())
    if (!existing) throw new Error('任务不存在')
    const index = Math.round(Number(input?.index))
    const candidate = existing.stillCandidates?.[index]
    if (!candidate?.path || !existsSync(candidate.path)) throw new Error('这张图不在了，请重新生成')
    await livePhotoRepo.upsert({
      ...appendLivePhotoLogs(existing, [buildLivePhotoLog(`[live-photo] 挑了第 ${index + 1} 张图`)]),
      pickedStillIndex: index,
      awaitingStillPick: false,
      updatedAt: now(),
    })
    return await this.retry({ id: existing.id, motionTemplate: input.motionTemplate, forceImageStage: true })
  },

  /** 几张都不满意：丢掉，重新融合出几张（擦图、抠图、摆放都复用） */
  async regenerateStills(input: { id: string; motionTemplate?: LivePhotoMotionTemplate }) {
    const existing = await livePhotoRepo.get(String(input?.id || '').trim())
    if (!existing) throw new Error('任务不存在')
    await livePhotoRepo.upsert({
      ...appendLivePhotoLogs(existing, [buildLivePhotoLog('[live-photo] 几张都不满意，重新融合')]),
      stillCandidates: undefined,
      pickedStillIndex: undefined,
      awaitingStillPick: false,
      updatedAt: now(),
    })
    return await this.retry({ id: existing.id, motionTemplate: input.motionTemplate, forceImageStage: true })
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
      const current = ensureAutoFlowStatus(item)
      const inferredStage = resolveLivePhotoStage({
        failedStage: current.failedStage,
        currentStage: current.currentStage || item.workflow?.currentStep,
        imageTaskId: item.imageTaskId,
        videoTaskId: item.videoTaskId,
      })
      const rawStatus = item.autoFlowStatus
      const needsStageBackfill = item.packagingStatus === 'failed' &&
        (!rawStatus?.failedStage || !rawStatus?.retryScope || rawStatus.imageRetryCount === undefined || rawStatus.videoRetryCount === undefined)
      if (needsStageBackfill) {
        await livePhotoRepo.upsert({
          ...item,
          autoFlowStatus: {
            ...current,
            failedStage: inferredStage,
            retryScope: inferredStage,
            imageRetryCount: current.imageRetryCount ?? (inferredStage === 'image' ? current.retryCount : 0),
            videoRetryCount: current.videoRetryCount ?? (inferredStage === 'video' ? current.retryCount : 0),
          },
          updatedAt: now(),
        })
      }
      if (!shouldUpgradeFailedItemToTerminal(item)) continue
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
    const resumable = normalizedItems.filter((item) =>
      canResumeLivePhotoAutoFlow(item) &&
      Boolean(String(item.imageTaskId || '').trim() || String(item.videoTaskId || '').trim()),
    )
    console.log('[live-photo-debug] startup-resume-scan', {
      totalItemCount: normalizedItems.length,
      resumableCount: resumable.length,
      itemIds: resumable.map((item) => item.id),
      autoResumeDisabled: false,
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

  async continueWithVideo(input: { id: string; motionTemplate?: LivePhotoMotionTemplate }) {
    const id = String(input.id || '').trim()
    if (!id) throw new Error('Live Photo item id is required')
    const existing = await livePhotoRepo.get(id)
    if (!existing) throw new Error('Live Photo item not found')
    const current = ensureAutoFlowStatus(existing)
    const reason = String(current.lastError || existing.error || '').trim()
    const retryLimit = Number(current.retryLimit || 0)
    const retryCount = resolveLivePhotoStageRetryCount({
      stage: 'image',
      retryCount: current.retryCount,
      imageRetryCount: current.imageRetryCount,
      videoRetryCount: current.videoRetryCount,
    })
    if (current.failedStage === 'video' || current.retryScope === 'video' || !isLivePhotoImageValidationFailure(reason) || (current.imageRetryMode !== 'manual_once' && retryCount < retryLimit) || !current.paused) {
      throw new Error('This item is not paused after image validation retries')
    }
    const stillPath = String(existing.generatedStillPath || '').trim()
    if (!stillPath || !existsSync(stillPath)) throw new Error('The generated image is no longer available')
    const next = await livePhotoRepo.upsert({
      ...appendLivePhotoLogs(existing, [
        buildLivePhotoLog('[live-photo] image validation bypassed by user; continuing with video generation', 'info'),
      ]),
      packagingStatus: 'processing',
      error: undefined,
      autoFlowStatus: {
        ...current,
        paused: false,
        status: 'running',
        currentStage: 'video_generation',
        failedStage: undefined,
        retryScope: 'video',
        imageValidationBypassed: true,
        lastError: '',
      },
      workflow: patchWorkflow(
        patchWorkflow(existing.workflow, 'image_validation', 'image_validation', 'failed', reason),
        'video_generation',
        'video_generation',
        'running',
      ),
      updatedAt: now(),
    })
    enqueueLivePhotoAutoFlow(
      next.id,
      input.motionTemplate || (next.sourceType === 'reference_replace' ? 'push_in' : 'ambient_sway'),
      'manual_continue_with_video',
      { bypassCooldown: true },
    )
    return next
  },

  async remove(id: string) {
    return await livePhotoRepo.remove(String(id || '').trim())
  },
}
