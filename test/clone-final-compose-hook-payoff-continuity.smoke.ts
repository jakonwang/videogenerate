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
  const root = await mkdtemp(join(os.tmpdir(), 'clone-final-compose-hook-payoff-continuity-'))
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
    projectId: 'hook-payoff-continuity-project',
    shots: [
      {
        id: 'shot_hook',
        index: 0,
        durationSec: 1.8,
        generatedClipPath: inputVideoPath,
        generatedSource: 'cloud',
        scriptRole: 'hook',
        onScreenText: 'Watch how this changes the look instantly.',
        actionDescription: 'instant before and after switch reveal',
        motion: 'fast_cut',
      } as any,
      {
        id: 'shot_payoff',
        index: 1,
        durationSec: 2.2,
        generatedClipPath: inputVideoPath,
        generatedSource: 'cloud',
        scriptRole: 'proof',
        storyboardReferenceMode: 'product_closeup',
        framing: 'closeup',
        productVisibility: 'high',
        shotType: 'closeup',
        productFocus: 'product texture and visible clasp detail',
        actionDescription: 'clear product payoff hold',
        motion: 'static',
      } as any,
      {
        id: 'shot_close',
        index: 2,
        durationSec: 1.8,
        generatedClipPath: inputVideoPath,
        generatedSource: 'cloud',
        scriptRole: 'cta',
        onScreenText: 'Tap now before it sells out.',
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
  const payoff = sources.find((item: any) => item.shotId === 'shot_payoff')

  assert.equal(composeSummary?.payoffHandoffCount, 1)
  assert.equal(composeSummary?.strongHookCount, 1)
  assert.equal(composeSummary?.health?.flags.includes('payoff_continuity_weak'), false)
  assert.equal(payoff?.composeDiagnostics?.stage, 'body')
  assert.equal(Boolean(payoff?.composeDiagnostics?.adjacency?.followsStrongHook), true)
  assert.equal(Boolean(payoff?.composeDiagnostics?.adjacency?.payoffHandoffCandidate), true)
  assert.ok(Number(payoff?.clipStartSec || 0) < 3.8)
  assert.ok(Number(payoff?.clipDurationSec || 0) >= 2.21)
  assert.equal(transitions.length, 2)
  assert.deepEqual(
    transitions.map((item: any) => item.transition),
    ['hardcut', 'fade'],
  )
  assert.equal(Number(transitions[0]?.durationSec || 0), 0)
  assert.ok(Number(transitions[1]?.durationSec || 0) >= 0.06)
  assert.ok(Number(transitions[1]?.durationSec || 0) <= 0.09)
  console.log('clone final compose hook payoff continuity smoke test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
