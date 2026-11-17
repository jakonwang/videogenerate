/**
 * Drives the built Electron app through the AI producer surfaces:
 * workbench, command bar, AI panel + plan approval, review inbox, insights, product space, brand memory.
 * Usage: npx electron-vite build && node test/ai-producer-ui.e2e.cjs [screenshotDir]
 */
const assert = require('node:assert/strict')
const { mkdtemp, mkdir, rm } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { _electron: electron } = require('playwright')

async function main() {
  const root = await mkdtemp(join(tmpdir(), 'videogenerate-ai-ui-'))
  const dataDir = join(root, 'data')
  const shots = process.argv[2] || join(root, 'shots')
  await mkdir(shots, { recursive: true })
  const errors = []
  let app
  try {
    app = await electron.launch({
      args: ['.'],
      cwd: join(__dirname, '..'),
      env: { ...process.env, VIDEOGENERATE_USER_DATA_DIR: root, VIDEOGENERATE_DATA_DIR: dataDir },
    })
    const page = await app.firstWindow()
    page.on('pageerror', (error) => errors.push(String(error)))
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
    await page.setViewportSize({ width: 1480, height: 920 }).catch(() => undefined)
    await page.waitForLoadState('domcontentloaded')
    await page.evaluate(() => { window.location.hash = '#/home' })

    // Workbench
    await page.waitForSelector('[data-testid="home-view"]')
    await page.waitForSelector('[data-testid="home-brief"] .vg-list__item', { timeout: 20000 })
    assert.equal(await page.locator('[data-testid^="home-line-"]').count(), 3)
    await page.screenshot({ path: join(shots, '01-home.png') })

    // Sidebar: new IA with inbox
    const sidebar = await page.locator('[data-testid="app-sidebar"]').innerText()
    for (const label of ['工作台', '审核收件箱', '复刻', 'TikTok 创意工作室', 'Live Photo', '发布中心', '数据复盘', '商品库']) {
      assert.ok(sidebar.includes(label), `sidebar has ${label}`)
    }

    // Command bar
    await page.keyboard.press('Control+K')
    await page.waitForSelector('[data-testid="ai-command-bar"]')
    await page.locator('[data-testid="ai-command-input"]').fill('复刻')
    await page.waitForTimeout(250)
    await page.screenshot({ path: join(shots, '02-command-bar.png') })
    await page.keyboard.press('Escape')

    // Seed a product and a recipe-style plan through the real preload API
    const product = await page.evaluate(async () => await window.api.products.upsert({ name: '珍珠耳环 Pearl', type: 'earring' }))
    const conversation = await page.evaluate(async () => await window.api.agentOs.createConversation({}))
    await page.evaluate(async (conversationId) => await window.api.agentOs.sendMessage({
      conversationId,
      content: '做一次系统体检并复盘本周内容',
      plan: { intents: ['Intent.SystemHealthCheck', 'Intent.InsightsRead'], summary: '系统体检 → 内容复盘' },
    }), conversation.id)

    // AI panel shows the plan card and approval runs it
    await page.locator('[data-testid="ai-open-panel"]').click()
    await page.waitForSelector('[data-testid="ai-producer-panel"]')
    await page.locator('[data-testid="ai-producer-panel"] button[title]').first().click() // history
    await page.locator('.ai-panel__history-item').first().click()
    await page.waitForSelector('[data-testid="ai-plan-approve"]', { timeout: 15000 })
    await page.screenshot({ path: join(shots, '03-plan-card.png') })
    await page.locator('[data-testid="ai-plan-approve"]').click()
    await page.waitForFunction(() => document.querySelector('[data-testid="ai-plan-card"]')?.classList.contains('is-completed'), null, { timeout: 30000 })
    await page.screenshot({ path: join(shots, '04-plan-completed.png') })

    // Recipes
    await page.locator('[data-testid="ai-tab-recipes"]').click()
    await page.locator('[data-testid="ai-recipe-product-content-pack"]').click()
    await page.waitForSelector('[data-testid="ai-recipe-submit"]')
    await page.screenshot({ path: join(shots, '05-recipe-form.png') })
    await page.locator('[data-testid="ai-panel-close"]').click()

    // Review inbox
    await page.evaluate(() => { window.location.hash = '#/inbox' })
    await page.waitForSelector('[data-testid="review-inbox"]')
    await page.waitForTimeout(400)
    await page.screenshot({ path: join(shots, '06-inbox.png') })

    // Insights
    await page.evaluate(() => { window.location.hash = '#/insights' })
    await page.waitForSelector('[data-testid="insights-view"] table')
    await page.screenshot({ path: join(shots, '07-insights.png') })

    // Product space
    await page.evaluate((id) => { window.location.hash = `#/products/${id}` }, product.id)
    await page.waitForSelector('[data-testid="product-space"]')
    await page.screenshot({ path: join(shots, '08-product-space.png') })
    await page.locator('[data-testid="product-tab-profile"]').click()
    await page.waitForSelector('.pd-summary')

    // Brand memory settings
    await page.evaluate(() => { window.location.hash = '#/settings?section=brand' })
    await page.waitForSelector('[data-testid="settings-brand-memory"]')
    await page.screenshot({ path: join(shots, '09-brand-memory.png') })
    await page.evaluate(() => { window.location.hash = '#/settings?section=automation' })
    await page.waitForSelector('[data-testid="settings-ai-automation"] .vg-list__item', { timeout: 20000 })
    await page.screenshot({ path: join(shots, '10-automation.png') })

    const relevant = errors.filter((text) => !/favicon|DevTools|Autofill/i.test(text))
    assert.deepEqual(relevant, [], `renderer errors:\n${relevant.join('\n')}`)
    console.log(`ai-producer ui e2e: ok (screenshots in ${shots})`)
  } finally {
    if (app) await app.close().catch(() => undefined)
    if (!process.argv[2]) await rm(root, { recursive: true, force: true }).catch(() => undefined)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
