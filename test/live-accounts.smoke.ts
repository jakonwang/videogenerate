import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { configureAppPathRuntime } from '../src/main/lib/paths'
import { parseCreator, parseRoomList, parseRoomProducts } from '../src/shared/liveAccounts'

const HOUR = 3_600_000
const DAY = 24 * HOUR
const NOW = 1795600000000

// 结构取自主播工作台的真实返回
const creator = (handle: string) => ({ code: 0, message: 'success', data: { handle: { language: 'en', region: 'VN', currency_code: 'VND', timezone_offset: 25200 }, meta: { handle, alias: handle, avatar: {} }, type: 3 } })
const room = (id: string, start: number, end: number, gmv = 3123560) => ({
  room_id: id, room_title: '', room_create_timestamp: String(start), room_finish_timestamp: String(end),
  analytics_metrics: [{ stats_type: 3, raw_value: `${gmv}.009973` }, { stats_type: 2, raw_value: '11' }, { stats_type: 20, raw_value: '2069' }, { stats_type: 23, raw_value: '44084' }],
})
const product = (id: string, name: string, sales: number, gmv: number) => ({ id, name, cover_url: 'https://x/y.jpg', exposure_cnt: 3013, click_through_rate: '0.11', paid_order_cnt: sales, gmv_local: { amount_formatted: '', amount: String(gmv), currency_code: 'VND' }, total_click_cnt: 333, paid_user_cnt: sales, add_shop_cart_cnt: 1, sales })

const PRODUCTS: Record<string, unknown[]> = {
  r1: [product('generic', '[Tặng hộp quà] Lắc Tay Dự Tiệc', 10, 2894560), product('p-d11', 'Dây chuyền nữ D-11', 4, 643320)],
  r2: [product('p-d11', 'Dây chuyền nữ D-11', 2, 300000), product('multi', 'Vào live chọn mẫu', 5, 500000), product('other-shop', 'Nhẫn nữ E-33', 1, 99000)],
}

async function main() {
  assert.deepEqual(parseCreator(creator('chainmagic')), { handle: 'chainmagic', name: 'chainmagic', region: 'VN', currency: 'VND' })
  assert.equal(parseCreator({ code: 401 }), null)
  assert.throws(() => parseRoomList({ code: 98001004, message: 'invalid params' }, 'a', 'VND'), /LIVE_API_98001004/)
  const list = parseRoomList({ code: 0, data: { room_level_detail_data: [room('r1', NOW - 5 * HOUR, NOW - 2 * HOUR)], total_count: 1 } }, 'a', 'VND')
  assert.deepEqual([list.rooms[0].gmv, list.rooms[0].sales, list.rooms[0].views, list.rooms[0].impressions], [3123560.009973, 11, 2069, 44084])
  assert.deepEqual(parseRoomProducts({ code: 0, data: { segments: [{ stats: PRODUCTS.r1 }] } }).map((item) => [item.productId, item.sales, item.gmv, item.clicks]), [['generic', 10, 2894560, 333], ['p-d11', 4, 643320, 333]])

  const root = await mkdtemp(path.join(os.tmpdir(), 'videogen-live-'))
  process.env.VIDEOGENERATE_DATA_DIR = root
  configureAppPathRuntime({ dataDir: root, userDataDir: root })
  try {
    const { liveAccountsService, setLiveAccountsTestDependencies } = await import('../src/main/modules/live-accounts/service')
    let now = NOW
    let handle = 'chainmagic'
    let loggedOut = false
    const rooms = [room('r1', NOW - 5 * HOUR, NOW - 2 * HOUR), room('r2', NOW - 10 * DAY, NOW - 10 * DAY + 3 * HOUR), room('live-now', NOW - HOUR, 0)]
    const calls: string[] = []
    const cleared: string[] = []
    const sku = (shopKey: string, productId: string, skuId: string, productName: string, sellerSku: string) => ({ id: `${shopKey}:${skuId}`, shopKey, productId, skuId, productName, skuName: '', sellerSku, stockTotal: 1, stockAvailable: 1, updatedAt: 1 })
    setLiveAccountsTestDependencies({
      now: () => now,
      delay: async () => undefined,
      replaceCookies: async () => undefined,
      clearSession: async (id) => { cleared.push(id) },
      session: async () => ({
        open: async () => { if (loggedOut) throw new Error('LIVE_LOGIN_REQUIRED') },
        close: () => undefined,
        api: async (url, body: any) => {
          calls.push(url.split('/').pop()!)
          if (url.endsWith('creator/info')) return creator(handle)
          if (url.endsWith('detail_performance/list')) return { code: 0, data: { room_level_detail_data: body.page_number === 1 ? rooms : [], total_count: rooms.length } }
          return { code: 0, data: { segments: [{ stats: PRODUCTS[body.request.room_filter.room_id] || [] }] } }
        },
      }),
      match: async () => ({
        skus: [
          sku('s1', 'generic', 'g1', '[Tặng hộp quà] Lắc Tay', ''), sku('s1', 'generic', 'g2', '[Tặng hộp quà] Lắc Tay', ''),
          sku('s1', 'p-d11', 'd11', 'Dây chuyền nữ D-11', 'D-11'),
          sku('s1', 'multi', 'm1', 'Vào live chọn mẫu', 'A-1'), sku('s1', 'multi', 'm2', 'Vào live chọn mẫu', 'A-2'), sku('s1', 'multi', 'm3', 'Vào live chọn mẫu', ''),
        ],
        mappings: new Map(),
        known: new Set(),
        orders: (keys, from, to) => {
          assert.deepEqual(keys, ['s1:m1', 's1:m2', 's1:m3'])
          assert.ok(to > from)
          return [{ skuId: 'm1', shopKey: 's1', orderId: 'o1', quantity: 2, amount: 200000, createdAt: from }, { skuId: 'm2', shopKey: 's1', orderId: 'o2', quantity: 1, amount: 100000, createdAt: from }, { skuId: 'm3', shopKey: 's1', orderId: 'o3', quantity: 2, amount: 200000, createdAt: from }]
        },
      }),
    })
    const cookie = JSON.stringify([{ name: 'sessionid', value: 'TEST-COOKIE-VALUE', domain: '.tiktok.com', path: '/', secure: true, expirationDate: now / 1000 + 86400 }])

    // 登录：没有会话信息的拒绝；同一账号重复导入是更新，不会多一个
    await assert.rejects(() => liveAccountsService.importCookies({ cookieJson: JSON.stringify([{ name: 'x', value: '1', domain: '.tiktok.com' }]) }), /NO_SESSION/)
    const first = await liveAccountsService.importCookies({ cookieJson: cookie })
    assert.equal(first.account.handle, 'chainmagic')
    assert.equal((await liveAccountsService.importCookies({ cookieJson: cookie })).merged, true)
    assert.equal((await liveAccountsService.list()).length, 1)
    // 多账号；用别的账号的 Cookie 更新会被拦下
    handle = 'second'
    await assert.rejects(() => liveAccountsService.importCookies({ cookieJson: cookie, accountId: first.account.id }), /LIVE_ACCOUNT_MISMATCH:second/)
    const second = await liveAccountsService.importCookies({ cookieJson: cookie, name: '二号' })
    assert.equal((await liveAccountsService.list()).length, 2)
    // 校验失败不会留下账号和登录分区
    loggedOut = true
    await assert.rejects(() => liveAccountsService.importCookies({ cookieJson: cookie }), /LIVE_LOGIN_REQUIRED/)
    loggedOut = false
    assert.ok(cleared.length >= 3)
    await liveAccountsService.remove(second.account.id)
    handle = 'chainmagic'

    // 同步：还在播的不收
    await liveAccountsService.sync()
    let view = await liveAccountsService.overview()
    assert.deepEqual(view.rooms.map((item) => item.id), ['r1', 'r2'])
    const codes = new Map(view.codes.map((item) => [item.code, item]))
    assert.deepEqual([codes.get('D-11')!.sessions, codes.get('D-11')!.sales, codes.get('D-11')!.gmv, codes.get('D-11')!.estimated], [2, 6, 943320, false])
    // 多款链接按订单拆（估算），没有曝光点击；没同步的店按标题归款
    assert.deepEqual([codes.get('A-1')!.sales, codes.get('A-1')!.estimated, codes.get('A-1')!.clicks], [2, true, 0])
    assert.equal(codes.get('E-33')!.sales, 1)
    assert.deepEqual(view.unassigned.map((item) => [item.productId, item.reason, item.sales]), [['generic', 'generic', 10]])
    assert.equal(view.totals[0].sales, 22)
    assert.equal(view.totals[0].assignedSales, 4 + 2 + 3 + 1)
    assert.deepEqual((await liveAccountsService.overview({ since: NOW - DAY })).rooms.map((item) => item.id), ['r1'])

    // 归因稳定的旧场次不再重复取，刚下播的每次更新
    calls.length = 0
    now += HOUR
    await liveAccountsService.sync()
    assert.equal(calls.filter((item) => item === 'list').length, 1 + 1)

    // 登录过期：标记过期，旧数据还在
    loggedOut = true
    await liveAccountsService.sync()
    const account = (await liveAccountsService.list())[0]
    assert.equal(account.loginState, 'expired')
    view = await liveAccountsService.overview()
    assert.equal(view.rooms.length, 2)
    assert.equal((await liveAccountsService.verify(account.id)).loginState, 'expired')

    // Cookie 不落进数据文件
    assert.ok(!(await readFile(path.join(root, 'db', 'live-accounts.json'), 'utf8')).includes('TEST-COOKIE-VALUE'))
    console.log('live accounts smoke: ok')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

void main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
