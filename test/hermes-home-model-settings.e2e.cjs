const assert = require('node:assert/strict')
const path = require('node:path')
const { mkdir } = require('node:fs/promises')
const { _electron: electron } = require('playwright')

async function setWindowSize(app, width, height) {
  let lastError
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await app.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setSize(size.width, size.height), { width, height })
      return
    } catch (error) {
      lastError = error
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
  }
  throw lastError
}

async function main() {
  const artifacts = path.join(process.cwd(), 'test-artifacts')
  await mkdir(artifacts, { recursive: true })
  const app = await electron.launch({
    args: ['.'],
    cwd: process.cwd(),
    env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: 'true' },
    timeout: 60_000,
  })
  try {
    const page = await app.firstWindow()
    await page.waitForSelector('.hermes-workspace', { timeout: 60_000 })
    await page.waitForFunction(() => document.querySelector('.model-field') && !document.querySelector('.model-field').disabled, null, { timeout: 90_000 })

    await page.locator('.model-field').click()
    await page.waitForSelector('.model-modal')
    const secretInput = page.locator('.model-modal input[type="password"]')
    if (await secretInput.count()) assert.equal(await secretInput.inputValue(), '')

    const useApplicationModel = page.locator('.model-modal footer button').filter({ hasText: /Use current app model|使用软件当前模型/ })
    await useApplicationModel.click()
    await page.waitForFunction(() => {
      const text = document.querySelector('.model-feedback.is-success')?.textContent || ''
      return /active in Hermes|应用到 Hermes/.test(text)
    }, null, { timeout: 180_000 })

    const testConnection = page.locator('.model-modal footer button').filter({ hasText: /Test connection|测试连接/ })
    await testConnection.click()
    await page.waitForFunction(() => {
      const text = document.querySelector('.model-feedback.is-success')?.textContent || ''
      return /connection test|连接测试/.test(text)
    }, null, { timeout: 120_000 })

    await setWindowSize(app, 760, 680)
    await page.waitForTimeout(300)
    const modalFit = await page.locator('.model-modal').evaluate((element) => {
      const rect = element.getBoundingClientRect()
      return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: window.innerWidth, height: window.innerHeight }
    })
    assert.ok(modalFit.left >= 0 && modalFit.top >= 0 && modalFit.right <= modalFit.width && modalFit.bottom <= modalFit.height)
    await page.screenshot({ path: path.join(artifacts, 'hermes-model-settings-connected.png') })

    await page.locator('.model-modal > header .icon-button').click()
    const sessionButton = page.locator('.session-rail .rail-header .icon-button')
    const previousSessionId = String(await page.locator('.hermes-workspace').getAttribute('data-session-id') || '')
    await sessionButton.click()
    await page.waitForFunction((sessionId) => {
      const current = document.querySelector('.hermes-workspace')?.getAttribute('data-session-id') || ''
      return Boolean(current && current !== sessionId)
    }, previousSessionId, { timeout: 60_000 })
    await page.waitForFunction(() => [...document.querySelectorAll('.session-select')].some((button) => !button.disabled), null, { timeout: 60_000 })
    await page.waitForSelector('.composer textarea')
    await page.locator('.composer textarea').fill('Reply with exactly VG_HERMES_READY.')
    try {
      await page.waitForFunction(() => {
        const button = document.querySelector('.send-button')
        return button && !button.disabled
      }, null, { timeout: 60_000 })
    } catch (error) {
      const diagnostics = await page.evaluate(async () => ({
        runtime: await window.api.hermes.getRuntimeStatus(),
        workspaceSessionId: document.querySelector('.hermes-workspace')?.getAttribute('data-session-id') || '',
        error: document.querySelector('.error-banner')?.textContent || '',
        prompt: document.querySelector('.composer textarea')?.value || '',
        sendDisabled: document.querySelector('.send-button')?.disabled,
      }))
      console.error('hermes-home-model-settings-diagnostics', JSON.stringify(diagnostics, null, 2))
      throw error
    }
    await page.locator('.send-button').click()
    await page.waitForFunction(() => {
      const messages = [...document.querySelectorAll('.message-row.is-assistant')]
      return messages.some((element) => element.textContent?.includes('VG_HERMES_READY')) || Boolean(document.querySelector('.error-banner'))
    }, null, { timeout: 120_000 })

    const bodyText = await page.locator('body').innerText()
    if (!bodyText.includes('VG_HERMES_READY')) {
      await page.screenshot({ path: path.join(artifacts, 'hermes-home-message-failed.png') })
    }
    assert.match(bodyText, /VG_HERMES_READY/)
    assert.doesNotMatch(bodyText, /HTTP 401|Invalid token|request id:/i)
    await page.waitForFunction(() => {
      const title = document.querySelector('.session-row.is-active strong')?.textContent?.trim() || ''
      return Boolean(title && !/Untitled|\u672a\u547d\u540d|Chua dat ten/i.test(title))
    }, null, { timeout: 30_000 })
    await page.screenshot({ path: path.join(artifacts, 'hermes-home-message-success.png') })
    console.log(JSON.stringify({ modalFit, messageSucceeded: true }))
    console.log('hermes-home-model-settings.e2e: ok')
  } finally {
    await app.close().catch(() => undefined)
  }
}

void main()
