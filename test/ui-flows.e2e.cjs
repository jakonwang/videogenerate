/**
 * Interaction flows across the built Electron app (no external services needed):
 * product create → product space memory → inbox keyboard,
 * brand memory persistence, recipe validation, toolbox search, toolbox → tool navigation, English locale sanity.
 * Usage: VG_LICENSE_MODE=off npx electron-vite build && node test/ui-flows.e2e.cjs [screenshotDir]
 */
const assert = require('node:assert/strict')
const { mkdtemp, mkdir } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { _electron: electron } = require('playwright')

async function main() {
  const root = await mkdtemp(join(tmpdir(), 'videogenerate-flows-'))
  const dataDir = join(root, 'data')
  const shots = process.argv[2] || join(root, 'shots')
  await mkdir(shots, { recursive: true })
  const errors = []
  const app = await electron.launch({
    args: ['.'],
    cwd: join(__dirname, '..'),
    env: { ...process.env, VIDEOGENERATE_USER_DATA_DIR: root, VIDEOGENERATE_DATA_DIR: dataDir },
  })
  try {
    const page = await app.firstWindow()
    page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
    page.on('console', (message) => {
      if (message.type() !== 'error') return
      const text = message.text()
      if (/Electron Security Warning|DevTools|Autofill/i.test(text)) return
      errors.push(text)
    })
    await page.waitForLoadState('domcontentloaded')
    const go = async (hash) => {
      await page.evaluate((value) => { window.location.hash = value }, hash)
      await page.waitForTimeout(900)
    }

    // 1. Create a product through the UI
    await go('#/products')
    await page.locator('[data-testid="product-create-open"]').click()
    await page.locator('[data-testid="product-create-name-input"]').fill('测试耳环')
    await page.locator('[data-testid="product-create-submit"]').click()
    await page.waitForSelector('[data-testid="product-space"]', { timeout: 15000 })
    const productId = await page.evaluate(() => decodeURIComponent(window.location.hash.split('/products/')[1] || ''))
    assert.ok(productId, 'navigated to the new product')

    // 2. Product memory saves and persists
    await page.locator('[data-testid="product-space"] textarea').first().fill('淡水珍珠，手工挑选')
    await page.locator('[data-testid="product-space"] .vg-btn--primary.vg-btn--sm').last().click()
    await page.waitForTimeout(500)
    const memory = await page.evaluate(async (id) => await window.api.contentHub.getProductMemory(id), productId)
    assert.equal(memory.sellingPoints, '淡水珍珠，手工挑选')

    // 4. Inbox renders (with or without seeded content) and keyboard shortcuts don't throw
    await go('#/inbox')
    await page.waitForSelector('[data-testid="review-inbox"]')
    await page.keyboard.press('?')
    await page.keyboard.press('ArrowRight')
    await page.screenshot({ path: join(shots, 'flow-inbox.png') })

    // 5. Brand memory persists across reload
    await go('#/settings?section=brand')
    await page.waitForSelector('[data-testid="settings-brand-memory"]')
    await page.locator('[data-testid="settings-brand-memory"] input').first().fill('Lumi')
    await page.locator('[data-testid="brand-save"]').click()
    await page.waitForTimeout(400)
    await page.reload()
    await page.waitForSelector('[data-testid="settings-brand-memory"]', { timeout: 15000 })
    await page.waitForTimeout(600)
    assert.equal(await page.locator('[data-testid="settings-brand-memory"] input').first().inputValue(), 'Lumi')

    // 6. Recipe validation blocks empty submissions
    await page.keyboard.press('Control+J')
    await page.waitForSelector('[data-testid="ai-producer-panel"]')
    await page.locator('[data-testid="ai-tab-recipes"]').click()
    await page.locator('[data-testid="ai-recipe-scene-images"]').click()
    await page.locator('[data-testid="ai-recipe-submit"]').click()
    assert.ok(await page.locator('.vg-field__error').count() >= 1, 'required field errors shown')
    await page.screenshot({ path: join(shots, 'flow-recipe-validation.png') })
    await page.locator('[data-testid="ai-panel-close"]').click()

    // 7. Toolbox search + navigation keeps the toolbox nav active
    await go('#/plugins')
    await page.locator('.toolbox__search input').fill('水印')
    await page.waitForTimeout(200)
    const visibleTools = await page.locator('.toolbox__tool').count()
    assert.ok(visibleTools >= 2 && visibleTools < 11, 'search narrows the tool list')
    await page.locator('[data-testid="tool-video-batch-watermark"]').click()
    await page.waitForSelector('[data-testid="video-watermark"]')
    assert.equal((await page.locator('.vg-nav__item.is-active .vg-nav__label').innerText()).trim(), '工具箱')
    await page.locator('[data-testid="watermark-text"]').fill('Lumi 品牌')
    await page.waitForSelector('.wm__mark', { timeout: 10000 })
    await page.screenshot({ path: join(shots, 'flow-watermark-preview.png') })

    // 8. Subtitle tool is usable without an install step
    await go('#/plugins/video-batch-subtitle')
    await page.waitForTimeout(1500)
    assert.equal(await page.locator('.plugin-lock-panel').count(), 0, 'subtitle tool is not locked')

    // 9. English locale: new UI has no Chinese leftovers in nav and toolbox
    const setLocale = async (locale) => {
      await page.evaluate((value) => {
        const key = 'videogenerate-app-settings'
        const current = JSON.parse(localStorage.getItem(key) || '{}')
        localStorage.setItem(key, JSON.stringify({ ...current, locale: value }))
      }, locale)
      await page.reload()
      await page.waitForTimeout(1500)
    }
    await setLocale('en-US')
    await go('#/plugins')
    const toolboxText = await page.locator('[data-testid="toolbox"]').innerText()
    assert.ok(!/[一-鿿]/.test(toolboxText), `toolbox has Chinese text in English mode: ${toolboxText.match(/[一-鿿]+/g)}`)
    const navText = await page.locator('[data-testid="app-sidebar"] .vg-nav__list').innerText()
    assert.ok(!/[一-鿿]/.test(navText), `sidebar has Chinese text in English mode: ${navText.match(/[一-鿿]+/g)}`)
    await go('#/home')
    await page.waitForSelector('[data-testid="home-view"]')
    await page.screenshot({ path: join(shots, 'flow-home-en.png') })
    await setLocale('zh-CN')

    const relevant = errors.filter((text) => !/favicon/i.test(text))
    assert.deepEqual(relevant, [], `renderer errors:\n${relevant.join('\n')}`)
    console.log('ui flows e2e: ok')
  } finally {
    await app.close().catch(() => undefined)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
