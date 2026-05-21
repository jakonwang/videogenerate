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
const earringNegative = buildCloneNegativePrompt('earrings', 'model_demo')
const spatialAnchorText = buildSpatialAnchorLockText('earrings')
const physicsConsistencyText = buildPhysicsConsistencyText('earrings')
const compositionLockText = buildCompositionLockText('earrings')
const cameraMotionLockText = buildCameraMotionLockText({ motion: 'zoom_out', framing: 'closeup', productType: 'earrings' })
const scaleConsistencyLockText = buildScaleConsistencyLockText('earrings', 'zoom_out')
const motionLimitText = buildMotionLimitText('earrings', 'zoom_out')

assert.match(prompt, /REFERENCE IMAGE LOCK \(CRITICAL\)/i)
assert.match(prompt, /NO SUBSTITUTE RULE/i)
assert.match(prompt, /HUMAN PRIORITY RULE/i)
assert.match(prompt, /STRICT MODEL IDENTITY LOCK/i)
assert.match(prompt, /SAME PERSON ACROSS ALL STORYBOARD FRAMES/i)
assert.match(prompt, /If the exact product cannot be preserved, generation MUST fail/i)
assert.match(prompt, /adjust human pose.*not the product/i)
assert.match(endPrompt, /FRAME CONTINUITY LOCK/i)
assert.match(endPrompt, /direct continuation of the provided GPT start frame|direct continuation of the starting frame/i)
assert.match(combined, /PRODUCT REFERENCES LOCK PRODUCT ONLY, NOT PERSON IDENTITY/i)
assert.match(combined, /Never use the person from the product images as the model source|REFERENCE PERSON EXCLUSION RULE/i)
assert.match(combined, /discard the generation instead of correcting it/i)
assert.match(compiled.finalPrompt, /Selected model identity lock: keep the same bound model across every storyboard frame/i)
assert.match(compiled.finalPrompt, /REFERENCE IMAGE LOCK \(CRITICAL\)/i)
assert.match(compiled.finalPrompt, /HUMAN PRIORITY RULE/i)
assert.match(compiled.finalPrompt, /SPATIAL ANCHOR LOCK/i)
assert.match(compiled.finalPrompt, /PHYSICS CONSISTENCY/i)
assert.match(
  `${prompt}\n${compiled.finalNegativePrompt}\n${earringNegative}`,
  /NO SUBSTITUTE RULE|discard the generation instead of correcting it/i,
)
assert.match(videoPrompt, /REFERENCE IMAGE LOCK \(CRITICAL\)/i)
assert.match(videoPrompt, /generation MUST fail instead of replacing it with a lookalike|generation must fail/i)
assert.match(videoPrompt, /adjust human pose.*not the product/i)
assert.match(videoPrompt, /generation must fail/i)
assert.match(earringNegative, /no exaggerated sparkle effect|no fantasy glow/i)
assert.match(earringNegative, /no standing upright earring|no floating earring|no unsupported rigid earring pose/i)
assert.match(earringNegative, /discard the generation instead of correcting it/i)
assert.match(zoomOutVideoPrompt, /This is a product replication \+ shot adaptation task/i)
assert.match(zoomOutVideoPrompt, /Reference video defines ONLY motion and camera behavior/i)
assert.match(zoomOutVideoPrompt, /There is ONLY ONE product instance/i)
assert.doesNotMatch(zoomOutVideoPrompt, /Replace only the person identity and product identity\./i)
assert.match(spatialAnchorText, /SPATIAL ANCHOR LOCK/i)
assert.match(spatialAnchorText, /same ear side|same piercing point|same hanging direction|same distance from the ear/i)
assert.match(physicsConsistencyText, /PHYSICS CONSISTENCY/i)
assert.match(compositionLockText, /COMPOSITION LOCK/i)
assert.match(cameraMotionLockText, /CAMERA MOTION LOCK/i)
assert.match(cameraMotionLockText, /single uninterrupted camera pull-back|single uninterrupted pull-back/i)
assert.match(cameraMotionLockText, /do not cut to a new shot/i)
assert.match(cameraMotionLockText, /regenerate a new framing/i)
assert.match(scaleConsistencyLockText, /SCALE CONSISTENCY LOCK/i)
assert.match(scaleConsistencyLockText, /do NOT enlarge, shrink, or rescale the product|Do NOT enlarge, shrink, or rescale the product/i)
assert.match(motionLimitText, /MOTION LIMIT/i)
assert.match(motionLimitText, /extremely subtle micro-movements caused by breathing/i)
assert.match(motionLimitText, /no noticeable swinging/i)

console.log('storyboard model identity lock smoke test passed')
