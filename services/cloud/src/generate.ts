import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { extname, join } from 'node:path'
import type { CloudDb } from './db'
import type { BillingService } from './billing'
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
import { runFrames, runLiveAnalyze, runLiveExport, runMix, runParseLink, runSlice, runSubtitle, runWatermark, type VideoToolProviders, runMixShots } from './videoJobs'
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
  hold_id: string | null
}

type Quota = { assert: (userId: string) => void; record: (userId: string, purpose: string, ok: boolean) => void }
type FileStore = {
  read: (userId: string, fileId: string) => { mime: string; body: Buffer }
  store: (userId: string, body: Buffer, mime: string) => { fileId: string }
}

/** Node 自带的 fetch 等响应头最多 300 秒，要比它短 */
const SCENE_IMAGE_TIMEOUT_MS = 280_000

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
    probe: DEFAULT_CLONE_PROVIDERS.probe,
    transcribe: transcribeWithWhisperCompatible,
    fetch: (...args) => fetch(...args),
    random: Math.random,
  },
}

const MIME_BY_EXT: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm' }
const EXT_BY_MIME: Record<string, string> = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif' }
const PUBLIC_LINK_TTL_MS = 2 * 60 * 60 * 1000
const FILE_LINK_TTL_MS = 12 * 60 * 60 * 1000

export function createGenerationService(deps: {
  db: CloudDb
  now: () => number
  readManagedSettings: () => ManagedSoftwareSettings
  files: FileStore
  quota: Quota
  /** 点数计费：图片 / 视频任务创建时冻结，结束时结算 */
  billing?: Pick<BillingService, 'hold' | 'settle'>
  /** 对外访问地址（如 https://api.example.com），GRS.AI 和视频平台下载参考图要用 */
  publicBaseUrl: () => string
  linkSecret: string
  concurrency: number
  /** 只用服务器 ffmpeg 的重活（合成、水印、字幕、切片、混剪）单独排队，默认同时 1 个 */
  ffmpegConcurrency?: number
  /** 每个账号 24 小时内最多提交多少个服务器视频处理任务，0 表示不限 */
  ffmpegPerDay?: number
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
  // Two lanes: AI / provider jobs mostly wait on remote APIs; ffmpeg jobs burn this server's CPU,
  // so they get their own (small) concurrency and never hold up AI generation.
  const FFMPEG_KINDS = new Set<AiGenerationKind>(['compose', 'watermark', 'subtitle', 'slice', 'mix', 'frames', 'live-analyze', 'live-export'])
  const lanes = {
    ai: { queue: [] as string[], running: 0, limit: Math.max(1, deps.concurrency) },
    ffmpeg: { queue: [] as string[], running: 0, limit: Math.max(1, deps.ffmpegConcurrency ?? 1) },
  }
  const laneOf = (kind: AiGenerationKind) => (FFMPEG_KINDS.has(kind) ? lanes.ffmpeg : lanes.ai)

  // Jobs interrupted by a restart cannot resume (their provider task handles are gone).
  const interrupted = db.prepare("SELECT hold_id FROM ai_jobs WHERE status IN ('queued', 'running') AND hold_id IS NOT NULL").all() as Array<{ hold_id: string }>
  db.prepare("UPDATE ai_jobs SET status = 'failed', error = '服务重启，任务中断，请重新生成', updated_at = ? WHERE status IN ('queued', 'running')").run(now())
  for (const row of interrupted) settleHold(row.hold_id, false, '服务重启，任务中断')

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
      ...(row.status === 'queued' ? { queuePosition: laneOf(row.kind).queue.indexOf(row.id) + 1 || undefined } : {}),
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
    // 任务结束时结算点数：成功确认，失败退回
    if (row.hold_id && (patch.status === 'succeeded' || patch.status === 'failed')) settleHold(row.hold_id, patch.status === 'succeeded', patch.error ?? '')
  }

  function settleHold(holdId: string, ok: boolean, reason: string) {
    if (!deps.billing) return
    try {
      deps.billing.settle(null, holdId, ok, reason.slice(0, 200))
    } catch (error) {
      console.warn('[cloud-generate] 点数结算失败', holdId, (error as Error).message)
    }
  }

  const VIDEO_TOOLS: VideoToolKind[] = ['watermark', 'subtitle', 'slice', 'mix', 'parse-link', 'frames', 'live-analyze', 'live-export']
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

  async function publicUrl(credentials: ModelCredentials, userId: string, fileId: string, localPath: string, ttlMs = PUBLIC_LINK_TTL_MS, keyPrefix = 'tiktokcut/mobile') {
    if (credentials.qiniuAccessKey && credentials.qiniuSecretKey && credentials.qiniuBucket && credentials.qiniuDomain) {
      return providers.toPublicUrlViaQiniu(credentials, localPath, keyPrefix)
    }
    const base = deps.publicBaseUrl().replace(/\/+$/, '')
    if (base) {
      const expiresAt = now() + ttlMs
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
    if (kind === 'compose' || kind === 'watermark' || kind === 'slice' || kind === 'mix' || kind === 'frames' || kind === 'live-analyze' || kind === 'live-export') return settings
    // 链接下载只用 TikHub，不需要打开 AI 服务
    if (kind === 'parse-link') {
      if (!settings.tikhubApiKey) throw new CloudError('NO_ENTITLEMENT', '管理员还没有配置 TikHub 密钥，暂时无法解析链接', 503)
      return settings
    }
    if (!settings.enabled) throw new CloudError('NO_ENTITLEMENT', '管理员还没有配置 AI 服务，请联系客服', 503)
    // Speech recognition goes through the chat platform's OpenAI-compatible /v1/audio/transcriptions.
    const capability = kind === 'analyze-video' || kind === 'subtitle' ? 'chat' : kind
    const platform = settings.capabilities[capability].platform
    if (!settings.platforms[platform]?.apiKey) {
      const label = capability === 'image' ? '图片生成' : capability === 'video' ? '视频生成' : '对话（视频拆解）'
      throw new CloudError('NO_ENTITLEMENT', `管理员还没有配置${label}平台的密钥，请联系客服`, 503)
    }
    return settings
  }

  type RenderInput = { userId: string; prompt: string; negativePrompt?: string; refs: Array<{ fileId: string; path: string }>; aspectRatio: '1:1' | '9:16' | '16:9'; size?: string; editTimeoutMs?: number; workDir: string }

  async function renderWith(credentials: ModelCredentials, input: RenderInput): Promise<string> {
    if (credentials.imageProviderPrimary === 'grsai') {
      const urls = await Promise.all(input.refs.map((ref) => publicUrl(credentials, input.userId, ref.fileId, ref.path)))
      const task = await providers.createGrsImageTask({ credentials, prompt: input.prompt, negativePrompt: input.negativePrompt, urls, aspectRatio: input.aspectRatio })
      const outputUrl = task.directUrl || (await providers.waitGrsResult(credentials, task.taskId)).outputUrl
      const outputPath = join(input.workDir, `output_${randomUUID()}${extname(new URL(outputUrl).pathname) || '.png'}`)
      await writeFile(outputPath, await providers.download(outputUrl))
      return outputPath
    }
    const result = await providers.generateImage({
      credentials,
      prompt: input.prompt,
      negativePrompt: input.negativePrompt,
      outDir: input.workDir,
      filePrefix: 'output',
      capability: input.refs.length ? 'image_edit' : 'image_generate',
      imagePaths: input.refs.map((ref) => ref.path),
      ...(input.size ? { size: input.size } : {}),
      ...(input.editTimeoutMs ? { editTimeoutMs: input.editTimeoutMs } : {}),
    })
    return result.outputPath
  }

  /** 批量换景用：按画面宽高选最接近的出图尺寸，返回本地文件 */
  async function renderImage(input: { userId: string; prompt: string; refs: Array<{ fileId: string; path: string }>; width: number; height: number; workDir: string }) {
    const ratio = input.width / input.height
    const [aspectRatio, size] = ratio > 1.2 ? (['16:9', '1536x1024'] as const) : ratio > 0.83 ? (['1:1', '1024x1024'] as const) : (['9:16', '1024x1536'] as const)
    return renderWith(credentialsFrom(assertConfigured('image')), { ...input, aspectRatio, size, editTimeoutMs: SCENE_IMAGE_TIMEOUT_MS })
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
        else if (row.kind === 'frames') result = { outputs: await runFrames({ ...common, videoFileId: input.videoFileId! }) }
        else if (row.kind === 'live-analyze') result = { outputs: [], analysis: await runLiveAnalyze({ ...common, videoFileId: input.videoFileId! }) }
        else if (row.kind === 'live-export') result = { outputs: await runLiveExport({ ...common, videoFileId: input.videoFileId!, options }) }
        else if (row.kind === 'mix') result = { outputs: options.exactShots ? await runMixShots({ ...common, shots: input.clips ?? [], options, fontsDir: deps.fontsDir }) : await runMix({ ...common, clipFileIds: (input.clips ?? []).map((clip) => clip.fileId), options, fontsDir: deps.fontsDir }) }
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
        outputPath = await renderWith(credentials, { userId: row.user_id, prompt, negativePrompt: input.negativePrompt, refs, aspectRatio: input.aspectRatio ?? '1:1', workDir })
      } else {
        const first = refs[0]
        if (!first) throw badRequest('图生视频需要一张商品图')
        const imageUrl = await publicUrl(credentials, row.user_id, first.fileId, first.path)
        // Optional end frame (复刻: the next shot's frame, so the two clips join without a jump).
        let lastImageUrl: string | undefined
        if (input.endImageFileId) {
          const endFile = deps.files.read(row.user_id, input.endImageFileId)
          const endPath = join(workDir, `end${EXT_BY_MIME[endFile.mime] || '.jpg'}`)
          await writeFile(endPath, endFile.body)
          lastImageUrl = await publicUrl(credentials, row.user_id, input.endImageFileId, endPath)
        }
        if (credentials.videoProviderPrimary === 'grsai') {
          const task = await providers.createGrsVideoTask({ credentials, prompt, negativePrompt: input.negativePrompt, firstFrameUrl: imageUrl, ...(lastImageUrl ? { lastFrameUrl: lastImageUrl } : {}) })
          const outputUrl = task.directUrl || (await providers.waitGrsResult(credentials, task.taskId, 15 * 60 * 1000)).outputUrl
          outputPath = join(workDir, 'output.mp4')
          await writeFile(outputPath, await providers.download(outputUrl))
        } else {
          const result = await providers.generateVideo({
            credentials,
            capability: lastImageUrl ? 'video_start_end_to_video' : 'video_image_to_video',
            prompt,
            negativePrompt: input.negativePrompt,
            outDir: workDir,
            image: imageUrl,
            ...(lastImageUrl ? { lastImage: lastImageUrl } : {}),
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
    for (const lane of Object.values(lanes)) pumpLane(lane)
  }

  function pumpLane(lane: (typeof lanes)['ai']) {
    while (lane.running < lane.limit && lane.queue.length) {
      const id = lane.queue.shift()!
      const row = db.prepare('SELECT * FROM ai_jobs WHERE id = ?').get(id) as JobRow | undefined
      if (!row || row.status !== 'queued') continue
      lane.running += 1
      setStatus(id, { status: 'running' })
      void execute(row)
        .catch((error) => {
          const message = error instanceof CloudError ? error.message : `生成失败：${String((error as Error)?.message || error).slice(0, 300)}`
          console.warn('[cloud-generate] job failed', id, (error as Error)?.message)
          setStatus(id, { status: 'failed', error: message })
          if (usesAi(row.kind)) deps.quota.record(row.user_id, (JSON.parse(row.input) as AiGenerationRequest).purpose || row.kind, false)
        })
        .finally(() => {
          lane.running -= 1
          pumpLane(lane)
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
    const endImageFileId = kind === 'video' && body.endImageFileId ? String(body.endImageFileId) : undefined
    const needsVideo = kind === 'analyze-video' || kind === 'watermark' || kind === 'subtitle' || kind === 'slice' || kind === 'frames' || kind === 'live-analyze' || kind === 'live-export'
    const videoFileId = needsVideo ? String(body.videoFileId || '') : undefined
    if (needsVideo && !videoFileId) throw badRequest('缺少视频')
    if (kind === 'parse-link' && !String(body.url || '').trim()) throw badRequest('缺少分享链接')
    const clips = (kind === 'compose' || kind === 'mix') && Array.isArray(body.clips)
      ? body.clips.slice(0, 30).map((clip) => ({
          fileId: String(clip?.fileId || ''),
          durationSec: Number(clip?.durationSec) || 3,
          ...(Number.isFinite(Number(clip?.startSec)) ? { startSec: Math.max(0, Number(clip.startSec)) } : {}),
          ...(kind === 'compose' && clip?.take && Number(clip.take.groupDurationSec) > 0
            ? {
                take: {
                  offsetSec: Math.max(0, Number(clip.take.offsetSec) || 0),
                  durationSec: Math.max(0.1, Number(clip.take.durationSec) || 0.1),
                  groupDurationSec: Math.max(0.1, Number(clip.take.groupDurationSec)),
                },
              }
            : {}),
          ...(kind === 'compose' && (clip?.joinNext === 'locked' || clip?.joinNext === 'continuous') ? { joinNext: clip.joinNext } : {}),
        }))
      : undefined
    if ((kind === 'compose' || kind === 'mix') && !clips?.length) throw badRequest('没有可合成的片段')
    const options = body.options && typeof body.options === 'object' ? body.options : undefined
    for (const extra of [options?.logoFileId, options?.bgmFileId]) if (extra) deps.files.read(userId, String(extra))
    // Validate ownership up front so a bad id fails now rather than minutes later.
    for (const fileId of [...imageFileIds, ...(endImageFileId ? [endImageFileId] : []), ...(videoFileId ? [videoFileId] : []), ...(clips ?? []).map((clip) => clip.fileId)]) deps.files.read(userId, fileId)
    assertConfigured(kind)
    if (usesAi(kind)) deps.quota.assert(userId)
    if (FFMPEG_KINDS.has(kind) && deps.ffmpegPerDay) {
      const since = now() - 24 * 60 * 60 * 1000
      const kinds = [...FFMPEG_KINDS]
      const used = db.prepare(`SELECT COUNT(*) AS count FROM ai_jobs WHERE user_id = ? AND created_at >= ? AND kind IN (${kinds.map(() => '?').join(',')})`).get(userId, since, ...kinds) as { count: number }
      if (Number(used.count) >= deps.ffmpegPerDay) {
        throw new CloudError('RATE_LIMITED', `视频处理 24 小时内最多 ${deps.ffmpegPerDay} 次，已用完，请稍后再试`, 429)
      }
    }

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
      endImageFileId,
      aspectRatio: body.aspectRatio === '16:9' || body.aspectRatio === '9:16' || body.aspectRatio === '1:1' ? body.aspectRatio : undefined,
      durationSec: Math.max(4, Math.min(10, Math.round(Number(body.durationSec) || 8))),
      purpose: String(body.purpose || kind).replace(/[^a-z0-9-]/gi, '').slice(0, 40) || kind,
    }
    const id = `job_${randomUUID()}`
    const t = now()
    // 图片 / 视频生成先冻结点数（点数不足、套餐不含时在这里直接报错，不排队）
    let holdId: string | null = null
    if ((kind === 'image' || kind === 'video') && deps.billing) {
      const cap = deps.readManagedSettings().capabilities[kind]
      holdId = deps.billing.hold(userId, { capability: kind, platform: cap.platform, model: cap.model, client: 'server', feature: input.purpose }).id
    }
    try {
      db.prepare('INSERT INTO ai_jobs (id, user_id, kind, status, input, created_at, updated_at, hold_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(id, userId, kind, 'queued', JSON.stringify(input), t, t, holdId)
    } catch (error) {
      if (holdId) settleHold(holdId, false, '任务创建失败')
      throw error
    }
    laneOf(kind).queue.push(id)
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

  /**
   * 上架助手导出 Excel：店小秘按图片链接下载商品图。配置了七牛就传到七牛（长期有效），
   * 否则给签名链接，有效期默认 7 天、最长 30 天。
   */
  async function publicUrls(userId: string, body: { fileIds?: unknown; days?: unknown }) {
    const ids = [...new Set((Array.isArray(body?.fileIds) ? body.fileIds : []).map(String).filter(Boolean))].slice(0, 100)
    if (!ids.length) throw badRequest('没有要导出的图片')
    const days = Math.max(1, Math.min(30, Math.round(Number(body?.days) || 7)))
    const credentials = credentialsFrom(deps.readManagedSettings())
    const hasQiniu = Boolean(credentials.qiniuAccessKey && credentials.qiniuSecretKey && credentials.qiniuBucket && credentials.qiniuDomain)
    if (!hasQiniu && !deps.publicBaseUrl().trim()) throw new CloudError('NO_ENTITLEMENT', '管理员还没有配置七牛存储或云端对外地址，暂时无法给商品图生成导出链接，请联系客服', 503)
    const workDir = join(tmpdir(), 'tiktokcut-public-urls', randomUUID())
    await mkdir(workDir, { recursive: true })
    try {
      const urls: Record<string, string> = {}
      for (const [index, fileId] of ids.entries()) {
        const file = deps.files.read(userId, fileId)
        const path = join(workDir, `img_${index}${EXT_BY_MIME[file.mime] || '.jpg'}`)
        await writeFile(path, file.body)
        urls[fileId] = await publicUrl(credentials, userId, fileId, path, days * 24 * 60 * 60 * 1000, 'tiktokcut/listing')
      }
      return { urls, days }
    } finally {
      await rm(workDir, { recursive: true, force: true }).catch(() => undefined)
    }
  }

  /**
   * 网页上直接显示自己的图片 / 视频（<img> / <video> 带不了登录头）：给每个文件一个签名的相对链接，12 小时有效。
   * 链接末尾带上文件类型（如 &t=.mp4），电脑端复用过来的页面按扩展名判断是不是视频。
   */
  function fileLinks(userId: string, body: { fileIds?: unknown }) {
    const ids = [...new Set((Array.isArray(body?.fileIds) ? body.fileIds : []).map(String).filter(Boolean))].slice(0, 200)
    const expiresAt = now() + FILE_LINK_TTL_MS
    const links: Record<string, string> = {}
    for (const fileId of ids) {
      let mime = ''
      try {
        mime = deps.files.read(userId, fileId).mime
      } catch {
        continue
      }
      const ext = EXT_BY_MIME[mime] || (mime.startsWith('video/') ? '.mp4' : '')
      links[fileId] = `/api/v1/public-files/${fileId}?u=${encodeURIComponent(userId)}&e=${expiresAt}&s=${sign(userId, fileId, expiresAt)}${ext ? `&t=${ext}` : ''}`
    }
    return { links, expiresAt }
  }

  /** 测试用：等所有任务跑完 */
  async function idle() {
    while (Object.values(lanes).some((lane) => lane.running || lane.queue.length)) await new Promise((resolve) => setTimeout(resolve, 20))
  }

  return { create, get, list, readPublicFile, publicUrls, fileLinks, renderImage, assertImageConfigured: () => void assertConfigured('image'), idle }
}

export type GenerationService = ReturnType<typeof createGenerationService>
