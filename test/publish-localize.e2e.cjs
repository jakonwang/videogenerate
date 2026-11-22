/**
 * Multi-language versions in the built Electron app, end to end through the real network path:
 * a local mock AI server answers speech recognition (/v1/audio/transcriptions) and chat (/v1/chat/completions),
 * voices come from the real Edge TTS, ffmpeg renders the localized video.
 * Usage: VG_LICENSE_MODE=off npx electron-vite build && node test/publish-localize.e2e.cjs [screenshotDir]
 */
const assert = require('node:assert/strict')
const http = require('node:http')
const { execFileSync } = require('node:child_process')
const { mkdtemp, mkdir } = require('node:fs/promises')
const { existsSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { _electron: electron } = require('playwright')

function startMockAi() {
  const calls = { asr: 0, chat: 0 }
  const server = http.createServer((req, res) => {
    let body = ''
    req.on('data', (chunk) => { body += chunk })
    req.on('end', () => {
      res.setHeader('Content-Type', 'application/json')
      if (req.url.endsWith('/v1/audio/transcriptions')) {
        calls.asr += 1
        return res.end(JSON.stringify({ language: 'zh', segments: [{ id: 0, start: 0.3, end: 2.2, text: '这款珍珠耳环很百搭' }, { id: 1, start: 2.8, end: 4.8, text: '今天下单还送礼盒' }] }))
      }
      if (req.url.endsWith('/v1/chat/completions')) {
        calls.chat += 1
        const thai = /Thai/.test(body)
        const content = JSON.stringify(thai
          ? { lines: ['ต่างหูมุกคู่นี้ใส่ได้ทุกลุค', 'สั่งวันนี้แถมกล่องของขวัญ'], title: 'ต่างหูมุกใส่ได้ทุกวัน', description: 'สวยมาก #ต่างหู #ของขวัญ' }
          : { lines: ['Đôi bông tai ngọc trai này phối đồ nào cũng đẹp', 'Đặt hôm nay tặng kèm hộp quà'], title: 'Bông tai ngọc trai đeo mỗi ngày', description: 'Xinh lắm #bongtai #quatang' })
        return res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content } }] }))
      }
      res.statusCode = 404
      res.end('{}')
    })
  })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, calls, port: server.address().port })))
}

async function main() {
  const repo = join(__dirname, '..')
  const root = await mkdtemp(join(tmpdir(), 'videogenerate-localize-'))
  const dataDir = join(root, 'data')
  const shots = process.argv[2] || join(repo, 'test-artifacts', 'publish-localize')
  await mkdir(shots, { recursive: true })
  await mkdir(dataDir, { recursive: true })
  const ffmpeg = require('ffmpeg-static')
  const video = join(root, 'pearl-earrings.mp4')
  // A clip with a burned-in Chinese subtitle band at the bottom (to check it gets blurred).
  execFileSync(ffmpeg, ['-y', '-f', 'lavfi', '-i', 'testsrc=size=540x960:rate=30:duration=6', '-f', 'lavfi', '-i', 'sine=frequency=300:duration=6', '-shortest',
    '-vf', 'drawbox=x=40:y=700:w=460:h=60:color=yellow@1:t=fill', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', video], { stdio: 'ignore' })
  const ai = await startMockAi()
  const env = { ...process.env, VIDEOGENERATE_USER_DATA_DIR: root, VIDEOGENERATE_DATA_DIR: dataDir }
  const errors = []
  let app
  try {
    app = await electron.launch({ args: ['.'], cwd: repo, env })
    const page = await app.firstWindow()
    await app.evaluate(({ ipcMain }) => {
      const stub = (channel, fn) => { ipcMain.removeHandler(channel); ipcMain.handle(channel, fn) }
      stub('plugin:tiktokPublisher:credentialStatus', async () => ({ configured: true, masked: 'test...stub' }))
      stub('plugin:tiktokPublisher:connections', async () => [{ uid: 'acc-vn', name: '越南号' }])
    })
    page.setDefaultTimeout(30_000)
    page.on('pageerror', (error) => errors.push(String(error)))
    await page.setViewportSize({ width: 1480, height: 920 }).catch(() => undefined)
    await page.waitForLoadState('domcontentloaded')
    await page.evaluate(async ({ port }) => {
      await window.api.clone.setModelCredentials({ chatProviderPrimary: 'grsai', grsaiApiKey: 'test-key', grsaiHost: `http://127.0.0.1:${port}`, grsaiAnalysisModel: 'mock-chat' })
    }, { port: ai.port })
    await page.evaluate(async (path) => {
      await window.api.tiktokPublisher.createDraftsFromPaths({ paths: [path], defaults: { videoTitle: '珍珠耳环每天都能戴', description: '好看 #耳环', connectionUid: 'acc-cn', connectionName: '国内号' } })
    }, video)
    await page.evaluate(() => { window.location.hash = '#/publish' })
    await page.locator('.pub-row:not(.pub-row--head)').first().waitFor()

    await page.locator('.pub-row--head input[type="checkbox"]').check()
    await page.locator('[data-testid="publish-localize-open"]').click()
    const dialog = page.locator('[data-testid="publish-localize"]')
    await dialog.waitFor()
    await dialog.locator('[data-testid="localize-lang-th"]').click()
    await page.screenshot({ path: join(shots, '01-localize-dialog.png') })
    await dialog.locator('[data-testid="localize-confirm"]').click()
    await dialog.waitFor({ state: 'detached' })
    await page.locator('[data-testid="matrix-notice"]').waitFor()
    assert.match(await page.locator('[data-testid="matrix-notice"]').innerText(), /2 条外语版（越南语、泰语）/)
    await page.locator('.pub-tab', { hasText: '全部' }).click()
    await page.locator('.pub-localize').first().waitFor()
    await page.screenshot({ path: join(shots, '02-generating.png') })

    const deadline = Date.now() + 240_000
    let tasks = []
    while (Date.now() < deadline) {
      tasks = (await page.evaluate(() => window.api.tiktokPublisher.listTasks())).filter((t) => t.localize)
      if (tasks.length === 2 && tasks.every((t) => ['ready', 'failed'].includes(t.localize.status))) break
      await page.waitForTimeout(2000)
    }
    assert.equal(tasks.length, 2)
    for (const task of tasks) assert.equal(task.localize.status, 'ready', task.localize.error)
    assert.equal(ai.calls.asr, 1, 'speech recognised once for both languages')
    const vi = tasks.find((t) => t.localize.language === 'vi')
    const th = tasks.find((t) => t.localize.language === 'th')
    assert.equal(vi.videoTitle, 'Bông tai ngọc trai đeo mỗi ngày')
    assert.equal(th.videoTitle, 'ต่างหูมุกใส่ได้ทุกวัน')
    assert.ok(!vi.connectionUid, 'account left empty for the target market')
    for (const task of tasks) {
      assert.ok(existsSync(task.sourceVideoPath) && task.sourceVideoPath !== video)
      const info = execFileSync(require('ffprobe-static').path, ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type', '-of', 'json', task.sourceVideoPath], { encoding: 'utf8' })
      const parsed = JSON.parse(info)
      assert.ok(Math.abs(Number(parsed.format.duration) - 6) < 0.3, `duration kept: ${parsed.format.duration}`)
      assert.ok(parsed.streams.some((s) => s.codec_type === 'audio'))
      // Frame at 1s for the screenshot / visual check of subtitles over the blurred band.
      execFileSync(ffmpeg, ['-y', '-ss', '1.2', '-i', task.sourceVideoPath, '-frames:v', '1', join(shots, `frame-${task.localize.language}.png`)], { stdio: 'ignore' })
    }
    await page.evaluate(() => { window.location.hash = '#/' })
    await page.evaluate(() => { window.location.hash = '#/publish' })
    await page.locator('.pub-tab', { hasText: '全部' }).click()
    await page.locator('.pub-localize.is-ready').nth(1).waitFor()
    await page.screenshot({ path: join(shots, '03-ready.png') })

    assert.deepEqual(errors, [])
    console.log('publish-localize e2e passed; screenshots in', shots)
  } finally {
    await app?.close().catch(() => undefined)
    ai.server.close()
  }
}

main().catch((error) => { console.error(error); process.exit(1) })
