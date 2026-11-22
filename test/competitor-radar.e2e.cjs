/**
 * Competitor radar tab (选品 → 竞品雷达) in the built Electron app. TikHub is simulated by replacing
 * fetch in the main process for api.tikhub.io only.
 * Usage: VG_LICENSE_MODE=off npx electron-vite build && node test/competitor-radar.e2e.cjs [screenshotDir]
 */
const assert = require('node:assert/strict')
const { mkdtemp, mkdir } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { _electron: electron } = require('playwright')

async function main() {
  const repo = join(__dirname, '..')
  const root = await mkdtemp(join(tmpdir(), 'videogenerate-radar-'))
  const dataDir = join(root, 'data')
  const shots = process.argv[2] || join(repo, 'test-artifacts', 'competitor-radar')
  await mkdir(shots, { recursive: true })
  await mkdir(dataDir, { recursive: true })
  const env = { ...process.env, VIDEOGENERATE_USER_DATA_DIR: root, VIDEOGENERATE_DATA_DIR: dataDir }
  const errors = []
  let app
  try {
    app = await electron.launch({ args: ['.'], cwd: repo, env })
    const page = await app.firstWindow()
    page.setDefaultTimeout(30_000)
    page.on('pageerror', (error) => errors.push(String(error)))
    await page.setViewportSize({ width: 1480, height: 920 }).catch(() => undefined)
    await page.waitForLoadState('domcontentloaded')
    await app.evaluate(() => {
      const realFetch = globalThis.fetch
      const now = Date.now()
      const posts = (handle, plays) => ({
        code: 200,
        data: { aweme_list: plays.map((play, i) => ({
          aweme_id: `7${String(handle.length)}${String(i).padStart(17, '0')}`,
          desc: i === 3 ? '这对珍珠耳环戴上显脸小 #earrings #pearl' : `日常款 ${i}`,
          create_time: Math.floor((now - (i + 1) * 20 * 3600_000) / 1000),
          statistics: { play_count: play, digg_count: Math.round(play / 15), comment_count: 12, share_count: 4 },
          video: { cover: { url_list: [] } },
          author: { unique_id: handle },
        })) },
      })
      globalThis.__radarCalls = []
      globalThis.fetch = async (input, init) => {
        const url = new URL(typeof input === 'string' ? input : input.url)
        if (url.hostname !== 'api.tikhub.io') return realFetch(input, init)
        globalThis.__radarCalls.push({ path: url.pathname, auth: init?.headers?.Authorization })
        const body = url.pathname.endsWith('fetch_user_profile')
          ? { code: 200, data: { userInfo: { user: { secUid: `SEC-${url.searchParams.get('uniqueId')}` }, stats: { followerCount: 48000 } } } }
          : posts(url.searchParams.get('sec_user_id').slice(4), [6200, 5100, 4800, 186000, 5600, 7000])
        return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
    })
    await page.evaluate(async () => { await window.api.clone.setModelCredentials({ tikhubApiKey: 'test-tikhub-key' }) })

    await page.evaluate(() => { window.location.hash = '#/product-research' })
    await page.locator('[data-testid="pr-tab-radar"]').click()
    const panel = page.locator('[data-testid="competitor-radar"]')
    await panel.waitFor()
    await panel.locator('[data-testid="radar-handle"]').fill('https://www.tiktok.com/@pearl.studio?lang=en')
    await panel.locator('[data-testid="radar-add"]').click()
    await panel.locator('[data-testid="radar-competitor-pearl.studio"]').waitFor()
    await panel.locator('[data-testid="radar-handle"]').fill('@gold_rings')
    await panel.locator('[data-testid="radar-add"]').click()
    await panel.locator('[data-testid="radar-competitor-gold_rings"]').waitFor()
    await panel.locator('[data-testid="radar-refresh"]').click()
    const card = panel.locator('[data-testid^="radar-breakout-"]').first()
    await card.waitFor()
    const text = await card.innerText()
    assert.match(text, /186K/)
    assert.match(text, /显脸小/)
    assert.equal(await panel.locator('[data-testid^="radar-breakout-"]').count(), 2, 'one breakout per competitor')
    const calls = await app.evaluate(() => globalThis.__radarCalls)
    assert.ok(calls.every((call) => call.auth === 'Bearer test-tikhub-key'))
    assert.deepEqual([...new Set(calls.map((call) => call.path))].sort(), ['/api/v1/tiktok/app/v3/fetch_user_post_videos', '/api/v1/tiktok/web/fetch_user_profile'])
    assert.match(await panel.locator('[data-testid="radar-competitor-pearl.studio"]').innerText(), /48K 粉/)
    await page.screenshot({ path: join(shots, '01-radar.png') })

    await card.getByRole('button', { name: '忽略' }).click()
    await page.waitForFunction(() => document.querySelectorAll('[data-testid^="radar-breakout-"]').length === 1)
    assert.deepEqual(errors, [])
    console.log('competitor-radar e2e passed; screenshots in', shots)
  } finally {
    await app?.close().catch(() => undefined)
  }
}

main().catch((error) => { console.error(error); process.exit(1) })
