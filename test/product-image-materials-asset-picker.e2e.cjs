const assert = require('node:assert/strict')
const { mkdtemp, mkdir, rm, writeFile } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { _electron: electron } = require('playwright')
const sharp = require('sharp')

async function main() {
  const projectRoot = join(__dirname, '..')
  const runtimeRoot = await mkdtemp(join(tmpdir(), 'videogenerate-product-assets-'))
  const dataDir = join(runtimeRoot, 'data')
  const libraryDir = join(dataDir, 'asset-library')
  const filesDir = join(libraryDir, 'files')
  const imagePath = join(filesDir, 'qa-image.png')
  const videoPath = join(filesDir, 'qa-video.mp4')
  const screenshotPath = join(tmpdir(), 'product-image-materials-asset-picker.png')
  const pickerScreenshotPath = join(tmpdir(), 'product-image-materials-video-picker.png')
  const emptySourceScreenshotPath = join(tmpdir(), 'product-image-materials-source-empty.png')
  let app

  try {
    await mkdir(filesDir, { recursive: true })
    await writeFile(imagePath, await sharp({ create: { width: 640, height: 480, channels: 3, background: '#21a78f' } }).png().toBuffer())
    await writeFile(videoPath, Buffer.from('test-video'))
    await writeFile(join(libraryDir, 'index.json'), JSON.stringify([
      { id: 'qa-image', name: 'qa-image.png', fileName: 'qa-image.png', filePath: imagePath, type: 'image', mimeType: 'image/png', size: 1, source: 'desktop', createdAt: Date.now() - 1000 },
      { id: 'qa-video', name: 'qa-video.mp4', fileName: 'qa-video.mp4', filePath: videoPath, type: 'video', mimeType: 'video/mp4', size: 10, source: 'desktop', createdAt: Date.now() },
    ], null, 2), 'utf8')

    app = await electron.launch({
      args: ['.'],
      cwd: projectRoot,
      env: {
        ...process.env,
        VIDEOGENERATE_USER_DATA_DIR: runtimeRoot,
        VIDEOGENERATE_DATA_DIR: dataDir,
      },
    })
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1600, 1000))
    await page.evaluate(() => { location.hash = '#/plugins/product-image-materials' })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector('[data-testid="product-image-materials-title"]', { timeout: 30000 })

    const localeSelect = page.locator('[data-testid="app-locale-select"]')
    await localeSelect.selectOption('zh-CN')
    await assertText(page, '[data-testid="product-image-materials-title"]', '\u5546\u54c1\u56fe\u7247\u7d20\u6750')
    const columns = await page.locator('.pick-row--three').evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length)
    assert.equal(columns, 3)

    await page.locator('[data-testid="product-image-materials-library-videos"]').click()
    await page.locator('[data-testid="asset-library-picker"]').waitFor()
    await page.locator('[data-testid="asset-picker-select-qa-video"]').waitFor()
    assert.equal(await page.locator('[data-testid="asset-picker-select-qa-image"]').count(), 0)
    await assertText(page, '[data-testid="asset-picker-usage-qa-video"]', '\u672a\u4f7f\u7528')
    await page.locator('[data-testid="asset-picker-usage-qa-video"]').click()
    await assertText(page, '[data-testid="asset-picker-usage-qa-video"]', '\u5df2\u4f7f\u7528')
    await page.screenshot({ path: pickerScreenshotPath, type: 'png' })
    await page.locator('[data-testid="asset-picker-usage-filter-used"]').click()
    await page.locator('[data-testid="asset-picker-select-qa-video"]').waitFor()
    await page.locator('[data-testid="asset-picker-usage-filter-unused"]').click()
    await page.locator('[data-testid="asset-picker-select-qa-video"]').waitFor({ state: 'hidden' })
    await page.locator('[data-testid="asset-picker-usage-filter-all"]').click()
    await page.locator('[data-testid="asset-picker-usage-qa-video"]').click()
    await assertText(page, '[data-testid="asset-picker-usage-qa-video"]', '\u672a\u4f7f\u7528')
    await page.locator('[data-testid="asset-picker-select-qa-video"]').click()
    await page.locator('[data-testid="asset-picker-confirm"]').click()
    await page.locator('[data-testid="asset-library-picker"]').waitFor({ state: 'hidden' })
    await page.locator('.picked-list').getByText('qa-video.mp4').waitFor()

    const videoUsage = await page.evaluate(async () => {
      const items = await window.api.assetLibrary.list({ type: 'video' })
      return items[0]?.pluginUsage?.['product-image-materials']
    })
    assert.equal(videoUsage, 'used')

    await page.locator('.tab-button').filter({ hasText: '\u56fe\u751f\u56fe' }).click()
    const emptyPanelSize = await page.locator('.source-picker-panel').evaluate((element) => {
      const panel = element.getBoundingClientRect()
      const preview = element.querySelector('.source-picker-preview')?.getBoundingClientRect()
      return { panelHeight: panel.height, previewWidth: preview?.width, previewHeight: preview?.height }
    })
    assert.ok(emptyPanelSize.panelHeight <= 172)
    assert.equal(emptyPanelSize.previewWidth, emptyPanelSize.previewHeight)
    const localButtonColors = await page.locator('[data-testid="product-image-materials-local-image"]').evaluate((element) => ({
      background: getComputedStyle(element).backgroundColor,
      text: getComputedStyle(element.querySelector('span')).color,
    }))
    assert.equal(localButtonColors.background, 'rgb(13, 117, 104)')
    assert.equal(localButtonColors.text, 'rgb(255, 255, 255)')
    await page.screenshot({ path: emptySourceScreenshotPath, type: 'png' })
    await page.locator('[data-testid="product-image-materials-library-image"]').click()
    await page.locator('[data-testid="asset-picker-select-qa-image"]').waitFor()
    assert.equal(await page.locator('[data-testid="asset-picker-select-qa-video"]').count(), 0)
    await page.locator('[data-testid="asset-picker-select-qa-image"]').click()
    await page.locator('[data-testid="asset-picker-confirm"]').click()
    await page.locator('.source-picker-panel').getByText('qa-image.png').waitFor()
    await page.locator('[data-testid="product-image-materials-source-preview"] img').waitFor()
    await page.locator('[data-testid="product-image-materials-clear-image"]').click()
    await page.locator('[data-testid="product-image-materials-source-preview"] img').waitFor({ state: 'hidden' })
    await page.locator('[data-testid="product-image-materials-library-image"]').click()
    await page.locator('[data-testid="asset-picker-select-qa-image"]').click()
    await page.locator('[data-testid="asset-picker-confirm"]').click()
    await page.locator('[data-testid="product-image-materials-source-preview"] img').waitFor()

    await localeSelect.selectOption('en-US')
    await assertText(page, '[data-testid="product-image-materials-title"]', 'Product Image Materials')
    await localeSelect.selectOption('vi-VN')
    await assertText(page, '[data-testid="product-image-materials-title"]', 'Tu lieu hinh anh san pham')
    await localeSelect.selectOption('zh-CN')
    await page.screenshot({ path: screenshotPath, type: 'png' })

    const viewport = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }))
    assert.ok(viewport.scrollWidth <= viewport.width)
    console.log(JSON.stringify({ screenshotPath, pickerScreenshotPath, emptySourceScreenshotPath, columns, videoUsage }))
  } finally {
    if (app) await app.close().catch(() => {})
    await rm(runtimeRoot, { recursive: true, force: true })
  }
}

async function assertText(page, selector, expected) {
  await page.waitForFunction(({ selector, expected }) => {
    return String(document.querySelector(selector)?.textContent || '').trim() === expected
  }, { selector, expected })
}

void main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
