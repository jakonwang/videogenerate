import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import { cleanAiText, extractJsonObjectText, extractModelMessageContent, parseModelJsonPayload } from './aiResponse'
import { generateChatCompletion } from './unifiedChat'
import { buildGenerationPromptRestraintText, buildSilentCommercialGlobalRule, sanitizeJewelryGenerationPrompt } from './prompt'
import type { CloneGlobalScript, CloneLocale, ModelCredentials, ScriptRole, ShotSpec } from './types'
import { inferStoryboardReferenceDecision } from './storyboardReference'

type FrameSet = {
  start?: string
  mid?: string
  end?: string
}

export type ScriptShotAnalysis = {
  shotId: string
  startTime: number
  endTime: number
  storyboardReferenceMode?: 'product_closeup' | 'model_presentation'
  scriptText: string
  scriptRole: ScriptRole
  narrationText?: string
  onScreenText?: string
  visualDescription: string
  actionDescription: string
  cameraDescription: string
  productFocus: string
  subjectPosition?: {
    person?: string
    product?: string
    text?: string
  }
  sceneDescription?: {
    location?: string
    background?: string
    lighting?: string
    style?: string
  }
  emotionDescription?: {
    tone?: string
    intensity?: number
  }
  textOverlay?: {
    content?: string
    position?: string
    fontSize?: 'small' | 'medium' | 'large' | 'extra_large'
    style?: string
    color?: string
    animation?: string
  }
  generationPrompt: string
  negativePrompt?: string
  scriptConfidence: number
  analysisNotes: string[]
}

export type ScriptAnalysisResult = {
  globalScript: CloneGlobalScript
  shots: ScriptShotAnalysis[]
}

export type ProductAnalysisResult = {
  category: string
  summary: string
  coreSubject: string
  connectionStructure: string
  materialDetails: string
  wearingPosition: string
  surfaceDetails: string
  colorDetails: string
  geometryDetails: string
  sizeScale: string
  matchingRules: string[]
  rawDescription: string
}

type AnalyzeInput = {
  videoPath: string
  locale: CloneLocale
  credentials: ModelCredentials
  shots: Array<
    Pick<
      ShotSpec,
      'id' | 'index' | 'startSec' | 'endSec' | 'durationSec' | 'role' | 'visualPrompt' | 'motion' | 'framing' | 'cameraMovement' | 'action'
    > & {
      referenceFramePaths?: FrameSet
      productType?: string
    }
  >
  targetMarket?: string
  productCategory?: string
}

const SCRIPT_ROLES: ScriptRole[] = ['hook', 'pain_point', 'solution', 'proof', 'offer', 'cta', 'transition', 'unknown']

function normalizeStoryboardReferenceMode(value: unknown): 'product_closeup' | 'model_presentation' | undefined {
  const text = String(value ?? '').trim().toLowerCase()
  if (text === 'product_closeup' || text === 'product closeup' || text === 'product-closeup') return 'product_closeup'
  if (text === 'model_presentation' || text === 'model presentation' || text === 'model-presentation') return 'model_presentation'
  return undefined
}

export function inferStoryboardReferenceMode(input: {
  analyzed?: Partial<ScriptShotAnalysis> | null
  shot: ShotSpec
}): 'product_closeup' | 'model_presentation' | undefined {
  const explicit = normalizeStoryboardReferenceMode(input.analyzed?.storyboardReferenceMode)
  const decision = inferStoryboardReferenceDecision({
    productType: input.shot.productType,
    shot: input.shot,
    extraTexts: [
      input.analyzed?.visualDescription,
      input.analyzed?.actionDescription,
      input.analyzed?.cameraDescription,
      input.analyzed?.productFocus,
      input.analyzed?.scriptText,
      input.analyzed?.sceneDescription?.location,
      input.analyzed?.sceneDescription?.background,
      input.analyzed?.sceneDescription?.style,
    ],
  })
  if (decision.subjectType === 'unknown') return explicit
  return decision.mode
}

function cleanHost(value?: string) {
  return String(value || 'https://grsaiapi.com').trim().replace(/\/+$/, '') || 'https://grsaiapi.com'
}

function cleanText(value: unknown, fallback = '') {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim()
  return text || fallback
}

function cleanAsciiEnglishText(value: unknown, fallback = '') {
  const text = String(value ?? '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[\u3000-\u303f\uff00-\uffef]/g, ' ')
    .replace(/[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]+/g, ' ')
    .replace(/[^\x20-\x7E\n]/g, ' ')
    .replace(/\?{2,}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return text || fallback
}

function joinEnglishSegments(parts: Array<string | undefined>) {
  return parts
    .map((item) => cleanAsciiEnglishText(item, ''))
    .filter(Boolean)
    .join('; ')
}

function clamp01(value: unknown) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(1, n))
}

function round3(value: number) {
  return Math.round(value * 1000) / 1000
}

function buildSevenDimensionPrompt(input: {
  locale: CloneLocale
  subject?: string
  action?: string
  scene?: string
  lighting?: string
  camera?: string
  style?: string
  quality?: string
}) {
  return [
    `1. Subject: ${cleanAsciiEnglishText(input.subject, 'Match the actual subject and product details from the reference video')}`,
    `2. Action: ${cleanAsciiEnglishText(input.action, 'Keep the real action and timing observed in the reference video')}`,
    `3. Scene: ${cleanAsciiEnglishText(input.scene, 'Preserve the observed environment, spatial relation, and background depth')}`,
    `4. Lighting: ${cleanAsciiEnglishText(input.lighting, 'Use realistic lighting consistent with the reference video')}`,
    `5. Camera: ${cleanAsciiEnglishText(input.camera, 'Reconstruct the observed framing, angle, and camera motion')}`,
    `6. Style: ${cleanAsciiEnglishText(input.style, 'Real short-video style, no redesign, no extra beautification')}`,
    `7. Quality: ${cleanAsciiEnglishText(input.quality, '9:16 vertical, high fidelity, stable, no watermark, no subtitles, no platform UI')}`,
  ].join('\n')
}

function composeShotScriptText(input: {
  locale: CloneLocale
  visualDescription?: string
  actionDescription?: string
  cameraDescription?: string
  productFocus?: string
}) {
  const parts = [
    cleanAsciiEnglishText(input.visualDescription, ''),
    cleanAsciiEnglishText(input.actionDescription, ''),
    cleanAsciiEnglishText(input.cameraDescription, ''),
    cleanAsciiEnglishText(input.productFocus, ''),
  ].filter(Boolean)
  if (parts.length) return parts.join('; ')
  return 'Reconstruct this shot exactly from the reference video.'
}

function clampShotWindow(startTime: number, endTime: number, fallbackStart: number, fallbackDuration: number) {
  const safeStart = Number.isFinite(startTime) ? Number(startTime) : Number(fallbackStart || 0)
  const candidateEnd = Number.isFinite(endTime) ? Number(endTime) : safeStart + Number(fallbackDuration || 1.5)
  const minEnd = safeStart + 0.5
  const maxEnd = safeStart + 8
  return {
    startTime: round3(Math.max(0, safeStart)),
    endTime: round3(Math.max(minEnd, Math.min(candidateEnd, maxEnd))),
  }
}

function normalizeRole(value: unknown): ScriptRole {
  const role = String(value ?? '').trim() as ScriptRole
  return SCRIPT_ROLES.includes(role) ? role : 'unknown'
}

function normalizeFontSize(value: unknown): 'small' | 'medium' | 'large' | 'extra_large' | undefined {
  const v = String(value ?? '').trim().toLowerCase()
  if (v === 'small' || v === 'medium' || v === 'large' || v === 'extra_large') return v
  return undefined
}

function mimeForImage(filePath: string) {
  const ext = extname(filePath).toLowerCase()
  if (ext === '.png') return 'image/png'
  if (ext === '.webp') return 'image/webp'
  return 'image/jpeg'
}

async function imageDataUrl(filePath: string) {
  const buf = await readFile(filePath)
  return `data:${mimeForImage(filePath)};base64,${buf.toString('base64')}`
}

function fallbackShot(shot: AnalyzeInput['shots'][number], note: string, locale: CloneLocale): ScriptShotAnalysis {
  const visual = cleanText(shot.visualPrompt, 'reference product demonstration shot')
  const action = cleanText(shot.action, visual)
  const camera = cleanText(shot.cameraMovement || shot.motion, 'same camera movement as reference shot')
  const timing = clampShotWindow(
    Number(shot.startSec || 0),
    Number(shot.endSec ?? Number(shot.startSec || 0) + Number(shot.durationSec || 1.5)),
    Number(shot.startSec || 0),
    Number(shot.durationSec || 1.5),
  )
  return {
    shotId: shot.id,
    startTime: timing.startTime,
    endTime: timing.endTime,
    scriptText: composeShotScriptText({
      locale,
      visualDescription: visual,
      actionDescription: action,
      cameraDescription: `${shot.framing || 'closeup'} framing, ${camera}`,
      productFocus: 'preserve the visible product focus exactly as observed in the reference video',
    }),
    scriptRole: shot.index === 0 ? 'hook' : 'unknown',
    narrationText: '',
    onScreenText: '',
    visualDescription: visual,
    actionDescription: action,
    cameraDescription: `${shot.framing || 'closeup'} framing, ${camera}`,
    productFocus: 'preserve the visible product focus exactly as observed in the reference video',
    subjectPosition: { person: '', product: 'center', text: '' },
    sceneDescription: { location: '', background: '', lighting: '', style: '' },
    emotionDescription: { tone: '', intensity: 0 },
    textOverlay: { content: '', position: '', fontSize: 'medium', style: '', color: '', animation: '' },
    generationPrompt: buildSevenDimensionPrompt({
      locale,
      subject: visual,
      action,
      scene: cleanText(shot.visualPrompt, visual),
      lighting: 'follow the lighting that is actually visible in the reference video',
      camera: `${shot.framing || 'closeup'} framing, ${camera}`,
      style: 'real short-video ecommerce reference reconstruction, no redesign',
      quality: '9:16 vertical frame, high fidelity, stable, no watermark, no subtitles, no platform UI',
    }),
    negativePrompt: 'watermark, account name, platform UI, copied face identity, subtitles, logo mismatch',
    scriptConfidence: 0,
    analysisNotes: [note],
  }
}

function fallbackAnalysisResult(input: AnalyzeInput, note: string): ScriptAnalysisResult {
  return {
    globalScript: {
      language: input.locale,
      summary: cleanText(note, 'Reference script fallback analysis.'),
      sellingLogic: '',
      hook: '',
      cta: '',
    },
    shots: input.shots.map((shot) => fallbackShot(shot, note, input.locale)),
  }
}

export function applyScriptAnalysisToShots(shots: ShotSpec[], result: ScriptAnalysisResult | null, failureNote?: string): ShotSpec[] {
  const byId = new Map((result?.shots ?? []).map((shot) => [shot.shotId, shot]))
  return shots.map((shot) => {
    const fallbackLocale: CloneLocale = result?.globalScript?.language === 'vi-VN' ? 'vi-VN' : 'zh-CN'
    const analyzed = byId.get(shot.id) ?? fallbackShot(shot, failureNote || 'script analysis fallback', fallbackLocale)
    const scriptRole = normalizeRole(analyzed.scriptRole)
    const scriptText = cleanText(analyzed.scriptText, cleanText(shot.scriptText, ''))
    const visualDescription = cleanText(analyzed.visualDescription, cleanText(shot.visualDescription, shot.visualPrompt || shot.visual || 'reference shot visual'))
    const actionDescription = cleanText(analyzed.actionDescription, cleanText(shot.actionDescription, shot.action || shot.visualPrompt || 'reference shot action'))
    const cameraDescription = cleanText(
      analyzed.cameraDescription,
      cleanText(shot.cameraDescription, `${shot.framing || 'closeup'} framing, ${shot.cameraMovement || shot.motion || 'static'} movement`),
    )
    const productFocus = cleanText(
      analyzed.productFocus,
      cleanText(shot.productFocus, 'preserve the visible product focus exactly as observed in the reference video'),
    )
    const generationPromptRestraint = cleanText(buildGenerationPromptRestraintText(), '')
    const generationPrompt = cleanText(
      analyzed.generationPrompt,
      cleanText(
        shot.generationPrompt,
        [scriptText, visualDescription, actionDescription, cameraDescription, productFocus, generationPromptRestraint].filter(Boolean).join('\n'),
      ),
    )
    const sanitizedGenerationPrompt =
      sanitizeJewelryGenerationPrompt(generationPrompt, shot.productType) || generationPrompt
    const resolvedStoryboardReferenceMode =
      inferStoryboardReferenceMode({
        analyzed,
        shot,
      }) ?? shot.storyboardReferenceMode
    const referenceDecision = inferStoryboardReferenceDecision({
      productType: shot.productType,
      shot: {
        ...shot,
        visualDescription,
        actionDescription,
        cameraDescription,
        productFocus,
        scriptText,
      },
      extraTexts: [
        analyzed.visualDescription,
        analyzed.actionDescription,
        analyzed.cameraDescription,
        analyzed.productFocus,
        analyzed.scriptText,
      ],
    })
    return {
      ...shot,
      storyboardSubjectType: referenceDecision.subjectType,
      storyboardReferenceMode: resolvedStoryboardReferenceMode,
      storyboardReferenceConfidence: referenceDecision.confidence,
      storyboardReferenceReason: referenceDecision.reasons,
      scriptText,
      scriptRole,
      narrationText: cleanText(analyzed.narrationText, shot.narrationText || '') || undefined,
      onScreenText: cleanText(analyzed.onScreenText, shot.onScreenText || '') || undefined,
      visualDescription,
      actionDescription,
      cameraDescription,
      productFocus,
      subjectPosition: analyzed.subjectPosition ?? shot.subjectPosition,
      sceneDescription: analyzed.sceneDescription ?? shot.sceneDescription,
      emotionDescription: analyzed.emotionDescription ?? shot.emotionDescription,
      textOverlay: analyzed.textOverlay ?? shot.textOverlay,
      generationPrompt: [sanitizedGenerationPrompt, generationPromptRestraint].filter(Boolean).join('\n'),
      negativePrompt: cleanText(analyzed.negativePrompt, shot.negativePrompt || shot.negativePromptHint || '') || undefined,
      scriptConfidence: clamp01(analyzed.scriptConfidence),
      analysisNotes: Array.from(new Set([...(shot.analysisNotes ?? []), ...(analyzed.analysisNotes ?? [])].map((x) => cleanText(x, '')).filter(Boolean))),
    }
  })
}

export async function analyzeProductStructureWithGrs(input: {
  credentials: ModelCredentials
  productReferenceImagePaths: string[]
  productCategory?: string
  locale: CloneLocale
}): Promise<ProductAnalysisResult> {
  const refs = (input.productReferenceImagePaths ?? []).map((item) => String(item || '').trim()).filter(Boolean)
  if (!refs.length) {
    return {
      category: cleanText(input.productCategory, 'general'),
      summary: 'No product references provided.',
      coreSubject: '',
      connectionStructure: '',
      materialDetails: '',
      wearingPosition: '',
      surfaceDetails: '',
      colorDetails: '',
      geometryDetails: '',
      sizeScale: '',
      matchingRules: [],
      rawDescription: '',
    }
  }

  const key = String(input.credentials.grsaiApiKey || '').trim()
  if (!key) throw new Error('未配置 GRS.AI API Key，无法分析商品结构')
  const host = cleanHost(input.credentials.grsaiHost)
  const model = cleanText(input.credentials.grsaiAnalysisModel, 'gemini-3.1-pro')
  const content: any[] = [
    {
      type: 'text',
      text: [
        'You are a senior product-structure analyst for AI image generation.',
        'Analyze the uploaded product images in extreme detail and output JSON only.',
        'Break the product down like peeling an onion: start from category, then core subject, then connection structure, then surface/material, then color, then geometry, then wearing or display position, then matching rules.',
        'Do not only output the product name. Output the physical structure and visual details that help an image model place it on a model with high fidelity.',
        'The result will be used as the highest-priority product lock for generating model-on-product storyboard images.',
        'Target language: English.',
        'Use concise production-ready English that can be injected directly into image-generation prompts.',
        'Return JSON only with this shape:',
        '{"category":"","summary":"","coreSubject":"","connectionStructure":"","materialDetails":"","wearingPosition":"","surfaceDetails":"","colorDetails":"","geometryDetails":"","sizeScale":"","matchingRules":[],"rawDescription":""}',
        `Known product category hint: ${cleanText(input.productCategory, 'general')}`,
      ].join('\n'),
    },
  ]
  for (const filePath of refs.slice(0, 6)) {
    content.push({ type: 'text', text: `reference image: ${filePath}` })
    content.push({ type: 'image_url', image_url: { url: await imageDataUrl(filePath) } })
  }

  const res = await fetch(`${host}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      stream: false,
      temperature: 0.2,
      messages: [
        { role: 'system', content: 'You are a strict JSON-only product-structure analyst.' },
        { role: 'user', content },
      ],
    }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`商品结构分析失败 HTTP ${res.status}: ${text.slice(0, 500)}`)
  const contentText = extractModelMessageContent(text)
  const jsonText = extractJsonObjectText(contentText)
  let parsed: any
  try {
    parsed = JSON.parse(jsonText)
  } catch (error: any) {
    throw new Error(`商品结构分析解析失败。provider=grsai model=${model} response=${cleanAiText(contentText).slice(0, 320)} reason=${String(error?.message ?? error)}`)
  }
  return {
    category: cleanText(parsed?.category, cleanText(input.productCategory, 'general')),
    summary: cleanText(parsed?.summary, ''),
    coreSubject: cleanText(parsed?.coreSubject, ''),
    connectionStructure: cleanText(parsed?.connectionStructure, ''),
    materialDetails: cleanText(parsed?.materialDetails, ''),
    wearingPosition: cleanText(parsed?.wearingPosition, ''),
    surfaceDetails: cleanText(parsed?.surfaceDetails, ''),
    colorDetails: cleanText(parsed?.colorDetails, ''),
    geometryDetails: cleanText(parsed?.geometryDetails, ''),
    sizeScale: cleanText(parsed?.sizeScale, ''),
    matchingRules: Array.isArray(parsed?.matchingRules) ? parsed.matchingRules.map((item: unknown) => cleanText(item, '')).filter(Boolean) : [],
    rawDescription: cleanText(parsed?.rawDescription, ''),
  }
}

function normalizeResult(parsed: any, input: AnalyzeInput): ScriptAnalysisResult {
  const rawGlobal =
    (parsed?.global_analysis && typeof parsed.global_analysis === 'object' ? parsed.global_analysis : null) ||
    (parsed?.globalScript && typeof parsed.globalScript === 'object' ? parsed.globalScript : {}) ||
    {}

  const globalScript: CloneGlobalScript = {
    language: cleanText(rawGlobal.language, input.locale),
    summary: cleanText(rawGlobal.summary || rawGlobal.video_type, ''),
    sellingLogic: cleanText(rawGlobal.sellingLogic || rawGlobal.conversion_strategy, ''),
    hook: cleanText(rawGlobal.hook || rawGlobal.hook_strategy, ''),
    cta: cleanText(rawGlobal.cta || rawGlobal.conversion_strategy, ''),
    content: cleanText(rawGlobal.content || rawGlobal.full_analysis || rawGlobal.analysis_text, ''),
    cameraMotion: cleanText(rawGlobal.cameraMotion || rawGlobal.camera_motion, ''),
    shotScale: cleanText(rawGlobal.shotScale || rawGlobal.shot_scale, ''),
    lighting: cleanText(rawGlobal.lighting, ''),
    colorTone: cleanText(rawGlobal.colorTone || rawGlobal.color_tone, ''),
    subjectAction: cleanText(rawGlobal.subjectAction || rawGlobal.subject_action, ''),
    environment: cleanText(rawGlobal.environment || rawGlobal.background_environment, ''),
    reversePrompt: cleanText(rawGlobal.reversePrompt || rawGlobal.reverse_prompt || rawGlobal.seedance_prompt, ''),
  }

  const rawShots = Array.isArray(parsed?.shots) ? parsed.shots : []
  const byId = new Map<string, any>()
  for (const raw of rawShots) {
    const id = cleanText(raw?.shotId ?? raw?.shot_id, '')
    if (id) byId.set(id, raw)
  }

  const shots = input.shots.map((shot) => {
    const raw = byId.get(shot.id)
    if (!raw) return fallbackShot(shot, 'GRS.AI output missed this shot; fallback generated locally', input.locale)
    const timing = clampShotWindow(
      Number(raw.startTime ?? raw.start_time ?? shot.startSec ?? 0),
      Number(raw.endTime ?? raw.end_time ?? shot.endSec ?? Number(shot.startSec || 0) + Number(shot.durationSec || 1.5)),
      Number(shot.startSec || 0),
      Number(shot.durationSec || 1.5),
    )
    const visualDescription = cleanAsciiEnglishText(raw.visualDescription ?? raw.visual_description, '')
    const actionDescription = cleanAsciiEnglishText(raw.actionDescription ?? raw.action, '')
    const cameraDescription = cleanAsciiEnglishText(raw.cameraDescription ?? raw.camera?.shot_type ?? raw.camera?.movement ?? raw.camera?.angle, '')
    const productFocus = cleanAsciiEnglishText(raw.productFocus ?? raw.product_display?.selling_point ?? raw.product_display?.focus_point, '')
    const sceneLocation = cleanAsciiEnglishText(raw.sceneDescription?.location ?? raw.scene?.location, '')
    const sceneBackground = cleanAsciiEnglishText(raw.sceneDescription?.background ?? raw.scene?.background, '')
    const sceneLighting = cleanAsciiEnglishText(raw.sceneDescription?.lighting ?? raw.scene?.lighting, '')
    const sceneStyle = cleanAsciiEnglishText(raw.sceneDescription?.style ?? raw.scene?.style, '')
    const normalizedScriptText = composeShotScriptText({
      locale: input.locale,
      visualDescription,
      actionDescription,
      cameraDescription,
      productFocus,
    })
    const normalizedGenerationPrompt = buildSevenDimensionPrompt({
      locale: input.locale,
      subject: visualDescription,
      action: actionDescription,
      scene: joinEnglishSegments([sceneLocation, sceneBackground]),
      lighting: sceneLighting,
      camera: cameraDescription,
      style: sceneStyle,
      quality: cleanAsciiEnglishText(
        raw.generationPrompt ?? raw.generation_prompt,
        '9:16 vertical frame, high fidelity, stable, no watermark, no subtitles, no platform UI',
      ),
    })
    return {
      shotId: shot.id,
      startTime: timing.startTime,
      endTime: timing.endTime,
      storyboardReferenceMode: normalizeStoryboardReferenceMode(raw.storyboardReferenceMode ?? raw.storyboard_reference_mode),
      scriptText: normalizedScriptText,
      scriptRole: normalizeRole(raw.scriptRole ?? raw.script_role),
      narrationText: cleanAsciiEnglishText(raw.narrationText ?? raw.narration_text, ''),
      onScreenText: cleanAsciiEnglishText(raw.onScreenText ?? raw.on_screen_text, ''),
      visualDescription,
      actionDescription,
      cameraDescription,
      productFocus,
      subjectPosition: {
        person: cleanAsciiEnglishText(raw.subjectPosition?.person ?? raw.subject_position?.person, ''),
        product: cleanAsciiEnglishText(raw.subjectPosition?.product ?? raw.subject_position?.product, ''),
        text: cleanAsciiEnglishText(raw.subjectPosition?.text ?? raw.subject_position?.text, ''),
      },
      sceneDescription: {
        location: sceneLocation,
        background: sceneBackground,
        lighting: sceneLighting,
        style: sceneStyle,
      },
      emotionDescription: {
        tone: cleanAsciiEnglishText(raw.emotionDescription?.tone ?? raw.emotion?.tone, ''),
        intensity: Number(raw.emotionDescription?.intensity ?? raw.emotion?.intensity ?? 0) || 0,
      },
      textOverlay: {
        content: cleanAsciiEnglishText(raw.textOverlay?.content ?? raw.text_overlay?.content, ''),
        position: cleanAsciiEnglishText(raw.textOverlay?.position ?? raw.text_overlay?.position, ''),
        fontSize: normalizeFontSize(raw.textOverlay?.fontSize ?? raw.text_overlay?.font_size),
        style: cleanAsciiEnglishText(raw.textOverlay?.style ?? raw.text_overlay?.style, ''),
        color: cleanAsciiEnglishText(raw.textOverlay?.color ?? raw.text_overlay?.color, ''),
        animation: cleanAsciiEnglishText(raw.textOverlay?.animation ?? raw.text_overlay?.animation, ''),
      },
      generationPrompt: normalizedGenerationPrompt,
      negativePrompt: cleanAsciiEnglishText(raw.negativePrompt ?? raw.negative_prompt, ''),
      scriptConfidence: clamp01(raw.scriptConfidence ?? raw.script_confidence),
      analysisNotes: Array.isArray(raw.analysisNotes ?? raw.analysis_notes)
        ? (raw.analysisNotes ?? raw.analysis_notes).map((x: unknown) => cleanAsciiEnglishText(x, '')).filter(Boolean)
        : [],
    }
  })

  const stitchedShotContent = shots
    .map((shot, index) => `${String(index + 1).padStart(2, '0')} ${cleanText(shot.scriptText, cleanText(shot.visualDescription, ''))}`.trim())
    .filter(Boolean)
    .join('\n')

  globalScript.content = stitchedShotContent || globalScript.content

  return { globalScript, shots }
}

function buildInstruction(input: AnalyzeInput) {
  const language = 'English'
  const timeline = input.shots
    .map(
      (shot) =>
        `${shot.id}: ${Number(shot.startSec || 0).toFixed(2)}-${Number(shot.endSec ?? 0).toFixed(2)}s, role=${shot.role || 'unknown'}, motion=${shot.cameraMovement || shot.motion || 'static'}, hint=${shot.visualPrompt || ''}`,
    )
    .join('\n')

  return [
    buildSilentCommercialGlobalRule(),
    'You are a strict reference-video forensic analyst for storyboard reconstruction.',
    `Output language: ${language}.`,
    `Target market: ${input.targetMarket || input.locale}. Product category: ${input.productCategory || 'general'}.`,
    'Analyze the uploaded reference video shot by shot and reconstruct only what is actually visible or reliably inferable from the video and sampled frames.',
    'Your job is faithful reconstruction, not creative improvement, not ad strategy optimization, and not rewriting the video into a stronger ecommerce script.',
    'If a detail is unclear, keep it minimal and conservative. Do not invent marketing claims, sales hooks, CTA language, or story beats that are not supported by the source video.',
    'Do not convert a weak or simple video into a standard ecommerce template. Do not add extra product benefits, audience assumptions, emotional arcs, or selling logic unless they are directly evident.',
    'Every analyzed shot must be 8.0 seconds or shorter. If a source beat appears longer than 8 seconds, reverse-engineer it into multiple finer consecutive shots.',
    'Be meticulous when reverse-engineering long actions, transitions, camera moves, product interactions, and human demonstrations. Split long beats into smaller factual sub-shots instead of keeping any shot above 8 seconds.',
    'Use the sampled frames together with shot boundaries to reconstruct the actual visual sequence as accurately as possible.',
    'For every shot, capture the observable facts: subject presence, product state, pose or movement, camera view or movement, visible environment, visible text, and the actual role this shot serves inside this specific video.',
    'Keep human presence exactly aligned with the source. If the source shows a model wearing or demonstrating the product, preserve that instead of collapsing the shot into a static product packshot.',
    'Map the analysis into these output fields: storyboardReferenceMode, cameraDescription, visualDescription, actionDescription, sceneDescription, emotionDescription, textOverlay, productFocus and analysisNotes.',
    'Set storyboard_reference_mode to product_closeup when the visible subject is primarily the product itself or the product plus a local body anchor such as earlobe, ear area, fingers, hands, wrist, neck or clavicle, and the person identity is not the point of the shot.',
    'Set storyboard_reference_mode to model_presentation when the visible subject is primarily the model identity, half body, portrait, face-centered presentation, upper-body try-on, or presenter-like human showcase.',
    'Do not let legacy labels such as model_demo decide this field automatically. A wearable shot can still be product_closeup if the frame is an extreme close-up focused on the product and local body anchor only.',
    'The generation_prompt field must be a factual reconstruction prompt for this exact shot, written in this order: subject + product state + scene + action + camera + lighting/color.',
    'The generation_prompt must stay grounded in observed content. Do not inject unobserved selling claims, conversion strategy, beautification instructions, or cinematic reinterpretation.',
    'Do not copy the original account identity, watermark, platform UI, or brand logo. Do not preserve the original real-person identity. If speech or text is unclear, leave it empty or minimal instead of guessing persuasive copy.',
    'Return ONLY valid JSON. No markdown. No explanation outside JSON.',
    'Use script_role values only from: hook,pain_point,solution,show,detail,proof,offer,cta,transition,unknown.',
    'Prefer omission over hallucination. Factual alignment to the reference video is the top priority.',
    'JSON shape:',
    '{"global_analysis":{"video_type":"","target_audience":"","core_selling_point":"","hook_strategy":"","conversion_strategy":"","emotion_curve":"","recommended_product_type":"","content":"","camera_motion":"","shot_scale":"","lighting":"","color_tone":"","subject_action":"","environment":"","reverse_prompt":""},"shots":[{"shot_id":"","time_range":"","storyboard_reference_mode":"product_closeup","script_role":"","script_text":"","narration_text":"","on_screen_text":"","visual_description":"","subject_position":{"person":"","product":"","text":""},"scene":{"location":"","background":"","lighting":"","style":""},"emotion":{"tone":"","intensity":1},"action":"","camera":{"shot_type":"","movement":"","angle":""},"product_display":{"method":"","focus_point":"","selling_point":""},"text_overlay":{"content":"","position":"","font_size":"medium","style":"","color":"","animation":""},"transition":"","generation_prompt":"","negative_prompt":"","script_confidence":0.8,"analysis_notes":[]}],"key_shots":[{"shot_id":"","reason":""}]}',
    'Shot timeline:',
    timeline,
  ].join('\n')
}

export async function analyzeReferenceScriptWithGrs(input: AnalyzeInput): Promise<ScriptAnalysisResult> {
  if (process.env.CLONE_SCRIPT_ANALYZER_MOCK === '1') {
    return {
      globalScript: {
        language: input.locale,
        summary: 'Mock viral product script analysis.',
        sellingLogic: 'Hook, product demonstration, proof, CTA.',
        hook: 'Mock hook',
        cta: 'Mock CTA',
      },
      shots: input.shots.map((shot) => fallbackShot(shot, 'dev mock script analysis', input.locale)),
    }
  }

  if (input.credentials.chatProviderPrimary === 'apifox_hub') {
    const apifox = await generateChatCompletion({
      credentials: input.credentials,
      system: 'You are a strict JSON-only multimodal video script analyst.',
      prompt: buildInstruction(input),
    })
    if (!apifox.content) {
      return fallbackAnalysisResult(input, `VectorEngine 脚本分析返回为空。provider=${apifox.provider} model=${apifox.model}`)
    }
    try {
      const parsed = parseModelJsonPayload(apifox.content).parsed
      return normalizeResult(parsed, input)
    } catch (e: any) {
      return fallbackAnalysisResult(
        input,
        `VectorEngine 脚本分析解析失败。provider=${apifox.provider} model=${apifox.model} endpointStyle=${apifox.endpointStyle} response=${cleanAiText(apifox.content).slice(0, 280)} reason=${String(e?.message ?? e)}`,
      )
    }
  }

  const key = String(input.credentials.grsaiApiKey || '').trim()
  if (!key) throw new Error('未配置 GRS.AI API Key，无法进行爆款脚本多模态分析')

  const host = cleanHost(input.credentials.grsaiHost)
  const model = cleanText(input.credentials.grsaiAnalysisModel, 'gemini-3.1-pro')
  const content: any[] = [{ type: 'text', text: buildInstruction(input) }]

  for (const shot of input.shots) {
    const frames = shot.referenceFramePaths ?? {}
    for (const [kind, filePath] of Object.entries(frames)) {
      if (!filePath) continue
      content.push({ type: 'text', text: `${shot.id} ${kind} frame` })
      content.push({ type: 'image_url', image_url: { url: await imageDataUrl(filePath) } })
    }
  }

  const res = await fetch(`${host}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      stream: false,
      temperature: 0.2,
      messages: [
        { role: 'system', content: 'You are a strict JSON-only multimodal video script analyst.' },
        { role: 'user', content },
      ],
    }),
  })

  const text = await res.text()
  if (!res.ok) throw new Error(`GRS.AI 脚本分析失败 HTTP ${res.status}: ${text.slice(0, 500)}`)

  const contentText = extractModelMessageContent(text)
  if (!contentText) {
    return fallbackAnalysisResult(input, `GRS.AI 脚本分析返回为空，已自动降级。provider=grsai model=${model}`)
  }

  try {
    const parsed = parseModelJsonPayload(text).parsed
    return normalizeResult(parsed, input)
  } catch (e: any) {
    return fallbackAnalysisResult(
      input,
      `GRS.AI 脚本分析解析失败，已自动降级。provider=grsai model=${model} response=${cleanAiText(contentText).slice(0, 280)} reason=${String(e?.message ?? e)}`,
    )
  }
}
