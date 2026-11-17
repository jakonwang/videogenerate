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
import { discoverBody, parseDiscoverPage, parseProfile, profileBody } from '../src/main/modules/tiktok-creator-hub/discoverParser'
import { applyContactInput, extractContacts, mergeBioContact, normalizeVnPhone, renderTemplate, zaloLink, zaloNumber } from '../src/shared/creatorHubContacts'
import { bucketLowerBound, buildPool, logScale, poolScore } from '../src/shared/creatorHubDiscovery'
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

function testDiscovery() {
  const body = discoverBody({ shopId: 's1', keyword: '  bông tai ', categoryIds: ['605248', 'x'], followersMin: 5000, gmvGroups: [4, 9, 4], unitsGroups: [4], starOnly: true }, { page: 1, searchKey: 'k', nextItemCursor: 20 })
  assert.deepEqual(body, {
    query: 'bông tai',
    pagination: { size: 20, page: 1, search_key: 'k', next_item_cursor: 20 },
    filter_params: { category_list: [{ string_list: ['605248'] }], follower_filter: { left_bound: 5000, right_bound: -1 }, gmv_group_v2: [4], units_sold_group: [4], is_rising_star: true },
    algorithm: 1,
  })
  assert.deepEqual(discoverBody({ shopId: 's1' }).filter_params, {})

  const wrap = (value: unknown) => ({ value, is_authorized: true, status: 0 })
  const page = parseDiscoverPage({
    code: 0,
    next_pagination: { has_more: true, next_page: 1, search_key: 'abc', next_item_cursor: 20 },
    creator_profile_list: [
      {
        creator_oecuid: wrap('7001'), handle: wrap('jewel.vn'), nickname: wrap('Jewel'), avatar: wrap({ thumb_url_list: ['https://x/a.webp'] }),
        follower_cnt: wrap('12500'), creator_level: wrap(5), category: wrap([{ name: 'Fashion Accessories' }]),
        med_gmv_revenue: wrap({ value: '11436216.18', symbol: '₫' }), med_gmv_revenue_range: wrap('1M₫+'), units_sold: wrap('412'),
        ec_video_avg_view_cnt: wrap('5235'), ec_video_med_view_cnt: wrap('82'), video_engagement: wrap(77),
        top_follower_gender: wrap([{ key: 'Female', value: '3359' }]), top_follower_ages: wrap(['25-34']),
        has_invited_before_90d: wrap(true), has_collaborated: wrap(false), is_creator_blocked_by_shop: wrap(false), is_rising_star: wrap(false),
        sample_fulfillment_rate: { is_authorized: true, status: 0 },
        top_video_data: wrap([{ item_id: '9001', name: 'bông tai', play_cnt: 236014, like_cnt: 1008, comment_cnt: 33, release_date: '1787244677', video_products: [{ name: 'Earring' }] }]),
      },
      { creator_oecuid: wrap(''), handle: wrap('skip') },
    ],
  }, 's1', NOW)
  assert.equal(page.rows.length, 1, 'rows without an id are skipped')
  const [creator] = page.rows
  assert.equal(creator.id, 's1:7001')
  assert.equal(creator.gmv, 11436216.18)
  assert.equal(creator.engagementRate, 0.0077, 'engagement comes in basis points of a percent')
  assert.deepEqual(creator.topGender, { key: 'Female', share: 0.3359 })
  assert.equal(creator.invitedIn90d, true)
  assert.equal(creator.topVideos[0].postedAt, 1787244677000)
  assert.deepEqual(page.cursor, { page: 1, searchKey: 'abc', nextItemCursor: 20 })
  assert.throws(() => parseDiscoverPage({ code: 98001004, message: 'bad size' }, 's1'), /API_DISCOVER:98001004/)

  assert.equal(bucketLowerBound('1M₫+'), 1e6)
  assert.equal(bucketLowerBound('100K₫-500K₫'), 1e5)
  assert.equal(bucketLowerBound('11,4Tr ₫'), 11.4e6)
  assert.equal(bucketLowerBound(undefined), undefined)
  assert.equal(logScale(10, 10, 1000), 0)
  assert.equal(logScale(100, 10, 1000), 0.5)

  const neutral = poolScore(creator, { ourFulfilled: 0, ourOverdue: 0, ourGmv: 0 })
  assert.equal(neutral.parts.history, 13, 'no history counts as 50%')
  const reliable = poolScore(creator, { ourFulfilled: 4, ourOverdue: 0, ourGmv: 1 })
  const flaky = poolScore(creator, { ourFulfilled: 1, ourOverdue: 3, ourGmv: 0 })
  assert.equal(reliable.parts.history, 25)
  assert.ok(reliable.score > neutral.score && neutral.score > flaky.score)
  assert.equal(neutral.score, neutral.parts.sales + neutral.parts.content + neutral.parts.account + neutral.parts.history)

  const crm = buildCrm({
    perf: [], costs: [], settings: CREATOR_HUB_DEFAULT_SETTINGS, now: NOW,
    samples: [sample({ id: 's1:a1', shopId: 's1', creatorId: 'tt-1', creatorHandle: 'Jewel.VN', platformFulfillmentRate: 0.9 })],
    profiles: [],
  })
  assert.equal(crm[0].samplesShipped, 1)
  const pool = buildPool({ pool: [creator], crm, samples: [sample({ id: 's1:a1', shopId: 's1', creatorId: 'tt-1', creatorHandle: 'Jewel.VN', platformFulfillmentRate: 0.9 })], profiles: [{ id: 's1:7001', shopId: 's1', creatorId: '7001', tags: ['vip'], blocked: false, updatedAt: NOW }] })
  assert.equal(pool[0].ourSamples, 1, 'pool joins CRM rows by handle when ids differ')
  assert.equal(pool[0].platformFulfillmentRate, 0.9)
  assert.deepEqual(pool[0].tags, ['vip'])
}

function testContacts() {
  assert.equal(normalizeVnPhone('+84 912.345.678'), '0912345678')
  assert.equal(normalizeVnPhone('84912345678'), '0912345678')
  assert.equal(normalizeVnPhone('0212345678'), undefined, 'landlines / bad prefixes rejected')
  assert.equal(normalizeVnPhone('091234567'), undefined)

  assert.deepEqual(extractContacts('Trang sức xinh 💍 Zalo: 0912 345 678 | mail: Shop.Xinh@Gmail.com'), { email: 'shop.xinh@gmail.com', zalo: '0912345678' })
  assert.deepEqual(extractContacts('Hợp tác inbox\nzl 0987.654.321\nhotline 0901234567'), { zalo: '0987654321', phone: '0901234567' })
  assert.deepEqual(extractContacts('Liên hệ Zalo dưới bio\n+84 345 678 901'), { zalo: '0345678901' }, 'single number + zalo mention')
  assert.deepEqual(extractContacts('call 0345678901'), { phone: '0345678901' })
  assert.deepEqual(extractContacts('trang sức xuping, titan siêu bền không gỉ'), {})
  assert.deepEqual(extractContacts('order 1234567890123'), {}, 'long ids are not phones')

  assert.equal(zaloNumber({ phone: '0901234567' }), '0901234567', 'falls back to the phone')
  assert.equal(zaloLink('0912345678'), 'https://zalo.me/0912345678')
  assert.equal(renderTemplate('Chào {name} @{handle} từ {shop} {unknown}', { name: 'Lan', handle: 'lan.vn', shop: 'LUMÉE' }), 'Chào Lan @lan.vn từ LUMÉE {unknown}')

  const merged = mergeBioContact({ id: 's1:1', shopId: 's1', creatorId: '1', handle: 'a', zalo: '0911111111', status: 'contacted', log: [{ at: 1, channel: 'zalo' }], updatedAt: 1 }, { shopId: 's1', creatorId: '1', handle: 'a', bio: 'zalo 0922222222 mail a@b.co', contactInfoAvailable: true, now: 5 })
  assert.equal(merged.zalo, '0911111111', 'manual number is kept')
  assert.equal(merged.email, 'a@b.co')
  assert.equal(merged.status, 'contacted')
  assert.equal(merged.contactInfoAvailable, true)
  assert.equal(merged.bioFetchedAt, 5)

  const edited = applyContactInput(merged, { shopId: 's1', creatorId: '1', handle: 'a', zalo: '', phone: '+84 933 333 333', status: 'replied' }, 9)
  assert.equal(edited.zalo, undefined, 'empty string clears')
  assert.equal(edited.phone, '0933333333')
  assert.equal(edited.status, 'replied')
  assert.equal(edited.log.length, 1)
  assert.throws(() => applyContactInput(merged, { shopId: 's1', creatorId: '1', handle: 'a', zalo: '12345' }, 9), /PHONE_INVALID/)
  assert.throws(() => applyContactInput(merged, { shopId: 's1', creatorId: '1', handle: 'a', email: 'nope' }, 9), /EMAIL_INVALID/)

  assert.deepEqual(profileBody('7495576829382527265'), { creator_oec_id: '7495576829382527265', profile_types: [1] })
  assert.deepEqual(parseProfile({ code: 0, creator_profile: { bio: { value: 'zalo 0912345678' }, contact_info_available: { value: true }, handle: { value: 'x' } } }), { bio: 'zalo 0912345678', contactInfoAvailable: true, handle: 'x' })
  assert.throws(() => parseProfile({ code: 98001004 }), /API_PROFILE/)
}

async function run() {
  testCookies()
  testDiscovery()
  testContacts()
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
