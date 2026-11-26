import http from 'node:http'
import { Readable } from 'node:stream'
import type { BillingCapability } from '../../../src/shared/cloud/billing'
import {
  AI_PROXY_PATH,
  AI_PROXY_PLATFORMS,
  TIKHUB_DEFAULT_BASE_URL,
  type AiProxyPlatform,
  type ManagedSoftwareSettings,
} from '../../../src/shared/cloud/managedSettings'
import type { BillingService } from './billing'
import type { CloudDb } from './db'
import { CloudError } from './security'
import type { GenerationLog } from './generationLog'
import { TIKHUB_PARSE_PATHS } from '../../../src/shared/videoParserPlatforms'
import { isCatalogVideoModelName } from '../../../src/shared/videoModels'
import { TIKHUB_RADAR_PATHS } from '../../../src/shared/competitorRadar'

/**
 * 云端 AI 代理：商业版电脑端的视频 / 图片 / 对话请求都先到这里，由服务器带上后台的平台 Key 转发给平台。
 *
 * - 平台 Key 只在服务器：电脑端拿到的是 `${云端}/api/v1/ai-proxy/<平台>` + 代理令牌（绑定账号、设备、会话）。
 * - 扣点在服务器：按「方法 + 路径 + 模型」判断是不是一次生成，转发前冻结点数；
 *   平台直接报错 → 退回；返回任务号 → 记下来，之后查询进度时看到失败退回、成功确认；没人查的 12 小时后自动确认。
 * - 不认识的提交接口一律拒绝（宁可报错也不让生成免费漏过），看日志补规则。
 */

export type ProxyIdentity = { userId: string }

export type ProxyDecision =
  /** metered：不扣点，但平台按次收我们钱，限每天次数 */
  | { kind: 'free'; metered?: 'chat' | 'tikhub' }
  | { kind: 'charge'; capability: BillingCapability; track: boolean }
  | { kind: 'blocked'; reason: string }
  | { kind: 'unknown' }

const MAX_PROXY_BODY_BYTES = 64 * 1024 * 1024
const PENDING_TASK_SCAN = 100

/* ------------------------------------------------------------------ 判断要不要扣点 */

const VIDEO_MODEL_RE = /veo|sora|kling|seedance|vidu|hailuo|minimax-video|wan2|wanx|jimeng|runway|luma|pika|hunyuan-?video|video/i
const IMAGE_MODEL_RE = /image|dall-?e|nano-?banana|flux|midjourney|seedream|imagen|kolors|recraft|ideogram|gpt-4o-all/i

/** 只看路径就能确定的提交接口（小写、去掉末尾斜杠后按结尾匹配） */
const VIDEO_SUBMIT: RegExp[] = [
  /\/v1\/video\/generations$/,
  /\/v1\/video\/create$/,
  /\/v1\/videos$/,
  /\/model\/generatevideo$/,
  /\/model\/prediction$/,
  /\/api\/v3\/contents\/generations\/tasks$/,
  /\/jobs\/createtask$/,
  /\/vidu\/ent\/v2\/(text2video|img2video|start-end2video|reference2video)$/,
  /\/kling\/v\d+\/videos\/[a-z0-9_-]+$/,
]
const IMAGE_SUBMIT: RegExp[] = [/\/v1\/images\/(generations|edits|variations)$/, /\/model\/generateimage$/, /\/mj\/submit\/[a-z_-]+$/]
/** 不扣点的 POST：查询进度、上传素材、语音转写、向量 */
const FREE_POST: RegExp[] = [
  /\/v1\/draw\/result$/,
  /\/v1\/video\/query$/,
  /\/model\/uploadmedia$/,
  /\/v1\/files$/,
  /\/upload$/,
  /\/v1\/audio\/transcriptions$/,
  /\/v1\/embeddings$/,
  /\/v1\/moderations$/,
  /\/mj\/task\/list-by-condition$/,
]
/** 对话类接口：按模型判断是不是在生成图片 / 视频 */
const CHAT_LIKE: RegExp[] = [/\/v1\/chat\/completions$/, /\/v1\/messages$/, /\/v1\/responses$/, /\/v1beta\/models\/[^/]+:(stream)?generatecontent$/]
/** 会暴露后台账户信息的接口 */
const BLOCKED: RegExp[] = [/\/client\/grsai\/getcredits$/, /\/dashboard\//, /\/api\/user\//, /\/api\/token\//]

export function classifyProxyRequest(input: {
  platform: AiProxyPlatform
  method: string
  path: string
  model: string
  isVideoModel?: (model: string) => boolean
  isImageModel?: (model: string) => boolean
}): ProxyDecision {
  const path = input.path.toLowerCase().replace(/\/+$/, '')
  if (BLOCKED.some((re) => re.test(path))) return { kind: 'blocked', reason: '这个接口不对客户端开放' }
  // TikHub 用平台的账户：只放行视频解析用到的接口（账户信息、其它付费接口一律不开放）
  if (input.platform === 'tikhub') {
    // 解析下载 + 竞品爆款雷达（账号资料、账号作品）
    const allowed = (input.method.toUpperCase() === 'GET' || input.method.toUpperCase() === 'HEAD') && (TIKHUB_PARSE_PATHS.includes(path) || (TIKHUB_RADAR_PATHS as readonly string[]).includes(path))
    return allowed ? { kind: 'free', metered: 'tikhub' } : { kind: 'blocked', reason: '这个接口不对客户端开放' }
  }
  const method = input.method.toUpperCase()
  if (method === 'GET' || method === 'HEAD') return { kind: 'free' }
  if (method !== 'POST') return { kind: 'unknown' }
  if (/\/v1\/(audio\/transcriptions|embeddings)$/.test(path)) return { kind: 'free', metered: 'chat' }
  if (FREE_POST.some((re) => re.test(path))) return { kind: 'free' }
  // 高瑞 / 小扳手的异步图片也走 /v1/videos，GRS 的 /v1/api/generate 图片视频共用：按模型名分
  if (/\/v1\/videos$/.test(path) || /\/v1\/api\/generate$/.test(path)) {
    const model = input.model
    if (model && !isCatalogVideoModelName(model) && !input.isVideoModel?.(model) && (input.isImageModel?.(model) || IMAGE_MODEL_RE.test(model))) {
      return { kind: 'charge', capability: 'image', track: true }
    }
    if (/\/v1\/api\/generate$/.test(path) && !model) return { kind: 'unknown' }
    return { kind: 'charge', capability: 'video', track: true }
  }
  if (VIDEO_SUBMIT.some((re) => re.test(path))) return { kind: 'charge', capability: 'video', track: true }
  if (IMAGE_SUBMIT.some((re) => re.test(path))) return { kind: 'charge', capability: 'image', track: true }
  // grsai：/v1/draw/<模型> 是图片，/v1/video/<模型> 是视频
  if (/\/v1\/draw\/[a-z0-9._-]+$/.test(path)) return { kind: 'charge', capability: 'image', track: true }
  if (/\/v1\/video\/[a-z0-9._-]+$/.test(path)) return { kind: 'charge', capability: 'video', track: true }
  if (CHAT_LIKE.some((re) => re.test(path))) {
    const model = input.model
    // 看不出模型就不能判断是不是在生成图片 / 视频：拒绝，而不是当成免费放行
    if (!model) return { kind: 'unknown' }
    const isVideo = input.isVideoModel?.(model) || VIDEO_MODEL_RE.test(model)
    if (isVideo) return { kind: 'charge', capability: 'video', track: false }
    const isImage = input.isImageModel?.(model) || IMAGE_MODEL_RE.test(model)
    if (isImage) return { kind: 'charge', capability: 'image', track: false }
    return { kind: 'free', metered: 'chat' }
  }
  return { kind: 'unknown' }
}

const MODEL_FIELDS = ['model', 'model_name', 'modelName']

/**
 * 从请求里找出所有写了模型的地方：generateContent 路径、查询串 ?model=、JSON 的 model / model_name / modelName、multipart 的同名字段。
 * 不看 Content-Type 决定要不要解析 JSON：很多平台不管请求头照样按 JSON 读，只按请求头判断会让人去掉请求头免费生成。
 */
export function extractModelCandidates(path: string, contentType: string, body: Buffer, query?: URLSearchParams): string[] {
  const found: string[] = []
  const add = (value: unknown) => {
    if (typeof value !== 'string' && typeof value !== 'number') return
    const text = String(value).trim().slice(0, 120)
    if (text && !found.includes(text)) found.push(text)
  }
  const fromPath = /\/models\/([^/:]+):/i.exec(path)
  if (fromPath) {
    try {
      add(decodeURIComponent(fromPath[1]))
    } catch {
      add(fromPath[1])
    }
  }
  for (const field of MODEL_FIELDS) for (const value of query?.getAll(field) ?? []) add(value)
  if (!body.length) return found
  const text = body.toString('utf8')
  if (/^\s*[{[]/.test(text)) {
    try {
      const json = JSON.parse(text)
      if (json && typeof json === 'object' && !Array.isArray(json)) for (const field of MODEL_FIELDS) add(json[field])
    } catch {
      // 不是合法 JSON：交给下面的 multipart / 平台自己处理
    }
  }
  if (contentType.includes('multipart/form-data') || /content-disposition:\s*form-data/i.test(body.subarray(0, 4096).toString('latin1'))) {
    const all = body.toString('latin1')
    const re = /name="?(model|model_name|modelName)"?\r\n(?:[^\r\n]*\r\n)*?\r\n([^\r\n]{1,120})/gi
    for (let m = re.exec(all); m; m = re.exec(all)) add(m[2])
  }
  return found
}

const COUNT_FIELDS = ['n', 'num_images', 'numImages', 'number_of_images', 'numberOfImages', 'num_outputs', 'numOutputs', 'batch_size', 'batchSize', 'sampleCount', 'sample_count', 'numberOfVideos', 'candidateCount', 'candidate_count', 'max_images']
const COUNT_PARENTS = ['input', 'parameters', 'config', 'generationConfig', 'generation_config', 'extra_body', 'sequential_image_generation_options']
const MAX_UNITS = 10

/** 一次请求要生成几份：参数里写 n=4 就按 4 份扣，防止花一次的点数出多份 */
export function extractUnits(body: Buffer, contentType = ''): number {
  let units = 1
  const add = (value: unknown) => {
    const n = Number(value)
    if (Number.isFinite(n) && n > units) units = Math.ceil(n)
  }
  const scan = (json: any) => {
    if (!json || typeof json !== 'object' || Array.isArray(json)) return
    for (const field of COUNT_FIELDS) if (typeof json[field] === 'number' || typeof json[field] === 'string') add(json[field])
  }
  if (!body.length) return units
  const text = body.toString('utf8')
  if (/^\s*\{/.test(text)) {
    try {
      const json = JSON.parse(text)
      scan(json)
      for (const key of COUNT_PARENTS) scan(json[key])
      for (const key of COUNT_PARENTS) scan(json.input?.[key])
    } catch {
      // 不是合法 JSON
    }
  }
  if (contentType.includes('multipart/form-data') || /content-disposition:\s*form-data/i.test(body.subarray(0, 4096).toString('latin1'))) {
    const re = new RegExp(`name="?(?:${COUNT_FIELDS.join('|')})"?\\r\\n(?:[^\\r\\n]+\\r\\n)*\\r\\n\\s*(\\d{1,6})`, 'g')
    const all = body.toString('latin1')
    for (let m = re.exec(all); m; m = re.exec(all)) add(m[1])
  }
  return units
}

/** 兼容旧调用：取第一个写了的模型 */
export function extractModel(path: string, contentType: string, body: Buffer, query?: URLSearchParams): string {
  return extractModelCandidates(path, contentType, body, query)[0] ?? ''
}

/* ------------------------------------------------------------------ 解析平台响应 */

const TASK_ID_PATHS: string[][] = [
  ['data', 'task_id'], ['data', 'taskId'], ['data', 'task', 'id'], ['data', 'task', 'task_id'], ['data', 'id'], ['data', 'uuid'],
  ['data', 'job_id'], ['data', 'prediction_id'], ['data', 'request_id'], ['data', 'video_id'], ['data', 'result', 'id'],
  ['task_id'], ['taskId'], ['task', 'id'], ['job_id'], ['prediction_id'], ['request_id'], ['video_id'], ['uuid'], ['id'], ['result'],
]

function at(json: any, path: string[]) {
  let current = json
  for (const key of path) {
    if (!current || typeof current !== 'object') return undefined
    current = current[key]
  }
  return current
}

export function pickTaskIdFromResponse(json: any): string {
  if (typeof json?.data === 'string' || typeof json?.data === 'number') return String(json.data).trim()
  for (const path of TASK_ID_PATHS) {
    const value = at(json, path)
    if (typeof value === 'string' || typeof value === 'number') {
      const id = String(value).trim()
      if (id && id.length <= 200) return id
    }
  }
  return ''
}

const SUCCESS = new Set(['completed', 'complete', 'succeeded', 'success', 'succeed', 'done', 'finish', 'finished'])
const FAILURE = new Set(['failed', 'fail', 'failure', 'error', 'cancelled', 'canceled', 'expired', 'rejected', 'timeout', 'violation'])

export function pickTaskStatus(json: any): 'succeeded' | 'failed' | 'running' {
  const raw = [
    at(json, ['data', 'status']), at(json, ['data', 'state']), at(json, ['data', 'task_status']), at(json, ['data', 'prediction', 'status']),
    at(json, ['data', 'result', 'status']), json?.status, json?.state, json?.task_status, at(json, ['prediction', 'status']), at(json, ['result', 'status']),
  ].find((value) => typeof value === 'string' && value.trim())
  const status = String(raw ?? '').trim().toLowerCase()
  if (SUCCESS.has(status)) return 'succeeded'
  if (FAILURE.has(status)) return 'failed'
  return 'running'
}

/** 2xx 但响应里明说失败（code 非 0 且带错误信息、error 字段、状态为失败） */
export function responseLooksFailed(json: any): string {
  if (!json || typeof json !== 'object') return ''
  if (pickTaskStatus(json) === 'failed') return String(json?.error?.message ?? json?.message ?? json?.msg ?? json?.data?.error ?? json?.data?.fail_reason ?? '平台返回失败').slice(0, 200)
  const error = json.error
  if (error && (typeof error === 'string' || typeof error === 'object')) {
    const message = typeof error === 'string' ? error.trim() : String(error.message || error.code || '').trim()
    if (message) return message.slice(0, 200)
  }
  const code = json.code
  const okCodes = new Set([0, 200, '0', '200', 'success', 'SUCCESS', 'ok', 'OK'])
  if (code !== undefined && code !== null && !okCodes.has(code) && (json.msg || json.message)) return String(json.msg || json.message).slice(0, 200)
  return ''
}

function hasOutput(json: any) {
  const text = JSON.stringify(json ?? '')
  return /https?:\/\/[^"]+\.(mp4|mov|webm|png|jpe?g|webp)/i.test(text) || /"b64_json"\s*:\s*"/.test(text)
}

/** 响应里是否原样出现了这个任务号（防止拿别的失败任务来给自己退点） */
function responseMentions(json: any, ids: string[], depth = 0): boolean {
  if (depth > 6 || json === null || json === undefined) return false
  if (typeof json === 'string' || typeof json === 'number') return ids.includes(String(json).trim())
  if (Array.isArray(json)) return json.some((item) => responseMentions(item, ids, depth + 1))
  if (typeof json === 'object') return Object.values(json).some((value) => responseMentions(value, ids, depth + 1))
  return false
}

function idVariants(taskId: string) {
  const id = String(taskId || '').trim()
  const stripped = id.includes(':') ? id.slice(id.lastIndexOf(':') + 1) : id
  return [...new Set([id, stripped].filter((value) => value.length >= 4))]
}

function parseJson(buffer: Buffer): any {
  try {
    return JSON.parse(buffer.toString('utf8'))
  } catch {
    return null
  }
}

/* ------------------------------------------------------------------ 代理本体 */

const HOP_HEADERS = new Set([
  'host', 'connection', 'keep-alive', 'proxy-authorization', 'proxy-connection', 'te', 'trailer', 'transfer-encoding', 'upgrade',
  'content-length', 'cookie', 'origin', 'referer', 'authorization', 'x-api-key', 'x-goog-api-key', 'api-key', 'accept-encoding',
])

function readBody(req: http.IncomingMessage, maxBytes: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > maxBytes) {
        reject(new CloudError('BAD_REQUEST', '请求体过大', 413))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function sendError(res: http.ServerResponse, status: number, code: string, message: string, details?: unknown) {
  if (res.headersSent) {
    res.end()
    return
  }
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  // 同时给出 OpenAI 风格的 error，电脑端各平台适配器都能把错误信息显示出来
  res.end(JSON.stringify({ ok: false, code, error: { message, code }, message, details }))
}

export function createAiProxy(deps: {
  db: CloudDb
  readManagedSettings: () => ManagedSoftwareSettings
  /** 校验代理令牌，失败抛 CloudError */
  verifyToken: (token: string) => ProxyIdentity
  billing: BillingService
  fetchImpl?: typeof fetch
  now: () => number
  maxBodyBytes?: number
  /** 不扣点但有成本的调用每天上限，0 = 不限 */
  meteredPerDay?: { chat: number; tikhub: number }
  tikhubBaseUrl?: string
  /** 给总后台留生成记录（可选） */
  genLog?: GenerationLog
}) {
  const { db } = deps
  const doFetch = deps.fetchImpl ?? fetch
  const maxBody = deps.maxBodyBytes ?? MAX_PROXY_BODY_BYTES

  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_proxy_tasks (
      hold_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      platform TEXT NOT NULL,
      task_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at INTEGER NOT NULL,
      settled_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_ai_proxy_tasks_pending ON ai_proxy_tasks(user_id, platform, status, created_at);
  `)

  function upstreamOf(platform: AiProxyPlatform): { baseUrl: string; apiKey: string } | null {
    const settings = deps.readManagedSettings()
    if (!settings.enabled) return null
    if (platform === 'tikhub') return settings.tikhubApiKey ? { baseUrl: deps.tikhubBaseUrl || TIKHUB_DEFAULT_BASE_URL, apiKey: settings.tikhubApiKey } : null
    const entry = settings.platforms[platform]
    if (!entry?.apiKey) return null
    const fallback = platform === 'grsai' ? 'https://grsaiapi.com' : ''
    const baseUrl = String(entry.baseUrl || fallback).replace(/\/+$/, '')
    return baseUrl ? { baseUrl, apiKey: entry.apiKey } : null
  }

  function knownModel(capability: BillingCapability) {
    return (model: string) => {
      if (!model) return false
      const row = db.prepare('SELECT 1 FROM ai_models WHERE capability = ? AND model = ? LIMIT 1').get(capability, model)
      if (row) return true
      const settings = deps.readManagedSettings()
      return settings.capabilities[capability].model === model
    }
  }

  /** 先占次数再转发；超管 / 不受限账号不限 */
  function countMetered(userId: string, kind: 'chat' | 'tikhub') {
    const limit = deps.meteredPerDay?.[kind] ?? 0
    const day = new Date(deps.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const row = db.prepare('SELECT calls FROM ai_proxy_usage WHERE user_id = ? AND day = ? AND kind = ?').get(userId, day, kind) as { calls: number } | undefined
    if (limit > 0 && Number(row?.calls ?? 0) >= limit && !deps.billing.isUnlimited(userId)) {
      throw new CloudError('RATE_LIMITED', `今天的${kind === 'chat' ? ' AI 对话' : '视频解析'}次数已用完（${limit} 次），请明天再试`, 429, { limit })
    }
    db.prepare('INSERT INTO ai_proxy_usage (user_id, day, kind, calls) VALUES (?, ?, ?, 1) ON CONFLICT (user_id, day, kind) DO UPDATE SET calls = calls + 1').run(userId, day, kind)
  }

  function settle(holdId: string, ok: boolean, reason = '', json: any = null) {
    try {
      deps.billing.settle(null, holdId, ok, reason.slice(0, 200))
    } catch (error) {
      console.warn('[ai-proxy] 点数结算失败', holdId, (error as Error).message)
    }
    db.prepare("UPDATE ai_proxy_tasks SET status = ?, settled_at = ? WHERE hold_id = ? AND status = 'pending'").run(ok ? 'succeeded' : 'failed', deps.now(), holdId)
    deps.genLog?.finished(holdId, ok, reason, json)
  }

  /** 这个请求是不是在查询某个还没结算的任务 */
  function findPendingTask(userId: string, platform: string, haystack: string) {
    if (!haystack) return null
    // 超过 12 小时的冻结已被自动确认，不再跟踪
    const since = deps.now() - 12 * 60 * 60 * 1000
    const rows = db
      .prepare("SELECT hold_id, task_id FROM ai_proxy_tasks WHERE user_id = ? AND platform = ? AND status = 'pending' AND created_at >= ? ORDER BY created_at DESC LIMIT ?")
      .all(userId, platform, since, PENDING_TASK_SCAN) as Array<{ hold_id: string; task_id: string }>
    for (const row of rows) {
      const ids = idVariants(row.task_id)
      if (ids.some((id) => haystack.includes(id) || haystack.includes(encodeURIComponent(id)))) return { holdId: row.hold_id, ids }
    }
    return null
  }

  function buildUpstreamRequest(req: http.IncomingMessage, url: URL, rest: string, upstream: { baseUrl: string; apiKey: string }) {
    const target = new URL(`${upstream.baseUrl}${rest}`)
    for (const [name, value] of url.searchParams) {
      // Gemini 风格的 ?key= 换成真实 Key
      target.searchParams.append(name, name === 'key' ? upstream.apiKey : value)
    }
    const headers: Record<string, string> = {}
    for (const [name, value] of Object.entries(req.headers)) {
      if (value === undefined || HOP_HEADERS.has(name.toLowerCase()) || name.toLowerCase().startsWith('x-forwarded') || name.toLowerCase().startsWith('x-vg-')) continue
      headers[name] = Array.isArray(value) ? value.join(', ') : value
    }
    const key = upstream.apiKey
    headers.authorization = /^bearer\s+/i.test(key) ? key : `Bearer ${key}`
    if (req.headers['x-api-key'] !== undefined) headers['x-api-key'] = key
    if (req.headers['x-goog-api-key'] !== undefined) headers['x-goog-api-key'] = key
    if (req.headers['api-key'] !== undefined) headers['api-key'] = key
    return { target, headers }
  }

  function tokenOf(req: http.IncomingMessage, url: URL) {
    const auth = String(req.headers.authorization || '').trim()
    const candidates = [
      auth.replace(/^bearer\s+/i, ''),
      String(req.headers['x-api-key'] || ''),
      String(req.headers['x-goog-api-key'] || ''),
      String(req.headers['api-key'] || ''),
      url.searchParams.get('key') || '',
    ]
    return candidates.map((value) => value.trim()).find(Boolean) || ''
  }

  async function pipeResponse(res: http.ServerResponse, upstream: Response) {
    res.statusCode = upstream.status
    upstream.headers.forEach((value, name) => {
      const lower = name.toLowerCase()
      if (lower === 'content-encoding' || lower === 'content-length' || lower === 'transfer-encoding' || lower === 'connection' || lower === 'set-cookie') return
      res.setHeader(name, value)
    })
    if (!upstream.body) {
      res.end()
      return
    }
    await new Promise<void>((resolve) => {
      const stream = Readable.fromWeb(upstream.body as any)
      stream.on('error', () => {
        res.destroy()
        resolve()
      })
      res.on('close', () => {
        stream.destroy()
        resolve()
      })
      stream.pipe(res)
      stream.on('end', () => resolve())
    })
  }

  function sendBuffered(res: http.ServerResponse, upstream: Response, body: Buffer) {
    res.statusCode = upstream.status
    upstream.headers.forEach((value, name) => {
      const lower = name.toLowerCase()
      if (lower === 'content-encoding' || lower === 'content-length' || lower === 'transfer-encoding' || lower === 'connection' || lower === 'set-cookie') return
      res.setHeader(name, value)
    })
    res.end(body)
  }

  /** 返回 true 表示已处理（路径属于代理） */
  async function handle(req: http.IncomingMessage, res: http.ServerResponse, pathname: string): Promise<boolean> {
    if (!pathname.startsWith(`${AI_PROXY_PATH}/`)) return false
    const url = new URL(req.url || '/', 'http://cloud.local')
    const afterPrefix = url.pathname.slice(AI_PROXY_PATH.length + 1)
    const slash = afterPrefix.indexOf('/')
    const platform = (slash === -1 ? afterPrefix : afterPrefix.slice(0, slash)) as AiProxyPlatform
    const rest = slash === -1 ? '' : afterPrefix.slice(slash)
    const method = String(req.method || 'GET').toUpperCase()
    try {
      if (!AI_PROXY_PLATFORMS.includes(platform)) throw new CloudError('NOT_FOUND', '不支持的平台', 404)
      if (/(^|\/)\.\.?(\/|$)/.test(rest) || rest.includes('\\') || /%2e%2e|%2f|%5c/i.test(rest)) throw new CloudError('BAD_REQUEST', '路径不合法', 400)
      const identity = deps.verifyToken(tokenOf(req, url))
      const upstream = upstreamOf(platform)
      if (!upstream) throw new CloudError('FORBIDDEN', '后台没有配置这个平台，请联系客服', 403)
      const body = method === 'GET' || method === 'HEAD' ? Buffer.alloc(0) : await readBody(req, maxBody)
      const contentType = String(req.headers['content-type'] || '').toLowerCase()
      const models = extractModelCandidates(rest, contentType, body, url.searchParams)
      // 不同字段写了不同模型：计费看的和平台实际用的可能不是同一个，直接拒绝
      if (models.length > 1) throw new CloudError('BAD_REQUEST', `请求里同时写了多个模型（${models.join('、')}），请只保留一个`, 400)
      const model = models[0] ?? ''
      const decision = classifyProxyRequest({
        platform,
        method,
        path: rest,
        model,
        isVideoModel: knownModel('video'),
        isImageModel: knownModel('image'),
      })
      if (decision.kind === 'blocked') throw new CloudError('FORBIDDEN', decision.reason, 403)
      if (decision.kind === 'unknown') {
        console.warn('[ai-proxy] 未识别的接口，已拒绝', platform, method, rest, model)
        throw new CloudError('FORBIDDEN', `云端暂不支持这个接口（${method} ${rest}），请联系客服`, 403, { platform, method, path: rest })
      }

      const { target, headers } = buildUpstreamRequest(req, url, rest, upstream)
      const abort = new AbortController()
      res.on('close', () => {
        if (!res.writableEnded) abort.abort()
      })
      const init: RequestInit = { method, headers, body: body.length ? new Uint8Array(body) : undefined, signal: abort.signal, redirect: 'manual' }

      if (decision.kind === 'free') {
        if (decision.metered) countMetered(identity.userId, decision.metered)
        const pending = findPendingTask(identity.userId, platform, `${url.pathname}${url.search} ${body.length && body.length < 64 * 1024 ? body.toString('utf8') : ''}`)
        const upstreamRes = await doFetch(target, init)
        if (!pending) {
          await pipeResponse(res, upstreamRes)
          return true
        }
        // 查询的是一个还没结算的任务：看结果决定确认还是退回
        const responseBody = Buffer.from(await upstreamRes.arrayBuffer())
        if (upstreamRes.ok) {
          const json = parseJson(responseBody)
          if (json && responseMentions(json, pending.ids)) {
            const status = pickTaskStatus(json)
            if (status === 'succeeded') settle(pending.holdId, true, '', json)
            else if (status === 'failed') settle(pending.holdId, false, responseLooksFailed(json) || '平台任务失败', json)
          }
        }
        sendBuffered(res, upstreamRes, responseBody)
        return true
      }

      // 扣点：先冻结，再转发
      // x-vg-client 只用于后台统计（服务器复刻引擎带 web），不影响扣多少点
      const clientHeader = String(req.headers['x-vg-client'] || '')
      const client = clientHeader === 'web' || clientHeader === 'mobile' ? clientHeader : 'desktop'
      const units = extractUnits(body, contentType)
      if (units > MAX_UNITS) throw new CloudError('BAD_REQUEST', `一次最多生成 ${MAX_UNITS} 份`, 400)
      const hold = deps.billing.hold(identity.userId, { capability: decision.capability, platform, model, client, feature: 'ai-proxy' }, { units })
      deps.genLog?.started({ id: hold.id, userId: identity.userId, capability: decision.capability, platform, model, client, body, contentType })
      let upstreamRes: Response
      let responseBody: Buffer
      try {
        upstreamRes = await doFetch(target, init)
        responseBody = Buffer.from(await upstreamRes.arrayBuffer())
      } catch (error) {
        settle(hold.id, false, `连接平台失败：${(error as Error)?.message ?? error}`)
        throw new CloudError('INTERNAL', `连接平台失败，点数已退回：${(error as Error)?.message ?? error}`, 502)
      }
      const json = parseJson(responseBody)
      const failed = !upstreamRes.ok ? `HTTP ${upstreamRes.status} ${responseBody.toString('utf8').slice(0, 160)}` : responseLooksFailed(json)
      if (failed) {
        settle(hold.id, false, failed)
      } else if (decision.track && json) {
        const taskId = pickTaskIdFromResponse(json)
        const status = pickTaskStatus(json)
        if (taskId && status !== 'succeeded' && !hasOutput(json)) {
          db.prepare('INSERT OR REPLACE INTO ai_proxy_tasks (hold_id, user_id, platform, task_id, status, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(hold.id, identity.userId, platform, taskId, 'pending', deps.now())
          deps.genLog?.submitted(hold.id, taskId)
        } else {
          settle(hold.id, true, '', json)
        }
      } else {
        settle(hold.id, true, '', json)
      }
      sendBuffered(res, upstreamRes, responseBody)
      return true
    } catch (error) {
      if (error instanceof CloudError) {
        sendError(res, error.status, error.code, error.message, error.details)
        return true
      }
      if ((error as Error)?.name === 'AbortError') {
        if (!res.writableEnded) res.end()
        return true
      }
      console.error('[ai-proxy] 转发失败', platform, method, rest, error)
      sendError(res, 502, 'INTERNAL', `转发到平台失败：${(error as Error)?.message ?? error}`)
      return true
    }
  }

  return { handle, upstreamOf }
}

export type AiProxy = ReturnType<typeof createAiProxy>
