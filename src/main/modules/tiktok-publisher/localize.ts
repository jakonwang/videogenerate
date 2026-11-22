/**
 * 多语言版：发布中心选中的视频 × 选中的语言 = 新的草稿任务，后台依次生成：
 *   识别原片语音（带时间）→ AI 改写成当地卖货口吻 → Edge 配音 → 对齐到原句时间
 *   → 原声压低或去掉 → 模糊原字幕区域 → 压上新字幕。标题和描述也一起本地化。
 * 原片没人说话时只翻译标题和描述，视频不动。
 */
import { randomUUID, createHash } from 'node:crypto'
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { getAppPaths } from '../../lib/paths'
import { prepareFontsDirForSubtitles } from '../../lib/fontResolve'
import { runFfmpeg } from '../ffmpeg/runner'
import { probeMedia } from '../ffmpeg/probe'
import { pickH264Encoder } from '../ffmpeg/encoders'
import { synthesizeEdgeTts } from '../tts/edge'
import { cloneRepo } from '../clone/repo'
import { generateChatCompletion, resolveChatAsrEndpoint } from '../clone/unifiedChat'
import { transcribeWithWhisperCompatible } from '../web-platform/whisperCompatible'
import { creatokPublisherRepo } from './repo'
import { newOperationKeys } from './creatokClient'
import type { CreatokPublishLocalize, CreatokPublishTask } from './types'
import {
  LOCALIZE_LANGUAGES,
  OLD_SUBTITLE_BAND,
  buildLocalizedAss,
  fitCues,
  isLocalizeLanguage,
  localizeSystemPrompt,
  parseLocalized,
  type FittedCue,
  type LocalizeLanguage,
  type SourceCue,
} from '../../../shared/localize'

const LOCKED_STATES: CreatokPublishTask['state'][] = ['published', 'queued', 'scheduled', 'publishing', 'result_unknown']

type Deps = {
  transcribe: (audioPath: string) => Promise<SourceCue[]>
  chat: (input: { system: string; prompt: string }) => Promise<string>
  tts: (input: { text: string; voice: string; outPath: string }) => Promise<void>
  now: () => number
}
const defaultDeps: Deps = {
  transcribe: async (audioPath) => {
    const endpoint = resolveChatAsrEndpoint(await cloneRepo.getCredentials())
    const result = await transcribeWithWhisperCompatible({ ...endpoint, model: 'whisper-1', requestTimeoutMs: 180_000 }, { filePath: audioPath })
    return result.cues.map((cue) => ({ startMs: cue.startMs, endMs: cue.endMs, text: cue.text }))
  },
  chat: async ({ system, prompt }) => {
    const response = await generateChatCompletion({ credentials: await cloneRepo.getCredentials(), system, prompt, timeoutMs: 90_000 })
    return String(response.content || '')
  },
  tts: async ({ text, voice, outPath }) => {
    // 一条视频要连着配十几句，微软偶尔会限流（429）或超时：等一会儿再试，最多 4 次
    const waits = [0, 1500, 4000, 9000]
    let lastError: unknown
    for (const wait of waits) {
      if (wait) await new Promise((resolve) => setTimeout(resolve, wait))
      try {
        await synthesizeEdgeTts({ text, voice, outPath, saveSubtitles: false, timeoutMs: 30_000 })
        if ((await stat(outPath)).size > 0) return
        lastError = new Error('配音返回了空文件')
      } catch (error) {
        lastError = error
      }
    }
    throw new Error(`配音失败：${(lastError as Error)?.message || lastError}`)
  },
  now: () => Date.now(),
}
let deps: Deps = defaultDeps
export function setLocalizeTestDependencies(next: Partial<Deps>) { deps = { ...defaultDeps, ...next } }
export function resetLocalizeTestDependencies() { deps = defaultDeps }

const outDir = () => join(getAppPaths().dataDir, 'publish-localized')
const cacheDir = () => join(getAppPaths().dataDir, 'publish-localized', '.cache')

// ---------- 识别（按文件内容缓存，同一条视频出几种语言只识别一次） ----------
async function sourceKey(path: string) {
  const info = await stat(path)
  return createHash('sha1').update(`${path}|${info.size}|${info.mtimeMs}`).digest('hex').slice(0, 16)
}

/** 识别视频里说的话（带时间），按文件缓存；爆款基因分析也用它。没有音轨时返回空。 */
export async function recognizeSpeech(videoPath: string): Promise<SourceCue[]> {
  const key = await sourceKey(videoPath)
  const cachePath = join(cacheDir(), `${key}.asr.json`)
  try {
    return JSON.parse(await readFile(cachePath, 'utf8')) as SourceCue[]
  } catch { /* not cached */ }
  const probe = await probeMedia(videoPath)
  let cues: SourceCue[] = []
  if (probe.hasAudio) {
    await mkdir(cacheDir(), { recursive: true })
    const audioPath = join(cacheDir(), `${key}.asr.mp3`)
    // 16k 单声道，文件小、上传快，识别够用
    await runFfmpeg({ args: ['-y', '-i', videoPath, '-vn', '-ac', '1', '-ar', '16000', '-b:a', '48k', audioPath] })
    try {
      cues = (await deps.transcribe(audioPath)).filter((cue) => cue.text.trim() && cue.endMs > cue.startMs)
    } finally {
      await rm(audioPath, { force: true }).catch(() => undefined)
    }
  }
  await mkdir(cacheDir(), { recursive: true })
  await writeFile(cachePath, JSON.stringify(cues))
  return cues
}

// ---------- 改写 ----------
async function translate(input: { cues: SourceCue[]; language: LocalizeLanguage; title?: string; description?: string }) {
  const prompt = JSON.stringify({ lines: input.cues.map((cue) => cue.text), title: input.title || '', description: input.description || '' })
  const system = localizeSystemPrompt(input.language)
  // 返回的句数不对就再要一次
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const parsed = parseLocalized(await deps.chat({ system, prompt }), input.cues.length)
    if (parsed) return parsed
  }
  throw new Error('AI 改写的句子数和原片对不上，请重试')
}

// ---------- 合成 ----------
function filterPath(path: string) {
  return path.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'")
}

export function buildLocalizeRenderArgs(input: {
  source: string
  output: string
  ttsFiles: string[]
  cues: FittedCue[]
  hasOriginalAudio: boolean
  originalAudio: 'duck' | 'mute'
  coverOldSubtitles: boolean
  assPath?: string
  fontsDir?: string
  durationSec: number
  codec: string
  encoderArgs: string[]
}) {
  const parts: string[] = []
  // 视频：模糊原字幕区域 → 压新字幕
  let video = '[0:v]'
  if (input.coverOldSubtitles) {
    parts.push(`[0:v]split[vbase][vband]`, `[vband]crop=iw:ih*${OLD_SUBTITLE_BAND.height}:0:ih*${OLD_SUBTITLE_BAND.top},boxblur=24:3[vblur]`, `[vbase][vblur]overlay=0:H*${OLD_SUBTITLE_BAND.top}[vcov]`)
    video = '[vcov]'
  }
  if (input.assPath) {
    parts.push(`${video}subtitles='${filterPath(input.assPath)}'${input.fontsDir ? `:fontsdir='${filterPath(input.fontsDir)}'` : ''},format=yuv420p[vout]`)
  } else {
    parts.push(`${video}format=yuv420p[vout]`)
  }
  // 音频：每句配音按时间放好（必要时加快），和压低的原声混在一起
  const mix: string[] = []
  if (input.hasOriginalAudio && input.originalAudio === 'duck') {
    parts.push('[0:a]volume=0.15[orig]')
    mix.push('[orig]')
  }
  input.ttsFiles.forEach((_, index) => {
    const cue = input.cues[index]!
    const tempo = cue.tempo > 1 ? `atempo=${cue.tempo},` : ''
    parts.push(`[${index + 1}:a]${tempo}adelay=${cue.startMs}|${cue.startMs},aresample=44100[t${index}]`)
    mix.push(`[t${index}]`)
  })
  if (mix.length) parts.push(`${mix.join('')}amix=inputs=${mix.length}:duration=longest:normalize=0[aout]`)
  return [
    '-y',
    '-i', input.source,
    ...input.ttsFiles.flatMap((file) => ['-i', file]),
    '-filter_complex', parts.join(';'),
    '-map', '[vout]',
    ...(mix.length ? ['-map', '[aout]', '-c:a', 'aac', '-b:a', '128k'] : ['-an']),
    '-c:v', input.codec, ...input.encoderArgs,
    '-t', input.durationSec.toFixed(3),
    '-map_metadata', '-1',
    '-movflags', '+faststart',
    input.output,
  ]
}

async function renderLocalized(input: { task: CreatokPublishTask; cues: SourceCue[]; lines: string[] }) {
  const settings = input.task.localize!
  const info = LOCALIZE_LANGUAGES[settings.language]
  const source = settings.originalVideoPath
  const probe = await probeMedia(source)
  if (!probe.width || !probe.height || !probe.durationSec) throw new Error('读不到视频尺寸或时长')
  const work = join(outDir(), '.work', input.task.id)
  await mkdir(work, { recursive: true })
  try {
    await patchLocalize(input.task.id, { stage: 'voicing' })
    const ttsFiles: string[] = []
    const durations: number[] = []
    for (const [index, line] of input.lines.entries()) {
      const file = join(work, `line-${index}.mp3`)
      await deps.tts({ text: line, voice: info.voices[settings.voice], outPath: file })
      ttsFiles.push(file)
      durations.push(Math.round(((await probeMedia(file)).durationSec || 0) * 1000))
    }
    const fitted = fitCues({ cues: input.cues, texts: input.lines, durationsMs: durations, videoDurationMs: Math.round(probe.durationSec * 1000) })
    await patchLocalize(input.task.id, { stage: 'rendering' })
    const assPath = join(work, 'subtitles.ass')
    await writeFile(assPath, buildLocalizedAss({ cues: fitted, width: probe.width, height: probe.height, font: info.font }))
    const fontsDir = await prepareFontsDirForSubtitles(work)
    await mkdir(outDir(), { recursive: true })
    const base = basename(source, extname(source)).replace(/[\\/:*?"<>|]+/g, '_').slice(0, 60) || 'video'
    const output = join(outDir(), `${base}__${settings.language}_${input.task.id.slice(0, 8)}.mp4`)
    const encoder = await pickH264Encoder()
    await runFfmpeg({
      args: buildLocalizeRenderArgs({
        source,
        output,
        ttsFiles,
        cues: fitted,
        hasOriginalAudio: probe.hasAudio,
        originalAudio: settings.originalAudio,
        coverOldSubtitles: settings.coverOldSubtitles,
        assPath,
        fontsDir,
        durationSec: probe.durationSec,
        codec: encoder.codec,
        encoderArgs: encoder.codec === 'libx264' ? [...encoder.args, '-crf', '20'] : encoder.args,
      }),
    })
    return output
  } finally {
    await rm(work, { recursive: true, force: true }).catch(() => undefined)
  }
}

// ---------- 队列 ----------
let queue = Promise.resolve()
const queued = new Set<string>()
let resumed = false

async function patchLocalize(id: string, patch: Partial<CreatokPublishLocalize>, taskPatch: Partial<CreatokPublishTask> = {}) {
  const latest = await creatokPublisherRepo.get(id)
  if (!latest?.localize) return null
  return creatokPublisherRepo.upsert({ ...latest, ...taskPatch, localize: { ...latest.localize, ...patch }, updatedAt: deps.now() })
}

function enqueue(ids: string[]) {
  const fresh = ids.filter((id) => !queued.has(id))
  if (!fresh.length) return queue
  fresh.forEach((id) => queued.add(id))
  queue = queue
    .then(() => processAll(fresh))
    .catch((error) => console.error('[publish-localize] queue failed', error))
    .finally(() => fresh.forEach((id) => queued.delete(id)))
  return queue
}

async function processAll(ids: string[]) {
  for (const id of ids) {
    const task = await creatokPublisherRepo.get(id)
    if (!task?.localize || !['pending', 'rendering'].includes(task.localize.status)) continue
    const settings = task.localize
    try {
      await patchLocalize(id, { status: 'rendering', stage: 'recognizing', error: undefined })
      const cues = await recognizeSpeech(settings.originalVideoPath)
      await patchLocalize(id, { stage: 'translating' })
      const localized = await translate({ cues, language: settings.language, title: task.videoTitle, description: task.description })
      const captions = {
        ...(localized.title ? { videoTitle: localized.title } : {}),
        ...(localized.description ? { description: localized.description } : {}),
      }
      if (!cues.length) {
        await patchLocalize(id, { status: 'ready', stage: undefined, noSpeech: true }, { ...captions, sourceVideoPath: settings.originalVideoPath })
        continue
      }
      const output = await renderLocalized({ task, cues, lines: localized.lines })
      await patchLocalize(id, { status: 'ready', stage: undefined, noSpeech: false }, { ...captions, sourceVideoPath: output, posterPath: undefined })
    } catch (error: any) {
      console.error('[publish-localize] failed', { taskId: id, error })
      await patchLocalize(id, { status: 'failed', stage: undefined, error: String(error?.message || error).slice(0, 500) })
    }
  }
}

export const publishLocalizeService = {
  /** 每个选中的视频 × 每种语言 = 一条新的草稿任务。 */
  async create(input: {
    taskIds: string[]
    languages: string[]
    voice?: 'female' | 'male'
    originalAudio?: 'duck' | 'mute'
    coverOldSubtitles?: boolean
  }) {
    const languages = [...new Set((input.languages || []).filter(isLocalizeLanguage))]
    if (!languages.length) throw new Error('请至少选一种语言')
    const sources: CreatokPublishTask[] = []
    for (const id of [...new Set(input.taskIds || [])]) {
      const task = await creatokPublisherRepo.get(String(id))
      if (!task) continue
      if (task.variant && task.variant.status !== 'ready') throw new Error('有视频的变体还在生成，等生成完再出其他语言版')
      if (task.localize && task.localize.status !== 'ready') throw new Error('有视频的外语版还在生成，等生成完再操作')
      sources.push(task)
    }
    if (!sources.length) throw new Error('请先选要出外语版的视频')
    const now = deps.now()
    const created: CreatokPublishTask[] = []
    for (const source of sources) {
      for (const language of languages) {
        const keys = newOperationKeys()
        created.push({
          ...source,
          ...keys,
          id: randomUUID(),
          // 外语版一般发到别的国家的号，商品也不同：账号、商品、时间都留给用户重新选
          connectionUid: undefined,
          connectionName: undefined,
          productId: undefined,
          productTitle: undefined,
          productLinkTitle: undefined,
          music: undefined,
          scheduleAt: undefined,
          state: 'draft',
          remoteJobId: undefined,
          assetId: undefined,
          preparedVideo: undefined,
          precheck: undefined,
          error: undefined,
          variant: undefined,
          matrixBatchId: undefined,
          matrixSourceId: undefined,
          localize: {
            status: 'pending',
            language,
            voice: input.voice === 'male' ? 'male' : 'female',
            originalAudio: input.originalAudio === 'mute' ? 'mute' : 'duck',
            coverOldSubtitles: input.coverOldSubtitles !== false,
            // 从原片出（不从变体或别的外语版再转一次）
            originalVideoPath: source.localize?.originalVideoPath || source.variant?.originalVideoPath || source.sourceVideoPath,
          },
          createdAt: now,
          updatedAt: now,
        })
      }
    }
    await creatokPublisherRepo.upsertMany(created)
    void enqueue(created.map((task) => task.id))
    return { tasks: created }
  },

  async retry(ids: string[]) {
    const ok: string[] = []
    for (const id of ids || []) {
      const task = await creatokPublisherRepo.get(String(id))
      if (task?.localize?.status === 'failed' && !LOCKED_STATES.includes(task.state)) {
        await patchLocalize(task.id, { status: 'pending', error: undefined })
        ok.push(task.id)
      }
    }
    if (ok.length) void enqueue(ok)
    return creatokPublisherRepo.list()
  },

  resumePending(tasks: CreatokPublishTask[]) {
    if (resumed) return
    resumed = true
    const ids = tasks.filter((t) => t.localize && ['pending', 'rendering'].includes(t.localize.status)).map((t) => t.id)
    if (ids.length) void enqueue(ids)
  },

  async idle() { await queue },
}

export function assertLocalizeReady(task: CreatokPublishTask) {
  if (!task.localize) return
  if (task.localize.status === 'pending' || task.localize.status === 'rendering') throw new Error('这条的外语版还在生成中，生成完再提交')
  if (task.localize.status === 'failed') throw new Error(`外语版生成失败：${task.localize.error || '未知原因'}。可以点「重新生成外语版」`)
}
