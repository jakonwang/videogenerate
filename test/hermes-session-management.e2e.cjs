const assert = require('node:assert/strict')
const { mkdir, mkdtemp, rm, writeFile } = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { _electron: electron } = require('playwright')

async function main() {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'videogenerate-hermes-session-management-'))
  const textAttachment = path.join(dataDir, 'attachment-test.txt')
  const imageAttachment = path.join(dataDir, 'attachment-test.png')
  await writeFile(textAttachment, 'VideoGenerate Hermes attachment test', 'utf8')
  await writeFile(imageAttachment, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'))
  const artifacts = path.join(process.cwd(), 'test-artifacts')
  await mkdir(artifacts, { recursive: true })
  const app = await electron.launch({
    args: ['.'],
    cwd: process.cwd(),
    env: { ...process.env, VIDEOGENERATE_DATA_DIR: dataDir, ELECTRON_DISABLE_SECURITY_WARNINGS: 'true' },
    timeout: 60_000,
  })
  let storedSessionId = ''
  let conversationId = ''
  const cleanupSessionIds = new Set()

  try {
    const page = await app.firstWindow()
    await page.waitForSelector('.hermes-workspace', { timeout: 60_000 })
    await page.waitForSelector('.runtime-block.is-ready', { timeout: 60_000 })
    const created = await page.evaluate(async () => await window.api.hermes.createSession({
      employeeId: 'employee.supervisor',
      channel: 'desktop',
    }))
    storedSessionId = String(created.storedSessionId || '')
    conversationId = String(created.conversationId || '')
    cleanupSessionIds.add(storedSessionId)
    let liveSessionId = String(created.sessionId || '')
    assert.ok(storedSessionId)
    assert.ok(liveSessionId)
    assert.ok(conversationId)
    const initialConversation = await page.evaluate(async (id) => await window.api.agentOs.getConversation(id), conversationId)
    assert.equal(String(initialConversation.conversation.hermesStoredSessionId || ''), storedSessionId)
    assert.ok(initialConversation.conversation.hermesStoredSessionIds.includes(storedSessionId))
    await page.evaluate(async ({ sessionId }) => await window.api.hermes.sendPrompt({
      sessionId,
      text: 'Reply with exactly VG_SESSION_UI_TEST. Do not use tools.',
    }), { sessionId: liveSessionId })
    await page.waitForFunction((sessionId) => window.api.hermes.getHistory(sessionId).then((messages) => JSON.stringify(messages).includes('VG_SESSION_UI_TEST')), liveSessionId, { timeout: 180_000 })
    await page.evaluate(async (sessionId) => await window.api.hermes.closeSession(sessionId), liveSessionId)
    const resumed = await page.evaluate(async (sessionId) => await window.api.hermes.resumeSession(sessionId), storedSessionId)
    assert.equal(String(resumed.conversationId || ''), conversationId)
    assert.equal(String(resumed.employeeId || ''), 'employee.supervisor')
    await page.evaluate(async (sessionId) => await window.api.hermes.closeSession(sessionId), String(resumed.sessionId || ''))
    const bridgeBeforeRestart = await page.evaluate(async () => await window.api.hermes.getModelOptions())
    await page.evaluate(async () => await window.api.hermes.restartRuntime())
    await page.waitForSelector('.runtime-block.is-ready', { timeout: 60_000 })
    const bridgeAfterRestart = await page.evaluate(async () => await window.api.hermes.getModelOptions())
    if (String(bridgeBeforeRestart.custom?.baseUrl || '').includes('127.0.0.1')) {
      assert.notEqual(String(bridgeAfterRestart.custom?.baseUrl || ''), String(bridgeBeforeRestart.custom?.baseUrl || ''))
    }
    const rebound = await page.evaluate(async (sessionId) => await window.api.hermes.resumeSession(sessionId), storedSessionId)
    liveSessionId = String(rebound.sessionId || '')
    await page.evaluate(async ({ sessionId }) => await window.api.hermes.sendPrompt({
      sessionId,
      text: 'Reply with exactly VG_BRIDGE_REBOUND_OK. Do not use tools.',
    }), { sessionId: liveSessionId })
    await page.waitForFunction((sessionId) => window.api.hermes.getHistory(sessionId).then((messages) => JSON.stringify(messages).includes('VG_BRIDGE_REBOUND_OK')), liveSessionId, { timeout: 180_000 })
    await page.evaluate(async (sessionId) => await window.api.hermes.closeSession(sessionId), liveSessionId)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.hermes-workspace')
    await page.waitForSelector('.runtime-block.is-ready', { timeout: 60_000 })

    let row = page.locator(`[data-session-id="${storedSessionId}"]`)
    await row.waitFor({ state: 'visible', timeout: 180_000 })
    const switchStartedAt = Date.now()
    await row.locator('.session-select').click()
    await page.waitForFunction((sessionId) => document.querySelector(`[data-session-id="${sessionId}"]`)?.classList.contains('is-active'), storedSessionId, { timeout: 500 })
    assert.ok(Date.now() - switchStartedAt < 500, 'Session selection should update immediately without waiting for Hermes resume.')
    await page.waitForFunction(() => Boolean(document.querySelector('.hermes-workspace')?.getAttribute('data-session-id')), null, { timeout: 30_000 })
    const activeLiveSessionId = String(await page.locator('.hermes-workspace').getAttribute('data-session-id') || '')
    const reusedSession = await page.evaluate(async (sessionId) => {
      const startedAt = performance.now()
      const result = await window.api.hermes.resumeSession(sessionId)
      return { result, elapsedMs: performance.now() - startedAt }
    }, storedSessionId)
    assert.equal(String(reusedSession.result.sessionId || ''), activeLiveSessionId)
    assert.ok(reusedSession.elapsedMs < 2_000, `Active Hermes session reuse took ${reusedSession.elapsedMs.toFixed(0)}ms.`)
    await page.waitForTimeout(500)
    assert.equal(await row.evaluate((element) => element.classList.contains('is-active')), true)
    await app.evaluate(({ dialog }, filePaths) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths })
    }, [imageAttachment, textAttachment])
    await page.locator('.composer footer .icon-button:not(.command-button)').click()
    await page.waitForFunction(() => document.querySelectorAll('.attachment-list > article').length === 2)
    assert.equal(await page.locator('.attachment-list > article').count(), 2)
    assert.match(String(await page.locator('.attachment-list img').getAttribute('src')), /^vg:\/\/file\?path=/)
    await page.locator('.composer footer .icon-button:not(.command-button)').click()
    await page.waitForTimeout(100)
    assert.equal(await page.locator('.attachment-list > article').count(), 2)
    await page.locator('.composer').evaluate((element) => {
      element.dispatchEvent(new DragEvent('dragenter', { bubbles: true, dataTransfer: new DataTransfer() }))
    })
    await page.locator('.attachment-drop-overlay').waitFor({ state: 'visible' })
    await page.locator('.composer').evaluate((element) => {
      element.dispatchEvent(new DragEvent('dragleave', { bubbles: true, dataTransfer: new DataTransfer() }))
    })
    await page.locator('.attachment-drop-overlay').waitFor({ state: 'hidden' })
    while (await page.locator('.attachment-list article button').count()) {
      await page.locator('.attachment-list article button').first().click()
    }
    assert.equal(await page.locator('.attachment-list > article').count(), 0)
    await page.locator('.composer textarea').evaluate((textarea) => {
      const bytes = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='), (value) => value.charCodeAt(0))
      const transfer = new DataTransfer()
      transfer.items.add(new File([bytes], 'clipboard-image.png', { type: 'image/png' }))
      const event = new Event('paste', { bubbles: true, cancelable: true })
      Object.defineProperty(event, 'clipboardData', { value: transfer })
      textarea.dispatchEvent(event)
    })
    await page.waitForFunction(() => document.querySelectorAll('.attachment-list > article').length === 1)
    assert.equal((await page.locator('.attachment-list article strong').textContent())?.trim(), 'clipboard-image.png')
    assert.match(String(await page.locator('.attachment-list img').getAttribute('src')), /^vg:\/\/file\?path=/)
    await page.locator('.attachment-list article button').click()
    assert.equal(await page.locator('.attachment-list > article').count(), 0)
    await page.locator('.composer textarea').evaluate((textarea) => {
      const bytes = new Uint8Array(5 * 1024 * 1024)
      bytes.fill(65)
      const transfer = new DataTransfer()
      transfer.items.add(new File([bytes], 'clipboard-large.txt', { type: 'text/plain' }))
      const event = new Event('paste', { bubbles: true, cancelable: true })
      Object.defineProperty(event, 'clipboardData', { value: transfer })
      textarea.dispatchEvent(event)
    })
    await page.waitForFunction(() => document.querySelectorAll('.attachment-list > article').length === 1)
    assert.equal((await page.locator('.attachment-list article strong').textContent())?.trim(), 'clipboard-large.txt')
    assert.doesNotMatch(String(await page.locator('.error-banner').textContent().catch(() => '')), /object could not be cloned|DataCloneError/i)
    await page.locator('.attachment-list article button').click()
    await page.evaluate(() => {
      const input = document.createElement('input')
      input.id = 'hermes-attachment-drop-test'
      input.type = 'file'
      input.multiple = true
      input.hidden = true
      document.body.appendChild(input)
    })
    await page.locator('#hermes-attachment-drop-test').setInputFiles([imageAttachment, textAttachment])
    await page.evaluate(() => {
      const input = document.querySelector('#hermes-attachment-drop-test')
      const composer = document.querySelector('.composer')
      const dataTransfer = new DataTransfer()
      for (const file of Array.from(input.files || [])) dataTransfer.items.add(file)
      composer.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer }))
      input.remove()
    })
    await page.waitForFunction(() => document.querySelectorAll('.attachment-list > article').length === 2)
    await page.locator('.composer textarea').fill('Reply with exactly VG_ATTACHMENT_UI_TEST. Do not use tools.')
    await page.locator('.composer .send-button').click()
    const attachmentMessage = page.locator('.message-row.is-user').filter({ hasText: 'VG_ATTACHMENT_UI_TEST' })
    await attachmentMessage.waitFor({ state: 'visible', timeout: 30_000 })
    assert.equal(await attachmentMessage.locator('.message-attachment-list > button').count(), 2)
    assert.match(String(await attachmentMessage.locator('.message-attachment-list img').getAttribute('src')), /^vg:\/\/file\?path=/)
    await app.evaluate(({ shell }) => {
      global.__VG_TEST_OPENED_PATHS = []
      shell.openPath = async (filePath) => {
        global.__VG_TEST_OPENED_PATHS.push(String(filePath))
        return ''
      }
    })
    await attachmentMessage.locator('.message-attachment-list > button').nth(1).click()
    await page.waitForTimeout(100)
    assert.deepEqual(await app.evaluate(() => global.__VG_TEST_OPENED_PATHS), [textAttachment])
    if (await page.locator('.stop-button').isVisible()) {
      await page.locator('.composer textarea').fill('VG_QUEUED_UI_TEST')
      await page.locator('.composer .send-button').click()
      await page.locator('.queue-band').waitFor({ state: 'visible' })
      assert.match(String(await page.locator('.queue-list article strong').textContent()), /VG_QUEUED_UI_TEST/)
      await page.locator('.queue-list article button').click()
      await page.locator('.queue-band').waitFor({ state: 'hidden' })
    }
    await page.waitForTimeout(1_000)
    const attachmentError = await page.locator('.error-banner').textContent().catch(() => '')
    assert.doesNotMatch(String(attachmentError || ''), /object could not be cloned|DataCloneError/i)
    const stopButton = page.locator('.stop-button')
    if (await stopButton.isVisible()) {
      await stopButton.click()
      await stopButton.waitFor({ state: 'hidden', timeout: 30_000 })
    }
    await page.reload()
    await page.waitForSelector('.hermes-workspace', { timeout: 60_000 })
    await page.waitForSelector('.runtime-block.is-ready', { timeout: 60_000 })
    await page.waitForFunction((sessionId) => document.querySelector(`[data-session-id="${sessionId}"]`)?.classList.contains('is-active'), storedSessionId)
    const restoredAttachmentMessage = page.locator('.message-row.is-user').filter({ hasText: 'VG_ATTACHMENT_UI_TEST' })
    await restoredAttachmentMessage.waitFor({ state: 'visible', timeout: 30_000 })
    assert.equal(await restoredAttachmentMessage.locator('.message-attachment-list > button').count(), 2)
    assert.match(String(await restoredAttachmentMessage.locator('.message-attachment-list img').getAttribute('src')), /^vg:\/\/file\?path=/)
    assert.doesNotMatch(String(await restoredAttachmentMessage.locator('.hermes-message-content').textContent()), /Attached Context|@file:|Image attached at/i)
    await page.screenshot({ path: path.join(artifacts, 'hermes-session-attachment-history.png') })

    const sourceStoredSessionId = storedSessionId
    await page.locator('.surface-actions > .icon-button:not(.activity-rail-trigger)').click()
    await page.waitForFunction((sourceId) => {
      const active = document.querySelector('.session-list > article.is-active')
      return Boolean(active?.getAttribute('data-session-id') && active.getAttribute('data-session-id') !== sourceId)
    }, sourceStoredSessionId)
    storedSessionId = String(await page.locator('.session-list > article.is-active').getAttribute('data-session-id') || '')
    assert.ok(storedSessionId)
    assert.notEqual(storedSessionId, sourceStoredSessionId)
    cleanupSessionIds.add(storedSessionId)
    const linkedConversation = await page.evaluate(async (id) => await window.api.agentOs.getConversation(id), conversationId)
    assert.ok(linkedConversation.conversation.hermesStoredSessionIds.includes(storedSessionId))
    row = page.locator(`[data-session-id="${storedSessionId}"]`)
    assert.equal(await page.locator(`[data-session-id="${sourceStoredSessionId}"]`).count(), 1)
    await page.waitForFunction((sessionId) => {
      const button = document.querySelector(`[data-session-id="${sessionId}"] .session-select`)
      return button instanceof HTMLButtonElement && !button.disabled
    }, storedSessionId)
    assert.equal(await row.locator('.session-select').isEnabled(), true)
    assert.equal(await page.locator('.message-row.is-user').filter({ hasText: 'VG_ATTACHMENT_UI_TEST' }).count(), 1)
    await page.reload()
    await page.waitForSelector('.runtime-block.is-ready', { timeout: 60_000 })
    await page.waitForFunction((sessionId) => document.querySelector(`[data-session-id="${sessionId}"]`)?.classList.contains('is-active'), storedSessionId)
    await page.locator('.message-row.is-user').filter({ hasText: 'VG_ATTACHMENT_UI_TEST' }).waitFor({ state: 'visible', timeout: 30_000 })
    await page.screenshot({ path: path.join(artifacts, 'hermes-session-branch-restored.png') })

    await row.locator('.session-menu-trigger').click()
    await row.locator('.session-menu button').first().click()
    const input = page.locator('.session-modal input')
    await input.fill('VideoGenerate session UI test')
    await page.locator('.session-modal .primary-button').click()
    await page.waitForFunction((sessionId) => {
      const row = document.querySelector(`[data-session-id="${sessionId}"]`)
      return row?.querySelector('strong')?.textContent?.trim() === 'VideoGenerate session UI test'
    }, storedSessionId)

    const sessionSearch = page.locator('.session-search input')
    await sessionSearch.fill('VideoGenerate session UI test')
    assert.equal(await page.locator(`[data-session-id="${storedSessionId}"]`).count(), 1)
    await sessionSearch.fill('VG_NO_MATCHING_SESSION')
    await page.locator('.session-list .empty-copy').waitFor({ state: 'visible' })
    await sessionSearch.fill('')

    await row.locator('.session-menu-trigger').click()
    await row.locator('.session-menu button').nth(1).click()
    await page.waitForSelector('.session-delete-copy')
    await page.screenshot({ path: path.join(artifacts, 'hermes-session-delete-confirm.png') })
    await page.locator('.session-modal .danger-button').click()
    await row.waitFor({ state: 'detached', timeout: 30_000 })
    cleanupSessionIds.delete(storedSessionId)
    storedSessionId = ''
    await page.screenshot({ path: path.join(artifacts, 'hermes-session-management-complete.png') })
    console.log('hermes-session-management.e2e: ok')
  } finally {
    if (cleanupSessionIds.size) {
      const page = await app.firstWindow().catch(() => undefined)
      for (const sessionId of cleanupSessionIds) {
        await page?.evaluate(async (id) => {
          await window.api.hermes.deleteSession(id).catch(() => undefined)
        }, sessionId).catch(() => undefined)
      }
    }
    await app.close().catch(() => undefined)
    await rm(dataDir, { recursive: true, force: true })
  }
}

void main()
