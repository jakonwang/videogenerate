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
    const commandCenter = await page.evaluate(async () => await window.api.tiktokGmvMax.getCommandCenter())
    assert.ok(Array.isArray(workspace.decisions))
    assert.ok(Array.isArray(workspace.experiments))
    assert.equal(typeof workspace.decisionSummary.total, 'number')
    assert.equal(workspace.decisionSummary.total, workspace.decisions.length)
    assert.ok(Array.isArray(commandCenter.stores))
    assert.equal(commandCenter.decisions.length, workspace.decisions.length)
    assert.equal(commandCenter.decisionSummary.total, workspace.decisionSummary.total)
    const activeExperimentStates = new Set(['pending_approval', 'executing', 'observing', 'rollback_pending'])
    const enabledStatuses = new Set(['ENABLE', 'ENABLED', 'ACTIVE', 'RUNNING', 'LIVE'])
    const rows = workspace.decisions.map((decision) => ({
      decision,
      instance: workspace.instances.find((item) => item.id === decision.sopInstanceId),
    })).filter((item) => item.instance)
    const isEnabled = (row) => enabledStatuses.has(String(row.instance.campaignOperationStatus || '').trim().toUpperCase())
    const enabledRows = rows.filter(isEnabled)
    const disabledRows = rows.filter((row) => !isEnabled(row))
    const stores = [...new Map(rows.map((row) => [row.instance.storeId, row.instance.storeName])).entries()]
    const visibleCards = page.locator('.gmv-decision-card')
    const visibleTodayTasks = page.locator('.gmv-today-plan__list button')
    const assertVisibleScope = async (scopeRows) => {
      assert.equal(await visibleCards.count(), Math.min(4, scopeRows.length))
      return visibleCards.evaluateAll((cards) => cards.map((card) => ({
        storeId: card.dataset.storeId,
        campaignType: card.dataset.campaignType,
        enabled: card.dataset.campaignEnabled,
      })))
    }
    const assertTodayPlan = async (scopeRows) => {
      const instanceIds = new Set(scopeRows.map((row) => row.instance.id))
      const tasks = workspace.tasks.filter((task) => task.status !== 'superseded' && instanceIds.has(task.sopInstanceId))
      const latestDate = tasks.map((task) => task.localDate).sort().at(-1)
      const expected = tasks.filter((task) => task.localDate === latestDate && task.status !== 'completed').slice(0, 5)
      assert.equal(await visibleTodayTasks.count(), expected.length)
      const visibleInstanceIds = await visibleTodayTasks.evaluateAll((buttons) => buttons.map((button) => button.dataset.sopInstanceId))
      assert.ok(visibleInstanceIds.every((id) => instanceIds.has(id)))
    }
    const assertSummary = async (scopeRows) => {
      for (const priority of ['P0', 'P1', 'P2']) {
        assert.equal(Number(await page.locator(`[data-summary="${priority}"] strong`).innerText()), scopeRows.filter((row) => row.decision.priority === priority).length)
      }
      const instanceIds = new Set(scopeRows.map((row) => row.instance.id))
      const activeExperiments = workspace.experiments.filter((item) => instanceIds.has(item.sopInstanceId) && activeExperimentStates.has(item.state)).length
      assert.equal(Number(await page.locator('[data-summary="experiments"] strong').innerText()), activeExperiments)
    }
    assert.equal(await page.locator('.gmv-decision-summary article').count(), 4)
    assert.equal(await page.getByText('GMV Max 智能运营中枢', { exact: true }).count(), 1)
    assert.equal((await page.locator('[data-testid="gmv-decision-center"]').innerText()).includes('gmvMaxDecision.'), false)
    assert.equal(await page.locator('.gmv-decision-store-tabs button').count(), stores.length + 1)
    assert.ok(await page.locator('[data-testid="gmv-cockpit-scopebar"]').isVisible())
    assert.ok(await page.locator('[data-testid="gmv-today-plan"]').isVisible())
    assert.equal(await page.locator('.gmv-cockpit-scopebar__lifecycle button').count(), 5)
    for (const [, storeName] of stores) assert.ok((await page.locator('.gmv-decision-store-tabs').innerText()).includes(storeName))
    assert.equal(await page.locator('[data-testid="gmv-decision-type-filter"] button').count(), 3)
    assert.equal(await page.locator('[data-testid="gmv-decision-status-filter"] button').count(), 3)
    assert.ok((await page.locator('[data-status="enabled"]').getAttribute('class')).includes('is-active'))
    assert.ok((await assertVisibleScope(enabledRows)).every((item) => item.enabled === 'true'))
    await assertSummary(enabledRows)
    await assertTodayPlan(enabledRows)
    assert.equal(await page.locator('.gmv-decision-card__media').count(), await visibleCards.count())
    if (workspace.decisions.some((item) => item.productImageUrl)) assert.ok(await page.locator('.gmv-decision-card__media img').count() > 0)
    assert.equal(await page.locator('.gmv-decision-card__scope').count(), await visibleCards.count())
    const statusAction = page.locator('[data-testid="gmv-sop-toggle-status"]')
    const startAction = page.locator('[data-testid="gmv-sop-toggle-start"]')
    assert.ok(await statusAction.isVisible())
    assert.match(await statusAction.innerText(), /暂停当前运营|继续当前运营/)
    assert.match(await startAction.innerText(), /新建运营周期|取消/)
    assert.ok((await statusAction.getAttribute('title')).length > 12)
    assert.ok((await startAction.getAttribute('title')).length > 12)

    const readability = await page.evaluate(() => {
      const size = (selector) => {
        const element = document.querySelector(selector)
        return element ? Number.parseFloat(getComputedStyle(element).fontSize) : 0
      }
      return {
        cardTitle: size('.gmv-decision-card__title'),
        cardMetric: size('.gmv-decision-card__metrics small'),
        sopDecision: size('.gmv-sop-decision__main p'),
        taskDescription: size('.gmv-sop-task-list p'),
        resolutionDescription: size('.gmv-sop-resolution__main p'),
        sopMetricLabel: size('.gmv-sop-metrics span'),
        videoAnalysis: size('.gmv-sop-video-analysis ul'),
      }
    })
    assert.ok(readability.cardTitle >= 14)
    assert.ok(readability.cardMetric >= 10)
    assert.ok(readability.sopDecision >= 13)
    assert.ok(readability.taskDescription >= 12)
    if (await page.locator('.gmv-sop-resolution__main p').count()) assert.ok(readability.resolutionDescription >= 13)
    assert.ok(readability.sopMetricLabel >= 12)
    assert.ok(readability.videoAnalysis >= 11)

    await page.locator('.gmv-decision-card').first().click()
    await page.locator('[data-testid="gmv-command-center-drawer"]').waitFor({ state: 'visible' })
    assert.equal(await page.locator('.gmv-command-drawer__tabs button').count(), 5)
    assert.ok((await page.locator('[data-testid="gmv-command-center-drawer"]').innerText()).includes(stores[0][1]) || (await page.locator('[data-testid="gmv-command-center-drawer"]').innerText()).includes(workspace.instances[0].storeName))
    await page.screenshot({ path: path.join(artifacts, 'decision-drawer-1440x900.png') })
    await page.keyboard.press('Escape')
    await page.locator('[data-testid="gmv-command-center-drawer"]').waitFor({ state: 'hidden' })

    await page.locator('.gmv-decision-filters button', { hasText: 'P0' }).click()
    assert.equal(await visibleCards.count(), Math.min(4, enabledRows.filter((row) => row.decision.priority === 'P0').length))
    await page.locator('.gmv-decision-filters button').first().click()
    if (enabledRows.length > 4) {
      const firstPageSummary = await page.locator('.gmv-decision-pagination > span').innerText()
      await page.locator('.gmv-decision-pagination button').last().click()
      assert.notEqual(await page.locator('.gmv-decision-pagination > span').innerText(), firstPageSummary)
      assert.equal(await page.locator('.gmv-decision-pagination button').first().isDisabled(), false)
    }

    await page.locator('[data-status="disabled"]').click()
    assert.equal(await page.locator('.gmv-decision-pagination button').first().isDisabled(), true)
    assert.ok((await assertVisibleScope(disabledRows)).every((item) => item.enabled === 'false'))
    await assertSummary(disabledRows)
    await assertTodayPlan(disabledRows)

    await page.locator('[data-type="LIVE"]').click()
    const disabledLiveRows = disabledRows.filter((row) => row.instance.campaignType === 'LIVE')
    assert.ok((await assertVisibleScope(disabledLiveRows)).every((item) => item.campaignType === 'LIVE' && item.enabled === 'false'))
    await assertSummary(disabledLiveRows)

    const [storeId] = stores.find(([candidateId]) => disabledLiveRows.some((row) => row.instance.storeId === candidateId))
    await page.locator(`.gmv-decision-store-tabs button[data-store-id="${storeId}"]`).click()
    const storeRows = disabledLiveRows.filter((row) => row.instance.storeId === storeId)
    assert.ok((await assertVisibleScope(storeRows)).every((item) => item.storeId === storeId))
    await assertSummary(storeRows)
    await assertTodayPlan(storeRows)

    await page.locator('[data-testid="gmv-decision-store-all"]').click()
    await page.locator('[data-type="all"]').click()
    await page.locator('[data-status="enabled"]').click()
    await assertVisibleScope(enabledRows)

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
        cardColumns: getComputedStyle(document.querySelector('.gmv-decision-grid')).gridTemplateColumns.split(' ').length,
        visibleCards: document.querySelectorAll('.gmv-decision-card').length,
        titleClamp: getComputedStyle(document.querySelector('.gmv-decision-card__title')).webkitLineClamp,
        storeTabRows: new Set([...document.querySelectorAll('.gmv-decision-store-tabs button')].map((button) => Math.round(button.getBoundingClientRect().top))).size,
        cardScopes: document.querySelectorAll('.gmv-decision-card__scope').length,
        todayPlanVisible: document.querySelector('[data-testid="gmv-today-plan"]').getBoundingClientRect().top < window.innerHeight,
      }
    })
    assert.deepEqual(desktop, { horizontalOverflow: false, centerContained: true, summaryColumns: 4, cardColumns: 2, visibleCards: Math.min(4, enabledRows.length), titleClamp: '2', storeTabRows: 1, cardScopes: Math.min(4, enabledRows.length), todayPlanVisible: true })

    await page.locator('[data-status="disabled"]').click()
    await page.screenshot({ path: path.join(artifacts, 'decision-center-disabled-1440x900.png') })
    assert.ok((await assertVisibleScope(disabledRows)).every((item) => item.enabled === 'false'))
    await page.locator('[data-status="enabled"]').click()

    await page.setViewportSize({ width: 1280, height: 760 })
    await page.screenshot({ path: path.join(artifacts, 'decision-center-1280x760.png') })
    const compact = await page.evaluate(() => ({
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      summaryColumns: getComputedStyle(document.querySelector('.gmv-decision-summary')).gridTemplateColumns.split(' ').length,
      cardColumns: getComputedStyle(document.querySelector('.gmv-decision-grid')).gridTemplateColumns.split(' ').length,
      storeTabRows: new Set([...document.querySelectorAll('.gmv-decision-store-tabs button')].map((button) => Math.round(button.getBoundingClientRect().top))).size,
      scopeVisible: document.querySelector('[data-testid="gmv-decision-scope"]').getBoundingClientRect().bottom <= window.innerHeight + 2,
      cardsContained: [...document.querySelectorAll('.gmv-decision-card')].every((element) => {
        const rect = element.getBoundingClientRect()
        return rect.left >= -2 && rect.right <= window.innerWidth + 2
      }),
    }))
    assert.equal(compact.horizontalOverflow, false)
    assert.ok([2, 4].includes(compact.summaryColumns))
    assert.ok([1, 2].includes(compact.cardColumns))
    assert.equal(compact.storeTabRows, 1)
    assert.equal(compact.scopeVisible, true)
    assert.equal(compact.cardsContained, true)
    await page.locator('.gmv-decision-pagination').scrollIntoViewIfNeeded()
    assert.equal(await page.locator('.gmv-decision-pagination').evaluate((element) => element.getBoundingClientRect().bottom <= window.innerHeight + 2), true)

    await page.setViewportSize({ width: 1440, height: 900 })
    await page.locator('[data-testid="gmv-sop-decision"]').scrollIntoViewIfNeeded()
    await page.screenshot({ path: path.join(artifacts, 'sop-operations-1440x900.png') })
    const operations = await page.evaluate(() => {
      const selectors = [
        '[data-testid="gmv-sop-decision"]',
        '[data-testid="gmv-sop-today-tasks"]',
        '.gmv-sop-metrics',
      ]
      const regions = selectors.map((selector) => document.querySelector(selector)).filter(Boolean)
      return {
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        regionsContained: regions.every((element) => {
          const rect = element.getBoundingClientRect()
          return rect.left >= -2 && rect.right <= window.innerWidth + 2
        }),
        taskRowsContained: [...document.querySelectorAll('.gmv-sop-task-list article')].every((element) => element.scrollWidth <= element.clientWidth + 2),
        taskTextContained: [...document.querySelectorAll('.gmv-sop-task-list article > div')].every((element) => element.scrollWidth <= element.clientWidth + 2),
      }
    })
    assert.deepEqual(operations, {
      horizontalOverflow: false,
      regionsContained: true,
      taskRowsContained: true,
      taskTextContained: true,
    })

    const videoInsights = page.locator('.gmv-sop-video-insights')
    assert.ok(await videoInsights.isVisible())
    await videoInsights.scrollIntoViewIfNeeded()
    await page.screenshot({ path: path.join(artifacts, 'sop-video-insights-1440x900.png') })
    const materials = await page.evaluate(() => {
      const insights = document.querySelector('.gmv-sop-video-insights')
      const workspace = document.querySelector('.gmv-sop-video-workspace')
      const analysis = document.querySelector('.gmv-sop-video-analysis')
      const rect = insights?.getBoundingClientRect()
      return {
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        insightsContained: Boolean(rect && rect.left >= -2 && rect.right <= window.innerWidth + 2),
        workspaceContained: Boolean(workspace && workspace.scrollWidth <= workspace.clientWidth + 2),
        analysisContained: Boolean(analysis && analysis.scrollWidth <= analysis.clientWidth + 2),
      }
    })
    assert.deepEqual(materials, {
      horizontalOverflow: false,
      insightsContained: true,
      workspaceContained: true,
      analysisContained: true,
    })
    assert.deepEqual(pageErrors, [])
    assert.deepEqual(consoleErrors.filter((message) => !message.includes('Electron Security Warning')), [])
    console.log('tiktok-gmv-max-decision Electron E2E passed', { decisions: workspace.decisions.length, experiments: workspace.experiments.length, desktop, compact, readability, operations, materials })
  } finally {
    await electronApp.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
