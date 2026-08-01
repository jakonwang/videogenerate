const assert = require('node:assert/strict')
const path = require('node:path')
const { mkdir, writeFile } = require('node:fs/promises')
const { _electron: electron } = require('playwright')

async function captureWindow(electronApp, outputPath) {
  const base64 = await electronApp.evaluate(async ({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows().find((item) => item.isVisible()) || BrowserWindow.getAllWindows()[0]
    if (!window) throw new Error('Electron window is unavailable')
    return (await window.capturePage()).toPNG().toString('base64')
  })
  await writeFile(outputPath, Buffer.from(base64, 'base64'))
}

async function main() {
  const root = path.resolve(__dirname, '..')
  const artifacts = path.join(root, 'test-artifacts', 'tiktok-gmv-max-help')
  const userData = path.join(artifacts, 'user-data')
  const appData = path.join(artifacts, 'app-data')
  await Promise.all([mkdir(artifacts, { recursive: true }), mkdir(userData, { recursive: true }), mkdir(appData, { recursive: true })])

  const electronApp = await electron.launch({
    args: ['.'],
    cwd: root,
    env: {
      ...process.env,
      VIDEOGENERATE_USER_DATA_DIR: userData,
      VIDEOGENERATE_DATA_DIR: appData,
    },
  })
  const page = await electronApp.firstWindow()
  page.setDefaultTimeout(60_000)
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(error.message))

  try {
    await page.waitForLoadState('domcontentloaded')
    await page.evaluate(() => { window.location.hash = '#/plugins/tiktok-gmv-max-optimizer' })
    await page.locator('[data-testid="gmv-max-workspace"]').waitFor({ state: 'visible' })

    await page.setViewportSize({ width: 1440, height: 900 })
    await page.locator('[data-testid="gmv-tab-help"]').click()
    await page.locator('[data-testid="gmv-help-center"]').waitFor({ state: 'visible' })
    assert.equal(await page.locator('[data-testid="gmv-feature-nav"] .gmv-tab').count(), 10)
    assert.equal(await page.locator('.gmv-commandbar').count(), 0)
    assert.equal(await page.locator('[data-testid="gmv-catalog-strip"]').count(), 0)
    assert.equal((await page.locator('[data-testid="gmv-help-center"]').innerText()).includes('gmvMaxHelp.'), false)
    assert.equal(await page.locator('.help-directory button').count(), 14)
    await captureWindow(electronApp, path.join(artifacts, 'help-center-1440x900.png'))

    const search = page.locator('[data-testid="gmv-help-search"]')
    await search.fill('ROI')
    const results = page.locator('.help-directory button')
    assert.ok(await results.count() > 0)
    await results.first().click()
    assert.equal((await page.locator('[data-testid="gmv-help-article"]').innerText()).includes('gmvMaxHelp.'), false)
    await page.locator('[data-testid="gmv-help-use"], [data-testid="gmv-help-issue-use"]').click()
    assert.equal(await page.locator('[data-testid="gmv-tab-help"]').evaluate((element) => element.classList.contains('is-active')), false)

    await page.locator('[data-testid="gmv-tab-help"]').click()
    await search.fill('')
    await page.setViewportSize({ width: 1280, height: 760 })
    await page.waitForFunction(() => {
      const workspace = document.querySelector('.ds-workspace')
      return !workspace || workspace.scrollTop === 0
    })
    const fit = await page.evaluate(() => {
      const center = document.querySelector('[data-testid="gmv-help-center"]')
      const layout = document.querySelector('.help-layout')
      const centerBox = center?.getBoundingClientRect()
      const layoutBox = layout?.getBoundingClientRect()
      return {
        centerWidth: centerBox?.width || 0,
        layoutWidth: layoutBox?.width || 0,
        viewportWidth: window.innerWidth,
        documentOverflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      }
    })
    assert.equal(fit.documentOverflowX, false)
    assert.ok(fit.centerWidth > 0 && fit.centerWidth <= fit.viewportWidth)
    assert.ok(fit.layoutWidth > 0 && fit.layoutWidth <= fit.viewportWidth)
    await captureWindow(electronApp, path.join(artifacts, 'help-center-1280x760.png'))

    for (const locale of [
      { id: 'en-US', title: 'Help Center' },
      { id: 'vi-VN', title: 'Trung tâm trợ giúp' },
      { id: 'zh-CN', title: '帮助中心' },
    ]) {
      await page.evaluate((localeId) => {
        const key = 'videogenerate-app-settings'
        const current = JSON.parse(localStorage.getItem(key) || '{}')
        localStorage.setItem(key, JSON.stringify({ ...current, locale: localeId }))
      }, locale.id)
      await page.reload({ waitUntil: 'domcontentloaded' })
      await page.evaluate(() => { window.location.hash = '#/plugins/tiktok-gmv-max-optimizer' })
      await page.locator('[data-testid="gmv-tab-help"]').click()
      await page.locator('[data-testid="gmv-help-center"]').waitFor({ state: 'visible' })
      assert.equal((await page.locator('.help-hero h2').innerText()).trim(), locale.title)
      assert.equal((await page.locator('[data-testid="gmv-help-center"]').innerText()).includes('gmvMaxHelp.'), false)
      if (locale.id === 'vi-VN') await captureWindow(electronApp, path.join(artifacts, 'help-center-vi-1280x760.png'))
    }
    assert.deepEqual(pageErrors, [])
  } finally {
    await electronApp.close()
  }

  console.log('TikTok GMV MAX help center Electron tests passed')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
