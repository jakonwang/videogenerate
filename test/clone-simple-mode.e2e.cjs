/**
 * Drives the built Electron app through the simple clone flow that everyday users see:
 * "new task" goes straight to a three-input page, the start button explains what is missing,
 * the six-step workspace and prompt management sit behind "step by step".
 * No model is called (the pipeline itself is not started).
 * Usage: VG_LICENSE_MODE=off npx electron-vite build && node test/clone-simple-mode.e2e.cjs [screenshotDir]
 */
const assert = require('node:assert/strict')
const { mkdtemp, mkdir, rm } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { _electron: electron } = require('playwright')

async function main() {
  const root = await mkdtemp(join(tmpdir(), 'videogenerate-clone-simple-'))
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
    // Two products, so nothing can be assumed for the user.
    await page.evaluate(async () => {
      await window.api.products.upsert({ name: '珍珠耳环 Pearl', type: 'earring' })
      await window.api.products.upsert({ name: '帆布包 Tote', type: 'bag' })
    })

    // One click on "new task" lands on the simple page, no run-mode menu in between.
    await page.evaluate(() => { window.location.hash = '#/clone' })
    await page.waitForSelector('[data-testid="clone-create-task"]')
    assert.equal(await page.locator('[data-testid="clone-open-prompt-manager"]').count(), 0, 'no prompt entry on the task list')
    await page.locator('[data-testid="clone-create-task"]').click()
    const panel = page.locator('[data-testid="clone-simple-panel"]')
    await panel.waitFor()
    assert.equal(await panel.getAttribute('data-state'), 'setup')

    // Three inputs, one button, and the button says what is still missing.
    let text = await panel.innerText()
    for (const label of ['任务列表', '复刻一条爆款视频', '参考视频', '你的商品', '出镜模特', '开始复刻', '逐步调整']) {
      assert.ok(text.includes(label), `simple page shows ${label}`)
    }
    assert.ok(!/cloneUi\.|autoUi\./.test(text), 'no untranslated keys on the simple page')
    assert.equal(await page.locator('[data-testid="clone-simple-start"]').isDisabled(), true)
    assert.equal(await page.locator('[data-testid="clone-simple-cta-hint"]').innerText(), '还差：参考视频、你的商品、出镜模特')
    // None of the pipeline vocabulary or the six-step bar is shown here.
    for (const jargon of ['分镜', '身份定妆', '提示词', '脚本生成']) {
      assert.ok(!text.includes(jargon), `simple page does not mention ${jargon}`)
    }
    assert.equal(await page.locator('.cwf-step').count(), 0, 'six-step bar is hidden in simple mode')
    assert.equal(await page.locator('[data-testid="clone-advanced-bar"]').count(), 0)
    const overflow = await panel.evaluate((node) => node.scrollWidth - node.clientWidth)
    assert.ok(overflow <= 1, `simple page does not overflow (${overflow}px)`)
    await page.screenshot({ path: join(shots, '01-simple-setup-empty.png') })

    // Picking a product from the library fills card 2 and shortens the "missing" hint.
    await page.locator('[data-testid="clone-simple-pick-product"]').click()
    await page.locator('.model-card', { hasText: '珍珠耳环' }).first().click()
    await page.waitForFunction(() => document.querySelector('[data-testid="clone-simple-pick-product"]').textContent.includes('珍珠耳环'))
    assert.equal(await page.locator('[data-testid="clone-simple-cta-hint"]').innerText(), '还差：参考视频、出镜模特')
    assert.equal(await page.locator('[data-testid="clone-simple-start"]').isDisabled(), true)
    await page.screenshot({ path: join(shots, '02-simple-setup-product.png') })

    // "Step by step" reveals the existing workspace, with a single prompt entry and a way back.
    await page.locator('[data-testid="clone-simple-open-advanced"]').click()
    await page.waitForSelector('[data-testid="clone-advanced-bar"]')
    assert.equal(await panel.count(), 0)
    assert.equal(await page.locator('.cwf-step').count(), 6, 'six-step bar is back in step-by-step mode')
    for (const id of ['clone-step-analyze-prompts', 'clone-step-grid-prompts', 'clone-step-video-prompts']) {
      assert.equal(await page.locator(`[data-testid="${id}"]`).count(), 0, 'no per-step prompt buttons')
    }
    await page.screenshot({ path: join(shots, '03-advanced-workspace.png') })
    await page.locator('[data-testid="clone-advanced-prompts"]').click()
    const dialog = page.locator('[data-testid="clone-prompt-manager"]')
    await dialog.waitFor()
    assert.deepEqual(await dialog.locator('.vg-tabs__btn').allInnerTexts(), ['脚本分析', '分镜图 · 模特展示', '分镜图 · 产品特写', '分镜视频'])
    await dialog.locator('.vg-dialog__head .vg-icon-btn').click()
    await dialog.waitFor({ state: 'detached' })

    await page.locator('[data-testid="clone-back-to-simple"]').click()
    await panel.waitFor()
    assert.ok((await page.locator('[data-testid="clone-simple-pick-product"]').innerText()).includes('珍珠耳环'), 'choices survive the round trip')

    // A task created as "manual" opens in the step-by-step workspace.
    const manualId = await page.evaluate(async () => {
      const res = await window.api.clone.createDraftProject({ locale: 'zh-CN', strength: 'structure', runMode: 'manual' })
      return res.project.id
    })
    // Go through the task list like a user would; the project page is mounted fresh for each task.
    await page.evaluate(() => { window.location.hash = '#/clone' })
    await page.waitForSelector('[data-testid="clone-create-task"]')
    await page.evaluate((id) => { window.location.hash = `#/clone/${id}` }, manualId)
    await page.waitForSelector('[data-testid="clone-advanced-bar"]')
    assert.equal(await panel.count(), 0)

    assert.deepEqual(errors, [], `no renderer errors: ${errors.join(' | ')}`)
    console.log(`clone simple mode e2e passed, screenshots in ${shots}`)
  } finally {
    if (app) await app.close().catch(() => undefined)
    await rm(root, { recursive: true, force: true }).catch(() => undefined)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
