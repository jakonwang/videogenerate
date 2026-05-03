import { readFile, stat } from 'node:fs/promises'
import { basename } from 'node:path'
import { probeMedia } from '../ffmpeg/probe'
import { generateThumbnailJpg } from './thumbnail'

export type MediaInfo = {
  fileName: string
  fileSize: number
  durationSec: number
  hasAudio: boolean
  width?: number
  height?: number
  fps?: number
  bitRate?: number
  qualityScore?: number
  qualityIssues?: string[]
  thumbnailPath: string | null
  thumbnailDataUrl?: string | null
}

function scoreMedia(input: { durationSec: number; width?: number; height?: number; fps?: number; bitRate?: number }) {
  const issues: string[] = []
  let score = 100

  const dur = Number(input.durationSec ?? 0)
  if (dur <= 0.5) {
    score -= 70
    issues.push('时长异常')
  } else if (dur < 2) {
    score -= 18
    issues.push('时长偏短')
  }

  const w = Number(input.width ?? 0)
  const h = Number(input.height ?? 0)
  if (w > 0 && h > 0) {
    const portrait = h >= w
    if (!portrait) {
      score -= 22
      issues.push('横屏素材')
    }
    const minSide = Math.min(w, h)
    if (minSide < 720) {
      score -= 18
      issues.push('分辨率偏低')
    }
  } else {
    score -= 10
    issues.push('分辨率未知')
  }

  const fps = Number(input.fps ?? 0)
  if (fps > 0) {
    // 非常规帧率更容易带来观感不稳（后续我们会统一输出 CFR，但输入异常仍降权）
    if (fps < 20) {
      score -= 18
      issues.push('帧率偏低')
    } else if (fps > 70) {
      score -= 10
      issues.push('帧率偏高')
    } else if (Math.abs(fps - 30) > 8 && Math.abs(fps - 25) > 8 && Math.abs(fps - 60) > 10) {
      score -= 6
      issues.push('帧率不常见')
    }
  } else {
    score -= 6
    issues.push('帧率未知')
  }

  const br = Number(input.bitRate ?? 0)
  if (br > 0 && dur > 0) {
    // 超低码率通常画面糊/块状（经验阈值）
    if (br < 600_000) {
      score -= 14
      issues.push('码率偏低')
    }
  }

  score = Math.max(0, Math.min(100, Math.round(score)))
  return { qualityScore: score, qualityIssues: issues }
}

export async function getMediaInfo(filePath: string): Promise<MediaInfo> {
  const fileName = basename(filePath)
  let fileSize = 0
  try {
    const s = await stat(filePath)
    fileSize = s.size
  } catch {
    fileSize = 0
  }
  const probe = await probeMedia(filePath)
  const scored = scoreMedia({
    durationSec: probe.durationSec,
    width: probe.width,
    height: probe.height,
    fps: probe.fps,
    bitRate: probe.bitRate,
  })
  const extraIssues: string[] = []
  if (probe.audioUndecodableOnly) {
    extraIssues.push('存在无法解码的音频轨(如iPhone apac)，成片将按无原声处理')
  }
  const thumbnailPath = await generateThumbnailJpg({ filePath, atSec: probe.durationSec >= 1 ? 1 : 0.5 })
  let thumbnailDataUrl: string | null = null
  if (thumbnailPath) {
    try {
      const buf = await readFile(thumbnailPath)
      thumbnailDataUrl = `data:image/jpeg;base64,${buf.toString('base64')}`
    } catch {
      thumbnailDataUrl = null
    }
  }
  return {
    fileName,
    fileSize,
    durationSec: probe.durationSec,
    hasAudio: probe.hasAudio,
    width: probe.width,
    height: probe.height,
    fps: probe.fps,
    bitRate: probe.bitRate,
    qualityScore: scored.qualityScore,
    qualityIssues: [...extraIssues, ...scored.qualityIssues],
    thumbnailPath,
    thumbnailDataUrl,
  }
}

