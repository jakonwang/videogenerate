import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdtemp, mkdir, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

async function main() {
  const root = await mkdtemp(join(tmpdir(), 'videogenerate-storage-'))
  const userData = join(root, 'userData')
  const dataDir = join(userData, '.videogenerate')
  const profileDir = join(root, 'hermes-profile')
  const runtimeRoot = join(root, 'hermes-runtime', 'hermes-agent')
  process.env.VIDEOGENERATE_USER_DATA_DIR = userData
  process.env.VIDEOGENERATE_DATA_DIR = dataDir
  process.env.VIDEOGENERATE_HERMES_PROFILE_DIR = profileDir
  process.env.VIDEOGENERATE_HERMES_ROOT = runtimeRoot

  await mkdir(join(dataDir, 'cache'), { recursive: true })
  await mkdir(join(dataDir, 'tmp'), { recursive: true })
  await mkdir(join(dataDir, 'batch-subtitle-preview'), { recursive: true })
  await mkdir(join(dataDir, 'logs'), { recursive: true })
  await mkdir(join(dataDir, 'managed-assets', 'clone', 'project-1'), { recursive: true })
  await mkdir(join(dataDir, 'db'), { recursive: true })
  await mkdir(join(dataDir, 'exports'), { recursive: true })
  await mkdir(join(profileDir, 'cache'), { recursive: true })
  await writeFile(join(dataDir, 'cache', 'cache.bin'), Buffer.alloc(1024), { encoding: 'utf8' })
  const temporaryFile = join(dataDir, 'tmp', 'temp.bin')
  await writeFile(temporaryFile, Buffer.alloc(2048), { encoding: 'utf8' })
  const oldTimestamp = new Date(Date.now() - 48 * 60 * 60 * 1000)
  await utimes(temporaryFile, oldTimestamp, oldTimestamp)
  await writeFile(join(dataDir, 'batch-subtitle-preview', 'preview.bin'), Buffer.alloc(4096), { encoding: 'utf8' })
  await writeFile(join(profileDir, 'cache', 'hermes.bin'), Buffer.alloc(512), { encoding: 'utf8' })
  const oldLog = join(dataDir, 'logs', 'old.log')
  const recentLog = join(dataDir, 'logs', 'recent.log')
  await writeFile(oldLog, Buffer.alloc(8192), { encoding: 'utf8' })
  await writeFile(recentLog, Buffer.alloc(1024), { encoding: 'utf8' })
  const oldLogTimestamp = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000)
  await utimes(oldLog, oldLogTimestamp, oldLogTimestamp)
  const managedSource = join(dataDir, 'managed-assets', 'clone', 'project-1', 'source.png')
  const businessRecord = join(dataDir, 'db', 'important.json')
  const credentialFile = join(profileDir, '.env')
  const completedExport = join(dataDir, 'exports', 'completed.mp4')
  await writeFile(managedSource, Buffer.alloc(16384), { encoding: 'utf8' })
  await writeFile(businessRecord, Buffer.alloc(4096), { encoding: 'utf8' })
  await writeFile(credentialFile, Buffer.alloc(256), { encoding: 'utf8' })
  await writeFile(completedExport, Buffer.alloc(32768), { encoding: 'utf8' })

  const [{ storageManagementService }, { storageCleanupChallenge, storageCleanupConfirmation }] = await Promise.all([
    import('../src/main/modules/storage-management/service'),
    import('../src/shared/storageManagement'),
  ])

  const before = await storageManagementService.getOverview()
  assert.equal(before.categories.find((item) => item.id === 'safe_cache')?.sizeBytes, 1536)
  assert.equal(before.categories.find((item) => item.id === 'temporary_files')?.sizeBytes, 2048)
  assert.equal(before.categories.find((item) => item.id === 'preview_files')?.sizeBytes, 4096)
  assert.equal(before.categories.find((item) => item.id === 'diagnostic_logs')?.sizeBytes, 8192)
  assert.equal(before.categories.find((item) => item.id === 'managed_source_assets')?.cleanupAllowed, false)
  assert.equal(before.categories.find((item) => item.id === 'business_records')?.cleanupAllowed, false)
  assert.equal(before.categories.find((item) => item.id === 'configuration_credentials')?.cleanupAllowed, false)

  await assert.rejects(
    storageManagementService.cleanup({ categoryId: 'temporary_files', confirmation: 'invalid' }),
    /confirmation/i,
  )

  const result = await storageManagementService.cleanup({
    categoryId: 'temporary_files',
    confirmation: storageCleanupConfirmation('temporary_files'),
  })
  assert.equal(result.reclaimedBytes, 2048)
  assert.equal(existsSync(join(dataDir, 'tmp')), true)
  assert.equal(existsSync(join(dataDir, 'tmp', 'temp.bin')), false)
  assert.equal(result.overview.categories.find((item) => item.id === 'temporary_files')?.sizeBytes, 0)

  const logResult = await storageManagementService.cleanup({
    categoryId: 'diagnostic_logs',
    confirmation: storageCleanupConfirmation('diagnostic_logs'),
  })
  assert.equal(logResult.reclaimedBytes, 8192)
  assert.equal(existsSync(oldLog), false)
  assert.equal(existsSync(recentLog), true)

  await assert.rejects(
    storageManagementService.cleanup({
      categoryId: 'managed_source_assets',
      confirmation: storageCleanupConfirmation('managed_source_assets'),
    }),
    /protected/i,
  )
  await assert.rejects(
    storageManagementService.cleanup({
      categoryId: 'completed_project_artifacts',
      confirmation: storageCleanupConfirmation('completed_project_artifacts'),
    }),
    /typed/i,
  )

  const completedResult = await storageManagementService.cleanup({
    categoryId: 'completed_project_artifacts',
    confirmation: storageCleanupConfirmation('completed_project_artifacts'),
    challenge: storageCleanupChallenge('completed_project_artifacts'),
  })
  assert.equal(completedResult.reclaimedBytes >= 32768, true)
  assert.equal(existsSync(completedExport), false)
  assert.equal(existsSync(managedSource), true)
  assert.equal(existsSync(businessRecord), true)
  assert.equal(existsSync(credentialFile), true)

  console.log('storage-management smoke passed')
}

void main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
