import { mkdir, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, extname, join } from 'node:path'
import { getAppPaths } from '../../lib/paths'
import { runFfmpeg } from '../ffmpeg/runner'
import { resolveApifoxHubCredentials } from '../clone/apifoxProfile'
import { extractJsonObjectText, extractModelMessageContent } from '../clone/aiResponse'
import type { ModelCredentials } from '../clone/types'
import type { Product } from '../products/types'
import { CLIP_ROLES, type ClipRole, type ClipTags, type PoolClip, type PoolSource } from '../../../shared/mixPool'

/** Clips per model request: keeps one call under ~15 small images. */
export const TAG_BATCH_SIZE = 5

export type VisionPart = { text: string } | { imagePath: string }

export type VisionTarget =
  | { kind: 'hub'; style: 'openai_chat' | 'anthropic_native' | 'gemini_native'; baseUrl: string; apiKey: string; model: string }
  | { kind: 'grsai'; baseUrl: string; apiKey: string; model: string }

export function resolveVisionTarget(credentials: ModelCredentials | null | undefined): VisionTarget | null {
  if (!credentials) return null
  const hub = resolveApifoxHubCredentials(credentials, 'chat')
  const hubKey = String(hub?.apiKey || '').trim()
  const hubBase = String(hub?.baseUrl || '').trim().replace(/\/+$/, '')
  const hubUsable = Boolean(hub?.enabled && hubKey && hubBase && hub?.chatModel)
  const grsKey = String(credentials.grsaiApiKey || '').trim()
  const grs: VisionTarget | null = grsKey
    ? {
        kind: 'grsai',
        baseUrl: String(credentials.grsaiHost || 'https://grsaiapi.com').trim().replace(/\/+$/, '') || 'https://grsaiapi.com',
        apiKey: grsKey,
        model: String(credentials.grsaiAnalysisModel || '').trim() || 'gemini-3.1-pro',
      }
    : null
  const hubTarget: VisionTarget | null = hubUsable
    ? { kind: 'hub', style: hub!.chatEndpointStyle || 'openai_chat', baseUrl: hubBase, apiKey: hubKey, model: String(hub!.chatModel).trim() }
    : null
  // Same preference as the reference-script analyzer: hub when it is the chosen chat provider.
  if (credentials.chatProviderPrimary === 'apifox_hub') return hubTarget ?? grs
  return grs ?? hubTarget
}

function mimeOf(path: string) {
  const ext = extname(path).toLowerCase()
  return ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg'
}

/** Providers take models offline for maintenance (GRS.AI: "该模型维护中"); these errors mean "try another model". */
function isModelUnavailable(status: number, text: string) {
  return (
    /维护中|maintenance|no available channel|channel not found|model[_\s-]*not[_\s-]*found|does not exist|not supported|unsupported model|无可用渠道|模型不存在/i.test(text) &&
    [400, 403, 404, 429, 500, 502, 503].includes(status)
  )
}

/** Vision-capable fallbacks per model family, tried in order after the configured model. */
function fallbackModels(configured: string) {
  const m = configured.toLowerCase()
  const list = m.includes('gpt')
    ? ['gpt-4.1-mini', 'gemini-2.5-pro', 'gemini-2.5-flash']
    : m.includes('claude')
      ? ['gemini-2.5-pro', 'gemini-2.5-flash', 'gpt-4.1-mini']
      : ['gemini-2.5-pro', 'gemini-2.5-flash', 'gpt-4.1-mini']
  return [configured, ...list].filter((x, i, a) => x && a.indexOf(x) === i)
}

/** Once a fallback works, later calls in this run start with it instead of re-hitting the dead model. */
const workingModel = new Map<string, string>()
const targetKey = (t: VisionTarget) => `${t.kind}|${t.baseUrl}|${t.model}`

/** The model calls for `target` actually go to (differs from target.model after a fallback). */
export function effectiveModel(target: VisionTarget) {
  return workingModel.get(targetKey(target)) ?? target.model
}

class ModelUnavailableError extends Error {}

const MAX_MODEL_ATTEMPTS = 8
const NON_CHAT_MODEL = /image|embed|tts|whisper|dall|veo|sora|video|audio|speech|rerank|moderation|seedance|kling|midjourney/i
const liveModelLists = new Map<string, Promise<string[]>>()

/** The provider's own model list (OpenAI-compatible `/v1/models`), chat models only, newest-looking first. */
function listLiveChatModels(target: VisionTarget): Promise<string[]> {
  if (target.kind === 'hub' && target.style !== 'openai_chat') return Promise.resolve([])
  const key = `${target.kind}|${target.baseUrl}`
  let p = liveModelLists.get(key)
  if (!p) {
    p = (async () => {
      try {
        const res = await fetch(`${target.baseUrl}/v1/models`, { headers: { Authorization: `Bearer ${target.apiKey}` } })
        if (!res.ok) return []
        const ids: string[] = ((await res.json())?.data ?? []).map((m: any) => String(m?.id || '')).filter(Boolean)
        return ids.filter((id) => /gpt|gemini|claude|qwen|doubao|glm|deepseek/i.test(id) && !NON_CHAT_MODEL.test(id)).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
      } catch {
        return []
      }
    })()
    liveModelLists.set(key, p)
  }
  return p
}

export async function callVision(target: VisionTarget, system: string, parts: VisionPart[], timeoutMs = 120_000): Promise<string> {
  const key = targetKey(target)
  const sticky = workingModel.get(key)
  const tried: string[] = []
  let lastError: unknown
  const attempt = async (model: string) => {
    if (tried.includes(model) || tried.length >= MAX_MODEL_ATTEMPTS) return undefined
    tried.push(model)
    try {
      const out = await callVisionOnce({ ...target, model }, system, parts, timeoutMs)
      if (model !== target.model) workingModel.set(key, model)
      return out
    } catch (e) {
      lastError = e
      if (!(e instanceof ModelUnavailableError)) throw e
      return undefined
    }
  }
  // 1) the model that worked last time, the configured one, then same-family defaults;
  // 2) whatever the provider currently lists (providers rotate models in and out of maintenance).
  for (const model of [...(sticky ? [sticky] : []), ...fallbackModels(target.model)]) {
    const out = await attempt(model)
    if (out !== undefined) return out
  }
  for (const model of await listLiveChatModels(target)) {
    const out = await attempt(model)
    if (out !== undefined) return out
  }
  throw lastError instanceof Error ? new Error(`所有候选模型都不可用（${tried.join(' / ')}）：${lastError.message}`) : lastError
}

async function callVisionOnce(target: VisionTarget, system: string, parts: VisionPart[], timeoutMs: number): Promise<string> {
  const images = await Promise.all(
    parts.map(async (p) => ('imagePath' in p ? { mime: mimeOf(p.imagePath), b64: (await readFile(p.imagePath)).toString('base64') } : null)),
  )
  let url: string
  let headers: Record<string, string>
  let body: unknown

  if (target.kind === 'hub' && target.style === 'gemini_native') {
    url = `${target.baseUrl}/v1beta/models/${encodeURIComponent(target.model)}:generateContent`
    headers = { 'x-goog-api-key': target.apiKey, 'Content-Type': 'application/json' }
    body = {
      system_instruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: parts.map((p, i) => ('text' in p ? { text: p.text } : { inline_data: { mime_type: images[i]!.mime, data: images[i]!.b64 } })) }],
      generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
    }
  } else if (target.kind === 'hub' && target.style === 'anthropic_native') {
    url = `${target.baseUrl}/v1/messages`
    headers = { 'x-api-key': target.apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' }
    body = {
      model: target.model,
      system,
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: parts.map((p, i) =>
            'text' in p ? { type: 'text', text: p.text } : { type: 'image', source: { type: 'base64', media_type: images[i]!.mime, data: images[i]!.b64 } },
          ),
        },
      ],
    }
  } else {
    url = `${target.baseUrl}/v1/chat/completions`
    headers = { Authorization: `Bearer ${target.apiKey}`, 'Content-Type': 'application/json' }
    body = {
      model: target.model,
      stream: false,
      temperature: 0.2,
      messages: [
        { role: 'system', content: system },
        {
          role: 'user',
          content: parts.map((p, i) =>
            'text' in p ? { type: 'text', text: p.text } : { type: 'image_url', image_url: { url: `data:${images[i]!.mime};base64,${images[i]!.b64}` } },
          ),
        },
      ],
    }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal })
    const text = await res.text()
    if (!res.ok) {
      const msg = `视觉模型 ${target.model} 请求失败 HTTP ${res.status}: ${text.slice(0, 300)}`
      throw isModelUnavailable(res.status, text) ? new ModelUnavailableError(msg) : new Error(msg)
    }
    if (target.kind === 'hub' && target.style === 'gemini_native') {
      const json = JSON.parse(text)
      return String(json?.candidates?.[0]?.content?.parts?.map((x: any) => x?.text || '').join('\n') || '')
    }
    if (target.kind === 'hub' && target.style === 'anthropic_native') {
      const json = JSON.parse(text)
      return String(json?.content?.map((x: any) => x?.text || '').join('\n') || '')
    }
    return extractModelMessageContent(text)
  } catch (e: any) {
    if (controller.signal.aborted) throw new Error(`视觉模型请求超时（${Math.round(timeoutMs / 1000)}s）`)
    throw e
  } finally {
    clearTimeout(timer)
  }
}

const SYSTEM = 'You are a TikTok Shop short-video editor. You label raw footage shots for conversion-oriented product edits. Reply with strict JSON only.'

const ROLE_GUIDE = [
  'hook: strong first-2-seconds opener (result shown up front, surprising visual, product in motion close to camera, striking before/after, eye-catching action)',
  'pain_point: shows the problem / frustration the product solves',
  'unboxing: package, opening, taking product out',
  'demo: product being used / operated / handled, showing how it works',
  'wear: product worn or used on a body / in a real setting (try-on, styling, lifestyle use)',
  'detail: close-up of material, texture, craft, size, function detail',
  'comparison: side by side, before vs after, vs another product',
  'proof: evidence that builds trust (scale reference, durability test, many units, reviews, packaging quality, results)',
  'cta: good closing shot (product hero shot, product held to camera, final look, package ready to send)',
  'broll: atmosphere / filler without clear selling value',
].join('\n')

function productContext(product: Product) {
  const a = product.productAnalysis
  return [
    `Product name: ${product.name}`,
    `Product type: ${product.type}`,
    a?.summary ? `Product summary: ${a.summary}` : '',
    a?.coreSubject ? `Core subject: ${a.coreSubject}` : '',
    a?.wearingPosition ? `Worn / used on: ${a.wearingPosition}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

function buildInstruction(product: Product, count: number, hasReference: boolean) {
  return [
    `Label the ${count} video shots below. Each shot is given as 3 frames (start, middle, end) of a 1-5 second clip.`,
    productContext(product),
    hasReference ? 'The first image is the PRODUCT REFERENCE photo of the item being sold.' : '',
    '',
    'Roles (pick the single best primary role, optionally up to 2 secondary roles):',
    ROLE_GUIDE,
    '',
    'Scoring:',
    '- quality 0-100: sharpness, lighting, stable framing, product clearly visible, 9:16 friendliness. Blurry/dark/shaky/heavily watermarked <= 40.',
    '- hook_score 0-100: how likely this shot stops a scroll in the first 2 seconds of a TikTok. Static, dark or product-less shots <= 30.',
    '- looks_ai: true if frames look AI-generated (warped hands, melting details, plastic texture, inconsistent product).',
    hasReference
      ? '- matches_product: compare the item in the shot with the PRODUCT REFERENCE photo. false ONLY if it is clearly a different product: another category, an obviously different colour, or an obviously different design/shape. Angle, lighting, scale, partial view, model, background or packaging differences are NOT mismatches. If unsure, true. If no product is visible, true.'
      : '- matches_product: false ONLY if the item is clearly a different product category or an obviously different colour than described; wording details (e.g. "huggie" vs "hoop", "hammered" vs "textured") are NOT mismatches. If unsure, true.',
    '- mismatch_confidence 0-1: how sure you are that it is a different product (0 when matches_product is true). When >= 0.8 add the issue "非本商品".',
    '- has_text: true if burned-in captions, watermarks, logos or platform UI are visible.',
    '- issues: short Chinese phrases for problems (e.g. "画面模糊", "有水印", "手指变形", "产品不清楚"). Empty if none.',
    '- description: one short Chinese sentence of what happens in the shot.',
    '',
    `Return: {"clips":[{"index":1,"role":"demo","secondary_roles":[],"description":"","has_product":true,"has_hand":false,"has_face":false,"has_text":false,"looks_ai":false,"matches_product":true,"mismatch_confidence":0,"shot_scale":"close|medium|wide","motion":"static|slow|fast","quality":70,"hook_score":40,"issues":[]}]} with exactly ${count} items, index 1..${count} in order.`,
  ].join('\n')
}

const asRole = (v: unknown): ClipRole | null => {
  const s = String(v ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_')
  return (CLIP_ROLES as readonly string[]).includes(s) ? (s as ClipRole) : null
}
const clampScore = (v: unknown, fallback: number) => {
  const n = Number(v)
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : fallback
}
const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T => {
  const s = String(v ?? '').trim().toLowerCase() as T
  return allowed.includes(s) ? s : fallback
}

function normalizeTags(raw: any): ClipTags | null {
  const role = asRole(raw?.role)
  if (!role) return null
  const secondary = (Array.isArray(raw?.secondary_roles) ? raw.secondary_roles : [])
    .map(asRole)
    .filter((r: ClipRole | null): r is ClipRole => Boolean(r) && r !== role)
    .slice(0, 2)
  return {
    role,
    secondaryRoles: secondary,
    description: String(raw?.description ?? '').trim().slice(0, 120),
    hasProduct: Boolean(raw?.has_product),
    hasHand: Boolean(raw?.has_hand),
    hasFace: Boolean(raw?.has_face),
    hasText: Boolean(raw?.has_text),
    looksAi: Boolean(raw?.looks_ai),
    // Excluding real footage is costly, so only a confident "different product" verdict counts.
    matchesProduct: !(raw?.matches_product === false && Number(raw?.mismatch_confidence ?? 0) >= MISMATCH_MIN_CONFIDENCE),
    shotScale: pick(raw?.shot_scale, ['close', 'medium', 'wide'] as const, 'medium'),
    motion: pick(raw?.motion, ['static', 'slow', 'fast'] as const, 'slow'),
    quality: clampScore(raw?.quality, 50),
    hookScore: clampScore(raw?.hook_score, 30),
    issues: (Array.isArray(raw?.issues) ? raw.issues : []).map((x: unknown) => String(x).trim()).filter(Boolean).slice(0, 5),
  }
}

const MISMATCH_MIN_CONFIDENCE = 0.8

/** The product's own photo, downscaled and cached, so "is this the same product" is judged visually. */
export async function productReferenceImage(product: Product): Promise<string | null> {
  const candidates = [
    product.coverImagePath,
    product.images?.find((x) => x.isCover)?.filePath,
    product.images?.[0]?.filePath,
    product.canonicalSourcePath,
  ].filter((x): x is string => Boolean(x) && existsSync(String(x)))
  const src = candidates[0]
  if (!src) return null
  const out = join(getAppPaths().dataDir, 'mix-pool', 'frames', product.id, `reference_${createHash('sha1').update(src).digest('hex').slice(0, 10)}.jpg`)
  if (existsSync(out)) return out
  try {
    await mkdir(dirname(out), { recursive: true })
    await runFfmpeg({ args: ['-y', '-hide_banner', '-loglevel', 'error', '-i', src, '-frames:v', '1', '-q:v', '4', '-vf', 'scale=512:512:force_original_aspect_ratio=decrease', out] })
    return out
  } catch {
    return null
  }
}

/** Tags one batch of clips with the vision model. Returns tags aligned with `clips` (null = model skipped it). */
export async function tagClipBatchWithAi(input: {
  target: VisionTarget
  product: Product
  clips: PoolClip[]
  referenceImagePath?: string | null
}): Promise<Array<ClipTags | null>> {
  const ref = input.referenceImagePath ?? null
  const parts: VisionPart[] = [{ text: buildInstruction(input.product, input.clips.length, Boolean(ref)) }]
  if (ref) parts.push({ text: 'PRODUCT REFERENCE:' }, { imagePath: ref })
  input.clips.forEach((clip, i) => {
    parts.push({ text: `Shot ${i + 1} (${clip.durationSec.toFixed(1)}s):` })
    for (const f of clip.framePaths) parts.push({ imagePath: f })
  })
  const content = await callVision(input.target, SYSTEM, parts)
  const parsed = JSON.parse(extractJsonObjectText(content))
  const list: any[] = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.clips) ? parsed.clips : []
  return input.clips.map((_, i) => {
    const item = list.find((x) => Number(x?.index) === i + 1) ?? list[i]
    return item ? normalizeTags(item) : null
  })
}

const SEGMENT_ROLE_HINT: Record<string, ClipRole> = {
  hook: 'hook',
  show: 'demo',
  demo: 'demo',
  detail: 'detail',
  wear: 'wear',
  unboxing: 'unboxing',
  cta: 'cta',
  proof: 'proof',
}

/** No-model fallback: role from the product segment the footage was filed under, quality from resolution. */
export function heuristicTags(clip: PoolClip, source: PoolSource | undefined): ClipTags {
  const hinted = source?.kind === 'product_asset' ? SEGMENT_ROLE_HINT[String(source.ref || '').toLowerCase()] : undefined
  const role: ClipRole = hinted ?? 'broll'
  const shortSide = Math.min(Number(source?.width || 0), Number(source?.height || 0))
  const quality = shortSide >= 1080 ? 70 : shortSide >= 720 ? 60 : shortSide > 0 ? 45 : 50
  return {
    role,
    secondaryRoles: [],
    description: '',
    hasProduct: true,
    hasHand: false,
    hasFace: false,
    hasText: false,
    looksAi: clip.origin === 'ai',
    shotScale: 'medium',
    motion: 'slow',
    quality,
    hookScore: role === 'hook' ? 50 : 25,
    issues: ['未经 AI 识别'],
  }
}
