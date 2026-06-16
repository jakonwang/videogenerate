import { randomUUID } from 'node:crypto'
import type { ShotSpec } from '../types'
import { computePromptHash } from '../cache'
import {
  buildCameraMotionLockText,
  buildNoSpeakingInstruction,
  buildFailInsteadRuleText,
  buildFrameContinuityLockText,
  buildHumanPriorityRuleText,
  buildCompositionLockText,
  buildPhysicsConsistencyText,
  buildNoSubstituteRuleText,
  buildReferenceImageLockText,
  buildSilentCommercialGlobalRule,
  buildMotionLimitText,
  buildViralRhythmShotGuidance,
  buildScaleConsistencyLockText,
  buildSpatialAnchorLockText,
  sanitizeGeneratedVideoPrompt,
  sanitizeNegativePrompt,
} from '../prompt'
import { PROMPT_CONSISTENCY_COMPILER_VERSION, PROMPT_CONSISTENCY_POLICY_VERSION } from './constants'
import { extractIdentityAnchors } from './anchor-extractor'
import { generateAntiVariationRules } from './anti-variation'
import { generateIdentityLock } from './identity-lock'
import { normalizeFinalPromptSections, normalizeShotPromptBase } from './normalizer'
import { generateConsistencyPatches } from './patch-engine'
import { generateReferencePriorityRules } from './reference-priority'
import { analyzePromptRisk, detectProductType } from './risk-analyzer'
import type { PromptCompileResult, PromptLayerBlock, PromptModelIdentityInput } from './types'

function layer(name: PromptLayerBlock['name'], priority: number, text: string): PromptLayerBlock {
  return { name, priority, text: sanitizeGeneratedVideoPrompt(text, 1200) }
}

function isModelPresentationShot(shot: ShotSpec) {
  const role = String(shot.role || shot.shotRole || shot.purpose || '').trim().toLowerCase()
  const shotType = String(shot.shotType || '').trim().toLowerCase()
  return role === 'model_scene' || shotType === 'model_demo'
}

function looksLikeEarringPromptTarget(shot: ShotSpec, productDescription?: string) {
  const haystack = [
    shot.productType,
    shot.visualDescription,
    shot.generationPrompt,
    shot.productFocus,
    shot.materialNeed,
    productDescription,
  ]
    .map((item) => String(item || '').toLowerCase())
    .join('\n')
  return /earrings?|earring|ear jewelry|jewelry|jewellery|hoop|dangle|drop earring|stud|silver|gold|zircon|star-shaped dangles/.test(
    haystack,
  )
}

function buildFaceVisibilityLockText(input: { isEarringLike: boolean; modelPresentationShot: boolean }) {
  if (input.isEarringLike) {
    return [
      'FRAMING PRIORITY - PRODUCT FIRST: the product must be the visual center and dominant subject.',
      'The human face must NOT be the focal point.',
      'FACE VISIBILITY CONTROL: do NOT show full face.',
      'Allow only partial face, cropped face, side profile, back three-quarter angle, or lower-face exclusion.',
      'Keep one ear and the wearing area fully readable, but keep the eyes out of frame whenever possible.',
      'Avoid full frontal face, eye contact, and face-centered framing.',
      'COMPOSITION LOCK: product in primary focus area; face off-center, cropped, or secondary in depth.',
      'JEWELRY PRESENTATION RULE: focus on ear, neck, and hand area. Face supports structure only.',
      'Product must be larger, clearer, and more visually dominant than facial features.',
      'If the face starts competing with the product, tighten the crop further and prioritize the ear, jawline, neck, and product area only.',
    ].join(' ')
  }
  if (input.modelPresentationShot) {
    return 'FRAMING PRIORITY - PRODUCT FIRST: the product must remain the hero subject. Avoid full frontal face framing, face-centered composition, and face-dominant portrait crops. Prefer partial face, side angle, hand-product crop, or off-center face placement so the product remains visually dominant.'
  }
  return 'Keep the human model head out of frame whenever possible.'
}

function crossShotConsistencyText(shot: ShotSpec, modelPresentationShot: boolean) {
  return [
    'Silent visual commercial.',
    modelPresentationShot
      ? 'No dialogue. No presenter delivery. Keep only the minimum human wearing or hand-support context needed to explain product placement. The person must not become the visual subject.'
      : 'No face. No dialogue.',
    buildReferenceImageLockText(),
    'REFERENCE IMAGE LOCK (CRITICAL): the provided product reference image is the only valid source for product identity.',
    'STRICT PRODUCT LOCK:',
    'There is ONLY ONE product instance across all shots.',
    'Must EXACTLY match the references in silhouette, geometry, structure, material, color, and proportion.',
    'NO variation allowed.',
    'MODEL LOCK:',
    'Same model identity across all shots.',
    'Model controls human only.',
    'HUMAN PRIORITY RULE: the human must adapt to the product.',
    'Do not modify, resize, reshape, bend, simplify, or restyle the product to fit the human body.',
    'If any conflict occurs, adjust human pose, hand placement, ear position, neck angle, or body framing, not the product.',
    buildSpatialAnchorLockText(String(shot.productType || '')),
    buildPhysicsConsistencyText(String(shot.productType || '')),
    buildCompositionLockText(String(shot.productType || '')),
    'CONSISTENCY RULE:',
    'All shots use the SAME product instance.',
    'NOT re-generated per shot.',
    'Different camera views ONLY.',
    'CRITICAL FIX: This is NOT a product generation task. This is a product replication + shot adaptation task.',
    'PRODUCT SOURCE LOCK: The product MUST be taken from the provided product image. NOT generated from text. NOT inferred from video.',
    'INSTANCE RULE: There is ONLY ONE product instance. All shots use the SAME object.',
    'VIDEO ROLE LIMIT: Reference video defines ONLY motion and camera behavior. It MUST NOT change product structure.',
    'ANTI-RECONSTRUCTION: Do NOT rebuild product from description. Only replicate from reference image.',
    buildNoSubstituteRuleText(),
    'NO SUBSTITUTE RULE: if exact consistency cannot be maintained, do not generate a similar or alternative product.',
    'If the exact product or model identity cannot be preserved, generation must fail.',
    modelPresentationShot
      ? 'This shot may keep minimum human wearing or hand-support context, but it must still read as a product-led frame of the same locked product instance.'
      : 'This shot may stay product-led, but it must still be another view of the same locked product instance.',
    `Shot ${shot.index + 1} is another view of the same locked subject, not a newly invented setup.`,
  ].join(' ')
}

function modelIdentityPromptText(input: {
  modelIdentity?: PromptModelIdentityInput
  modelIdentityPatch: string
}) {
  const profile = [
    input.modelIdentity?.description ? `description=${input.modelIdentity.description}` : '',
    input.modelIdentity?.market ? `market=${input.modelIdentity.market}` : '',
    input.modelIdentity?.gender ? `gender=${input.modelIdentity.gender}` : '',
    input.modelIdentity?.ageRange ? `age_range=${input.modelIdentity.ageRange}` : '',
    input.modelIdentity?.hairStyle ? `hair=${input.modelIdentity.hairStyle}` : '',
    input.modelIdentity?.skinTone ? `skin=${input.modelIdentity.skinTone}` : '',
    input.modelIdentity?.outfitStyle ? `outfit=${input.modelIdentity.outfitStyle}` : '',
    input.modelIdentity?.mood ? `mood=${input.modelIdentity.mood}` : '',
    input.modelIdentity?.sceneStyle ? `scene=${input.modelIdentity.sceneStyle}` : '',
  ]
    .filter(Boolean)
    .join('; ')
  return [
    'STRICT MODEL IDENTITY LOCK (HIGHEST PRIORITY FOR PERSON IDENTITY): This is a selected-model binding task, NOT a free character generation task.',
    'SAME PERSON ACROSS ALL STORYBOARD FRAMES: every storyboard frame must use the exact same selected model identity.',
    'Use the selected model reference image as the only valid person identity source.',
    'Do not define the model with textual appearance description; rely on the bound model reference image only.',
    'Only the selected model identity package defines who the person is.',
    input.modelIdentityPatch,
  ]
    .filter(Boolean)
    .join(' ')
}

function referenceResponsibilityPromptText() {
  return [
    'PRODUCT REFERENCES LOCK PRODUCT ONLY, NOT PERSON IDENTITY.',
    'REFERENCE PERSON EXCLUSION RULE: if the product images contain a human wearer or holder, that human is invalid and must be ignored completely.',
    'Use the product images only for product structure, material, color, scale, attachment details, and surface identity.',
    'Never use the person from the product images as the model source.',
  ].join(' ')
}

export function compilePromptConsistency(input: {
  projectId: string
  shot: ShotSpec
  productReferenceImagePaths?: string[]
  productDescription?: string
  modelIdentity?: PromptModelIdentityInput
}) {
  const productType = detectProductType(input.shot)
  const risk = analyzePromptRisk(input.shot, productType)
  const anchors = extractIdentityAnchors(input.shot, productType)
  const patches = generateConsistencyPatches({
    productType,
    anchors,
    strictConsistencyMode: risk.strictConsistencyMode,
    referencePriorityMode: risk.referencePriorityMode,
    modelIdentity: input.modelIdentity,
  })
  const normalized = normalizeShotPromptBase(input.shot)
  const modelPresentationShot = isModelPresentationShot(input.shot)
  const isEarringLike = looksLikeEarringPromptTarget(input.shot, input.productDescription)
  const faceVisibilityLockText = buildFaceVisibilityLockText({ isEarringLike, modelPresentationShot })
  const crossShotLock = crossShotConsistencyText(input.shot, modelPresentationShot)
  const viralRhythmGuidance = buildViralRhythmShotGuidance(input.shot)
  const strictShotLayer = risk.strictConsistencyMode
    ? `Preserve the original shot logic only. ${normalized.scriptText}. ${viralRhythmGuidance} ${isEarringLike ? 'Scene: extreme close-up of ear wearing the earring. Framing priority - product first: the product must stay the visual center and dominant subject. Face visibility control: no full face; allow only partial face, cropped face, side profile, or ear-jawline-neck crop. Composition lock: avoid face-centered framing; keep face off-center or secondary in depth. Jewelry presentation rule: focus on ear, neck, and hand area, and keep the product larger and clearer than facial features.' : ''} Keep the product fully readable, visible, and structurally unchanged. Visual continuity must follow the reference images first.${modelPresentationShot ? ' Keep only the minimum human wearing or hand-support context needed for believable product placement. Do not let the person become the frame subject.' : ''}`
    : `Preserve the original shot logic. ${normalized.scriptText}. ${viralRhythmGuidance} ${isEarringLike ? 'Scene: extreme close-up of ear wearing the earring. Framing priority - product first: the product must stay the visual center and dominant subject. Face visibility control: no full face; allow only partial face, cropped face, side profile, or ear-jawline-neck crop. Composition lock: avoid face-centered framing; keep face off-center or secondary in depth. Jewelry presentation rule: focus on ear, neck, and hand area, and keep the product larger and clearer than facial features.' : `Visual direction: ${normalized.visualDescription}.`} Product focus: ${isEarringLike ? 'preserve shape, proportions, and structure. Avoid deformation or redesign.' : input.shot.productFocus || 'keep the product clearly visible and commercially relevant'}.${modelPresentationShot ? ' Keep only the minimum human wearing or hand-support context needed for product readability. Avoid turning the frame into a model portrait or presenter shot.' : ''}`
  const strictMotionLayer = risk.strictConsistencyMode
    ? `Camera and motion direction: ${normalized.cameraDescription}. Motion is secondary. Never let camera energy hide, distort, crop away, or redesign the product.`
    : `Camera and motion direction: ${normalized.cameraDescription}. Motion must not alter product geometry, structure, attachment points, or count.`
  const strictStyleLayer = risk.strictConsistencyMode
    ? `Commercial realism only. Style is secondary to identity. Cinematic treatment must never override product identity, model identity, exact structure, or accessory count. ${normalized.styleDescription}`
    : `Preserve cinematic quality and commercial realism. ${normalized.styleDescription}`
  const productDescriptionLayer = isEarringLike
    ? ''
    : String(input.productDescription || '').trim()
    ? [
        'TEXT PRODUCT DESCRIPTION LOCK (SECONDARY TO PRODUCT CANONICAL SOURCE AND PRODUCT REFERENCES):',
        'Use this frozen product base data only as supportive structure and material guidance.',
        'If any text conflicts with Product Canonical Source or bound product references, Product Canonical Source wins.',
        String(input.productDescription || '').trim(),
      ].join(' ')
    : ''

  const layers: PromptLayerBlock[] = [
    layer('CONSISTENCY_LAYER', 10, `${crossShotLock}`),
    layer(
      'ANCHOR_LAYER',
      15,
      `PRODUCT REFERENCES LOCK PRODUCT ONLY, NOT PERSON IDENTITY. ${referenceResponsibilityPromptText()} ${buildSpatialAnchorLockText(String(input.shot.productType || ''))} ${buildPhysicsConsistencyText(String(input.shot.productType || ''))} ${buildCompositionLockText(String(input.shot.productType || ''))} ${buildCameraMotionLockText({ motion: String(input.shot.motion || ''), framing: String(input.shot.framing || ''), productType: String(input.shot.productType || '') })} ${buildScaleConsistencyLockText(String(input.shot.productType || ''), String(input.shot.motion || ''))} ${buildMotionLimitText(String(input.shot.productType || ''), String(input.shot.motion || ''))} ${buildNoSubstituteRuleText()} ${buildFailInsteadRuleText()}`,
    ),
    layer(
      'IDENTITY_LAYER',
      20,
      `${modelIdentityPromptText({ modelIdentity: input.modelIdentity, modelIdentityPatch: patches.modelIdentityPatch })} ${generateIdentityLock(productType, anchors)} ${patches.identityPatch}`,
    ),
    layer('CONSISTENCY_LAYER', 30, `${generateReferencePriorityRules(risk.referencePriorityMode)} ${patches.consistencyPatch} ${buildHumanPriorityRuleText()}`),
    layer('ANCHOR_LAYER', 40, `${patches.anchorPatch}`),
    layer('PRODUCT_DESCRIPTION_LAYER', 45, productDescriptionLayer),
    layer('SHOT_LAYER', 50, `${strictShotLayer} ${buildFrameContinuityLockText({ isEnd: false, shotIndex: input.shot.index })}`),
    layer('MOTION_LAYER', 60, strictMotionLayer),
    layer('STYLE_LAYER', 70, strictStyleLayer),
    layer(
      'PERFORMANCE_LAYER',
      80,
      `${buildSilentCommercialGlobalRule()} ${buildNoSpeakingInstruction()} ${modelPresentationShot ? 'This is a product-led wearing shot. Keep only the minimum human presence needed for believable product placement, ear/neck/hand relation, or support context. Do not convert it into a pure product cutout, catalog still, tabletop-only image, model portrait, or presenter frame.' : 'Keep the human model head out of frame whenever possible.'} ${faceVisibilityLockText} Human identity lock: only the selected bound model may appear. Never use any person from the product reference images, reference video, or source footage as the model identity source. If product references include a worn product on another person, replace that person completely with the selected model identity while keeping the exact same product only. Exactly one human model is allowed when human presence is needed; no second model, no mixed identity, no duplicate person, no extra background demonstrator. Never stage the subject as a spokesperson, explainer, presenter, host, or talking-head. Avoid frontal face framing, avoid direct eye contact with the camera, avoid open-mouth expression, avoid lip shapes that suggest speech, and keep lips closed or only minimally relaxed. Product-led composition is required. ${buildHumanPriorityRuleText()} ${buildFailInsteadRuleText()}`,
    ),
    layer('NEGATIVE_LAYER', 90, sanitizeNegativePrompt(`${patches.negativePatch}, ${generateAntiVariationRules(productType, risk.strictConsistencyMode)}, ${normalized.negativeDescription}, ${buildNoSubstituteRuleText()}, ${buildFailInsteadRuleText()}`)),
  ]

  const finalPrompt = normalizeFinalPromptSections(layers.filter((item) => item.name !== 'NEGATIVE_LAYER').map((item) => `[${item.name}]\n${item.text}`))
  const finalNegativePrompt = sanitizeNegativePrompt(layers.find((item) => item.name === 'NEGATIVE_LAYER')?.text || '')
  const sourcePromptHash = computePromptHash({
    shot: input.shot,
    productRefs: input.productReferenceImagePaths ?? input.shot.productReferenceImagePaths ?? [],
    productDescription: input.productDescription || input.shot.materialNeed,
    model: String(input.shot.generatedModel || input.shot.prompt?.aspectRatio || ''),
    qualityMode: input.shot.qualityMode || 'standard',
  })

  const result: PromptCompileResult = {
    projectId: input.projectId,
    shotId: input.shot.id,
    productType,
    riskLevel: risk.riskLevel,
    riskFlags: risk.riskFlags,
    strictConsistencyMode: risk.strictConsistencyMode,
    referencePriorityMode: risk.referencePriorityMode,
    anchors,
    layers,
    patches,
    finalPrompt,
    finalNegativePrompt,
    compilerVersion: PROMPT_CONSISTENCY_COMPILER_VERSION,
    policyVersion: PROMPT_CONSISTENCY_POLICY_VERSION,
    sourcePromptHash,
  }
  return { id: randomUUID(), result }
}
