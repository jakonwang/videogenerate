import { randomUUID } from 'node:crypto'
import type { ShotSpec } from '../types'
import { computePromptHash } from '../cache'
import {
  buildNoSpeakingInstruction,
  buildSilentCommercialGlobalRule,
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
import type { PromptCompileResult, PromptLayerBlock } from './types'

function layer(name: PromptLayerBlock['name'], priority: number, text: string): PromptLayerBlock {
  return { name, priority, text: sanitizeGeneratedVideoPrompt(text, 1200) }
}

export function compilePromptConsistency(input: {
  projectId: string
  shot: ShotSpec
  productReferenceImagePaths?: string[]
}) {
  const productType = detectProductType(input.shot)
  const risk = analyzePromptRisk(input.shot, productType)
  const anchors = extractIdentityAnchors(input.shot, productType)
  const patches = generateConsistencyPatches({
    productType,
    anchors,
    strictConsistencyMode: risk.strictConsistencyMode,
    referencePriorityMode: risk.referencePriorityMode,
  })
  const normalized = normalizeShotPromptBase(input.shot)

  const layers: PromptLayerBlock[] = [
    layer('IDENTITY_LAYER', 10, `${generateIdentityLock(productType, anchors)} ${patches.identityPatch}`),
    layer('ANCHOR_LAYER', 20, `${patches.anchorPatch}`),
    layer('CONSISTENCY_LAYER', 30, `${generateReferencePriorityRules(risk.referencePriorityMode)} ${patches.consistencyPatch}`),
    layer('SHOT_LAYER', 40, `Preserve the original shot logic. ${normalized.scriptText}. Visual direction: ${normalized.visualDescription}. Product focus: ${input.shot.productFocus || 'keep the product clearly visible and commercially relevant'}.`),
    layer('MOTION_LAYER', 50, `Camera and motion direction: ${normalized.cameraDescription}. Motion must not alter product geometry, structure, attachment points, or count.`),
    layer('STYLE_LAYER', 60, `Preserve cinematic quality and commercial realism. ${normalized.styleDescription}`),
    layer(
      'PERFORMANCE_LAYER',
      65,
      `${buildSilentCommercialGlobalRule()} ${buildNoSpeakingInstruction()} Keep the human model head out of frame whenever possible. Never stage the subject as a spokesperson, explainer, presenter, host, or talking-head. Avoid frontal face framing, avoid direct eye contact with the camera, avoid open-mouth expression, avoid lip shapes that suggest speech, and keep lips closed or only minimally relaxed. Product angles are the only hero focus.`,
    ),
    layer('NEGATIVE_LAYER', 70, sanitizeNegativePrompt(`${patches.negativePatch}, ${generateAntiVariationRules(productType, risk.strictConsistencyMode)}, ${normalized.negativeDescription}`)),
  ]

  const finalPrompt = normalizeFinalPromptSections(layers.filter((item) => item.name !== 'NEGATIVE_LAYER').map((item) => `[${item.name}]\n${item.text}`))
  const finalNegativePrompt = sanitizeNegativePrompt(layers.find((item) => item.name === 'NEGATIVE_LAYER')?.text || '')
  const sourcePromptHash = computePromptHash({
    shot: input.shot,
    productRefs: input.productReferenceImagePaths ?? input.shot.productReferenceImagePaths ?? [],
    productDescription: input.shot.materialNeed,
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
