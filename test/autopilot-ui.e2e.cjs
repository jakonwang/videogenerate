/**
 * Drives the built Electron app through the autopilot entry points:
 * workbench pipeline strip → autopilot recipe form → plan card (not approved, so no model is called).
 * Usage: VG_LICENSE_MODE=off npx electron-vite build && node test/autopilot-ui.e2e.cjs [screenshotDir]
 */
const assert = require('node:assert/strict')
const { mkdtemp, mkdir, rm } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { _electron: electron } = require('playwright')

async function main() {
  const root = await mkdtemp(join(tmpdir(), 'videogenerate-autopilot-ui-'))
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

    // Workbench: the pipeline strip shows all seven stations in order.
    await page.waitForSelector('[data-testid="home-autopilot"]')
    const stages = await page.locator('[data-testid^="home-autopilot-stage-"]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-testid').replace('home-autopilot-stage-', '')))
    assert.deepEqual(stages, ['research', 'product', 'reference', 'video', 'review', 'publish', 'insights'])
    const strip = await page.locator('[data-testid="home-autopilot"]').innerText()
    for (const label of ['全自动打爆流水线', '选品', '建商品', '找爆款', '出成片', '质检', '排期', '复盘', '启动全自动']) {
      assert.ok(strip.includes(label), `pipeline strip shows ${label}`)
    }
    assert.ok(!/ai\.home\./.test(strip), 'no untranslated keys on the strip')
    // Nothing overflows the card horizontally.
    const overflow = await page.locator('[data-testid="home-autopilot"]').evaluate((node) => node.scrollWidth - node.clientWidth)
    assert.ok(overflow <= 1, `pipeline strip does not overflow (${overflow}px)`)
    await page.screenshot({ path: join(shots, '01-home-autopilot.png') })

    // A station opens its workspace.
    await page.locator('[data-testid="home-autopilot-stage-review"]').click()
    await page.waitForFunction(() => window.location.hash.startsWith('#/inbox'))
    await page.evaluate(() => { window.location.hash = '#/home' })
    await page.waitForSelector('[data-testid="home-autopilot"]')

    // Start autopilot: with no research scheme the form falls back to the product library.
    await page.evaluate(async () => await window.api.products.upsert({ name: '珍珠耳环 Pearl', type: 'earring' }))
    await page.locator('[data-testid="home-autopilot-start"]').click()
    await page.waitForSelector('[data-testid="ai-recipe-submit"]')
    const form = page.locator('.ai-recipe-form')
    await page.waitForFunction(() => Array.from(document.querySelectorAll('.ai-recipe-form .vg-chip')).some((node) => node.textContent.includes('珍珠耳环')))
    const formText = await form.innerText()
    for (const label of ['全自动打爆', '商品从哪里来', '参考爆款视频', '每个商品参考几条爆款', '成片自动通过审核并生成发布草稿']) {
      assert.ok(formText.includes(label), `form shows ${label}`)
    }
    assert.ok(!/ai\.(fields|recipes)\./.test(formText), 'no untranslated keys in the form')
    assert.ok(!formText.includes('每条间隔'), 'schedule fields stay hidden until auto-approval is on')
    await page.screenshot({ path: join(shots, '02-autopilot-form.png') })

    // Required product is enforced, then the plan card lists the whole pipeline.
    await page.locator('[data-testid="ai-recipe-submit"]').click()
    await page.waitForSelector('.ai-recipe-form .vg-field__error')
    await form.locator('.vg-chip', { hasText: '珍珠耳环' }).click()
    await page.locator('[data-testid="ai-recipe-submit"]').click()
    await page.waitForSelector('[data-testid="ai-plan-approve"]', { timeout: 20000 }).catch(async (error) => {
      await page.screenshot({ path: join(shots, 'failure.png') })
      console.log('ERRORS', errors.join(' | '))
      console.log('PANEL', await page.locator('[data-testid="ai-producer-panel"]').innerText().catch(() => ''))
      throw error
    })
    const steps = await page.locator('[data-testid="ai-plan-card"] .ai-plan__step-title').allInnerTexts()
    assert.equal(steps.length, 8, `plan has 8 steps: ${steps.join(' | ')}`)
    for (const [index, label] of ['系统体检', '商品识别分析', '自动挑选参考爆款', '复刻视频', '分镜送去', '等待出片完成', '送入审核收件箱', '内容复盘'].entries()) {
      assert.ok(steps[index].includes(label), `step ${index + 1} is ${label}, got ${steps[index]}`)
    }
    await page.screenshot({ path: join(shots, '03-autopilot-plan.png') })

    // English UI has no leftover Chinese on the strip.
    await page.locator('[data-testid="ai-panel-close"]').click()
    await page.evaluate(async () => await window.api.setLocale?.('en-US'))
    const english = await page.evaluate(() => {
      const i18n = document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$i18n
      if (!i18n) return null
      i18n.locale = 'en-US'
      return true
    })
    if (english) {
      await page.waitForFunction(() => document.querySelector('[data-testid="home-autopilot"]')?.textContent.includes('Autopilot pipeline'))
      const englishStrip = await page.locator('[data-testid="home-autopilot"]').innerText()
      assert.ok(!/[一-鿿]/.test(englishStrip), `no Chinese left in English strip: ${englishStrip}`)
      await page.screenshot({ path: join(shots, '04-home-autopilot-en.png') })
    }

    assert.deepEqual(errors, [], `renderer errors: ${errors.join('\n')}`)
    console.log(`autopilot ui e2e: ok (screenshots in ${shots})`)
  } finally {
    await app?.close().catch(() => undefined)
    await rm(root, { recursive: true, force: true }).catch(() => undefined)
  }
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(error)
  process.exit(1)
})
