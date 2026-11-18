import { mkdir, stat, writeFile } from 'node:fs/promises'
import { extname, join, parse } from 'node:path'
import { invalidateHwEncoderProbes, libx264Pick, pickH264Encoder, type EncoderPick } from '../ffmpeg/encoders'
import { runFfmpeg } from '../ffmpeg/runner'
import { probeMedia } from '../ffmpeg/probe'
import { parseProgressSeconds } from './analyze'
import { buildAudioChain, buildVideoChain, targetFrame, type LiveSlicerAspect, type LiveSlicerCutMode, type LiveSlicerResolution } from '../../../shared/liveSlicer'
export { targetFrame, type LiveSlicerAspect, type LiveSlicerCutMode, type LiveSlicerResolution }

export type LiveSlicerExportOptions = {
  outputDir: string
  cutMode: LiveSlicerCutMode
  aspect: LiveSlicerAspect
  resolution: LiveSlicerResolution
  fade: boolean
  normalizeAudio: boolean
  /** Seconds added before/after each clip (clamped to the video). */
  padding: number
  namePrefix: string
  /** Put the clips in a new `<video>_<timestamp>` sub folder. */
  subFolder: boolean
}

export type LiveSlicerExportSegment = { id: string; start: number; end: number; title?: string }

export type LiveSlicerExportResult = {
  id: string
  ok: boolean
  outputPath?: string
  sizeBytes?: number
  error?: string
}

export type LiveSlicerExportProgress = {
  index: number
  total: number
  segmentId: string
  /** Progress of the current clip, 0..1. */
  fraction: number
  result?: LiveSlicerExportResult
}

function sanitizeName(value: string) {
  return String(value ?? '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
}

function stamp(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

function fmtTime(sec: number) {
  const s = Math.max(0, sec)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s - h * 3600 - m * 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${r.toFixed(3).padStart(6, '0')}`
}

/** Output frame size for an aspect + resolution choice; never upscales the source. */
function encoderArgs(enc: EncoderPick) {
  if (enc.codec === 'libx264') return ['-c:v', 'libx264', ...enc.args, '-crf', '20', '-profile:v', 'high']
  return ['-c:v', enc.codec, ...enc.args]
}

async function runClip(opts: {
  inputPath: string
  outputPath: string
  start: number
  duration: number
  srcW: number
  srcH: number
  audioMap: string | null
  options: LiveSlicerExportOptions
  encoder: EncoderPick
  signal?: AbortSignal
  onFraction: (f: number) => void
}) {
  const { options } = opts
  const common = ['-hide_banner', '-nostdin', '-loglevel', 'error', '-nostats', '-progress', 'pipe:2', '-y']
  const onStderr = (line: string) => {
    const sec = parseProgressSeconds(line)
    if (sec != null && opts.duration > 0) opts.onFraction(Math.min(1, sec / opts.duration))
  }
  if (options.cutMode === 'fast') {
    await runFfmpeg({
      signal: opts.signal,
      onStderr,
      args: [
        ...common,
        '-ss',
        opts.start.toFixed(3),
        '-i',
        opts.inputPath,
        '-t',
        opts.duration.toFixed(3),
        '-map',
        '0:v:0',
        ...(opts.audioMap ? ['-map', opts.audioMap] : []),
        '-c',
        'copy',
        '-avoid_negative_ts',
        'make_zero',
        ...(extname(opts.outputPath).toLowerCase() === '.mp4' ? ['-movflags', '+faststart'] : []),
        opts.outputPath,
      ],
    })
    return
  }

  const video = buildVideoChain(opts.srcW, opts.srcH, options, opts.duration)
  const graph = [video.graph, ...(opts.audioMap ? [buildAudioChain(options, opts.duration, opts.audioMap)] : [])].join(';')
  await runFfmpeg({
    signal: opts.signal,
    onStderr,
    args: [
      ...common,
      '-ss',
      opts.start.toFixed(3),
      '-i',
      opts.inputPath,
      '-t',
      opts.duration.toFixed(3),
      '-filter_complex',
      graph,
      '-map',
      '[vout]',
      ...(opts.audioMap ? ['-map', '[aout]', '-c:a', 'aac', '-b:a', '192k'] : []),
      ...encoderArgs(opts.encoder),
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      opts.outputPath,
    ],
  })
}

/** Cuts every segment into its own file, one after another, reporting per-clip progress. */
export async function exportLiveSegments(opts: {
  inputPath: string
  segments: LiveSlicerExportSegment[]
  options: LiveSlicerExportOptions
  signal?: AbortSignal
  onProgress?: (p: LiveSlicerExportProgress) => void
}): Promise<{ outputDir: string; results: LiveSlicerExportResult[] }> {
  const inputPath = String(opts.inputPath ?? '').trim()
  if (!inputPath) throw new Error('No input video selected.')
  const segments = (opts.segments ?? []).filter((s) => Number(s.end) - Number(s.start) >= 0.5)
  if (!segments.length) throw new Error('No clips to export.')
  const options = opts.options
  const baseDir = String(options.outputDir ?? '').trim()
  if (!baseDir) throw new Error('Choose an output folder first.')

  const probe = await probeMedia(inputPath)
  const total = Number(probe.durationSec) || Number.MAX_SAFE_INTEGER
  const srcName = sanitizeName(parse(inputPath).name) || 'live'
  const outputDir = options.subFolder ? join(baseDir, `${srcName}_${stamp()}`) : baseDir
  await mkdir(outputDir, { recursive: true })

  const srcExt = extname(inputPath).toLowerCase()
  const ext = options.cutMode === 'fast' && ['.mp4', '.mov', '.mkv', '.webm'].includes(srcExt) ? srcExt : '.mp4'
  const audioMap = probe.hasAudio ? (probe.audioStreamIndex != null ? `0:${probe.audioStreamIndex}` : '0:a:0') : null
  let encoder: EncoderPick = options.cutMode === 'precise' ? await pickH264Encoder() : libx264Pick('copy')
  const prefix = sanitizeName(options.namePrefix) || srcName
  const pad = Math.max(0, Math.min(5, Number(options.padding) || 0))

  const results: LiveSlicerExportResult[] = []
  for (let i = 0; i < segments.length; i += 1) {
    if (opts.signal?.aborted) throw new Error('Export cancelled.')
    const seg = segments[i]
    const start = Math.max(0, Number(seg.start) - pad)
    const end = Math.min(total, Number(seg.end) + pad)
    const duration = Math.max(0.5, end - start)
    const title = sanitizeName(seg.title ?? '')
    const fileName = `${prefix}_${String(i + 1).padStart(2, '0')}${title ? `_${title}` : ''}${ext}`
    const outputPath = join(outputDir, fileName)
    const report = (fraction: number, result?: LiveSlicerExportResult) =>
      opts.onProgress?.({ index: i, total: segments.length, segmentId: seg.id, fraction, result })
    report(0)

    const run = (enc: EncoderPick) =>
      runClip({
        inputPath,
        outputPath,
        start,
        duration,
        srcW: Number(probe.width) || 0,
        srcH: Number(probe.height) || 0,
        audioMap,
        options,
        encoder: enc,
        signal: opts.signal,
        onFraction: (f) => report(f),
      })

    let result: LiveSlicerExportResult
    try {
      try {
        await run(encoder)
      } catch (e) {
        if (opts.signal?.aborted || encoder.codec === 'libx264' || options.cutMode === 'fast') throw e
        // Hardware encoder failed at runtime: fall back to software for this and later clips.
        invalidateHwEncoderProbes()
        encoder = libx264Pick('hardware encoder failed, using libx264')
        await run(encoder)
      }
      const info = await stat(outputPath)
      result = { id: seg.id, ok: true, outputPath, sizeBytes: info.size }
    } catch (e: any) {
      if (opts.signal?.aborted) throw new Error('Export cancelled.')
      result = { id: seg.id, ok: false, error: String(e?.message ?? e).split('\n')[0] }
    }
    results.push(result)
    report(1, result)
  }

  // A plain-text index next to the clips: handy when publishing or handing off.
  const manifest = [
    `# ${parse(inputPath).base}`,
    ...segments.map((s, i) => {
      const r = results[i]
      return `${String(i + 1).padStart(2, '0')}\t${fmtTime(s.start)} - ${fmtTime(s.end)}\t${(s.end - s.start).toFixed(1)}s\t${s.title ?? ''}\t${r?.ok ? parse(r.outputPath ?? '').base : `FAILED: ${r?.error ?? ''}`}`
    }),
  ].join('\n')
  await writeFile(join(outputDir, 'clips.txt'), `${manifest}\n`, 'utf-8').catch(() => {})

  return { outputDir, results }
}
