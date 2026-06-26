import assert from 'node:assert/strict'
import { mkdir, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

async function main() {
  const root = await mkdtemp(join(tmpdir(), 'vg-platform-settings-'))
  const dataDir = join(root, '.videogenerate')
  const dbDir = join(dataDir, 'db')
  process.env.VIDEOGENERATE_USER_DATA_DIR = root
  process.env.VIDEOGENERATE_DATA_DIR = dataDir
  await mkdir(dbDir, { recursive: true })

  const { cloneRepo, ensureCloneSqliteReady } = await import('../src/main/modules/clone/repo')
  const { resolveApifoxHubProfile } = await import('../src/main/modules/clone/apifoxProfile')

  await ensureCloneSqliteReady()

  await cloneRepo.setCredentials({
    allowMockWhenNoKey: false,
    videoProviderPrimary: 'xibapi' as any,
    videoProviderFallback: 'xibapi' as any,
    imageProviderPrimary: 'ai666' as any,
    chatProviderPrimary: 'vectorengine' as any,
    apifoxHubProfile: 'vectorengine',
    ai666Hub: {
      enabled: true,
      baseUrl: 'https://ai666.example.com',
      apiKey: 'ai666-key',
      chatProvider: 'openai',
      chatModel: 'gpt-4.1-mini',
      chatEndpointStyle: 'openai_chat',
      imageProvider: 'openai',
      imageModel: 'gpt-image-1',
      imageEditModel: '',
      imageEndpointStyle: 'openai_images',
      videoProvider: 'veo',
      textToVideoModel: 'veo_3_1-lite',
      imageToVideoModel: 'veo_3_1-lite',
      startEndVideoModel: 'veo_3_1-lite',
      referenceVideoModel: 'veo_3_1-lite',
      videoEndpointStyle: 'official_rest',
      defaultPollIntervalMs: 2000,
      defaultTimeoutMs: 600000,
    },
    vectorEngineHub: {
      enabled: true,
      baseUrl: 'https://vectorengine.example.com',
      apiKey: 'vector-key',
      chatProvider: 'openai',
      chatModel: 've-chat',
      chatEndpointStyle: 'openai_chat',
      imageProvider: 'openai',
      imageModel: 've-image',
      imageEditModel: '',
      imageEndpointStyle: 'openai_images',
      videoProvider: 'veo',
      textToVideoModel: 've-video',
      imageToVideoModel: 've-video',
      startEndVideoModel: 've-video',
      referenceVideoModel: 've-video',
      videoEndpointStyle: 'official_rest',
      defaultPollIntervalMs: 2000,
      defaultTimeoutMs: 600000,
    },
    xibapiHub: {
      enabled: true,
      baseUrl: 'https://xibapi.example.com',
      apiKey: 'xibapi-key',
      chatProvider: 'openai',
      chatModel: 'unused-chat',
      chatEndpointStyle: 'openai_chat',
      imageProvider: 'openai',
      imageModel: 'unused-image',
      imageEditModel: '',
      imageEndpointStyle: 'openai_images',
      videoProvider: 'xibapi',
      textToVideoModel: 'veo_3_1-fast',
      imageToVideoModel: 'veo_3_1-fast',
      startEndVideoModel: 'veo_3_1-fast',
      referenceVideoModel: 'veo_3_1-fast',
      videoEndpointStyle: 'official_rest',
      defaultPollIntervalMs: 2000,
      defaultTimeoutMs: 600000,
    },
  })

  const saved = await cloneRepo.getCredentials()
  assert.equal(saved.videoProviderPrimary, 'apifox_hub')
  assert.equal(saved.videoProviderFallback, 'apifox_hub')
  assert.equal(saved.imageProviderPrimary, 'apifox_hub')
  assert.equal(saved.chatProviderPrimary, 'apifox_hub')
  assert.equal(saved.videoApifoxHubProfile, 'xibapi')
  assert.equal(saved.imageApifoxHubProfile, 'ai666')
  assert.equal(saved.chatApifoxHubProfile, 'vectorengine')
  assert.equal(saved.apifoxHubProfile, 'xibapi')
  assert.equal(resolveApifoxHubProfile(saved, 'video'), 'xibapi')
  assert.equal(resolveApifoxHubProfile(saved, 'image'), 'ai666')
  assert.equal(resolveApifoxHubProfile(saved, 'chat'), 'vectorengine')

  await cloneRepo.setCredentials({
    ...saved,
    videoProviderPrimary: 'grsai',
    videoProviderFallback: 'grsai',
    imageProviderPrimary: 'grsai',
    chatProviderPrimary: 'grsai',
    videoApifoxHubProfile: 'xibapi',
    imageApifoxHubProfile: 'ai666',
    chatApifoxHubProfile: 'vectorengine',
  })

  const grsSaved = await cloneRepo.getCredentials()
  assert.equal(grsSaved.videoProviderPrimary, 'grsai')
  assert.equal(grsSaved.imageProviderPrimary, 'grsai')
  assert.equal(grsSaved.chatProviderPrimary, 'grsai')
  assert.equal(resolveApifoxHubProfile(grsSaved, 'video'), 'xibapi')
  assert.equal(resolveApifoxHubProfile(grsSaved, 'image'), 'ai666')
  assert.equal(resolveApifoxHubProfile(grsSaved, 'chat'), 'vectorengine')
  assert.equal(grsSaved.videoApifoxHubProfile, 'xibapi')
  assert.equal(grsSaved.imageApifoxHubProfile, 'ai666')
  assert.equal(grsSaved.chatApifoxHubProfile, 'vectorengine')

  await cloneRepo.setCredentials({
    ...grsSaved,
    videoProviderPrimary: 'apifox_hub',
    videoProviderFallback: 'apifox_hub',
    videoApifoxHubProfile: 'gaorui',
    apifoxHubProfile: 'gaorui',
    gaoruiHub: {
      enabled: true,
      baseUrl: 'https://gaorui.cc',
      apiKey: 'gaorui-key',
      chatProvider: 'openai',
      chatModel: 'unused-chat',
      chatEndpointStyle: 'openai_chat',
      imageProvider: 'openai',
      imageModel: 'unused-image',
      imageEditModel: '',
      imageEndpointStyle: 'openai_images',
      videoProvider: 'gaorui',
      textToVideoModel: 'veo_3_1',
      imageToVideoModel: 'veo_3_1-fl',
      startEndVideoModel: 'veo_3_1-fl',
      referenceVideoModel: 'veo_3_1-components',
      videoEndpointStyle: 'official_rest',
      defaultPollIntervalMs: 2000,
      defaultTimeoutMs: 600000,
    },
  })

  const gaoruiSaved = await cloneRepo.getCredentials()
  assert.equal(gaoruiSaved.videoProviderPrimary, 'apifox_hub')
  assert.equal(gaoruiSaved.videoProviderFallback, 'apifox_hub')
  assert.equal(gaoruiSaved.videoApifoxHubProfile, 'gaorui')
  assert.equal(gaoruiSaved.apifoxHubProfile, 'gaorui')
  assert.equal(resolveApifoxHubProfile(gaoruiSaved, 'video'), 'gaorui')
  assert.equal(gaoruiSaved.gaoruiHub?.videoProvider, 'gaorui')
  assert.equal(gaoruiSaved.gaoruiHub?.baseUrl, 'https://gaorui.cc')
  assert.equal(gaoruiSaved.gaoruiHub?.apiKey, 'gaorui-key')

  console.log('clone platform settings architecture smoke test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
