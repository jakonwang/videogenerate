import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { getAppPaths } from '../../lib/paths'
import { readJsonFile, writeJsonFile } from '../../lib/storeJson'
import type {
  Brief,
  BrandMemoryDb,
  BrandProfile,
  ContentPerformanceLink,
  ContentRef,
  FeedbackEntry,
  LineageEdge,
  LineageRelation,
  ProductMemory,
  ReviewRecord,
} from './types'

function dbFile(name: string) {
  return join(getAppPaths().dbDir, name)
}

/** Serialises read-modify-write cycles per file so concurrent callers never lose updates. */
export function createJsonStore<T>(fileName: string, empty: () => T, normalize: (value: T) => T = (value) => value) {
  let queue: Promise<unknown> = Promise.resolve()
  let cached: T | null = null
  const path = () => dbFile(fileName)
  async function load(): Promise<T> {
    if (cached) return cached
    cached = normalize(await readJsonFile<T>(path(), empty()))
    return cached
  }
  return {
    async read(): Promise<T> {
      await queue.catch(() => undefined)
      return await load()
    },
    async mutate<R>(fn: (db: T) => R | Promise<R>): Promise<R> {
      const run = queue.catch(() => undefined).then(async () => {
        const db = await load()
        const result = await fn(db)
        await writeJsonFile(path(), db)
        return result
      })
      queue = run
      return (await run) as R
    },
    resetCache() {
      cached = null
    },
  }
}

// ---------------------------------------------------------------- lineage

type LineageDb = { schemaVersion: 1; edges: LineageEdge[] }

const lineageStore = createJsonStore<LineageDb>('content-lineage.json', () => ({ schemaVersion: 1, edges: [] }), (db) => ({
  schemaVersion: 1,
  edges: Array.isArray(db?.edges) ? db.edges : [],
}))

export const lineage = {
  async record(input: { fromRef: ContentRef; toRef: ContentRef; relation: LineageRelation; productId?: string; meta?: Record<string, unknown> }) {
    if (!input.fromRef || !input.toRef) return null
    return await lineageStore.mutate((db) => {
      const existing = db.edges.find((edge) => edge.fromRef === input.fromRef && edge.toRef === input.toRef && edge.relation === input.relation)
      if (existing) return existing
      const edge: LineageEdge = { id: randomUUID(), createdAt: Date.now(), ...input }
      db.edges.push(edge)
      if (db.edges.length > 20_000) db.edges.splice(0, db.edges.length - 20_000)
      return edge
    })
  },
  async listFor(ref: ContentRef) {
    const db = await lineageStore.read()
    return db.edges.filter((edge) => edge.fromRef === ref || edge.toRef === ref || edge.fromRef.startsWith(`${ref}:`) || edge.toRef.startsWith(`${ref}:`))
  },
  async listByProduct(productId: string) {
    const db = await lineageStore.read()
    return db.edges.filter((edge) => edge.productId === productId)
  },
  async all() {
    return (await lineageStore.read()).edges
  },
}

// ---------------------------------------------------------------- review inbox

type ReviewDb = { schemaVersion: 1; records: Record<string, ReviewRecord> }

export const reviewStore = createJsonStore<ReviewDb>('content-review.json', () => ({ schemaVersion: 1, records: {} }), (db) => ({
  schemaVersion: 1,
  records: db?.records && typeof db.records === 'object' ? db.records : {},
}))

// ---------------------------------------------------------------- performance links

type PerformanceLinkDb = { schemaVersion: 1; links: Record<ContentRef, ContentPerformanceLink>; locked: ContentRef[] }

export const performanceLinkStore = createJsonStore<PerformanceLinkDb>('content-performance.json', () => ({ schemaVersion: 1, links: {}, locked: [] }), (db) => ({
  schemaVersion: 1,
  links: db?.links && typeof db.links === 'object' ? db.links : {},
  locked: Array.isArray(db?.locked) ? db.locked.map(String) : [],
}))

// ---------------------------------------------------------------- brand memory

function emptyBrand(): BrandProfile {
  return { brandName: '', tone: '', audience: '', bannedWords: [], subtitleStyle: '', watermarkText: '', notes: '', updatedAt: 0 }
}

const brandStore = createJsonStore<BrandMemoryDb>('brand-memory.json', () => ({ schemaVersion: 1, brand: emptyBrand(), products: {}, feedback: [] }), (db) => ({
  schemaVersion: 1,
  brand: { ...emptyBrand(), ...(db?.brand || {}) },
  products: db?.products && typeof db.products === 'object' ? db.products : {},
  feedback: Array.isArray(db?.feedback) ? db.feedback : [],
}))

function clean(value: unknown, max = 2000) {
  return String(value ?? '').trim().slice(0, max)
}

export const brandMemoryStore = {
  async read() {
    return await brandStore.read()
  },
  async saveBrand(input: Partial<BrandProfile>) {
    return await brandStore.mutate((db) => {
      db.brand = {
        ...db.brand,
        ...(input.brandName !== undefined ? { brandName: clean(input.brandName, 80) } : {}),
        ...(input.tone !== undefined ? { tone: clean(input.tone, 500) } : {}),
        ...(input.audience !== undefined ? { audience: clean(input.audience, 500) } : {}),
        ...(input.subtitleStyle !== undefined ? { subtitleStyle: clean(input.subtitleStyle, 300) } : {}),
        ...(input.watermarkText !== undefined ? { watermarkText: clean(input.watermarkText, 80) } : {}),
        ...(input.notes !== undefined ? { notes: clean(input.notes) } : {}),
        ...(Array.isArray(input.bannedWords) ? { bannedWords: input.bannedWords.map((word) => clean(word, 40)).filter(Boolean).slice(0, 200) } : {}),
        updatedAt: Date.now(),
      }
      return db.brand
    })
  },
  async getProduct(productId: string): Promise<ProductMemory> {
    const db = await brandStore.read()
    return db.products[productId] || { productId, sellingPoints: '', audience: '', avoid: '', preferredModelIds: [], notes: '', updatedAt: 0 }
  },
  async saveProduct(input: Partial<ProductMemory> & { productId: string }) {
    const productId = clean(input.productId, 120)
    if (!productId) throw new Error('productId is required')
    return await brandStore.mutate((db) => {
      const current = db.products[productId] || { productId, sellingPoints: '', audience: '', avoid: '', preferredModelIds: [], notes: '', updatedAt: 0 }
      const next: ProductMemory = {
        ...current,
        ...(input.sellingPoints !== undefined ? { sellingPoints: clean(input.sellingPoints) } : {}),
        ...(input.audience !== undefined ? { audience: clean(input.audience, 500) } : {}),
        ...(input.avoid !== undefined ? { avoid: clean(input.avoid) } : {}),
        ...(input.notes !== undefined ? { notes: clean(input.notes) } : {}),
        ...(Array.isArray(input.preferredModelIds) ? { preferredModelIds: input.preferredModelIds.map((id) => clean(id, 120)).filter(Boolean).slice(0, 20) } : {}),
        updatedAt: Date.now(),
      }
      db.products[productId] = next
      return next
    })
  },
  async addFeedback(entry: Omit<FeedbackEntry, 'id' | 'createdAt'>) {
    return await brandStore.mutate((db) => {
      const item: FeedbackEntry = { id: randomUUID(), createdAt: Date.now(), ...entry }
      db.feedback.push(item)
      if (db.feedback.length > 5_000) db.feedback.splice(0, db.feedback.length - 5_000)
      return item
    })
  },
  async removeFeedback(id: string) {
    return await brandStore.mutate((db) => {
      db.feedback = db.feedback.filter((item) => item.id !== id)
      return { ok: true as const }
    })
  },
}

// ---------------------------------------------------------------- briefs

type BriefDb = { schemaVersion: 1; briefs: Brief[] }

export const briefStore = createJsonStore<BriefDb>('content-briefs.json', () => ({ schemaVersion: 1, briefs: [] }), (db) => ({
  schemaVersion: 1,
  briefs: Array.isArray(db?.briefs) ? db.briefs : [],
}))
