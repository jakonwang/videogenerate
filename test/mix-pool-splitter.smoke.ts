/**
 * Smoke test for the mix-pool shot splitter.
 *   npx tsx test/mix-pool-splitter.smoke.ts [video.mp4]
 * Without an argument only the pure range planner is checked.
 */
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

process.env.VIDEOGENERATE_DATA_DIR ||= mkdtempSync(join(tmpdir(), 'mixpool-'))

async function main() {
  const { planClipRanges, splitSourceIntoClips } = await import('../src/main/modules/mix-pool/splitter')

  // Pure planner: no cuts, 10s -> 3 beats of <= 4.5s covering the whole video.
  const r1 = planClipRanges(10, [])
  assert.equal(r1.length, 3)
  assert.equal(r1[0]!.startSec, 0)
  assert.equal(r1[r1.length - 1]!.endSec, 10)
  // Flash cut (0.3s scene) gets merged; tail shorter than min is merged into previous.
  const r2 = planClipRanges(8, [2, 2.3, 7.8])
  assert.ok(r2.every((r) => r.endSec - r.startSec >= 0.7), JSON.stringify(r2))
  assert.equal(r2[r2.length - 1]!.endSec, 8)
  // Contiguous coverage.
  for (let i = 1; i < r2.length; i++) assert.equal(r2[i]!.startSec, r2[i - 1]!.endSec)
  assert.deepEqual(planClipRanges(0.5, []), [{ startSec: 0, endSec: 0.5 }])
  console.log('planner ok', r2)

  const video = process.argv[2]
  if (!video) return
  const now = Date.now()
  const { clips, meta } = await splitSourceIntoClips({
    id: 'smoke-source',
    productId: 'smoke-product',
    kind: 'import',
    filePath: video,
    fileName: 'smoke.mp4',
    origin: 'real',
    status: 'pending',
    clipCount: 0,
    createdAt: now,
    updatedAt: now,
  })
  assert.ok(clips.length > 0)
  for (const c of clips) for (const f of c.framePaths) assert.ok(existsSync(f), `missing frame ${f}`)
  console.log('split ok', meta, clips.map((c) => `${c.startSec}-${c.endSec}`))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
