import { spawn, type ChildProcess } from 'node:child_process'
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { CloudDb } from './db'
import { getFfmpegExecutable } from '../../../src/main/lib/binariesPath'

/**
 * 电脑端生成记录：电脑端（和服务器复刻引擎）的图片 / 视频生成都经过云端 AI 代理，
 * 代理在这里给每次扣点的生成留一条记录——提示词、模型、成功失败，成功后由服务器截一张小缩略图存进该用户的云端文件。
 *
 * - 只存缩略图（最长边 360，约几十 KB），不存原图原视频：服务器空间紧。
 * - 截图在后台一个一个排队做，失败就不要缩略图，不影响生成本身。
 */

const PROMPT_MAX = 4000
const THUMB_EDGE = 360
const THUMB_TIMEOUT_MS = 45_000
const MAX_QUEUE = 200
const MAX_INLINE_IMAGE_BYTES = 30 * 1024 * 1024

export type ThumbSource = { kind: 'url'; url: string; video: boolean } | { kind: 'base64'; data: string; mime: string }

/* ------------------------------------------------------------------ 解析请求 / 响应 */

function parseJson(text: string): any {
  if (!/^\s*[{[]/.test(text)) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function textOfContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) return content.map((part: any) => (typeof part === 'string' ? part : typeof part?.text === 'string' ? part.text : '')).filter(Boolean).join('\n')
  return ''
}

/** 从请求体里找出提示词（OpenAI / Gemini / 各家视频接口 / multipart） */
export function extractPrompt(body: Buffer, contentType = ''): string {
  if (!body.length) return ''
  const text = body.toString('utf8')
  const json = parseJson(text)
  let prompt = ''
  if (json && typeof json === 'object') {
    const direct = [json.prompt, json.input?.prompt, json.text_prompt, json.parameters?.prompt, json.text, json.input?.text].find((value) => typeof value === 'string' && value.trim())
    if (direct) prompt = String(direct)
    else if (Array.isArray(json.messages)) {
      const users = json.messages.filter((m: any) => m?.role === 'user')
      prompt = textOfContent(users[users.length - 1]?.content)
    } else if (Array.isArray(json.contents)) {
      prompt = json.contents.flatMap((c: any) => (Array.isArray(c?.parts) ? c.parts : [])).map((p: any) => (typeof p?.text === 'string' ? p.text : '')).filter(Boolean).join('\n')
    } else if (Array.isArray(json.content)) {
      prompt = json.content.map((c: any) => (typeof c?.text === 'string' ? c.text : '')).filter(Boolean).join('\n')
    }
  } else if (contentType.includes('multipart/form-data') || /content-disposition:\s*form-data/i.test(body.subarray(0, 4096).toString('latin1'))) {
    const m = /name="?prompt"?\r\n(?:[^\r\n]*\r\n)*?\r\n([\s\S]*?)\r\n--/i.exec(text)
    if (m) prompt = m[1]
  }
  return prompt.trim().slice(0, PROMPT_MAX)
}

/** 请求里带了几张参考图（大致数一下，给后台看） */
export function countInputImages(body: Buffer, contentType = ''): number {
  if (!body.length) return 0
  if (contentType.includes('multipart/form-data')) {
    return Math.min(20, (body.toString('latin1').match(/filename="[^"]*"/gi) || []).length)
  }
  const text = body.toString('utf8')
  const inline = (text.match(/data:image\/|"inline_?data"\s*:|"mime_?type"\s*:\s*"image\//gi) || []).length
  const urls = (text.match(/https?:\/\/[^"\s]+\.(png|jpe?g|webp|gif)/gi) || []).length
  return Math.min(20, inline + urls)
}

const OUTPUT_KEY = /url|output|video|image|result|file|uri|link/i
const VIDEO_EXT = /\.(mp4|mov|webm|m3u8)(\?|$)/i
const IMAGE_EXT = /\.(png|jpe?g|webp|gif)(\?|$)/i

/** 从平台响应里找出产出（第一条链接或内嵌图片） */
export function extractOutput(json: any, capability: string): ThumbSource | null {
  if (!json || typeof json !== 'object') return null
  let found: ThumbSource | null = null
  let fallbackUrl = ''
  const visit = (value: any, key: string, depth: number) => {
    if (found || depth > 8 || value === null || value === undefined) return
    if (typeof value === 'string') {
      if (key === 'b64_json' && value.length > 100) {
        found = { kind: 'base64', data: value, mime: 'image/png' }
        return
      }
      const dataUrl = /^data:(image\/[a-z+]+);base64,/i.exec(value.slice(0, 64))
      if (dataUrl && value.length > 100) {
        found = { kind: 'base64', data: value.slice(dataUrl[0].length), mime: dataUrl[1].toLowerCase() }
        return
      }
      for (const match of value.match(/https?:\/\/[^\s"'<>)\]]+/g) || []) {
        if (VIDEO_EXT.test(match)) {
          found = { kind: 'url', url: match, video: true }
          return
        }
        if (IMAGE_EXT.test(match)) {
          found = { kind: 'url', url: match, video: false }
          return
        }
        if (!fallbackUrl && OUTPUT_KEY.test(key)) fallbackUrl = match
      }
      return
    }
    if (Array.isArray(value)) {
      for (const item of value) visit(item, key, depth + 1)
      return
    }
    if (typeof value === 'object') {
      // Gemini：candidates[].content.parts[].inlineData { mimeType, data }
      const inline = value.inlineData ?? value.inline_data
      if (inline && typeof inline.data === 'string' && String(inline.mimeType ?? inline.mime_type ?? '').startsWith('image/')) {
        found = { kind: 'base64', data: inline.data, mime: String(inline.mimeType ?? inline.mime_type) }
        return
      }
      for (const [k, v] of Object.entries(value)) visit(v, k, depth + 1)
    }
  }
  visit(json, '', 0)
  if (found) return found
  return fallbackUrl ? { kind: 'url', url: fallbackUrl, video: capability === 'video' } : null
}

/* ------------------------------------------------------------------ 防止被拿来访问内网 */

function privateAddress(address: string): boolean {
  if (isIP(address) === 6) {
    const lower = address.toLowerCase()
    if (lower === '::1' || lower === '::' || lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80')) return true
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower)
    return mapped ? privateAddress(mapped[1]) : false
  }
  const [a, b] = address.split('.').map(Number)
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)
}

export async function isPublicUrl(raw: string) {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return false
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false
  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return false
  if (isIP(host)) return !privateAddress(host)
  try {
    const addresses = await lookup(host, { all: true })
    return addresses.length > 0 && addresses.every((entry) => !privateAddress(entry.address))
  } catch {
    return false
  }
}

/* ------------------------------------------------------------------ 截缩略图 */

export type Thumbnailer = (source: ThumbSource) => Promise<Buffer | null>

/** 用 ffmpeg 截一帧缩成小 JPEG；视频从网络上直接按需读取，不整段下载 */
export function createFfmpegThumbnailer(): Thumbnailer & { stop: () => void } {
  const running = new Set<ChildProcess>()
  let stopped = false
  const run = (args: string[]) =>
    new Promise<void>((resolve, reject) => {
      if (stopped) return reject(new Error('stopped'))
      // -nostdin + 关掉标准输入：后台进程里 ffmpeg 不会去等键盘输入
      const child = spawn(getFfmpegExecutable(), ['-hide_banner', '-nostdin', '-loglevel', 'error', '-y', ...args], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] })
      running.add(child)
      let stderr = ''
      child.stderr?.on('data', (chunk) => (stderr = (stderr + String(chunk)).slice(-2000)))
      const timer = setTimeout(() => child.kill('SIGKILL'), THUMB_TIMEOUT_MS)
      child.on('error', (error) => {
        clearTimeout(timer)
        running.delete(child)
        reject(error)
      })
      child.on('close', (code) => {
        clearTimeout(timer)
        running.delete(child)
        if (code === 0) resolve()
        else reject(new Error(`ffmpeg 失败(${code}): ${stderr.trim().slice(-300)}`))
      })
    })
  const scale = `scale='if(gt(iw,ih),min(${THUMB_EDGE},iw),-2)':'if(gt(iw,ih),-2,min(${THUMB_EDGE},ih))'`
  const thumbnailer = async (source: ThumbSource) => {
    const dir = await mkdtemp(join(tmpdir(), 'vg-genthumb-'))
    try {
      const out = join(dir, 'thumb.jpg')
      if (source.kind === 'base64') {
        const body = Buffer.from(source.data, 'base64')
        if (!body.length || body.length > MAX_INLINE_IMAGE_BYTES) return null
        const input = join(dir, 'input')
        await writeFile(input, body)
        await run(['-i', input, '-frames:v', '1', '-vf', scale, '-q:v', '6', out])
      } else {
        if (!(await isPublicUrl(source.url))) return null
        const net = ['-rw_timeout', '20000000', '-protocol_whitelist', 'https,http,tls,tcp,crypto']
        const seek = source.video ? ['-ss', '0.5'] : []
        await run([...net, ...seek, '-i', source.url, '-frames:v', '1', '-vf', scale, '-q:v', '6', out])
      }
      const thumb = await readFile(out)
      return thumb.length ? thumb : null
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined)
    }
  }
  return Object.assign(thumbnailer, {
    stop: () => {
      stopped = true
      for (const child of running) child.kill('SIGKILL')
    },
  })
}

/* ------------------------------------------------------------------ 记录 */

export function createGenerationLog(deps: {
  db: CloudDb
  now: () => number
  /** 存进该用户的云端文件，返回 fileId */
  store: (userId: string, body: Buffer, mime: string) => { fileId: string }
  /** null = 不截缩略图 */
  thumbnailer: Thumbnailer | null
}) {
  const { db } = deps
  const queue: Array<{ id: string; userId: string; source: ThumbSource }> = []
  let working = false
  let closed = false

  async function drain() {
    if (working) return
    working = true
    try {
      while (queue.length && !closed && deps.thumbnailer) {
        const job = queue.shift()!
        try {
          const thumb = await deps.thumbnailer(job.source)
          if (!thumb || closed) continue
          const { fileId } = deps.store(job.userId, thumb, 'image/jpeg')
          db.prepare('UPDATE ai_gen_logs SET thumb_file_id = ?, updated_at = ? WHERE id = ?').run(fileId, deps.now(), job.id)
        } catch (error) {
          if (!closed) console.warn('[gen-log] 缩略图失败', job.id, (error as Error)?.message ?? error)
        }
      }
    } finally {
      working = false
    }
  }

  function exists(id: string) {
    return Boolean(db.prepare('SELECT 1 FROM ai_gen_logs WHERE id = ?').get(id))
  }

  /** 扣点的生成请求转发前：先记一条「进行中」 */
  function started(input: { id: string; userId: string; capability: string; platform: string; model: string; client: string; body: Buffer; contentType: string }) {
    try {
      const t = deps.now()
      db.prepare(
        `INSERT OR IGNORE INTO ai_gen_logs (id, user_id, capability, platform, model, client, prompt, input_images, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'running', ?, ?)`,
      ).run(input.id, input.userId, input.capability, input.platform, input.model, input.client, extractPrompt(input.body, input.contentType), countInputImages(input.body, input.contentType), t, t)
    } catch (error) {
      console.warn('[gen-log] 记录失败', (error as Error)?.message ?? error)
    }
  }

  /** 平台接受了异步任务，记下任务号 */
  function submitted(id: string, taskId: string) {
    try {
      db.prepare('UPDATE ai_gen_logs SET task_id = ?, updated_at = ? WHERE id = ?').run(taskId.slice(0, 200), deps.now(), id)
    } catch {
      // 记录只是给后台看的，不影响生成
    }
  }

  /** 生成有了结果（提交时直接出结果，或之后查询进度时看到成功 / 失败） */
  function finished(id: string, ok: boolean, reason: string, json: any) {
    try {
      const row = db.prepare('SELECT user_id, capability, status FROM ai_gen_logs WHERE id = ?').get(id) as { user_id: string; capability: string; status: string } | undefined
      if (!row || row.status !== 'running') return
      const output = ok ? extractOutput(json, row.capability) : null
      db.prepare('UPDATE ai_gen_logs SET status = ?, error = ?, output_url = ?, updated_at = ? WHERE id = ?').run(
        ok ? 'succeeded' : 'failed',
        ok ? '' : reason.slice(0, 500),
        output?.kind === 'url' ? output.url.slice(0, 2000) : '',
        deps.now(),
        id,
      )
      if (output && deps.thumbnailer && !closed && queue.length < MAX_QUEUE) {
        queue.push({ id, userId: row.user_id, source: output })
        void drain()
      }
    } catch (error) {
      console.warn('[gen-log] 更新失败', id, (error as Error)?.message ?? error)
    }
  }

  return {
    started,
    submitted,
    finished,
    exists,
    /** 测试用：等缩略图队列跑完 */
    idle: async () => {
      while (working || queue.length) await new Promise((resolve) => setTimeout(resolve, 20))
    },
    close: () => {
      closed = true
      queue.length = 0
    },
  }
}

export type GenerationLog = ReturnType<typeof createGenerationLog>
