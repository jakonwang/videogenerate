/**
 * Drives the built Electron app through the product page's pipeline strip and sales-proof panel:
 * unbound → bind a TikTok Shop product → ads and creator data attach → content signals appear →
 * link a finished video to its ad creative → the video is marked as selling.
 * Usage: VG_LICENSE_MODE=off npx electron-vite build && node test/product-spine.e2e.cjs [screenshotDir]
 */
const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const { mkdtemp, mkdir, rm } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { _electron: electron } = require('playwright')

async function main() {
  const repo = join(__dirname, '..')
  const root = await mkdtemp(join(tmpdir(), 'videogenerate-product-spine-'))
  const dataDir = join(root, 'data')
  const shots = process.argv[2] || join(repo, 'test-artifacts', 'product-spine')
  await mkdir(shots, { recursive: true })
  await mkdir(dataDir, { recursive: true })
  const env = { ...process.env, VIDEOGENERATE_USER_DATA_DIR: root, VIDEOGENERATE_DATA_DIR: dataDir }
  const seedOutput = execFileSync(process.execPath, [join(repo, 'node_modules', 'tsx', 'dist', 'cli.mjs'), join(repo, 'test', 'product-spine.seed.ts')], { cwd: repo, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  const seedLine = seedOutput.split(/\r?\n/).find((line) => line.startsWith('SEED_RESULT '))
  assert.ok(seedLine, 'seed script reported its result')
  const { productId, cloneRef } = JSON.parse(seedLine.slice('SEED_RESULT '.length))

  const errors = []
  let app
  try {
    app = await electron.launch({ args: ['.'], cwd: repo, env })
    const page = await app.firstWindow()
    page.setDefaultTimeout(30_000)
    page.on('pageerror', (error) => errors.push(String(error)))
    page.on('console', (message) => { if (message.type() === 'error' && /spine|chain|perf|i18n|intlify|contentHub/i.test(message.text())) errors.push(message.text()) })
    await page.setViewportSize({ width: 1480, height: 920 }).catch(() => undefined)
    await page.waitForLoadState('domcontentloaded')

    await page.evaluate((id) => { window.location.hash = `#/products/${id}` }, productId)
    const chain = page.locator('[data-testid="product-chain"]')
    await chain.waitFor({ state: 'visible' })

    // Unbound: ads and creators ask for a binding, the only signal is to bind, and there is no sales proof yet.
    await page.locator('[data-testid="product-signal-bind_channel"]').waitFor({ state: 'visible' })
    assert.equal(await page.locator('[data-testid="product-chain-bound"]').count(), 0)
    assert.match(await page.locator('[data-testid="product-chain-ads"]').innerText(), /绑定店铺商品后可见/)
    assert.match(await page.locator('[data-testid="product-chain-content"]').innerText(), /1/)
    assert.equal(await page.locator('[data-testid="product-performance"]').count(), 0)
    await page.screenshot({ path: join(shots, '01-unbound.png') })

    // Bind through the dialog: known shop products are offered with their sources.
    await page.locator('[data-testid="product-chain-bind"]').click()
    const dialog = page.locator('.pc__dialog')
    await dialog.waitFor({ state: 'visible' })
    const row = dialog.locator('.pc__row', { hasText: 'TT-1001' })
    assert.match(await row.innerText(), /Pearl Earrings/)
    assert.match(await row.innerText(), /投放/)
    assert.match(await row.innerText(), /达人/)
    await row.click()
    await page.screenshot({ path: join(shots, '02-bind-dialog.png') })
    await page.locator('[data-testid="product-chain-save"]').click()
    await dialog.waitFor({ state: 'detached' })

    // Bound: ads and creator numbers attach to the product, and signals direct content.
    await page.locator('[data-testid="product-chain-bound"]').waitFor({ state: 'visible' })
    assert.match(await page.locator('[data-testid="product-chain-ads"]').innerText(), /ROI 2\.54/)
    assert.match(await page.locator('[data-testid="product-chain-creators"]').innerText(), /420/)
    for (const key of ['ads_winner', 'ads_fatigue', 'ads_concentration', 'ads_need_creatives', 'creator_winner', 'creators_awaiting_content']) {
      await page.locator(`[data-testid="product-signal-${key}"]`).waitFor({ state: 'visible' })
    }
    assert.match(await page.locator('[data-testid="product-signal-ads_winner"]').innerText(), /上耳特写/)
    assert.equal(await page.locator('[data-testid="product-signal-bind_channel"]').count(), 0)
    await page.screenshot({ path: join(shots, '03-bound.png') })

    // The binding is stored on the product itself.
    const stored = await page.evaluate(async (id) => (await window.api.products.list()).find((item) => item.id === id), productId)
    assert.deepEqual(stored.tiktokProductIds, ['TT-1001'])

    // Sales proof: both ad creatives are waiting to be matched to a local video.
    const proof = page.locator('[data-testid="product-performance"]')
    await proof.waitFor({ state: 'visible' })
    await proof.scrollIntoViewIfNeeded()
    const winnerCreative = page.locator('[data-testid="product-performance-creative-cr-a"]')
    await winnerCreative.waitFor({ state: 'visible' })
    assert.equal(await page.locator('[data-testid^="product-performance-creative-"]').count(), 2)
    await page.screenshot({ path: join(shots, '04-proof-unlinked.png') })

    // Link the winning creative to the clone video: the video is now marked as selling.
    await winnerCreative.locator('select').selectOption(cloneRef)
    await winnerCreative.locator('button').click()
    const proofRow = page.locator(`[data-testid="product-performance-row-${cloneRef}"]`)
    await proofRow.waitFor({ state: 'visible' })
    const rowText = await proofRow.innerText()
    assert.match(rowText, /上耳特写复刻/)
    assert.match(rowText, /出单好/)
    assert.match(rowText, /手动关联/)
    assert.match(rowText, /照它做变体/)
    assert.equal(await page.locator('[data-testid="product-performance-creative-cr-a"]').count(), 0)
    assert.match(await page.locator(`[data-testid="product-content-perf-${cloneRef}"]`).innerText(), /出单好 · ROI 8 · 8 单/)
    await proof.scrollIntoViewIfNeeded()
    await page.screenshot({ path: join(shots, '05-proof-linked.png') })

    // "Make variants" on a proven clone video opens a plan that waits for approval and carries the source project.
    await proofRow.locator('button', { hasText: '照它做变体' }).click()
    await page.waitForSelector('[data-testid="ai-plan-approve"]', { timeout: 20000 })
    const planText = await page.locator('[data-testid="ai-plan-card"]').innerText()
    assert.match(planText, /复刻视频/)
    const planned = await page.evaluate(async () => {
      const conversations = await window.api.agentOs.listConversations(5)
      const detail = await window.api.agentOs.getConversation(conversations[0].id)
      return JSON.stringify(detail)
    })
    assert.ok(planned.includes(`"variantOfProjectId":"${cloneRef.slice('clone:'.length)}"`), 'plan carries the source clone project')
    assert.ok(planned.includes('"variantProjects":2'), 'plan asks for two variant projects')
    assert.equal((await page.evaluate(async () => await window.api.clone.listProjects())).length, 1, 'nothing is generated before approval')
    await page.screenshot({ path: join(shots, '06-variant-plan.png') })
    await page.locator('[data-testid="ai-panel-close"]').click()

    // Unlinking returns the creative to the waiting list.
    await page.locator(`[data-testid="product-performance-unlink-${cloneRef}"]`).click()
    await page.locator('[data-testid="product-performance-creative-cr-a"]').waitFor({ state: 'visible' })
    assert.equal(await proofRow.count(), 0)

    assert.deepEqual(errors, [], `renderer errors: ${errors.join('\n')}`)
    console.log(`product-spine e2e passed; screenshots in ${shots}`)
  } finally {
    await app?.close().catch(() => undefined)
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => undefined)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
