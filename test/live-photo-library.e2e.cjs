/**
 * Opens 图生视频 → 库 / 导出 in the built Electron app with one task per state and checks that each
 * card says in plain words what is happening, that technical fields stay folded in the detail dialog,
 * and that the waiting task keeps polling the image model (never the chat model).
 * Usage: VG_LICENSE_MODE=off npx electron-vite build && node test/live-photo-library.e2e.cjs [screenshotDir]
 */
const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const http = require('node:http')
const { mkdtemp, mkdir } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { _electron: electron } = require('playwright')

/** Stand-in for GRS.AI: image results stay "running"; every request is recorded. */
function startStub() {
  const calls = []
  const server = http.createServer((req, res) => {
    let body = ''
    req.on('data', (chunk) => (body += chunk))
    req.on('end', () => {
      let model = ''
      try { model = JSON.parse(body).model || '' } catch { model = '' }
      calls.push({ path: req.url, model })
      res.setHeader('Content-Type', 'application/json')
      if (req.url.includes('/v1/draw/result')) return res.end(JSON.stringify({ code: 0, data: { status: 'running', progress: 40 } }))
      res.statusCode = 404
      res.end(JSON.stringify({ error: { message: 'not stubbed' } }))
    })
  })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, calls, url: `http://127.0.0.1:${server.address().port}` })))
}

async function main() {
  const repo = join(__dirname, '..')
  const root = await mkdtemp(join(tmpdir(), 'videogenerate-lp-lib-'))
  const dataDir = join(root, 'data')
  const shots = process.argv[2] || join(repo, 'test-artifacts', 'live-photo-library')
  await mkdir(shots, { recursive: true })
  await mkdir(dataDir, { recursive: true })
  const stub = await startStub()
  const env = { ...process.env, VG_LICENSE_MODE: 'off', VIDEOGENERATE_USER_DATA_DIR: root, VIDEOGENERATE_DATA_DIR: dataDir, LP_STUB_URL: stub.url }
  execFileSync(process.execPath, [join(repo, 'node_modules', 'tsx', 'dist', 'cli.mjs'), join(repo, 'test', 'live-photo-library.seed.ts')], { cwd: repo, env, encoding: 'utf8', stdio: ['ignore', 'inherit', 'inherit'] })

  const errors = []
  let app
  let page
  try {
    app = await electron.launch({ args: ['.'], cwd: repo, env })
    page = await app.firstWindow()
    page.setDefaultTimeout(30_000)
    page.on('pageerror', (error) => errors.push(String(error)))
    page.on('console', (message) => { if (message.type() === 'error' && /lpTask|intlify|i18n|live-photo/i.test(message.text())) errors.push(message.text()) })
    await page.setViewportSize({ width: 1480, height: 960 }).catch(() => undefined)
    await page.waitForLoadState('domcontentloaded')

    await page.evaluate(() => { window.location.hash = '#/plugins/live-photo-generator' })
    await page.locator('[data-testid="live-photo-tab-library"]').click()
    const card = (id) => page.locator(`[data-testid="live-photo-item-${id}"]`)
    // The library refreshes every few seconds; read a card's text once it is rendered.
    const cardText = async (id, re) => {
      let text = ''
      for (let i = 0; i < 30; i += 1) {
        text = await card(id).innerText().catch(() => '')
        if (!re || re.test(text)) return text
        await page.waitForTimeout(200)
      }
      return text
    }
    await card('lp-done').waitFor({ state: 'visible' })

    // Each card says in plain words what is going on.
    assert.match(await cardText('lp-locating', /识别商品位置/), /识别商品位置/)
    assert.match(await cardText('lp-waiting', /等待出图/), /等待出图/)
    assert.match(await cardText('lp-waiting', /已等/), /已等/)
    assert.match(await cardText('lp-retrying', /图片服务暂时不可用/), /图片服务暂时不可用/)
    assert.match(await cardText('lp-retrying', /稍后自动重试/), /稍后自动重试/)
    assert.match(await cardText('lp-failed', /没能识别参考图里商品的位置/), /没能识别参考图里商品的位置/)
    assert.match(await cardText('lp-failed', /重试/), /重试/)
    assert.match(await cardText('lp-decide', /用这张图生成视频/), /用这张图生成视频/)
    assert.match(await cardText('lp-done', /播放/), /播放/)
    for (const id of ['lp-locating', 'lp-waiting', 'lp-failed', 'lp-done']) {
      assert.doesNotMatch(await cardText(id, /\S/), /taskId|remote_pending|locate_failed|\[|gpt-/, `technical text on card ${id}`)
    }
    await page.locator('.lp-library').screenshot({ path: join(shots, '01-library.png') })

    // The more menu holds the secondary actions.
    await page.locator('[data-testid="live-photo-more-lp-done"]').click()
    await page.locator('[data-testid="live-photo-remove-lp-done"]').waitFor({ state: 'visible' })
    await page.locator('.lp-library').screenshot({ path: join(shots, '02-more-menu.png') })
    await page.keyboard.press('Escape')
    await page.locator('.lp-library h2').first().click()

    // Detail of the waiting task: what it waits for, how long, and the model calls only under 技术详情.
    await page.locator('[data-testid="live-photo-details-lp-waiting"]').click()
    const detail = page.locator('[data-testid="live-photo-detail"]')
    await detail.waitFor({ state: 'visible' })
    const now = await detail.locator('[data-testid="live-photo-detail-now"]').innerText()
    assert.match(now, /图片已交给图片模型，等待出图/)
    assert.match(now, /已等 .*通常 1–3 分钟/)
    assert.match(now, /自动进入下一步/)
    const tech = detail.locator('[data-testid="live-photo-detail-tech"]')
    assert.equal(await tech.evaluate((node) => node.open), false, '技术详情 starts folded')
    assert.equal(await detail.locator('[data-testid="live-photo-detail-model-calls"]').isVisible(), false)
    await page.screenshot({ path: join(shots, '03-detail-waiting.png') })
    await tech.locator('summary').click()
    const calls = await detail.locator('[data-testid="live-photo-detail-model-calls"]').innerText()
    assert.match(calls, /定位商品[\s\S]*gpt-5\.6-sol/)
    assert.match(calls, /生成图片[\s\S]*gpt-image-2/)
    assert.match(await tech.innerText(), /grs-img-7f3c21/)
    await detail.locator('.lpd__tech').scrollIntoViewIfNeeded()
    await page.screenshot({ path: join(shots, '04-detail-tech.png') })
    await detail.locator('[data-testid="live-photo-detail-close"]').click()

    // Detail of the failed task explains why and offers retry.
    await page.locator('[data-testid="live-photo-details-lp-failed"]').click()
    await detail.waitFor({ state: 'visible' })
    const failedNow = await detail.locator('[data-testid="live-photo-detail-now"]').innerText()
    assert.match(failedNow, /没能识别参考图里商品的位置/)
    assert.match(failedNow, /已自动重试 2 次仍未成功/)
    assert.doesNotMatch(failedNow, /model=|fetch failed|\[/, 'raw error stays under 技术详情')
    assert.match(failedNow, /重试/)
    await page.screenshot({ path: join(shots, '05-detail-failed.png') })
    await detail.locator('[data-testid="live-photo-detail-close"]').click()

    // Detail of a finished task: results first.
    await page.locator('[data-testid="live-photo-details-lp-done"]').click()
    await detail.waitFor({ state: 'visible' })
    assert.match(await detail.locator('[data-testid="live-photo-detail-steps"]').innerText(), /定位商品[\s\S]*生成图片[\s\S]*生成视频[\s\S]*打包导出/)
    await detail.locator('[data-testid="live-photo-detail-result-video"] video').waitFor({ state: 'visible' })
    await page.screenshot({ path: join(shots, '06-detail-done.png') })
    await detail.locator('[data-testid="live-photo-detail-close"]').click()

    // The waiting task keeps polling the image result; nothing in this run touched the chat model.
    await page.waitForTimeout(3000)
    assert.ok(stub.calls.some((call) => call.path.includes('/v1/draw/result')), `image result polled: ${JSON.stringify(stub.calls)}`)
    assert.equal(stub.calls.filter((call) => call.path.includes('/chat/completions')).length, 0, 'no chat model calls while waiting for an image')
    assert.match(await card('lp-waiting').innerText(), /等待出图/, 'still waiting, not failed')

    assert.deepEqual(errors, [])
    console.log('live photo library e2e passed:', shots)
  } catch (error) {
    if (page) await page.screenshot({ path: join(shots, 'failure.png'), fullPage: true }).catch(() => undefined)
    throw error
  } finally {
    if (app) await app.close().catch(() => undefined)
    stub.server.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
