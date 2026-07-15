import assert from 'node:assert/strict'
import { mkdir, mkdtemp } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { runFfmpeg } from '../src/main/modules/ffmpeg/runner'
import { probeMedia } from '../src/main/modules/ffmpeg/probe'

async function main() {
  const root = await mkdtemp(join(tmpdir(), 'vg-live-photo-export-original-video-'))
  process.env.VIDEOGENERATE_USER_DATA_DIR = join(root, 'userData')
  process.env.VIDEOGENERATE_DATA_DIR = join(process.env.VIDEOGENERATE_USER_DATA_DIR, '.videogenerate')
  await mkdir(join(process.env.VIDEOGENERATE_DATA_DIR, 'db'), { recursive: true })

  const { livePhotoRepo } = await import('../src/main/modules/live-photo/repo')
  const { livePhotoService } = await import('../src/main/modules/live-photo/service')

  const sourceStillPath = join(root, 'source-still.png')
  const sourceVideoPath = join(root, 'source-video.mp4')
  const paddedVideoPath = join(root, 'padded-video.mov')
  const livePhotoImagePath = join(root, 'live-photo.jpg')
  const exportDir = join(root, 'exported')
  const now = Date.now()

  await runFfmpeg({
    args: ['-y', '-f', 'lavfi', '-i', 'color=c=white:s=600x800', '-frames:v', '1', sourceStillPath],
  })
  await runFfmpeg({
    args: [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'color=c=#6699cc:s=600x800:d=1.2',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      sourceVideoPath,
    ],
  })
  await runFfmpeg({
    args: [
      '-y',
      '-i',
      sourceVideoPath,
      '-vf',
      'scale=720:-2:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2:black',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-an',
      paddedVideoPath,
    ],
  })
  await runFfmpeg({
    args: ['-y', '-i', sourceStillPath, '-frames:v', '1', livePhotoImagePath],
  })

  await livePhotoRepo.upsert({
    id: 'prefer-original-video-item',
    sourceType: 'clone_shot',
    sourceProjectId: 'clone-project',
    sourceProjectTitle: '#53',
    sourceShotId: 'shot-1',
    sourceShotLabel: 'shot-1',
    cloneShotSnapshot: {
      shotId: 'shot-1',
      shotLabel: 'shot-1',
      imagePath: sourceStillPath,
      videoPath: sourceVideoPath,
    },
    referenceImagePath: sourceStillPath,
    generatedStillPath: sourceStillPath,
    livePhotoImagePath,
    livePhotoVideoPath: paddedVideoPath,
    motionVideoPath: paddedVideoPath,
    packagingStatus: 'completed',
    createdAt: now,
    updatedAt: now,
  } as any)

  const result = await livePhotoService.exportItems({
    ids: ['prefer-original-video-item'],
    outputDir: exportDir,
  })

  assert.equal(result.exported.length, 1)
  const probe = await probeMedia(result.exported[0].videoPath)
  assert.equal(probe.width, 600)
  assert.equal(probe.height, 800)
  console.log('live photo export prefers original clone video smoke test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
