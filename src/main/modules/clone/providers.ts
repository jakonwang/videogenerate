import { copyFile, mkdir, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { runFfmpeg } from '../ffmpeg/runner'
import { resolveApifoxHubCredentials } from './apifoxProfile'
import { createGrsVideoTask, isPublicHttpUrl, waitGrsResult } from './grsai'
import { toPublicUrlViaQiniu } from './qiniu'
import { downloadAtlasToFile, getAtlasJson, pickAtlasOutputUrl, postAtlasJson } from './atlasRetry'
import { generateVideo as generateApifoxVideo } from './unifiedVideo'
import {
  buildCameraMotionLockText,
  detectProductMode,
  buildFinalShotVideoPositivePrompt,
  buildOptimizedVideoPrompt,
  buildVideoAntiSparkleNegativePrompt,
  buildFailInsteadRuleText,
  buildCompositionLockText,
  buildFrameContinuityLockText,
  buildHumanPriorityRuleText,
  buildMotionLimitText,
  buildPhysicsConsistencyText,
  buildNoSpeakingInstruction,
  buildNoSubstituteRuleText,
  buildReferenceImageLockText,
  buildReferenceLockText,
  buildScaleConsistencyLockText,
  buildSpatialAnchorLockText,
  buildShotScriptConstraintText,
  prependSilentCommercialGlobalRule,
  sanitizeGeneratedVideoPrompt,
  sanitizeJewelryGenerationPrompt,
} from './prompt'
import { canUseMockGeneration } from './mockPolicy'
import type {
  AiProviderName,
  CloneProject,
  ConsistencyMode,
  ModelCredentials,
  ShotKeyframeAsset,
  ShotSpec,
} from './types'

type ProviderInput = {
  shot: ShotSpec
  outDir: string
  referenceVideoPath: string
  credentials: ModelCredentials
}

function shotAspectRatio(shot: ShotSpec): '9:16' | '16:9' {
  return shot.prompt?.aspectRatio === '16:9' ? '16:9' : '9:16'
}

function targetResolutionByShot(shot: ShotSpec) {
  return shotAspectRatio(shot) === '16:9' ? { width: 1280, height: 720 } : { width: 1080, height: 1920 }
}

export type ProviderResult = {
  provider: AiProviderName
  outputFilePath: string
  remoteTaskId?: string
  model?: string
}

function resolveShotVideoOrderedReferencePaths(project: CloneProject | undefined, shot: ShotSpec, firstFramePath: string) {
  return [String(firstFramePath || '').trim()].filter(Boolean)
}

const SEEDANCE_HOST = 'https://ark.ap-southeast.bytepluses.com'
const SEEDANCE_KINOVI_HOST = 'https://kinovi.ai'
const ATLASCLOUD_HOST = 'https://api.atlascloud.ai'
const ATLASCLOUD_SEEDANCE_REFERENCE_MODEL = 'bytedance/seedance-2.0/reference-to-video'

type AnyJson = Record<string, any>

function cleanHost(v: string | undefined, fallback: string) {
  return String(v || fallback).replace(/\/+$/, '')
}

function atlasCloudHost() {
  return ATLASCLOUD_HOST
}

function isAtlasSeedanceReferenceModel(model: string) {
  return /bytedance\/seedance-2\.0\/reference-to-video/i.test(String(model || '').trim())
}

function keyByProvider(p: AiProviderName, credentials: ModelCredentials) {
  if (p === 'seedance') {
    const model = String(credentials.videoModelPrimary || '').trim()
    if (isAtlasSeedanceReferenceModel(model)) return credentials.seedanceApiKey || credentials.klingApiKey
    return credentials.seedanceApiKey
  }
  if (p === 'apifox_hub') return resolveApifoxHubCredentials(credentials, 'video')?.apiKey
  if (p === 'grsai') return credentials.grsaiApiKey
  return credentials.klingApiKey
}

function hostByProvider(p: AiProviderName, credentials: ModelCredentials) {
  if (p === 'seedance') {
    const model = String(credentials.videoModelPrimary || '').trim()
    if (isAtlasSeedanceReferenceModel(model)) return atlasCloudHost()
    const key = String(credentials.seedanceApiKey || '').trim()
    const rawHost = String(credentials.seedanceHost || '').trim()
    const normalized = cleanHost(rawHost, SEEDANCE_HOST)
    if (
      isArkSeedanceKey(key) &&
      (!rawHost || normalized === SEEDANCE_KINOVI_HOST || /ark\.cn-beijing\.volces\.com$/i.test(normalized))
    ) {
      return SEEDANCE_HOST
    }
    return normalized
  }
  if (p === 'grsai') return cleanHost(credentials.grsaiHost, 'https://grsaiapi.com')
  if (p === 'apifox_hub') return String(resolveApifoxHubCredentials(credentials, 'video')?.baseUrl || '').trim().replace(/\/+$/, '')
  return atlasCloudHost()
}

function pickModel(credentials: ModelCredentials, provider: AiProviderName) {
  if (provider === 'apifox_hub') {
    const hub = resolveApifoxHubCredentials(credentials, 'video')
    return (
      hub?.referenceVideoModel ||
      hub?.startEndVideoModel ||
      hub?.imageToVideoModel ||
      hub?.textToVideoModel ||
      'apifox-video'
    )
  }
  if (provider === 'seedance') return credentials.videoModelPrimary || ATLASCLOUD_SEEDANCE_REFERENCE_MODEL
  if (provider === 'grsai') return credentials.grsaiVideoModel || 'veo3.1-fast'
  return credentials.videoModelFallback || 'google/veo3.1-lite/start-end-frame-to-video'
}

function normalizeProviderChain(input: AiProviderName[] | undefined): AiProviderName[] {
  const raw = input?.length ? input : ['seedance', 'kling', 'grsai']
  const out: AiProviderName[] = []
  for (const p of raw) {
    if ((p === 'seedance' || p === 'kling' || p === 'grsai' || p === 'apifox_hub') && !out.includes(p)) out.push(p)
  }
  return out.length ? out : ['seedance', 'kling', 'grsai']
}

function isArkSeedanceKey(key: string) {
  return /^ark-/i.test(String(key || '').trim())
}

function isArkSeedanceHost(host: string) {
  return /(^|\.)volces\.com$/i.test(new URL(cleanHost(host, SEEDANCE_HOST)).hostname) ||
    /(^|\.)bytepluses\.com$/i.test(new URL(cleanHost(host, SEEDANCE_HOST)).hostname)
}

function normalizeSeedanceModel(raw: string, mode: 'ark' | 'kinovi' = 'ark') {
  if (isAtlasSeedanceReferenceModel(raw)) return ATLASCLOUD_SEEDANCE_REFERENCE_MODEL
  const v = String(raw || '').trim().toLowerCase().replace(/_/g, '-')
  if (mode === 'ark') {
    if (v.startsWith('doubao-')) return String(raw).trim()
    if (v.startsWith('dreamina-')) return String(raw).trim()
    if (v.includes('fast')) return 'dreamina-seedance-2-0-fast-260128'
    return 'dreamina-seedance-2-0-260128'
  }
  if (v.includes('fast')) return 'seedance2-fast'
  return 'seedance-20'
}

function normalizeKlingType(raw: string) {
  const v = String(raw || '').trim()
  if (/^[a-z0-9._-]+\/[a-z0-9._\/-]+$/i.test(v)) return v
  return v || 'google/veo3.1-lite/start-end-frame-to-video'
}

function isAtlasImageToVideoModel(model: string) {
  return /image-to-video/i.test(String(model || '').trim())
}

function isAtlasStartEndFrameModel(model: string) {
  return /start-end-frame-to-video/i.test(String(model || '').trim())
}

function clampSeedanceDuration(durationSec: number) {
  return String(Math.max(4, Math.min(15, Math.round(Number(durationSec || 5)))))
}

function clampKlingDuration(durationSec: number) {
  const n = Number(durationSec || 6)
  if (n <= 5) return 4
  if (n <= 7) return 6
  return 8
}

function isAtlasVeoLiteStartEndModel(model: string) {
  return /google\/veo3\.1-lite\/start-end-frame-to-video/i.test(String(model || '').trim())
}

function atlasCloudDuration(model: string, durationSec: number) {
  if (isAtlasVeoLiteStartEndModel(model)) return 8
  return clampKlingDuration(durationSec)
}

async function publicUrlForGrs(credentials: ModelCredentials, value: string, label: string) {
  if (isPublicHttpUrl(value)) return value
  try {
    return await toPublicUrlViaQiniu(credentials, value, `grsai-input/${label}`)
  } catch (e: any) {
    throw new Error(`GRS.AI 视频生成需要公网可访问的${label} URL；七牛云上传失败：${String(e?.message ?? e)}`)
  }
}

export async function publicUrlForCloudFrame(credentials: ModelCredentials, value: string, label: string) {
  if (isPublicHttpUrl(value)) return value
  try {
    return await toPublicUrlViaQiniu(credentials, value, `cloud-video-input/${label}`)
  } catch (e: any) {
    throw new Error(`视频生成需要公网可访问的 ${label} URL；七牛云上传失败：${String(e?.message ?? e)}`)
  }
}

function shotRolePrompt(shot: ShotSpec) {
  const role = String(shot.role || shot.purpose || 'detail')
  const map: Record<string, string> = {
    hook: 'opening hook shot, product appears immediately in the first second, clear visual benefit',
    product_closeup: 'macro product close-up, realistic hand holding the product, visible material texture and edges',
    model_scene: 'real lifestyle scene, natural human hand interaction, casual TikTok UGC framing',
    detail: 'detail demonstration shot, close camera distance, show real surface texture, fit, shape and construction',
    price_offer: 'offer demonstration shot, product stays central, no fake price labels or generated text',
    social_proof: 'social proof style shot, real-life usage context, authentic phone-camera feel',
    cta: 'closing call-to-action shot, product clearly visible, clean ending frame',
    problem: 'problem demonstration shot, realistic daily-life pain point, product context is clear',
    solution: 'solution demonstration shot, product solving the problem in a believable way',
    proof: 'proof shot, realistic before-and-after or close verification, no fake UI or fake text',
  }
  return map[role] || map.detail
}

function shotMotionPrompt(shot: ShotSpec) {
  const motion = String(shot.motion || 'static')
  const map: Record<string, string> = {
    static: 'stable smartphone framing with clear natural hand action, product rotation or wearing movement across the whole clip, not frozen posing',
    zoom_in: 'very slow, smooth, continuous push-in with gentle hand movement and steady product presentation progression, never sudden or aggressive',
    zoom_out: 'very slow, smooth, continuous pull-back that reveals only a little more context while keeping the same shot and natural product action, never sudden or aggressive',
    pan_left: 'slow and smooth handheld pan left following the product action with restrained lateral movement',
    pan_right: 'slow and smooth handheld pan right following the product action with restrained lateral movement',
    shake: 'energetic authentic handheld motion with readable product action, never chaotic or blurry',
    fast_cut: 'quick product-reveal rhythm with assertive action beats and strong visual change, no surreal effects',
  }
  return map[motion] || map.static
}

function fallbackVideoDirectionPrompt(shot: ShotSpec) {
  const fallback = [
    shot.visualDescription || shot.visualPrompt || shot.visual || 'Real social-commerce product demonstration in a believable environment.',
    shot.actionDescription || shot.action || 'Natural product demonstration with believable hand movement.',
    shot.cameraDescription || `${String(shot.framing || 'close-up')} framing with ${shotMotionPrompt(shot)}.`,
    shot.productFocus || 'Keep the product clearly visible and commercially relevant.',
    shot.generationPrompt || shot.prompt?.positive || '',
  ]
    .filter(Boolean)
    .join('\n')
  return sanitizeGeneratedVideoPrompt(fallback, 900)
}

export function buildRealisticPrompt(shot: ShotSpec, phase: 'start' | 'end' | 'video') {
  if (phase === 'video') {
    return buildOptimizedVideoPrompt({
      shot,
      productIdentityText: String(shot.materialNeed || '').trim(),
      productMode: detectProductMode(String(shot.productType || '').trim()),
    })
  }
  const sanitizedGenerationSource = sanitizeJewelryGenerationPrompt(
    String(shot.aiPrompt || shot.generationPrompt || shot.prompt?.positive || '').trim(),
    shot.productType,
  )
  const cleanedUserPrompt = sanitizeGeneratedVideoPrompt(
    sanitizedGenerationSource || String(shot.aiPrompt || shot.generationPrompt || shot.prompt?.positive || '').trim(),
    1100,
  )
  const scriptText = sanitizeGeneratedVideoPrompt(String(shot.scriptText || '').trim(), 320)
  const generationPrompt = sanitizeGeneratedVideoPrompt(
    sanitizeJewelryGenerationPrompt(String(shot.generationPrompt || '').trim(), shot.productType) || String(shot.generationPrompt || '').trim(),
    420,
  )
  const scriptConstraint = sanitizeGeneratedVideoPrompt(buildShotScriptConstraintText(shot), 720)
  const scriptExecutionBlock = ''
  const sceneDirection = cleanedUserPrompt || fallbackVideoDirectionPrompt(shot)
  const referenceLock = sanitizeGeneratedVideoPrompt(buildReferenceLockText(shot, 'reference shot scene atmosphere'), 900)
  const spatialAnchorLock = sanitizeGeneratedVideoPrompt(buildSpatialAnchorLockText(String(shot.productType || '')), 520)
  const physicsConsistency = sanitizeGeneratedVideoPrompt(buildPhysicsConsistencyText(String(shot.productType || '')), 420)
  const compositionLock = sanitizeGeneratedVideoPrompt(buildCompositionLockText(String(shot.productType || '')), 420)
  const cameraMotionLock = sanitizeGeneratedVideoPrompt(
    buildCameraMotionLockText({
      motion: String(shot.motion || ''),
      framing: String(shot.framing || ''),
      productType: String(shot.productType || ''),
    }),
    520,
  )
  const scaleConsistencyLock = sanitizeGeneratedVideoPrompt(
    buildScaleConsistencyLockText(String(shot.productType || ''), String(shot.motion || '')),
    420,
  )
  const motionLimit = sanitizeGeneratedVideoPrompt(
    buildMotionLimitText(String(shot.productType || ''), String(shot.motion || '')),
    260,
  )
  const storyboardControlLayer = ''
  const replicationTaskLock = ''
  const singleModelLock = ''
  const productLock =
    'Keep the exact product from the reference images: same color, shape, material, pattern, print, holes, edges, size and design. Do not add logos, gems, charms, text, extra patterns or new decorations.'
  const highlightRealism = ''
  const jewelryRealism =
    /earrings?/i.test(String(shot.productType || ''))
      ? 'Jewelry material suppression rule: preserve only the exact earring structure, hanging logic, and component placement. Do not enhance metallic, crystal, gemstone, glossy, or reflective behavior. Treat jewelry as optically quiet, matte, diffuse, non-emissive, and stable. Earrings must follow gravity and believable support: they may be worn, hand-held, laid flat, or lightly supported, but must never stand upright by themselves like a rigid sculpture, signboard, or product figurine.'
      : ''
  const realism =
    'Premium realistic social commerce video, shot on a modern smartphone camera, natural daylight or soft window light only, clean editorial composition, real human hands, real shadows, real lens perspective, believable e-commerce demo. Preserve the same shot purpose, background category, camera distance, composition logic, product interaction type and motion grammar from the reference, but let the action play out fully and naturally instead of freezing into a near-still pose. Do NOT replace or regenerate product or model identity. Only adapt camera and motion. Do not copy the original person, watermark, captions, stickers or platform UI. Do not show any visible text in the video frame, including titles, subtitles, captions, labels, packaging text, slogans, logos, UI words, random letters or typographic elements. Avoid flashy visual effects, strobe-like lighting, hard flash bursts, CGI, 3D render, plastic toy look, fantasy scene, over-smoothed skin, warped fingers, fake text, watermark, subtitles, captions, UI overlays, account names, stickers and logos. Cinematic polish must never override identity.'
  const motionPerformance = ''
  const phaseText =
    phase === 'start'
      ? 'Opening keyframe, product already visible and in focus, clean frame with no watermark or subtitles.'
      : phase === 'end'
        ? 'Ending keyframe, direct continuation of the starting frame, same product instance, same model instance, same scene setup, natural final pose, clean frame with no watermark or subtitles.'
        : 'Generate natural motion between first and last frame. Preserve product identity, background atmosphere, action category and camera continuity. Keep the same selling purpose and reference shot grammar, but do not freeze the subject into one locked pose or one tiny repeated movement. Do not switch to a different action, different location, different product-display method or unrelated camera angle. No morphing, no object melting, no artificial animation, no copied TikTok watermark, no copied subtitles. Do not generate any visible on-screen text, title card, subtitle line, caption overlay, packaging words or lettering of any kind.'
  const blocks = [
    highlightRealism,
    jewelryRealism,
    storyboardControlLayer,
    replicationTaskLock,
    singleModelLock,
    referenceLock,
    spatialAnchorLock,
    physicsConsistency,
    compositionLock,
    scriptExecutionBlock,
    sceneDirection,
    productLock,
    shotRolePrompt(shot),
    '',
    motionPerformance,
    realism,
    phaseText,
    '',
  ]
    .map((item) => String(item || '').trim())
    .filter(Boolean)
  const deduped = blocks.filter((item, index) => blocks.findIndex((v) => v.toLowerCase() === item.toLowerCase()) === index)
  return prependSilentCommercialGlobalRule(deduped, 2400)
}

export function buildVideoNegativePrompt(shot: ShotSpec, compiledNegativePrompt?: string) {
  return buildVideoAntiSparkleNegativePrompt(
    String(compiledNegativePrompt || shot.compiledNegativePrompt || shot.negativePrompt || '').trim(),
    detectProductMode(String(shot.productType || '').trim()),
  )
}

async function toDataUriOrUrl(absPathOrUrl: string, kind: 'image' | 'video') {
  if (/^https?:\/\//i.test(absPathOrUrl)) return absPathOrUrl
  const buf = await readFile(absPathOrUrl)
  const ext = extname(absPathOrUrl).toLowerCase()
  const mime =
    kind === 'image'
      ? ext === '.jpg' || ext === '.jpeg'
        ? 'image/jpeg'
        : ext === '.webp'
          ? 'image/webp'
          : 'image/png'
      : ext === '.mov'
        ? 'video/quicktime'
        : ext === '.webm'
          ? 'video/webm'
          : 'video/mp4'
  return `data:${mime};base64,${buf.toString('base64')}`
}

async function postJson(url: string, key: string, body: AnyJson) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const text = await res.text().catch(() => '')
  let json: any = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = { raw: text }
  }
  if (!res.ok) throw new Error(`${res.status} ${text || res.statusText}`)
  return json
}

async function getJson(url: string, key: string) {
  const res = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${key}` },
  })
  const text = await res.text().catch(() => '')
  let json: any = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = { raw: text }
  }
  if (!res.ok) throw new Error(`${res.status} ${text || res.statusText}`)
  return json
}

function pickTaskId(json: any) {
  const directDataValue =
    typeof json?.data === 'string' || typeof json?.data === 'number'
      ? String(json.data).trim()
      : ''
  const candidates = [
    directDataValue,
    json?.data?.task_uuid,
    json?.data?.taskUuid,
    json?.data?.task_id,
    json?.data?.taskId,
    json?.data?.task?.uuid,
    json?.data?.task?.id,
    json?.data?.task?.task_id,
    json?.data?.task?.taskId,
    json?.data?.record_id,
    json?.data?.recordId,
    json?.data?.uuid,
    json?.data?.trace_id,
    json?.data?.traceId,
    json?.data?.job_id,
    json?.data?.jobId,
    json?.data?.prediction_id,
    json?.data?.predictionId,
    json?.data?.prediction?.uuid,
    json?.data?.prediction?.id,
    json?.data?.prediction?.task_id,
    json?.data?.prediction?.taskId,
    json?.data?.result?.uuid,
    json?.data?.result?.id,
    json?.data?.result?.task_id,
    json?.data?.result?.taskId,
    json?.data?.request_id,
    json?.data?.requestId,
    json?.data?.id,
    json?.task?.uuid,
    json?.task?.id,
    json?.task?.task_id,
    json?.task?.taskId,
    json?.record_id,
    json?.recordId,
    json?.trace_id,
    json?.traceId,
    json?.job_id,
    json?.jobId,
    json?.prediction_id,
    json?.predictionId,
    json?.prediction?.uuid,
    json?.prediction?.id,
    json?.prediction?.task_id,
    json?.prediction?.taskId,
    json?.result?.uuid,
    json?.result?.id,
    json?.result?.task_id,
    json?.result?.taskId,
    json?.task_id,
    json?.taskId,
    json?.request_id,
    json?.requestId,
    json?.uuid,
    json?.id,
  ]
  for (const candidate of candidates) {
    const taskId = String(candidate ?? '').trim()
    if (taskId) return taskId
  }
  return ''
}

function pickStatus(json: any) {
  return String(json?.status ?? json?.data?.status ?? json?.task?.status ?? '').toLowerCase()
}

function isTerminalFailureStatus(status: string) {
  return status === 'fail' || status === 'failed' || status === 'error' || status === 'cancelled' || status === 'canceled'
}

function pickError(json: any) {
  const err = json?.error ?? json?.data?.error
  if (typeof err === 'string') return err.trim()
  if (err && typeof err === 'object') {
    return [err.code, err.message].filter(Boolean).map(String).join(': ').trim()
  }
  return String(json?.error_message ?? json?.data?.error_message ?? json?.message ?? '').trim()
}

async function normalizeCloudClipForShot(input: { src: string; out: string; shot: ShotSpec }) {
  const targetSec = Math.max(0.8, Number(input.shot.durationSec || 1.5))
  const target = targetResolutionByShot(input.shot)
  await runFfmpeg({
    args: [
      '-y',
      '-i',
      input.src,
      '-t',
      `${targetSec}`,
      '-vf',
      `scale=${target.width}:${target.height}:force_original_aspect_ratio=increase,crop=${target.width}:${target.height},fps=30,format=yuv420p`,
      '-an',
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '20',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      input.out,
    ],
  })
}

async function createSeedanceTask(input: {
  key: string
  host: string
  model: string
  shot: ShotSpec
  prompt: string
  startFrameUrl: string
  endFrameUrl?: string
}) {
  if (isAtlasSeedanceReferenceModel(input.model)) {
    return await createAtlasReferenceSeedanceTask(input)
  }
  if (isArkSeedanceHost(input.host)) return await createArkSeedanceTask(input)
  const body = {
    model: normalizeSeedanceModel(input.model, 'kinovi'),
    inputs: {
      urls: [input.startFrameUrl, input.endFrameUrl].filter(Boolean),
      prompt: input.prompt,
      duration: clampSeedanceDuration(input.shot.durationSec),
      aspectRatio: '9:16',
      mode: 'keyframe',
      outputResolution: '720p',
    },
  }
  const json = await postJson(`${input.host}/api/v1/jobs/createTask`, input.key, body)
  const taskId = pickTaskId(json)
  if (!taskId) throw new Error(`Seedance task id missing: ${JSON.stringify(json)}`)
  return { taskId, model: body.model }
}

async function createAtlasReferenceSeedanceTask(input: {
  key: string
  host: string
  model: string
  shot: ShotSpec
  prompt: string
  startFrameUrl: string
  endFrameUrl?: string
}) {
  const body: AnyJson = {
    model: ATLASCLOUD_SEEDANCE_REFERENCE_MODEL,
    prompt: input.prompt,
    image: input.startFrameUrl,
    aspect_ratio: shotAspectRatio(input.shot),
    duration: atlasCloudDuration(ATLASCLOUD_SEEDANCE_REFERENCE_MODEL, input.shot.durationSec),
    resolution: '720p',
    seed: -1,
  }
  if (input.endFrameUrl && input.endFrameUrl !== input.startFrameUrl) {
    body.last_image = input.endFrameUrl
  }
  const json = await postAtlasJson(
    `${input.host}/api/v1/model/generateVideo`,
    input.key,
    body,
    'AtlasCloud ?? Seedance Reference-to-Video ??',
  )
  const taskId = pickTaskId(json)
  if (!taskId) throw new Error(`AtlasCloud Seedance reference video task id missing: ${JSON.stringify(json)}`)
  return { taskId, model: body.model }
}

function clampArkSeedanceDuration(durationSec: number) {
  return Math.max(5, Math.min(15, Math.round(Number(durationSec || 5))))
}

async function createArkSeedanceTask(input: {
  key: string
  host: string
  model: string
  shot: ShotSpec
  prompt: string
  startFrameUrl: string
  endFrameUrl?: string
}) {
  const content: AnyJson[] = [
    {
      type: 'text',
      text: input.prompt,
    },
    {
      type: 'image_url',
      image_url: { url: input.startFrameUrl },
      role: 'first_frame',
    },
  ]
  if (input.endFrameUrl && input.endFrameUrl !== input.startFrameUrl) {
    content.push({
      type: 'image_url',
      image_url: { url: input.endFrameUrl },
      role: 'last_frame',
    })
  }
  const body = {
    model: normalizeSeedanceModel(input.model, 'ark'),
    content,
    generate_audio: false,
    ratio: '9:16',
    duration: clampArkSeedanceDuration(input.shot.durationSec),
    watermark: false,
  }
  const json = await postJson(`${input.host}/api/v3/contents/generations/tasks`, input.key, body)
  const taskId = pickTaskId(json)
  if (!taskId) throw new Error(`Ark Seedance task id missing: ${JSON.stringify(json)}`)
  return { taskId, model: body.model }
}

async function waitSeedanceOutput(key: string, host: string, taskId: string, timeoutMs = 10 * 60 * 1000) {
  const hostname = new URL(cleanHost(host, ATLASCLOUD_HOST)).hostname
  if (/atlascloud\.ai$/i.test(hostname)) {
    return await waitKlingOutput(key, host, taskId, timeoutMs)
  }
  const start = Date.now()
  const urls = isArkSeedanceHost(host)
    ? [`${host}/api/v3/contents/generations/tasks/${encodeURIComponent(taskId)}`]
    : [
        `${host}/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`,
        `${host}/api/v1/jobs/recordInfo?id=${encodeURIComponent(taskId)}`,
        `${host}/api/v1/jobs/${encodeURIComponent(taskId)}`,
      ]
  while (Date.now() - start < timeoutMs) {
    let lastErr = ''
    for (const url of urls) {
      try {
        const json = await getJson(url, key)
        const status = pickStatus(json)
        const outputUrl = pickAtlasOutputUrl(json)
        if ((status === 'success' || status === 'succeeded' || status === 'completed' || status === 'done') && outputUrl) return { outputUrl, task: json }
        if (outputUrl && !status) return { outputUrl, task: json }
        if (isTerminalFailureStatus(status)) return Promise.reject(new Error(pickError(json) || JSON.stringify(json)))
      } catch (e: any) {
        lastErr = String(e?.message ?? e)
        if (lastErr && !/404|not found/i.test(lastErr)) throw e
      }
    }
    await new Promise((r) => setTimeout(r, 2000))
    if (Date.now() - start > 20000 && /404|not found/i.test(lastErr)) break
  }
  throw new Error('Seedance task timeout or status endpoint unavailable')
}

async function createKlingTask(input: {
  key: string
  host: string
  model: string
  shot: ShotSpec
  prompt: string
  negativePrompt?: string
  startFrameUrl: string
  endFrameUrl?: string
}) {
  const model = normalizeKlingType(input.model)
  const body: AnyJson = {
    model,
    prompt: input.prompt,
    negative_prompt: String(input.negativePrompt || '').trim() || undefined,
    image: input.startFrameUrl,
    aspect_ratio: shotAspectRatio(input.shot),
    duration: atlasCloudDuration(model, input.shot.durationSec),
    resolution: '720p',
    seed: -1,
  }
  if (isAtlasStartEndFrameModel(model)) {
    body.last_image = input.endFrameUrl || input.startFrameUrl
  } else if (!isAtlasImageToVideoModel(model) && input.endFrameUrl && input.endFrameUrl !== input.startFrameUrl) {
    body.last_image = input.endFrameUrl
  }
  const json = await postAtlasJson(`${input.host}/api/v1/model/generateVideo`, input.key, body, 'AtlasCloud ??????')
  const taskId = pickTaskId(json)
  if (!taskId) throw new Error(`AtlasCloud video task id missing: ${JSON.stringify(json)}`)
  return { taskId, model }
}

async function waitKlingOutput(key: string, host: string, taskId: string, timeoutMs = 10 * 60 * 1000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const json = await getAtlasJson(
      `${host}/api/v1/model/prediction/${encodeURIComponent(taskId)}`,
      key,
      `AtlasCloud 查询视频任务 ${taskId}`,
    )
    const status = pickStatus(json)
    const outputUrl = pickAtlasOutputUrl(json)
    if ((status === 'success' || status === 'succeeded' || status === 'completed' || status === 'done') && outputUrl) return { outputUrl, task: json }
    if (status === 'fail' || status === 'failed' || status === 'error') throw new Error(pickError(json) || JSON.stringify(json))
    await new Promise((r) => setTimeout(r, 2000))
  }
  throw new Error('AtlasCloud video task timeout')
}

async function mockGenerateFromReference(input: ProviderInput): Promise<ProviderResult> {
  await mkdir(input.outDir, { recursive: true })
  const ext = extname(input.referenceVideoPath).toLowerCase() || '.mp4'
  const out = join(input.outDir, `mock_${input.shot.id}_${Date.now()}${ext}`)
  const start = Math.max(0, Number(input.shot.startSec ?? 0))
  const dur = Math.max(0.8, Number(input.shot.durationSec ?? 2))
  try {
    await runFfmpeg({
      args: [
        '-y',
        '-ss',
        `${start}`,
        '-t',
        `${dur}`,
        '-i',
        input.referenceVideoPath,
        '-vf',
        'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black,fps=30',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-movflags',
        '+faststart',
        out,
      ],
    })
  } catch {
    await copyFile(input.referenceVideoPath, out)
  }
  return { provider: 'seedance', outputFilePath: out, remoteTaskId: `mock_${randomUUID()}`, model: 'mock-reference' }
}

async function mockGenerateFromFrames(input: {
  shot: ShotSpec
  outDir: string
  startFramePath: string
  endFramePath: string
}): Promise<ProviderResult> {
  await mkdir(input.outDir, { recursive: true })
  const out = join(input.outDir, `mock_frames_${input.shot.id}_${Date.now()}.mp4`)
  const duration = Math.max(2, Math.min(8, Math.round(Number(input.shot.durationSec || 3))))
  const { width, height } = targetResolutionByShot(input.shot)
  const frameRate = 24
  const totalFrames = Math.max(frameRate, Math.round(duration * frameRate))
  const sourceFramePath = existsSync(input.startFramePath) ? input.startFramePath : input.endFramePath
  await runFfmpeg({
    args: [
      '-y',
      '-loop',
      '1',
      '-framerate',
      `${frameRate}`,
      '-t',
      `${duration}`,
      '-i',
      sourceFramePath,
      '-vf',
      `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1,fps=${frameRate},format=yuv420p`,
      '-r',
      `${frameRate}`,
      '-frames:v',
      `${totalFrames}`,
      '-pix_fmt',
      'yuv420p',
      '-c:v',
      'libx264',
      '-movflags',
      '+faststart',
      out,
    ],
  })
  return {
    provider: 'seedance',
    outputFilePath: out,
    remoteTaskId: `mock_frames_${randomUUID()}`,
    model: 'mock-image2video',
  }
}

export async function generateShotByProviderChain(input: {
  shot: ShotSpec
  outDir: string
  referenceVideoPath: string
  credentials: ModelCredentials
  chain: AiProviderName[]
}): Promise<ProviderResult> {
  if (canUseMockGeneration(input.credentials) && !input.credentials.seedanceApiKey && !input.credentials.klingApiKey && !input.credentials.grsaiApiKey) {
    return await mockGenerateFromReference(input)
  }
  throw new Error('Seedance/AtlasCloud/GRS.AI 需要首尾帧或图片输入，请使用分镜片段生成链路')
}

export async function generateShotKeyframesByProviderChain(input: {
  shot: ShotSpec
  outDir: string
  referenceVideoPath: string
  credentials: ModelCredentials
  chain: AiProviderName[]
}): Promise<{ startFrame: ShotKeyframeAsset; endFrame: ShotKeyframeAsset }> {
  await mkdir(input.outDir, { recursive: true })
  const startPng = join(input.outDir, `kf_${input.shot.id}_start_${Date.now()}.png`)
  const endPng = join(input.outDir, `kf_${input.shot.id}_end_${Date.now()}.png`)
  const cleanRef = (input.shot.productReferenceImagePaths ?? []).find((x) => x && existsSync(x))
  if (cleanRef) {
    const startVf =
      'scale=1080:1920:force_original_aspect_ratio=decrease,' +
      'pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=#111111,' +
      'eq=contrast=1.04:saturation=1.03'
    const endVf =
      'scale=1080:1920:force_original_aspect_ratio=decrease,' +
      'pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=#111111,' +
      'eq=contrast=1.06:saturation=1.04'
    await runFfmpeg({ args: ['-y', '-i', cleanRef, '-frames:v', '1', '-vf', startVf, startPng] })
    await runFfmpeg({ args: ['-y', '-i', cleanRef, '-frames:v', '1', '-vf', endVf, endPng] })
    const provider = normalizeProviderChain(input.chain)[0]
    const ts = Date.now()
    const taskId = `clean_ref_kf_${randomUUID()}`
    return {
      startFrame: { filePath: startPng, provider, model: 'clean-product-reference-keyframe', taskId, createdAt: ts },
      endFrame: { filePath: endPng, provider, model: 'clean-product-reference-keyframe', taskId, createdAt: ts },
    }
  }
  const startAt = Math.max(0, Number(input.shot.startSec || 0))
  const endAt = Math.max(0, startAt + Math.max(0.2, Number(input.shot.durationSec || 1)) - 0.12)
  const vf =
    'crop=iw:ih*0.78:0:ih*0.11,' +
    'scale=1080:1920:force_original_aspect_ratio=decrease,' +
    'pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black'
  await runFfmpeg({ args: ['-y', '-ss', `${startAt}`, '-i', input.referenceVideoPath, '-frames:v', '1', '-vf', vf, startPng] })
  await runFfmpeg({ args: ['-y', '-ss', `${endAt}`, '-i', input.referenceVideoPath, '-frames:v', '1', '-vf', vf, endPng] })
  const provider = normalizeProviderChain(input.chain)[0]
  const ts = Date.now()
  const taskId = `local_kf_${randomUUID()}`
  return {
    startFrame: { filePath: startPng, provider, model: 'local-reference-keyframe', taskId, createdAt: ts },
    endFrame: { filePath: endPng, provider, model: 'local-reference-keyframe', taskId, createdAt: ts },
  }
}

export async function regenerateOneShotKeyframeByProviderChain(input: {
  shot: ShotSpec
  which: 'start' | 'end'
  outDir: string
  referenceVideoPath: string
  credentials: ModelCredentials
  chain: AiProviderName[]
}): Promise<ShotKeyframeAsset> {
  const two = await generateShotKeyframesByProviderChain(input)
  return input.which === 'start' ? two.startFrame : two.endFrame
}

export async function generateShotVideoByProviderChain(input: {
  shot: ShotSpec
  project?: CloneProject
  outDir: string
  startFramePath: string
  endFramePath: string
  consistencyMode: ConsistencyMode
  credentials: ModelCredentials
  chain: AiProviderName[]
  compiledPrompt?: string
  compiledNegativePrompt?: string
}): Promise<ProviderResult> {
  const chain = normalizeProviderChain(input.chain)
  await mkdir(input.outDir, { recursive: true })
  const errs: string[] = []
  const startFrameDataUrl = await toDataUriOrUrl(input.startFramePath, 'image')
  const endFrameDataUrl = await toDataUriOrUrl(input.endFramePath, 'image')
  const finalPrompt = buildFinalShotVideoPositivePrompt({
    shot: input.shot,
    productIdentityText: '',
    productMode: detectProductMode(String(input.shot.productType || '').trim()),
  })
  const finalNegativePrompt = buildVideoNegativePrompt(input.shot, input.compiledNegativePrompt)
  console.log('[clone-debug] final-shot-video-prompts', {
    shotId: input.shot.id,
    providerChain: chain,
    productType: String(input.shot.productType || '').trim(),
    compiledPrompt: String(input.compiledPrompt || input.shot.compiledPrompt || '').trim(),
    finalPrompt,
    compiledNegativePrompt: String(input.compiledNegativePrompt || input.shot.compiledNegativePrompt || '').trim(),
    finalNegativePrompt,
    productReferenceCount: Array.isArray(input.shot.productReferenceImagePaths) ? input.shot.productReferenceImagePaths.length : 0,
    productReferenceImagePaths: (input.shot.productReferenceImagePaths ?? []).map((item) => String(item || '').trim()).filter(Boolean),
    startFramePath: String(input.startFramePath || '').trim(),
    endFramePath: String(input.endFramePath || '').trim(),
  })

  if (
    canUseMockGeneration(input.credentials) &&
    !input.credentials.seedanceApiKey &&
    !input.credentials.klingApiKey &&
    !input.credentials.grsaiApiKey &&
    !resolveApifoxHubCredentials(input.credentials, 'video')?.apiKey
  ) {
    return await mockGenerateFromFrames({
      shot: input.shot,
      outDir: input.outDir,
      startFramePath: input.startFramePath,
      endFramePath: input.endFramePath,
    })
  }

  for (const provider of chain) {
    const key = keyByProvider(provider, input.credentials)
    if (!key) continue
    try {
      const stamp = Date.now()
      const out = join(input.outDir, `shot_video_${provider}_${input.shot.id}_${stamp}.mp4`)
      const rawOut = join(input.outDir, `raw_shot_video_${provider}_${input.shot.id}_${stamp}.mp4`)
      const host = hostByProvider(provider, input.credentials)
      if (provider === 'seedance') {
        const created = await createSeedanceTask({
          key,
          host,
          model: pickModel(input.credentials, provider),
          shot: input.shot,
          prompt: finalPrompt,
          startFrameUrl: startFrameDataUrl,
          endFrameUrl: endFrameDataUrl,
        })
        const done = await waitSeedanceOutput(key, host, created.taskId)
        await downloadAtlasToFile(done.outputUrl, rawOut, 'Seedance 视频下载')
        await normalizeCloudClipForShot({ src: rawOut, out, shot: input.shot })
        return { provider, outputFilePath: out, remoteTaskId: created.taskId, model: created.model }
      }
      if (provider === 'grsai') {
        const created = await createGrsVideoTask({
          credentials: input.credentials,
          prompt: finalPrompt,
          negativePrompt: finalNegativePrompt,
          firstFrameUrl: await publicUrlForCloudFrame(input.credentials, input.startFramePath, 'grsai-first-frame'),
          lastFrameUrl: input.endFramePath ? await publicUrlForCloudFrame(input.credentials, input.endFramePath, 'grsai-last-frame') : undefined,
        })
        let outputUrl = created.directUrl || ''
        if (!outputUrl && created.taskId) {
          try {
            outputUrl = (await waitGrsResult(input.credentials, created.taskId)).outputUrl
          } catch (error: any) {
            const reason = String(error?.message ?? error ?? '').trim() || 'unknown error'
            throw new Error(`[remote_pending] GRS.AI 视频任务已提交，等待结果查询失败。taskId=${created.taskId} reason=${reason}`)
          }
        }
        if (!outputUrl) throw new Error(`GRS.AI 视频任务没有返回输出 URL: ${JSON.stringify(created.raw)}`)
        await downloadAtlasToFile(outputUrl, rawOut, 'GRS.AI 视频下载')
        await normalizeCloudClipForShot({ src: rawOut, out, shot: input.shot })
        return { provider, outputFilePath: out, remoteTaskId: created.taskId, model: created.model }
      }
      if (provider === 'apifox_hub') {
        const orderedReferenceImages = resolveShotVideoOrderedReferencePaths(input.project, input.shot, input.startFramePath)
        const uploadedOrderedReferenceImages = (
          await Promise.all(
            orderedReferenceImages.map(async (path) => {
              return await publicUrlForCloudFrame(input.credentials, path, 'apifox-storyboard-ref')
            }),
          )
        ).filter(Boolean)
        const created = await generateApifoxVideo({
          credentials: input.credentials,
          capability: 'video_image_to_video',
          prompt: finalPrompt,
          negativePrompt: finalNegativePrompt,
          outDir: input.outDir,
          image: uploadedOrderedReferenceImages[0],
          lastImage: undefined,
          referenceImages: [],
        })
        await normalizeCloudClipForShot({ src: created.outputPath, out, shot: input.shot })
        return { provider, outputFilePath: out, remoteTaskId: created.taskId, model: created.model }
      }
      const startFrameUrl = await publicUrlForCloudFrame(input.credentials, input.startFramePath, 'atlascloud-first-frame')
      const endFrameUrl = input.endFramePath
        ? await publicUrlForCloudFrame(input.credentials, input.endFramePath, 'atlascloud-last-frame')
        : undefined
      const created = await createKlingTask({
        key,
        host,
        model: pickModel(input.credentials, provider),
        shot: input.shot,
        prompt: finalPrompt,
        negativePrompt: finalNegativePrompt,
        startFrameUrl,
        endFrameUrl,
      })
      const done = await waitKlingOutput(key, host, created.taskId)
      await downloadAtlasToFile(done.outputUrl, rawOut, 'AtlasCloud 视频下载')
      await normalizeCloudClipForShot({ src: rawOut, out, shot: input.shot })
      return { provider, outputFilePath: out, remoteTaskId: created.taskId, model: created.model }
    } catch (e: any) {
      const msg = String(e?.message ?? e)
      const currentModel = pickModel(input.credentials, provider)
      const atlasParamHint = msg.match(/currently not supported|use case|Gemini|400/i)
        ? `。AtlasCloud 后端模型不支持当前参数组合，请尝试切换模型、比例或分辨率。当前参数：model=${currentModel} aspect_ratio=${shotAspectRatio(input.shot)} duration=${atlasCloudDuration(currentModel, input.shot.durationSec)} resolution=720p`
        : msg.match(/url|image|invalid/i)
          ? '。请确认首帧和尾帧已生成，并且七牛外链域名可公网访问。'
          : ''
      errs.push(`${provider}: ${msg}${atlasParamHint}`)
    }
  }

  throw new Error(`Seedance/AtlasCloud/GRS.AI 云端生成失败: ${errs.join(' | ') || '未配置可用 API Key 或供应商不可用'}`)
}

export function inferGeneratedFileName(absPath: string) {
  return basename(absPath)
}
