import assert from 'node:assert/strict'
import { resolveTiktokListingGenerationConfig } from '../src/main/modules/tiktok-listing/service'
import type { ModelCredentials } from '../src/main/modules/clone/types'

function buildBaseCredentials(): ModelCredentials {
  return {
    allowMockWhenNoKey: true,
    seedanceHost: 'https://ark.ap-southeast.bytepluses.com',
    klingHost: 'https://api.atlascloud.ai',
    grsaiHost: 'https://grsaiapi.com',
    qiniuUploadHost: 'https://upload.qiniup.com',
    qiniuPrefix: 'videogenerate/clone',
    keyframeModel: 'local-product-frame',
    videoModelPrimary: 'veo_3_1-lite',
    videoModelFallback: 'veo_3_1-fast',
    grsaiVideoModel: 'grok-video-3',
    grsaiAnalysisModel: 'gemini-3.1-pro',
    chatProviderPrimary: 'apifox_hub',
    videoProviderPrimary: 'apifox_hub',
    videoProviderFallback: 'kling',
    openaiImageModel: 'gpt-image-2',
    openaiImageQuality: 'high',
    imageProviderPrimary: 'apifox_hub',
    klingImageModel: 'openai/gpt-image-1/edit',
    grsaiImageModel: 'gpt-image-2',
    apifoxHubProfile: 'vectorengine',
    videoApifoxHubProfile: 'vectorengine',
    imageApifoxHubProfile: 'vectorengine',
    chatApifoxHubProfile: 'vectorengine',
    ai666Hub: {
      enabled: true,
      baseUrl: 'https://ai666.example.com',
      apiKey: 'ai666-key',
      chatProvider: 'openai',
      chatModel: 'ai666-chat',
      chatEndpointStyle: 'openai_chat',
      imageProvider: 'openai',
      imageModel: 'ai666-image',
      imageEditModel: 'ai666-image-edit',
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
      baseUrl: 'https://vector.example.com',
      apiKey: 'vector-key',
      chatProvider: 'openai',
      chatModel: 'vector-chat',
      chatEndpointStyle: 'openai_chat',
      imageProvider: 'openai',
      imageModel: 'vector-image',
      imageEditModel: 'vector-image-edit',
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
    apifoxHub: {
      enabled: true,
      baseUrl: 'https://vector.example.com',
      apiKey: 'vector-key',
      chatProvider: 'openai',
      chatModel: 'vector-chat',
      chatEndpointStyle: 'openai_chat',
      imageProvider: 'openai',
      imageModel: 'vector-image',
      imageEditModel: 'vector-image-edit',
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
  }
}

async function main() {
  const apifoxCreds = buildBaseCredentials()
  const apifoxRouting = resolveTiktokListingGenerationConfig(apifoxCreds)
  assert.equal(apifoxRouting.image.provider, 'apifox_hub')
  assert.equal(apifoxRouting.image.profile, 'vectorengine')
  assert.equal(apifoxRouting.image.model, 'vector-image-edit')
  assert.equal(apifoxRouting.chat.provider, 'apifox_hub')
  assert.equal(apifoxRouting.chat.model, 'vector-chat')

  const grsCreds = {
    ...buildBaseCredentials(),
    imageProviderPrimary: 'grsai',
    chatProviderPrimary: 'grsai',
    grsaiImageModel: 'grs-image-custom',
    grsaiAnalysisModel: 'grs-chat-custom',
    grsaiHost: 'https://grs.custom.example.com',
  } satisfies ModelCredentials
  const grsRouting = resolveTiktokListingGenerationConfig(grsCreds)
  assert.equal(grsRouting.image.provider, 'grsai')
  assert.equal(grsRouting.image.model, 'grs-image-custom')
  assert.equal(grsRouting.image.baseUrl, 'https://grs.custom.example.com')
  assert.equal(grsRouting.chat.provider, 'grsai')
  assert.equal(grsRouting.chat.model, 'grs-chat-custom')

  const openAiCreds = {
    ...buildBaseCredentials(),
    imageProviderPrimary: 'openai',
    openaiImageModel: 'gpt-image-1',
  } satisfies ModelCredentials
  const openAiRouting = resolveTiktokListingGenerationConfig(openAiCreds)
  assert.equal(openAiRouting.image.provider, 'openai')
  assert.equal(openAiRouting.image.model, 'gpt-image-1')
  assert.equal(openAiRouting.image.baseUrl, 'https://api.openai.com')

  console.log('tiktok listing model routing smoke test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
