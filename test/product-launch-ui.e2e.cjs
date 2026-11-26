/**
 * Drives the built Electron app through 一键上新: sidebar entry → new-launch form → a launch record.
 * The temp data dir has no AI credentials, so the image step fails right away (no model is called)
 * and the progress page shows the failed step with retry / skip.
 * Usage: VG_LICENSE_MODE=off npx electron-vite build && node test/product-launch-ui.e2e.cjs [screenshotDir]
 */
const assert = require('node:assert/strict')
const { mkdtemp, mkdir, rm, writeFile } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { _electron: electron } = require('playwright')

// 1×1 white png
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==', 'base64')

async function main() {
  const root = await mkdtemp(join(tmpdir(), 'videogenerate-launch-ui-'))
  const dataDir = join(root, 'data')
  const shots = process.argv[2] || join(root, 'shots')
  await mkdir(shots, { recursive: true })
  const image = join(root, '帆布托特包.png')
  await writeFile(image, PNG)
  // A finished launch (review state) so the result panels can be checked without any AI call.
  const shots4 = await Promise.all([1, 2, 3, 4, 5].map(async (n) => { const file = join(root, `listing-${n}.png`); await writeFile(file, PNG); return file }))
  const at = Date.now()
  const done = (extra = {}) => ({ status: 'done', updatedAt: at, ...extra })
  await mkdir(join(dataDir, 'db'), { recursive: true })
  await writeFile(join(dataDir, 'db', 'product-launch.json'), JSON.stringify({ schemaVersion: 1, jobs: [{
    id: 'seed-job', title: '纯棉宽松T恤', markets: ['VN', 'TH'], options: { images: true, copy: true, videos: true, videoCount: 3, titleCount: 2 }, publishMode: 'draft', createdAt: at - 60000, updatedAt: at,
    items: [{
      id: 'seed-item', source: 'upload', productId: 'p-seed', productName: '纯棉宽松T恤', category: 'clothes', sourceImagePath: image,
      stages: { product: done(), images: done(), copy: done({ done: 2, total: 2 }), videos: done({ done: 1, total: 3 }), review: done() },
      images: shots4,
      copy: {
        VN: { titles: ['Áo thun nữ cotton form rộng, thoáng mát, phong cách Hàn Quốc', 'Áo phông cotton basic dễ phối đồ đi học đi làm'], description: '• Chất cotton mềm, thoáng\n• Form rộng dễ mặc', flags: [] },
        TH: { titles: ['เสื้อยืดผ้าคอตตอนทรงหลวม ดีที่สุด'], description: '• ผ้านุ่ม ใส่สบาย', flags: ['ดีที่สุด'] },
      },
      creativeTaskId: 'seed-task',
      videos: [
        { shotId: 'v1', style: 'hero', status: 'failed', error: '需要到 tk创意室 手动处理' },
        { shotId: 'v2', style: 'detail', status: 'running' },
        { shotId: 'v3', style: 'inUse', status: 'failed', error: '生成失败' },
      ],
    }],
  }] }))
  const errors = []
  let app
  try {
    app = await electron.launch({
      args: ['.'],
      cwd: join(__dirname, '..'),
      env: { ...process.env, VIDEOGENERATE_USER_DATA_DIR: root, VIDEOGENERATE_DATA_DIR: dataDir },
    })
    const page = await app.firstWindow()
    page.on('pageerror', (error) => errors.push(String(error)))
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
    await page.setViewportSize({ width: 1480, height: 1000 }).catch(() => undefined)
    await page.waitForLoadState('domcontentloaded')
    await page.evaluate(() => { window.location.hash = '#/home' })

    // Sidebar entry opens the page.
    await page.getByText('一键上新', { exact: true }).first().click({ timeout: 30000 })
    await page.waitForSelector('[data-testid="product-launch"]')
    const form = await page.locator('[data-testid="product-launch"]').innerText()
    for (const label of ['一键上新', '选商品', '要 AI 做什么', '卖到哪些国家', '做好以后怎么发', '这次会做出', '开始上新', '越南', '泰国', '先存草稿']) {
      assert.ok(form.includes(label), `form shows ${label}`)
    }
    assert.ok(!/ai\.launch\./.test(form), 'no untranslated keys on the form')
    assert.ok(await page.getByRole('button', { name: '开始上新' }).isDisabled(), 'start is disabled without products')
    await page.getByRole('button', { name: /泰国/ }).click()
    // Video engine: tk创意室 by default, 图生视频 on click.
    assert.equal(await page.getByRole('radio', { name: 'tk创意室' }).getAttribute('aria-checked'), 'true')
    await page.getByRole('radio', { name: '图生视频' }).click()
    assert.equal(await page.getByRole('radio', { name: '图生视频' }).getAttribute('aria-checked'), 'true')
    assert.ok((await page.locator('[data-testid="product-launch"]').innerText()).includes('AI 直接出视频'))
    await page.screenshot({ path: join(shots, 'launch-new.png'), fullPage: true })

    // A launch record (created through the API: the file picker is a native dialog).
    const job = await page.evaluate((path) => window.api.productLaunch.create({ markets: ['VN', 'TH'], options: { videoCount: 3, titleCount: 2 }, items: [{ source: 'upload', imagePath: path, price: '199000 ₫' }] }), image)
    await page.evaluate((id) => { window.location.hash = `#/launch?job=${id}` }, job.id)
    await page.waitForSelector('text=只重跑这一步', { timeout: 30000 })
    const progress = await page.locator('[data-testid="product-launch"]').innerText()
    for (const label of ['帆布托特包', '建档', '商品图', '标题详情', '视频', '审核', '出错了', '跳过这一步']) {
      assert.ok(progress.includes(label), `progress shows ${label}`)
    }
    assert.ok(!/ai\.launch\./.test(progress), 'no untranslated keys on progress')
    await page.screenshot({ path: join(shots, 'launch-progress.png'), fullPage: true })

    // History tab lists it.
    await page.getByRole('button', { name: '返回' }).click()
    await page.waitForSelector('text=上新记录')
    assert.ok((await page.locator('[data-testid="product-launch"]').innerText()).includes('帆布托特包'))
    await page.screenshot({ path: join(shots, 'launch-history.png'), fullPage: true })

    // Seeded finished launch: copy per country, prohibited-word result, video styles.
    await page.evaluate(() => { window.location.hash = '#/launch?job=seed-job' })
    await page.waitForSelector('text=常见违禁词检查通过', { timeout: 30000 })
    const result = await page.locator('[data-testid="product-launch"]').innerText()
    for (const label of ['Áo thun nữ cotton', '主图推近', '细节特写', '上手使用', '去审核', '等你审核']) {
      assert.ok(result.includes(label), `result shows ${label}`)
    }
    await page.getByRole('button', { name: /TH 泰国/ }).click()
    await page.waitForSelector('[data-testid="launch-banned"]')
    assert.ok((await page.locator('[data-testid="launch-banned"]').innerText()).includes('ดีที่สุด'))
    await page.screenshot({ path: join(shots, 'launch-result.png'), fullPage: true })

    const relevant = errors.filter((error) => !/favicon|ERR_FILE_NOT_FOUND|cloud|net::/i.test(error))
    assert.deepEqual(relevant, [], 'no renderer errors')
    console.log(`product-launch ui ok, screenshots in ${shots}`)
  } finally {
    await app?.close().catch(() => undefined)
    if (!process.argv[2]) await rm(root, { recursive: true, force: true }).catch(() => undefined)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
