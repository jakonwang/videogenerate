import assert from 'node:assert/strict'

async function main() {
  const { queryAsyncTask } = await import('../src/main/modules/clone/unifiedVideo')

  const originalFetch = globalThis.fetch
  const calls: string[] = []

  globalThis.fetch = (async (input: any) => {
    const url = String(input)
    calls.push(url)

    if (url === 'https://vector.example.com/api/v1/model/prediction/52abb381-d3e5-4abd-9381-d9fe8c5deba9') {
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            id: '52abb381-d3e5-4abd-9381-d9fe8c5deba9',
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
      videoApifoxHubProfile: 'vectorengine',
      apifoxHubProfile: 'vectorengine',
      vectorEngineHub: {
        enabled: true,
        baseUrl: 'https://vector.example.com',
        apiKey: 'test-vector-key',
        videoProvider: 'apifox_hub',
        videoEndpointStyle: 'official_rest',
        imageToVideoModel: 'veo_3_1',
      },
    } as any

    const queried = await queryAsyncTask({
      credentials,
      taskId: '52abb381-d3e5-4abd-9381-d9fe8c5deba9',
      provider: 'apifox_hub',
      model: 'veo_3_1',
      endpointStyle: 'official_rest',
      baseUrl: 'https://vector.example.com',
    })

    assert.equal(
      calls[0],
      'https://vector.example.com/api/v1/model/prediction/52abb381-d3e5-4abd-9381-d9fe8c5deba9',
    )
    assert.ok(!calls.some((url) => url.includes('/v1/video/query?id=52abb381-d3e5-4abd-9381-d9fe8c5deba9')))
    assert.equal(queried.status, 'running')

    console.log('vectorengine official_rest query order smoke test passed')
  } finally {
    globalThis.fetch = originalFetch
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
