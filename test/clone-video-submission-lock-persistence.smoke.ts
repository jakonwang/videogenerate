import assert from 'node:assert/strict'
import { mkdir, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

async function main() {
  const root = await mkdtemp(join(tmpdir(), 'vg-clone-submit-lock-'))
  const dataDir = join(root, '.videogenerate')
  const dbDir = join(dataDir, 'db')
  process.env.VIDEOGENERATE_USER_DATA_DIR = root
  process.env.VIDEOGENERATE_DATA_DIR = dataDir
  await mkdir(dbDir, { recursive: true })

  const { cloneRepo, ensureCloneSqliteReady } = await import('../src/main/modules/clone/repo')
  await ensureCloneSqliteReady()

  const created = await cloneRepo.createProject({
    locale: 'zh-CN',
    strength: 'structure',
    runMode: 'rewrite',
    referenceVideoPath: 'C:\\temp\\ref.mp4',
    referenceVideoName: 'ref.mp4',
    title: 'submit-lock-project',
  })

  created.blueprint = {
    shots: [
      {
        id: 'shot_1',
        index: 1,
        status: 'generating',
        generatedTaskId: undefined,
      },
    ],
  } as any
  created.shotVideoOutputs = [
    {
      shotId: 'shot_1',
      segmentId: 'shot_1',
      index: 1,
      source: 'generated',
      status: 'creating',
      provider: 'apifox_hub',
      model: 'veo_3_1-lite',
      submissionFingerprint: 'fingerprint-1',
      submissionStartedAt: 1710000000000,
      submissionLockedUntil: 1710000120000,
      updatedAt: 1710000000000,
    } as any,
  ]
  await cloneRepo.upsertProject(created)

  const restored = await cloneRepo.getProject(created.id)
  assert.equal(restored?.shotVideoOutputs?.[0]?.submissionFingerprint, 'fingerprint-1')
  assert.equal(restored?.shotVideoOutputs?.[0]?.submissionStartedAt, 1710000000000)
  assert.equal(restored?.shotVideoOutputs?.[0]?.submissionLockedUntil, 1710000120000)
  console.log('clone video submission lock persistence smoke test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
