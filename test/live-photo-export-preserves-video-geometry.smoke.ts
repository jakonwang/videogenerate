import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { packageLivePhoto } from '../src/main/modules/live-photo/packager'
import { runFfmpeg } from '../src/main/modules/ffmpeg/runner'
import { probeMedia } from '../src/main/modules/ffmpeg/probe'

async function main() {
  const root = await mkdtemp(join(tmpdir(), 'vg-live-photo-export-geometry-'))
  const sourceStillPath = join(root, 'source-still.png')
  const sourceVideoPath = join(root, 'source-video.mp4')
  const exportDir = join(root, 'exported')

  await runFfmpeg({
    args: ['-y', '-f', 'lavfi', '-i', 'color=c=white:s=600x800', '-frames:v', '1', sourceStillPath],
  })
  await runFfmpeg({
    args: [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'color=c=#cc8844:s=600x800:d=1.2',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      sourceVideoPath,
    ],
  })

  const packaged = await packageLivePhoto(
    { runFfmpeg },
    {
      itemId: 'geometry-smoke-item',
      sourceStillPath,
      sourceVideoPath,
      exportDir,
      baseName: 'geometry-smoke',
      outputResolution: '2160x2880',
      frameRate: '30',
      quality: 'high',
    },
  )

  const probe = await probeMedia(packaged.videoPath)
  assert.equal(probe.width, 600)
  assert.equal(probe.height, 800)
  console.log('live photo export preserves video geometry smoke test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
