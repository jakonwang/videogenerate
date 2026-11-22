/**
 * Drives the built Electron app through matrix publishing in the publish center:
 * set account rules → select two videos → distribute to three accounts (one paused) →
 * per-account tasks appear with staggered times → background variants finish → status shows ready.
 * CreatOK is stubbed in the main process (credential + connections), so no real account is needed.
 * Usage: VG_LICENSE_MODE=off npx electron-vite build && node test/publish-matrix.e2e.cjs [screenshotDir]
 */
const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const { mkdtemp, mkdir } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { _electron: electron } = require('playwright')

async function main() {
  const repo = join(__dirname, '..')
  const root = await mkdtemp(join(tmpdir(), 'videogenerate-publish-matrix-'))
  const dataDir = join(root, 'data')
  const shots = process.argv[2] || join(repo, 'test-artifacts', 'publish-matrix')
  await mkdir(shots, { recursive: true })
  await mkdir(dataDir, { recursive: true })
  const ffmpeg = require('ffmpeg-static')
  const videos = [join(root, 'earrings-a.mp4'), join(root, 'earrings-b.mp4')]
  for (const [i, file] of videos.entries()) {
    execFileSync(ffmpeg, ['-y', '-f', 'lavfi', '-i', `testsrc=size=540x960:rate=30:duration=${3 + i}`, '-f', 'lavfi', '-i', 'sine=frequency=440:duration=4', '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', file], { stdio: 'ignore' })
  }
  const env = { ...process.env, VIDEOGENERATE_USER_DATA_DIR: root, VIDEOGENERATE_DATA_DIR: dataDir }
  const errors = []
  let app
  try {
    app = await electron.launch({ args: ['.'], cwd: repo, env })
    const page = await app.firstWindow()
    // Stub CreatOK: three authorized TikTok accounts, no remote calls.
    await app.evaluate(({ ipcMain }) => {
      const stub = (channel, fn) => { ipcMain.removeHandler(channel); ipcMain.handle(channel, fn) }
      stub('plugin:tiktokPublisher:credentialStatus', async () => ({ configured: true, masked: 'test...stub' }))
      stub('plugin:tiktokPublisher:connections', async () => [
        { uid: 'acc-main', name: '主号 @pearl.shop' },
        { uid: 'acc-2', name: '矩阵号 2' },
        { uid: 'acc-3', name: '矩阵号 3（暂停）' },
      ])
    })
    page.setDefaultTimeout(30_000)
    page.on('pageerror', (error) => errors.push(String(error)))
    page.on('console', (message) => { if (message.type() === 'error' && /matrix|publish/i.test(message.text())) errors.push(message.text()) })
    await page.setViewportSize({ width: 1480, height: 920 }).catch(() => undefined)
    await page.waitForLoadState('domcontentloaded')

    // Two drafts, both with a title + hashtags so caption variants have something to rewrite.
    await page.evaluate(async (paths) => {
      await window.api.tiktokPublisher.createDraftsFromPaths({ paths, defaults: { videoTitle: 'Pearl earrings for every day', description: 'Light and shiny #earrings #pearl #giftforher', connectionUid: 'acc-main', connectionName: '主号 @pearl.shop' } })
    }, videos)
    await page.evaluate(() => { window.location.hash = '#/publish' })
    await page.locator('.pub-row:not(.pub-row--head)').first().waitFor({ state: 'visible' })
    assert.equal(await page.locator('.pub-row:not(.pub-row--head)').count(), 2)

    // Account rules: pause account 3, group the others.
    await page.locator('[data-testid="publish-matrix-accounts-open"]').click()
    const rules = page.locator('[data-testid="publish-matrix-accounts"]')
    await rules.waitFor({ state: 'visible' })
    await rules.locator('.pma__row:not(.pma__row--head)').first().waitFor()
    const rows = rules.locator('.pma__row:not(.pma__row--head)')
    assert.equal(await rows.count(), 3)
    await rows.nth(0).locator('input[list="pma-groups"]').fill('珠宝号')
    await rows.nth(1).locator('input[list="pma-groups"]').fill('珠宝号')
    await rows.nth(2).locator('.vg-switch').click()
    await page.screenshot({ path: join(shots, '01-account-rules.png') })
    await page.locator('[data-testid="publish-matrix-accounts-save"]').click()
    await rules.waitFor({ state: 'detached' })
    const saved = await page.evaluate(() => window.api.tiktokPublisher.matrixAccounts())
    assert.equal(saved.find((a) => a.uid === 'acc-3').paused, true)
    assert.equal(saved.find((a) => a.uid === 'acc-2').group, '珠宝号')

    // Select both videos → distribute to all three accounts.
    await page.locator('.pub-row--head input[type="checkbox"]').check()
    await page.locator('[data-testid="publish-matrix-distribute-open"]').click()
    const dialog = page.locator('[data-testid="publish-matrix-distribute"]')
    await dialog.waitFor({ state: 'visible' })
    assert.ok(await dialog.locator('[data-testid="matrix-account-acc-main"]').evaluate((el) => el.classList.contains('is-on')), 'source account is preselected')
    await dialog.locator('[data-testid="matrix-account-acc-2"]').click()
    await dialog.locator('[data-testid="matrix-account-acc-3"]').click()
    const preview = dialog.locator('[data-testid="matrix-preview"]')
    await preview.waitFor()
    assert.match(await preview.innerText(), /将生成 4 条发布任务/)
    assert.match(await preview.innerText(), /已暂停，跳过/)
    await page.screenshot({ path: join(shots, '02-distribute-dialog.png') })
    await dialog.locator('[data-testid="matrix-confirm"]').click()
    await dialog.waitFor({ state: 'detached' })
    const notice = page.locator('[data-testid="matrix-notice"]')
    await notice.waitFor()
    assert.match(await notice.innerText(), /已分发出 4 条/)
    assert.match(await notice.innerText(), /跳过 矩阵号 3/)
    await page.screenshot({ path: join(shots, '03-distributed-generating.png') })

    // Tasks: 2 per active account, staggered, never the same minute, variants finish in the background.
    const deadline = Date.now() + 120_000
    let tasks = []
    while (Date.now() < deadline) {
      tasks = await page.evaluate(() => window.api.tiktokPublisher.listTasks())
      if (tasks.length === 4 && tasks.every((t) => t.variant && ['ready', 'failed'].includes(t.variant.status))) break
      await page.waitForTimeout(1500)
    }
    assert.equal(tasks.length, 4)
    assert.deepEqual(tasks.map((t) => t.variant.status), ['ready', 'ready', 'ready', 'ready'], JSON.stringify(tasks.map((t) => t.variant)))
    const byAccount = (uid) => tasks.filter((t) => t.connectionUid === uid)
    assert.equal(byAccount('acc-main').length, 2)
    assert.equal(byAccount('acc-2').length, 2)
    const times = tasks.map((t) => Date.parse(t.scheduleAt))
    assert.equal(new Set(times).size, 4, 'every task has its own time')
    for (const uid of ['acc-main', 'acc-2']) {
      const [a, b] = byAccount(uid).map((t) => Date.parse(t.scheduleAt)).sort()
      assert.ok(b - a >= 120 * 60_000, `${uid}: two posts at least 2h apart`)
    }
    const variants = byAccount('acc-2')
    assert.ok(variants.every((t) => t.sourceVideoPath.includes('publish-variants') && /earrings-[ab]__v1_/.test(t.sourceVideoPath)), 'second account posts re-encoded variants')
    assert.ok(byAccount('acc-main').every((t) => videos.includes(t.sourceVideoPath)), 'first account posts the originals')
    assert.ok(variants.every((t) => /#earrings/.test(t.description || '')), 'hashtags survive caption variants')

    await page.evaluate(() => { window.location.hash = '#/'; })
    await page.evaluate(() => { window.location.hash = '#/publish' })
    await page.locator('.pub-row:not(.pub-row--head)').nth(3).waitFor()
    assert.equal(await page.locator('.pub-variant').count(), 0, 'no pending variant badges left')
    await page.screenshot({ path: join(shots, '04-tasks-ready.png') })

    assert.deepEqual(errors, [])
    console.log('publish-matrix e2e passed; screenshots in', shots)
  } finally {
    await app?.close().catch(() => undefined)
  }
}

main().catch((error) => { console.error(error); process.exit(1) })
