const assert = require('node:assert/strict')
const path = require('node:path')
const { mkdir, readFile } = require('node:fs/promises')
const { _electron: electron } = require('playwright')

async function main() {
  const root = path.resolve(__dirname, '..')
  const artifacts = path.join(root, 'test-artifacts', 'tiktok-gmv-max-task-ui-v2')
  const userData = path.join(artifacts, 'user-data')
  const appData = path.join(artifacts, 'app-data')
  await Promise.all([
    mkdir(artifacts, { recursive: true }),
    mkdir(userData, { recursive: true }),
    mkdir(appData, { recursive: true }),
  ])
  const app = await electron.launch({
    args: ['.'],
    cwd: root,
    env: {
      ...process.env,
      VIDEOGENERATE_USER_DATA_DIR: userData,
      VIDEOGENERATE_DATA_DIR: appData,
    },
  })
  const page = await app.firstWindow()
  const pageErrors = []
  const consoleErrors = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })

  const workspaces = [
    { tab: 'overview', title: '总览' },
    { tab: 'growth', title: '经营 / 商品' },
    { tab: 'campaigns', title: '经营 / 推广' },
    { tab: 'creatives', title: '经营 / 素材' },
    { tab: 'profit', title: '经营 / 利润' },
    { tab: 'actions', title: 'AI 决策 / 待处理' },
    { tab: 'rules', title: 'AI 决策 / 自动策略' },
    { tab: 'sop', title: '增长' },
    { tab: 'audit', title: '审计' },
    { tab: 'settings', title: '设置' },
    { tab: 'help', title: null },
  ]
  const themes = [
    { key: 'dark-teal', shell: 'rgb(9, 14, 24)', panel: 'rgb(17, 19, 30)', accent: 'rgb(20, 184, 166)' },
    { key: 'soft-mint', shell: 'rgb(243, 250, 248)', panel: 'rgb(255, 255, 255)', accent: 'rgb(47, 148, 119)' },
    { key: 'warm-paper', shell: 'rgb(246, 239, 223)', panel: 'rgb(255, 250, 240)', accent: 'rgb(173, 91, 0)' },
    { key: 'clear-sky', shell: 'rgb(247, 247, 255)', panel: 'rgb(255, 255, 255)', accent: 'rgb(59, 130, 246)' },
  ]

  try {
    await page.waitForLoadState('domcontentloaded')
    await page.evaluate(() => { window.location.hash = '#/plugins/tiktok-gmv-max-optimizer' })
    await page.locator('[data-testid="gmv-max-workspace"]').waitFor({ state: 'visible', timeout: 60_000 })
    await page.locator('[data-testid="gmv-feature-nav"]').waitFor({ state: 'visible' })

    await page.setViewportSize({ width: 1440, height: 900 })
    await page.locator('[data-testid="gmv-tab-growth"]').click()
    const expandedNavBox = await page.locator('[data-testid="gmv-feature-nav"]').boundingBox()
    const activeChild = page.locator('[data-testid="gmv-tab-growth"]')
    assert.equal(await activeChild.getAttribute('class'), 'is-active')
    const activeChildStyle = await activeChild.evaluate((element) => {
      const style = getComputedStyle(element)
      return { background: style.backgroundColor, color: style.color }
    })
    assert.notEqual(activeChildStyle.background, 'rgba(0, 0, 0, 0)')
    await page.screenshot({ path: path.join(artifacts, 'navigation-expanded-1440x900.png') })
    await page.locator('[data-testid="gmv-feature-nav-toggle"]').click()
    await page.locator('[data-testid="gmv-feature-nav"]').waitFor({ state: 'visible' })
    const collapsedNavBox = await page.locator('[data-testid="gmv-feature-nav"]').boundingBox()
    assert.ok(expandedNavBox && collapsedNavBox && collapsedNavBox.width < expandedNavBox.width)
    await page.screenshot({ path: path.join(artifacts, 'navigation-collapsed-1440x900.png') })
    await page.locator('[data-testid="gmv-feature-nav-toggle"]').click()

    for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 760 }]) {
      await page.setViewportSize(viewport)
      for (const workspace of workspaces) {
        await page.locator(`[data-testid="gmv-tab-${workspace.tab}"]`).click()
        if (workspace.tab === 'help') {
          await page.locator('[data-testid="gmv-help-center"]').waitFor({ state: 'visible' })
        } else {
          const heading = page.locator('.gmv-task-header h1')
          await heading.waitFor({ state: 'visible' })
          assert.equal(await heading.innerText(), workspace.title)
          assert.equal(await page.locator('[data-testid="gmv-global-filters"]').count(), 0)
          const headerBox = await page.locator('.gmv-task-header').boundingBox()
          assert.ok(
            headerBox && headerBox.height <= (viewport.width > 1350 ? 120 : 190),
            `${workspace.tab} header is too tall at ${viewport.width}`,
          )
        }
        await page.evaluate(() => document.querySelector('.ds-workspace')?.scrollTo(0, 0))
        await page.screenshot({ path: path.join(artifacts, `${workspace.tab}-${viewport.width}x${viewport.height}.png`) })
        if (['growth', 'campaigns', 'creatives', 'profit'].includes(workspace.tab)) {
          const primaryTable = page.locator('.gmv-section .gmv-table-wrap').first()
          if (await primaryTable.count()) {
            const tableBox = await primaryTable.boundingBox()
            assert.ok(
              tableBox && tableBox.y < viewport.height,
              `${workspace.tab} primary table starts below the first viewport at ${viewport.width}`,
            )
          }
        }
        const fit = await page.evaluate(() => ({
          horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
          workspaceRight: document.querySelector('[data-testid="gmv-max-workspace"]')?.getBoundingClientRect().right || 0,
          viewportWidth: window.innerWidth,
        }))
        assert.equal(fit.horizontalOverflow, false, `${workspace.tab} has horizontal overflow at ${viewport.width}`)
        assert.ok(fit.workspaceRight <= fit.viewportWidth + 2, `${workspace.tab} exceeds viewport at ${viewport.width}`)
      }
    }

    await page.setViewportSize({ width: 1440, height: 900 })
    await page.locator('[data-testid="gmv-tab-overview"]').click()
    await page.locator('[data-testid="gmv-control-strip"]').waitFor({ state: 'visible' })
    await page.locator('[data-testid="gmv-today-actions"]').waitFor({ state: 'visible' })

    await page.locator('[data-testid="gmv-tab-growth"]').click()
    const filterToggle = page.locator('[data-testid="gmv-global-filter-toggle"]')
    assert.equal(await filterToggle.getAttribute('aria-expanded'), 'false')
    await filterToggle.click()
    await page.locator('[data-testid="gmv-global-filters"]').waitFor({ state: 'visible' })
    assert.equal(await filterToggle.getAttribute('aria-expanded'), 'true')
    await filterToggle.click()
    assert.equal(await page.locator('[data-testid="gmv-global-filters"]').count(), 0)

    await page.locator('[data-testid="gmv-tab-sop"]').click()
    await page.locator('[data-testid="gmv-sop-workspace"]').waitFor({ state: 'visible' })
    assert.equal(await page.locator('[data-testid="gmv-cockpit-scopebar"]').count(), 0)
    assert.equal(await page.locator('[data-testid="gmv-today-status-summary"] article').count(), 4)
    assert.equal(await page.locator('[data-testid="gmv-decision-scope-toggle"]').getAttribute('aria-expanded'), 'false')
    await page.locator('[data-testid="gmv-decision-scope-toggle"]').click()
    await page.locator('[data-testid="gmv-decision-advanced-filters"]').waitFor({ state: 'visible' })
    await page.locator('[data-testid="gmv-decision-scope-toggle"]').click()
    await page.locator('[data-testid="gmv-decision-advanced-filters"]').waitFor({ state: 'detached' })

    await page.locator('[data-testid="gmv-tab-profit"]').click()
    await page.locator('[data-testid="gmv-product-cost-page"]').waitFor({ state: 'visible' })
    assert.equal(await page.locator('[data-testid="gmv-product-cost-completeness"]').inputValue(), 'incomplete')
    const editCost = page.getByRole('button', { name: '编辑成本' }).first()
    if (await editCost.count()) {
      await editCost.click()
      await page.locator('[data-testid="gmv-drawer"]').waitFor({ state: 'visible' })
      assert.ok((await page.locator('[data-testid="gmv-drawer"]').innerText()).includes('成本'))
      await page.locator('[data-testid="gmv-drawer"] .gmv-icon-button').first().click()
    }

    await page.locator('[data-testid="gmv-tab-actions"]').click()
    await page.locator('[data-testid="gmv-decision-categories"]').waitFor({ state: 'visible' })
    await page.locator('[data-testid="gmv-tab-rules"]').click()
    await page.locator('[data-testid="gmv-protection-goals"]').waitFor({ state: 'visible' })
    assert.equal(await page.locator('[data-testid="gmv-backtest-results"]').getAttribute('open'), null)
    const ruleName = `QA rule ${Date.now()}`
    await page.locator('.gmv-rule-card--add').click()
    const ruleDrawer = page.locator('[data-testid="gmv-drawer"]')
    await ruleDrawer.waitFor({ state: 'visible' })
    await ruleDrawer.locator('input').first().fill(ruleName)
    await ruleDrawer.locator('footer .gmv-button--primary').click()
    await page.getByText(ruleName, { exact: true }).waitFor({ state: 'visible' })
    assert.equal(await page.locator('.gmv-alert--danger').count(), 0)

    await page.locator('[data-testid="gmv-tab-audit"]').click()
    await page.locator('[data-testid="gmv-audit-workspace"]').waitFor({ state: 'visible' })
    await page.getByRole('button', { name: '结果评估', exact: true }).click()
    await page.locator('[data-testid="gmv-audit-results"]').waitFor({ state: 'visible' })
    await page.getByRole('button', { name: '异常记录', exact: true }).click()
    await page.locator('[data-testid="gmv-audit-exceptions"]').waitFor({ state: 'visible' })

    await page.locator('[data-testid="gmv-tab-settings"]').click()
    await page.locator('[data-testid="gmv-settings-workspace"]').waitFor({ state: 'visible' })

    for (const theme of themes) {
      await page.evaluate(() => { window.location.hash = '#/settings' })
      await page.locator('.settings-console').waitFor({ state: 'visible' })
      await page.locator('[data-settings-section="appearance"]').click()
      await page.locator(`.theme-option--${theme.key}`).click()
      await page.waitForFunction((key) => document.documentElement.dataset.appTheme === key, theme.key)
      const settingsTheme = await page.evaluate(() => {
        const icon = document.querySelector('.nav-item:not(.active) .nav-item__icon')
        const activeIcon = document.querySelector('.nav-item.active .nav-item__icon')
        const iconStyle = icon ? getComputedStyle(icon) : null
        const activeIconStyle = activeIcon ? getComputedStyle(activeIcon) : null
        const colorProbe = document.createElement('span')
        colorProbe.style.color = 'var(--theme-control-selected-text)'
        document.body.appendChild(colorProbe)
        const selectedText = getComputedStyle(colorProbe).color
        colorProbe.remove()
        return {
          iconColor: iconStyle?.color || '',
          iconBackground: iconStyle?.backgroundColor || '',
          activeIconColor: activeIconStyle?.color || '',
          activeIconBackground: activeIconStyle?.backgroundColor || '',
          selectedText,
        }
      })
      assert.equal(settingsTheme.iconColor, theme.accent)
      assert.notEqual(settingsTheme.iconBackground, 'rgba(0, 0, 0, 0)')
      assert.equal(settingsTheme.activeIconColor, settingsTheme.selectedText)
      assert.notEqual(settingsTheme.activeIconBackground, 'rgba(0, 0, 0, 0)')
      await page.screenshot({ path: path.join(artifacts, `theme-${theme.key}-settings-1440x900.png`) })

      await page.evaluate(() => { window.location.hash = '#/plugins/tiktok-gmv-max-optimizer' })
      await page.locator('[data-testid="gmv-max-workspace"]').waitFor({ state: 'visible' })
      await page.locator('[data-testid="gmv-tab-overview"]').click()
      const gmvTheme = await page.evaluate(() => {
        const content = document.querySelector('.gmv-feature-content')
        const panel = document.querySelector('.gmv-panel')
        const heading = document.querySelector('.gmv-task-header h1')
        const colorProbe = document.createElement('span')
        colorProbe.style.color = 'var(--theme-text)'
        document.body.appendChild(colorProbe)
        const themeText = getComputedStyle(colorProbe).color
        colorProbe.remove()
        return {
          appTheme: document.documentElement.dataset.appTheme,
          canvas: content ? getComputedStyle(content).backgroundColor : '',
          panel: panel ? getComputedStyle(panel).backgroundColor : '',
          heading: heading ? getComputedStyle(heading).color : '',
          themeText,
          horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        }
      })
      assert.equal(gmvTheme.appTheme, theme.key)
      assert.equal(gmvTheme.canvas, theme.shell)
      assert.equal(gmvTheme.panel, theme.panel)
      assert.equal(gmvTheme.heading, gmvTheme.themeText)
      assert.equal(gmvTheme.horizontalOverflow, false)
      await page.screenshot({ path: path.join(artifacts, `theme-${theme.key}-overview-1440x900.png`) })
    }

    assert.deepEqual(pageErrors, [])
    assert.deepEqual(consoleErrors, [])

    const recoveryUrl = page.url()
    const recoveryWindowPromise = app.waitForEvent('window', { timeout: 15_000 })
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0].webContents.forcefullyCrashRenderer()
    })
    const recoveredPage = await recoveryWindowPromise
    await recoveredPage.waitForLoadState('domcontentloaded')
    await recoveredPage.locator('[data-testid="gmv-max-workspace"]').waitFor({
      state: 'visible',
      timeout: 30_000,
    })
    assert.equal(recoveredPage.url(), recoveryUrl)
    const rendererDiagnostic = JSON.parse(
      await readFile(path.join(appData, 'diagnostics', 'renderer-latest.json'), 'utf8'),
    )
    assert.equal(rendererDiagnostic.event, 'render-process-gone')
    assert.equal(rendererDiagnostic.details.reason, 'crashed')
    assert.ok(rendererDiagnostic.metrics.length >= 1)

    console.log('[tiktok-gmv-max-task-ui-v2] passed', {
      workspaces: workspaces.length,
      screenshots: workspaces.length * 2,
      rendererRecovery: true,
    })
  } finally {
    await app.close().catch(() => undefined)
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
