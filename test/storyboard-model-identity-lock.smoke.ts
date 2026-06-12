import assert from 'node:assert/strict'
import { buildGptFramePrompt, buildIdentityPackPrompt, resolveStoryboardImageTemplateType } from '../src/main/modules/clone/gptImage'
import { __test_resolveStoryboardSceneFitRefs } from '../src/main/modules/clone/service'
import {
  buildCameraMotionLockText,
  buildCloneNegativePrompt,
  buildCompositionLockText,
  buildMotionLimitText,
  buildPhysicsConsistencyText,
  buildScaleConsistencyLockText,
  buildSpatialAnchorLockText,
} from '../src/main/modules/clone/prompt'
import { buildRealisticPrompt } from '../src/main/modules/clone/providers'
import type { ModelIdentityPack, ShotSpec } from '../src/main/modules/clone/types'

const GENERAL_TEMPLATE = `
Look at these two reference images and combine them in a natural everyday way.

Image 1 is our base model and product reference (identity look reference).
Image 2 is our daily environment reference (scene environment reference).

I need you to place the model and product from Image 1 into the relaxed daily setting of Image 2, so it feels like a real person casually filmed this at home.

Strict Requirements:
1. PRODUCT: Identify the product in Image 1. Keep its design, colors, and original material textures fully consistent with Image 1. Do not let the environment or colors from Image 2 bleed into or contaminate the product. No product redesign or restyling is allowed.

2. MODEL & CLOTHING FIDELITY (服装与角色绝对死锁):
Identify the model in Image 1. Keep the model's appearance clearly consistent with Image 1.
- CLOTHING: Replicate the same clothing from Image 1, including its style, fabric texture, and color scheme. Completely IGNORE the clothing styles, colors, or outfits worn by any person in Image 2. Do not let the fashion from Image 2 influence the final output.
- POSTURE: Keep the same presentation posture, skin tone, and the same faceless or cropped perspective on the specific body part as shown in Image 1.

3. SCENE INTEGRATION: Replace the plain studio background of Image 1 with the ordinary home setting, room layout, and natural daylight feeling of Image 2. The final image should feel like it was casually captured in a real Southeast Asian home, with believable available light, mild shadows, and a relaxed unpolished atmosphere instead of a polished studio or ad campaign look.

4. TEXT AND LOGO REMOVAL:
Completely ignore, erase, and remove any text, brand logos, watermarks, alphabets, or signages present in Image 2. Do not replicate any words or graphic logos from the background scene. Replace those areas with plain, natural background textures that match the nearby surfaces in Image 2.

Style: Natural UGC lifestyle photography with a casual smartphone-shot feel. Southeast Asian daily home environment, bright natural daylight, authentic ambient atmosphere. Real and believable like everyday user-made content, with clear details but not luxury, glossy, or overproduced. Single panel only, no sketches, no animation.
`.trim()

const JEWELRY_TEMPLATE = GENERAL_TEMPLATE
const PACKAGING_TEMPLATE = GENERAL_TEMPLATE
const INTERACTION_TEMPLATE = GENERAL_TEMPLATE

const modelPack: ModelIdentityPack = {
  id: 'model-pack-1',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  status: 'done',
  confirmed: true,
  productType: 'earrings',
  market: 'US',
  gender: 'female',
  ageRange: '25-30',
  hairStyle: 'long black hair',
  skinTone: 'light warm skin',
  outfitStyle: 'clean beige knit top',
  mood: 'friendly natural social-commerce model',
  sceneStyle: 'soft daylight clean product demo setting',
  description: 'oval face, elegant eyes, soft smile, premium ecommerce model identity',
  imagePaths: ['D:/mock/model-1.png', 'D:/mock/model-2.png'],
}

const shot = {
  id: 'shot-1',
  index: 0,
  role: 'model_scene',
  purpose: 'model_demo',
  shotType: 'medium',
  productType: 'earrings',
  durationSec: 3,
  motion: 'slow_push_in',
  cameraMovement: 'slow_push_in',
  framing: 'medium',
  visualPrompt: 'A woman presents earrings in a vertical social commerce shot.',
  visualDescription: 'Mid shot of a model wearing the earrings near the face.',
  actionDescription: 'Model turns slightly and touches the product near the ear.',
  cameraDescription: 'medium framing, slow push in movement',
  productFocus: 'earring sparkle and exact pendant structure',
  scriptText: 'Open with the model wearing the earrings and showing the shape clearly.',
  narrationText: 'These earrings are lightweight and elegant.',
  onScreenText: 'Elegant daily earrings',
  materialNeed: 'exact product texture and hook structure',
  productReferenceImagePaths: ['D:/mock/product-with-person-1.png', 'D:/mock/product-detail-2.png'],
  prompt: {
    positive: 'realistic social commerce shot',
    negative: 'bad anatomy',
    cameraMotion: 'slow_push_in',
    aspectRatio: '9:16',
  },
  qualityMode: 'standard',
  locked: false,
  status: 'empty',
} as ShotSpec

const zoomOutShot = {
  ...shot,
  id: 'shot-zoom-out',
  motion: 'zoom_out',
  cameraMovement: 'zoom_out',
  framing: 'closeup',
  productType: 'earrings',
  cameraDescription: 'slow zoom out from extreme close-up to slightly wider close-up',
} as ShotSpec

const necklaceShot = {
  ...shot,
  id: 'shot-necklace',
  productType: 'necklace',
  visualPrompt: 'A model presents a necklace in a vertical social commerce shot.',
  visualDescription: 'Close crop of a model wearing the necklace around the neck and clavicle area.',
  actionDescription: 'Model lightly touches the pendant once.',
  cameraDescription: 'tight close-up around neck and clavicle with restrained movement',
  productFocus: 'pendant structure and chain attachment',
  materialNeed: 'exact chain length, pendant shape and attachment relation',
} as ShotSpec

const packagingShot = {
  ...shot,
  id: 'shot-packaging',
  productType: 'general',
  shotType: 'packaging',
  visualPrompt: 'Front-facing product plus packaging display for ecommerce conversion.',
  visualDescription: 'Clean studio product + packaging shot with readable label and clear hierarchy.',
  actionDescription: 'Static product and packaging presentation with slight angle.',
  cameraDescription: 'front-facing product display with restrained angle',
  productFocus: 'product first, packaging second, label visibility',
  materialNeed: 'keep bottle, cap, outer box and label placement unchanged',
} as ShotSpec

const interactionShot = {
  ...shot,
  id: 'shot-interaction',
  productType: 'general',
  shotType: 'model_demo',
  visualPrompt: 'A creator is holding and presenting the product in a real home setting.',
  visualDescription: 'Medium close-up lifestyle product interaction shot with natural hand usage.',
  actionDescription: 'Model holding and presenting product naturally to camera side.',
  cameraDescription: 'medium close-up handheld lifestyle framing',
  productFocus: 'real usage and stable product visibility',
  materialNeed: 'preserve display scale during hand interaction',
} as ShotSpec

const generalShot = {
  ...shot,
  id: 'shot-general',
  productType: 'general',
  shotType: 'closeup',
  visualPrompt: 'Clean product-led close-up in a natural scene.',
  visualDescription: 'Photorealistic product close-up with shallow depth of field.',
  actionDescription: 'Stable product presentation only.',
  cameraDescription: 'close-up static product framing',
  productFocus: 'shape, edges and structure',
  materialNeed: 'preserve exact structure and proportions',
  scriptText: 'Show the product clearly in one clean frame.',
} as ShotSpec

const prompt = buildGptFramePrompt({
  shot,
  productType: 'earrings',
  modelPack,
  productPoints: shot.materialNeed,
  which: 'start',
})
const endPrompt = buildGptFramePrompt({
  shot,
  productType: 'earrings',
  modelPack,
  productPoints: shot.materialNeed,
  which: 'end',
})
const videoPrompt = buildRealisticPrompt(
  {
    ...shot,
    aiPrompt: 'Realistic social-commerce video shot with wearable earring demonstration.',
    compiledPrompt: 'compiled prompt',
    compiledNegativePrompt: 'compiled negative prompt',
  },
  'video',
)
const zoomOutVideoPrompt = buildRealisticPrompt(
  {
    ...zoomOutShot,
    aiPrompt: 'Realistic social-commerce zoom-out earring demonstration.',
    compiledPrompt: 'compiled prompt',
    compiledNegativePrompt: 'compiled negative prompt',
  },
  'video',
)
const necklacePrompt = buildGptFramePrompt({
  shot: necklaceShot,
  productType: 'necklace',
  modelPack: {
    ...modelPack,
    productType: 'necklace',
  },
  productPoints: necklaceShot.materialNeed,
  which: 'start',
})
const packagingPrompt = buildGptFramePrompt({
  shot: packagingShot,
  productType: 'general',
  modelPack,
  productPoints: packagingShot.materialNeed,
  which: 'start',
})
const interactionPrompt = buildGptFramePrompt({
  shot: interactionShot,
  productType: 'general',
  modelPack,
  productPoints: interactionShot.materialNeed,
  which: 'start',
})
const generalPrompt = buildGptFramePrompt({
  shot: generalShot,
  productType: 'general',
  modelPack,
  productPoints: generalShot.materialNeed,
  which: 'start',
})
const explicitPackagingPrompt = buildGptFramePrompt({
  shot: interactionShot,
  productType: 'general',
  modelPack,
  productPoints: interactionShot.materialNeed,
  which: 'start',
  explicitTemplateType: 'ecommerce_packaging',
})
const identityPackPrompt = buildIdentityPackPrompt({
  productType: 'general',
  productPoints: interactionShot.materialNeed,
  profile: {
    market: 'Southeast Asian market',
    gender: 'female',
    ageRange: '20-28',
    faceShape: 'ordinary natural face shape',
    hairStyle: 'natural straight hair',
    hairColor: 'natural dark black hair color',
    skinTone: 'natural warm skin tone',
    bodyType: 'balanced natural build',
    outfitStyle: 'light breathable short-sleeve casual top',
    mood: 'friendly natural everyday expression',
    sceneStyle: 'real home daylight daily life setting',
    languageStyle: 'Chinese-speaking social-commerce expression style',
    cameraPresence: 'natural social-commerce camera presence',
    styleBias: 'conversion-focused product demo style',
  },
  hasModelReference: true,
})
const identityGridPrimaryRefs = __test_resolveStoryboardSceneFitRefs({
  projectIdentityGridPath: 'D:/tmp/project-identity-grid.png',
  productRefs: ['D:/tmp/product-canonical.png'],
  modelPackRefs: ['D:/tmp/model-pack-1.png'],
  thumbnailPath: 'D:/tmp/scene-thumb.png',
  continuityAnchorPath: 'D:/tmp/prev-frame.png',
  mode: 'start',
})
const legacyFallbackRefs = __test_resolveStoryboardSceneFitRefs({
  productRefs: ['D:/tmp/product-canonical.png'],
  modelPackRefs: ['D:/tmp/model-pack-1.png'],
  thumbnailPath: 'D:/tmp/scene-thumb.png',
  mode: 'start',
})
const earringNegative = buildCloneNegativePrompt('earrings', 'model_demo')
const spatialAnchorText = buildSpatialAnchorLockText('earrings')
const physicsConsistencyText = buildPhysicsConsistencyText('earrings')
const compositionLockText = buildCompositionLockText('earrings')
const cameraMotionLockText = buildCameraMotionLockText({ motion: 'zoom_out', framing: 'closeup', productType: 'earrings' })
const scaleConsistencyLockText = buildScaleConsistencyLockText('earrings', 'zoom_out')
const motionLimitText = buildMotionLimitText('earrings', 'zoom_out')

assert.equal(resolveStoryboardImageTemplateType({ productType: 'earrings', shot }), 'jewelry')
assert.equal(resolveStoryboardImageTemplateType({ productType: 'general', shot: packagingShot }), 'ecommerce_packaging')
assert.equal(resolveStoryboardImageTemplateType({ productType: 'general', shot: interactionShot }), 'lifestyle_interaction')
assert.equal(resolveStoryboardImageTemplateType({ productType: 'general', shot: generalShot }), 'general')
assert.equal(
  resolveStoryboardImageTemplateType({
    productType: 'general',
    shot: interactionShot,
    explicitTemplateType: 'ecommerce_packaging',
  }),
  'ecommerce_packaging',
)

assert.equal(prompt, GENERAL_TEMPLATE)
assert.equal(endPrompt, GENERAL_TEMPLATE)
assert.equal(prompt, endPrompt)
assert.equal(necklacePrompt, GENERAL_TEMPLATE)
assert.equal(packagingPrompt, GENERAL_TEMPLATE)
assert.equal(interactionPrompt, GENERAL_TEMPLATE)
assert.equal(generalPrompt, GENERAL_TEMPLATE)
assert.equal(explicitPackagingPrompt, GENERAL_TEMPLATE)
assert.match(identityPackPrompt, /believable real-world size relative to the Hands/i)
assert.match(identityPackPrompt, /Do not enlarge, magnify, or exaggerate the product beyond its normal wearing or handheld scale/i)
assert.deepEqual(identityGridPrimaryRefs, ['D:/tmp/project-identity-grid.png', 'D:/tmp/scene-thumb.png'])
assert.deepEqual(legacyFallbackRefs, ['D:/tmp/product-canonical.png', 'D:/tmp/model-pack-1.png', 'D:/tmp/scene-thumb.png'])

assert.doesNotMatch(prompt, /REFERENCE ROLE MAP|ENGINEERING LOCKS|FRAME CONTINUITY LOCK|Compiled product-control layer|Generate the opening keyframe|Generate the ending keyframe/i)
assert.doesNotMatch(packagingPrompt, /REFERENCE ROLE MAP|ENGINEERING LOCKS|FRAME CONTINUITY LOCK|Compiled product-control layer/i)
assert.doesNotMatch(interactionPrompt, /REFERENCE ROLE MAP|ENGINEERING LOCKS|FRAME CONTINUITY LOCK|Compiled product-control layer/i)
assert.doesNotMatch(generalPrompt, /REFERENCE ROLE MAP|ENGINEERING LOCKS|FRAME CONTINUITY LOCK|Compiled product-control layer/i)

assert.match(videoPrompt, /^Main Instruction: A natural, crisp, high-definition \(HD\) 60fps video with a handheld smartphone shooting look/i)
assert.match(videoPrompt, /NO INFERENCE RULE: Do not infer, reconstruct, redesign, or generate unseen parts of the Earring\./i)
assert.match(videoPrompt, /STRUCTURE LOCK: Preserve the exact visible structure, silhouette, proportions, connection points, and orientation from the reference image\./i)
assert.match(videoPrompt, /Keep realistic micro-shadows consistent with the scene and product placement\./i)
assert.match(videoPrompt, /Implement Subtle handheld close-up on the ear area with highly controlled subtle handheld movement to simulate natural smartphone filming in real life\./i)
assert.match(videoPrompt, /The camera angle remains tightly cropped on the Ear lobe, keeping the model's eyes, nose, and lips completely out of the frame/i)
assert.match(videoPrompt, /Silent Performance Lock: The model must remain completely silent\./i)
assert.match(videoPrompt, /Keep lips closed or only minimally relaxed at all times\./i)
assert.doesNotMatch(videoPrompt, /100% strict structural consistency|millimeter precision|tiny 3 degrees|natural physical inertia|natural ambient occlusion/i)
assert.match(earringNegative, /no exaggerated sparkle effect|no fantasy glow/i)
assert.match(earringNegative, /no standing upright earring|no floating earring|no unsupported rigid earring pose/i)
assert.match(earringNegative, /discard the generation instead of correcting it/i)
assert.match(zoomOutVideoPrompt, /^Main Instruction: A natural, crisp, high-definition \(HD\) 60fps video with a handheld smartphone shooting look/i)
assert.match(zoomOutVideoPrompt, /HANDHELD CAMERA MECHANICS/i)
assert.doesNotMatch(zoomOutVideoPrompt, /Replace only the person identity and product identity\./i)
assert.match(spatialAnchorText, /SPATIAL ANCHOR LOCK/i)
assert.match(spatialAnchorText, /same ear side|same piercing point|same hanging direction|same distance from the ear/i)
assert.match(physicsConsistencyText, /PHYSICS CONSISTENCY/i)
assert.match(compositionLockText, /COMPOSITION LOCK/i)
assert.match(cameraMotionLockText, /CAMERA MOTION LOCK/i)
assert.match(cameraMotionLockText, /single uninterrupted gentle camera pull-back|single uninterrupted camera pull-back|single uninterrupted pull-back/i)
assert.match(cameraMotionLockText, /DO NOT accelerate suddenly, rush the pull-back, cut to a new shot|do not cut to a new shot/i)
assert.match(cameraMotionLockText, /regenerate a new framing/i)
assert.match(scaleConsistencyLockText, /SCALE CONSISTENCY LOCK/i)
assert.match(scaleConsistencyLockText, /do NOT enlarge, shrink, or rescale the product|Do NOT enlarge, shrink, or rescale the product/i)
assert.match(motionLimitText, /MOTION LIMIT/i)
assert.match(motionLimitText, /extremely subtle micro-movements caused by breathing/i)
assert.match(motionLimitText, /no noticeable swinging/i)

console.log('storyboard model identity lock smoke test passed')
