/**
 * Drives the built Electron app through clone prompt management.
 * The entry is an advanced one: project page → "逐步调整" → "提示词管理".
 * Covers the four prompt kinds and the full save / activate / rollback / delete flow.
 * No model is called.
 * Usage: VG_LICENSE_MODE=off npx electron-vite build && node test/clone-prompt-manager.e2e.cjs [screenshotDir]
 */
const assert = require('node:assert/strict')
const { mkdtemp, mkdir, rm, readFile } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { _electron: electron } = require('playwright')

async function main() {
  const root = await mkdtemp(join(tmpdir(), 'videogenerate-clone-prompts-'))
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
    page.on('dialog', (dialog) => dialog.accept())
    await page.setViewportSize({ width: 1480, height: 920 }).catch(() => undefined)
    await page.waitForLoadState('domcontentloaded')

    // The task list no longer carries a global entry.
    await page.evaluate(() => { window.location.hash = '#/clone' })
    await page.waitForSelector('.ctl-head__actions')
    assert.equal(await page.locator('[data-testid="clone-open-prompt-manager"]').count(), 0)

    // Open a draft project.
    const projectId = await page.evaluate(async () => {
      const res = await window.api.clone.createDraftProject({ locale: 'zh-CN', strength: 'structure', runMode: 'auto' })
      return res.project.id
    })
    await page.evaluate((id) => { window.location.hash = `#/clone/${id}` }, projectId)

    const dialog = page.locator('[data-testid="clone-prompt-manager"]')
    const content = page.locator('[data-testid="clone-prompt-content"]')
    const version = page.locator('[data-testid="clone-prompt-version"]')
    const category = page.locator('[data-testid="clone-prompt-category"]')
    const notice = page.locator('[data-testid="clone-prompt-notice"]')
    const closeDialog = async () => {
      await dialog.locator('.vg-dialog__head .vg-icon-btn').click()
      await dialog.waitFor({ state: 'detached' })
    }

    // The entry lives in the step-by-step workspace only: simple page → "逐步调整" → "提示词管理".
    await page.waitForSelector('[data-testid="clone-simple-panel"]')
    await page.locator('[data-testid="clone-simple-open-advanced"]').click()
    await page.waitForSelector('[data-testid="clone-advanced-prompts"]')
    await page.screenshot({ path: join(shots, '01-advanced-entry.png') })
    await page.locator('[data-testid="clone-advanced-prompts"]').click()
    await dialog.waitFor()

    // All four prompt kinds are here, in pipeline order.
    assert.deepEqual(
      await dialog.locator('.vg-tabs__btn').allInnerTexts(),
      ['脚本分析', '分镜图 · 模特展示', '分镜图 · 产品特写', '分镜视频'],
    )
    await page.waitForFunction(() => document.querySelector('[data-testid="clone-prompt-content"]').value.includes('{{targetMarket}}'))
    let text = await dialog.innerText()
    assert.ok(text.includes('{{productCategory}}'))
    assert.ok(!text.includes('{{referenceActionLine}}'), 'placeholders follow the selected kind')
    assert.ok(!/cloneUi\./.test(text), 'no untranslated keys in the dialog')
    assert.match(await version.locator('option:checked').innerText(), /内置默认 · 使用中/)
    assert.equal(await category.locator('option').count(), 11)
    await page.screenshot({ path: join(shots, '02-dialog-script-analysis.png') })

    await page.locator('[data-testid="clone-prompt-kind-storyboard_product"]').click()
    await page.waitForFunction(() => document.querySelector('[data-testid="clone-prompt-content"]').value.includes('{{humanSupportRule}}'))

    // ---- Shot video prompt: full version flow
    await page.locator('[data-testid="clone-prompt-kind-shot_video"]').click()
    await page.waitForFunction(() => document.querySelector('[data-testid="clone-prompt-content"]').value.startsWith('Main Instruction:'))
    text = await dialog.innerText()
    for (const label of ['复刻提示词管理', '适用品类', '可用占位符', '{{productName}}', '{{referenceActionLine}}']) {
      assert.ok(text.includes(label), `dialog shows ${label}`)
    }
    // The built-in default cannot be saved in place or deleted.
    assert.equal(await page.locator('[data-testid="clone-prompt-save"]').isDisabled(), true)
    assert.equal(await page.locator('[data-testid="clone-prompt-delete"]').isDisabled(), true)
    const overflow = await dialog.locator('.vg-dialog').evaluate((node) => node.scrollWidth - node.clientWidth)
    assert.ok(overflow <= 1, `dialog does not overflow (${overflow}px)`)

    // An unknown placeholder is rejected with a readable message.
    await content.fill('Show the {{productName}} with {{oops}}')
    await page.locator('[data-testid="clone-prompt-save-new"]').click()
    const error = page.locator('[data-testid="clone-prompt-error"]')
    await error.waitFor()
    assert.match(await error.innerText(), /Unknown placeholders: \{\{oops\}\}/)
    assert.ok(!/Error invoking remote method/.test(await error.innerText()), 'IPC prefix is stripped from the error')

    // Save as new version, then activate it.
    await content.fill('E2E TEMPLATE for {{productName}} on {{targetBodyPart}}')
    await page.locator('[data-testid="clone-prompt-name"]').fill('E2E 版本')
    await page.locator('[data-testid="clone-prompt-save-new"]').click()
    await notice.waitFor()
    assert.match(await notice.innerText(), /已保存 V1/)
    assert.match(await version.locator('option:checked').innerText(), /^V1 · E2E 版本$/)
    await page.locator('[data-testid="clone-prompt-activate"]').click()
    await page.waitForFunction(() => document.querySelector('[data-testid="clone-prompt-notice"]')?.textContent.includes('已启用'))
    assert.match(await version.locator('option:checked').innerText(), /V1 · E2E 版本 · 使用中/)
    assert.match(await category.locator('option:checked').innerText(), /全部品类 · 已自定义/)
    await page.screenshot({ path: join(shots, '03-dialog-shot-video-activated.png') })

    // It is on disk and marked active.
    const stored = JSON.parse(await readFile(join(dataDir, 'db', 'clone-prompt-templates.json'), 'utf-8'))
    assert.equal(stored.versions.length, 1)
    assert.equal(stored.versions[0].active, true)
    assert.equal(stored.versions[0].kind, 'shot_video')
    assert.equal(stored.versions[0].productType, 'all')

    // Another category has its own, still-default, list.
    await category.selectOption('clothes')
    await page.waitForFunction(() => document.querySelector('[data-testid="clone-prompt-content"]').value.startsWith('Main Instruction:'))
    assert.equal(await version.locator('option').count(), 1)

    // Roll back to the built-in default as a new active version, then delete V1.
    await category.selectOption('all')
    await page.waitForFunction(() => document.querySelector('[data-testid="clone-prompt-content"]').value.startsWith('E2E TEMPLATE'))
    await version.selectOption('builtin:shot_video')
    await page.locator('[data-testid="clone-prompt-rollback"]').click()
    await page.waitForFunction(() => document.querySelector('[data-testid="clone-prompt-notice"]')?.textContent.includes('已恢复为 V2'))
    assert.match(await version.locator('option:checked').innerText(), /^V2 · .* · 使用中$/)
    assert.ok((await content.inputValue()).startsWith('Main Instruction:'))
    const v1 = await version.locator('option', { hasText: 'V1 · E2E 版本' }).getAttribute('value')
    await version.selectOption(v1)
    await page.locator('[data-testid="clone-prompt-delete"]').click()
    await page.waitForFunction(() => document.querySelector('[data-testid="clone-prompt-notice"]')?.textContent.includes('已删除'))
    assert.equal(await version.locator('option').count(), 2)
    await closeDialog()

    const relevant = errors.filter((item) => !/Unknown placeholders/.test(item))
    assert.deepEqual(relevant, [], `no renderer errors: ${relevant.join(' | ')}`)
    console.log(`clone prompt manager e2e passed, screenshots in ${shots}`)
  } finally {
    if (app) await app.close().catch(() => undefined)
    await rm(root, { recursive: true, force: true }).catch(() => undefined)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
