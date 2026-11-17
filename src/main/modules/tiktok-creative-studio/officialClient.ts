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

type OpenMode = 'reference_to_video' | 'image_to_video'

let sharedBrowser: any
let sharedBrowserPromise: Promise<any> | undefined
let browserStartCount = 0
let browserStartFailures = 0
let browserIdleTimer: ReturnType<typeof setTimeout> | undefined
const MAX_BROWSER_START_FAILURES = 2
// Keep a warm page per account between polls/creates instead of loading the
// full Creative Studio SPA for every request. Idle pages are closed after a
// while, and the browser itself is closed when no page is left.
const PAGE_IDLE_MS = 3 * 60_000
const BROWSER_IDLE_MS = 60_000
const MAX_OPEN_PAGES = 2
const HEADER_WAIT_MS = 15_000
const RUNTIME_WAIT_MS = 10_000
const UPLOADER_WAIT_MS = 20_000

type AccountSession = {
  key: string
  accountId: string
  context?: any
  page?: any
  mode?: OpenMode
  opening?: Promise<void>
  headers: Record<string, string>
  aid?: string
  // Set once the Node-side request path was rejected even with captured
  // headers; status checks then go straight through the warm page.
  preferPage: boolean
  users: number
  lastUsedAt: number
  idleTimer?: ReturnType<typeof setTimeout>
  activeClient?: TiktokOfficialClient
}

const sessions = new Map<string, AccountSession>()

function cookieFingerprint(cookies: TiktokCookie[]) {
  let hash = 0
  const text = cookies.map((cookie) => `${cookie.name}=${cookie.value}`).sort().join(';')
  for (let index = 0; index < text.length; index += 1) hash = (hash * 31 + text.charCodeAt(index)) | 0
  return String(hash)
}

function getSession(accountId: string, cookies: TiktokCookie[]) {
  const key = cookieFingerprint(cookies)
  const existing = sessions.get(accountId)
  if (existing && existing.key === key) return existing
  if (existing) void disposeSessionPage(existing)
  const session: AccountSession = { key, accountId, headers: {}, preferPage: false, users: 0, lastUsedAt: Date.now() }
  sessions.set(accountId, session)
  return session
}

function sessionPageAlive(session: AccountSession) {
  return Boolean(session.page && !session.page.isClosed?.() && sharedBrowser?.isConnected?.())
}

async function disposeSessionPage(session: AccountSession) {
  if (session.idleTimer) clearTimeout(session.idleTimer)
  session.idleTimer = undefined
  const context = session.context
  session.context = undefined
  session.page = undefined
  session.mode = undefined
  if (context) {
    await context.close().catch(() => undefined)
    console.info('[tiktok-creative] contextClosed', { accountId: session.accountId })
  }
  scheduleBrowserIdleClose()
}

function scheduleSessionIdleClose(session: AccountSession) {
  if (session.idleTimer) clearTimeout(session.idleTimer)
  session.idleTimer = setTimeout(() => {
    session.idleTimer = undefined
    if (session.users > 0) return
    void disposeSessionPage(session)
  }, PAGE_IDLE_MS)
  session.idleTimer.unref?.()
}

function scheduleBrowserIdleClose() {
  if (browserIdleTimer) clearTimeout(browserIdleTimer)
  browserIdleTimer = setTimeout(() => {
    browserIdleTimer = undefined
    const hasPage = Array.from(sessions.values()).some((session) => session.context || session.opening)
    if (hasPage) return
    void closeTiktokOfficialBrowser()
  }, BROWSER_IDLE_MS)
  browserIdleTimer.unref?.()
}

async function evictIdlePages(keepAccountId: string) {
  const open = Array.from(sessions.values()).filter((session) => session.context && session.accountId !== keepAccountId)
  if (open.length < MAX_OPEN_PAGES) return
  const idle = open.filter((session) => session.users === 0).sort((left, right) => left.lastUsedAt - right.lastUsedAt)
  for (const session of idle.slice(0, open.length - MAX_OPEN_PAGES + 1)) await disposeSessionPage(session)
}

async function ensureBrowser() {
  if (browserIdleTimer) clearTimeout(browserIdleTimer)
  browserIdleTimer = undefined
  if (sharedBrowser?.isConnected?.()) {
    console.info('[tiktok-creative] browserReused', { browserStartCount })
    return sharedBrowser
  }
  const { chromium } = await import('playwright')
  const executablePath = findBrowserExecutable(chromium.executablePath())
  if (!executablePath) {
    throw new Error('A supported browser was not found. Install Microsoft Edge or Google Chrome and try again.')
  }
  // Headed off-screen by default (TikTok's uploader is sensitive to headless
  // fingerprints). Set TIKTOK_CREATIVE_HEADLESS=1 to run fully headless.
  const headless = /^(1|true|yes)$/i.test(String(process.env.TIKTOK_CREATIVE_HEADLESS || ''))
  const launchOptions = {
    executablePath,
    headless,
    args: [
      ...(headless ? [] : ['--window-position=-32000,-32000']),
      '--no-first-run',
      '--no-default-browser-check',
      '--mute-audio',
      '--disable-extensions',
      '--disable-sync',
    ],
  }
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
        console.info('[tiktok-creative] browserStarted', { browserStartCount, headless })
        browser.once('disconnected', () => {
          if (sharedBrowser === browser) sharedBrowser = undefined
          for (const session of sessions.values()) {
            if (session.idleTimer) clearTimeout(session.idleTimer)
            session.idleTimer = undefined
            session.context = undefined
            session.page = undefined
            session.mode = undefined
          }
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
  if (!sharedBrowser) throw new Error('TikTok browser could not start: browser instance is unavailable')
  return sharedBrowser
}

function traceStageForUrl(url: string) {
  return url.includes('/i2v/gen_r2v_video') || url.includes('/i2v/create_generate_task')
    ? 'create' as const
    : url.includes('/generate-task/check') || url.includes('/video_info')
      ? 'check' as const
      : url.includes('/save_to_my_library') || url.includes('/upload')
        ? 'upload' as const
        : undefined
}

function attachPageListeners(session: AccountSession, page: any) {
  page.on('request', (request: any) => {
    const requestUrl = request.url()
    const traceStage = traceStageForUrl(requestUrl)
    if (traceStage && session.activeClient) {
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
      session.activeClient.pushTrace({
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
    }
    if (!requestUrl.includes('/creative_bff_i18n/')) return
    const headers = request.headers()
    session.headers = {
      'x-csrftoken': headers['x-csrftoken'] || session.headers['x-csrftoken'] || '',
      'x-fp-id': headers['x-fp-id'] || session.headers['x-fp-id'] || '',
      'x-creative-csrf-token': headers['x-creative-csrf-token'] || session.headers['x-creative-csrf-token'] || '',
      'x-creative-source': 'CreativeStudio/MiniApp/ImageToVideo',
      'agw-js-conv': 'str',
      'content-type': 'application/json',
    }
    try {
      session.aid = new URL(requestUrl).searchParams.get('aid') || session.aid
    } catch {
      // Keep the cookie fallback.
    }
  })
  page.on('response', async (response: any) => {
    const responseUrl = response.url()
    const traceStage = traceStageForUrl(responseUrl)
    if (!traceStage || !session.activeClient) return
    const client = session.activeClient
    client.pushTrace({
      stage: traceStage,
      method: `RESPONSE ${response.status()}`,
      url: sanitizeRequestUrl(responseUrl),
      headers: {},
      body: sanitizeTraceBody(await readJsonResponse(response)),
      capturedAt: Date.now(),
    })
  })
  page.on('crash', () => {
    console.warn('[tiktok-creative] pageCrashed', { accountId: session.accountId })
    void disposeSessionPage(session)
  })
}

async function navigateSessionPage(session: AccountSession, mode: OpenMode) {
  const page = session.page
  const headerWait = page.waitForRequest(
    (request: any) => String(request.url()).includes('/creative_bff_i18n/'),
    { timeout: HEADER_WAIT_MS },
  ).catch(() => undefined)
  await page.goto(mode === 'image_to_video' ? IMAGE_TO_VIDEO_PAGE_URL : PAGE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 })
  session.mode = mode
  // Wait for real readiness signals instead of a fixed sleep: the first
  // authenticated BFF request (headers) and the uploader webpack runtime.
  await headerWait
  await page.waitForFunction(
    () => Object.keys(window).some((key) => key.startsWith('@creative-ai/cue:')),
    null,
    { timeout: RUNTIME_WAIT_MS },
  ).catch(() => undefined)
}

async function openSessionPage(session: AccountSession, cookies: TiktokCookie[], mode: OpenMode | undefined) {
  if (sessionPageAlive(session)) {
    if (mode && session.mode !== mode) await navigateSessionPage(session, mode)
    return
  }
  if (session.context) await disposeSessionPage(session)
  await evictIdlePages(session.accountId)
  const browser = await ensureBrowser()
  console.info('[tiktok-creative] contextCreated', { accountId: session.accountId })
  const context = await browser.newContext({
    userAgent: USER_AGENT,
    extraHTTPHeaders: { Referer: BASE_URL },
    serviceWorkers: 'block',
  })
  try {
    await context.addCookies(cookies.map((cookie) => ({ ...cookie, expires: cookie.expires || -1 })))
    // Demo videos and web fonts are the heaviest part of the SPA and are never
    // needed for API work. Images stay allowed: the uploader reads them back.
    await context.route('**/*', async (route: any) => {
      const type = route.request().resourceType()
      if (type === 'media' || type === 'font') return await route.abort().catch(() => undefined)
      return await route.continue().catch(() => undefined)
    })
    const page = await context.newPage()
    await page.route('**/creative_bff_i18n/api/cue/upload/token*', async (route: any) => {
      const headers = {
        ...route.request().headers(),
        'x-creative-source': 'CreativeStudio/MiniApp/ImageToVideo',
      }
      await route.continue({ headers })
    })
    session.context = context
    session.page = page
    attachPageListeners(session, page)
    await navigateSessionPage(session, mode || 'reference_to_video')
  } catch (error) {
    await disposeSessionPage(session)
    throw error
  }
}

export async function closeTiktokOfficialBrowser() {
  if (browserIdleTimer) clearTimeout(browserIdleTimer)
  browserIdleTimer = undefined
  for (const session of sessions.values()) {
    if (session.idleTimer) clearTimeout(session.idleTimer)
    session.idleTimer = undefined
    session.context = undefined
    session.page = undefined
    session.mode = undefined
  }
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

async function delay(milliseconds: number) {
  await new Promise<void>((resolve) => setTimeout(resolve, milliseconds))
}

type FetchInit = { method?: string; body?: unknown; headers?: Record<string, string> }

// True when the Node-side request was rejected in a way a real page session
// (fresh csrf / fp headers) is expected to fix.
function needsPageSession(result: { status: number; body: string }) {
  if (result.status === 401 || result.status === 403) return true
  if (result.status >= 400) return false
  try {
    const body = JSON.parse(result.body)
    return Boolean(body && typeof body === 'object' && body.code !== undefined && Number(body.code) !== 0)
  } catch {
    // HTML login page or other non-JSON response.
    return true
  }
}

export class TiktokOfficialClient {
  private readonly session: AccountSession
  private holding = false
  private requestTrace: TiktokCreativeRequestTrace[] = []
  private readonly cookieAid: string

  constructor(private readonly options: ClientOptions) {
    this.cookieAid = aidFromCookies(options.cookies)
    this.session = getSession(options.accountId, options.cookies)
  }

  private get page() {
    return this.session.page
  }

  private get requestHeaders() {
    return this.session.headers
  }

  private get aid() {
    return this.session.aid || this.cookieAid
  }

  pushTrace(entry: TiktokCreativeRequestTrace) {
    this.requestTrace.push(entry)
    if (this.requestTrace.length > 30) this.requestTrace = this.requestTrace.slice(-30)
  }

  private acquire() {
    if (this.holding) return
    this.holding = true
    this.session.users += 1
    this.session.lastUsedAt = Date.now()
    this.session.activeClient = this
    if (this.session.idleTimer) clearTimeout(this.session.idleTimer)
    this.session.idleTimer = undefined
  }

  // `mode` undefined means "any loaded Creative Studio page is fine".
  async open(mode?: OpenMode) {
    this.acquire()
    while (this.session.opening) await this.session.opening.catch(() => undefined)
    if (sessionPageAlive(this.session) && (!mode || this.session.mode === mode)) return this.page
    const opening = openSessionPage(this.session, this.options.cookies, mode)
    this.session.opening = opening
    try {
      await opening
    } finally {
      if (this.session.opening === opening) this.session.opening = undefined
    }
    return this.page
  }

  // Releases this client's hold on the account page. The page itself stays
  // warm for PAGE_IDLE_MS so the next poll/create does not reload the SPA.
  async close() {
    if (!this.holding) return
    this.holding = false
    this.session.users = Math.max(0, this.session.users - 1)
    this.session.lastUsedAt = Date.now()
    if (this.session.activeClient === this) this.session.activeClient = undefined
    if (this.session.users === 0) {
      if (this.session.context) scheduleSessionIdleClose(this.session)
      else scheduleBrowserIdleClose()
    }
  }

  getRequestTrace() {
    return this.requestTrace.map((item) => ({ ...item, headers: { ...item.headers } }))
  }

  // Node fetch first (no browser). Falls back to the warm page only when the
  // API rejects the Node request, and remembers that for later checks.
  private async fetchBest(url: string, init?: FetchInit): Promise<{ status: number; body: string }> {
    const headersKnown = Boolean(this.session.headers['x-csrftoken'])
    if (!this.session.preferPage || !sessionPageAlive(this.session)) {
      try {
        const result = await apiFetch(this.options.cookies, url, { ...init, headers: { ...this.requestHeaders, ...(init?.headers || {}) } })
        if (!needsPageSession(result)) return result
        if (headersKnown) this.session.preferPage = true
      } catch {
        // Network-level failure; retry through the page below.
      }
    }
    await this.open()
    return await pageFetch(this.page, url, { ...init, headers: { ...this.requestHeaders, ...(init?.headers || {}) } })
  }

  async queryCredit() {
    // Try without a browser first; only open the page if the response is not
    // a usable authenticated credit payload.
    try {
      const direct = await apiFetch(this.options.cookies, CREDIT_URL, { method: 'POST', body: {}, headers: this.requestHeaders })
      if (direct.status < 400) {
        const account = JSON.parse(direct.body)
        const credit = extractCreditValue(account)
        if (credit !== undefined && !responseRequiresLogin(account)) return { credit, authenticated: true }
      }
    } catch {
      // Fall through to the page session.
    }
    await this.open()
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

  // The uploader lives in a lazily loaded webpack chunk that arrives a few
  // seconds after the runtime itself. Wait for those exact modules; if they
  // never show up (stale or half-loaded warm page), reload once and wait again.
  private async waitForUploaderModules() {
    const ready = () => this.page.waitForFunction(() => {
      const pageWindow = window as any
      const chunkKey = Object.keys(pageWindow).find((key) => key.startsWith('@creative-ai/cue:') && Array.isArray(pageWindow[key]))
      if (!chunkKey) return false
      let webpackRequire: any
      pageWindow[chunkKey].push([['videogenerate-probe-' + Date.now()], {}, (runtime: any) => { webpackRequire = runtime }])
      if (!webpackRequire?.m) return false
      const sources = Object.keys(webpackRequire.m).map((id) => String(webpackRequire.m[id]))
      return sources.some((text) => text.includes('UploadConfig must provide getUploadToken or uploader')) &&
        sources.some((text) => text.includes('/creative_bff_i18n/api/cue/upload'))
    }, null, { timeout: UPLOADER_WAIT_MS, polling: 500 }).then(() => true).catch(() => false)
    if (await ready()) return
    const mode = this.session?.mode || 'reference_to_video'
    console.warn('[tiktok-creative] uploaderMissingReload', { accountId: this.options.accountId, mode })
    await navigateSessionPage(this.session!, mode)
    if (!(await ready())) throw new Error('TikTok official uploader module was not found after reloading the page')
  }

  private async uploadImage(imagePath: string) {
    await this.waitForUploaderModules()
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
    const checkUrl = CHECK_URL.replace('__AID__', encodeURIComponent(this.aid))
    let responseResult: { status: number; body: string } | undefined
    for (let attempt = 0; attempt < 3; attempt += 1) {
      responseResult = await this.fetchBest(checkUrl, { method: 'POST', body: { taskId } })
      if (responseResult.status !== 429 && responseResult.status < 500) break
      if (attempt < 2) await delay(5000 * 2 ** attempt)
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
      videoInfo = await parsePageBody(await this.fetchBest(videoInfoUrl.toString()))
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
