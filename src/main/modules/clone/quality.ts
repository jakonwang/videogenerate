import { stat } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { getFfmpegExecutable } from '../../lib/binariesPath'
import { probeMedia } from '../ffmpeg/probe'
import type { ProductionQualityCheckResult, ShotSpec } from './types'

function round2(n: number) {
  return Math.round(n * 100) / 100
}

export async function detectFreezeRatio(filePath: string, durationSec: number) {
  if (durationSec <= 0) return 0
  const ffmpeg = getFfmpegExecutable()
  return await new Promise<number>((resolve) => {
    const args = ['-hide_banner', '-i', filePath, '-vf', 'freezedetect=n=-55dB:d=0.8', '-an', '-f', 'null', '-']
    const child = spawn(ffmpeg, args, { windowsHide: true })
    let stderr = ''
    child.stderr.on('data', (c: Buffer) => (stderr += c.toString('utf8')))
    child.on('error', () => resolve(0))
    child.on('close', () => {
      const freezes = [...stderr.matchAll(/freeze_duration:\s*([0-9.]+)/g)].map((m) => Number(m[1] || 0))
      const totalFreeze = freezes.reduce((sum, value) => sum + value, 0)
      resolve(round2(totalFreeze / durationSec))
    })
  })
}

export async function detectBlackFrameRatio(filePath: string) {
  const ffmpeg = getFfmpegExecutable()
  return await new Promise<number>((resolve) => {
    const args = ['-hide_banner', '-i', filePath, '-vf', 'blackdetect=d=0.1:pix_th=0.10', '-an', '-f', 'null', '-']
    const child = spawn(ffmpeg, args, { windowsHide: true })
    let stderr = ''
    child.stderr.on('data', (c: Buffer) => (stderr += c.toString('utf8')))
    child.on('error', () => resolve(0))
    child.on('close', async () => {
      try {
        const meta = await probeMedia(filePath)
        const durationSec = Number(meta.durationSec || 0)
        if (durationSec <= 0) return resolve(0)
        const parts = [...stderr.matchAll(/black_duration:([0-9.]+)/g)].map((m) => Number(m[1] || 0))
        const total = parts.reduce((sum, value) => sum + value, 0)
        resolve(round2(total / durationSec))
      } catch {
        resolve(0)
      }
    })
  })
}

export function detectAspectSafety(width: number, height: number) {
  if (!width || !height) return { ok: false, aspectRatio: 0 }
  const aspectRatio = width / height
  const vertical = 9 / 16
  const landscape = 16 / 9
  const closeToVertical = Math.abs(aspectRatio - vertical) < 0.2
  const safeCropLandscape = Math.abs(aspectRatio - landscape) < 0.2
  return { ok: closeToVertical || safeCropLandscape, aspectRatio }
}

export function detectMockClip(shot: ShotSpec, filePath: string) {
  return Boolean(
    shot.isMock ||
      shot.generatedSource === 'mock' ||
      shot.generatedProvider === 'mock' ||
      /mock|placeholder|image2video/i.test(filePath),
  )
}

export function detectWatermarkRisk(shot: ShotSpec, filePath: string) {
  const sources = [filePath, shot.generatedProvider, shot.generatedModel, shot.error].map((v) => String(v || '').toLowerCase())
  return sources.some((value) => value.includes('watermark') || value.includes('douyin') || value.includes('tiktok'))
}

export function scoreProductVisibility(shot: ShotSpec) {
  if (shot.productVisibility === 'high') return 88
  if (shot.productVisibility === 'medium') return 72
  if (shot.productVisibility === 'low') return 48
  return 24
}

export function shouldRetryByQualityMode(shot: ShotSpec, score: number, status: ProductionQualityCheckResult['qualityStatus']) {
  const mode = shot.qualityMode || 'high'
  if (status === 'failed') return mode !== 'fast'
  if (mode === 'high') return score < 80
  if (mode === 'standard') return score < 70
  return false
}

export async function productionQualityCheckShot(input: {
  shot: ShotSpec
  filePath: string
  targetDurationSec?: number
}) {
  const reasons: string[] = []
  const info = await probeMedia(input.filePath)
  const targetDurationSec = Number(input.targetDurationSec ?? input.shot.durationSec ?? 0)
  const durationSec = Number(info.durationSec || 0)
  const width = Number(info.width || 0)
  const height = Number(info.height || 0)
  const bitRate = Number(info.bitRate || 0)
  const freezeRatio = await detectFreezeRatio(input.filePath, durationSec)
  const blackFrameRatio = await detectBlackFrameRatio(input.filePath)
  const aspect = detectAspectSafety(width, height)
  const isMock = detectMockClip(input.shot, input.filePath)
  const hasWatermarkRisk = detectWatermarkRisk(input.shot, input.filePath)
  const visibilityScore = scoreProductVisibility(input.shot)

  let score = 100
  try {
    await stat(input.filePath)
  } catch {
    return {
      qualityStatus: 'failed',
      qualityScore: 0,
      qualityReasons: ['文件不存在'],
      retrySuggestion: '重新生成或替换真实素材',
      generatedClipDurationSec: durationSec,
      generatedClipWidth: width,
      generatedClipHeight: height,
      freezeRatio,
      blackFrameRatio,
      productVisibilityScore: visibilityScore,
      isMock: true,
      canEnterRender: false,
    } satisfies ProductionQualityCheckResult
  }

  if (targetDurationSec > 0) {
    const min = targetDurationSec * 0.7
    const max = targetDurationSec * 1.3
    if (durationSec < min || durationSec > max) {
      reasons.push(`时长偏离目标 ${targetDurationSec.toFixed(1)}s`)
      score -= 15
    }
  }
  if (!aspect.ok) {
    reasons.push(`分辨率比例异常 ${width}x${height}`)
    score -= 20
  }
  if (Math.min(width, height) < 720) {
    reasons.push('分辨率低于 720 短边')
    score -= 18
  }
  if (width < 1080 || height < 1280) {
    reasons.push('未达到推荐 1080x1920 或等效竖屏规格')
    score -= 8
  }
  if (blackFrameRatio > 0.2) {
    reasons.push('黑屏比例偏高')
    score -= 16
  }
  if (freezeRatio > 0.35) {
    reasons.push('冻结帧比例偏高')
    score -= 20
  }
  if (bitRate > 0 && bitRate < 350000) {
    reasons.push('码率偏低，疑似静态假视频')
    score -= 18
  }
  if (hasWatermarkRisk) {
    reasons.push('存在水印或平台 UI 风险')
    score -= 20
  }
  if (visibilityScore < 60) {
    reasons.push('产品可见度不足')
    score -= 14
  }
  if (isMock) {
    reasons.push('检测到 mock 或本地假片')
    score = 0
  }

  score = Math.max(0, Math.min(100, Math.round(score)))
  let qualityStatus: ProductionQualityCheckResult['qualityStatus'] = 'passed'
  if (isMock || reasons.some((reason) => reason.includes('文件不存在'))) qualityStatus = 'failed'
  else if (score < 70 || freezeRatio > 0.5 || blackFrameRatio > 0.35) qualityStatus = 'failed'
  else if (score < 85 || reasons.length) qualityStatus = 'warning'

  return {
    qualityStatus,
    qualityScore: score,
    qualityReasons: reasons,
    retrySuggestion:
      qualityStatus === 'failed'
        ? '建议优先替换真实视频素材，或降低镜头复杂度后重新生成'
        : qualityStatus === 'warning'
          ? '可进入出片，但建议先优化素材清晰度和产品可见度'
          : '质量通过',
    generatedClipDurationSec: round2(durationSec),
    generatedClipWidth: width,
    generatedClipHeight: height,
    freezeRatio,
    blackFrameRatio,
    productVisibilityScore: visibilityScore,
    isMock,
    canEnterRender: qualityStatus !== 'failed' && !isMock,
  } satisfies ProductionQualityCheckResult
}
