import assert from 'node:assert/strict'
import { mkdir, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

async function main() {
  const root = await mkdtemp(join(tmpdir(), 'vg-shot-consistency-rhythm-feedback-'))
  process.env.VIDEOGENERATE_USER_DATA_DIR = root
  process.env.VIDEOGENERATE_DATA_DIR = join(root, '.videogenerate')
  await mkdir(join(process.env.VIDEOGENERATE_DATA_DIR, 'db'), { recursive: true })

  const { cloneRepo } = await import('../src/main/modules/clone/repo')
  const { cloneService } = await import('../src/main/modules/clone/service')

  const now = Date.now()
  const hookShot = {
    id: 'hook_runtime_shot',
    index: 0,
    purpose: 'hook',
    startSec: 0,
    durationSec: 2.1,
    scriptRole: 'hook',
    scriptText: 'soft setup before product payoff',
    generationPrompt: 'ambient opener without explicit result',
    visualDescription: 'wide lifestyle opener before the product moment lands',
    actionDescription: 'gentle setup motion only',
    cameraDescription: 'slow opening drift',
    productFocus: 'show product value quickly',
    materialNeed: 'hero product',
    motion: 'static',
    framing: 'wide',
    shotType: 'model_demo',
    productType: 'general',
    prompt: { positive: '', negative: '', cameraMotion: '', aspectRatio: '9:16' },
    uploadedAssetIds: [],
    aiEnabled: true,
    sourceMode: 'ai',
    reviewStatus: 'pending',
    scriptConfidence: 0.9,
    visual: '',
    subtitleSuggestion: '',
    productReferenceImagePaths: [],
  } as any

  const proofShot = {
    ...hookShot,
    id: 'proof_runtime_shot',
    index: 1,
    purpose: 'solution',
    scriptRole: 'proof',
    scriptText: 'show the result clearly before close',
    generationPrompt: 'static proof coverage',
    visualDescription: 'clear result state with product confirmation',
    actionDescription: 'steady result hold',
    cameraDescription: 'clean proof closeup',
    productFocus: 'keep result readable',
    framing: 'closeup',
    shotType: 'closeup',
  } as any

  const ctaShot = {
    ...hookShot,
    id: 'cta_runtime_shot',
    index: 2,
    purpose: 'cta',
    scriptRole: 'cta',
    scriptText: 'close with order now intent',
    generationPrompt: 'final buy now close',
    visualDescription: 'decisive purchase-ending frame',
    actionDescription: 'direct final action',
    cameraDescription: 'tight final closeup',
    productFocus: 'keep action readable',
    framing: 'closeup',
    shotType: 'closeup',
  } as any

  const projectId = 'runtime-rhythm-feedback-project'
  await cloneRepo.upsertProject({
    id: projectId,
    createdAt: now,
    updatedAt: now,
    title: 'runtime-rhythm-feedback-project',
    archived: false,
    status: 'draft',
    runMode: 'manual',
    locale: 'zh-CN',
    strength: 'structure',
    referenceVideoPath: 'C:\\temp\\ref.mp4',
    referenceVideoName: 'ref.mp4',
    baseBlueprint: null,
    blueprint: {
      totalDurationSec: 6.3,
      referenceAspectRatio: '9:16',
      scriptFrame: { hook: '', problem: '', solution: '', proof: '', cta: '' },
      shots: [hookShot, proofShot, ctaShot],
      analysisNotes: [],
      transcript: '',
    },
    finalCompose: {
      status: 'done',
      updatedAt: now,
      composeSummary: {
        upstreamOptimizationPatch: {
          tightenOpening: true,
          addImmediatePayoff: true,
          increaseMidVariation: true,
          strengthenCtaUrgency: true,
          preferSnapClose: true,
        },
      },
    },
    aiTasks: [],
    reviewDecisions: {},
    sessions: [],
    modelIdentityPacks: [],
    defaultGenerationPolicy: { qualityProfile: 'high', variantStrength: 'medium' },
    policy: {
      qualityPriority: 'high',
      fallbackChain: ['seedance'],
      concurrency: 1,
      retries: 0,
      qualityGate: {
        enabled: false,
        minDurationRatio: 0,
        maxDurationRatio: 10,
        maxBlackFrameRatio: 1,
        minShortSide: 0,
        requireAudio: false,
      },
    },
  } as any)

  const compiledHook = await cloneService.recompileShotConsistency({
    cloneProjectId: projectId,
    shotId: hookShot.id,
  })
  const hookLayer = compiledHook.layers.find((item: any) => item.name === 'SHOT_LAYER')
  assert.ok(hookLayer)
  assert.match(String(hookLayer?.text || ''), /Hook Rhythm: The first beat must communicate product value immediately, not after a soft setup\./i)
  assert.match(String(hookLayer?.text || ''), /Hook Payoff Clarity: Make the visible result or hero product confirmation unmistakable inside this shot\./i)

  const compiledProof = await cloneService.recompileShotConsistency({
    cloneProjectId: projectId,
    shotId: proofShot.id,
  })
  const proofLayer = compiledProof.layers.find((item: any) => item.name === 'SHOT_LAYER')
  assert.ok(proofLayer)
  assert.match(String(proofLayer?.text || ''), /Middle Rhythm: Keep the shot commercially readable and moving forward\./i)
  assert.match(String(proofLayer?.text || ''), /Momentum Lift: Add one realistic emphasis shift in motion, framing, or reveal timing so the middle section does not feel dead\./i)
  assert.match(String(proofLayer?.text || ''), /Variation Break: Do not repeat the same static close-up coverage\./i)
  assert.match(String(proofLayer?.text || ''), /Body Progression: If this is a close-up proof or detail shot, make sure the next visual idea can escalate into a wider use case, hand interaction, or cleaner product-context reveal\./i)
  assert.match(String(proofLayer?.text || ''), /Proof-to-Action Bridge: Let the proof already lean toward purchase intent and closing momentum\./i)

  const compiledCta = await cloneService.recompileShotConsistency({
    cloneProjectId: projectId,
    shotId: ctaShot.id,
  })
  const ctaLayer = compiledCta.layers.find((item: any) => item.name === 'SHOT_LAYER')
  assert.ok(ctaLayer)
  assert.match(String(ctaLayer?.text || ''), /Closing Rhythm: End on a decisive action frame with direct decision pressure, not a soft fade-out feeling\./i)
  assert.match(String(ctaLayer?.text || ''), /CTA Pressure: Make urgency, action, or buy-now intent visually clear without becoming spammy\./i)

  const saved = await cloneRepo.getProject(projectId)
  const savedHook = saved?.blueprint?.shots?.find((item: any) => item.id === hookShot.id)
  const savedProof = saved?.blueprint?.shots?.find((item: any) => item.id === proofShot.id)
  const savedCta = saved?.blueprint?.shots?.find((item: any) => item.id === ctaShot.id)
  assert.match(String(savedHook?.compiledPrompt || ''), /Main Instruction:/i)
  assert.match(String(savedProof?.compiledPrompt || ''), /Main Instruction:/i)
  assert.match(String(savedCta?.compiledPrompt || ''), /Main Instruction:/i)
  assert.match(String(savedHook?.compiledPrompt || ''), /Hook Rhythm:/i)
  assert.match(String(savedProof?.compiledPrompt || ''), /Middle Rhythm:/i)
  assert.match(String(savedProof?.compiledPrompt || ''), /Variation Break:/i)
  assert.match(String(savedProof?.compiledPrompt || ''), /Body Progression:/i)
  assert.match(String(savedCta?.compiledPrompt || ''), /Closing Rhythm:|Conversion Pressure:/i)
  assert.ok(['standard', 'strict'].includes(String(savedHook?.consistencyMode || '')))
  assert.ok(['standard', 'strict'].includes(String(savedProof?.consistencyMode || '')))
  assert.ok(['standard', 'strict'].includes(String(savedCta?.consistencyMode || '')))
  assert.ok(String(savedHook?.compiledNegativePrompt || '').trim().length > 0)
  assert.ok(String(savedProof?.compiledNegativePrompt || '').trim().length > 0)
  assert.ok(String(savedCta?.compiledNegativePrompt || '').trim().length > 0)

  const publicReport = await cloneService.getShotConsistencyReport({
    cloneProjectId: projectId,
    shotId: proofShot.id,
  })
  const publicShotLayer = publicReport.layers.find((item: any) => item.name === 'SHOT_LAYER')
  assert.ok(publicShotLayer)
  assert.match(String(publicShotLayer?.text || ''), /Middle Rhythm: Keep the shot commercially readable and moving forward\./i)
  assert.match(String(publicShotLayer?.text || ''), /Momentum Lift: Add one realistic emphasis shift in motion, framing, or reveal timing so the middle section does not feel dead\./i)
  assert.match(String(publicShotLayer?.text || ''), /Variation Break: Do not repeat the same static close-up coverage\./i)
  assert.match(String(publicShotLayer?.text || ''), /Body Progression: If this is a close-up proof or detail shot, make sure the next visual idea can escalate into a wider use case, hand interaction, or cleaner product-context reveal\./i)
  assert.match(String(publicShotLayer?.text || ''), /Proof-to-Action Bridge: Let the proof already lean toward purchase intent and closing momentum\./i)

  console.log('clone shot video recompile shot consistency rhythm feedback smoke test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
