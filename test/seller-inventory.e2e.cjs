/**
 * Opens 销售与库存 in the built Electron app with two seeded shops and checks the KPIs, the to-do
 * list, merged SKUs, the daily matrix, SKU mapping, a stock count, and that a sync without a
 * seller-center login reports the login problem instead of failing silently.
 * Usage: VG_LICENSE_MODE=off npx electron-vite build && node test/seller-inventory.e2e.cjs [screenshotDir]
 */
const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const { mkdtemp, mkdir } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { _electron: electron } = require('playwright')

async function main() {
  const repo = join(__dirname, '..')
  const root = await mkdtemp(join(tmpdir(), 'videogenerate-seller-inv-'))
  const dataDir = join(root, 'data')
  const shots = process.argv[2] || join(repo, 'test-artifacts', 'seller-inventory')
  await mkdir(shots, { recursive: true })
  await mkdir(dataDir, { recursive: true })
  const env = { ...process.env, VG_LICENSE_MODE: 'off', VIDEOGENERATE_USER_DATA_DIR: root, VIDEOGENERATE_DATA_DIR: dataDir }
  execFileSync(process.execPath, [join(repo, 'node_modules', 'tsx', 'dist', 'cli.mjs'), join(repo, 'test', 'seller-inventory.seed.ts')], { cwd: repo, env, encoding: 'utf8', stdio: ['ignore', 'inherit', 'inherit'] })

  const errors = []
  let app
  try {
    app = await electron.launch({ args: ['.'], cwd: repo, env })
    const page = await app.firstWindow()
    page.setDefaultTimeout(30_000)
    page.on('pageerror', (error) => errors.push(String(error)))
    // Error codes such as SELLER_LOGIN_REQUIRED or HTTP_500 must never reach the screen.
    const noTechnicalText = async (where) => {
      const text = await page.locator('main').first().innerText()
      assert.doesNotMatch(text, /SELLER_|HTTP_\d|code=|Error invoking/, `technical text on the ${where}`)
    }
    page.on('console', (message) => { if (message.type() === 'error' && /seller|sellerInv|i18n|intlify/i.test(message.text())) errors.push(message.text()) })
    await page.setViewportSize({ width: 1480, height: 960 }).catch(() => undefined)
    await page.waitForLoadState('domcontentloaded')

    // The toolbox lists the new tool.
    await page.evaluate(() => { window.location.hash = '#/plugins' })
    await page.locator('[data-testid="toolbox"]').getByText('销售与库存').first().click()
    await page.waitForFunction(() => window.location.hash.includes('/plugins/seller-inventory'))

    const kpi = page.locator('[data-testid="si-kpi"]')
    await kpi.waitFor({ state: 'visible' })
    const kpiText = await kpi.innerText()
    assert.match(kpiText, /今日销售额/)
    assert.match(kpiText, /₫/)

    const table = page.locator('[data-testid="si-table"]')
    await table.getByText('A-152', { exact: true }).waitFor()
    const a152 = table.locator('tr', { hasText: 'A-152' }).first()
    const rowText = await a152.innerText()
    assert.match(rowText, /爆款/, 'A-152 accelerates in both shops')
    assert.match(rowText, /150/, 'platform stock of both shops is added (120 + 30)')
    const a67 = await table.locator('tr', { hasText: 'A-67' }).first().innerText()
    assert.match(a67, /快断货|该补货|已售罄/, 'A-67 has under 3 days of stock')
    assert.match(await table.innerText(), /未对应/)
    const todo = await page.locator('[data-testid="si-todo"]').innerText()
    assert.match(todo, /A-67/)
    assert.match(todo, /还没有 SKU 编码/)
    await page.screenshot({ path: join(shots, '01-overview.png'), fullPage: true })

    // Detail dialog with chart and shop split.
    await a152.click()
    const detail = page.locator('[data-testid="si-detail"]')
    await detail.waitFor({ state: 'visible' })
    assert.match(await detail.innerText(), /ARUA VN/)
    assert.match(await detail.innerText(), /ARUA Store 2/)
    await page.screenshot({ path: join(shots, '02-detail.png') })
    await detail.locator('.vg-dialog__head .vg-icon-btn').click()

    // Daily matrix.
    await page.locator('[data-testid="si-tab-daily"]').click()
    const daily = page.locator('[data-testid="si-daily"]')
    await daily.getByText('A-152', { exact: true }).waitFor()
    await page.screenshot({ path: join(shots, '03-daily.png'), fullPage: true })

    // Mapping: the product without a seller SKU gets the suggestion from its title.
    await page.locator('[data-testid="si-tab-mapping"]').click()
    const mapping = page.locator('[data-testid="si-mapping"]')
    await mapping.getByText('B-21 · 用这个').click()
    await page.locator('[data-testid="si-tab-overview"]').click()
    await table.getByText('B-21', { exact: true }).waitFor()

    // Stock count for A-67 replaces the platform stock with the user's own number.
    await page.locator('[data-testid="si-tab-stock"]').click()
    await page.locator('[data-testid="si-move-code"]').fill('A-67')
    await page.locator('[data-testid="si-move-qty"]').fill('500')
    await page.locator('[data-testid="si-move-save"]').click()
    await page.locator('[data-testid="si-stock"]').getByText('盘点').nth(1).waitFor()
    await page.screenshot({ path: join(shots, '04-stock.png'), fullPage: true })
    await page.locator('[data-testid="si-tab-overview"]').click()
    const a67After = await table.locator('tr', { hasText: 'A-67' }).first().innerText()
    assert.match(a67After, /500/)
    assert.match(a67After, /正常/)

    // A sync without a seller-center login must say so.
    await page.locator('[data-testid="si-sync"]').click()
    await page.getByText('商家后台登录已失效').first().waitFor({ timeout: 120_000 })
    await page.screenshot({ path: join(shots, '05-login-required.png'), fullPage: true })
    await noTechnicalText('sales page after a failed sync')

    // The login is shared with 达人管理: the failure offers the same cookie dialog for that shop.
    await page.locator('[data-testid^="si-update-cookie-"]').first().click()
    const cookieDialog = page.locator('[data-testid="creator-hub-cookie-dialog"]')
    await cookieDialog.waitFor({ state: 'visible' })
    const cookieText = await cookieDialog.innerText()
    assert.match(cookieText, /seller-vn\.tiktok\.com/)
    assert.match(cookieText, /销售与库存/)
    await page.screenshot({ path: join(shots, '06-cookie-dialog.png') })
    await cookieDialog.locator('.vg-dialog__head .vg-icon-btn').click()
    await page.locator('[data-testid="si-tab-settings"]').click()
    assert.match(await page.locator('[data-testid="si-settings"]').innerText(), /和「达人管理」共用/)

    // 店铺 in the sidebar: a business card per shop, then the shop's daily page.
    await page.locator('body').getByText('店铺', { exact: true }).first().click()
    await page.waitForFunction(() => window.location.hash.includes('/shops'))
    const totals = page.locator('[data-testid="shops-totals"]')
    await totals.waitFor()
    assert.match(await totals.innerText(), /今日总 GMV/)
    const bizCard = page.locator('[data-testid="shop-biz-shop-a"]')
    const bizText = await bizCard.innerText()
    assert.match(bizText, /今日 GMV/)
    assert.match(bizText, /7 天 GMV -/, 'shop A dropped ~30% in the last week')
    assert.match(bizText, /登录失效/)
    assert.match(bizText, /近 7 天利润/)
    assert.match(bizText, /2 单快超时发货|2 项健康指标不达标/)
    assert.match(bizText, /个订单快超时没发货|已售罄|比上周同一天/, 'the most important finding is on the card')
    await page.screenshot({ path: join(shots, '08-shops-business.png'), fullPage: true })
    assert.match(await page.locator('[data-testid="shop-fresh-shop-b"]').innerText(), /更新|没更新/, 'each card says when it was updated')
    await noTechnicalText('shops page')
    await bizCard.click()
    await page.waitForFunction(() => window.location.hash.includes('/shops/shop-a'))
    const detailPage = page.locator('[data-testid="shop-detail"]')
    await detailPage.locator('[data-testid="shop-kpis"]').waitFor()
    assert.match(await detailPage.locator('[data-testid="shop-kpis"]').innerText(), /转化率/)
    const profitCard = detailPage.locator('[data-testid="shop-profit"]')
    await profitCard.getByText('预估利润').waitFor()
    const profitText = await profitCard.innerText()
    assert.match(profitText, /费率 33(\.0)?%（来自最近 40 笔结算）/)
    assert.match(profitText, /ARUA VN/, 'the GMV Max store with the same id is linked automatically')
    assert.match(profitText, /待结算 40 笔/)
    assert.match(await profitCard.locator('[data-testid="profit-missing-cost"]').innerText(), /B-21/, 'selling codes without a cost price are asked for one')
    await profitCard.scrollIntoViewIfNeeded()
    await page.screenshot({ path: join(shots, '11-profit.png') })
    await profitCard.locator('[data-testid="profit-cost-B-21"]').fill('30000')
    await profitCard.locator('[data-testid="profit-cost-B-21"]').press('Tab')
    await page.waitForFunction(() => !document.querySelector('[data-testid="profit-cost-B-21"]'))
    const analysisText = await detailPage.locator('[data-testid="shop-analysis"]').innerText()
    assert.match(analysisText, /比前 7 天 -\d/)
    assert.match(analysisText, /→ /, 'each finding says what to do')
    assert.match(analysisText, /12 小时客服回复率 不达标：82\.0%，要求 85\.0%/)
    const healthText = await detailPage.locator('[data-testid="shop-health"]').innerText()
    assert.match(healthText, /3 项不达标/)
    await detailPage.locator('[data-testid="shop-analysis"]').scrollIntoViewIfNeeded()
    await page.screenshot({ path: join(shots, '09b-analysis.png') })
    assert.match(healthText, /待发货\s*445\s*2 个快超时/)
    assert.match(await detailPage.locator('[data-testid="shop-channels"]').innerText(), /短视频/)
    assert.match(await detailPage.locator('[data-testid="shop-channels"]').innerText(), /达人/)
    assert.ok(await detailPage.locator('.calendar__cell:not(.empty)').count() >= 30, 'one calendar cell per day')
    assert.equal(await detailPage.locator('[data-testid="shop-daily-table"] tbody tr').count(), 30)
    assert.match(await detailPage.locator('[data-testid="shop-skus"]').innerText(), /A-152/)
    await page.screenshot({ path: join(shots, '09-shop-detail.png'), fullPage: true })
    assert.match(await page.locator('[data-testid="shop-detail-fresh"]').innerText(), /更新|没更新/)
    assert.match(await page.locator('[data-testid="shop-detail-sync-error"]').innerText(), /登录已失效/, 'the failed sync is explained in plain words')
    await noTechnicalText('shop page')
    await detailPage.locator('.vg-seg__btn', { hasText: '90 天' }).click()
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="shop-daily-table"] tbody tr').length === 90)

    // Morning report dialog: settings, send now, preview.
    await page.evaluate(() => { window.location.hash = '#/shops' })
    await page.locator('[data-testid="shops-report"]').click()
    const reportDialog = page.locator('[data-testid="shop-report-dialog"]')
    await reportDialog.waitFor({ state: 'visible' })
    assert.match(await reportDialog.innerText(), /还没配置飞书群机器人/)
    await reportDialog.getByText('电脑桌面通知').click()
    await reportDialog.locator('[data-testid="report-send"]').click()
    await reportDialog.getByText('已生成（没有开启发送渠道）').waitFor()
    assert.equal(await reportDialog.locator('[data-testid="report-shop"]').count(), 2)
    assert.match(await reportDialog.locator('[data-testid="report-shop"]').first().innerText(), /昨天 GMV/)
    await page.screenshot({ path: join(shots, '10-report.png') })
    await reportDialog.locator('.vg-dialog__head .vg-icon-btn').click()

    // 账号 tab keeps the shared logins.
    await page.evaluate(() => { window.location.hash = '#/shops?tab=accounts' })
    const shopsPage = page.locator('[data-testid="shops-accounts"]')
    await shopsPage.locator('[data-testid="shop-card-shop-a"]').waitFor()
    const shopCard = await shopsPage.locator('[data-testid="shop-card-shop-a"]').innerText()
    assert.match(shopCard, /ARUA VN/)
    assert.match(shopCard, /达人管理/)
    assert.match(shopCard, /销售与库存/)
    assert.match(shopCard, /上次同步失败/, 'the failed sales sync shows on the shop card')
    assert.match(shopCard, /登录失效/, 'a seller-center login failure marks the shared login expired')
    await shopsPage.locator('[data-testid="shop-cookie-shop-a"]').click()
    await page.locator('[data-testid="creator-hub-cookie-dialog"]').waitFor({ state: 'visible' })
    await page.locator('[data-testid="creator-hub-cookie-dialog"] .vg-dialog__head .vg-icon-btn').click()
    await page.screenshot({ path: join(shots, '07-shops.png'), fullPage: true })

    assert.deepEqual(errors, [])
    console.log(`seller-inventory e2e: ok (screenshots in ${shots})`)
  } finally {
    await app?.close().catch(() => undefined)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
