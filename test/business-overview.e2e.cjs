/**
 * Opens the 数据概览 page in the built Electron app with seeded ads / creators / inventory / product data
 * and checks that the headline, KPIs, problem / growth / to-do columns and the pipeline render.
 * Usage: VG_LICENSE_MODE=off npx electron-vite build && node test/business-overview.e2e.cjs [screenshotDir]
 */
const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const { mkdtemp, mkdir } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { _electron: electron } = require('playwright')

async function main() {
  const repo = join(__dirname, '..')
  const root = await mkdtemp(join(tmpdir(), 'videogenerate-overview-'))
  const dataDir = join(root, 'data')
  const shots = process.argv[2] || join(repo, 'test-artifacts', 'business-overview')
  await mkdir(shots, { recursive: true })
  await mkdir(dataDir, { recursive: true })
  const env = { ...process.env, VIDEOGENERATE_USER_DATA_DIR: root, VIDEOGENERATE_DATA_DIR: dataDir }
  execFileSync(process.execPath, [join(repo, 'node_modules', 'tsx', 'dist', 'cli.mjs'), join(repo, 'test', 'business-overview.seed.ts')], { cwd: repo, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] })

  const errors = []
  let app
  try {
    app = await electron.launch({ args: ['.'], cwd: repo, env })
    const page = await app.firstWindow()
    page.setDefaultTimeout(30_000)
    page.on('pageerror', (error) => errors.push(String(error)))
    page.on('console', (message) => { if (message.type() === 'error' && /overview|insights|i18n|intlify|contentHub/i.test(message.text())) errors.push(message.text()) })
    await page.setViewportSize({ width: 1480, height: 960 }).catch(() => undefined)
    await page.waitForLoadState('domcontentloaded')
    await page.evaluate(() => { window.location.hash = '#/insights' })

    const headline = page.locator('[data-testid="overview-headline"]')
    await headline.waitFor({ state: 'visible' })
    assert.match(await headline.innerText(), /投放 GMV/)
    assert.match(await headline.innerText(), /USD/)

    const kpis = page.locator('[data-testid="overview-kpis"]')
    assert.match(await kpis.innerText(), /投放 GMV/)
    assert.match(await kpis.innerText(), /-35%/) // 1820 vs 2800
    assert.match(await kpis.innerText(), /达人带货 GMV/)

    const signals = page.locator('[data-testid="overview-signals"]')
    const text = await signals.innerText()
    for (const pattern of [/投放 GMV 下滑/, /花费涨了/, /个计划在花钱但没出单/, /项链测款/, /SKU 快断货|SKU 已断货/, /在投放但没有新素材|主力素材(疲劳|约 \d+ 天后撑不住|已跌破)/, /跑出爆款素材|有达人视频在出单/, /寄样申请待审核/]) {
      assert.match(text, pattern)
    }
    await page.screenshot({ path: join(shots, '01-overview.png'), fullPage: true })

    // Clicking a problem opens the module that can fix it.
    await signals.locator('.overview__signal', { hasText: '投放 GMV 下滑' }).locator('.overview__signal-main').click()
    await page.waitForFunction(() => window.location.hash.includes('tiktok-gmv-max-optimizer'))

    // Home shows the short version: four numbers, the top three problems, a link to the full page.
    await page.evaluate(() => { window.location.hash = '#/home' })
    const pulse = page.locator('[data-testid="home-pulse"]')
    await pulse.waitFor({ state: 'visible' })
    const pulseText = await pulse.innerText()
    assert.match(pulseText, /投放 GMV/)
    assert.match(pulseText, /-35%/)
    assert.equal(await pulse.locator('.home-pulse__problem').count(), 3)
    assert.match(pulseText, /还有 \d+ 个问题/)
    await pulse.screenshot({ path: join(shots, '02-home-pulse.png') })

    // The daily brief now carries the business problems too, ahead of the content items.
    const brief = page.locator('[data-testid="home-brief"]')
    await brief.getByText('投放 GMV 下滑').first().waitFor({ state: 'visible' })
    assert.match(await brief.innerText(), /SKU 已断货/)
    await brief.screenshot({ path: join(shots, '03-daily-brief.png') })
    await page.locator('[data-testid="home-pulse-all"]').click()
    await page.waitForFunction(() => window.location.hash.includes('/insights'))

    assert.deepEqual(errors, [])
    console.log(`business overview e2e passed; screenshots in ${shots}`)
  } finally {
    await app?.close().catch(() => undefined)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
