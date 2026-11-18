/**
 * 图生图（商品图素材）：拆解视频取帧、衍生图提示词。电脑端 product-image-materials 和云端 / 网页共用。
 */

export type ImageMaterialCategory = 'necklace' | 'ring' | 'earring' | 'bracelet'
export const IMAGE_MATERIAL_CATEGORIES: ImageMaterialCategory[] = ['necklace', 'ring', 'earring', 'bracelet']
export const IMAGE_MATERIAL_CATEGORY_LABEL: Record<ImageMaterialCategory, string> = { necklace: '项链', ring: '戒指', earring: '耳环', bracelet: '手链' }
export const MAX_SCENE_SEGMENTS = 16
export const MAX_SCENE_SEGMENT_DURATION_SEC = 8
export const MIN_SEGMENT_DURATION_SEC = 0.5
export const MAX_BACKGROUND_VARIANT_COUNT = 6

export const BACKGROUND_VARIANT_SCENES = [
  'a neighborhood cafe with dark walnut tables, charcoal wood paneling, warm pendant lights, rich shadows, and a softly blurred coffee bar',
  'a cozy coffee shop corner with espresso-brown furniture, low warm ambient light, deep background tones, and natural high contrast',
  'an ordinary Southeast Asian bedroom with warm window light and a lived-in bedside table',
  'a normal local living room with a sofa edge, soft daylight, and everyday home details',
  'a simple bedroom dressing table with natural daylight and lightly used daily objects',
  'a real window-side home corner with calm natural light and plain wall texture',
  'a modest local apartment interior with realistic household surfaces and soft ambient light',
  'a casual study corner with a simple desk, notebook, and soft side window light',
  'a home office corner with practical clutter, natural reflections, and relaxed daily atmosphere',
  'a balcony-side table with humid daylight, real apartment context, and ordinary local texture',
  'a small wardrobe or entrance table area with natural indoor light and believable daily-use objects',
] as const

export const DEFAULT_DERIVED_IMAGE_PROMPT = [
  'Create a realistic lifestyle product photograph using the uploaded image as the exact product reference.',
  'Keep the jewelry identical in shape, proportions, metal, color, gemstones, texture, markings, and all visible details.',
  'Do not redesign, replace, duplicate, or add jewelry. Keep the product sharp and recognizable.',
  'Place it naturally in a believable everyday setting, such as a neighborhood cafe with dark walnut furniture, charcoal wood, warm pendant lighting, and deep softly blurred shadows, or a relaxed local home scene.',
  'Allow natural hands to hold or present the item when appropriate. Keep hands anatomically natural and secondary to the product.',
  'Use realistic warm ambient light, visible detail in the shadows, and restrained high contrast. Avoid a studio, showroom, staged advertisement, text, logos, or watermarks.',
].join('\n')

export type VideoSegment = {
  startSec: number
  endSec: number
  durationSec: number
}

export function computeFrameTimeSec(segment: VideoSegment) {
  const duration = Number(segment.durationSec || 0)
  if (!Number.isFinite(duration) || duration <= MIN_SEGMENT_DURATION_SEC) return null
  const safeOffset = Math.max(0.3, Math.min(0.8, duration * 0.12))
  const safeStart = segment.startSec + safeOffset
  const safeEnd = segment.endSec - safeOffset
  if (safeEnd <= safeStart + 0.05) return null
  return Number(((safeStart + safeEnd) / 2).toFixed(3))
}

export function buildBackgroundVariantPrompt(input: {
  category: ImageMaterialCategory
  variantIndex: number
  template: string
}) {
  const selectedScene = BACKGROUND_VARIANT_SCENES[input.variantIndex % BACKGROUND_VARIANT_SCENES.length]
  return [
    'You are a realistic lifestyle product photography system.',
    input.template,
    'Keep the product exactly identical to the reference image.',
    'Create a brand-new everyday environment that feels authentic, natural, and casually photographed.',
    'The final image should look like an ordinary person naturally taking a photo during daily life, not a commercial advertisement.',
    'The product is the highest priority.',
    'Keep exactly the same shape, proportions, size, material, color, surface texture, metal finish, gemstones, engravings, hanging parts, thickness, reflections, and design details.',
    'Do not redesign, simplify, improve, beautify, generate missing details, replace materials, or change proportions.',
    'The product must remain visually identical to the reference.',
    'Keep the overall composition similar.',
    'The product remains the main subject.',
    'Keep the framing as a natural phone-camera photo with slightly imperfect composition and natural breathing space around the subject.',
    'Do not recreate the original background.',
    'Do not imitate the reference environment.',
    'Do not copy the desk, laptop, furniture, lighting setup, or room from the source image.',
    'Treat the reference background as completely replaceable.',
    'Generate a completely new everyday environment.',
    `Choose exactly one realistic lifestyle scene for this generation: ${selectedScene}.`,
    'This scene must feel local, ordinary, and believable, with subtle daily-use objects only when naturally appropriate.',
    'Everyday scene details must feel casually present, never intentionally arranged, never showroom-like, and never commercially decorated.',
    'Use only natural lighting such as soft window light, warm afternoon light, golden hour, or gentle indoor ambient light.',
    'Keep natural shadows, natural reflections, realistic white balance, slightly warm tones, comfortable contrast, and natural exposure.',
    'Use shallow depth of field so the background is softly blurred while the product stays perfectly sharp.',
    'The image should feel spontaneous, relaxed, comfortable, lived-in, warm, authentic, and human.',
    'It should look like someone casually picked up the product and took a quick phone photo in less than five seconds.',
    'Never make it look staged, luxury, catalog, influencer-commercial, e-commerce-studio, or AI-generated.',
    'Avoid cinematic camera angles, ultra-wide distortion, exaggerated perspective, HDR effect, oversaturation, fake sunlight, or artificial glow.',
    `Product category: ${input.category}.`,
    'Do not add extra products, packaging, text, logos, subtitles, watermarks, or props that change the scene meaning.',
  ].join(' ')
}

export function backgroundVariantNegativePrompt() {
  return [
    'copy reference background',
    'same room',
    'same furniture',
    'same laptop',
    'same desk',
    'same lighting setup',
    'change product',
    'different jewelry',
    'extra accessories',
    'extra product',
    'text',
    'logo',
    'watermark',
    'packaging',
    'commercial studio',
    'premium studio',
    'luxury showroom',
    'advertising set',
    'high-end display stand',
    'overdesigned background',
    'fake lifestyle set',
    'product display table',
    'catalog background',
    'editorial backdrop',
    'showroom',
    'exhibition',
    'seamless paper backdrop',
    'floating product',
    'glossy commercial lighting',
    'lens flare',
    'bloom',
    'cgi look',
    'rendering style',
    'ai artifacts',
    'excessive bokeh',
    'fake sunlight',
    'unrealistic reflections',
    'unnatural fingers',
    'exaggerated skin smoothing',
    'deformed geometry',
    'wrong color',
    'duplicate object',
  ].join(', ')
}

export function fallbackCuts(duration: number): number[] {
  if (duration <= 6) return [0, duration]
  if (duration <= 12) return [0, duration * 0.35, duration * 0.72, duration]
  if (duration <= 20) return [0, duration * 0.2, duration * 0.42, duration * 0.62, duration * 0.82, duration]
  return [0, duration * 0.14, duration * 0.29, duration * 0.43, duration * 0.58, duration * 0.72, duration * 0.86, duration]
}

export function toSegments(duration: number, cuts: number[]): VideoSegment[] {
  const points = [...cuts].filter((value) => value >= 0 && value <= duration).sort((a, b) => a - b)
  if (!points.length || points[0] > 0.02) points.unshift(0)
  if (points[points.length - 1] < duration) points.push(duration)

  const merged: number[] = []
  for (const point of points) {
    const prev = merged[merged.length - 1]
    if (prev == null || Math.abs(prev - point) > 0.12) merged.push(point)
  }

  const segments: VideoSegment[] = []
  for (let index = 0; index < merged.length - 1; index += 1) {
    const startSec = round3(merged[index]!)
    const endSec = round3(merged[index + 1]!)
    const durationSec = Math.max(MIN_SEGMENT_DURATION_SEC, round3(endSec - startSec))
    if (durationSec <= MAX_SCENE_SEGMENT_DURATION_SEC) {
      segments.push({ startSec, endSec, durationSec })
      continue
    }

    const splitCount = Math.max(2, Math.ceil(durationSec / MAX_SCENE_SEGMENT_DURATION_SEC))
    const splitDuration = durationSec / splitCount
    for (let splitIndex = 0; splitIndex < splitCount; splitIndex += 1) {
      const subStart = round3(startSec + splitDuration * splitIndex)
      const subEnd = splitIndex === splitCount - 1 ? endSec : round3(startSec + splitDuration * (splitIndex + 1))
      const subDuration = Math.max(MIN_SEGMENT_DURATION_SEC, round3(subEnd - subStart))
      segments.push({ startSec: subStart, endSec: subEnd, durationSec: subDuration })
    }
  }

  return segments.slice(0, MAX_SCENE_SEGMENTS)
}

export function round3(value: number) {
  return Math.round(value * 1000) / 1000
}
