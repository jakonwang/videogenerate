import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { productsRepo } from '../products/repo'
import { templatesRepo } from '../templates/repo'
import { buildRandomPlan, createUsedAssetsRegistry } from '../random/engine'
import { computePlanHash } from '../dedupe/hash'
import { dedupeRepo } from '../dedupe/repo'
import type { Product } from '../products/types'
import type { Template } from '../templates/types'
import { segmentHasAssets } from '../../../shared/productAssets'

function jaccard(a: string[], b: string[]) {
  const A = new Set(a)
  const B = new Set(b)
  let inter = 0
  for (const x of A) if (B.has(x)) inter++
  const union = A.size + B.size - inter
  return union === 0 ? 0 : inter / union
}

function safeName(s: string) {
  return s.replace(/[\\/:*?"<>|]+/g, '_').trim()
}

export type BatchEnqueueHintCode =
  | 'missing_assets'
  | 'plan_build_failed'
  | 'dedupe'
  | 'similarity'
  | 'overuse'
  | 'generic'

/** 根据跳过原因占比给出 UI 提示码（buildPlanFail ≠ 缺素材，常为 ffprobe/路径失败） */
function resolveHintCode(
  skipped: { buildPlanFail: number; dedupeExists: number; tooSimilar: number; overuse: number },
  enqueued: number,
  requested: number,
): BatchEnqueueHintCode | null {
  if (enqueued >= requested) return null
  const m = Math.max(skipped.buildPlanFail, skipped.dedupeExists, skipped.tooSimilar, skipped.overuse)
  if (m <= 0) return 'generic'
  if (skipped.buildPlanFail >= m) return 'plan_build_failed'
  if (skipped.dedupeExists >= m) return 'dedupe'
  if (skipped.tooSimilar >= m) return 'similarity'
  if (skipped.overuse >= m) return 'overuse'
  return 'generic'
}

/** 与 buildRandomPlan 一致：模板 structure 为空时退回 hook/show/detail */
function requiredSegmentsForTemplate(template: Template): string[] {
  const base = template.structure?.length
    ? template.structure.map((x) => String(x))
    : (['hook', 'show', 'detail'] as string[])
  const seen = new Set<string>()
  const out: string[] = []
  for (const s of base) {
    const k = String(s).trim()
    if (!k || seen.has(k)) continue
    seen.add(k)
    out.push(k)
  }
  return out.length ? out : ['hook', 'show', 'detail']
}

/** 模板要求的段位中，产品在磁盘上无任何素材的段位名（用于精准提示） */
function missingAssetSegmentKeys(product: Product, template: Template): string[] {
  const missing: string[] = []
  const raw = product.assets as Record<string, unknown> | undefined
  for (const seg of requiredSegmentsForTemplate(template)) {
    if (!segmentHasAssets(raw, seg)) missing.push(seg)
  }
  return missing
}

function normalizeForCount(filePath: string) {
  const p = String(filePath ?? '').replace(/\\/g, '/').trim()
  if (!p) return ''
  return process.platform === 'win32' ? p.toLowerCase() : p
}

function uniqueAssetFileCountForSegment(product: Product, segment: string): number {
  const raw = (product.assets as Record<string, unknown>) ?? {}
  const arr = (raw as any)?.[segment]
  const list = Array.isArray(arr) ? arr : []
  const s = new Set<string>()
  for (const a of list) {
    const fp = normalizeForCount(String((a as any)?.filePath ?? ''))
    if (fp) s.add(fp)
  }
  return s.size
}

/** 按模板 structure 的“段位出现次数”计算批次内唯一素材的最低需求 */
function computeMaxUniqueVideosForBatch(input: { product: Product; template: Template }): number {
  const structure = input.template.structure?.length
    ? input.template.structure.map((x) => String(x).trim()).filter(Boolean)
    : (['hook', 'show', 'detail'] as string[])

  const occ = new Map<string, number>()
  for (const seg of structure) occ.set(seg, (occ.get(seg) ?? 0) + 1)

  let maxN = Number.POSITIVE_INFINITY
  for (const [seg, timesPerVideo] of occ.entries()) {
    const avail = uniqueAssetFileCountForSegment(input.product, seg)
    const perSegMax = timesPerVideo > 0 ? Math.floor(avail / timesPerVideo) : 0
    maxN = Math.min(maxN, perSegMax)
  }

  if (!Number.isFinite(maxN)) return 0
  return Math.max(0, Math.floor(maxN))
}

export async function createBatchTasks(input: { productId: string; templateId: string; count: number; outDir: string }) {
  const outDir = String(input.outDir ?? '').trim()
  if (!outDir) throw new Error('输出目录不能为空')
  await mkdir(outDir, { recursive: true })

  const [products, templates] = await Promise.all([productsRepo.list(), templatesRepo.list()])
  const product = products.find((p) => p.id === input.productId)
  if (!product) throw new Error('未找到产品')
  const template = templates.find((t) => t.id === input.templateId)
  if (!template) throw new Error('未找到模板')

  const requestedRaw = Math.max(1, Number(input.count) || 1)

  const missingSegments = missingAssetSegmentKeys(product, template)
  if (missingSegments.length) {
    return {
      tasks: [],
      meta: {
        requested: requestedRaw,
        enqueued: 0,
        attempts: 0,
        guardMax: Math.max(50, requestedRaw * 30),
        skipped: { guardBreak: 0, buildPlanFail: 0, overuse: 0, tooSimilar: 0, dedupeExists: 0 },
        hint: null,
        hintCode: 'missing_assets' as const,
        missingSegments,
      },
    }
  }

  // Critical Requirement：批次内素材唯一性（按 filePath 绝对排他）
  // 行为调整：若用户输入超过最大可生成数量，则自动降为 maxPossible 并提示用户；仅当 maxPossible=0 才阻断。
  const maxPossible = computeMaxUniqueVideosForBatch({ product, template })
  if (maxPossible <= 0) {
    throw new Error(`素材数量不足以支持生成 ${requestedRaw} 条不重复视频，请补充素材或减少生成数量。`)
  }
  const requested = Math.min(requestedRaw, maxPossible)
  const guardMax = Math.max(50, requested * 30)
  const cappedHint =
    requestedRaw > maxPossible
      ? `你输入的数量为 ${requestedRaw}，当前素材在“批次内唯一”规则下最多只能生成 ${maxPossible} 条，已自动按 ${maxPossible} 条开始生成。`
      : ''

  const tasks: Array<{
    productId: string
    templateId: string
    outDir: string
    outPath: string
    plan: any
    hash: string
  }> = []

  // 去重增强：相似度控制（>70%跳过）；素材唯一性由 usedFilePaths 强制保证（按物理路径）
  const recentSignatures: string[][] = []
  const usedFilePaths = createUsedAssetsRegistry()

  // 统计：用于解释“为什么入队数量 < 期望数量”
  const skipped = {
    guardBreak: 0,
    buildPlanFail: 0,
    overuse: 0, // 兼容旧 UI 字段：现不再使用比例 overuse
    tooSimilar: 0,
    dedupeExists: 0,
  }

  let guard = 0
  let lastPlanError = ''
  while (tasks.length < requested) {
    guard++
    if (guard > guardMax) {
      skipped.guardBreak++
      break // 防止素材太少/约束太严时死循环
    }

    let plan: any
    let consumedFilePaths: string[] = []
    try {
      const built = await buildRandomPlan({ product, template, usedAssets: usedFilePaths })
      plan = built.plan
      consumedFilePaths = built.consumedFilePaths ?? []
    } catch (e: any) {
      skipped.buildPlanFail++
      const msg = String(e?.message ?? e ?? '').trim()
      if (msg) lastPlanError = msg.slice(0, 280)
      continue
    }
    const signature = plan.segments.map((s: any) => `${s.segment}:${s.assetId}`)

    // 相似度控制：与最近 80 条比较，超过 0.7 直接跳过
    const recent = recentSignatures.slice(0, 80)
    let tooSimilar = false
    for (const prev of recent) {
      if (jaccard(signature, prev) > 0.7) {
        tooSimilar = true
        break
      }
    }
    if (tooSimilar) {
      skipped.tooSimilar++
      continue
    }

    // hash 去重（包含裁剪参数+fx+bgm）
    const hash = computePlanHash({ productId: product.id, templateId: template.id, plan })
    const exists = await dedupeRepo.has(hash)
    if (exists) {
      skipped.dedupeExists++
      continue
    }

    await dedupeRepo.add(hash)
    const base = `${safeName(product.name)}_${safeName(template.name)}_${Date.now()}_${randomUUID().slice(0, 8)}`
    const outPath = join(outDir, `${base}.mp4`)

    // 只有当该 plan 真正被接受（写入 tasks）时，才提交“批次内已使用素材池”
    for (const fp of consumedFilePaths) usedFilePaths.addFilePath(fp)

    tasks.push({
      productId: product.id,
      templateId: template.id,
      outDir,
      outPath,
      plan,
      hash,
    })

    recentSignatures.unshift(signature)
  }

  const hintCode = resolveHintCode(skipped, tasks.length, requested)
  const planError =
    hintCode === 'plan_build_failed' && lastPlanError ? lastPlanError : undefined

  return {
    tasks,
    meta: {
      requested,
      requestedRaw,
      maxPossible,
      enqueued: tasks.length,
      attempts: guard,
      guardMax,
      skipped,
      /** @deprecated 由渲染进程按 hintCode 走 i18n；仅作兜底 */
      hint: cappedHint || null,
      hintCode,
      planError,
    },
  }
}

