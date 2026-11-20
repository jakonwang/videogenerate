/**
 * Registration asks for the password twice: a mismatch is stopped in the form before any request,
 * a match goes on to the cloud (unreachable here, so it ends in a connection error).
 * Usage: VG_LICENSE_MODE=enforced VG_CLOUD_API_BASE=http://127.0.0.1:1 npx electron-vite build && node test/cloud-register-confirm.e2e.cjs
 */
const assert = require('node:assert/strict')
const { mkdtemp } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { _electron: electron } = require('playwright')

async function main() {
  const repo = join(__dirname, '..')
  const root = await mkdtemp(join(tmpdir(), 'videogenerate-register-'))
  const env = { ...process.env, VIDEOGENERATE_USER_DATA_DIR: root, VIDEOGENERATE_DATA_DIR: join(root, 'data') }
  let app
  try {
    app = await electron.launch({ args: ['.'], cwd: repo, env })
    const page = await app.firstWindow()
    page.setDefaultTimeout(30_000)
    await page.locator('[data-testid="cloud-login-form"]').waitFor({ state: 'visible' })
    assert.equal(await page.locator('[data-testid="cloud-login-confirm-password"]').count(), 0, 'login tab has no confirm field')

    await page.getByRole('button', { name: '没有账号？注册' }).click()
    const confirm = page.locator('[data-testid="cloud-login-confirm-password"]')
    await confirm.waitFor({ state: 'visible' })
    await page.locator('[data-testid="cloud-login-account"]').fill('new-user@example.invalid')
    await page.locator('[data-testid="cloud-login-password"]').fill('password-one-1')
    await confirm.fill('password-two-2')
    await page.locator('[data-testid="cloud-login-submit"]').click()
    await page.locator('.vg-field__error', { hasText: '两次输入的密码不一致' }).waitFor({ state: 'visible' })

    await confirm.fill('password-one-1')
    await page.locator('[data-testid="cloud-login-submit"]').click()
    await page.locator('.vg-field__error', { hasText: '无法连接云端服务' }).waitFor({ state: 'visible' })
    await page.screenshot({ path: join(repo, 'test-artifacts', 'cloud-register-confirm.png') })

    // Back on the login tab the confirm field is gone again.
    await page.getByRole('button', { name: '已有账号？登录' }).click()
    assert.equal(await confirm.count(), 0)
    console.log('cloud register confirm e2e passed')
  } finally {
    await app?.close().catch(() => undefined)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
