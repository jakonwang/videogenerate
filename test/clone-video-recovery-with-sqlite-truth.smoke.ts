import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

async function main() {
  const root = await mkdtemp(join(tmpdir(), 'vg-clone-video-recovery-'))
  const dataDir = join(root, '.videogenerate')
  const dbDir = join(dataDir, 'db')
  process.env.VIDEOGENERATE_USER_DATA_DIR = root
  process.env.VIDEOGENERATE_DATA_DIR = dataDir
  await mkdir(dbDir, { recursive: true })

  const legacyJsonPath = join(dbDir, 'clone-projects.json')
  await writeFile(
    legacyJsonPath,
    JSON.stringify(
      {
        projects: [
          {
            id: 'project-video-1',
            createdAt: 1710000000000,
            updatedAt: 1710000000000,
            title: 'video-project',
            archived: false,
            status: 'ready',
            runMode: 'rewrite',
            locale: 'zh-CN',
            strength: 'medium',
            referenceVideoPath: 'C:\\temp\\ref.mp4',
            referenceVideoName: 'ref.mp4',
            baseBlueprint: null,
            blueprint: {
              shots: [
                {
                  id: 'shot_2',
                  index: 1,
                  status: 'ready',
                  generatedTaskId: undefined,
                },
              ],
            },
            shotVideoOutputs: [
              {
                shotId: 'shot_2',
                segmentId: 'shot_2',
                index: 1,
                status: 'failed',
                error: '[missing_task] legacy broken state',
              },
            ],
            aiTasks: [],
            reviewDecisions: {},
            sessions: [],
            modelIdentityPacks: [],
            defaultGenerationPolicy: { qualityProfile: 'high', variantStrength: 'medium' },
            policy: {
              qualityPriority: 'high',
              fallbackChain: ['seedance', 'kling', 'grsai'],
              concurrency: 4,
              retries: 2,
              qualityGate: {
                enabled: true,
                minDurationRatio: 0.6,
                maxDurationRatio: 1.6,
                maxBlackFrameRatio: 0.45,
                minShortSide: 720,
                requireAudio: false,
              },
            },
          },
        ],
      },
      null,
      2,
    ),
    'utf8',
  )

  const { cloneRepo, ensureCloneSqliteReady } = await import('../src/main/modules/clone/repo')

  await ensureCloneSqliteReady()
  const project = await cloneRepo.getProject('project-video-1')
  assert.ok(project)

  project!.blueprint!.shots[0] = {
    ...project!.blueprint!.shots[0],
    generatedTaskId: 'veo_3_1:task_demo_done',
    generatedProvider: 'apifox_hub',
    generatedModel: 'veo_3_1-lite',
  }
  project!.shotVideoOutputs = [
    {
      shotId: 'shot_2',
      segmentId: 'shot_2',
      index: 1,
      status: 'done',
      taskId: 'veo_3_1:task_demo_done',
      provider: 'apifox_hub',
      model: 'veo_3_1-lite',
      videoPath: 'C:\\temp\\shot_2.mp4',
      localPath: 'C:\\temp\\shot_2.mp4',
      error: '',
    } as any,
  ]
  await cloneRepo.upsertProject(project!)

  await writeFile(
    legacyJsonPath,
    JSON.stringify(
      {
        projects: [
          {
            ...project,
            blueprint: {
              shots: [{ ...project!.blueprint!.shots[0], generatedTaskId: undefined }],
            },
            shotVideoOutputs: [
              {
                shotId: 'shot_2',
                segmentId: 'shot_2',
                index: 1,
                status: 'failed',
                error: '[missing_task] stale json should not override sqlite',
              },
            ],
          },
        ],
      },
      null,
      2,
    ),
    'utf8',
  )

  await ensureCloneSqliteReady()
  const latest = await cloneRepo.getProject('project-video-1')
  assert.equal(latest?.shotVideoOutputs?.[0]?.status, 'done')
  assert.equal(latest?.shotVideoOutputs?.[0]?.taskId, 'veo_3_1:task_demo_done')
  assert.equal(latest?.blueprint?.shots?.[0]?.generatedTaskId, 'veo_3_1:task_demo_done')

  const legacyRaw = JSON.parse(await readFile(legacyJsonPath, 'utf8')) as any
  assert.equal(legacyRaw.projects[0]?.shotVideoOutputs?.[0]?.status, 'failed')

  console.log('clone video recovery with sqlite truth smoke test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
