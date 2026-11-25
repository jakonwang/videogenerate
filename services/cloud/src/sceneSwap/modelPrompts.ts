import { PRODUCT_REPLACEMENT_PROMPT } from '../../../../src/shared/productReplacementPrompt'
import type { ProductView, SceneSwapCheck, SceneSwapSize, SceneSwapTask, TryonShot } from '../../../../src/shared/sceneSwap'

/** AI 修图 · 生成模特图 / 换模特 / 换商品的提示词和质检 */
const REASON_HINT: Record<string, string> = {
  衣服变了: 'A previous attempt changed the garment. Copy its color, print, logo, buttons, seams, length and fabric exactly.',
  版型不对: 'A previous attempt changed the fit. Match the silhouette, length, sleeve and neckline of the product photos exactly.',
  不像所选模特: 'A previous attempt did not look like the chosen model. Match the face, hair and skin tone of the model photo exactly.',
  手脚不对: 'Hands, fingers, feet and limbs must be anatomically correct.',
  姿势变了: 'The pose, hand position, framing and crop must stay exactly as in image 1.',
  光线假: 'Lighting must match the surroundings naturally, with soft contact shadows.',
  比例不对: 'Scale and proportions must be natural: people life-size compared with the surroundings, products at their real size.',
  商品不对: 'A previous attempt did not match the product. Copy its shape, proportions, color, material, print, logo and details exactly.',
  其他地方变了: 'A previous attempt changed other parts of image 1. Everything except the product must stay exactly the same.',
  没换干净: 'A previous attempt left parts of the original product. Remove every trace of it.',
}
const hints = (reasons: string[]) => reasons.map((reason) => REASON_HINT[reason]).filter(Boolean) as string[]

const SHOT: Record<TryonShot, string> = {
  front: 'Full-body front view, standing relaxed, head to shoes fully inside the frame.',
  side: 'Full-body three-quarter side view, head to shoes fully inside the frame.',
  half: 'Half-body front view from head to hip.',
  detail: 'Close-up of the garment worn on the torso, showing fabric, print and seams. Crop below the chin so the face is not visible.',
  back: 'Full-body back view showing the back of the garment exactly as in the back product photo. The face is not visible.',
  seated: 'Seated naturally, full garment visible, head to shoes inside the frame.',
}
const VIEW: Record<ProductView, string> = { front: 'front', back: 'back', detail: 'detail' }
const REAL = 'Photorealistic e-commerce fashion photo, natural skin, correct hands and feet, exactly one person. No text, watermark, collage or mannequin.'
const MODEL_REF = 'It may be a contact sheet showing the same person from several angles; use it only for identity and ignore the clothes worn there.'

/** 参考图顺序：产品图 → 模特 → 场景（可无）→ 主图（可无） */
export function tryOnPrompt(input: { views: ProductView[]; scene: boolean; master: boolean; shot: TryonShot; size: SceneSwapSize; reasons: string[] }) {
  let n = input.views.length + 1
  return [
    `Images 1 to ${input.views.length} are photos of one garment product (${input.views.map((view, index) => `image ${index + 1}: ${VIEW[view]}`).join(', ')}). Image ${n} is the model. Create one photo of this model wearing this garment.`,
    'The garment must be identical to the product photos: same color, print position and scale, logo, buttons, pockets, seams, neckline, sleeve and hem length, fabric texture and fit. Do not redesign, simplify or add anything.',
    `Keep the face, hair, skin tone and body shape of the model in image ${n}. ${MODEL_REF}`,
    input.scene ? `Image ${(n += 1)} is the location: place the model there with matching perspective, scale and contact shadows. Remove any people from it.` : 'Plain light studio background with soft even light.',
    input.master
      ? `Image ${(n += 1)} is an approved photo from the same shoot: keep the same person, garment, styling, shoes, location and lighting, but use the new pose and framing below.`
      : 'If the product is only a top or only a bottom, complete the outfit with simple plain neutral pieces and plain shoes.',
    SHOT[input.shot],
    input.size === '3:4' || input.size === '1:1' ? 'Leave a clear empty margin above the head and below the feet.' : '',
    REAL,
    ...hints(input.reasons),
  ].filter(Boolean).join('\n')
}

/** 参考图顺序：已穿好衣服的原图 → 新模特 → 场景（可无） */
export function modelSwapPrompt(input: { scene: boolean; reasons: string[] }) {
  return [
    `Image 1 is a fashion photo. Image 2 is another model. Replace only the person in image 1 with the model from image 2. ${MODEL_REF.replace('It', 'Image 2')}`,
    'Use the face, hair and skin tone of image 2 everywhere skin is visible, including neck, arms, hands and legs. The original person must not be recognizable.',
    'Keep the pose, hand position, framing, crop and accessories of image 1.',
    'Keep the garment of image 1 identical: same color, print, logo, folds, seams, length, fabric and fit.',
    input.scene ? 'Image 3 is a location: use it as the new background with matching perspective, scale, lighting and contact shadows.' : 'Keep the background and lighting of image 1 unchanged.',
    REAL,
    ...hints(input.reasons),
  ].join('\n')
}

/** 参考图顺序：要改的图 → 新商品（1–4 张） */
export function productSwapPrompt(input: { products: number; reasons: string[] }) {
  return [
    PRODUCT_REPLACEMENT_PROMPT,
    `Image${input.products > 1 ? `s 2 to ${input.products + 1} show` : ' 2 shows'} the target product. If image 1 contains several items of that kind, replace only the main one. If a person wears or holds it, keep the same person, pose and way of wearing or holding.`,
    'If the target product photo includes a model, hands or a background, ignore them and use only the product.',
    ...hints(input.reasons),
  ].join('\n')
}

type Key = SceneSwapCheck['key']
/** 细节和背面看不到脸，不查像不像 */
export function modelCheckKeys(task: SceneSwapTask, shot?: TryonShot): Key[] {
  if (task === 'product') return ['product', 'scene', 'limbs', 'light']
  if (task === 'model') return ['color', 'pattern', 'model', 'pose', 'limbs']
  if (shot === 'detail') return ['color', 'pattern', 'shape']
  if (shot === 'back') return ['color', 'pattern', 'shape', 'limbs']
  return ['color', 'pattern', 'shape', 'model', 'limbs']
}

/** 图片顺序：原图或产品图 → 模特 → 成品 */
export function modelInspectPrompt(task: SceneSwapTask, keys: Key[]) {
  if (task === 'product') {
    return [
      'Image 1 is the original photo; image 2 is the target product; image 3 is image 1 with its main product replaced. Judge image 3 as a strict e-commerce photo reviewer.',
      '"product": true if the product in image 3 matches image 2 in shape, color, material, print and details, and nothing of the original product remains, otherwise false',
      '"scene": true if people, pose, hands, background, framing and all other objects in image 3 are the same as in image 1, otherwise false',
      '"limbs": true if any hands, limbs and faces in image 3 are anatomically correct (also true if there are none), otherwise false',
      '"light": true if size, perspective, lighting and shadows of the product look natural, otherwise false',
      'Answer with one JSON object only, with exactly these boolean keys.',
    ].join('\n')
  }
  const rules: Partial<Record<Key, string>> = {
    color: 'the garment color in image 3 is the same as in image 1',
    pattern: 'the garment print, logo, buttons, seams and fabric in image 3 are the same as in image 1',
    shape: 'the neckline, sleeves, length and silhouette in image 3 match image 1, judging only what is visible',
    model: task === 'model' ? 'the person in image 3 looks like the person in image 2 and no longer like the person in image 1' : 'the person in image 3 looks like the person in image 2',
    pose: 'pose, framing and hand position in image 3 match image 1',
    limbs: 'hands, feet, limbs and face in image 3 are anatomically correct and there is exactly one person',
  }
  return [
    `Image 1 is ${task === 'model' ? 'the original fashion photo' : 'a product photo of the garment'}; image 2 is the chosen model (ignore the clothes there); image 3 is the result. Judge image 3 as a strict e-commerce photo reviewer.`,
    ...keys.map((key) => `"${key}": true if ${rules[key]}, otherwise false`),
    'Answer with one JSON object only, with exactly these boolean keys.',
  ].join('\n')
}
