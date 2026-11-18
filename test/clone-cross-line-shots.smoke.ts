/**
 * Clone shots ⇄ tk创意室 / 图生视频 (product plan X2 / X7): listing per-shot alternatives, using one,
 * and the automatic swap when a tk创意室 shot sent from clone finishes. Real ffmpeg, no network.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

async function main() {
  const root = await mkdtemp(join(tmpdir(), 'vg-clone-cross-line-'))
  process.env.VIDEOGENERATE_USER_DATA_DIR = root
  process.env.VIDEOGENERATE_DATA_DIR = join(root, '.videogenerate')
  await mkdir(join(process.env.VIDEOGENERATE_DATA_DIR, 'db'), { recursive: true })

  // The record store normally runs in a bundled worker thread; keep it in memory under tsx.
  const { backgroundRecordStore } = await import('../src/main/lib/backgroundRecordStore')
  const memory = new Map<string, Map<string, any>>()
  const bucket = (namespace: string) => memory.get(namespace) || memory.set(namespace, new Map()).get(namespace)!
  Object.assign(backgroundRecordStore, {
    migrate: async () => ({ migrated: 0 }),
    list: async (namespace: string, input: { offset?: number; limit?: number } = {}) => {
      const items = [...bucket(namespace).values()].map((item) => structuredClone(item))
      const offset = input.offset || 0
      const limit = input.limit || items.length || 1
      return { items: items.slice(offset, offset + limit), total: items.length, offset, limit }
    },
    get: async (namespace: string, key: string) => structuredClone(bucket(namespace).get(key) ?? null),
    upsert: async (namespace: string, value: any) => {
      bucket(namespace).set(String(value.id), structuredClone(value))
      return value
    },
    remove: async (namespace: string, key: string) => bucket(namespace).delete(key),
  })

  const { getFfmpegExecutable } = await import('../src/main/lib/binariesPath')
  const { cloneRepo } = await import('../src/main/modules/clone/repo')
  const { tiktokCreativeStudioRepo } = await import('../src/main/modules/tiktok-creative-studio/repo')
  const { livePhotoRepo } = await import('../src/main/modules/live-photo/repo')
  const cross = await import('../src/main/modules/clone/crossLineShots')
  const { lineage } = await import('../src/main/modules/content-hub/stores')

  const media = join(root, 'media')
  await mkdir(media, { recursive: true })
  const clip = (name: string, color: string) => {
    const path = join(media, name)
    const result = spawnSync(getFfmpegExecutable(), ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', `color=c=${color}:s=720x1280:d=3:r=30`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', path])
    assert.equal(result.status, 0, String(result.stderr))
    return path
  }
  const original = clip('original.mp4', 'gray')
  const creativeVideo = clip('creative.mp4', 'blue')
  const livePhotoVideo = clip('livephoto.mp4', 'green')
  const frame = join(media, 'frame.png')
  await writeFile(frame, 'png')

  const projectId = 'cross-line-project'
  const now = Date.now()
  await cloneRepo.upsertProject({
    id: projectId,
    createdAt: now,
    updatedAt: now,
    title: '耳环复刻',
    archived: false,
    status: 'ready',
    runMode: 'rewrite',
    locale: 'zh-CN',
    strength: 'medium',
    referenceVideoPath: original,
    referenceVideoName: 'ref.mp4',
    blueprint: {
      shots: [
        { id: 'shot_1', index: 0, durationSec: 3, status: 'ready' },
        { id: 'shot_2', index: 1, durationSec: 3, status: 'ready' },
      ],
    },
    storyboardFrames: [
      { id: 'f1', shotId: 'shot_1', imagePath: frame, status: 'cropped', frameIndex: 0, updatedAt: now },
      { id: 'f2', shotId: 'shot_2', imagePath: frame, status: 'cropped', frameIndex: 1, updatedAt: now },
    ],
    shotVideoOutputs: [
      { shotId: 'shot_1', source: 'generated', videoPath: original, status: 'done', updatedAt: now },
      { shotId: 'shot_2', source: 'generated', videoPath: original, status: 'done', updatedAt: now },
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

  const creativeShot = (shotId: string, cloneShotId: string, extra: Record<string, unknown>) => ({
    id: `id-${shotId}`, shotId, shotIndex: 0, imagePath: frame, prompt: 'p', durationSec: 3, sourceType: 'reference_image',
    logs: [], createdAt: now, updatedAt: now, sourceCloneShotId: cloneShotId, ...extra,
  })

  try {
    // 1. Not tagged → invisible; tagged ones show up per shot, with Live Photo results too.
    const task = await tiktokCreativeStudioRepo.create({
      productName: 'p',
      status: 'running',
      shots: [
        creativeShot('c1', 'shot_1', { status: 'completed', resultVideoPath: creativeVideo }),
        creativeShot('c2', 'shot_2', { status: 'running' }),
      ] as any,
      logs: [],
    })
    await tiktokCreativeStudioRepo.upsert({ ...task, sourceCloneProjectId: projectId })
    await livePhotoRepo.upsert({
      id: 'lp1', sourceType: 'clone_shot', sourceProjectId: projectId, sourceShotId: 'shot_1', motionVideoPath: livePhotoVideo,
      packagingStatus: 'completed', createdAt: now - 1000, updatedAt: now,
    } as any)

    let list = await cross.listCloneShotAlternatives({ cloneProjectId: projectId })
    const shot1 = list.filter((item) => item.shotId === 'shot_1')
    assert.deepEqual(shot1.map((item) => [item.line, item.status, item.inUse]), [['creative', 'ready', false], ['livephoto', 'ready', false]])
    assert.deepEqual(list.filter((item) => item.shotId === 'shot_2').map((item) => item.status), ['running'])

    // 2. Use the tk创意室 result for shot 1.
    await assert.rejects(cross.useCloneShotAlternative({ cloneProjectId: projectId, shotId: 'shot_2', ref: `creative:${task.id}:c2` }), /还没有生成完成/)
    await assert.rejects(cross.useCloneShotAlternative({ cloneProjectId: projectId, shotId: 'shot_2', ref: `creative:${task.id}:c1` }), /找不到/, 'a result made for another shot is refused')
    const used = await cross.useCloneShotAlternative({ cloneProjectId: projectId, shotId: 'shot_1', ref: `creative:${task.id}:c1` })
    const usedPath = used.shotVideoOutputs.find((item: any) => item.shotId === 'shot_1')?.videoPath
    assert.equal(cross.videoFingerprint(usedPath), cross.videoFingerprint(creativeVideo), 'shot 1 now plays the tk创意室 video')
    list = await cross.listCloneShotAlternatives({ cloneProjectId: projectId })
    assert.equal(list.find((item) => item.ref === `creative:${task.id}:c1`)?.inUse, true)
    assert.ok((await lineage.listFor(`clone:${projectId}`)).some((edge: any) => edge.fromRef === `creative:${task.id}:c1`), 'lineage recorded')

    // 3. Auto swap: a waiting shot whose clone shot is untouched gets swapped in when it completes.
    const auto = await tiktokCreativeStudioRepo.create({
      productName: 'p', status: 'running', logs: [],
      shots: [creativeShot('a1', 'shot_2', { status: 'running', cloneBackfill: { baselineFingerprint: cross.videoFingerprint(original), status: 'waiting', updatedAt: now } })] as any,
    })
    await tiktokCreativeStudioRepo.upsert({ ...auto, sourceCloneProjectId: projectId })
    await assert.rejects(cross.sendCloneShotToCreative({ cloneProjectId: projectId, shotId: 'shot_2' }), /绑定商品|出片中/)
    assert.equal(await cross.sweepCloneShotBackfills(), 0, 'still running → nothing swapped')
    const finished = (await tiktokCreativeStudioRepo.get(auto.id))!
    await tiktokCreativeStudioRepo.upsert({ ...finished, shots: finished.shots.map((shot) => ({ ...shot, status: 'completed', resultVideoPath: creativeVideo })) })
    assert.equal(await cross.sweepCloneShotBackfills(), 1)
    const swappedProject: any = await cloneRepo.getProject(projectId)
    assert.equal(cross.videoFingerprint(swappedProject.shotVideoOutputs.find((item: any) => item.shotId === 'shot_2')?.videoPath), cross.videoFingerprint(creativeVideo))
    assert.equal((await tiktokCreativeStudioRepo.get(auto.id))!.shots[0].cloneBackfill?.status, 'done')
    assert.equal(await cross.sweepCloneShotBackfills(), 0, 'swap happens once')

    // 4. The user changed the shot after sending it → keep their video, mark skipped.
    const manual = await tiktokCreativeStudioRepo.create({
      productName: 'p', status: 'running', logs: [],
      shots: [creativeShot('m1', 'shot_1', { status: 'completed', resultVideoPath: livePhotoVideo, cloneBackfill: { baselineFingerprint: cross.videoFingerprint(original), status: 'waiting', updatedAt: now } })] as any,
    })
    await tiktokCreativeStudioRepo.upsert({ ...manual, sourceCloneProjectId: projectId })
    await cross.sweepCloneShotBackfills()
    const kept: any = await cloneRepo.getProject(projectId)
    assert.equal(cross.videoFingerprint(kept.shotVideoOutputs.find((item: any) => item.shotId === 'shot_1')?.videoPath), cross.videoFingerprint(creativeVideo), 'manual choice kept')
    assert.equal((await tiktokCreativeStudioRepo.get(manual.id))!.shots[0].cloneBackfill?.status, 'skipped')

    // 5. Tagging a multi-frame task maps shots by order.
    const multi = await tiktokCreativeStudioRepo.create({
      productName: 'p', status: 'running', logs: [],
      shots: [creativeShot('x0', '', { shotIndex: 0, status: 'running' }), creativeShot('x1', '', { shotIndex: 1, status: 'running' })] as any,
    })
    await cross.tagCreativeTaskWithCloneShots(multi.id, projectId, ['shot_1', 'shot_2'], '耳环复刻')
    const tagged = (await tiktokCreativeStudioRepo.get(multi.id))!
    assert.equal(tagged.sourceCloneProjectId, projectId)
    assert.deepEqual(tagged.shots.map((shot) => shot.sourceCloneShotId), ['shot_1', 'shot_2'])

    console.log('clone-cross-line-shots smoke: ok')
  } finally {
    await rm(root, { recursive: true, force: true }).catch(() => undefined)
  }
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(error)
  process.exit(1)
})
