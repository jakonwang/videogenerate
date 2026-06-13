import { access, mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
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

type ClipAnchorProfile = {
  anchor: number
  leadingPadRatio: number
  maxLeadingPadSec: number
  clipDurationScale: number
}

type HighlightSuppressionPreset = 'none' | 'conservative'

type HighlightSuppressionDecision = {
  enabled: boolean
  preset: HighlightSuppressionPreset
  reasons: string[]
}

type RhythmTransitionPlan = {
  transition: 'hardcut' | 'fade'
  durationSec: number
}

type RhythmStage = 'hook' | 'body' | 'close'

type ViralRhythmProfile = {
  stage: RhythmStage
  punchBoost: number
  holdBoost: number
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

function normalizeShotRole(shot: ShotSpec) {
  const role = String(shot.scriptRole || shot.shotRole || shot.role || shot.purpose || '').trim().toLowerCase()
  if (!role) return 'unknown'
  if (role === 'pain_point') return 'problem'
  if (role === 'social_proof') return 'proof'
  if (role === 'offer') return 'cta'
  return role
}

function getClipAnchorProfile(shot: ShotSpec, clipDurationSec: number): ClipAnchorProfile {
  const role = normalizeShotRole(shot)
  const motion = String(shot.motion || shot.cameraMovement || '').trim().toLowerCase()
  const shortClip = clipDurationSec <= 1.2
  const mediumClip = clipDurationSec <= 2.5

  if (role === 'hook') {
    return {
      anchor: shortClip ? 0.3 : mediumClip ? 0.34 : 0.38,
      leadingPadRatio: 0.08,
      maxLeadingPadSec: 0.16,
      clipDurationScale: shortClip ? 1 : 0.92,
    }
  }
  if (role === 'proof' || role === 'detail') {
    return {
      anchor: shortClip ? 0.56 : mediumClip ? 0.6 : 0.62,
      leadingPadRatio: 0.14,
      maxLeadingPadSec: 0.24,
      clipDurationScale: 1.04,
    }
  }
  if (role === 'cta') {
    return {
      anchor: shortClip ? 0.74 : mediumClip ? 0.78 : 0.82,
      leadingPadRatio: 0.1,
      maxLeadingPadSec: 0.18,
      clipDurationScale: shortClip ? 0.94 : 0.9,
    }
  }
  if (motion === 'fast_cut') {
    return {
      anchor: shortClip ? 0.5 : mediumClip ? 0.54 : 0.58,
      leadingPadRatio: 0.08,
      maxLeadingPadSec: 0.14,
      clipDurationScale: shortClip ? 0.86 : 0.9,
    }
  }
  if (motion === 'static') {
    return {
      anchor: shortClip ? 0.62 : mediumClip ? 0.66 : 0.7,
      leadingPadRatio: 0.18,
      maxLeadingPadSec: 0.3,
      clipDurationScale: 1.05,
    }
  }

  return {
    anchor: shortClip ? 0.72 : mediumClip ? 0.64 : 0.58,
    leadingPadRatio: shortClip ? 0.15 : 0.18,
    maxLeadingPadSec: shortClip ? 0.18 : 0.35,
    clipDurationScale: 1,
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function getSequencePhase(index: number, total: number) {
  if (total <= 1) return 0.5
  return clamp(index / Math.max(1, total - 1), 0, 1)
}

function getViralRhythmProfile(input: { shot: ShotSpec; shotIndex: number; totalShots: number }): ViralRhythmProfile {
  const phase = getSequencePhase(input.shotIndex, input.totalShots)
  const role = normalizeShotRole(input.shot)
  if (role === 'hook' || phase <= 0.22) {
    return { stage: 'hook', punchBoost: 1.16, holdBoost: 0.9 }
  }
  if (role === 'cta' || phase >= 0.78) {
    return { stage: 'close', punchBoost: 1.04, holdBoost: 0.86 }
  }
  return { stage: 'body', punchBoost: 1, holdBoost: role === 'proof' || role === 'detail' ? 1.12 : 1.04 }
}

function getRhythmBias(input: { shot: ShotSpec; shotIndex: number; totalShots: number }) {
  const phase = getSequencePhase(input.shotIndex, input.totalShots)
  const role = normalizeShotRole(input.shot)
  const motion = String(input.shot.motion || input.shot.cameraMovement || '').trim().toLowerCase()
  const viralProfile = getViralRhythmProfile(input)

  let anchorOffset = 0
  let durationScale = 1

  if (phase <= 0.2) {
    anchorOffset -= 0.1
    durationScale *= motion === 'fast_cut' ? 0.84 : 0.92
  } else if (phase >= 0.8) {
    anchorOffset += 0.08
    durationScale *= role === 'cta' ? 0.88 : 0.94
  } else {
    durationScale *= role === 'proof' || role === 'detail' ? 1.08 : 1
  }

  if (motion === 'fast_cut') {
    durationScale *= 0.9
  } else if (motion === 'static') {
    durationScale *= 1.06
  }

  if (role === 'hook') {
    anchorOffset -= 0.08
    durationScale *= 0.92
  } else if (role === 'cta') {
    anchorOffset += 0.06
    durationScale *= 0.92
  } else if (role === 'proof' || role === 'detail') {
    durationScale *= 1.06
  }

  if (viralProfile.stage === 'hook') {
    anchorOffset -= 0.06 * viralProfile.punchBoost
    durationScale *= 0.82 * viralProfile.holdBoost
  } else if (viralProfile.stage === 'body') {
    durationScale *= viralProfile.holdBoost
  } else {
    anchorOffset += 0.03 * viralProfile.punchBoost
    durationScale *= 0.88 * viralProfile.holdBoost
  }

  return {
    anchorOffset,
    durationScale,
  }
}

function getTransitionPlan(input: { shot: ShotSpec; nextShot?: ShotSpec; shotIndex: number; totalShots: number }): RhythmTransitionPlan {
  const role = normalizeShotRole(input.shot)
  const nextRole = input.nextShot ? normalizeShotRole(input.nextShot) : ''
  const motion = String(input.shot.motion || input.shot.cameraMovement || '').trim().toLowerCase()
  const phase = getSequencePhase(input.shotIndex, input.totalShots)
  const viralProfile = getViralRhythmProfile(input)

  if (!input.nextShot) return { transition: 'hardcut', durationSec: 0 }
  if (motion === 'fast_cut' || role === 'hook' || nextRole === 'hook' || viralProfile.stage === 'hook') {
    return { transition: 'hardcut', durationSec: 0 }
  }
  if (role === 'proof' || role === 'detail' || role === 'cta' || phase >= 0.55) {
    return { transition: 'fade', durationSec: viralProfile.stage === 'close' ? 0.22 : 0.14 }
  }
  return { transition: 'hardcut', durationSec: 0 }
}

function pickClipWindow(input: {
  mode: FinalComposeClipMode
  sourceDurationSec: number
  targetDurationSec: number
  shot: ShotSpec
  shotIndex: number
  totalShots: number
}) {
  const sourceDurationSec = Math.max(0.5, Number(input.sourceDurationSec || 0.5))
  const targetDurationSec = Math.max(0.5, Number(input.targetDurationSec || 0.5))
  const sequenceBias = getRhythmBias({
    shot: input.shot,
    shotIndex: input.shotIndex,
    totalShots: input.totalShots,
  })
  const baseTarget = Math.max(0.5, targetDurationSec * getClipAnchorProfile(input.shot, targetDurationSec).clipDurationScale * sequenceBias.durationScale)
  const clampedTarget = Math.min(baseTarget, sourceDurationSec)
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
  const profile = getClipAnchorProfile(input.shot, clampedTarget)
  const anchor = clamp(profile.anchor + sequenceBias.anchorOffset, 0.12, 0.9)
  const leadingPad = Math.min(profile.maxLeadingPadSec, clampedTarget * profile.leadingPadRatio)
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

async function concatWithRhythmTransitions(input: {
  clips: string[]
  transitions: RhythmTransitionPlan[]
  out: string
}) {
  if (input.clips.length === 0) throw new Error('no clips to compose')
  if (input.clips.length === 1 || !input.transitions.some((item) => item.transition === 'fade' && item.durationSec > 0)) {
    const listFile = join(dirname(input.out), 'concat.txt')
    await writeFile(listFile, input.clips.map((x) => `file '${x.replace(/'/g, "'\\''")}'`).join('\n'), 'utf8')
    await run(['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', input.out])
    return
  }

  const durations = await Promise.all(input.clips.map((clip) => probeDurationSec(clip)))
  const ffmpeg = getFfmpegExecutable()
  const args: string[] = ['-y']
  for (const clip of input.clips) {
    args.push('-i', clip)
  }

  const filterParts: string[] = []
  for (let i = 0; i < input.clips.length; i++) {
    filterParts.push(`[${i}:v]fps=30,settb=AVTB,setpts=PTS-STARTPTS,format=yuv420p[v${i}]`)
  }

  let currentLabel = 'v0'
  let currentDuration = durations[0] || 0
  for (let i = 1; i < input.clips.length; i++) {
    const plan = input.transitions[i - 1] || { transition: 'hardcut', durationSec: 0 }
    const nextLabel = `v${i}`
    if (plan.transition === 'fade' && plan.durationSec > 0) {
      const fadeDuration = Math.min(plan.durationSec, Math.max(0.08, currentDuration - 0.08), Math.max(0.08, (durations[i] || 0) - 0.08))
      const offset = Math.max(0, currentDuration - fadeDuration)
      const outputLabel = `vx${i}`
      filterParts.push(`[${currentLabel}][${nextLabel}]xfade=transition=fade:duration=${round3(fadeDuration)}:offset=${round3(offset)}[${outputLabel}]`)
      currentLabel = outputLabel
      currentDuration = currentDuration + (durations[i] || 0) - fadeDuration
    } else {
      const outputLabel = `vc${i}`
      filterParts.push(`[${currentLabel}][${nextLabel}]concat=n=2:v=1:a=0[${outputLabel}]`)
      currentLabel = outputLabel
      currentDuration = currentDuration + (durations[i] || 0)
    }
  }

  args.push(
    '-filter_complex',
    filterParts.join(';'),
    '-map',
    `[${currentLabel}]`,
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    input.out,
  )

  await new Promise<void>((resolve, reject) => {
    const child = spawn(ffmpeg, args, { windowsHide: true })
    let stderr = ''
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk)
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(`ffmpeg transition compose failed: ${code} ${stderr}`.trim()))
    })
  })
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
      sourcePath: string
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
        const transitions: RhythmTransitionPlan[] = []
        const shotSourceReport: Array<{
          shotId: string
          sourcePath: string
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
            shot,
            shotIndex: normalized.length,
            totalShots: input.shots.length,
          })
          await normalizeClip({
            src,
            durationSec: clipWindow.clipDurationSec,
            clipStartSec: clipWindow.clipStartSec,
            out,
            highlightSuppressionPreset: highlightSuppression.preset,
          })
          normalized.push(out)
          transitions.push(
            getTransitionPlan({
              shot,
              nextShot: input.shots[normalized.length],
              shotIndex: normalized.length - 1,
              totalShots: input.shots.length,
            }),
          )
          shotSourceReport.push({
            shotId: shot.id,
            sourcePath: src,
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
        const rawOut = join(jobDir, 'joined.mp4')
        await concatWithRhythmTransitions({
          clips: normalized,
          transitions: transitions.slice(0, Math.max(0, normalized.length - 1)),
          out: rawOut,
        })
        const finalOut = join(
          input.outDir,
          `viral_clone_${String(index).padStart(3, '0')}_${Date.now()}_try_${attempt + 1}.mp4`,
        )
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
          sourcePath: String(s.uploadedAssetPath || s.generatedClipPath || '').trim(),
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
