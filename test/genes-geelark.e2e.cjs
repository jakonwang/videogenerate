/**
 * Stage 3 in the built Electron app:
 *   - product page: gene panel shows the best-selling structure for the category and offers "make a batch with it"
 *   - publish center: connect GeeLark (mock server), cloud phones become accounts, submit to TikTok + YouTube,
 *     refresh maps GeeLark task results (completed / failed with a plain reason)
 * Usage: VG_LICENSE_MODE=off npx electron-vite build && node test/genes-geelark.e2e.cjs [screenshotDir]
 */
const assert = require('node:assert/strict')
const http = require('node:http')
const { createHash } = require('node:crypto')
const { execFileSync } = require('node:child_process')
const { mkdtemp, mkdir } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { _electron: electron } = require('playwright')

function startMockGeelark() {
  const state = { uploads: 0, tasks: [], badSign: 0 }
  const server = http.createServer((req, res) => {
    let body = ''
    req.on('data', (chunk) => { body += chunk })
    req.on('end', () => {
      const send = (data, code = 0, msg = 'success') => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ traceId: 'T', code, msg, data })) }
      if (req.method === 'PUT') { state.uploads += 1; res.statusCode = 200; return res.end() }
      // Signature check, exactly like GeeLark: SHA256(appId + traceId + ts + nonce + apiKey)
      const h = req.headers
      const expected = createHash('sha256').update(`${h.appid}${h.traceid}${h.ts}${h.nonce}secret-key`).digest('hex').toUpperCase()
      if (h.appid !== 'app-1' || h.sign !== expected || h.nonce !== String(h.traceid).slice(0, 6)) { state.badSign += 1; return send(null, 40001, 'sign error') }
      const json = body ? JSON.parse(body) : {}
      const port = server.address().port
      if (req.url === '/open/v1/phone/list') return send({ total: 2, items: [{ id: 'PH1', serialName: '越南-01', status: 0 }, { id: 'PH2', serialName: '越南-02', status: 0 }] })
      if (req.url === '/open/v1/upload/getUrl') return send({ uploadUrl: `http://127.0.0.1:${port}/put/${json.fileType}`, resourceUrl: `https://cdn.mock/${state.uploads + 1}.${json.fileType}` })
      if (req.url === '/open/v1/task/add') { const id = `TK${state.tasks.length + 1}`; state.tasks.push({ id, kind: 'tiktok', body: json }); return send({ taskIds: [id] }) }
      if (req.url === '/open/v1/rpa/task/youtubePubShort') { const id = `YT${state.tasks.length + 1}`; state.tasks.push({ id, kind: 'youtube', body: json }); return send({ taskId: id }) }
      if (req.url === '/open/v1/task/query') {
        return send({ total: json.ids.length, items: json.ids.map((id) => id.startsWith('TK') ? { id, status: 3, shareLink: 'https://www.tiktok.com/@x/video/1' } : { id, status: 4, failCode: 20002, failDesc: 'The machine is performing other tasks' }) })
      }
      send(null, 404, 'not found')
    })
  })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, state, port: server.address().port })))
}

async function main() {
  const repo = join(__dirname, '..')
  const root = await mkdtemp(join(tmpdir(), 'videogenerate-stage3-'))
  const dataDir = join(root, 'data')
  const shots = process.argv[2] || join(repo, 'test-artifacts', 'genes-geelark')
  await mkdir(shots, { recursive: true })
  await mkdir(dataDir, { recursive: true })
  const env = { ...process.env, VIDEOGENERATE_USER_DATA_DIR: root, VIDEOGENERATE_DATA_DIR: dataDir }
  const seedOutput = execFileSync(process.execPath, [join(repo, 'node_modules', 'tsx', 'dist', 'cli.mjs'), join(repo, 'test', 'genes-geelark.seed.ts')], { cwd: repo, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] })
  const { productId } = JSON.parse(seedOutput.split(/\r?\n/).find((line) => line.startsWith('SEED_RESULT ')).slice('SEED_RESULT '.length))
  const ffmpeg = require('ffmpeg-static')
  const video = join(root, 'clip.mp4')
  execFileSync(ffmpeg, ['-y', '-f', 'lavfi', '-i', 'testsrc=size=360x640:rate=25:duration=3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', video], { stdio: 'ignore' })
  const geelark = await startMockGeelark()

  const errors = []
  let app
  try {
    app = await electron.launch({ args: ['.'], cwd: repo, env })
    const page = await app.firstWindow()
    page.setDefaultTimeout(30_000)
    page.on('pageerror', (error) => errors.push(String(error)))
    await page.setViewportSize({ width: 1480, height: 920 }).catch(() => undefined)
    await page.waitForLoadState('domcontentloaded')

    // ---- 3a: gene panel on the product page
    await page.evaluate((id) => { window.location.hash = `#/products/${id}` }, productId)
    const panel = page.locator('[data-testid="creative-genes"]')
    await panel.waitFor()
    const recipe = panel.locator('[data-testid="creative-genes-recipe"]')
    await recipe.waitFor()
    const recipeText = await recipe.innerText()
    assert.match(recipeText, /开头方式：痛点开头/)
    assert.match(recipeText, /节奏：快/)
    assert.match(recipeText, /字幕样式：大字高亮/)
    await panel.scrollIntoViewIfNeeded()
    await page.screenshot({ path: join(shots, '01-genes-panel.png') })

    // ---- 3b: connect GeeLark, cloud phones become accounts
    await page.evaluate(() => { window.location.hash = '#/publish' })
    await page.locator('[data-testid="geelark-open"]').click()
    const dialog = page.locator('[data-testid="geelark-connect"]')
    await dialog.waitFor()
    await dialog.locator('[data-testid="geelark-app-id"]').fill('app-1')
    await dialog.locator('[data-testid="geelark-api-key"]').fill('secret-key')
    await dialog.locator('[data-testid="geelark-platform-youtube"]').click()
    await dialog.getByText('高级设置：Access Token、接口地址').click()
    await dialog.locator('[data-testid="geelark-base-url"]').fill(`http://127.0.0.1:${geelark.port}`)
    await dialog.locator('[data-testid="geelark-save"]').click()
    await dialog.locator('[data-testid="geelark-message"]').waitFor()
    assert.match(await dialog.locator('[data-testid="geelark-message"]').innerText(), /读到 2 台云手机/)
    await page.screenshot({ path: join(shots, '02-geelark-connect.png') })
    await dialog.getByRole('button', { name: '关闭' }).last().click()

    const connections = await page.evaluate(() => window.api.tiktokPublisher.connections())
    assert.deepEqual(connections.map((c) => c.uid), ['geelark:PH1:tiktok', 'geelark:PH1:youtube', 'geelark:PH2:tiktok', 'geelark:PH2:youtube'])
    assert.equal(connections[1].name, '☁ 越南-01 · YouTube')

    // Two drafts on two cloud-phone accounts, submitted from the UI.
    await page.evaluate(async (path) => {
      const api = window.api.tiktokPublisher
      const [a, b] = await api.createDraftsFromPaths({ paths: [path, path] })
      await api.updateTask(a.id, { connectionUid: 'geelark:PH1:tiktok', connectionName: '☁ 越南-01 · TikTok', videoTitle: 'Bông tai ngọc trai', description: '#bongtai' })
      await api.updateTask(b.id, { connectionUid: 'geelark:PH2:youtube', connectionName: '☁ 越南-02 · YouTube', videoTitle: 'Pearl earrings everyday' })
    }, video)
    await page.evaluate(() => { window.location.hash = '#/' })
    await page.evaluate(() => { window.location.hash = '#/publish' })
    await page.locator('.pub-row:not(.pub-row--head)').nth(1).waitFor()

    // Products for a cloud-phone TikTok account: shop products the app already knows, or a pasted ID.
    const known = await page.evaluate(() => window.api.tiktokPublisher.productsPage('geelark:PH1:tiktok', { query: 'pearl' }))
    assert.ok(known.items.some((item) => item.id === 'TT-1001' && item.title === 'Pearl Earrings'), JSON.stringify(known.items))
    const pasted = await page.evaluate(() => window.api.tiktokPublisher.productsPage('geelark:PH1:tiktok', { query: '1731234567890' }))
    assert.equal(pasted.items[0].title, '商品 ID 1731234567890')
    // Pick it in the UI on the TikTok row.
    const tiktokRow = page.locator('.pub-row', { hasText: '越南-01 · TikTok' })
    await tiktokRow.locator('.pub-link').click()
    const search = page.locator('.publisher-selector-search input')
    await search.waitFor()
    assert.match(await search.getAttribute('placeholder'), /直接粘贴 TikTok 商品 ID/)
    await search.fill('Pearl')
    await page.locator('.publisher-option-card', { hasText: 'Pearl Earrings' }).first().click()
    await tiktokRow.getByText('Pearl Earrings').waitFor()
    await page.screenshot({ path: join(shots, '02b-cloud-phone-product.png') })

    await page.locator('.pub-row--head input[type="checkbox"]').check()
    await page.getByRole('button', { name: '提交发布' }).first().click()
    await page.getByRole('button', { name: /确认/ }).last().click()
    const deadline = Date.now() + 60_000
    let tasks = []
    while (Date.now() < deadline) {
      tasks = await page.evaluate(() => window.api.tiktokPublisher.listTasks())
      if (tasks.every((t) => t.remoteJobId)) break
      await page.waitForTimeout(1000)
    }
    assert.equal(geelark.state.badSign, 0, 'every request is signed correctly')
    assert.equal(geelark.state.uploads, 2)
    const tk = geelark.state.tasks.find((t) => t.kind === 'tiktok')
    const yt = geelark.state.tasks.find((t) => t.kind === 'youtube')
    assert.equal(tk.body.list[0].envId, 'PH1')
    assert.match(tk.body.list[0].videoDesc, /Bông tai ngọc trai/)
    assert.equal(tk.body.list[0].productId, 'TT-1001')
    assert.equal(tk.body.list[0].productTitle, 'Pearl Earrings')
    assert.equal(yt.body.id, 'PH2')
    assert.equal(yt.body.title, 'Pearl earrings everyday')

    // Refresh: TikTok task completed, YouTube task failed because the phone was busy.
    const refreshed = await page.evaluate(() => window.api.tiktokPublisher.refresh())
    const done = refreshed.find((t) => t.connectionUid === 'geelark:PH1:tiktok')
    const failed = refreshed.find((t) => t.connectionUid === 'geelark:PH2:youtube')
    assert.equal(done.state, 'published')
    assert.equal(done.geelarkShareLink, 'https://www.tiktok.com/@x/video/1')
    assert.equal(failed.state, 'failed')
    assert.match(failed.error.message, /正在执行别的任务/)
    await page.evaluate(() => { window.location.hash = '#/' })
    await page.evaluate(() => { window.location.hash = '#/publish' })
    await page.locator('.pub-tab', { hasText: '全部' }).click()
    await page.locator('.pub-row:not(.pub-row--head)').nth(1).waitFor()
    await page.screenshot({ path: join(shots, '03-geelark-results.png') })

    // ---- cloud-phone warm-up: a warming GeeLark TikTok account gets today's warm-up task
    await page.evaluate(async () => {
      const until = new Date(Date.now() + 7 * 86_400_000)
      const day = `${until.getFullYear()}-${String(until.getMonth() + 1).padStart(2, '0')}-${String(until.getDate()).padStart(2, '0')}`
      await window.api.tiktokPublisher.matrixSaveAccounts([{ uid: 'geelark:PH2:tiktok', warmupUntil: day, activeStartHour: 0, activeEndHour: 24, warmupMinutes: 5 }])
    })
    await page.locator('[data-testid="publish-matrix-accounts-open"]').click()
    const warmRow = page.locator('[data-testid="warmup-geelark:PH2:tiktok"]')
    await warmRow.waitFor()
    await warmRow.locator('input').first().fill('耳环, pearl earrings')
    await page.locator('[data-testid="warmup-run-now"]').click()
    const state = page.locator('[data-testid="warmup-state-geelark:PH2:tiktok"]')
    await page.waitForFunction(() => /(今天 \d{2}:\d{2} |今天已养号：)(随机刷视频|搜关键词刷视频) ?5 分钟/.test(document.querySelector('[data-testid="warmup-state-geelark:PH2:tiktok"]')?.textContent || ''))
    const warmTask = geelark.state.tasks.find((t) => t.body.taskType === 2)
    assert.ok(warmTask, 'a GeeLark warm-up task was created')
    assert.equal(warmTask.body.list[0].envId, 'PH2')
    assert.equal(warmTask.body.list[0].duration, 5)
    assert.ok(['browse video', 'search video'].includes(warmTask.body.list[0].action))
    if (warmTask.body.list[0].action === 'search video') assert.deepEqual(warmTask.body.list[0].keywords, ['耳环', 'pearl earrings'])
    // A YouTube cloud-phone account cannot be warmed up by GeeLark and a CreatOK account has no row.
    assert.equal(await page.locator('[data-testid="warmup-geelark:PH1:youtube"]').count(), 0)
    assert.match(await state.innerText(), /5 分钟/)
    await page.screenshot({ path: join(shots, '04-warmup.png') })

    assert.deepEqual(errors, [])
    console.log('genes-geelark e2e passed; screenshots in', shots)
  } finally {
    await app?.close().catch(() => undefined)
    geelark.server.close()
  }
}

main().catch((error) => { console.error(error); process.exit(1) })
