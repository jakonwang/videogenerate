import assert from 'node:assert/strict'
import {
  buildGptFramePrompt,
  buildIdentityPackPrompt,
  buildReferenceResponsibilityText,
  resolveStoryboardImageTemplateType,
  resolveStoryboardReferenceMode,
} from '../src/main/modules/clone/gptImage.ts'
import {
  __test_resolveForcedModelSceneMode,
  __test_resolveStoryboardSceneFitRefs,
  __test_resolveStoryboardReferenceModeForProject,
} from '../src/main/modules/clone/service.ts'
import { inferStoryboardReferenceDecision } from '../src/main/modules/clone/storyboardReference.ts'
import {
  buildCameraMotionLockText,
  buildCloneNegativePrompt,
  buildCompositionLockText,
  buildMotionLimitText,
  buildPhysicsConsistencyText,
  buildScaleConsistencyLockText,
  buildSpatialAnchorLockText,
} from '../src/main/modules/clone/prompt.ts'
import { buildRealisticPrompt } from '../src/main/modules/clone/providers.ts'
import type { ModelIdentityPack, ShotSpec } from '../src/main/modules/clone/types.ts'

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
  role: 'product_closeup',
  purpose: 'detail',
  shotType: 'closeup',
  visualPrompt: 'Clean product-led close-up in a natural scene.',
  visualDescription: 'Photorealistic product close-up with shallow depth of field.',
  actionDescription: 'Stable product presentation only.',
  cameraDescription: 'close-up static product framing',
  productFocus: 'shape, edges and structure',
  materialNeed: 'preserve exact structure and proportions',
  scriptText: 'Show the product clearly in one clean frame.',
} as ShotSpec

const handCloseupEarringShot = {
  ...shot,
  id: 'shot-hand-closeup-earring',
  shotType: 'model_demo',
  role: 'model_scene',
  purpose: 'model_demo',
  framing: 'closeup',
  visualPrompt: 'Close-up shot. Camera remains static, focusing closely on the hand holding the silver star hoop.',
  visualDescription: 'Tight close-up of fingers holding the silver hoop earring beside a table edge. No full-face presentation.',
  actionDescription: 'Static hand-held product display with only minimal finger support.',
  cameraDescription: 'close-up static product framing focused on the hand and earring only',
  productFocus: 'hand-held silver star hoop detail and exact product structure',
  scriptText: 'Close-up shot focusing closely on the hand holding the silver star hoop.',
  onScreenText: '',
  narrationText: '',
} as ShotSpec

const earlobeExtremeCloseupShot = {
  ...shot,
  id: 'shot-earlobe-extreme-closeup',
  shotType: 'model_demo',
  role: 'model_scene',
  purpose: 'model_demo',
  framing: 'closeup',
  visualPrompt: '0.0s-3.6s Extreme close-up shot. Camera slowly pans right across the earlobe. No zoom.',
  visualDescription: 'Extreme close-up of the earlobe and earring area only. No full-face presentation.',
  actionDescription: 'Camera slowly pans right across the earlobe with no zoom.',
  cameraDescription: 'Extreme close-up, slow pan right, no zoom',
  productFocus: 'earlobe area and exact earring structure',
  scriptText: '0.0s-3.6s Extreme close-up shot. Camera slowly pans right across the earlobe. No zoom.',
  onScreenText: '',
  narrationText: '',
} as ShotSpec

const realProjectShot1 = {
  ...shot,
  id: 'shot-real-project-1',
  role: 'hook',
  shotType: 'model_demo',
  framing: 'closeup',
  visualPrompt: 'Opening model demonstration shot. Replace the person with a target-market model while keeping gesture rhythm.',
  visualDescription: 'Close-up of the ear area with a subtle hand movement outward.',
  actionDescription: 'Static start on the ear, then subtle hand tracking outward.',
  cameraDescription: 'close-up static framing focused on the ear before following the hand slightly',
  productFocus: 'ear wearing presentation with visible product-on-body relation',
  scriptText: '0.0s-3.5s Close-up shot. Camera is static, focus on the ear before subtly tracking the hand moving outward.',
  onScreenText: '',
  narrationText: '',
} as ShotSpec

const realProjectShot6 = {
  ...shot,
  id: 'shot-real-project-6',
  role: 'cta',
  shotType: 'model_demo',
  framing: 'closeup',
  visualPrompt: 'Model usage demonstration shot. Preserve body/hand action rhythm and replace product/model identity.',
  visualDescription: 'Static close-up framing the ear and jawline while the product is being worn.',
  actionDescription: 'No subject motion.',
  cameraDescription: 'close-up static framing on the ear and jawline',
  productFocus: 'worn product relation on the ear and jawline area',
  scriptText: '13.0s-13.7s Close-up shot. Camera is completely static, framing the ear and jawline beautifully.',
  onScreenText: '',
  narrationText: '',
} as ShotSpec

const modelScenePhotoShot = {
  ...shot,
  id: 'shot-model-scene-photo',
  productType: 'general',
  role: 'hook',
  purpose: 'model_demo',
  shotType: 'closeup',
  framing: 'closeup',
  visualPrompt: 'Lifestyle model scene photo for storyboard reference. A woman presents the product in a real room.',
  visualDescription: 'Close-up scene image of a female model presenting the product near the face in a natural home setting.',
  actionDescription: 'Model faces the camera and lightly presents the product during a real-person scene shot.',
  cameraDescription: 'close-up lifestyle framing with a real person in scene',
  productFocus: 'visible product with real-person scene relation',
  scriptText: 'Use the model scene image as the main storyboard reference for this opening shot.',
  storyboardReferenceMode: 'product_closeup',
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
const handCloseupEarringPrompt = buildGptFramePrompt({
  shot: handCloseupEarringShot,
  productType: 'earrings',
  modelPack,
  productPoints: handCloseupEarringShot.materialNeed,
  which: 'start',
})
const lockedProductCloseupPrompt = buildGptFramePrompt({
  shot: {
    ...realProjectShot6,
    storyboardReferenceMode: 'product_closeup',
  },
  productType: 'earrings',
  modelPack,
  productPoints: realProjectShot6.materialNeed,
  which: 'start',
})
const earlobeExtremeCloseupPrompt = buildGptFramePrompt({
  shot: earlobeExtremeCloseupShot,
  productType: 'earrings',
  modelPack,
  productPoints: earlobeExtremeCloseupShot.materialNeed,
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
const generalReferenceMode = resolveStoryboardReferenceMode({ productType: 'general', shot: generalShot })
const interactionReferenceMode = resolveStoryboardReferenceMode({ productType: 'general', shot: interactionShot })
const jewelryReferenceMode = resolveStoryboardReferenceMode({ productType: 'earrings', shot })
const handCloseupReferenceMode = resolveStoryboardReferenceMode({ productType: 'earrings', shot: handCloseupEarringShot })
const earlobeExtremeCloseupReferenceMode = resolveStoryboardReferenceMode({ productType: 'earrings', shot: earlobeExtremeCloseupShot })
const realProjectShot1ReferenceMode = resolveStoryboardReferenceMode({ productType: 'earrings', shot: realProjectShot1 })
const realProjectShot6ReferenceMode = resolveStoryboardReferenceMode({ productType: 'earrings', shot: realProjectShot6 })
const modelScenePhotoReferenceMode = resolveStoryboardReferenceMode({ productType: 'general', shot: modelScenePhotoShot })
const wristAccessoryShot = {
  ...interactionShot,
  id: 'shot-wrist-accessory',
  productType: 'bracelet',
  shotType: 'model_demo',
  role: 'model_scene',
  framing: 'closeup',
  visualPrompt: 'Extreme close-up of the wrist wearing the bracelet. No face shown.',
  visualDescription: 'Close-up top view of the bracelet worn on a wrist with the product as dominant subject.',
  actionDescription: 'Subtle wrist gesture only.',
  cameraDescription: 'close-up top view of the wrist and bracelet',
  productFocus: 'bracelet structure, wrist fit, clasp detail',
  scriptText: 'Extreme close-up of the wrist and bracelet only.',
} as ShotSpec
const wristAccessoryReferenceMode = resolveStoryboardReferenceMode({ productType: 'bracelet' as any, shot: wristAccessoryShot })
const forcedModelSceneShot = {
  ...interactionShot,
  id: 'shot-forced-model-scene',
  productType: 'earrings',
  shotType: 'closeup',
  role: 'product_closeup',
  thumbnailPath: 'D:/tmp/model-wearing-ear-scene.png',
  storyboardReferenceMode: 'product_closeup',
  visualPrompt: 'Close-up on the ear where the model is wearing the earring.',
  visualDescription: 'The portrait crop shows the ear, jawline, and cheek while the model wears the earring.',
  actionDescription: 'Model adjusts the earring near the earlobe.',
  cameraDescription: 'Tight portrait close-up on the ear and jawline.',
  productFocus: 'earring worn on ear with real face-side context',
  scriptText: 'Model wearing the earring near the ear and jawline.',
} as ShotSpec
const noIdentityEarringCloseupShot = {
  ...interactionShot,
  id: 'shot-no-identity-earring-closeup',
  productType: 'earrings',
  shotType: 'model_demo',
  role: 'model_scene',
  framing: 'extreme_closeup',
  thumbnailPath: 'D:/tmp/earring-closeup-scene.png',
  storyboardReferenceMode: 'product_closeup',
  visualPrompt: 'Extreme close-up on the earlobe and earring only. No face visible.',
  visualDescription: 'Extreme close-up of the earlobe and earring area only. No full-face presentation and identity is not visible.',
  actionDescription: 'Static product-led wearing close-up with only the minimum local body anchor.',
  cameraDescription: 'Extreme close-up macro framing on the ear area only',
  productFocus: 'exact earring structure on the earlobe with no identity emphasis',
  scriptText: 'Extreme close-up of the earlobe and earring only. No face visible.',
} as ShotSpec
const handOnlyProductShot = {
  ...interactionShot,
  id: 'shot-hand-only-product',
  productType: 'earrings',
  shotType: 'model_demo',
  role: 'model_scene',
  framing: 'closeup',
  visualPrompt: 'Close-up shot of fingers holding the earring only.',
  visualDescription: 'Tight close-up of fingers holding the earring only, with no ear, face, neck, or body visible.',
  actionDescription: 'Static hand-held product display only.',
  cameraDescription: 'Close-up hand-only product framing.',
  productFocus: 'exact earring structure in the fingers only',
  scriptText: 'Fingers holding the product only.',
} as ShotSpec
const realProjectShot5 = {
  ...interactionShot,
  id: 'shot-real-project-5',
  productType: 'earrings',
  shotType: 'model_demo',
  role: 'detail',
  framing: 'closeup',
  visualPrompt: 'Model usage demonstration shot. Preserve body/hand action rhythm and replace product/model identity.',
  visualDescription: 'Keep the exact reference composition.',
  actionDescription: 'No subject motion.',
  cameraDescription: 'extreme close-up, slow zoom in',
  productFocus: 'construction details',
  scriptText: '8.5s-10.8s Extreme close-up shot. Camera slowly zooms in on the 4-prong setting and .',
} as ShotSpec
const tabletopProductShot = {
  ...generalShot,
  id: 'shot-tabletop-product',
  visualPrompt: 'Static tabletop product-only close-up.',
  visualDescription: 'Product only on tabletop with no person.',
  actionDescription: 'No subject motion.',
  cameraDescription: 'Static tabletop product framing.',
  productFocus: 'product structure only',
  scriptText: 'Product only on tabletop.',
} as ShotSpec
const packagingOnlyShot = {
  ...packagingShot,
  id: 'shot-packaging-only',
  productType: 'general',
  thumbnailPath: 'D:/tmp/product-only-white-background.png',
  visualPrompt: 'Isolated product packaging on pure white background.',
  visualDescription: 'No person. Product only display on white background.',
  scriptText: 'Packaging only close-up with no model.',
} as ShotSpec
const forcedModelSceneLock = __test_resolveForcedModelSceneMode({ projectIdentityGridPath: 'D:/tmp/project-identity-grid.png' } as any, forcedModelSceneShot)
const noIdentityEarringCloseupLock = __test_resolveForcedModelSceneMode(
  { projectIdentityGridPath: 'D:/tmp/project-identity-grid.png' } as any,
  noIdentityEarringCloseupShot,
)
const packagingOnlyLock = __test_resolveForcedModelSceneMode({ projectIdentityGridPath: 'D:/tmp/project-identity-grid.png' } as any, packagingOnlyShot)
const handOnlyDecision = inferStoryboardReferenceDecision({ productType: 'earrings', shot: handOnlyProductShot })
const realProjectShot5Decision = inferStoryboardReferenceDecision({ productType: 'earrings', shot: realProjectShot5 })
const tabletopDecision = inferStoryboardReferenceDecision({ productType: 'general', shot: tabletopProductShot })
const noIdentityDecision = inferStoryboardReferenceDecision({ productType: 'earrings', shot: noIdentityEarringCloseupShot })
const closeupResponsibility = buildReferenceResponsibilityText({
  mode: 'storyboard_frame',
  storyboardReferenceMode: 'product_closeup',
})
const modelResponsibility = buildReferenceResponsibilityText({
  mode: 'storyboard_frame',
  storyboardReferenceMode: 'model_presentation',
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
assert.equal(generalReferenceMode, 'product_closeup')
assert.equal(interactionReferenceMode, 'product_closeup')
assert.equal(jewelryReferenceMode, 'model_presentation')
assert.equal(handCloseupReferenceMode, 'product_closeup')
assert.equal(earlobeExtremeCloseupReferenceMode, 'model_presentation')
assert.equal(realProjectShot1ReferenceMode, 'model_presentation')
assert.equal(realProjectShot6ReferenceMode, 'model_presentation')
assert.equal(modelScenePhotoReferenceMode, 'model_presentation')
assert.equal(wristAccessoryReferenceMode, 'model_presentation')
assert.equal(forcedModelSceneLock.locked, true)
assert.equal(forcedModelSceneLock.mode, 'model_presentation')
assert.equal(forcedModelSceneLock.reason, 'scene_contains_model_wearing')
assert.equal(noIdentityEarringCloseupLock.locked, false)
assert.equal(noIdentityEarringCloseupLock.mode, null)
assert.equal(packagingOnlyLock.locked, false)
assert.equal(packagingOnlyLock.mode, null)
assert.equal(handOnlyDecision.subjectType, 'product_only')
assert.equal(handOnlyDecision.mode, 'product_closeup')
assert.equal(handOnlyDecision.confidence, 'high')
assert.equal(realProjectShot5Decision.subjectType, 'unknown')
assert.equal(realProjectShot5Decision.mode, 'model_presentation')
assert.equal(realProjectShot5Decision.confidence, 'low')
assert.equal(tabletopDecision.subjectType, 'product_only')
assert.equal(tabletopDecision.mode, 'product_closeup')
assert.equal(noIdentityDecision.subjectType, 'local_wearable_closeup')
assert.equal(noIdentityDecision.mode, 'product_closeup')
assert.equal(noIdentityDecision.confidence, 'medium')
assert.equal(
  resolveStoryboardImageTemplateType({
    productType: 'general',
    shot: interactionShot,
    explicitTemplateType: 'ecommerce_packaging',
  }),
  'ecommerce_packaging',
)

assert.match(prompt, /Identify the model in Image 1\. Keep the model's appearance clearly consistent with Image 1\./i)
assert.match(prompt, /CLOTHING: Replicate the same clothing from Image 1/i)
assert.equal(prompt, endPrompt)
assert.match(necklacePrompt, /Identify the model in Image 1\. Keep the model's appearance clearly consistent with Image 1\./i)
assert.match(interactionPrompt, /2\. PRESENTATION STRUCTURE:/i)
assert.doesNotMatch(interactionPrompt, /Identify the model in Image 1/i)
assert.match(generalPrompt, /2\. PRESENTATION STRUCTURE:/i)
assert.match(generalPrompt, /Keep the product fully consistent with Image 1/i)
assert.match(generalPrompt, /Place that same product naturally into the daily environment, composition, and atmosphere of Image 2/i)
assert.match(generalPrompt, /BODY CONTEXT: If human context is needed, preserve only the minimum local body-part relation required by Image 2/i)
assert.match(generalPrompt, /POSTURE AND CROP: Follow the crop, framing tightness, and close-up storytelling intent needed to integrate the product into Image 2/i)
assert.doesNotMatch(generalPrompt, /Identify how the product is presented in Image 1/i)
assert.doesNotMatch(generalPrompt, /Identify the model in Image 1/i)
assert.match(packagingPrompt, /2\. PRESENTATION STRUCTURE:/i)
assert.doesNotMatch(packagingPrompt, /Identify the model in Image 1/i)
assert.match(explicitPackagingPrompt, /2\. PRESENTATION STRUCTURE:/i)
assert.doesNotMatch(explicitPackagingPrompt, /Identify the model in Image 1/i)
assert.match(handCloseupEarringPrompt, /2\. PRESENTATION STRUCTURE:/i)
assert.doesNotMatch(handCloseupEarringPrompt, /Identify the model in Image 1/i)
assert.match(lockedProductCloseupPrompt, /2\. PRESENTATION STRUCTURE:/i)
assert.doesNotMatch(lockedProductCloseupPrompt, /Identify the model in Image 1/i)
assert.match(identityPackPrompt, /believable real-world size relative to the Hands/i)
assert.match(identityPackPrompt, /Do not enlarge, magnify, or exaggerate the product beyond its normal wearing or handheld scale/i)
assert.deepEqual(identityGridPrimaryRefs, ['D:/tmp/project-identity-grid.png', 'D:/tmp/scene-thumb.png'])
assert.deepEqual(legacyFallbackRefs, ['D:/tmp/product-canonical.png', 'D:/tmp/model-pack-1.png', 'D:/tmp/scene-thumb.png'])
assert.deepEqual(
  __test_resolveStoryboardSceneFitRefs({
    productRefs: ['D:/tmp/product-canonical.png'],
    modelPackRefs: ['D:/tmp/model-pack-1.png'],
    thumbnailPath: 'D:/tmp/scene-thumb.png',
    mode: 'start',
    storyboardReferenceMode: 'product_closeup',
  }),
  ['D:/tmp/product-canonical.png', 'D:/tmp/scene-thumb.png'],
)
assert.equal(
  __test_resolveStoryboardReferenceModeForProject(
    {
      projectIdentityGridPath: 'D:/tmp/project-identity-grid.png',
    } as any,
    {
      ...earlobeExtremeCloseupShot,
      storyboardReferenceMode: 'model_presentation',
    } as ShotSpec,
  ),
  'product_closeup',
)
assert.equal(
  __test_resolveStoryboardReferenceModeForProject(
    {
      projectIdentityGridPath: 'D:/tmp/project-identity-grid.png',
    } as any,
    realProjectShot1,
  ),
  'model_presentation',
)
assert.equal(
  __test_resolveStoryboardReferenceModeForProject(
    {
      projectIdentityGridPath: 'D:/tmp/project-identity-grid.png',
    } as any,
    realProjectShot6,
  ),
  'model_presentation',
)
assert.equal(
  __test_resolveStoryboardReferenceModeForProject(
    {
      projectIdentityGridPath: 'D:/tmp/project-identity-grid.png',
    } as any,
    modelScenePhotoShot,
  ),
  'model_presentation',
)
assert.equal(
  __test_resolveStoryboardReferenceModeForProject(
    {
      projectIdentityGridPath: 'D:/tmp/project-identity-grid.png',
    } as any,
    noIdentityEarringCloseupShot,
  ),
  'product_closeup',
)
assert.equal(
  __test_resolveStoryboardReferenceModeForProject(
    {
      projectIdentityGridPath: 'D:/tmp/project-identity-grid.png',
    } as any,
    forcedModelSceneShot,
  ),
  'model_presentation',
)
assert.equal(
  __test_resolveStoryboardReferenceModeForProject(
    {
      projectIdentityGridPath: 'D:/tmp/project-identity-grid.png',
    } as any,
    {
      ...interactionShot,
      storyboardReferenceMode: 'product_closeup',
    } as ShotSpec,
  ),
  'model_presentation',
)
assert.notEqual(
  __test_resolveStoryboardSceneFitRefs({
    projectIdentityGridPath: 'D:/tmp/project-identity-grid.png',
    productRefs: ['D:/tmp/product-canonical.png'],
    thumbnailPath: 'D:/tmp/scene-thumb.png',
    mode: 'start',
    storyboardReferenceMode: 'product_closeup',
  })[0],
  'D:/tmp/project-identity-grid.png',
)
assert.match(closeupResponsibility, /Image 2 is the storyboard scene reference/i)
assert.match(closeupResponsibility, /Do not infer or recreate a specific person identity/i)
assert.doesNotMatch(closeupResponsibility, /Image 2 is the model identity reference/i)
assert.match(modelResponsibility, /Image 2 is the model identity reference/i)

assert.doesNotMatch(prompt, /REFERENCE ROLE MAP|ENGINEERING LOCKS|FRAME CONTINUITY LOCK|Compiled product-control layer|Generate the opening keyframe|Generate the ending keyframe/i)
assert.doesNotMatch(packagingPrompt, /REFERENCE ROLE MAP|ENGINEERING LOCKS|FRAME CONTINUITY LOCK|Compiled product-control layer/i)
assert.doesNotMatch(interactionPrompt, /REFERENCE ROLE MAP|ENGINEERING LOCKS|FRAME CONTINUITY LOCK|Compiled product-control layer/i)
assert.doesNotMatch(generalPrompt, /REFERENCE ROLE MAP|ENGINEERING LOCKS|FRAME CONTINUITY LOCK|Compiled product-control layer/i)

assert.match(videoPrompt, /^Main Instruction: A natural, crisp, high-definition \(HD\) 60fps video with a handheld smartphone shooting look/i)
assert.match(videoPrompt, /NO INFERENCE RULE: Do not infer, reconstruct, redesign, or generate unseen parts of the Earring\./i)
assert.match(videoPrompt, /STRUCTURE LOCK: Preserve the exact visible structure, silhouette, proportions, connection points, and orientation from the reference image\./i)
assert.match(videoPrompt, /Keep realistic micro-shadows consistent with the scene and product placement\./i)
assert.match(videoPrompt, /Implement Subtle handheld close-up on the ear area.*with highly controlled subtle handheld movement to simulate natural smartphone filming in real life\./i)
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
