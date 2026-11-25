/**
 * 图生图（商品图素材）：拆解视频取帧、衍生图提示词。电脑端 product-image-materials 和云端 / 网页共用。
 */

import { BUILTIN_PRODUCT_CATEGORIES, productCategoryPromptName, type ProductCategory } from './productCategories'

export type ImageMaterialCategory = ProductCategory
export const IMAGE_MATERIAL_CATEGORIES: ImageMaterialCategory[] = [...BUILTIN_PRODUCT_CATEGORIES]
export const MAX_SCENE_SEGMENTS = 16
export const MAX_SCENE_SEGMENT_DURATION_SEC = 8
export const MIN_SEGMENT_DURATION_SEC = 0.5
export const MAX_BACKGROUND_VARIANT_COUNT = 6

/** 日常场景：室内、室外、光线错开，咖啡厅只占一个 */
export const BACKGROUND_VARIANT_SCENES = [
  'a bright bedroom with rumpled white linen and soft morning window light',
  'a leafy city park bench with dappled green shade and people far in the background',
  'a kitchen counter with fresh fruit, a water glass, and clear daylight',
  'a quiet seaside with pale sand, blue water, and clean open light',
  'a simple dressing table with a small mirror and everyday skincare bottles without labels',
  'an old town street with colorful painted walls and late afternoon sun',
  'a library or bookstore aisle with rows of books softly blurred behind',
  'an apartment balcony with potted plants and fresh morning air',
  'a car passenger seat by the window with passing daylight outside',
  'a flower shop corner with fresh blooms, kraft paper, and cool daylight',
  'a living room sofa with a knitted throw and soft daylight',
  'a local fresh market lane with colorful produce blurred behind',
  'a light wooden study desk with a notebook, pencil, and side window light',
  'a garden lawn with wildflowers and soft golden hour light',
  'a modern office window seat with a city view and cool neutral light',
  'a picnic blanket on grass with bread, fruit, and open shade',
  'a fitting room or wardrobe with hanging clothes in neutral colors and soft indoor light',
  'a rooftop terrace at dusk with a calm sky and distant city lights',
  'a white tiled bathroom vanity with a folded towel and clean daylight',
  'a riverside walkway with railings, water reflections, and overcast soft light',
  'a small art studio table with paper, brushes, and north window light',
  'a train or metro window seat with soft moving scenery outside',
  'a neighborhood cafe table by the window with a plain cup and natural daylight',
  'an outdoor stone step near a house entrance with textured walls and side sunlight',
] as const

/** 提示词里写 {scene}，每张图自动换成不同的场景；没写就完全按提示词来 */
export const SCENE_SLOT = '{scene}'

export const DEFAULT_DERIVED_IMAGE_PROMPT = [
  'Create a realistic lifestyle product photograph using the uploaded image as the exact product reference.',
  'Keep the product identical in shape, proportions, material, color, pattern, texture, hardware, markings, and all visible details.',
  'Do not redesign, replace, duplicate, or add products. Keep the product sharp and recognizable.',
  `Place it naturally in this setting: ${SCENE_SLOT}. Build a completely new background and do not reuse the original one.`,
  'Show the item being worn, held, or used only when that suits this kind of product. Keep any person or hands anatomically natural and secondary to the product.',
  'Use realistic light and colors that fit the setting. Avoid a studio, showroom, staged advertisement, text, logos, or watermarks.',
].join('\n')

/** 旧版默认提示词（只会出咖啡厅）：用户没改过的，读取时换成新的默认 */
const LEGACY_DERIVED_IMAGE_PROMPT = [
  'Create a realistic lifestyle product photograph using the uploaded image as the exact product reference.',
  'Keep the jewelry identical in shape, proportions, metal, color, gemstones, texture, markings, and all visible details.',
  'Do not redesign, replace, duplicate, or add jewelry. Keep the product sharp and recognizable.',
  'Place it naturally in a believable everyday setting, such as a neighborhood cafe with dark walnut furniture, charcoal wood, warm pendant lighting, and deep softly blurred shadows, or a relaxed local home scene.',
  'Allow natural hands to hold or present the item when appropriate. Keep hands anatomically natural and secondary to the product.',
  'Use realistic warm ambient light, visible detail in the shadows, and restrained high contrast. Avoid a studio, showroom, staged advertisement, text, logos, or watermarks.',
].join('\n')
const LEGACY_DERIVED_PROMPT_NAME = 'Cafe and Everyday Scenes'
export const DEFAULT_DERIVED_PROMPT_NAME = 'Everyday Scenes'
export function upgradeDerivedPrompt<T extends { name: string; prompt: string }>(version: T): T {
  if (version.prompt.replace(/\r\n/g, '\n').trim() !== LEGACY_DERIVED_IMAGE_PROMPT) return version
  return { ...version, name: version.name.replace(LEGACY_DERIVED_PROMPT_NAME, DEFAULT_DERIVED_PROMPT_NAME), prompt: DEFAULT_DERIVED_IMAGE_PROMPT }
}

let deck: string[] = []
let lastScene = ''
/** 像洗牌一样抽场景：全部用过一遍才会重复，多张原图之间也不重样 */
export function nextVariantScene() {
  if (!deck.length) {
    deck = [...BACKGROUND_VARIANT_SCENES]
    for (let i = deck.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[deck[i], deck[j]] = [deck[j]!, deck[i]!]
    }
    if (deck[deck.length - 1] === lastScene) deck.reverse()
  }
  lastScene = deck.pop()!
  return lastScene
}

/** 图生图（上传商品图） */
export function buildImageVariantPrompt(input: { category: ImageMaterialCategory; template: string }) {
  const template = input.template.includes(SCENE_SLOT) ? input.template.replaceAll(SCENE_SLOT, nextVariantScene()) : input.template
  return `${template} Product category: ${productCategoryPromptName(input.category)}.`
}

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
  template: string
}) {
  const selectedScene = nextVariantScene()
  return [
    'You are a realistic lifestyle product photography system.',
    input.template.replaceAll(SCENE_SLOT, selectedScene),
    'Keep the product exactly identical to the reference image.',
    'Create a brand-new everyday environment that feels authentic, natural, and casually photographed.',
    'The final image should look like an ordinary person naturally taking a photo during daily life, not a commercial advertisement.',
    'The product is the highest priority.',
    'Keep exactly the same shape, proportions, size, material, color, pattern, surface texture, finish, hardware, small parts, thickness, reflections, and design details.',
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
    'Use only natural, believable lighting that fits this scene.',
    'Keep natural shadows, natural reflections, realistic neutral white balance, comfortable contrast, and natural exposure.',
    'Use shallow depth of field so the background is softly blurred while the product stays perfectly sharp.',
    'The image should feel spontaneous, relaxed, comfortable, lived-in, authentic, and human.',
    'It should look like someone casually picked up the product and took a quick phone photo in less than five seconds.',
    'Never make it look staged, luxury, catalog, influencer-commercial, e-commerce-studio, or AI-generated.',
    'Avoid cinematic camera angles, ultra-wide distortion, exaggerated perspective, HDR effect, oversaturation, fake sunlight, or artificial glow.',
    `Product category: ${productCategoryPromptName(input.category)}.`,
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
    'different product',
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
