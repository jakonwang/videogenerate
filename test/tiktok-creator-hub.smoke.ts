import assert from 'node:assert/strict'
import path from 'node:path'
import { readFile } from 'node:fs/promises'
import { parseCookieEditorJson } from '../src/main/modules/tiktok-creator-hub/cookies'
import { parseSamplePage, stageOf } from '../src/main/modules/tiktok-creator-hub/sampleParser'
import { classifySample, creatorStats, sampleCost, sampleDeadline, summarize } from '../src/shared/creatorHubFulfillment'
import type { CreatorHubCreatorPerf, CreatorHubOrder, CreatorHubProductCost, CreatorHubSample, CreatorHubVideo } from '../src/shared/creatorHub'
import { analyticsWindow, creatorListBody, orderListBody, parseCreatorPage, parseOrderPage, parseVideoPage, videoListBody } from '../src/main/modules/tiktok-creator-hub/analyticsParser'
import { buildCrm, buildOverview, creatorScore, linkVideosToSamples, orderSummary, tierOf } from '../src/shared/creatorHubAnalytics'
import { readdir } from 'node:fs/promises'
import { CREATOR_HUB_DEFAULT_SETTINGS } from '../src/shared/creatorHub'

const DAY = 86_400_000
const NOW = Date.UTC(2026, 10, 15)

function testCookies() {
  const future = NOW / 1000 + 30 * 86400
  const parsed = parseCookieEditorJson(JSON.stringify([
    { domain: '.tiktok.com', name: 'sessionid', value: 'abc', path: '/', secure: true, httpOnly: true, sameSite: 'no_restriction', expirationDate: future, hostOnly: false },
    { domain: 'affiliate.tiktok.com', name: 'host_only', value: '1', path: '/', secure: false, sameSite: 'no_restriction', hostOnly: true, session: true },
    { domain: '.google.com', name: 'NID', value: 'x', path: '/' },
    { domain: '.tiktok.com', name: 'old', value: 'x', path: '/', expirationDate: NOW / 1000 - 10 },
  ]), NOW)
  assert.equal(parsed.cookies.length, 2)
  assert.equal(parsed.skipped, 2, 'foreign and expired cookies are dropped')
  assert.equal(parsed.hasSession, true)
  assert.equal(parsed.expiresAt, future * 1000)
  const [session, hostOnly] = parsed.cookies
  assert.equal(session.url, 'https://tiktok.com/')
  assert.equal(session.domain, '.tiktok.com')
  assert.equal(session.sameSite, 'no_restriction')
  assert.equal(hostOnly.domain, undefined, 'host-only cookies keep no domain attribute')
  assert.equal(hostOnly.sameSite, 'unspecified', 'SameSite=None requires secure')
  assert.equal(hostOnly.expirationDate, undefined, 'session cookies stay session cookies')

  assert.throws(() => parseCookieEditorJson('not json'), /COOKIE_JSON_INVALID/)
  assert.throws(() => parseCookieEditorJson('[{"domain":".google.com","name":"a","value":"b"}]'), /COOKIE_EMPTY/)
  assert.equal(parseCookieEditorJson('{"cookies":[{"domain":".tiktok.com","name":"ttwid","value":"1"}]}').hasSession, false)
}

function testSampleParser() {
  const payload = {
    code: 0,
    has_more: true,
    total_count: 2671,
    agg_info: [
      {
        apply_deatil: {
          apply_info: {
            apply_id: '807186146389508295', product_id: 'P1', product_title: 'Earring', sku_id: 'S1', sku_desc: 'Default', commission_rate: '1000',
            curr_status: 100, main_order_id: '587073427565283277', create_time: '1794156513909', fulfillment_expire_time: '1795490011817', source_type: 1, overdue: false,
            standard_commission: { commission_type: 1, fixed_commission_rate: 1000 },
          },
          creator_info: { creator_id: 'C1', name: 'mebishop00', nick_name: 'MeBiShop', follower_num: '2926', fulfillment_rate: '95.97%', avatar_url: 'https://x/avatar' },
        },
      },
      { apply_deatil: { apply_info: { apply_id: 'A2', curr_status: 52, main_order_id: '0', create_time: '1794083553' }, creator_info: { creator_id: 'C2', name: 'b' } } },
      { apply_deatil: { apply_info: {} } },
    ],
  }
  const page = parseSamplePage(payload, 'shop-1', NOW)
  assert.equal(page.hasMore, true)
  assert.equal(page.total, 2671)
  assert.equal(page.rows.length, 2, 'rows without apply_id are skipped')
  const [first, second] = page.rows
  assert.equal(first.id, 'shop-1:807186146389508295')
  assert.equal(first.stage, 'completed')
  assert.equal(first.hasSampleOrder, true)
  assert.equal(first.commissionRate, 0.1)
  assert.equal(first.followers, 2926)
  assert.ok(Math.abs((first.platformFulfillmentRate || 0) - 0.9597) < 1e-9)
  assert.equal(first.createdAt, 1794156513909)
  assert.equal(second.stage, 'cancelled')
  assert.equal(second.hasSampleOrder, false, 'main_order_id "0" means no sample order')
  assert.equal(second.createdAt, 1794083553000, 'second timestamps are normalised to ms')
  assert.equal(stageOf(40), 'awaiting_content')
  assert.equal(stageOf(10), 'pending_review')
  assert.equal(stageOf(61), 'cancelled', 'closed after shipping')
  assert.equal(stageOf(99), 'unknown')
  assert.throws(() => parseSamplePage({ code: 1001, message: 'no permission' }, 'shop-1'), /SAMPLE_API_ERROR:1001/)
}

function sample(partial: Partial<CreatorHubSample>): CreatorHubSample {
  return {
    id: `s:${Math.random()}`, shopId: 'shop-1', applyId: 'A', creatorId: 'C1', creatorHandle: 'c1', creatorNickname: 'C1', followers: 100,
    productId: 'P1', productTitle: 'P', skuId: 'S1', status: 40, stage: 'awaiting_content', hasSampleOrder: true, createdAt: NOW - 10 * DAY,
    platformOverdue: false, firstSeenAt: NOW, syncedAt: NOW, ...partial,
  }
}

function testFulfillment() {
  const settings = CREATOR_HUB_DEFAULT_SETTINGS // 30 + 7 days
  assert.equal(sampleDeadline(sample({ createdAt: NOW }), settings), NOW + 37 * DAY)

  const samples = [
    sample({ creatorId: 'C1', stage: 'completed', status: 100, createdAt: NOW - 60 * DAY }), // fulfilled
    sample({ creatorId: 'C1', stage: 'awaiting_content', createdAt: NOW - 40 * DAY }), // overdue (40 > 37)
    sample({ creatorId: 'C1', stage: 'awaiting_content', createdAt: NOW - 10 * DAY }), // pending
    sample({ creatorId: 'C1', stage: 'cancelled', status: 53, hasSampleOrder: true, createdAt: NOW - 50 * DAY }), // shipped then closed without content -> overdue
    sample({ creatorId: 'C1', stage: 'cancelled', status: 52, hasSampleOrder: false, createdAt: NOW - 50 * DAY }), // rejected -> excluded
    sample({ creatorId: 'C1', stage: 'pending_review', status: 10, hasSampleOrder: false }), // not shipped
    sample({ creatorId: 'C2', stage: 'awaiting_content', createdAt: NOW - 5 * DAY, productId: 'P2' }), // pending only
  ]
  assert.deepEqual(samples.map((item) => classifySample(item, settings, NOW)), ['fulfilled', 'overdue', 'pending', 'overdue', 'excluded', 'not_shipped', 'pending'])

  const costs: CreatorHubProductCost[] = [{ id: 'shop-1:P1:*', shopId: 'shop-1', productId: 'P1', unitCost: 30000, shippingCost: 15000, updatedAt: NOW }]
  assert.equal(sampleCost(samples[0], new Map(costs.map((c) => [c.id, c]))), 45000)
  assert.equal(sampleCost({ ...samples[0], costOverride: 1000 }, new Map(costs.map((c) => [c.id, c]))), 1000)

  const stats = creatorStats(samples, costs, settings, NOW)
  const c1 = stats.find((item) => item.creatorId === 'C1')!
  assert.equal(c1.applications, 6)
  assert.equal(c1.shipped, 4)
  assert.equal(c1.fulfilled, 1)
  assert.equal(c1.overdue, 2)
  assert.equal(c1.pending, 1)
  assert.ok(Math.abs((c1.fulfillmentRate || 0) - 1 / 3) < 1e-9)
  assert.equal(c1.sampleCost, 4 * 45000)
  const c2 = stats.find((item) => item.creatorId === 'C2')!
  assert.equal(c2.fulfillmentRate, undefined, 'nothing due yet')
  assert.equal(c2.missingCost, 1)

  const total = summarize(stats)
  assert.equal(total.creators, 2)
  assert.equal(total.shipped, 5)
  assert.ok(Math.abs((total.fulfillmentRate || 0) - 1 / 3) < 1e-9)
}

function testAnalyticsParsers() {
  // VN is UTC+7: on 2026-11-15 03:00 UTC (10:00 local) the window ends at 2026-11-14 00:00 local.
  const window = analyticsWindow(28, 'VN', Date.UTC(2026, 10, 15, 3))
  assert.equal(window.end, Date.UTC(2026, 10, 13, 17))
  assert.equal(window.end - window.start, 28 * DAY)
  const videoBody = videoListBody(window, 'VN', 2) as any
  assert.equal(videoBody.module_type, 501)
  assert.equal(videoBody.params.video_list_params_v2[0].time_descriptor.timezone_offset, 25200)
  assert.equal(videoBody.params.video_list_params_v2[0].page_param.page_no, 2)
  const creatorBody = creatorListBody(window, 'VN', 1) as any
  assert.equal(creatorBody.params.detail_list_type, 1)
  assert.equal(creatorBody.params.creator_list_params[0].previous_period_time_descriptor.end_time, window.start / 1000)
  assert.equal((orderListBody(window, 'abc') as any).cursor, 'abc')
  assert.equal((orderListBody(window) as any).cursor, undefined)

  const money = (amount: number) => ({ amount: String(amount), currency_code: 'VND' })
  const count = (value: number) => ({ value: String(value) })
  const videos = parseVideoPage({
    code: 0,
    data: { video_list_segments_v2: [{ total: 1821, video_performances: [
      {
        video_info: { item_id: 'V1', title: 'Earrings', cover: { thumb_url_list: ['https://x/c.jpg'] }, create_time: '1789525677000' },
        creator_base: { oec_id: 'C1', handle_name: 'alice', nick_name: 'Alice', follower_cnt: '6525' },
        video_metrics: { video_gmv: money(220120), video_orders_cnt: count(5), video_views_cnt: count(583), video_finish_rate: { value: '0.1012' }, video_distinct_product_ctr: { value: '0.1059' }, video_distinct_gpm: money(358502), video_estimated_commission: money(19012) },
        product_ids: ['P1'], product_base_list: [{ id: 'P1', title: 'Star earrings' }],
      },
      { video_info: {}, creator_base: {} },
    ] }] },
  }, 'shop-1', window, NOW)
  assert.equal(videos.total, 1821)
  assert.equal(videos.rows.length, 1)
  const [video] = videos.rows
  assert.equal(video.id, 'shop-1:V1')
  assert.equal(video.gmv, 220120)
  assert.equal(video.orders, 5)
  assert.equal(video.views, 583)
  assert.equal(video.finishRate, 0.1012)
  assert.equal(video.cover, 'https://x/c.jpg')
  assert.deepEqual(video.productIds, ['P1'])
  assert.equal(video.postedAt, 1789525677000)
  assert.throws(() => parseVideoPage({ code: 98001, message: 'no auth' }, 's', window), /CREATOR_HUB_API_VIDEOS:98001/)

  const creators = parseCreatorPage({
    code: 0,
    data: { creator_list_segments: [{ total: 1338, creator_performances: [{
      creator_base: { oec_id: 'C1', handle_name: 'alice', nick_name: 'Alice', follower_cnt: '6525' },
      creator_metrics: { creator_gmv: money(500000), creator_refunded_gmv: money(50000), creator_estimated_commission: money(50000), creator_orders_cnt: count(10), creator_video_cnt: count(4), creator_live_cnt: count(1), creator_samples_shipped_cnt: count(2) },
      previous_period_creator_metrics: { creator_gmv: money(400000), creator_orders_cnt: count(8) },
    }] }] },
  }, 'shop-1', window, NOW)
  assert.equal(creators.total, 1338)
  assert.equal(creators.rows[0].metrics.gmv, 500000)
  assert.equal(creators.rows[0].metrics.videos, 4)
  assert.equal(creators.rows[0].previous?.gmv, 400000)

  const orders = parseOrderPage({
    code: 0,
    data: { has_more: true, next_cursor: 'cur-2', total_count: 11676, sku_order_list: [{
      sku_order_base_info_for_affiliate_seller: {
        creator_info: { creator_oec_id: 'C1', creator_username: 'alice', creator_nickname: 'Alice' },
        product_info: { product_id: 'P1', product_name: 'Star earrings' },
        sku_order_info: { main_order_id: 'O1', sku_id: 'S1', create_time: 1794707736374, sale_price: { amount: '29200', currency: 'VND' }, sale_quantity: 2, refund_number: 0, return_number: 0, settlement_status: 300, settlement_time: 0, promotion_position_info: { promotion_id: 'V1', promotion_type: 2 } },
      },
      sku_order_commission_info_for_affiliate_seller: { est_commission_base: { amount: '58400' }, est_standard_commission: { amount: '5840' }, standard_cos_ratio: '10%', est_shop_ads_commission: { amount: '1752' }, shop_ads_cos_ratio: '3%' },
    }] },
  }, 'shop-1', NOW)
  assert.equal(orders.hasMore, true)
  assert.equal(orders.cursor, 'cur-2')
  const [order] = orders.rows
  assert.equal(order.id, 'shop-1:O1:S1')
  assert.equal(order.amount, 58400)
  assert.equal(order.contentType, 'video')
  assert.equal(order.contentId, 'V1')
  assert.equal(order.estCommission, 5840)
  assert.equal(order.standardRate, 0.1)
  assert.equal(order.settledAt, undefined)
  assert.equal(order.productId, 'P1')
}

function testAnalytics() {
  const settings = CREATOR_HUB_DEFAULT_SETTINGS
  const window = { start: NOW - 28 * DAY, end: NOW }
  const samples = [
    sample({ id: 'shop-1:A1', creatorId: 'C1', creatorHandle: 'alice', productId: 'P1', stage: 'completed', status: 100, createdAt: NOW - 50 * DAY }),
    sample({ id: 'shop-1:A2', creatorId: 'C2', creatorHandle: 'bob', productId: 'P2', stage: 'awaiting_content', createdAt: NOW - 45 * DAY }),
    sample({ id: 'shop-1:A3', creatorId: 'C2', creatorHandle: 'bob', productId: 'P2', stage: 'pending_review', status: 10, hasSampleOrder: false, createdAt: NOW - DAY }),
  ]
  const baseVideo = (partial: Partial<CreatorHubVideo>): CreatorHubVideo => ({
    id: 'shop-1:V', shopId: 'shop-1', itemId: 'V', title: '', postedAt: NOW - 40 * DAY, creatorId: 'C1', creatorHandle: 'alice', creatorNickname: 'Alice', followers: 1,
    productIds: ['P1'], productTitles: [], gmv: 0, orders: 0, itemsSold: 0, views: 0, likes: 0, comments: 0, shares: 0, refundedGmv: 0, refundedItems: 0, commission: 0,
    gpm: 0, aov: 0, productImpressions: 0, productClicks: 0, window, syncedAt: NOW, ...partial,
  })
  const videos = [
    baseVideo({ id: 'shop-1:V1' }), // alice, P1, after the sample -> linked
    baseVideo({ id: 'shop-1:V2', postedAt: NOW - 60 * DAY }), // before the application -> not linked
    baseVideo({ id: 'shop-1:V3', productIds: ['P9'] }), // other product -> not linked
    baseVideo({ id: 'shop-1:V4', creatorId: 'other-id', creatorHandle: 'ALICE' }), // id differs, handle matches -> linked
  ]
  const links = linkVideosToSamples(videos, samples)
  assert.equal(links.get('shop-1:V1'), 'shop-1:A1')
  assert.equal(links.has('shop-1:V2'), false)
  assert.equal(links.has('shop-1:V3'), false)
  assert.equal(links.get('shop-1:V4'), 'shop-1:A1')

  assert.equal(creatorScore({ fulfillmentRate: 1, gmvRank: 1, posts: 8, refundRate: 0 }), 100)
  assert.equal(creatorScore({ posts: 0 }), 30, 'unknown fulfilment counts as 50%, no refunds as full')
  assert.equal(tierOf(75), 'A')
  assert.equal(tierOf(74), 'B')
  assert.equal(tierOf(34), 'D')

  const metrics = (gmv: number, extra: Partial<CreatorHubCreatorPerf['metrics']> = {}) => ({ gmv, refundedGmv: 0, commission: gmv / 10, orders: 1, itemsSold: 1, refundedItems: 0, videos: 0, lives: 0, samplesShipped: 0, sampleContent: 0, views: 0, videoGmv: 0, liveGmv: 0, productCardGmv: 0, ...extra })
  const perf: CreatorHubCreatorPerf[] = [
    { id: 'shop-1:C1', shopId: 'shop-1', creatorId: 'C1', creatorHandle: 'alice', creatorNickname: 'Alice', followers: 1, metrics: metrics(900000, { videos: 8 }), previous: metrics(600000), window, syncedAt: NOW },
    { id: 'shop-1:C3', shopId: 'shop-1', creatorId: 'C3', creatorHandle: 'carol', creatorNickname: 'Carol', followers: 1, metrics: metrics(100000, { refundedGmv: 50000 }), previous: metrics(100000), window, syncedAt: NOW },
  ]
  const costs: CreatorHubProductCost[] = [{ id: 'shop-1:P1:*', shopId: 'shop-1', productId: 'P1', unitCost: 30000, shippingCost: 0, updatedAt: NOW }]
  const crm = buildCrm({ perf, samples, costs, profiles: [{ id: 'shop-1:C3', shopId: 'shop-1', creatorId: 'C3', tags: ['vip'], blocked: true, updatedAt: NOW }], settings, now: NOW })
  assert.equal(crm.length, 3, 'perf creators plus sample-only creator')
  const alice = crm.find((row) => row.creatorId === 'C1')!
  assert.equal(alice.fulfillmentRate, 1)
  assert.equal(alice.sampleRoi, 30)
  assert.equal(alice.score, 100)
  assert.equal(alice.tier, 'A')
  const bob = crm.find((row) => row.creatorId === 'C2')!
  assert.equal(bob.gmv, 0)
  assert.equal(bob.fulfillmentRate, 0)
  assert.equal(bob.tier, 'D')
  const carol = crm.find((row) => row.creatorId === 'C3')!
  assert.equal(carol.blocked, true)
  assert.deepEqual(carol.tags, ['vip'])
  assert.equal(carol.refundRate, 0.5)

  const orders: CreatorHubOrder[] = [{
    id: 'shop-1:O1:S1', shopId: 'shop-1', orderId: 'O1', skuId: 'S1', productId: 'P1', creatorId: 'C1', creatorHandle: 'alice', creatorNickname: 'Alice', contentType: 'video',
    createdAt: NOW - DAY, unitPrice: 100, quantity: 2, amount: 200, refundQuantity: 1, returnQuantity: 0, settlementStatus: 300, commissionBase: 200, estCommission: 20, estAdsCommission: 5, syncedAt: NOW,
  }]
  const overview = buildOverview({ shopIds: ['shop-1', 'shop-2'], perf, samples, costs, orders, settings, now: NOW })
  assert.equal(overview.shops.length, 2)
  assert.equal(overview.totals.gmv, 1000000)
  assert.equal(overview.totals.previousGmv, 700000)
  assert.equal(overview.totals.pendingReview, 1)
  assert.equal(overview.totals.overdueSamples, 1)
  assert.equal(overview.totals.productsMissingCost, 1, 'P2 was shipped without a cost')
  assert.deepEqual(overview.totals.sampleFunnel, { applications: 3, shipped: 2, fulfilled: 1, withSales: 1 })
  assert.equal(overview.totals.fulfillmentRate, 0.5)
  assert.equal(overview.shops.find((shop) => shop.shopId === 'shop-2')?.previousGmv, undefined)

  const summary = orderSummary(orders)
  assert.equal(summary.amount, 200)
  assert.equal(summary.refunded, 1)
}

async function testLocales() {
  const load = async (name: string) => JSON.parse(await readFile(path.join(process.cwd(), 'src/renderer/src/locales/creator-hub', `${name}.json`), 'utf8'))
  const [zh, en, vi] = await Promise.all([load('zh-CN'), load('en-US'), load('vi-VN')])
  const flat = (value: Record<string, unknown>, prefix = ''): string[] => Object.entries(value).flatMap(([key, item]) => (item && typeof item === 'object' ? flat(item as Record<string, unknown>, `${prefix}${key}.`) : [`${prefix}${key}`]))
  const zhKeys = flat(zh).sort()
  assert.deepEqual(flat(en).sort(), zhKeys)
  assert.deepEqual(flat(vi).sort(), zhKeys)
  assert.equal(/[^\x00-\x7F]/.test(JSON.stringify(vi)), false, 'vi-VN locale stays ASCII')
  for (const locale of [zh, en, vi]) assert.equal(/[@|]/.test(JSON.stringify(locale)), false, 'no vue-i18n special characters')

  const panelDir = path.join(process.cwd(), 'src/renderer/src/ui/views/creator-hub')
  const uiFiles = ['TiktokCreatorHubView.vue', ...(await readdir(panelDir)).filter((name) => name.endsWith('.vue')).map((name) => `creator-hub/${name}`)]
  const keySet = new Set(zhKeys)
  for (const file of uiFiles) {
    const source = await readFile(path.join(process.cwd(), 'src/renderer/src/ui/views', file), 'utf8')
    for (const match of source.matchAll(/t\('creatorHub\.([A-Za-z0-9_.]+)'/g)) assert.ok(keySet.has(match[1]), `${file}: missing locale key creatorHub.${match[1]}`)
  }
}

async function run() {
  testCookies()
  testSampleParser()
  testFulfillment()
  testAnalyticsParsers()
  testAnalytics()
  await testLocales()
  console.log('tiktok-creator-hub smoke: ok')
}

void run().catch((error) => {
  console.error(error)
  process.exit(1)
})
