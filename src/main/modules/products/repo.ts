import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { getAppPaths } from '../../lib/paths'
import { readJsonFile, writeJsonFile } from '../../lib/storeJson'
import { templatesRepo } from '../templates/repo'
import type { MediaAsset, Product, ProductImageAsset, ProductType, SegmentKey } from './types'

type DbShape = { products: Product[] }

const filePath = () => join(getAppPaths().dbDir, 'products.json')

function now() {
  return Date.now()
}

function emptyAssets() {
  return { hook: [], show: [], detail: [] } satisfies Record<SegmentKey, any[]>
}

function cleanSegKeyForBuckets(s: string) {
  return (s ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_\-]/g, '')
}

function isImagePath(filePath: string) {
  return /\.(png|jpe?g|webp|bmp|gif)$/i.test(String(filePath || '').trim())
}

function migrateLegacyAssetsToImages(product: Product): ProductImageAsset[] {
  const existing = Array.isArray((product as any).images) ? ((product as any).images as ProductImageAsset[]) : []
  if (existing.length) {
    return existing.map((item) => ({
      ...item,
      productId: product.id,
      updatedAt: Number(item.updatedAt ?? item.createdAt ?? now()),
    }))
  }
  const flat = Object.values(product.assets ?? {})
    .flatMap((items) => items ?? [])
    .filter((item): item is MediaAsset => Boolean(item?.filePath) && isImagePath(String(item.filePath)))
  const seen = new Set<string>()
  const images: ProductImageAsset[] = []
  for (const item of flat) {
    const filePath = String(item.filePath || '').trim()
    if (!filePath || seen.has(filePath)) continue
    seen.add(filePath)
    images.push({
      id: item.id || randomUUID(),
      productId: product.id,
      filePath,
      fileName: item.fileName ?? filePath.split(/[/\\]/).pop() ?? filePath,
      fileSize: Number(item.fileSize ?? 0),
      width: typeof item.width === 'number' ? item.width : undefined,
      height: typeof item.height === 'number' ? item.height : undefined,
      thumbnailPath: item.thumbnailPath ?? filePath,
      createdAt: Number(item.createdAt ?? now()),
      updatedAt: Number(item.createdAt ?? now()),
      isCover: false,
    })
  }
  if (images[0]) images[0].isCover = true
  return images
}

function resolveCoverImagePath(product: Product, images: ProductImageAsset[]) {
  const explicit = String((product as any).coverImagePath || '').trim()
  if (explicit) return explicit
  const cover = images.find((item) => item.isCover && String(item.filePath || '').trim())
  if (cover) return String(cover.filePath || '').trim()
  const first = String(images[0]?.filePath || '').trim()
  return first || undefined
}

function resolveLivePhotoReferenceImagePath(product: Product, images: ProductImageAsset[]) {
  const explicit = String((product as any).livePhotoReferenceImagePath || '').trim()
  if (explicit) return explicit
  const canonicalSourcePath = String((product as any).canonicalSourcePath || '').trim()
  if (canonicalSourcePath) return canonicalSourcePath
  const analysisBoardPath = String((product as any).analysisBoardPath || '').trim()
  if (analysisBoardPath) return analysisBoardPath
  return resolveCoverImagePath(product, images)
}

function resolveNextCoverImagePath(
  prev: Product,
  payload: Partial<Product>,
  images: ProductImageAsset[],
) {
  if (Object.prototype.hasOwnProperty.call(payload, 'images')) {
    const explicit = String((payload as any).coverImagePath || '').trim()
    if (explicit) return explicit
    const cover = images.find((item) => item.isCover && String(item.filePath || '').trim())
    if (cover) return String(cover.filePath || '').trim()
    const first = String(images[0]?.filePath || '').trim()
    return first || undefined
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'coverImagePath')) {
    const explicit = String((payload as any).coverImagePath || '').trim()
    return explicit || undefined
  }
  return prev.coverImagePath
}

export const productsRepo = {
  async list(): Promise<Product[]> {
    const db = await readJsonFile<DbShape>(filePath(), { products: [] })
    // 兼容旧数据：补齐缺失字段（不做 IO 探测，避免 list 很慢）
    for (const p of db.products) {
      ;(p as any).assets = (p as any).assets ?? emptyAssets()
      // 确保默认三段存在（老 UI/模板默认值依赖）
      for (const base of ['hook', 'show', 'detail']) (p as any).assets[base] = (p as any).assets[base] ?? []

      for (const seg of Object.keys((p as any).assets ?? {})) {
        ;(p as any).assets[seg] = ((p as any).assets[seg] ?? []).map((a: any) => ({
          id: a.id,
          filePath: a.filePath,
          fileName: a.fileName ?? (typeof a.filePath === 'string' ? a.filePath.split(/[/\\]/).pop() : ''),
          fileSize: Number(a.fileSize ?? 0),
          durationSec: Number(a.durationSec ?? 0),
          width: typeof a.width === 'number' ? a.width : undefined,
          height: typeof a.height === 'number' ? a.height : undefined,
          fps: typeof a.fps === 'number' ? a.fps : undefined,
          bitRate: typeof a.bitRate === 'number' ? a.bitRate : undefined,
          qualityScore: typeof a.qualityScore === 'number' ? a.qualityScore : undefined,
          qualityIssues: Array.isArray(a.qualityIssues) ? a.qualityIssues.map((x: any) => String(x)).filter(Boolean) : undefined,
          thumbnailPath: a.thumbnailPath ?? null,
          thumbnailDataUrl: a.thumbnailDataUrl ?? null,
          createdAt: Number(a.createdAt ?? now()),
        }))
      }
      ;(p as any).canonicalSourcePath =
        typeof (p as any).canonicalSourcePath === 'string' ? (p as any).canonicalSourcePath : undefined
      ;(p as any).analysisBoardPath =
        typeof (p as any).analysisBoardPath === 'string'
          ? (p as any).analysisBoardPath
          : (typeof (p as any).canonicalSourcePath === 'string' ? (p as any).canonicalSourcePath : undefined)
      ;(p as any).canonicalSourceStatus =
        (p as any).canonicalSourceStatus === 'processing' ||
        (p as any).canonicalSourceStatus === 'done' ||
        (p as any).canonicalSourceStatus === 'failed'
          ? (p as any).canonicalSourceStatus
          : 'idle'
      ;(p as any).analysisBoardStatus =
        (p as any).analysisBoardStatus === 'processing' ||
        (p as any).analysisBoardStatus === 'done' ||
        (p as any).analysisBoardStatus === 'failed'
          ? (p as any).analysisBoardStatus
          : (p as any).canonicalSourceStatus
      ;(p as any).canonicalSourcePrompt =
        typeof (p as any).canonicalSourcePrompt === 'string' ? (p as any).canonicalSourcePrompt : undefined
      ;(p as any).analysisBoardPrompt =
        typeof (p as any).analysisBoardPrompt === 'string'
          ? (p as any).analysisBoardPrompt
          : (typeof (p as any).canonicalSourcePrompt === 'string' ? (p as any).canonicalSourcePrompt : undefined)
      ;(p as any).canonicalSourceDiagnostics = Array.isArray((p as any).canonicalSourceDiagnostics)
        ? (p as any).canonicalSourceDiagnostics.map((item: any) => ({
            originalPath: String(item?.originalPath || '').trim(),
            sanitizedPath: typeof item?.sanitizedPath === 'string' ? item.sanitizedPath : undefined,
            status: item?.status === 'kept' || item?.status === 'failed' ? item.status : 'sanitized',
            note: typeof item?.note === 'string' ? item.note : undefined,
            prompt: typeof item?.prompt === 'string' ? item.prompt : undefined,
            fallbackToOriginal: Boolean(item?.fallbackToOriginal),
          }))
        : undefined
      ;(p as any).analysisBoardDiagnostics = Array.isArray((p as any).analysisBoardDiagnostics)
        ? (p as any).analysisBoardDiagnostics.map((item: any) => ({
            originalPath: String(item?.originalPath || '').trim(),
            sanitizedPath: typeof item?.sanitizedPath === 'string' ? item.sanitizedPath : undefined,
            status: item?.status === 'kept' || item?.status === 'failed' ? item.status : 'sanitized',
            note: typeof item?.note === 'string' ? item.note : undefined,
            prompt: typeof item?.prompt === 'string' ? item.prompt : undefined,
            fallbackToOriginal: Boolean(item?.fallbackToOriginal),
          }))
        : (Array.isArray((p as any).canonicalSourceDiagnostics) ? (p as any).canonicalSourceDiagnostics : undefined)
      ;(p as any).canonicalSourceUpdatedAt = Number((p as any).canonicalSourceUpdatedAt ?? 0) || undefined
      ;(p as any).analysisBoardUpdatedAt =
        Number((p as any).analysisBoardUpdatedAt ?? 0) ||
        Number((p as any).canonicalSourceUpdatedAt ?? 0) ||
        undefined
      ;(p as any).canonicalSourceSourceSignature =
        typeof (p as any).canonicalSourceSourceSignature === 'string'
          ? (p as any).canonicalSourceSourceSignature
          : undefined
      ;(p as any).analysisSourceSignature =
        typeof (p as any).analysisSourceSignature === 'string'
          ? (p as any).analysisSourceSignature
          : (typeof (p as any).canonicalSourceSourceSignature === 'string'
              ? (p as any).canonicalSourceSourceSignature
              : undefined)
      ;(p as any).productAnalysis =
        (p as any).productAnalysis && typeof (p as any).productAnalysis === 'object'
          ? {
              category: String((p as any).productAnalysis.category ?? '').trim(),
              summary: String((p as any).productAnalysis.summary ?? '').trim(),
              coreSubject: String((p as any).productAnalysis.coreSubject ?? '').trim(),
              connectionStructure: String((p as any).productAnalysis.connectionStructure ?? '').trim(),
              materialDetails: String((p as any).productAnalysis.materialDetails ?? '').trim(),
              wearingPosition: String((p as any).productAnalysis.wearingPosition ?? '').trim(),
              surfaceDetails: String((p as any).productAnalysis.surfaceDetails ?? '').trim(),
              colorDetails: String((p as any).productAnalysis.colorDetails ?? '').trim(),
              geometryDetails: String((p as any).productAnalysis.geometryDetails ?? '').trim(),
              sizeScale: String((p as any).productAnalysis.sizeScale ?? '').trim(),
              matchingRules: Array.isArray((p as any).productAnalysis.matchingRules)
                ? (p as any).productAnalysis.matchingRules.map(String).filter(Boolean)
                : [],
              rawDescription: String((p as any).productAnalysis.rawDescription ?? '').trim(),
              updatedAt: Number((p as any).productAnalysis.updatedAt ?? 0) || now(),
            }
          : undefined
      ;(p as any).storyboardTemplateType =
        (p as any).storyboardTemplateType === 'general' ||
        (p as any).storyboardTemplateType === 'jewelry' ||
        (p as any).storyboardTemplateType === 'ecommerce_packaging' ||
        (p as any).storyboardTemplateType === 'lifestyle_interaction'
          ? (p as any).storyboardTemplateType
          : undefined
      ;(p as any).images = migrateLegacyAssetsToImages(p as Product)
      ;(p as any).coverImagePath = resolveCoverImagePath(p as Product, (p as any).images)
      ;(p as any).livePhotoReferenceImagePath = resolveLivePhotoReferenceImagePath(p as Product, (p as any).images)
      ;(p as any).remark = typeof (p as any).remark === 'string' ? (p as any).remark : ''
    }
    return db.products
  },

  async upsert(payload: Partial<Product> & { name: string; type: ProductType }): Promise<Product> {
    const db = await readJsonFile<DbShape>(filePath(), { products: [] })
    const ts = now()
    if (payload.id) {
      const idx = db.products.findIndex((p) => p.id === payload.id)
      if (idx >= 0) {
        const prev = db.products[idx]
        const hasOwn = (key: string) => Object.prototype.hasOwnProperty.call(payload, key)
        const nextImages = payload.images ?? prev.images ?? migrateLegacyAssetsToImages(prev)
        const next: Product = {
          ...prev,
          ...payload,
          assets: payload.assets ?? prev.assets,
          images: nextImages,
          coverImagePath: resolveNextCoverImagePath(prev, payload, nextImages),
          livePhotoReferenceImagePath:
            hasOwn('livePhotoReferenceImagePath')
              ? payload.livePhotoReferenceImagePath
              : resolveLivePhotoReferenceImagePath(prev, nextImages),
          remark: hasOwn('remark') ? payload.remark : prev.remark,
          analysisBoardPath:
            hasOwn('analysisBoardPath') ? payload.analysisBoardPath : prev.analysisBoardPath,
          analysisBoardStatus:
            hasOwn('analysisBoardStatus') ? payload.analysisBoardStatus : prev.analysisBoardStatus,
          analysisBoardPrompt:
            hasOwn('analysisBoardPrompt') ? payload.analysisBoardPrompt : prev.analysisBoardPrompt,
          analysisBoardDiagnostics:
            !hasOwn('analysisBoardDiagnostics')
              ? prev.analysisBoardDiagnostics
              : payload.analysisBoardDiagnostics,
          analysisBoardUpdatedAt:
            !hasOwn('analysisBoardUpdatedAt')
              ? prev.analysisBoardUpdatedAt
              : payload.analysisBoardUpdatedAt,
          analysisSourceSignature:
            !hasOwn('analysisSourceSignature')
              ? prev.analysisSourceSignature
              : payload.analysisSourceSignature,
          canonicalSourcePath:
            hasOwn('canonicalSourcePath') ? payload.canonicalSourcePath : prev.canonicalSourcePath,
          canonicalSourceStatus:
            hasOwn('canonicalSourceStatus') ? payload.canonicalSourceStatus : prev.canonicalSourceStatus,
          canonicalSourcePrompt:
            hasOwn('canonicalSourcePrompt') ? payload.canonicalSourcePrompt : prev.canonicalSourcePrompt,
          canonicalSourceDiagnostics:
            !hasOwn('canonicalSourceDiagnostics')
              ? prev.canonicalSourceDiagnostics
              : payload.canonicalSourceDiagnostics,
          canonicalSourceUpdatedAt:
            !hasOwn('canonicalSourceUpdatedAt')
              ? prev.canonicalSourceUpdatedAt
              : payload.canonicalSourceUpdatedAt,
          canonicalSourceSourceSignature:
            !hasOwn('canonicalSourceSourceSignature')
              ? prev.canonicalSourceSourceSignature
              : payload.canonicalSourceSourceSignature,
          storyboardTemplateType:
            !hasOwn('storyboardTemplateType')
              ? prev.storyboardTemplateType
              : payload.storyboardTemplateType,
          productAnalysis:
            !hasOwn('productAnalysis')
              ? prev.productAnalysis
              : payload.productAnalysis,
          updatedAt: ts,
        }
        db.products[idx] = next
        await writeJsonFile(filePath(), db)
        return next
      }
    }

    const createdImages = payload.images ?? []
    const created: Product = {
      id: randomUUID(),
      name: payload.name,
      type: payload.type,
      assets: payload.assets ?? (emptyAssets() as any),
      images: createdImages,
      coverImagePath: payload.coverImagePath,
      livePhotoReferenceImagePath:
        payload.livePhotoReferenceImagePath ||
        resolveLivePhotoReferenceImagePath(
          {
            id: '',
            name: payload.name,
            type: payload.type,
            assets: payload.assets ?? (emptyAssets() as any),
            images: createdImages,
            createdAt: ts,
            updatedAt: ts,
          } as Product,
          createdImages,
        ),
      remark: payload.remark ?? '',
      analysisBoardPath: payload.analysisBoardPath,
      analysisBoardStatus: payload.analysisBoardStatus ?? payload.canonicalSourceStatus ?? 'idle',
      analysisBoardPrompt: payload.analysisBoardPrompt,
      analysisBoardDiagnostics: payload.analysisBoardDiagnostics,
      analysisBoardUpdatedAt: payload.analysisBoardUpdatedAt,
      analysisSourceSignature: payload.analysisSourceSignature ?? payload.canonicalSourceSourceSignature,
      canonicalSourcePath: payload.canonicalSourcePath,
      canonicalSourceStatus: payload.canonicalSourceStatus ?? 'idle',
      canonicalSourcePrompt: payload.canonicalSourcePrompt,
      canonicalSourceDiagnostics: payload.canonicalSourceDiagnostics,
      canonicalSourceUpdatedAt: payload.canonicalSourceUpdatedAt,
      canonicalSourceSourceSignature: payload.canonicalSourceSourceSignature,
      storyboardTemplateType: payload.storyboardTemplateType,
      productAnalysis: payload.productAnalysis,
      createdAt: ts,
      updatedAt: ts,
    }
    db.products.unshift(created)
    await writeJsonFile(filePath(), db)
    return created
  },

  async remove(id: string): Promise<{ ok: true }> {
    const db = await readJsonFile<DbShape>(filePath(), { products: [] })
    db.products = db.products.filter((p) => p.id !== id)
    await writeJsonFile(filePath(), db)
    return { ok: true }
  },

  /**
   * 合并所有模板 structure 里出现的段位键到每个产品的 assets（缺失则补空数组），
   * 避免模板多段而产品 JSON 无该 key → 引擎视为「该段无素材」。
   */
  async ensureSegmentBucketsFromTemplates(): Promise<{ ok: true; patched: number }> {
    const [products, templates] = await Promise.all([productsRepo.list(), templatesRepo.list()])
    const segSet = new Set<string>()
    for (const t of templates) {
      for (const s of t.structure ?? []) {
        const k = cleanSegKeyForBuckets(String(s))
        if (k) segSet.add(k)
      }
    }
    const keys = [...segSet]
    if (!keys.length) return { ok: true, patched: 0 }
    let patched = 0
    for (const p of products) {
      const next: Record<SegmentKey, any[]> = { ...(p.assets ?? {}) }
      let changed = false
      for (const k of keys) {
        if (next[k] === undefined) {
          next[k] = []
          changed = true
        }
      }
      if (changed) {
        await productsRepo.upsert({ id: p.id, name: p.name, type: p.type, assets: next })
        patched++
      }
    }
    return { ok: true, patched }
  },

  async ensureSeed() {
    const db = await readJsonFile<DbShape>(filePath(), { products: [] })
    if (db.products.length > 0) return
    const ts = now()
    db.products = [
      {
        id: randomUUID(),
        name: '手机壳默认',
        type: 'phone_case',
        assets: emptyAssets() as any,
        createdAt: ts,
        updatedAt: ts,
      },
      {
        id: randomUUID(),
        name: '耳环默认',
        type: 'earring',
        assets: emptyAssets() as any,
        createdAt: ts,
        updatedAt: ts,
      },
    ]
    await writeJsonFile(filePath(), db)
  },
}
