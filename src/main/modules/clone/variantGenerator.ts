import { randomUUID } from 'node:crypto'
import { cleanAiText, extractModelMessageContent, parseModelJsonPayload } from './aiResponse'
import { buildSilentCommercialGlobalRule } from './prompt'
import type { CloneProductType, ModelCredentials, ShotSpec, ShotVariant } from './types'

type GenerateVariantsInput = {
  credentials: ModelCredentials
  shot: ShotSpec
  variantsPerShot: number
  strategy?: 'balanced' | 'low_cost' | 'high_conversion' | 'anti_duplicate'
  targetMarket?: string
  productCategory?: CloneProductType
  productInfo?: string
}

function cleanHost(value?: string) {
  return String(value || 'https://grsaiapi.com').trim().replace(/\/+$/, '') || 'https://grsaiapi.com'
}

function cleanText(value: unknown, fallback = '') {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim()
  return text || fallback
}

function normalizeStyleType(value: unknown): ShotVariant['styleType'] {
  const v = String(value ?? '').trim()
  if (v === 'real_person' || v === 'product_closeup' || v === 'comparison' || v === 'aesthetic' || v === 'minimal' || v === 'emotional') return v
  return v === 'no_person' ? 'no_person' : 'real_person'
}

function normalizeRole(value: unknown): ShotSpec['scriptRole'] {
  const v = String(value ?? '').trim()
  if (v === 'hook' || v === 'pain_point' || v === 'solution' || v === 'show' || v === 'detail' || v === 'proof' || v === 'offer' || v === 'cta' || v === 'transition') return v
  return 'unknown'
}

function buildPrompt(input: GenerateVariantsInput) {
  const shotJson = JSON.stringify(
    {
      id: input.shot.id,
      scriptRole: input.shot.scriptRole,
      scriptText: input.shot.scriptText,
      visualDescription: input.shot.visualDescription,
      actionDescription: input.shot.actionDescription,
      cameraDescription: input.shot.cameraDescription,
      productFocus: input.shot.productFocus,
      textOverlay: input.shot.textOverlay ?? {},
      generationPrompt: input.shot.generationPrompt,
    },
    null,
    2,
  )
  return [
    buildSilentCommercialGlobalRule(),
    'You are an elite TikTok ecommerce creative director specialized in generating non-duplicate but still high-converting short-video shot variants.',
    'Generate multiple variants for the given original shot while preserving the selling logic.',
    `Strategy: ${input.strategy || 'balanced'}`,
    `Target market: ${input.targetMarket || 'vi-VN'}`,
    `Product category: ${input.productCategory || 'general'}`,
    'Goal: keep the original selling intent, but make the visuals, copy, scene, action, camera language, and composition meaningfully different to reduce duplication risk.',
    'Human presence must remain a product-supporting device rather than the main attraction.',
    'Forced variation rules: person, scene, action, lens language, wording, and composition must change.',
    `Variant count: ${Math.max(1, Math.floor(input.variantsPerShot))}`,
    'Distribution target: at least 30% product_closeup, at least 20% no_person or weak-person presence, and at least 30% realistic daily-life scenes.',
    'Do not generate watermark, logo, platform UI, garbled text, broken product identity, or fake exaggerated CGI aesthetics.',
    'Return JSON only with the following structure:',
    '{"variants":[{"id":"","shotId":"","scriptRole":"","styleType":"","scriptText":"","visualDescription":"","sceneDescription":"","actionDescription":"","cameraDescription":"","productDisplay":"","textOverlay":{"content":"","position":"","fontSize":"","style":""},"generationPrompt":"","negativePrompt":"","variationTags":[]}]}',
    'Original shot:',
    shotJson,
    'Product info:',
    cleanText(input.productInfo, 'N/A'),
  ].join('\n')
}

export async function generateShotVariantsWithAi(input: GenerateVariantsInput): Promise<ShotVariant[]> {
  const key = String(input.credentials.grsaiApiKey || '').trim()
  if (!key) throw new Error('未配置 GRS.AI API Key，无法生成分镜变体')
  const host = cleanHost(input.credentials.grsaiHost)
  const model = cleanText(input.credentials.grsaiAnalysisModel, 'gemini-3.1-pro')
  const res = await fetch(`${host}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      stream: false,
      temperature: 0.65,
      messages: [
        { role: 'system', content: 'You are a strict JSON-only ecommerce shot-variant generator.' },
        { role: 'user', content: buildPrompt(input) },
      ],
    }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`分镜变体生成失败 HTTP ${res.status}: ${text.slice(0, 500)}`)
  let parsed: any
  try {
    parsed = parseModelJsonPayload(text).parsed
  } catch {
    const content = extractModelMessageContent(text)
    throw new Error(`变体生成未返回合法 JSON。provider=grsai model=${model} response=${cleanAiText(content).slice(0, 280) || cleanAiText(text).slice(0, 280)}`)
  }
  const raw = Array.isArray(parsed?.variants) ? parsed.variants : []
  if (!raw.length) {
    const content = extractModelMessageContent(text)
    throw new Error(`变体生成结果为空。provider=grsai model=${model} response=${cleanAiText(content).slice(0, 280)}`)
  }
  const createdAt = Date.now()
  return raw.map((item: any, idx: number) => ({
    id: cleanText(item?.id, randomUUID()),
    shotId: cleanText(item?.shotId, input.shot.id),
    scriptRole: normalizeRole(item?.scriptRole ?? input.shot.scriptRole),
    styleType: normalizeStyleType(item?.styleType),
    scriptText: cleanText(item?.scriptText, input.shot.scriptText),
    visualDescription: cleanText(item?.visualDescription, input.shot.visualDescription),
    sceneDescription: cleanText(item?.sceneDescription, input.shot.sceneDescription?.location || input.shot.sceneDescription?.background || ''),
    actionDescription: cleanText(item?.actionDescription, input.shot.actionDescription),
    cameraDescription: cleanText(item?.cameraDescription, input.shot.cameraDescription),
    productDisplay: cleanText(item?.productDisplay, input.shot.productFocus),
    textOverlay: {
      content: cleanText(item?.textOverlay?.content, input.shot.textOverlay?.content || ''),
      position: cleanText(item?.textOverlay?.position, input.shot.textOverlay?.position || 'center'),
      fontSize: cleanText(item?.textOverlay?.fontSize, input.shot.textOverlay?.fontSize || 'medium'),
      style: cleanText(item?.textOverlay?.style, input.shot.textOverlay?.style || 'clean'),
    },
    generationPrompt: cleanText(item?.generationPrompt, input.shot.generationPrompt),
    negativePrompt: cleanText(item?.negativePrompt, input.shot.negativePrompt || ''),
    variationTags: Array.isArray(item?.variationTags) ? item.variationTags.map((x: unknown) => cleanText(x, '')).filter(Boolean) : [],
    createdAt: createdAt + idx,
  }))
}
