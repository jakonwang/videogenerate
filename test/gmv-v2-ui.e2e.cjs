/**
 * GMV MAX V2 in the real Electron app with a seeded local database:
 * margin setup → diagnoses → today checklist → "I changed it" → learning → campaign check-up → lesson → academy.
 * Usage: VG_LICENSE_MODE=off npx electron-vite build && node test/gmv-v2-ui.e2e.cjs [screenshotDir]
 */
const assert = require('node:assert/strict')
const { mkdtemp, mkdir } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { execFileSync } = require('node:child_process')
const { _electron: electron } = require('playwright')

/** Pages of a multi-page module show in the sub-tab row once that module is open. */
async function openGmvTab(page, tab) {
  const target = page.locator(`[data-testid="gmv-tab-${tab}"]`)
  if (await target.isVisible().catch(() => false)) return target.click()
  for (const module of await page.locator('[data-testid^="gmv-module-"]').all()) {
    await module.click()
    if (await target.isVisible().catch(() => false)) return target.click()
  }
  throw new Error(`GMV tab not found: ${tab}`)
}

async function main() {
  const root = await mkdtemp(join(tmpdir(), 'videogenerate-gmv-v2-'))
  const dataDir = join(root, 'data')
  const shots = process.argv[2] || join(root, 'shots')
  await mkdir(shots, { recursive: true })
  const cwd = join(__dirname, '..')
  execFileSync(process.execPath, [join(cwd, 'node_modules', 'tsx', 'dist', 'cli.mjs'), join(cwd, 'test', 'fixtures', 'seed-gmv-v2.ts'), dataDir], { cwd, stdio: 'inherit' })

  const errors = []
  const app = await electron.launch({ args: ['.'], cwd, env: { ...process.env, VIDEOGENERATE_USER_DATA_DIR: root, VIDEOGENERATE_DATA_DIR: dataDir } })
  try {
    const page = await app.firstWindow()
    page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
    page.on('console', (message) => {
      if (message.type() !== 'error') return
      const text = message.text()
      if (/Electron Security Warning|DevTools|Autofill|favicon/i.test(text)) return
      errors.push(text)
    })
    await page.waitForLoadState('domcontentloaded')
    await page.evaluate(() => { window.location.hash = '#/plugins/tiktok-gmv-max-optimizer' })
    await page.waitForSelector('[data-testid="gmv-v2-today"]', { timeout: 30000 })

    // 1. Margin setup is asked first; without it there is no "losing" verdict yet
    await page.waitForSelector('[data-testid="gmv-v2-setup"]', { timeout: 15000 })
    await page.screenshot({ path: join(shots, 'gmv-01-setup.png') })
    await page.locator('[data-testid="gmv-v2-margin-input"]').fill('40')
    await page.locator('[data-testid="gmv-v2-margin-save"]').click()
    await page.waitForSelector('[data-testid="gmv-v2-setup"]', { state: 'detached', timeout: 15000 })

    // 2. Today checklist: losing first, then scale, then underspend; learning/healthy not listed
    await page.waitForSelector('[data-testid="gmv-v2-task"]')
    const tasks = await page.locator('[data-testid="gmv-v2-task"]').allInnerTexts()
    assert.ok(tasks[0].includes('耳环-主推') && tasks[0].includes('在亏钱'), `first task should be the losing campaign:\n${tasks[0]}`)
    assert.ok(tasks.some((text) => text.includes('手链-爆款') && text.includes('可以放量')), 'scale task present')
    assert.ok(tasks.some((text) => text.includes('项链-新款') && text.includes('花不出去')), 'underspend task present')
    assert.ok(!tasks.some((text) => text.includes('发夹-测试')), 'learning campaign not in must-do')
    assert.ok(tasks[0].includes('明天早上第一件事做'), 'raise ROI is scheduled for the morning')
    // Beginner mode (default): each job carries click-by-click TikTok steps
    assert.ok(await page.locator('[data-testid="gmv-v2-task"]').first().locator('.sim-task__steps li').count() >= 3, 'beginner task has steps')
    assert.ok(tasks[0].includes('ROI 目标'), 'steps name the TikTok field to change')
    const simpleNav = (await page.locator('[data-testid="gmv-feature-nav"]').textContent()) || ''
    assert.ok(!simpleNav.includes('利润与成本'), 'beginner menu hides pro pages')
    await page.screenshot({ path: join(shots, 'gmv-02-today.png'), fullPage: false })
    await page.locator('.sim-more').click()
    await page.locator('.dash-grid .chart').first().scrollIntoViewIfNeeded()
    await page.screenshot({ path: join(shots, 'gmv-02b-today-charts.png') })

    // 3. "I changed it" → campaign moves to observing / learning
    const before = tasks.length
    await page.locator('[data-testid="gmv-v2-task"]').first().locator('[data-testid="gmv-v2-done"]').click()
    await page.waitForFunction((count) => document.querySelectorAll('[data-testid="gmv-v2-task"]').length === count - 1, before, { timeout: 10000 })
    const observing = await page.locator('[data-testid="gmv-v2-today"]').innerText()
    assert.ok(observing.includes('耳环-主推'), 'changed campaign shows in observing')

    // 4. Lesson dialog
    await page.locator('[data-testid="gmv-v2-task"]').first().getByRole('button', { name: '为什么' }).click()
    await page.waitForSelector('[data-testid="gmv-v2-lesson"]')
    const lessonText = await page.locator('[data-testid="gmv-v2-lesson"]').innerText()
    assert.ok(lessonText.includes('怎么做') && lessonText.length > 80, 'lesson has steps')
    await page.screenshot({ path: join(shots, 'gmv-03-lesson.png') })
    await page.keyboard.press('Escape')
    await page.locator('[data-testid="gmv-v2-lesson"] .vg-btn--primary').click().catch(() => undefined)

    // 5. Campaign check-up page with filter + expand
    await page.locator('[data-testid="gmv-feature-nav"] button', { hasText: '推广系列体检' }).click()
    await page.waitForSelector('[data-testid="gmv-v2-campaigns"]')
    await page.waitForSelector('[data-testid="gmv-v2-campaign-row"]')
    assert.equal(await page.locator('[data-testid="gmv-v2-campaign-row"]').count(), 5)
    await page.locator('[data-testid="gmv-v2-campaign-row"]').filter({ hasText: '手链-爆款' }).click()
    await page.waitForSelector('.camp__chart')
    await page.screenshot({ path: join(shots, 'gmv-04-campaigns.png') })
    await page.locator('.camp__charts').scrollIntoViewIfNeeded()
    await page.screenshot({ path: join(shots, 'gmv-04b-campaign-charts.png') })

    // 6. Academy: 10 lessons + settings
    await page.locator('[data-testid="gmv-feature-nav"] button', { hasText: '投放学院' }).click()
    await page.waitForSelector('[data-testid="gmv-v2-academy"]')
    assert.equal(await page.locator('.academy__lesson').count(), 10)
    await page.screenshot({ path: join(shots, 'gmv-05-academy.png') })

    // 7. Pro navigation: five modules, settings / academy / help as icons
    await page.locator('[data-testid="gmv-mode-pro"]').click()
    const modules = await page.locator('.gmv-topnav__tab').allTextContents()
    assert.deepEqual(modules.map((text) => text.trim()), ['概览', '投放管理', '素材', '利润', '自动化'])
    for (const id of ['settings', 'academy', 'help']) assert.ok(await page.locator(`[data-testid="gmv-tab-${id}"]`).isVisible(), `${id} icon`)

    // 8. Ads manager: sub-tabs, date range with period comparison, KPI strip and a 7-column table
    await openGmvTab(page, 'campaigns')
    assert.equal(await page.locator('[data-testid="gmv-subnav"] [aria-current="page"]').textContent().then((text) => text.trim()), '推广系列')
    assert.ok((await page.locator('.gmv-topnav__tab.is-active').textContent()).includes('投放管理'), 'module is active')
    await page.waitForSelector('.gmv-dtable tbody tr', { timeout: 15000 })
    assert.equal(await page.locator('.gmv-dtable tbody tr').count(), 5)
    assert.equal(await page.locator('.gmv-dtable thead th').count(), 9, 'checkbox + name + 6 data columns + actions')
    assert.equal(await page.locator('[data-testid="gmv-pacing-overview"] button').count(), 5)
    assert.equal(await page.locator('[data-testid="gmv-campaign-kpis"] .gmv-kpistrip__item').count(), 4)
    assert.match(await page.locator('[data-kpi="gmv"] .gmv-kpistrip__change').textContent(), /▲|▼|0%/, 'GMV shows a period change')
    assert.ok(!(await page.locator('.gmv-dtable').textContent()).includes('等待自动汇率'), 'amounts fall back to store currency')
    await page.screenshot({ path: join(shots, 'gmv-06-campaign-table.png') })
    await page.locator('[data-testid="gmv-range-30"]').click()
    await page.waitForFunction(() => document.querySelector('[data-testid="gmv-range-30"]')?.classList.contains('is-active'))
    await page.locator('[data-testid="gmv-range-compare"]').uncheck()
    assert.equal(await page.locator('[data-testid="gmv-campaign-kpis"] .gmv-kpistrip__change').count(), 0, 'compare can be switched off')
    await page.locator('[data-testid="gmv-range-compare"]').check()

    // 9. Ads manager editing: bulk preview with risk notes, inline edit through the confirm dialog
    const rowBoxes = page.locator('[data-testid="gmv-select-row"]')
    await rowBoxes.nth(0).check()
    await rowBoxes.nth(1).check()
    assert.match(await page.locator('[data-testid="gmv-bulk-bar"]').textContent(), /已选 2 个推广系列/)
    await page.locator('[data-testid="gmv-bulk-budget"] summary').click()
    await page.locator('[data-testid="gmv-bulk-budget"] input').fill('60')
    await page.locator('[data-testid="gmv-bulk-budget-apply"]').click()
    await page.waitForSelector('[data-testid="gmv-change-dialog"]')
    assert.equal(await page.locator('[data-testid="gmv-change-row"]').count(), 2)
    assert.match(await page.locator('[data-testid="gmv-change-dialog"]').textContent(), /超过 50%/, 'big budget jumps are flagged')
    await page.locator('.gcd__secondary').click()
    await page.locator('[data-testid="gmv-bulk-clear"]').click()
    const firstRow = page.locator('.gmv-dtable tbody tr').first()
    await firstRow.hover()
    await firstRow.locator('[data-testid="gmv-edit-roi"]').click()
    await page.locator('[data-testid="gmv-inline-input"]').fill('1.2')
    await page.keyboard.press('Enter')
    await page.waitForSelector('[data-testid="gmv-change-dialog"]')
    await page.locator('[data-testid="gmv-change-confirm"]').click()
    await page.waitForSelector('[data-testid="gmv-change-close"]', { timeout: 30000 })
    // the seed has no TikTok authorization, so the write is refused before anything is sent
    assert.match(await page.locator('[data-testid="gmv-change-error"]').textContent(), /TikTok 授权/)
    await page.locator('[data-testid="gmv-change-close"]').click()

    // 10. Column chooser and saved views
    await page.locator('[data-testid="gmv-columns"] summary').click()
    await page.locator('[data-testid="gmv-column-cpa"]').check()
    assert.equal(await page.locator('.gmv-dtable thead th').count(), 10, 'checkbox + name + 7 data columns + actions')
    await page.locator('[data-testid="gmv-column-cpa"]').uncheck()
    await page.locator('[data-testid="gmv-columns"] summary').click()
    await page.locator('[data-testid="gmv-views"] summary').click()
    await page.locator('[data-testid="gmv-view-name"]').fill('测试视图')
    await page.locator('[data-testid="gmv-view-save"]').click()
    assert.match(await page.locator('[data-testid="gmv-views"] summary').textContent(), /测试视图/)
    await page.locator('[data-testid="gmv-views"] summary').click()

    // 11. Alerts bell opens its panel
    await page.locator('[data-testid="gmv-alerts"]').click()
    await page.waitForSelector('[data-testid="gmv-alerts-panel"]')
    await page.keyboard.press('Escape')

    assert.deepEqual(errors, [], `renderer errors:\n${errors.join('\n')}`)
    console.log('gmv v2 ui e2e: ok')
  } finally {
    await app.close().catch(() => undefined)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
