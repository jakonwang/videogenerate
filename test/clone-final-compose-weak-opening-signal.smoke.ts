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
  const root = await mkdtemp(join(os.tmpdir(), 'clone-final-compose-weak-opening-signal-'))
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
    projectId: 'weak-opening-signal-project',
    shots: [
      {
        id: 'shot_hook_setup_a',
        index: 0,
        durationSec: 2.2,
        generatedClipPath: inputVideoPath,
        generatedSource: 'cloud',
        scriptRole: 'hook',
        framing: 'wide',
        visualDescription: 'ambient lifestyle intro with scenic background and mood setup',
        actionDescription: 'establishing setup shot with background atmosphere',
        motion: 'static',
      } as any,
      {
        id: 'shot_hook_setup_b',
        index: 1,
        durationSec: 2.2,
        generatedClipPath: inputVideoPath,
        generatedSource: 'cloud',
        scriptRole: 'hook',
        framing: 'full_body',
        visualDescription: 'lifestyle intro with soft environment and scenic background',
        actionDescription: 'walking setup shot with intro mood',
        motion: 'static',
      } as any,
      {
        id: 'shot_body',
        index: 2,
        durationSec: 2.4,
        generatedClipPath: inputVideoPath,
        generatedSource: 'cloud',
        scriptRole: 'proof',
        motion: 'static',
      } as any,
    ],
    outDir: outputDir,
    count: 1,
    maxRetry: 0,
  })

  const report = JSON.parse(await readFile(result.reportPath, 'utf8'))
  const composeSummary = report?.composeSummary
  assert.equal(composeSummary?.strongHookCount, 0)
  assert.equal(composeSummary?.health?.verdict, 'needs_tuning')
  assert.equal(composeSummary?.health?.flags.includes('weak_opening_signal'), true)
  assert.equal(
    composeSummary?.health?.recommendations.includes('Strengthen the opening with a clearer product hero, action reveal, or more direct payoff shot.'),
    true,
  )
  console.log('clone final compose weak opening signal smoke test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
