import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'
import type { TiktokCookie } from './accounts'
import type { TiktokCreativeRequestTrace } from './types'

const BASE_URL = 'https://ads.tiktok.com'
const PAGE_URL = `${BASE_URL}/creative/creativestudio/image-to-video?subApp=CreativeStudio/ReferenceToVideo/ReferenceToVideo`
const IMAGE_TO_VIDEO_PAGE_URL = `${BASE_URL}/creative/creativestudio/image-to-video?subApp=CreativeStudio/MiniApp/ImageToVideo`
const SAVE_LIBRARY_URL = `${BASE_URL}/creative_bff_i18n/api/cue/save_to_my_library`
const REFERENCE_VIDEO_URL = `${BASE_URL}/creative_bff_i18n/api/cue/i2v/gen_r2v_video`
const IMAGE_TO_VIDEO_URL = `${BASE_URL}/creative_bff_i18n/api/cue/i2v/create_generate_task`
const VIDEO_INFO_URL = `${BASE_URL}/creative_bff_i18n/api/cue/video_info`
const CHECK_URL = `${BASE_URL}/creative_bff_i18n/api/cue/generate-task/check?aid=__AID__&app_name=creative_aio_client&device_platform=web`
const CREDIT_URL = `${BASE_URL}/CreativeOne/SymphonyPlatform/QueryCreditAccount`
const TIER_URL = `${BASE_URL}/CreativeOne/SymphonyPlatform/QueryCreditTierCredits`
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36'

type ClientOptions = { cookies: TiktokCookie[]; accountId: string }

function findBrowserExecutable(playwrightExecutablePath: string) {
  const configuredPath = String(process.env.PLAYWRIGHT_EXECUTABLE_PATH || '').trim()
  const roots = [
    process.env.LOCALAPPDATA,
    process.env.PROGRAMFILES,
    process.env['PROGRAMFILES(X86)'],
  ].filter((value): value is string => Boolean(value))
  const candidates = [
    configuredPath,
    playwrightExecutablePath,
    ...roots.flatMap((root) => [
      join(root, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      join(root, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    ]),
  ]
  return candidates.find((candidate) => candidate && existsSync(candidate))
}

function findValue(value: unknown, keys: string[]): string {
  if (typeof value === 'string') {
    const text = value.trim()
    if (text.startsWith('{') || text.startsWith('[')) {
      try { return findValue(JSON.parse(text), keys) } catch { return '' }
    }
    return ''
  }
  if (!value || typeof value !== 'object') return ''
  const object = value as Record<string, unknown>
  for (const key of keys) {
    const candidate = object[key]
    if (candidate !== undefined && candidate !== null && String(candidate).trim()) return String(candidate)
  }
  for (const nested of Object.values(object)) {
    const found = findValue(nested, keys)
    if (found) return found
  }
  return ''
}

function parseNumericValue(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value !== 'string') return undefined
  const text = value.trim().replace(/,/g, '')
  if (!text) return undefined
  const number = Number(text)
  return Number.isFinite(number) ? number : undefined
}

function findNumber(value: unknown, keys: string[]): number | undefined {
  const findAnyNumeric = (current: unknown, visited = new Set<object>()): number | undefined => {
    const direct = parseNumericValue(current)
    if (direct !== undefined) return direct
    if (!current || typeof current !== 'object' || visited.has(current)) return undefined
    visited.add(current)
    for (const nested of Object.values(current as Record<string, unknown>)) {
      const number = findAnyNumeric(nested, visited)
      if (number !== undefined) return number
    }
    return undefined
  }
  const findKey = (current: unknown, wanted: string, visited = new Set<object>()): number | undefined => {
    if (!current || typeof current !== 'object' || visited.has(current)) return undefined
    visited.add(current)
    for (const [key, nested] of Object.entries(current as Record<string, unknown>)) {
      if (key.toLowerCase() === wanted) {
        const number = parseNumericValue(nested) ?? findAnyNumeric(nested)
        if (number !== undefined) return number
      }
    }
    for (const nested of Object.values(current as Record<string, unknown>)) {
      const number = findKey(nested, wanted, visited)
      if (number !== undefined) return number
    }
    return undefined
  }
  for (const key of keys) {
    const number = findKey(value, key.toLowerCase())
    if (number !== undefined) return number
  }
  return undefined
}

export function extractCreditValue(value: unknown) {
  return findNumber(value, [
    'credit',
    'credits',
    'creditAmount',
    'creditBalance',
    'availableCredit',
    'availableCredits',
    'availableCreditAmount',
    'balance',
    'remain',
    'remaining',
  ])
}

function selectBestVideoUrl(value: unknown): string {
  if (!value || typeof value !== 'object') return ''
  const findVideoInfos = (current: unknown, visited = new Set<object>()): any[] | undefined => {
    if (!current || typeof current !== 'object' || visited.has(current)) return undefined
    visited.add(current)
    if (Array.isArray(current)) {
      for (const entry of current) {
        const found = findVideoInfos(entry, visited)
        if (found) return found
      }
      return undefined
    }
    const object = current as Record<string, unknown>
    for (const [key, nested] of Object.entries(object)) {
      if (key.toLowerCase() === 'videoinfos' && Array.isArray(nested)) return nested as any[]
    }
    for (const nested of Object.values(object)) {
      const found = findVideoInfos(nested, visited)
      if (found) return found
    }
    return undefined
  }
  const videoInfos = findVideoInfos(value)
  if (videoInfos?.length) {
    const candidates = videoInfos.map((entry: Record<string, any>) => {
      const meta = entry?.VideoMeta || entry?.videoMeta || {}
      const width = Number(meta.Width || meta.width) || 0
      const height = Number(meta.Height || meta.height) || 0
      const definition = String(meta.Definition || meta.definition || '')
      const definitionRank = Number(definition.match(/(\d+)p/i)?.[1] || 0)
      const url = String(entry?.MainHTTPUrl || entry?.MainUrl || entry?.mainUrl || '').trim()
      return { url, pixels: width * height, definitionRank }
    }).filter((entry: { url: string }) => entry.url)
    candidates.sort((left: any, right: any) =>
      right.pixels - left.pixels || right.definitionRank - left.definitionRank,
    )
    if (candidates[0]?.url) return candidates[0].url
  }
  return findValue(value, ['MainHTTPUrl', 'MainUrl', 'mainUrl'])
}

let sharedBrowser: any
let sharedBrowserPromise: Promise<any> | undefined
let contextLifecycleTail: Promise<void> = Promise.resolve()
let browserStartCount = 0
let browserStartFailures = 0
const MAX_BROWSER_START_FAILURES = 2

async function acquireContextLock() {
  const previous = contextLifecycleTail
  let release!: () => void
  contextLifecycleTail = new Promise<void>((resolve) => { release = resolve })
  await previous
  return release
}

async function delay(milliseconds: number) {
  await new Promise<void>((resolve) => setTimeout(resolve, milliseconds))
}

async function launchPage(cookies: TiktokCookie[], accountId: string) {
  const { chromium } = await import('playwright')
  const executablePath = findBrowserExecutable(chromium.executablePath())
  if (!executablePath) {
    throw new Error('A supported browser was not found. Install Microsoft Edge or Google Chrome and try again.')
  }
  const launchOptions = {
    executablePath,
    headless: false,
    args: ['--window-position=-32000,-32000', '--no-first-run', '--no-default-browser-check'],
  }
  const reusedBrowser = Boolean(sharedBrowser?.isConnected?.())
  if (!reusedBrowser) {
    if (!sharedBrowserPromise) {
      if (browserStartFailures >= MAX_BROWSER_START_FAILURES) {
        throw new Error('TikTok browser start is paused after repeated failures')
      }
      sharedBrowserPromise = chromium.launch(launchOptions)
        .then((browser: any) => {
          sharedBrowser = browser
          sharedBrowserPromise = undefined
          browserStartFailures = 0
          browserStartCount += 1
          console.info('[tiktok-creative] browserStarted', { browserStartCount })
          browser.once('disconnected', () => {
            if (sharedBrowser === browser) sharedBrowser = undefined
            console.warn('[tiktok-creative] browserDisconnected')
          })
          return browser
        })
        .catch((error) => {
          sharedBrowserPromise = undefined
          browserStartFailures += 1
          throw error
        })
    }
    try {
      await sharedBrowserPromise
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`TikTok browser could not start: ${message}`)
    }
  }
  const browser = sharedBrowser
  if (!browser) throw new Error('TikTok browser could not start: browser instance is unavailable')
  if (reusedBrowser) {
    console.info('[tiktok-creative] browserReused', { browserStartCount })
  }
  const releaseContext = await acquireContextLock()
  let context: any
  try {
    console.info('[tiktok-creative] contextCreated', { accountId })
    context = await browser.newContext({
      userAgent: USER_AGENT,
      extraHTTPHeaders: { Referer: BASE_URL },
      serviceWorkers: 'block',
    })
    await context.addCookies(cookies.map((cookie) => ({ ...cookie, expires: cookie.expires || -1 })))
    const page = await context.newPage()
    return { browser, context, page, releaseContext }
  } catch (error) {
    await context?.close().catch(() => undefined)
    releaseContext()
    throw error
  }
}

export async function closeTiktokOfficialBrowser() {
  const browser = sharedBrowser
  sharedBrowser = undefined
  sharedBrowserPromise = undefined
  if (!browser) return
  await browser.close().catch(() => undefined)
}

async function readJsonResponse(response: any) {
  try {
    return await response.json()
  } catch {
    const text = await response.text().catch(() => '')
    return { raw: text }
  }
}

async function pageFetch(page: any, url: string, init?: { method?: string; body?: unknown; headers?: Record<string, string> }) {
  return await page.evaluate(async ({ url, init }: { url: string; init?: { method?: string; body?: unknown; headers?: Record<string, string> } }) => {
    const response = await fetch(url, {
      method: init?.method || 'GET',
      credentials: 'include',
      headers: { accept: 'application/json, text/plain, */*', ...(init?.headers || {}) },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(60_000),
    })
    return { status: response.status, body: await response.text() }
  }, { url, init })
}

async function apiFetch(cookies: TiktokCookie[], url: string, init?: { method?: string; body?: unknown; headers?: Record<string, string> }) {
  const cookieHeader = cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ')
  const response = await fetch(url, {
    method: init?.method || 'GET',
    headers: {
      accept: 'application/json, text/plain, */*',
      'user-agent': USER_AGENT,
      referer: `${BASE_URL}/`,
      cookie: cookieHeader,
      ...(init?.headers || {}),
    },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(60_000),
  })
  return { status: response.status, body: await response.text() }
}

async function parsePageBody(result: { status: number; body: string }) {
  let body: any = {}
  try {
    body = JSON.parse(result.body)
  } catch {
    body = { raw: result.body }
  }
  if (result.status >= 400) {
    const detail = JSON.stringify(sanitizeTraceBody(body)).slice(0, 800)
    throw new Error(`TikTok request failed (${result.status}); response=${detail || '{}'}`)
  }
  return body
}

function imageMimeType(path: string) {
  switch (extname(path).toLowerCase()) {
    case '.png': return 'image/png'
    case '.webp': return 'image/webp'
    case '.gif': return 'image/gif'
    default: return 'image/jpeg'
  }
}

function aidFromCookies(cookies: TiktokCookie[]) {
  const aidCookie = cookies.find((cookie) => cookie.name.toLowerCase() === 'aid')
  return aidCookie?.value || '8323'
}

function sanitizeRequestUrl(value: string) {
  try {
    const url = new URL(value)
    for (const key of ['aid', 'device_id', 'user_id']) {
      if (url.searchParams.has(key)) url.searchParams.set(key, '[redacted]')
    }
    return `${url.pathname}${url.search}`
  } catch {
    return value.replace(BASE_URL, '')
  }
}

function sanitizeTraceBody(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.replace(/((?:x-signature|refresh_token|session_token|access_key|secret_access_key|signature)=)[^&"\\\s]+/gi, '$1[redacted]')
  }
  if (Array.isArray(value)) return value.map(sanitizeTraceBody)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, entry]) => {
    if (/token|secret|accesskey|cookie|csrf/i.test(key)) return [key, '[redacted]']
    return [key, sanitizeTraceBody(entry)]
  }))
}

function extractTask(body: any) {
  const draftInfo = Array.isArray(body?.data?.draft_infos) && body.data.draft_infos.length
    ? body.data.draft_infos[0]
    : undefined
  const taskId = findValue(body, [
    'task_id',
    'taskId',
    'taskID',
    'generate_task_id',
    'generateTaskId',
    'generation_task_id',
    'generationTaskId',
    'video_task_id',
    'videoTaskId',
  ])
    || findValue(body?.data, ['id'])
    || findValue(draftInfo, ['id', 'taskId', 'task_id'])
    || findValue(body?.result, ['id'])
    || findValue(body?.task, ['id'])
  if (!taskId) {
    const summary = JSON.stringify(sanitizeTraceBody(body)).slice(0, 1200)
    throw new Error(`TikTok did not return a task id; response=${summary || '{}'}`)
  }
  return {
    taskId,
    videoId: findValue(body, ['vid', 'videoId']) || undefined,
    videoUrl: findValue(body, ['MainUrl', 'mainUrl']) || undefined,
    posterUrl: findValue(body, ['PosterUrl', 'posterUrl']) || undefined,
  }
}

function responseRequiresLogin(body: unknown) {
  const text = typeof body === 'string' ? body : JSON.stringify(body || {})
  return /login required|login_required|please log in|not logged in|unauthorized/i.test(text)
}

function taskFailureReason(body: unknown) {
  const reason = findValue(body, [
    'error_msg',
    'errorMessage',
    'error_message',
    'fail_reason',
    'failure_reason',
    'message',
    'msg',
    'detail',
  ])
  if (reason) return reason
  return JSON.stringify(sanitizeTraceBody(body)).slice(0, 1200)
}

function hasEmptyDraftInfoList(body: unknown) {
  if (!body || typeof body !== 'object') return false
  const data = (body as Record<string, unknown>).data
  if (!data || typeof data !== 'object') return false
  const draftInfos = (data as Record<string, unknown>).draft_infos
  return Array.isArray(draftInfos) && draftInfos.length === 0
}

function hasDraftInfoList(body: unknown) {
  if (!body || typeof body !== 'object') return false
  const data = (body as Record<string, unknown>).data
  if (!data || typeof data !== 'object') return false
  return Array.isArray((data as Record<string, unknown>).draft_infos)
}

function draftInfoHasFailure(body: unknown) {
  if (!body || typeof body !== 'object') return false
  const data = (body as Record<string, unknown>).data
  if (!data || typeof data !== 'object') return false
  const infos = (data as Record<string, unknown>).draft_infos
  if (!Array.isArray(infos)) return false
  return infos.some((info) => {
    if (!info || typeof info !== 'object') return false
    const item = info as Record<string, unknown>
    const state = String(item.status ?? item.taskStatus ?? item.renderTaskStatus ?? item.state ?? '').toLowerCase()
    const reason = String(item.failReason ?? item.failureReason ?? item.errorCode ?? item.errorMessage ?? '').trim()
    return state === 'failed' || state === 'failure' || state === 'error' || ['3', '4', '5'].includes(state) || Boolean(reason)
  })
}

function extractDraftVideoId(body: unknown): string {
  const draftInfos = body && typeof body === 'object'
    ? (body as Record<string, any>).data?.draft_infos
    : undefined
  if (!Array.isArray(draftInfos)) return ''
  for (const draft of draftInfos) {
    if (!draft || typeof draft !== 'object') continue
    const direct = findValue(draft, ['vid', 'videoId', 'video_id', 'CueVideoID', 'VideoID'])
    if (direct) return direct
    const content = (draft as Record<string, unknown>).content
    if (typeof content === 'string' && content.trim()) {
      try {
        const parsed = JSON.parse(content)
        const nested = findValue(parsed, ['vid', 'videoId', 'video_id', 'CueVideoID', 'VideoID'])
        if (nested) return nested
      } catch {
        // Some TikTok responses contain escaped draft content that is not JSON.
        const match = content.match(/(?:CueVideoID|VideoID|videoId)\\?"?\s*:\s*\\?"?(\d+)/i)
        if (match?.[1]) return match[1]
      }
    }
  }
  return ''
}

export class TiktokOfficialClient {
  private browser: any
  private context: any
  private page: any
  private releaseContext: (() => void) | undefined
  private closed = false
  private openedMode: 'reference_to_video' | 'image_to_video' | undefined
  private aid: string
  private requestHeaders: Record<string, string> = {}
  private requestTrace: TiktokCreativeRequestTrace[] = []

  constructor(private readonly options: ClientOptions) {
    this.aid = aidFromCookies(options.cookies)
  }

  async open(mode: 'reference_to_video' | 'image_to_video' = 'reference_to_video') {
    if (this.page && this.openedMode === mode) return this.page
    if (this.page) await this.close()
    const opened = await launchPage(this.options.cookies, this.options.accountId)
    this.browser = opened.browser
    this.context = opened.context
    this.page = opened.page
    this.releaseContext = opened.releaseContext
    this.closed = false
    this.openedMode = mode
    try {
      this.page.on('request', (request: any) => {
        const requestUrl = request.url()
      const traceStage = requestUrl.includes('/i2v/gen_r2v_video') || requestUrl.includes('/i2v/create_generate_task')
        ? 'create'
        : requestUrl.includes('/generate-task/check') || requestUrl.includes('/video_info')
          ? 'check'
          : requestUrl.includes('/save_to_my_library') || requestUrl.includes('/upload')
            ? 'upload'
            : undefined
      if (traceStage) {
        const headers = request.headers()
        let body: unknown
        if (requestUrl.includes('/upload-proxy') || !String(headers['content-type'] || '').includes('json')) {
          body = request.postData() ? '[binary omitted]' : undefined
        } else {
          try {
            body = sanitizeTraceBody(request.postDataJSON())
          } catch {
            body = request.postData() || undefined
          }
        }
        this.requestTrace.push({
          stage: traceStage,
          method: request.method(),
          url: sanitizeRequestUrl(requestUrl),
          headers: {
            'content-type': headers['content-type'] || '',
            'x-csrftoken': headers['x-csrftoken'] ? '[redacted]' : '',
            'x-fp-id': headers['x-fp-id'] ? '[redacted]' : '',
            'x-creative-source': headers['x-creative-source'] || '',
          },
          body,
          capturedAt: Date.now(),
        })
        this.requestTrace = this.requestTrace.slice(-30)
      }
      if (!requestUrl.includes('/creative_bff_i18n/')) return
      const headers = request.headers()
      this.requestHeaders = {
        'x-csrftoken': headers['x-csrftoken'] || this.requestHeaders['x-csrftoken'] || '',
        'x-fp-id': headers['x-fp-id'] || this.requestHeaders['x-fp-id'] || '',
        'x-creative-csrf-token': headers['x-creative-csrf-token'] || this.requestHeaders['x-creative-csrf-token'] || '',
        'x-creative-source': 'CreativeStudio/MiniApp/ImageToVideo',
        'agw-js-conv': 'str',
        'content-type': 'application/json',
      }
      try {
        this.aid = new URL(request.url()).searchParams.get('aid') || this.aid
      } catch {
        // Keep the cookie fallback.
      }
      })
      this.page.on('response', async (response: any) => {
        const responseUrl = response.url()
        if (responseUrl.includes('QueryCreditAccount')) {
          await response.json().catch(() => undefined)
        }
      const traceStage = responseUrl.includes('/i2v/gen_r2v_video') || responseUrl.includes('/i2v/create_generate_task')
        ? 'create'
        : responseUrl.includes('/generate-task/check') || responseUrl.includes('/video_info')
          ? 'check'
          : responseUrl.includes('/save_to_my_library') || responseUrl.includes('/upload')
            ? 'upload'
            : undefined
        if (traceStage) {
        this.requestTrace.push({
          stage: traceStage,
          method: `RESPONSE ${response.status()}`,
          url: sanitizeRequestUrl(responseUrl),
          headers: {},
          body: sanitizeTraceBody(await readJsonResponse(response)),
          capturedAt: Date.now(),
        })
        this.requestTrace = this.requestTrace.slice(-30)
        }
      })
      await this.page.route('**/creative_bff_i18n/api/cue/upload/token*', async (route: any) => {
        const headers = {
          ...route.request().headers(),
          'x-creative-source': 'CreativeStudio/MiniApp/ImageToVideo',
        }
        await route.continue({ headers })
      })
      await this.page.goto(mode === 'image_to_video' ? IMAGE_TO_VIDEO_PAGE_URL : PAGE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 })
      await this.page.waitForTimeout(3000)
      return this.page
    } catch (error) {
      await this.close()
      throw error
    }
  }

  async close() {
    if (this.closed) return
    this.closed = true
    await this.context?.close().catch(() => undefined)
    console.info('[tiktok-creative] contextClosed', { accountId: this.options.accountId })
    this.releaseContext?.()
    this.browser = undefined
    this.context = undefined
    this.page = undefined
    this.releaseContext = undefined
    this.openedMode = undefined
  }

  getRequestTrace() {
    return this.requestTrace.map((item) => ({ ...item, headers: { ...item.headers } }))
  }

  async queryCredit() {
    await this.open()
    await this.page.waitForTimeout(1000)
    // Always request a fresh value after the session is opened. A response
    // captured during initial page hydration can be stale or belong to a
    // previous account state.
    const account = await parsePageBody(await pageFetch(this.page, CREDIT_URL, {
      method: 'POST',
      body: {},
      headers: this.requestHeaders,
    }))
    await pageFetch(this.page, TIER_URL, { headers: this.requestHeaders })
      .then(parsePageBody)
      .catch(() => undefined)
    const credit = extractCreditValue(account)
    return { credit, authenticated: !responseRequiresLogin(account) && credit !== undefined }
  }

  private apiUrl(url: string) {
    const result = new URL(url)
    result.searchParams.set('aid', this.aid)
    result.searchParams.set('app_name', 'creative_aio_client')
    result.searchParams.set('device_platform', 'web')
    return result.toString()
  }

  private async uploadImage(imagePath: string) {
    const bytes = await readFile(imagePath)
    const payload = {
      base64: bytes.toString('base64'),
      fileName: basename(imagePath),
      mimeType: imageMimeType(imagePath),
    }
    // Pass the image as a structured argument. Interpolating base64 into the
    // JavaScript source creates a huge script and can crash Chromium on large
    // uploads.
    const uploadResult = await this.page.evaluate(async ({ base64, fileName, mimeType }: typeof payload) => {
      const pageWindow = window as any
      const chunkKey = Object.keys(pageWindow).find((key) => key.startsWith('@creative-ai/cue:') && Array.isArray(pageWindow[key]))
      if (!chunkKey) throw new Error('TikTok uploader runtime is unavailable')

      let webpackRequire: any
      pageWindow[chunkKey].push([
        ['videogenerate-' + Date.now()],
        {},
        (runtime: any) => { webpackRequire = runtime },
      ])
      if (!webpackRequire?.m) throw new Error('TikTok module runtime is unavailable')

      const findModule = (text: string) => Object.keys(webpackRequire.m)
        .find((id) => String(webpackRequire.m[id]).includes(text))
      const uploadModuleId = findModule('UploadConfig must provide getUploadToken or uploader')
      const tokenModuleId = findModule('/creative_bff_i18n/api/cue/upload')
      if (!uploadModuleId || !tokenModuleId) throw new Error('TikTok official uploader module was not found')

      const uploadModule = webpackRequire(uploadModuleId)
      const tokenModule = webpackRequire(tokenModuleId)
      if (typeof uploadModule.rh !== 'function' || typeof tokenModule.getToken !== 'function') {
        throw new Error('TikTok official uploader contract changed')
      }

      const binary = atob(base64)
      const data = new Uint8Array(binary.length)
      for (let index = 0; index < binary.length; index += 1) data[index] = binary.charCodeAt(index)
      const file = new File([data], fileName, { type: mimeType })
      return await uploadModule.rh(file, {
        fromModule: 'CreativeStudio/MiniApp/ImageToVideo',
        getUploadToken: () => tokenModule.getToken({ fromModule: 'CreativeStudio/MiniApp/ImageToVideo' }),
      })
    }, payload)
    if (!uploadResult?.imageUrl) throw new Error('TikTok image upload did not return an image URL')
    return {
      imageUrl: String(uploadResult.imageUrl),
      assetId: uploadResult.id ? String(uploadResult.id) : undefined,
      imageSrcSet: uploadResult.imageSrcSet && typeof uploadResult.imageSrcSet === 'object'
        ? uploadResult.imageSrcSet
        : undefined,
      imageUri: uploadResult.imageUri ? String(uploadResult.imageUri) : undefined,
      imageWidth: Number(uploadResult.imageWidth) || undefined,
      imageHeight: Number(uploadResult.imageHeight) || undefined,
      fileName: basename(imagePath),
    }
  }

  private async readGenerationModel() {
    return await this.page.evaluate(`(() => {
      const pageWindow = window
      const chunkKey = Object.keys(pageWindow).find((key) => key.startsWith('@creative-ai/cue:') && Array.isArray(pageWindow[key]))
      if (!chunkKey) return ''
      let webpackRequire
      pageWindow[chunkKey].push([['videogenerate-settings-' + Date.now()], {}, (runtime) => { webpackRequire = runtime }])
      if (!webpackRequire?.m) return ''
      const stateModuleIds = Object.keys(webpackRequire.m).filter((id) => String(webpackRequire.m[id]).includes('setAiModel') && String(webpackRequire.m[id]).includes('aiModel'))
      for (const stateModuleId of stateModuleIds) {
        const stateModule = webpackRequire(stateModuleId)
        for (const value of Object.values(stateModule)) {
          if (typeof value?.getState !== 'function') continue
          const model = value.getState()?.aiModel
          if (model) return String(model)
        }
      }
      return ''
    })()`)
  }

  async createTask(input: { imagePaths: string[]; prompt: string; durationSec: number; mode?: 'reference_to_video' | 'image_to_video' }) {
    const mode = input.mode === 'image_to_video' ? 'image_to_video' : 'reference_to_video'
    await this.open(mode)
    const prompt = String(input.prompt ?? '').trim()
    if (!prompt) throw new Error('TikTok video prompt is required')
    const durationValue = Number(input.durationSec)
    const duration = Number.isFinite(durationValue) && durationValue > 0
      ? Math.round(durationValue)
      : 5
    const imagePaths = Array.isArray(input.imagePaths)
      ? input.imagePaths.map((imagePath) => String(imagePath ?? '').trim()).filter(Boolean)
      : []
    if (!imagePaths.length) throw new Error('TikTok video generation requires at least one image')
    if (mode === 'image_to_video' && imagePaths.length !== 2) throw new Error('TikTok image-to-video requires first and last frame images')

    const uploads = []
    for (const imagePath of imagePaths) uploads.push(await this.uploadImage(imagePath))

    const libraryBody = await parsePageBody(await pageFetch(this.page, this.apiUrl(SAVE_LIBRARY_URL), {
      method: 'POST',
      body: {
        assets: uploads.map((upload) => ({
          assetType: 'image',
          content: upload.imageUrl,
          fileName: upload.fileName,
        })),
      },
      headers: this.requestHeaders,
    }))

    const detectedModel = await this.readGenerationModel()
    // Reference to video currently accepts the account's 1.5 model id.
    // Ignore stale Image to video state left in the page runtime.
    const model = detectedModel === '2000003' ? detectedModel : '2000003'
    // The official R2V client uses the uploaded preview URL as the image
    // mention id. The upload URI is an internal storage reference and is not
    // accepted by the Reference to video endpoint.
    const libraryAssets = Array.isArray(libraryBody?.data?.assets) ? libraryBody.data.assets : []
    const assets = uploads.map((upload, index) => {
      const libraryAsset = libraryAssets[index] && typeof libraryAssets[index] === 'object' ? libraryAssets[index] : {}
      const assetId = String(libraryAsset.assetId || upload.assetId || '').trim()
      if (!assetId) throw new Error(`TikTok library did not return assetId for reference image ${index + 1}`)
      const previewUrl = String(
        libraryAsset.previewUrl
        || libraryAsset.content
        || libraryAsset.data?.imageUrl
        || upload.imageUrl,
      ).trim()
      if (!/^https?:\/\//i.test(previewUrl)) throw new Error(`TikTok reference image ${index + 1} has an invalid preview URL`)
      return {
        assetId,
        assetType: 'image' as const,
        id: `videogenerate-${index}`,
        fileType: 'image' as const,
        previewUrl,
      }
    })
    const previewImages = assets.map((asset) => asset.previewUrl)
    if (!previewImages.length || !assets.length) {
      throw new Error('TikTok reference-to-video requires a non-empty image asset list')
    }
    const settings = {
      images: assets,
      aiModel: model,
      duration,
      prompt,
      ...(mode === 'image_to_video' ? {
        image: previewImages[0],
        multipleFrames: 'all',
      } : {}),
    }
    const endpoint = mode === 'image_to_video' ? IMAGE_TO_VIDEO_URL : REFERENCE_VIDEO_URL
    const body = await parsePageBody(await pageFetch(this.page, this.apiUrl(endpoint), {
      method: 'POST',
      body: mode === 'image_to_video'
        ? {
            image: previewImages[0],
            images: previewImages,
            prompt,
            duration,
            model,
            settings: JSON.stringify(settings),
          }
        : {
            prompt,
            duration,
            model,
            settings: JSON.stringify(settings),
            mentions: previewImages.map((imageUrl) => ({ type: 1, id: imageUrl })),
          },
      headers: this.requestHeaders,
    }))
    if (responseRequiresLogin(body)) throw new Error('TikTok official session requires login')
    const extracted = extractTask(body)
    return { ...extracted, raw: body, requestTrace: this.getRequestTrace() }
  }

  async checkTask(taskId: string) {
    let responseResult: { status: number; body: string } | undefined
    for (let attempt = 0; attempt < 5; attempt += 1) {
      let currentResult: { status: number; body: string }
      try {
        currentResult = await apiFetch(this.options.cookies, CHECK_URL.replace('__AID__', encodeURIComponent(this.aid)), {
          method: 'POST',
          body: { taskId },
          headers: this.requestHeaders,
        })
      } catch {
        await this.open()
        currentResult = await pageFetch(this.page, CHECK_URL.replace('__AID__', encodeURIComponent(this.aid)), {
          method: 'POST',
          body: { taskId },
          headers: this.requestHeaders,
        })
      }
      if (currentResult.status < 400) {
        let apiBody: any
        try { apiBody = JSON.parse(currentResult.body) } catch { apiBody = undefined }
        if (apiBody && Number(apiBody.code) !== 0 && apiBody.code !== undefined) {
          await this.open()
          currentResult = await pageFetch(this.page, CHECK_URL.replace('__AID__', encodeURIComponent(this.aid)), {
            method: 'POST',
            body: { taskId },
            headers: this.requestHeaders,
          })
        }
      }
      if (currentResult.status === 401 || currentResult.status === 403) {
        await this.open()
        currentResult = await pageFetch(this.page, CHECK_URL.replace('__AID__', encodeURIComponent(this.aid)), {
          method: 'POST',
          body: { taskId },
          headers: this.requestHeaders,
        })
      }
      responseResult = currentResult
      if (currentResult.status !== 429 && currentResult.status < 500) break
      if (attempt < 4) await delay(Math.min(60000, 10000 * 2 ** attempt))
    }
    const result = await parsePageBody(responseResult || { status: 500, body: '' })
    const status = findNumber(result, ['renderTaskStatus', 'draftTaskStatus', 'status'])
    // TikTok can briefly return an empty draft list immediately after task creation.
    // Keep polling until the task exposes a real status or an explicit failure.
    if (status === undefined && hasEmptyDraftInfoList(result)) {
      return {
        status: 2,
        processing: true,
        completed: false,
        failureReason: undefined,
        videoId: undefined,
        videoUrl: undefined,
        posterUrl: undefined,
        raw: result,
        requestTrace: this.getRequestTrace(),
      }
    }
    if (status === undefined && hasDraftInfoList(result) && !draftInfoHasFailure(result)) {
      return {
        status: 2,
        processing: true,
        completed: false,
        failureReason: undefined,
        videoId: undefined,
        videoUrl: undefined,
        posterUrl: undefined,
        raw: result,
        requestTrace: this.getRequestTrace(),
      }
    }
    const draftVideoId = extractDraftVideoId(result)
    const videoId = findValue(result, ['vid', 'videoId']) || draftVideoId || undefined
    const hasCompletedDraft = Boolean(draftVideoId && hasDraftInfoList(result))
    const effectiveStatus = status === 3 && hasCompletedDraft ? 0 : status
    let videoInfo: any
    if (effectiveStatus === 0 && videoId) {
      const videoInfoUrl = new URL(this.apiUrl(VIDEO_INFO_URL))
      videoInfoUrl.searchParams.set('vid', videoId)
      let videoInfoResult: { status: number; body: string }
      try {
        videoInfoResult = await apiFetch(this.options.cookies, videoInfoUrl.toString(), { headers: this.requestHeaders })
      } catch {
        await this.open()
        videoInfoResult = await pageFetch(this.page, videoInfoUrl.toString(), { headers: this.requestHeaders })
      }
      try {
        videoInfo = await parsePageBody(videoInfoResult)
      } catch {
        await this.open()
        videoInfo = await parsePageBody(await pageFetch(this.page, videoInfoUrl.toString(), { headers: this.requestHeaders }))
      }
    }
    const videoUrl = selectBestVideoUrl(videoInfo)
      || selectBestVideoUrl(result)
      || undefined
    return {
      status: effectiveStatus,
      processing: effectiveStatus === 2,
      completed: effectiveStatus === 0 && Boolean(videoId && videoUrl),
      failureReason: effectiveStatus !== undefined && effectiveStatus !== 0 && effectiveStatus !== 2 ? taskFailureReason(result) : undefined,
      videoId,
      videoUrl,
      posterUrl: findValue(videoInfo, ['PosterUrl', 'posterUrl']) || findValue(result, ['PosterUrl', 'posterUrl']) || undefined,
      raw: videoInfo ? { check: result, videoInfo } : result,
      requestTrace: this.getRequestTrace(),
    }
  }

  async download(url: string, outputPath: string) {
    const response = await fetch(url, {
      headers: { 'user-agent': USER_AGENT, referer: `${BASE_URL}/` },
    })
    if (!response.ok) throw new Error(`TikTok video download failed (${response.status})`)
    await mkdir(dirname(outputPath), { recursive: true })
    await writeFile(outputPath, Buffer.from(await response.arrayBuffer()))
    return outputPath
  }
}
