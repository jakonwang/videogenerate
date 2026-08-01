const assert = require('node:assert/strict')
const path = require('node:path')
const { mkdir } = require('node:fs/promises')
const { _electron: electron } = require('playwright')

async function main() {
  const root = path.resolve(__dirname, '..')
  const artifacts = path.join(root, 'test-artifacts', 'tiktok-gmv-max-decision')
  await mkdir(artifacts, { recursive: true })
  const electronApp = await electron.launch({
    args: ['.'],
    cwd: root,
  })
  const page = await electronApp.firstWindow()
  const pageErrors = []
  const consoleErrors = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()) })
  try {
    await page.waitForLoadState('domcontentloaded')
    await page.evaluate(() => { window.location.hash = '#/plugins/tiktok-gmv-max-optimizer' })
    await page.locator('[data-testid="gmv-max-workspace"]').waitFor({ state: 'visible', timeout: 60_000 })
    await page.locator('[data-testid="gmv-tab-sop"]').click()
    await page.locator('[data-testid="gmv-decision-center"]').waitFor({ state: 'visible', timeout: 60_000 })
    const workspace = await page.evaluate(async () => await window.api.tiktokGmvMax.getSopWorkspace())
    assert.ok(Array.isArray(workspace.decisions))
    assert.ok(Array.isArray(workspace.experiments))
    assert.equal(typeof workspace.decisionSummary.total, 'number')
    assert.equal(workspace.decisionSummary.total, workspace.decisions.length)
    assert.equal(await page.locator('.gmv-decision-summary article').count(), 4)
    assert.equal(await page.getByText('GMV Max 智能运营中枢', { exact: true }).count(), 1)
    assert.equal((await page.locator('[data-testid="gmv-decision-center"]').innerText()).includes('gmvMaxDecision.'), false)

    await page.setViewportSize({ width: 1440, height: 900 })
    await page.locator('[data-testid="gmv-decision-center"]').scrollIntoViewIfNeeded()
    await page.screenshot({ path: path.join(artifacts, 'decision-center-1440x900.png') })
    const desktop = await page.evaluate(() => {
      const center = document.querySelector('[data-testid="gmv-decision-center"]')
      const rect = center?.getBoundingClientRect()
      return {
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        centerContained: Boolean(rect && rect.left >= -2 && rect.right <= window.innerWidth + 2),
        summaryColumns: getComputedStyle(document.querySelector('.gmv-decision-summary')).gridTemplateColumns.split(' ').length,
      }
    })
    assert.deepEqual(desktop, { horizontalOverflow: false, centerContained: true, summaryColumns: 4 })

    await page.setViewportSize({ width: 1280, height: 760 })
    await page.screenshot({ path: path.join(artifacts, 'decision-center-1280x760.png') })
    const compact = await page.evaluate(() => ({
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      summaryColumns: getComputedStyle(document.querySelector('.gmv-decision-summary')).gridTemplateColumns.split(' ').length,
    }))
    assert.equal(compact.horizontalOverflow, false)
    assert.ok([2, 4].includes(compact.summaryColumns))
    assert.deepEqual(pageErrors, [])
    assert.deepEqual(consoleErrors.filter((message) => !message.includes('Electron Security Warning')), [])
    console.log('tiktok-gmv-max-decision Electron E2E passed', { decisions: workspace.decisions.length, experiments: workspace.experiments.length, desktop, compact })
  } finally {
    await electronApp.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
