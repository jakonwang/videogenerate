import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, extname } from 'node:path'
import type { TiktokCookie } from './accounts'
import type { TiktokCreativeRequestTrace } from './types'

const BASE_URL = 'https://ads.tiktok.com'
const PAGE_URL = `${BASE_URL}/creative/creativestudio/image-to-video`
const SAVE_LIBRARY_URL = `${BASE_URL}/creative_bff_i18n/api/cue/save_to_my_library`
const CREATE_URL = `${BASE_URL}/creative_bff_i18n/api/cue/i2v/create_generate_task`
const VIDEO_INFO_URL = `${BASE_URL}/creative_bff_i18n/api/cue/video_info`
const CHECK_URL = `${BASE_URL}/creative_bff_i18n/api/cue/generate-task/check?aid=__AID__&app_name=creative_aio_client&device_platform=web`
const CREDIT_URL = `${BASE_URL}/CreativeOne/SymphonyPlatform/QueryCreditAccount`
const TIER_URL = `${BASE_URL}/CreativeOne/SymphonyPlatform/QueryCreditTierCredits`
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36'

type ClientOptions = { cookies: TiktokCookie[]; accountId: string }

function findValue(value: unknown, keys: string[]): string {
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

function findNumber(value: unknown, keys: string[]): number | undefined {
  const text = findValue(value, keys)
  const number = Number(text)
  return Number.isFinite(number) ? number : undefined
}

async function launchPage(cookies: TiktokCookie[]) {
  const { chromium } = await import('playwright')
  const browser = await chromium.launch({ headless: false, args: ['--window-position=-32000,-32000'] })
  const context = await browser.newContext({ userAgent: USER_AGENT, extraHTTPHeaders: { Referer: BASE_URL } })
  await context.addCookies(
    cookies.map((cookie) => ({
      ...cookie,
      expires: cookie.expires || -1,
    })),
  )
  const page = await context.newPage()
  return { browser, context, page }
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

async function parsePageBody(result: { status: number; body: string }) {
  let body: any = {}
  try {
    body = JSON.parse(result.body)
  } catch {
    body = { raw: result.body }
  }
  if (result.status >= 400) throw new Error(`TikTok request failed (${result.status})`)
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
  const taskId = findValue(body, ['task_id', 'taskId'])
  if (!taskId) throw new Error('TikTok did not return a task id')
  return {
    taskId,
    videoId: findValue(body, ['vid', 'videoId']) || undefined,
    videoUrl: findValue(body, ['MainUrl', 'mainUrl']) || undefined,
    posterUrl: findValue(body, ['PosterUrl', 'posterUrl']) || undefined,
  }
}

export class TiktokOfficialClient {
  private browser: any
  private context: any
  private page: any
  private aid: string
  private requestHeaders: Record<string, string> = {}
  private capturedCredit: any
  private requestTrace: TiktokCreativeRequestTrace[] = []

  constructor(private readonly options: ClientOptions) {
    this.aid = aidFromCookies(options.cookies)
  }

  async open() {
    if (this.page) return this.page
    const opened = await launchPage(this.options.cookies)
    this.browser = opened.browser
    this.context = opened.context
    this.page = opened.page
    this.page.on('request', (request: any) => {
      const requestUrl = request.url()
      const traceStage = requestUrl.includes('/i2v/create_generate_task')
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
        try {
          this.capturedCredit = await response.json()
        } catch {
          this.capturedCredit = undefined
        }
      }
      const traceStage = responseUrl.includes('/i2v/create_generate_task')
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
    await this.page.goto(PAGE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await this.page.waitForTimeout(3000)
    return this.page
  }

  async close() {
    await this.browser?.close().catch(() => undefined)
    this.browser = undefined
    this.context = undefined
    this.page = undefined
  }

  getRequestTrace() {
    return this.requestTrace.map((item) => ({ ...item, headers: { ...item.headers } }))
  }

  async queryCredit() {
    await this.open()
    await this.page.waitForTimeout(1000)
    const account = this.capturedCredit || await parsePageBody(await pageFetch(this.page, CREDIT_URL, {
      method: 'POST',
      body: {},
      headers: this.requestHeaders,
    }))
    await pageFetch(this.page, TIER_URL, { headers: this.requestHeaders })
      .then(parsePageBody)
      .catch(() => undefined)
    const credit = findNumber(account, ['credit', 'credits', 'availableCredit', 'availableCredits', 'balance', 'remain'])
    return { credit, authenticated: Boolean(credit !== undefined || this.capturedCredit) }
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
    const payload = JSON.stringify({
      base64: bytes.toString('base64'),
      fileName: basename(imagePath),
      mimeType: imageMimeType(imagePath),
    })
    const uploadResult = await this.page.evaluate(`(async () => {
      const { base64, fileName, mimeType } = ${payload}
      const pageWindow = window
      const chunkKey = Object.keys(pageWindow).find((key) => key.startsWith('@creative-ai/cue:') && Array.isArray(pageWindow[key]))
      if (!chunkKey) throw new Error('TikTok uploader runtime is unavailable')

      let webpackRequire
      pageWindow[chunkKey].push([
        ['videogenerate-' + Date.now()],
        {},
        (runtime) => { webpackRequire = runtime },
      ])
      if (!webpackRequire?.m) throw new Error('TikTok module runtime is unavailable')

      const findModule = (text) => Object.keys(webpackRequire.m)
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
        getUploadToken: () => tokenModule.getToken({}),
      })
    })()`)
    if (!uploadResult?.imageUrl) throw new Error('TikTok image upload did not return an image URL')
    return {
      imageUrl: String(uploadResult.imageUrl),
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
      pageWindow[chunkKey].push([
        ['videogenerate-settings-' + Date.now()],
        {},
        (runtime) => { webpackRequire = runtime },
      ])
      if (!webpackRequire?.m) return ''
      const stateModuleIds = Object.keys(webpackRequire.m).filter((id) => {
        const source = String(webpackRequire.m[id])
        return source.includes('setAiModel') && source.includes('aiModel')
      })
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

  async createTask(input: { imagePaths: string[]; prompt: string; durationSec: number }) {
    await this.open()
    if (!input.imagePaths.length) throw new Error('TikTok image-to-video requires at least one image')

    const uploads = []
    for (const imagePath of input.imagePaths) uploads.push(await this.uploadImage(imagePath))

    await parsePageBody(await pageFetch(this.page, this.apiUrl(SAVE_LIBRARY_URL), {
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

    const model = await this.readGenerationModel()
    if (!model) throw new Error('TikTok image-to-video model is unavailable')
    const images = uploads.map((upload) => upload.imageUrl)
    const settings = {
      rawImage: images[0],
      image: images[0],
      images: images.map((previewUrl, index) => ({
        id: `videogenerate-${index}`,
        previewUrl,
        fileType: 'image',
      })),
      aiModel: model,
      imageIndex: 0,
      animationType: 'prompt',
      duration: input.durationSec,
      isBgGenerated: false,
      prompt: input.prompt,
      multipleFrames: 'first_only',
    }
    const body = await parsePageBody(await pageFetch(this.page, this.apiUrl(CREATE_URL), {
      method: 'POST',
      body: {
        image: images[0],
        images,
        prompt: input.prompt,
        duration: input.durationSec,
        model,
        settings: JSON.stringify(settings),
      },
      headers: this.requestHeaders,
    }))
    const extracted = extractTask(body)
    return { ...extracted, raw: body, requestTrace: this.getRequestTrace() }
  }

  async checkTask(taskId: string) {
    await this.open()
    let responseResult: { status: number; body: string } | undefined
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const currentResult = await pageFetch(this.page, CHECK_URL.replace('__AID__', encodeURIComponent(this.aid)), {
        method: 'POST',
        body: { taskId },
        headers: this.requestHeaders,
      })
      responseResult = currentResult
      if (currentResult.status !== 429 && currentResult.status < 500) break
      if (attempt < 4) await this.page.waitForTimeout(Math.min(60000, 10000 * 2 ** attempt))
    }
    const result = await parsePageBody(responseResult || { status: 500, body: '' })
    const status = findNumber(result, ['renderTaskStatus', 'draftTaskStatus', 'status'])
    const videoId = findValue(result, ['vid', 'videoId']) || undefined
    let videoInfo: any
    if (status === 0 && videoId) {
      const videoInfoUrl = new URL(this.apiUrl(VIDEO_INFO_URL))
      videoInfoUrl.searchParams.set('vid', videoId)
      videoInfo = await parsePageBody(await pageFetch(this.page, videoInfoUrl.toString(), {
        headers: this.requestHeaders,
      }))
    }
    const videoUrl = findValue(videoInfo, ['MainUrl', 'mainUrl', 'MainHTTPUrl'])
      || findValue(result, ['MainUrl', 'mainUrl', 'MainHTTPUrl'])
      || undefined
    return {
      status,
      processing: status === 2,
      completed: status === 0 && Boolean(videoId && videoUrl),
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
