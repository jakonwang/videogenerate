/**
 * Smoke for the mix performance loop (no network, no render):
 *   ELECTRON_RUN_AS_NODE=1 npx electron --import tsx test/mix-insights.smoke.ts <video1.mp4> [video2.mp4 ...]
 */
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'

process.env.VIDEOGENERATE_DATA_DIR = mkdtempSync(join(tmpdir(), 'mixinsights-'))
const req = createRequire(__filename)

async function main() {
  const videos = process.argv.slice(2).filter((p) => p.endsWith('.mp4'))
  assert.ok(videos.length >= 1, 'pass at least one mp4')
  const ins = req('../src/main/modules/mix-studio/insights') as typeof import('../src/main/modules/mix-studio/insights')
  const { productsRepo } = req('../src/main/modules/products/repo') as typeof import('../src/main/modules/products/repo')
  const { mixPoolService } = req('../src/main/modules/mix-pool/service') as typeof import('../src/main/modules/mix-pool/service')
  const { mixStudioService } = req('../src/main/modules/mix-studio/service') as typeof import('../src/main/modules/mix-studio/service')

  // ---- pure: caption similarity ----
  assert.ok(ins.captionSimilarity('Ai cũng hỏi mình mua khuyên tai ở đâu #fyp', 'ai cũng hỏi mình mua khuyên tai ở đâu') > 0.95)
  assert.ok(ins.captionSimilarity('别再乱买耳环了，先看这个！', '别再乱买耳环了 先看这个') > 0.95)
  assert.ok(ins.captionSimilarity('Everyone keeps asking where I got this', 'Totally different caption about shoes') < 0.4)

  // ---- seed: product + clip pool ----
  const assets: Record<string, any[]> = { hook: [], show: [], detail: [] }
  videos.forEach((v, i) => assets[['hook', 'show', 'detail'][i % 3]!]!.push({ id: `a${i}`, filePath: v, fileName: `v${i}.mp4`, fileSize: 1, durationSec: 0, createdAt: Date.now() }))
  const product = await productsRepo.upsert({ name: 'Insight Ring', type: 'ring', assets } as any)
  await mixPoolService.syncLinked(product.id)
  mixPoolService.process(product.id)
  for (let i = 0; i < 300 && mixPoolService.isRunning(product.id); i++) await new Promise((r) => setTimeout(r, 300))
  const pool = await mixPoolService.overview(product.id)
  const hookClip = pool.clips.find((c) => c.tags?.role === 'hook') ?? pool.clips[0]!

  // ---- ledger: 4 rendered videos (fake files are fine: recordRender checks the path, so point at a real one) ----
  const mk = (id: string, formulaId: string, formulaName: string, title: string, dur: number, hookStyle: string) => ({
    id,
    productId: product.id,
    outPath: videos[0]!,
    status: 'done',
    plan: { totalDurationSec: dur, segments: [] },
    mix: { mode: 'ai', formulaId, formulaName, hookClipId: hookClip.id, clipIds: [hookClip.id], title, voiceover: `${title}. Body. Tap the cart!`, hookStyle, language: 'en-US' },
  })
  const tasks = [
    mk('t1', 'builtin:result_first', '效果先行', 'Everyone keeps asking where I got this ring', 15, 'social proof'),
    mk('t2', 'builtin:result_first', '效果先行', 'This ring looks so expensive but it is not', 14, 'social proof'),
    mk('t3', 'builtin:problem_solution', '痛点 → 解决', 'Tired of rings that turn your finger green?', 16, 'problem question'),
    mk('t4', 'builtin:problem_solution', '痛点 → 解决', 'Stop buying cheap rings', 15, 'myth bust'),
  ]
  for (const t of tasks) await ins.mixLedger.recordRender(t as any)
  assert.equal((await ins.mixLedger.list()).length, 4)

  // t1 was published with a different caption than its on-screen title; t4's creative has a wrong duration.
  const publishTasks = [{ id: 'p1', sourceRef: 'mix:t1', videoTitle: 'where did I get this ring?? everyone asks #ring' }]
  const perf = (g: 'S' | 'A' | 'B' | 'C', roi: string, ctr: string, cvr: string) => ({ available: true, spend: '100', gmv: String(Number(roi) * 100), roi, orders: '5', ctr, cvr })
  const creatives = [
    { creativeId: 'c1', campaignId: 'k', name: 'where did I get this ring?? everyone asks', grade: 'S' as const, durationSeconds: 15.2, performance: perf('S', '4.2', '0.031', '0.045') },
    { creativeId: 'c2', campaignId: 'k', name: 'This ring looks so expensive but it is not', grade: 'A' as const, durationSeconds: 14, performance: perf('A', '3.1', '0.024', '0.03') },
    { creativeId: 'c3', campaignId: 'k', name: 'Tired of rings that turn your finger green?', grade: 'C' as const, durationSeconds: 16, performance: perf('C', '0.8', '0.006', '0.008') },
    { creativeId: 'c4', campaignId: 'k', name: 'Stop buying cheap rings', grade: 'B' as const, durationSeconds: 30, performance: perf('B', '1.5', '0.01', '0.01') },
    { creativeId: 'c5', campaignId: 'k', name: 'Unrelated shoe video', grade: 'S' as const, durationSeconds: 15, performance: perf('S', '5', '0.04', '0.05') },
  ]
  const applied = await ins.mixLedger.applyCreatives(creatives, publishTasks)
  const byId = new Map((await ins.mixLedger.list()).map((e) => [e.id, e]))
  console.log('applied', applied, [...byId.values()].map((e) => `${e.id}->${e.link?.creativeId ?? '-'}(${e.link?.confidence ?? ''})`).join(' '))
  assert.equal(byId.get('t1')!.link?.creativeId, 'c1', 'publish caption match')
  assert.equal(byId.get('t2')!.link?.creativeId, 'c2', 'on-screen title match')
  assert.equal(byId.get('t3')!.link?.creativeId, 'c3')
  assert.equal(byId.get('t4')!.link, undefined, 'duration mismatch must not link')
  assert.equal(applied.newlyLinked, 3)

  // Manual link + idempotent refresh.
  await ins.mixLedger.setLink('t4', { ...creatives[3]!, durationSeconds: 15 })
  const again = await ins.mixLedger.applyCreatives(creatives, publishTasks)
  assert.equal(again.newlyLinked, 0)
  assert.equal((await ins.mixLedger.get('t4'))!.link?.method, 'manual')

  // ---- scoring ----
  const insight = await ins.mixLedger.insights(product.id)
  console.log('formulas', insight.formulas.map((r) => `${r.label}: score=${r.score} weight=${r.weight} S/A=${r.sCount}/${r.aCount}`))
  const rf = insight.formulas.find((r) => r.key === 'builtin:result_first')!
  const ps = insight.formulas.find((r) => r.key === 'builtin:problem_solution')!
  assert.ok(rf.weight > 1.1 && ps.weight < 1, 'winner formula up, loser down')
  assert.ok(rf.weight < 1.6, 'two results must not max out the weight (smoothing)')
  assert.equal(insight.totals.winners, 2)

  // ---- feedback into planning ----
  const input = {
    productId: product.id,
    mode: 'auto' as const,
    formulaIds: ['builtin:result_first', 'builtin:problem_solution'],
    count: 6,
    language: 'en-US' as const,
    voice: 'en-US-JennyNeural',
    outDir: join(process.env.VIDEOGENERATE_DATA_DIR!, 'out'),
    keepOriginalAudio: false,
    allowAiClips: true,
    hookLines: ['Hook {product}'],
    bodyLines: ['Body line.'],
    ctaLines: ['Tap the cart!'],
  }
  const learnedPreview = await mixStudioService.preview(input)
  console.log('learned', learnedPreview.learned)
  const shares = new Map(learnedPreview.learned!.formulaShares.map((f) => [f.formulaId, f.count]))
  assert.ok(shares.get('builtin:result_first')! > shares.get('builtin:problem_solution')!, 'winner formula gets more videos')
  assert.ok(shares.get('builtin:problem_solution')! >= 1, 'loser keeps at least one exploration slot')

  const neutral = await mixStudioService.preview({ ...input, useInsights: false })
  assert.equal(neutral.learned, undefined)

  // Winner remake: same formula and pinned opener.
  const remake = await mixStudioService.preview({ ...input, count: 3, winnerOf: 't1' })
  assert.ok(remake.drafts.every((d) => d.formulaId === 'builtin:result_first'))
  assert.ok(remake.drafts.every((d) => d.shots[0]!.clipId === hookClip.id), 'winner opener pinned')
  console.log('OK')
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
