/**
 * Seeds a clone project (2 shots with videos) plus a 图生视频 result for shot 1 into the data dir
 * given by VIDEOGENERATE_DATA_DIR. Used by test/clone-shot-replace-ui.e2e.cjs before launching Electron.
 */
import { spawnSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

async function main() {
  const dataDir = process.env.VIDEOGENERATE_DATA_DIR
  if (!dataDir) throw new Error('VIDEOGENERATE_DATA_DIR is required')
  await mkdir(join(dataDir, 'db'), { recursive: true })
  const { getFfmpegExecutable } = await import('../../src/main/lib/binariesPath')
  const { cloneRepo } = await import('../../src/main/modules/clone/repo')
  const { livePhotoRepo } = await import('../../src/main/modules/live-photo/repo')
  const { closeCloneSqlite } = await import('../../src/main/modules/clone/sqlite')
  const { closeLivePhotoSqlite } = await import('../../src/main/modules/live-photo/sqlite')

  const media = join(dataDir, 'seed-media')
  await mkdir(media, { recursive: true })
  const ffmpeg = (args: string[]) => {
    const result = spawnSync(getFfmpegExecutable(), ['-hide_banner', '-loglevel', 'error', '-y', ...args])
    if (result.status !== 0) throw new Error(String(result.stderr))
  }
  const clip = (name: string, color: string) => {
    const path = join(media, name)
    ffmpeg(['-f', 'lavfi', '-i', `color=c=${color}:s=720x1280:d=3:r=30`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', path])
    return path
  }
  const still = (name: string, color: string) => {
    const path = join(media, name)
    ffmpeg(['-f', 'lavfi', '-i', `color=c=${color}:s=720x1280`, '-frames:v', '1', path])
    return path
  }
  const original = clip('original.mp4', 'gray')
  const livePhotoVideo = clip('livephoto.mp4', 'green')
  const frame1 = still('frame1.png', 'orange')
  const frame2 = still('frame2.png', 'purple')
  const poster = still('poster.jpg', 'green')
  await writeFile(join(media, 'ready'), 'ok')

  const now = Date.now()
  const projectId = 'e2e-cross-line'
  await cloneRepo.upsertProject({
    id: projectId,
    createdAt: now,
    updatedAt: now,
    title: 'E2E 耳环复刻',
    archived: false,
    status: 'ready',
    runMode: 'manual',
    locale: 'zh-CN',
    strength: 'medium',
    referenceVideoPath: original,
    referenceVideoName: 'ref.mp4',
    blueprint: {
      shots: [
        { id: 'shot_1', index: 0, durationSec: 3, status: 'ready', title: '开场', gptFirstFramePath: frame1, gptFrameStatus: 'done', generatedClipPath: original },
        { id: 'shot_2', index: 1, durationSec: 3, status: 'ready', title: '特写', gptFirstFramePath: frame2, gptFrameStatus: 'done', generatedClipPath: original },
      ],
    },
    storyboardFrames: [
      { id: 'f1', shotId: 'shot_1', imagePath: frame1, status: 'cropped', frameIndex: 0, updatedAt: now },
      { id: 'f2', shotId: 'shot_2', imagePath: frame2, status: 'cropped', frameIndex: 1, updatedAt: now },
    ],
    shotVideoOutputs: [
      { shotId: 'shot_1', source: 'generated', videoPath: original, status: 'done', durationSec: 3, updatedAt: now },
      { shotId: 'shot_2', source: 'generated', videoPath: original, status: 'done', durationSec: 3, updatedAt: now },
    ],
    aiTasks: [],
    reviewDecisions: {},
    sessions: [],
    modelIdentityPacks: [],
    defaultGenerationPolicy: { qualityProfile: 'high', variantStrength: 'medium' },
    policy: {
      qualityPriority: 'high',
      fallbackChain: ['seedance'],
      concurrency: 1,
      retries: 0,
      qualityGate: { enabled: true, minDurationRatio: 0.6, maxDurationRatio: 1.6, maxBlackFrameRatio: 1, minShortSide: 720, requireAudio: false },
    },
  } as any)
  await livePhotoRepo.upsert({
    id: 'e2e-lp1', sourceType: 'clone_shot', sourceProjectId: projectId, sourceShotId: 'shot_1', sourceShotLabel: '开场',
    motionVideoPath: livePhotoVideo, livePhotoImagePath: poster, packagingStatus: 'completed', createdAt: now, updatedAt: now,
  } as any)
  closeCloneSqlite()
  closeLivePhotoSqlite()
  console.log(JSON.stringify({ projectId, livePhotoVideo }))
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(error)
  process.exit(1)
})
