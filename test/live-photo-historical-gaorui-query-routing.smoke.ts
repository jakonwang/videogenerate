import assert from 'node:assert/strict'

async function main() {
  const { queryAsyncTask } = await import('../src/main/modules/clone/unifiedVideo')

  const originalFetch = globalThis.fetch
  const calls: string[] = []

  globalThis.fetch = (async (input: any) => {
    const url = String(input)
    calls.push(url)

    if (url === 'https://gaorui.cc/v1/videos/ba74ee71-323e-49bf-9680-f600af46b37e') {
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            id: 'ba74ee71-323e-49bf-9680-f600af46b37e',
            status: 'running',
          }),
      } as any
    }

    return {
      ok: false,
      status: 404,
      text: async () =>
        JSON.stringify({
          error: {
            message: `Unexpected URL ${url}`,
          },
        }),
    } as any
  }) as any

  try {
    const credentials = {
      videoProviderPrimary: 'apifox_hub',
      videoApifoxHubProfile: 'gaorui',
      apifoxHubProfile: 'gaorui',
      gaoruiHub: {
        enabled: true,
        baseUrl: 'https://gaorui.cc',
        apiKey: 'test-gaorui-key',
        videoProvider: 'gaorui',
        videoEndpointStyle: 'openai_video',
        imageToVideoModel: 'veo_3_1-fl',
      },
    } as any

    const queried = await queryAsyncTask({
      credentials,
      taskId: 'ba74ee71-323e-49bf-9680-f600af46b37e',
      provider: 'apifox_hub',
      model: 'veo_3_1-fl',
      endpointStyle: 'openai_video',
      baseUrl: 'https://gaorui.cc',
    })

    assert.equal(calls[0], 'https://gaorui.cc/v1/videos/ba74ee71-323e-49bf-9680-f600af46b37e')
    assert.ok(!calls.some((url) => url.includes('/v1/video/query?id=')))
    assert.equal(queried.status, 'running')

    console.log('live photo historical gaorui query routing smoke test passed')
  } finally {
    globalThis.fetch = originalFetch
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
