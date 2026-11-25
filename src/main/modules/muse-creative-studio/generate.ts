import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { launchMuseBrowser } from './browser'
import {
  ATTACHED_COUNT_SCRIPT, classifyMuseReply, COMPOSER_SCRIPT, DIAGNOSTIC_SCRIPT, downloadButtonScript, FILE_INPUT_SCRIPT,
  READY_SCRIPT, readMediaScript, SEND_BUTTON_SCRIPT, snapshotScript, type MuseSnapshot,
} from './musePage'
import type { MuseProxy } from './proxy'
import { isMuseDomain, museSessionValue, type MuseCookie } from './session'
import type { MuseJobStage } from './types'

const MUSE_URL = 'https://muse.ai/'
const MAX_VIDEO_BYTES = 300 * 1024 * 1024

/** `unsent`: the prompt certainly did not reach Muse. `failed`: Muse answered no. `unknown`: check by hand, never resend. */
export class MuseGenerateError extends Error {
  constructor(readonly outcome: 'unsent' | 'failed' | 'unknown', message: string, readonly reason?: 'quota' | 'busy' | 'refused') {
    super(message)
  }
}

export type MuseProbe = (path: string) => Promise<{ durationSec: number; width?: number; height?: number; videoCodec?: string | null }>
export type MuseVideoResult = { videoPath: string; width: number; height: number; durationSec: number; bytes: number }

export type MuseRunInput = {
  proxy: MuseProxy
  cookies: MuseCookie[]
  prompt: string
  outputDir: string
  probe: MuseProbe
  signal: AbortSignal
  /** Called before the send click, so a crash afterwards is never mistaken for "not sent". */
  onStage(stage: MuseJobStage): Promise<void>
  onThread(path: string): Promise<void>
  onCookies(cookies: MuseCookie[]): Promise<void>
  /** Present when starting; absent when only collecting the result of an earlier run. */
  imagePath?: string
  /** Closing frame, uploaded after imagePath. */
  lastFramePath?: string
  /** Product pictures, uploaded last. */
  detailImagePaths?: string[]
  threadPath?: string
  options?: { museUrl?: string; headless?: boolean; pollMs?: number; readyMs?: number; sendConfirmMs?: number; resultMs?: number; replySettleMs?: number; unknownReplyMs?: number; undeliveredMs?: number; noThreadMs?: number }
}

export const museMarker = (prompt: string) => prompt.replace(/\s+/g, ' ').trim().slice(0, 40)

export function buildMusePrompt(input: { prompt: string; durationSec: number; aspect: string; lastFrame?: boolean; details?: number }) {
  const details = input.details ?? 0
  if (details) {
    const frames = input.lastFrame ? 2 : 1
    const which = details === 1 ? `第 ${frames + 1} 张` : `第 ${frames + 1} 到第 ${frames + details} 张`
    const start = input.lastFrame
      ? '第 1 张作为开始画面，第 2 张作为结束画面，从第 1 张平滑过渡到第 2 张，中间不切换场景'
      : '第 1 张作为第一帧'
    return `${input.prompt.trim()}\n\n要求：我本次按顺序上传了 ${frames + details} 张图片。${start}。${which}是同一个商品的参考图，只用来看清商品的颜色、材质、形状和细节，不要出现它们的背景、文字和构图，也不要因此增加商品数量。生成一段 ${input.aspect} 的视频，时长 ${input.durationSec} 秒。只使用本次上传的图片，不要使用历史图片，直接生成视频。`
  }
  if (input.lastFrame) return `${input.prompt.trim()}\n\n要求：我本次上传了两张图片，第一张作为开始画面，第二张作为结束画面，从第一张平滑过渡到第二张，中间不切换场景，生成一段 ${input.aspect} 的视频，时长 ${input.durationSec} 秒。只使用本次上传的图片，不要使用历史图片，直接生成视频。`
  return `${input.prompt.trim()}\n\n要求：以我本次上传的图片作为第一帧，生成一段 ${input.aspect} 的图生视频，时长 ${input.durationSec} 秒。只使用本次上传的图片，不要使用历史图片，直接生成视频。`
}

export async function runMuseVideo(input: MuseRunInput): Promise<MuseVideoResult> {
  const o = { museUrl: MUSE_URL, headless: false, pollMs: 1000, readyMs: 120_000, sendConfirmMs: 60_000, resultMs: 15 * 60_000, replySettleMs: 10_000, unknownReplyMs: 90_000, undeliveredMs: 60_000, noThreadMs: 180_000, ...input.options }
  const starting = Boolean(input.imagePath)
  let submitted = !starting
  const fail = (message: string) => new MuseGenerateError(submitted ? 'unknown' : 'unsent', message)
  const stopped = () => fail(submitted ? '已停止等待；Muse 端可能仍在生成，可稍后找回' : '已取消，提示词没有发出')
  const pause = (ms: number) => new Promise<void>((resolve) => {
    const done = () => { clearTimeout(timer); input.signal.removeEventListener('abort', done); resolve() }
    const timer = setTimeout(done, ms)
    input.signal.addEventListener('abort', done)
  })
  const check = () => { if (input.signal.aborted) throw stopped() }

  await mkdir(input.outputDir, { recursive: true })
  check()
  const browser = await launchMuseBrowser(input.proxy, { headless: o.headless })
  const onAbort = () => void browser.close().catch(() => undefined)
  input.signal.addEventListener('abort', onAbort)
  let page: any
  let context: any
  try {
    context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true, storageState: { cookies: input.cookies, origins: [] } })
    page = await context.newPage()
    const saveCookies = async () => {
      const cookies = ((await context.cookies()) as MuseCookie[]).filter((cookie) => isMuseDomain(cookie.domain))
      if (museSessionValue(cookies)) await input.onCookies(cookies)
    }
    const snapshot = () => page.evaluate(snapshotScript(museMarker(input.prompt))) as Promise<MuseSnapshot>

    // --- open
    if (!starting && !/^\/(?!\/)/.test(input.threadPath || '')) throw fail('没有保存对话地址，请到 Muse 网页查看结果')
    const url = new URL(starting ? '/thread/new' : input.threadPath!, o.museUrl)
    await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    let state = ''
    for (const end = Date.now() + o.readyMs; Date.now() < end;) {
      check()
      state = await page.evaluate(READY_SCRIPT).catch(() => 'loading')
      if (state === 'ready') break
      await pause(o.pollMs)
    }
    if (state !== 'ready') {
      throw fail(state === 'login' ? 'Muse 要求重新登录' : state === 'connecting' ? 'Muse 一直在连接，没有就绪' : 'Muse 页面没有出现输入框')
    }
    await saveCookies()

    const known = new Set<string>()
    const uploads = [input.imagePath, input.lastFramePath, ...(input.imagePath ? input.detailImagePaths ?? [] : [])].filter((path): path is string => Boolean(path))
    const uploadHashes = new Set(await Promise.all(uploads.map(async (path) => createHash('sha256').update(await readFile(path)).digest('hex'))))

    if (starting) {
      // --- attach
      for (const video of (await snapshot()).videos) known.add(video.src)
      if (await page.evaluate(ATTACHED_COUNT_SCRIPT)) throw fail('输入框里有残留附件，已停止')
      for (const [index, path] of uploads.entries()) {
        const fileInput = (await page.evaluateHandle(FILE_INPUT_SCRIPT)).asElement()
        if (!fileInput) throw fail('找不到 Muse 的上传控件')
        await fileInput.setInputFiles(path)
        let attached = 0
        for (const end = Date.now() + o.sendConfirmMs; Date.now() < end && attached <= index;) {
          check()
          attached = await page.evaluate(ATTACHED_COUNT_SCRIPT)
          if (attached <= index) await pause(o.pollMs)
        }
        if (attached !== index + 1) throw fail('参考图没有上传成功')
      }

      // --- type, wait until Muse allows sending
      const composer = (await page.evaluateHandle(COMPOSER_SCRIPT)).asElement()
      if (!composer) throw fail('找不到 Muse 输入框')
      await composer.fill(input.prompt)
      let button: any = null
      for (const end = Date.now() + o.sendConfirmMs; Date.now() < end && !button;) {
        check()
        const candidate = (await page.evaluateHandle(SEND_BUTTON_SCRIPT)).asElement()
        if (candidate && await candidate.isEnabled().catch(() => false) && await candidate.getAttribute('aria-disabled') !== 'true') button = candidate
        else await pause(o.pollMs)
      }
      if (!button) throw fail('发送按钮一直不可用')
      if ((await snapshot()).composerText.trim() !== input.prompt.trim()) throw fail('提示词没有完整填入')

      // --- send exactly once
      check()
      await input.onStage('submitting')
      submitted = true
      await button.click({ timeout: 10_000, noWaitAfter: true })
      let accepted = false
      let last: MuseSnapshot | undefined
      for (const end = Date.now() + o.sendConfirmMs; Date.now() < end && !accepted;) {
        check()
        last = await snapshot()
        accepted = !last.composerText.trim() && !last.attached && (last.userFound || last.stop || last.agentCount > 0)
        if (!accepted) await pause(o.pollMs)
      }
      if (!accepted) {
        // Everything still in the composer and no trace of a message: nothing was sent.
        if (last && last.composerText.trim() === input.prompt.trim() && last.attached === uploads.length && !last.userFound && !last.stop) {
          throw new MuseGenerateError('unsent', '提示词仍在输入框里，没有发出')
        }
        throw fail('无法确认提示词是否发出，请到 Muse 网页查看')
      }
      await input.onStage('generating')
    } else {
      await input.onStage('collecting')
    }

    // --- wait for a new video
    let thread = starting ? '' : input.threadPath!
    let stableSrc = ''
    let stableCount = 0
    let reply = ''
    let replySince = Date.now()
    let lastDownloadError = ''
    let undeliveredSince = 0
    let idleSince = 0
    const deadline = Date.now() + o.resultMs
    while (Date.now() < deadline) {
      check()
      const now: MuseSnapshot = await snapshot()
      if (now.path !== '/' && !now.path.endsWith('/new') && now.path !== thread) {
        if (thread) throw fail('Muse 页面跳到了其他对话，已停止')
        thread = now.path
        await input.onThread(thread)
      }
      // Nothing came back at all. Not "unsent": Muse may have it, so it is never sent again without a person.
      const silent = starting && !now.agentCount && !now.videos.some((item) => !known.has(item.src))
      undeliveredSince = silent && now.undelivered ? undeliveredSince || Date.now() : 0
      idleSince = silent && !thread && !now.stop ? idleSince || Date.now() : 0
      if (undeliveredSince && Date.now() - undeliveredSince >= o.undeliveredMs) throw fail('Muse 一直显示没有送达，请到 Muse 网页确认')
      if (idleSince && Date.now() - idleSince >= o.noThreadMs) throw fail('Muse 没有建立对话，页面一直没有反应，请到 Muse 网页确认')
      // When collecting, only a video after our own message counts.
      const video = now.videos.filter((item) => !known.has(item.src) && (now.userFound ? item.afterUser : starting)).pop()
      if (video) {
        stableCount = video.src === stableSrc ? stableCount + 1 : 0
        stableSrc = video.src
        if (stableCount >= 1 && !(now.stop && stableCount < 5)) {
          await input.onStage('downloading')
          try {
            const result = await download(page, context, video.src, input)
            if (!uploadHashes.has(result.hash)) {
              await saveCookies().catch(() => undefined)
              return result.video
            }
            known.add(video.src)
          } catch (error) {
            check()
            lastDownloadError = error instanceof MuseGenerateError ? error.message : '视频下载失败'
            if (stableCount >= 8) throw fail(`已生成，但没能取回视频：${lastDownloadError}`)
          }
        }
      } else if (now.agentCount > 0 && !now.stop) {
        if (now.reply !== reply) { reply = now.reply; replySince = Date.now() }
        const waited = Date.now() - replySince
        const kind = classifyMuseReply(reply)
        const short = reply.replace(/\s+/g, ' ').slice(0, 160)
        if (kind !== 'other' && waited >= o.replySettleMs) {
          const label = kind === 'quota' ? '账号额度不足' : kind === 'busy' ? 'Muse 服务繁忙' : 'Muse 没有生成'
          throw new MuseGenerateError('failed', `${label}：${short}`, kind)
        }
        // Muse may announce the job and deliver later, so an unclear reply is not a failure.
        if (kind === 'other' && waited >= o.unknownReplyMs) throw fail(`Muse 只回复了文字，没有出现视频：${short}`)
      } else {
        replySince = Date.now()
      }
      await pause(o.pollMs)
    }
    throw fail('等待生成超时，可稍后找回')
  } catch (error) {
    if (input.signal.aborted) throw stopped()
    if (page && !page.isClosed?.()) await saveDiagnostics(page, input.outputDir).catch(() => undefined)
    if (error instanceof MuseGenerateError) throw error
    const text = error instanceof Error ? error.message : String(error)
    throw fail(/ERR_(?:PROXY|TUNNEL|SOCKS|CONNECTION|EMPTY|TIMED|INTERNET)/.test(text) ? '代理连接中断，未使用本机网络' : /closed|crash/i.test(text) ? 'Muse 窗口被关闭' : 'Muse 页面操作失败')
  } finally {
    input.signal.removeEventListener('abort', onAbort)
    await browser.close().catch(() => undefined)
  }
}

async function download(page: any, context: any, src: string, input: MuseRunInput) {
  const partial = join(input.outputDir, 'result.part.mp4')
  const attempts = [
    async () => writeFile(partial, Buffer.from(await page.evaluate(readMediaScript(src)), 'base64')),
    async () => {
      if (!/^https?:/.test(src)) throw new Error('not http')
      const response = await context.request.get(src, { timeout: 120_000 })
      if (!response.ok()) throw new Error(`media ${response.status()}`)
      await writeFile(partial, await response.body())
    },
    async () => {
      const button = (await page.evaluateHandle(downloadButtonScript(src))).asElement()
      if (!button) throw new Error('no download button')
      const [file] = await Promise.all([page.waitForEvent('download', { timeout: 60_000 }), button.click({ timeout: 10_000 })])
      await file.saveAs(partial)
    },
  ]
  for (const attempt of attempts) {
    try {
      await attempt()
      const data = await readFile(partial)
      if (!data.length || data.length > MAX_VIDEO_BYTES) throw new Error('size')
      // Probed under its own name: results are cached per path.
      const hash = createHash('sha256').update(data).digest('hex')
      const videoPath = join(input.outputDir, `result-${hash.slice(0, 12)}.mp4`)
      await rename(partial, videoPath)
      const media = await input.probe(videoPath).catch(() => null)
      if (!media?.videoCodec || !media.width || !media.height || !(media.durationSec > 0)) {
        await rm(videoPath, { force: true })
        throw new Error('not a video')
      }
      return { hash, video: { videoPath, width: media.width, height: media.height, durationSec: media.durationSec, bytes: data.length } satisfies MuseVideoResult }
    } catch {
      await rm(partial, { force: true })
    }
  }
  throw new MuseGenerateError('unknown', '下载的文件不是有效视频')
}

async function saveDiagnostics(page: any, dir: string) {
  await writeFile(join(dir, 'page.json'), JSON.stringify(await page.evaluate(DIAGNOSTIC_SCRIPT), null, 2))
  await page.screenshot({ path: join(dir, 'page.png'), timeout: 10_000 })
}
