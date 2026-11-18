import { gmvMaxRepo } from '../tiktok-gmv-max/sqlite'
import { captionSimilarity } from '../mix-studio/insights'
import { contentIndex } from './contentIndex'
import { performanceLinkStore } from './stores'
import type { ContentItem, ContentLine, ContentPerformance, ContentPerformanceLink, ContentRef, PerformanceVerdict, ProductPerformance } from './types'

/**
 * Sales loop for every content line: each finished video is matched to the GMV Max creative it
 * became once published, so the product page can show which videos actually sell and the AI
 * producer can plan the next batch from proof instead of from the approval rate alone.
 */

export const PERFORMANCE_WINDOW_DAYS = 30
const AUTO_LINK_MIN_SIMILARITY = 0.6
const WINNER_MIN_ORDERS = 3
const WINNER_ROI_LIFT = 1.3
const WEAK_ROI_DROP = 0.7

export type PublishTaskLike = {
  id?: string
  productId?: string
  productTitle?: string
  localProductId?: string
  sourceRef?: string
  sourceTaskId?: string
  sourceShotId?: string
  videoTitle?: string
  description?: string
  state?: string
}

type CreativeTotals = { creativeId: string; name: string; spend: number; revenue: number; orders: number }

function text(value: unknown) {
  return String(value ?? '').trim()
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function dayKey(offsetDays: number, now: number) {
  return new Date(now - offsetDays * 86_400_000).toISOString().slice(0, 10)
}

function readCreatives(tiktokProductIds: string[], now: number): CreativeTotals[] {
  if (!tiktokProductIds.length) return []
  let rows: ReturnType<typeof gmvMaxRepo.listCreativeDailyForProducts> = []
  try {
    rows = gmvMaxRepo.listCreativeDailyForProducts(tiktokProductIds, dayKey(PERFORMANCE_WINDOW_DAYS - 1, now), dayKey(0, now))
  } catch {
    return []
  }
  const byId = new Map<string, CreativeTotals>()
  for (const row of rows) {
    const entry = byId.get(row.creativeId) || { creativeId: row.creativeId, name: '', spend: 0, revenue: 0, orders: 0 }
    entry.name = entry.name || text(row.creativeName)
    entry.spend += Number(row.cost) || 0
    entry.revenue += Number(row.grossRevenue) || 0
    entry.orders += Number(row.orders) || 0
    byId.set(row.creativeId, entry)
  }
  return [...byId.values()]
}

/** The content a publish task was made from. */
export function publishSourceRef(task: PublishTaskLike): ContentRef {
  return text(task.sourceRef) || (task.sourceTaskId && task.sourceShotId ? `creative:${task.sourceTaskId}:${task.sourceShotId}` : '')
}

/**
 * Proposes content→creative links from published tasks: the caption the video was published with
 * is what TikTok shows as the creative name. Each creative and each video links at most once.
 */
export function proposeContentLinks(input: {
  refs: Set<ContentRef>
  publishTasks: PublishTaskLike[]
  creatives: Array<{ creativeId: string; name: string }>
  linked: Record<ContentRef, ContentPerformanceLink>
  locked: ContentRef[]
}) {
  const takenCreatives = new Set(Object.values(input.linked).map((link) => link.creativeId))
  const locked = new Set(input.locked)
  const candidates: Array<{ ref: ContentRef; creativeId: string; creativeName: string; confidence: number }> = []
  for (const task of input.publishTasks) {
    if (task.state !== 'published') continue
    const ref = publishSourceRef(task)
    if (!ref || !input.refs.has(ref) || input.linked[ref] || locked.has(ref)) continue
    const captions = [task.videoTitle, task.description].map(text).filter(Boolean)
    for (const creative of input.creatives) {
      if (takenCreatives.has(creative.creativeId) || !creative.name) continue
      const similarity = Math.max(0, ...captions.map((caption) => captionSimilarity(caption, creative.name)))
      if (similarity >= AUTO_LINK_MIN_SIMILARITY) candidates.push({ ref, creativeId: creative.creativeId, creativeName: creative.name, confidence: round(similarity) })
    }
  }
  candidates.sort((a, b) => b.confidence - a.confidence)
  const usedRefs = new Set<ContentRef>()
  const out: typeof candidates = []
  for (const candidate of candidates) {
    if (usedRefs.has(candidate.ref) || takenCreatives.has(candidate.creativeId)) continue
    usedRefs.add(candidate.ref)
    takenCreatives.add(candidate.creativeId)
    out.push(candidate)
  }
  return out
}

export function verdictFor(creative: { spend: number; revenue: number; orders: number }, productRoi: number): PerformanceVerdict {
  if (creative.spend <= 0) return 'unproven'
  const roi = creative.revenue / creative.spend
  if (creative.orders >= WINNER_MIN_ORDERS && roi > 0 && roi >= productRoi * WINNER_ROI_LIFT) return 'winner'
  if (productRoi > 0 && roi < productRoi * WEAK_ROI_DROP) return 'weak'
  return 'average'
}

export const contentPerformance = {
  /**
   * Performance of one product's content. Auto-links newly published videos as a side effect,
   * so opening the product page is enough to keep the loop current.
   */
  async forProduct(input: { items: ContentItem[]; tiktokProductIds: string[]; publishTasks: PublishTaskLike[]; now?: number }): Promise<ProductPerformance> {
    const now = input.now ?? Date.now()
    const content = input.items.filter((item) => item.line !== 'publish')
    const refs = new Set(content.map((item) => item.ref))
    const creatives = readCreatives(input.tiktokProductIds, now)
    const creativeById = new Map(creatives.map((creative) => [creative.creativeId, creative]))

    let db = await performanceLinkStore.read()
    const proposals = proposeContentLinks({ refs, publishTasks: input.publishTasks, creatives, linked: db.links, locked: db.locked })
    if (proposals.length) {
      db = await performanceLinkStore.mutate((store) => {
        for (const proposal of proposals) {
          if (store.links[proposal.ref]) continue
          store.links[proposal.ref] = { ref: proposal.ref, creativeId: proposal.creativeId, creativeName: proposal.creativeName, method: 'auto', confidence: proposal.confidence, linkedAt: now }
        }
        return store
      })
    }

    const spend = creatives.reduce((sum, creative) => sum + creative.spend, 0)
    const revenue = creatives.reduce((sum, creative) => sum + creative.revenue, 0)
    const productRoi = spend > 0 ? revenue / spend : 0

    const byRef: Record<ContentRef, ContentPerformance> = {}
    const linkedCreativeIds = new Set<string>()
    for (const item of content) {
      const link = db.links[item.ref]
      if (!link) continue
      linkedCreativeIds.add(link.creativeId)
      const creative = creativeById.get(link.creativeId)
      byRef[item.ref] = {
        creativeId: link.creativeId,
        creativeName: creative?.name || link.creativeName,
        method: link.method,
        confidence: link.confidence,
        spend: round(creative?.spend || 0),
        revenue: round(creative?.revenue || 0),
        orders: creative?.orders || 0,
        roi: creative && creative.spend > 0 ? round(creative.revenue / creative.spend) : 0,
        verdict: creative ? verdictFor(creative, productRoi) : 'unproven',
      }
    }

    const lines = new Map<ContentLine, { line: ContentLine; measured: number; winners: number; spend: number; revenue: number; orders: number }>()
    for (const item of content) {
      const performance = byRef[item.ref]
      if (!performance || performance.verdict === 'unproven') continue
      const row = lines.get(item.line) || { line: item.line, measured: 0, winners: 0, spend: 0, revenue: 0, orders: 0 }
      row.measured += 1
      if (performance.verdict === 'winner') row.winners += 1
      row.spend += performance.spend
      row.revenue += performance.revenue
      row.orders += performance.orders
      lines.set(item.line, row)
    }

    const publishedRefs = new Set(input.publishTasks.filter((task) => task.state === 'published').map(publishSourceRef).filter((ref) => refs.has(ref)))
    return {
      windowDays: PERFORMANCE_WINDOW_DAYS,
      productRoi: round(productRoi),
      byRef,
      byLine: [...lines.values()]
        .map((row) => ({ ...row, spend: round(row.spend), revenue: round(row.revenue), roi: row.spend > 0 ? round(row.revenue / row.spend) : 0 }))
        .sort((a, b) => b.revenue - a.revenue),
      measuredCount: Object.values(byRef).filter((item) => item.verdict !== 'unproven').length,
      publishedUnlinkedCount: [...publishedRefs].filter((ref) => !byRef[ref]).length,
      unlinkedCreatives: creatives
        .filter((creative) => !linkedCreativeIds.has(creative.creativeId) && creative.spend > 0)
        .map((creative) => ({ creativeId: creative.creativeId, name: creative.name || creative.creativeId, spend: round(creative.spend), revenue: round(creative.revenue), orders: creative.orders, roi: round(creative.revenue / creative.spend) }))
        .sort((a, b) => b.spend - a.spend)
        .slice(0, 30),
    }
  },

  async link(input: { ref: ContentRef; creativeId: string; creativeName?: string }) {
    const ref = text(input.ref)
    const creativeId = text(input.creativeId)
    if (!ref || !creativeId) throw new Error('PERFORMANCE_LINK_INVALID')
    return await performanceLinkStore.mutate((store) => {
      // A creative is one published video, so it can only prove one piece of content.
      for (const [otherRef, link] of Object.entries(store.links)) if (link.creativeId === creativeId && otherRef !== ref) delete store.links[otherRef]
      store.locked = store.locked.filter((item) => item !== ref)
      store.links[ref] = { ref, creativeId, creativeName: text(input.creativeName), method: 'manual', linkedAt: Date.now() }
      return store.links[ref]
    })
  },

  /** Removes a link and stops auto-linking from re-creating it. */
  async unlink(ref: ContentRef) {
    const key = text(ref)
    return await performanceLinkStore.mutate((store) => {
      delete store.links[key]
      if (key && !store.locked.includes(key)) store.locked.push(key)
      return { ok: true }
    })
  },
}

const LINE_NAME: Record<ContentLine, string> = { clone: 'viral clone', creative: 'creative studio', livephoto: 'Live Photo', production: 'batch mix', publish: 'publish' }

/** Sales proof as plain planning guidance for the AI producer. Empty when nothing is measured yet. */
export function buildPerformanceGuidance(items: ContentItem[], performance: ProductPerformance): string {
  const measured = items
    .map((item) => ({ item, performance: performance.byRef[item.ref] }))
    .filter((row): row is { item: ContentItem; performance: ContentPerformance } => Boolean(row.performance) && row.performance!.verdict !== 'unproven')
  if (!measured.length) return ''
  const lines: string[] = []
  const describe = (row: { item: ContentItem; performance: ContentPerformance }) => `"${row.item.title}" (${LINE_NAME[row.item.line]}, ROI ${row.performance.roi}, ${row.performance.orders} orders)`
  const winners = measured.filter((row) => row.performance.verdict === 'winner').sort((a, b) => b.performance.revenue - a.performance.revenue).slice(0, 3)
  const weak = measured.filter((row) => row.performance.verdict === 'weak').sort((a, b) => b.performance.spend - a.performance.spend).slice(0, 2)
  if (winners.length) lines.push(`Sales-proven videos for this product in the last ${performance.windowDays} days: ${winners.map(describe).join('; ')}. Prefer new content that follows their structure.`)
  if (weak.length) lines.push(`Videos that spent budget without selling: ${weak.map(describe).join('; ')}. Do not repeat their approach.`)
  const ranked = performance.byLine.filter((row) => row.measured >= 2)
  if (ranked.length >= 2) {
    const best = ranked.slice().sort((a, b) => b.roi - a.roi)[0]
    lines.push(`Best-selling production line for this product: ${LINE_NAME[best.line]} (ROI ${best.roi} over ${best.measured} measured videos).`)
  }
  return lines.join('\n')
}

/** Sales proof for one product, read fresh. Used by the AI producer's planning prompt. */
export async function productPerformanceGuidance(productId: string): Promise<string> {
  const { productSpine, readPublishTasks } = await import('./productSpine')
  const items = await contentIndex.list({ productId, limit: 1000 })
  const spine = await productSpine.build(productId)
  if (!spine.tiktokProductIds.length) return ''
  const performance = await contentPerformance.forProduct({ items, tiktokProductIds: spine.tiktokProductIds, publishTasks: await readPublishTasks() })
  return buildPerformanceGuidance(items, performance)
}
