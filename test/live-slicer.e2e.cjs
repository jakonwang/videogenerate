const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const { mkdtemp, mkdir, readdir, rm } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { _electron: electron } = require('playwright')
const ffmpegPath = require('ffmpeg-static')
const ffprobePath = require('ffprobe-static').path

/**
 * Run against a build without the cloud login gate:
 *   VG_LICENSE_MODE=off npx electron-vite build && node test/live-slicer.e2e.cjs
 *
 * 90 s landscape test recording: quiet talk with three loud bursts (20-35 s, 50-58 s, 70-80 s)
 * and colour changes, so the highlight detector has something real to find.
 */
function makeVideo(path) {
  const loud = "between(t,20,35)+between(t,50,58)+between(t,70,80)"
  execFileSync(ffmpegPath, [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=25:duration=90',
    '-f', 'lavfi', '-i', 'sine=frequency=330:sample_rate=44100:duration=90',
    '-filter_complex',
    `[0:v]hue=h='if(gte(t,20)*lt(t,35),120,if(gte(t,50)*lt(t,58),240,0))'[v];[1:a]volume='if(${loud},1.0,0.04)':eval=frame[a]`,
    '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-preset', 'ultrafast', '-g', '25', '-c:a', 'aac', path,
  ])
}

function probeSize(path) {
  const out = execFileSync(ffprobePath, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', path]).toString().trim()
  const [w, h] = out.split(',').map(Number)
  return { w, h }
}

async function main() {
  const projectRoot = join(__dirname, '..')
  const runtimeRoot = await mkdtemp(join(tmpdir(), 'videogenerate-live-slicer-'))
  const dataDir = join(runtimeRoot, 'data')
  const outDir = join(runtimeRoot, 'out')
  const videoPath = join(runtimeRoot, 'live recording.mp4')
  const shots = {
    empty: join(tmpdir(), 'live-slicer-empty.png'),
    analyzed: join(tmpdir(), 'live-slicer-analyzed.png'),
    exported: join(tmpdir(), 'live-slicer-exported.png'),
  }
  let app
  try {
    await mkdir(dataDir, { recursive: true })
    makeVideo(videoPath)

    app = await electron.launch({
      args: ['.'],
      cwd: projectRoot,
      env: { ...process.env, VIDEOGENERATE_USER_DATA_DIR: runtimeRoot, VIDEOGENERATE_DATA_DIR: dataDir },
    })
    const page = await app.firstWindow()
    page.on('console', (m) => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 300)) })
    page.on('pageerror', (e) => console.log('[pageerror]', e.message))
    globalThis.__page = page
    await page.waitForLoadState('domcontentloaded')
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1600, 1000))

    // empty state
    await page.evaluate(() => { location.hash = '#/live-slicer' })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.locator('[data-testid="live-slicer-drop"]').waitFor({ timeout: 30000 })
    await page.locator('[data-testid="app-locale-select"]').selectOption('zh-CN')
    await page.screenshot({ path: shots.empty })

    // open via deep link
    await page.evaluate((p) => { location.hash = `#/live-slicer?path=${encodeURIComponent(p)}` }, videoPath)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.locator('[data-testid="live-slicer-timeline"]').waitFor({ timeout: 30000 })

    // highlights: analyze + generate
    await page.locator('[data-testid="live-slicer-mode-highlight"]').click()
    await page.locator('[data-testid="live-slicer-generate"]').click()
    await page.locator('.ls-row').first().waitFor({ timeout: 120000 })
    const rows = await page.locator('.ls-row').count()
    const ranges = await page.locator('.ls-row__sub').allInnerTexts()
    console.log('highlight clips:', rows, ranges.map((r) => r.split('\n')[0]))
    assert.ok(rows >= 2, `expected >=2 highlight clips, got ${rows}`)
    await page.waitForTimeout(1500) // thumbnails
    await page.screenshot({ path: shots.analyzed })

    // the loud bursts should be covered by the detected clips
    const covered = await page.evaluate(() => {
      const raw = JSON.parse(localStorage.getItem(Object.keys(localStorage).find((k) => k.startsWith('vg.liveSlicer.project.v1:'))))
      const segs = raw.segments
      return [27, 54, 75].map((t) => segs.some((s) => s.start <= t && s.end >= t))
    })
    console.log('bursts covered:', covered)
    assert.ok(covered.filter(Boolean).length >= 2, 'highlights should cover the loud bursts')

    // manual marking with keyboard
    const before = rows
    await page.locator('[data-testid="live-slicer-mode-manual"]').click()
    await page.evaluate(() => document.activeElement && document.activeElement.blur())
    await page.locator('.ls-tl__ruler').click({ position: { x: 20, y: 10 } })
    await page.keyboard.press('i')
    await page.keyboard.press('Shift+ArrowRight')
    await page.keyboard.press('Shift+ArrowRight')
    await page.keyboard.press('o')
    await page.keyboard.press('Enter')
    await page.waitForTimeout(300)
    assert.equal(await page.locator('.ls-row').count(), before + 1, 'I/O/Enter should add a manual clip')
    await page.locator('[data-testid="live-slicer-editor"]').waitFor()

    // export: precise, 9:16 blur, 720p
    await page.locator('[data-testid="live-slicer-export"] .ls-aspects button').nth(2).click()
    await page.locator('[data-testid="live-slicer-export"] select').first().selectOption('720')
    const dirInput = page.locator('[data-testid="live-slicer-export"] .ls-dir input')
    await dirInput.fill(outDir)
    await page.locator('[data-testid="live-slicer-export-btn"]').click()
    await page.locator('.ls-result').waitFor({ timeout: 240000 })
    await page.screenshot({ path: shots.exported })

    const sub = (await readdir(outDir))[0]
    const files = (await readdir(join(outDir, sub))).sort()
    console.log('exported:', sub, files)
    const clips = files.filter((f) => f.endsWith('.mp4'))
    assert.equal(clips.length, before + 1)
    assert.ok(files.includes('clips.txt'))
    const size = probeSize(join(outDir, sub, clips[0]))
    console.log('clip size:', size)
    assert.deepEqual(size, { w: 720, h: 1280 })

    console.log('screenshots:', shots)
    console.log('live slicer e2e passed')
  } catch (e) {
    await globalThis.__page?.screenshot({ path: join(tmpdir(), 'live-slicer-failure.png') }).catch(() => {})
    throw e
  } finally {
    if (app) await app.close().catch(() => {})
    await rm(runtimeRoot, { recursive: true, force: true }).catch(() => {})
  }
}

main().catch(async (e) => {
  console.error(e)
  process.exit(1)
})
