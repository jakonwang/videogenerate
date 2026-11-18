// Product research end-to-end: legacy data migration, scheme workspace, phone pairing
// over the device protocol, keyword collection dispatched to a paired phone, result
// de-duplication / image storage, and result removal.
//
// Note: the device server listens on the fixed port 41688, so stop any running dev
// instance of the app before running this test.
const assert = require('node:assert/strict')
const { existsSync } = require('node:fs')
const { mkdir, mkdtemp, rm, writeFile } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { _electron: electron } = require('playwright')
const { WebSocket } = require('ws')

const DEVICE_PORT = 41688
const imageDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

async function main() {
  const root = await mkdtemp(join(tmpdir(), 'videogenerate-product-research-%-'))
  const dataDir = join(root, 'data')
  const legacyResults = Array.from({ length: 3 }, (_, index) => ({
    id: `legacy-${index + 1}`,
    taskId: 'legacy-task',
    keyword: 'bag',
    title: `Legacy Product ${index + 1}`,
    priceText: '$12.00',
    priceValue: 12,
    salesText: `${index + 1} sold`,
    salesValue: index + 1,
    shopName: 'Legacy Shop',
    rank: index + 1,
    imageDataUrl,
    capturedAt: 1000 + index,
    confidence: 0.88,
  }))
  let app
  let socket
  try {
    await mkdir(dataDir, { recursive: true })
    await writeFile(join(dataDir, 'product-research.json'), JSON.stringify({ devices: [], deviceTokens: {}, tasks: [], results: legacyResults }), 'utf8')
    app = await electron.launch({
      args: ['.'],
      cwd: join(__dirname, '..'),
      env: { ...process.env, VIDEOGENERATE_USER_DATA_DIR: root, VIDEOGENERATE_DATA_DIR: dataDir },
    })
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')

    // 1. Legacy results: inline base64 images are moved to files on load.
    await page.waitForFunction(() => window.api.productResearch.snapshot().then((snapshot) => snapshot.results.length === 3))
    const migrated = await page.evaluate(() => window.api.productResearch.snapshot())
    assert.equal(migrated.results.filter((item) => item.imageDataUrl).length, 0)
    assert.ok(migrated.results.every((item) => item.imagePath && item.imagePath.endsWith('.png')))
    assert.ok(migrated.results.every((item) => existsSync(item.imagePath)))
    assert.ok(migrated.serverRunning, 'device server should be running')

    // 2. Scheme list page and navigation.
    await page.evaluate(() => { window.location.hash = '#/product-research' })
    await page.locator('.pr-hero h1').waitFor({ state: 'visible' })
    assert.equal((await page.locator('.pr-hero h1').innerText()).trim(), '选品中心')
    const navigation = await page.locator('[data-testid="app-sidebar"] .vg-nav__item').evaluateAll((buttons) => buttons.map((button) => button.getAttribute('title') || ''))
    assert.deepEqual(navigation.slice(0, 2), ['首页', '选品'])
    assert.equal(navigation.includes('生产'), false)

    const scheme = await page.evaluate(() => window.api.productResearch.createScheme({ name: 'E2E 戒指方案', need: '银饰戒指', market: 'VN', keywords: [] }))
    assert.ok(scheme.id)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.getByText('E2E 戒指方案').first().waitFor({ state: 'visible' })

    // 3. Scheme workspace with the five SOP steps.
    await page.evaluate((id) => { window.location.hash = `#/product-research/${id}` }, scheme.id)
    await page.locator('.prd-stepper__item').first().waitFor({ state: 'visible' })
    const stepNames = await page.locator('.prd-stepper__text b').allInnerTexts()
    assert.deepEqual(stepNames.map((name) => name.trim()), ['商品采集', '分析商品', '确定商品', '直播测试', '获得爆款商品'])

    // 4. Pair a phone through the pairing dialog + device protocol.
    await page.getByRole('button', { name: '连接手机', exact: true }).first().click()
    await page.locator('.pair-code').waitFor({ state: 'visible' })
    await page.waitForFunction(() => /^\d{6}$/.test(document.querySelector('.pair-code')?.textContent?.trim() || ''))
    const pairingCode = (await page.locator('.pair-code').innerText()).trim()
    const pairResponse = await fetch(`http://127.0.0.1:${DEVICE_PORT}/device`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'pair', pairingCode, deviceId: 'e2e-phone', deviceName: 'Test Android', model: 'Pixel E2E' }),
    })
    assert.equal(pairResponse.status, 200)
    const { token } = await pairResponse.json()
    assert.ok(token)
    socket = new WebSocket(`ws://127.0.0.1:${DEVICE_PORT}/?deviceId=e2e-phone&token=${encodeURIComponent(token)}`)
    await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject) })
    await page.getByText('配对成功').waitFor({ state: 'visible', timeout: 10_000 })
    await page.locator('.pair-code').waitFor({ state: 'hidden', timeout: 10_000 })
    await page.waitForFunction(() => window.api.productResearch.snapshot().then((snapshot) => snapshot.devices.some((device) => device.id === 'e2e-phone' && device.connected)))

    // 5. Add a keyword in the UI and start collection; the phone receives the task.
    await page.locator('.sc-row--mid button', { hasText: '新增' }).click()
    await page.locator('.sc-kw-add input').fill('ring')
    await page.locator('.sc-kw-add button', { hasText: '添加' }).click()
    await page.locator('.sc-row--mid tbody tr').filter({ hasText: 'ring' }).first().waitFor({ state: 'visible' })
    const keywordCheckbox = page.locator('.sc-row--mid tbody tr').filter({ hasText: 'ring' }).first().locator('input[type="checkbox"]')
    if (!(await keywordCheckbox.isChecked())) await keywordCheckbox.check()
    await page.locator('.sc-num').fill('3')
    const taskMessage = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timed out waiting for collect_task')), 10_000)
      const onMessage = (raw) => {
        const message = JSON.parse(raw.toString())
        if (message.type !== 'collect_task') return
        clearTimeout(timeout)
        socket.off('message', onMessage)
        resolve(message)
      }
      socket.on('message', onMessage)
      void page.locator('.sc-start').click()
    })
    assert.equal(taskMessage.task.keyword, 'ring')
    assert.equal(taskMessage.task.schemeId, scheme.id)
    assert.equal(taskMessage.task.targetCount, 3)
    const taskId = taskMessage.task.id

    // 6. Phone reports results; same title with different whitespace is de-duplicated.
    socket.send(JSON.stringify({ type: 'task_progress', taskId }))
    const result = { title: 'Live Product', priceText: '$18.00', priceValue: 18, salesText: '40 sold', salesValue: 40, imageDataUrl }
    socket.send(JSON.stringify({ type: 'task_result', taskId, result }))
    socket.send(JSON.stringify({ type: 'task_result', taskId, result: { ...result, title: 'Live   Product' } }))
    socket.send(JSON.stringify({ type: 'task_complete', taskId }))
    await page.waitForFunction((id) => window.api.productResearch.snapshot(id).then((snapshot) => (
      snapshot.tasks.some((task) => task.status === 'completed')
    )), scheme.id)
    const collected = await page.evaluate((id) => window.api.productResearch.snapshot(id), scheme.id)
    const liveResults = collected.results.filter((item) => item.title.replace(/\s/g, '') === 'LiveProduct')
    assert.equal(liveResults.length, 1)
    assert.equal(collected.tasks.find((task) => task.id === taskId).collectedCount, 1)
    assert.ok(liveResults[0].imagePath && existsSync(liveResults[0].imagePath))
    assert.equal(liveResults[0].imageDataUrl, undefined)
    assert.equal(liveResults[0].schemeId, scheme.id)
    // Legacy (scheme-less) results are not mixed into the scheme workspace.
    assert.equal(collected.results.some((item) => item.id.startsWith('legacy-')), false)

    // The scheme workspace picks the result up (2s polling) and lists it.
    await page.locator('.prd-product__name', { hasText: 'Live Product' }).first().waitFor({ state: 'visible', timeout: 10_000 })

    // 7. Removing results.
    assert.equal(await page.evaluate(({ id, resultId }) => window.api.productResearch.removeResult(resultId, id), { id: scheme.id, resultId: liveResults[0].id }), true)
    await page.waitForFunction((id) => window.api.productResearch.snapshot(id).then((snapshot) => snapshot.results.length === 0), scheme.id)
    await page.locator('.prd-product__name', { hasText: 'Live Product' }).first().waitFor({ state: 'detached', timeout: 10_000 })
    const cleared = await page.evaluate(() => window.api.productResearch.clearResults())
    assert.ok(cleared >= 3)
    await page.waitForFunction(() => window.api.productResearch.snapshot().then((snapshot) => snapshot.results.length === 0))

    console.log('Product research Electron test passed')
  } finally {
    socket?.close()
    if (app) await app.close()
    await rm(root, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
