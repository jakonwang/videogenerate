import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { configureAppPathRuntime } from '../src/main/lib/paths'
import { expandMatrixItems, friendlyPublishError, normalizeMatrixAccount, planMatrixSchedule } from '../src/shared/publishMatrix'
import { buildVariantVideoArgs, captionVariants, parseCaptionVariants, ruleCaptionVariant, videoVariantParams } from '../src/main/modules/tiktok-publisher/variants'

const MIN = 60_000
const at = (y: number, m: number, d: number, h: number, min = 0) => new Date(y, m - 1, d, h, min).getTime()
const fixed = () => 0 // no jitter, no randomness

function scheduleTests() {
  const start = at(2026, 11, 22, 10)
  const accounts = [normalizeMatrixAccount('a', { dailyLimit: 2, minGapMinutes: 120 }), normalizeMatrixAccount('b', { dailyLimit: 2, minGapMinutes: 120 })]
  const items = expandMatrixItems(['v1', 'v2', 'v3'], ['a', 'b'])
  assert.equal(items.length, 6)
  assert.deepEqual(items.filter((i) => i.sourceId === 'v1').map((i) => i.variantIndex), [0, 1])

  const { slots, skipped } = planMatrixSchedule({ items, accounts, startAt: start, random: fixed })
  assert.equal(skipped.length, 0)
  const forA = slots.filter((s) => s.uid === 'a').map((s) => s.at)
  const forB = slots.filter((s) => s.uid === 'b').map((s) => s.at)
  // gap respected
  assert.equal(forA[1] - forA[0], 120 * MIN)
  // daily limit 2 → third video goes to the next day at activeStartHour (9:00)
  assert.equal(forA[2], at(2026, 11, 23, 9))
  // accounts are staggered, never the same minute
  assert.notEqual(forA[0], forB[0])
  assert.equal(forB[0] - forA[0], 7 * MIN)

  // outside active hours → next morning
  const late = planMatrixSchedule({ items: [{ key: 'x', uid: 'a' }], accounts, startAt: at(2026, 11, 22, 23, 30), random: fixed })
  assert.equal(late.slots[0].at, at(2026, 11, 23, 9))

  // existing scheduled tasks count against the limit and the gap
  const busy = planMatrixSchedule({ items: [{ key: 'x', uid: 'a' }], accounts, existing: [{ uid: 'a', at: at(2026, 11, 22, 10) }, { uid: 'a', at: at(2026, 11, 22, 13) }], startAt: start, random: fixed })
  assert.equal(busy.slots[0].at, at(2026, 11, 23, 9))
  const gap = planMatrixSchedule({ items: [{ key: 'x', uid: 'a' }], accounts, existing: [{ uid: 'a', at: at(2026, 11, 22, 10, 30) }], startAt: start, random: fixed })
  assert.equal(gap.slots[0].at, at(2026, 11, 22, 12, 30))

  // paused and warming-up accounts
  const paused = planMatrixSchedule({ items: [{ key: 'x', uid: 'p' }], accounts: [normalizeMatrixAccount('p', { paused: true })], startAt: start, random: fixed })
  assert.deepEqual(paused.skipped.map((s) => s.reason), ['paused'])
  const warm = planMatrixSchedule({ items: [{ key: 'x', uid: 'w' }], accounts: [normalizeMatrixAccount('w', { warmupUntil: '2026-11-24' })], startAt: start, random: fixed })
  assert.equal(warm.slots[0].at, at(2026, 11, 25, 9))

  // jitter stays inside the active window
  const jittered = planMatrixSchedule({ items: [{ key: 'x', uid: 'a' }], accounts, startAt: at(2026, 11, 22, 22, 55), random: () => 0.99, jitterMinutes: 30 })
  assert.ok(jittered.slots[0].at < at(2026, 11, 22, 23))

  // settings are clamped
  const odd = normalizeMatrixAccount('z', { dailyLimit: 999, minGapMinutes: 1, activeStartHour: 20, activeEndHour: 5 })
  assert.equal(odd.dailyLimit, 50)
  assert.equal(odd.minGapMinutes, 10)
  assert.equal(odd.activeEndHour, 21)
}

async function variantTests() {
  assert.deepEqual(videoVariantParams(0), { zoom: 1, speed: 1, brightness: 0, contrast: 1, saturation: 1 })
  const p = videoVariantParams(3, () => 0.5)
  assert.ok(p.zoom > 1 && p.zoom < 1.07)
  assert.ok(Math.abs(p.speed - 1) <= 0.04)
  const args = buildVariantVideoArgs({ source: 'in.mp4', output: 'out.mp4', width: 1080, height: 1920, hasAudio: true, params: p, codec: 'libx264', encoderArgs: ['-preset', 'veryfast'] })
  const vf = args[args.indexOf('-vf') + 1]
  assert.match(vf, /crop=1080:1920/)
  assert.ok(!/hflip/.test(vf), 'never mirror: product text would read backwards')
  assert.ok(args.includes('-map_metadata'))
  assert.equal(args[args.indexOf('-af') + 1], `atempo=${p.speed}`)
  const silent = buildVariantVideoArgs({ source: 'in.mp4', output: 'out.mp4', width: 721, height: 1281, hasAudio: false, params: p, codec: 'libx264', encoderArgs: [] })
  assert.ok(silent.includes('-an'))
  assert.match(silent[silent.indexOf('-vf') + 1], /crop=722:1282/)

  const source = { videoTitle: 'Cute earrings', description: 'So pretty! #earrings #fashion #gift' }
  const rule = ruleCaptionVariant(source, 1, () => 0)
  assert.notEqual(rule.description, source.description)
  for (const tag of ['#earrings', '#fashion', '#gift']) assert.ok(rule.description!.includes(tag))
  assert.deepEqual(ruleCaptionVariant(source, 0), source)

  assert.deepEqual(parseCaptionVariants('noise {"variants":[{"title":"A","description":"B #x"}]} tail', 2), [{ videoTitle: 'A', description: 'B #x' }])
  assert.deepEqual(parseCaptionVariants('not json', 2), [])

  const viaAi = await captionVariants(source, 2, async () => '{"variants":[{"title":"New 1","description":"D1 #earrings"}]}')
  assert.equal(viaAi[0].videoTitle, 'New 1')
  assert.equal(viaAi[1].videoTitle, 'Cute earrings', 'missing AI variant falls back to the rule')
  const aiDown = await captionVariants(source, 1, async () => { throw new Error('offline') })
  assert.equal(aiDown.length, 1)

  assert.match(friendlyPublishError('TikTok Shop product is not selected'), /关联商品/)
  assert.match(friendlyPublishError('这条的变体视频还在生成中，生成完再提交'), /变体/)
}

async function distributeTests() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'videogen-publish-matrix-'))
  process.env.VIDEOGENERATE_DATA_DIR = root
  configureAppPathRuntime({ dataDir: root, userDataDir: root })
  try {
    // The record store normally runs in a bundled worker thread; keep it in memory under tsx.
    const { backgroundRecordStore } = await import('../src/main/lib/backgroundRecordStore')
    const memory = new Map<string, Map<string, any>>()
    const bucket = (ns: string) => memory.get(ns) || memory.set(ns, new Map()).get(ns)!
    Object.assign(backgroundRecordStore, {
      migrate: async () => ({ migrated: 0 }),
      list: async (ns: string) => { const items = [...bucket(ns).values()].map((v) => structuredClone(v)); return { items, total: items.length, offset: 0, limit: items.length } },
      get: async (ns: string, key: string) => structuredClone(bucket(ns).get(key) ?? null),
      upsert: async (ns: string, value: any) => { bucket(ns).set(String(value.id), structuredClone(value)); return value },
      upsertMany: async (ns: string, values: any[]) => { values.forEach((v) => bucket(ns).set(String(v.id), structuredClone(v))); return values },
      remove: async (ns: string, key: string) => bucket(ns).delete(key),
    })
    const { publishMatrixService, setPublishMatrixTestDependencies, assertVariantReady } = await import('../src/main/modules/tiktok-publisher/matrix')
    const { creatokPublisherRepo } = await import('../src/main/modules/tiktok-publisher/repo')
    const now = at(2026, 11, 22, 10)
    const rendered: number[] = []
    setPublishMatrixTestDependencies({
      now: () => now,
      ai: async () => '{"variants":[{"title":"T-b","description":"D-b #a"},{"title":"T-c","description":"D-c #a"}]}',
      renderVideo: async ({ taskId, index }) => { rendered.push(index); const out = path.join(root, `${taskId}.mp4`); await writeFile(out, 'x'); return out },
    })
    const video = path.join(root, 'source.mp4')
    await writeFile(video, 'x')
    await creatokPublisherRepo.upsert({ id: 's1', sourceVideoPath: video, operationId: 'o', idempotencyKey: 'k', state: 'draft', videoTitle: 'T', description: 'D #a', productId: 'p1', productTitle: 'Prod', createdAt: now, updatedAt: now })
    await publishMatrixService.saveAccounts([{ uid: 'c', paused: true }])

    await assert.rejects(publishMatrixService.distribute({ taskIds: ['s1'], accounts: [] }), /至少选一个/)
    const result = await publishMatrixService.distribute({ taskIds: ['s1'], accounts: [{ uid: 'a', name: 'A' }, { uid: 'b', name: 'B' }, { uid: 'c', name: 'C' }, { uid: 'd', name: 'D' }] })
    assert.equal(result.tasks.length, 3)
    assert.equal(result.created, 2)
    assert.deepEqual(result.skipped.map((s) => [s.name, s.reason]), [['C', 'paused']])
    assert.ok(Date.parse(result.firstAt!) >= now + 10 * MIN, 'leaves time for variants and CreatOK lead time')

    const source = await creatokPublisherRepo.get('s1')
    assert.equal(source!.connectionUid, 'a')
    assert.equal(source!.variant!.status, 'ready')
    const children = (await creatokPublisherRepo.list()).filter((t) => t.id !== 's1')
    assert.ok(children.every((t) => t.productId === 'p1' && t.matrixSourceId === 's1'))
    assert.throws(() => assertVariantReady(children[0]), /还在生成/)

    await publishMatrixService.idle()
    const done = (await creatokPublisherRepo.list()).filter((t) => t.id !== 's1').sort((x, y) => x.variant!.index - y.variant!.index)
    assert.deepEqual(rendered.sort(), [1, 2])
    assert.ok(done.every((t) => t.variant!.status === 'ready' && t.sourceVideoPath !== video))
    assert.deepEqual(done.map((t) => t.videoTitle), ['T-b', 'T-c'])
    assert.deepEqual(done.map((t) => t.connectionName), ['B', 'D'])
    assert.notEqual(done[0].idempotencyKey, 'k')

    // a failed variant can fall back to the original
    setPublishMatrixTestDependencies({ now: () => now, ai: undefined, renderVideo: async () => { throw new Error('ffmpeg boom') } })
    await creatokPublisherRepo.upsert({ id: 's2', sourceVideoPath: video, operationId: 'o2', idempotencyKey: 'k2', state: 'draft', createdAt: now, updatedAt: now })
    await publishMatrixService.distribute({ taskIds: ['s2'], accounts: [{ uid: 'a' }, { uid: 'b' }], captionVariants: false })
    await publishMatrixService.idle()
    const failed = (await creatokPublisherRepo.list()).find((t) => t.matrixSourceId === 's2' && t.id !== 's2')!
    assert.equal(failed.variant!.status, 'failed')
    assert.throws(() => assertVariantReady(failed), /ffmpeg boom/)
    await publishMatrixService.useOriginal([failed.id])
    const fixedTask = await creatokPublisherRepo.get(failed.id)
    assert.equal(fixedTask!.variant!.status, 'ready')
    assert.equal(fixedTask!.sourceVideoPath, video)

    // submitted videos cannot be distributed again
    await creatokPublisherRepo.upsert({ ...(await creatokPublisherRepo.get('s1'))!, state: 'published' })
    await assert.rejects(publishMatrixService.distribute({ taskIds: ['s1'], accounts: [{ uid: 'b' }] }), /已提交/)
  } finally {
    await rm(root, { recursive: true, force: true }).catch(() => undefined)
  }
}

async function main() {
  scheduleTests()
  await variantTests()
  await distributeTests()
  console.log('publish-matrix smoke passed')
  process.exit(0)
}
main().catch((error) => { console.error(error); process.exit(1) })
