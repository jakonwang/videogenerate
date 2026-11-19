/**
 * 批量字幕成片里的表情：不联网也要画出来（用随软件带的 Twemoji 图片），不能画成方块；
 * 同时检查自定义位置、各行一样大、加粗这些新样式能走通整条成片渲染。
 */
import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

async function findFile(dir: string, name: string): Promise<string | null> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      const hit = await findFile(full, name)
      if (hit) return hit
    } else if (entry.name === name) return full
  }
  return null
}

async function main() {
  const root = await mkdtemp(join(tmpdir(), 'vg-emoji-'))
  process.env.VIDEOGENERATE_USER_DATA_DIR = root
  process.env.VIDEOGENERATE_DATA_DIR = join(root, 'data')
  // 模拟国内网络连不上 CDN
  globalThis.fetch = (async () => {
    throw new Error('network blocked in test')
  }) as typeof fetch
  const ffmpeg = String(require('ffmpeg-static'))
  const sample = join(root, 'ring.mp4')
  // 非 9:16 的素材（和用户那条戒指视频一样是竖的但不是 9:16）
  execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=0xb08060:s=576x708:d=1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', sample])
  const { renderBatchSubtitleVideoWithBitmapOverlay } = await import('../src/main/modules/web-platform/batchSubtitleBitmap')
  const outputDir = join(root, 'out')
  const result = await renderBatchSubtitleVideoWithBitmapOverlay({
    sourceItem: { id: 'ring', sourceType: 'upload', sourceVideoPath: sample, fileName: 'ring.mp4', width: 576, height: 708 } as never,
    titleConfig: { strategy: 'single_for_all', singleText: '6666666 ✨😚', titlePool: [] },
    styleConfig: {
      fontName: 'Noto Sans SC', fontSize: 52, fontWeight: 600, fontColor: '#FFFFFF', strokeColor: '#000000', strokeWidth: 0,
      shadowColor: '#000000', shadowBlur: 10, position: 'center', offsetYRatio: 0.55, offsetXRatio: 0.5, secondaryScale: 1,
      safeMargin: 8, lineMode: 'multi', textAlign: 'center', maxLines: 2, maxWidthRatio: 0.8, lineGap: 6, bottomMargin: 220,
    } as never,
    outputDir,
  })
  const svgPath = await findFile(outputDir, 'overlay.svg')
  assert.ok(svgPath, 'overlay svg written')
  const svg = await readFile(svgPath!, 'utf8')
  const images = svg.match(/<image href="data:image\/svg\+xml;base64,/g) ?? []
  assert.equal(images.length, 2, 'both emoji are drawn as images even without network')
  const frame = join(root, 'frame.png')
  execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-ss', '0.3', '-i', result.outputVideoPath, '-frames:v', '1', frame])
  console.log(JSON.stringify({ output: result.outputVideoPath, frame }))
  console.log('batch subtitle emoji smoke test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
