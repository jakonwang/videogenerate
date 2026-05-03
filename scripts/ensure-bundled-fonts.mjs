/**
 * 拉取可被 libass/FreeType 稳定加载的字体文件到 resources/fonts。
 *
 * 背景：
 * - 部分 Windows 环境的 ffmpeg-static / libass 组合无法加载 woff2（会报 Error opening memory font '*.woff2' 并直接失败）。
 * - 因此这里优先同步 OTF/TTF（更通用），避免字幕烧录失败。
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

/** 选择“能覆盖中/英/越/泰 + 粗斜体展示”的最小集合 */
const FONT_FILES = [
  // 中文（SC）：OTF 体积适中，libass 更稳
  {
    name: 'NotoSansSC-Regular.otf',
    // Noto CJK：使用 Subset OTF（体积更小且 libass 更稳）
    url: 'https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/SubsetOTF/SC/NotoSansSC-Regular.otf',
  },
  // 英文/拉丁/越南语：TTF
  {
    name: 'NotoSans-Regular.ttf',
    url: 'https://raw.githubusercontent.com/notofonts/notofonts.github.io/main/fonts/NotoSans/unhinted/ttf/NotoSans-Regular.ttf',
  },
  // 泰文：TTF
  {
    name: 'NotoSansThai-Regular.ttf',
    url: 'https://raw.githubusercontent.com/notofonts/notofonts.github.io/main/fonts/NotoSansThai/unhinted/ttf/NotoSansThai-Regular.ttf',
  },
  // 展示体（圆润标题 + 斜体）：variable ttf
  {
    name: 'Nunito[wght].ttf',
    url: 'https://static.oeh.ac.at/fonts/ofl/nunito/Nunito%5Bwght%5D.ttf',
  },
  {
    name: 'Nunito-Italic[wght].ttf',
    url: 'https://static.oeh.ac.at/fonts/ofl/nunito/Nunito-Italic%5Bwght%5D.ttf',
  },
]

function safeUnlink(p) {
  try {
    fs.unlinkSync(p)
  } catch {
    // ignore
  }
}

function cleanFontsDir() {
  fs.mkdirSync(fontsDir, { recursive: true })
  const allowNames = new Set(FONT_FILES.map((x) => x.name).concat(['.videogenerate-fonts-ready']))
  const entries = fs.readdirSync(fontsDir)
  let removed = 0
  for (const name of entries) {
    if (name.startsWith('.')) continue
    if (allowNames.has(name)) continue
    const lower = name.toLowerCase()
    // 清理旧的 woff2 子集与杂项（README 等），避免 libass 扫描时报错
    if (lower.endsWith('.woff2') || lower.endsWith('.md') || lower.endsWith('.txt') || lower.endsWith('.css')) {
      safeUnlink(path.join(fontsDir, name))
      removed++
      continue
    }
    // 非目标字体文件也移除，确保目录干净可控
    if (!lower.endsWith('.otf') && !lower.endsWith('.ttf') && !lower.endsWith('.ttc')) {
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
          file.on('finish', () => file.close((e) => (e ? reject(e) : resolve())))
        },
      )
      .on('error', (err) => {
        try {
          file.close()
          fs.unlink(dest, () => {})
        } catch {
          // ignore
        }
        reject(err)
      })
  })
}

async function main() {
  cleanFontsDir()
  console.log('[fonts] syncing OTF/TTF into:', fontsDir)
  let n = 0
  for (const f of FONT_FILES) {
    const dest = path.join(fontsDir, f.name)
    let skip = false
    try {
      const st = fs.statSync(dest)
      skip = st.size > 32 * 1024
    } catch {
      skip = false
    }
    if (!skip) {
      console.log('[fonts] download:', f.name)
      await downloadFile(f.url, dest)
    }
    n++
  }
  fs.writeFileSync(path.join(fontsDir, '.videogenerate-fonts-ready'), `ok\n${n}\n`, 'utf8')
  console.log('[fonts] done:', fontsDir, `(${n} files)`)
}

main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
