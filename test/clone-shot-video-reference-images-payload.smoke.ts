import assert from 'node:assert/strict'

async function main() {
  const { createVideoTask } = await import('../src/main/modules/clone/unifiedVideo')

  const originalFetch = globalThis.fetch
  let capturedBody: any = null
  globalThis.fetch = (async (_input: any, init?: any) => {
    capturedBody = JSON.parse(String(init?.body || '{}'))
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ id: 'task_test_reference_payload', status: 'queued' }),
    } as any
  }) as any

  try {
    const credentials = {
      apifoxHub: {
        enabled: true,
        apiKey: 'test-key',
        baseUrl: 'https://api.vectorengine.ai',
        videoProvider: 'openai_video',
        videoEndpointStyle: 'openai_video',
        textToVideoModel: 'veo_3_1-fast-4K',
        imageToVideoModel: 'veo_3_1-fast-4K',
        startEndVideoModel: 'veo_3_1-fast-4K',
        referenceVideoModel: 'veo_3_1-fast-4K',
      },
      vectorEngineHub: {
        enabled: true,
        apiKey: 'test-key',
        baseUrl: 'https://api.vectorengine.ai',
        videoProvider: 'openai_video',
        videoEndpointStyle: 'openai_video',
        textToVideoModel: 'veo_3_1-fast-4K',
        imageToVideoModel: 'veo_3_1-fast-4K',
        startEndVideoModel: 'veo_3_1-fast-4K',
        referenceVideoModel: 'veo_3_1-fast-4K',
      },
      videoApifoxHubProfile: 'vectorengine',
      apifoxHubProfile: 'vectorengine',
      imageApifoxHubProfile: 'vectorengine',
      chatApifoxHubProfile: 'vectorengine',
    } as any

    const created = await createVideoTask({
      credentials,
      capability: 'video_start_end_to_video',
      prompt: 'test prompt',
      negativePrompt: 'test negative',
      image: 'https://example.com/first.png',
      lastImage: 'https://example.com/last.png',
      referenceImages: ['https://example.com/product1.png', 'https://example.com/product2.png'],
    })

    assert.equal(created.taskId, 'task_test_reference_payload')
    assert.ok(Array.isArray(capturedBody?.images))
    assert.deepEqual(capturedBody.images, [
      'https://example.com/first.png',
      'https://example.com/last.png',
      'https://example.com/product1.png',
      'https://example.com/product2.png',
    ])
    assert.equal(Number(capturedBody?.motion_strength || 0), 2)
    assert.equal(Number(capturedBody?.weight || 0), 2)
    console.log('clone shot video reference images payload smoke test passed')
  } finally {
    globalThis.fetch = originalFetch
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
