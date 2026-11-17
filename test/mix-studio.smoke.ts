/**
 * End-to-end smoke for the mix studio (auto mode, no LLM): product footage → clip pool → drafts → render.
 * Needs Electron's Node ABI (better-sqlite3 is built for it):
 *   ELECTRON_RUN_AS_NODE=1 npx electron -r tsx/cjs test/mix-studio.smoke.ts <video1.mp4> [video2.mp4 ...]
 * Edge TTS needs network access.
 */
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'

const dataDir = mkdtempSync(join(tmpdir(), 'mixstudio-'))
process.env.VIDEOGENERATE_DATA_DIR = dataDir

async function main() {
  const videos = process.argv.slice(2).filter((p) => p.endsWith('.mp4'))
  assert.ok(videos.length >= 1, 'pass at least one mp4')

  const { productsRepo } = await import('../src/main/modules/products/repo')
  const { mixPoolService } = await import('../src/main/modules/mix-pool/service')
  const { mixStudioService } = await import('../src/main/modules/mix-studio/service')
  // Same module instance the service enqueues into (CJS require cache), not a second ESM copy.
  const { taskQueue } = createRequire(__filename)('../src/main/modules/tasks/queue') as typeof import('../src/main/modules/tasks/queue')
  const { probeMedia } = await import('../src/main/modules/ffmpeg/probe')

  const seg = ['hook', 'show', 'detail']
  const assets: Record<string, any[]> = { hook: [], show: [], detail: [] }
  videos.forEach((v, i) => {
    assets[seg[i % 3]!]!.push({ id: `a${i}`, filePath: v, fileName: `v${i}.mp4`, fileSize: 1, durationSec: 0, createdAt: Date.now() })
  })
  const product = await productsRepo.upsert({ name: 'Smoke Earring', type: 'earring', assets } as any)

  const sync = await mixPoolService.syncLinked(product.id)
  console.log('synced sources', sync)
  mixPoolService.process(product.id)
  for (let i = 0; i < 300 && mixPoolService.isRunning(product.id); i++) await new Promise((r) => setTimeout(r, 500))
  const ov = await mixPoolService.overview(product.id)
  console.log('pool', ov.stats.clipCount, 'clips; byRole', ov.stats.byRole.filter((r) => r.count).map((r) => `${r.role}:${r.count}`).join(' '))
  assert.ok(ov.stats.taggedCount >= 3, 'need >= 3 tagged clips')

  const outDir = join(dataDir, 'out')
  const input = {
    productId: product.id,
    mode: 'auto' as const,
    formulaIds: ['builtin:problem_solution', 'builtin:result_first'],
    count: 2,
    language: 'en-US' as const,
    voice: 'en-US-JennyNeural',
    outDir,
    keepOriginalAudio: false,
    allowAiClips: true,
    hookLines: ['Everyone keeps asking where I got this {product}'],
    bodyLines: ['Look how clean the details are up close.', 'I wear it every day and it still looks new.', 'Simple design but it looks so expensive.'],
    ctaLines: ['Tap the orange cart to grab yours before it sells out!'],
  }
  const preview = await mixStudioService.preview(input)
  for (const d of preview.drafts) {
    console.log(`draft ${d.formulaName}: ${d.shots.map((s) => `${s.role}(${s.durationSec}s)`).join(' > ')} total=${d.totalDurationSec}s`)
    console.log('  title:', d.title, '| voiceover:', d.voiceover)
    assert.ok(d.voiceover.includes('Smoke Earring'), '{product} replaced')
  }
  assert.equal(preview.drafts.length, 2)
  assert.notDeepEqual(
    preview.drafts[0]!.shots.map((s) => s.clipId),
    preview.drafts[1]!.shots.map((s) => s.clipId),
    'two drafts should not be identical cuts',
  )

  // SMOKE_NO_TTS=1 skips Edge TTS (network) and renders picture + hook title only.
  if (process.env.SMOKE_NO_TTS === '1') for (const d of preview.drafts) d.voiceover = ''
  const res = await mixStudioService.enqueue(input, preview.drafts)
  console.log('enqueued', res)
  assert.equal(res.enqueued, 2)
  assert.equal(taskQueue.list().length, 2, 'queue should hold the 2 mix tasks')

  const deadline = Date.now() + 8 * 60_000
  let tasks = taskQueue.list() as any[]
  while (Date.now() < deadline) {
    tasks = taskQueue.list() as any[]
    if (tasks.every((t) => ['done', 'error', 'cancelled'].includes(t.status))) break
    await new Promise((r) => setTimeout(r, 1000))
  }
  for (const t of tasks) {
    console.log(t.status, t.outPath, t.error ?? '', '\n  ', t.logs.slice(0, 4).join('\n   '))
    assert.equal(t.status, 'done', t.error)
    assert.ok(existsSync(t.outPath))
    const meta = await probeMedia(t.outPath)
    console.log('   output', meta.durationSec?.toFixed(2), 's', meta.width, 'x', meta.height, 'audio', meta.hasAudio)
    if (process.env.SMOKE_NO_TTS !== '1') assert.ok(meta.hasAudio)
    assert.ok(t.mix?.formulaName)
  }
  console.log('OK data dir:', dataDir)
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
