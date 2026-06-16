import assert from 'node:assert/strict'
import { mkdtemp, readFile } from 'node:fs/promises'
import os from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { getFfmpegExecutable } from '../src/main/lib/binariesPath'
import { renderViralCloneBatch } from '../src/main/modules/clone/renderViralCloneBatch'

async function run(args: string[]) {
  const ffmpeg = getFfmpegExecutable()
  await new Promise<void>((resolve, reject) => {
    const child = spawn(ffmpeg, args, { windowsHide: true })
    let stderr = ''
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk)
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(`ffmpeg failed: ${code} ${stderr}`.trim()))
    })
  })
}

async function main() {
  const { __test_buildShotVideoPromptPreviewText } = await import('../src/main/modules/clone/service')

  const root = await mkdtemp(join(os.tmpdir(), 'clone-compose-feedback-bridge-'))
  const inputVideoPath = join(root, 'input.mp4')
  const outputDir = join(root, 'outputs')

  await run([
    '-y',
    '-f',
    'lavfi',
    '-i',
    'color=c=black:s=1080x1920:d=8',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    inputVideoPath,
  ])

  const composeResult = await renderViralCloneBatch({
    projectId: 'bridge-compose-project',
    shots: [
      {
        id: 'shot_product',
        index: 0,
        durationSec: 2.2,
        generatedClipPath: inputVideoPath,
        generatedSource: 'cloud',
        scriptRole: 'proof',
        storyboardReferenceMode: 'product_closeup',
        framing: 'closeup',
        productVisibility: 'high',
        shotType: 'closeup',
        productFocus: 'product detail display',
        actionDescription: 'steady product display',
        motion: 'static',
      } as any,
      {
        id: 'shot_body',
        index: 1,
        durationSec: 2.1,
        generatedClipPath: inputVideoPath,
        generatedSource: 'cloud',
        scriptRole: 'show',
        framing: 'medium',
        productVisibility: 'medium',
        shotType: 'model_demo',
        productFocus: 'natural product use',
        actionDescription: 'gentle natural demo',
        motion: 'pan_right',
      } as any,
      {
        id: 'shot_close',
        index: 2,
        durationSec: 2,
        generatedClipPath: inputVideoPath,
        generatedSource: 'cloud',
        scriptRole: 'cta',
        onScreenText: 'See more details',
        motion: 'static',
      } as any,
    ],
    outDir: outputDir,
    count: 1,
    maxRetry: 0,
  })

  const report = JSON.parse(await readFile(composeResult.reportPath, 'utf8'))
  const patch = report?.composeSummary?.upstreamOptimizationPatch
  assert.ok(patch)
  assert.equal(patch.tightenOpening, false)
  assert.equal(patch.addImmediatePayoff, true)
  assert.equal(patch.strengthenCtaUrgency, true)

  const hookShot = {
    id: 'hook_bridge_shot',
    index: 0,
    purpose: 'hook',
    startSec: 0,
    durationSec: 2.2,
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
    id: 'proof_bridge_shot',
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
  }

  const showShot = {
    ...hookShot,
    id: 'show_bridge_shot',
    index: 2,
    purpose: 'solution',
    scriptRole: 'show',
    scriptText: 'show natural usage with a clearer context shift',
    generationPrompt: 'middle product use coverage',
    visualDescription: 'natural product use in a real-life moment',
    actionDescription: 'gentle hand demo with visible usage context',
    cameraDescription: 'medium product use framing',
    productFocus: 'keep usage readable',
    motion: 'pan_right',
    framing: 'medium',
    shotType: 'model_demo',
  }

  const ctaShot = {
    ...hookShot,
    id: 'cta_bridge_shot',
    index: 3,
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
  }

  const project = {
    id: 'bridge-next-round-project',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    status: 'draft',
    runMode: 'manual',
    locale: 'zh-CN',
    strength: 'structure',
    referenceVideoPath: 'ref.mp4',
    referenceVideoName: 'ref.mp4',
    baseBlueprint: null,
    blueprint: {
      totalDurationSec: 8,
      referenceAspectRatio: '9:16',
      scriptFrame: { hook: '', problem: '', solution: '', proof: '', cta: '' },
      shots: [hookShot, proofShot, showShot, ctaShot],
      analysisNotes: [],
      transcript: '',
    },
    finalCompose: {
      status: 'done',
      updatedAt: Date.now(),
      composeSummary: {
        upstreamOptimizationPatch: patch,
      },
    },
    aiTasks: [],
    sessions: [],
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

  const hookPrompt = String(
    (await __test_buildShotVideoPromptPreviewText({
      project,
      shot: hookShot,
      productType: 'general',
      productAnalysisText: 'hero product',
    })).effectiveShot.compiledPrompt || '',
  )
  assert.doesNotMatch(hookPrompt, /Opening Hook Priority:/i)
  assert.match(hookPrompt, /Immediate Payoff: Move straight from the opening into visible proof, product result, or close-up confirmation\./i)

  const proofPrompt = String(
    (await __test_buildShotVideoPromptPreviewText({
      project,
      shot: proofShot,
      productType: 'general',
      productAnalysisText: 'hero product',
    })).effectiveShot.compiledPrompt || '',
  )
  assert.match(proofPrompt, /Immediate Payoff: Move straight from the opening into visible proof, product result, or close-up confirmation\./i)
  assert.doesNotMatch(proofPrompt, /Proof Upgrade:/i)
  assert.match(proofPrompt, /Conversion Pressure: Make the action outcome immediate and direct\./i)

  const showPrompt = String(
    (await __test_buildShotVideoPromptPreviewText({
      project,
      shot: showShot,
      productType: 'general',
      productAnalysisText: 'hero product',
    })).effectiveShot.compiledPrompt || '',
  )
  assert.match(showPrompt, /Immediate Payoff: Move straight from the opening into visible proof, product result, or close-up confirmation\./i)
  assert.doesNotMatch(showPrompt, /Mid-Sequence Variation:/i)
  assert.doesNotMatch(showPrompt, /Show Upgrade:/i)
  assert.doesNotMatch(showPrompt, /Proof Upgrade:/i)

  const ctaPrompt = String(
    (await __test_buildShotVideoPromptPreviewText({
      project,
      shot: ctaShot,
      productType: 'general',
      productAnalysisText: 'hero product',
    })).effectiveShot.compiledPrompt || '',
  )
  assert.match(ctaPrompt, /Conversion Pressure: Make the action outcome immediate and direct\./i)
  assert.doesNotMatch(ctaPrompt, /Snap Close:/i)

  console.log('clone compose feedback bridge smoke test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
