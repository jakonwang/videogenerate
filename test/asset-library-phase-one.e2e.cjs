const assert = require('node:assert/strict')
const { mkdtemp, mkdir, rm, writeFile } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { _electron: electron } = require('playwright')

async function main() {
  const root = await mkdtemp(join(tmpdir(), 'videogenerate-asset-ui-'))
  const dataDir = join(root, 'data')
  const libraryDir = join(dataDir, 'asset-library')
  const filesDir = join(libraryDir, 'files')
  const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')
  let app
  try {
    await mkdir(filesDir, { recursive: true })
    const firstPath = join(filesDir, 'asset-one.png')
    const secondPath = join(filesDir, 'asset-two.png')
    await writeFile(firstPath, pixel)
    await writeFile(secondPath, pixel)
    await writeFile(join(libraryDir, 'index.json'), JSON.stringify({
      folders: [{ id: 'folder-one', name: 'Folder One', parentId: null, createdAt: 1, updatedAt: 1 }],
      assets: [
        { id: 'asset-one', name: 'Alpha.png', fileName: 'Alpha.png', filePath: firstPath, type: 'image', mimeType: 'image/png', size: pixel.length, source: 'desktop', createdAt: 1, folderId: null },
        { id: 'asset-two', name: 'Beta.png', fileName: 'Beta.png', filePath: secondPath, type: 'image', mimeType: 'image/png', size: pixel.length, source: 'desktop', createdAt: 2, folderId: null },
      ],
    }, null, 2), 'utf8')
    app = await electron.launch({
      args: ['.'],
      cwd: join(__dirname, '..'),
      env: { ...process.env, VIDEOGENERATE_USER_DATA_DIR: root, VIDEOGENERATE_DATA_DIR: dataDir },
    })
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await page.evaluate(() => { window.location.hash = '#/asset-library' })
    await page.waitForSelector('[data-asset-id="asset-one"]')

    await page.locator('[data-asset-id="asset-one"] .asset-select-mark').click()
    await page.locator('[data-asset-id="asset-two"] .asset-select-mark').click()
    await page.waitForSelector('.asset-selection-bar')
    assert.match(await page.locator('.asset-selection-bar').innerText(), /2/)

    await page.keyboard.press('Escape')
    assert.equal(await page.locator('.asset-tile.selected').count(), 0)
    const firstBox = await page.locator('[data-asset-id="asset-one"]').boundingBox()
    const secondBox = await page.locator('[data-asset-id="asset-two"]').boundingBox()
    assert.ok(firstBox && secondBox)
    await page.mouse.move(firstBox.x + firstBox.width + 4, firstBox.y + 8)
    await page.mouse.down()
    await page.mouse.move(firstBox.x + 8, firstBox.y + firstBox.height - 8, { steps: 8 })
    await page.mouse.up()
    assert.equal(await page.locator('[data-asset-id="asset-one"].selected').count(), 1)
    await page.keyboard.press('Escape')
    await page.locator('[data-asset-id="asset-one"]').click()
    await page.locator('[data-asset-id="asset-two"]').click({ modifiers: ['Control'] })
    assert.equal(await page.locator('.asset-tile.selected').count(), 2)

    await page.locator('.asset-selection-bar button').nth(1).click()
    await page.locator('.asset-selection-bar button').last().click()
    await page.locator('.asset-selection-bar--clipboard button').first().click()
    await page.waitForTimeout(500)
    const copiedCount = await page.locator('.asset-tile').count()
    const copyError = await page.locator('.asset-error').allInnerTexts()
    assert.equal(copiedCount, 4, copyError.join(' | '))

    await page.locator('.asset-sort').selectOption('name')
    await page.locator('button[title="Density"]').click()
    assert.equal(await page.locator('.asset-grid--compact').count(), 1)

    await page.locator('[data-asset-id="asset-one"]').click({ button: 'right' })
    await page.waitForSelector('.asset-context-menu')
    assert.match(await page.locator('.asset-context-menu').innerText(), /Rename|\u91cd\u547d\u540d/)
    await page.getByRole('button', { name: '\u7f16\u8f91\u56fe\u7247' }).click()
    await page.waitForSelector('.asset-editor')
    assert.match(await page.locator('.asset-editor-tabs').innerText(), /\u4fee\u6539\u5c3a\u5bf8/)
    assert.match(await page.locator('.asset-editor-tabs').innerText(), /\u88c1\u526a/)
    assert.match(await page.locator('.asset-editor-tabs').innerText(), /\u53bb\u6c34\u5370/)
    await page.locator('.asset-editor .asset-modal-close').click()
    await page.locator('[data-asset-id="asset-one"]').click({ button: 'right' })
    await page.getByRole('button', { name: '\u91cd\u547d\u540d', exact: true }).click()
    await page.locator('.asset-folder-dialog input').fill('Renamed Alpha.png')
    await page.locator('.asset-folder-dialog button[type="submit"]').click()
    await page.waitForFunction(() => document.body.innerText.includes('Renamed Alpha.png'))

    await page.locator('button[title="\u5217\u8868\u89c6\u56fe"]').click()
    assert.equal(await page.locator('.asset-grid--list').count(), 1)
    await page.locator('button[title="\u7f51\u683c\u89c6\u56fe"]').click()

    await page.keyboard.press('Escape')
    await page.locator('[data-asset-id="asset-one"] .asset-select-mark').click()
    await page.locator('.asset-selection-bar button').nth(3).click()
    await page.locator('.asset-selection-bar button').last().click()
    await page.locator('.asset-folder__open').click()
    await page.locator('.asset-selection-bar--clipboard button').first().click()
    await page.waitForSelector('[data-asset-id="asset-one"]')
    await page.locator('.asset-nav-buttons button').nth(2).click()
    await page.waitForSelector('.asset-folder')
    assert.equal(await page.locator('[data-asset-id="asset-one"]').count(), 0)

    await page.locator('[data-asset-id="asset-two"]').dragTo(page.locator('.asset-folder'))
    await page.waitForFunction(() => !document.querySelector('[data-asset-id="asset-two"]'))
    await page.locator('.asset-folder__open').click()
    await page.waitForSelector('[data-asset-id="asset-two"]')

    await page.locator('.asset-nav-buttons button').nth(2).click()
    assert.ok(await page.locator('.asset-tile').count() >= 2)
    const rootCards = page.locator('.asset-tile')
    await rootCards.nth(0).locator('.asset-select-mark').click()
    await rootCards.nth(1).locator('.asset-select-mark').click()
    page.once('dialog', (dialog) => dialog.accept())
    await page.locator('.asset-selection-bar button').nth(3).click()
    await page.waitForFunction(() => document.querySelectorAll('.asset-tile').length === 0)

    console.log('asset-library phase-one ui passed')
  } finally {
    if (app) await app.close().catch(() => undefined)
    await rm(root, { recursive: true, force: true })
  }
}

void main().catch((error) => { console.error(error); process.exitCode = 1 })
