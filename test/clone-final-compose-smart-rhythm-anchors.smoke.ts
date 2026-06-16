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
  const root = await mkdtemp(join(os.tmpdir(), 'clone-final-compose-smart-rhythm-anchors-'))
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
    projectId: 'smart-rhythm-project',
    shots: [
      {
        id: 'shot_hook',
        index: 0,
        durationSec: 2.4,
        generatedClipPath: inputVideoPath,
        generatedSource: 'cloud',
        scriptRole: 'hook',
        onScreenText: 'Limited time offer. See why everyone is switching today.',
        actionDescription: 'instant reveal with before and after switch',
        motion: 'fast_cut',
      } as any,
      {
        id: 'shot_proof',
        index: 1,
        durationSec: 2.4,
        generatedClipPath: inputVideoPath,
        generatedSource: 'cloud',
        scriptRole: 'proof',
        storyboardReferenceMode: 'product_closeup',
        framing: 'extreme_closeup',
        productVisibility: 'high',
        shotType: 'closeup',
        productFocus: 'product texture and clasp detail close-up',
        actionDescription: 'show product detail with steady product reveal',
        motion: 'static',
      } as any,
      {
        id: 'shot_cta',
        index: 2,
        durationSec: 2.4,
        generatedClipPath: inputVideoPath,
        generatedSource: 'cloud',
        storyboardReferenceMode: 'product_closeup',
        framing: 'closeup',
        productVisibility: 'high',
        shotType: 'closeup',
        productFocus: 'product texture and clasp detail close-up',
        scriptRole: 'cta',
        onScreenText: 'Tap now to get the full set before this color sells out.',
        motion: 'static',
      } as any,
      {
        id: 'shot_fast_cut',
        index: 3,
        durationSec: 1,
        generatedClipPath: inputVideoPath,
        generatedSource: 'cloud',
        scriptRole: 'hook',
        actionDescription: 'instant switch reveal with fast motion',
        motion: 'fast_cut',
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
  const hook = sources.find((item: any) => item.shotId === 'shot_hook')
  const proof = sources.find((item: any) => item.shotId === 'shot_proof')
  const cta = sources.find((item: any) => item.shotId === 'shot_cta')
  const fastCut = sources.find((item: any) => item.shotId === 'shot_fast_cut')

  assert.equal(hook?.clipMode, 'smart_middle_tail')
  assert.equal(proof?.clipMode, 'smart_middle_tail')
  assert.equal(cta?.clipMode, 'smart_middle_tail')
  assert.equal(fastCut?.clipMode, 'smart_middle_tail')
  assert.ok(Number(hook?.clipStartSec || 0) <= 2)
  assert.equal(hook?.composeDiagnostics?.stage, 'hook')
  assert.equal(proof?.composeDiagnostics?.stage, 'body')
  assert.equal(cta?.composeDiagnostics?.stage, 'close')
  assert.equal(Boolean(cta?.composeDiagnostics?.readability?.needsHoldProtection), true)
  assert.equal(Boolean(fastCut?.composeDiagnostics?.intensity?.isAggressive), true)
  assert.equal(composeSummary?.totalShots, 4)
  assert.equal(composeSummary?.stageCounts?.hook, 2)
  assert.equal(composeSummary?.stageCounts?.body, 1)
  assert.equal(composeSummary?.stageCounts?.close, 1)
  assert.equal(composeSummary?.strongHookCount, 1)
  assert.equal(composeSummary?.aggressiveShotCount >= 2, true)
  assert.equal(composeSummary?.readabilityProtectedCount >= 2, true)
  assert.equal(composeSummary?.health?.verdict, 'needs_tuning')
  assert.equal(Array.isArray(composeSummary?.health?.flags), true)
  assert.equal(composeSummary?.health?.flags.includes('weak_opening_signal'), false)
  assert.equal(composeSummary?.health?.flags.includes('too_many_aggressive_shots'), true)
  assert.equal(Array.isArray(composeSummary?.health?.recommendations), true)
  assert.ok(Number(hook?.clipStartSec || 0) < Number(proof?.clipStartSec || 0))
  assert.ok(Number(proof?.clipStartSec || 0) < Number(cta?.clipStartSec || 0))
  assert.ok(Number(fastCut?.clipStartSec || 0) < Number(cta?.clipStartSec || 0))
  assert.ok(Number(fastCut?.clipDurationSec || 0) < Number(cta?.clipDurationSec || 0))
  assert.ok(Number(hook?.clipDurationSec || 0) >= 2.39)
  assert.ok(Number(hook?.clipDurationSec || 0) <= 2.45)
  assert.ok(Number(proof?.clipDurationSec || 0) >= 2.43)
  assert.ok(Number(proof?.clipDurationSec || 0) <= 2.46)
  assert.ok(Number(cta?.clipDurationSec || 0) >= 2.38)
  assert.ok(Number(cta?.clipDurationSec || 0) <= 2.49)
  assert.ok(Number(fastCut?.clipDurationSec || 0) >= 0.95)
  assert.ok(Number(fastCut?.clipDurationSec || 0) <= 1)
  assert.equal(transitions.length, 3)
  assert.deepEqual(
    transitions.map((item: any) => item.transition),
    ['hardcut', 'fade', 'hardcut'],
  )
  assert.ok(Number(transitions[1]?.durationSec || 0) <= 0.09)
  console.log('clone final compose smart rhythm anchors smoke test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
