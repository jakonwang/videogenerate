const assert = require('node:assert/strict')
const { mkdir, mkdtemp, readFile, rm, writeFile } = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { _electron: electron } = require('playwright')

async function main() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'videogenerate-hermes-event-recovery-'))
  const artifacts = path.join(process.cwd(), 'test-artifacts')
  await mkdir(artifacts, { recursive: true })
  const launchApp = async () => await electron.launch({
    args: ['.'],
    cwd: process.cwd(),
    env: {
      ...process.env,
      VIDEOGENERATE_DATA_DIR: root,
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
    },
    timeout: 60_000,
  })
  let app = await launchApp()
  let storedSessionId = ''

  try {
    let page = await app.firstWindow()
    await page.waitForSelector('.hermes-workspace', { timeout: 60_000 })
    await page.waitForSelector('.runtime-block.is-ready', { timeout: 60_000 })
    const created = await page.evaluate(async () => await window.api.hermes.createSession({
      employeeId: 'employee.supervisor',
      channel: 'desktop',
    }))
    storedSessionId = String(created.storedSessionId || '')
    const liveSessionId = String(created.sessionId || '')
    assert.ok(storedSessionId)
    assert.ok(liveSessionId)
    await page.evaluate(async (sessionId) => await window.api.hermes.sendPrompt({
      sessionId,
      text: 'Persist this session for the event recovery test.',
    }), liveSessionId)
    await page.waitForFunction((sessionId) => window.api.hermes.getHistory(sessionId)
      .then((messages) => JSON.stringify(messages).includes('Persist this session for the event recovery test.')), liveSessionId, { timeout: 30_000 })
    await page.evaluate(async (sessionId) => await window.api.hermes.interruptSession(sessionId), liveSessionId).catch(() => undefined)
    await page.evaluate(async (sessionId) => await window.api.hermes.closeSession(sessionId), liveSessionId)
    await app.close()

    const eventDbPath = path.join(root, 'db', 'hermes-events.json')
    const createdAt = Date.now()
    await writeFile(eventDbPath, JSON.stringify({
      schemaVersion: 1,
      nextSequence: 3,
      events: [
        {
          sequence: 1,
          type: 'tool.complete',
          sessionId: 'recovery-live-session',
          storedSessionId,
          payload: {
            tool_id: 'recovery-tool',
            name: 'videogenerate_product_analyze',
            result: { success: true, summary: 'Restored after application reload' },
          },
          createdAt,
        },
        {
          sequence: 2,
          type: 'clarify.request',
          sessionId: 'recovery-live-session',
          storedSessionId,
          payload: {
            request_id: 'recovery-request',
            question: 'Select the restored option.',
            choices: ['Option A', 'Option B'],
          },
          createdAt,
        },
      ],
    }, null, 2), 'utf8')

    app = await launchApp()
    page = await app.firstWindow()
    await page.waitForSelector('.hermes-workspace')
    await page.waitForSelector('.runtime-block.is-ready', { timeout: 60_000 })
    try {
      await page.waitForSelector(`[data-session-id="${storedSessionId}"] .session-needs-input`, { timeout: 30_000 })
    } catch (error) {
      const pending = await page.evaluate(async () => await window.api.hermes.listPendingInputs())
      const sessions = await page.evaluate(async () => await window.api.hermes.listSessions(500))
      const rowCount = await page.locator(`[data-session-id="${storedSessionId}"]`).count()
      const persisted = JSON.parse(await readFile(eventDbPath, 'utf8'))
      console.error('Pending input recovery diagnostics:', JSON.stringify({ storedSessionId, pending, sessions, rowCount, persisted }, null, 2))
      throw error
    }
    const sessionRow = page.locator(`[data-session-id="${storedSessionId}"]`)
    await sessionRow.locator('.session-select').click()
    await page.locator('.prompt-band').filter({ hasText: 'Select the restored option.' }).waitFor({ state: 'visible', timeout: 30_000 })
    let restoredActivity = page.locator('.activity-row').filter({ hasText: /Refresh product analysis|\u5237\u65b0\u5546\u54c1\u5206\u6790|Phan tich lai san pham/ })
    await restoredActivity.waitFor({ state: 'visible', timeout: 30_000 })
    await restoredActivity.locator('.activity-expand').click()
    assert.match(String(await restoredActivity.locator('.activity-details').textContent()), /Restored after application reload/)
    await page.screenshot({ path: path.join(artifacts, 'hermes-event-recovery-pending.png') })
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(680, 640))
    await page.waitForTimeout(250)
    const promptBounds = await page.locator('.prompt-band').evaluate((element) => {
      const rect = element.getBoundingClientRect()
      return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: window.innerWidth, height: window.innerHeight }
    })
    assert.ok(promptBounds.left >= 0 && promptBounds.right <= promptBounds.width)
    assert.ok(promptBounds.top >= 0 && promptBounds.bottom <= promptBounds.height)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 680)
    await page.screenshot({ path: path.join(artifacts, 'hermes-event-recovery-pending-narrow.png') })
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1080, 720))
    await page.waitForTimeout(250)
    await app.close()

    const eventDb = JSON.parse(await readFile(eventDbPath, 'utf8'))
    eventDb.nextSequence = 4
    eventDb.events.push({
      sequence: 3,
      type: 'input.resolved',
      sessionId: 'recovery-live-session',
      storedSessionId,
      payload: { kind: 'clarification', request_id: 'recovery-request' },
      createdAt: Date.now(),
    })
    await writeFile(eventDbPath, JSON.stringify(eventDb, null, 2), 'utf8')

    app = await launchApp()
    page = await app.firstWindow()
    await page.waitForSelector('.hermes-workspace')
    await page.waitForSelector('.runtime-block.is-ready', { timeout: 60_000 })
    await page.waitForFunction((id) => !document.querySelector(`[data-session-id="${id}"] .session-needs-input`), storedSessionId, { timeout: 30_000 })
    await page.locator(`[data-session-id="${storedSessionId}"] .session-select`).click()
    assert.equal(await page.locator('.prompt-band').count(), 0)
    restoredActivity = page.locator('.activity-row').filter({ hasText: /Refresh product analysis|\u5237\u65b0\u5546\u54c1\u5206\u6790|Phan tich lai san pham/ })
    await restoredActivity.waitFor({ state: 'visible', timeout: 30_000 })
    await page.screenshot({ path: path.join(artifacts, 'hermes-event-recovery-resolved.png') })
    await page.evaluate(async (sessionId) => await window.api.hermes.deleteSession(sessionId), storedSessionId)
    storedSessionId = ''
    console.log('hermes-event-recovery.e2e: ok')
  } finally {
    await app.close().catch(() => undefined)
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
}

void main()
