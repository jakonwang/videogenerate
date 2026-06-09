import { access, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { getFfmpegExecutable, getFfprobeExecutable } from '../../lib/binariesPath'
import type { ShotSpec } from './types'

type FinalComposeClipMode = 'reference_trim' | 'smart_middle_tail' | 'full_generated_clip'

type ClipWindow = {
  sourceDurationSec: number
  clipStartSec: number
  clipDurationSec: number
  mode: FinalComposeClipMode
}

type HighlightSuppressionPreset = 'none' | 'conservative'

type HighlightSuppressionDecision = {
  enabled: boolean
  preset: HighlightSuppressionPreset
  reasons: string[]
}

const FINAL_COMPOSE_CLIP_MODE: FinalComposeClipMode = 'smart_middle_tail'
const JEWELRY_PRODUCT_TYPES = new Set([
  'earrings',
  'jewelry',
  'jewellery',
  'necklace',
  'ring',
  'bracelet',
  'pendant',
])
const HIGHLIGHT_RISK_PATTERNS = [
  /耳环|珠宝|首饰|金属|钻石|锆石|水晶|镜面|高光|反光|闪耀/iu,
  /\b(?:sparkle|glow|glossy|specular|highlight|crystal|diamond|zircon|jewelry|jewellery|metal)\b/iu,
]

async function run(args: string[]) {
  const ffmpeg = getFfmpegExecutable()
  await new Promise<void>((resolve, reject) => {
    const c = spawn(ffmpeg, args, { windowsHide: true })
    c.on('error', reject)
    c.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg failed: ${code}`))))
  })
}

async function probeDurationSec(src: string) {
  const ffprobe = getFfprobeExecutable()
  return await new Promise<number>((resolve, reject) => {
    const args = ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', src]
    let stdout = ''
    let stderr = ''
    const c = spawn(ffprobe, args, { windowsHide: true })
    c.stdout.on('data', (chunk) => {
      stdout += String(chunk)
    })
    c.stderr.on('data', (chunk) => {
      stderr += String(chunk)
    })
    c.on('error', reject)
    c.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`ffprobe failed: ${code} ${stderr}`.trim()))
        return
      }
      const dur = Number(String(stdout).trim())
      if (!Number.isFinite(dur) || dur <= 0) {
        reject(new Error(`invalid source duration: ${stdout}`.trim()))
        return
      }
      resolve(dur)
    })
  })
}

async function fileExists(path: string) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function probeHasAudioStream(src: string) {
  const ffprobe = getFfprobeExecutable()
  return await new Promise<boolean>((resolve, reject) => {
    const args = [
      '-v',
      'error',
      '-select_streams',
      'a:0',
      '-show_entries',
      'stream=codec_type',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      src,
    ]
    let stdout = ''
    let stderr = ''
    const c = spawn(ffprobe, args, { windowsHide: true })
    c.stdout.on('data', (chunk) => {
      stdout += String(chunk)
    })
    c.stderr.on('data', (chunk) => {
      stderr += String(chunk)
    })
    c.on('error', reject)
    c.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`ffprobe audio probe failed: ${code} ${stderr}`.trim()))
        return
      }
      resolve(/\baudio\b/i.test(stdout))
    })
  })
}

function round3(value: number) {
  return Math.round(value * 1000) / 1000
}

function safeText(value: unknown) {
  return String(value || '').trim()
}

function shouldSuppressHighlights(shot: ShotSpec): HighlightSuppressionDecision {
  const reasons: string[] = []
  const productType = safeText(shot.productType).toLowerCase()
  if (productType && JEWELRY_PRODUCT_TYPES.has(productType)) {
    reasons.push(`productType:${productType}`)
  }
  const fields = [
    ['materialNeed', shot.materialNeed],
    ['productFocus', shot.productFocus],
    ['visualDescription', shot.visualDescription],
    ['generationPrompt', shot.generationPrompt],
  ] as const
  for (const [label, value] of fields) {
    const text = safeText(value)
    if (!text) continue
    if (HIGHLIGHT_RISK_PATTERNS.some((pattern) => pattern.test(text))) {
      reasons.push(`field:${label}`)
    }
  }
  return {
    enabled: reasons.length > 0,
    preset: reasons.length > 0 ? 'conservative' : 'none',
    reasons,
  }
}

function buildNormalizeVideoFilter(preset: HighlightSuppressionPreset) {
  const base = 'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black,fps=30'
  if (preset !== 'conservative') return base
  return `${base},curves=master='0/0 0.62/0.58 0.78/0.72 0.88/0.8 1/0.9',eq=contrast=0.97:saturation=0.93:brightness=-0.01`
}

function pickClipWindow(input: {
  mode: FinalComposeClipMode
  sourceDurationSec: number
  targetDurationSec: number
}) {
  const sourceDurationSec = Math.max(0.5, Number(input.sourceDurationSec || 0.5))
  const targetDurationSec = Math.max(0.5, Number(input.targetDurationSec || 0.5))
  const clampedTarget = Math.min(targetDurationSec, sourceDurationSec)
  const remaining = Math.max(0, sourceDurationSec - clampedTarget)
  if (input.mode === 'full_generated_clip' || remaining <= 0.2) {
    return {
      sourceDurationSec: round3(sourceDurationSec),
      clipStartSec: 0,
      clipDurationSec: round3(sourceDurationSec),
      mode: input.mode,
    } satisfies ClipWindow
  }
  if (input.mode === 'reference_trim') {
    return {
      sourceDurationSec: round3(sourceDurationSec),
      clipStartSec: 0,
      clipDurationSec: round3(clampedTarget),
      mode: input.mode,
    } satisfies ClipWindow
  }
  const shortTarget = clampedTarget <= 1.2
  const anchor = shortTarget ? 0.72 : clampedTarget <= 2.5 ? 0.64 : 0.58
  const leadingPad = shortTarget ? Math.min(0.18, clampedTarget * 0.15) : Math.min(0.35, clampedTarget * 0.18)
  const clipStartSec = Math.max(0, Math.min(remaining, sourceDurationSec * anchor - leadingPad))
  return {
    sourceDurationSec: round3(sourceDurationSec),
    clipStartSec: round3(clipStartSec),
    clipDurationSec: round3(clampedTarget),
    mode: input.mode,
  } satisfies ClipWindow
}

async function normalizeClip(input: {
  src: string
  durationSec: number
  out: string
  clipStartSec?: number
  highlightSuppressionPreset?: HighlightSuppressionPreset
}) {
  await run([
    '-y',
    '-ss',
    `${Math.max(0, Number(input.clipStartSec || 0))}`,
    '-i', input.src,
    '-t', `${Math.max(0.5, input.durationSec)}`,
    '-vf', buildNormalizeVideoFilter(input.highlightSuppressionPreset || 'none'),
    '-an',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-shortest',
    input.out,
  ])
}

export async function renderViralCloneBatch(input: {
  projectId: string
  shots: ShotSpec[]
  outDir: string
  count: number
  bgmPath?: string
  maxRetry?: number
}) {
  await mkdir(input.outDir, { recursive: true })
  const requestedBgmPath = safeText(input.bgmPath)
  let usableBgmPath = ''
  if (requestedBgmPath) {
    const exists = await fileExists(requestedBgmPath)
    if (exists) {
      try {
        if (await probeHasAudioStream(requestedBgmPath)) usableBgmPath = requestedBgmPath
      } catch (error) {
        console.warn('[clone-compose] bgm-audio-probe-failed, fallback-to-silent-compose', {
          projectId: input.projectId,
          bgmPath: requestedBgmPath,
          reason: String((error as any)?.message ?? error),
        })
      }
    } else {
      console.warn('[clone-compose] bgm-path-missing, fallback-to-silent-compose', {
        projectId: input.projectId,
        bgmPath: requestedBgmPath,
      })
    }
  }
  const results: string[] = []
  const report: Array<{
    index: number
    output: string
    success: boolean
    error?: string
    shotSources: Array<{
      shotId: string
      source: string
      sourceDurationSec?: number
      clipStartSec?: number
      clipDurationSec?: number
      clipMode?: FinalComposeClipMode
      highlightSuppressionEnabled?: boolean
      highlightSuppressionPreset?: HighlightSuppressionPreset
      highlightSuppressionReasons?: string[]
    }>
  }> = []
  const retries = Math.max(0, Number(input.maxRetry ?? 1))
  for (let i = 0; i < Math.max(1, input.count); i++) {
    const index = i + 1
    let done = false
    let lastErr = ''
    for (let attempt = 0; attempt <= retries && !done; attempt++) {
      try {
        const jobDir = join(input.outDir, `job_${String(index).padStart(3, '0')}_try_${attempt + 1}`)
        await mkdir(jobDir, { recursive: true })
        const normalized: string[] = []
        const shotSourceReport: Array<{
          shotId: string
          source: string
          sourceDurationSec?: number
          clipStartSec?: number
          clipDurationSec?: number
          clipMode?: FinalComposeClipMode
          highlightSuppressionEnabled?: boolean
          highlightSuppressionPreset?: HighlightSuppressionPreset
          highlightSuppressionReasons?: string[]
        }> = []
        for (const shot of input.shots) {
          if (shot.isMock || shot.generatedSource === 'mock' || shot.generatedSource === 'local') {
            throw new Error(`shot ${shot.index + 1} is mock/local and cannot be rendered`)
          }
          const src = shot.uploadedAssetPath || shot.generatedClipPath
          if (!src) continue
          const out = join(jobDir, `${shot.id}.mp4`)
          const highlightSuppression = shouldSuppressHighlights(shot)
          const sourceDurationSec = await probeDurationSec(src)
          const clipWindow = pickClipWindow({
            mode: FINAL_COMPOSE_CLIP_MODE,
            sourceDurationSec,
            targetDurationSec: Number(shot.durationSec || 1.5),
          })
          await normalizeClip({
            src,
            durationSec: clipWindow.clipDurationSec,
            clipStartSec: clipWindow.clipStartSec,
            out,
            highlightSuppressionPreset: highlightSuppression.preset,
          })
          normalized.push(out)
          shotSourceReport.push({
            shotId: shot.id,
            source: shot.generatedClipPath ? 'ai' : shot.uploadedAssetPath ? 'upload' : 'none',
            sourceDurationSec: clipWindow.sourceDurationSec,
            clipStartSec: clipWindow.clipStartSec,
            clipDurationSec: clipWindow.clipDurationSec,
            clipMode: clipWindow.mode,
            highlightSuppressionEnabled: highlightSuppression.enabled,
            highlightSuppressionPreset: highlightSuppression.preset,
            highlightSuppressionReasons: highlightSuppression.reasons,
          })
        }
        const listFile = join(jobDir, 'concat.txt')
        await writeFile(listFile, normalized.map((x) => `file '${x.replace(/'/g, "'\\''")}'`).join('\n'), 'utf8')
        const rawOut = join(jobDir, 'joined.mp4')
        await run(['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', rawOut])
        const finalOut = join(input.outDir, `viral_clone_${String(index).padStart(3, '0')}.mp4`)
        if (usableBgmPath) {
          await run([
            '-y',
            '-stream_loop',
            '-1',
            '-i',
            usableBgmPath,
            '-i',
            rawOut,
            '-map',
            '1:v:0',
            '-map',
            '0:a:0',
            '-shortest',
            '-c:v',
            'copy',
            '-c:a',
            'aac',
            '-b:a',
            '192k',
            finalOut,
          ])
        } else {
          await run(['-y', '-i', rawOut, '-c', 'copy', finalOut])
        }
        results.push(finalOut)
        report.push({
          index,
          output: finalOut,
          success: true,
          shotSources: shotSourceReport,
        })
        done = true
      } catch (e: any) {
        lastErr = String(e?.message ?? e)
      }
    }
    if (!done) {
      report.push({
        index,
        output: '',
        success: false,
        error: lastErr || 'render_failed',
        shotSources: input.shots.map((s) => ({
          shotId: s.id,
          source: s.generatedClipPath ? 'ai' : s.uploadedAssetPath ? 'upload' : 'none',
          clipMode: FINAL_COMPOSE_CLIP_MODE,
          highlightSuppressionEnabled: shouldSuppressHighlights(s).enabled,
          highlightSuppressionPreset: shouldSuppressHighlights(s).preset,
          highlightSuppressionReasons: shouldSuppressHighlights(s).reasons,
        })),
      })
    }
  }
  const reportPath = join(input.outDir, 'batch-report.json')
  await writeFile(
    reportPath,
    JSON.stringify(
      {
        projectId: input.projectId,
        createdAt: Date.now(),
        total: Math.max(1, input.count),
        success: report.filter((x) => x.success).length,
        failed: report.filter((x) => !x.success).length,
        items: report,
      },
      null,
      2,
    ),
    'utf8',
  )
  return { outputs: results, reportPath }
}
