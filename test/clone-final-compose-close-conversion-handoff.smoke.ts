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
  const root = await mkdtemp(join(os.tmpdir(), 'clone-final-compose-close-conversion-handoff-'))
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
    projectId: 'close-conversion-handoff-project',
    shots: [
      {
        id: 'shot_body',
        index: 0,
        durationSec: 2.1,
        generatedClipPath: inputVideoPath,
        generatedSource: 'cloud',
        scriptRole: 'show',
        framing: 'medium',
        productVisibility: 'medium',
        shotType: 'model_demo',
        productFocus: 'natural use demo',
        actionDescription: 'natural demo with clear product use',
        motion: 'pan_right',
      } as any,
      {
        id: 'shot_confirm',
        index: 1,
        durationSec: 2.3,
        generatedClipPath: inputVideoPath,
        generatedSource: 'cloud',
        scriptRole: 'proof',
        storyboardReferenceMode: 'product_closeup',
        framing: 'closeup',
        productVisibility: 'high',
        shotType: 'closeup',
        productFocus: 'visible product detail and clasp finish',
        actionDescription: 'steady result confirmation hold',
        motion: 'static',
      } as any,
      {
        id: 'shot_cta',
        index: 2,
        durationSec: 2,
        generatedClipPath: inputVideoPath,
        generatedSource: 'cloud',
        scriptRole: 'cta',
        onScreenText: 'Tap now before this color sells out.',
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
  const confirm = sources.find((item: any) => item.shotId === 'shot_confirm')
  const cta = sources.find((item: any) => item.shotId === 'shot_cta')

  assert.equal(composeSummary?.closeConfirmationCount, 1)
  assert.equal(composeSummary?.strongCtaCount, 1)
  assert.equal(composeSummary?.health?.flags.includes('cta_pressure_soft'), false)
  assert.equal(Boolean(confirm?.composeDiagnostics?.adjacency?.preCloseConfirmationCandidate), true)
  assert.equal(Boolean(cta?.composeDiagnostics?.adjacency?.closesIntoCta), true)
  assert.ok(Number(confirm?.clipStartSec || 0) >= 0.9)
  assert.ok(Number(confirm?.clipDurationSec || 0) >= 2.28)
  assert.ok(Number(cta?.clipStartSec || 0) > Number(confirm?.clipStartSec || 0))
  assert.ok(Number(cta?.clipDurationSec || 0) <= 2.01)
  assert.equal(transitions.length, 2)
  assert.deepEqual(
    transitions.map((item: any) => item.transition),
    ['hardcut', 'hardcut'],
  )
  assert.equal(Number(transitions[0]?.durationSec || 0), 0)
  assert.equal(Number(transitions[1]?.durationSec || 0), 0)
  assert.ok(Number(cta?.clipDurationSec || 0) < 1.98)
  console.log('clone final compose close conversion handoff smoke test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
