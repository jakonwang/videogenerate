import sharp from 'sharp'
import type { SceneSwapCheck, SceneSwapSize } from '../../../../src/shared/sceneSwap'

/** 换景的图像处理：规范原图、把原图人物贴到新背景、确定性质检。不调用任何 AI。 */

const MAX_EDGE = 2048
const RATIO: Record<Exclude<SceneSwapSize, 'original'>, number> = { '3:4': 3 / 4, '1:1': 1, '9:16': 9 / 16 }

/** 转正、去透明、最长边限制在 2048，存成 PNG（后面都以它为「原图像素」） */
export async function normalizeSource(body: Buffer, output: string) {
  const info = await sharp(body, { limitInputPixels: 80_000_000 })
    .rotate()
    .flatten({ background: '#ffffff' })
    .resize(MAX_EDGE, MAX_EDGE, { fit: 'inside', withoutEnlargement: true })
    .toColourspace('srgb')
    .png()
    .toFile(output)
  return { width: info.width, height: info.height }
}

/** 输出画布：包住整张原图，底边对齐、左右居中（人物像素不缩放） */
export function canvasFor(width: number, height: number, size: SceneSwapSize) {
  const ratio = size === 'original' ? width / height : RATIO[size]
  const w = Math.max(width, Math.round(height * ratio))
  const h = Math.max(height, Math.round(width / ratio))
  return { width: w, height: h, left: Math.floor((w - width) / 2), top: h - height }
}

/** 读蒙版并收紧：边缘向内收约 1 像素（不带出旧背景的白边），去掉淡影，人物内部补满 */
export async function readMask(path: string, width: number, height: number) {
  const raw = await sharp(path).resize(width, height, { fit: 'fill' }).extractChannel(0).raw().toBuffer()
  const mask = Buffer.alloc(raw.length)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x
      let low = raw[i]!
      if (x > 0 && raw[i - 1]! < low) low = raw[i - 1]!
      if (x < width - 1 && raw[i + 1]! < low) low = raw[i + 1]!
      if (y > 0 && raw[i - width]! < low) low = raw[i - width]!
      if (y < height - 1 && raw[i + width]! < low) low = raw[i + width]!
      mask[i] = Math.round(255 * Math.min(1, Math.max(0, (low / 255 - 0.1) / 0.85)))
    }
  }
  return mask
}

export type MaskStats = { coverage: number; soft: number; top: boolean; left: boolean; right: boolean; bottom: boolean; box: { x0: number; y0: number; x1: number; y1: number } }

export function maskStats(mask: Buffer, width: number, height: number): MaskStats {
  let solid = 0
  let soft = 0
  const box = { x0: width, y0: height, x1: 0, y1: 0 }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value = mask[y * width + x]!
      if (value > 25 && value < 230) soft += 1
      if (value < 128) continue
      solid += 1
      if (x < box.x0) box.x0 = x
      if (x > box.x1) box.x1 = x
      if (y < box.y0) box.y0 = y
      if (y > box.y1) box.y1 = y
    }
  }
  const pad = Math.max(2, Math.round(Math.max(width, height) * 0.004))
  return {
    coverage: solid / mask.length,
    soft: solid ? soft / solid : 1,
    top: box.y0 <= pad,
    left: box.x0 <= pad,
    right: box.x1 >= width - 1 - pad,
    bottom: box.y1 >= height - 1 - pad,
    box,
  }
}

/** 边缘一圈像素混着原背景的颜色：用挨着的人物内部颜色替换一部分，避免白边 / 色边；人物内部不动 */
function cleanEdges(rgb: Buffer, mask: Buffer, width: number) {
  const out = Buffer.from(rgb)
  const known = new Uint8Array(mask.length)
  for (let i = 0; i < mask.length; i += 1) known[i] = mask[i]! >= 245 ? 1 : 0
  let pending: number[] = []
  for (let i = 0; i < mask.length; i += 1) if (!known[i] && mask[i]) pending.push(i)
  for (let pass = 0; pass < 6 && pending.length; pass += 1) {
    const filled: number[] = []
    const rest: number[] = []
    for (const i of pending) {
      const x = i % width
      let n = 0
      const sum = [0, 0, 0]
      for (const j of [x ? i - 1 : -1, x < width - 1 ? i + 1 : -1, i - width, i + width]) {
        if (j < 0 || j >= mask.length || !known[j]) continue
        n += 1
        for (let c = 0; c < 3; c += 1) sum[c]! += out[j * 3 + c]!
      }
      if (!n) {
        rest.push(i)
        continue
      }
      // 越透明越不相信原像素
      const alpha = mask[i]! / 255
      for (let c = 0; c < 3; c += 1) out[i * 3 + c] = Math.round(rgb[i * 3 + c]! * alpha + (sum[c]! / n) * (1 - alpha))
      filled.push(i)
    }
    if (!filled.length) break
    for (const i of filled) known[i] = 1
    pending = rest
  }
  return out
}

function meanLuma(rgb: Buffer, use?: Buffer) {
  let sum = 0
  let n = 0
  for (let i = 0; i < rgb.length / 3; i += 5) {
    if (use && use[i]! < 200) continue
    sum += 0.2126 * rgb[i * 3]! + 0.7152 * rgb[i * 3 + 1]! + 0.0722 * rgb[i * 3 + 2]!
    n += 1
  }
  return n ? sum / n : 128
}

/**
 * 保真合成：背景铺满画布 → 脚下接触阴影 → 原图人物原样贴回。
 * matchLight 只做整体亮度 ±5% 的轻微匹配，不改色相；关掉时人物内部像素和原图完全一样。
 */
export async function composeKeep(input: { source: string; mask: Buffer; plate: string; width: number; height: number; size: SceneSwapSize; matchLight: boolean; output: string }) {
  const { width, height, mask } = input
  const canvas = canvasFor(width, height, input.size)
  const rgb = await sharp(input.source).removeAlpha().toColourspace('srgb').raw().toBuffer()
  const person = cleanEdges(rgb, mask, width)
  const plate = await sharp(input.plate).rotate().flatten({ background: '#ffffff' }).resize(canvas.width, canvas.height, { fit: 'cover', position: 'bottom' }).toColourspace('srgb').raw().toBuffer()
  const stats = maskStats(mask, width, height)

  const gain = input.matchLight ? 1 + Math.max(-0.05, Math.min(0.05, ((meanLuma(plate) - meanLuma(rgb, mask)) / 255) * 0.2)) : 1

  // 脚下阴影：人物没被底边切掉时才画
  if (!stats.bottom && stats.coverage > 0) {
    const { x0, x1, y0, y1 } = stats.box
    const span = Math.max(4, Math.round((y1 - y0) * 0.03))
    let footL = x1
    let footR = x0
    for (let y = Math.max(y0, y1 - span); y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        if (mask[y * width + x]! < 128) continue
        if (x < footL) footL = x
        if (x > footR) footR = x
      }
    }
    const cx = canvas.left + (footL + footR) / 2
    const cy = canvas.top + y1 - span * 0.25
    const rx = Math.max(6, (footR - footL) * 0.62)
    const ry = Math.max(3, span * 0.9)
    for (let y = Math.max(0, Math.floor(cy - ry)); y < Math.min(canvas.height, cy + ry); y += 1) {
      for (let x = Math.max(0, Math.floor(cx - rx)); x < Math.min(canvas.width, cx + rx); x += 1) {
        const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2
        if (d >= 1) continue
        const o = (y * canvas.width + x) * 3
        for (let c = 0; c < 3; c += 1) plate[o + c] = Math.round(plate[o + c]! * (1 - 0.45 * (1 - d)))
      }
    }
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x
      const alpha = mask[i]! / 255
      if (!alpha) continue
      const o = ((y + canvas.top) * canvas.width + x + canvas.left) * 3
      for (let c = 0; c < 3; c += 1) plate[o + c] = Math.min(255, Math.round(person[i * 3 + c]! * gain * alpha + plate[o + c]! * (1 - alpha)))
    }
  }
  await sharp(plate, { raw: { width: canvas.width, height: canvas.height, channels: 3 } }).jpeg({ quality: 95, chromaSubsampling: '4:4:4' }).toFile(input.output)
  return { canvas, stats }
}

/** 保真模式的质检：人物像素来自原图，只需看抠图可不可信、画面有没有被切 */
export function checkKeep(stats: MaskStats, canvas: { width: number; height: number }, width: number, height: number): SceneSwapCheck[] {
  const badMask = stats.coverage < 0.04 || stats.coverage > 0.9
  const cut = (canvas.width > width && (stats.left || stats.right)) || (canvas.height > height && stats.top)
  return [
    { key: 'color', level: 'ok' },
    { key: 'pattern', level: 'ok' },
    { key: 'edge', level: badMask || stats.soft > 0.22 ? 'warn' : 'ok' },
    { key: 'frame', level: cut || badMask ? 'warn' : 'ok' },
  ]
}
