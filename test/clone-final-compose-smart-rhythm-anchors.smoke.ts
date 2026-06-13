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
        motion: 'zoom_in',
      } as any,
      {
        id: 'shot_cta',
        index: 1,
        durationSec: 2.4,
        generatedClipPath: inputVideoPath,
        generatedSource: 'cloud',
        scriptRole: 'cta',
        motion: 'static',
      } as any,
      {
        id: 'shot_fast_cut',
        index: 2,
        durationSec: 1,
        generatedClipPath: inputVideoPath,
        generatedSource: 'cloud',
        scriptRole: 'show',
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
  const hook = sources.find((item: any) => item.shotId === 'shot_hook')
  const cta = sources.find((item: any) => item.shotId === 'shot_cta')
  const fastCut = sources.find((item: any) => item.shotId === 'shot_fast_cut')

  assert.equal(hook?.clipMode, 'smart_middle_tail')
  assert.equal(cta?.clipMode, 'smart_middle_tail')
  assert.equal(fastCut?.clipMode, 'smart_middle_tail')
  assert.ok(Number(hook?.clipStartSec || 0) < Number(cta?.clipStartSec || 0))
  assert.ok(Number(fastCut?.clipStartSec || 0) < Number(cta?.clipStartSec || 0))
  assert.ok(Number(fastCut?.clipDurationSec || 0) < Number(cta?.clipDurationSec || 0))
  console.log('clone final compose smart rhythm anchors smoke test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
