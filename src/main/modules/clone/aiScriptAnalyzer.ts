import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import { cleanAiText, extractModelMessageContent, parseModelJsonPayload } from './aiResponse'
import { generateChatCompletion } from './unifiedChat'
import type { CloneGlobalScript, CloneLocale, ModelCredentials, ScriptRole, ShotSpec } from './types'

type FrameSet = {
  start?: string
  mid?: string
  end?: string
}

export type ScriptShotAnalysis = {
  shotId: string
  startTime: number
  endTime: number
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

function cleanHost(value?: string) {
  return String(value || 'https://grsaiapi.com').trim().replace(/\/+$/, '') || 'https://grsaiapi.com'
}

function cleanText(value: unknown, fallback = '') {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim()
  return text || fallback
}

function clamp01(value: unknown) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(1, n))
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

function fallbackShot(shot: AnalyzeInput['shots'][number], note: string): ScriptShotAnalysis {
  const visual = cleanText(shot.visualPrompt, 'reference product demonstration shot')
  const action = cleanText(shot.action, visual)
  const camera = cleanText(shot.cameraMovement || shot.motion, 'same camera movement as reference shot')
  return {
    shotId: shot.id,
    startTime: Number(shot.startSec || 0),
    endTime: Number(shot.endSec ?? Number(shot.startSec || 0) + Number(shot.durationSec || 1.5)),
    scriptText: '',
    scriptRole: shot.index === 0 ? 'hook' : 'unknown',
    narrationText: '',
    onScreenText: '',
    visualDescription: visual,
    actionDescription: action,
    cameraDescription: `${shot.framing || 'closeup'} framing, ${camera}`,
    productFocus: 'keep the product visible and consistent with the reference selling logic',
    subjectPosition: { person: '', product: 'center', text: '' },
    sceneDescription: { location: '', background: '', lighting: '', style: '' },
    emotionDescription: { tone: '', intensity: 0 },
    textOverlay: { content: '', position: '', fontSize: 'medium', style: '', color: '', animation: '' },
    generationPrompt: [visual, action, camera].filter(Boolean).join('. '),
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
      sellingLogic: 'Fallback structure: hook, solution, proof, CTA.',
      hook: input.locale === 'zh-CN' ? '开头快速建立产品吸引点。' : 'Mo dau tao hook nhanh cho san pham.',
      cta: input.locale === 'zh-CN' ? '结尾给出明确行动号召。' : 'Ket thuc bang CTA ro rang.',
    },
    shots: input.shots.map((shot) => fallbackShot(shot, note)),
  }
}

export function applyScriptAnalysisToShots(shots: ShotSpec[], result: ScriptAnalysisResult | null, failureNote?: string): ShotSpec[] {
  const byId = new Map((result?.shots ?? []).map((shot) => [shot.shotId, shot]))
  return shots.map((shot) => {
    const analyzed = byId.get(shot.id) ?? fallbackShot(shot, failureNote || 'script analysis fallback')
    const scriptRole = normalizeRole(analyzed.scriptRole)
    const scriptText = cleanText(analyzed.scriptText, cleanText(shot.scriptText, ''))
    const visualDescription = cleanText(analyzed.visualDescription, cleanText(shot.visualDescription, shot.visualPrompt || shot.visual || 'reference shot visual'))
    const actionDescription = cleanText(analyzed.actionDescription, cleanText(shot.actionDescription, shot.action || shot.visualPrompt || 'reference shot action'))
    const cameraDescription = cleanText(
      analyzed.cameraDescription,
      cleanText(shot.cameraDescription, `${shot.framing || 'closeup'} framing, ${shot.cameraMovement || shot.motion || 'static'} movement`),
    )
    const productFocus = cleanText(analyzed.productFocus, cleanText(shot.productFocus, 'clear product demonstration purpose'))
    const generationPrompt = cleanText(
      analyzed.generationPrompt,
      cleanText(shot.generationPrompt, [scriptText, visualDescription, actionDescription, cameraDescription, productFocus].filter(Boolean).join('\n')),
    )
    return {
      ...shot,
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
      generationPrompt,
      negativePrompt: cleanText(analyzed.negativePrompt, shot.negativePrompt || shot.negativePromptHint || '') || undefined,
      scriptConfidence: clamp01(analyzed.scriptConfidence),
      analysisNotes: Array.from(new Set([...(shot.analysisNotes ?? []), ...(analyzed.analysisNotes ?? [])].map((x) => cleanText(x, '')).filter(Boolean))),
    }
  })
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
  }

  const rawShots = Array.isArray(parsed?.shots) ? parsed.shots : []
  const byId = new Map<string, any>()
  for (const raw of rawShots) {
    const id = cleanText(raw?.shotId ?? raw?.shot_id, '')
    if (id) byId.set(id, raw)
  }

  const shots = input.shots.map((shot) => {
    const raw = byId.get(shot.id)
    if (!raw) return fallbackShot(shot, 'GRS.AI output missed this shot; fallback generated locally')
    return {
      shotId: shot.id,
      startTime: Number(raw.startTime ?? raw.start_time ?? shot.startSec ?? 0),
      endTime: Number(raw.endTime ?? raw.end_time ?? shot.endSec ?? Number(shot.startSec || 0) + Number(shot.durationSec || 1.5)),
      scriptText: cleanText(raw.scriptText ?? raw.script_text, ''),
      scriptRole: normalizeRole(raw.scriptRole ?? raw.script_role),
      narrationText: cleanText(raw.narrationText ?? raw.narration_text, ''),
      onScreenText: cleanText(raw.onScreenText ?? raw.on_screen_text, ''),
      visualDescription: cleanText(raw.visualDescription ?? raw.visual_description, ''),
      actionDescription: cleanText(raw.actionDescription ?? raw.action, ''),
      cameraDescription: cleanText(raw.cameraDescription ?? raw.camera?.shot_type ?? raw.camera?.movement ?? raw.camera?.angle, ''),
      productFocus: cleanText(raw.productFocus ?? raw.product_display?.selling_point ?? raw.product_display?.focus_point, ''),
      subjectPosition: {
        person: cleanText(raw.subjectPosition?.person ?? raw.subject_position?.person, ''),
        product: cleanText(raw.subjectPosition?.product ?? raw.subject_position?.product, ''),
        text: cleanText(raw.subjectPosition?.text ?? raw.subject_position?.text, ''),
      },
      sceneDescription: {
        location: cleanText(raw.sceneDescription?.location ?? raw.scene?.location, ''),
        background: cleanText(raw.sceneDescription?.background ?? raw.scene?.background, ''),
        lighting: cleanText(raw.sceneDescription?.lighting ?? raw.scene?.lighting, ''),
        style: cleanText(raw.sceneDescription?.style ?? raw.scene?.style, ''),
      },
      emotionDescription: {
        tone: cleanText(raw.emotionDescription?.tone ?? raw.emotion?.tone, ''),
        intensity: Number(raw.emotionDescription?.intensity ?? raw.emotion?.intensity ?? 0) || 0,
      },
      textOverlay: {
        content: cleanText(raw.textOverlay?.content ?? raw.text_overlay?.content, ''),
        position: cleanText(raw.textOverlay?.position ?? raw.text_overlay?.position, ''),
        fontSize: normalizeFontSize(raw.textOverlay?.fontSize ?? raw.text_overlay?.font_size),
        style: cleanText(raw.textOverlay?.style ?? raw.text_overlay?.style, ''),
        color: cleanText(raw.textOverlay?.color ?? raw.text_overlay?.color, ''),
        animation: cleanText(raw.textOverlay?.animation ?? raw.text_overlay?.animation, ''),
      },
      generationPrompt: cleanText(raw.generationPrompt ?? raw.generation_prompt, ''),
      negativePrompt: cleanText(raw.negativePrompt ?? raw.negative_prompt, ''),
      scriptConfidence: clamp01(raw.scriptConfidence ?? raw.script_confidence),
      analysisNotes: Array.isArray(raw.analysisNotes ?? raw.analysis_notes)
        ? (raw.analysisNotes ?? raw.analysis_notes).map((x: unknown) => cleanText(x, '')).filter(Boolean)
        : [],
    }
  })

  return { globalScript, shots }
}

function buildInstruction(input: AnalyzeInput) {
  const language = input.locale === 'zh-CN' ? 'Chinese' : 'Vietnamese'
  const timeline = input.shots
    .map(
      (shot) =>
        `${shot.id}: ${Number(shot.startSec || 0).toFixed(2)}-${Number(shot.endSec ?? 0).toFixed(2)}s, role=${shot.role || 'unknown'}, motion=${shot.cameraMovement || shot.motion || 'static'}, hint=${shot.visualPrompt || ''}`,
    )
    .join('\n')

  return [
    'You are a top-tier TikTok ecommerce short-video director, storyboard designer, and paid-ads strategist.',
    `Output language: ${language}.`,
    `Target market: ${input.targetMarket || input.locale}. Product category: ${input.productCategory || 'general'}.`,
    'Analyze the uploaded viral reference video shot by shot. This is not a generic summary. It is a structured reconstruction script used to regenerate a new ecommerce short video.',
    'For every shot, extract: selling purpose, person position, product position, scene, emotion, camera movement, on-screen text content with position and size, product display method, narration or subtitle meaning, an AI-video-ready generation prompt, and the must-avoid list.',
    'Do not copy the original account identity, watermark, platform UI, or brand logo. Do not preserve the original real-person identity. When speech is unclear, infer the script from the visuals.',
    'Return ONLY valid JSON. No markdown. No explanation outside JSON.',
    'Use script_role values only from: hook,pain_point,solution,show,detail,proof,offer,cta,transition,unknown.',
    'Prioritize realistic ecommerce reconstruction, reusable prompt detail, and mobile-native visual language.',
    'JSON shape:',
    '{"global_analysis":{"video_type":"","target_audience":"","core_selling_point":"","hook_strategy":"","conversion_strategy":"","emotion_curve":"","recommended_product_type":""},"shots":[{"shot_id":"","time_range":"","script_role":"","script_text":"","narration_text":"","on_screen_text":"","visual_description":"","subject_position":{"person":"","product":"","text":""},"scene":{"location":"","background":"","lighting":"","style":""},"emotion":{"tone":"","intensity":1},"action":"","camera":{"shot_type":"","movement":"","angle":""},"product_display":{"method":"","focus_point":"","selling_point":""},"text_overlay":{"content":"","position":"","font_size":"medium","style":"","color":"","animation":""},"transition":"","generation_prompt":"","negative_prompt":"","script_confidence":0.8,"analysis_notes":[]}],"key_shots":[{"shot_id":"","reason":""}]}',
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
      shots: input.shots.map((shot) => fallbackShot(shot, 'dev mock script analysis')),
    }
  }

  if (input.credentials.chatProviderPrimary === 'apifox_hub') {
    const apifox = await generateChatCompletion({
      credentials: input.credentials,
      system: 'You are a strict JSON-only multimodal video script analyst.',
      prompt: buildInstruction(input),
    })
    if (!apifox.content) {
      return fallbackAnalysisResult(input, `ai666 脚本分析返回为空。provider=${apifox.provider} model=${apifox.model}`)
    }
    try {
      const parsed = parseModelJsonPayload(apifox.content).parsed
      return normalizeResult(parsed, input)
    } catch (e: any) {
      return fallbackAnalysisResult(
        input,
        `ai666 脚本分析解析失败。provider=${apifox.provider} model=${apifox.model} endpointStyle=${apifox.endpointStyle} response=${cleanAiText(apifox.content).slice(0, 280)} reason=${String(e?.message ?? e)}`,
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
