import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

async function main() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'videogen-tiktok-listing-grs-'))
  const { generateGptShotFrameImage } = await import('../src/main/modules/clone/gptImage')

  const originalFetch = globalThis.fetch

  const requestBodies: any[] = []

  globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    if (url.endsWith('/v1/draw/completions')) {
      requestBodies.push(JSON.parse(String(init?.body || '{}')))
      return new Response(JSON.stringify({ id: 'task-1' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    if (url.endsWith('/v1/draw/result')) {
      return new Response(
        JSON.stringify({ status: 'succeeded', url: 'https://example.com/generated.png', data: { progress: 100 } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }
    if (url === 'https://example.com/generated.png') {
      return new Response(Buffer.from('png'), { status: 200, headers: { 'Content-Type': 'image/png' } })
    }
    throw new Error(`Unexpected fetch url: ${url}`)
  }

  try {
    const outDir = path.join(root, 'out')
    const generated = await generateGptShotFrameImage({
      credentials: {
        allowMockWhenNoKey: false,
        imageProviderPrimary: 'grsai',
        grsaiApiKey: 'grs-key',
        grsaiHost: 'https://grsai.example.com',
        grsaiImageModel: 'gpt-image-2',
      } as any,
      prompt: 'test prompt',
      negativePrompt: '',
      imagePaths: ['https://example.com/source.jpg', 'https://example.com/board.png'],
      outDir,
      filePrefix: 'listing_1',
      normalizeOutput: 'preserve',
      outputSize: '1024x1024',
    })

    assert.ok(generated.endsWith('.png'))
    assert.equal(requestBodies.length, 1)
    assert.equal(requestBodies[0]?.aspectRatio, '1:1')
    assert.equal(requestBodies[0]?.model, 'gpt-image-2')
    assert.deepEqual(requestBodies[0]?.urls, [
      'https://example.com/source.jpg',
      'https://example.com/board.png',
    ])

    console.log('tiktok listing grs image aspect ratio smoke test passed')
  } finally {
    globalThis.fetch = originalFetch
    await rm(root, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
