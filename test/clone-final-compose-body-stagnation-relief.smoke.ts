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
  const root = await mkdtemp(join(os.tmpdir(), 'clone-final-compose-body-stagnation-relief-'))
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
    projectId: 'body-stagnation-relief-project',
    shots: [
      {
        id: 'shot_hook',
        index: 0,
        durationSec: 1.7,
        generatedClipPath: inputVideoPath,
        generatedSource: 'cloud',
        scriptRole: 'hook',
        onScreenText: 'Watch the result immediately.',
        actionDescription: 'instant reveal switch',
        motion: 'fast_cut',
      } as any,
      {
        id: 'shot_proof_a',
        index: 1,
        durationSec: 2.4,
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
        durationSec: 2.4,
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
        id: 'shot_cta',
        index: 3,
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
  const sources = report?.items?.[0]?.shotSources ?? []
  const proofA = sources.find((item: any) => item.shotId === 'shot_proof_a')
  const proofB = sources.find((item: any) => item.shotId === 'shot_proof_b')

  assert.equal(Boolean(proofB?.composeDiagnostics?.adjacency?.needsPatternBreak), true)
  assert.equal(Boolean(proofB?.composeDiagnostics?.adjacency?.repeatedStaticFeel), true)
  assert.equal(Boolean(proofB?.composeDiagnostics?.adjacency?.repeatedCloseupFeel), true)
  assert.ok(Number(proofB?.clipDurationSec || 0) < Number(proofA?.clipDurationSec || 0))
  assert.ok(Number(proofB?.clipStartSec || 0) > Number(proofA?.clipStartSec || 0))
  console.log('clone final compose body stagnation relief smoke test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
