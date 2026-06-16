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
  const root = await mkdtemp(join(os.tmpdir(), 'clone-final-compose-viral-rhythm-variation-'))
  const inputVideoPath = join(root, 'input.mp4')
  const outputDir = join(root, 'outputs')

  await run([
    '-y',
    '-f',
    'lavfi',
    '-i',
    'color=c=black:s=1080x1920:d=10',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    inputVideoPath,
  ])

  const result = await renderViralCloneBatch({
    projectId: 'viral-rhythm-variation-project',
    shots: [
      {
        id: 'shot_hook',
        index: 0,
        durationSec: 1.6,
        generatedClipPath: inputVideoPath,
        generatedSource: 'cloud',
        scriptRole: 'hook',
        onScreenText: 'Watch this switch in one second.',
        actionDescription: 'instant reveal and snap switch',
        motion: 'fast_cut',
      } as any,
      {
        id: 'shot_proof_a',
        index: 1,
        durationSec: 2.3,
        generatedClipPath: inputVideoPath,
        generatedSource: 'cloud',
        scriptRole: 'proof',
        storyboardReferenceMode: 'product_closeup',
        framing: 'closeup',
        productVisibility: 'high',
        shotType: 'closeup',
        productFocus: 'product texture detail',
        actionDescription: 'steady product detail reveal',
        motion: 'static',
      } as any,
      {
        id: 'shot_proof_b',
        index: 2,
        durationSec: 2.2,
        generatedClipPath: inputVideoPath,
        generatedSource: 'cloud',
        scriptRole: 'proof',
        storyboardReferenceMode: 'product_closeup',
        framing: 'closeup',
        productVisibility: 'high',
        shotType: 'closeup',
        productFocus: 'product texture detail',
        actionDescription: 'steady product detail hold',
        motion: 'static',
      } as any,
      {
        id: 'shot_show',
        index: 3,
        durationSec: 2.1,
        generatedClipPath: inputVideoPath,
        generatedSource: 'cloud',
        scriptRole: 'show',
        framing: 'medium',
        productVisibility: 'medium',
        shotType: 'model_demo',
        productFocus: 'natural use demo',
        actionDescription: 'natural demo with clean payoff',
        motion: 'pan_right',
      } as any,
      {
        id: 'shot_cta',
        index: 4,
        durationSec: 1.9,
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
  const proofB = sources.find((item: any) => item.shotId === 'shot_proof_b')
  const show = sources.find((item: any) => item.shotId === 'shot_show')

  assert.equal(composeSummary?.health?.verdict, 'balanced')
  assert.equal(Array.isArray(composeSummary?.health?.flags), true)
  assert.equal(composeSummary?.health?.flags.includes('weak_opening_signal'), false)
  assert.equal(Boolean(proofB?.composeDiagnostics?.adjacency?.needsPatternBreak), true)
  assert.equal(Boolean(proofB?.composeDiagnostics?.adjacency?.repeatedRoleCluster), true)
  assert.equal(Boolean(show?.composeDiagnostics?.adjacency?.preCloseConfirmationCandidate), true)
  assert.equal(Boolean(show?.composeDiagnostics?.adjacency?.shouldTightenSlightly), true)
  assert.equal(transitions.length, 4)
  assert.deepEqual(
    transitions.map((item: any) => item.transition),
    ['hardcut', 'fade', 'fade', 'hardcut'],
  )
  assert.ok(Number(transitions[1]?.durationSec || 0) >= 0.06)
  assert.ok(Number(transitions[2]?.durationSec || 0) >= 0.06)
  assert.equal(Number(transitions[3]?.durationSec || 0), 0)
  console.log('clone final compose viral rhythm variation smoke test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
