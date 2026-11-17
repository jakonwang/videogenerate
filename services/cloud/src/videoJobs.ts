import { createHash } from 'node:crypto'
import { copyFile, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { badRequest, CloudError } from './security'
import type { CloneProviders } from './cloneJobs'
import { transcribeWithWhisperCompatible, type WhisperCue } from '../../../src/main/modules/web-platform/whisperCompatible'
import { TIKHUB_FETCH_ONE_BY_SHARE_URL, resolveDownloadUrl, resolveTitle } from '../../../src/main/modules/video-parser-download/tikhub'
import type { VideoJobOptions, VideoJobOutput } from '../../../src/shared/cloud/videoTools'

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
    const pos = OVERLAY_POSITION[positionKey] ?? OVERLAY_POSITION.br!
    // Logo scaled to ~18% of the video width, keeping its own aspect ratio.
    await input.providers.ffmpeg([
      '-i', source, '-i', logo,
      '-filter_complex', `[1:v][0:v]scale2ref=w=main_w*0.18:h=ow/a[logo][base];[logo]format=rgba,colorchannelmixer=aa=${opacity}[l];[base][l]overlay=${pos.x}:${pos.y}`,
      ...ENCODE, '-c:a', 'copy', '-movflags', '+faststart', output,
    ])
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

/* ------------------------------------------------------------------ 混剪 */

export async function runMix(input: { clipFileIds: string[]; options: VideoJobOptions; workDir: string; files: Files; providers: VideoToolProviders }) {
  const clips = Array.from(new Set(input.clipFileIds)).slice(0, 40)
  if (clips.length < 2) throw badRequest('素材池至少要 2 段视频')
  const count = Math.max(1, Math.min(10, Math.round(Number(input.options.count) || 3)))
  const target = Math.max(6, Math.min(60, Math.round(Number(input.options.durationSec) || 15)))
  const pieceSec = Math.max(1.5, Math.min(6, Number(input.options.pieceSec) || 3))

  const sources: Array<{ path: string; duration: number }> = []
  for (const [index, fileId] of clips.entries()) {
    const path = join(input.workDir, `clip_${index}.mp4`)
    await writeInput(input.files, fileId, path, 'video')
    sources.push({ path: `clip_${index}.mp4`, duration: await input.providers.probeDuration(path) })
  }
  let bgm = ''
  if (input.options.bgmFileId) {
    bgm = 'bgm.mp3'
    await writeInput(input.files, String(input.options.bgmFileId), join(input.workDir, bgm), 'audio')
  }

  // Each output is a different ordered selection; identical combinations are skipped (the desktop's 去重 idea).
  const seen = new Set<string>()
  const outputs: VideoJobOutput[] = []
  for (let attempt = 0; outputs.length < count && attempt < count * 8; attempt += 1) {
    const order = [...sources.keys()].sort(() => input.providers.random() - 0.5)
    const pieces: Array<{ index: number; start: number; length: number }> = []
    let total = 0
    for (let i = 0; total < target - 0.2; i += 1) {
      const index = order[i % order.length]!
      const src = sources[index]!
      const length = Math.min(pieceSec, target - total, Math.max(0.8, src.duration))
      const start = src.duration > length ? Math.round(input.providers.random() * (src.duration - length) * 10) / 10 : 0
      pieces.push({ index, start, length })
      total += length
      if (i > 60) break
    }
    const signature = createHash('sha1').update(pieces.map((piece) => `${piece.index}@${piece.start}`).join('|')).digest('hex')
    if (seen.has(signature)) continue
    seen.add(signature)

    const n = outputs.length
    const parts: string[] = []
    for (const [k, piece] of pieces.entries()) {
      const part = `mix${n}_p${k}.mp4`
      await input.providers.ffmpeg([
        '-ss', String(piece.start), '-t', piece.length.toFixed(2), '-i', sources[piece.index]!.path,
        '-vf', 'scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,setsar=1,fps=30',
        '-an', ...ENCODE, part,
      ], input.workDir)
      parts.push(part)
    }
    await writeFile(join(input.workDir, `mix${n}.txt`), parts.map((part) => `file '${part}'`).join('\n'))
    const video = `mix${n}_video.mp4`
    await input.providers.ffmpeg(['-f', 'concat', '-safe', '0', '-i', `mix${n}.txt`, '-c', 'copy', video], input.workDir)
    const final = `mix${n}.mp4`
    if (bgm) {
      await input.providers.ffmpeg(['-i', video, '-stream_loop', '-1', '-i', bgm, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k', '-shortest', '-movflags', '+faststart', final], input.workDir)
    } else {
      await input.providers.ffmpeg(['-i', video, '-c', 'copy', '-movflags', '+faststart', final], input.workDir)
    }
    outputs.push({ fileId: input.files.store(await readFile(join(input.workDir, final)), 'video/mp4').fileId, mime: 'video/mp4', durationSec: Math.round(total * 10) / 10 })
  }
  return outputs
}

/* ------------------------------------------------------------------ 链接解析下载 */

export async function runParseLink(input: { url: string; tikhubApiKey: string; workDir: string; files: Files; providers: VideoToolProviders }) {
  const shareUrl = String(input.url || '').match(/https?:\/\/[^\s]+/)?.[0]
  if (!shareUrl) throw badRequest('没有找到链接，请粘贴 TikTok / 抖音分享链接')
  if (!input.tikhubApiKey) throw new CloudError('NO_ENTITLEMENT', '管理员还没有配置 TikHub 密钥，暂时无法解析链接', 503)
  const api = new URL(TIKHUB_FETCH_ONE_BY_SHARE_URL)
  api.searchParams.set('share_url', shareUrl)
  const res = await input.providers.fetch(api.toString(), { headers: { Authorization: `Bearer ${input.tikhubApiKey}` }, signal: AbortSignal.timeout(60_000) })
  const text = await res.text()
  if (!res.ok) throw new CloudError('INTERNAL', `链接解析失败（HTTP ${res.status}）`, 502)
  let payload: unknown
  try {
    payload = JSON.parse(text)
  } catch {
    throw new CloudError('INTERNAL', '链接解析返回异常', 502)
  }
  const downloadUrl = resolveDownloadUrl(payload)
  if (!downloadUrl) throw new CloudError('BAD_REQUEST', '这个链接没有可下载的视频', 400)
  const video = await input.providers.fetch(downloadUrl, { signal: AbortSignal.timeout(300_000) })
  if (!video.ok) throw new CloudError('INTERNAL', `视频下载失败（HTTP ${video.status}）`, 502)
  const body = Buffer.from(await video.arrayBuffer())
  if (body.length < 1024) throw new CloudError('INTERNAL', '下载到的视频是空的，请稍后再试', 502)
  return { outputs: [{ fileId: input.files.store(body, 'video/mp4').fileId, mime: 'video/mp4' }], title: resolveTitle(payload) }
}
