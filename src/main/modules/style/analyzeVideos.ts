import { spawn } from 'node:child_process'
import { isAbsolute, resolve } from 'node:path'
import { getFfmpegExecutable } from '../../lib/binariesPath'
import { collectVideoFilesFromDropRoots } from '../../lib/collectVideoFiles'
import { probeMedia } from '../ffmpeg/probe'
import type { Template } from '../templates/types'

type VideoMetric = {
  filePath: string
  durationSec: number
  fps: number
  width: number
  height: number
  bitRate: number
  hasAudio: boolean
}

export type StyleAnalyzeSummary = {
  sourceDir: string
  fileCount: number
  sampledForCut: number
  durationAvgSec: number
  durationMedianSec: number
  durationMinSec: number
  durationMaxSec: number
  fpsAvg: number
  mainResolution: string
  vBitrateAvgKbps: number
  audioPresentRate: number
  cutsPer10sAvg: number
  cutTendency: 'steady_single_shot' | 'mixed' | 'fast_cut'
}

export type StyleAnalyzeResult = {
  summary: StyleAnalyzeSummary
  suggestedTemplatePayload: Partial<Template> & Pick<Template, 'name' | 'structure'>
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

function avg(arr: number[]): number {
  if (!arr.length) return 0
  return arr.reduce((s, x) => s + x, 0) / arr.length
}

function median(arr: number[]): number {
  if (!arr.length) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  const i = Math.floor(sorted.length / 2)
  if (sorted.length % 2) return sorted[i]
  return (sorted[i - 1] + sorted[i]) / 2
}

function roundTo(n: number, d = 3): number {
  const m = 10 ** d
  return Math.round(n * m) / m
}

function inferCutTendency(cutsPer10sAvg: number): StyleAnalyzeSummary['cutTendency'] {
  if (cutsPer10sAvg >= 3) return 'fast_cut'
  if (cutsPer10sAvg >= 1.2) return 'mixed'
  return 'steady_single_shot'
}

function inferStructureBySummary(summary: StyleAnalyzeSummary): Array<'hook' | 'show' | 'detail'> {
  const cuts = Number(summary.cutsPer10sAvg ?? 0)
  const med = Number(summary.durationMedianSec ?? 0)
  const tendency = summary.cutTendency

  // 单镜头/弱切镜：优先 1 分镜，避免无意义硬拆。
  if (tendency === 'steady_single_shot' && cuts < 0.9) return ['hook']

  // 中等切镜：默认 2 分镜；如果样片普遍时长更长，再给到 3 分镜。
  if (tendency === 'mixed') {
    if (med >= 14 || cuts >= 2.2) return ['hook', 'show', 'detail']
    return ['hook', 'show']
  }

  // 快切：3 分镜更稳。
  if (tendency === 'fast_cut') return ['hook', 'show', 'detail']

  // 兜底。
  return ['hook', 'show']
}

async function estimateCutsPer10s(filePath: string, durationSec: number): Promise<number | null> {
  if (!Number.isFinite(durationSec) || durationSec <= 0.2) return null
  let ffmpegExe = ''
  try {
    ffmpegExe = getFfmpegExecutable()
  } catch {
    return null
  }

  return await new Promise<number | null>((resolveCut) => {
    const args = [
      '-hide_banner',
      '-loglevel',
      'info',
      '-i',
      filePath,
      '-an',
      '-filter:v',
      "select='gt(scene,0.35)',showinfo",
      '-f',
      'null',
      '-',
    ]
    const child = spawn(ffmpegExe, args, { windowsHide: true })
    let stderr = ''
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8')
    })
    child.on('error', () => resolveCut(null))

    const timer = setTimeout(() => {
      try {
        child.kill()
      } catch {
        // ignore
      }
    }, 12_000)

    child.on('close', () => {
      clearTimeout(timer)
      const cuts = (stderr.match(/pts_time:/g) ?? []).length
      resolveCut(roundTo((cuts * 10) / durationSec, 3))
    })
  })
}

function buildSuggestedPayload(summary: StyleAnalyzeSummary): Partial<Template> & Pick<Template, 'name' | 'structure'> {
  const md = summary.durationMedianSec || 17
  const totalMin = clamp(Math.round(md * 0.8), 10, 22)
  let totalMax = clamp(Math.round(md * 1.22), 14, 30)
  if (totalMax < totalMin + 4) totalMax = totalMin + 4

  const tendency = summary.cutTendency
  const structure = inferStructureBySummary(summary)
  const transitionEnabled = tendency !== 'steady_single_shot'
  const randomizeOrder =
    tendency === 'fast_cut'
      ? ({ mode: 'partial', keepFirstCount: 1 } as const)
      : ({ mode: 'none' } as const)

  const now = new Date()
  const pad = (x: number) => String(x).padStart(2, '0')
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`

  return {
    name: `爆款分析-${stamp}`,
    structure,
    segmentSyncMode: 'fixed',
    totalDurationSec: { min: totalMin, max: totalMax },
    skipStartSec: 1.2,
    randomizeOrder,
    transition: {
      enabled: transitionEnabled,
      pool: transitionEnabled ? ['hardcut', 'fade'] : ['hardcut'],
      durationSec: { min: 0.08, max: 0.14 },
    } as any,
    // 默认固定 BGM 听感：样片分析模板优先关闭原声与 ducking，避免场景切换时音乐被压低
    audio: {
      source: 'mute',
      ducking: { enabled: false, amountDb: 0 },
    } as any,
    segmentDurationSec: {
      hook: { min: 2, max: 4 },
      show: { min: 4, max: 8 },
      detail: { min: 4, max: 8 },
    },
    segmentFx: {
      hook: { zoom: { min: 1.0, max: 1.02 }, move: { x: { min: -0.015, max: 0.015 }, y: { min: -0.012, max: 0.012 } } },
      show: { zoom: { min: 1.0, max: 1.03 }, move: { x: { min: -0.02, max: 0.02 }, y: { min: -0.015, max: 0.015 } } },
      detail: { zoom: { min: 1.0, max: 1.03 }, move: { x: { min: -0.02, max: 0.02 }, y: { min: -0.015, max: 0.015 } } },
    },
    jitter: {
      speed: {
        enabled: true,
        range: tendency === 'fast_cut' ? { min: 0.99, max: 1.01 } : { min: 0.995, max: 1.005 },
      },
      color: {
        enabled: true,
        brightness: { min: -0.006, max: 0.006 },
        contrast: { min: 0.995, max: 1.005 },
        saturation: { min: 0.995, max: 1.015 },
        hueDeg: { min: -0.8, max: 0.8 },
      },
    },
    colorGrade: {
      enabled: false,
      brightness: 0,
      contrast: 1,
      saturation: 1,
    },
    aspectUnifyMode: 'cover_crop',
  } as any
}

export async function analyzeVideoFolderAndSuggestTemplate(input: {
  dir?: string
}): Promise<StyleAnalyzeResult> {
  const dirRaw = String(input?.dir ?? '').trim()
  const dirAbs = dirRaw
    ? (isAbsolute(dirRaw) ? dirRaw : resolve(process.cwd(), dirRaw))
    : resolve(process.cwd(), 'video')

  const files = await collectVideoFilesFromDropRoots([dirAbs])
  if (!files.length) {
    throw new Error(`未在目录中找到可分析视频：${dirAbs}（支持 mp4/mov/mkv/webm/m4v）`)
  }

  const metrics: VideoMetric[] = []
  for (const filePath of files) {
    try {
      const m = await probeMedia(filePath)
      if (!Number.isFinite(m.durationSec) || m.durationSec <= 0.1) continue
      metrics.push({
        filePath,
        durationSec: Number(m.durationSec || 0),
        fps: Number(m.fps || 0),
        width: Number(m.width || 0),
        height: Number(m.height || 0),
        bitRate: Number(m.bitRate || 0),
        hasAudio: Boolean(m.hasAudio),
      })
    } catch {
      // 单文件异常跳过
    }
  }

  if (!metrics.length) {
    throw new Error(`目录中视频无法完成分析：${dirAbs}（请检查文件是否可被 ffprobe 读取）`)
  }

  const durations = metrics.map((x) => x.durationSec).filter((x) => x > 0)
  const fpsList = metrics.map((x) => x.fps).filter((x) => x > 0)
  const bitrates = metrics.map((x) => x.bitRate).filter((x) => x > 0)
  const audioRate = metrics.filter((x) => x.hasAudio).length / metrics.length

  const resCount = new Map<string, number>()
  for (const x of metrics) {
    const key = x.width > 0 && x.height > 0 ? `${x.width}x${x.height}` : 'unknown'
    resCount.set(key, (resCount.get(key) ?? 0) + 1)
  }
  const mainResolution =
    [...resCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'unknown'

  const cutSample = metrics.slice(0, 8)
  const cutsPer10sList: number[] = []
  for (const x of cutSample) {
    const v = await estimateCutsPer10s(x.filePath, x.durationSec)
    if (Number.isFinite(v as number)) cutsPer10sList.push(Number(v))
  }
  const cutsPer10sAvg = roundTo(avg(cutsPer10sList), 3)
  const cutTendency = inferCutTendency(cutsPer10sAvg)

  const summary: StyleAnalyzeSummary = {
    sourceDir: dirAbs,
    fileCount: metrics.length,
    sampledForCut: cutsPer10sList.length,
    durationAvgSec: roundTo(avg(durations), 3),
    durationMedianSec: roundTo(median(durations), 3),
    durationMinSec: roundTo(Math.min(...durations), 3),
    durationMaxSec: roundTo(Math.max(...durations), 3),
    fpsAvg: roundTo(avg(fpsList), 3),
    mainResolution,
    vBitrateAvgKbps: roundTo(avg(bitrates) / 1000, 1),
    audioPresentRate: roundTo(audioRate * 100, 2),
    cutsPer10sAvg,
    cutTendency,
  }

  return {
    summary,
    suggestedTemplatePayload: buildSuggestedPayload(summary),
  }
}
