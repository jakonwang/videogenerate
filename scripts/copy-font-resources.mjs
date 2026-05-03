/**
 * 将 resources 下的运行时资源复制到 out/main/resources/*，供主进程 __dirname 旁加载。
 * - fonts：字幕字体（必需）
 * - luts：3D LUT（可选）
 * - stickers：彩色贴纸（可选）
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')

function copyDir(label, rel) {
  const src = path.join(root, 'resources', rel)
  const dst = path.join(root, 'out', 'main', 'resources', rel)
  if (!fs.existsSync(src)) {
    console.warn(`[copy-${label}] 跳过：未找到`, src)
    return
  }
  fs.mkdirSync(path.dirname(dst), { recursive: true })
  fs.cpSync(src, dst, { recursive: true })
  console.log(`[copy-${label}]`, src, '->', dst)
}

// fonts：若不存在则提示但不阻断（开发阶段也可能依赖系统字体）
copyDir('fonts', 'fonts')
copyDir('luts', 'luts')
copyDir('stickers', 'stickers')
