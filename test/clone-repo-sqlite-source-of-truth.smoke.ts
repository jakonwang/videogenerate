import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

async function main() {
  const root = await mkdtemp(join(tmpdir(), 'vg-clone-repo-source-'))
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
            id: 'project-1',
            createdAt: 1710000000000,
            updatedAt: 1710000000000,
            title: 'legacy-before-import',
            archived: false,
            status: 'draft',
            runMode: 'rewrite',
            locale: 'zh-CN',
            strength: 'medium',
            referenceVideoPath: 'C:\\temp\\ref.mp4',
            referenceVideoName: 'ref.mp4',
            baseBlueprint: null,
            blueprint: null,
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
  const imported = await cloneRepo.getProject('project-1')
  assert.ok(imported)

  await cloneRepo.upsertProject({ ...imported!, title: 'sqlite-is-source' })
  await writeFile(
    legacyJsonPath,
    JSON.stringify({ projects: [{ ...imported, title: 'json-should-be-ignored' }] }, null, 2),
    'utf8',
  )

  const ready = await ensureCloneSqliteReady()
  assert.equal(ready.source, 'sqlite')
  const latest = await cloneRepo.getProject('project-1')
  assert.equal(latest?.title, 'sqlite-is-source')
  const legacyRaw = JSON.parse(await readFile(legacyJsonPath, 'utf8')) as { projects: Array<{ title: string }> }
  assert.equal(legacyRaw.projects[0]?.title, 'json-should-be-ignored')

  console.log('clone repo sqlite source-of-truth smoke test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
