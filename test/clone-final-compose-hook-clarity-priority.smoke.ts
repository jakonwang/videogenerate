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
  const root = await mkdtemp(join(os.tmpdir(), 'clone-final-compose-hook-clarity-priority-'))
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
    projectId: 'hook-clarity-priority-project',
    shots: [
      {
        id: 'shot_setup_hook',
        index: 0,
        durationSec: 2.4,
        generatedClipPath: inputVideoPath,
        generatedSource: 'cloud',
        scriptRole: 'hook',
        framing: 'wide',
        visualDescription: 'ambient lifestyle setup with scenic background and mood intro',
        actionDescription: 'establishing setup shot with background atmosphere',
        motion: 'static',
      } as any,
      {
        id: 'shot_clear_hook',
        index: 1,
        durationSec: 2.4,
        generatedClipPath: inputVideoPath,
        generatedSource: 'cloud',
        scriptRole: 'hook',
        storyboardReferenceMode: 'product_closeup',
        framing: 'closeup',
        productVisibility: 'high',
        shotType: 'closeup',
        productFocus: 'clear hero product detail close-up with crisp centered focus',
        actionDescription: 'instant reveal showing the product clearly',
        motion: 'fast_cut',
      } as any,
    ],
    outDir: outputDir,
    count: 1,
    maxRetry: 0,
  })

  assert.equal(result.outputs.length, 1)
  const report = JSON.parse(await readFile(result.reportPath, 'utf8'))
  const sources = report?.items?.[0]?.shotSources ?? []
  const setupHook = sources.find((item: any) => item.shotId === 'shot_setup_hook')
  const clearHook = sources.find((item: any) => item.shotId === 'shot_clear_hook')

  assert.equal(setupHook?.composeDiagnostics?.stage, 'hook')
  assert.equal(clearHook?.composeDiagnostics?.stage, 'hook')
  assert.ok(Number(clearHook?.composeDiagnostics?.emphasis?.clarityPriority || 0) > Number(setupHook?.composeDiagnostics?.emphasis?.clarityPriority || 0))
  assert.ok(Number(setupHook?.composeDiagnostics?.emphasis?.setupPenalty || 0) > 0)
  assert.ok(Number(clearHook?.clipDurationSec || 0) >= Number(setupHook?.clipDurationSec || 0))
  assert.ok(Number(clearHook?.composeDiagnostics?.intensity?.intensityScore || 0) > Number(setupHook?.composeDiagnostics?.intensity?.intensityScore || 0))
  console.log('clone final compose hook clarity priority smoke test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
