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
        { id: 'asset-one', name: 'Camera_XHS_17941208966951040g2sg324ar27vs0ahg5q803b9sivj80rgk608.jpg', fileName: 'Alpha.png', filePath: firstPath, type: 'image', mimeType: 'image/png', size: pixel.length, source: 'desktop', createdAt: 1, folderId: null },
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

    const bar = page.locator('.asset-selection-bar')
    const barButton = (name) => bar.getByRole('button', { name, exact: false })

    // Checkbox selection + selection bar
    await page.locator('[data-asset-id="asset-one"] .asset-select-mark').click()
    await page.locator('[data-asset-id="asset-two"] .asset-select-mark').click()
    await page.waitForSelector('.asset-selection-bar')
    assert.match(await bar.innerText(), /2/)
    // Inspector shows the multi-selection summary (open it when collapsed on small windows)
    const showInspector = page.locator('button[title="显示详情面板"]')
    if (await showInspector.count()) await showInspector.click()
    await page.waitForSelector('.inspector')
    assert.match(await page.locator('.inspector').innerText(), /已选择 2 项/)
    await page.locator('button[title="隐藏详情面板"]').click()

    await page.keyboard.press('Escape')
    assert.equal(await page.locator('.asset-tile.selected').count(), 0)

    // Marquee selection starting in the gap next to the first tile
    const firstBox = await page.locator('[data-asset-id="asset-one"]').boundingBox()
    const secondBox = await page.locator('[data-asset-id="asset-two"]').boundingBox()
    assert.ok(firstBox && secondBox)
    await page.mouse.move(firstBox.x + 8, firstBox.y + firstBox.height + 24)
    await page.waitForTimeout(250)
    await page.mouse.down()
    await page.mouse.move(firstBox.x + 20, firstBox.y + firstBox.height - 20, { steps: 8 })
    await page.mouse.up()
    assert.equal(await page.locator('[data-asset-id="asset-one"].selected').count(), 1)
    await page.keyboard.press('Escape')

    // Click + Ctrl-click, then copy & paste into the same folder
    await page.locator('[data-asset-id="asset-one"]').click()
    await page.locator('[data-asset-id="asset-two"]').click({ modifiers: ['Control'] })
    assert.equal(await page.locator('.asset-tile.selected').count(), 2)
    await barButton('复制').first().click()
    await page.locator('.asset-selection-bar__close').click()
    await page.locator('.asset-selection-bar--clipboard button').first().click()
    await page.waitForFunction(() => document.querySelectorAll('.asset-tile').length === 4)

    // Sort menu + thumbnail size slider
    await page.locator('.asset-view-btn').click()
    await page.locator('.asset-view-menu').getByRole('button', { name: '名称' }).click()
    assert.match(await page.locator('.asset-view-btn').innerText(), /名称/)
    await page.locator('.asset-zoom input').evaluate((input) => { input.value = '140'; input.dispatchEvent(new Event('input', { bubbles: true })) })
    assert.match(await page.locator('.asset-grid').getAttribute('style'), /--tile: 140px/)

    // Context menu -> image editor
    await page.locator('[data-asset-id="asset-one"]').click({ button: 'right' })
    await page.waitForSelector('.asset-context-menu')
    assert.match(await page.locator('.asset-context-menu').innerText(), /重命名/)
    await page.locator('.asset-context-menu').getByRole('button', { name: '编辑图片' }).click()
    await page.waitForSelector('.asset-editor')
    const tabs = await page.locator('.asset-editor-tabs').innerText()
    assert.match(tabs, /修改尺寸/)
    assert.match(tabs, /裁剪/)
    assert.match(tabs, /去水印/)
    const editorBox = await page.locator('.asset-editor').boundingBox()
    assert.ok(editorBox)
    for (const input of await page.locator('.asset-editor-fields input').all()) {
      const inputBox = await input.boundingBox()
      assert.ok(inputBox)
      assert.ok(inputBox.x >= editorBox.x && inputBox.x + inputBox.width <= editorBox.x + editorBox.width)
    }
    await page.locator('.asset-editor .asset-modal-close').click()

    // Rename with F2
    await page.locator('[data-asset-id="asset-one"]').click()
    await page.keyboard.press('F2')
    await page.waitForSelector('.asset-rename-dialog')
    const renameDialogBox = await page.locator('.asset-rename-dialog').boundingBox()
    const renameInputBox = await page.locator('.asset-rename-dialog input').boundingBox()
    assert.ok(renameDialogBox && renameInputBox)
    assert.ok(renameInputBox.x >= renameDialogBox.x && renameInputBox.x + renameInputBox.width <= renameDialogBox.x + renameDialogBox.width)
    await page.locator('.asset-rename-dialog input').fill('Renamed Alpha.png')
    await page.locator('.asset-rename-dialog button[type="submit"]').click()
    await page.waitForFunction(() => document.body.innerText.includes('Renamed Alpha.png'))

    // List view
    await page.locator('button[title="列表视图"]').click()
    assert.equal(await page.locator('.asset-grid--list').count(), 1)
    assert.ok(await page.locator('.asset-row[data-asset-id]').count() >= 4)
    await page.locator('button[title="网格视图"]').click()

    // Lightbox with keyboard navigation
    await page.locator('[data-asset-id="asset-one"]').dblclick()
    await page.waitForSelector('.lightbox')
    const counterBefore = await page.locator('.lightbox__title span').innerText()
    await page.keyboard.press('ArrowRight')
    await page.waitForFunction((before) => document.querySelector('.lightbox__title span')?.textContent !== before, counterBefore)
    await page.keyboard.press('Escape')
    await page.waitForSelector('.lightbox', { state: 'detached' })

    // Move to folder through the folder picker
    await page.keyboard.press('Escape')
    await page.locator('[data-asset-id="asset-one"] .asset-select-mark').click()
    await barButton('移动到').click()
    await page.waitForSelector('.picker')
    await page.locator('.picker__row').filter({ hasText: 'Folder One' }).click()
    await page.locator('.picker').getByRole('button', { name: '移动到这里' }).click()
    await page.waitForFunction(() => !document.querySelector('[data-asset-id="asset-one"]'))
    await page.locator('.lib-side__node').filter({ hasText: 'Folder One' }).click()
    await page.waitForSelector('[data-asset-id="asset-one"]')
    await page.locator('.asset-nav-buttons button').nth(2).click()
    await page.waitForSelector('.asset-folder')
    assert.equal(await page.locator('[data-asset-id="asset-one"]').count(), 0)

    // Drag an asset onto a folder card
    await page.locator('[data-asset-id="asset-two"]').dragTo(page.locator('.asset-folder').first())
    await page.waitForFunction(() => !document.querySelector('[data-asset-id="asset-two"]'))
    await page.locator('.asset-folder').first().click()
    await page.waitForSelector('[data-asset-id="asset-two"]')

    // "All assets" shows everything regardless of folder
    await page.locator('.lib-side__item').filter({ hasText: '全部素材' }).click()
    await page.waitForFunction(() => document.querySelectorAll('.asset-tile').length === 4)

    // Delete with the in-app confirm, then undo from the toast
    await page.locator('.lib-side__node').first().click()
    await page.waitForFunction(() => document.querySelectorAll('.asset-tile').length === 2)
    await page.keyboard.press('Control+A')
    await barButton('删除').click()
    await page.waitForSelector('.asset-confirm')
    await page.locator('.asset-confirm').getByRole('button', { name: '移入回收站' }).click()
    await page.waitForFunction(() => document.querySelectorAll('.asset-tile').length === 0)
    await page.locator('.asset-undo').getByRole('button', { name: '撤销' }).click()
    await page.waitForFunction(() => document.querySelectorAll('.asset-tile').length === 2)

    console.log('asset-library phase-one ui passed')
  } finally {
    if (app) await app.close().catch(() => undefined)
    await rm(root, { recursive: true, force: true })
  }
}

void main().catch((error) => { console.error(error); process.exitCode = 1 })
