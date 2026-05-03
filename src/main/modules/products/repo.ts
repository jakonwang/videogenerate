import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { getAppPaths } from '../../lib/paths'
import { readJsonFile, writeJsonFile } from '../../lib/storeJson'
import { templatesRepo } from '../templates/repo'
import type { Product, ProductType, SegmentKey } from './types'

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
        const next: Product = {
          ...prev,
          ...payload,
          assets: payload.assets ?? prev.assets,
          updatedAt: ts,
        }
        db.products[idx] = next
        await writeJsonFile(filePath(), db)
        return next
      }
    }

    const created: Product = {
      id: randomUUID(),
      name: payload.name,
      type: payload.type,
      assets: payload.assets ?? (emptyAssets() as any),
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

