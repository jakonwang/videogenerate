/**
 * Clone compose step → "替换视频" menu: shows the 图生视频 result made for the shot, uses it,
 * and offers "交给 tk创意室 重做这个镜头". Seeds data with tsx, then drives the built Electron app.
 * Usage: VG_LICENSE_MODE=off npx electron-vite build && node test/clone-shot-replace-ui.e2e.cjs [screenshotDir]
 */
const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const { mkdtemp, mkdir } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { _electron: electron } = require('playwright')

async function main() {
  const root = await mkdtemp(join(tmpdir(), 'videogenerate-shot-replace-'))
  const dataDir = join(root, 'data')
  const shots = process.argv[2] || join(root, 'shots')
  await mkdir(shots, { recursive: true })
  const env = { ...process.env, VIDEOGENERATE_USER_DATA_DIR: root, VIDEOGENERATE_DATA_DIR: dataDir }
  const seed = spawnSync('npx', ['tsx', 'test/fixtures/seed-clone-cross-line.ts'], { cwd: join(__dirname, '..'), env, shell: true, encoding: 'utf8' })
  assert.equal(seed.status, 0, seed.stderr)
  const { projectId } = JSON.parse(seed.stdout.trim().split('\n').pop())

  const errors = []
  const app = await electron.launch({ args: ['.'], cwd: join(__dirname, '..'), env })
  try {
    const page = await app.firstWindow()
    page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
    page.on('console', (message) => {
      if (message.type() === 'error' && !/Electron Security Warning|DevTools|Autofill|Failed to load resource/i.test(message.text())) errors.push(message.text())
    })
    await page.waitForLoadState('domcontentloaded')
    await page.evaluate((id) => { window.location.hash = `#/clone/${id}` }, projectId)
    await page.waitForSelector('.cwf-step', { timeout: 20000 })
    await page.locator('.cwf-step').last().click()
    await page.waitForSelector('[data-testid="clone-shot-replace"]', { timeout: 15000 })

    // Shot 1 is selected first: one finished 图生视频 result is offered.
    const toggle = page.locator('[data-testid="clone-shot-replace-toggle"]')
    await page.waitForFunction(() => document.querySelector('[data-testid="clone-shot-replace-toggle"]')?.textContent?.includes('1'))
    await toggle.click()
    const menu = page.locator('[data-testid="clone-shot-replace-menu"]')
    await menu.waitFor()
    const menuText = await menu.innerText()
    assert.ok(menuText.includes('从电脑选择'), 'local file option kept')
    assert.ok(menuText.includes('用已出的结果') && menuText.includes('图生视频'), 'finished result listed')
    assert.ok(menuText.includes('交给 tk创意室 重做这个镜头'), 'send-to-creative option shown')
    assert.ok(!/ai\.cloneShot\./.test(menuText), 'no untranslated keys')
    await page.screenshot({ path: join(shots, '01-replace-menu.png') })

    await menu.locator('[data-testid="clone-shot-alternative"] button').click()
    await page.waitForFunction(() => !document.querySelector('[data-testid="clone-shot-replace-menu"]'))
    const alternatives = await page.evaluate(async (id) => await window.api.clone.listShotAlternatives({ cloneProjectId: id }), projectId)
    assert.equal(alternatives.find((item) => item.ref === 'livephoto:e2e-lp1')?.inUse, true, 'shot now uses the 图生视频 result')
    await toggle.click()
    await menu.waitFor()
    assert.ok((await menu.innerText()).includes('使用中'), 'menu marks the result in use')
    await page.screenshot({ path: join(shots, '02-after-use.png') })

    // No product bound → sending to tk创意室 explains why instead of failing silently.
    await menu.locator('[data-testid="clone-shot-send-creative"]').click()
    const error = page.locator('[data-testid="clone-shot-replace-error"]')
    await error.waitFor()
    assert.ok((await error.innerText()).includes('绑定商品'), 'explains in the menu that a product must be bound')
    await page.screenshot({ path: join(shots, '03-send-needs-product.png') })

    assert.deepEqual(errors, [], `renderer errors: ${errors.join('\n')}`)
    console.log(`clone-shot-replace-ui e2e: ok (screenshots in ${shots})`)
  } finally {
    await app.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
