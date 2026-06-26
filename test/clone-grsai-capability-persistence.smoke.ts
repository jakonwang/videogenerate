import assert from 'node:assert/strict'
import { mkdir, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

async function main() {
  const root = await mkdtemp(join(tmpdir(), 'vg-grsai-capability-'))
  const dataDir = join(root, '.videogenerate')
  const dbDir = join(dataDir, 'db')
  process.env.VIDEOGENERATE_USER_DATA_DIR = root
  process.env.VIDEOGENERATE_DATA_DIR = dataDir
  await mkdir(dbDir, { recursive: true })

  const { cloneRepo, ensureCloneSqliteReady } = await import('../src/main/modules/clone/repo')
  const { resolveCapabilityPlatform } = await import('../src/shared/platformSettings')

  await ensureCloneSqliteReady()

  await cloneRepo.setCredentials({
    allowMockWhenNoKey: false,
    videoProviderPrimary: 'grsai' as any,
    videoProviderFallback: 'grsai' as any,
    imageProviderPrimary: 'grsai' as any,
    chatProviderPrimary: 'grsai' as any,
    apifoxHubProfile: 'vectorengine',
    videoApifoxHubProfile: 'vectorengine',
    imageApifoxHubProfile: 'vectorengine',
    chatApifoxHubProfile: 'vectorengine',
    grsaiApiKey: 'grsai-key',
    grsaiHost: 'https://grsaiapi.com',
    grsaiVideoModel: 'grok-video-3',
    grsaiImageModel: 'gpt-image-2',
    grsaiAnalysisModel: 'gemini-3.1-pro',
  } as any)

  const saved = await cloneRepo.getCredentials()
  assert.equal(saved.videoProviderPrimary, 'grsai')
  assert.equal(saved.videoProviderFallback, 'grsai')
  assert.equal(saved.imageProviderPrimary, 'grsai')
  assert.equal(saved.chatProviderPrimary, 'grsai')
  assert.equal(resolveCapabilityPlatform(saved.videoProviderPrimary as any, saved.videoApifoxHubProfile as any, 'video'), 'grsai')
  assert.equal(resolveCapabilityPlatform(saved.imageProviderPrimary as any, saved.imageApifoxHubProfile as any, 'image'), 'grsai')
  assert.equal(resolveCapabilityPlatform(saved.chatProviderPrimary as any, saved.chatApifoxHubProfile as any, 'chat'), 'grsai')

  console.log('clone grsai capability persistence smoke test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
