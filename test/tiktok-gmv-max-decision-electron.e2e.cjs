const assert = require('node:assert/strict')
const path = require('node:path')
const { mkdir } = require('node:fs/promises')
const { _electron: electron } = require('playwright')

async function main() {
  const root = path.resolve(__dirname, '..')
  const artifacts = path.join(root, 'test-artifacts', 'tiktok-gmv-max-decision-v2')
  const userData = path.join(artifacts, 'user-data')
  const appData = path.join(artifacts, 'app-data')
  await Promise.all([
    mkdir(artifacts, { recursive: true }),
    mkdir(userData, { recursive: true }),
    mkdir(appData, { recursive: true }),
  ])
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
  const consoleErrors = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })

  try {
    await page.waitForLoadState('domcontentloaded')
    await page.evaluate(() => { window.location.hash = '#/plugins/tiktok-gmv-max-optimizer' })
    await page.locator('[data-testid="gmv-max-workspace"]').waitFor({ state: 'visible' })

    const apiState = await page.evaluate(async () => {
      const [workspace, coachWorkspace, commandCenter] = await Promise.all([
        window.api.tiktokGmvMax.getSopWorkspace(),
        window.api.tiktokGmvMax.getCoachWorkspace(),
        window.api.tiktokGmvMax.getCommandCenter(),
      ])
      return { workspace, coachWorkspace, commandCenter }
    })
    assert.ok(Array.isArray(apiState.workspace.decisions))
    assert.ok(Array.isArray(apiState.workspace.experiments))
    assert.ok(Array.isArray(apiState.coachWorkspace.productProfiles))
    assert.ok(Array.isArray(apiState.coachWorkspace.coachRuns))
    assert.ok(Array.isArray(apiState.commandCenter.topActions))
    assert.ok(apiState.commandCenter.topActions.length <= 5)
    assert.equal(typeof apiState.commandCenter.actionSummary.total, 'number')
    assert.ok(Array.isArray(apiState.commandCenter.impactSummaryByCurrency))
    assert.equal(typeof apiState.commandCenter.resultSummary.observing, 'number')

    await page.locator('[data-testid="gmv-tab-sop"]').click()
    await page.locator('[data-testid="gmv-decision-center"]').waitFor({ state: 'visible' })
    assert.equal(await page.locator('.gmv-task-header h1').innerText(), '增长')
    assert.ok(await page.locator('[data-testid="gmv-cockpit-scopebar"]').isVisible())
    assert.ok(await page.locator('[data-testid="gmv-today-plan"]').isVisible())

    await page.locator('[data-testid="gmv-tab-actions"]').click()
    await page.locator('[data-testid="gmv-decision-categories"]').waitFor({ state: 'visible' })
    assert.equal(await page.locator('[data-testid="gmv-decision-categories"] article').count(), 4)

    await page.locator('[data-testid="gmv-tab-rules"]').click()
    await page.locator('[data-testid="gmv-protection-goals"]').waitFor({ state: 'visible' })
    assert.equal(await page.locator('[data-testid="gmv-protection-goals"] article').count(), 5)
    assert.equal(await page.locator('[data-testid="gmv-backtest-results"]').getAttribute('open'), null)

    await page.locator('[data-testid="gmv-tab-audit"]').click()
    await page.getByRole('button', { name: '结果评估', exact: true }).click()
    await page.locator('[data-testid="gmv-audit-results"]').waitFor({ state: 'visible' })

    for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 760 }]) {
      await page.setViewportSize(viewport)
      await page.locator('[data-testid="gmv-tab-overview"]').click()
      await page.locator('[data-testid="gmv-control-strip"]').waitFor({ state: 'visible' })
      const fit = await page.evaluate(() => ({
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        workspaceContained: (() => {
          const rect = document.querySelector('[data-testid="gmv-max-workspace"]')?.getBoundingClientRect()
          return Boolean(rect && rect.left >= -2 && rect.right <= window.innerWidth + 2)
        })(),
      }))
      assert.deepEqual(fit, { horizontalOverflow: false, workspaceContained: true })
      await page.screenshot({ path: path.join(artifacts, `decision-closure-${viewport.width}x${viewport.height}.png`) })
    }

    assert.deepEqual(pageErrors, [])
    assert.deepEqual(consoleErrors.filter((message) => !message.includes('Electron Security Warning')), [])
    console.log('[tiktok-gmv-max-decision-v2] passed', {
      decisions: apiState.workspace.decisions.length,
      topActions: apiState.commandCenter.topActions.length,
    })
  } finally {
    await electronApp.close().catch(() => undefined)
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
