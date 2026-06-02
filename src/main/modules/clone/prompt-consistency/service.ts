import { randomUUID } from 'node:crypto'
import { compilationHistoryRepository } from '../prompt-consistency-db/repositories/compilationHistoryRepository'
import { projectConsistencyRepository } from '../prompt-consistency-db/repositories/projectConsistencyRepository'
import { shotConsistencyRepository } from '../prompt-consistency-db/repositories/shotConsistencyRepository'
import { ensurePromptConsistencyDb } from '../prompt-consistency-db/migrations'
import type { ShotSpec } from '../types'
import { compilePromptConsistency } from './compiler'
import type { PromptCompileResult, PromptModelIdentityInput } from './types'
import { PROMPT_CONSISTENCY_COMPILER_VERSION, PROMPT_CONSISTENCY_POLICY_VERSION } from './constants'

function now() {
  return Date.now()
}

let promptConsistencyFallbackChecked = false
let promptConsistencyDbEnabled = false

function canUsePromptConsistencyDb() {
  if (promptConsistencyFallbackChecked) return promptConsistencyDbEnabled
  promptConsistencyFallbackChecked = true
  try {
    promptConsistencyDbEnabled = Boolean(ensurePromptConsistencyDb())
  } catch {
    promptConsistencyDbEnabled = false
  }
  return promptConsistencyDbEnabled
}

export const promptConsistencyService = {
  compileAndPersist(input: {
    projectId: string
    shot: ShotSpec
    projectShotCount?: number
    productReferenceImagePaths?: string[]
    productDescription?: string
    modelIdentity?: PromptModelIdentityInput
  }) {
    const compiled = compilePromptConsistency({
      projectId: input.projectId,
      shot: input.shot,
      productReferenceImagePaths: input.productReferenceImagePaths,
      productDescription: input.productDescription,
      modelIdentity: input.modelIdentity,
    })
    if (!canUsePromptConsistencyDb()) {
      return compiled.result
    }
    const ts = now()
    const report = compiled.result
    shotConsistencyRepository.replaceReport({
      report: {
        id: compiled.id,
        project_id: report.projectId,
        shot_id: report.shotId,
        product_type: report.productType,
        risk_level: report.riskLevel,
        strict_consistency_mode: report.strictConsistencyMode ? 1 : 0,
        reference_priority_mode: report.referencePriorityMode,
        compiler_version: report.compilerVersion,
        policy_version: report.policyVersion,
        compiled_prompt: report.finalPrompt,
        compiled_negative_prompt: report.finalNegativePrompt,
        source_prompt_hash: report.sourcePromptHash,
        report_json: JSON.stringify(report),
        created_at: ts,
        updated_at: ts,
      },
      anchors: report.anchors.map((item, index) => ({
        id: randomUUID(),
        project_id: report.projectId,
        shot_id: report.shotId,
        anchor_key: item.key,
        anchor_value: item.value,
        confidence: item.confidence,
        source: item.source,
        sort_order: index,
        created_at: ts,
      })),
      riskFlags: report.riskFlags.map((flag) => ({
        id: randomUUID(),
        project_id: report.projectId,
        shot_id: report.shotId,
        risk_flag: flag,
        severity: report.riskLevel,
        created_at: ts,
      })),
      patches: [
        { type: 'identity_patch', text: report.patches.identityPatch },
        { type: 'model_identity_patch', text: report.patches.modelIdentityPatch },
        { type: 'anchor_patch', text: report.patches.anchorPatch },
        { type: 'consistency_patch', text: report.patches.consistencyPatch },
        { type: 'anti_variation_patch', text: report.patches.antiVariationPatch },
        { type: 'negative_patch', text: report.patches.negativePatch },
      ].map((item) => ({
        id: randomUUID(),
        project_id: report.projectId,
        shot_id: report.shotId,
        patch_type: item.type as any,
        patch_text: item.text,
        created_at: ts,
        updated_at: ts,
      })),
      layers: report.layers.map((item) => ({
        id: randomUUID(),
        project_id: report.projectId,
        shot_id: report.shotId,
        layer_name: item.name,
        layer_priority: item.priority,
        layer_text: item.text,
        created_at: ts,
      })),
    })

    projectConsistencyRepository.upsert({
      project_id: report.projectId,
      compiler_version: report.compilerVersion,
      policy_version: report.policyVersion,
      last_compiled_at: ts,
      strict_mode_default: report.strictConsistencyMode ? 1 : 0,
      summary_json: JSON.stringify({
        shotCount: input.projectShotCount || 0,
        latestShotId: report.shotId,
        riskLevel: report.riskLevel,
      }),
      created_at: ts,
      updated_at: ts,
    })

    compilationHistoryRepository.insert({
      id: randomUUID(),
      project_id: report.projectId,
      shot_id: report.shotId,
      compiler_version: report.compilerVersion,
      policy_version: report.policyVersion,
      risk_level: report.riskLevel,
      compiled_prompt: report.finalPrompt,
      compiled_negative_prompt: report.finalNegativePrompt,
      snapshot_json: JSON.stringify(report),
      created_at: ts,
    })

    return report
  },

  getShotConsistencyReport(projectId: string, shotId: string) {
    if (!canUsePromptConsistencyDb()) return null
    const row = shotConsistencyRepository.getReport(projectId, shotId)
    if (!row) return null
    const parsed = JSON.parse(row.report_json) as PromptCompileResult
    if (
      String(parsed.compilerVersion || '').trim() !== PROMPT_CONSISTENCY_COMPILER_VERSION ||
      String(parsed.policyVersion || '').trim() !== PROMPT_CONSISTENCY_POLICY_VERSION
    ) {
      return null
    }
    return parsed
  },

  listShotConsistencyAnchors(projectId: string, shotId: string) {
    if (!canUsePromptConsistencyDb()) return []
    return shotConsistencyRepository.listAnchors(projectId, shotId)
  },

  listShotConsistencyPatches(projectId: string, shotId: string) {
    if (!canUsePromptConsistencyDb()) return []
    return shotConsistencyRepository.listPatches(projectId, shotId)
  },

  previewShotConsistencyPrompt(projectId: string, shot: ShotSpec, modelIdentity?: PromptModelIdentityInput, productDescription?: string) {
    return this.compileAndPersist({ projectId, shot, productReferenceImagePaths: shot.productReferenceImagePaths, productDescription: productDescription || shot.materialNeed, modelIdentity })
  },
}
