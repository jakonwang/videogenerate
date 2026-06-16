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
  const root = await mkdtemp(join(os.tmpdir(), 'clone-final-compose-full-rhythm-journey-'))
  const inputVideoPath = join(root, 'input.mp4')
  const outputDir = join(root, 'outputs')

  await run([
    '-y',
    '-f',
    'lavfi',
    '-i',
    'color=c=black:s=1080x1920:d=12',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    inputVideoPath,
  ])

  const result = await renderViralCloneBatch({
    projectId: 'full-rhythm-journey-project',
    shots: [
      {
        id: 'shot_hook',
        index: 0,
        durationSec: 2.1,
        generatedClipPath: inputVideoPath,
        generatedSource: 'cloud',
        scriptRole: 'hook',
        onScreenText: 'See the result right away.',
        actionDescription: 'clear instant reveal without a fast cut',
        productFocus: 'hero result visible immediately',
        motion: 'static',
      } as any,
      {
        id: 'shot_payoff',
        index: 1,
        durationSec: 2.3,
        generatedClipPath: inputVideoPath,
        generatedSource: 'cloud',
        scriptRole: 'proof',
        storyboardReferenceMode: 'product_closeup',
        framing: 'closeup',
        productVisibility: 'high',
        shotType: 'closeup',
        productFocus: 'product texture and visible result close-up',
        actionDescription: 'clear proof hold with product payoff',
        motion: 'static',
      } as any,
      {
        id: 'shot_proof_repeat',
        index: 2,
        durationSec: 2.3,
        generatedClipPath: inputVideoPath,
        generatedSource: 'cloud',
        scriptRole: 'proof',
        storyboardReferenceMode: 'product_closeup',
        framing: 'closeup',
        productVisibility: 'high',
        shotType: 'closeup',
        productFocus: 'product texture and visible result close-up',
        actionDescription: 'steady repeated detail hold',
        motion: 'static',
      } as any,
      {
        id: 'shot_cta',
        index: 3,
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
  const item = report?.items?.[0]
  const transitions = item?.transitions ?? []
  const sources = item?.shotSources ?? []
  const hook = sources.find((entry: any) => entry.shotId === 'shot_hook')
  const payoff = sources.find((entry: any) => entry.shotId === 'shot_payoff')
  const repeatProof = sources.find((entry: any) => entry.shotId === 'shot_proof_repeat')
  const cta = sources.find((entry: any) => entry.shotId === 'shot_cta')

  assert.equal(item?.success, true)
  assert.equal(composeSummary?.stageCounts?.hook, 1)
  assert.equal(composeSummary?.stageCounts?.body, 2)
  assert.equal(composeSummary?.stageCounts?.close, 1)
  assert.equal(composeSummary?.payoffHandoffCount, 1)
  assert.equal(composeSummary?.strongCtaCount, 1)
  assert.equal(composeSummary?.snapCloseCount, 1)
  assert.ok(Number(composeSummary?.rhythmScore || 0) >= 80)

  assert.equal(Boolean(payoff?.composeDiagnostics?.adjacency?.payoffHandoffCandidate), true)
  assert.equal(Boolean(repeatProof?.composeDiagnostics?.adjacency?.needsPatternBreak), true)
  assert.equal(Boolean(cta?.composeDiagnostics?.adjacency?.closesIntoCta), true)
  assert.equal(Boolean(cta?.composeDiagnostics?.ctaPressure?.shouldSnapClose), true)

  assert.equal(transitions.length, 3)
  assert.equal(transitions[0]?.transition, 'fade')
  assert.ok(Number(transitions[0]?.durationSec || 0) >= 0.03)
  assert.ok(Number(transitions[0]?.durationSec || 0) <= 0.05)
  assert.equal(transitions[1]?.transition, 'fade')
  assert.ok(Number(transitions[1]?.durationSec || 0) >= 0.06)
  assert.ok(Number(transitions[1]?.durationSec || 0) <= 0.08)
  assert.equal(transitions[2]?.transition, 'hardcut')
  assert.equal(Number(transitions[2]?.durationSec || 0), 0)

  assert.ok(Number(repeatProof?.clipDurationSec || 0) < Number(payoff?.clipDurationSec || 0))
  assert.ok(Number(repeatProof?.clipStartSec || 0) > Number(payoff?.clipStartSec || 0))
  assert.ok(Number(cta?.clipDurationSec || 0) < 1.98)
  assert.ok(Number(cta?.clipStartSec || 0) > Number(repeatProof?.clipStartSec || 0))
  assert.ok(Number(hook?.clipStartSec || 0) < Number(payoff?.clipStartSec || 0))

  console.log('clone final compose full rhythm journey smoke test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
