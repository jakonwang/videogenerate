// Electron e2e for the creator hub plugin. Runs against a throw-away user data directory with
// seeded samples, so it never touches the real profile and never contacts TikTok.
// Requires a build first: `npx electron-vite build`.
const assert = require('node:assert/strict')
const path = require('node:path')
const os = require('node:os')
const { mkdir, mkdtemp, rm } = require('node:fs/promises')
const { DatabaseSync } = require('node:sqlite')
const { _electron: electron } = require('playwright')

const DAY = 86_400_000
const SHOP = 'e2e-shop-1'

function seed(dbFile) {
  const db = new DatabaseSync(dbFile)
  // Same tables the app creates (CREATE IF NOT EXISTS on its side keeps this compatible).
  db.exec(`
    CREATE TABLE IF NOT EXISTS ch_shops (id TEXT PRIMARY KEY, shop_id TEXT, updated_at INTEGER NOT NULL, cookie_encrypted TEXT, payload TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS ch_samples (id TEXT PRIMARY KEY, shop_id TEXT NOT NULL, creator_id TEXT NOT NULL, product_id TEXT NOT NULL, status INTEGER NOT NULL, created_at INTEGER NOT NULL, synced_at INTEGER NOT NULL, payload TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS ch_product_costs (id TEXT PRIMARY KEY, shop_id TEXT NOT NULL, product_id TEXT NOT NULL, updated_at INTEGER NOT NULL, payload TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS ch_videos (id TEXT PRIMARY KEY, shop_id TEXT NOT NULL, creator_id TEXT NOT NULL, posted_at INTEGER NOT NULL, synced_at INTEGER NOT NULL, payload TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS ch_creator_perf (id TEXT PRIMARY KEY, shop_id TEXT NOT NULL, creator_id TEXT NOT NULL, synced_at INTEGER NOT NULL, payload TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS ch_orders (id TEXT PRIMARY KEY, shop_id TEXT NOT NULL, creator_id TEXT NOT NULL, created_at INTEGER NOT NULL, synced_at INTEGER NOT NULL, payload TEXT NOT NULL);
  `)
  const now = Date.now()
  const shop = { id: SHOP, name: 'E2E Jewelry VN', region: 'VN', shopId: '7000000000000000001', loginState: 'valid', cookieImportedAt: now, lastSyncAt: now, createdAt: now, updatedAt: now }
  db.prepare('INSERT INTO ch_shops (id, shop_id, updated_at, cookie_encrypted, payload) VALUES (?, ?, ?, NULL, ?)').run(shop.id, shop.shopId, now, JSON.stringify(shop))
  const rows = [
    ['A1', 'C1', 'alice', 'Alice', 'P1', 100, 'completed', true, 60],
    ['A2', 'C1', 'alice', 'Alice', 'P1', 40, 'awaiting_content', true, 45],
    ['A3', 'C1', 'alice', 'Alice', 'P2', 40, 'awaiting_content', true, 5],
    ['A4', 'C2', 'bob', 'Bob', 'P2', 100, 'completed', true, 50],
    ['A5', 'C2', 'bob', 'Bob', 'P1', 10, 'pending_review', false, 1],
    ['A6', 'C3', 'carol', 'Carol', 'P2', 52, 'cancelled', false, 20],
  ]
  const insert = db.prepare('INSERT INTO ch_samples (id, shop_id, creator_id, product_id, status, created_at, synced_at, payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
  for (const [applyId, creatorId, handle, nick, productId, status, stage, hasOrder, ageDays] of rows) {
    const createdAt = now - ageDays * DAY
    const sample = {
      id: `${SHOP}:${applyId}`, shopId: SHOP, applyId, creatorId, creatorHandle: handle, creatorNickname: nick, followers: 4200, platformFulfillmentRate: 0.9,
      productId, productTitle: productId === 'P1' ? 'Star zircon earrings' : 'Silver heart necklace', skuId: `${productId}-S`, status, stage, hasSampleOrder: hasOrder,
      createdAt, platformOverdue: false, firstSeenAt: now, syncedAt: now,
    }
    insert.run(sample.id, SHOP, creatorId, productId, status, createdAt, now, JSON.stringify(sample))
  }
  const cost = { id: `${SHOP}:P1:*`, shopId: SHOP, productId: 'P1', productTitle: 'Star zircon earrings', unitCost: 30000, shippingCost: 15000, updatedAt: now }
  db.prepare('INSERT INTO ch_product_costs (id, shop_id, product_id, updated_at, payload) VALUES (?, ?, ?, ?, ?)').run(cost.id, SHOP, 'P1', now, JSON.stringify(cost))

  const window = { start: now - 29 * DAY, end: now - DAY }
  const metrics = (gmv, extra = {}) => ({ gmv, refundedGmv: 0, commission: gmv / 10, orders: Math.round(gmv / 100000), itemsSold: 1, refundedItems: 0, videos: 0, lives: 0, samplesShipped: 0, sampleContent: 0, views: 0, videoGmv: gmv, liveGmv: 0, productCardGmv: 0, ...extra })
  const perf = [
    ['C1', 'alice', 'Alice', metrics(900000, { videos: 6, lives: 1 }), metrics(600000)],
    ['C2', 'bob', 'Bob', metrics(300000, { videos: 2 }), metrics(300000)],
    ['C4', 'dave', 'Dave', metrics(0), metrics(50000)],
  ]
  for (const [creatorId, handle, nick, m, prev] of perf) {
    const row = { id: `${SHOP}:${creatorId}`, shopId: SHOP, creatorId, creatorHandle: handle, creatorNickname: nick, followers: 4200, metrics: m, previous: prev, window, syncedAt: now }
    db.prepare('INSERT INTO ch_creator_perf (id, shop_id, creator_id, synced_at, payload) VALUES (?, ?, ?, ?, ?)').run(row.id, SHOP, creatorId, now, JSON.stringify(row))
  }
  const video = (itemId, creatorId, handle, productId, gmv, ageDays) => ({
    id: `${SHOP}:${itemId}`, shopId: SHOP, itemId, title: `Video ${itemId} #earrings`, postedAt: now - ageDays * DAY, creatorId, creatorHandle: handle, creatorNickname: handle,
    followers: 4200, productIds: [productId], productTitles: [productId === 'P1' ? 'Star zircon earrings' : 'Silver heart necklace'], gmv, orders: Math.round(gmv / 100000), itemsSold: 1, views: gmv / 100,
    likes: 0, comments: 0, shares: 0, refundedGmv: 0, refundedItems: 0, commission: gmv / 10, finishRate: 0.12, ctr: 0.08, gpm: 100000, aov: 100000, productImpressions: 0, productClicks: 0, window, syncedAt: now,
  })
  for (const row of [video('V1', 'C1', 'alice', 'P1', 600000, 20), video('V2', 'C1', 'alice', 'P2', 300000, 3), video('V3', 'C2', 'bob', 'P1', 300000, 10)]) {
    db.prepare('INSERT INTO ch_videos (id, shop_id, creator_id, posted_at, synced_at, payload) VALUES (?, ?, ?, ?, ?, ?)').run(row.id, SHOP, row.creatorId, row.postedAt, now, JSON.stringify(row))
  }
  const order = (orderId, creatorId, handle, productId, amount, extra = {}) => ({
    id: `${SHOP}:${orderId}:S`, shopId: SHOP, orderId, skuId: 'S', productId, productTitle: productId, creatorId, creatorHandle: handle, creatorNickname: handle, contentType: 'video',
    createdAt: now - 2 * DAY, unitPrice: amount, quantity: 1, amount, refundQuantity: 0, returnQuantity: 0, settlementStatus: 300, commissionBase: amount, estCommission: amount / 10, estAdsCommission: amount / 50, standardRate: 0.1, syncedAt: now, ...extra,
  })
  for (const row of [order('O1', 'C1', 'alice', 'P1', 200000), order('O2', 'C1', 'alice', 'P1', 100000, { refundQuantity: 1 }), order('O3', 'C2', 'bob', 'P2', 50000, { settledAt: now - DAY, actualCommission: 5000 })]) {
    db.prepare('INSERT INTO ch_orders (id, shop_id, creator_id, created_at, synced_at, payload) VALUES (?, ?, ?, ?, ?, ?)').run(row.id, SHOP, row.creatorId, row.createdAt, now, JSON.stringify(row))
  }
  db.close()
}

async function main() {
  const root = path.resolve(__dirname, '..')
  const artifacts = path.join(root, 'test-artifacts', 'tiktok-creator-hub')
  await mkdir(artifacts, { recursive: true })
  const temp = await mkdtemp(path.join(os.tmpdir(), 'videogenerate-creator-hub-'))
  const userData = path.join(temp, 'userData')
  const dataDir = path.join(userData, '.videogenerate')
  await mkdir(path.join(dataDir, 'db'), { recursive: true })
  seed(path.join(dataDir, 'db', 'tiktok-creator-hub.sqlite'))

  const electronApp = await electron.launch({ args: ['.'], cwd: root, env: { ...process.env, VIDEOGENERATE_USER_DATA_DIR: userData, VIDEOGENERATE_DATA_DIR: dataDir } })
  const page = await electronApp.firstWindow()
  page.setDefaultTimeout(30_000)
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  page.on('console', (message) => { if (message.type() === 'error' && /creator|i18n|intlify/i.test(message.text())) pageErrors.push(message.text()) })

  try {
    await page.waitForLoadState('domcontentloaded')
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.evaluate(() => { localStorage.setItem('creatorHub.tab', 'overview'); localStorage.setItem('creatorHub.currentShop', 'all'); window.location.hash = '#/plugins/tiktok-creator-hub' })
    await page.locator('[data-testid="creator-hub-page"]').waitFor({ state: 'visible' })

    // Overview: GMV 1.2M (vs 950k), funnel and to-dos.
    const overview = page.locator('[data-testid="creator-hub-overview"]')
    await overview.waitFor({ state: 'visible' })
    const overviewText = await overview.innerText()
    assert.match(overviewText, /1\.200\.000/, 'creator GMV total')
    assert.match(overviewText, /26\.3%/, 'GMV change vs previous period')
    await page.screenshot({ path: path.join(artifacts, 'overview-dark-teal.png') })

    // Videos: 3 videos; the sample-video filter keeps the two alice posted after receiving samples.
    await page.locator('[data-testid="creator-hub-tab-videos"]').click()
    const videos = page.locator('[data-testid="creator-hub-videos"]')
    await videos.waitFor({ state: 'visible' })
    assert.equal(await videos.locator('tbody tr').count(), 3)
    await videos.locator('label.vg-switch').first().click()
    // V1 (alice, P1 sample 60 days ago) and V2 (alice, P2 sample 5 days ago) are sample videos; bob's P1 sample was never shipped.
    assert.equal(await videos.locator('tbody tr').count(), 2)
    assert.doesNotMatch(await videos.locator('tbody').innerText(), /Video V3/)
    await videos.locator('label.vg-switch').first().click()
    await page.screenshot({ path: path.join(artifacts, 'videos-dark-teal.png') })

    // Creators CRM: tag + block a creator through the profile dialog.
    await page.locator('[data-testid="creator-hub-tab-creators"]').click()
    const crm = page.locator('[data-testid="creator-hub-crm"]')
    await crm.waitFor({ state: 'visible' })
    assert.ok(await crm.locator('tbody tr').count() >= 3)
    await crm.locator('tbody tr', { hasText: 'Bob' }).locator('[data-testid="creator-hub-crm-edit"]').click()
    const profile = page.locator('[data-testid="creator-hub-profile-dialog"]')
    await profile.waitFor({ state: 'visible' })
    await profile.locator('input').first().fill('vip, repeat')
    await profile.locator('textarea').fill('Prefers Zalo')
    await profile.locator('[data-testid="creator-hub-profile-save"]').click()
    await profile.waitFor({ state: 'detached' })
    await page.waitForFunction(() => document.querySelector('[data-testid="creator-hub-crm"]')?.textContent?.includes('Prefers Zalo'))
    await page.screenshot({ path: path.join(artifacts, 'creators-dark-teal.png') })

    // Orders: 3 orders, by-creator view groups alice.
    await page.locator('[data-testid="creator-hub-tab-orders"]').click()
    const orders = page.locator('[data-testid="creator-hub-orders"]')
    await orders.waitFor({ state: 'visible' })
    assert.equal(await orders.locator('tbody tr').count(), 3)
    assert.match(await orders.locator('.vg-stats').innerText(), /350\.000/)
    await orders.locator('.vg-seg__btn').nth(1).click()
    assert.equal(await orders.locator('tbody tr').count(), 2)
    await page.screenshot({ path: path.join(artifacts, 'orders-dark-teal.png') })

    await page.locator('[data-testid="creator-hub-tab-fulfillment"]').click()
    await page.locator('[data-testid="creator-hub-fulfillment"]').waitFor({ state: 'visible' })

    // Fulfilment: C1 = 1 fulfilled + 1 overdue (45d) + 1 pending, C2 = 1 fulfilled => 2 / 3.
    const statsText = await page.locator('[data-testid="creator-hub-fulfillment"] .vg-stats').innerText()
    assert.match(statsText, /66\.7%/, `overall rate in stats: ${statsText}`)
    const rows = page.locator('[data-testid="creator-hub-fulfillment"] tbody tr')
    assert.equal(await rows.count(), 2, 'only creators with due samples are listed by default')
    assert.match(await rows.first().innerText(), /Alice[\s\S]*50\.0%/)
    await page.screenshot({ path: path.join(artifacts, 'fulfillment-dark-teal.png') })

    // Samples tab: 6 samples, filter overdue -> 1.
    await page.locator('[data-testid="creator-hub-tab-samples"]').click()
    const samples = page.locator('[data-testid="creator-hub-samples"]')
    await samples.waitFor({ state: 'visible' })
    assert.equal(await samples.locator('tbody tr').count(), 6)
    await samples.locator('select').nth(1).selectOption('overdue')
    assert.equal(await samples.locator('tbody tr').count(), 1)
    assert.match(await samples.locator('tbody tr').first().innerText(), /Alice/)
    await samples.locator('select').nth(1).selectOption('all')
    await page.screenshot({ path: path.join(artifacts, 'samples-dark-teal.png') })

    // Costs tab needs a single shop; switch shop, then save a cost for P2.
    await page.locator('[data-testid="creator-hub-tab-costs"]').click()
    assert.equal(await page.locator('[data-testid="creator-hub-costs"]').count(), 0)
    await page.locator('[data-testid="creator-hub-shop-switch"]').selectOption(SHOP)
    const costs = page.locator('[data-testid="creator-hub-costs"]')
    await costs.waitFor({ state: 'visible' })
    const p2 = costs.locator('tbody tr', { hasText: 'Silver heart necklace' })
    await p2.locator('input').nth(0).fill('20000')
    await p2.locator('input').nth(1).fill('10000')
    await p2.locator('button', { hasText: /保存|Save|Luu/ }).click()
    await page.waitForFunction(() => document.querySelector('[data-testid="creator-hub-costs"]')?.textContent?.includes('30.000'))
    await page.screenshot({ path: path.join(artifacts, 'costs-dark-teal.png') })

    // Fulfilment cost total now includes P2: C1 shipped P1 x2 (45000) + P2 x1 (30000).
    await page.locator('[data-testid="creator-hub-tab-fulfillment"]').click()
    await page.locator('[data-testid="creator-hub-fulfillment"]').waitFor({ state: 'visible' })
    assert.match(await page.locator('[data-testid="creator-hub-fulfillment"] tbody tr', { hasText: 'Alice' }).innerText(), /120\.000/)

    // Shops tab + cookie dialog validation (local errors only, nothing is sent to TikTok).
    await page.locator('[data-testid="creator-hub-tab-shops"]').click()
    await page.locator('[data-testid="creator-hub-shops"]').waitFor({ state: 'visible' })
    assert.match(await page.locator('[data-testid="creator-hub-shops"] tbody').innerText(), /E2E Jewelry VN/)
    await page.locator('[data-testid="creator-hub-add-shop"]').click()
    const dialog = page.locator('[data-testid="creator-hub-cookie-dialog"]')
    await dialog.waitFor({ state: 'visible' })
    await dialog.locator('textarea').fill('not json')
    await dialog.locator('[data-testid="creator-hub-cookie-submit"]').click()
    await dialog.locator('.vg-notice--danger').waitFor({ state: 'visible' })
    await dialog.locator('textarea').fill(JSON.stringify([{ domain: '.tiktok.com', name: 'ttwid', value: 'x', path: '/' }]))
    await dialog.locator('[data-testid="creator-hub-cookie-submit"]').click()
    await page.waitForFunction(() => /Cookie|cookie/.test(document.querySelector('[data-testid="creator-hub-cookie-dialog"] .vg-notice--danger')?.textContent || '') && !/CREATOR_HUB_/.test(document.querySelector('[data-testid="creator-hub-cookie-dialog"] .vg-notice--danger')?.textContent || ''))
    await page.screenshot({ path: path.join(artifacts, 'cookie-dialog-dark-teal.png') })
    await page.keyboard.press('Escape')
    await dialog.locator('button', { hasText: /取消|Cancel|Huy/ }).click()

    // Themes: the page must follow the theme tokens.
    for (const theme of ['light-teal', 'mono', 'dark-teal']) {
      await page.evaluate((key) => { localStorage.setItem('videogenerate.ui.theme', key); localStorage.setItem('creatorHub.tab', 'overview') }, theme)
      await page.reload()
      await page.locator('[data-testid="creator-hub-overview"]').waitFor({ state: 'visible' })
      const applied = await page.evaluate(() => document.documentElement.dataset.appTheme)
      assert.equal(applied, theme)
      await page.screenshot({ path: path.join(artifacts, `overview-${theme}.png`) })
    }

    // Narrow window: no horizontal page overflow.
    await page.setViewportSize({ width: 900, height: 800 })
    await page.waitForTimeout(300)
    const overflow = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="creator-hub-page"]')
      return el ? el.scrollWidth - el.clientWidth : 0
    })
    assert.ok(overflow <= 1, `page overflows horizontally by ${overflow}px`)
    await page.screenshot({ path: path.join(artifacts, 'overview-narrow.png') })

    assert.deepEqual(pageErrors, [])
    console.log('tiktok-creator-hub electron e2e: ok')
  } finally {
    await electronApp.close().catch(() => undefined)
    await rm(temp, { recursive: true, force: true }).catch(() => undefined)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
