/**
 * 模板库「导入视频 → AI 识别模板」：总时长范围、参考分镜缩略图的清理。
 */
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = mkdtempSync(join(tmpdir(), 'vg-template-import-'))
process.env.VIDEOGENERATE_USER_DATA_DIR = root
process.env.VIDEOGENERATE_DATA_DIR = join(root, 'data')

async function main() {
  const { totalDurationRange, TEMPLATE_MAX_TOTAL_SEC } = await import('../src/main/modules/templates/analyzeVideoTemplate')
  const { templateRefsRoot, sweepUnusedRefDirs, DRAFT_KEEP_MS } = await import('../src/main/modules/templates/refAssets')
  const { templatesRepo } = await import('../src/main/modules/templates/repo')

  // 1) 总时长范围：短视频按 ±15%，长视频收进上限且 min < max
  assert.deepEqual(totalDurationRange(10), { min: 8, max: 12 })
  assert.deepEqual(totalDurationRange(2), { min: 3, max: 4 })
  for (const total of [52, 60, 70, 80, 95, 300, 0, Number.NaN]) {
    const r = totalDurationRange(total)
    assert.ok(r.min >= 3 && r.min < r.max && r.max <= TEMPLATE_MAX_TOTAL_SEC, `${total}s → ${r.min}–${r.max}`)
  }
  assert.deepEqual(totalDurationRange(80), { min: 59, max: 60 })
  console.log('✓ template total duration stays within the 60 s cap for long videos')

  // 2) 缩略图目录：删模板删它独占的；共用的保留；没保存的草稿过保留期才清
  const refs = templateRefsRoot()
  const makeDir = (name: string) => {
    mkdirSync(join(refs, name), { recursive: true })
    const file = join(refs, name, 'shot_1.jpg')
    writeFileSync(file, 'jpg')
    return file
  }
  const onlyA = makeDir('job-a')
  const shared = makeDir('job-shared')
  makeDir('draft-old')
  makeDir('draft-new')
  const old = (Date.now() - DRAFT_KEEP_MS - 60_000) / 1000
  utimesSync(join(refs, 'draft-old'), old, old)

  const shotsOf = (...paths: string[]) => paths.map((thumbnailPath, index) => ({ index, segment: 'hook', startSec: 0, durationSec: 1, motion: 'static', transitionIn: 'hardcut', scriptText: '', onScreenText: '', visual: '', thumbnailPath }))
  const a = await templatesRepo.upsert({ name: 'A', structure: ['hook', 'show'], meta: { source: 'video_ai', referenceShots: shotsOf(onlyA, shared) } } as any)
  await templatesRepo.upsert({ name: 'B', structure: ['hook', 'show'], meta: { source: 'video_ai', referenceShots: shotsOf(shared) } } as any)
  assert.ok((await templatesRepo.list()).find((t) => t.id === a.id)?.meta?.referenceShots?.length === 2, 'reference shots kept on save')

  await templatesRepo.remove(a.id)
  assert.equal(existsSync(join(refs, 'job-a')), false, 'thumbnails only A used are removed with A')
  assert.equal(existsSync(join(refs, 'job-shared')), true, 'thumbnails another template still uses are kept')

  const swept = await sweepUnusedRefDirs(await templatesRepo.list())
  assert.equal(swept.removed, 1)
  assert.equal(existsSync(join(refs, 'draft-old')), false, 'old unsaved draft removed')
  assert.equal(existsSync(join(refs, 'draft-new')), true, 'recent draft kept (user may still be reviewing it)')
  assert.equal(existsSync(join(refs, 'job-shared')), true)
  console.log('✓ template reference thumbnails are cleaned up without touching ones in use')
  console.log('template video import smoke test passed')
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
