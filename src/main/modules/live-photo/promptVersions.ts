import { createHash, randomUUID } from 'node:crypto'
import {
  activateLivePhotoPromptVersionInSqlite,
  readActiveLivePhotoPromptVersionFromSqlite,
  readLivePhotoPromptVersionsFromSqlite,
  upsertLivePhotoPromptVersionInSqlite,
} from './sqlite'
import type { LivePhotoPromptKind, LivePhotoPromptVersion, SaveLivePhotoPromptVersionInput } from './types'

export const DEFAULT_LIVE_PHOTO_REPLACEMENT_PROMPT = [
  'Replace the product in Image 1 with the exact physical product from Image 2 while preserving the original scene, composition, lighting, and atmosphere of Image 1.',
  '',
  'Treat the product in Image 2 as the only source of truth for the product. Preserve its text, colors, materials, textures, proportions, structure, and all visible details exactly as shown. Do not redesign, recreate, recolor, reshape, simplify, or modify the product in any way.',
  '',
  'Allow only natural environmental adaptation, including realistic ambient lighting, reflections, highlights, and stable contact shadows consistent with Image 1. These lighting effects must not alter the product\'s original appearance or identity.',
  '',
  'The replacement should be seamlessly integrated into Image 1 with no cut-and-paste artifacts, appearing as if the product had always been part of the original photograph.',
].join('\n')

/** 视频提示词里的占位：提交时换成这个商品的分类规则和商品分析 */
export const LIVE_PHOTO_PRODUCT_RULES_SLOT = '{product_rules}'

/** 图生视频一直在用的完整提示词（近乎静止、锁定商品） */
export const DEFAULT_LIVE_PHOTO_VIDEO_PROMPT = [
  'ROLE:',
  'You are a product-motion video system for a locked still image.',
  '',
  'GOAL:',
  'Create a realistic 6-second product close-up clip with extremely subtle motion.',
  '',
  'CORE LOCK:',
  '',
  'Keep:',
  '',
  '* same crop',
  '* same pose',
  '* same framing',
  '* same scene',
  '* same visible subject portion',
  '* same exact visible product instance',
  '* same exact product size',
  '',
  '---',
  '',
  'STRUCTURE LOCK:',
  '',
  '* Preserve the exact visible structure, silhouette, proportions, connection points, orientation, and local anchor placement from the locked still.',
  '* Preserve the exact same visible product geometry from the locked still.',
  '* The product in every frame must remain the same single product instance, not a regenerated approximation.',
  '* Keep exact clasp logic, hinge logic, connector spacing, stone count, edge rhythm, thickness, and attachment layout when visible.',
  '* The locked still image is the master product structure reference for the video stage.',
  '',
  'NO INFERENCE RULE:',
  '',
  '* Do not infer, reconstruct, redesign, beautify, simplify, or generate unseen product parts.',
  '* Do not average multiple possible shapes.',
  '* Do not fabricate a cleaner, more symmetric, or more readable version of the product.',
  '* If a detail is ambiguous, keep the locked-still interpretation instead of inventing a new structure.',
  '* If motion would require rebuilding the product, suppress motion instead of changing product structure.',
  '',
  'FRAME-TO-FRAME IDENTITY LOCK:',
  '',
  '* Treat the product as the exact same frozen object instance across all frames.',
  '* Treat the product pixels as fully frozen across the full clip and do not animate the product body itself.',
  '* Do not morph, wobble, stretch, re-topologize, thicken, thin, bend, or re-attach any product part between frames.',
  '* Do not translate, rotate, swing, bounce, breathe, sway, or drift any visible product region.',
  '* Do not introduce new perspective-derived product geometry that is not already supported by the locked still.',
  '* If any frame starts to change product silhouette or connector layout, keep the previous frame identity instead.',
  '',
  'REFERENCE PRIORITY:',
  '',
  '* The locked still image is both the scene anchor and the product identity anchor for the video stage.',
  '* Do not introduce any alternate product interpretation beyond what is already visible in the locked still image.',
  '* The locked still anchor controls scene, crop, pose, anchor position, visible product pose, and visible product structure.',
  '* If motion conflicts with exact product identity, preserve the locked still identity and suppress motion.',
  '',
  LIVE_PHOTO_PRODUCT_RULES_SLOT,
  '',
  'FAIL-CLOSED PRODUCT IDENTITY RULE:',
  '',
  '* Do not add any pearl, pendant, charm, extra dangling drop, extra loop, extra bow layer, extra gemstone cluster, or extra decorative volume that is not clearly present in the locked still image.',
  '* Do not upscale a petite or small product into a larger statement piece.',
  '* Do not convert a simple product into a richer, heavier, longer, or more luxurious-looking version.',
  '* If motion would cause the product to become larger, more decorative, or structurally richer, keep the product exactly as shown in the locked still image and suppress motion further.',
  '',
  'SCALE LOCK:',
  '',
  '* Keep the exact same product footprint size and product-to-scene ratio from the locked still.',
  '* Do not enlarge the product for readability, drama, or emphasis.',
  '* Do not shrink the surrounding scene, face, ear, hand, or body area to make the product appear larger.',
  '* The apparent product size change across the full clip must remain negligible and must not rely on push-in, pull-back, refocus behavior, or any simulated camera approach.',
  '* If any frame tends to enlarge, stylize, or simplify the product, keep the earlier locked-still scale instead.',
  '* Do not move the product relative to the frame, scene anchor, or supporting body anchor at all.',
  '',
  '---',
  '',
  'CAMERA:',
  '',
  'Use ONLY one motion style:',
  '',
  '-> locked-camera near-static hold with the product fully frozen and only tiny non-product micro-movement already implied by the still',
  '',
  'STRICT RULES:',
  '',
  '* keep the camera effectively locked in place',
  '* total visible movement must be extremely small and barely noticeable',
  '* apparent size change across the full clip must remain negligible',
  '* treat the clip as a still image where the product stays fully frozen and only non-product regions may acquire a faint natural sense of life',
  '* if motion causes any structure drift, reduce motion further until the product stays stable',
  '* no camera travel',
  '* no lens breathing feel',
  '* no floating drift larger than a tiny micro shift',
  '* no jitter',
  '* no vibration',
  '',
  'FORBIDDEN:',
  '',
  '* any push-in motion',
  '* any pull-back motion',
  '* zoom in then out',
  '* noticeable camera travel',
  '* simulated camera approach',
  '* simulated camera retreat',
  '* multi-direction movement',
  '* side-to-side sway',
  '* orbiting motion',
  '* reframing during the clip',
  '* fast approach toward the product',
  '* focus breathing',
  '* rack focus',
  '* refocusing behavior',
  '* scale pumping',
  '',
  'The video should feel almost static.',
  '',
  '---',
  '',
  'LIGHTING:',
  '',
  '* natural daylight only',
  '* soft, diffused light',
  '* stable exposure across entire clip',
  '',
  'FORBIDDEN:',
  '',
  '* lighting change',
  '* flicker',
  '* artificial glow or bloom',
  '',
  'ALLOW:',
  '',
  '* normal real-world reflections (metal, glass, leather)',
  '',
  '---',
  '',
  'PRODUCT BEHAVIOR (IMPORTANT):',
  '',
  'Adjust based on product type:',
  '',
  '* all products -> product body remains fully frozen with no self-motion',
  '* rigid products -> no deformation',
  '* flexible products -> allow natural deformation',
  '* reflective products -> allow natural reflections',
  '',
  'DO NOT:',
  '',
  '* distort structure',
  '* redesign product',
  '* re-interpret the product shape',
  '* replace the product with a cleaner substitute',
  '* move the product itself',
  '* animate the product itself',
  '',
  '---',
  '',
  'MOTION RULE:',
  '',
  '* the product itself must remain completely still across all frames',
  '* only tiny non-product micro-movement already consistent with the locked still is allowed',
  '* allowed motion must come from non-product regions only, such as a minute lighting shimmer, hair micro-shift, fabric micro-shift, or body micro-breathing that does not move the product anchor',
  '* no exaggerated motion',
  '* no intentional animation',
  '* do not introduce any new camera move to create energy',
  '* do not let any allowed ambient motion drag, swing, rotate, deform, or reposition the product',
  '* do not expand the crop to reveal new visible face regions or new body regions',
  '* if the starting still has no visible hands or fingers, every frame must remain completely free of added hands, fingers, palms, wrists, forearms, or skin-contact gestures',
  '* if the starting still is a product-only or flat-lay scene, keep it product-only and do not introduce any new body parts at all',
  '',
  'BODY-CONTROL RULE:',
  '',
  '* preserve the exact same visible crop boundaries from the starting still',
  '* do not reveal a full face, eyes, nose, mouth, or a wider identity-bearing portrait view',
  '* keep the clip as a partial non-identity-bearing crop only',
  '* do not transform the partial crop into a recognizable real-person portrait',
  '* do not sharpen, uncover, reconstruct, complete, or reveal identity-bearing face details',
  '* do not add hands, fingers, palms, wrists, forearms, or skin-contact gestures that are not already visible in the starting still',
  '* do not introduce holding, pinching, gripping, presenting, or touching actions around the product',
  '* do not let any hand enter from the edge of the frame later in the clip',
  '* do not add any off-frame person presence whose body parts newly appear in frame',
  '',
  'If a partial body crop already exists:',
  '',
  '* keep it partial and non-identity-bearing',
  '* allow only tiny natural movement without revealing more anatomy',
  '',
  '---',
  '',
  'STYLE:',
  '',
  '* natural product close-up capture',
  '* clean casual e-commerce realism',
  '* soft everyday camera feel',
  '',
  '---',
  '',
  'ANTI-OVERGENERATION:',
  '',
  'Do NOT make the product:',
  '',
  '* bigger',
  '* clearer',
  '* shinier',
  '* more prominent',
  '',
  '---',
  '',
  'OUTPUT:',
  '',
  '* 6-second video',
  '* extremely subtle motion',
  '* visually almost static',
  '* perfect product consistency',
  '* no newly revealed identity-bearing face content',
  '* zero product reconstruction',
  '* product remains fully frozen',
  '',
  'The product must remain visually identical across all frames.',
].join('\n')

/** 短版：镜头轻微推近、光影和人物自然微动，商品本身不变；默认不启用，用户在「提示词版本」里选 */
export const GENTLE_LIVE_PHOTO_VIDEO_PROMPT = [
  'Animate this exact photo into a realistic 6-second vertical product clip. The photo is the first frame and the only reference.',
  '',
  'CAMERA: one slow, smooth push-in toward the product, about 5 to 8 percent closer by the end, at constant speed. The whole frame gets closer together; the product is never enlarged on its own. No cuts, no zoom back, no orbit, no shake.',
  '',
  'LIGHT: soft natural light moves gently across the scene so that highlights glide over the product. Exposure and colors stay stable.',
  '',
  'LIFE: only what is already in the photo may move, slightly and naturally: hair, fabric, breathing, a small shift of a hand that is already visible, background leaves or light. A product that hangs or is worn may follow the body with tiny natural movement.',
  '',
  'PRODUCT: it stays the same single item in every frame, with the same shape, size relative to the body, color, material, stones, clasps, prints, and attachment point. Never redesign, morph, simplify, duplicate, or add parts. If motion would change the product, move less.',
  '',
  LIVE_PHOTO_PRODUCT_RULES_SLOT,
  '',
  'DO NOT add people, hands, text, logos, or props that are not in the photo, and do not reveal a face that is out of frame. Natural phone-camera look, not a studio commercial.',
].join('\n')
export const GENTLE_LIVE_PHOTO_VIDEO_PROMPT_ID = 'live-photo-video-gentle-push-in'

/** 「近乎静止」是内置完整版；换成别的提示词时，反向提示词不能再禁止推近和微动 */
export const isStillLivePhotoVideoPrompt = (prompt: string) => prompt.replace(/\r\n/g, '\n').trim() === DEFAULT_LIVE_PHOTO_VIDEO_PROMPT

/** 5.0.125 起页面上显示的占位短句，从来没有用在视频上：没改过的换成真正在用的完整提示词 */
const PLACEHOLDER_VIDEO_PROMPT = 'Create a realistic six-second product close-up video with subtle natural motion while preserving the exact product identity and composition.'

/** 用户的视频提示词原样发送：只有写了 {product_rules} 的地方才换成商品特征，没写就不额外加任何内容 */
export function fillLivePhotoVideoPrompt(template: string, productRules: string) {
  const slotLine = `${LIVE_PHOTO_PRODUCT_RULES_SLOT}\n\n`
  if (!template.includes(LIVE_PHOTO_PRODUCT_RULES_SLOT)) return template
  return productRules ? template.split(LIVE_PHOTO_PRODUCT_RULES_SLOT).join(productRules) : template.split(slotLine).join('').split(LIVE_PHOTO_PRODUCT_RULES_SLOT).join('')
}

export function hashLivePhotoPrompt(prompt: string) {
  return createHash('sha256').update(String(prompt || ''), 'utf8').digest('hex')
}

function normalizePromptVersion(input: LivePhotoPromptVersion): LivePhotoPromptVersion {
  const saved = String(input.prompt || '').trim()
  const prompt = input.kind === 'video' && saved === PLACEHOLDER_VIDEO_PROMPT ? DEFAULT_LIVE_PHOTO_VIDEO_PROMPT : saved
  return {
    ...input,
    name: String(input.name || '').trim() || `Prompt V${input.version}`,
    prompt,
    promptHash: hashLivePhotoPrompt(prompt),
    active: Boolean(input.active),
    kind: input.kind || 'image',
  }
}

function ensureDefaultPromptVersions() {
  const existing = readLivePhotoPromptVersionsFromSqlite().map(normalizePromptVersion)
  const timestamp = Date.now()
  const defaults: Array<{ kind: LivePhotoPromptKind; name: string; prompt: string }> = [
    { kind: 'image', name: 'Live Photo Product Replacement', prompt: DEFAULT_LIVE_PHOTO_REPLACEMENT_PROMPT },
    { kind: 'video', name: 'Live Photo Video Motion', prompt: DEFAULT_LIVE_PHOTO_VIDEO_PROMPT },
  ]
  for (const item of defaults) {
    if (existing.some((version) => version.kind === item.kind)) continue
    const seeded = normalizePromptVersion({
      id: randomUUID(),
      name: item.name,
      version: 1,
      prompt: item.prompt,
      promptHash: hashLivePhotoPrompt(item.prompt),
      active: true,
      createdAt: timestamp,
      updatedAt: timestamp,
      kind: item.kind,
    })
    upsertLivePhotoPromptVersionInSqlite(seeded)
    existing.push(seeded)
  }
  // 固定 id：只补一次，用户改过也不会再盖回来
  if (!existing.some((version) => version.id === GENTLE_LIVE_PHOTO_VIDEO_PROMPT_ID)) {
    const seeded = normalizePromptVersion({
      id: GENTLE_LIVE_PHOTO_VIDEO_PROMPT_ID,
      name: '轻微推近（短版）',
      version: Math.max(0, ...existing.filter((version) => version.kind === 'video').map((version) => version.version)) + 1,
      prompt: GENTLE_LIVE_PHOTO_VIDEO_PROMPT,
      promptHash: '',
      active: false,
      createdAt: timestamp,
      updatedAt: timestamp,
      kind: 'video',
    })
    upsertLivePhotoPromptVersionInSqlite(seeded)
    existing.push(seeded)
  }
  return existing
}

export const livePhotoPromptVersionService = {
  list(kind: LivePhotoPromptKind = 'image') {
    return ensureDefaultPromptVersions().filter((item) => (item.kind || 'image') === kind).sort((a, b) => b.version - a.version)
  },

  getActive(kind: LivePhotoPromptKind = 'image') {
    const versions = ensureDefaultPromptVersions().filter((item) => (item.kind || 'image') === kind)
    if (versions.length) return normalizePromptVersion(readActiveLivePhotoPromptVersionFromSqlite(kind) || versions[0]!)
    const timestamp = Date.now()
    const seeded = normalizePromptVersion({ id: randomUUID(), name: 'Live Photo Video Motion', version: 1, prompt: DEFAULT_LIVE_PHOTO_VIDEO_PROMPT, promptHash: '', active: true, createdAt: timestamp, updatedAt: timestamp, kind })
    upsertLivePhotoPromptVersionInSqlite(seeded)
    return seeded
  },

  save(input: SaveLivePhotoPromptVersionInput) {
    const prompt = String(input.prompt || '').trim()
    if (!prompt) throw new Error('Prompt content is required')
    const kind = input.kind || 'image'
    const versions = ensureDefaultPromptVersions().filter((item) => (item.kind || 'image') === kind)
    const existing = String(input.id || '').trim() ? versions.find((item) => item.id === String(input.id || '').trim()) : undefined
    const timestamp = Date.now()
    const next = normalizePromptVersion({
      id: existing?.id || randomUUID(),
      name: String(input.name || '').trim() || existing?.name || `Prompt V${versions.length + 1}`,
      version: existing?.version || Math.max(0, ...versions.map((item) => item.version)) + 1,
      prompt,
      promptHash: hashLivePhotoPrompt(prompt),
      active: existing?.active || false,
      createdAt: existing?.createdAt || timestamp,
      updatedAt: timestamp,
      kind,
    })
    upsertLivePhotoPromptVersionInSqlite(next)
    return next
  },

  activate(id: string) {
    const target = ensureDefaultPromptVersions().find((item) => item.id === String(id || '').trim())
    if (!target) throw new Error('Prompt version does not exist')
    activateLivePhotoPromptVersionInSqlite(target.id, target.kind || 'image')
    return this.getActive(target.kind || 'image')
  },

  rollback(id: string) {
    const source = ensureDefaultPromptVersions().find((item) => item.id === String(id || '').trim())
    if (!source) throw new Error('Prompt version does not exist')
    const copy = this.save({ name: `${source.name} Rollback`, prompt: source.prompt, kind: source.kind || 'image' })
    return this.activate(copy.id)
  },
}
