import { cleanAiText, extractModelMessageContent, parseModelJsonPayload } from './aiResponse'
import type { ModelCredentials, ShotSpec, ShotVariant, ShotVariantScore } from './types'

type ScoreInput = {
  credentials: ModelCredentials
  shot: ShotSpec
  variants: ShotVariant[]
  targetProductId?: string
}

function cleanHost(value?: string) {
  return String(value || 'https://grsaiapi.com').trim().replace(/\/+$/, '') || 'https://grsaiapi.com'
}

function cleanText(value: unknown, fallback = '') {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim()
  return text || fallback
}

function clampScore(value: unknown) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(10, Number(n.toFixed(2))))
}

function buildPrompt(input: ScoreInput) {
  return [
    'You are a TikTok GMV-focused ad evaluator for ecommerce short-video creatives.',
    'Score the following shot variants. Weak copy, fake-looking visuals, or high duplicate risk must be penalized hard.',
    'Score dimensions: hookScore, engagementScore, conversionScore, gmvScore, realismScore, duplicateRiskScore, totalScore. All scores must be 0-10.',
    'Recommended weighted formula: 0.25*hook + 0.15*engagement + 0.30*conversion + 0.20*gmv + 0.10*realism - 0.15*duplicateRisk.',
    'Do not inflate scores. Prefer realistic, simple, mobile-native, product-clear, conversion-oriented variants.',
    'Return JSON only:',
    '{"variant_scores":[{"variantId":"","hookScore":0,"engagementScore":0,"conversionScore":0,"gmvScore":0,"realismScore":0,"duplicateRiskScore":0,"totalScore":0,"reason":"","suggestion":""}]}',
    `shotId: ${input.shot.id}, role: ${input.shot.scriptRole}`,
    `targetProductId: ${input.targetProductId || ''}`,
    'variants:',
    JSON.stringify(
      input.variants.map((v) => ({
        id: v.id,
        scriptRole: v.scriptRole,
        styleType: v.styleType,
        scriptText: v.scriptText,
        visualDescription: v.visualDescription,
        actionDescription: v.actionDescription,
        cameraDescription: v.cameraDescription,
        productDisplay: v.productDisplay,
        textOverlay: v.textOverlay,
      })),
      null,
      2,
    ),
  ].join('\n')
}

export async function scoreShotVariantsWithAi(input: ScoreInput): Promise<ShotVariantScore[]> {
  const key = String(input.credentials.grsaiApiKey || '').trim()
  if (!key) throw new Error('未配置 GRS.AI API Key，无法进行变体评分')
  const host = cleanHost(input.credentials.grsaiHost)
  const model = cleanText(input.credentials.grsaiAnalysisModel, 'gemini-3.1-pro')
  const res = await fetch(`${host}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      stream: false,
      temperature: 0.2,
      messages: [
        { role: 'system', content: 'You are a strict JSON-only TikTok ad variant scorer.' },
        { role: 'user', content: buildPrompt(input) },
      ],
    }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`分镜变体评分失败 HTTP ${res.status}: ${text.slice(0, 500)}`)
  let parsed: any
  try {
    parsed = parseModelJsonPayload(text).parsed
  } catch {
    const content = extractModelMessageContent(text)
    throw new Error(`变体评分未返回合法 JSON。provider=grsai model=${model} response=${cleanAiText(content).slice(0, 280) || cleanAiText(text).slice(0, 280)}`)
  }
  const raw = Array.isArray(parsed?.variant_scores) ? parsed.variant_scores : []
  if (!raw.length) {
    const content = extractModelMessageContent(text)
    throw new Error(`变体评分结果为空。provider=grsai model=${model} response=${cleanAiText(content).slice(0, 280)}`)
  }
  return raw.map((item: any) => ({
    variantId: cleanText(item?.variantId, ''),
    hookScore: clampScore(item?.hookScore),
    engagementScore: clampScore(item?.engagementScore),
    conversionScore: clampScore(item?.conversionScore),
    gmvScore: clampScore(item?.gmvScore),
    realismScore: clampScore(item?.realismScore),
    duplicateRiskScore: clampScore(item?.duplicateRiskScore),
    totalScore: clampScore(item?.totalScore),
    reason: cleanText(item?.reason, ''),
    suggestion: cleanText(item?.suggestion, ''),
  }))
}
