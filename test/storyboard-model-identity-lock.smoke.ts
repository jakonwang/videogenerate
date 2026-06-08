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

assert.match(prompt, /\[TYPE\]\nStoryboard keyframe \(static image\)\./i)
assert.match(prompt, /\[SYSTEM MODE\]/i)
assert.match(prompt, /This is NOT a generative task\./i)
assert.match(prompt, /This is a strict compositing task\./i)
assert.match(prompt, /The goal is to PLACE an existing product into a scene/i)
assert.match(prompt, /\[ROLE MAP\]/i)
assert.match(prompt, /Image 1 = Product \(ONLY source of truth\)/i)
assert.match(prompt, /Image 2 = Model Identity/i)
assert.match(prompt, /Image 3 = Composition \/ Framing/i)
assert.match(prompt, /Strict separation\. No cross usage\./i)
assert.match(prompt, /\[PRODUCT - PIXEL LOCK\]/i)
assert.match(prompt, /The product must be treated as a FIXED 2D VISUAL ASSET\./i)
assert.match(prompt, /Allowed operations ONLY:/i)
assert.match(prompt, /- scale/i)
assert.match(prompt, /- rotate/i)
assert.match(prompt, /- translate \(position\)/i)
assert.match(prompt, /- simulate new lighting/i)
assert.match(prompt, /\[PRODUCT STRUCTURE LOCK\]/i)
assert.match(prompt, /Must remain 100% identical:/i)
assert.match(prompt, /- reflection pattern/i)
assert.match(prompt, /ABSOLUTELY NO:/i)
assert.match(prompt, /"more realistic" adjustment/i)
assert.match(prompt, /\[ANTI-HALLUCINATION LOCK\]/i)
assert.match(prompt, /ONLY the visible parts in Image 1 exist\./i)
assert.match(prompt, /If unseen -> keep unseen/i)
assert.match(prompt, /\[PRODUCT PRIORITY OVERRIDE\]/i)
assert.match(prompt, /Product visibility overrides:/i)
assert.match(prompt, /- anatomy correctness/i)
assert.match(prompt, /-> NEVER adjust product/i)
assert.match(prompt, /\[PRODUCT INTEGRATION RULE\]/i)
assert.match(prompt, /The product does NOT adapt to the scene\./i)
assert.match(prompt, /Human can be slightly deformed if necessary\./i)
assert.match(prompt, /\[COMPOSITION\]/i)
assert.match(prompt, /- Single static frame/i)
assert.match(prompt, /- Close-up shot/i)
assert.match(prompt, /Product occupies 65% to 80% of frame/i)
assert.match(prompt, /- Right-shifted composition/i)
assert.match(prompt, /- Final state only \(NO motion\)/i)
assert.match(prompt, /\[FOCUS LOCK\]/i)
assert.match(prompt, /Product = sharpest element/i)
assert.match(prompt, /100% in focus/i)
assert.match(prompt, /\[MODEL CONTROL\]/i)
assert.match(prompt, /Use ONLY identity from Image 2/i)
assert.match(prompt, /Male, (20-28|25-30|20–28|25–30)/i)
assert.match(prompt, /No full face/i)
assert.match(prompt, /No eyes/i)
assert.match(prompt, /Model is NOT the subject\./i)
assert.match(prompt, /\[HIERARCHY\]\n\s*\nproduct > ear > hand > body > face/i)
assert.match(prompt, /\[BACKGROUND SYSTEM - 解决灰背景核心\]/i)
assert.match(prompt, /Background MUST be:/i)
assert.match(prompt, /- soft lifestyle environment/i)
assert.match(prompt, /- warm or neutral tone/i)
assert.match(prompt, /FORBIDDEN:/i)
assert.match(prompt, /- pure gray background/i)
assert.match(prompt, /Background must feel real BUT unobtrusive\./i)
assert.match(prompt, /\[LIGHTING SYSTEM\]/i)
assert.match(prompt, /Lighting must MATCH product's original highlights/i)
assert.match(prompt, /Do NOT relight product independently/i)
assert.match(prompt, /\[STORYBOARD CONTROL\]/i)
assert.match(prompt, /Use Image 3 ONLY for:/i)
assert.match(prompt, /- camera angle/i)
assert.match(prompt, /IGNORE:/i)
assert.match(prompt, /Interpret as final static result/i)
assert.match(prompt, /\[CONSISTENCY CORE\]/i)
assert.match(prompt, /There is ONLY ONE product instance\./i)
assert.match(prompt, /- no reinterpretation/i)
assert.match(prompt, /\[FAIL CONDITIONS\]/i)
assert.match(prompt, /- product looks re-generated/i)
assert.match(prompt, /-> OUTPUT MUST FAIL/i)
assert.match(prompt, /\[OUTPUT\]/i)
assert.match(prompt, /- clean but NOT empty background/i)
assert.match(prompt, /Silent visual frame/i)
assert.match(prompt, /The product is the image\./i)
assert.match(prompt, /TikTok commercial style/i)
assert.doesNotMatch(prompt, /\[BACKGROUND CONTROL\]|\[BACKGROUND ISOLATION\]|\[PRODUCT LOCK - SINGLE SOURCE\]|\[FACE CONTROL\]|\[STORYBOARD ALIGNMENT\]|\[RESTRICTIONS\]/i)
assert.match(endPrompt, /Interpret as final static result/i)
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
assert.match(videoPrompt, /\[ABSOLUTE RULES\]/i)
assert.match(videoPrompt, /Product is a visual identity anchor from the canonical reference/i)
assert.match(videoPrompt, /\[ROLE MAP\]/i)
assert.match(videoPrompt, /Image 1 = product canonical source/i)
assert.match(videoPrompt, /\[SHOT CONTROL\]/i)
assert.match(videoPrompt, /Composition priority: product is the visual center, occupies 40% to 60% of the frame/i)
assert.match(videoPrompt, /Hierarchy: product > hands > body > face/i)
assert.match(videoPrompt, /Motion behavior: No product motion/i)
assert.match(videoPrompt, /Flat diffuse lighting/i)
assert.match(videoPrompt, /Keep the generation prompt realistic and commercially usable/i)
assert.match(earringNegative, /no exaggerated sparkle effect|no fantasy glow/i)
assert.match(earringNegative, /no standing upright earring|no floating earring|no unsupported rigid earring pose/i)
assert.match(earringNegative, /discard the generation instead of correcting it/i)
assert.match(zoomOutVideoPrompt, /\[ROLE MAP\]/i)
assert.match(zoomOutVideoPrompt, /Camera behavior:/i)
assert.match(zoomOutVideoPrompt, /Composition priority: product is the visual center, occupies 40% to 60% of the frame/i)
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
assert.match(necklacePrompt, /\[PRODUCT - PIXEL LOCK\]/i)
assert.match(necklacePrompt, /\[MODEL CONTROL\]/i)
assert.match(necklacePrompt, /VISIBLE AREA ONLY:/i)
assert.match(necklacePrompt, /- product wearing area/i)
assert.match(necklacePrompt, /\[BACKGROUND SYSTEM - 解决灰背景核心\]/i)
assert.doesNotMatch(necklacePrompt, /\[FACE CONTROL\]/i)

console.log('storyboard model identity lock smoke test passed')
