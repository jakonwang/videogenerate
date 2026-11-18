/**
 * Drives the built Electron app: Feishu push settings (validation, persistence) and the
 * autopilot recipe's opt-in listing-copy fields. No external service is contacted.
 * Usage: VG_LICENSE_MODE=off npx electron-vite build && node test/automation-feishu-ui.e2e.cjs [screenshotDir]
 */
const assert = require('node:assert/strict')
const { mkdtemp, mkdir } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { _electron: electron } = require('playwright')

async function main() {
  const root = await mkdtemp(join(tmpdir(), 'videogenerate-feishu-ui-'))
  const shots = process.argv[2] || join(root, 'shots')
  await mkdir(shots, { recursive: true })
  const errors = []
  const app = await electron.launch({
    args: ['.'],
    cwd: join(__dirname, '..'),
    env: { ...process.env, VIDEOGENERATE_USER_DATA_DIR: root, VIDEOGENERATE_DATA_DIR: join(root, 'data') },
  })
  try {
    const page = await app.firstWindow()
    page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
    page.on('console', (message) => {
      if (message.type() === 'error' && !/Electron Security Warning|DevTools|Autofill/i.test(message.text())) errors.push(message.text())
    })
    await page.waitForLoadState('domcontentloaded')
    const go = async (hash) => {
      await page.evaluate((value) => { window.location.hash = value }, hash)
      await page.waitForTimeout(900)
    }

    // Feishu settings: collapsed by default, invalid URL rejected, valid URL persists.
    await go('#/settings?section=automation')
    await page.waitForSelector('[data-testid="settings-ai-automation"]')
    assert.equal(await page.locator('[data-testid="feishu-config"]').count(), 0, 'config is folded away until needed')
    await page.locator('[data-testid="feishu-toggle"]').click()
    const config = page.locator('[data-testid="feishu-config"]')
    await config.waitFor()
    await config.locator('input[type="url"]').fill('https://example.com/hook')
    await page.locator('[data-testid="settings-ai-automation"] .vg-btn--primary').click()
    await page.waitForSelector('[data-testid="settings-ai-automation"] .vg-pill--red')
    const saved0 = await page.evaluate(async () => await window.api.contentHub.getAutomationSettings())
    assert.equal(saved0.feishu.enabled, false, 'invalid URL is not saved')

    await config.locator('input[type="url"]').fill('https://open.feishu.cn/open-apis/bot/v2/hook/test-hook')
    await config.locator('input[type="password"]').fill('sig')
    await page.locator('[data-testid="settings-ai-automation"] .vg-btn--primary').click()
    await page.waitForSelector('[data-testid="settings-ai-automation"] .vg-pill--green')
    const saved = await page.evaluate(async () => await window.api.contentHub.getAutomationSettings())
    assert.equal(saved.feishu.enabled, true)
    assert.equal(saved.feishu.webhookUrl, 'https://open.feishu.cn/open-apis/bot/v2/hook/test-hook')
    assert.equal(saved.feishu.secret, 'sig')
    const text = await page.locator('[data-testid="settings-ai-automation"]').innerText()
    assert.ok(!/ai\.automation\./.test(text), 'no untranslated keys')
    await page.screenshot({ path: join(shots, '01-feishu-settings.png') })

    // Autopilot recipe: listing copy is off by default; switching it on asks for a price.
    await go('#/home')
    await page.waitForSelector('[data-testid="home-autopilot-start"]')
    await page.locator('[data-testid="home-autopilot-start"]').click()
    await page.waitForSelector('[data-testid="ai-recipe-submit"]')
    const form = page.locator('.ai-recipe-form')
    const before = await form.innerText()
    assert.ok(before.includes('同时生成上架文案和主图'), 'listing toggle is shown')
    assert.ok(!before.includes('本地展示价'), 'price field hidden until listing is on')
    await form.locator('.vg-field', { hasText: '同时生成上架文案和主图' }).locator('.vg-switch, button').first().click()
    await page.waitForTimeout(300)
    const after = await form.innerText()
    assert.ok(after.includes('本地展示价') && after.includes('标题语言'), 'price and language appear')
    assert.ok(!/ai\.(fields|recipes)\./.test(after), 'no untranslated keys in the form')
    await form.locator('.vg-field', { hasText: '本地展示价' }).scrollIntoViewIfNeeded()
    await page.screenshot({ path: join(shots, '02-autopilot-listing.png') })

    assert.deepEqual(errors, [], `renderer errors: ${errors.join('\n')}`)
    console.log(`automation-feishu-ui e2e: ok (screenshots in ${shots})`)
  } finally {
    await app.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
