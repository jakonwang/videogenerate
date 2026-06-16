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
  const root = await mkdtemp(join(os.tmpdir(), 'clone-final-compose-cta-pressure-'))
  const inputVideoPath = join(root, 'input.mp4')
  const outputDir = join(root, 'outputs')

  await run([
    '-y',
    '-f',
    'lavfi',
    '-i',
    'color=c=black:s=1080x1920:d=9',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    inputVideoPath,
  ])

  const result = await renderViralCloneBatch({
    projectId: 'cta-pressure-project',
    shots: [
      {
        id: 'shot_confirm',
        index: 0,
        durationSec: 2.4,
        generatedClipPath: inputVideoPath,
        generatedSource: 'cloud',
        scriptRole: 'proof',
        storyboardReferenceMode: 'product_closeup',
        framing: 'closeup',
        productVisibility: 'high',
        shotType: 'closeup',
        productFocus: 'visible product finish and clasp detail',
        actionDescription: 'steady result confirmation hold',
        motion: 'static',
      } as any,
      {
        id: 'shot_cta',
        index: 1,
        durationSec: 2,
        generatedClipPath: inputVideoPath,
        generatedSource: 'cloud',
        scriptRole: 'cta',
        onScreenText: 'Tap now to get yours before it sells out today only.',
        actionDescription: 'order now limited time full set deal',
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
  const sources = report?.items?.[0]?.shotSources ?? []
  const transitions = report?.items?.[0]?.transitions ?? []
  const cta = sources.find((item: any) => item.shotId === 'shot_cta')

  assert.equal(composeSummary?.strongCtaCount, 1)
  assert.equal(composeSummary?.snapCloseCount, 1)
  assert.equal(composeSummary?.closeConfirmationCount, 0)
  assert.ok(Number(composeSummary?.rhythmScore || 0) >= 90)
  assert.deepEqual(composeSummary?.optimizationLanes, ['hook', 'close'])
  assert.equal(Array.isArray(composeSummary?.nextActions), true)
  assert.equal(composeSummary?.optimizationBrief?.focusArea, 'hook')
  assert.equal(composeSummary?.optimizationBrief?.urgency, 'low')
  assert.equal(
    composeSummary?.optimizationBrief?.upstreamPromptHints?.includes('Make the first line reveal the payoff immediately.'),
    true,
  )
  assert.equal(composeSummary?.upstreamOptimizationPatch?.tightenOpening, true)
  assert.equal(composeSummary?.upstreamOptimizationPatch?.strengthenCtaUrgency, true)
  assert.equal(composeSummary?.upstreamOptimizationPatch?.preferSnapClose, true)
  assert.equal(
    composeSummary?.nextActions?.includes('Rewrite the opening line to make the payoff explicit in the first 2 seconds.'),
    true,
  )
  assert.equal(typeof composeSummary?.health?.topPriority, 'string')
  assert.equal(Boolean(cta?.composeDiagnostics?.adjacency?.closesIntoCta), true)
  assert.equal(Boolean(cta?.composeDiagnostics?.ctaPressure?.isStrongCta), true)
  assert.equal(Boolean(cta?.composeDiagnostics?.ctaPressure?.shouldSnapClose), true)
  assert.ok(Number(cta?.clipDurationSec || 0) < 2)
  assert.equal(transitions.length, 1)
  assert.deepEqual(
    transitions.map((item: any) => item.transition),
    ['hardcut'],
  )
  assert.equal(Number(transitions[0]?.durationSec || 0), 0)
  console.log('clone final compose cta pressure smoke test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
