const assert = require('node:assert/strict')
const { mkdtemp, rm } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { _electron: electron } = require('playwright')

async function main() {
  const userDataDir = await mkdtemp(join(tmpdir(), 'product-replacement-ui-'))
  let app
  try {
    app = await electron.launch({
      args: ['.'],
      cwd: join(__dirname, '..'),
      env: { ...process.env, VIDEOGENERATE_USER_DATA_DIR: userDataDir },
      timeout: 60000,
    })
    const window = await app.firstWindow()
    await window.evaluate(() => { window.location.hash = '#/plugins/product-replacement' })
    const section = window.locator('.prompt-section')
    await section.waitFor({ timeout: 30000 })
    await section.locator('select option').first().waitFor({ state: 'attached', timeout: 30000 })

    const prompt = await section.locator('textarea').inputValue()
    assert.match(prompt, /Image 1 is the scene to edit/)
    assert.match(await section.locator('select').inputValue(), /.+/)
    assert.equal(await section.locator('.prompt-error').count(), 0)

    const icon = section.locator('.prompt-select-wrap svg')
    assert.equal(await icon.isVisible(), true)
    const iconStyle = await icon.evaluate((element) => ({
      color: getComputedStyle(element).color,
      width: element.getBoundingClientRect().width,
    }))
    assert.ok(iconStyle.width >= 14)
    assert.notEqual(iconStyle.color, 'rgba(0, 0, 0, 0)')
    await section.screenshot({ path: join(tmpdir(), 'product-replacement-prompt-qa.png') })
    if (process.env.QA_LAYOUT) {
      await window.screenshot({ path: join(tmpdir(), 'product-replacement-layout-qa.png') })
      const layout = await window.evaluate(() => {
        const page = document.querySelector('.replacement-page')
        const rect = (selector) => {
          const bounds = document.querySelector(selector)?.getBoundingClientRect()
          return bounds && { top: Math.round(bounds.top), bottom: Math.round(bounds.bottom), width: Math.round(bounds.width), height: Math.round(bounds.height) }
        }
        return { viewport: [innerWidth, innerHeight], pageScroll: [page?.clientHeight, page?.scrollHeight], hero: rect('.hero-banner'), workspace: rect('.workspace-grid'), results: rect('.results-section'), product: rect('.setup-column .content-card:first-child'), scene: rect('.setup-column .content-card:nth-child(2)'), prompt: rect('.prompt-section') }
      })
      console.log('layout:', layout)
      assert.equal(layout.pageScroll[0], layout.pageScroll[1])
      assert.ok(layout.hero.bottom < layout.workspace.top)
      assert.equal(layout.product.top, layout.scene.top)
      assert.ok(layout.prompt.top >= layout.product.bottom)
      assert.ok(layout.results.top >= layout.workspace.bottom)
      assert.ok(layout.results.bottom <= layout.viewport[1])
      await window.setViewportSize({ width: 780, height: 720 })
      await window.screenshot({ path: join(tmpdir(), 'product-replacement-narrow-qa.png') })
      const narrow = await window.evaluate(() => {
        const setup = document.querySelector('.setup-column').getBoundingClientRect()
        const confirm = document.querySelector('.confirm-column').getBoundingClientRect()
        return { setupBottom: setup.bottom, confirmTop: confirm.top, documentWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth }
      })
      assert.ok(narrow.confirmTop >= narrow.setupBottom)
      assert.ok(narrow.documentWidth <= narrow.viewportWidth)
    }

    await section.getByRole('button', { name: /version|\u7248\u672c|phien ban/i }).first().click()
    assert.equal(await window.locator('.prompt-drawer .version-row').count(), 1)
    await window.locator('.prompt-drawer .drawer-head button').click()
    assert.equal(await window.locator('.prompt-drawer').count(), 0)

    await window.evaluate(() => localStorage.setItem('product-replacement-prompt-draft', JSON.stringify({ prompt: '' })))
    await window.reload()
    await window.locator('.prompt-section select option').first().waitFor({ state: 'attached' })
    assert.match(await window.locator('.prompt-section textarea').inputValue(), /Image 1 is the scene to edit/)
    console.log('product-replacement prompt UI passed')
  } finally {
    await app?.close().catch(() => {})
    await rm(userDataDir, { recursive: true, force: true })
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
