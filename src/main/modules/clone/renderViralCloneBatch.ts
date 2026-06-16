import { access, mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { spawn } from 'node:child_process'
import { getFfmpegExecutable, getFfprobeExecutable } from '../../lib/binariesPath'
import type { ShotSpec } from './types'

type FinalComposeClipMode = 'reference_trim' | 'smart_middle_tail' | 'full_generated_clip'
type FinalComposeDurationPolicy = 'script_first_micro_adjust'

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

type ComposeEmphasisScore = {
  hookPriority: number
  holdPriority: number
  productPriority: number
  clarityPriority: number
  setupPenalty: number
}

type ComposeAdjacencySignal = {
  repeatedProductFocus: boolean
  repeatedStaticFeel: boolean
  repeatedCloseupFeel: boolean
  repeatedRoleCluster: boolean
  needsPatternBreak: boolean
  followsStrongHook: boolean
  payoffHandoffCandidate: boolean
  preCloseConfirmationCandidate: boolean
  closesIntoCta: boolean
  shouldTightenSlightly: boolean
}

type ComposeReadabilitySignal = {
  estimatedUnits: number
  needsHoldProtection: boolean
  durationBoost: number
}

type ComposeIntensitySignal = {
  intensityScore: number
  isAggressive: boolean
  shouldIntroduceRelief: boolean
  shouldSoftenAfterPreviousAggressive: boolean
}

type ComposeCtaPressureSignal = {
  pressureScore: number
  isStrongCta: boolean
  shouldSnapClose: boolean
}

type ComposeDiagnosticSnapshot = {
  role: string
  stage: RhythmStage
  emphasis: ComposeEmphasisScore
  adjacency: ComposeAdjacencySignal
  readability: ComposeReadabilitySignal
  intensity: ComposeIntensitySignal
  ctaPressure: ComposeCtaPressureSignal
}

type ComposeBatchSummary = {
  totalShots: number
  stageCounts: Record<RhythmStage, number>
  aggressiveShotCount: number
  readabilityProtectedCount: number
  productPriorityCount: number
  adjacencyTightenedCount: number
  averageClipDurationSec: number
  strongHookCount: number
  payoffHandoffCount: number
  closeConfirmationCount: number
  strongCtaCount: number
  snapCloseCount: number
  rhythmScore: number
  optimizationLanes: Array<'hook' | 'payoff' | 'body' | 'close'>
  nextActions: string[]
  optimizationBrief: {
    focusArea: 'hook' | 'payoff' | 'body' | 'close' | 'maintain'
    urgency: 'low' | 'medium' | 'high'
    primaryGoal: string
    actionItems: string[]
    upstreamPromptHints: string[]
  }
  bodyUpgradePlan?: {
    proofUpgrade: boolean
    showUpgrade: boolean
    preferredMoves: string[]
  }
  upstreamOptimizationPatch: {
    tightenOpening: boolean
    addImmediatePayoff: boolean
    increaseMidVariation: boolean
    strengthenCtaUrgency: boolean
    preferSnapClose: boolean
  }
  health: {
    verdict: 'balanced' | 'needs_tuning'
    flags: string[]
    recommendations: string[]
    topPriority: string
  }
}

type ComposeShotOptimizationTarget = {
  shotId: string
  stage: RhythmStage
  role: string
  lane: 'hook' | 'payoff' | 'body' | 'close' | 'maintain'
  promptDirectives: string[]
}

const FINAL_COMPOSE_CLIP_MODE: FinalComposeClipMode = 'smart_middle_tail'
const FINAL_COMPOSE_DURATION_POLICY: FinalComposeDurationPolicy = 'script_first_micro_adjust'
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

function buildComposeUpstreamOptimizationPatch(input: {
  optimizationLanes: Array<'hook' | 'payoff' | 'body' | 'close'>
  flags: string[]
  snapCloseCount: number
}) {
  return {
    tightenOpening: input.optimizationLanes.includes('hook'),
    addImmediatePayoff: input.optimizationLanes.includes('payoff'),
    increaseMidVariation: input.optimizationLanes.includes('body'),
    strengthenCtaUrgency: input.optimizationLanes.includes('close'),
    preferSnapClose: input.flags.includes('cta_snap_missing') || input.snapCloseCount > 0,
  }
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
      clipDurationScale: 1,
    }
  }
  if (role === 'proof' || role === 'detail') {
    return {
      anchor: shortClip ? 0.56 : mediumClip ? 0.6 : 0.62,
      leadingPadRatio: 0.14,
      maxLeadingPadSec: 0.24,
      clipDurationScale: 1,
    }
  }
  if (role === 'cta') {
    return {
      anchor: shortClip ? 0.74 : mediumClip ? 0.78 : 0.82,
      leadingPadRatio: 0.1,
      maxLeadingPadSec: 0.18,
      clipDurationScale: 1,
    }
  }
  if (motion === 'fast_cut') {
    return {
      anchor: shortClip ? 0.5 : mediumClip ? 0.54 : 0.58,
      leadingPadRatio: 0.08,
      maxLeadingPadSec: 0.14,
      clipDurationScale: 1,
    }
  }
  if (motion === 'static') {
    return {
      anchor: shortClip ? 0.62 : mediumClip ? 0.66 : 0.7,
      leadingPadRatio: 0.18,
      maxLeadingPadSec: 0.3,
      clipDurationScale: 1,
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

function isProductPriorityRole(role: string) {
  return role === 'product_show' || role === 'detail' || role === 'proof'
}

function resolveComposeEmphasisScore(shot: ShotSpec): ComposeEmphasisScore {
  const role = normalizeShotRole(shot)
  const shotType = safeText(shot.shotType).toLowerCase()
  const framing = safeText(shot.framing).toLowerCase()
  const productVisibility = safeText(shot.productVisibility).toLowerCase()
  const referenceMode = safeText(shot.storyboardReferenceMode).toLowerCase()
  const productFocus = safeText(shot.productFocus).toLowerCase()
  const visualDescription = safeText(shot.visualDescription).toLowerCase()
  const actionDescription = safeText(shot.actionDescription).toLowerCase()
  const onScreenText = safeText(shot.onScreenText).toLowerCase()
  const narrationText = safeText(shot.narrationText).toLowerCase()
  const emotionTone = safeText(shot.emotionDescription?.tone).toLowerCase()

  let hookPriority = 0
  let holdPriority = 0
  let productPriority = 0
  let clarityPriority = 0
  let setupPenalty = 0

  if (role === 'hook') hookPriority += 1
  if (isProductPriorityRole(role)) {
    holdPriority += 1
    productPriority += 1
  }
  if (referenceMode === 'product_closeup') {
    holdPriority += 0.8
    productPriority += 1
  }
  if (framing === 'extreme_closeup' || framing === 'closeup') {
    hookPriority += 0.2
    holdPriority += 0.45
    productPriority += 0.6
    clarityPriority += 0.3
  }
  if (productVisibility === 'high') {
    hookPriority += 0.15
    holdPriority += 0.5
    productPriority += 0.7
    clarityPriority += 0.45
  } else if (productVisibility === 'medium') {
    holdPriority += 0.25
    productPriority += 0.35
    clarityPriority += 0.2
  }
  if (shotType === 'closeup' || shotType === 'handheld' || shotType === 'packaging') {
    holdPriority += 0.25
    productPriority += 0.35
    clarityPriority += 0.2
  }

  const emphasisText = `${productFocus} ${visualDescription} ${actionDescription} ${onScreenText} ${narrationText}`
  if (/\b(reveal|unbox|open|snap|twist|drop|switch|show|before|after|instant)\b/.test(emphasisText)) {
    hookPriority += 0.35
    clarityPriority += 0.3
  }
  if (/\b(watch|look|see|why|how|stop|instead|finally|now|today|this is|here is)\b/.test(emphasisText)) {
    hookPriority += 0.26
    clarityPriority += 0.24
  }
  if (/\b(limited time|sell(?:s|ing)? out|everyone|viral|trending|don['’]?t miss)\b/.test(emphasisText)) {
    hookPriority += 0.22
  }
  if (/\b(texture|detail|material|finish|shine|clasp|edge|surface|fit|close[- ]?up)\b/.test(emphasisText)) {
    holdPriority += 0.35
    productPriority += 0.4
    clarityPriority += 0.25
  }
  if (/\b(clear|visible|hero|focus|centered|clean|crisp|sharp)\b/.test(emphasisText)) {
    clarityPriority += 0.2
  }
  if (/\b(ambient|mood|atmosphere|lifestyle|setup|intro|establishing|scenic|background)\b/.test(emphasisText)) {
    setupPenalty += 0.28
  }
  if (/\b(wide|full body|environment|walking|looking|smiling)\b/.test(`${framing} ${emphasisText}`)) {
    setupPenalty += 0.18
  }
  if (/\b(calm|soft|gentle|premium|clean|steady|natural)\b/.test(emotionTone)) {
    holdPriority += 0.15
  }
  if (role === 'hook' && /\b(before|after|switch|instant|watch|see|why|how)\b/.test(emphasisText)) {
    hookPriority += 0.18
    clarityPriority += 0.18
  }

  return {
    hookPriority,
    holdPriority,
    productPriority,
    clarityPriority,
    setupPenalty,
  }
}

function resolveComposeAdjacencySignal(currentShot: ShotSpec, previousShot?: ShotSpec): ComposeAdjacencySignal {
  if (!previousShot) {
    return {
      repeatedProductFocus: false,
      repeatedStaticFeel: false,
      repeatedCloseupFeel: false,
      repeatedRoleCluster: false,
      needsPatternBreak: false,
      followsStrongHook: false,
      payoffHandoffCandidate: false,
      preCloseConfirmationCandidate: false,
      closesIntoCta: false,
      shouldTightenSlightly: false,
    }
  }

  const currentRole = normalizeShotRole(currentShot)
  const previousRole = normalizeShotRole(previousShot)
  const currentMotion = safeText(currentShot.motion || currentShot.cameraMovement).toLowerCase()
  const previousMotion = safeText(previousShot.motion || previousShot.cameraMovement).toLowerCase()
  const currentFraming = safeText(currentShot.framing).toLowerCase()
  const previousFraming = safeText(previousShot.framing).toLowerCase()
  const currentReferenceMode = safeText(currentShot.storyboardReferenceMode).toLowerCase()
  const previousReferenceMode = safeText(previousShot.storyboardReferenceMode).toLowerCase()
  const currentProductFocus = safeText(currentShot.productFocus).toLowerCase()
  const previousProductFocus = safeText(previousShot.productFocus).toLowerCase()

  const repeatedProductFocus =
    isProductPriorityRole(currentRole) &&
    isProductPriorityRole(previousRole) &&
    !!currentProductFocus &&
    !!previousProductFocus &&
    (currentProductFocus === previousProductFocus ||
      currentProductFocus.includes(previousProductFocus) ||
      previousProductFocus.includes(currentProductFocus))

  const repeatedStaticFeel =
    currentMotion === 'static' &&
    previousMotion === 'static' &&
    (isProductPriorityRole(currentRole) || isProductPriorityRole(previousRole))

  const repeatedCloseupFeel =
    (currentFraming === 'extreme_closeup' || currentFraming === 'closeup' || currentReferenceMode === 'product_closeup') &&
    (previousFraming === 'extreme_closeup' || previousFraming === 'closeup' || previousReferenceMode === 'product_closeup')

  const repeatedRoleCluster =
    (isProductPriorityRole(currentRole) && isProductPriorityRole(previousRole)) ||
    (currentRole === previousRole && (currentRole === 'proof' || currentRole === 'detail' || currentRole === 'show'))

  const needsPatternBreak = repeatedStaticFeel || (repeatedCloseupFeel && repeatedRoleCluster)
  const previousEmphasis = resolveComposeEmphasisScore(previousShot)
  const followsStrongHook =
    previousRole === 'hook' &&
    previousEmphasis.setupPenalty <= 0.12 &&
    (previousEmphasis.clarityPriority >= 1.1 || (previousEmphasis.hookPriority >= 1.45 && previousEmphasis.clarityPriority >= 0.72))
  const payoffHandoffCandidate =
    followsStrongHook &&
    (currentRole === 'proof' || currentRole === 'detail' || currentRole === 'show' || isProductPriorityRole(currentRole))
  const closesIntoCta = currentRole === 'cta' && (isProductPriorityRole(previousRole) || previousRole === 'show' || previousRole === 'proof')
  const preCloseConfirmationCandidate =
    previousRole !== 'cta' &&
    (currentRole === 'proof' || currentRole === 'detail' || currentRole === 'show' || isProductPriorityRole(currentRole)) &&
    (isProductPriorityRole(previousRole) || previousRole === 'show') &&
    (currentMotion === 'static' || currentMotion === 'pan_left' || currentMotion === 'pan_right')

  const shouldTightenSlightly =
    (
      repeatedProductFocus ||
      repeatedStaticFeel ||
      repeatedCloseupFeel ||
      repeatedRoleCluster ||
      payoffHandoffCandidate ||
      preCloseConfirmationCandidate
    ) &&
    currentRole !== 'hook' &&
    currentRole !== 'cta'

  return {
    repeatedProductFocus,
    repeatedStaticFeel,
    repeatedCloseupFeel,
    repeatedRoleCluster,
    needsPatternBreak,
    followsStrongHook,
    payoffHandoffCandidate,
    preCloseConfirmationCandidate,
    closesIntoCta,
    shouldTightenSlightly,
  }
}

function estimateReadableUnits(text: string) {
  let units = 0
  for (const char of text) {
    if (!char.trim()) continue
    units += /[\u4e00-\u9fff]/.test(char) ? 1 : 0.55
  }
  return units
}

function resolveComposeReadabilitySignal(shot: ShotSpec): ComposeReadabilitySignal {
  const role = normalizeShotRole(shot)
  const candidateTexts = [
    safeText(shot.onScreenText),
    safeText(shot.textOverlay?.content),
    safeText(shot.subtitleSuggestion),
    safeText(shot.narrationText),
    safeText(shot.originalCaption),
    safeText(shot.scriptText),
  ].filter(Boolean)
  const longestText = candidateTexts.sort((a, b) => b.length - a.length)[0] || ''
  const estimatedUnits = estimateReadableUnits(longestText)
  const textHeavyRole = role === 'hook' || role === 'cta' || role === 'proof'

  if (!textHeavyRole || estimatedUnits <= 10) {
    return {
      estimatedUnits,
      needsHoldProtection: false,
      durationBoost: 0,
    }
  }

  const overage = estimatedUnits - 10
  return {
    estimatedUnits,
    needsHoldProtection: true,
    durationBoost: Math.min(0.03, overage * 0.003),
  }
}

function resolveComposeIntensitySignal(shot: ShotSpec, previousShot?: ShotSpec): ComposeIntensitySignal {
  const role = normalizeShotRole(shot)
  const motion = safeText(shot.motion || shot.cameraMovement).toLowerCase()
  const emphasis = resolveComposeEmphasisScore(shot)
  const readability = resolveComposeReadabilitySignal(shot)
  const actionText = `${safeText(shot.actionDescription)} ${safeText(shot.productFocus)} ${safeText(shot.visualDescription)}`.toLowerCase()

  let intensityScore = 0
  if (role === 'hook') intensityScore += 1.2
  if (motion === 'fast_cut') intensityScore += 1
  if (motion === 'zoom_in' || motion === 'pan_left' || motion === 'pan_right' || motion === 'shake') intensityScore += 0.35
  intensityScore += Math.min(0.8, emphasis.hookPriority * 0.35)
  if (/\b(reveal|instant|switch|drop|snap|before|after|surprise|urgent|limited time)\b/.test(actionText)) {
    intensityScore += 0.45
  }
  if (readability.needsHoldProtection) intensityScore -= 0.15

  const isAggressive = intensityScore >= 1.35
  const previousAggressive = previousShot ? resolveComposeIntensitySignal(previousShot).isAggressive : false
  const shouldIntroduceRelief = !isAggressive && previousAggressive

  return {
    intensityScore,
    isAggressive,
    shouldIntroduceRelief,
    shouldSoftenAfterPreviousAggressive: isAggressive && previousAggressive,
  }
}

function resolveComposeCtaPressureSignal(shot: ShotSpec, previousShot?: ShotSpec): ComposeCtaPressureSignal {
  const role = normalizeShotRole(shot)
  const text = [
    safeText(shot.onScreenText),
    safeText(shot.textOverlay?.content),
    safeText(shot.subtitleSuggestion),
    safeText(shot.narrationText),
    safeText(shot.actionDescription),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  if (role !== 'cta') {
    return {
      pressureScore: 0,
      isStrongCta: false,
      shouldSnapClose: false,
    }
  }

  let pressureScore = 0
  if (/\b(tap now|shop now|buy now|get yours|get it now|order now|claim now)\b/.test(text)) pressureScore += 1.1
  if (/\b(limited time|before it sells out|sell(?:s|ing)? out|last chance|don['’]?t miss|today only|now)\b/.test(text)) pressureScore += 0.9
  if (/\b(full set|bundle|offer|deal|discount|save)\b/.test(text)) pressureScore += 0.45
  if (/\b(now|today|immediately|right away)\b/.test(text)) pressureScore += 0.3
  if (previousShot) {
    const previousRole = normalizeShotRole(previousShot)
    if (previousRole === 'proof' || previousRole === 'detail' || isProductPriorityRole(previousRole)) {
      pressureScore += 0.2
    }
  }

  const isStrongCta = pressureScore >= 1.2
  return {
    pressureScore,
    isStrongCta,
    shouldSnapClose: pressureScore >= 1.95,
  }
}

function shouldPreserveStrongHookMomentum(input: { shot: ShotSpec; shotIndex: number; totalShots: number }) {
  const role = normalizeShotRole(input.shot)
  const stage = getViralRhythmProfile(input).stage
  const emphasis = resolveComposeEmphasisScore(input.shot)
  return (
    (role === 'hook' || stage === 'hook') &&
    emphasis.setupPenalty <= 0.12 &&
    (emphasis.clarityPriority >= 1.1 || (emphasis.hookPriority >= 1.45 && emphasis.clarityPriority >= 0.72))
  )
}

function isBodyStagnationCandidate(input: {
  shot: ShotSpec
  previousShot?: ShotSpec
  shotIndex: number
  totalShots: number
}) {
  const role = normalizeShotRole(input.shot)
  const motion = safeText(input.shot.motion || input.shot.cameraMovement).toLowerCase()
  const stage = getViralRhythmProfile({
    shot: input.shot,
    shotIndex: input.shotIndex,
    totalShots: input.totalShots,
  }).stage
  const adjacency = resolveComposeAdjacencySignal(input.shot, input.previousShot)
  return stage === 'body' && isProductPriorityRole(role) && motion === 'static' && adjacency.needsPatternBreak
}

function isCloseSnapLandingCandidate(input: {
  shot: ShotSpec
  previousShot?: ShotSpec
  previousPreviousShot?: ShotSpec
  shotIndex: number
  totalShots: number
}) {
  const role = normalizeShotRole(input.shot)
  if (role !== 'cta') return false
  const stage = getViralRhythmProfile({
    shot: input.shot,
    shotIndex: input.shotIndex,
    totalShots: input.totalShots,
  }).stage
  if (stage !== 'close') return false
  const adjacency = resolveComposeAdjacencySignal(input.shot, input.previousShot)
  const ctaPressure = resolveComposeCtaPressureSignal(input.shot, input.previousShot)
  const previousAdjacency = input.previousShot
    ? resolveComposeAdjacencySignal(input.previousShot, input.previousPreviousShot)
    : undefined
  const previousRole = input.previousShot ? normalizeShotRole(input.previousShot) : ''
  const previousPreviousRole = input.previousPreviousShot ? normalizeShotRole(input.previousPreviousShot) : ''
  const totalShots = Math.max(0, input.totalShots)
  const isShortDirectClose = totalShots <= 2
  const hasCloseHandoffLead =
    Boolean(previousAdjacency?.preCloseConfirmationCandidate) ||
    previousRole === 'show' ||
    (previousRole === 'proof' && previousPreviousRole === 'show' && Boolean(previousAdjacency?.preCloseConfirmationCandidate))
  return adjacency.closesIntoCta && ctaPressure.shouldSnapClose && (isShortDirectClose || hasCloseHandoffLead)
}

function isBodyReliefBridgeCandidate(input: {
  shot: ShotSpec
  nextShot?: ShotSpec
  shotIndex: number
  totalShots: number
}) {
  if (!input.nextShot) return false
  const role = normalizeShotRole(input.shot)
  const nextRole = normalizeShotRole(input.nextShot)
  const stage = getViralRhythmProfile({
    shot: input.shot,
    shotIndex: input.shotIndex,
    totalShots: input.totalShots,
  }).stage
  if (stage !== 'body') return false
  if (!(role === 'proof' || role === 'detail' || isProductPriorityRole(role))) return false
  if (!(nextRole === 'show' || nextRole === 'detail' || isProductPriorityRole(nextRole))) return false
  const motion = safeText(input.shot.motion || input.shot.cameraMovement).toLowerCase()
  const nextMotion = safeText(input.nextShot.motion || input.nextShot.cameraMovement).toLowerCase()
  const framing = safeText(input.shot.framing).toLowerCase()
  const nextFraming = safeText(input.nextShot.framing).toLowerCase()
  const adjacency = resolveComposeAdjacencySignal(input.shot)
  const nextAdjacency = resolveComposeAdjacencySignal(input.nextShot, input.shot)
  const nextIntensity = resolveComposeIntensitySignal(input.nextShot, input.shot)
  const motionLift =
    nextMotion === 'pan_left' ||
    nextMotion === 'pan_right' ||
    nextMotion === 'zoom_in' ||
    nextMotion === 'shake' ||
    nextMotion === 'fast_cut'
  const framingLift =
    (framing === 'closeup' || framing === 'extreme_closeup') &&
    (nextFraming === 'medium' || nextFraming === 'wide')

  return (
    adjacency.needsPatternBreak &&
    (nextAdjacency.preCloseConfirmationCandidate || nextAdjacency.shouldTightenSlightly || nextIntensity.shouldIntroduceRelief) &&
    motion === 'static' &&
    (motionLift || framingLift)
  )
}

function shouldYieldToBodyRelief(input: {
  shot: ShotSpec
  previousShot?: ShotSpec
  nextShot?: ShotSpec
  shotIndex: number
  totalShots: number
}) {
  if (!input.nextShot) return false
  const role = normalizeShotRole(input.shot)
  const stage = getViralRhythmProfile({
    shot: input.shot,
    shotIndex: input.shotIndex,
    totalShots: input.totalShots,
  }).stage
  if (stage !== 'body' || !isProductPriorityRole(role)) return false
  const adjacency = resolveComposeAdjacencySignal(input.shot, input.previousShot)
  if (!adjacency.needsPatternBreak) return false
  return isBodyReliefBridgeCandidate({
    shot: input.shot,
    nextShot: input.nextShot,
    shotIndex: input.shotIndex,
    totalShots: input.totalShots,
  })
}

function buildComposeDiagnosticSnapshot(input: {
  shot: ShotSpec
  previousShot?: ShotSpec
  shotIndex: number
  totalShots: number
}): ComposeDiagnosticSnapshot {
  return {
    role: normalizeShotRole(input.shot),
    stage: getViralRhythmProfile({
      shot: input.shot,
      shotIndex: input.shotIndex,
      totalShots: input.totalShots,
    }).stage,
    emphasis: resolveComposeEmphasisScore(input.shot),
    adjacency: resolveComposeAdjacencySignal(input.shot, input.previousShot),
    readability: resolveComposeReadabilitySignal(input.shot),
    intensity: resolveComposeIntensitySignal(input.shot, input.previousShot),
    ctaPressure: resolveComposeCtaPressureSignal(input.shot, input.previousShot),
  }
}

function buildComposeBatchSummary(reportItems: Array<{
  shotSources: Array<{
    clipDurationSec?: number
    composeDiagnostics?: ComposeDiagnosticSnapshot
  }>
}>): ComposeBatchSummary {
  const flagPenaltyMap: Record<string, number> = {
    weak_opening_signal: 18,
    payoff_continuity_weak: 16,
    cta_pressure_soft: 16,
    cta_snap_missing: 10,
    mid_section_underpowered: 10,
    low_variation_signal: 8,
    too_many_aggressive_shots: 10,
    text_heavy: 8,
    product_focus_weak: 12,
    cta_heavy: 7,
    hook_overloaded: 7,
  }
  const recommendationPriorityMap: Record<string, number> = {
    weak_opening_signal: 100,
    payoff_continuity_weak: 92,
    cta_pressure_soft: 90,
    cta_snap_missing: 82,
    mid_section_underpowered: 70,
    product_focus_weak: 66,
    too_many_aggressive_shots: 62,
    low_variation_signal: 54,
    text_heavy: 46,
    cta_heavy: 38,
    hook_overloaded: 34,
  }
  const stageCounts: Record<RhythmStage, number> = {
    hook: 0,
    body: 0,
    close: 0,
  }
  let totalShots = 0
  let aggressiveShotCount = 0
  let readabilityProtectedCount = 0
  let productPriorityCount = 0
  let adjacencyTightenedCount = 0
  let repeatedPatternBreakCount = 0
  let totalDuration = 0
  let strongHookCount = 0
  let payoffHandoffCount = 0
  let closeConfirmationCount = 0
  let strongCtaCount = 0
  let snapCloseCount = 0
  let bodyPatternBreakPressureCount = 0

  for (const item of reportItems) {
    for (const shot of item.shotSources || []) {
      totalShots += 1
      totalDuration += Number(shot.clipDurationSec || 0)
      const diagnostics = shot.composeDiagnostics
      if (!diagnostics) continue
      stageCounts[diagnostics.stage] += 1
      if (diagnostics.intensity.isAggressive) aggressiveShotCount += 1
      if (diagnostics.readability.needsHoldProtection) readabilityProtectedCount += 1
      if (diagnostics.emphasis.productPriority > 0.9) productPriorityCount += 1
      if (
        diagnostics.stage === 'hook' &&
        diagnostics.emphasis.setupPenalty <= 0.12 &&
        (diagnostics.emphasis.clarityPriority >= 1.1 ||
          (diagnostics.emphasis.hookPriority >= 1.45 && diagnostics.emphasis.clarityPriority >= 0.72))
      ) {
        strongHookCount += 1
      }
      if (diagnostics.adjacency.payoffHandoffCandidate) payoffHandoffCount += 1
      if (diagnostics.adjacency.preCloseConfirmationCandidate) closeConfirmationCount += 1
      if (diagnostics.ctaPressure.isStrongCta) strongCtaCount += 1
      if (diagnostics.ctaPressure.shouldSnapClose) snapCloseCount += 1
      if (diagnostics.adjacency.shouldTightenSlightly) adjacencyTightenedCount += 1
      if (
        diagnostics.stage === 'body' &&
        diagnostics.adjacency.needsPatternBreak &&
        (diagnostics.adjacency.repeatedProductFocus || diagnostics.adjacency.repeatedCloseupFeel || diagnostics.adjacency.repeatedStaticFeel)
      ) {
        repeatedPatternBreakCount += 1
      }
      if (
        diagnostics.stage === 'body' &&
        diagnostics.adjacency.needsPatternBreak &&
        diagnostics.adjacency.repeatedCloseupFeel &&
        (diagnostics.role === 'proof' || diagnostics.role === 'detail' || diagnostics.role === 'show')
      ) {
        bodyPatternBreakPressureCount += 1
      }
    }
  }

  const flags: string[] = []
  const recommendations: string[] = []
  const recommendationPairs: Array<{ flag: string; recommendation: string }> = []
  const hookRatio = totalShots > 0 ? stageCounts.hook / totalShots : 0
  const closeRatio = totalShots > 0 ? stageCounts.close / totalShots : 0
  const aggressiveRatio = totalShots > 0 ? aggressiveShotCount / totalShots : 0
  const productPriorityRatio = totalShots > 0 ? productPriorityCount / totalShots : 0
  const readabilityRatio = totalShots > 0 ? readabilityProtectedCount / totalShots : 0
  const payoffRatio = totalShots > 0 ? payoffHandoffCount / totalShots : 0
  const strongCtaRatio = totalShots > 0 ? strongCtaCount / totalShots : 0

  if (hookRatio > 0.4) {
    flags.push('hook_overloaded')
    const recommendation = 'Reduce hook-like shots or soften the first sequence to avoid front-loaded fatigue.'
    recommendations.push(recommendation)
    recommendationPairs.push({ flag: 'hook_overloaded', recommendation })
  }
  if (stageCounts.hook > 0 && strongHookCount === 0) {
    flags.push('weak_opening_signal')
    const recommendation = 'Strengthen the opening with a clearer product hero, action reveal, or more direct payoff shot.'
    recommendations.push(recommendation)
    recommendationPairs.push({ flag: 'weak_opening_signal', recommendation })
  }
  if (closeRatio > 0.34) {
    flags.push('cta_heavy')
    const recommendation = 'Reduce close-stage density so the ending feels cleaner and less sales-heavy.'
    recommendations.push(recommendation)
    recommendationPairs.push({ flag: 'cta_heavy', recommendation })
  }
  if (aggressiveRatio > 0.45) {
    flags.push('too_many_aggressive_shots')
    const recommendation = 'Soften consecutive aggressive shots or add steadier product moments between them.'
    recommendations.push(recommendation)
    recommendationPairs.push({ flag: 'too_many_aggressive_shots', recommendation })
  }
  if (productPriorityRatio < 0.25) {
    flags.push('product_focus_weak')
    const recommendation = 'Increase product-priority shots so the video spends more time on clear product value.'
    recommendations.push(recommendation)
    recommendationPairs.push({ flag: 'product_focus_weak', recommendation })
  }
  if (readabilityRatio > 0.5) {
    flags.push('text_heavy')
    const recommendation = 'Reduce text density or split long selling lines so rhythm stays natural.'
    recommendations.push(recommendation)
    recommendationPairs.push({ flag: 'text_heavy', recommendation })
  }
  if (adjacencyTightenedCount === 0 && totalShots >= 4) {
    flags.push('low_variation_signal')
    const recommendation = 'Consider adding more variation in framing or motion if the middle feels flat.'
    recommendations.push(recommendation)
    recommendationPairs.push({ flag: 'low_variation_signal', recommendation })
  }
  if (
    stageCounts.body >= 2 &&
    (repeatedPatternBreakCount >= 1 || bodyPatternBreakPressureCount >= 1) &&
    !flags.includes('low_variation_signal')
  ) {
    flags.push('low_variation_signal')
    const recommendation =
      bodyPatternBreakPressureCount >= 1
        ? 'The middle still stacks repeated proof close-ups. Add a hand demo, wider usage context, or angle shift earlier so the body feels more scroll-stopping.'
        : 'The middle still relies on repeated close-up coverage. Add one clearer framing, motion, or usage-context change upstream.'
    recommendations.push(recommendation)
    recommendationPairs.push({ flag: 'low_variation_signal', recommendation })
  }
  if (totalShots >= 5 && stageCounts.body >= 2 && aggressiveRatio < 0.12) {
    flags.push('mid_section_underpowered')
    const recommendation = 'Add one clearer momentum lift in the body so the edit does not feel too safe through the middle.'
    recommendations.push(recommendation)
    recommendationPairs.push({ flag: 'mid_section_underpowered', recommendation })
  }
  if (stageCounts.body > 0 && payoffHandoffCount === 0 && strongHookCount > 0) {
    flags.push('payoff_continuity_weak')
    const recommendation = 'Follow the hook with a clearer proof or payoff shot so viewers get the result faster.'
    recommendations.push(recommendation)
    recommendationPairs.push({ flag: 'payoff_continuity_weak', recommendation })
  }
  if (stageCounts.close > 0 && strongCtaCount === 0) {
    flags.push('cta_pressure_soft')
    const recommendation = 'Strengthen the closing CTA with clearer urgency or a more direct action phrase.'
    recommendations.push(recommendation)
    recommendationPairs.push({ flag: 'cta_pressure_soft', recommendation })
  }
  if (strongCtaCount > 0 && snapCloseCount === 0 && closeConfirmationCount > 0) {
    flags.push('cta_snap_missing')
    const recommendation = 'Consider a sharper final close when the CTA is strong and the product proof is already established.'
    recommendations.push(recommendation)
    recommendationPairs.push({ flag: 'cta_snap_missing', recommendation })
  }

  const rhythmScore = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        100 -
          flags.reduce((sum, flag) => sum + (flagPenaltyMap[flag] || 6), 0) +
          Math.min(6, strongHookCount * 2) +
          Math.min(5, payoffHandoffCount * 3) +
          Math.min(5, strongCtaCount * 3) +
          Math.min(4, snapCloseCount * 2),
      ),
    ),
  )
  const optimizationLanes = Array.from(
    new Set(
      flags.flatMap((flag) => {
        if (flag === 'weak_opening_signal' || flag === 'hook_overloaded') return ['hook'] as const
        if (flag === 'payoff_continuity_weak') return ['payoff'] as const
        if (flag === 'mid_section_underpowered' || flag === 'low_variation_signal' || flag === 'too_many_aggressive_shots' || flag === 'text_heavy')
          return ['body'] as const
        if (flag === 'cta_pressure_soft' || flag === 'cta_snap_missing' || flag === 'cta_heavy') return ['close'] as const
        if (flag === 'product_focus_weak') return ['payoff', 'body'] as const
        return [] as const
      }),
    ),
  )
  const nextActions = Array.from(
    new Set(
      optimizationLanes.flatMap((lane) => {
        if (lane === 'hook') {
          return [
            'Rewrite the opening line to make the payoff explicit in the first 2 seconds.',
            'Use a clearer hero or reveal shot before any softer setup moment.',
          ]
        }
        if (lane === 'payoff') {
          return [
            'Place a proof or closeup payoff shot immediately after the hook.',
            'Reduce any non-proof handoff between the opening and the first product result shot.',
          ]
        }
        if (lane === 'body') {
          return [
            'Replace one repeated close-up with a clearer hand demo, wider usage context, or angle shift through the middle section.',
            'Break up repeated static product shots with one momentum lift that feels newly earned on a vertical short-video screen.',
          ]
        }
        if (lane === 'close') {
          return [
            'Strengthen the closing CTA with urgency, scarcity, or a more direct action phrase.',
            'Use a sharper final close after the last proof shot when the CTA is already strong.',
          ]
        }
        return []
      }),
    ),
  ).slice(0, 4)
  const optimizationBrief = {
    focusArea: (optimizationLanes[0] || 'maintain') as 'hook' | 'payoff' | 'body' | 'close' | 'maintain',
    urgency: (rhythmScore >= 90 ? 'low' : rhythmScore >= 75 ? 'medium' : 'high') as 'low' | 'medium' | 'high',
    primaryGoal:
      optimizationLanes[0] === 'hook'
        ? 'Strengthen the first-stop moment so viewers understand the payoff immediately.'
        : optimizationLanes[0] === 'payoff'
          ? 'Deliver proof or product payoff faster after the opening hook.'
          : optimizationLanes[0] === 'body'
            ? 'Keep the middle section from flattening by adding variation and momentum.'
            : optimizationLanes[0] === 'close'
              ? 'Increase conversion pressure in the final proof-to-CTA handoff.'
              : 'Maintain the current rhythm balance and validate on real sample outputs.',
    actionItems: nextActions.slice(0, 3),
    upstreamPromptHints:
      optimizationLanes[0] === 'hook'
        ? [
            'Make the first line reveal the payoff immediately.',
            'Start with a clearer hero or reveal frame instead of soft setup.',
          ]
        : optimizationLanes[0] === 'payoff'
          ? [
              'Place a proof or closeup result shot immediately after the hook.',
              'Avoid non-proof filler before the first product payoff.',
            ]
          : optimizationLanes[0] === 'body'
            ? [
                'Replace one repeated close-up with a hand demo, wider usage context, or angle shift in the middle section.',
                'Break repeated static shots with one momentum lift that feels newly earned on a vertical short-video screen.',
              ]
            : optimizationLanes[0] === 'close'
              ? [
                  'Use a more urgent CTA with scarcity or direct action language.',
                  'Sharpen the last proof-to-CTA transition when urgency is high.',
                ]
              : ['Keep the current rhythm structure and validate on real sample outputs.'],
  }
  const bodyUpgradePlan =
    optimizationLanes.includes('body')
      ? {
          proofUpgrade: true,
          showUpgrade: true,
          preferredMoves: [
            'hand_demo',
            'wider_usage_context',
            'angle_shift',
            'momentum_lift',
          ],
        }
      : undefined
  const upstreamOptimizationPatch = buildComposeUpstreamOptimizationPatch({
    optimizationLanes,
    flags,
    snapCloseCount,
  })
  const topPriority =
    recommendationPairs.sort((a, b) => (recommendationPriorityMap[b.flag] || 0) - (recommendationPriorityMap[a.flag] || 0))[0]
      ?.recommendation || 'Maintain the current rhythm balance and validate on real sample outputs.'

  return {
    totalShots,
    stageCounts,
    aggressiveShotCount,
    readabilityProtectedCount,
    productPriorityCount,
    adjacencyTightenedCount,
    averageClipDurationSec: totalShots > 0 ? round3(totalDuration / totalShots) : 0,
    strongHookCount,
    payoffHandoffCount,
    closeConfirmationCount,
    strongCtaCount,
    snapCloseCount,
    rhythmScore,
    optimizationLanes,
    nextActions,
    optimizationBrief,
    bodyUpgradePlan,
    upstreamOptimizationPatch,
    health: {
      verdict: flags.length ? 'needs_tuning' : 'balanced',
      flags,
      recommendations,
      topPriority,
    },
  }
}

function buildComposeShotOptimizationTargets(input: {
  shotSources: Array<{
    shotId: string
    composeDiagnostics?: ComposeDiagnosticSnapshot
  }>
  summary: ComposeBatchSummary
}) {
  return input.shotSources.map((shot, index): ComposeShotOptimizationTarget => {
    const diagnostics = shot.composeDiagnostics
    const role = String(diagnostics?.role || '').trim().toLowerCase()
    const stage = diagnostics?.stage || 'body'
    const nextDiagnostics = input.shotSources[index + 1]?.composeDiagnostics
    const nextRole = String(nextDiagnostics?.role || '').trim().toLowerCase()
    const nextStrongCta = Boolean(nextDiagnostics?.ctaPressure?.isStrongCta)
    const closeHandoffUpgradeCandidate =
      (role === 'proof' || role === 'detail' || role === 'show' || role === 'solution') &&
      Boolean(diagnostics?.adjacency?.preCloseConfirmationCandidate) &&
      nextRole === 'cta' &&
      nextStrongCta
    const lane =
      stage === 'hook'
        ? (input.summary.optimizationLanes.includes('hook') ? 'hook' : input.summary.optimizationLanes.includes('payoff') ? 'payoff' : 'maintain')
        : stage === 'close'
          ? (input.summary.optimizationLanes.includes('close') ? 'close' : 'maintain')
          : input.summary.optimizationLanes.includes('body')
            ? 'body'
            : input.summary.optimizationLanes.includes('payoff') && (role === 'proof' || role === 'show' || role === 'solution')
              ? 'payoff'
              : 'maintain'

    const promptDirectives: string[] = []
    if (lane === 'hook') {
      promptDirectives.push('Reveal the payoff immediately and avoid a soft setup-first opening.')
    }
    if (lane === 'payoff') {
      promptDirectives.push('Move into visible proof or product payoff faster after the opening beat.')
    }
    if (lane === 'body') {
      promptDirectives.push('Introduce a clearer mid-sequence change so the body does not repeat the same visual beat.')
      if (input.summary.bodyUpgradePlan?.proofUpgrade && (role === 'proof' || role === 'detail')) {
        promptDirectives.push('Upgrade this proof beat with a hand demo, wider usage context, angle shift, or momentum lift.')
      }
      if (input.summary.bodyUpgradePlan?.showUpgrade && (role === 'show' || role === 'solution')) {
        promptDirectives.push('Open this show beat into clearer usage context, body interaction, angle shift, or momentum lift.')
      }
    }
    if (closeHandoffUpgradeCandidate) {
      promptDirectives.push('Let this beat resolve like a purchase-closing confirmation so the next CTA lands immediately with higher conversion pressure.')
    }
    if (lane === 'close') {
      promptDirectives.push('Increase closing conversion pressure and finish on a sharper action handoff.')
    }
    if (!promptDirectives.length) {
      promptDirectives.push('Maintain the current role while preserving rhythm clarity.')
    }

    return {
      shotId: shot.shotId,
      stage,
      role,
      lane,
      promptDirectives,
    }
  })
}

function resolveAnchorDiscipline(input: { shot: ShotSpec; shotIndex: number; totalShots: number }) {
  const role = normalizeShotRole(input.shot)
  const motion = String(input.shot.motion || input.shot.cameraMovement || '').trim().toLowerCase()
  const stage = getViralRhythmProfile(input).stage
  const emphasis = resolveComposeEmphasisScore(input.shot)

  if (stage === 'hook' || role === 'hook') {
    return {
      anchorBias:
        (motion === 'fast_cut' ? -0.1 : -0.08) -
        Math.min(0.04, emphasis.hookPriority * 0.02) -
        Math.min(0.05, emphasis.clarityPriority * 0.02) +
        Math.min(0.04, emphasis.setupPenalty * 0.05),
      leadingPadScale: Math.max(0.68, 0.82 - emphasis.hookPriority * 0.04 - emphasis.clarityPriority * 0.03),
      maxLeadingPadScale: Math.max(0.68, 0.8 - emphasis.hookPriority * 0.04 - emphasis.clarityPriority * 0.025),
    }
  }
  if (isProductPriorityRole(role)) {
    return {
      anchorBias: (motion === 'static' ? -0.04 : -0.02) - Math.min(0.03, emphasis.productPriority * 0.015),
      leadingPadScale: Math.max(0.8, 0.92 - emphasis.productPriority * 0.035),
      maxLeadingPadScale: Math.max(0.8, 0.9 - emphasis.productPriority * 0.03),
    }
  }
  if (stage === 'close' || role === 'cta') {
    return {
      anchorBias: 0.03,
      leadingPadScale: 1,
      maxLeadingPadScale: 1,
    }
  }
  return {
    anchorBias: 0,
    leadingPadScale: 1,
    maxLeadingPadScale: 1,
  }
}

function getRhythmBias(input: { shot: ShotSpec; previousShot?: ShotSpec; shotIndex: number; totalShots: number }) {
  const phase = getSequencePhase(input.shotIndex, input.totalShots)
  const role = normalizeShotRole(input.shot)
  const motion = String(input.shot.motion || input.shot.cameraMovement || '').trim().toLowerCase()
  const viralProfile = getViralRhythmProfile(input)
  const emphasis = resolveComposeEmphasisScore(input.shot)
  const readability = resolveComposeReadabilitySignal(input.shot)
  const intensity = resolveComposeIntensitySignal(input.shot, input.previousShot)
  const ctaPressure = resolveComposeCtaPressureSignal(input.shot, input.previousShot)
  const preserveStrongHookMomentum = shouldPreserveStrongHookMomentum(input)
  const adjacency = resolveComposeAdjacencySignal(input.shot, input.previousShot)

  let anchorOffset = 0
  let durationScale = 1

  if (phase <= 0.2) {
    anchorOffset -= 0.1
    durationScale *= motion === 'fast_cut' ? 0.965 : 0.985
  } else if (phase >= 0.8) {
    anchorOffset += 0.08
    durationScale *= role === 'cta' ? 0.99 : 1
  } else {
    durationScale *= isProductPriorityRole(role) ? 1.008 : 1
  }

  if (motion === 'fast_cut') {
    durationScale *= 0.98
  } else if (motion === 'static') {
    durationScale *= 1.008
  }

  if (role === 'hook') {
    anchorOffset -= 0.08
    durationScale *= 0.985
  } else if (role === 'cta') {
    anchorOffset += 0.06
    durationScale *= 0.995
  } else if (isProductPriorityRole(role)) {
    durationScale *= 1.008
  }

  anchorOffset -= Math.min(0.04, emphasis.hookPriority * 0.015)
  anchorOffset -= Math.min(0.05, emphasis.clarityPriority * 0.018)
  anchorOffset += Math.min(0.04, emphasis.setupPenalty * 0.04)
  durationScale *= 1 + Math.min(0.018, emphasis.holdPriority * 0.008)
  if (readability.needsHoldProtection) {
    durationScale *= 1 + readability.durationBoost * 0.6
  }
  if (adjacency.payoffHandoffCandidate) {
    anchorOffset -= isProductPriorityRole(role) ? 0.042 : 0.024
    durationScale *= isProductPriorityRole(role) ? 1.012 : 1.005
  }
  if (adjacency.preCloseConfirmationCandidate && !adjacency.closesIntoCta) {
    anchorOffset += 0.022
    durationScale *= isProductPriorityRole(role) ? 1.012 : 1.006
  }
  if (adjacency.closesIntoCta) {
    anchorOffset += 0.035
    durationScale *= 0.992
  }
  if (ctaPressure.isStrongCta) {
    anchorOffset += ctaPressure.shouldSnapClose ? 0.03 : 0.018
    durationScale *= ctaPressure.shouldSnapClose ? 0.986 : 0.992
  }

  if (viralProfile.stage === 'hook') {
    anchorOffset -= 0.06 * viralProfile.punchBoost
    durationScale *= 0.99
  } else if (viralProfile.stage === 'body') {
    durationScale *= 1
  } else {
    anchorOffset += 0.03 * viralProfile.punchBoost
    durationScale *= 0.995
  }
  if (intensity.shouldSoftenAfterPreviousAggressive) {
    anchorOffset += preserveStrongHookMomentum ? 0.008 : 0.02
    durationScale *= preserveStrongHookMomentum ? 1.004 : 1.01
  } else if (intensity.shouldIntroduceRelief) {
    anchorOffset += 0.012
    durationScale *= 1.006
  }

  const minScale = isProductPriorityRole(role) ? 0.985 : 0.95
  durationScale = clamp(durationScale, minScale, 1.025)

  return {
    anchorOffset,
    durationScale,
  }
}

function getTransitionPlan(input: {
  shot: ShotSpec
  nextShot?: ShotSpec
  previousShot?: ShotSpec
  shotIndex: number
  totalShots: number
}): RhythmTransitionPlan {
  const role = normalizeShotRole(input.shot)
  const nextRole = input.nextShot ? normalizeShotRole(input.nextShot) : ''
  const motion = String(input.shot.motion || input.shot.cameraMovement || '').trim().toLowerCase()
  const nextMotion = String(input.nextShot?.motion || input.nextShot?.cameraMovement || '').trim().toLowerCase()
  const phase = getSequencePhase(input.shotIndex, input.totalShots)
  const viralProfile = getViralRhythmProfile(input)
  const currentEmphasis = resolveComposeEmphasisScore(input.shot)
  const nextEmphasis = input.nextShot ? resolveComposeEmphasisScore(input.nextShot) : undefined
  const nextAdjacency = input.nextShot ? resolveComposeAdjacencySignal(input.nextShot, input.shot) : undefined
  const nextCtaPressure = input.nextShot ? resolveComposeCtaPressureSignal(input.nextShot, input.shot) : undefined
  const bodyReliefBridge = isBodyReliefBridgeCandidate(input)
  const nextCloseSnapLanding = input.nextShot
    ? isCloseSnapLandingCandidate({
      shot: input.nextShot,
      previousShot: input.shot,
      previousPreviousShot: input.previousShot,
      shotIndex: input.shotIndex + 1,
      totalShots: input.totalShots,
    })
    : false

  if (!input.nextShot) return { transition: 'hardcut', durationSec: 0 }
  const allowHookPayoffMicroFade =
    role === 'hook' &&
    motion !== 'fast_cut' &&
    nextAdjacency?.payoffHandoffCandidate &&
    (nextRole === 'proof' || nextRole === 'detail' || nextRole === 'show' || isProductPriorityRole(nextRole)) &&
    (currentEmphasis.clarityPriority >= 1.08 || currentEmphasis.hookPriority >= 1.5)
  if (allowHookPayoffMicroFade) {
    return {
      transition: 'fade',
      durationSec: isProductPriorityRole(nextRole) ? 0.04 : 0.03,
    }
  }
  if (motion === 'fast_cut' || role === 'hook' || nextRole === 'hook' || viralProfile.stage === 'hook') {
    return { transition: 'hardcut', durationSec: 0 }
  }
  const currentAdjacency = resolveComposeAdjacencySignal(input.shot, input.previousShot)
  if (
    role === 'proof' &&
    nextRole === 'cta' &&
    nextCloseSnapLanding &&
    Boolean(currentAdjacency.preCloseConfirmationCandidate)
  ) {
    return { transition: 'hardcut', durationSec: 0 }
  }
  const pairAllowsFade =
    (role === 'product_show' && nextRole === 'proof') ||
    (role === 'detail' && nextRole === 'detail') ||
    (role === 'proof' && nextRole === 'cta')
  if (pairAllowsFade && nextCloseSnapLanding) {
    return { transition: 'hardcut', durationSec: 0 }
  }
  if (pairAllowsFade) {
    return { transition: 'fade', durationSec: viralProfile.stage === 'close' ? 0.09 : 0.06 }
  }
  if (
    nextAdjacency?.closesIntoCta &&
    (role === 'proof' || role === 'detail' || role === 'show' || isProductPriorityRole(role))
  ) {
    return { transition: nextCloseSnapLanding ? 'hardcut' : 'fade', durationSec: nextCloseSnapLanding ? 0 : 0.08 }
  }
  if (
    nextAdjacency?.payoffHandoffCandidate &&
    (nextRole === 'proof' || nextRole === 'detail' || nextRole === 'show')
  ) {
    return {
      transition: 'fade',
      durationSec: isProductPriorityRole(nextRole) ? 0.05 : 0.04,
    }
  }
  if (bodyReliefBridge) {
    return {
      transition: 'fade',
      durationSec: nextRole === 'show' ? 0.06 : 0.05,
    }
  }
  if (
    isProductPriorityRole(role) &&
    isProductPriorityRole(nextRole) &&
    nextAdjacency?.needsPatternBreak &&
    motion === 'static' &&
    nextMotion === 'static'
  ) {
    return { transition: 'fade', durationSec: 0.07 }
  }
  if (
    viralProfile.stage === 'body' &&
    isProductPriorityRole(role) &&
    nextRole === 'show' &&
    (currentEmphasis.clarityPriority >= 0.85 || (nextEmphasis?.hookPriority || 0) >= 0.45)
  ) {
    return { transition: 'fade', durationSec: 0.06 }
  }
  if (role === 'cta' && phase >= 0.9) {
    return { transition: nextCloseSnapLanding ? 'hardcut' : 'fade', durationSec: nextCloseSnapLanding ? 0 : 0.08 }
  }
  return { transition: 'hardcut', durationSec: 0 }
}

function resolveScriptFirstTargetDuration(input: {
  shot: ShotSpec
  previousShot?: ShotSpec
  nextShot?: ShotSpec
  targetDurationSec: number
  sourceDurationSec: number
  shotIndex: number
  totalShots: number
}) {
  const role = normalizeShotRole(input.shot)
  const motion = String(input.shot.motion || input.shot.cameraMovement || '').trim().toLowerCase()
  const phase = getSequencePhase(input.shotIndex, input.totalShots)
  const stage = getViralRhythmProfile({ shot: input.shot, shotIndex: input.shotIndex, totalShots: input.totalShots }).stage
  const emphasis = resolveComposeEmphasisScore(input.shot)
  const adjacency = resolveComposeAdjacencySignal(input.shot, input.previousShot)
  const readability = resolveComposeReadabilitySignal(input.shot)
  const intensity = resolveComposeIntensitySignal(input.shot, input.previousShot)
  const ctaPressure = resolveComposeCtaPressureSignal(input.shot, input.previousShot)
  const preserveStrongHookMomentum = shouldPreserveStrongHookMomentum({
    shot: input.shot,
    shotIndex: input.shotIndex,
    totalShots: input.totalShots,
  })
  const bodyStagnationCandidate = isBodyStagnationCandidate(input)
  const closeSnapLandingCandidate = isCloseSnapLandingCandidate(input)
  const yieldToBodyRelief = shouldYieldToBodyRelief(input)
  let durationScale = 1

  if (stage === 'hook' || role === 'hook' || phase <= 0.2) {
    durationScale *= motion === 'fast_cut' ? 0.97 : 0.985
  } else if (stage === 'close' || role === 'cta' || phase >= 0.8) {
    durationScale *= role === 'cta' ? 0.995 : 1
  } else if (isProductPriorityRole(role)) {
    durationScale *= 1.012
  }

  if (motion === 'fast_cut' && input.targetDurationSec <= 1.2) {
    durationScale *= 0.985
  }
  if (motion === 'static' && isProductPriorityRole(role)) {
    durationScale *= 1.008
  }
  durationScale *= 1 + Math.min(0.02, emphasis.holdPriority * 0.008)
  if (stage === 'hook' || role === 'hook' || phase <= 0.2) {
    durationScale *= 1 + Math.min(0.012, emphasis.clarityPriority * 0.006)
    durationScale *= 1 - Math.min(0.015, emphasis.setupPenalty * 0.02)
  }
  if (readability.needsHoldProtection) {
    durationScale *= 1 + readability.durationBoost
  }
  if (adjacency.payoffHandoffCandidate) {
    durationScale *= isProductPriorityRole(role) ? 1.016 : 1.007
  }
  if (adjacency.preCloseConfirmationCandidate && !adjacency.closesIntoCta) {
    durationScale *= isProductPriorityRole(role) ? 1.014 : 1.008
  }
  if (adjacency.shouldTightenSlightly) {
    const repeatedStrength =
      (adjacency.repeatedProductFocus ? 1 : 0) +
      (adjacency.repeatedStaticFeel ? 1 : 0) +
      (adjacency.repeatedCloseupFeel ? 1 : 0) +
      (adjacency.repeatedRoleCluster ? 1 : 0)
    durationScale *= adjacency.payoffHandoffCandidate
      ? 1 - Math.min(0.01, repeatedStrength * 0.003)
      : 1 - Math.min(0.018, repeatedStrength * 0.006)
  }
  if (intensity.shouldSoftenAfterPreviousAggressive) {
    durationScale *= preserveStrongHookMomentum ? 1.004 : 1.012
  } else if (intensity.shouldIntroduceRelief) {
    durationScale *= 1.008
  }
  if (adjacency.needsPatternBreak) {
    durationScale *= role === 'cta' ? 0.996 : 0.992
  }
  if (bodyStagnationCandidate) {
    durationScale *= adjacency.repeatedProductFocus || adjacency.repeatedCloseupFeel ? 0.972 : 0.978
  }
  if (yieldToBodyRelief) {
    durationScale *= adjacency.repeatedProductFocus || adjacency.repeatedCloseupFeel ? 0.964 : 0.97
  }
  const conversionHandoffPressure =
    !adjacency.closesIntoCta &&
    adjacency.preCloseConfirmationCandidate &&
    input.nextShot &&
    normalizeShotRole(input.nextShot) === 'cta' &&
    resolveComposeCtaPressureSignal(input.nextShot, input.shot).isStrongCta
  if (conversionHandoffPressure) {
    durationScale *= 0.982
  }
  if (adjacency.closesIntoCta) {
    durationScale *= 0.992
  }
  if (ctaPressure.isStrongCta) {
    durationScale *= ctaPressure.shouldSnapClose ? 0.984 : 0.99
  }
  if (stage === 'close' && role === 'cta' && ctaPressure.isStrongCta) {
    durationScale *= 0.992
  }
  if (closeSnapLandingCandidate) {
    durationScale *= 0.936
  }

  const minScale = closeSnapLandingCandidate
    ? 0.94
    : isProductPriorityRole(role)
      ? 0.99
      : stage === 'hook'
        ? 0.96
        : 0.97
  const maxScale = readability.needsHoldProtection
    ? isProductPriorityRole(role)
      ? 1.04
      : 1.035
    : isProductPriorityRole(role)
      ? 1.025
      : 1.02
  durationScale = clamp(durationScale, minScale, maxScale)
  return Math.min(input.sourceDurationSec, Math.max(0.5, input.targetDurationSec * durationScale))
}

function pickClipWindow(input: {
  mode: FinalComposeClipMode
  sourceDurationSec: number
  targetDurationSec: number
  shot: ShotSpec
  previousShot?: ShotSpec
  previousPreviousShot?: ShotSpec
  nextShot?: ShotSpec
  shotIndex: number
  totalShots: number
}) {
  const sourceDurationSec = Math.max(0.5, Number(input.sourceDurationSec || 0.5))
  const targetDurationSec = Math.max(0.5, Number(input.targetDurationSec || 0.5))
  const sequenceBias = getRhythmBias({
    shot: input.shot,
    previousShot: input.previousShot,
    shotIndex: input.shotIndex,
    totalShots: input.totalShots,
  })
  const bodyStagnationCandidate = isBodyStagnationCandidate({
    shot: input.shot,
    previousShot: input.previousShot,
    shotIndex: input.shotIndex,
    totalShots: input.totalShots,
  })
  const closeSnapLandingCandidate = isCloseSnapLandingCandidate({
    shot: input.shot,
    previousShot: input.previousShot,
    previousPreviousShot: input.previousPreviousShot,
    shotIndex: input.shotIndex,
    totalShots: input.totalShots,
  })
  const yieldToBodyRelief = shouldYieldToBodyRelief({
    shot: input.shot,
    previousShot: input.previousShot,
    nextShot: input.nextShot,
    shotIndex: input.shotIndex,
    totalShots: input.totalShots,
  })
  const baseTarget =
    FINAL_COMPOSE_DURATION_POLICY === 'script_first_micro_adjust'
      ? resolveScriptFirstTargetDuration({
        shot: input.shot,
        previousShot: input.previousShot,
        nextShot: input.nextShot,
        targetDurationSec,
        sourceDurationSec,
        shotIndex: input.shotIndex,
        totalShots: input.totalShots,
      })
      : Math.max(0.5, targetDurationSec * getClipAnchorProfile(input.shot, targetDurationSec).clipDurationScale * sequenceBias.durationScale)
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
  const anchorDiscipline = resolveAnchorDiscipline({
    shot: input.shot,
    shotIndex: input.shotIndex,
    totalShots: input.totalShots,
  })
  const payoffLeadingTrim =
    resolveComposeAdjacencySignal(input.shot, input.previousShot).payoffHandoffCandidate &&
    isProductPriorityRole(normalizeShotRole(input.shot))
      ? Math.min(0.08, clampedTarget * 0.06)
      : 0
  const anchor = clamp(
    profile.anchor +
      sequenceBias.anchorOffset +
      anchorDiscipline.anchorBias +
      (bodyStagnationCandidate
        ? resolveComposeAdjacencySignal(input.shot, input.previousShot).repeatedCloseupFeel
          ? 0.032
          : 0.026
        : 0) +
      (yieldToBodyRelief ? 0.02 : 0) +
      (input.nextShot &&
      !resolveComposeAdjacencySignal(input.shot, input.previousShot).closesIntoCta &&
      resolveComposeAdjacencySignal(input.nextShot, input.shot).closesIntoCta &&
      resolveComposeCtaPressureSignal(input.nextShot, input.shot).isStrongCta
        ? 0.018
        : 0) +
      (closeSnapLandingCandidate ? 0.036 : 0),
    0.08,
    0.88,
  )
  const leadingPad = Math.min(
    profile.maxLeadingPadSec * anchorDiscipline.maxLeadingPadScale,
    clampedTarget * profile.leadingPadRatio * anchorDiscipline.leadingPadScale,
  )
  const clipStartSec = Math.max(0, Math.min(remaining, sourceDurationSec * anchor - leadingPad - payoffLeadingTrim))
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
  allowMockSources?: boolean
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
      composeDiagnostics?: ComposeDiagnosticSnapshot
    }>
    shotOptimizationTargets?: ComposeShotOptimizationTarget[]
    transitions?: RhythmTransitionPlan[]
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
          composeDiagnostics?: ComposeDiagnosticSnapshot
        }> = []
        const allowMockSources = Boolean(input.allowMockSources)
        for (const shot of input.shots) {
          if (!allowMockSources && (shot.isMock || shot.generatedSource === 'mock' || shot.generatedSource === 'local')) {
            throw new Error(`shot ${shot.index + 1} is mock/local and cannot be rendered`)
          }
          const src = shot.uploadedAssetPath || shot.generatedClipPath
          if (!src) continue
          const out = join(jobDir, `${shot.id}.mp4`)
          const highlightSuppression = shouldSuppressHighlights(shot)
          const sourceDurationSec = await probeDurationSec(src)
          const previousShot = normalized.length > 0 ? input.shots[normalized.length - 1] : undefined
          const previousPreviousShot = normalized.length > 1 ? input.shots[normalized.length - 2] : undefined
          const composeDiagnostics = buildComposeDiagnosticSnapshot({
            shot,
            previousShot,
            shotIndex: normalized.length,
            totalShots: input.shots.length,
          })
          const clipWindow = pickClipWindow({
            mode: FINAL_COMPOSE_CLIP_MODE,
            sourceDurationSec,
            targetDurationSec: Number(shot.durationSec || 1.5),
            shot,
            previousShot,
            previousPreviousShot,
            nextShot: input.shots[normalized.length],
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
              previousShot,
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
            composeDiagnostics,
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
        const summary = buildComposeBatchSummary([
          {
            shotSources: shotSourceReport,
          },
        ])
        results.push(finalOut)
        report.push({
          index,
          output: finalOut,
          success: true,
          shotSources: shotSourceReport,
          shotOptimizationTargets: buildComposeShotOptimizationTargets({
            shotSources: shotSourceReport,
            summary,
          }),
          transitions: transitions.slice(0, Math.max(0, normalized.length - 1)),
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
          composeDiagnostics: buildComposeDiagnosticSnapshot({
            shot: s,
            previousShot: undefined,
            shotIndex: typeof s.index === 'number' ? s.index : 0,
            totalShots: input.shots.length,
          }),
        })),
        shotOptimizationTargets: [],
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
        composeSummary: buildComposeBatchSummary(report.filter((x) => x.success)),
        items: report,
      },
      null,
      2,
    ),
    'utf8',
  )
  return { outputs: results, reportPath }
}
