import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { probeMedia } from '../src/main/modules/ffmpeg/probe'
import { renderBatchSubtitleVideoWithBitmapOverlay } from '../src/main/modules/web-platform/batchSubtitleBitmap'

const SAMPLE_RELATIVE_PATHS = [
  'test/automation_output/user_request_afterfix3_20260411_132615/自动化测试产品-含配乐文字-20260411_132616_自动化测试模板-含配乐文字-20260411_132616_1775888792513_ce39894c.mp4',
  'test/automation_output/user_request_afterfix3_20260411_132615/自动化测试产品-含配乐文字-20260411_132616_自动化测试模板-含配乐文字-20260411_132616_1775888792512_da5f2b92.mp4',
  'test/automation_output/user_request_afterfix3_20260411_132615/自动化测试产品-含配乐文字-20260411_132616_自动化测试模板-含配乐文字-20260411_132616_1775888792512_d8c3d592.mp4',
]

async function main() {
  const samplePaths = SAMPLE_RELATIVE_PATHS.map((item) => path.resolve(item))
  for (const samplePath of samplePaths) {
    assert.ok(existsSync(samplePath), `Missing sample video: ${samplePath}`)
  }

  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'videogen-batch-subtitle-'))
  const outputDir = path.join(tmpRoot, 'bitmap-run')

  try {
    const sourceItems = await Promise.all(
      samplePaths.map(async (samplePath, index) => {
        const meta = await probeMedia(samplePath)
        return {
          id: `sample-${index + 1}`,
          sourceType: 'upload' as const,
          sourceVideoPath: samplePath,
          fileName: path.basename(samplePath),
          durationSec: meta.durationSec,
          width: meta.width,
          height: meta.height,
        }
      }),
    )

    const startedAt = Date.now()
    const results = await Promise.all(
      sourceItems.map((sourceItem) =>
        renderBatchSubtitleVideoWithBitmapOverlay({
          sourceItem,
          titleConfig: {
            strategy: 'single_for_all',
            singleText: 'FLASH DEAL TODAY',
            titlePool: [],
          },
          styleConfig: {
            fontName: 'SimHei',
            fontSize: 68,
            fontColor: '#FFFFFF',
            strokeColor: '#101116',
            strokeWidth: 8,
            shadowColor: 'rgba(0,0,0,0.34)',
            shadowBlur: 10,
            position: 'bottom',
            safeMargin: 10,
            lineMode: 'multi',
            textAlign: 'center',
            maxLines: 2,
            maxWidthRatio: 0.8,
            lineGap: 6,
            bottomMargin: 188,
          },
          outputDir,
          ffmpegThreads: 1,
        }),
      ),
    )
    const elapsedMs = Date.now() - startedAt

    for (const result of results) {
      assert.ok(existsSync(result.outputVideoPath), `Missing output video: ${result.outputVideoPath}`)
      assert.ok(existsSync(result.overlayImagePath), `Missing overlay image: ${result.overlayImagePath}`)
    }

    const overlayCacheRoot = path.join(outputDir, '_overlay-cache')
    const overlayCacheEntries = await readdir(overlayCacheRoot, { withFileTypes: true })
    const overlayCacheDirs = overlayCacheEntries.filter((entry) => entry.isDirectory()).map((entry) => entry.name)
    assert.equal(overlayCacheDirs.length, 1, 'Expected a single shared overlay cache directory')
    assert.match(overlayCacheDirs[0] || '', /^[0-9a-f]{40}$/i, 'Expected overlay cache key to be a short sha1 hex string')

    console.log(
      JSON.stringify(
        {
          sampleCount: results.length,
          elapsedMs,
          elapsedSec: Number((elapsedMs / 1000).toFixed(2)),
          outputDir,
          overlayCacheDir: overlayCacheDirs[0] || '',
        },
        null,
        2,
      ),
    )
    console.log('batch subtitle bitmap smoke test passed')
  } finally {
    await rm(tmpRoot, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
