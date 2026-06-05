import assert from 'node:assert/strict'
import { mkdir, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

async function main() {
  const root = await mkdtemp(join(tmpdir(), 'vg-shot-video-download-body-timeout-'))
  process.env.VIDEOGENERATE_USER_DATA_DIR = root
  process.env.VIDEOGENERATE_DATA_DIR = join(root, '.videogenerate')
  await mkdir(join(process.env.VIDEOGENERATE_DATA_DIR, 'db'), { recursive: true })

  const originalSetTimeout = globalThis.setTimeout
  ;(globalThis as any).setTimeout = ((handler: (...args: any[]) => void, _timeout?: number, ...args: any[]) =>
    originalSetTimeout(handler, 0, ...args)) as typeof setTimeout

  const originalFetch = globalThis.fetch
  globalThis.fetch = (async () =>
    ({
      ok: true,
      status: 200,
      statusText: 'OK',
      clone() {
        return {
          text: async () => '',
        } as any
      },
      text: async () => '',
      arrayBuffer: async () => await new Promise<ArrayBuffer>(() => {}),
      headers: new Headers(),
    }) as any) as any

  try {
    const { downloadAtlasToBuffer } = await import('../src/main/modules/clone/atlasRetry')
    let failed = false
    try {
      await downloadAtlasToBuffer('https://example.com/stuck.mp4', 'download-body-timeout-test')
    } catch (error: any) {
      failed = true
      assert.match(String(error?.message ?? error ?? ''), /timeout/i)
    }
    assert.equal(failed, true)
    console.log('clone shot video download body timeout smoke test passed')
  } finally {
    globalThis.fetch = originalFetch
    ;(globalThis as any).setTimeout = originalSetTimeout
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
