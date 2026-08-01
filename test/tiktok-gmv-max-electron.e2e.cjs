const assert = require('node:assert/strict')
const path = require('node:path')
const { mkdir, writeFile } = require('node:fs/promises')
const { _electron: electron } = require('playwright')

async function captureWindow(electronApp, outputPath, clip) {
  const base64 = await electronApp.evaluate(async ({ BrowserWindow }, targetClip) => {
    const window = BrowserWindow.getAllWindows().find((item) => item.isVisible()) || BrowserWindow.getAllWindows()[0]
    if (!window) throw new Error('Electron window is unavailable for screenshot capture')
    const rect = targetClip
      ? {
          x: Math.max(0, Math.round(targetClip.x)),
          y: Math.max(0, Math.round(targetClip.y)),
          width: Math.max(1, Math.round(targetClip.width)),
          height: Math.max(1, Math.round(targetClip.height)),
        }
      : undefined
    return (await window.capturePage(rect)).toPNG().toString('base64')
  }, clip)
  await writeFile(outputPath, Buffer.from(base64, 'base64'))
}

async function main() {
  const root = path.resolve(__dirname, '..')
  const artifacts = path.join(root, 'test-artifacts', 'tiktok-gmv-max')
  await mkdir(artifacts, { recursive: true })

  const electronApp = await electron.launch({ args: ['.'], cwd: root })
  const page = await electronApp.firstWindow()
  page.setDefaultTimeout(60_000)
  const pageErrors = []
  const consoleErrors = []
  let seededOutcomeId = ''
  page.on('pageerror', (error) => pageErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })

  try {
    const secureStorage = await electronApp.evaluate(({ safeStorage }) => {
      const plaintext = 'gmv-max-secret-probe'
      if (!safeStorage.isEncryptionAvailable()) return { available: false }
      const encrypted = safeStorage.encryptString(plaintext)
      return {
        available: true,
        containsPlaintext: encrypted.toString('utf8').includes(plaintext),
        decrypted: safeStorage.decryptString(encrypted),
      }
    })
    assert.equal(secureStorage.available, true)
    assert.equal(secureStorage.containsPlaintext, false)
    assert.equal(secureStorage.decrypted, 'gmv-max-secret-probe')

    await page.waitForLoadState('domcontentloaded')
    await page.evaluate(() => localStorage.removeItem('videogenerate:gmv-max:filters:v1'))
    await page.evaluate(() => localStorage.removeItem('videogenerate:gmv-max:nav-collapsed:v1'))
    await page.evaluate(() => localStorage.removeItem('videogenerate:app-sidebar-collapsed:v1'))
    await page.reload()
    await page.waitForLoadState('domcontentloaded')
    await page.evaluate(() => { window.location.hash = '#/plugins' })
    try {
      await page.getByText('TikTok GMV MAX', { exact: false }).first().waitFor({ state: 'visible', timeout: 10_000 })
    } catch (error) {
      console.error('[tiktok-gmv-max-electron] plugin route diagnostics', {
        title: await page.title().catch(() => ''),
        url: page.url(),
        text: (await page.locator('body').innerText().catch(() => '')).slice(0, 1000),
        windowCount: electronApp.windows().length,
        pageErrors,
        consoleErrors,
      })
      await captureWindow(electronApp, path.join(artifacts, 'plugin-route-failure.png')).catch(() => undefined)
      throw error
    }
    await page.evaluate(() => { window.location.hash = '#/plugins/tiktok-gmv-max-optimizer' })
    await page.locator('[data-testid="gmv-max-workspace"]').waitFor({ state: 'visible' })
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.waitForTimeout(500)
    assert.equal(await page.locator('.gmv-alert--danger').count(), 0)
    assert.equal(await page.locator('.gmv-commandbar').isVisible(), true)
    const featureNav = page.locator('[data-testid="gmv-feature-nav"]')
    const featureNavToggle = page.locator('[data-testid="gmv-feature-nav-toggle"]')
    assert.equal(await featureNav.locator('.gmv-tab').count(), 10)
    assert.ok((await featureNav.boundingBox())?.width >= 200)
    await captureWindow(electronApp, path.join(artifacts, 'feature-navigation.png'))
    await featureNavToggle.click()
    await page.waitForFunction(() => document.querySelector('[data-testid="gmv-feature-nav"]')?.getBoundingClientRect().width <= 66)
    assert.equal(await page.evaluate(() => localStorage.getItem('videogenerate:gmv-max:nav-collapsed:v1')), 'true')
    await captureWindow(electronApp, path.join(artifacts, 'feature-navigation-collapsed.png'))
    await featureNavToggle.click()
    await page.waitForFunction(() => document.querySelector('[data-testid="gmv-feature-nav"]')?.getBoundingClientRect().width >= 200)
    assert.equal(await page.evaluate(() => localStorage.getItem('videogenerate:gmv-max:nav-collapsed:v1')), 'false')
    const appSidebar = page.locator('.ds-sidebar')
    const appSidebarToggle = page.locator('[data-testid="app-sidebar-toggle"]')
    assert.ok((await appSidebar.boundingBox())?.width >= 180)
    await appSidebarToggle.click()
    await page.waitForFunction(() => (
      localStorage.getItem('videogenerate:app-sidebar-collapsed:v1') === 'true'
      && document.querySelector('.app-shell')?.classList.contains('is-sidebar-collapsed')
    ))
    await page.waitForFunction(() => document.querySelector('.ds-sidebar')?.getBoundingClientRect().width <= 74)
    assert.equal(await page.evaluate(() => localStorage.getItem('videogenerate:app-sidebar-collapsed:v1')), 'true')
    const collapsedMainNavFit = await page.evaluate(() => {
      const button = document.querySelector('.app-sidebar-footer-action')
      const icon = button?.querySelector('svg')
      if (!button || !icon) return { centeredSettingsIcon: false, containedSettingsIcon: false }
      const buttonBox = button.getBoundingClientRect()
      const iconBox = icon.getBoundingClientRect()
      return {
        centeredSettingsIcon:
          Math.abs((buttonBox.left + buttonBox.width / 2) - (iconBox.left + iconBox.width / 2)) <= 1
          && Math.abs((buttonBox.top + buttonBox.height / 2) - (iconBox.top + iconBox.height / 2)) <= 1,
        containedSettingsIcon:
          iconBox.left >= buttonBox.left
          && iconBox.right <= buttonBox.right
          && iconBox.top >= buttonBox.top
          && iconBox.bottom <= buttonBox.bottom,
      }
    })
    assert.equal(collapsedMainNavFit.centeredSettingsIcon, true)
    assert.equal(collapsedMainNavFit.containedSettingsIcon, true)
    await captureWindow(electronApp, path.join(artifacts, 'main-navigation-collapsed.png'))
    await appSidebarToggle.click()
    await page.waitForFunction(() => (
      localStorage.getItem('videogenerate:app-sidebar-collapsed:v1') === 'false'
      && !document.querySelector('.app-shell')?.classList.contains('is-sidebar-collapsed')
    ))
    await page.waitForFunction(() => document.querySelector('.ds-sidebar')?.getBoundingClientRect().width >= 180)
    assert.equal(await page.evaluate(() => localStorage.getItem('videogenerate:app-sidebar-collapsed:v1')), 'false')
    assert.equal(await page.evaluate(() => typeof window.api.tiktokGmvMax.approveBatch), 'function')
    assert.equal(await page.evaluate(() => typeof window.api.tiktokGmvMax.setEmergencyStop), 'function')
    const lazyDashboard = await page.evaluate(async () => {
      const inputs = Array.from(document.querySelectorAll('.gmv-date-field input'))
      const dashboard = await window.api.tiktokGmvMax.getDashboard({ startDate: inputs[0]?.value, endDate: inputs[1]?.value, includeCreativeMetrics: false })
      const campaignPage = await window.api.tiktokGmvMax.getCampaignPage({ page: 1, pageSize: 10, startDate: inputs[0]?.value, endDate: inputs[1]?.value, sortBy: 'cost', sortDirection: 'desc' })
      const creativePage = await window.api.tiktokGmvMax.getCreativePage({ page: 1, pageSize: 25, startDate: inputs[0]?.value, endDate: inputs[1]?.value })
      const productPage = await window.api.tiktokGmvMax.getProductPage({ page: 1, pageSize: 25, startDate: inputs[0]?.value, endDate: inputs[1]?.value })
      const productCostPage = await window.api.tiktokGmvMax.getProductCostPage({ page: 1, pageSize: 25 })
      const listEntryPage = await window.api.tiktokGmvMax.getListEntryPage({ page: 1, pageSize: 25, entityType: 'creative' })
      const actionPage = await window.api.tiktokGmvMax.getActionPage({ page: 1, pageSize: 20, startDate: inputs[0]?.value, endDate: inputs[1]?.value })
      const outcomePage = await window.api.tiktokGmvMax.getOutcomePage({ page: 1, pageSize: 20, startDate: inputs[0]?.value, endDate: inputs[1]?.value })
      const auditPage = await window.api.tiktokGmvMax.getAuditPage({ page: 1, pageSize: 25, startDate: inputs[0]?.value, endDate: inputs[1]?.value })
      const campaignWorkspace = dashboard.campaigns[0] ? await window.api.tiktokGmvMax.getCampaignWorkspace({ campaignId: dashboard.campaigns[0].id, startDate: inputs[0]?.value, endDate: inputs[1]?.value }) : null
      return { campaigns: dashboard.campaigns.length, campaignPageItems: campaignPage.items.length, campaignPageTotal: campaignPage.total, campaignPageMetrics: campaignPage.items.every((item) => item.metrics && item.profitGuard && item.policy), dailyMetrics: dashboard.dailyMetrics.length, pacingDiagnostics: dashboard.pacingDiagnostics.length, dashboardProductCosts: dashboard.productCosts.length, dashboardListEntries: dashboard.listEntries.length, dashboardActionOutcomes: dashboard.actionOutcomes.length, catalogProducts: dashboard.catalog.products, catalogIdentities: dashboard.catalog.identities, catalogVideos: dashboard.catalog.videos, creativeMetrics: dashboard.creativeMetrics.length, creativeItems: creativePage.items.length, creativeTotal: creativePage.total, productItems: productPage.items.length, productTotal: productPage.total, productCostItems: productCostPage.items.length, productCostTotal: productCostPage.total, listEntryItems: listEntryPage.items.length, listEntryTotal: listEntryPage.total, actionItems: actionPage.items.length, actionTotal: actionPage.total, outcomeItems: outcomePage.items.length, outcomeTotal: outcomePage.total, auditItems: auditPage.items.length, auditTotal: auditPage.total, workspaceCreativeItems: campaignWorkspace?.creative.items.length || 0, workspaceProductItems: campaignWorkspace?.products.items.length || 0, workspaceProductCosts: campaignWorkspace?.productCosts.items.length || 0, workspaceActions: campaignWorkspace?.actions.items.length || 0, workspaceDailyMetrics: campaignWorkspace?.dailyMetrics.length || 0, workspaceExperimentTarget: campaignWorkspace?.creativeExperiment.targetPoolSize || 0, workspaceCreativeOutcomes: Array.isArray(campaignWorkspace?.creativeOutcomes) }
    })
    assert.equal(lazyDashboard.creativeMetrics, 0)
    assert.equal(lazyDashboard.campaignPageItems <= 10, true)
    assert.equal(lazyDashboard.campaignPageTotal, lazyDashboard.campaigns)
    assert.equal(lazyDashboard.campaignPageMetrics, true)
    assert.equal(lazyDashboard.dailyMetrics <= lazyDashboard.campaigns * 7, true)
    assert.equal(lazyDashboard.pacingDiagnostics, lazyDashboard.campaigns)
    assert.equal(lazyDashboard.dashboardProductCosts, 0)
    assert.equal(lazyDashboard.dashboardListEntries, 0)
    assert.equal(lazyDashboard.dashboardActionOutcomes, 0)
    assert.equal(lazyDashboard.catalogProducts >= 0, true)
    assert.equal(lazyDashboard.catalogIdentities >= 0, true)
    assert.equal(lazyDashboard.catalogVideos >= 0, true)
    assert.equal(await page.locator('[data-testid="gmv-catalog-strip"]').isVisible(), true)
    assert.equal(lazyDashboard.creativeItems <= 25, true)
    assert.equal(lazyDashboard.productItems <= 25, true)
    assert.equal(lazyDashboard.productTotal >= lazyDashboard.productItems, true)
    assert.equal(lazyDashboard.productCostItems <= 25, true)
    assert.equal(lazyDashboard.productCostTotal >= lazyDashboard.productCostItems, true)
    assert.equal(lazyDashboard.listEntryItems <= 25, true)
    assert.equal(lazyDashboard.listEntryTotal >= lazyDashboard.listEntryItems, true)
    assert.equal(lazyDashboard.actionItems <= 20, true)
    assert.equal(lazyDashboard.actionTotal >= lazyDashboard.actionItems, true)
    assert.equal(lazyDashboard.outcomeItems <= 20, true)
    assert.equal(lazyDashboard.outcomeTotal >= lazyDashboard.outcomeItems, true)
    assert.equal(lazyDashboard.auditItems <= 25, true)
    assert.equal(lazyDashboard.auditTotal >= lazyDashboard.auditItems, true)
    assert.equal(lazyDashboard.workspaceCreativeItems <= 10, true)
    assert.equal(lazyDashboard.workspaceProductItems <= 10, true)
    assert.equal(lazyDashboard.workspaceProductCosts <= 10, true)
    assert.equal(lazyDashboard.workspaceActions <= 10, true)
    assert.equal(lazyDashboard.workspaceDailyMetrics <= 14, true)
    assert.equal(lazyDashboard.workspaceExperimentTarget >= 2, true)
    assert.equal(lazyDashboard.workspaceCreativeOutcomes, true)

    if (process.env.TIKTOK_GMV_MAX_REAL_SYNC === '1') {
      const syncSummary = await page.evaluate(async () => {
        const dashboard = await window.api.tiktokGmvMax.sync()
        return {
          connections: dashboard.connections.length,
          bindings: dashboard.bindings.length,
          campaigns: dashboard.campaigns.length,
          metrics: dashboard.dailyMetrics.length,
          creativeMetrics: dashboard.creativeMetrics.length,
          creativeAssets: dashboard.creativeAssets.length,
          creativeReadConnections: dashboard.connections.filter((item) => item.state === 'connected' && item.capabilities?.creative_read).length,
          storeProfitSummaries: dashboard.storeProfitSummaries.length,
        }
      })
      console.log('[tiktok-gmv-max-electron] real read-only sync', syncSummary)
      assert.ok(syncSummary.connections > 0)
      assert.ok(syncSummary.bindings > 0)
      assert.ok(syncSummary.campaigns > 0)
      assert.ok(syncSummary.metrics > 0)
      assert.ok(syncSummary.creativeMetrics > 0)
      assert.ok(syncSummary.creativeReadConnections > 0)
      assert.ok(syncSummary.storeProfitSummaries > 0)
      await page.reload({ waitUntil: 'domcontentloaded' })
      await page.locator('[data-testid="gmv-max-workspace"]').waitFor({ state: 'visible' })
    }

    if (process.env.TIKTOK_GMV_MAX_REAL_CATALOG_SYNC === '1') {
      const catalog = await page.evaluate(async () => await window.api.tiktokGmvMax.syncCatalogs())
      console.log('[tiktok-gmv-max-electron] real catalog sync', catalog)
      assert.ok(catalog.products > 0)
      assert.ok(catalog.identities > 0)
      assert.ok(catalog.videos > 0)
      await page.reload({ waitUntil: 'domcontentloaded' })
      await page.locator('[data-testid="gmv-max-workspace"]').waitFor({ state: 'visible' })
    }

    const setupGuideVisibleOnOverview = await page.locator('[data-testid="gmv-setup-guide"]').count() === 1
    const tabs = ['overview', 'campaigns', 'growth', 'rules', 'creatives', 'profit', 'actions', 'audit']
    for (const tab of tabs) {
      const button = page.locator(`[data-testid="gmv-tab-${tab}"]`)
      await button.click()
      await assert.doesNotReject(async () => await button.evaluate((element) => element.classList.contains('is-active')))
      assert.equal(await button.evaluate((element) => element.classList.contains('is-active')), true)
      assert.equal(await page.locator('[data-testid="gmv-setup-guide"]').count(), tab === 'overview' && setupGuideVisibleOnOverview ? 1 : 0)
    }
    await page.locator('[data-testid="gmv-tab-help"]').click()
    await page.locator('[data-testid="gmv-help-center"]').waitFor({ state: 'visible' })
    assert.equal(await page.locator('.gmv-commandbar').count(), 0)
    assert.equal(await page.locator('[data-testid="gmv-catalog-strip"]').count(), 0)
    const helpSearch = page.locator('[data-testid="gmv-help-search"]')
    await helpSearch.fill('ROI')
    const firstHelpResult = page.locator('.help-directory button').first()
    await firstHelpResult.waitFor({ state: 'visible' })
    await firstHelpResult.click()
    assert.equal((await page.locator('[data-testid="gmv-help-article"]').innerText()).includes('gmvMaxHelp.'), false)
    await captureWindow(electronApp, path.join(artifacts, 'help-center-search.png'))
    await page.locator('[data-testid="gmv-help-use"], [data-testid="gmv-help-issue-use"]').click()
    assert.equal(await page.locator('[data-testid="gmv-tab-help"]').evaluate((element) => element.classList.contains('is-active')), false)
    await page.locator('[data-testid="gmv-tab-overview"]').click()
    assert.equal(await page.locator('[data-testid="gmv-setup-guide"]').count(), setupGuideVisibleOnOverview ? 1 : 0)

    await page.locator('[data-testid="gmv-tab-growth"]').click()
    assert.equal(await page.locator('[data-testid="gmv-growth-workspace"]').isVisible(), true)
    await page.locator('.gmv-filter-panel--product').waitFor({ state: 'visible' })
    const analyzeGrowthButton = page.locator('[data-testid="gmv-growth-workspace"] > .gmv-section__heading .gmv-button--primary')
    await analyzeGrowthButton.click()
    await page.waitForFunction(() => !document.querySelector('[data-testid="gmv-growth-workspace"] > .gmv-section__heading .gmv-button--primary')?.disabled)
    assert.equal(await page.locator('.gmv-alert--danger').count(), 0)
    assert.equal(await page.locator('[data-testid="gmv-strategy-calibrations"]').isVisible(), true)
    assert.ok(await page.locator('[data-testid="gmv-strategy-calibrations"] tbody tr').count() > 0)
    await captureWindow(electronApp, path.join(artifacts, 'growth.png'))
    const productLab = page.locator('[data-testid="gmv-product-lab"]')
    await productLab.scrollIntoViewIfNeeded()
    assert.equal(await productLab.isVisible(), true)
    assert.ok(await productLab.locator('tbody tr').count() > 0)
    assert.equal(await productLab.locator('.gmv-filter-panel--product select').count(), 3)
    assert.equal(await productLab.locator('.gmv-table--products .gmv-sort-button').count() >= 9, true)
    assert.equal(await productLab.locator('.gmv-table--products tbody tr').count() <= 25, true)
    assert.ok(await productLab.locator('.gmv-product-identity').count() > 0)
    assert.ok(await productLab.locator('.gmv-product-thumb').count() > 0)
    assert.equal(await productLab.locator('.gmv-pagination').isVisible(), true)
    const productLabFit = await productLab.evaluate((element) => ({
      width: element.getBoundingClientRect().width,
      tableScrollable: Boolean(element.querySelector('.gmv-table-wrap')),
      statsVisible: Boolean(element.querySelector('.gmv-product-lab__stats')),
      productColumnWidth: element.querySelector('.gmv-table--products tbody td:first-child')?.getBoundingClientRect().width || 0,
      campaignColumnWidth: element.querySelector('.gmv-table--products tbody td:nth-child(2)')?.getBoundingClientRect().width || 0,
      nextActionColumnWidth: element.querySelector('.gmv-table--products tbody td:nth-child(11)')?.getBoundingClientRect().width || 0,
      actionColumnWidth: element.querySelector('.gmv-table--products tbody td:nth-child(12)')?.getBoundingClientRect().width || 0,
      productRowHeight: element.querySelector('.gmv-table--products tbody tr')?.getBoundingClientRect().height || 0,
    }))
    assert.equal(productLabFit.tableScrollable, true)
    assert.equal(productLabFit.statsVisible, true)
    assert.ok(productLabFit.productColumnWidth >= 290 && productLabFit.productColumnWidth <= 310)
    assert.ok(productLabFit.campaignColumnWidth >= 210 && productLabFit.campaignColumnWidth <= 230)
    assert.ok(productLabFit.nextActionColumnWidth >= 190 && productLabFit.nextActionColumnWidth <= 210)
    assert.ok(productLabFit.actionColumnWidth >= 90 && productLabFit.actionColumnWidth <= 110)
    assert.ok(productLabFit.productRowHeight <= 160)
    await captureWindow(electronApp, path.join(artifacts, 'product-lab.png'))
    const productTableWrap = productLab.locator('.gmv-table-wrap').first()
    await productTableWrap.evaluate((element) => { element.scrollLeft = element.scrollWidth })
    await page.waitForTimeout(200)
    await captureWindow(electronApp, path.join(artifacts, 'product-lab-right.png'))
    await productTableWrap.evaluate((element) => { element.scrollLeft = 0 })
    const portfolioPlans = page.locator('[data-testid="gmv-portfolio-plans"]')
    await portfolioPlans.scrollIntoViewIfNeeded()
    assert.equal(await portfolioPlans.getByText('\u5e97\u94fa\u5229\u6da6\u8d44\u91d1\u6c60', { exact: true }).isVisible(), true)
    assert.equal(await portfolioPlans.getByText('\u9884\u7b97\u5b88\u6052', { exact: true }).count() > 0, true)
    assert.equal(await portfolioPlans.locator('.gmv-row__actions button').count(), 0)
    await captureWindow(electronApp, path.join(artifacts, 'portfolio.png'))
    const outcomeLearning = page.locator('[data-testid="gmv-outcome-learning"]')
    await outcomeLearning.scrollIntoViewIfNeeded()
    assert.equal(await outcomeLearning.getByText('\u7b56\u7565\u7ed3\u679c\u5b66\u4e60', { exact: true }).isVisible(), true)
    if (lazyDashboard.outcomeTotal === 0) {
      assert.equal(await outcomeLearning.getByText('\u771f\u5b9e\u52a8\u4f5c\u6267\u884c\u540e\u9700\u8981\u4e09\u4e2a\u5b8c\u6574\u6295\u653e\u65e5\u624d\u80fd\u5f62\u6210\u5b66\u4e60\u7ed3\u679c\u3002', { exact: true }).isVisible(), true)
    } else {
      assert.ok(await outcomeLearning.locator('tbody tr').count() > 0)
    }
    await captureWindow(electronApp, path.join(artifacts, 'growth-outcomes.png'))

    await page.locator('[data-testid="gmv-tab-rules"]').click()
    assert.equal(await page.locator('[data-testid="gmv-backtest-results"]').count(), 1)
    assert.equal(await page.locator('[data-testid="gmv-backtest-results"]').getByText('\u5546\u54c1\u8bc1\u636e\u5929\u6570', { exact: true }).isVisible(), true)
    assert.equal(await page.locator('[data-testid="gmv-backtest-results"]').getByText('\u4e0d\u5b89\u5168\u6269\u91cf\u963b\u65ad', { exact: true }).isVisible(), true)
    await page.locator('[data-testid="gmv-run-backtest"]').click()
    await page.waitForTimeout(300)
    await page.waitForFunction(() => {
      const button = document.querySelector('[data-testid="gmv-run-backtest"]')
      return button instanceof HTMLButtonElement && !button.disabled
    }, null, { timeout: 60_000 })
    const backtestPanelStateHandle = await page.waitForFunction(async () => {
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      const panel = document.querySelector('[data-testid="gmv-backtest-results"]')
      if (!(panel instanceof HTMLElement) || panel.offsetParent === null) return false
      const firstRow = panel.querySelector('tbody tr')
      return {
        visible: true,
        firstRowColumns: firstRow ? firstRow.querySelectorAll('td').length : 0,
      }
    }, null, { timeout: 60_000 })
    const backtestPanelState = await backtestPanelStateHandle.jsonValue()
    const backtestError = await page.locator('.gmv-alert--danger').textContent().catch(() => '')
    if (backtestError) console.log('[tiktok-gmv-max-electron] backtest error', backtestError.trim())
    assert.equal(await page.locator('.gmv-alert--danger').count(), 0)
    assert.equal(backtestPanelState.visible, true)
    if (backtestPanelState.firstRowColumns) assert.equal(backtestPanelState.firstRowColumns, 10)
    await captureWindow(electronApp, path.join(artifacts, 'rules.png'))
    await page.locator('[data-testid="gmv-new-rule"]').click()
    assert.equal(await page.locator('[data-testid="gmv-drawer"]').isVisible(), true)
    const ruleDrawerText = await page.locator('[data-testid="gmv-drawer"]').innerText()
    assert.match(ruleDrawerText, /\u9002\u7528\u5e97\u94fa/)
    assert.match(ruleDrawerText, /\u4eba\u6c11\u5e01/)
    assert.match(ruleDrawerText, /%/)
    await page.waitForTimeout(300)
    await captureWindow(electronApp, path.join(artifacts, 'rule-drawer.png'))
    await page.locator('[data-testid="gmv-drawer"] > header .gmv-icon-button').click()
    assert.equal(await page.locator('[data-testid="gmv-drawer"]').count(), 0)

    const healthList = page.locator('.gmv-health-list')
    if (await healthList.count()) assert.doesNotMatch(await healthList.innerText(), /\broi_guard\b/)

    await page.locator('[data-testid="gmv-tab-campaigns"]').click()
    assert.equal(await page.locator('[data-testid="gmv-pacing-overview"]').isVisible(), true)
    assert.equal(await page.locator('[data-testid="gmv-pacing-overview"] article').count(), 4)
    assert.equal(await page.locator('.gmv-date-field input[type="date"]').count(), 2)
    assert.equal(await page.locator('.gmv-filter-panel select').count() >= 2, true)
    assert.equal(await page.locator('.gmv-filter-panel input[type="number"]').count() >= 4, true)
    assert.match(await page.locator('.gmv-filter-panel').innerText(), /\u4eba\u6c11\u5e01/)
    assert.equal(await page.locator('.gmv-filter-panel input[type="number"]').first().isDisabled(), true)
    assert.equal(await page.locator('.gmv-table--campaigns .gmv-sort-button').count() >= 6, true)
    assert.equal(await page.locator('.gmv-pagination').isVisible(), true)
    const globalSearch = page.locator('.gmv-commandbar .gmv-search input')
    await globalSearch.fill('__gmv_e2e_no_match__')
    await page.locator('[data-testid="gmv-apply-filters"]').click()
    await page.waitForFunction(() => document.querySelectorAll('.gmv-table--campaigns tbody tr').length === 0)
    await page.locator('[data-testid="gmv-clear-filters"]').click()
    await page.waitForFunction(() => document.querySelectorAll('.gmv-table--campaigns tbody tr').length > 0)
    assert.equal(await globalSearch.inputValue(), '')
    const campaignStatusOptions = await page.locator('.gmv-filter-panel select').first().locator('option').evaluateAll((options) => options.map((option) => ({ value: option.value, label: option.textContent?.trim() || '' })))
    assert.equal(campaignStatusOptions.filter((option) => ['ENABLE', 'DISABLE'].includes(option.value)).every((option) => option.label !== option.value), true)
    assert.doesNotMatch(await page.locator('.gmv-table--campaigns').innerText(), /\b(?:ENABLE|DISABLE)\b/)
    await page.locator('[data-testid="gmv-refresh-workspace"]').click()
    await page.waitForFunction(() => !document.querySelector('[data-testid="gmv-refresh-workspace"]')?.disabled)
    await captureWindow(electronApp, path.join(artifacts, 'campaigns.png'))
    const campaignFirstColumn = page.locator('.gmv-table--campaigns tbody tr').first().locator('td').first()
    const campaignFirstColumnBox = await campaignFirstColumn.boundingBox()
    assert.ok(campaignFirstColumnBox && campaignFirstColumnBox.width <= 282)
    assert.equal(await campaignFirstColumn.locator('.gmv-campaign-link strong').evaluate((element) => getComputedStyle(element).webkitLineClamp), '2')
    const activeCampaignSort = page.locator('.gmv-table--campaigns .gmv-sort-button small:not(:empty)').first()
    await activeCampaignSort.scrollIntoViewIfNeeded()
    const activeCampaignSortBox = await activeCampaignSort.boundingBox()
    assert.ok(activeCampaignSortBox && activeCampaignSortBox.width >= 24 && activeCampaignSortBox.height >= 16)
    await captureWindow(electronApp, path.join(artifacts, 'campaign-table.png'))
    const firstCampaignId = (await page.locator('.gmv-table--campaigns tbody tr').first().locator('td').first().locator('small').textContent())?.trim()
    const campaignWorkspaceButtons = page.locator('[data-testid="gmv-open-campaign-workspace"]')
    if (firstCampaignId && await campaignWorkspaceButtons.count()) {
      await campaignWorkspaceButtons.first().click()
      const campaignWorkspace = page.locator('[data-testid="gmv-campaign-workspace"]')
      await campaignWorkspace.waitFor({ state: 'visible' })
      assert.equal(await campaignWorkspace.locator('.gmv-workspace-tabs button').count(), 4)
      assert.equal(await campaignWorkspace.locator('.gmv-workspace-kpis article').count(), 6)
      await campaignWorkspace.locator('.gmv-workspace-tabs button').nth(1).click()
      assert.equal(await campaignWorkspace.locator('.gmv-table--workspace tbody tr').count() <= 10, true)
      await campaignWorkspace.locator('.gmv-workspace-tabs button').nth(2).click()
      assert.equal(await campaignWorkspace.locator('.gmv-table--workspace tbody tr').count() <= 10, true)
      const unavailableProductId = await page.evaluate(async (campaignId) => {
        const workspace = await window.api.tiktokGmvMax.getCampaignWorkspace({ campaignId })
        return workspace.products.items.find((item) => item.profitEstimateAvailable === false)?.productId || ''
      }, firstCampaignId)
      if (unavailableProductId) {
        const unavailableProductRow = campaignWorkspace.locator('.gmv-table--workspace tbody tr').filter({ hasText: unavailableProductId }).first()
        assert.equal((await unavailableProductRow.locator('td').nth(6).innerText()).trim(), '-')
      }
      await captureWindow(electronApp, path.join(artifacts, 'campaign-workspace.png'))
      await page.locator('[data-testid="gmv-drawer"] > header .gmv-icon-button').click()
    }
    const campaignCreativeButtons = page.locator('[data-testid="gmv-open-campaign-creatives"]')
    if (firstCampaignId && await campaignCreativeButtons.count()) {
      await campaignCreativeButtons.first().click()
      assert.equal(await page.locator('[data-testid="gmv-tab-creatives"]').evaluate((element) => element.classList.contains('is-active')), true)
      assert.equal(await page.locator('.gmv-filter-panel--creative select').first().inputValue(), firstCampaignId)
      const experimentBoard = page.locator('[data-testid="gmv-creative-experiment-board"]')
      await experimentBoard.waitFor({ state: 'visible' })
      assert.equal(await experimentBoard.locator('.gmv-experiment-kpis article').count(), 6)
      assert.equal(await experimentBoard.locator('.gmv-experiment-flow article').count(), 2)
      assert.equal(await experimentBoard.locator('.gmv-experiment-outcomes').isVisible(), true)
      await captureWindow(electronApp, path.join(artifacts, 'creative-experiment.png'))
      const scopedStoreId = await page.evaluate(async (campaignId) => (await window.api.tiktokGmvMax.getCampaignWorkspace({ campaignId })).campaign.storeId, firstCampaignId)
      const alternateStoreId = await page.locator('.gmv-commandbar > select').locator('option').evaluateAll((options, currentStoreId) => options.map((option) => option.value).find((value) => value !== 'all' && value !== currentStoreId) || '', scopedStoreId)
      if (alternateStoreId) {
        await page.locator('.gmv-commandbar > select').selectOption(alternateStoreId)
        await page.locator('[data-testid="gmv-apply-filters"]').click()
        await page.waitForFunction(() => document.querySelector('.gmv-filter-panel--creative select')?.value === 'all')
        assert.equal(await page.locator('.gmv-filter-panel--creative select').first().inputValue(), 'all')
        await page.locator('[data-testid="gmv-clear-filters"]').click()
        await page.waitForFunction(() => document.querySelector('.gmv-commandbar > select')?.value === 'all')
      }

      seededOutcomeId = `e2e-creative-outcome-${Date.now()}`
      await electronApp.evaluate(async ({ app }, input) => {
        const { join } = process.getBuiltinModule('node:path')
        const { createRequire } = process.getBuiltinModule('node:module')
        const DatabaseSync = createRequire(join(process.cwd(), 'package.json'))('better-sqlite3')
        const database = new DatabaseSync(join(app.getPath('userData'), '.videogenerate', 'db', 'tiktok-gmv-max.sqlite'))
        const outcome = {
          id: input.outcomeId,
          recommendationId: `${input.outcomeId}-recommendation`,
          campaignId: input.campaignId,
          actionType: 'creative',
          kind: 'creative_rotate',
          operation: 'ROTATE',
          primaryCreativeId: 'video-winner-20260728',
          comparisonCreativeId: 'video-fatigued-20260718',
          preStartDate: '2026-07-19',
          preEndDate: '2026-07-21',
          postStartDate: '2026-07-23',
          postEndDate: '2026-07-25',
          preRoi: '2.38',
          postRoi: '2.91',
          preRevenue: '2380',
          postRevenue: '3492',
          preSpend: '1000',
          postSpend: '1200',
          preEstimatedProfit: '312',
          postEstimatedProfit: '486',
          roiDeltaPercent: '22.27',
          profitDeltaPercent: '55.77',
          successful: true,
          preOrders: '18',
          postOrders: '27',
          preCtr: '1.52',
          postCtr: '1.91',
          preConversionRate: '2.16',
          postConversionRate: '2.64',
          prePlayDepth: '23.7',
          postPlayDepth: '28.4',
          measuredAt: Date.now(),
        }
        database.prepare('INSERT OR REPLACE INTO gmv_action_outcomes (id, recommendation_id, campaign_id, measured_at, payload) VALUES (?, ?, ?, ?, ?)')
          .run(outcome.id, outcome.recommendationId, outcome.campaignId, outcome.measuredAt, JSON.stringify(outcome))
        database.close()
      }, { outcomeId: seededOutcomeId, campaignId: firstCampaignId })

      const seededCreativeOutcomeIds = await page.evaluate(async (campaignId) => {
        const workspace = await window.api.tiktokGmvMax.getCampaignWorkspace({ campaignId })
        return workspace.creativeOutcomes.map((item) => item.id)
      }, firstCampaignId)
      assert.equal(seededCreativeOutcomeIds.includes(seededOutcomeId), true)

      await page.locator('[data-testid="gmv-tab-campaigns"]').click()
      const seededCampaignRow = page.locator('.gmv-table--campaigns tbody tr').filter({ hasText: firstCampaignId }).first()
      await seededCampaignRow.locator('[data-testid="gmv-open-campaign-creatives"]').click()
      const populatedExperimentBoard = page.locator('[data-testid="gmv-creative-experiment-board"]')
      await populatedExperimentBoard.locator('.gmv-outcome-rail article').first().waitFor({ state: 'visible' })
      assert.equal(await populatedExperimentBoard.getByText('ROTATE', { exact: true }).first().isVisible(), true)
      assert.equal(await populatedExperimentBoard.getByText('video-fatigued-20260718 > video-winner-20260728', { exact: true }).first().isVisible(), true)
      await captureWindow(electronApp, path.join(artifacts, 'creative-experiment-outcome.png'))
      await captureWindow(
        electronApp,
        path.join(artifacts, 'creative-experiment-outcome-rail.png'),
        await populatedExperimentBoard.locator('.gmv-experiment-outcomes').boundingBox(),
      )
      await page.locator('[data-testid="gmv-tab-campaigns"]').click()
    }
    const campaignProductButtons = page.locator('[data-testid="gmv-open-campaign-products"]')
    if (firstCampaignId && await campaignProductButtons.count()) {
      await campaignProductButtons.first().click()
      assert.equal(await page.locator('[data-testid="gmv-tab-growth"]').evaluate((element) => element.classList.contains('is-active')), true)
      assert.equal(await page.locator('.gmv-filter-panel--product select').first().inputValue(), firstCampaignId)
      await page.locator('[data-testid="gmv-tab-campaigns"]').click()
    }
    const policyButtons = page.locator('[data-testid="gmv-open-policy"]')
    if (await policyButtons.count()) {
      await policyButtons.first().click()
      assert.equal(await page.locator('[data-testid="gmv-drawer"]').isVisible(), true)
      await captureWindow(electronApp, path.join(artifacts, 'policy-drawer.png'))
      await page.locator('[data-testid="gmv-drawer"] > header .gmv-icon-button').click()
    }

    await page.locator('[data-testid="gmv-tab-creatives"]').click()
    await page.waitForFunction(() => !document.querySelector('.gmv-filter-panel--creative .gmv-button--primary')?.disabled)
    await captureWindow(electronApp, path.join(artifacts, 'creatives.png'))
    const optimizeCreativesButton = page.locator('[data-testid="gmv-optimize-creatives"]')
    assert.equal(await optimizeCreativesButton.isVisible(), true)
    assert.equal(await page.evaluate(() => typeof window.api.tiktokGmvMax.evaluate), 'function')
    const creativeHeadingFit = await optimizeCreativesButton.evaluate((button) => {
      const heading = button.closest('.gmv-section__heading')
      const headingBox = heading?.getBoundingClientRect()
      const buttonBox = button.getBoundingClientRect()
      return Boolean(headingBox && buttonBox.left >= headingBox.left && buttonBox.right <= headingBox.right)
    })
    assert.equal(creativeHeadingFit, true)
    assert.equal(await page.locator('[data-testid="gmv-creative-queue"]').isVisible(), true)
    assert.equal(await page.locator('[data-testid="gmv-list-entry-page"]').isVisible(), true)
    assert.equal(await page.getByText('\u75b2\u52b3\u7d20\u6750', { exact: true }).count() > 0, true)
    assert.equal(await page.getByText('\u5b66\u4e60\u72b6\u6001', { exact: true }).count() > 0, true)
    assert.equal(await page.locator('.gmv-filter-panel--creative select').count(), 2)
    assert.equal(await page.locator('.gmv-table--creatives .gmv-sort-button').count() >= 8, true)
    assert.equal(await page.locator('.gmv-table--creatives tbody tr').count() <= 25, true)
    const creativeViewTabs = page.locator('.gmv-view-tabs button')
    assert.equal(await creativeViewTabs.count(), 2)
    await creativeViewTabs.nth(1).click()
    assert.equal(await creativeViewTabs.nth(1).evaluate((element) => element.classList.contains('is-active')), true)
    await creativeViewTabs.nth(0).click()
    await page.setViewportSize({ width: 900, height: 700 })
    await optimizeCreativesButton.scrollIntoViewIfNeeded()
    assert.equal(await optimizeCreativesButton.isVisible(), true)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false)
    await captureWindow(electronApp, path.join(artifacts, 'creatives-compact.png'))
    await page.setViewportSize({ width: 1440, height: 900 })

    await page.locator('[data-testid="gmv-tab-profit"]').click()
    assert.equal(await page.locator('[data-testid="gmv-store-profit-summary"]').isVisible(), true)
    assert.equal(await page.locator('[data-testid="gmv-product-cost-page"]').isVisible(), true)
    assert.equal(await page.locator('[data-testid="gmv-product-cost-page"] .gmv-filter-panel--cost').isVisible(), true)
    assert.equal(await page.locator('[data-testid="gmv-product-cost-page"] .gmv-sort-button').count() >= 5, true)
    assert.equal(await page.locator('[data-testid="gmv-import-product-costs"]').count(), 1)
    assert.equal(await page.evaluate(() => typeof window.api.tiktokGmvMax.importProductCosts), 'function')
    assert.equal(await page.locator('[data-testid="gmv-product-cost-page"] tbody tr').count() <= 25, true)
    const productCostSection = page.locator('[data-testid="gmv-product-cost-page"]')
    const completenessFilter = productCostSection.locator('[data-testid="gmv-product-cost-completeness"]')
    assert.equal(await completenessFilter.isVisible(), true)
    const costCoverage = await page.evaluate(async () => {
      const complete = await window.api.tiktokGmvMax.getProductCostPage({ page: 1, pageSize: 25, completeness: 'complete' })
      const incomplete = await window.api.tiktokGmvMax.getProductCostPage({ page: 1, pageSize: 25, completeness: 'incomplete' })
      return { complete: complete.total, incomplete: incomplete.total }
    })
    assert.equal(costCoverage.complete + costCoverage.incomplete, lazyDashboard.productCostTotal)
    await completenessFilter.selectOption('incomplete')
    await page.waitForFunction((expected) => document.querySelectorAll('[data-testid="gmv-product-cost-page"] tbody tr').length === Math.min(25, expected), costCoverage.incomplete)
    await completenessFilter.selectOption('all')
    await page.waitForFunction((expected) => document.querySelectorAll('[data-testid="gmv-product-cost-page"] tbody tr').length === Math.min(25, expected), lazyDashboard.productCostTotal)
    const productCostSearch = productCostSection.locator('.gmv-filter-panel--cost input[type="search"], .gmv-filter-panel--cost input:not([type])')
    if (lazyDashboard.productCostTotal > 0 && await productCostSearch.count() === 1) {
      await productCostSearch.fill('__gmv_e2e_no_product__')
      await productCostSearch.press('Enter')
      await page.waitForFunction(() => document.querySelectorAll('[data-testid="gmv-product-cost-page"] tbody tr').length === 0)
      await page.locator('[data-testid="gmv-clear-filters"]').click()
      await page.waitForFunction(() => document.querySelectorAll('[data-testid="gmv-product-cost-page"] tbody tr').length > 0)
      assert.equal(await productCostSearch.inputValue(), '')
    }
    await productCostSection.getByText('\u76ee\u5f55\u72b6\u6001', { exact: true }).waitFor({ state: 'visible' })
    const firstProductCostRow = productCostSection.locator('tbody tr').first()
    if (await firstProductCostRow.count()) {
      assert.equal(await firstProductCostRow.locator('td').count(), 10)
      assert.equal(await firstProductCostRow.locator('td').nth(3).locator('small').count(), 1)
      const productImageButton = firstProductCostRow.locator('.gmv-product-thumb').first()
      const productImage = productImageButton.locator('img')
      assert.equal(await productImageButton.count(), 1)
      assert.equal(await productImage.count(), 1)
      await firstProductCostRow.scrollIntoViewIfNeeded()
      await page.waitForFunction(() => {
        const image = document.querySelector('[data-testid="gmv-product-cost-page"] tbody tr .gmv-product-thumb img')
        return image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0
      }, undefined, { timeout: 20_000 })
      await productImageButton.click()
      const productImagePreview = page.locator('[data-testid="gmv-product-image-preview"]')
      assert.equal(await productImagePreview.isVisible(), true)
      assert.equal(await productImagePreview.locator('img').count(), 1)
      assert.equal(await productImagePreview.locator('header strong').count(), 1)
      await captureWindow(electronApp, path.join(artifacts, 'product-image-preview.png'))
      await page.keyboard.press('Escape')
      assert.equal(await productImagePreview.count(), 0)
      await productImageButton.click()
      await productImagePreview.locator('header .gmv-icon-button').click()
      assert.equal(await productImagePreview.count(), 0)
      await productImageButton.click()
      await productImagePreview.click({ position: { x: 6, y: 6 } })
      assert.equal(await productImagePreview.count(), 0)
    }
    if (process.env.TIKTOK_GMV_MAX_REAL_SYNC === '1') {
      assert.ok(await page.locator('[data-testid="gmv-store-profit-summary"] .gmv-profit-card').count() > 0)
    }
    const zeroCoverageProfitCard = page.locator('[data-testid="gmv-store-profit-summary"] .gmv-profit-card').filter({ hasText: '0%' }).first()
    if (await zeroCoverageProfitCard.count()) {
      const primaryValues = zeroCoverageProfitCard.locator('.gmv-profit-card__primary strong')
      assert.equal((await primaryValues.nth(0).innerText()).trim(), '-')
      assert.equal((await primaryValues.nth(1).innerText()).trim(), '-')
    }
    await captureWindow(electronApp, path.join(artifacts, 'profit.png'))
    await productCostSection.scrollIntoViewIfNeeded()
    await captureWindow(electronApp, path.join(artifacts, 'profit-costs.png'))
    const storeCostForms = page.locator('.gmv-form-grid--cost')
    if (await storeCostForms.count()) {
      const accountMetadata = page.locator('[data-testid="gmv-account-metadata"]').first()
      assert.equal(await accountMetadata.locator('article').count(), 3)
      assert.equal(await accountMetadata.locator('input').count(), 0)
      assert.equal(await storeCostForms.first().locator('input').count(), 8)
      assert.match(await accountMetadata.innerText(), /VND|USD|CNY/)
      await accountMetadata.scrollIntoViewIfNeeded()
      await captureWindow(
        electronApp,
        path.join(artifacts, 'profit-account-metadata.png'),
        await accountMetadata.boundingBox(),
      )
      await page.setViewportSize({ width: 900, height: 700 })
      await accountMetadata.scrollIntoViewIfNeeded()
      const compactMetadataFit = await page.evaluate(() => {
        const metadata = document.querySelector('[data-testid="gmv-account-metadata"]')
        const costForm = metadata?.parentElement?.querySelector('.gmv-form-grid--cost')
        const metadataBox = metadata?.getBoundingClientRect()
        const costBox = costForm?.getBoundingClientRect()
        return {
          horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
          separated: Boolean(metadataBox && costBox && metadataBox.bottom <= costBox.top),
        }
      })
      assert.equal(compactMetadataFit.horizontalOverflow, false)
      assert.equal(compactMetadataFit.separated, true)
      await captureWindow(
        electronApp,
        path.join(artifacts, 'profit-account-metadata-compact.png'),
        await accountMetadata.boundingBox(),
      )
      await page.setViewportSize({ width: 1440, height: 900 })
    }
    const notificationPanel = page.locator('[data-testid="gmv-notification-panel"]')
    const notificationEnabled = page.locator('[data-testid="gmv-notification-enabled"]')
    assert.equal(await notificationPanel.isVisible(), true)
    await notificationPanel.scrollIntoViewIfNeeded()
    const notificationInitiallyEnabled = await notificationEnabled.isChecked()
    await notificationEnabled.click()
    assert.equal(await notificationEnabled.isChecked(), !notificationInitiallyEnabled)
    await notificationEnabled.click()
    assert.equal(await notificationEnabled.isChecked(), notificationInitiallyEnabled)
    const desktopNotificationFit = await notificationPanel.evaluate((panel) => {
      const controls = Array.from(panel.querySelectorAll('.gmv-notification-toggle, .gmv-notification-target'))
      const boxes = controls.map((control) => control.getBoundingClientRect())
      return {
        controlCount: controls.length,
        aligned: boxes.every((box) => Math.abs(box.top - boxes[0].top) <= 1),
        ordered: boxes.every((box, index) => index === 0 || box.left > boxes[index - 1].left),
        contained: panel.scrollWidth <= panel.clientWidth,
      }
    })
    assert.equal(desktopNotificationFit.controlCount, 3)
    assert.equal(desktopNotificationFit.aligned, true)
    assert.equal(desktopNotificationFit.ordered, true)
    assert.equal(desktopNotificationFit.contained, true)
    await captureWindow(electronApp, path.join(artifacts, 'profit-notification.png'), await notificationPanel.boundingBox())
    await page.setViewportSize({ width: 900, height: 700 })
    await notificationPanel.scrollIntoViewIfNeeded()
    const compactNotificationFit = await notificationPanel.evaluate((panel) => {
      const panelBox = panel.getBoundingClientRect()
      const controls = Array.from(panel.querySelectorAll('.gmv-notification-toggle, .gmv-notification-target'))
      return {
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        contained: controls.every((control) => {
          const box = control.getBoundingClientRect()
          return box.left >= panelBox.left && box.right <= panelBox.right
        }),
      }
    })
    assert.equal(compactNotificationFit.horizontalOverflow, false)
    assert.equal(compactNotificationFit.contained, true)
    await captureWindow(electronApp, path.join(artifacts, 'profit-notification-compact.png'), await notificationPanel.boundingBox())
    await page.setViewportSize({ width: 1440, height: 900 })
    assert.equal(await page.locator('input[type="file"]').count(), 1)
    const addProductButton = page.locator('[data-testid="gmv-add-product-cost"]')
    assert.equal(await addProductButton.count(), 1)
    await addProductButton.click()
    assert.equal(await page.locator('[data-testid="gmv-drawer"]').isVisible(), true)
    const productDrawerText = await page.locator('[data-testid="gmv-drawer"]').innerText()
    assert.match(productDrawerText, /\u4eba\u6c11\u5e01/)
    assert.match(productDrawerText, /%/)
    const productDrawerSelects = page.locator('[data-testid="gmv-drawer"] select')
    assert.equal(await productDrawerSelects.count(), 2)
    assert.ok(await productDrawerSelects.nth(1).locator('option').count() >= 1)
    const productDrawerSections = page.locator('[data-testid="gmv-drawer"] .gmv-drawer-section')
    const sellingPriceInput = productDrawerSections.first().locator('input').nth(2)
    const costInputs = productDrawerSections.nth(2).locator('input')
    if (await sellingPriceInput.isEnabled()) {
      await sellingPriceInput.fill('100')
      for (const [index, value] of ['40', '5', '5', '0', '10', '0', '0', '0'].entries()) await costInputs.nth(index).fill(value)
      assert.equal(await page.locator('[data-testid="gmv-drawer"] .gmv-summary-strip--cost strong').count(), 3)
      assert.equal(await page.locator('[data-testid="gmv-drawer"] .gmv-summary-strip--cost strong').nth(0).textContent(), '40.0%')
      assert.equal(await page.locator('[data-testid="gmv-drawer"] .gmv-summary-strip--cost strong').nth(1).textContent(), '2.50x')
      assert.match(await page.locator('[data-testid="gmv-drawer"] .gmv-summary-strip--cost strong').nth(2).textContent(), /^\d+\.\d{2}x$/)
      assert.equal(await page.locator('[data-testid="gmv-drawer"] .gmv-alert--warning').count(), 0)
    } else {
      assert.equal(await costInputs.nth(0).isDisabled(), true)
      assert.ok(await page.locator('[data-testid="gmv-drawer"] .gmv-alert--warning').count() > 0)
    }
    await captureWindow(electronApp, path.join(artifacts, 'product-drawer.png'))
    await page.locator('[data-testid="gmv-drawer"] .gmv-summary-strip--cost').scrollIntoViewIfNeeded()
    await captureWindow(electronApp, path.join(artifacts, 'product-drawer-profit-preview.png'))
    await page.locator('[data-testid="gmv-drawer"] > header .gmv-icon-button').click()

    await page.locator('[data-testid="gmv-tab-actions"]').click()
    await page.locator('.gmv-filter-panel--action').waitFor({ state: 'visible' })
    assert.equal(await page.locator('.gmv-filter-panel--action select').count(), 3)
    const actionTypeOptions = await page.locator('.gmv-filter-panel--action select').nth(1).locator('option').allTextContents()
    assert.ok(actionTypeOptions.includes('\u5904\u7406\u6295\u653e\u7d20\u6750'))
    assert.equal(actionTypeOptions.includes('creative'), false)
    const actionSortButtons = page.locator('.gmv-action-sort-group button')
    assert.equal(await actionSortButtons.count(), 3)
    assert.equal(await page.locator('.gmv-action-sort-group button[aria-pressed="true"]').count(), 1)
    await actionSortButtons.nth(1).click()
    assert.equal(await actionSortButtons.nth(1).getAttribute('aria-pressed'), 'true')
    await actionSortButtons.nth(1).click()
    assert.equal(await actionSortButtons.nth(1).getAttribute('aria-pressed'), 'true')
    assert.equal(await page.locator('.gmv-section > .gmv-pagination').count() >= 1, true)
    await captureWindow(electronApp, path.join(artifacts, 'actions.png'))
    const actionCards = page.locator('.gmv-recommendation')
    const pendingActionCheckboxes = page.locator('.gmv-recommendation input[type="checkbox"]')
    if (await pendingActionCheckboxes.count()) {
      await pendingActionCheckboxes.first().click()
      assert.equal(await page.locator('[data-testid="gmv-batch-bar"]').isVisible(), true)
      await page.locator('[data-testid="gmv-batch-bar"] .gmv-icon-button').click()
    }
    if (await actionCards.count()) {
      const firstActionText = await actionCards.first().innerText()
      assert.equal(firstActionText.includes('Creative ROI remained'), false)
      assert.equal(await actionCards.first().locator('.gmv-recommendation__summary').isVisible(), true)
      await actionCards.first().click()
      assert.equal(await page.locator('[data-testid="gmv-drawer"]').isVisible(), true)
      await page.locator('[data-testid="gmv-drawer"] > header .gmv-icon-button').click()
    }

    await page.locator('[data-testid="gmv-tab-audit"]').click()
    await page.locator('.gmv-filter-panel--audit').waitFor({ state: 'visible' })
    assert.equal(await page.locator('.gmv-filter-panel--audit select').count(), 2)
    assert.equal(await page.locator('.gmv-capabilities article').count(), 8)
    const capabilityLabels = await page.locator('.gmv-capabilities strong').allTextContents()
    assert.equal(capabilityLabels.every((label) => label && !label.includes('_')), true)
    const auditSortLabel = page.locator('.gmv-sort-button--standalone small')
    const auditSortBefore = await auditSortLabel.textContent()
    await page.locator('.gmv-sort-button--standalone').click()
    assert.notEqual(await auditSortLabel.textContent(), auditSortBefore)
    assert.equal(await page.locator('.gmv-section .gmv-pagination').count() >= 1, true)
    await captureWindow(electronApp, path.join(artifacts, 'audit.png'))

    await page.locator('[data-testid="gmv-tab-overview"]').click()
    const themeColors = []
    for (const theme of ['dark-teal', 'soft-mint', 'warm-paper', 'clear-sky']) {
      const colors = await page.evaluate((value) => {
        document.documentElement.dataset.appTheme = value
        const workspace = document.querySelector('[data-testid="gmv-max-workspace"]')
        const panel = document.querySelector('.gmv-metrics article')
        return {
          workspace: workspace ? getComputedStyle(workspace).backgroundColor : '',
          panel: panel ? getComputedStyle(panel).backgroundColor : '',
          text: workspace ? getComputedStyle(workspace).color : '',
        }
      }, theme)
      assert.ok(colors.workspace)
      assert.ok(colors.panel)
      assert.ok(colors.text)
      themeColors.push(`${colors.workspace}:${colors.panel}:${colors.text}`)
      await page.waitForTimeout(120)
      await captureWindow(electronApp, path.join(artifacts, `theme-${theme}.png`))
    }
    assert.equal(new Set(themeColors).size, 4)
    await page.evaluate(() => { document.documentElement.dataset.appTheme = 'dark-teal' })
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.evaluate(() => document.querySelector('.ds-workspace')?.scrollTo(0, 0))
    await captureWindow(electronApp, path.join(artifacts, 'desktop.png'))
    const desktopFit = await page.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight,
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      workspaceVisible: Boolean(document.querySelector('[data-testid="gmv-max-workspace"]')),
    }))
    assert.equal(desktopFit.horizontalOverflow, false)
    assert.equal(desktopFit.workspaceVisible, true)

    await page.setViewportSize({ width: 900, height: 700 })
    await page.waitForFunction(() => document.querySelector('[data-testid="gmv-feature-nav"]')?.getBoundingClientRect().width <= 66)
    await page.evaluate(() => document.querySelector('.ds-workspace')?.scrollTo(0, 0))
    await captureWindow(electronApp, path.join(artifacts, 'compact.png'))
    const compactFit = await page.evaluate(() => ({
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      headerVisible: document.querySelector('.gmv-header')?.getBoundingClientRect().bottom > 0,
      tabsVisible: document.querySelector('.gmv-tabs')?.getBoundingClientRect().bottom > 0,
      featureNavWidth: document.querySelector('[data-testid="gmv-feature-nav"]')?.getBoundingClientRect().width || 0,
      appSidebarWidth: document.querySelector('.ds-sidebar')?.getBoundingClientRect().width || 0,
      visibleSidebarLabels: Array.from(document.querySelectorAll('.ds-sidebar__item span, .ds-sidebar__section-title, .app-sidebar-footer-action span, .app-sidebar-user .min-w-0, .app-sidebar-collapse span')).filter((item) => {
        const style = getComputedStyle(item)
        return style.display !== 'none' && item.getBoundingClientRect().width > 0
      }).length,
      centeredSidebarIcons: Array.from(document.querySelectorAll('.ds-sidebar__item')).every((item) => {
        const icon = item.querySelector('svg')
        if (!icon) return true
        const itemBox = item.getBoundingClientRect()
        const iconBox = icon.getBoundingClientRect()
        return Math.abs((itemBox.left + itemBox.width / 2) - (iconBox.left + iconBox.width / 2)) <= 1
      }),
      centeredSettingsIcon: (() => {
        const button = document.querySelector('.app-sidebar-footer-action')
        const icon = button?.querySelector('svg')
        if (!button || !icon) return false
        const buttonBox = button.getBoundingClientRect()
        const iconBox = icon.getBoundingClientRect()
        return Math.abs((buttonBox.left + buttonBox.width / 2) - (iconBox.left + iconBox.width / 2)) <= 1
      })(),
    }))
    assert.equal(compactFit.horizontalOverflow, false)
    assert.equal(compactFit.headerVisible, true)
    assert.equal(compactFit.tabsVisible, true)
    assert.ok(compactFit.featureNavWidth <= 66)
    assert.ok(compactFit.appSidebarWidth <= 94)
    assert.equal(compactFit.visibleSidebarLabels, 0)
    assert.equal(compactFit.centeredSidebarIcons, true)
    assert.equal(compactFit.centeredSettingsIcon, true)

    assert.deepEqual(pageErrors, [])
    assert.deepEqual(consoleErrors.filter((item) => /gmv|max|tiktok/i.test(item)), [])
    console.log('[tiktok-gmv-max-electron] e2e passed', { desktopFit, compactFit, productLabFit })
  } finally {
    if (seededOutcomeId) {
      await electronApp.evaluate(async ({ app }, outcomeId) => {
        const { join } = process.getBuiltinModule('node:path')
        const { createRequire } = process.getBuiltinModule('node:module')
        const DatabaseSync = createRequire(join(process.cwd(), 'package.json'))('better-sqlite3')
        const database = new DatabaseSync(join(app.getPath('userData'), '.videogenerate', 'db', 'tiktok-gmv-max.sqlite'))
        database.prepare('DELETE FROM gmv_action_outcomes WHERE id = ?').run(outcomeId)
        database.close()
      }, seededOutcomeId).catch(() => {})
    }
    await electronApp.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
