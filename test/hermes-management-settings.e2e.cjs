const assert = require('node:assert/strict')
const { mkdir, mkdtemp, rm } = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { _electron: electron } = require('playwright')

async function main() {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'videogenerate-hermes-settings-'))
  const artifacts = path.join(process.cwd(), 'test-artifacts')
  await mkdir(artifacts, { recursive: true })
  const app = await electron.launch({
    args: ['.'],
    cwd: process.cwd(),
    env: { ...process.env, VIDEOGENERATE_DATA_DIR: dataDir, ELECTRON_DISABLE_SECURITY_WARNINGS: 'true' },
    timeout: 60_000,
  })

  try {
    const page = await app.firstWindow()
    await page.waitForSelector('.hermes-workspace', { timeout: 60_000 })
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1600, 900))
    await page.evaluate(() => { window.location.hash = '#/settings' })
    await page.waitForSelector('.settings-layout', { timeout: 60_000 })

    const navigationItems = page.locator('[data-settings-section]')
    assert.equal(await navigationItems.count(), 9)
    assert.equal(await page.locator('.nav-group').count(), 4)
    assert.equal(await page.locator('.theme-option').count(), 4)
    assert.equal(await page.locator('.access-key-field input').getAttribute('type'), 'password')

    const themes = ['dark-teal', 'soft-mint', 'warm-paper', 'clear-sky']
    for (let index = 0; index < themes.length; index += 1) {
      await page.locator('.theme-option').nth(index).click()
      assert.equal(await page.evaluate(() => document.documentElement.dataset.appTheme), themes[index])
    }
    await page.locator('.theme-option').nth(2).click()

    await page.locator('[data-settings-section="platforms"]').click()
    await page.waitForSelector('.platform-grid')
    await page.locator('[data-settings-section="capabilities"]').click()
    await page.waitForSelector('.capability-stack')

    await page.locator('[data-settings-section="hermes-runtime"]').click()
    await page.waitForSelector('.hermes-center')

    const tabs = page.locator('.hermes-tabs button')
    assert.equal(await tabs.count(), 2)
    const metrics = page.locator('.runtime-metrics > div')
    assert.equal(await metrics.count(), 4)
    await page.waitForFunction(() => {
      const currentVersion = document.querySelector('.runtime-metrics > div strong')
      return String(currentVersion?.textContent || '').trim() === '0.17.0'
    }, null, { timeout: 30_000 })
    assert.equal(await page.locator('.hermes-message').count(), 0)
    assert.equal(await page.locator('.hermes-content.runtime-content .primary-button').count(), 0)
    await page.screenshot({ path: path.join(artifacts, 'hermes-management-runtime.png') })
    await page.waitForFunction(() => {
      const paths = [...document.querySelectorAll('.path-list span')]
      return paths.length === 2 && paths.every((item) => String(item.textContent || '').trim().length > 0)
    }, null, { timeout: 30_000 })

    await tabs.nth(1).click()
    await page.waitForSelector('.hermes-content.form-content')
    const apiKeyInput = page.locator('.hermes-content.form-content input[type="password"]')
    assert.equal(await apiKeyInput.inputValue(), '')

    await page.locator('[data-settings-section="hermes-skills"]').click()
    await page.waitForSelector('.search-row')
    assert.equal(await page.locator('.hermes-tabs').count(), 0)
    await page.locator('.search-row .ghost-button').click()
    await page.waitForFunction(() => String(document.querySelector('.hermes-message')?.textContent || '').trim().length > 0)
    const skillActionMessage = await page.locator('.hermes-message').innerText()
    assert.doesNotMatch(skillActionMessage, /Cannot read properties|reading ['"]api['"]/i)

    await page.locator('[data-settings-section="hermes-channels"]').click()
    await page.waitForSelector('.channel-list')
    await page.waitForFunction(() => document.querySelectorAll('.channel-list button').length >= 4, null, { timeout: 30_000 })
    const channelCount = await page.locator('.channel-list button').count()
    assert.ok(channelCount >= 4)
    const secretInputs = page.locator('.hermes-channel-layout input[type="password"]')
    for (let index = 0; index < await secretInputs.count(); index += 1) {
      assert.equal(await secretInputs.nth(index).inputValue(), '')
    }

    await page.locator('[data-settings-section="hermes-data"]').click()
    const dataTabs = page.locator('.hermes-tabs button')
    assert.equal(await dataTabs.count(), 3)
    await page.waitForSelector('.hermes-log')
    await dataTabs.nth(1).click()
    await page.waitForSelector('.management-list')
    await dataTabs.nth(2).click()
    await page.waitForSelector('.hermes-log')
    const diagnosticText = await page.locator('.hermes-log').innerText()
    assert.doesNotMatch(diagnosticText, /app_secret\s*[:=]\s*["'][^"']+/i)
    assert.doesNotMatch(diagnosticText, /api[_-]?key\s*[:=]\s*["'][^"']+/i)

    await page.locator('[data-settings-section="appearance"]').click()
    await page.waitForSelector('.theme-grid')
    await page.screenshot({ path: path.join(artifacts, 'hermes-management-settings.png') })

    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(680, 720))
    await page.waitForTimeout(300)
    const narrow = await page.evaluate(() => {
      const layout = document.querySelector('.settings-layout').getBoundingClientRect()
      return {
        width: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        layout: { left: layout.left, right: layout.right },
      }
    })
    assert.equal(narrow.scrollWidth, narrow.width)
    assert.ok(narrow.layout.left >= 0 && narrow.layout.right <= narrow.width)
    await page.screenshot({ path: path.join(artifacts, 'hermes-management-settings-narrow.png') })

    console.log(JSON.stringify({ navigationItems: 9, groups: 4, channels: channelCount, narrow }))
    console.log('hermes-management-settings.e2e: ok')
  } finally {
    await app.close().catch(() => undefined)
    await rm(dataDir, { recursive: true, force: true })
  }
}

void main()
