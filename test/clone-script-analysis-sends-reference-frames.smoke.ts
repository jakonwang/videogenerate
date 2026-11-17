import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const ANALYSIS_JSON = JSON.stringify({
  global_analysis: { video_type: 'demo' },
  shots: [
    {
      shot_id: 'shot_1',
      script_role: 'hook',
      visual_description: 'hand holding a bottle',
      action: 'hand tilts the bottle',
      camera: { shot_type: 'close-up' },
      generation_prompt: 'bottle close-up',
      script_confidence: 0.8,
      analysis_notes: [],
    },
  ],
})

async function main() {
  const dir = await mkdtemp(join(tmpdir(), 'clone-frames-'))
  const startFrame = join(dir, 'start.jpg')
  const midFrame = join(dir, 'mid.png')
  await writeFile(startFrame, Buffer.from('fake-jpeg-bytes'))
  await writeFile(midFrame, Buffer.from('fake-png-bytes'))

  const { analyzeReferenceScriptWithGrs } = await import('../src/main/modules/clone/aiScriptAnalyzer')
  const originalFetch = globalThis.fetch
  const requests: any[] = []

  const baseInput = {
    videoPath: join(dir, 'ref.mp4'),
    locale: 'zh-CN' as const,
    shots: [
      {
        id: 'shot_1',
        index: 0,
        startSec: 0,
        endSec: 2,
        durationSec: 2,
        role: 'hook',
        visualPrompt: 'local hint',
        motion: 'static',
        framing: 'closeup',
        referenceFramePaths: { start: startFrame, mid: midFrame, end: join(dir, 'missing.jpg') },
      },
    ] as any,
  }
  const credentialsFor = (endpointStyle: string) =>
    ({
      chatProviderPrimary: 'apifox_hub',
      apifoxHub: {
        enabled: true,
        apiKey: 'test-key',
        baseUrl: 'https://chat.example.test',
        chatModel: 'gemini-2.5-pro',
        chatEndpointStyle: endpointStyle,
      },
    }) as any

  try {
    // 1. OpenAI-compatible endpoint: frames are sent as image_url parts with captions
    globalThis.fetch = (async (_url: any, init: any) => {
      requests.push(JSON.parse(String(init.body)))
      return new Response(JSON.stringify({ choices: [{ message: { content: ANALYSIS_JSON } }] }), { status: 200 })
    }) as any
    const result = await analyzeReferenceScriptWithGrs({ ...baseInput, credentials: credentialsFor('openai_compatible') })
    assert.equal(requests.length, 1)
    const userContent = requests[0].messages.at(-1).content
    assert.ok(Array.isArray(userContent), 'user content must be multimodal parts')
    const imageParts = userContent.filter((part: any) => part.type === 'image_url')
    assert.equal(imageParts.length, 2, 'the two readable frames are sent, the missing one is skipped')
    assert.match(imageParts[0].image_url.url, /^data:image\/jpeg;base64,/)
    assert.match(imageParts[1].image_url.url, /^data:image\/png;base64,/)
    const texts = userContent.filter((part: any) => part.type === 'text').map((part: any) => part.text)
    assert.ok(texts.includes('shot_1 start frame'))
    assert.ok(texts.includes('shot_1 mid frame'))
    assert.match(texts[0], /Attached reference frames: 2 sampled frames/)
    assert.equal(result.shots[0].actionDescription, 'hand tilts the bottle')
    assert.deepEqual(result.shots[0].analysisNotes, [])

    // 2. A model without vision rejects images: retry text-only and flag the result as blind
    requests.length = 0
    globalThis.fetch = (async (_url: any, init: any) => {
      const body = JSON.parse(String(init.body))
      requests.push(body)
      if (Array.isArray(body.messages.at(-1).content)) {
        return new Response('{"error":"image input is not supported"}', { status: 400 })
      }
      return new Response(JSON.stringify({ choices: [{ message: { content: ANALYSIS_JSON } }] }), { status: 200 })
    }) as any
    const blind = await analyzeReferenceScriptWithGrs({ ...baseInput, credentials: credentialsFor('openai_compatible') })
    assert.equal(requests.length, 2)
    assert.equal(typeof requests[1].messages.at(-1).content, 'string')
    assert.match(requests[1].messages.at(-1).content, /No reference frames are attached/)
    assert.match(blind.shots[0].analysisNotes[0], /did not see the video/)
  } finally {
    globalThis.fetch = originalFetch
    await rm(dir, { recursive: true, force: true })
  }

  console.log('clone script analysis sends reference frames smoke test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
