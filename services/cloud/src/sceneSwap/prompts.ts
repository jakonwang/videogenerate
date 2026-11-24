import type { SceneSwapCheck, SceneSwapMode } from '../../../../src/shared/sceneSwap'
import type { MaskStats } from './compose'

const REASON_HINT: Record<string, string> = {
  光线假: 'Use soft, even, neutral lighting that would suit an average studio photo of a person.',
  比例不对: 'Pay special attention to realistic scale: furniture, doors and props must be life-size next to an adult standing in the marked place.',
  边缘不干净: 'Keep the area behind the person simple and low-contrast.',
  衣服变了: 'The garment must be identical to image 1: same color, print, logo, seams, buttons, length and fabric.',
  脸变了: 'The face, hair, hands and body shape must be identical to image 1.',
}
const VARIATIONS = ['Straight-on view.', 'Shift the camera slightly to the left.', 'Shift the camera slightly to the right.', 'Step the camera slightly back.']
const hints = (reasons: string[]) => reasons.map((reason) => REASON_HINT[reason]).filter(Boolean)
const pct = (value: number) => `${Math.round(value * 100)}%`

/** 保真模式：只要空背景，人物位置用文字说明，避免模型把人画进去 */
export function platePrompt(input: { stats: MaskStats; width: number; height: number; variation: number; reasons: string[] }) {
  const { box, bottom } = input.stats
  const full = !bottom
  return [
    'Image 1 is a location. Create a photorealistic EMPTY background photo of this same location, keeping its style, materials, colors and mood.',
    'Absolutely no people, mannequins, body parts, reflections of people, clothes, text, logos or watermarks. If image 1 contains people, remove them.',
    full
      ? `An adult will later be pasted standing with the feet at ${pct(box.y1 / input.height)} of the image height and the head at ${pct(box.y0 / input.height)}, horizontally around ${pct((box.x0 + box.x1) / 2 / input.width)}. Show a clear open floor there, with perspective and scale matching an eye-level full-body photo.`
      : `An adult cropped at the bottom edge will later be pasted, with the head at ${pct(box.y0 / input.height)} of the image height, horizontally around ${pct((box.x0 + box.x1) / 2 / input.width)}. Match an eye-level half-body photo: the background is a little further away and slightly out of focus.`,
    'Keep that area uncluttered. Natural soft light, no strong color cast.',
    VARIATIONS[input.variation % VARIATIONS.length]!,
    ...hints(input.reasons),
  ].join('\n')
}

export function blendPrompt(reasons: string[]) {
  return [
    'Image 1 is a fashion photo. Image 2 is a location. Replace only the background of image 1 with the location in image 2.',
    'Keep the person and the garment identical to image 1: face, hair, pose, hands, body shape, garment color, print, logo, fabric, seams, length and accessories. Keep the same framing and crop.',
    'Match perspective, scale and contact shadows so it looks like a real photo taken there. Lighting on the person may change only slightly; garment color must not change.',
    'No text, watermark or extra people.',
    ...hints(reasons),
  ].join('\n')
}

const KEYS: Record<SceneSwapMode, Array<SceneSwapCheck['key']>> = { keep: ['edge', 'light'], blend: ['color', 'pattern', 'face', 'edge', 'light'] }

export function inspectPrompt(mode: SceneSwapMode) {
  const rules: Record<string, string> = {
    color: 'garment color is the same',
    pattern: 'garment print, logo, seams and length are the same',
    face: 'face, hair, hands and pose are the same and anatomically correct',
    edge: 'the outline of the person is clean (no halo, missing parts or leftover old background)',
    light: 'scale, perspective and light look plausible, and there is no extra person in the background',
  }
  return [
    'Image 1 is the original fashion photo; image 2 is the same person in a new background. Judge image 2 as a strict e-commerce photo reviewer.',
    ...KEYS[mode].map((key) => `"${key}": true if ${rules[key]}, otherwise false`),
    'Answer with one JSON object only, with exactly these boolean keys.',
  ].join('\n')
}

/** 看不懂的回答一律算 unknown，不当成通过 */
export function parseInspection(mode: SceneSwapMode, text: string): SceneSwapCheck[] {
  let json: Record<string, unknown> = {}
  try {
    json = JSON.parse(/\{[\s\S]*\}/.exec(text)?.[0] ?? '{}')
  } catch {
    json = {}
  }
  return KEYS[mode].map((key) => ({ key, level: json[key] === true ? 'ok' : json[key] === false ? 'warn' : 'unknown' }))
}
