import assert from 'node:assert/strict'
import { buildGptFramePrompt } from '../src/main/modules/clone/gptImage'
import { compilePromptConsistency } from '../src/main/modules/clone/prompt-consistency/compiler'
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

const compiled = compilePromptConsistency({
  projectId: 'project-1',
  shot,
  productReferenceImagePaths: shot.productReferenceImagePaths,
  modelIdentity: {
    id: modelPack.id,
    description: modelPack.description,
    market: modelPack.market,
    gender: modelPack.gender,
    ageRange: modelPack.ageRange,
    hairStyle: modelPack.hairStyle,
    skinTone: modelPack.skinTone,
    outfitStyle: modelPack.outfitStyle,
    mood: modelPack.mood,
    sceneStyle: modelPack.sceneStyle,
    imagePaths: modelPack.imagePaths,
  },
}).result

const zoomOutCompiled = compilePromptConsistency({
  projectId: 'project-1',
  shot: zoomOutShot,
  productReferenceImagePaths: zoomOutShot.productReferenceImagePaths,
  modelIdentity: {
    id: modelPack.id,
    description: modelPack.description,
    market: modelPack.market,
    gender: modelPack.gender,
    ageRange: modelPack.ageRange,
    hairStyle: modelPack.hairStyle,
    skinTone: modelPack.skinTone,
    outfitStyle: modelPack.outfitStyle,
    mood: modelPack.mood,
    sceneStyle: modelPack.sceneStyle,
    imagePaths: modelPack.imagePaths,
  },
}).result

const prompt = buildGptFramePrompt({
  shot,
  productType: 'earrings',
  modelPack,
  productPoints: shot.materialNeed,
  which: 'start',
  compiledPrompt: compiled.finalPrompt,
})
const endPrompt = buildGptFramePrompt({
  shot,
  productType: 'earrings',
  modelPack,
  productPoints: shot.materialNeed,
  which: 'end',
  compiledPrompt: compiled.finalPrompt,
})
const videoPrompt = buildRealisticPrompt(
  {
    ...shot,
    aiPrompt: 'Realistic social-commerce video shot with wearable earring demonstration.',
    compiledPrompt: compiled.finalPrompt,
    compiledNegativePrompt: compiled.finalNegativePrompt,
  },
  'video',
)
const zoomOutVideoPrompt = buildRealisticPrompt(
  {
    ...zoomOutShot,
    aiPrompt: 'Realistic social-commerce zoom-out earring demonstration.',
    compiledPrompt: zoomOutCompiled.finalPrompt,
    compiledNegativePrompt: zoomOutCompiled.finalNegativePrompt,
  },
  'video',
)
const combined = `${prompt}\n${compiled.finalPrompt}\n${compiled.finalNegativePrompt}`
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
const earringNegative = buildCloneNegativePrompt('earrings', 'model_demo')
const spatialAnchorText = buildSpatialAnchorLockText('earrings')
const physicsConsistencyText = buildPhysicsConsistencyText('earrings')
const compositionLockText = buildCompositionLockText('earrings')
const cameraMotionLockText = buildCameraMotionLockText({ motion: 'zoom_out', framing: 'closeup', productType: 'earrings' })
const scaleConsistencyLockText = buildScaleConsistencyLockText('earrings', 'zoom_out')
const motionLimitText = buildMotionLimitText('earrings', 'zoom_out')
const performanceLayerText = compiled.layers.find((item) => item.name === 'PERFORMANCE_LAYER')?.text || ''
const shotLayerText = compiled.layers.find((item) => item.name === 'SHOT_LAYER')?.text || ''

assert.match(prompt, /\[ABSOLUTE RULES\]/i)
assert.match(prompt, /Product = Image 1 \(ONLY source of truth\)/i)
assert.match(prompt, /The product is fixed and must remain 100% identical/i)
assert.match(prompt, /\[INPUT ROLE MAP\]/i)
assert.match(prompt, /Image 1 -> product only/i)
assert.match(prompt, /Image 2 -> model identity only/i)
assert.match(prompt, /Image 3 -> pose \/ framing \/ composition only/i)
assert.match(prompt, /\[SHOT CONTROL\]/i)
assert.match(prompt, /Shot type: Product-led demonstration/i)
assert.match(prompt, /product is the visual center/i)
assert.match(prompt, /occupies 40% to 60% of the frame/i)
assert.match(prompt, /prefer a tighter crop when needed so the product reads larger and clearer/i)
assert.match(prompt, /product details must remain crisp and immediately readable/i)
assert.match(prompt, /Hierarchy: product > hands > body > face/i)
assert.match(prompt, /\[FACE CONTROL\]/i)
assert.match(prompt, /Do NOT show full face/i)
assert.match(prompt, /No eye contact/i)
assert.match(prompt, /Face must be cropped, off-center, secondary, or reduced to ear\/jawline\/neck support only/i)
assert.match(prompt, /\[RESTRICTIONS\]/i)
assert.match(prompt, /Do NOT infer unseen product parts/i)
assert.match(prompt, /Do NOT shrink product visibility/i)
assert.match(prompt, /Do NOT let the product become small, distant, soft, or detail-blurred/i)
assert.match(prompt, /\[OUTPUT\]/i)
assert.match(prompt, /Action lock: Minimal finger interaction below the ear|Action lock: Very subtle movement only/i)
assert.match(prompt, /Scene lock: Extreme close-up of ear wearing the earring/i)
assert.match(prompt, /Product focus lock: Preserve shape, proportions, structure, connector relation, hanging direction, and ear attachment point\. Keep the product close, sharp, and fully readable/i)
assert.match(prompt, /Compiled product-control layer:/i)
assert.match(prompt, /Use the same new virtual model from Image 2 only/i)
assert.match(prompt, /Minimal identity anchor:/i)
assert.doesNotMatch(prompt, /Chinese-speaking social-commerce expression style|camera presence|calm confident expression/i)
assert.doesNotMatch(prompt, /TEXT PRODUCT DESCRIPTION LOCK/i)
assert.doesNotMatch(prompt, /Selected model:/i)
assert.doesNotMatch(prompt, /Anchor facts:/i)
assert.doesNotMatch(prompt, /Core subject:/i)
assert.doesNotMatch(prompt, /S925 silver hoop earrings/i)
assert.match(endPrompt, /small continuation from the provided GPT start frame|continues the provided start frame|direct continuation of the provided GPT start frame|direct continuation of the starting frame/i)
assert.match(endPrompt, /The ending frame must keep the same new model, same product, same outfit, same location, same lighting, same emotion and same camera setup as the provided start frame/i)
assert.match(endPrompt, /Image 3 -> continuation angle \/ framing \/ composition only/i)
assert.match(endPrompt, /FRAME CONTINUITY LOCK: ending keyframe continues the provided start frame/i)
assert.match(combined, /PRODUCT REFERENCES LOCK PRODUCT ONLY, NOT PERSON IDENTITY/i)
assert.match(combined, /Never use the person from the product images as the model source|REFERENCE PERSON EXCLUSION RULE/i)
assert.match(combined, /generation MUST fail instead of replacing it with a lookalike|discard the generation instead of correcting it/i)
assert.match(compiled.finalPrompt, /Selected model identity lock: keep the same bound model across every storyboard frame/i)
assert.match(compiled.finalPrompt, /REFERENCE IMAGE LOCK \(CRITICAL\)/i)
assert.match(shotLayerText, /Framing priority - product first: the product must stay the visual center and dominant subject/i)
assert.match(shotLayerText, /Face visibility control: no full face/i)
assert.match(shotLayerText, /Composition lock: avoid face-centered framing; keep face off-center or secondary in depth/i)
assert.match(shotLayerText, /Jewelry presentation rule: focus on ear, neck, and hand area, and keep the product larger and clearer than facial features/i)
assert.match(compiled.finalPrompt, /Keep only the minimum human wearing or hand-support context needed/i)
assert.doesNotMatch(compiled.finalPrompt, /Keep visible human wearing or hand interaction context/i)
assert.match(compiled.finalPrompt, /SPATIAL ANCHOR LOCK/i)
assert.match(compiled.finalPrompt, /PHYSICS CONSISTENCY/i)
assert.match(videoPrompt, /Use the provided reference image as primary visual source|REFERENCE IMAGE PRIORITY|REFERENCE IMAGE LOCK \(CRITICAL\)|Use Image 1 as the product reference image and the ONLY source of truth for the product/i)
assert.match(videoPrompt, /Avoid deformation or redesign|generation MUST fail instead of replacing it with a lookalike|generation must fail/i)
assert.match(videoPrompt, /STRICT CONSISTENCY/i)
assert.match(videoPrompt, /Same product instance/i)
assert.match(videoPrompt, /Only camera movement is allowed/i)
assert.match(videoPrompt, /Use flat diffuse lighting with stable exposure only|Flat diffuse lighting/i)
assert.match(videoPrompt, /Keep the generation prompt realistic and commercially usable|Natural commercial realism only|Realistic smartphone social-commerce style/i)
assert.match(earringNegative, /no exaggerated sparkle effect|no fantasy glow/i)
assert.match(earringNegative, /no standing upright earring|no floating earring|no unsupported rigid earring pose/i)
assert.match(earringNegative, /discard the generation instead of correcting it/i)
assert.match(zoomOutVideoPrompt, /Use the provided reference image as primary visual source|REFERENCE IMAGE PRIORITY|REFERENCE IMAGE LOCK \(CRITICAL\)|Use Image 1 as the product reference image and the ONLY source of truth for the product/i)
assert.match(zoomOutVideoPrompt, /Only camera movement is allowed/i)
assert.match(zoomOutVideoPrompt, /Same product instance/i)
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
assert.match(necklacePrompt, /Do NOT use full face, face-centered framing, or face-dominant composition/i)
assert.match(necklacePrompt, /Only allow partial face, side crop, ear-jawline-neck crop, or hand-product crop/i)
assert.match(necklacePrompt, /The product must stay larger, sharper, and more centered than surrounding body or facial features/i)
assert.match(necklacePrompt, /Keep the product close, sharp, and fully readable so structural details remain clear/i)
assert.match(necklacePrompt, /occupies 40% to 60% of the frame/i)
assert.doesNotMatch(necklacePrompt, /Face must be cropped, off-center, secondary, or reduced to ear\/jawline\/neck support only/i)

console.log('storyboard model identity lock smoke test passed')
