/**
 * 同步可被 libass / FreeType 稳定加载的内置字体到 resources/fonts。
 *
 * 约束：
 * - 只补齐基础字体，不删除仓库里已经存在的 ttf/otf/ttc 内置字体。
 * - 清理历史 woff2 和杂项文件，避免 ffmpeg / libass 扫描异常。
 */
import fs from 'node:fs'
import https from 'node:https'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const fontsDir = path.join(root, 'resources', 'fonts')

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

const FONT_FILES = [
  {
    name: 'NotoSansSC-Regular.otf',
    url: 'https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/SubsetOTF/SC/NotoSansSC-Regular.otf',
  },
  {
    name: 'NotoSans-Regular.ttf',
    url: 'https://raw.githubusercontent.com/notofonts/notofonts.github.io/main/fonts/NotoSans/unhinted/ttf/NotoSans-Regular.ttf',
  },
  {
    name: 'NotoSansThai-Regular.ttf',
    url: 'https://raw.githubusercontent.com/notofonts/notofonts.github.io/main/fonts/NotoSansThai/unhinted/ttf/NotoSansThai-Regular.ttf',
  },
  {
    name: 'Nunito[wght].ttf',
    url: 'https://static.oeh.ac.at/fonts/ofl/nunito/Nunito%5Bwght%5D.ttf',
  },
  {
    name: 'Nunito-Italic[wght].ttf',
    url: 'https://static.oeh.ac.at/fonts/ofl/nunito/Nunito-Italic%5Bwght%5D.ttf',
  },
  {
    name: 'ZCOOLKuaiLe-Regular.ttf',
    url: 'https://raw.githubusercontent.com/google/fonts/main/ofl/zcoolkuaile/ZCOOLKuaiLe-Regular.ttf',
  },
  {
    name: 'MaShanZheng-Regular.ttf',
    url: 'https://raw.githubusercontent.com/google/fonts/main/ofl/mashanzheng/MaShanZheng-Regular.ttf',
  },
  {
    name: 'LongCang-Regular.ttf',
    url: 'https://raw.githubusercontent.com/google/fonts/main/ofl/longcang/LongCang-Regular.ttf',
  },
]

const KEEP_MARKERS = new Set(['.videogenerate-fonts-ready'])

function safeUnlink(filePath) {
  try {
    fs.unlinkSync(filePath)
  } catch {
    // ignore
  }
}

function isStableBundledFontFile(name) {
  const lower = String(name || '').toLowerCase()
  return lower.endsWith('.otf') || lower.endsWith('.ttf') || lower.endsWith('.ttc')
}

function cleanFontsDir() {
  fs.mkdirSync(fontsDir, { recursive: true })
  const entries = fs.readdirSync(fontsDir)
  let removed = 0

  for (const name of entries) {
    if (KEEP_MARKERS.has(name)) continue
    if (isStableBundledFontFile(name)) continue

    const lower = name.toLowerCase()
    if (
      lower.endsWith('.woff2') ||
      lower.endsWith('.md') ||
      lower.endsWith('.txt') ||
      lower.endsWith('.css') ||
      !isStableBundledFontFile(name)
    ) {
      safeUnlink(path.join(fontsDir, name))
      removed++
    }
  }

  if (removed) console.log(`[fonts] cleaned: removed ${removed} stale files`)
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest)
    https
      .get(
        url,
        {
          headers: { 'User-Agent': UA },
        },
        (res) => {
          if (res.statusCode === 301 || res.statusCode === 302) {
            const loc = res.headers.location
            file.close()
            fs.unlink(dest, () => {})
            if (!loc) return reject(new Error('redirect'))
            const next = loc.startsWith('http') ? loc : new URL(loc, url).href
            return resolve(downloadFile(next, dest))
          }
          if (res.statusCode !== 200) {
            file.close()
            fs.unlink(dest, () => {})
            return reject(new Error(`HTTP ${res.statusCode} ${url}`))
          }
          res.pipe(file)
          file.on('finish', () => file.close((error) => (error ? reject(error) : resolve())))
        },
      )
      .on('error', (error) => {
        try {
          file.close()
          fs.unlink(dest, () => {})
        } catch {
          // ignore
        }
        reject(error)
      })
  })
}

async function main() {
  cleanFontsDir()
  console.log('[fonts] syncing OTF/TTF into:', fontsDir)
  let count = 0

  for (const font of FONT_FILES) {
    const dest = path.join(fontsDir, font.name)
    let skip = false
    try {
      const stat = fs.statSync(dest)
      skip = stat.size > 32 * 1024
    } catch {
      skip = false
    }
    if (!skip) {
      console.log('[fonts] download:', font.name)
      await downloadFile(font.url, dest)
    }
    count++
  }

  fs.writeFileSync(path.join(fontsDir, '.videogenerate-fonts-ready'), `ok\n${count}\n`, 'utf8')
  console.log('[fonts] done:', fontsDir, `(${count} base files, custom bundled fonts preserved)`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
