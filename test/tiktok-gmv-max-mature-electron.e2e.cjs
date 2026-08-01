const assert = require('node:assert/strict')
const path = require('node:path')
const { mkdir, writeFile } = require('node:fs/promises')
const { _electron: electron } = require('playwright')

async function capture(electronApp, filePath) {
  const base64 = await electronApp.evaluate(async ({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows().find((item) => item.isVisible())
    if (!window) throw new Error('Electron window is unavailable.')
    return (await window.capturePage()).toPNG().toString('base64')
  })
  await writeFile(filePath, Buffer.from(base64, 'base64'))
}

async function selectSopInstance(page, sopInstanceId) {
  await page.locator('[data-testid="gmv-sop-open-picker"]').click()
  const picker = page.locator('[data-testid="gmv-sop-picker"]')
  await picker.waitFor({ state: 'visible' })
  await picker.locator(`[data-sop-instance-id="${sopInstanceId}"] .gmv-sop-picker__item`).click()
  await picker.waitFor({ state: 'hidden' })
}

async function dismissInterruptedSync(page) {
  const overlay = page.locator('[data-testid="gmv-sync-progress-overlay"]')
  if (!await overlay.isVisible().catch(() => false)) return false
  const dialogText = await overlay.innerText()
  await overlay.locator('footer button').first().click()
  await overlay.waitFor({ state: 'hidden' })
  return /interrupted|中断|gi\u00e1n \u0111o\u1ea1n/i.test(dialogText)
}

async function main() {
  const root = path.resolve(__dirname, '..')
  const artifacts = path.join(root, 'test-artifacts', 'tiktok-gmv-max-mature')
  await mkdir(artifacts, { recursive: true })
  const electronApp = await electron.launch({ args: ['.'], cwd: root })
  const page = await electronApp.firstWindow()
  const pageErrors = []
  const consoleErrors = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })

  try {
    await page.waitForLoadState('domcontentloaded')
    await page.evaluate(() => { window.location.hash = '#/plugins' })
    await page.getByText('TikTok GMV MAX', { exact: false }).first().waitFor({ state: 'visible', timeout: 60_000 })
    await page.evaluate(() => { window.location.hash = '#/plugins/tiktok-gmv-max-optimizer' })
    await page.locator('[data-testid="gmv-max-workspace"]').waitFor({ state: 'visible', timeout: 60_000 })
    await page.locator('[data-testid="gmv-tab-sop"]').click()
    const interruptedSyncRecovered = await dismissInterruptedSync(page)
    try {
    await page.locator('[data-testid="gmv-sop-phase-rail"]').waitFor({ state: 'visible', timeout: 30_000 })
    for (let index = 0; index < 3; index += 1) {
      await page.locator('[data-testid="gmv-tab-campaigns"]').click()
      await page.locator('[data-testid="gmv-tab-sop"]').click()
    }
    await page.locator('[data-testid="gmv-sop-phase-rail"]').waitFor({ state: 'visible', timeout: 30_000 })
    assert.equal(await page.locator('[data-testid="gmv-sop-loading"]').count(), 0)
    } catch (error) {
      const diagnostic = await page.evaluate(async () => {
        const workspace = await window.api.tiktokGmvMax.getSopWorkspace()
        return {
          instanceCount: workspace.instances.length,
          instanceTracks: workspace.instances.map((item) => ({ id: item.id, track: item.track, productId: item.productId })),
          activeSopTab: document.querySelector('[data-testid="gmv-tab-sop"]')?.classList.contains('is-active'),
          pickerTriggerExists: Boolean(document.querySelector('[data-testid="gmv-sop-open-picker"]')),
          bodyText: document.body.innerText.slice(0, 1_000),
        }
      })
      console.error('[tiktok-gmv-max-mature-electron] workspace diagnostic', { diagnostic, pageErrors, consoleErrors })
      throw error
    }

    const snapshot = await page.evaluate(async () => {
      const workspace = await window.api.tiktokGmvMax.getSopWorkspace()
      return {
        current: workspace.instances.find((item) => item.campaignId === '1866032431527057' && item.productId === '1733451742636902170') || workspace.instances[0],
        externalTarget: workspace.instances.flatMap((item) => item.issueResolutions.map((issue) => ({ instanceId: item.id, issue }))).find((item) => item.issue.actionTarget === 'seller_center'),
        autoOnboarding: workspace.autoOnboarding,
        tasks: workspace.tasks,
      }
    })
    const { current, externalTarget, autoOnboarding, tasks } = snapshot
    assert.ok(current)
    assert.ok(autoOnboarding.eligibleCampaigns >= autoOnboarding.managedCampaigns)
    assert.ok(autoOnboarding.managedCampaigns >= 1)
    assert.ok(autoOnboarding.automaticInstances >= 0)
    assert.ok(autoOnboarding.waitingForSalesData >= 0)
    assert.equal(current.track, 'mature_product')
    assert.equal(current.matureState, 'dormant_recovery')
    assert.equal(current.phase, 'recovery_diagnosis')
    assert.equal(Number(current.targetRoi), 6.6)
    assert.equal(current.matureAssessment.lastReportDate, '2026-07-16')
    assert.equal(current.lastDeliveryDate, '2026-07-05')
    assert.equal(current.matureAssessment.writeActionsAllowed, false)
    const currentTasks = tasks.filter((item) => item.sopInstanceId === current.id && item.localDate === '2026-07-31')
    for (const kind of ['data_review', 'creative_review', 'winner_variations']) {
      const task = currentTasks.find((item) => item.kind === kind)
      assert.equal(task?.status, 'completed')
      assert.ok(task?.evidence)
    }
    assert.ok(['pending', 'superseded'].includes(currentTasks.find((item) => item.kind === 'ad_adjustment')?.status))
    assert.equal(await page.evaluate(() => typeof window.api.tiktokGmvMax.runSopAutomation), 'function')
    await selectSopInstance(page, current.id)
    try {
      await page.locator('[data-testid="gmv-mature-console"]').waitFor({ state: 'visible', timeout: 10_000 })
    } catch (error) {
      const diagnostic = await page.evaluate(async (sopInstanceId) => {
        const workspace = await window.api.tiktokGmvMax.getSopWorkspace()
        const instance = workspace.instances.find((item) => item.id === sopInstanceId)
        return {
          pickerTriggerExists: Boolean(document.querySelector('[data-testid="gmv-sop-open-picker"]')),
          phaseRailCount: document.querySelectorAll('[data-testid="gmv-sop-phase-rail"] > div').length,
          instance: instance && { id: instance.id, track: instance.track, phase: instance.phase, hasAssessment: Boolean(instance.matureAssessment) },
          bodyText: document.body.innerText.slice(0, 1_000),
        }
      }, current.id)
      console.error('[tiktok-gmv-max-mature-electron] selection diagnostic', diagnostic)
      throw error
    }
    const automation = await page.evaluate(async (sopInstanceId) => {
      await window.api.tiktokGmvMax.updateSop({ id: sopInstanceId, status: 'active', automationEnabled: true, automationMode: 'draft_actions' })
      const before = await window.api.tiktokGmvMax.getSopWorkspace()
      const beforeInterventions = before.interventions.filter((item) => item.sopInstanceId === sopInstanceId).length
      const runs = await window.api.tiktokGmvMax.runSopAutomation({ sopInstanceId, force: true })
      const after = await window.api.tiktokGmvMax.getSopWorkspace()
      return {
        run: runs[0],
        interventionDelta: after.interventions.filter((item) => item.sopInstanceId === sopInstanceId).length - beforeInterventions,
        automationRunCount: after.automationRuns.filter((item) => item.sopInstanceId === sopInstanceId).length,
      }
    }, current.id)
    assert.equal(automation.run.status, 'completed')
    assert.equal(automation.run.action, 'verify_recovery_readiness')
    assert.equal(automation.run.decision, 'recovery_task')
    assert.ok(automation.run.attempt >= 1)
    assert.equal(automation.run.nextRetryAt, undefined)
    assert.equal(automation.interventionDelta, 0)
    assert.ok(automation.automationRunCount >= 1)

    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.locator('[data-testid="gmv-max-workspace"]').waitFor({ state: 'visible', timeout: 60_000 })
    await page.locator('[data-testid="gmv-tab-sop"]').click()
    await dismissInterruptedSync(page)
    await page.locator('[data-testid="gmv-sop-phase-rail"]').waitFor({ state: 'visible', timeout: 60_000 })
    await page.waitForFunction((sopInstanceId) => window.localStorage.getItem('videogenerate:gmv-max:sop-selection:v1') === sopInstanceId, current.id)
    await page.locator('[data-testid="gmv-mature-console"]').waitFor({ state: 'visible', timeout: 60_000 })
    await page.locator('[data-testid="gmv-sop-automation-status"]').waitFor({ state: 'visible' })
    assert.equal(await page.locator('[data-testid="gmv-sop-automation-status"]').innerText().then((value) => value.includes('Created the recovery readiness diagnosis task.')), false)
    await page.locator('[data-testid="gmv-sop-automation-settings-toggle"]').click()
    const automationToggle = page.locator('[data-testid="gmv-sop-automation-toggle"]')
    await automationToggle.click()
    await page.waitForFunction(async (sopInstanceId) => {
      const workspace = await window.api.tiktokGmvMax.getSopWorkspace()
      return workspace.instances.find((item) => item.id === sopInstanceId)?.automationEnabled === false
    }, current.id)
    assert.equal(await page.locator('[data-testid="gmv-sop-automation-run"]').isDisabled(), true)
    await automationToggle.click()
    await page.waitForFunction(async (sopInstanceId) => {
      const workspace = await window.api.tiktokGmvMax.getSopWorkspace()
      return workspace.instances.find((item) => item.id === sopInstanceId)?.automationEnabled !== false
    }, current.id)
    const automationRunButton = page.locator('[data-testid="gmv-sop-automation-run"]')
    const lastAutomationAt = await page.evaluate(async (sopInstanceId) => {
      const workspace = await window.api.tiktokGmvMax.getSopWorkspace()
      return workspace.instances.find((item) => item.id === sopInstanceId)?.lastAutomationAt || 0
    }, current.id)
    await automationRunButton.focus()
    await page.keyboard.press('Enter')
    await page.waitForFunction(async ({ sopInstanceId, previousRunAt }) => {
      const workspace = await window.api.tiktokGmvMax.getSopWorkspace()
      return Number(workspace.instances.find((item) => item.id === sopInstanceId)?.lastAutomationAt || 0) > previousRunAt
    }, { sopInstanceId: current.id, previousRunAt: lastAutomationAt })
    await page.waitForFunction(() => !document.querySelector('[data-testid="gmv-sop-automation-run"]')?.hasAttribute('disabled'))
    await page.locator('[data-testid="gmv-sop-automation-settings-toggle"]').click()

    await page.setViewportSize({ width: 1440, height: 900 })
    await page.locator('[data-testid="gmv-mature-console"]').scrollIntoViewIfNeeded()
    const pickerTrigger = page.locator('[data-testid="gmv-sop-open-picker"]')
    await pickerTrigger.click()
    const picker = page.locator('[data-testid="gmv-sop-picker"]')
    const pickerOverviewCount = await picker.locator('.gmv-sop-picker__summary > span').count()
    const pickerSearch = picker.locator('input[type="search"]')
    await capture(electronApp, path.join(artifacts, 'object-picker-all-1440x900.png'))
    await pickerSearch.fill(current.productId)
    assert.ok(await picker.locator('[data-sop-instance-id]').count() >= 1)
    await pickerSearch.fill(current.campaignName)
    assert.ok(await picker.locator('[data-sop-instance-id]').count() >= 1)
    await pickerSearch.fill(current.storeName)
    assert.ok(await picker.locator('[data-sop-instance-id]').count() >= 1)
    await capture(electronApp, path.join(artifacts, 'object-picker-1440x900.png'))
    await pickerSearch.fill('no-such-product-for-sop-test')
    await picker.locator('.gmv-sop-picker__empty').waitFor({ state: 'visible' })
    await page.keyboard.press('Escape')
    await picker.waitFor({ state: 'hidden' })
    assert.equal(await pickerTrigger.evaluate((element) => document.activeElement === element), true)
    const desktopFit = await page.evaluate(() => {
      const console = document.querySelector('[data-testid="gmv-mature-console"]')
      const rect = console?.getBoundingClientRect()
      return {
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        consoleContained: Boolean(rect && rect.left >= -2 && rect.right <= window.innerWidth + 2),
        phaseCount: document.querySelectorAll('[data-testid="gmv-sop-phase-rail"] > div').length,
        automationStatusVisible: Boolean(document.querySelector('[data-testid="gmv-sop-automation-status"]')),
      }
    })
    assert.deepEqual(desktopFit, { horizontalOverflow: false, consoleContained: true, phaseCount: 6, automationStatusVisible: true })
    assert.equal(typeof interruptedSyncRecovered, 'boolean')
    const resolutionCenter = page.locator('[data-testid="gmv-sop-resolution-center"]')
    await resolutionCenter.waitFor({ state: 'visible' })
    const storeIssueCenter = page.locator('[data-testid="gmv-store-issue-center"]')
    await storeIssueCenter.waitFor({ state: 'visible' })
    assert.ok((await storeIssueCenter.locator('summary').innerText()).length > 0)
    await storeIssueCenter.locator('summary').click()
    assert.ok(await storeIssueCenter.locator(':scope > div > button').count() > 0)
    await storeIssueCenter.locator('summary').click()
    assert.ok(await resolutionCenter.locator('h3').innerText())
    assert.ok(await resolutionCenter.locator('dl dd').count() >= 3)
    assert.equal(pickerOverviewCount, 3)
    await capture(electronApp, path.join(artifacts, 'mature-recovery-1440x900.png'))
    const keyMetrics = page.locator('.gmv-sop-key-section')
    assert.equal(await keyMetrics.locator('.gmv-sop-metrics article').count(), 6)
    await keyMetrics.scrollIntoViewIfNeeded()
    await page.waitForTimeout(200)
    await capture(electronApp, path.join(artifacts, 'mature-insights-1440x900.png'))
    await keyMetrics.locator('header button').click()
    assert.equal(await keyMetrics.locator('.gmv-sop-metrics article').count(), 12)
    await keyMetrics.locator('header button').click()
    const taskPanel = page.locator('.gmv-sop-tasks')
    await taskPanel.scrollIntoViewIfNeeded()
    await page.waitForTimeout(300)
    await taskPanel.locator('.gmv-sop-inline-toggle').click()
    assert.ok(await taskPanel.locator('article.is-complete').count() >= 3)
    assert.equal(await taskPanel.locator('article.is-external').count(), 0)
    assert.equal(await taskPanel.locator('article.is-superseded').count(), 0)
    assert.equal(await taskPanel.getByText('Verify mature product recovery readiness', { exact: true }).count(), 0)
    assert.ok(await taskPanel.getByText('核对老品恢复条件', { exact: true }).count() >= 1)
    const supplementalDisclosure = page.locator('.gmv-sop-disclosure').filter({ hasText: '补充业务数据' })
    await supplementalDisclosure.locator('.gmv-sop-disclosure__header').click()
    const supplementalPanel = supplementalDisclosure.locator('.gmv-sop-input')
    assert.equal(await supplementalPanel.locator('.gmv-sop-input__controls select').count(), 4)
    assert.equal(await supplementalPanel.getByText('gmvMaxSop.input.productBudget', { exact: true }).count(), 0)
    assert.ok(await supplementalPanel.getByText('商品预算', { exact: true }).count() >= 1)
    assert.ok(await supplementalPanel.getByText('自动预算', { exact: true }).count() >= 1)
    const videoDisclosure = page.locator('[data-testid="gmv-sop-winner-dna"]')
    await videoDisclosure.locator('.gmv-sop-video-insights').waitFor({ state: 'visible' })
    assert.equal(await videoDisclosure.locator('.gmv-sop-video-grades > button').count(), 4)
    assert.equal(await videoDisclosure.locator('[data-testid="gmv-sop-video-sort"]').count(), 1)
    assert.ok(await videoDisclosure.locator('.gmv-sop-video-list__items > button').count() >= 1)
    assert.ok(await videoDisclosure.locator('.gmv-sop-video-list__items > button').count() <= 6)
    assert.equal(await videoDisclosure.locator('[data-testid="gmv-sop-video-actions"]').count(), 1)
    const gradeA = videoDisclosure.locator('[data-testid="gmv-sop-video-grade-a"]')
    await gradeA.click()
    assert.equal(await gradeA.getAttribute('aria-selected'), 'true')
    assert.ok(await videoDisclosure.locator('.gmv-sop-video-list__items > button').count() <= 6)
    await videoDisclosure.locator('[data-testid="gmv-sop-video-sort"]').selectOption('roi')
    const visibleRois = await videoDisclosure.locator('.gmv-sop-video-list__copy em > span').allTextContents()
    const numericRois = visibleRois.map((value) => Number.parseFloat(value)).filter(Number.isFinite)
    assert.deepEqual(numericRois, [...numericRois].sort((a, b) => b - a))
    assert.equal(await videoDisclosure.locator('.gmv-sop-video-actions button').count(), 2)
    const nextVideoPage = videoDisclosure.locator('.gmv-sop-video-pagination button').last()
    if (await nextVideoPage.isEnabled()) {
      const firstCreativeId = await videoDisclosure.locator('.gmv-sop-video-list__items > button').first().getAttribute('data-creative-id')
      await nextVideoPage.click()
      assert.notEqual(await videoDisclosure.locator('.gmv-sop-video-list__items > button').first().getAttribute('data-creative-id'), firstCreativeId)
    }
    await videoDisclosure.locator('[data-testid="gmv-sop-video-grade-c"]').click()
    assert.equal(await videoDisclosure.locator('.gmv-sop-video-actions button').count(), 1)
    await videoDisclosure.locator('[data-testid="gmv-sop-video-grade-s"]').click()
    await videoDisclosure.locator('[data-testid="gmv-sop-video-sort"]').selectOption('profit')
    assert.equal(await videoDisclosure.locator('.gmv-sop-video-actions__protected').count(), 1)
    assert.equal(await videoDisclosure.locator('.gmv-sop-video-actions__exclude').count(), 0)
    assert.equal((await videoDisclosure.innerText()).includes('草稿已就绪'), false)
    const videoFit = await videoDisclosure.evaluate((element) => ({
      contained: element.getBoundingClientRect().right <= window.innerWidth + 2,
      overflow: element.scrollWidth > element.clientWidth,
    }))
    assert.equal(videoFit.contained, true)
    assert.equal(videoFit.overflow, false)
    const previewButton = videoDisclosure.locator('[data-testid="gmv-sop-video-preview-button"]')
    if (await previewButton.count()) {
      await previewButton.click()
      const preview = page.locator('[data-testid="gmv-creative-video-preview"]')
      await preview.waitFor({ state: 'visible' })
      await preview.locator('header .gmv-icon-button').click()
      await preview.waitFor({ state: 'hidden' })
    }
    await capture(electronApp, path.join(artifacts, 'mature-automation-tasks-1440x900.png'))

    await page.setViewportSize({ width: 1280, height: 760 })
    await videoDisclosure.scrollIntoViewIfNeeded()
    const compactVideoFit = await videoDisclosure.evaluate((element) => ({
      contained: element.getBoundingClientRect().right <= window.innerWidth + 2,
      overflow: element.scrollWidth > element.clientWidth,
      gradeCount: element.querySelectorAll('.gmv-sop-video-grades > button').length,
      visibleItems: element.querySelectorAll('.gmv-sop-video-list__items > button').length,
    }))
    assert.equal(compactVideoFit.contained, true)
    assert.equal(compactVideoFit.overflow, false)
    assert.equal(compactVideoFit.gradeCount, 4)
    assert.ok(compactVideoFit.visibleItems <= 6)
    await capture(electronApp, path.join(artifacts, 'video-workbench-1280x760.png'))
    await page.evaluate(() => {
      const workspace = document.querySelector('.ds-workspace')
      if (workspace) workspace.scrollTop = 0
    })
    await page.waitForTimeout(300)
    await capture(electronApp, path.join(artifacts, 'mature-recovery-top-1280x760.png'))
    const historyDisclosure = page.locator('[data-testid="gmv-mature-console"]')
    assert.equal(await historyDisclosure.locator('.gmv-mature-console__baselines > article').count(), 0)
    await historyDisclosure.locator('.gmv-sop-disclosure__header').click()
    await historyDisclosure.locator('.gmv-mature-console__baselines').waitFor({ state: 'visible' })
    await page.evaluate(() => {
      const workspace = document.querySelector('.ds-workspace')
      const target = document.querySelector('[data-testid="gmv-mature-console"]')
      if (workspace && target) workspace.scrollTop = Math.max(0, target.offsetTop - 90)
    })
    await page.waitForTimeout(300)
    const compactFit = await page.evaluate(() => {
      const console = document.querySelector('[data-testid="gmv-mature-console"]')
      const rect = console?.getBoundingClientRect()
      return {
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        consoleContained: Boolean(rect && rect.left >= -2 && rect.right <= window.innerWidth + 2),
        consoleTopVisible: Boolean(rect && rect.top >= 0 && rect.top < window.innerHeight),
        baselines: document.querySelectorAll('.gmv-mature-console__baselines > article').length,
      }
    })
    assert.equal(compactFit.horizontalOverflow, false)
    assert.equal(compactFit.consoleContained, true)
    assert.equal(compactFit.consoleTopVisible, true)
    assert.equal(compactFit.baselines, 3)
    await capture(electronApp, path.join(artifacts, 'mature-recovery-1280x760.png'))
    await page.evaluate(() => { document.documentElement.dataset.appTheme = 'soft-mint' })
    await page.waitForTimeout(200)
    await capture(electronApp, path.join(artifacts, 'mature-recovery-light-1280x760.png'))
    await page.evaluate(() => { document.documentElement.dataset.appTheme = 'dark-teal' })

    assert.ok(externalTarget)
    await selectSopInstance(page, externalTarget.instanceId)
    await page.waitForFunction(({ instanceId, issueCode }) => {
      const selected = window.localStorage.getItem('videogenerate:gmv-max:sop-selection:v1') === instanceId
      const issueRendered = Array.from(document.querySelectorAll('[data-issue-code]')).some((element) => element.getAttribute('data-issue-code') === issueCode)
      return selected && issueRendered
    }, { instanceId: externalTarget.instanceId, issueCode: externalTarget.issue.code })
    const externalResolution = page.locator('[data-testid="gmv-sop-resolution-center"]')
    await externalResolution.waitFor({ state: 'visible' })
    const externalLayout = await page.evaluate(() => {
      const button = document.querySelector('[data-testid="gmv-sop-primary-action"]')?.getBoundingClientRect()
      const tasks = document.querySelector('[data-testid="gmv-sop-today-tasks"]')?.getBoundingClientRect()
      const resolution = document.querySelector('[data-testid="gmv-sop-resolution-center"]')?.getBoundingClientRect()
      return { button, tasks, resolution, viewport: { width: window.innerWidth, height: window.innerHeight } }
    })
    assert.ok(externalLayout.resolution.right <= externalLayout.tasks.left)
    if (await externalResolution.getAttribute('data-issue-code') === externalTarget.issue.code) {
      await externalResolution.locator('[data-testid="gmv-sop-primary-action"]').click()
    } else {
      await externalResolution.locator(':scope > details').evaluate((element) => { element.open = true })
      await externalResolution.locator(`[data-issue-code="${externalTarget.issue.code}"] > summary .gmv-button`).click()
    }
    const externalOperation = page.locator('[data-testid="gmv-external-operation-overlay"]')
    await externalOperation.waitFor({ state: 'visible' })
    const externalSubmit = externalOperation.locator('[data-testid="gmv-external-submit"]')
    assert.equal(await externalSubmit.isDisabled(), true)
    await externalOperation.locator('[data-testid="gmv-external-evidence"]').fill('Verified in Seller Center without submitting the test record.')
    assert.equal(await externalSubmit.isDisabled(), false)
    await externalOperation.locator('[data-testid="gmv-external-actual-value"]').fill('')
    assert.equal(await externalSubmit.isDisabled(), true)
    await externalOperation.locator('[data-testid="gmv-external-actual-value"]').fill('ACTIVE')
    assert.equal(await externalSubmit.isDisabled(), false)
    await capture(electronApp, path.join(artifacts, 'external-operation-validation-1440x900.png'))
    await externalOperation.locator('footer .gmv-button--secondary').click()
    await externalOperation.waitFor({ state: 'hidden' })

    assert.deepEqual(pageErrors, [])
    assert.deepEqual(consoleErrors.filter((item) => /gmv|max|tiktok/i.test(item)), [])
    console.log('[tiktok-gmv-max-mature-electron] passed', { current, autoOnboarding, desktopFit, compactFit })
  } finally {
    await electronApp.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
