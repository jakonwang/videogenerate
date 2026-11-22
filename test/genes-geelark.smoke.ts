import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { configureAppPathRuntime } from '../src/main/lib/paths'
import { aggregateGenes, geneGuidance, measuredGenes, parseGenes, GENE_AI_SYSTEM } from '../src/shared/creativeGenes'
import { filterKnownProducts, geelarkAccountUid, geelarkFailText, geelarkTaskState, isGeelarkAccount, isManualProductTitle, parseGeelarkAccountUid } from '../src/shared/geelark'

function geneTests() {
  assert.deepEqual(measuredGenes({ durationSec: 12, cutCount: 10 }), { length: 'under15', pace: 'fast' })
  assert.deepEqual(measuredGenes({ durationSec: 45, cutCount: 5 }), { length: 's30to60', pace: 'slow' })
  assert.match(GENE_AI_SYSTEM, /pain_point/)
  assert.deepEqual(parseGenes('x {"hook":"pain_point","delivery":"voiceover","subtitle":"weird","person":"hands","cta":"yes","sellingOrder":"材质 → 价格"} y'),
    { hook: 'pain_point', delivery: 'voiceover', person: 'hands', cta: 'yes', sellingOrder: '材质 → 价格' }, 'unknown values are dropped')
  assert.equal(parseGenes('{"hook":"nope"}'), null)
  assert.equal(parseGenes('not json'), null)

  const report = aggregateGenes('earrings', [
    { creativeId: 'a', genes: { hook: 'pain_point', pace: 'fast' }, spend: 100, revenue: 400, orders: 10 },
    { creativeId: 'b', genes: { hook: 'pain_point', pace: 'fast' }, spend: 100, revenue: 300, orders: 8 },
    { creativeId: 'c', genes: { hook: 'unboxing', pace: 'fast' }, spend: 100, revenue: 150, orders: 3 },
    { creativeId: 'd', genes: { hook: 'unboxing', pace: 'medium' }, spend: 100, revenue: 150, orders: 3 },
    { creativeId: 'e', genes: { hook: 'question', pace: 'slow' }, spend: 50, revenue: 500, orders: 9 },
    { creativeId: 'f', genes: { hook: 'question' }, spend: 0, revenue: 0, orders: 0 },
  ])
  assert.equal(report.analyzed, 6)
  assert.equal(report.measured, 5)
  assert.equal(report.avgRoi, 3.33)
  const hook = report.dimensions.find((d) => d.dimension === 'hook')!
  assert.equal(hook.values[0]!.value, 'question', 'sorted by ROI')
  assert.equal(hook.best!.value, 'pain_point', 'a single sample never wins: question has 1 creative')
  assert.equal(hook.best!.lift, 0.05)
  const pace = report.dimensions.find((d) => d.dimension === 'pace')!
  assert.equal(pace.best, undefined, 'only one eligible value → nothing to compare')
  assert.deepEqual(report.bestRecipe.map((row) => row.value), ['pain_point'])
  assert.match(geneGuidance(report), /开头方式=痛点开头 \(ROI 3\.5, \+5%/)
  assert.equal(geneGuidance(aggregateGenes('x', [])), '')
}

function geelarkTests() {
  // Products for cloud-phone accounts: search known shop products, or paste an ID.
  const known = [{ id: '1729000000001', title: 'Pearl Earrings' }, { id: '1729000000002', title: 'Gold Ring' }]
  assert.deepEqual(filterKnownProducts(known, 'pearl').map((item) => item.id), ['1729000000001'])
  assert.deepEqual(filterKnownProducts(known, '000002').map((item) => item.id), ['1729000000002'])
  assert.equal(filterKnownProducts(known).length, 2)
  const typed = filterKnownProducts(known, ' 1731234567890 ')
  assert.deepEqual(typed.map((item) => [item.id, item.title]), [['1731234567890', '商品 ID 1731234567890']])
  assert.ok(isManualProductTitle(typed[0]!.title))
  assert.equal(filterKnownProducts(known, '1729000000001').length, 1, 'a known ID is not duplicated as manual')
  const uid = geelarkAccountUid('5213214343124321', 'youtube')
  assert.equal(uid, 'geelark:5213214343124321:youtube')
  assert.deepEqual(parseGeelarkAccountUid(uid), { phoneId: '5213214343124321', platform: 'youtube' })
  assert.equal(parseGeelarkAccountUid('geelark:1:myspace'), null)
  assert.equal(isGeelarkAccount('7123456789'), false, 'CreatOK connection uids are not GeeLark')
  assert.equal(geelarkTaskState(3), 'published')
  assert.equal(geelarkTaskState(4), 'failed')
  assert.equal(geelarkTaskState(99), null)
  assert.match(geelarkFailText(20002, 'busy'), /正在执行别的任务/)
}

async function moduleTests() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'videogen-genes-'))
  process.env.VIDEOGENERATE_DATA_DIR = root
  configureAppPathRuntime({ dataDir: root, userDataDir: root })
  try {
    const { geelarkAuthHeaders, buildGeelarkPublishRequest } = await import('../src/main/modules/tiktok-publisher/geelark')
    const headers = geelarkAuthHeaders({ appId: 'APP', apiKey: 'KEY' }, 'ABCDEF123456', 1_700_000_000_000)
    assert.equal(headers.nonce, 'ABCDEF')
    assert.equal(headers.sign, createHash('sha256').update('APPABCDEF1234561700000000000ABCDEFKEY').digest('hex').toUpperCase())
    assert.equal(geelarkAuthHeaders({ accessToken: 'tok' }, 'T').Authorization, 'Bearer tok')

    const base = { id: 't', sourceVideoPath: 'v.mp4', operationId: 'o', idempotencyKey: 'k', state: 'draft' as const, createdAt: 0, updatedAt: 0, videoTitle: 'Pearl earrings', description: 'So pretty #earrings', scheduleAt: '2030-01-01T00:00:00Z' }
    const tiktok = buildGeelarkPublishRequest({ ...base, connectionUid: geelarkAccountUid('P1', 'tiktok'), productId: '1729', productTitle: 'Pearl' }, 'https://x/v.mp4', 0)
    assert.equal(tiktok.path, '/open/v1/task/add')
    const item = (tiktok.body.list as any[])[0]
    assert.deepEqual([item.envId, item.video, item.productId, item.productTitle, item.scheduleAt], ['P1', 'https://x/v.mp4', '1729', 'Pearl', Date.parse('2030-01-01T00:00:00Z') / 1000])
    assert.equal(item.videoDesc, 'Pearl earrings\nSo pretty #earrings')
    const manual = buildGeelarkPublishRequest({ ...base, connectionUid: geelarkAccountUid('P1', 'tiktok'), productId: '1731234567890', productTitle: '商品 ID 1731234567890' }, 'u', 0)
    const manualItem = (manual.body.list as any[])[0]
    assert.equal(manualItem.productId, '1731234567890')
    assert.equal(manualItem.productTitle, undefined, 'the placeholder name is never sent as the product link text')
    const manualWithLink = buildGeelarkPublishRequest({ ...base, connectionUid: geelarkAccountUid('P1', 'tiktok'), productId: '1731234567890', productTitle: '商品 ID 1731234567890', productLinkTitle: 'Pearl studs' }, 'u', 0)
    assert.equal((manualWithLink.body.list as any[])[0].productTitle, 'Pearl studs')
    const yt = buildGeelarkPublishRequest({ ...base, connectionUid: geelarkAccountUid('P1', 'youtube') }, 'u', 0)
    assert.deepEqual([yt.path, yt.body.id, yt.body.title, yt.body.sameStyleVoice, yt.body.originalVoice], ['/open/v1/rpa/task/youtubePubShort', 'P1', 'Pearl earrings', 0, 100])
    const ig = buildGeelarkPublishRequest({ ...base, connectionUid: geelarkAccountUid('P1', 'instagram') }, 'u', 0)
    assert.deepEqual([ig.path, ig.body.video], ['/open/v1/rpa/task/instagramPubReels', ['u']])
    const fb = buildGeelarkPublishRequest({ ...base, connectionUid: geelarkAccountUid('P1', 'facebook'), scheduleAt: undefined }, 'u', 5_000)
    assert.deepEqual([fb.path, fb.body.scheduleAt], ['/open/v1/rpa/task/faceBookPubReels', 5])

    // Gene analysis pipeline: real ffmpeg (frames, scene cuts), stubbed download / AI / speech.
    const { runFfmpeg } = await import('../src/main/modules/ffmpeg/runner')
    const { productsRepo } = await import('../src/main/modules/products/repo')
    const { creativeGenes, setGeneTestDependencies, categoryGeneGuidance } = await import('../src/main/modules/content-hub/creativeGenes')
    const video = path.join(root, 'ad.mp4')
    await runFfmpeg({ args: ['-y', '-f', 'lavfi', '-i', 'testsrc=size=360x640:rate=25:duration=8', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', video] })
    const product = await productsRepo.upsert({ name: '珍珠耳环', type: 'earring' })
    await productsRepo.upsert({ id: product.id, name: product.name, type: product.type, tiktokProductIds: ['TT-1'] })
    const creatives = [
      { creativeId: '1000000001', productId: 'TT-1', spend: 100, revenue: 400, orders: 10 },
      { creativeId: '1000000002', productId: 'TT-1', spend: 90, revenue: 300, orders: 8 },
      { creativeId: '1000000003', productId: 'TT-1', spend: 80, revenue: 100, orders: 2 },
      { creativeId: '1000000004', productId: 'TT-1', spend: 70, revenue: 90, orders: 2 },
      { creativeId: 'product-card:TT-1', productId: 'TT-1', spend: 500, revenue: 900, orders: 30 },
    ]
    const hookFor: Record<string, string> = { '1000000001': 'pain_point', '1000000002': 'pain_point', '1000000003': 'unboxing', '1000000004': 'unboxing' }
    const seen: string[] = []
    let imagesSent = 0
    setGeneTestDependencies({
      creatives: () => creatives,
      productCategory: () => 'Earrings',
      download: async (creativeId) => { seen.push(creativeId); return creativeId === '1000000004' && seen.filter((id) => id === creativeId).length === 1 ? { error: 'network' } : { localVideoPath: video } },
      recognize: async () => [],
      ai: async ({ images }) => { imagesSent = images.length; return JSON.stringify({ hook: hookFor[seen[seen.length - 1]!], delivery: 'voiceover', subtitle: 'plain', person: 'hands', cta: 'yes', sellingOrder: '材质 → 价格' }) },
    })
    let before = await creativeGenes.report(product.id)
    assert.equal(before.report, null)
    assert.equal(before.pending, 4, 'product-card traffic is not a video and is skipped')
    await creativeGenes.analyze(product.id)
    await creativeGenes.idle(product.id)
    const job = creativeGenes.job(product.id)!
    assert.deepEqual([job.total, job.done, job.failed], [4, 4, 1])
    assert.equal(imagesSent, 4, 'four frames go to the AI')
    const after = await creativeGenes.report(product.id)
    assert.equal(after.pending, 0, 'a failed download waits a day before it is retried')
    assert.equal(after.report!.category, 'earrings')
    assert.equal(after.report!.analyzed, 3)
    const delivery = after.report!.dimensions.find((d) => d.dimension === 'delivery')!.values[0]!
    assert.equal(delivery.value, 'music_only', 'no speech recognised → not voiceover')
    assert.ok(after.report!.dimensions.find((d) => d.dimension === 'length')!.values[0]!.value === 'under15')
    // 3 analyzed: pain_point x2 (ROI 3.68), unboxing x1 → too few to compare yet
    assert.equal(after.report!.bestRecipe.length, 0)
    assert.equal(await categoryGeneGuidance(product.id), '')
  } finally {
    await rm(root, { recursive: true, force: true }).catch(() => undefined)
  }
}

async function main() {
  geneTests()
  geelarkTests()
  await moduleTests()
  console.log('genes-geelark smoke passed')
  process.exit(0)
}
main().catch((error) => { console.error(error); process.exit(1) })
