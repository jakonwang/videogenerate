import { copyFile, mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import PQueue from 'p-queue'
import { runFfmpeg } from '../ffmpeg/runner'
import { getAppPaths } from '../../lib/paths'
import { productsRepo } from '../products/repo'
import { cloneRepo } from '../clone/repo'
import { generateGptShotFrameImage } from '../clone/gptImage'
import { generateShotVideoByProviderChain } from '../clone/providers'
import { createGrsImageTask, createGrsVideoTask, queryGrsTask } from '../clone/grsai'
import { toPublicUrlViaQiniu } from '../clone/qiniu'
import { resolveApifoxHubCredentials } from '../clone/apifoxProfile'
import { generateImage as generateApifoxImage } from '../clone/unifiedImage'
import { createVideoTask, queryAsyncTask, syncRemoteTaskResult } from '../clone/unifiedVideo'
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
import type { AiProviderName, ModelCredentials, ShotSpec } from '../clone/types'
import type { Product } from '../products/types'

type LivePhotoServiceDependencies = {
  runFfmpeg: typeof runFfmpeg
  generateGptShotFrameImage: typeof generateGptShotFrameImage
  generateShotVideoByProviderChain: typeof generateShotVideoByProviderChain
}

const livePhotoDeps: LivePhotoServiceDependencies = {
  runFfmpeg,
  generateGptShotFrameImage,
  generateShotVideoByProviderChain,
}

const LIVE_PHOTO_AUTO_FLOW_CONCURRENCY = 2
const LIVE_PHOTO_AUTO_FLOW_REQUEUE_COOLDOWN_MS = 8_000
const LIVE_PHOTO_AUTO_RETRY_LIMIT = 2
const LIVE_PHOTO_REFERENCE_STILL_TIMEOUT_MS = 10 * 60 * 1000
const LIVE_PHOTO_REFERENCE_PACKAGING_TIMEOUT_MS = 90 * 1000
const LIVE_PHOTO_VIDEO_REMOTE_RETRY_MS = 5_000
const livePhotoAutoFlowQueue = new PQueue({ concurrency: LIVE_PHOTO_AUTO_FLOW_CONCURRENCY })
const livePhotoAutoFlowScheduled = new Set<string>()
const livePhotoAutoFlowLastQueuedAt = new Map<string, number>()

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
  if (text.includes('[remote_pending]')) return text
  const imageStage = stage === 'image_generation'
  const timeoutLike =
    lower.includes('timed out after') ||
    lower.includes('timeout') ||
    lower.includes('gateway timeout')
  if (imageStage && timeoutLike) {
    return '[remote_pending] 图片生成等待超时，接口可能仍在处理中。请稍后重试，或查看任务日志确认远程结果。'
  }
  if (timeoutLike) {
    return '[retryable_timeout] 当前步骤等待超时，请稍后重试或查看任务日志。'
  }
  return text || 'Unknown error'
}

function extractTaskIdFromText(input: string) {
  const match = String(input || '').match(/taskId=([^\s,]+)/i)
  return String(match?.[1] || '').trim()
}

function normalizeLivePhotoFailureReason(reason: string, stage?: LivePhotoWorkflowStep) {
  const text = String(reason || '').trim()
  const lower = text.toLowerCase()
  const imageStage = stage === 'image_generation'
  const timeoutLike =
    lower.includes('timed out after') ||
    lower.includes('timeout') ||
    lower.includes('连接超时') ||
    lower.includes('无法连接到') ||
    lower.includes('gateway timeout')
  if (imageStage && timeoutLike) {
    return '[remote_pending] 图片生成等待超时，接口可能仍在处理中。请稍后重试，或查看任务日志确认远程结果。'
  }
  if (timeoutLike) {
    return '[retryable_timeout] 当前步骤等待超时，请稍后重试或查看任务日志。'
  }
  return text || 'Unknown error'
}

function now() {
  return Date.now()
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

function toLivePhotoItemSummary(item: LivePhotoItem): LivePhotoItemSummary {
  const {
    logs: _logs,
    promptPreview: _promptPreview,
    imagePromptPreview: _imagePromptPreview,
    videoPromptPreview: _videoPromptPreview,
    ...summary
  } = item
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

function resolveLivePhotoProductReferencePaths(product: Product) {
  const analysisBoardPath = String((product as any).analysisBoardPath || '').trim()
  const canonicalSourcePath = String((product as any).canonicalSourcePath || '').trim()
  const imagePaths = Array.isArray(product.images)
    ? product.images.map((item) => String(item.filePath || '').trim()).filter(Boolean)
    : []
  const preferredRefs = analysisBoardPath
    ? [analysisBoardPath]
    : canonicalSourcePath
      ? [canonicalSourcePath]
      : imagePaths
  return Array.from(new Set(preferredRefs.filter(Boolean))).filter((item) => existsSync(item))
}

function hasLivePhotoStructuredProductReference(product: Product) {
  const analysisBoardPath = String((product as any).analysisBoardPath || '').trim()
  const canonicalSourcePath = String((product as any).canonicalSourcePath || '').trim()
  return Boolean((analysisBoardPath && existsSync(analysisBoardPath)) || (canonicalSourcePath && existsSync(canonicalSourcePath)))
}

function buildLivePhotoVideoShotSpec(input: {
  item: LivePhotoItem
  product?: LivePhotoProductSnapshot
  template: LivePhotoMotionTemplate
  startFramePath: string
}): ShotSpec {
  const sourceLabel = input.item.sourceShotLabel || input.product?.name || 'live photo'
  const baseVisual = input.item.sourceType === 'reference_replace'
    ? 'Keep the exact same person identity, pose, framing, lighting direction, and scene layout from the generated reference replacement still.'
    : 'Keep the exact same composition, crop, lighting direction, and scene continuity from the selected clone shot still.'
  const productText = input.product
    ? `The selected product "${input.product.name}" is the only valid product identity source.`
    : 'Preserve the exact same product identity shown in the selected clone shot asset.'
  const motionText = livePhotoMotionText(input.template)
  const positivePrompt = `${baseVisual} ${productText} Create one realistic 6-second motion clip only. ${motionText}. No scene rewrite, no identity drift, no product redesign.`
  const negativePrompt =
    'different person, different face, different pose, different product, product redesign, extra props, scene rewrite, framing change, background change, strong motion, fast camera move, talking, text, watermark, logo'
  return {
    id: input.item.id,
    index: 0,
    purpose: 'solution',
    startSec: 0,
    endSec: 6,
    durationSec: 6,
    motion: input.template === 'push_out' ? 'zoom_out' : input.template === 'ambient_sway' ? 'shake' : 'zoom_in',
    replaceMode: 'ai_generate',
    productType: input.product?.type === 'earrings' || input.product?.type === 'phone_case' || input.product?.type === 'clothes' || input.product?.type === 'toy'
      ? input.product.type
      : 'general',
    productReferenceImagePaths: input.product?.imagePaths?.length
      ? input.product.imagePaths
      : [input.startFramePath],
    productMainImage: input.product?.coverImagePath || input.startFramePath,
    generatedFirstFramePath: input.startFramePath,
    generatedLastFramePath: input.startFramePath,
    scriptText: `Live Photo motion preview for ${sourceLabel}.`,
    scriptRole: 'show',
    visualDescription: `${baseVisual} ${productText} The output must remain a realistic ecommerce/social-commerce scene, never a collage or redesigned layout.`,
    actionDescription: `Generate a conservative motion clip with ${motionText}. Keep human-product interaction physically believable and preserve all spatial anchors.`,
    cameraDescription: `Locked composition, same camera angle, same framing distance, same crop, same lighting direction, ${motionText}.`,
    productFocus: productText,
    generationPrompt: positivePrompt,
    scriptConfidence: 1,
    framing: 'closeup',
    cameraMovement: motionText,
    action: `Conservative motion only: ${motionText}.`,
    productVisibility: 'high',
    replacementMode: 'ai_generate',
    aiDifficulty: 'low',
    realismRisk: 'low',
    promptHint: positivePrompt,
    negativePromptHint: negativePrompt,
    realismStyle: 'product_closeup',
    forceAi: true,
    aiPrompt: positivePrompt,
    negativePrompt,
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
    compiledPrompt: positivePrompt,
    compiledNegativePrompt: negativePrompt,
    promptCompilerVersion: 'live-photo-v1',
    prompt: {
      positive: positivePrompt,
      negative: negativePrompt,
      cameraMotion: motionText,
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
  if (!taskId) throw new Error('Current Live Photo item is missing a resumable video task id.')
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
    throw new Error('请先为该商品生成多角度标准源后，再创建 Live Photo 任务。')
  }
  const imagePaths = resolveLivePhotoProductReferencePaths(product)
  const coverImagePath = String((product as any).analysisBoardPath || product.canonicalSourcePath || product.coverImagePath || imagePaths[0] || '').trim() || undefined
  return {
    id: product.id,
    name: product.name,
    type: product.type,
    coverImagePath,
    imagePaths,
  }
}

function buildReferenceReplacementPrompt(input: {
  product: LivePhotoProductSnapshot
  productReferenceImagePaths: string[]
  referenceImagePath: string
}) {
  return [
    'REFERENCE REPLACEMENT LOCK:',
    'Use image 1 as the human, pose, framing, composition, lighting, and scene truth.',
    'Use the remaining reference images only as the valid product identity source.',
    'Keep the same person identity, same facial structure, same body proportions, same pose, same crop, same camera angle, same framing distance, same lighting direction, and same background layout from image 1.',
    'Replace only the originally shown product with the selected product from the product reference images.',
    'IDENTITY LOCK: preserve the exact same single product instance from the selected product references. No redesign, no reinterpretation, no style transfer, and no substitution with a similar item.',
    'SIZE LOCK: keep the product at the same real-world scale and the same visual size relationship as the original product shown in image 1, but bias the final look slightly smaller rather than larger when scale is uncertain.',
    'Do not enlarge the product, do not oversize it for emphasis, and do not make it more dominant than the original composition allows.',
    'Prefer a modest, realistic wearing scale. The replacement product should read as naturally small and believable, never bold, oversized, chunky, or hero-enlarged.',
    'The replacement product must sit naturally on the same body anchor or contact area and keep a believable one-to-one placement scale. If there is any ambiguity, choose the smaller realistic appearance.',
    'PRODUCT CLARITY LOCK: the selected product must be the sharpest and clearest region in the entire image.',
    'Render the product with crisp edges, clean texture separation, fully readable small details, and strong local clarity.',
    'Keep the product in precise focus. Do not allow soft-focus product surfaces, motion blur, haze, smeared details, low-resolution texture, or muddy edges.',
    'If depth of field is used, keep it on the product so the product stays fully sharp while only the background may soften slightly.',
    'Preserve the exact product structure, material texture, color accuracy, logo fidelity, and edge definition from the product references.',
    'EFFECT LOCK: keep the result realistic and plain. Do not add sparkle effects, glowing highlights, magical shine, glitter trails, beauty flares, glossy light bursts, or decorative premium effects on or around the product.',
    'Do not change wardrobe, do not change model identity, do not change scene, do not change composition, and do not add new props.',
    'Preserve natural physical contact logic between the human and the product. Adjust placement only as needed so the selected product fits realistically.',
    `Selected product name: ${input.product.name}.`,
    `Selected product reference image count: ${input.productReferenceImagePaths.length}.`,
    ...input.productReferenceImagePaths.map((path, index) => `Selected product reference path ${index + 1}: ${path}.`),
    `Reference photo path: ${input.referenceImagePath}.`,
    'Output a realistic ecommerce/social-commerce still image with product-first clarity, not a collage, not a split panel, not a mood board, not text overlay.',
  ].join('\n')
}

async function generateReferenceReplacementStill(input: {
  item: LivePhotoItem
  product: LivePhotoProductSnapshot
  referenceImagePath: string
}) {
  const credentials = await cloneRepo.getCredentials()
  const root = livePhotoRoot(input.item.id)
  const stillDir = join(root, 'generated-still')
  await ensureDir(stillDir)

  const productRefs = Array.from(new Set(input.product.imagePaths.map((item) => String(item || '').trim()).filter(Boolean))).filter((item) => existsSync(item))

  if (!productRefs.length) {
    throw new Error('Selected product does not have usable reference images')
  }

  const imagePaths = [input.referenceImagePath, ...productRefs].filter(Boolean)
  const stillPath = await livePhotoDeps.generateGptShotFrameImage({
    credentials,
    prompt: buildReferenceReplacementPrompt({
      product: input.product,
      productReferenceImagePaths: productRefs,
      referenceImagePath: input.referenceImagePath,
    }),
    negativePrompt: [
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
      'text',
      'watermark',
      'logo',
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
      'sparkle effect',
      'glow effect',
      'glitter',
      'shiny flare',
      'light burst',
      'lens flare on product',
    ].join(', '),
    imagePaths,
    outDir: stillDir,
    filePrefix: 'reference_replace',
    normalizeOutput: 'preserve',
    outputSize: '1536x2304',
  })

  return {
    stillPath,
    productReferenceImagePaths: productRefs,
  }
}

async function submitReferenceReplacementStillTask(input: {
  item: LivePhotoItem
  product: LivePhotoProductSnapshot
  referenceImagePath: string
}) {
  const credentials = await cloneRepo.getCredentials()
  const root = livePhotoRoot(input.item.id)
  const stillDir = join(root, 'generated-still')
  await ensureDir(stillDir)
  const productRefs = Array.from(new Set(input.product.imagePaths.map((item) => String(item || '').trim()).filter(Boolean))).filter((item) => existsSync(item))
  if (!productRefs.length) {
    throw new Error('Selected product does not have usable reference images')
  }
  const prompt = buildReferenceReplacementPrompt({
    product: input.product,
    productReferenceImagePaths: productRefs,
    referenceImagePath: input.referenceImagePath,
  })
  const negativePrompt = [
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
    'text',
    'watermark',
    'logo',
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
    'sparkle effect',
    'glow effect',
    'glitter',
    'shiny flare',
    'light burst',
    'lens flare on product',
  ].join(', ')
  const imagePaths = [input.referenceImagePath, ...productRefs].filter(Boolean)
  const providers = livePhotoImageProviderChain(credentials)
  for (const provider of providers) {
    if (provider === 'grsai') {
      const urls = await Promise.all(imagePaths.map(async (item) => /^https?:\/\//i.test(item) ? item : await toPublicUrlViaQiniu(credentials, item, 'grsai-input/images')))
      const created = await createGrsImageTask({
        credentials: { ...credentials, imageProviderPrimary: 'grsai' },
        prompt,
        negativePrompt,
        aspectRatio: inferAspectRatioFromOutputSizeSafe('1536x2304'),
        urls,
      })
      if (created.directUrl) {
        const directPath = await generateReferenceReplacementStill(input)
        return {
          mode: 'direct' as const,
          stillPath: directPath.stillPath,
          provider,
          model: created.model,
          productReferenceImagePaths: productRefs,
        }
      }
      if (created.taskId) {
        return {
          mode: 'remote' as const,
          taskId: created.taskId,
          provider,
          model: created.model,
          productReferenceImagePaths: productRefs,
        }
      }
    }
    if (provider === 'apifox_hub') {
      const generated = await generateApifoxImage({
        credentials: { ...credentials, imageProviderPrimary: 'apifox_hub' },
        prompt,
        negativePrompt,
        imagePaths,
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
          productReferenceImagePaths: productRefs,
        }
      }
      return {
        mode: 'direct' as const,
        stillPath: generated.outputPath,
        provider,
        model: generated.model,
        productReferenceImagePaths: productRefs,
      }
    }
  }
  const generated = await generateReferenceReplacementStill(input)
  return {
    mode: 'direct' as const,
    stillPath: generated.stillPath,
    provider: resolveImagePreviewProvider(credentials),
    model: resolveImagePreviewModel(credentials),
    productReferenceImagePaths: productRefs,
  }
}

async function pollReferenceReplacementStillTask(input: {
  item: LivePhotoItem
  outputDir: string
}) {
  const credentials = await cloneRepo.getCredentials()
  const taskId = String(input.item.imageTaskId || '').trim()
  if (!taskId) throw new Error('Current Live Photo item is missing a resumable image task id.')
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
    const created = await createVideoTask({
      credentials,
      capability: 'video_image_to_video',
      prompt: shot.prompt?.positive || shot.compiledPrompt || '',
      negativePrompt: shot.prompt?.negative || shot.compiledNegativePrompt || '',
      image: firstFrameUrl,
      durationSec: 5,
      aspectRatio: '9:16',
    })
    if (created.directOutputUrl) {
      const directOutput = await generateAiMotionVideoFromStill({
        item: input.item,
        product: input.product,
        stillPath: input.stillPath,
        outputDir: join(livePhotoRoot(input.item.id), 'generated-video'),
        template: input.template,
      })
      return { mode: 'direct' as const, outputPath: directOutput, provider, model: created.model }
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

function livePhotoImageProviderChain(credentials: ModelCredentials) {
  const preferred = String(credentials.imageProviderPrimary || '').trim()
  const order = [preferred, 'apifox_hub', 'openai', 'kling', 'grsai']
  const result: string[] = []
  for (const provider of order) {
    if (!provider || result.includes(provider)) continue
    if (provider === 'apifox_hub') {
      const cfg = resolveApifoxHubCredentials(credentials, 'image')
      if (cfg?.enabled && String(cfg.apiKey || '').trim()) result.push(provider)
      continue
    }
    if (provider === 'grsai') {
      if (String(credentials.grsaiApiKey || '').trim()) result.push(provider)
      continue
    }
    if (provider === 'kling') {
      if (String(credentials.klingApiKey || '').trim()) result.push(provider)
      continue
    }
    if (provider === 'openai') {
      if (String(credentials.openaiApiKey || '').trim()) result.push(provider)
    }
  }
  return result
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
  const provider = livePhotoVideoProviderChain(input.credentials)[0] || undefined
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
    referenceImagePaths: [input.startFramePath, ...(input.product?.imagePaths || [])].filter(Boolean),
  }
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

function canResumeLivePhotoAutoFlow(item: LivePhotoItem) {
  const autoFlow = ensureAutoFlowStatus(item)
  if (!autoFlow.enabled) return false
  if (autoFlow.paused) return false
  if (item.packagingStatus === 'completed') return false
  if (autoFlow.status === 'failed_terminal') return false
  if (!['idle', 'running', 'failed_retryable'].includes(autoFlow.status)) return false
  return item.sourceType === 'reference_replace' || item.sourceType === 'clone_shot'
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
      throw new Error(`[remote_pending] 图片任务已提交，等待远端结果。taskId=${input.item.imageTaskId}`)
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
      throw new Error(`[remote_pending] 图片任务已提交，等待远端结果。taskId=${submitted.taskId}`)
    }
    generated = {
      stillPath: submitted.stillPath,
      productReferenceImagePaths: submitted.productReferenceImagePaths,
    }
  }
  const imageDoneItem: LivePhotoItem = {
    ...appendLivePhotoLogs(input.item, [
      buildLivePhotoLog(`[live-photo] image_generation completed: ${generated.stillPath}`, 'success'),
      buildLivePhotoLog('[live-photo] stage video_generation started'),
    ]),
    generatedStillPath: generated.stillPath,
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
      throw new Error(`[remote_pending] 视频任务已提交，等待远端结果。taskId=${imageDoneItem.videoTaskId}`)
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
      throw new Error(`[remote_pending] 视频任务已提交，等待远端结果。taskId=${submitted.taskId}`)
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
    const nextRetryCount = Math.min(current.retryLimit, Number(current.retryCount ?? 0) + 1)
    const terminal = nextRetryCount >= current.retryLimit
    const currentStage = latestPersisted.workflow?.currentStep || current.currentStage || 'queued'
    const reason = normalizeLivePhotoFailureReasonSafe(String(error?.message || error || 'Unknown error'), currentStage)
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
            ? `[live-photo] retry limit reached: ${current.retryLimit}`
            : `[live-photo] marked retryable failure: retry ${nextRetryCount}/${current.retryLimit}`,
          terminal ? 'error' : 'info',
        ),
      ]),
      packagingStatus: 'failed',
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
          setTimeout(() => {
            enqueueLivePhotoAutoFlow(safeItemId, motionTemplate, 'auto_retry', { bypassCooldown: true })
          }, LIVE_PHOTO_VIDEO_REMOTE_RETRY_MS)
        }
        return
      }
      const latest = await livePhotoRepo.get(safeItemId)
      if (!latest) return
      const current = ensureAutoFlowStatus(latest)
      const nextRetryCount = Math.min(current.retryLimit, Number(current.retryCount ?? 0) + 1)
      const terminal = nextRetryCount >= current.retryLimit
      const currentStage = latest.workflow?.currentStep || current.currentStage || 'queued'
      const reason = normalizeLivePhotoFailureReason(String(error?.message || error || 'Unknown error'), currentStage)
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
        setTimeout(() => {
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
  const motionTemplate = input.motionTemplate || 'push_in'
  const created: LivePhotoItem[] = []
  for (const referenceImagePath of referenceImagePaths) {
    const timestamp = now()
    const productRefs = Array.from(new Set(product.imagePaths.map((item) => String(item || '').trim()).filter(Boolean))).filter((item) => existsSync(item))
    const imagePrompt = buildReferenceReplacementPrompt({
      product,
      productReferenceImagePaths: productRefs,
      referenceImagePath,
    })
    const imageNegativePrompt = [
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
      'text',
      'watermark',
      'logo',
      'deformed hand',
      'deformed body',
    ].join(', ')
    const item: LivePhotoItem = {
      id: randomUUID(),
      sourceType: 'reference_replace',
      productId: product.id,
      productSnapshot: product,
      referenceImagePath,
      packagingStatus: 'processing',
      promptPreview: buildReferencePromptPreview({ product, referenceImagePath }),
      imagePromptPreview: buildImageRequestPreview({
        provider: resolveImagePreviewProvider(credentials),
        model: resolveImagePreviewModel(credentials),
        prompt: imagePrompt,
        negativePrompt: imageNegativePrompt,
        referenceImagePaths: [referenceImagePath, ...productRefs],
      }),
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
  setTimeout(() => {
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
  setTimeout(() => {
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
  },

  resetTestDependencies() {
    livePhotoDeps.runFfmpeg = runFfmpeg
    livePhotoDeps.generateGptShotFrameImage = generateGptShotFrameImage
    livePhotoDeps.generateShotVideoByProviderChain = generateShotVideoByProviderChain
  },

  async list() {
    return await livePhotoRepo.list()
  },

  async listSummaries() {
    const items = await livePhotoRepo.list()
    return items.map(toLivePhotoItemSummary)
  },

  async getSettings() {
    return await livePhotoRepo.getSettings()
  },

  async saveSettings(input: any) {
    return await livePhotoRepo.saveSettings(input || {})
  },

  async get(id: string) {
    return await livePhotoRepo.get(String(id || '').trim())
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
    if (!ids.length) throw new Error('Live Photo ids are required')
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
    if (!id) throw new Error('Live Photo id is required')
    const existing = await livePhotoRepo.get(id)
    if (!existing) throw new Error('Live Photo item does not exist')

    const processingItem: LivePhotoItem = {
      ...existing,
      packagingStatus: 'processing',
      error: undefined,
      imageTaskId: undefined,
      imageTaskProvider: undefined,
      imageTaskModel: undefined,
      imageTaskBaseUrl: undefined,
      imageTaskEndpointStyle: undefined,
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
      workflow: buildDefaultWorkflow(),
      autoFlowStatus: {
        ...buildDefaultAutoFlowStatus(),
        enabled: true,
        status: 'idle',
        paused: false,
        retryCount: 0,
        currentStage: 'queued',
      },
      updatedAt: now(),
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
    const resumable = items.filter((item) => canResumeLivePhotoAutoFlow(item))
    console.log('[live-photo-debug] startup-resume-scan', {
      totalItemCount: items.length,
      resumableCount: resumable.length,
      itemIds: resumable.map((item) => item.id),
    })
    resumable.forEach((item, index) => {
      const delayMs = Math.min(index, 6) * 900
      setTimeout(() => {
        enqueueLivePhotoAutoFlow(item.id, undefined, 'startup_resume')
      }, delayMs)
    })
    return {
      totalItemCount: items.length,
      resumableCount: resumable.length,
      itemIds: resumable.map((item) => item.id),
    }
  },

  async pauseAutoFlow(input: { id: string }) {
    const id = String(input.id || '').trim()
    if (!id) throw new Error('Live Photo id is required')
    const existing = await livePhotoRepo.get(id)
    if (!existing) throw new Error('Live Photo item does not exist')
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
    if (!id) throw new Error('Live Photo id is required')
    const existing = await livePhotoRepo.get(id)
    if (!existing) throw new Error('Live Photo item does not exist')
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
