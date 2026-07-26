const assert = require('node:assert/strict')
const { existsSync } = require('node:fs')
const { mkdir, mkdtemp, rm, writeFile } = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { _electron: electron } = require('playwright')

async function main() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'videogenerate-storage-ui-'))
  const userData = path.join(root, 'userData')
  const dataDir = path.join(userData, '.videogenerate')
  const profileDir = path.join(root, 'hermes-profile')
  const runtimeRoot = path.join(root, 'hermes-runtime', 'hermes-agent')
  const cacheFile = path.join(dataDir, 'cache', 'safe-cache.bin')
  const previewFile = path.join(dataDir, 'batch-subtitle-preview', 'preview.bin')
  const completedFile = path.join(dataDir, 'exports', 'completed.bin')
  const artifacts = path.join(process.cwd(), 'test-artifacts')
  await mkdir(path.dirname(cacheFile), { recursive: true })
  await mkdir(path.dirname(previewFile), { recursive: true })
  await mkdir(path.dirname(completedFile), { recursive: true })
  await mkdir(profileDir, { recursive: true })
  await mkdir(artifacts, { recursive: true })
  await writeFile(cacheFile, Buffer.alloc(2048))
  await writeFile(previewFile, Buffer.alloc(4096))
  await writeFile(completedFile, Buffer.alloc(8192))

  const app = await electron.launch({
    args: ['.'],
    cwd: process.cwd(),
    env: {
      ...process.env,
      VIDEOGENERATE_USER_DATA_DIR: userData,
      VIDEOGENERATE_DATA_DIR: dataDir,
      VIDEOGENERATE_HERMES_PROFILE_DIR: profileDir,
      VIDEOGENERATE_HERMES_ROOT: runtimeRoot,
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
    },
    timeout: 60_000,
  })

  try {
    const page = await app.firstWindow()
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1440, 900))
    await page.evaluate(() => { window.location.hash = '#/settings' })
    await page.waitForSelector('[data-settings-section="storage-management"]', { timeout: 60_000 })
    const storageOpenStartedAt = Date.now()
    await page.locator('[data-settings-section="storage-management"]').click()
    await page.waitForSelector('[data-storage-category="safe_cache"]', { timeout: 60_000 })
    const initialRowsMs = Date.now() - storageOpenStartedAt
    assert.ok(initialRowsMs < 2000, `Storage rows took ${initialRowsMs}ms to render`)
    assert.equal(await page.locator('[data-storage-category]').count(), 10)

    const safeRow = page.locator('[data-storage-category="safe_cache"]')
    await page.waitForFunction(() => !document.querySelector('[data-storage-category="safe_cache"] .row-scanning'))
    assert.match(await safeRow.innerText(), /KB|MB|GB/)
    await safeRow.locator('.cleanup-button').click()
    await page.waitForSelector('.storage-modal')
    assert.equal(await page.locator('.confirm-check').count(), 0)
    await page.locator('.storage-modal .danger').click()
    await page.waitForSelector('.storage-notice.success', { timeout: 60_000 })
    assert.equal(existsSync(cacheFile), false)

    const previewRow = page.locator('[data-storage-category="preview_files"]')
    await previewRow.locator('.cleanup-button').click()
    await page.waitForSelector('.storage-modal .confirm-check')
    assert.equal(await page.locator('.storage-modal .danger').isDisabled(), true)
    await page.locator('.confirm-check input').check()
    assert.equal(await page.locator('.storage-modal .danger').isEnabled(), true)
    await page.locator('.storage-modal .secondary').click()
    assert.equal(existsSync(previewFile), true)

    const completedRow = page.locator('[data-storage-category="completed_project_artifacts"]')
    await completedRow.locator('.cleanup-button').click()
    await page.waitForSelector('.storage-modal .typed-confirmation')
    await page.locator('.confirm-check input').check()
    assert.equal(await page.locator('.storage-modal .danger').isDisabled(), true)
    await page.locator('.typed-confirmation input').fill('DELETE completed_project_artifacts')
    assert.equal(await page.locator('.storage-modal .danger').isEnabled(), true)
    await page.locator('.storage-modal .secondary').click()
    assert.equal(existsSync(completedFile), true)

    const protectedRow = page.locator('[data-storage-category="managed_source_assets"]')
    assert.equal(await protectedRow.locator('.cleanup-button').isDisabled(), true)

    await page.screenshot({ path: path.join(artifacts, 'storage-management-desktop.png') })
    const desktopMetrics = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      rows: [...document.querySelectorAll('.storage-row')].map((element) => {
        const rect = element.getBoundingClientRect()
        return { left: rect.left, right: rect.right }
      }),
    }))
    assert.equal(desktopMetrics.scrollWidth, desktopMetrics.width)
    assert.ok(desktopMetrics.rows.every((row) => row.left >= 0 && row.right <= desktopMetrics.width))

    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(760, 720))
    await page.waitForTimeout(300)
    await page.screenshot({ path: path.join(artifacts, 'storage-management-narrow.png') })
    const narrowMetrics = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      panel: (() => {
        const rect = document.querySelector('.storage-management-panel').getBoundingClientRect()
        return { left: rect.left, right: rect.right }
      })(),
    }))
    assert.equal(narrowMetrics.scrollWidth, narrowMetrics.width)
    assert.ok(narrowMetrics.panel.left >= 0 && narrowMetrics.panel.right <= narrowMetrics.width)

    console.log(JSON.stringify({ initialRowsMs, desktopMetrics, narrowMetrics }))
    console.log('storage-management.e2e: ok')
  } finally {
    await app.close().catch(() => undefined)
    await rm(root, { recursive: true, force: true }).catch(() => undefined)
  }
}

void main()
