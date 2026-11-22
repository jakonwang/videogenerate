/**
 * Profit view + creative runway in the built Electron app:
 * product page shows margin / break-even / profit per creative and a "replenish" signal with days left;
 * publish center shows per-video profit and per-account profit in the account rules.
 * Usage: VG_LICENSE_MODE=off npx electron-vite build && node test/profit-runway.e2e.cjs [screenshotDir]
 */
const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const { mkdtemp, mkdir, writeFile } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { _electron: electron } = require('playwright')

async function main() {
  const repo = join(__dirname, '..')
  const root = await mkdtemp(join(tmpdir(), 'videogenerate-profit-'))
  const dataDir = join(root, 'data')
  const shots = process.argv[2] || join(repo, 'test-artifacts', 'profit-runway')
  await mkdir(shots, { recursive: true })
  await mkdir(dataDir, { recursive: true })
  const env = { ...process.env, VIDEOGENERATE_USER_DATA_DIR: root, VIDEOGENERATE_DATA_DIR: dataDir }
  const seedOutput = execFileSync(process.execPath, [join(repo, 'node_modules', 'tsx', 'dist', 'cli.mjs'), join(repo, 'test', 'profit-runway.seed.ts')], { cwd: repo, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] })
  const seedLine = seedOutput.split(/\r?\n/).find((line) => line.startsWith('SEED_RESULT '))
  assert.ok(seedLine, 'seed reported its result')
  const { productId } = JSON.parse(seedLine.slice('SEED_RESULT '.length))
  const video = join(root, 'v.mp4')
  await writeFile(video, 'x')

  const errors = []
  let app
  try {
    app = await electron.launch({ args: ['.'], cwd: repo, env })
    const page = await app.firstWindow()
    await app.evaluate(({ ipcMain }) => {
      const stub = (channel, fn) => { ipcMain.removeHandler(channel); ipcMain.handle(channel, fn) }
      stub('plugin:tiktokPublisher:credentialStatus', async () => ({ configured: true, masked: 'test...stub' }))
      stub('plugin:tiktokPublisher:connections', async () => [{ uid: 'acc-a', name: '主号' }, { uid: 'acc-b', name: '矩阵号 2' }])
    })
    // No real CreatOK key is stored, so the real refresh just returns the local task list.
    page.setDefaultTimeout(30_000)
    page.on('pageerror', (error) => errors.push(String(error)))
    await page.setViewportSize({ width: 1480, height: 920 }).catch(() => undefined)
    await page.waitForLoadState('domcontentloaded')

    // Two published videos: one matches the tiring creative (losing money), one the winner.
    await page.evaluate(async (path) => {
      const api = window.api.tiktokPublisher
      const [a, b] = await api.createDraftsFromPaths({ paths: [path, path] })
      await api.updateTask(a.id, { state: 'published', connectionUid: 'acc-a', connectionName: '主号', productId: 'TT-1001', videoTitle: '开箱展示' })
      await api.updateTask(b.id, { state: 'published', connectionUid: 'acc-b', connectionName: '矩阵号 2', productId: 'TT-1001', videoTitle: '上耳特写' })
    }, video)

    // Product page: profit line, profit column, fatigue → replenish with days left.
    await page.evaluate((id) => { window.location.hash = `#/products/${id}` }, productId)
    await page.locator('[data-testid="product-chain"]').waitFor({ state: 'visible' })
    const adsStage = await page.locator('[data-testid="product-chain-ads"]').innerText()
    assert.match(adsStage, /利润|亏/)
    const fatigue = page.locator('[data-testid="product-signal-ads_fatigue"]').first()
    await fatigue.waitFor()
    const fatigueText = await fatigue.innerText()
    assert.match(fatigueText, /开箱展示/)
    assert.match(fatigueText, /天后跌破保本 ROI|低于保本 ROI/)
    assert.match(fatigueText, /照它补一批/)
    const profitLine = page.locator('[data-testid="product-performance-profit"]')
    await profitLine.waitFor()
    assert.match(await profitLine.innerText(), /毛利率 51\.5% · 保本 ROI 1\.94/)
    await page.screenshot({ path: join(shots, '01-product-profit.png'), fullPage: true })
    await profitLine.scrollIntoViewIfNeeded()
    await page.screenshot({ path: join(shots, '02-product-performance.png') })

    // Publish center: per-video profit and per-account profit.
    await page.evaluate(() => { window.location.hash = '#/publish' })
    await page.locator('.pub-tab', { hasText: '已发布' }).click()
    await page.locator('.pub-row:not(.pub-row--head)').nth(1).waitFor()
    const report = await page.evaluate(() => window.api.tiktokPublisher.profitReport())
    assert.equal(Object.keys(report.byTask).length, 2)
    const lossRow = report.byAccount.find((row) => row.uid === 'acc-a')
    const gainRow = report.byAccount.find((row) => row.uid === 'acc-b')
    assert.ok(lossRow.profit < 0, JSON.stringify(report))
    assert.ok(gainRow.profit > 0, JSON.stringify(report))
    await page.locator('.pub-profit.is-loss').first().waitFor()
    await page.locator('.pub-profit.is-gain').first().waitFor()
    await page.screenshot({ path: join(shots, '03-publish-profit.png') })
    await page.locator('[data-testid="publish-matrix-accounts-open"]').click()
    await page.locator('[data-testid="matrix-profit-acc-a"]').waitFor()
    assert.match(await page.locator('[data-testid="matrix-profit-acc-a"]').innerText(), /^-/)
    assert.match(await page.locator('[data-testid="matrix-profit-acc-b"]').innerText(), /^\+/)
    await page.screenshot({ path: join(shots, '04-account-profit.png') })

    assert.deepEqual(errors, [])
    console.log('profit-runway e2e passed; screenshots in', shots)
  } finally {
    await app?.close().catch(() => undefined)
  }
}

main().catch((error) => { console.error(error); process.exit(1) })
