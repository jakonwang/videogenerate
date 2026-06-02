import type { Product, SegmentKey } from '../products/types'
import type { Template } from '../templates/types'
import { getAssetsForProductSegment } from '../../../shared/productAssets'
import { pickSingleBgmPathFromTemplate } from '../../lib/bgmPaths'
import { probeMedia } from '../ffmpeg/probe'
import { resolveBundledLutPath } from '../../lib/luts'
import { resolveStickerByRefOrFileName } from '../../lib/stickers'
import {
  ASS_DEFAULT_FONT_FAMILY,
  ASS_DEFAULT_FONT_SIZE,
  ASS_DEFAULT_TITLE_MARGIN_V,
  ASS_DEFAULT_TTS_MARGIN_V,
} from '../../../shared/assDefaults'

export type SegmentPlan = {
  segment: SegmentKey
  assetId: string
  filePath: string
  startSec: number
  durationSec: number
  inputDurationSec?: number
  hasAudio: boolean
  /** 可解码原声在容器中的 stream index（新方案必有；旧任务缺省时渲染端回退 `a:0`） */
  audioStreamIndex?: number
  qualityScore?: number
  /** 是否对该段做水平镜像翻转（hflip） */
  hflip?: boolean
  fx?: {
    zoom: number
    moveX: number
    moveY: number
  }
  jitter?: {
    speed?: number
    color?: { brightness: number; contrast: number; saturation: number; hueDeg: number }
  }
}

export type VideoPlan = {
  totalDurationSec: number
  segments: SegmentPlan[]
  /** 全局手动调色（基础值，叠加在色彩微扰之前） */
  colorGrade?: { brightness: number; contrast: number; saturation: number } | null
  /** 画幅统一模式：完整展示（pad）/充满屏幕（居中裁切） */
  aspectUnifyMode?: 'contain_pad' | 'cover_crop'
  /** 3D LUT（.cube）滤镜（可选，渲染阶段挂载 lut3d） */
  lut3d?: { filePath: string } | null
  /** 彩色贴纸（PNG/WebP，overlay） */
  sticker?: { filePath: string; heightPx: number } | null
  bgm?: { filePath: string; volume: number } | null
  // 画面标题文案（无配音；任务阶段仅用于 ASS）
  titleOverlay?: { text: string } | null
  // TTS 配音文案（任务执行阶段生成 mp3；可与 titleOverlay 同时存在）
  tts?: {
    text: string
    voice?: string
    rate?: string
    pitch?: string
    ttsVolume?: string
    mixVolume?: number
    keepOriginal?: boolean
  } | null
  // ASS 字幕样式（任务执行阶段生成 .ass：可含标题 / 配音字幕）
  assStyle?: {
    enabled: boolean
    fontName: string
    fontSize: number
    preset: 'yellow_box' | 'white_shadow'
    marginV: number
    ttsMarginV: number
  } | null
  // 主配音（可能来自 TTS 生成的 mp3）
  voice?: { filePath: string; volume: number; keepOriginal: boolean } | null
  // ASS 字幕文件（任务执行阶段生成）
  ass?: { filePath: string } | null
  transition?: {
    enabled: boolean
    durationsSec: number[] // between segments
    transitions?: Array<
      'hardcut' | 'fade' | 'slideleft' | 'slideright' | 'pixelize' | 'circlecrop' | 'wipeup' | 'squeezev' | 'squeezeh'
    > // between segments
  }
  audio?: { source?: 'keep' | 'mute'; ducking: { enabled: boolean; amountDb: number } }
}

function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function randFloat(min: number, max: number) {
  return Math.random() * (max - min) + min
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

/** 文案池：每项可含换行；展开为「非空行」列表（**配音**抽签等：按行打散） */
export function flattenTextPoolToLines(pool: unknown): string[] {
  const out: string[] = []
  for (const x of Array.isArray(pool) ? pool : []) {
    for (const line of String(x).replace(/\r\n/g, '\n').split('\n')) {
      const t = line.trim()
      if (t) out.push(t)
    }
  }
  return out
}

/**
 * 画面标题池：每项为一组（组内首行标题、余下为符号装饰行）；**不按行打散**，整条随机抽一组。
 * 兼容：若单条字符串内误合并了多组（组间空行），则先拆成子组再随机抽一条。
 */
export function pickTitleOverlayPoolEntry(pool: unknown): string | null {
  const arr = Array.isArray(pool) ? pool : []
  const cand = arr.map((x) => String(x ?? '').replace(/\r\n/g, '\n').trim()).filter((x) => x.length > 0)
  if (!cand.length) return null
  const raw = cand[randInt(0, cand.length - 1)]!
  const sub = raw.split(/\n\s*\n+/).map((x) => x.trim()).filter((x) => x.length > 0)
  if (sub.length > 1) return sub[randInt(0, sub.length - 1)]!
  return raw
}

function shuffle<T>(arr: T[]) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(0, i)
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function partialShuffleStructure(structure: SegmentKey[], mode: Template['randomizeOrder'] | undefined) {
  const conf = mode ?? { mode: 'none' as const }
  if (conf.mode === 'none') return structure
  const keepFirstCount = Math.max(0, Math.floor(conf.keepFirstCount ?? 1))
  if (keepFirstCount <= 0) return shuffle(structure)
  const head = structure.slice(0, keepFirstCount)
  const rest = structure.slice(keepFirstCount)
  return [...head, ...shuffle(rest)]
}

function pickFx(template: Template, segment: SegmentKey) {
  const fx = template.segmentFx?.[segment]
  const zoomR = fx?.zoom ?? { min: 1.0, max: 1.06 }
  const moveR = fx?.move ?? { x: { min: -0.04, max: 0.04 }, y: { min: -0.03, max: 0.03 } }
  const zoom = randFloat(zoomR.min, zoomR.max)
  const moveX = randFloat(moveR.x.min, moveR.x.max)
  const moveY = randFloat(moveR.y.min, moveR.y.max)
  return { zoom: Number(zoom.toFixed(4)), moveX: Number(moveX.toFixed(4)), moveY: Number(moveY.toFixed(4)) }
}

function pickHflip(template: Template, segment: SegmentKey) {
  const fx: any = template.segmentFx?.[segment]
  const allowed = Boolean(fx?.allowHflip)
  if (!allowed) return false
  return Math.random() > 0.5
}

function pickJitter(template: Template) {
  const conf = template.jitter
  const speedEnabled = Boolean(conf?.speed?.enabled)
  const colorEnabled = Boolean(conf?.color?.enabled)
  const speedR = conf?.speed?.range ?? { min: 0.98, max: 1.02 }
  const c = conf?.color ?? {
    enabled: true,
    brightness: { min: -0.02, max: 0.02 },
    contrast: { min: 0.98, max: 1.02 },
    saturation: { min: 0.98, max: 1.05 },
    hueDeg: { min: -2, max: 2 },
  }

  const speed = speedEnabled ? clamp(randFloat(speedR.min, speedR.max), 0.985, 1.015) : 1
  const color = colorEnabled
    ? {
        brightness: Number(clamp(randFloat(c.brightness.min, c.brightness.max), -0.2, 0.2).toFixed(4)),
        contrast: Number(clamp(randFloat(c.contrast.min, c.contrast.max), 0.7, 1.3).toFixed(4)),
        saturation: Number(clamp(randFloat(c.saturation.min, c.saturation.max), 0.7, 1.6).toFixed(4)),
        hueDeg: Number(clamp(randFloat(c.hueDeg.min, c.hueDeg.max), -45, 45).toFixed(3)),
      }
    : null

  return {
    speed: Number(speed.toFixed(4)),
    color,
  }
}

function weightForSegment(segment: SegmentKey, idx: number) {
  // 经验值：开头段相对短一点，后面段容纳更多信息
  if (segment === 'hook' || idx === 0) return 1.0
  if (segment === 'detail') return 1.25
  if (segment === 'show') return 1.35
  return 1.2
}

/**
 * 时长逻辑自洽：
 * - 先按每段范围随机抽样得到初始时长
 * - 如果总和不在 [totalMin,totalMax]，则按权重等比例缩放到边界（min 或 max）
 * - 之后做 clamp（回到各段 min/max）并按权重分摊残差，尽量逼近 target
 */
function allocateDurations(input: { structure: SegmentKey[]; template: Template }) {
  const { structure, template } = input
  const totalMin = template.totalDurationSec.min
  const totalMax = template.totalDurationSec.max

  const dur: Record<string, number> = {}
  for (const s of structure) {
    const r = template.segmentDurationSec[s] ?? { min: 1, max: 6 }
    dur[s] = randFloat(r.min, r.max)
  }

  const sum0 = structure.reduce((a, s) => a + dur[s], 0)
  // 若初始总和已在区间内，就保持它（减少人为拉伸，让随机更自然）
  const target = sum0 < totalMin ? totalMin : sum0 > totalMax ? totalMax : sum0

  // 按权重等比例缩放（权重用于“误差分配”，缩放本身仍按同一比例，避免破坏段内相对时长）
  const scale = sum0 > 0 ? target / sum0 : 1
  for (const s of structure) dur[s] *= scale

  // clamp 回每段范围
  for (const s of structure) {
    const r = template.segmentDurationSec[s] ?? { min: 1, max: 6 }
    dur[s] = clamp(dur[s], r.min, r.max)
  }

  // 按权重分摊残差（多轮迭代，直到接近 target）
  let current = structure.reduce((a, s) => a + dur[s], 0)
  let diff = target - current

  for (let it = 0; it < 10 && Math.abs(diff) > 0.02; it++) {
    const adjustable = structure.filter((s) => {
      const r = template.segmentDurationSec[s] ?? { min: 1, max: 6 }
      return diff > 0 ? dur[s] < r.max - 1e-6 : dur[s] > r.min + 1e-6
    })
    if (!adjustable.length) break

    const wSum = adjustable.reduce((a, s) => a + weightForSegment(s, structure.indexOf(s)), 0) || 1
    for (const s of adjustable) {
      if (Math.abs(diff) <= 0.02) break
      const r = template.segmentDurationSec[s] ?? { min: 1, max: 6 }
      const portion = weightForSegment(s, structure.indexOf(s)) / wSum
      const step = diff * portion
      const next = clamp(dur[s] + step, r.min, r.max)
      diff -= next - dur[s]
      dur[s] = next
    }

    current = structure.reduce((a, s) => a + dur[s], 0)
    diff = target - current
  }

  return structure.map((s) => Number(dur[s].toFixed(3)))
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n))
}

function weightedPick<T>(items: T[], weight: (x: T) => number) {
  if (!items.length) return null
  let total = 0
  const w: number[] = []
  for (const it of items) {
    const v = Math.max(0, Number(weight(it) ?? 0))
    w.push(v)
    total += v
  }
  if (total <= 0) return items[randInt(0, items.length - 1)]
  let r = Math.random() * total
  for (let i = 0; i < items.length; i++) {
    r -= w[i]
    if (r <= 0) return items[i]
  }
  return items[items.length - 1]
}

function scoreFromAssetMeta(a: any) {
  const s = Number(a?.qualityScore ?? NaN)
  if (!Number.isFinite(s)) return null
  return Math.max(0, Math.min(100, Math.round(s)))
}

export type UsedAssetsRegistry = {
  hasFilePath(filePath: string): boolean
  normalizeFilePath(filePath: string): string
}

export function createUsedAssetsRegistry(seed?: Iterable<string>): UsedAssetsRegistry & { addFilePath(filePath: string): void } {
  const set = new Set<string>()
  for (const p of seed ?? []) set.add(String(p))
  const normalizeFilePath = (filePath: string) => {
    const p = String(filePath ?? '').replace(/\\/g, '/').trim()
    if (!p) return ''
    return process.platform === 'win32' ? p.toLowerCase() : p
  }
  return {
    normalizeFilePath,
    hasFilePath(filePath: string) {
      const k = normalizeFilePath(filePath)
      return k ? set.has(k) : false
    },
    addFilePath(filePath: string) {
      const k = normalizeFilePath(filePath)
      if (k) set.add(k)
    },
  }
}

function pickAssetUniqueByFilePath(input: {
  assets: any[]
  used?: UsedAssetsRegistry | null
  /** 当前 plan 内临时占用（避免同一条成片内也重复） */
  reservedNormalized?: Set<string>
}) {
  const assets = Array.isArray(input.assets) ? input.assets : []
  if (!assets.length) return null

  const used = input.used ?? null
  const reserved = input.reservedNormalized ?? new Set<string>()

  const cand = assets.filter((a) => {
    const fp = String(a?.filePath ?? '').trim()
    if (!fp) return false
    if (!used) return true
    const k = used.normalizeFilePath(fp)
    if (!k) return false
    if (reserved.has(k)) return false
    if (used.hasFilePath(fp)) return false
    return true
  })

  if (!cand.length) return null
  // 唯一性优先：严格从可用集合里均匀随机抽取（禁止质量分加权导致偏置）
  return cand[randInt(0, cand.length - 1)]
}

export async function buildRandomPlan(input: {
  product: Product
  template: Template
  /** 批次级素材占用（按 filePath 绝对排他）；仅用于“过滤候选”，不在这里提交写入 */
  usedAssets?: UsedAssetsRegistry | null
}): Promise<{ plan: VideoPlan; consumedFilePaths: string[] }> {
  const { product, template } = input
  const baseStructure = template.structure.length ? template.structure : (['hook', 'show', 'detail'] as SegmentKey[])
  const structure = partialShuffleStructure(baseStructure, template.randomizeOrder)
  const durations = allocateDurations({ structure, template })

  const segments: SegmentPlan[] = []
  const consumedNormalized = new Set<string>()
  const consumedFilePaths: string[] = []
  const skipStart = Math.max(0, Number(template.skipStartSec ?? 1.5))
  for (let idx = 0; idx < structure.length; idx++) {
    const segment = structure[idx]
    const assets = getAssetsForProductSegment(product.assets as Record<string, unknown>, segment) as any[]
    if (!assets.length) {
      throw new Error(`产品缺少素材段位：${segment}`)
    }

    const chosen = pickAssetUniqueByFilePath({
      assets,
      used: input.usedAssets ?? null,
      reservedNormalized: consumedNormalized,
    })
    if (!chosen) {
      throw new Error(`素材已耗尽：段位 ${segment} 可用素材不足以满足“批次内唯一”`)
    }
    const chosenFilePath = String(chosen.filePath ?? '').trim()
    if (!chosenFilePath) {
      throw new Error(`素材路径无效：段位 ${segment}`)
    }
    if (input.usedAssets) {
      const k = input.usedAssets.normalizeFilePath(chosenFilePath)
      if (k) consumedNormalized.add(k)
    }
    consumedFilePaths.push(chosenFilePath)
    const durationSec = durations[idx]
    const jitter = pickJitter(template)
    const speed = jitter.speed || 1
    // 为了让“输出时长”保持 durationSec：先裁更长的输入片段，再用 speed 微扰到目标时长
    const inputDurationSec = Number(clamp(durationSec * speed, 0.2, 30).toFixed(3))
    const meta = await probeMedia(chosenFilePath)
    const maxStart = Math.max(0, (meta.durationSec || 0) - inputDurationSec - 0.05)
    const minStart = maxStart >= skipStart + 0.05 ? skipStart : 0
    const startSec = maxStart > minStart ? randFloat(minStart, maxStart) : 0
    const fx = pickFx(template, segment)
    const hflip = pickHflip(template, segment)
    segments.push({
      segment,
      assetId: chosen.id,
      filePath: chosenFilePath,
      startSec: Number(startSec.toFixed(3)),
      durationSec: Number(durationSec.toFixed(3)),
      inputDurationSec,
      hasAudio: meta.hasAudio,
      ...(meta.audioStreamIndex !== undefined ? { audioStreamIndex: meta.audioStreamIndex } : {}),
      qualityScore: scoreFromAssetMeta(chosen) ?? undefined,
      hflip,
      fx,
      jitter: {
        speed,
        color: jitter.color ?? undefined,
      },
    })
  }

  const totalDurationSec = Number(segments.reduce((a, s) => a + s.durationSec, 0).toFixed(3))

  // 转场：生成 n-1 个转场时长（并确保不超过相邻片段时长的一半，避免 offset 负数）
  const tConf: any =
    (template as any).transition ?? { enabled: false, pool: ['fade'], durationSec: { min: 0.12, max: 0.28 } }
  let durationsSec: number[] = []
  let transitions: Array<
    'hardcut' | 'fade' | 'slideleft' | 'slideright' | 'pixelize' | 'circlecrop' | 'wipeup' | 'squeezev' | 'squeezeh'
  > = []
  if (tConf.enabled && segments.length > 1) {
    const poolRaw = Array.isArray(tConf.pool) ? tConf.pool : []
    const pool = (poolRaw.length ? poolRaw : ['fade'])
      .map((x: any) => String(x))
      .filter((x: string) =>
        ['hardcut', 'fade', 'slideleft', 'slideright', 'pixelize', 'circlecrop', 'wipeup', 'squeezev', 'squeezeh'].includes(x),
      ) as Array<'hardcut' | 'fade' | 'slideleft' | 'slideright' | 'pixelize' | 'circlecrop' | 'wipeup' | 'squeezev' | 'squeezeh'>
    const safePool = pool.length ? pool : (['fade'] as const)
    durationsSec = segments.slice(1).map((_, i) => {
      const prev = segments[i].durationSec
      const next = segments[i + 1].durationSec
      const raw = randFloat(tConf.durationSec.min, tConf.durationSec.max)
      const cap = Math.max(0.05, Math.min(prev, next) * 0.35)
      return Number(clamp(raw, 0.05, cap).toFixed(3))
    })
    transitions = segments.slice(1).map(() => safePool[randInt(0, safePool.length - 1)]!)
  }

  // 画面标题：独立文案池（无配音）；每项一组（可两行：标题+符号行），每条成片随机抽一组
  const titleConf: any = (template as any).titleOverlay
  const titleEnabled = Boolean(titleConf?.enabled)
  const titleText = titleEnabled ? pickTitleOverlayPoolEntry(titleConf?.textPool) : null

  // 手动调色（全局基础值）：与轻量色彩微扰平滑叠加（brightness 相加；contrast/saturation 相乘）
  const cg: any = (template as any).colorGrade
  const colorGrade =
    cg && typeof cg === 'object' && Boolean(cg.enabled)
      ? {
          brightness: Number(cg.brightness ?? 0),
          contrast: Number(cg.contrast ?? 1),
          saturation: Number(cg.saturation ?? 1),
        }
      : null
  const aspectUnifyMode = ((template as any).aspectUnifyMode === 'cover_crop' ? 'cover_crop' : 'contain_pad') as
    | 'contain_pad'
    | 'cover_crop'

  const lutFileName = String((template as any).lut3d?.fileName ?? '').trim()
  const lutAbs = lutFileName ? resolveBundledLutPath(lutFileName) : null

  const stickerRef = String((template as any).sticker?.ref ?? '').trim()
  const stickerFileName = String((template as any).sticker?.fileName ?? '').trim()
  const stickerResolved = resolveStickerByRefOrFileName({
    ref: stickerRef,
    fileName: stickerFileName,
  })
  const stickerHeightPx = Math.max(40, Math.min(800, Math.round(Number((template as any).sticker?.heightPx ?? 180) || 180)))

  // TTS：与画面标题相同规则——按「行」候选，避免一段多行在底部字幕一次性叠三行
  const ttsConf: any = (template as any).tts
  const ttsEnabled = Boolean(ttsConf?.enabled)
  const ttsPool = flattenTextPoolToLines(ttsConf?.textPool)
  const ttsText = ttsEnabled && ttsPool.length ? ttsPool[randInt(0, ttsPool.length - 1)] : null

  // ASS 字幕样式（可选）
  const assConf: any = (template as any).assSubtitle
  const assStyle =
    assConf && typeof assConf === 'object'
      ? {
          enabled: Boolean(assConf.enabled),
          fontName: String(assConf.fontName ?? ASS_DEFAULT_FONT_FAMILY),
          fontSize: Number(assConf.fontSize ?? ASS_DEFAULT_FONT_SIZE),
          preset: (assConf.preset === 'white_shadow' ? 'white_shadow' : 'yellow_box') as any,
          marginV: Number(assConf.marginV ?? ASS_DEFAULT_TITLE_MARGIN_V),
          ttsMarginV: Number(assConf.ttsMarginV ?? ASS_DEFAULT_TTS_MARGIN_V),
        }
      : {
          enabled: false,
          fontName: ASS_DEFAULT_FONT_FAMILY,
          fontSize: ASS_DEFAULT_FONT_SIZE,
          preset: 'yellow_box' as const,
          marginV: ASS_DEFAULT_TITLE_MARGIN_V,
          ttsMarginV: ASS_DEFAULT_TTS_MARGIN_V,
        }

  // BGM：模板可多首；每条成片只随机 1 首，plan 仅保留 filePath（禁止把 filePaths 带进 plan）
  const bgmVolume = (template.bgm as any)?.volume
  const pickedBgmPath = pickSingleBgmPathFromTemplate(template)

  const plan: VideoPlan = {
    totalDurationSec,
    segments,
    colorGrade,
    aspectUnifyMode,
    lut3d: lutAbs ? { filePath: lutAbs } : null,
    sticker: stickerResolved ? { filePath: stickerResolved.filePath, heightPx: stickerHeightPx } : null,
    bgm: pickedBgmPath ? { filePath: pickedBgmPath, volume: Number(bgmVolume ?? 0.25) } : null,
    titleOverlay: titleText ? { text: titleText } : null,
    tts: ttsText
      ? {
          text: ttsText,
          voice: typeof ttsConf?.voice === 'string' ? ttsConf.voice : undefined,
          rate: typeof ttsConf?.rate === 'string' ? ttsConf.rate : undefined,
          pitch: typeof ttsConf?.pitch === 'string' ? ttsConf.pitch : undefined,
          ttsVolume: typeof ttsConf?.ttsVolume === 'string' ? ttsConf.ttsVolume : undefined,
          mixVolume: Number(ttsConf?.mixVolume ?? 0.9),
          keepOriginal: Boolean(ttsConf?.keepOriginal ?? true),
        }
      : null,
    assStyle,
    voice: null,
    ass: null,
    transition: { enabled: Boolean(tConf.enabled), durationsSec, transitions },
    audio: template.audio ?? { source: 'keep', ducking: { enabled: true, amountDb: 14 } },
  }

  return { plan, consumedFilePaths }
}

