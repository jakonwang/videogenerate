/**
 * Visits every route of the built Electron app, records page title / headings,
 * console errors and failed IPC calls, and saves a screenshot per page.
 * Usage: VG_LICENSE_MODE=off npx electron-vite build && node test/ui-route-sweep.e2e.cjs <outDir> [locale]
 */
const { mkdtemp, mkdir, writeFile } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { _electron: electron } = require('playwright')

const ROUTES = [
  '/home', '/inbox', '/product-research', '/clone', '/plugins/tiktok-creative-studio', '/plugins/live-photo-generator',
  '/production', '/production/create', '/production/tasks', '/publish', '/insights', '/products', '/models', '/asset-library',
  '/templates', '/live-slicer', '/plugins', '/plugins?tab=installed', '/plugins/product-replacement', '/plugins/product-watermark',
  '/plugins/product-image-materials', '/plugins/video-parser-download', '/plugins/video-batch-subtitle', '/plugins/video-batch-watermark',
  '/plugins/tiktok-listing-helper', '/plugins/tiktok-creator-hub', '/plugins/tiktok-gmv-max-optimizer', '/plugins/dianxiaomi-inventory',
  '/settings', '/settings?section=platforms', '/settings?section=capabilities', '/settings?section=storage-management',
  '/settings?section=qiniu', '/settings?section=brand', '/settings?section=automation', '/billing',
]

async function main() {
  const out = process.argv[2]
  const locale = process.argv[3] || 'zh-CN'
  await mkdir(out, { recursive: true })
  const root = await mkdtemp(join(tmpdir(), 'videogenerate-sweep-'))
  const app = await electron.launch({
    args: ['.'],
    cwd: join(__dirname, '..'),
    env: { ...process.env, VIDEOGENERATE_USER_DATA_DIR: root, VIDEOGENERATE_DATA_DIR: join(root, 'data') },
  })
  const page = await app.firstWindow()
  let current = ''
  const errors = []
  page.on('pageerror', (error) => errors.push({ route: current, text: `pageerror: ${error.message}` }))
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      const text = message.text()
      if (/Electron Security Warning|DevTools|Autofill|Download the Vue Devtools/i.test(text)) return
      errors.push({ route: current, text: `${message.type()}: ${text.slice(0, 400)}` })
    }
  })
  await page.waitForLoadState('domcontentloaded')
  await page.evaluate((value) => localStorage.setItem('videogenerate:ui-locale', value), locale).catch(() => undefined)
  await page.waitForTimeout(1500)
  const report = []
  for (const route of ROUTES) {
    current = route
    await page.evaluate((hash) => { window.location.hash = `#${hash}` }, route)
    await page.waitForTimeout(2200)
    const info = await page.evaluate(() => {
      const pick = (selector) => Array.from(document.querySelectorAll(selector)).map((node) => node.textContent.trim().replace(/\s+/g, ' ')).filter(Boolean).slice(0, 6)
      const active = document.querySelector('.vg-nav__item.is-active .vg-nav__label')
      return {
        hash: window.location.hash,
        navActive: active ? active.textContent.trim() : '',
        h1: pick('main h1, .ds-workspace h1'),
        h2: pick('.ds-workspace h2, .ds-workspace .vg-card__title').slice(0, 4),
        overflowX: document.querySelector('.ds-workspace') ? document.querySelector('.ds-workspace').scrollWidth > document.querySelector('.ds-workspace').clientWidth + 2 : false,
        emptyBody: (document.querySelector('.ds-workspace')?.innerText || '').trim().length < 10,
        doubleBorders: Array.from(document.querySelectorAll('.ds-workspace input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]), .ds-workspace select')).filter((el) => {
          const box = el.getBoundingClientRect()
          if (!box.width || !box.height) return false
          const own = getComputedStyle(el)
          if (parseFloat(own.borderTopWidth) === 0) return false
          const parent = el.parentElement
          if (!parent) return false
          const ps = getComputedStyle(parent)
          const pb = parent.getBoundingClientRect()
          return parseFloat(ps.borderTopWidth) > 0 && pb.height - box.height < 24 && pb.width - box.width < 80
        }).map((el) => (el.getAttribute('placeholder') || el.className || el.tagName).slice(0, 40)).slice(0, 5),
        rawKeys: (document.querySelector('.ds-workspace')?.innerText || '').match(/\b(autoUi|ai|nav|settings|plugins|cloud|cloneUi)\.[a-zA-Z0-9_.]{3,}/g) || [],
      }
    })
    report.push({ route, ...info })
    const name = route.replace(/[/?=&]+/g, '_').replace(/^_/, '') || 'root'
    await page.screenshot({ path: join(out, `${name}.png`) })
  }
  const sidebar = await page.locator('[data-testid="app-sidebar"]').innerText()
  const titlebar = await page.locator('.vg-titlebar').innerText()
  await writeFile(join(out, 'report.json'), JSON.stringify({ sidebar, titlebar, report, errors }, null, 2), 'utf8')
  console.log(JSON.stringify({ sidebar: sidebar.split('\n').filter(Boolean), titlebar: titlebar.split('\n').filter(Boolean), report, errors }, null, 1))
  await app.close()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
