import assert from 'node:assert/strict'

async function main() {
  const { createVideoTask, queryAsyncTask } = await import('../src/main/modules/clone/unifiedVideo')

  const originalFetch = globalThis.fetch
  const calls: Array<{ url: string; body?: any }> = []

  globalThis.fetch = (async (input: any, init?: any) => {
    const url = String(input)
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    calls.push({ url, body })

    if (init?.method === 'POST') {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ id: 'gaorui_task_1', status: 'queued' }),
      } as any
    }

    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ id: 'gaorui_task_1', status: 'completed', url: 'https://cdn.example.com/out.mp4' }),
    } as any
  }) as any

  try {
    const credentials = {
      apifoxHub: {
        enabled: true,
        apiKey: 'gaorui-key',
        baseUrl: 'https://gaorui.cc',
        videoProvider: 'gaorui',
        videoEndpointStyle: 'official_rest',
        textToVideoModel: 'veo_3_1',
        imageToVideoModel: 'veo_3_1-fl',
        startEndVideoModel: 'veo_3_1-fl',
        referenceVideoModel: 'veo_3_1-components',
      },
      gaoruiHub: {
        enabled: true,
        apiKey: 'gaorui-key',
        baseUrl: 'https://gaorui.cc',
        videoProvider: 'gaorui',
        videoEndpointStyle: 'official_rest',
        textToVideoModel: 'veo_3_1',
        imageToVideoModel: 'veo_3_1-fl',
        startEndVideoModel: 'veo_3_1-fl',
        referenceVideoModel: 'veo_3_1-components',
      },
      videoApifoxHubProfile: 'gaorui',
      apifoxHubProfile: 'gaorui',
      imageApifoxHubProfile: 'vectorengine',
      chatApifoxHubProfile: 'vectorengine',
    } as any

    const textTask = await createVideoTask({
      credentials,
      capability: 'video_text_to_video',
      prompt: 'text only prompt',
      negativePrompt: 'oversized product, identity drift',
      aspectRatio: '16:9',
    })
    assert.equal(textTask.taskId, 'gaorui_task_1')
    assert.equal(calls[0]?.url, 'https://gaorui.cc/v1/videos')
    assert.equal(calls[0]?.body?.model, 'veo_3_1')
    assert.equal(calls[0]?.body?.aspect_ratio, '16:9')
    assert.equal(calls[0]?.body?.resolution, '720p')
    assert.equal(calls[0]?.body?.negative_prompt, 'oversized product, identity drift')
    assert.ok(!('size' in (calls[0]?.body || {})))
    assert.ok(!('images' in (calls[0]?.body || {})))

    const refTask = await createVideoTask({
      credentials,
      capability: 'video_reference_to_video',
      prompt: 'reference prompt',
      negativePrompt: 'clear real-person face, oversized product',
      image: 'https://example.com/first.png',
      lastImage: 'https://example.com/last.png',
      referenceImages: ['https://example.com/ref1.png', 'https://example.com/ref2.png'],
      aspectRatio: '9:16',
    })
    assert.equal(refTask.taskId, 'gaorui_task_1')
    assert.equal(calls[1]?.body?.model, 'veo_3_1-components')
    assert.equal(calls[1]?.body?.aspect_ratio, '9:16')
    assert.equal(calls[1]?.body?.negative_prompt, 'clear real-person face, oversized product')
    assert.deepEqual(calls[1]?.body?.images, [
      'https://example.com/first.png',
      'https://example.com/last.png',
      'https://example.com/ref1.png',
      'https://example.com/ref2.png',
    ])

    const queried = await queryAsyncTask({
      credentials,
      taskId: 'gaorui_task_1',
      model: 'veo_3_1-components',
      endpointStyle: 'official_rest',
      baseUrl: 'https://gaorui.cc',
    })
    assert.equal(calls[2]?.url, 'https://gaorui.cc/v1/videos/gaorui_task_1')
    assert.equal(queried.status, 'succeeded')
    assert.deepEqual(queried.outputUrls, ['https://cdn.example.com/out.mp4'])

    console.log('clone gaorui video provider smoke test passed')
  } finally {
    globalThis.fetch = originalFetch
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
