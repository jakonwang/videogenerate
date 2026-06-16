import assert from 'node:assert/strict'
import { access, mkdir, mkdtemp, readFile } from 'node:fs/promises'
import os from 'node:os'
import { join } from 'node:path'

async function ensureExists(path: string) {
  await access(path)
  return path
}

async function main() {
  const root = 'D:\\phpstudy_pro\\WWW\\videogenerate\\.videogenerate\\viral-clone\\b79f1d94-1ada-43e6-8136-3a42c7b3a411\\outputs\\job_001_try_1'
  const workspaceDir = await mkdtemp(join(os.tmpdir(), 'clone-final-compose-next-round-artifact-'))
  process.env.VIDEOGENERATE_USER_DATA_DIR = workspaceDir
  process.env.VIDEOGENERATE_DATA_DIR = join(workspaceDir, '.videogenerate')
  await mkdir(join(process.env.VIDEOGENERATE_DATA_DIR, 'db'), { recursive: true })

  const { cloneRepo } = await import('../src/main/modules/clone/repo')
  const { cloneService } = await import('../src/main/modules/clone/service')

  const sourcePaths = await Promise.all([
    ensureExists(join(root, 'shot_1.mp4')),
    ensureExists(join(root, 'shot_2.mp4')),
    ensureExists(join(root, 'shot_3.mp4')),
    ensureExists(join(root, 'shot_4.mp4')),
    ensureExists(join(root, 'shot_5.mp4')),
  ])

  const projectId = 'final-compose-next-round-artifact-project'
  const project = {
    id: projectId,
    title: 'Next Round Artifact Project',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    status: 'ready',
    runMode: 'manual',
    locale: 'zh-CN',
    strength: 'structure',
    outputDir: workspaceDir,
    referenceVideoPath: 'ref.mp4',
    referenceVideoName: 'ref.mp4',
    baseBlueprint: null,
    blueprint: {
      totalDurationSec: 10.2,
      referenceAspectRatio: '9:16',
      scriptFrame: { hook: '', problem: '', solution: '', proof: '', cta: '' },
      analysisNotes: [],
      transcript: '',
      shots: [
        {
          id: 'shot_hook_real',
          index: 0,
          durationSec: 1.9,
          status: 'done',
          canEnterRender: true,
          generatedClipPath: sourcePaths[0],
          generatedSource: 'cloud',
          scriptRole: 'hook',
          scriptText: 'see the result right away',
          actionDescription: 'direct result reveal with quick payoff',
          productFocus: 'hero result visible immediately',
          motion: 'static',
          framing: 'wide',
          shotType: 'model_demo',
          productType: 'general',
          sourceMode: 'ai',
        },
        {
          id: 'shot_payoff_real',
          index: 1,
          durationSec: 2.2,
          status: 'done',
          canEnterRender: true,
          generatedClipPath: sourcePaths[1],
          generatedSource: 'cloud',
          scriptRole: 'proof',
          scriptText: 'show the result clearly',
          storyboardReferenceMode: 'product_closeup',
          framing: 'closeup',
          productVisibility: 'high',
          shotType: 'closeup',
          productFocus: 'visible product detail and payoff close-up',
          actionDescription: 'clear proof hold with result focus',
          motion: 'static',
          productType: 'general',
          sourceMode: 'ai',
        },
        {
          id: 'shot_repeat_real',
          index: 2,
          durationSec: 2.2,
          status: 'done',
          canEnterRender: true,
          generatedClipPath: sourcePaths[2],
          generatedSource: 'cloud',
          scriptRole: 'proof',
          scriptText: 'repeat close product proof',
          storyboardReferenceMode: 'product_closeup',
          framing: 'closeup',
          productVisibility: 'high',
          shotType: 'closeup',
          productFocus: 'visible product detail and payoff close-up',
          actionDescription: 'steady repeated detail hold',
          motion: 'static',
          productType: 'general',
          sourceMode: 'ai',
        },
        {
          id: 'shot_show_real',
          index: 3,
          durationSec: 2.1,
          status: 'done',
          canEnterRender: true,
          generatedClipPath: sourcePaths[3],
          generatedSource: 'cloud',
          scriptRole: 'show',
          scriptText: 'show natural usage in context',
          framing: 'medium',
          productVisibility: 'medium',
          shotType: 'model_demo',
          productFocus: 'natural product use',
          actionDescription: 'natural demo with clean payoff',
          motion: 'pan_right',
          productType: 'general',
          sourceMode: 'ai',
        },
        {
          id: 'shot_cta_real',
          index: 4,
          durationSec: 1.8,
          status: 'done',
          canEnterRender: true,
          generatedClipPath: sourcePaths[4],
          generatedSource: 'cloud',
          scriptRole: 'cta',
          scriptText: 'tap now before it sells out',
          onScreenText: 'Tap now to get yours before it sells out today only.',
          actionDescription: 'order now limited time full set deal',
          motion: 'static',
          framing: 'closeup',
          shotType: 'closeup',
          productType: 'general',
          sourceMode: 'ai',
        },
      ],
    },
    previewPipeline: { status: 'idle', updatedAt: Date.now(), lastError: '' },
    finalCompose: { status: 'ready', updatedAt: Date.now() },
    aiTasks: [],
    sessions: [],
    shotVideoOutputs: [],
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
  } as any

  await cloneRepo.upsertProject(project)
  const result = await cloneService.composeCloneFinalVideo({
    cloneProjectId: projectId,
    outputDir: workspaceDir,
  } as any)

  const planPath = String(result.finalCompose?.nextRoundPlanPath || '').trim()
  assert.ok(planPath.toLowerCase().endsWith('next-round-plan.json'))

  const planJson = JSON.parse(await readFile(planPath, 'utf8'))
  const plan = Array.isArray(planJson?.plan) ? planJson.plan : []
  const proofPlan = plan.find((item: any) => item.shotId === 'shot_repeat_real')
  const showPlan = plan.find((item: any) => item.shotId === 'shot_show_real')

  assert.ok(String(result.finalCompose?.outputPath || '').trim().toLowerCase().endsWith('.mp4'))
  assert.equal(proofPlan?.lane, 'body')
  assert.equal(
    proofPlan?.promptDirectives?.includes('Upgrade this proof beat with a hand demo, wider usage context, angle shift, or momentum lift.'),
    true,
  )
  assert.match(String(proofPlan?.compiledPrompt || ''), /Proof Move Priority: Favor hand demo, wider usage context, angle shift, momentum lift before repeating another static close-up proof beat\./i)

  assert.equal(showPlan?.lane, 'body')
  assert.equal(
    showPlan?.promptDirectives?.includes('Open this show beat into clearer usage context, body interaction, angle shift, or momentum lift.'),
    true,
  )
  assert.match(String(showPlan?.compiledPrompt || ''), /Show Move Priority: Favor hand demo, wider usage context, angle shift, momentum lift so the middle keeps opening out instead of repeating the same usage beat\./i)

  const saved = await cloneRepo.getProject(projectId)
  assert.equal(String(saved?.finalCompose?.nextRoundPlanPath || '').trim(), planPath)

  console.log('clone final compose next round plan artifact smoke test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
