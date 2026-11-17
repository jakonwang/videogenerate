import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { extname, join } from 'node:path'
import type { CloudDb } from './db'
import { badRequest, CloudError } from './security'
import { applyManagedSettings, type ManagedSoftwareSettings } from '../../../src/shared/cloud/managedSettings'
import type { AiGenerationJob, AiGenerationKind, AiGenerationRequest } from '../../../src/shared/cloud/ai'
import { AI_MAX_IMAGES, AI_MAX_PROMPT_CHARS } from '../../../src/shared/cloud/ai'
// The desktop's provider adapters are plain Node; the cloud runs the very same code with the admin's settings.
import { normalizeCredentials } from '../../../src/main/modules/clone/credentials'
import { generateImage } from '../../../src/main/modules/clone/unifiedImage'
import { generateVideo } from '../../../src/main/modules/clone/unifiedVideo'
import { createGrsImageTask, createGrsVideoTask, waitGrsResult } from '../../../src/main/modules/clone/grsai'
import { toPublicUrlViaQiniu } from '../../../src/main/modules/clone/qiniu'
import type { ModelCredentials } from '../../../src/main/modules/clone/types'
import { DEFAULT_CLONE_PROVIDERS, runAnalyze, runCompose, type CloneProviders } from './cloneJobs'
import { runMix, runParseLink, runSlice, runSubtitle, runWatermark, type VideoToolProviders } from './videoJobs'
import { transcribeWithWhisperCompatible } from '../../../src/main/modules/web-platform/whisperCompatible'
import { VIDEO_TOOLS_USING_QUOTA, type VideoJobResult, type VideoToolKind } from '../../../src/shared/cloud/videoTools'

/**
 * 云端生成任务（图片 / 视频）：手机 App 提交后立即返回任务号，云端后台调用平台，
 * 结果存进该账号的云端文件；手机关掉再打开也能查到结果。
 */

type JobRow = {
  id: string
  user_id: string
  kind: AiGenerationKind
  status: AiGenerationJob['status']
  input: string
  result: string | null
  output_file_id: string | null
  output_mime: string | null
  error: string | null
  created_at: number
  updated_at: number
}

type Quota = { assert: (userId: string) => void; record: (userId: string, purpose: string, ok: boolean) => void }
type FileStore = {
  read: (userId: string, fileId: string) => { mime: string; body: Buffer }
  store: (userId: string, body: Buffer, mime: string) => { fileId: string }
}

export type GenerationProviders = {
  generateImage: typeof generateImage
  generateVideo: typeof generateVideo
  createGrsImageTask: typeof createGrsImageTask
  createGrsVideoTask: typeof createGrsVideoTask
  waitGrsResult: typeof waitGrsResult
  toPublicUrlViaQiniu: typeof toPublicUrlViaQiniu
  download: (url: string) => Promise<Buffer>
  clone: CloneProviders
  video: VideoToolProviders
}

const DEFAULT_PROVIDERS: GenerationProviders = {
  generateImage,
  generateVideo,
  createGrsImageTask,
  createGrsVideoTask,
  waitGrsResult,
  toPublicUrlViaQiniu,
  download: async (url) => Buffer.from(await (await fetch(url, { signal: AbortSignal.timeout(300_000) })).arrayBuffer()),
  clone: DEFAULT_CLONE_PROVIDERS,
  video: {
    ffmpeg: DEFAULT_CLONE_PROVIDERS.ffmpeg,
    probeDuration: DEFAULT_CLONE_PROVIDERS.probeDuration,
    transcribe: transcribeWithWhisperCompatible,
    fetch: (...args) => fetch(...args),
    random: Math.random,
  },
}

const MIME_BY_EXT: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm' }
const EXT_BY_MIME: Record<string, string> = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif' }
const PUBLIC_LINK_TTL_MS = 2 * 60 * 60 * 1000

export function createGenerationService(deps: {
  db: CloudDb
  now: () => number
  readManagedSettings: () => ManagedSoftwareSettings
  files: FileStore
  quota: Quota
  /** 对外访问地址（如 https://api.example.com），GRS.AI 和视频平台下载参考图要用 */
  publicBaseUrl: () => string
  linkSecret: string
  concurrency: number
  providers?: Partial<Omit<GenerationProviders, 'clone' | 'video'>> & { clone?: Partial<CloneProviders>; video?: Partial<VideoToolProviders> }
  fontsDir: string
}) {
  const { db, now } = deps
  const providers: GenerationProviders = {
    ...DEFAULT_PROVIDERS,
    ...deps.providers,
    clone: { ...DEFAULT_CLONE_PROVIDERS, ...deps.providers?.clone },
    video: { ...DEFAULT_PROVIDERS.video, ...deps.providers?.video },
  }
  const queue: string[] = []
  let running = 0

  // Jobs interrupted by a restart cannot resume (their provider task handles are gone).
  db.prepare("UPDATE ai_jobs SET status = 'failed', error = '服务重启，任务中断，请重新生成', updated_at = ? WHERE status IN ('queued', 'running')").run(now())

  function toJob(row: JobRow): AiGenerationJob {
    const input = JSON.parse(row.input) as AiGenerationRequest
    return {
      id: row.id,
      kind: row.kind,
      status: row.status,
      purpose: input.purpose,
      outputFileId: row.output_file_id ?? undefined,
      outputMime: row.output_mime ?? undefined,
      error: row.error ?? undefined,
      result: row.result ? JSON.parse(row.result) : undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  function setStatus(id: string, patch: Partial<Pick<JobRow, 'status' | 'output_file_id' | 'output_mime' | 'error' | 'result'>>) {
    const row = db.prepare('SELECT * FROM ai_jobs WHERE id = ?').get(id) as JobRow
    db.prepare('UPDATE ai_jobs SET status = ?, output_file_id = ?, output_mime = ?, error = ?, result = ?, updated_at = ? WHERE id = ?').run(
      patch.status ?? row.status,
      patch.output_file_id ?? row.output_file_id,
      patch.output_mime ?? row.output_mime,
      patch.error ?? row.error,
      patch.result ?? row.result,
      now(),
      id,
    )
  }

  const VIDEO_TOOLS: VideoToolKind[] = ['watermark', 'subtitle', 'slice', 'mix', 'parse-link']
  const isVideoTool = (kind: AiGenerationKind): kind is VideoToolKind => VIDEO_TOOLS.includes(kind as VideoToolKind)
  /** 这类任务是否调用 AI / 付费接口（合成、水印、切片、混剪只用 ffmpeg，不占额度） */
  const usesAi = (kind: AiGenerationKind) => (isVideoTool(kind) ? VIDEO_TOOLS_USING_QUOTA.includes(kind) : kind !== 'compose')

  /* ---------------------------------------------------------------- 参考图对外链接 */

  function sign(userId: string, fileId: string, expiresAt: number) {
    return createHmac('sha256', deps.linkSecret).update(`${userId}:${fileId}:${expiresAt}`).digest('hex')
  }

  /** 校验签名链接并返回文件（平台下载参考图用，不需要登录） */
  function readPublicFile(fileId: string, query: Record<string, string>) {
    const userId = String(query.u || '')
    const expiresAt = Number(query.e || 0)
    const signature = Buffer.from(String(query.s || ''), 'hex')
    const expected = Buffer.from(sign(userId, fileId, expiresAt), 'hex')
    if (!userId || expiresAt < now() || signature.length !== expected.length || !timingSafeEqual(signature, expected)) {
      throw new CloudError('FORBIDDEN', '链接无效或已过期', 403)
    }
    return deps.files.read(userId, fileId)
  }

  async function publicUrl(credentials: ModelCredentials, userId: string, fileId: string, localPath: string) {
    if (credentials.qiniuAccessKey && credentials.qiniuSecretKey && credentials.qiniuBucket && credentials.qiniuDomain) {
      return providers.toPublicUrlViaQiniu(credentials, localPath, 'tiktokcut/mobile')
    }
    const base = deps.publicBaseUrl().replace(/\/+$/, '')
    if (base) {
      const expiresAt = now() + PUBLIC_LINK_TTL_MS
      return `${base}/api/v1/public-files/${fileId}?u=${encodeURIComponent(userId)}&e=${expiresAt}&s=${sign(userId, fileId, expiresAt)}`
    }
    throw new CloudError('NO_ENTITLEMENT', '管理员还没有配置七牛存储或云端对外地址，暂时无法生成，请联系客服', 503)
  }

  /* ---------------------------------------------------------------- 执行 */

  function credentialsFrom(settings: ManagedSoftwareSettings): ModelCredentials {
    return normalizeCredentials({ ...applyManagedSettings({}, settings), allowMockWhenNoKey: false, openaiImageQuality: settings.capabilities.image.quality })
  }

  function assertConfigured(kind: AiGenerationKind) {
    const settings = deps.readManagedSettings()
    if (kind === 'compose' || kind === 'watermark' || kind === 'slice' || kind === 'mix') return settings
    if (!settings.enabled) throw new CloudError('NO_ENTITLEMENT', '管理员还没有配置 AI 服务，请联系客服', 503)
    if (kind === 'parse-link') {
      if (!settings.tikhubApiKey) throw new CloudError('NO_ENTITLEMENT', '管理员还没有配置 TikHub 密钥，暂时无法解析链接', 503)
      return settings
    }
    // Speech recognition goes through the chat platform's OpenAI-compatible /v1/audio/transcriptions.
    const capability = kind === 'analyze-video' || kind === 'subtitle' ? 'chat' : kind
    const platform = settings.capabilities[capability].platform
    if (!settings.platforms[platform]?.apiKey) {
      const label = capability === 'image' ? '图片生成' : capability === 'video' ? '视频生成' : '对话（视频拆解）'
      throw new CloudError('NO_ENTITLEMENT', `管理员还没有配置${label}平台的密钥，请联系客服`, 503)
    }
    return settings
  }

  async function execute(row: JobRow) {
    const input = JSON.parse(row.input) as AiGenerationRequest
    const settings = assertConfigured(row.kind)
    const credentials = credentialsFrom(settings)
    const workDir = join(tmpdir(), 'tiktokcut-cloud-jobs', row.id)
    await mkdir(workDir, { recursive: true })
    try {
      const files = { read: (fileId: string) => deps.files.read(row.user_id, fileId), store: (body: Buffer, mime: string) => deps.files.store(row.user_id, body, mime) }
      if (row.kind === 'analyze-video') {
        const analysis = await runAnalyze({ videoFileId: input.videoFileId!, locale: input.locale, workDir, credentials, files, providers: providers.clone })
        setStatus(row.id, { status: 'succeeded', result: JSON.stringify(analysis) })
        deps.quota.record(row.user_id, input.purpose || row.kind, true)
        return
      }
      if (isVideoTool(row.kind)) {
        const options = input.options ?? {}
        const common = { workDir, files, providers: providers.video }
        let result: VideoJobResult
        if (row.kind === 'watermark') result = { outputs: await runWatermark({ ...common, videoFileId: input.videoFileId!, options, fontsDir: deps.fontsDir }) }
        else if (row.kind === 'slice') result = { outputs: await runSlice({ ...common, videoFileId: input.videoFileId!, options }) }
        else if (row.kind === 'mix') result = { outputs: await runMix({ ...common, clipFileIds: (input.clips ?? []).map((clip) => clip.fileId), options }) }
        else if (row.kind === 'subtitle') {
          const chat = settings.capabilities.chat.platform
          const asr = { baseUrl: (settings.platforms[chat].baseUrl || (chat === 'grsai' ? 'https://grsaiapi.com' : '')).replace(/\/+$/, ''), apiKey: settings.platforms[chat].apiKey }
          result = await runSubtitle({ ...common, videoFileId: input.videoFileId!, options, fontsDir: deps.fontsDir, asr })
        } else result = await runParseLink({ ...common, url: input.url || '', tikhubApiKey: settings.tikhubApiKey })
        const first = result.outputs[0]
        setStatus(row.id, { status: 'succeeded', result: JSON.stringify(result), output_file_id: first?.fileId ?? null, output_mime: first?.mime ?? null })
        if (usesAi(row.kind)) deps.quota.record(row.user_id, input.purpose || row.kind, true)
        return
      }
      if (row.kind === 'compose') {
        const output = await runCompose({ clips: input.clips ?? [], aspectRatio: input.aspectRatio, workDir, files, providers: providers.clone })
        const stored = deps.files.store(row.user_id, await readFile(output), 'video/mp4')
        setStatus(row.id, { status: 'succeeded', output_file_id: stored.fileId, output_mime: 'video/mp4' })
        return
      }

      const prompt = input.prompt || ''
      const refs: Array<{ fileId: string; path: string }> = []
      for (const [index, fileId] of (input.imageFileIds ?? []).entries()) {
        const file = deps.files.read(row.user_id, fileId)
        const path = join(workDir, `ref_${index}${EXT_BY_MIME[file.mime] || '.jpg'}`)
        await writeFile(path, file.body)
        refs.push({ fileId, path })
      }

      let outputPath = ''
      if (row.kind === 'image') {
        if (credentials.imageProviderPrimary === 'grsai') {
          const urls = await Promise.all(refs.map((ref) => publicUrl(credentials, row.user_id, ref.fileId, ref.path)))
          const task = await providers.createGrsImageTask({ credentials, prompt, negativePrompt: input.negativePrompt, urls, aspectRatio: input.aspectRatio ?? '1:1' })
          const outputUrl = task.directUrl || (await providers.waitGrsResult(credentials, task.taskId)).outputUrl
          outputPath = join(workDir, `output${extname(new URL(outputUrl).pathname) || '.png'}`)
          await writeFile(outputPath, await providers.download(outputUrl))
        } else {
          const result = await providers.generateImage({
            credentials,
            prompt,
            negativePrompt: input.negativePrompt,
            outDir: workDir,
            filePrefix: 'output',
            capability: refs.length ? 'image_edit' : 'image_generate',
            imagePaths: refs.map((ref) => ref.path),
          })
          outputPath = result.outputPath
        }
      } else {
        const first = refs[0]
        if (!first) throw badRequest('图生视频需要一张商品图')
        const imageUrl = await publicUrl(credentials, row.user_id, first.fileId, first.path)
        if (credentials.videoProviderPrimary === 'grsai') {
          const task = await providers.createGrsVideoTask({ credentials, prompt, negativePrompt: input.negativePrompt, firstFrameUrl: imageUrl })
          const outputUrl = task.directUrl || (await providers.waitGrsResult(credentials, task.taskId, 15 * 60 * 1000)).outputUrl
          outputPath = join(workDir, 'output.mp4')
          await writeFile(outputPath, await providers.download(outputUrl))
        } else {
          const result = await providers.generateVideo({
            credentials,
            capability: 'video_image_to_video',
            prompt,
            negativePrompt: input.negativePrompt,
            outDir: workDir,
            image: imageUrl,
            durationSec: input.durationSec,
            aspectRatio: input.aspectRatio === '16:9' ? '16:9' : '9:16',
          })
          outputPath = result.outputPath
        }
      }

      const mime = MIME_BY_EXT[extname(outputPath).toLowerCase()] || (row.kind === 'video' ? 'video/mp4' : 'image/png')
      const stored = deps.files.store(row.user_id, await readFile(outputPath), mime)
      setStatus(row.id, { status: 'succeeded', output_file_id: stored.fileId, output_mime: mime })
      deps.quota.record(row.user_id, input.purpose || row.kind, true)
    } finally {
      await rm(workDir, { recursive: true, force: true }).catch(() => undefined)
    }
  }

  function pump() {
    while (running < deps.concurrency && queue.length) {
      const id = queue.shift()!
      const row = db.prepare('SELECT * FROM ai_jobs WHERE id = ?').get(id) as JobRow | undefined
      if (!row || row.status !== 'queued') continue
      running += 1
      setStatus(id, { status: 'running' })
      void execute(row)
        .catch((error) => {
          const message = error instanceof CloudError ? error.message : `生成失败：${String((error as Error)?.message || error).slice(0, 300)}`
          console.warn('[cloud-generate] job failed', id, (error as Error)?.message)
          setStatus(id, { status: 'failed', error: message })
          if (usesAi(row.kind)) deps.quota.record(row.user_id, (JSON.parse(row.input) as AiGenerationRequest).purpose || row.kind, false)
        })
        .finally(() => {
          running -= 1
          pump()
        })
    }
  }

  /* ---------------------------------------------------------------- 对外接口 */

  function create(userId: string, body: AiGenerationRequest): AiGenerationJob {
    const KINDS: AiGenerationKind[] = ['image', 'video', 'analyze-video', 'compose', ...VIDEO_TOOLS]
    const kind = KINDS.find((item) => item === body?.kind)
    if (!kind) throw badRequest('不支持的任务类型')
    const prompt = String(body.prompt || '').trim()
    if ((kind === 'image' || kind === 'video') && !prompt) throw badRequest('缺少提示词')
    if (prompt.length > AI_MAX_PROMPT_CHARS) throw badRequest('提示词过长')
    const imageFileIds = Array.isArray(body.imageFileIds) ? body.imageFileIds.map(String).slice(0, AI_MAX_IMAGES) : []
    if (kind === 'video' && !imageFileIds.length) throw badRequest('图生视频需要一张商品图')
    const needsVideo = kind === 'analyze-video' || kind === 'watermark' || kind === 'subtitle' || kind === 'slice'
    const videoFileId = needsVideo ? String(body.videoFileId || '') : undefined
    if (needsVideo && !videoFileId) throw badRequest('缺少视频')
    if (kind === 'parse-link' && !String(body.url || '').trim()) throw badRequest('缺少分享链接')
    const clips = (kind === 'compose' || kind === 'mix') && Array.isArray(body.clips)
      ? body.clips.slice(0, 30).map((clip) => ({ fileId: String(clip?.fileId || ''), durationSec: Number(clip?.durationSec) || 3 }))
      : undefined
    if ((kind === 'compose' || kind === 'mix') && !clips?.length) throw badRequest('没有可合成的片段')
    const options = body.options && typeof body.options === 'object' ? body.options : undefined
    for (const extra of [options?.logoFileId, options?.bgmFileId]) if (extra) deps.files.read(userId, String(extra))
    // Validate ownership up front so a bad id fails now rather than minutes later.
    for (const fileId of [...imageFileIds, ...(videoFileId ? [videoFileId] : []), ...(clips ?? []).map((clip) => clip.fileId)]) deps.files.read(userId, fileId)
    assertConfigured(kind)
    if (usesAi(kind)) deps.quota.assert(userId)

    const input: AiGenerationRequest = {
      kind,
      prompt,
      videoFileId,
      clips,
      locale: body.locale ? String(body.locale).slice(0, 10) : undefined,
      options,
      url: kind === 'parse-link' ? String(body.url).slice(0, 2000) : undefined,
      negativePrompt: String(body.negativePrompt || '').trim().slice(0, 2000) || undefined,
      imageFileIds,
      aspectRatio: body.aspectRatio === '16:9' || body.aspectRatio === '9:16' || body.aspectRatio === '1:1' ? body.aspectRatio : undefined,
      durationSec: Math.max(4, Math.min(10, Math.round(Number(body.durationSec) || 8))),
      purpose: String(body.purpose || kind).replace(/[^a-z0-9-]/gi, '').slice(0, 40) || kind,
    }
    const id = `job_${randomUUID()}`
    const t = now()
    db.prepare('INSERT INTO ai_jobs (id, user_id, kind, status, input, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, userId, kind, 'queued', JSON.stringify(input), t, t)
    queue.push(id)
    pump()
    return get(userId, id)
  }

  function get(userId: string, id: string): AiGenerationJob {
    const row = db.prepare('SELECT * FROM ai_jobs WHERE id = ? AND user_id = ?').get(id, userId) as JobRow | undefined
    if (!row) throw new CloudError('NOT_FOUND', '任务不存在', 404)
    return toJob(row)
  }

  function list(userId: string, ids: string[]): { jobs: AiGenerationJob[] } {
    const wanted = ids.filter(Boolean).slice(0, 100)
    if (!wanted.length) return { jobs: [] }
    const rows = db.prepare(`SELECT * FROM ai_jobs WHERE user_id = ? AND id IN (${wanted.map(() => '?').join(',')})`).all(userId, ...wanted) as JobRow[]
    return { jobs: rows.map(toJob) }
  }

  /** 测试用：等所有任务跑完 */
  async function idle() {
    while (running || queue.length) await new Promise((resolve) => setTimeout(resolve, 20))
  }

  return { create, get, list, readPublicFile, idle }
}

export type GenerationService = ReturnType<typeof createGenerationService>
