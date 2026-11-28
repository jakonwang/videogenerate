/**
 * 图生视频「贴真实商品」替换：
 *   1. AI 只擦掉参考图框里的旧商品（补成皮肤 / 背景）
 *   2. 腾讯云抠出真实商品（服务器代办，密钥不在本机）
 *   3. 按摆放（位置、大小、角度）把真实商品贴到擦好的图上 —— 大小、位置由程序决定，不交给 AI 猜
 *   4. AI 以贴好的商品为定位，把商品真正画进场景（穿戴、手指遮挡、平躺），给多角度商品图当款式依据；一次出几张
 *   5. 只把商品附近贴回原图，其余像素保持原样；用户从几张里挑一张再做视频（看图模型挑不准，2026-11-28 实测）
 *
 * 实测（2026-11-27）：只靠提示词限定大小，模型会把商品画大还会改款；先贴好再融合，大小、位置、款式都能保住。
 */
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { getAppPaths } from '../../lib/paths'
import type { ModelCredentials } from '../clone/types'
import { toPublicUrlViaQiniu } from '../clone/qiniu'
import { withUsageCharge } from '../clone/usageMeter'
import type { LivePhotoProductPlacement, LivePhotoProductViewCheck, LivePhotoProductViewKind, LivePhotoReplacementRegion } from './types'
import { compositeLivePhotoReplacementCrop, prepareLivePhotoReplacementCrop } from './replacementRegion'
import { extractJsonObjectText, extractModelMessageContent } from '../clone/aiResponse'

let sharp: any
async function ensureSharp() {
  if (!sharp) {
    const module = await import('sharp')
    sharp = module.default || module
  }
  return sharp
}

/* ------------------------------------------------------------------ 抠图（服务器代办） */

export type ProductCutoutProvider = (input: { image: string }) => Promise<{ mask: string }>
let cutoutProvider: ProductCutoutProvider | null = null

/** 桌面端登录后由 cloudLicense 设置；网页引擎由 cloneWorker 设置。没设置 = 不能用贴图替换，走原来的出图 */
export function setProductCutoutProvider(next: ProductCutoutProvider | null) {
  cutoutProvider = next
}

export function hasProductCutoutProvider() {
  return Boolean(cutoutProvider)
}

/** 默认的融合出图模型（GRS.AI）。后台「默认模型」里可以换 */
export const DEFAULT_PASTE_REPLACE_IMAGE_MODEL = 'nano-banana-2.1'

/** 贴图替换能不能用：要能抠图，还要有 GRS.AI（擦除、融合都走 GRS 的 /v1/api/generate） */
export function canUsePasteReplace(credentials: ModelCredentials) {
  return Boolean(cutoutProvider) && Boolean(String(credentials.grsaiApiKey || '').trim())
}

/**
 * 抠出真实商品：返回透明背景、裁掉空白边的 PNG。同一张商品图只抠一次（按文件内容缓存）。
 */
/**
 * keepPair：参考图里商品是拿在手里 / 放着（常是一对）时保留成对；戴在身上（一只耳朵）时只留一只。
 */
export async function ensureProductCutout(sourcePath: string, options: { keepPair?: boolean } = {}): Promise<{ path: string; width: number; height: number }> {
  if (!cutoutProvider) throw new Error('[cutout_unavailable] 贴真实商品需要登录账号（抠图在服务器上完成）')
  await ensureSharp()
  const source = await readFile(sourcePath)
  // v3：半透明的那一块补成不透明（规则变了，旧缓存不能再用）
  const hash = createHash('sha1').update(options.keepPair ? 'v3-pair:' : 'v3:').update(source).digest('hex').slice(0, 20)
  const output = join(getAppPaths().cacheDir, 'product-cutout', `${hash}.png`)
  if (existsSync(output)) {
    const meta = await sharp(output).metadata()
    return { path: output, width: meta.width, height: meta.height }
  }
  // 发给服务器前缩到 2000 以内、转成白底 JPEG（腾讯云抠图要不透明的图）
  const { data: prepared, info } = await sharp(source, { failOn: 'error' })
    .rotate()
    .resize(2000, 2000, { fit: 'inside', withoutEnlargement: true })
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: 94, chromaSubsampling: '4:4:4' })
    .toBuffer({ resolveWithObject: true })
  const { mask } = await cutoutProvider({ image: prepared.toString('base64') })
  const maskRaw = await sharp(Buffer.from(String(mask || ''), 'base64'))
    .resize(info.width, info.height, { fit: 'fill' })
    .extractChannel(0)
    .raw()
    .toBuffer()
  const rgb = await sharp(prepared).removeAlpha().raw().toBuffer()
  const rgba = Buffer.alloc(info.width * info.height * 4)
  let opaque = 0
  for (let i = 0; i < info.width * info.height; i += 1) {
    rgba[i * 4] = rgb[i * 3]
    rgba[i * 4 + 1] = rgb[i * 3 + 1]
    rgba[i * 4 + 2] = rgb[i * 3 + 2]
    rgba[i * 4 + 3] = maskRaw[i]
    if (maskRaw[i] > 128) opaque += 1
  }
  if (opaque < 16) throw new Error('抠图失败：没有找到商品，请换一张单只、背景干净的商品图')
  strengthenWeakPieces(rgba, info.width, info.height)
  if (!options.keepPair) keepSinglePiece(rgba, info.width, info.height)
  await mkdir(dirname(output), { recursive: true })
  const trimmed = await sharp(rgba, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toBuffer()
  await sharp(trimmed).trim({ threshold: 1 }).png().toFile(output)
  const meta = await sharp(output).metadata()
  return { path: output, width: meta.width, height: meta.height }
}

/** 按 8 邻域给「看得见」的像素（透明度 > threshold）分块，返回每个像素的块号（0 = 背景）和块数 */
function labelPieces(rgba: Buffer, width: number, height: number, threshold: number) {
  const label = new Int32Array(width * height)
  const stack: number[] = []
  let count = 0
  for (let start = 0; start < width * height; start += 1) {
    if (label[start] || rgba[start * 4 + 3] <= threshold) continue
    count += 1
    label[start] = count
    stack.push(start)
    while (stack.length) {
      const index = stack.pop()!
      const x = index % width
      const y = (index - x) / width
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
          const next = ny * width + nx
          if (!label[next] && rgba[next * 4 + 3] > threshold) {
            label[next] = count
            stack.push(next)
          }
        }
      }
    }
  }
  return { label, count }
}

/**
 * 腾讯云抠一对商品时，常把其中一只给成半透明（2026-11-28 A-36：右边那只平均不透明度只有 56%），
 * 贴上去会透出底下的手指。按块看：块内部的透明度明显不到 255，就把整块按比例拉满，边缘的柔和过渡还在。
 * 直接改 rgba 的透明通道；返回补了几块。
 */
export function strengthenWeakPieces(rgba: Buffer, width: number, height: number) {
  const { label, count } = labelPieces(rgba, width, height, 24)
  if (!count) return 0
  const histograms = Array.from({ length: count + 1 }, () => new Uint32Array(256))
  for (let i = 0; i < width * height; i += 1) {
    if (label[i]) histograms[label[i]][rgba[i * 4 + 3]] += 1
  }
  // 每块取透明度的 85 分位当「内部」的透明度：边缘那圈柔和像素不影响判断
  const gain = new Float32Array(count + 1)
  let fixed = 0
  for (let id = 1; id <= count; id += 1) {
    const hist = histograms[id]
    let total = 0
    for (let a = 0; a < 256; a += 1) total += hist[a]
    if (total < 16) continue
    let seen = 0
    let p85 = 255
    for (let a = 0; a < 256; a += 1) {
      seen += hist[a]
      if (seen >= total * 0.85) {
        p85 = a
        break
      }
    }
    if (p85 >= 235 || p85 < 48) continue
    gain[id] = 255 / p85
    fixed += 1
  }
  if (!fixed) return 0
  for (let i = 0; i < width * height; i += 1) {
    const g = gain[label[i]]
    if (g) rgba[i * 4 + 3] = Math.min(255, Math.round(rgba[i * 4 + 3] * g))
  }
  return fixed
}

/**
 * 商品图常是一对（耳环、耳钉）：抠出来有两块差不多大的独立图形时只留最大的一块，
 * 不然会把一对都贴到一只耳朵上。只有一块、或其余都很小（碎屑、阴影）时不动。直接改 rgba 的透明通道。
 */
export function keepSinglePiece(rgba: Buffer, width: number, height: number) {
  const step = Math.max(1, Math.ceil(Math.max(width, height) / 400))
  const w = Math.ceil(width / step)
  const h = Math.ceil(height / step)
  const solid = new Uint8Array(w * h)
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (rgba[((y * step) * width + x * step) * 4 + 3] > 128) solid[y * w + x] = 1
    }
  }
  const label = new Int32Array(w * h)
  const sizes: number[] = [0]
  const stack: number[] = []
  for (let start = 0; start < w * h; start += 1) {
    if (!solid[start] || label[start]) continue
    const id = sizes.length
    let size = 0
    label[start] = id
    stack.push(start)
    while (stack.length) {
      const index = stack.pop()!
      size += 1
      const x = index % w
      const y = (index - x) / w
      // 8 邻域，细链条、细耳圈也算连在一起
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
          const next = ny * w + nx
          if (solid[next] && !label[next]) {
            label[next] = id
            stack.push(next)
          }
        }
      }
    }
    sizes.push(size)
  }
  if (sizes.length <= 2) return false
  const ranked = sizes.map((size, id) => ({ size, id })).slice(1).sort((a, b) => b.size - a.size)
  if (ranked[1].size < ranked[0].size * 0.35) return false
  const keep = ranked[0].id
  // 留下那块的范围（放宽一格），范围外全部清掉，免得另一只的边缘残留把裁剪框撑大
  let minX = w, minY = h, maxX = -1, maxY = -1
  for (let i = 0; i < w * h; i += 1) {
    if (label[i] !== keep) continue
    const x = i % w
    const y = (i - x) / w
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y)
  }
  const boxLeft = Math.max(0, (minX - 1) * step)
  const boxTop = Math.max(0, (minY - 1) * step)
  const boxRight = Math.min(width, (maxX + 2) * step)
  const boxBottom = Math.min(height, (maxY + 2) * step)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (x < boxLeft || x >= boxRight || y < boxTop || y >= boxBottom) {
        rgba[(y * width + x) * 4 + 3] = 0
        continue
      }
      const owner = label[Math.min(h - 1, Math.floor(y / step)) * w + Math.min(w - 1, Math.floor(x / step))]
      if (owner !== keep) {
        // 边缘像素可能落在缩小格子的背景里：只清掉属于别的块的，背景格子保留原透明度
        if (owner !== 0) rgba[(y * width + x) * 4 + 3] = 0
      }
    }
  }
  return true
}

/* ------------------------------------------------------------------ 摆放 */

/** 默认摆放：商品放在原商品的框里，按长边缩放到和原商品一样大（大小 100%） */
export function defaultProductPlacement(input: {
  region: Pick<LivePhotoReplacementRegion, 'x' | 'y' | 'width' | 'height'>
  sceneWidth: number
  sceneHeight: number
  cutoutWidth: number
  cutoutHeight: number
  /** 参考图里原商品被透视压扁了（平躺、侧着，见 checkReferenceSuitability） */
  foreshortened?: boolean
}): LivePhotoProductPlacement {
  const boxW = input.region.width * input.sceneWidth
  const boxH = input.region.height * input.sceneHeight
  const fitInside = Math.min(boxW / Math.max(1, input.cutoutWidth), boxH / Math.max(1, input.cutoutHeight))
  // 原商品平躺、侧着时，框在一个方向上被透视压扁了，另一个方向才是真实大小：按「没被压扁的那条边」对齐，
  // 塞进框会把新商品缩到原来的 37%~79%（2026-11-28 A-36 实测）。最多比塞进框大 1.6 倍，防止框画歪时贴得太大。
  // 正对镜头时框没被压扁，仍然塞进框（一对耳环摆得比原来松，按长边对齐会贴得太大，同日实测）
  const matchLongSide = Math.max(boxW / Math.max(1, input.cutoutWidth), boxH / Math.max(1, input.cutoutHeight))
  const scale = input.foreshortened ? Math.min(matchLongSide, fitInside * 1.6) : fitInside
  return {
    cx: input.region.x + input.region.width / 2,
    cy: input.region.y + input.region.height / 2,
    width: Math.max(0.005, (input.cutoutWidth * scale) / input.sceneWidth),
    rotation: 0,
  }
}

export function normalizeProductPlacement(input: unknown): LivePhotoProductPlacement | undefined {
  if (!input || typeof input !== 'object') return undefined
  const value = input as Record<string, unknown>
  const num = (key: string) => Number(value[key])
  const cx = num('cx')
  const cy = num('cy')
  const width = num('width')
  const rotation = Number.isFinite(num('rotation')) ? num('rotation') : 0
  if (![cx, cy, width].every(Number.isFinite) || width <= 0) return undefined
  return {
    cx: Math.min(1, Math.max(0, cx)),
    cy: Math.min(1, Math.max(0, cy)),
    width: Math.min(1, Math.max(0.005, width)),
    rotation: Math.min(180, Math.max(-180, rotation)),
    ...(Number.isFinite(num('squash')) && num('squash') < 0.999 ? { squash: Math.min(1, Math.max(0.2, num('squash'))) } : {}),
    ...(value.flip === true ? { flip: true } : {}),
    ...(Number.isFinite(num('confirmedAt')) && num('confirmedAt') > 0 ? { confirmedAt: num('confirmedAt') } : {}),
  }
}

/** 商品贴上去后在图里占的范围（像素，含旋转后的外接框） */
function placementPixelBounds(placement: LivePhotoProductPlacement, sceneW: number, sceneH: number, cutoutW: number, cutoutH: number) {
  // width 是商品不侧倾时的宽度；侧倾（squash）只把横向压窄，高度不变
  const fullW = placement.width * sceneW
  const h = (fullW * cutoutH) / Math.max(1, cutoutW)
  const w = fullW * (placement.squash ?? 1)
  const rad = (placement.rotation * Math.PI) / 180
  const bw = Math.abs(w * Math.cos(rad)) + Math.abs(h * Math.sin(rad))
  const bh = Math.abs(w * Math.sin(rad)) + Math.abs(h * Math.cos(rad))
  return { w, h, left: placement.cx * sceneW - bw / 2, top: placement.cy * sceneH - bh / 2, bw, bh }
}

/** 把真实商品按摆放贴到擦好的图上（再加一点接触阴影），得到给 AI 融合的「摆放图」 */
export async function renderPlacementGuide(input: {
  erasedScenePath: string
  cutoutPath: string
  placement: LivePhotoProductPlacement
  outputPath: string
}) {
  await ensureSharp()
  const scene = await sharp(input.erasedScenePath).metadata()
  const cut = await sharp(input.cutoutPath).metadata()
  const box = placementPixelBounds(input.placement, scene.width, scene.height, cut.width, cut.height)
  let shaped = sharp(input.cutoutPath).resize(Math.max(1, Math.round(box.w)), Math.max(1, Math.round(box.h)), { kernel: 'lanczos3', fit: 'fill' })
  // 翻面：左右镜像（商品图朝向和原商品相反时用）
  if (input.placement.flip) shaped = sharp(await shaped.png().toBuffer()).flop()
  const product = await sharp(await shaped.png().toBuffer())
    .rotate(input.placement.rotation, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer({ resolveWithObject: true })
  const left = Math.round(input.placement.cx * scene.width - product.info.width / 2)
  const top = Math.round(input.placement.cy * scene.height - product.info.height / 2)
  // 阴影：商品透明通道模糊后压暗，往右下偏一点
  const alpha = await sharp(product.data).extractChannel('alpha').raw().toBuffer()
  const shadowAlpha = await sharp(alpha, { raw: { width: product.info.width, height: product.info.height, channels: 1 } })
    .blur(Math.max(0.6, box.w / 30))
    .linear(0.35, 0)
    .extractChannel(0)
    .raw()
    .toBuffer()
  const shadow = Buffer.alloc(product.info.width * product.info.height * 4)
  for (let i = 0; i < product.info.width * product.info.height; i += 1) {
    shadow[i * 4] = 60
    shadow[i * 4 + 1] = 35
    shadow[i * 4 + 2] = 28
    shadow[i * 4 + 3] = shadowAlpha[i]
  }
  const offset = Math.max(1, Math.round(box.w / 40))
  const layers = clipLayers([
    { input: await sharp(shadow, { raw: { width: product.info.width, height: product.info.height, channels: 4 } }).png().toBuffer(), left: left + offset, top: top + offset * 2, width: product.info.width, height: product.info.height },
    { input: product.data, left, top, width: product.info.width, height: product.info.height },
  ], scene.width, scene.height)
  await mkdir(dirname(input.outputPath), { recursive: true })
  const composites = []
  for (const layer of layers) composites.push({ input: await layer.input, left: layer.left, top: layer.top })
  await sharp(input.erasedScenePath).composite(composites).png().toFile(input.outputPath)
  // 商品在整张图里的形状（黑底白图），融合后只把商品附近按这个形状贴回
  const maskPath = input.outputPath.replace(/\.png$/i, '-mask.png')
  const alphaLayer = await sharp(product.data).extractChannel('alpha').toColourspace('b-w').png().toBuffer()
  const maskLayers = clipLayers([{ input: alphaLayer, left, top, width: product.info.width, height: product.info.height }], scene.width, scene.height)
  const maskComposites = []
  for (const layer of maskLayers) maskComposites.push({ input: await layer.input, left: layer.left, top: layer.top })
  await sharp({ create: { width: scene.width, height: scene.height, channels: 3, background: '#000000' } })
    .composite(maskComposites)
    .toColourspace('b-w')
    .png()
    .toFile(maskPath)
  return { bounds: { left: box.left, top: box.top, width: box.bw, height: box.bh }, maskPath }
}

/** sharp 的 composite 不接受超出画布的图层：超出部分裁掉 */
function clipLayers(layers: Array<{ input: Buffer; left: number; top: number; width: number; height: number }>, W: number, H: number) {
  return layers
    .map((layer) => {
      const x0 = Math.max(0, layer.left)
      const y0 = Math.max(0, layer.top)
      const x1 = Math.min(W, layer.left + layer.width)
      const y1 = Math.min(H, layer.top + layer.height)
      if (x1 <= x0 || y1 <= y0) return null
      const needsCrop = x0 !== layer.left || y0 !== layer.top || x1 !== layer.left + layer.width || y1 !== layer.top + layer.height
      return {
        left: x0,
        top: y0,
        input: needsCrop
          ? sharp(layer.input).extract({ left: x0 - layer.left, top: y0 - layer.top, width: x1 - x0, height: y1 - y0 }).png().toBuffer()
          : Promise.resolve(layer.input),
      }
    })
    .filter(Boolean) as Array<{ left: number; top: number; input: Promise<Buffer> }>
}

/* ------------------------------------------------------------------ 出图（GRS /v1/api/generate） */

function grsHost(credentials: ModelCredentials) {
  return String(credentials.grsaiHost || 'https://grsaiapi.com').trim().replace(/\/+$/, '') || 'https://grsaiapi.com'
}

export function resolvePasteReplaceImageModel(credentials: ModelCredentials) {
  return String(credentials.livePhotoReplaceImageModel || '').trim() || DEFAULT_PASTE_REPLACE_IMAGE_MODEL
}

/** 提交一张图到 GRS 并等结果（最多 6 分钟），下载到 outputPath */
export async function generateWithGrs(input: {
  credentials: ModelCredentials
  prompt: string
  imagePaths: string[]
  aspectRatio: string
  outputPath: string
  uploadKeyPrefix: string
}) {
  const key = String(input.credentials.grsaiApiKey || '').trim()
  if (!key) throw new Error('GRS.AI 没有配置，不能做贴图替换')
  const model = resolvePasteReplaceImageModel(input.credentials)
  const host = grsHost(input.credentials)
  const headers = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }
  const urls = await Promise.all(input.imagePaths.map((file) => toPublicUrlViaQiniu(input.credentials, file, input.uploadKeyPrefix)))
  const created = await withUsageCharge({ capability: 'image', platform: 'grsai', model }, async () => {
    const body: Record<string, unknown> = { model, prompt: input.prompt, images: urls, aspectRatio: input.aspectRatio, replyType: 'async' }
    if (/banana/i.test(model)) body.imageSize = '2K'
    const res = await fetch(`${host}/v1/api/generate`, { method: 'POST', headers, body: JSON.stringify(body) })
    const json: any = await res.json().catch(() => ({}))
    if (!res.ok || !(json?.id || json?.data?.id)) throw new Error(`出图提交失败 HTTP ${res.status}: ${String(json?.error || json?.msg || '').slice(0, 200)}`)
    return json?.data ?? json
  })
  const deadline = Date.now() + 6 * 60 * 1000
  let snapshot: any = created
  while (!snapshot?.results?.[0]?.url) {
    const status = String(snapshot?.status || '').toLowerCase()
    if (status === 'failed' || status === 'violation') {
      throw new Error(status === 'violation' ? '出图被平台判定内容违规，请换一张参考图' : `出图失败：${String(snapshot?.error || '').slice(0, 200)}`)
    }
    if (Date.now() > deadline) throw new Error('出图超时（6 分钟没有结果），请稍后重试')
    await new Promise((resolve) => setTimeout(resolve, 4000))
    const res = await fetch(`${host}/v1/api/result?id=${encodeURIComponent(String(created.id))}`, { headers })
    const json: any = await res.json().catch(() => ({}))
    snapshot = json?.data ?? json
  }
  const res = await fetch(String(snapshot.results[0].url))
  if (!res.ok) throw new Error(`出图下载失败 HTTP ${res.status}`)
  await ensureSharp()
  await mkdir(dirname(input.outputPath), { recursive: true })
  await sharp(Buffer.from(await res.arrayBuffer())).png().toFile(input.outputPath)
  return { model }
}

/* ------------------------------------------------------------------ 擦除 / 融合 / 贴回 */

/**
 * 擦掉框里的旧商品：框附近一大块（至少画面短边的 45%）交给 AI，它看得到周围皮肤和光线；只把框附近贴回原图。
 */
export async function eraseRegionProduct(input: {
  credentials: ModelCredentials
  scenePath: string
  region: LivePhotoReplacementRegion
  outputPath: string
}) {
  const cropPath = input.outputPath.replace(/\.png$/i, '-crop.png')
  const aiPath = input.outputPath.replace(/\.png$/i, '-ai.png')
  const crop = await prepareLivePhotoReplacementCrop({ scenePath: input.scenePath, outputPath: cropPath, region: input.region })
  const { model } = await generateWithGrs({
    credentials: input.credentials,
    prompt: [
      'Edit this photo: completely remove the product (jewelry, accessory, or item) near the center of the photo.',
      'Fill the spot with what would naturally be behind it (bare skin, ear lobe, fingers, fabric, or background) matching the surrounding texture, color, and light.',
      'Do not add any new jewelry or object. Keep everything else exactly the same: same shapes, hair strands, lighting, framing, and crop.',
    ].join('\n'),
    imagePaths: [cropPath],
    aspectRatio: '1:1',
    outputPath: aiPath,
    uploadKeyPrefix: 'grsai-input/live-photo/erase',
  })
  await compositeLivePhotoReplacementCrop({ scenePath: input.scenePath, generatedCropPath: aiPath, outputPath: input.outputPath, geometry: crop.geometry })
  return { path: input.outputPath, model }
}

/** 按商品类型说清楚「怎么戴 / 怎么拿」，AI 才会把贴上去的平面图改成真的戴着 */
function wearingInstructions(productType?: string) {
  const type = String(productType || '').toLowerCase()
  if (/ear|耳/.test(type)) {
    return [
      'It is an earring worn in the ear lobe piercing at that spot. A hoop or huggie passes through the piercing hole: its back half goes behind the lobe (hidden) and it wraps around the lower edge of the lobe; charms face the camera. A stud sits flat on the lobe with the post hidden.',
    ]
  }
  if (/ring|戒/.test(type)) return ['It is a ring worn on the finger at that spot: the band wraps around the finger and the back of the band is hidden behind the finger.']
  if (/neck|pendant|项链|吊坠/.test(type)) return ['It is a necklace worn at that spot: the chain lies on the skin and follows the neck and collarbone, the pendant hangs with gravity. Ignore how the chain is laid out in the product photo.']
  if (/brace|bangle|手链|手镯/.test(type)) return ['It is a bracelet worn on the wrist at that spot: it wraps around the wrist and the back part is hidden behind the wrist. Loose parts (extender chain, tag, dangling charms) hang down with gravity and rest against the skin — they never stick up or float across the hand, even if the product photo shows them laid out differently.']
  return ['It is held, worn, or placed at that spot exactly like the original item was: keep the same kind of contact with fingers, body, or surface.']
}

/** 一次出几张让用户挑（2026-11-28 实验：6 条里每条 3 张中都有用户认可的一张；看图模型挑不准，所以交给人挑） */
export const PASTE_STILL_CANDIDATES = 3

function interactionInstruction(interactionMode?: string, productType?: string) {
  const mode = String(interactionMode || '')
  if (mode === 'worn') {
    return /ear|耳/.test(String(productType || '').toLowerCase())
      ? 'It must be WORN exactly like the original earring in Image 2: a hoop/huggie goes through the ear lobe piercing, its back half is hidden behind the lobe and it wraps around the lower edge of the lobe; the decorated front faces the camera.'
      : `It must be WORN exactly like the original item in Image 2. ${wearingInstructions(productType).join(' ')}`
  }
  if (mode === 'held') return 'It must be HELD exactly like the original item in Image 2: the same fingers pinch it at the same contact points, fingertips and nails overlap and cover it where they touch, nothing floats.'
  return 'It must be PLACED exactly like the original item in Image 2: lying on the same surface with the same tilt (if the original lies flat, the new one lies flat too, seen at the same angle), with a soft contact shadow.'
}

/**
 * 融合：贴好的商品只做定位（位置、大小），让 AI 把它真正画进场景——穿过耳垂、被手指捏住、平躺——
 * 同时给原图（看原商品怎么戴 / 拿 / 放）和多角度商品图（款式唯一依据）。一次出几张，交给用户挑。
 *
 * 为什么不再「只让 AI 打光、再贴回真实像素」：那样商品永远是贴在表面的一张贴纸，手指压不到前面、耳圈穿不进耳垂、
 * 掌心里的也立着（2026-11-28 测试集 23 条严格看几乎都不能发）。
 * 每张结果只把商品附近（原商品框 + 新商品，往外扩一圈）贴回擦好的图，其余像素不动。
 */
export async function integratePlacedProduct(input: {
  credentials: ModelCredentials
  referenceScenePath: string
  guidePath: string
  erasedScenePath: string
  productMaskPath: string
  /** 商品图：第一张是抠图用的那张，后面是其它角度（款式依据，最多用 3 张） */
  productViewPaths: string[]
  productType?: string
  productBounds: { left: number; top: number; width: number; height: number }
  region: LivePhotoReplacementRegion
  interactionMode?: string
  outputDir: string
  count?: number
}) {
  await ensureSharp()
  const meta = await sharp(input.guidePath).metadata()
  const W = meta.width
  const H = meta.height
  const region = { left: input.region.x * W, top: input.region.y * H, width: input.region.width * W, height: input.region.height * H }
  const left = Math.min(region.left, input.productBounds.left)
  const top = Math.min(region.top, input.productBounds.top)
  const right = Math.max(region.left + region.width, input.productBounds.left + input.productBounds.width)
  const bottom = Math.max(region.top + region.height, input.productBounds.top + input.productBounds.height)
  const union = { left, top, width: right - left, height: bottom - top }
  // 交给 AI 的是商品周围一块正方形（至少画面短边的 45%）：AI 出 1:1 的图，缩回去不变形，贴回时不会错位
  const side = Math.round(Math.min(W, H, Math.max(Math.max(union.width, union.height) * 3, Math.min(W, H) * 0.45)))
  const crop = {
    left: Math.round(Math.min(W - side, Math.max(0, union.left + union.width / 2 - side / 2))),
    top: Math.round(Math.min(H - side, Math.max(0, union.top + union.height / 2 - side / 2))),
    width: side,
    height: side,
  }
  await mkdir(input.outputDir, { recursive: true })
  const stamp = Date.now()
  const guideCrop = join(input.outputDir, `integrate-${stamp}-guide.png`)
  const originalCrop = join(input.outputDir, `integrate-${stamp}-original.png`)
  await sharp(input.guidePath).extract(crop).png().toFile(guideCrop)
  await sharp(input.referenceScenePath).rotate().resize(W, H, { fit: 'fill' }).extract(crop).png().toFile(originalCrop)
  const cropMask = await sharp(input.productMaskPath).resize(W, H, { fit: 'fill' }).extract(crop).extractChannel(0).png().toBuffer()
  const prompt = [
    'Image 1 is a photo where the new product has been roughly pasted in as a flat cut-out: its POSITION and overall SIZE are right, but it does not look physically real.',
    'Image 2 is the original photo of the same scene with the old item: it shows how the item is worn, held or placed.',
    'Images 3 and after are the real new product from several angles: they are the only source of truth for its design.',
    `Redraw the new product in Image 1 so it is physically real in the scene. ${interactionInstruction(input.interactionMode, input.productType)}`,
    'Keep its design EXACTLY as in the product images: same shape, same number and layout of motifs and stones, same colored or enamel parts if present, same hoop or chain form, same metal color. Do not add, remove or change any part. Keep one piece or a pair exactly as in Image 1.',
    'Keep the overall size and position as in Image 1, do not enlarge or shrink it.',
    'Keep everything else exactly as in Image 1: skin, fingers, ear, hair, background, lighting, framing and crop.',
  ].join('\n')
  const views = input.productViewPaths.filter((path) => path && existsSync(path)).slice(0, 3)
  // 贴回的范围：原商品框和新商品的并集，往外扩一圈再羽化（AI 会把商品画得稍微挪一点、加阴影、改手指）
  const grow = Math.max(4, Math.max(input.productBounds.width, input.productBounds.height) * 0.35)
  const boxLeft = Math.max(0, Math.round(union.left - grow))
  const boxTop = Math.max(0, Math.round(union.top - grow))
  const boxW = Math.max(1, Math.min(W - boxLeft, Math.round(union.width + grow * 2)))
  const boxH = Math.max(1, Math.min(H - boxTop, Math.round(union.height + grow * 2)))
  const rect = await sharp({ create: { width: boxW, height: boxH, channels: 3, background: '#ffffff' } }).png().toBuffer()
  const softMask = await sharp({ create: { width: W, height: H, channels: 3, background: '#000000' } })
    .composite([{ input: rect, left: boxLeft, top: boxTop }])
    .blur(Math.max(1.5, grow * 0.5))
    .extractChannel(0)
    .raw()
    .toBuffer()
  const erased = await sharp(input.erasedScenePath).rotate().resize(W, H, { fit: 'fill' }).removeAlpha().png().toBuffer()
  let model = resolvePasteReplaceImageModel(input.credentials)
  const count = Math.max(1, input.count ?? PASTE_STILL_CANDIDATES)
  // AI 偶尔会回一张完全不同的图（换了人、换了背景），贴回去是一块方补丁：这种重画一次，还不行就不给用户看
  const results = await Promise.all(Array.from({ length: count }, async (_, index) => {
    let lastError = ''
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const suffix = attempt === 1 ? `${index + 1}` : `${index + 1}-r${attempt}`
      const aiPath = join(input.outputDir, `integrate-${stamp}-${suffix}-ai.png`)
      const outPath = join(input.outputDir, `integrate-${stamp}-${suffix}.png`)
      try {
        const generated = await generateWithGrs({
          credentials: input.credentials,
          prompt,
          imagePaths: [guideCrop, originalCrop, ...views],
          aspectRatio: '1:1',
          outputPath: aiPath,
          uploadKeyPrefix: 'grsai-input/live-photo/integrate',
        })
        model = generated.model
        const aiCrop = await sharp(aiPath).resize(side, side, { fit: 'fill' }).removeAlpha().png().toBuffer()
        const drift = Math.round((await measureSceneDrift({ before: guideCrop, after: aiCrop, productMask: cropMask })) * 10) / 10
        if (drift > MAX_SCENE_DRIFT) {
          console.warn('[live-photo] integrate candidate changed the scene, retrying', index + 1, attempt, drift)
          lastError = `AI 把整块画面改掉了（变化 ${drift}）`
          continue
        }
        const placed = await sharp(erased).composite([{ input: aiCrop, left: crop.left, top: crop.top }]).removeAlpha().png().toBuffer()
        const overlay = await sharp(placed).joinChannel(softMask, { raw: { width: W, height: H, channels: 1 } }).png().toBuffer()
        await sharp(erased).composite([{ input: overlay, left: 0, top: 0 }]).png().toFile(outPath)
        return { path: outPath, drift, error: '' }
      } catch (error) {
        console.warn('[live-photo] integrate candidate failed', index + 1, attempt, (error as Error)?.message || error)
        lastError = String((error as Error)?.message || error)
      }
    }
    return { path: '', drift: 0, error: lastError }
  }))
  const candidates = results.filter((r) => r.path).map(({ path, drift }) => ({ path, drift }))
  if (!candidates.length) throw new Error(results[0]?.error || '融合失败，请重试')
  return { candidates, model, failed: results.length - candidates.length }
}

/** 商品以外的画面平均差多少（0~255）才算 AI 把整张图改掉了。正常融合在 10 以内，整张重画在 30 以上 */
const MAX_SCENE_DRIFT = 18

/**
 * 比较融合前后（同一块正方形）商品以外的画面：商品形状往外扩一大圈的地方不算（那里本来就会有阴影、反光变化），
 * 其余像素的平均差。缩到 256 再比，快也不受细小纹理影响。
 */
async function measureSceneDrift(input: { before: string | Buffer; after: Buffer; productMask: Buffer }) {
  const size = 256
  const a = await sharp(input.before).resize(size, size, { fit: 'fill' }).removeAlpha().raw().toBuffer()
  const b = await sharp(input.after).resize(size, size, { fit: 'fill' }).removeAlpha().raw().toBuffer()
  const mask = await sharp(input.productMask).resize(size, size, { fit: 'fill' }).blur(12).linear(10, 0).extractChannel(0).raw().toBuffer()
  let sum = 0
  let count = 0
  for (let i = 0; i < size * size; i += 1) {
    if (mask[i] > 8) continue
    sum += (Math.abs(a[i * 3] - b[i * 3]) + Math.abs(a[i * 3 + 1] - b[i * 3 + 1]) + Math.abs(a[i * 3 + 2] - b[i * 3 + 2])) / 3
    count += 1
  }
  return count ? sum / count : 0
}

export async function readImageSize(path: string) {
  await ensureSharp()
  const meta = await sharp(path).rotate().metadata()
  return { width: Number(meta.width || 0), height: Number(meta.height || 0) }
}

/* ------------------------------------------------------------------ 参考图能不能换 */

/** 原商品长边不到这么多像素，贴上去看不清款式（2026-11-27 实测 20 多像素不行） */
export const MIN_PRODUCT_SIZE_PX = 48

/**
 * 擦图（花钱）前看一眼参考图：只有原商品太小（看不清款式）才拦下让用户换图。
 * 商品朝向（正面 / 侧面 / 平躺 / 背面）只记录，平躺时摆放按长边定大小；不再因为侧面、背面拦任务——
 * 融合阶段 AI 会照原图的戴法 / 拿法把商品重新画进去。看图失败时放行。
 */
export async function checkReferenceSuitability(input: {
  credentials: ModelCredentials
  referenceScenePath: string
  region: LivePhotoReplacementRegion
  productType?: string
}): Promise<LivePhotoProductViewCheck> {
  await ensureSharp()
  const meta = await sharp(input.referenceScenePath).rotate().metadata()
  const W = Number(meta.width || 0)
  const H = Number(meta.height || 0)
  const box = { x: input.region.x * W, y: input.region.y * H, w: input.region.width * W, h: input.region.height * H }
  const sizePx = Math.round(Math.max(box.w, box.h))
  const base = { sizePx, checkedAt: Date.now() }
  if (sizePx < MIN_PRODUCT_SIZE_PX) {
    return { ...base, view: 'unknown', suitable: false, reason: `参考图里的商品太小（只有约 ${sizePx} 像素），贴上去看不清款式，请换一张商品拍得更大的参考图` }
  }
  const key = String(input.credentials.grsaiApiKey || '').trim()
  if (!key) return { ...base, view: 'unknown', suitable: true }
  try {
    const side = Math.round(Math.min(W, H, Math.max(Math.max(box.w, box.h) * 2.2, Math.min(W, H) * 0.3)))
    const left = Math.round(Math.min(W - side, Math.max(0, box.x + box.w / 2 - side / 2)))
    const top = Math.round(Math.min(H - side, Math.max(0, box.y + box.h / 2 - side / 2)))
    const crop = await sharp(input.referenceScenePath).rotate().extract({ left, top, width: side, height: side }).resize(512, 512).jpeg({ quality: 85 }).toBuffer()
    // 直接问「正面 / 斜 / 侧面」，同一张手指捏着侧边的图三次里会有两次说「斜着」（2026-11-28 实测）。
    // 改成先让它比较商品在图里的宽和高、再选朝向：同一张图三次结果都一致
    const text = [
      `The image shows a ${String(input.productType || 'product').trim() || 'product'} (jewelry or a small item) in a photo: worn, held, or placed. Look at the most visible piece.`,
      'Compare its apparent WIDTH (left to right) with its apparent HEIGHT (top to bottom) as drawn in the image. A hoop or ring seen straight on is about as wide as tall; seen from the side it is much narrower than tall (or much flatter than wide if lying down).',
      'Then choose how it faces the camera: camera (its front face is toward the camera, straight or somewhat turned), sideways (seen from the side or edge: you mainly see its band or side profile), lying (lying flat on a surface, seen from above at an angle), back (its back or rear side faces the camera).',
      'Return JSON only: {"width_to_height":0.0,"facing":"camera|sideways|lying|back"}',
    ].join('\n')
    const res = await fetch(`${grsHost(input.credentials)}/v1/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: String(input.credentials.grsaiAnalysisModel || 'gemini-3.1-pro').trim() || 'gemini-3.1-pro',
        stream: false,
        temperature: 0,
        messages: [{ role: 'user', content: [{ type: 'text', text }, { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${crop.toString('base64')}` } }] }],
      }),
      signal: AbortSignal.timeout(90_000),
    })
    const body = await res.text()
    if (!res.ok) {
      console.warn('[live-photo] reference suitability check HTTP', res.status, body.slice(0, 200))
      return { ...base, view: 'unknown', suitable: true }
    }
    const parsed = JSON.parse(extractJsonObjectText(extractModelMessageContent(body)))
    const facing = String(parsed?.facing || '').trim().toLowerCase()
    const view: LivePhotoProductViewKind = facing === 'camera' ? 'front' : facing === 'lying' ? 'flat' : facing === 'sideways' ? 'edge_on' : facing === 'back' ? 'back' : 'unknown'
    // 侧面、背面朝镜头只记下来不拦：融合会让 AI 按原图的戴法 / 拿法重新画商品，
    // 戴在耳朵上的耳圈、手指捏着的耳圈本来就多半是侧面（2026-11-28 线上 8 条里 5 条被误拦）
    return { ...base, view, suitable: true }
  } catch (error) {
    console.warn('[live-photo] reference suitability check failed', (error as Error)?.message || error)
    return { ...base, view: 'unknown', suitable: true }
  }
}

/* ------------------------------------------------------------------ 按角度挑商品图 */

/**
 * 把商品的六视图分析板切成单格。分析板是 AI 生成的，排版可能是 3 列 2 行，也可能是 2 列 3 行（和图片横竖无关，
 * 2026-11-27 实测竖图也有 3×2 的），所以看格子之间的分隔处来判断：分隔处几乎没有商品像素。
 * 每格上下各切掉一截去掉英文标注（标注在上面或下面都有）。返回每格的文件路径。
 */
export async function splitAnalysisBoard(boardPath: string, outDir: string) {
  await ensureSharp()
  const meta = await sharp(boardPath).rotate().metadata()
  const W = Number(meta.width || 0)
  const H = Number(meta.height || 0)
  if (!W || !H) return [] as string[]
  const cols = await detectBoardColumns(boardPath)
  const rows = cols === 3 ? 2 : 3
  const cellW = Math.floor(W / cols)
  const cellH = Math.floor(H / rows)
  await mkdir(outDir, { recursive: true })
  const out: string[] = []
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const padX = Math.round(cellW * 0.03)
      const top = r * cellH + Math.round(cellH * 0.14)
      const panel = { left: c * cellW + padX, top, width: cellW - padX * 2, height: Math.round(cellH * 0.72) }
      const file = join(outDir, `view-${r * cols + c + 1}.png`)
      await sharp(boardPath).rotate().extract(panel).png().toFile(file)
      out.push(file)
    }
  }
  return out
}

/** 分析板是 2 列还是 3 列：比较 1/2 处和 1/3、2/3 处那一条竖带里的「深色像素」比例，分隔处应该几乎是空白 */
export async function detectBoardColumns(boardPath: string): Promise<2 | 3> {
  await ensureSharp()
  const width = 300
  const { data, info } = await sharp(boardPath).rotate().resize(width, null).greyscale().raw().toBuffer({ resolveWithObject: true })
  const ink = (x: number) => {
    const band = 2
    let dark = 0
    let total = 0
    for (let dx = -band; dx <= band; dx += 1) {
      const col = Math.min(info.width - 1, Math.max(0, Math.round(x) + dx))
      for (let y = 0; y < info.height; y += 1) {
        total += 1
        if (data[y * info.width + col] < 215) dark += 1
      }
    }
    return dark / Math.max(1, total)
  }
  const two = ink(info.width / 2)
  const three = (ink(info.width / 3) + ink((info.width * 2) / 3)) / 2
  return three <= two ? 3 : 2
}

/**
 * 看参考图里原商品是怎么摆的（哪一面朝镜头、斜着还是侧着、是一只还是一对），
 * 从候选商品图里挑角度最接近的一张。商品图是正面照、原商品却侧着时，直接贴上去会「立着」不合物理。
 * 一次对话模型看图调用；失败返回 null（用默认商品图）。
 */
export async function pickProductViewByAngle(input: {
  credentials: ModelCredentials
  referenceScenePath: string
  region: LivePhotoReplacementRegion
  candidatePaths: string[]
  workDir: string
}): Promise<{ path: string; pair: boolean; index: number } | null> {
  const key = String(input.credentials.grsaiApiKey || '').trim()
  if (!key || input.candidatePaths.length < 2) return null
  await ensureSharp()
  try {
    const meta = await sharp(input.referenceScenePath).rotate().metadata()
    const W = Number(meta.width || 0)
    const H = Number(meta.height || 0)
    const box = { x: input.region.x * W, y: input.region.y * H, w: input.region.width * W, h: input.region.height * H }
    const side = Math.round(Math.min(W, H, Math.max(Math.max(box.w, box.h) * 2.2, Math.min(W, H) * 0.3)))
    const left = Math.round(Math.min(W - side, Math.max(0, box.x + box.w / 2 - side / 2)))
    const top = Math.round(Math.min(H - side, Math.max(0, box.y + box.h / 2 - side / 2)))
    const sceneCrop = await sharp(input.referenceScenePath).rotate().extract({ left, top, width: side, height: side }).resize(448, 448).jpeg({ quality: 85 }).toBuffer()
    const dataUrl = (buf: Buffer) => `data:image/jpeg;base64,${buf.toString('base64')}`
    const content: any[] = [
      {
        type: 'text',
        text: [
          'Image 0 shows a product (jewelry or small item) as it appears in a photo: worn, held between fingers, or placed.',
          `Images 1 to ${input.candidatePaths.length} are photos of a NEW product from different angles.`,
          'Pick the candidate whose camera angle best matches how the item in Image 0 is oriented: which side faces the camera, whether it is seen from the front, tilted, from the side or edge-on, lying flat or standing.',
          'Ignore design differences; judge only the viewing angle and pose. Prefer a candidate that shows the same number of pieces as Image 0 when angles are similar.',
          'The product is being sold, so its decorated front (stones, charm, logo) must stay visible: never pick a rear or back view unless Image 0 clearly shows the back of the item; between a tilted front view and a tilted rear view, pick the front one.',
          'Do not pick a close-up detail crop.',
          'First COUNT how many pieces of the item are in Image 0 (look carefully: two earrings side by side, overlapping, or one behind the other count as 2).',
          'Return JSON only: {"count": <1 or 2>, "best": <candidate number 1..N>}',
        ].join('\n'),
      },
      { type: 'text', text: 'Image 0:' },
      { type: 'image_url', image_url: { url: dataUrl(sceneCrop) } },
    ]
    for (const [index, path] of input.candidatePaths.entries()) {
      const thumb = await sharp(path).rotate().flatten({ background: '#ffffff' }).resize(288, 288, { fit: 'inside' }).jpeg({ quality: 82 }).toBuffer()
      content.push({ type: 'text', text: `Candidate ${index + 1}:` })
      content.push({ type: 'image_url', image_url: { url: dataUrl(thumb) } })
    }
    const host = grsHost(input.credentials)
    const model = String(input.credentials.grsaiAnalysisModel || 'gemini-3.1-pro').trim() || 'gemini-3.1-pro'
    // 对话模型看多张图比较慢，偶尔超时：最多试两次
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        const res = await fetch(`${host}/v1/chat/completions`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, stream: false, temperature: 0, messages: [{ role: 'user', content }] }),
          signal: AbortSignal.timeout(120_000),
        })
        const text = await res.text()
        if (!res.ok) continue
        const parsed = JSON.parse(extractJsonObjectText(extractModelMessageContent(text)))
        const best = Math.round(Number(parsed?.best))
        if (!Number.isFinite(best) || best < 1 || best > input.candidatePaths.length) continue
        const pair = Number(parsed?.count) >= 2 || parsed?.pair === true
        // 原图是一对、挑的图却只有一只（比如侧面图）：一只会被拉大去填两只的位置。换成有一对的图
        const counts = await Promise.all(input.candidatePaths.map((path) => countProductPieces(path).catch(() => 1)))
        let index = best - 1
        if (pair && counts[index] < 2) {
          const pairIndex = counts.findIndex((count) => count >= 2)
          if (pairIndex >= 0) index = preferredPairIndex(input.candidatePaths, counts) ?? pairIndex
        }
        return { path: input.candidatePaths[index], pair, index: index + 1 }
      } catch (error) {
        console.warn('[live-photo] pick product view failed', attempt, (error as Error)?.message || error)
      }
    }
    return null
  } catch {
    return null
  }
}

/**
 * 六视图里哪几格能拿来贴：按生成提示词固定顺序是 正面、3/4 正面、侧面、背面、3/4 背面、细节。
 * 背面两格看不到商品正面（钻、吊坠），卖货用不上，对话模型却常挑它（2026-11-27 实测 6 次挑了 2 次）；
 * 侧面那格也不要：侧面朝镜头的参考图在入口就拦掉了，放进来只会被误挑，贴出来是一条细边（2026-11-28 测试集 30 条里 3 条）
 */
export function pasteUsableBoardViews(views: string[]) {
  return views.length === 6 ? views.filter((_, index) => index !== 2 && index !== 3 && index !== 4) : views
}

/**
 * 抠图保留一对还是只留一只：戴在身上（一只耳朵）一定只留一只。
 * 挑图时看到参考图里「两件」可能是耳朵上的另一个耳钉、或者一朵花的几瓣，按一对贴就是两只挤在一只耳朵上（2026-11-28 测试集 2 条）
 */
export function resolveCutoutPair(pickedPair: boolean, interactionMode?: string) {
  if (String(interactionMode || '') === 'worn') return false
  return pickedPair
}

/** 有一对的候选里优先 3/4 正面（六视图第 2 格），其次正面（第 1 格），再其次商品原图 */
function preferredPairIndex(paths: string[], counts: number[]) {
  const order = [/view-2.png$/i, /view-1.png$/i]
  for (const re of order) {
    const index = paths.findIndex((path, i) => re.test(path) && counts[i] >= 2)
    if (index >= 0) return index
  }
  return undefined
}

/**
 * 数商品图里有几件（白底、黑底都行）：按四角估背景色，和背景差得多的算商品，
 * 数连在一起的大块；小块（不到最大块的 35%）是字、碎屑，不算。
 */
export async function countProductPieces(imagePath: string) {
  await ensureSharp()
  const size = 400
  const { data, info } = await sharp(imagePath).rotate().flatten({ background: '#ffffff' }).resize(size, size, { fit: 'inside' }).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const w = info.width
  const h = info.height
  const px = (x: number, y: number) => {
    const i = (y * w + x) * 3
    return [data[i], data[i + 1], data[i + 2]]
  }
  const corners = [px(1, 1), px(w - 2, 1), px(1, h - 2), px(w - 2, h - 2)]
  const bg = [0, 1, 2].map((c) => corners.reduce((sum, p) => sum + p[c], 0) / corners.length)
  const solid = new Uint8Array(w * h)
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const [r, g, b] = px(x, y)
      if (Math.abs(r - bg[0]) + Math.abs(g - bg[1]) + Math.abs(b - bg[2]) > 60) solid[y * w + x] = 1
    }
  }
  const seen = new Uint8Array(w * h)
  const sizes: number[] = []
  const stack: number[] = []
  for (let start = 0; start < w * h; start += 1) {
    if (!solid[start] || seen[start]) continue
    let count = 0
    seen[start] = 1
    stack.push(start)
    while (stack.length) {
      const index = stack.pop()!
      count += 1
      const x = index % w
      const y = (index - x) / w
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
          const next = ny * w + nx
          if (solid[next] && !seen[next]) {
            seen[next] = 1
            stack.push(next)
          }
        }
      }
    }
    sizes.push(count)
  }
  if (!sizes.length) return 0
  const largest = Math.max(...sizes)
  const blobs = sizes.filter((size) => size >= largest * 0.35).length
  // 一对挨得很近时会连成一块：再按竖向空隙分段（商品图里一对通常左右并排）
  const colFill = new Array(w).fill(0)
  for (let x = 0; x < w; x += 1) for (let y = 0; y < h; y += 1) if (solid[y * w + x]) colFill[x] += 1
  const runs: number[] = []
  let run = 0
  for (let x = 0; x < w; x += 1) {
    if (colFill[x] > h * 0.01) run += 1
    else if (run) {
      runs.push(run)
      run = 0
    }
  }
  if (run) runs.push(run)
  const widest = Math.max(0, ...runs)
  const columns = runs.filter((value) => value >= widest * 0.35).length
  return Math.max(blobs, columns)
}
