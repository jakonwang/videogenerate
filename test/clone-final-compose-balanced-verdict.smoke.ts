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
  const root = await mkdtemp(join(os.tmpdir(), 'clone-final-compose-balanced-verdict-'))
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

  const result = await renderViralCloneBatch({
    projectId: 'balanced-rhythm-project',
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

  assert.equal(result.outputs.length, 1)
  const report = JSON.parse(await readFile(result.reportPath, 'utf8'))
  const composeSummary = report?.composeSummary
  assert.equal(composeSummary?.totalShots, 3)
  assert.equal(composeSummary?.strongHookCount, 1)
  assert.equal(composeSummary?.closeConfirmationCount, 1)
  assert.equal(composeSummary?.strongCtaCount, 0)
  assert.equal(composeSummary?.payoffHandoffCount, 0)
  assert.ok(Number(composeSummary?.rhythmScore || 0) < 80)
  assert.deepEqual(composeSummary?.optimizationLanes, ['payoff', 'close'])
  assert.equal(Array.isArray(composeSummary?.nextActions), true)
  assert.equal(composeSummary?.optimizationBrief?.focusArea, 'payoff')
  assert.equal(composeSummary?.optimizationBrief?.urgency, 'high')
  assert.equal(
    composeSummary?.optimizationBrief?.upstreamPromptHints?.includes('Place a proof or closeup result shot immediately after the hook.'),
    true,
  )
  assert.equal(composeSummary?.upstreamOptimizationPatch?.tightenOpening, false)
  assert.equal(composeSummary?.upstreamOptimizationPatch?.addImmediatePayoff, true)
  assert.equal(composeSummary?.upstreamOptimizationPatch?.strengthenCtaUrgency, true)
  assert.equal(
    composeSummary?.nextActions?.includes('Place a proof or closeup payoff shot immediately after the hook.'),
    true,
  )
  assert.equal(
    composeSummary?.nextActions?.includes('Strengthen the closing CTA with urgency, scarcity, or a more direct action phrase.'),
    true,
  )
  assert.equal(composeSummary?.health?.verdict, 'needs_tuning')
  assert.equal(composeSummary?.health?.flags.includes('payoff_continuity_weak'), true)
  assert.equal(composeSummary?.health?.flags.includes('cta_pressure_soft'), true)
  assert.equal(
    composeSummary?.health?.topPriority,
    'Follow the hook with a clearer proof or payoff shot so viewers get the result faster.',
  )
  console.log('clone final compose balanced verdict smoke test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
