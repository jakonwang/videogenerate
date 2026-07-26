/** Copy runtime resources into the Electron main-process output directory. */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')

function copyDir(label, rel) {
  const src = path.join(root, 'resources', rel)
  const dst = path.join(root, 'out', 'main', 'resources', rel)
  if (!fs.existsSync(src)) {
    console.warn(`[copy-${label}] source directory not found`, src)
    return
  }
  fs.mkdirSync(path.dirname(dst), { recursive: true })
  fs.cpSync(src, dst, { recursive: true })
  console.log(`[copy-${label}]`, src, '->', dst)
}

function copyFonts() {
  const src = path.join(root, 'resources', 'fonts')
  const dst = path.join(root, 'out', 'main', 'resources', 'fonts')
  if (!fs.existsSync(src)) {
    console.warn('[copy-fonts] source directory not found', src)
    return
  }

  fs.rmSync(dst, { recursive: true, force: true })
  fs.mkdirSync(dst, { recursive: true })
  const allowedExtensions = new Set(['.ttf', '.otf', '.ttc'])
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (!entry.isFile()) continue
    const isMarker = entry.name === '.videogenerate-fonts-ready'
    const isFont = allowedExtensions.has(path.extname(entry.name).toLowerCase())
    if (!isMarker && !isFont) continue
    fs.copyFileSync(path.join(src, entry.name), path.join(dst, entry.name))
  }
  console.log('[copy-fonts]', src, '->', dst)
}

copyFonts()
copyDir('luts', 'luts')
copyDir('stickers', 'stickers')
