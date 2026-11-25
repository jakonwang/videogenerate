/**
 * Muse 创意室 account page in the built Electron app, with a proxy that refuses connections.
 * Never contacts muse.ai. Usage: VG_LICENSE_MODE=off npx electron-vite build && node test/muse-creative-accounts.e2e.cjs [screenshotDir]
 */
const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const { mkdtemp, mkdir, readFile, writeFile } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { _electron: electron } = require('playwright')

async function main() {
  const root = await mkdtemp(join(tmpdir(), 'videogenerate-muse-'))
  const dataDir = join(root, 'data')
  const shots = process.argv[2] || join(root, 'shots')
  await mkdir(shots, { recursive: true })
  const env = { ...process.env, VIDEOGENERATE_USER_DATA_DIR: root, VIDEOGENERATE_DATA_DIR: dataDir }
  const errors = []
  const launch = async () => {
    const app = await electron.launch({ args: ['.', `--user-data-dir=${root}`], cwd: join(__dirname, '..'), env })
    const page = await app.firstWindow()
    page.on('pageerror', (error) => errors.push(error.message))
    await page.waitForLoadState('domcontentloaded')
    await page.evaluate(() => { window.location.hash = '#/plugins/muse-creative-studio' })
    await page.waitForSelector('[data-testid="muse-page"]', { timeout: 30000 })
    return { app, page }
  }

  const clip = join(root, 'clip.mp4')
  assert.equal(spawnSync(require('ffmpeg-static'), ['-y', '-f', 'lavfi', '-i', 'testsrc=s=360x640:d=3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', clip]).status, 0)
  const image = join(__dirname, '..', 'resources', 'icon.png')
  const job = (id, extra) => ({ id, order: 0, accountId: '', imagePath: image, prompt: `prompt ${id}`, sentPrompt: 'x', durationSec: 10, aspect: '9:16', stage: 'preparing', submitted: false, createdAt: Date.now(), updatedAt: Date.now(), ...extra })
  await mkdir(join(dataDir, 'db'), { recursive: true })
  await writeFile(join(dataDir, 'db', 'products.json'), JSON.stringify({ products: [{ id: 'p-e2e', name: '测试商品', type: 'earring', createdAt: Date.now(), updatedAt: Date.now() }] }))
  await writeFile(join(dataDir, 'db', 'muse-creative-studio-jobs.json'), JSON.stringify({ jobs: [
    job('done', { status: 'completed', productId: 'p-e2e', order: -1, submitted: true, result: { videoPath: clip, width: 720, height: 1280, durationSec: 10, bytes: 5000000 } }),
    job('review', { status: 'needs_review', submitted: true, threadPath: '/thread/x', error: '已停止等待' }),
    job('swap', { status: 'image_review', productName: '换图手链', preparedImagePath: image, image: { review: true, autoLocate: true, prompt: 'x', runId: 'r', retryCount: 0, retryLimit: 0, attempts: 1, region: { x: 0.3, y: 0.3, width: 0.3, height: 0.3 } } }),
    job('failed', { status: 'failed', error: 'Muse 服务繁忙' }),
    job('cut', { status: 'running', productName: '测试手链' }),
  ] }))
  let { app, page } = await launch()
  try {
    assert.equal(await page.locator('[data-testid="section-tab-muse"]').count(), 0, 'tab hidden in packaged builds')
    await page.screenshot({ path: join(shots, '01-empty.png') })

    await page.screenshot({ path: join(shots, '04-create.png') })
    assert.equal(await page.locator('[data-testid="muse-start"]').isDisabled(), true, 'nothing to create without an image')
    // Create tab: swap needs a product, prompt versions and dialogs work.
    await page.click('[data-testid="muse-swap"]')
    await page.getByText('我确认后再生成').waitFor()
    await page.waitForFunction(() => document.querySelector('[data-testid="muse-prompt"]').value.includes('一镜到底'))
    await page.fill('[data-testid="muse-prompt"]', 'my video prompt')
    await page.click('[data-testid="muse-prompt-copy"]')
    await page.locator('[data-testid="muse-prompts"]').getByText('已存为新版本').waitFor()
    await page.click('[data-testid="muse-prompt-activate"]')
    await page.locator('[data-testid="muse-prompts"]').getByText('已启用').waitFor()
    await page.click('[data-testid="muse-prompt-image"]')
    await page.waitForFunction(() => /image/i.test(document.querySelector('[data-testid="muse-prompt"]').value))
    await page.locator('[data-testid="muse-prompts"]').getByRole('tab', { name: '视频' }).click()
    await page.waitForFunction(() => document.querySelector('[data-testid="muse-prompt"]').value === 'my video prompt')
    await page.click('[data-testid="muse-use-product-images"]')
    await page.locator('[data-testid="muse-details"]').getByText('请先在上面选择商品').waitFor()
    await page.locator('[data-testid="muse-details"]').scrollIntoViewIfNeeded()
    await page.screenshot({ path: join(shots, '13-create-swap.png'), fullPage: true })
    await page.click('[data-testid="muse-open-materials"]')
    await page.locator('[data-testid="muse-materials"]').getByText('没有衍生图').waitFor()
    await page.locator('[data-testid="muse-materials"]').getByLabel('关闭').click()
    await page.click('[data-testid="muse-settings"]')
    await page.locator('input[type="number"]').fill('2')
    await page.getByRole('button', { name: '保存', exact: true }).click()
    await page.waitForFunction(async () => (await window.api.museCreative.listJobs()).settings.imageRetryLimit === 2)

    await page.click('[data-testid="muse-tab-library"]')
    await page.waitForSelector('[data-testid="muse-library"]')
    assert.equal(await page.locator('[data-testid="muse-job"]').count(), 5)
    await page.locator('[data-testid="muse-waiting"]').waitFor()
    assert.ok((await page.locator('[data-testid="muse-resume"]').innerText()).includes('1'), 'a job cut off before sending is held after a restart')
    await page.waitForTimeout(800)
    await page.screenshot({ path: join(shots, '05-library.png') })
    // Review of a swapped picture: compare, draw a region, approve only after confirming. Nothing is submitted here.
    await page.click('[data-testid="muse-open-review"]')
    await page.locator('[data-testid="muse-review"]').waitFor()
    await page.getByRole('button', { name: '框选区域' }).click()
    const box = await page.locator('[data-testid="muse-region"]').boundingBox()
    await page.mouse.move(box.x + box.width * 0.05, box.y + box.height * 0.05)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.25, { steps: 5 })
    await page.mouse.up()
    const drawn = await page.locator('.mr__box').evaluate((el) => [el.style.left, el.style.width].map(parseFloat))
    assert.ok(Math.abs(drawn[0] - 5) < 2 && Math.abs(drawn[1] - 20) < 3, String(drawn))
    await page.screenshot({ path: join(shots, '14-review.png') })
    await page.click('[data-testid="muse-redo"]')
    await page.locator('[data-testid="muse-redo-confirm"]').waitFor()
    await page.keyboard.press('Escape')
    assert.equal((await page.evaluate(() => window.api.museCreative.getJob('swap'))).status, 'image_review')
    await page.click('[data-testid="muse-open-review"]')
    await page.click('[data-testid="muse-approve"]')
    await page.click('[data-testid="muse-confirm"]')
    await page.waitForFunction(async () => (await window.api.museCreative.getJob('swap')).status === 'queued')

    // Finished videos play inside the app; Escape closes the player.
    await page.locator('[data-testid="muse-job"]').first().getByText('播放').click()
    await page.waitForFunction(() => { const v = document.querySelector('.mv__player'); return v && v.currentTime > 0.2 && !v.error }, null, { timeout: 15000 })
    await page.screenshot({ path: join(shots, '07-player.png') })
    await page.keyboard.press('Escape')
    await page.waitForSelector('.mv__player', { state: 'detached' })
    await page.locator('.ts-item__preview').first().click()
    await page.waitForSelector('.mv__player')
    await page.locator('[data-testid="muse-video"]').getByLabel('关闭').click()
    await page.waitForSelector('.mv__player', { state: 'detached' })

    // Real subtitle render of the sample clip through the dialog.
    await page.locator('[data-testid="muse-select-all"]').check()
    await page.locator('[data-testid="muse-selection"]').waitFor()
    await page.screenshot({ path: join(shots, '08-selection.png') })
    await page.click('[data-testid="muse-batch-subtitle"]')
    await page.locator('.ssd').waitFor()
    await page.locator('.ssd textarea, .ssd input[type="text"]').first().fill('Muse 字幕测试')
    await page.screenshot({ path: join(shots, '09-subtitle.png') })
    await page.locator('.ssd .vg-btn--primary').last().click()
    await page.locator('[data-testid="muse-notice"]').getByText('已给 1 条视频添加字幕').waitFor({ timeout: 90000 })
    const done = await page.evaluate(() => window.api.museCreative.getJob('done'))
    assert.ok(done.subtitleVideoPath && done.posterPath, 'subtitled video and cover exist')
    await page.screenshot({ path: join(shots, '10-subtitled.png') })
    await page.locator('[data-testid="muse-job"]').first().getByText('播放').click()
    await page.waitForFunction(() => { const v = document.querySelector('.mv__player'); return v && v.currentTime > 0.5 && !v.error }, null, { timeout: 15000 })
    await page.screenshot({ path: join(shots, '11-player-subtitled.png') })
    await page.getByText('撤销字幕', { exact: true }).last().click()
    await page.locator('[data-testid="muse-notice"]').getByText('已撤销 1 条字幕').waitFor()
    await page.keyboard.press('Escape')
    // To the publish centre: a draft linked to the Muse video.
    await page.locator('[data-testid="muse-job"]').first().getByLabel('选择').check()
    await page.click('[data-testid="muse-publish"]')
    await page.waitForFunction(() => window.location.hash.startsWith('#/publish'))
    const drafts = await page.evaluate(() => window.api.tiktokPublisher.listTasks())
    assert.equal(drafts.filter((item) => item.sourceRef === 'muse:done' && item.state === 'draft').length, 1)
    await page.waitForTimeout(1500)
    await page.screenshot({ path: join(shots, '15-publish.png') })
    // The publish centre can also pick Muse videos by itself.
    await page.getByText('从素材库选择').first().click()
    await page.locator('.publisher-source-tabs').getByText('Muse创意室').click()
    await page.screenshot({ path: join(shots, '16-picker.png') })
    const pool = await page.evaluate(() => window.api.mixPool.syncLinked('p-e2e'))
    assert.equal(pool.scan.muse_studio, 1, 'mix pool takes in the Muse video')
    const content = await page.evaluate(() => window.api.contentHub.listContent({ line: 'muse' }))
    assert.ok(content.some((item) => item.ref === 'muse:done'))
    await page.evaluate(() => { window.location.hash = '#/plugins/muse-creative-studio?job=done' })
    await page.locator('[data-testid="muse-detail"]').waitFor()
    await page.keyboard.press('Escape')
    await page.locator('[data-testid="muse-job"]').first().getByLabel('详情与日志').click()
    await page.click('[data-testid="muse-detail-logs"]')
    await page.locator('[data-testid="muse-detail"]').getByText('已撤销字幕').waitFor()
    await page.screenshot({ path: join(shots, '12-detail.png') })
    await page.keyboard.press('Escape')
    await page.getByLabel('列表', { exact: true }).click()
    await page.screenshot({ path: join(shots, '06-list.png') })
    await page.click('[data-testid="muse-open-accounts"]')
    await page.click('[data-testid="muse-add"]')
    await page.fill('[data-testid="muse-name"]', 'muse-01')
    await page.fill('[data-testid="muse-proxy"]', 'https://u:top-secret@127.0.0.1:1')
    await page.click('[data-testid="muse-save"]')
    const formError = await page.locator('[data-testid="muse-error"]').innerText()
    assert.ok(formError.includes('只支持 HTTP 和 SOCKS5') && !formError.includes('top-secret'))
    await page.screenshot({ path: join(shots, '02-form-error.png') })

    await page.fill('[data-testid="muse-proxy"]', 'http://u:top-secret@127.0.0.1:1')
    await page.click('[data-testid="muse-save"]')
    const row = page.locator('[data-testid="muse-account"]')
    await row.getByText('代理连接失败，未使用本机网络').waitFor({ timeout: 30000 })
    assert.ok(!(await page.content()).includes('top-secret'), 'password never rendered')
    await page.locator('[data-testid="muse-toggle"]').click()
    await page.locator('[data-testid="muse-error"]').waitFor()
    await page.screenshot({ path: join(shots, '03-proxy-error.png') })

    // Quota can only be asked for a signed-in account.
    assert.equal(await page.locator('[data-testid="muse-query-quota"]').isDisabled(), true)
    await page.locator('[data-testid="muse-account"]').getByText('额度未查询').waitFor()

    // English and Vietnamese pages: nothing Chinese left in the account dialog, create tab and toolbar.
    for (const [locale, title] of [['en-US', 'Accounts'], ['vi-VN', 'Quản lý tài khoản']]) {
      await page.evaluate((value) => { const app = document.querySelector('#app').__vue_app__; app.config.globalProperties.$i18n.locale = value }, locale)
      await page.locator('[data-testid="muse-accounts"]').getByText(title, { exact: true }).first().waitFor()
      const dialog = await page.locator('[data-testid="muse-accounts"]').innerText()
      assert.ok(!/[\u4e00-\u9fff]/.test(dialog), dialog.match(/.*[\u4e00-\u9fff].*/)?.[0])
      await page.screenshot({ path: join(shots, `17-${locale}.png`) })
    }
    await page.evaluate(() => { document.querySelector('#app').__vue_app__.config.globalProperties.$i18n.locale = 'zh-CN' })

    const stored = await readFile(join(dataDir, 'db', 'muse-creative-studio-accounts.json'), 'utf8')
    assert.ok(!stored.includes('top-secret'), 'proxy password encrypted on disk')
    await app.close()

    ;({ app, page } = await launch())
    await page.click('[data-testid="muse-open-accounts"]')
    await page.locator('[data-testid="muse-account"]').getByText('muse-01').waitFor()
    await page.locator('[data-testid="muse-test"]').click()
    await page.locator('[data-testid="muse-test"] .vg-spin').waitFor({ state: 'detached', timeout: 30000 })
    assert.equal(await page.locator('[data-testid="muse-error"]').count(), 0, 'saved proxy can still be decrypted after a restart')
    assert.deepEqual(errors, [])
    console.log('muse-creative-accounts e2e passed', shots)
  } finally {
    await app.close().catch(() => undefined)
  }
}

main().catch((error) => { console.error(error); process.exit(1) })
