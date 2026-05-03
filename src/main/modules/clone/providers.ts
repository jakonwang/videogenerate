import { copyFile, mkdir, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { runFfmpeg } from '../ffmpeg/runner'
import { createGrsVideoTask, isPublicHttpUrl, waitGrsResult } from './grsai'
import { toPublicUrlViaQiniu } from './qiniu'
import { downloadAtlasToFile, getAtlasJson, pickAtlasOutputUrl, postAtlasJson } from './atlasRetry'
import { generateVideo as generateApifoxVideo } from './unifiedVideo'
import { buildReferenceLockText, buildShotScriptConstraintText } from './prompt'
import type {
  AiProviderName,
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
  if (p === 'apifox_hub') return credentials.apifoxHub?.apiKey
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
  if (p === 'apifox_hub') return String(credentials.apifoxHub?.baseUrl || '').trim().replace(/\/+$/, '')
  return atlasCloudHost()
}

function pickModel(credentials: ModelCredentials, provider: AiProviderName) {
  if (provider === 'apifox_hub') {
    return (
      credentials.apifoxHub?.referenceVideoModel ||
      credentials.apifoxHub?.startEndVideoModel ||
      credentials.apifoxHub?.imageToVideoModel ||
      credentials.apifoxHub?.textToVideoModel ||
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
    static: 'mostly static handheld phone shot with subtle natural hand micro-shake',
    zoom_in: 'slow natural push-in, phone camera moves slightly closer',
    zoom_out: 'slow natural pull-back, phone camera moves slightly away',
    pan_left: 'small handheld pan left, smooth but not cinematic',
    pan_right: 'small handheld pan right, smooth but not cinematic',
    shake: 'light authentic handheld movement, not chaotic',
    fast_cut: 'quick practical product reveal motion, no surreal effects',
  }
  return map[motion] || map.static
}

export function buildRealisticPrompt(shot: ShotSpec, phase: 'start' | 'end' | 'video') {
  const userPrompt = String(shot.aiPrompt || shot.prompt?.positive || '').trim()
  const referenceLock = buildReferenceLockText(shot, 'reference shot scene atmosphere')
  const scriptLock = buildShotScriptConstraintText(shot)
  const productLock =
    'Keep the exact product from the reference images: same color, shape, material, pattern, print, holes, edges, size and design. Do not add logos, gems, charms, text, extra patterns or new decorations.'
  const realism =
    'Premium realistic social commerce video, shot on a modern smartphone camera, natural daylight, clean editorial composition, real human hands, real shadows, real lens perspective, believable e-commerce demo. Hard-copy the reference shot action form, background category, camera distance, composition, hand gesture and motion path. Replace only the person identity and product identity. Do not copy the original person, watermark, captions, stickers or platform UI. Avoid CGI, 3D render, plastic toy look, fantasy scene, over-smoothed skin, warped fingers, fake text, watermark, subtitles, captions, UI overlays, account names, stickers and logos.'
  const phaseText =
    phase === 'start'
      ? 'Opening keyframe, product already visible and in focus, clean frame with no watermark or subtitles.'
      : phase === 'end'
        ? 'Ending keyframe, same product and scene continuity, natural final pose, clean frame with no watermark or subtitles.'
        : 'Generate natural motion between first and last frame. Preserve product identity, subject pose, hand trajectory, background atmosphere and camera continuity. Do not switch to a different action, different location, different product-display method or unrelated camera angle. No morphing, no object melting, no artificial animation, no copied TikTok watermark, no copied subtitles.'
  return [realism, scriptLock, referenceLock, productLock, shotRolePrompt(shot), shotMotionPrompt(shot), phaseText, userPrompt]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .slice(0, 3200)
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
  return String(json?.taskId ?? json?.task_id ?? json?.id ?? json?.data?.task_id ?? json?.data?.taskId ?? json?.data?.id ?? '').trim()
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
      prompt: buildRealisticPrompt(input.shot, 'video'),
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
  startFrameUrl: string
  endFrameUrl?: string
}) {
  const body: AnyJson = {
    model: ATLASCLOUD_SEEDANCE_REFERENCE_MODEL,
    prompt: buildRealisticPrompt(input.shot, 'video'),
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
  startFrameUrl: string
  endFrameUrl?: string
}) {
  const content: AnyJson[] = [
    {
      type: 'text',
      text: buildRealisticPrompt(input.shot, 'video'),
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
  startFrameUrl: string
  endFrameUrl?: string
}) {
  const model = normalizeKlingType(input.model)
  const body: AnyJson = {
    model,
    prompt: buildRealisticPrompt(input.shot, 'video'),
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

export async function generateShotByProviderChain(input: {
  shot: ShotSpec
  outDir: string
  referenceVideoPath: string
  credentials: ModelCredentials
  chain: AiProviderName[]
}): Promise<ProviderResult> {
  if (input.credentials.allowMockWhenNoKey && !input.credentials.seedanceApiKey && !input.credentials.klingApiKey && !input.credentials.grsaiApiKey) {
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
  outDir: string
  startFramePath: string
  endFramePath: string
  consistencyMode: ConsistencyMode
  credentials: ModelCredentials
  chain: AiProviderName[]
}): Promise<ProviderResult> {
  const chain = normalizeProviderChain(input.chain)
  await mkdir(input.outDir, { recursive: true })
  const errs: string[] = []
  const startFrameDataUrl = await toDataUriOrUrl(input.startFramePath, 'image')
  const endFrameDataUrl = await toDataUriOrUrl(input.endFramePath, 'image')

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
          prompt: buildRealisticPrompt(input.shot, 'video'),
          firstFrameUrl: await publicUrlForCloudFrame(input.credentials, input.startFramePath, 'grsai-first-frame'),
          lastFrameUrl: input.endFramePath ? await publicUrlForCloudFrame(input.credentials, input.endFramePath, 'grsai-last-frame') : undefined,
        })
        const outputUrl = created.directUrl || (created.taskId ? (await waitGrsResult(input.credentials, created.taskId)).outputUrl : '')
        if (!outputUrl) throw new Error(`GRS.AI 视频任务没有返回输出 URL: ${JSON.stringify(created.raw)}`)
        await downloadAtlasToFile(outputUrl, rawOut, 'GRS.AI 视频下载')
        await normalizeCloudClipForShot({ src: rawOut, out, shot: input.shot })
        return { provider, outputFilePath: out, remoteTaskId: created.taskId, model: created.model }
      }
      if (provider === 'apifox_hub') {
        const startFrameUrl = await publicUrlForCloudFrame(input.credentials, input.startFramePath, 'apifox-first-frame')
        const endFrameUrl = input.endFramePath
          ? await publicUrlForCloudFrame(input.credentials, input.endFramePath, 'apifox-last-frame')
          : undefined
        const created = await generateApifoxVideo({
          credentials: input.credentials,
          capability: endFrameUrl ? 'video_start_end_to_video' : 'video_image_to_video',
          prompt: buildRealisticPrompt(input.shot, 'video'),
          outDir: input.outDir,
          image: startFrameUrl,
          lastImage: endFrameUrl,
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
