import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { configureAppPathRuntime } from '../src/main/lib/paths'
import { probeMedia } from '../src/main/modules/ffmpeg/probe'
import { createBatchSubtitleJob, runBatchSubtitleJob } from '../src/main/modules/web-platform/batchSubtitle'
import { closeWebPlatformSqlite } from '../src/main/modules/web-platform/sqlite'

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

  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'videogen-batch-subtitle-ass-'))
  process.env.VIDEOGENERATE_DATA_DIR = tmpRoot
  configureAppPathRuntime({ dataDir: tmpRoot, userDataDir: tmpRoot })

  try {
    const sourceItems = await Promise.all(
      samplePaths.map(async (samplePath, index) => {
        const meta = await probeMedia(samplePath)
        return {
          id: `ass-sample-${index + 1}`,
          sourceType: 'upload' as const,
          sourceVideoPath: samplePath,
          fileName: path.basename(samplePath),
          durationSec: meta.durationSec,
          width: meta.width,
          height: meta.height,
        }
      }),
    )

    const subtitleTracks = sourceItems.map((sourceItem) => ({
      sourceItemId: sourceItem.id,
      status: 'completed' as const,
      updatedAt: Date.now(),
      cues: [
        {
          id: `${sourceItem.id}-cue-1`,
          startMs: 0,
          endMs: 1200,
          text: 'Limited time offer',
          lines: ['Limited time offer'],
        },
        {
          id: `${sourceItem.id}-cue-2`,
          startMs: 1400,
          endMs: 2800,
          text: 'Fast shipping today',
          lines: ['Fast shipping today'],
        },
      ],
    }))

    const job = await createBatchSubtitleJob({
      userId: 'ass-smoke-user',
      name: 'ASS Smoke',
      sourceItems,
      subtitleMode: 'timed_caption',
      subtitleSource: 'manual',
      exportEngine: 'ass_fallback',
      titleRenderMode: 'ass_text',
      captionStyle: {
        fontName: 'SimHei',
        fontSize: 68,
        fontColor: '#FFFFFF',
        strokeColor: '#101116',
        strokeWidth: 8,
        shadowColor: '#000000',
        shadowBlur: 10,
        position: 'bottom',
        textAlign: 'center',
        safeMargin: 10,
        maxLines: 2,
        maxWidthRatio: 0.8,
        lineGap: 6,
        bottomMargin: 188,
      },
      titleItems: [],
    })

    const prepared = await import('../src/main/modules/web-platform/repo').then(({ webPlatformRepo }) =>
      webPlatformRepo.upsertBatchSubtitleJob({
        ...job,
        subtitleTracks,
        updatedAt: Date.now(),
      }),
    )

    const startedAt = Date.now()
    const completed = await runBatchSubtitleJob({
      userId: 'ass-smoke-user',
      jobId: prepared.id,
    })
    const elapsedMs = Date.now() - startedAt

    assert.equal(completed.status, 'completed')
    assert.equal(completed.outputCount, sourceItems.length)
    assert.equal(completed.outputs.length, sourceItems.length)
    for (const output of completed.outputs) {
      assert.equal(output.renderStatus, 'success')
      assert.ok(existsSync(String(output.outputVideoPath || '')), `Missing ASS output video: ${output.outputVideoPath}`)
    }

    const sharedFontsDir = path.join(tmpRoot, 'batch-subtitle', 'ass-smoke-user', completed.id, '_shared-ass', 'fonts_merged')
    assert.ok(existsSync(sharedFontsDir), `Missing shared ASS fonts dir: ${sharedFontsDir}`)

    console.log(
      JSON.stringify(
        {
          sampleCount: sourceItems.length,
          elapsedMs,
          elapsedSec: Number((elapsedMs / 1000).toFixed(2)),
          sharedFontsDir,
        },
        null,
        2,
      ),
    )
    console.log('batch subtitle ass smoke test passed')
  } finally {
    closeWebPlatformSqlite()
    delete process.env.VIDEOGENERATE_DATA_DIR
    await rm(tmpRoot, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
