/**
 * 图生视频「贴真实商品」替换：
 *   1. AI 只擦掉参考图框里的旧商品（补成皮肤 / 背景）
 *   2. 腾讯云抠出真实商品（服务器代办，密钥不在本机）
 *   3. 按摆放（位置、大小、角度）把真实商品贴到擦好的图上 —— 大小、位置由程序决定，不交给 AI 猜
 *   4. Nano Banana 只做融合（穿戴关系、接触阴影、反光），提示词要求大小、位置、款式都不许变
 *   5. 只把商品附近贴回原图，其余像素保持原样
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
import type { LivePhotoProductPlacement, LivePhotoReplacementRegion } from './types'
import { compositeLivePhotoReplacementCrop, prepareLivePhotoReplacementCrop } from './replacementRegion'

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
export async function ensureProductCutout(sourcePath: string): Promise<{ path: string; width: number; height: number }> {
  if (!cutoutProvider) throw new Error('[cutout_unavailable] 贴真实商品需要登录账号（抠图在服务器上完成）')
  await ensureSharp()
  const source = await readFile(sourcePath)
  // v2：成对的商品只留一只（规则变了，旧缓存不能再用）
  const hash = createHash('sha1').update('v2:').update(source).digest('hex').slice(0, 20)
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
  keepSinglePiece(rgba, info.width, info.height)
  await mkdir(dirname(output), { recursive: true })
  const trimmed = await sharp(rgba, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toBuffer()
  await sharp(trimmed).trim({ threshold: 1 }).png().toFile(output)
  const meta = await sharp(output).metadata()
  return { path: output, width: meta.width, height: meta.height }
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
}): LivePhotoProductPlacement {
  const boxW = input.region.width * input.sceneWidth
  const boxH = input.region.height * input.sceneHeight
  const scale = Math.min(boxW / Math.max(1, input.cutoutWidth), boxH / Math.max(1, input.cutoutHeight))
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
    ...(Number.isFinite(num('confirmedAt')) && num('confirmedAt') > 0 ? { confirmedAt: num('confirmedAt') } : {}),
  }
}

/** 商品贴上去后在图里占的范围（像素，含旋转后的外接框） */
function placementPixelBounds(placement: LivePhotoProductPlacement, sceneW: number, sceneH: number, cutoutW: number, cutoutH: number) {
  const w = placement.width * sceneW
  const h = (w * cutoutH) / Math.max(1, cutoutW)
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
  const product = await sharp(input.cutoutPath)
    .resize(Math.max(1, Math.round(box.w)), Math.max(1, Math.round(box.h)), { kernel: 'lanczos3', fit: 'fill' })
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
  const maskPath = input.outputPath.replace(/.png$/i, '-mask.png')
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
async function generateWithGrs(input: {
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
  if (/neck|pendant|项链|吊坠/.test(type)) return ['It is a necklace worn at that spot: the chain lies on the skin and follows the neck and collarbone, the pendant hangs with gravity.']
  if (/brace|bangle|手链|手镯/.test(type)) return ['It is a bracelet worn on the wrist at that spot: it wraps around the wrist and the back part is hidden behind the wrist.']
  return ['It is held, worn, or placed at that spot exactly like the original item was: keep the same kind of contact with fingers, body, or surface.']
}

/**
 * 融合：把「摆放图」交给 AI，让商品看起来是真的戴着 / 拿着 / 放着；大小、位置、款式都不许变。
 * 结果只把商品附近贴回原图。
 */
export async function harmonizePlacedProduct(input: {
  credentials: ModelCredentials
  referenceScenePath: string
  guidePath: string
  /** 擦掉旧商品的整张图（融合结果贴回到它上面）和商品形状蒙版（见 renderPlacementGuide） */
  erasedScenePath: string
  productMaskPath: string
  productImagePath: string
  productType?: string
  productBounds: { left: number; top: number; width: number; height: number }
  region: LivePhotoReplacementRegion
  outputPath: string
}) {
  await ensureSharp()
  const meta = await sharp(input.guidePath).metadata()
  const W = meta.width
  const H = meta.height
  // 新商品和原商品框的并集（擦掉的旧商品也在里面）
  const region = { left: input.region.x * W, top: input.region.y * H, width: input.region.width * W, height: input.region.height * H }
  const left = Math.min(region.left, input.productBounds.left)
  const top = Math.min(region.top, input.productBounds.top)
  const right = Math.max(region.left + region.width, input.productBounds.left + input.productBounds.width)
  const bottom = Math.max(region.top + region.height, input.productBounds.top + input.productBounds.height)
  const union = { left, top, width: right - left, height: bottom - top }
  // 交给 AI 的是商品周围一块正方形（至少画面短边的 45%）：AI 出 1:1 的图，缩回去不变形，贴回时不会错位
  const side = Math.round(Math.min(W, H, Math.max(Math.max(union.width, union.height) * 3, Math.min(W, H) * 0.45)))
  const cx = union.left + union.width / 2
  const cy = union.top + union.height / 2
  const crop = {
    left: Math.round(Math.min(W - side, Math.max(0, cx - side / 2))),
    top: Math.round(Math.min(H - side, Math.max(0, cy - side / 2))),
    width: side,
    height: side,
  }
  const cropPath = input.outputPath.replace(/\.png$/i, '-crop.png')
  const aiPath = input.outputPath.replace(/\.png$/i, '-ai.png')
  await mkdir(dirname(cropPath), { recursive: true })
  await sharp(input.guidePath).extract(crop).png().toFile(cropPath)
  const { model } = await generateWithGrs({
    credentials: input.credentials,
    prompt: [
      `Image 1 is a close-up photo where the product (${String(input.productType || 'product').trim() || 'product'}) has been roughly pasted in as a flat cut-out. Its SIZE and POSITION are correct, but it does not look worn yet.`,
      'Image 2 is the same product photographed alone: use it for the exact design.',
      ...wearingInstructions(input.productType),
      'Re-render the product so it looks physically real in this photo: correct 3D angle that follows the body, correct depth and occlusion (parts behind skin are hidden), soft contact shadow, and reflections that match the scene light. It must not look like a sticker on top of the photo.',
      'Keep the overall size the same as in Image 1 — do not enlarge or shrink it — and keep it attached at the same spot.',
      'Keep the design exactly as in Image 2: same shape, same stones and details, same color and material. Do not add or remove parts.',
      'Keep everything else in Image 1 exactly the same: people, skin, hair, hands, background, lighting, framing, and crop.',
    ].join('\n'),
    imagePaths: [cropPath, input.productImagePath],
    aspectRatio: '1:1',
    outputPath: aiPath,
    uploadKeyPrefix: 'grsai-input/live-photo/harmonize',
  })
  // AI 结果缩回正方形原大小，放回整张图的同一位置
  const aiCrop = await sharp(aiPath).resize(side, side, { fit: 'fill' }).png().toBuffer()
  const erased = await sharp(input.erasedScenePath).rotate().resize(W, H, { fit: 'fill' }).png().toBuffer()
  const ai = await sharp(erased).composite([{ input: aiCrop, left: crop.left, top: crop.top }]).removeAlpha().png().toBuffer()
  // 只按商品的形状往外扩一圈贴回（接触阴影、穿孔都在这圈里），其余全用擦好的原图。
  // AI 重画时整块会有轻微位移和色差，按方块贴回会看出一块补丁（2026-11-27 线上实测）
  const productSize = Math.max(input.productBounds.width, input.productBounds.height)
  const grow = Math.max(3, productSize * 0.25)
  const expanded = await sharp(input.productMaskPath)
    .resize(W, H, { fit: 'fill' })
    .extractChannel(0)
    .blur(grow)
    .linear(8, 0)
    .extractChannel(0)
    .png()
    .toBuffer()
  const softMask = await sharp(expanded).blur(Math.max(1.5, grow * 0.6)).extractChannel(0).raw().toBuffer()
  const overlay = await sharp(ai).removeAlpha().joinChannel(softMask, { raw: { width: W, height: H, channels: 1 } }).png().toBuffer()
  await mkdir(dirname(input.outputPath), { recursive: true })
  await sharp(erased).composite([{ input: overlay, left: 0, top: 0 }]).png().toFile(input.outputPath)
  return { path: input.outputPath, model }
}

export async function readImageSize(path: string) {
  await ensureSharp()
  const meta = await sharp(path).rotate().metadata()
  return { width: Number(meta.width || 0), height: Number(meta.height || 0) }
}
