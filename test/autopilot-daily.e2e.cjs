/**
 * Daily autopilot on the home page of the built Electron app:
 * build today's plan from ad data → a tiring creative made here becomes a "replenish" item →
 * approve → a real AI producer run is created and approved on the user's behalf.
 * Usage: VG_LICENSE_MODE=off npx electron-vite build && node test/autopilot-daily.e2e.cjs [screenshotDir]
 */
const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const { mkdtemp, mkdir } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { _electron: electron } = require('playwright')

async function main() {
  const repo = join(__dirname, '..')
  const root = await mkdtemp(join(tmpdir(), 'videogenerate-autopilot-'))
  const dataDir = join(root, 'data')
  const shots = process.argv[2] || join(repo, 'test-artifacts', 'autopilot-daily')
  await mkdir(shots, { recursive: true })
  await mkdir(dataDir, { recursive: true })
  const env = { ...process.env, VIDEOGENERATE_USER_DATA_DIR: root, VIDEOGENERATE_DATA_DIR: dataDir }
  const seedOutput = execFileSync(process.execPath, [join(repo, 'node_modules', 'tsx', 'dist', 'cli.mjs'), join(repo, 'test', 'profit-runway.seed.ts')], { cwd: repo, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] })
  const { cloneRef } = JSON.parse(seedOutput.split(/\r?\n/).find((line) => line.startsWith('SEED_RESULT ')).slice('SEED_RESULT '.length))

  const errors = []
  let app
  try {
    app = await electron.launch({ args: ['.'], cwd: repo, env })
    const page = await app.firstWindow()
    page.setDefaultTimeout(30_000)
    page.on('pageerror', (error) => errors.push(String(error)))
    await page.setViewportSize({ width: 1480, height: 1000 }).catch(() => undefined)
    await page.waitForLoadState('domcontentloaded')
    // The tiring main creative "开箱展示" (cr-b) was made from this clone project.
    await page.evaluate(async ({ ref }) => { await window.api.contentHub.linkContentPerformance({ ref, creativeId: 'cr-b', creativeName: '开箱展示' }) }, { ref: cloneRef })

    await page.evaluate(() => { window.location.hash = '#/home' })
    const panel = page.locator('[data-testid="autopilot-daily"]')
    await panel.waitFor()
    assert.match(await panel.innerText(), /打开后，每天自动看投放数据/)
    await panel.scrollIntoViewIfNeeded()
    await page.screenshot({ path: join(shots, '01-off.png') })

    // Turn it on and look at the guardrails.
    await panel.locator('[data-testid="autopilot-enabled"]').check({ force: true })
    await panel.getByText(/已开启：每天 9:00/).waitFor()
    await panel.locator('[data-testid="autopilot-settings-toggle"]').click()
    await panel.locator('[data-testid="autopilot-settings"]').waitFor()
    assert.match(await panel.locator('[data-testid="autopilot-settings"]').innerText(), /亏钱的商品不放大/)

    // Build today's plan.
    await panel.locator('[data-testid="autopilot-generate"]').click()
    const item = panel.locator('[data-testid="autopilot-item-replenish"]')
    await item.waitFor()
    const text = await item.innerText()
    assert.match(text, /照「开箱展示」给「珍珠耳环 Pearl」补一批变体/)
    assert.match(text, /跌破底线|撑不住/)
    await panel.locator('[data-testid="autopilot-pending"]').waitFor()
    await page.screenshot({ path: join(shots, '02-plan.png') })

    // Approve → a real AI producer plan is created for the clone project and approved.
    await item.locator('[data-testid="autopilot-approve-replenish"]').click()
    await item.getByText(/执行中|已完成|失败/).first().waitFor()
    const today = await page.evaluate(() => window.api.contentHub.autopilotToday())
    const replenish = today.day.proposals.find((p) => p.kind === 'replenish')
    assert.ok(replenish.runId, JSON.stringify(replenish))
    assert.equal(today.used, 1)
    const conversations = await page.evaluate(() => window.api.agentOs.listConversations(10))
    const conversation = conversations.find((c) => c.id === replenish.conversationId)
    assert.ok(conversation, 'the run shows up in the AI producer')
    assert.match(conversation.title, /^自动驾驶 · /)
    const run = await page.evaluate((id) => window.api.agentOs.getRun(id), replenish.runId)
    assert.notEqual(run.run.status, 'waiting_approval', 'approved on the user\'s behalf')
    assert.equal(run.run.context?.variantOfProjectId ?? run.steps[0]?.input?.variantOfProjectId, cloneRef.slice('clone:'.length))
    await page.screenshot({ path: join(shots, '03-approved.png') })

    assert.deepEqual(errors, [])
    console.log('autopilot-daily e2e passed; screenshots in', shots)
  } finally {
    await app?.close().catch(() => undefined)
  }
}

main().catch((error) => { console.error(error); process.exit(1) })
