import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { configureAppPathRuntime } from '../src/main/lib/paths'

async function main() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'videogen-watermark-'))
  process.env.VIDEOGENERATE_DATA_DIR = root
  configureAppPathRuntime({ dataDir: root, userDataDir: root })
  const { runFfmpeg } = await import('../src/main/modules/ffmpeg/runner')
  const { probeMedia } = await import('../src/main/modules/ffmpeg/probe')
  const { videoWatermarkService } = await import('../src/main/modules/video-watermark/service')
  const { assetLibraryService } = await import('../src/main/modules/asset-library/service')
  try {
    const source = path.join(root, 'source.mp4')
    await runFfmpeg({ args: ['-y', '-f', 'lavfi', '-i', 'color=c=blue:s=720x1280:d=1', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', source] })
    const preview = await videoWatermarkService.preview({ kind: 'text', text: '品牌 Lumi' })
    assert.ok(existsSync(preview.path))
    await assert.rejects(() => videoWatermarkService.start({ videoPaths: [source], settings: { kind: 'text', text: '' } }), /水印文字/)
    const batch = await videoWatermarkService.start({ videoPaths: [source, path.join(root, 'missing.mp4')], settings: { kind: 'text', text: '品牌 Lumi', position: 'bottom-right' } })
    assert.equal(batch.items.length, 1, 'missing files are skipped')
    const startedAt = Date.now()
    let state = await videoWatermarkService.getState()
    while (Date.now() - startedAt < 60_000) {
      state = await videoWatermarkService.getState()
      const item = state.batches[0].items[0]
      if (item.status === 'done' || item.status === 'failed') break
      await new Promise((resolve) => setTimeout(resolve, 300))
    }
    const item = state.batches[0].items[0]
    assert.equal(item.status, 'done', item.error)
    assert.ok(item.outputPath && existsSync(item.outputPath))
    const probe = await probeMedia(item.outputPath!)
    assert.equal(probe.width, 720)
    assert.equal(probe.hasAudio, true, 'audio kept')
    assert.ok(item.assetId, 'archived to asset library')
    assert.ok((await assetLibraryService.list('', 'video')).some((asset) => asset.id === item.assetId))
    console.log('video-watermark smoke: ok')
  } finally {
    await rm(root, { recursive: true, force: true }).catch(() => undefined)
  }
}

main().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1) })
