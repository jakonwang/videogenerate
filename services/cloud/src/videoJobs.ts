import { createHash } from 'node:crypto'
import { copyFile, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'
import { badRequest, CloudError } from './security'
import type { CloneProviders } from './cloneJobs'
import { transcribeWithWhisperCompatible, type WhisperCue } from '../../../src/main/modules/web-platform/whisperCompatible'
import { extractFirstUrl, parseShareLink, type ParsedVideo, type TikhubFetch } from '../../../src/shared/videoParserPlatforms'
import type { VideoJobOptions, VideoJobOutput } from '../../../src/shared/cloud/videoTools'
import { computeFrameTimeSec, fallbackCuts, round3, toSegments, MIN_SEGMENT_DURATION_SEC } from '../../../src/shared/imageMaterials'
import { ENERGY_STEP_SEC, buildAudioChain, buildVideoChain, createEnergyParser, createSceneParser, energyFilter, sceneFilter, type LiveSlicerAnalysis } from '../../../src/shared/liveSlicer'

/**
 * 手机端视频工具的云端任务（第三阶段）：批量水印、批量字幕、直播切片、批量混剪、链接解析下载。
 * 都在服务器上用 ffmpeg 处理，结果存进该账号的云端文件。
 */

type Files = {
  read: (fileId: string) => { mime: string; body: Buffer }
  store: (body: Buffer, mime: string) => { fileId: string }
}

export type VideoToolProviders = {
  ffmpeg: CloneProviders['ffmpeg']
  probeDuration: CloneProviders['probeDuration']
  probe?: CloneProviders['probe']
  transcribe: typeof transcribeWithWhisperCompatible
  fetch: typeof fetch
  random: () => number
}

const MAX_OUTPUTS = 30
const ENCODE = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-pix_fmt', 'yuv420p']

async function writeInput(files: Files, fileId: string, path: string, kind: 'video' | 'image' | 'audio') {
  const file = files.read(fileId)
  if (!file.mime.startsWith(`${kind}/`)) throw badRequest(kind === 'video' ? '请选择视频文件' : kind === 'image' ? '请选择图片' : '请选择音频文件')
  await writeFile(path, file.body)
  return file
}

/** 字体：服务器部署时运行 npm run setup:fonts 准备，缺失时字幕 / 水印会提示 */
function fontPath(fontsDir: string) {
  const path = join(fontsDir, 'NotoSansSC-Regular.otf')
  if (!existsSync(path)) throw new CloudError('INTERNAL', '服务器缺少中文字体，请管理员在部署时运行 npm run setup:fonts', 500)
  return path
}

/* ------------------------------------------------------------------ 水印 */

/** overlay（图片水印）用 W/H 主画面、w/h 水印；drawtext（文字水印）用 w/h 画面、tw/th 文字 */
const OVERLAY_POSITION: Record<string, { x: string; y: string }> = {
  tl: { x: '24', y: '24' },
  tr: { x: 'W-w-24', y: '24' },
  bl: { x: '24', y: 'H-h-24' },
  br: { x: 'W-w-24', y: 'H-h-24' },
  center: { x: '(W-w)/2', y: '(H-h)/2' },
}
const TEXT_POSITION: Record<string, { x: string; y: string }> = {
  tl: { x: '24', y: '24' },
  tr: { x: 'w-tw-24', y: '24' },
  bl: { x: '24', y: 'h-th-24' },
  br: { x: 'w-tw-24', y: 'h-th-24' },
  center: { x: '(w-tw)/2', y: '(h-th)/2' },
}

export async function runWatermark(input: { videoFileId: string; options: VideoJobOptions; workDir: string; files: Files; providers: VideoToolProviders; fontsDir: string }) {
  const source = join(input.workDir, 'source.mp4')
  await writeInput(input.files, input.videoFileId, source, 'video')
  const output = join(input.workDir, 'output.mp4')
  const positionKey = String(input.options.position || 'br')
  const opacity = Math.max(0.1, Math.min(1, Number(input.options.opacity ?? 0.7)))
  if (input.options.logoFileId) {
    const logo = join(input.workDir, 'logo.png')
    await writeInput(input.files, String(input.options.logoFileId), logo, 'image')
    if (input.options.fullFrame) {
      // 批量字幕：网页画好的整张透明标题图，拉伸铺满画面
      await input.providers.ffmpeg([
        '-i', source, '-i', logo,
        '-filter_complex', `[1:v][0:v]scale2ref=w=main_w:h=main_h[logo][base];[logo]format=rgba,colorchannelmixer=aa=${opacity}[l];[base][l]overlay=0:0`,
        ...ENCODE, '-c:a', 'copy', '-movflags', '+faststart', output,
      ])
      return [{ fileId: input.files.store(await readFile(output), 'video/mp4').fileId, mime: 'video/mp4' }]
    }
    const scale = Math.max(0.05, Math.min(0.6, Number(input.options.scale ?? 0.18)))
    const margin = Math.max(0, Math.min(0.15, Number(input.options.margin ?? 0.02)))
    // 位置按画面宽度的比例留边（和电脑端「边距」一样）
    const m = `W*${margin}`
    const pos = ({ tl: { x: m, y: m }, tr: { x: `W-w-${m}`, y: m }, bl: { x: m, y: `H-h-${m}` }, br: { x: `W-w-${m}`, y: `H-h-${m}` }, center: { x: '(W-w)/2', y: '(H-h)/2' } } as Record<string, { x: string; y: string }>)[positionKey] ?? OVERLAY_POSITION.br!
    // Logo scaled to a share of the video width, keeping its own aspect ratio. Sizes are computed here from the
    // probed video and the logo file: scale2ref's variables (main_w / a) are swapped in the bundled ffmpeg, which
    // made wide text logos huge and tall.
    const { width: videoW } = await liveProbe(input.providers, source)
    const { width: logoW, height: logoH } = await sharp(logo).metadata()
    const ratio = logoW && logoH ? logoH / logoW : 1
    const fade = `format=rgba,colorchannelmixer=aa=${opacity}`
    const graph = videoW > 0
      ? `[1:v]scale=${Math.max(2, Math.round(videoW * scale))}:${Math.max(2, Math.round(videoW * scale * ratio))},${fade}[l];[0:v][l]overlay=${pos.x}:${pos.y}`
      : `[1:v][0:v]scale2ref=w=main_w*${scale}:h=ow/a[logo][base];[logo]${fade}[l];[base][l]overlay=${pos.x}:${pos.y}`
    await input.providers.ffmpeg(['-i', source, '-i', logo, '-filter_complex', graph, ...ENCODE, '-c:a', 'copy', '-movflags', '+faststart', output])
  } else {
    const text = String(input.options.text || '').trim().slice(0, 40)
    if (!text) throw badRequest('请输入水印文字')
    const textFile = join(input.workDir, 'watermark.txt')
    await writeFile(textFile, text, 'utf8')
    const font = join(input.workDir, 'font.otf')
    await copyFile(fontPath(input.fontsDir), font)
    const drawPos = TEXT_POSITION[positionKey] ?? TEXT_POSITION.br!
    // Paths are relative to the work dir so the filter needs no drive-letter escaping on Windows.
    await input.providers.ffmpeg([
      '-i', 'source.mp4',
      '-vf', `drawtext=fontfile=font.otf:textfile=watermark.txt:fontsize=h/28:fontcolor=white@${opacity}:borderw=2:bordercolor=black@${opacity * 0.6}:x=${drawPos.x}:y=${drawPos.y}`,
      ...ENCODE, '-c:a', 'copy', '-movflags', '+faststart', 'output.mp4',
    ], input.workDir)
  }
  return [{ fileId: input.files.store(await readFile(output), 'video/mp4').fileId, mime: 'video/mp4' }]
}

/* ------------------------------------------------------------------ 字幕 */

function assTime(ms: number) {
  const total = Math.max(0, Math.round(ms / 10))
  const cs = total % 100
  const s = Math.floor(total / 100) % 60
  const m = Math.floor(total / 6000) % 60
  const h = Math.floor(total / 360000)
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`
}

/** 竖屏 1080 宽为基准：底部居中、白字黑边，过长的句子按字数折行 */
export function buildAss(cues: WhisperCue[], options: { position?: 'bottom' | 'middle'; fontSize?: number } = {}) {
  const fontSize = Math.max(36, Math.min(110, Number(options.fontSize) || 64))
  const alignment = options.position === 'middle' ? 5 : 2
  const wrap = (text: string) => {
    const clean = text.replace(/\s+/g, ' ').trim()
    const max = /[一-鿿]/.test(clean) ? 14 : 28
    if (clean.length <= max) return clean
    const lines: string[] = []
    let rest = clean
    while (rest.length > max && lines.length < 2) {
      let cut = rest.lastIndexOf(' ', max)
      if (cut < max / 2) cut = max
      lines.push(rest.slice(0, cut).trim())
      rest = rest.slice(cut).trim()
    }
    lines.push(rest)
    return lines.join('\\N')
  }
  const escape = (text: string) => text.replace(/[{}]/g, '').replace(/\\(?!N)/g, '')
  return [
    '[Script Info]',
    'ScriptType: v4.00+',
    'PlayResX: 1080',
    'PlayResY: 1920',
    'WrapStyle: 2',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Default,Noto Sans SC,${fontSize},&H00FFFFFF,&H00FFFFFF,&H00000000,&H64000000,1,0,0,0,100,100,0,0,1,5,0,${alignment},60,60,${alignment === 2 ? 260 : 0},1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    ...cues.filter((cue) => cue.text.trim()).map((cue) => `Dialogue: 0,${assTime(cue.startMs)},${assTime(Math.max(cue.endMs, cue.startMs + 400))},Default,,0,0,0,,${escape(wrap(cue.text))}`),
    '',
  ].join('\n')
}

export async function runSubtitle(input: {
  videoFileId: string
  options: VideoJobOptions
  workDir: string
  files: Files
  providers: VideoToolProviders
  fontsDir: string
  asr: { baseUrl: string; apiKey: string }
}) {
  await writeInput(input.files, input.videoFileId, join(input.workDir, 'source.mp4'), 'video')
  // Small mono mp3 keeps the upload to the speech service fast.
  await input.providers.ffmpeg(['-i', 'source.mp4', '-vn', '-ac', '1', '-ar', '16000', '-b:a', '48k', 'audio.mp3'], input.workDir)
  const language = typeof input.options.language === 'string' && input.options.language ? input.options.language : undefined
  const transcript = await input.providers.transcribe(
    { baseUrl: `${input.asr.baseUrl}/v1`, apiKey: input.asr.apiKey, model: 'whisper-1', requestTimeoutMs: 300_000 },
    { filePath: join(input.workDir, 'audio.mp3'), language },
  )
  if (!transcript.cues.length) throw new CloudError('BAD_REQUEST', '没有识别到说话内容，视频可能没有人声', 400)
  await writeFile(join(input.workDir, 'subs.ass'), buildAss(transcript.cues, { position: input.options.position === 'middle' ? 'middle' : 'bottom', fontSize: Number(input.options.fontSize) || undefined }), 'utf8')
  const font = fontPath(input.fontsDir)
  await copyFile(font, join(input.workDir, 'NotoSansSC-Regular.otf'))
  await input.providers.ffmpeg(['-i', 'source.mp4', '-vf', 'subtitles=subs.ass:fontsdir=.', ...ENCODE, '-c:a', 'copy', '-movflags', '+faststart', 'output.mp4'], input.workDir)
  const srt = transcript.cues.map((cue, index) => `${index + 1}\n${assTime(cue.startMs)} --> ${assTime(cue.endMs)}\n${cue.text}`).join('\n\n')
  return {
    outputs: [{ fileId: input.files.store(await readFile(join(input.workDir, 'output.mp4')), 'video/mp4').fileId, mime: 'video/mp4' }],
    transcript: { language: transcript.language, text: transcript.cues.map((cue) => cue.text).join('\n'), cueCount: transcript.cues.length, srtPreview: srt.slice(0, 4000) },
  }
}

/* ------------------------------------------------------------------ 切片 */

export async function runSlice(input: { videoFileId: string; options: VideoJobOptions; workDir: string; files: Files; providers: VideoToolProviders }) {
  await writeInput(input.files, input.videoFileId, join(input.workDir, 'source.mp4'), 'video')
  const duration = await input.providers.probeDuration(join(input.workDir, 'source.mp4'))
  if (!duration) throw badRequest('无法读取视频')
  const segment = Math.max(5, Math.min(180, Math.round(Number(input.options.segmentSec) || 30)))
  if (duration / segment > MAX_OUTPUTS) throw badRequest(`切出来超过 ${MAX_OUTPUTS} 段，请把每段时长调长一些`)
  // One exact cut per part (re-encoded), so every part starts cleanly at its time.
  const outputs: VideoJobOutput[] = []
  for (let index = 0, start = 0; start < duration - 1; index += 1, start += segment) {
    const length = Math.min(segment, duration - start)
    if (length < 1) break // a tiny tail is not worth keeping
    const name = `part_${String(index).padStart(3, '0')}.mp4`
    await input.providers.ffmpeg(['-ss', String(start), '-t', length.toFixed(2), '-i', 'source.mp4', ...ENCODE, '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', name], input.workDir)
    const actual = await input.providers.probeDuration(join(input.workDir, name))
    outputs.push({ fileId: input.files.store(await readFile(join(input.workDir, name)), 'video/mp4').fileId, mime: 'video/mp4', durationSec: Math.round((actual || length) * 10) / 10 })
  }
  return outputs
}

/* ------------------------------------------------------------------ 视频拆图（图生图） */

/** 镜头切换点：ffmpeg 的 metadata 滤镜把每个切换帧的 pts_time 写进文件（找不到切换时用均分点） */
export function parseSceneCuts(text: string) {
  const cuts: number[] = []
  for (const match of text.matchAll(/pts_time:([0-9.]+)/g)) {
    const cut = Number(match[1])
    if (Number.isFinite(cut)) cuts.push(round3(cut))
  }
  return cuts
}

/** 和电脑端「拆解视频」一样：按镜头切换分段，每段取中间一帧（避开转场），最多 16 张 */
export async function runFrames(input: { videoFileId: string; workDir: string; files: Files; providers: VideoToolProviders }) {
  await writeInput(input.files, input.videoFileId, join(input.workDir, 'source.mp4'), 'video')
  const duration = Math.max(MIN_SEGMENT_DURATION_SEC, (await input.providers.probeDuration(join(input.workDir, 'source.mp4'))) || 0)
  if (duration <= MIN_SEGMENT_DURATION_SEC) throw badRequest('无法读取视频')
  let cuts: number[] = []
  try {
    await input.providers.ffmpeg(['-i', 'source.mp4', '-an', '-filter:v', "select='gt(scene,0.33)',metadata=print:file=scenes.txt", '-f', 'null', '-'], input.workDir)
    cuts = parseSceneCuts(await readFile(join(input.workDir, 'scenes.txt'), 'utf8').catch(() => ''))
  } catch {
    cuts = []
  }
  const segments = toSegments(duration, cuts.length ? [0, ...cuts, duration] : fallbackCuts(duration))
  const outputs: VideoJobOutput[] = []
  for (const [index, segment] of segments.entries()) {
    const atSec = computeFrameTimeSec(segment)
    if (atSec === null) continue
    const name = `frame_${String(index).padStart(2, '0')}.jpg`
    await input.providers.ffmpeg(['-ss', String(atSec), '-i', 'source.mp4', '-frames:v', '1', '-q:v', '3', name], input.workDir)
    if (!existsSync(join(input.workDir, name))) continue
    outputs.push({ fileId: input.files.store(await readFile(join(input.workDir, name)), 'image/jpeg').fileId, mime: 'image/jpeg', atSec })
  }
  if (!outputs.length) throw badRequest('这个视频没有拆出可用的画面')
  return outputs
}

/* ------------------------------------------------------------------ 直播切片（网页版，和电脑端同一套分析 / 导出） */

const LIVE_MAX_SEGMENTS = 30
const LIVE_MAX_SEGMENT_SEC = 15 * 60

async function liveProbe(providers: VideoToolProviders, path: string) {
  if (providers.probe) return providers.probe(path)
  return { durationSec: await providers.probeDuration(path), width: 0, height: 0, hasAudio: true }
}

/** 音量能量（每 0.5 秒一个）+ 画面切换点，网页拿到后在浏览器里按模式生成片段 */
export async function runLiveAnalyze(input: { videoFileId: string; workDir: string; files: Files; providers: VideoToolProviders }): Promise<LiveSlicerAnalysis> {
  await writeInput(input.files, input.videoFileId, join(input.workDir, 'source.mp4'), 'video')
  const info = await liveProbe(input.providers, join(input.workDir, 'source.mp4'))
  if (!info.durationSec) throw badRequest('无法读取视频')
  const readLines = async (name: string, parser: { push: (line: string) => void }) => {
    for (const line of (await readFile(join(input.workDir, name), 'utf8').catch(() => '')).split(/\r?\n/)) parser.push(line)
  }
  const energy = createEnergyParser()
  if (info.hasAudio) {
    await input.providers
      .ffmpeg(['-i', 'source.mp4', '-vn', '-sn', '-dn', '-map', '0:a:0', '-af', energyFilter('energy.txt'), '-f', 'null', '-'], input.workDir)
      .then(() => readLines('energy.txt', energy))
      .catch(() => undefined)
  }
  const scenes = createSceneParser()
  // 画面切换只是辅助信号，失败了也不影响按音量切
  await input.providers
    .ffmpeg(['-skip_frame', 'nokey', '-i', 'source.mp4', '-an', '-sn', '-dn', '-map', '0:v:0', '-vf', sceneFilter('scenes.txt'), '-f', 'null', '-'], input.workDir)
    .then(() => readLines('scenes.txt', scenes))
    .catch(() => undefined)
  return { durationSec: info.durationSec, step: ENERGY_STEP_SEC, energy: energy.result(), scenes: scenes.result() }
}

/** 按片段导出：精确切割（可转竖屏、淡入淡出、响度标准化）或极速无损（直接复制流） */
export async function runLiveExport(input: { videoFileId: string; options: VideoJobOptions; workDir: string; files: Files; providers: VideoToolProviders }) {
  const segments = (input.options.segments ?? []).slice(0, LIVE_MAX_SEGMENTS)
  if (!segments.length) throw badRequest('请选择要导出的片段')
  await writeInput(input.files, input.videoFileId, join(input.workDir, 'source.mp4'), 'video')
  const info = await liveProbe(input.providers, join(input.workDir, 'source.mp4'))
  if (!info.durationSec) throw badRequest('无法读取视频')
  const padding = Math.max(0, Math.min(5, Number(input.options.padding) || 0))
  const look = {
    aspect: input.options.aspectMode ?? 'original',
    resolution: input.options.resolution ?? '1080',
    fade: input.options.fade !== false,
    normalizeAudio: input.options.normalizeAudio !== false,
  } as const
  const outputs: VideoJobOutput[] = []
  for (const [index, segment] of segments.entries()) {
    const start = Math.max(0, Number(segment.start) - padding)
    const end = Math.min(info.durationSec, Number(segment.end) + padding)
    const length = Math.min(LIVE_MAX_SEGMENT_SEC, end - start)
    if (!(length > 0.3)) continue
    const name = `clip_${String(index).padStart(2, '0')}.mp4`
    if (input.options.cutMode === 'fast') {
      await input.providers.ffmpeg(['-ss', start.toFixed(3), '-i', 'source.mp4', '-t', length.toFixed(3), '-c', 'copy', '-avoid_negative_ts', 'make_zero', '-movflags', '+faststart', name], input.workDir)
    } else {
      const video = buildVideoChain(info.width, info.height, look, length)
      const graph = info.hasAudio ? `${video.graph};${buildAudioChain(look, length, '0:a:0')}` : video.graph
      await input.providers.ffmpeg([
        '-ss', start.toFixed(3), '-i', 'source.mp4', '-t', length.toFixed(3),
        '-filter_complex', graph, '-map', '[vout]', ...(info.hasAudio ? ['-map', '[aout]', '-c:a', 'aac', '-b:a', '160k'] : []),
        ...ENCODE, '-movflags', '+faststart', name,
      ], input.workDir)
    }
    outputs.push({ fileId: input.files.store(await readFile(join(input.workDir, name)), 'video/mp4').fileId, mime: 'video/mp4', durationSec: Math.round(length * 10) / 10, segmentId: segment.id })
  }
  if (!outputs.length) throw badRequest('片段太短，没有可导出的内容')
  return outputs
}

/* ------------------------------------------------------------------ 混剪 */

/** 混剪画面：统一成 720x1280，按模板选择裁切或加黑边，再叠加调色 / 镜像 / 标题（都在同一次编码里完成） */
export function mixFilter(input: { aspect?: string; color?: VideoJobOptions['color']; hflip?: boolean; title?: boolean }) {
  const chain = [
    input.aspect === 'contain_pad'
      ? 'scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2:color=black'
      : 'scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280',
    'setsar=1',
    'fps=30',
  ]
  if (input.color) {
    const n = (value: number, lo: number, hi: number, fallback: number) => (Number.isFinite(Number(value)) ? Math.min(hi, Math.max(lo, Number(value))) : fallback)
    chain.push(`eq=brightness=${n(input.color.brightness, -0.3, 0.3, 0)}:contrast=${n(input.color.contrast, 0.5, 1.5, 1)}:saturation=${n(input.color.saturation, 0, 2, 1)}`)
  }
  if (input.hflip) chain.push('hflip')
  if (input.title) chain.push('drawtext=fontfile=font.otf:textfile=title.txt:fontsize=46:fontcolor=white:borderw=3:bordercolor=black@0.7:line_spacing=10:x=(w-tw)/2:y=h*0.14')
  return chain.join(',')
}

export async function runMix(input: { clipFileIds: string[]; options: VideoJobOptions; workDir: string; files: Files; providers: VideoToolProviders; fontsDir?: string }) {
  const clips = Array.from(new Set(input.clipFileIds)).slice(0, 40)
  if (clips.length < 2) throw badRequest('素材池至少要 2 段视频')
  const options = input.options
  const random = input.providers.random
  const between = (min: number, max: number) => (max > min ? min + random() * (max - min) : min)
  const count = Math.max(1, Math.min(10, Math.round(Number(options.count) || 3)))
  const targetMin = Math.max(6, Math.min(60, Math.round(Number(options.durationSec) || 15)))
  const targetMax = Math.max(targetMin, Math.min(60, Math.round(Number(options.durationMaxSec) || targetMin)))
  const pieceMin = Math.max(1, Math.min(8, Number(options.pieceSec) || 3))
  const pieceMax = Math.max(pieceMin, Math.min(8, Number(options.pieceMaxSec) || pieceMin))
  const titles = (Array.isArray(options.titles) ? options.titles : []).map((text) => String(text).trim()).filter(Boolean).slice(0, 50)
  const bgmVolume = Math.max(0, Math.min(1, Number.isFinite(Number(options.bgmVolume)) ? Number(options.bgmVolume) : 1))

  const sources: Array<{ path: string; duration: number }> = []
  for (const [index, fileId] of clips.entries()) {
    const path = join(input.workDir, `clip_${index}.mp4`)
    await writeInput(input.files, fileId, path, 'video')
    sources.push({ path: `clip_${index}.mp4`, duration: await input.providers.probeDuration(path) })
  }
  // Background music: a template may offer several tracks (one picked per video); the old single field still works.
  const bgmIds = [...new Set([...(Array.isArray(options.bgmFileIds) ? options.bgmFileIds : []), ...(options.bgmFileId ? [options.bgmFileId] : [])].map(String).filter(Boolean))].slice(0, 20)
  const bgms: string[] = []
  for (const [index, fileId] of bgmIds.entries()) {
    const name = `bgm_${index}.mp3`
    await writeInput(input.files, fileId, join(input.workDir, name), 'audio')
    bgms.push(name)
  }
  if (titles.length) {
    if (!input.fontsDir) throw new CloudError('INTERNAL', '服务器缺少中文字体，无法加标题', 500)
    await copyFile(fontPath(input.fontsDir), join(input.workDir, 'font.otf'))
  }

  // Each output is a different ordered selection; identical combinations are skipped (the desktop's 去重 idea).
  const seen = new Set<string>()
  const outputs: VideoJobOutput[] = []
  for (let attempt = 0; outputs.length < count && attempt < count * 8; attempt += 1) {
    const target = Math.round(between(targetMin, targetMax))
    const order = [...sources.keys()].sort(() => random() - 0.5)
    const pieces: Array<{ index: number; start: number; length: number; flip: boolean }> = []
    let total = 0
    for (let i = 0; total < target - 0.2; i += 1) {
      const index = order[i % order.length]!
      const src = sources[index]!
      const want = Math.round(between(pieceMin, pieceMax) * 10) / 10
      const length = Math.min(want, target - total, Math.max(0.8, src.duration))
      const start = src.duration > length ? Math.round(random() * (src.duration - length) * 10) / 10 : 0
      pieces.push({ index, start, length, flip: Boolean(options.hflip) && random() < 0.5 })
      total += length
      if (i > 60) break
    }
    const signature = createHash('sha1').update(pieces.map((piece) => `${piece.index}@${piece.start}${piece.flip ? 'f' : ''}`).join('|')).digest('hex')
    if (seen.has(signature)) continue
    seen.add(signature)

    const n = outputs.length
    const title = titles.length ? titles[Math.floor(random() * titles.length)]! : ''
    if (title) await writeFile(join(input.workDir, 'title.txt'), title, 'utf8')
    const parts: string[] = []
    for (const [k, piece] of pieces.entries()) {
      const part = `mix${n}_p${k}.mp4`
      await input.providers.ffmpeg([
        '-ss', String(piece.start), '-t', piece.length.toFixed(2), '-i', sources[piece.index]!.path,
        '-vf', mixFilter({ aspect: options.aspect, color: options.color, hflip: piece.flip, title: Boolean(title) }),
        '-an', ...ENCODE, part,
      ], input.workDir)
      parts.push(part)
    }
    await writeFile(join(input.workDir, `mix${n}.txt`), parts.map((part) => `file '${part}'`).join('\n'))
    const video = `mix${n}_video.mp4`
    await input.providers.ffmpeg(['-f', 'concat', '-safe', '0', '-i', `mix${n}.txt`, '-c', 'copy', video], input.workDir)
    const final = `mix${n}.mp4`
    const bgm = bgms.length ? bgms[Math.floor(random() * bgms.length)]! : ''
    if (bgm) {
      const volume = bgmVolume < 1 ? ['-filter:a', `volume=${bgmVolume.toFixed(2)}`] : []
      await input.providers.ffmpeg(['-i', video, '-stream_loop', '-1', '-i', bgm, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', ...volume, '-c:a', 'aac', '-b:a', '128k', '-shortest', '-movflags', '+faststart', final], input.workDir)
    } else {
      await input.providers.ffmpeg(['-i', video, '-c', 'copy', '-movflags', '+faststart', final], input.workDir)
    }
    outputs.push({ fileId: input.files.store(await readFile(join(input.workDir, final)), 'video/mp4').fileId, mime: 'video/mp4', durationSec: Math.round(total * 10) / 10 })
  }
  return outputs
}

/**
 * 生产中心的云端简版成片：按方案逐个镜头精确剪（起点、时长），拼成 1 条，叠加标题和模板的音乐 / 画面。
 * 配音和字幕只在电脑端成片里有。
 */
export async function runMixShots(input: { shots: Array<{ fileId: string; startSec?: number; durationSec: number }>; options: VideoJobOptions; workDir: string; files: Files; providers: VideoToolProviders; fontsDir?: string }) {
  const shots = input.shots.slice(0, 30)
  if (shots.length < 2) throw badRequest('方案至少要 2 个镜头')
  const options = input.options
  const random = input.providers.random
  const title = String(options.title || '').trim().slice(0, 120)
  const sources = new Map<string, string>()
  for (const shot of shots) {
    if (sources.has(shot.fileId)) continue
    const name = `src_${sources.size}.mp4`
    await writeInput(input.files, shot.fileId, join(input.workDir, name), 'video')
    sources.set(shot.fileId, name)
  }
  if (title) {
    if (!input.fontsDir) throw new CloudError('INTERNAL', '服务器缺少中文字体，无法加标题', 500)
    await copyFile(fontPath(input.fontsDir), join(input.workDir, 'font.otf'))
    await writeFile(join(input.workDir, 'title.txt'), title, 'utf8')
  }
  const parts: string[] = []
  let total = 0
  for (const [k, shot] of shots.entries()) {
    const length = Math.max(0.4, Math.min(15, Number(shot.durationSec) || 2))
    const part = `shot_${k}.mp4`
    await input.providers.ffmpeg([
      '-ss', String(Math.max(0, Number(shot.startSec) || 0)), '-t', length.toFixed(2), '-i', sources.get(shot.fileId)!,
      '-vf', mixFilter({ aspect: options.aspect, color: options.color, hflip: Boolean(options.hflip) && random() < 0.5, title: Boolean(title) }),
      '-an', ...ENCODE, part,
    ], input.workDir)
    parts.push(part)
    total += length
  }
  await writeFile(join(input.workDir, 'shots.txt'), parts.map((part) => `file '${part}'`).join('\n'))
  await input.providers.ffmpeg(['-f', 'concat', '-safe', '0', '-i', 'shots.txt', '-c', 'copy', 'video.mp4'], input.workDir)
  const bgmIds = [...new Set([...(Array.isArray(options.bgmFileIds) ? options.bgmFileIds : []), ...(options.bgmFileId ? [options.bgmFileId] : [])].map(String).filter(Boolean))]
  if (bgmIds.length) {
    await writeInput(input.files, bgmIds[Math.floor(random() * bgmIds.length)]!, join(input.workDir, 'bgm.mp3'), 'audio')
    const volume = Math.max(0, Math.min(1, Number.isFinite(Number(options.bgmVolume)) ? Number(options.bgmVolume) : 1))
    await input.providers.ffmpeg(['-i', 'video.mp4', '-stream_loop', '-1', '-i', 'bgm.mp3', '-map', '0:v', '-map', '1:a', '-c:v', 'copy', ...(volume < 1 ? ['-filter:a', `volume=${volume.toFixed(2)}`] : []), '-c:a', 'aac', '-b:a', '128k', '-shortest', '-movflags', '+faststart', 'final.mp4'], input.workDir)
  } else {
    await input.providers.ffmpeg(['-i', 'video.mp4', '-c', 'copy', '-movflags', '+faststart', 'final.mp4'], input.workDir)
  }
  return [{ fileId: input.files.store(await readFile(join(input.workDir, 'final.mp4')), 'video/mp4').fileId, mime: 'video/mp4', durationSec: Math.round(total * 10) / 10 }]
}

/* ------------------------------------------------------------------ 链接解析下载 */

export async function runParseLink(input: { url: string; tikhubApiKey: string; workDir: string; files: Files; providers: VideoToolProviders }) {
  if (!extractFirstUrl(input.url)) throw badRequest('没有找到链接，请粘贴分享链接或分享文案')
  if (!input.tikhubApiKey) throw new CloudError('NO_ENTITLEMENT', '管理员还没有配置 TikHub 密钥，暂时无法解析链接', 503)
  let parsed: ParsedVideo
  try {
    parsed = await parseShareLink({ text: input.url, apiKey: input.tikhubApiKey, fetch: input.providers.fetch as unknown as TikhubFetch })
  } catch (error) {
    throw new CloudError('BAD_REQUEST', (error as Error).message || '链接解析失败', 400)
  }
  const fetchFile = async (url: string, name: string) => {
    const res = await input.providers.fetch(url, { headers: parsed.downloadHeaders, signal: AbortSignal.timeout(300_000) })
    if (!res.ok) throw new CloudError('INTERNAL', `视频下载失败（HTTP ${res.status}）`, 502)
    const body = Buffer.from(await res.arrayBuffer())
    if (body.length < 1024) throw new CloudError('INTERNAL', '下载到的视频是空的，请稍后再试', 502)
    await writeFile(join(input.workDir, name), body)
    return body
  }
  let body = await fetchFile(parsed.downloadUrl, 'download.mp4')
  // B 站 / YouTube：画面和声音分开，合并成一个文件
  if (parsed.audioUrl) {
    await fetchFile(parsed.audioUrl, 'audio.m4a')
    await input.providers.ffmpeg(['-i', 'download.mp4', '-i', 'audio.m4a', '-map', '0:v:0', '-map', '1:a:0', '-c', 'copy', '-movflags', '+faststart', 'merged.mp4'], input.workDir)
    body = await readFile(join(input.workDir, 'merged.mp4'))
    await writeFile(join(input.workDir, 'download.mp4'), body)
  }
  // 封面：截一帧小图，作品卡片不用加载整段视频
  let posterFileId: string | undefined
  try {
    await input.providers.ffmpeg(['-ss', '0.5', '-i', 'download.mp4', '-frames:v', '1', '-vf', 'scale=480:-2', '-q:v', '4', 'poster.jpg'], input.workDir)
    posterFileId = input.files.store(await readFile(join(input.workDir, 'poster.jpg')), 'image/jpeg').fileId
  } catch {
    posterFileId = undefined
  }
  return { outputs: [{ fileId: input.files.store(body, 'video/mp4').fileId, mime: 'video/mp4', posterFileId }], title: parsed.title, author: parsed.author, platform: parsed.platform }
}
