const assert = require('node:assert/strict')
const { mkdir, mkdtemp, rm, writeFile } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { _electron: electron } = require('playwright')
const { WebSocket } = require('ws')

async function main() {
  const root = await mkdtemp(join(tmpdir(), 'videogenerate-product-research-%-'))
  const dataDir = join(root, 'data')
  const imageDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
  const results = Array.from({ length: 21 }, (_, index) => ({
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
  results.push({ ...results[0], id: 'legacy-duplicate', capturedAt: 1 })
  let app
  try {
    await mkdir(dataDir, { recursive: true })
    await writeFile(join(dataDir, 'product-research.json'), JSON.stringify({
      devices: [],
      deviceTokens: {},
      tasks: [],
      results,
    }), 'utf8')
    app = await electron.launch({
      args: ['.'],
      cwd: join(__dirname, '..'),
      env: {
        ...process.env,
        VIDEOGENERATE_USER_DATA_DIR: root,
        VIDEOGENERATE_DATA_DIR: dataDir,
      },
    })
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await page.evaluate(() => { window.location.hash = '#/product-research' })
    await page.locator('.research-page').waitFor({ state: 'visible' })

    const navigation = await page.locator('[data-testid="app-sidebar"] .vg-nav__item').evaluateAll((buttons) => (
      buttons.map((button) => button.getAttribute('title') || '')
    ))
    assert.deepEqual(navigation.slice(0, 2), ['\u9996\u9875', '\u9009\u54c1'])
    assert.equal(navigation.includes('\u751f\u4ea7'), false)
    assert.equal(navigation.includes('\u5207\u7247'), false)
    assert.equal((await page.locator('.research-hero h1').innerText()).trim(), '\u9009\u54c1\u4e2d\u5fc3')
    assert.match(await page.locator('.status-grid').innerText(), /\u5c40\u57df\u7f51\u670d\u52a1/)
    assert.match(await page.locator('.status-grid').innerText(), /\u8fd0\u884c\u4e2d/)

    const workflowLabels = await page.locator('.workflow-stepper button').allInnerTexts()
    assert.deepEqual(workflowLabels.map((label) => label.replace(/^\s*\d+\s*/, '').trim()), [
      '\u5546\u54c1\u91c7\u96c6',
      '\u5206\u6790\u5546\u54c1',
      '\u786e\u5b9a\u5546\u54c1',
      '\u76f4\u64ad\u6d4b\u8bd5',
      '\u83b7\u5f97\u7206\u6b3e\u5546\u54c1',
    ])

    await page.locator('.workflow-stepper button').nth(1).click()
    assert.match(await page.locator('.workflow-panel h2').innerText(), /\u5206\u6790\u5546\u54c1/)
    await page.locator('.workflow-stepper button').nth(2).click()
    assert.match(await page.locator('.workflow-panel h2').innerText(), /\u786e\u5b9a\u5546\u54c1/)
    await page.locator('.workflow-stepper button').nth(3).click()
    assert.match(await page.locator('.workflow-panel h2').innerText(), /\u76f4\u64ad\u6d4b\u8bd5/)
    await page.locator('.workflow-stepper button').nth(4).click()
    assert.match(await page.locator('.workflow-panel h2').innerText(), /\u83b7\u5f97\u7206\u6b3e\u5546\u54c1/)
    await page.locator('.workflow-stepper button').first().click()

    await page.locator('.workflow-stepper button').first().click()

    await page.getByRole('button', { name: '\u8fde\u63a5\u624b\u673a', exact: true }).click()
    await page.locator('.pairing-dialog').waitFor({ state: 'visible' })
    assert.match(await page.locator('.pairing-code').innerText(), /\d{6}/)
    const pairingCode = (await page.locator('.pairing-code strong').innerText()).trim()
    const pairingEndpoint = (await page.locator('.pairing-endpoint').textContent()).trim().replace(/\s+/g, ' ').replace(/^\S+\s+/, '').trim()
    await page.waitForFunction(() => document.querySelector('.status-grid')?.textContent?.includes('\u8fd0\u884c\u4e2d'))
    await page.locator('.pairing-dialog .button--ghost').click()

    await page.waitForFunction(() => window.api.productResearch.snapshot().then((snapshot) => snapshot.results.length === 21))
    await page.getByRole('button', { name: '\u5237\u65b0', exact: true }).click()
    await page.waitForFunction(() => document.querySelector('.result-count')?.textContent?.includes('21'))
    await page.locator('.product-card').first().waitFor({ state: 'visible' })
    assert.equal(await page.locator('.product-card').count(), 20)
    assert.match(await page.locator('.result-count').innerText(), /21/)
    const migratedSnapshot = await page.evaluate(() => window.api.productResearch.snapshot())
    assert.equal(migratedSnapshot.results.length, 21)
    assert.equal(migratedSnapshot.results.filter((item) => item.imageDataUrl).length, 0)
    const imageWidth = await page.locator('.product-card__media img').first().evaluate(async (image) => {
      await image.decode()
      return image.naturalWidth
    })
    assert.ok(imageWidth > 0)
    await page.locator('.pagination button').last().click()
    assert.equal(await page.locator('.product-card').count(), 1)
    assert.match(await page.locator('.pagination').innerText(), /2 \/ 2/)
    await page.locator('.pagination button').first().click()
    await page.locator('.workflow-stepper button').first().click()

    assert.ok(pairingEndpoint)
    const port = new URL(pairingEndpoint).port
    const pairResponse = await fetch(`http://127.0.0.1:${port}/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: pairingCode, name: 'Test Android' }),
    })
    assert.equal(pairResponse.status, 200)
    const pairedDevice = await pairResponse.json()
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws?token=${pairedDevice.token}`)
    await new Promise((resolve, reject) => {
      socket.once('open', resolve)
      socket.once('error', reject)
    })
    await page.getByRole('button', { name: '\u5237\u65b0', exact: true }).click()
    await page.waitForFunction(() => document.querySelectorAll('.status-card')[1]?.textContent?.includes('1'))

    await page.locator('.field--wide input').fill('ring')
    await page.locator('.field input[type="number"]').fill('3')
    const taskMessage = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timed out waiting for collection task')), 5000)
      const onMessage = (raw) => {
        const message = JSON.parse(raw.toString())
        if (message.type !== 'collect_task') return
        clearTimeout(timeout)
        socket.off('message', onMessage)
        resolve(message)
      }
      socket.on('message', onMessage)
      void page.locator('.task-submit').click()
    })
    assert.equal(taskMessage.type, 'collect_task')
    const taskId = taskMessage.task.id
    socket.send(JSON.stringify({ type: 'task_started', taskId }))
    socket.send(JSON.stringify({
      type: 'result',
      taskId,
      result: { title: 'Live Product', priceText: '$18.00', priceValue: 18, salesText: '40 sold', salesValue: 40, imageDataUrl },
    }))
    socket.send(JSON.stringify({
      type: 'result',
      taskId,
      result: { title: 'Live   Product', priceText: '$18.00', priceValue: 18, salesText: '40 sold', salesValue: 40, imageDataUrl },
    }))
    socket.send(JSON.stringify({ type: 'task_completed', taskId }))
    await page.waitForTimeout(500)
    await page.getByRole('button', { name: '\u5237\u65b0', exact: true }).click()
    await page.waitForFunction(() => document.querySelector('.result-count')?.textContent?.includes('22'))
    const returnedResult = await page.evaluate(() => window.api.productResearch.snapshot())
    const liveResults = returnedResult.results.filter((item) => item.title.replace(/\s/g, '') === 'LiveProduct')
    assert.equal(liveResults.length, 1)
    assert.ok(liveResults[0].imagePath)
    assert.equal(liveResults[0].imageDataUrl, undefined)

    page.once('dialog', (dialog) => dialog.accept())
    await page.locator('.product-card__delete').first().click()
    await page.waitForTimeout(400)
    await page.getByRole('button', { name: '\u5237\u65b0', exact: true }).click()
    await page.waitForFunction(() => document.querySelector('.result-count')?.textContent?.includes('21'))
    page.once('dialog', (dialog) => dialog.accept())
    await page.locator('.results-toolbar .button--danger').click()
    await page.waitForFunction(() => document.querySelector('.result-count')?.textContent?.includes('0'))
    socket.close()

    console.log('Product research Electron test passed')
  } finally {
    if (app) await app.close()
    await rm(root, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
