import assert from 'node:assert/strict'
import { mkdtemp, access } from 'node:fs/promises'
import os from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { renderViralCloneBatch } from '../src/main/modules/clone/renderViralCloneBatch'
import { getFfmpegExecutable, getFfprobeExecutable } from '../src/main/lib/binariesPath'

async function runFfmpeg(args: string[]) {
  const ffmpeg = getFfmpegExecutable()
  await new Promise<void>((resolve, reject) => {
    const child = spawn(ffmpeg, args, { windowsHide: true })
    let stderr = ''
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk)
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`ffmpeg failed: ${code}\n${stderr}`))
    })
  })
}

async function assertExists(path: string) {
  await access(path)
}

async function probeHasAudio(path: string) {
  const ffprobe = getFfprobeExecutable()
  return await new Promise<boolean>((resolve, reject) => {
    const child = spawn(ffprobe, [
      '-v',
      'error',
      '-select_streams',
      'a:0',
      '-show_entries',
      'stream=codec_type',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      path,
    ], { windowsHide: true })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk)
    })
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk)
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code !== 0) reject(new Error(`ffprobe failed: ${code}\n${stderr}`))
      else resolve(/\baudio\b/i.test(stdout))
    })
  })
}

async function createSourceClip(path: string, color: string, durationSec: number, withAudio = false) {
  await runFfmpeg([
    '-y',
    '-f',
    'lavfi',
    '-i',
    `color=c=${color}:s=720x1280:d=${durationSec}`,
    ...(
      withAudio
        ? ['-f', 'lavfi', '-i', `sine=frequency=660:duration=${durationSec}`, '-shortest', '-c:a', 'aac']
        : []
    ),
    '-pix_fmt',
    'yuv420p',
    path,
  ])
}

async function main() {
  const root = await mkdtemp(join(os.tmpdir(), 'clone-final-compose-audio-'))
  const shotA = join(root, 'shot-a.mp4')
  const shotB = join(root, 'shot-b.mp4')
  const referenceAudioVideo = join(root, 'reference-audio-video.mp4')
  const outDir = join(root, 'out')

  await createSourceClip(shotA, 'red', 1.2, true)
  await createSourceClip(shotB, 'blue', 1.2, true)
  await createSourceClip(referenceAudioVideo, 'black', 3, true)

  const rendered = await renderViralCloneBatch({
    projectId: 'smoke-project-audio',
    outDir,
    count: 1,
    bgmPath: referenceAudioVideo,
    shots: [
      { id: 'shot_1', index: 0, durationSec: 1, generatedClipPath: shotA } as any,
      { id: 'shot_2', index: 1, durationSec: 1, generatedClipPath: shotB } as any,
    ],
  })

  assert.equal(rendered.outputs.length, 1)
  await assertExists(rendered.outputs[0]!)
  assert.equal(await probeHasAudio(rendered.outputs[0]!), true)
  console.log('clone final compose reference audio only smoke test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
