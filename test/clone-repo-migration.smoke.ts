import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

function buildLegacyProject(id: string, title: string) {
  return {
    id,
    createdAt: 1710000000000,
    updatedAt: 1710000000000,
    title,
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
  }
}

async function main() {
  const root = await mkdtemp(join(tmpdir(), 'vg-clone-repo-migration-'))
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
        projects: [buildLegacyProject('project-1', 'legacy-title')],
        projectGroups: [{ id: 'group-1', name: '默认分组', createdAt: 1, updatedAt: 1, sortOrder: 0 }],
        modelIdentityLibrary: [{ id: 'identity-1', name: 'AI 模特 001', createdAt: 1, updatedAt: 1, status: 'done', imagePaths: [] }],
      },
      null,
      2,
    ),
    'utf8',
  )

  const { cloneRepo, ensureCloneSqliteReady } = await import('../src/main/modules/clone/repo')
  const { cloneSqlitePath } = await import('../src/main/modules/clone/sqlite')

  const ready = await ensureCloneSqliteReady()
  assert.equal(ready.source, 'json_import')
  const projects = await cloneRepo.listProjects()
  assert.equal(projects.length, 1)
  assert.equal(projects[0]?.title, 'legacy-title')

  const next = await cloneRepo.upsertProject({ ...projects[0]!, title: 'sqlite-title' })
  assert.equal(next.title, 'sqlite-title')

  const legacyRaw = JSON.parse(await readFile(legacyJsonPath, 'utf8')) as { projects: Array<{ title: string }> }
  assert.equal(legacyRaw.projects[0]?.title, 'legacy-title')
  const sqliteExists = await readFile(cloneSqlitePath(), 'utf8')
  assert.ok(sqliteExists.length > 0)

  console.log('clone repo migration smoke test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
