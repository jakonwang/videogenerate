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
  const root = await mkdtemp(join(os.tmpdir(), 'clone-final-compose-hook-payoff-microfade-'))
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
    projectId: 'hook-payoff-microfade-project',
    shots: [
      {
        id: 'shot_hook_soft',
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
        id: 'shot_cta',
        index: 2,
        durationSec: 1.8,
        generatedClipPath: inputVideoPath,
        generatedSource: 'cloud',
        scriptRole: 'cta',
        onScreenText: 'Tap now before this color is gone.',
        motion: 'static',
      } as any,
    ],
    outDir: outputDir,
    count: 1,
    maxRetry: 0,
  })

  assert.equal(result.outputs.length, 1)
  const report = JSON.parse(await readFile(result.reportPath, 'utf8'))
  const transitions = report?.items?.[0]?.transitions ?? []
  const sources = report?.items?.[0]?.shotSources ?? []
  const payoff = sources.find((item: any) => item.shotId === 'shot_payoff')

  assert.equal(transitions.length, 2)
  assert.equal(transitions[0]?.transition, 'fade')
  assert.ok(Number(transitions[0]?.durationSec || 0) >= 0.03)
  assert.ok(Number(transitions[0]?.durationSec || 0) <= 0.05)
  assert.equal(Boolean(payoff?.composeDiagnostics?.adjacency?.payoffHandoffCandidate), true)
  assert.equal(Boolean(payoff?.composeDiagnostics?.adjacency?.followsStrongHook), true)
  console.log('clone final compose hook payoff microfade smoke test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
