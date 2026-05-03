import { spawn } from 'node:child_process'

import { getFfmpegExecutable } from '../../lib/binariesPath'

export type SubtitlePlacementSegment = {
  filePath: string
  startSec: number
  durationSec: number
  inputDurationSec?: number
}

type TitlePlacement = 'top' | 'middle' | 'bottom'

export type SubtitlePlacementSuggestion = {
  titlePlacement: TitlePlacement
  ttsPlacement: 'top' | 'bottom'
  confidence: number
  scores: Record<TitlePlacement, number>
  sampledFrames: number
}

type BandRegion = { xMin: number; xMax: number; yMin: number; yMax: number }

const ANALYZE_WIDTH = 96
const ANALYZE_HEIGHT = 170
const DEFAULT_SAMPLE_PER_SEGMENT = 1
const DEFAULT_MAX_SEGMENTS = 3

const BAND_REGIONS: Record<TitlePlacement, BandRegion> = {
  top: { xMin: 0.12, xMax: 0.88, yMin: 0.06, yMax: 0.28 },
  middle: { xMin: 0.12, xMax: 0.88, yMin: 0.4, yMax: 0.63 },
  bottom: { xMin: 0.12, xMax: 0.88, yMin: 0.72, yMax: 0.93 },
}

function clamp(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min
  return Math.max(min, Math.min(max, n))
}

function roundTo(n: number, digits = 4) {
  const m = 10 ** digits
  return Math.round(n * m) / m
}

function pickSegments(segments: SubtitlePlacementSegment[], limit: number): SubtitlePlacementSegment[] {
  if (segments.length <= limit) return segments
  if (limit <= 1) return [segments[0]]
  const idxSet = new Set<number>()
  const out: SubtitlePlacementSegment[] = []
  for (let i = 0; i < limit; i++) {
    const idx = Math.round((i * (segments.length - 1)) / (limit - 1))
    if (idxSet.has(idx)) continue
    idxSet.add(idx)
    out.push(segments[idx]!)
  }
  return out
}

function pickSampleTimes(seg: SubtitlePlacementSegment, count: number): number[] {
  const start = clamp(Number(seg.startSec ?? 0), 0, 60 * 60)
  const inDurRaw = Number(seg.inputDurationSec ?? seg.durationSec ?? 0)
  const inDur = Math.max(0.08, inDurRaw)
  if (count <= 1) {
    return [start + clamp(inDur * 0.5, 0.04, Math.max(0.04, inDur - 0.04))]
  }
  const times: number[] = []
  for (let i = 0; i < count; i++) {
    const t = (i + 1) / (count + 1)
    const rel = clamp(t * inDur, 0.04, Math.max(0.04, inDur - 0.04))
    times.push(start + rel)
  }
  return times
}

function toBounds(region: BandRegion, width: number, height: number) {
  const x0 = clamp(Math.floor(region.xMin * width), 0, width - 2)
  const x1 = clamp(Math.ceil(region.xMax * width), x0 + 1, width)
  const y0 = clamp(Math.floor(region.yMin * height), 0, height - 2)
  const y1 = clamp(Math.ceil(region.yMax * height), y0 + 1, height)
  return { x0, x1, y0, y1 }
}

function regionComplexity(frame: Uint8Array, width: number, height: number, region: BandRegion): number {
  const { x0, x1, y0, y1 } = toBounds(region, width, height)
  let sum = 0
  let sum2 = 0
  let count = 0
  let edge = 0
  let edgeCount = 0

  for (let y = y0; y < y1; y++) {
    const row = y * width
    for (let x = x0; x < x1; x++) {
      const idx = row + x
      const p = frame[idx] ?? 0
      sum += p
      sum2 += p * p
      count++
      if (x + 1 < x1) {
        edge += Math.abs(p - (frame[idx + 1] ?? p))
        edgeCount++
      }
      if (y + 1 < y1) {
        edge += Math.abs(p - (frame[idx + width] ?? p))
        edgeCount++
      }
    }
  }

  if (count <= 0 || edgeCount <= 0) return Number.POSITIVE_INFINITY
  const mean = sum / count
  const variance = Math.max(0, sum2 / count - mean * mean)
  const std = Math.sqrt(variance)
  const edgeAvg = edge / edgeCount
  return edgeAvg * 0.72 + std * 0.28
}

function scoreFrame(frame: Uint8Array, width: number, height: number): Record<TitlePlacement, number> {
  return {
    top: regionComplexity(frame, width, height, BAND_REGIONS.top),
    middle: regionComplexity(frame, width, height, BAND_REGIONS.middle),
    bottom: regionComplexity(frame, width, height, BAND_REGIONS.bottom),
  }
}

function chooseTitlePlacement(scores: Record<TitlePlacement, number>): TitlePlacement {
  const top = scores.top
  const middle = scores.middle
  const bottom = scores.bottom

  const topBottomBest: TitlePlacement = top <= bottom ? 'top' : 'bottom'
  const topBottomBestScore = Math.min(top, bottom)

  // middle 仅在明显更干净时才启用，避免频繁放到屏幕中央影响观感
  if (middle + 3.5 < topBottomBestScore) return 'middle'
  // bottom 比 top 明显更干净时，允许放到底部
  if (bottom + 1.2 < top) return 'bottom'
  return topBottomBest
}

function calcConfidence(scores: Record<TitlePlacement, number>): number {
  const sorted = Object.values(scores)
    .filter((x) => Number.isFinite(x))
    .sort((a, b) => a - b)
  if (sorted.length < 2) return 0
  return clamp((sorted[1]! - sorted[0]!) / 8, 0, 1)
}

async function extractGrayFrame(input: {
  filePath: string
  atSec: number
  width: number
  height: number
  signal?: AbortSignal
}): Promise<Uint8Array | null> {
  let ffmpegPath = ''
  try {
    ffmpegPath = getFfmpegExecutable()
  } catch {
    return null
  }

  return await new Promise<Uint8Array | null>((resolve) => {
    const args = [
      '-hide_banner',
      '-loglevel',
      'error',
      '-ss',
      String(roundTo(input.atSec, 3)),
      '-i',
      input.filePath,
      '-frames:v',
      '1',
      '-vf',
      `scale=${input.width}:${input.height}:force_original_aspect_ratio=decrease,pad=${input.width}:${input.height}:(ow-iw)/2:(oh-ih)/2:color=black,format=gray`,
      '-f',
      'rawvideo',
      '-pix_fmt',
      'gray',
      '-',
    ]

    const env = { ...process.env } as NodeJS.ProcessEnv
    if (process.platform !== 'win32') {
      env.LC_ALL = env.LC_ALL || 'C.UTF-8'
      env.LANG = env.LANG || 'C.UTF-8'
    }

    const child = spawn(ffmpegPath, args, { windowsHide: true, env })
    const chunks: Buffer[] = []
    let aborted = false
    const onAbort = () => {
      aborted = true
      try {
        child.kill('SIGKILL')
      } catch {
        // ignore
      }
    }

    if (input.signal) {
      if (input.signal.aborted) onAbort()
      else input.signal.addEventListener('abort', onAbort, { once: true })
    }

    child.stdout.on('data', (chunk: Buffer) => {
      chunks.push(chunk)
    })

    child.on('error', () => resolve(null))
    child.on('close', (code) => {
      if (input.signal) input.signal.removeEventListener('abort', onAbort)
      if (aborted || code !== 0) return resolve(null)
      const buf = Buffer.concat(chunks)
      const needed = input.width * input.height
      if (buf.length < needed) return resolve(null)
      resolve(buf.subarray(0, needed))
    })
  })
}

export async function suggestSubtitlePlacement(input: {
  segments: SubtitlePlacementSegment[]
  samplePerSegment?: number
  maxSegments?: number
  signal?: AbortSignal
}): Promise<SubtitlePlacementSuggestion | null> {
  const samplePerSegment = clamp(
    Math.round(Number(input.samplePerSegment ?? DEFAULT_SAMPLE_PER_SEGMENT)),
    1,
    3,
  )
  const maxSegments = clamp(
    Math.round(Number(input.maxSegments ?? DEFAULT_MAX_SEGMENTS)),
    1,
    6,
  )

  const segmentsRaw = Array.isArray(input.segments) ? input.segments : []
  const segments = pickSegments(
    segmentsRaw.filter((x) => String(x?.filePath ?? '').trim().length > 0),
    maxSegments,
  )
  if (!segments.length) return null

  let samples = 0
  const sumScores: Record<TitlePlacement, number> = { top: 0, middle: 0, bottom: 0 }

  for (const seg of segments) {
    if (input.signal?.aborted) return null
    const sampleTimes = pickSampleTimes(seg, samplePerSegment)
    for (const atSec of sampleTimes) {
      if (input.signal?.aborted) return null
      const frame = await extractGrayFrame({
        filePath: seg.filePath,
        atSec,
        width: ANALYZE_WIDTH,
        height: ANALYZE_HEIGHT,
        signal: input.signal,
      })
      if (!frame) continue
      const s = scoreFrame(frame, ANALYZE_WIDTH, ANALYZE_HEIGHT)
      if (!Number.isFinite(s.top) || !Number.isFinite(s.middle) || !Number.isFinite(s.bottom)) continue
      sumScores.top += s.top
      sumScores.middle += s.middle
      sumScores.bottom += s.bottom
      samples++
    }
  }

  if (!samples) return null

  const scores: Record<TitlePlacement, number> = {
    top: roundTo(sumScores.top / samples, 4),
    middle: roundTo(sumScores.middle / samples, 4),
    bottom: roundTo(sumScores.bottom / samples, 4),
  }
  const titlePlacement = chooseTitlePlacement(scores)
  const ttsPlacement: 'top' | 'bottom' = titlePlacement === 'bottom' ? 'top' : 'bottom'

  return {
    titlePlacement,
    ttsPlacement,
    confidence: roundTo(calcConfidence(scores), 3),
    scores,
    sampledFrames: samples,
  }
}
