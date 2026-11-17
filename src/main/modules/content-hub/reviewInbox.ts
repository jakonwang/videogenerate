import { assetLibraryService } from '../asset-library/service'
import { contentIndex } from './contentIndex'
import { brandMemoryStore, lineage, reviewStore } from './stores'
import type { ContentItem, ContentLine, ReviewDecision, ReviewItem, ReviewRecord } from './types'

/** Lines whose finished outputs land in the review inbox. */
const REVIEW_LINES: ContentLine[] = ['clone', 'creative', 'livephoto']
/** Outputs finished long before the inbox existed are not pulled in. */
const BACKFILL_WINDOW_MS = 14 * 24 * 60 * 60 * 1000
const ARCHIVE_ROOT = 'AI 成片'
const ARCHIVE_FOLDER: Record<string, string> = {
  clone: '复刻成片',
  creative: '创意工作室',
  livephoto: 'Live Photo',
}

type ReviewMeta = { installedAt?: number }

async function ensureArchiveFolder(line: string): Promise<string | null> {
  try {
    const folders = await assetLibraryService.listAllFolders()
    let root = folders.find((folder: any) => !folder.deletedAt && (folder.parentId ?? null) === null && folder.name === ARCHIVE_ROOT)
    if (!root) root = await assetLibraryService.createFolder(ARCHIVE_ROOT, null)
    const childName = ARCHIVE_FOLDER[line] || line
    const all = await assetLibraryService.listAllFolders()
    let child = all.find((folder: any) => !folder.deletedAt && folder.parentId === root!.id && folder.name === childName)
    if (!child) child = await assetLibraryService.createFolder(childName, root!.id)
    return child.id
  } catch {
    return null
  }
}

function eligible(item: ContentItem, installedAt: number) {
  return REVIEW_LINES.includes(item.line) && item.status === 'ready' && Boolean(item.mediaPath) && item.updatedAt >= installedAt - BACKFILL_WINDOW_MS
}

export const reviewInbox = {
  /** Pulls newly finished outputs into the inbox as pending reviews. Idempotent. */
  async sync() {
    const items = await contentIndex.listAll()
    let added = 0
    await reviewStore.mutate((db) => {
      const meta = db as unknown as ReviewMeta
      if (!meta.installedAt) meta.installedAt = Date.now()
      for (const item of items) {
        if (db.records[item.ref] || !eligible(item, meta.installedAt)) continue
        db.records[item.ref] = {
          ref: item.ref,
          line: item.line,
          productId: item.productId,
          decision: 'pending',
          firstSeenAt: Date.now(),
        }
        added += 1
      }
    })
    return { added }
  },

  async list(filter: { decision?: ReviewDecision | 'all'; line?: ContentLine; productId?: string } = {}): Promise<ReviewItem[]> {
    await this.sync()
    const [items, db] = await Promise.all([contentIndex.listAll(), reviewStore.read()])
    const byRef = new Map(items.map((item) => [item.ref, item]))
    const decision = filter.decision || 'pending'
    const out: ReviewItem[] = []
    for (const record of Object.values(db.records)) {
      if (decision !== 'all' && record.decision !== decision) continue
      if (filter.line && record.line !== filter.line) continue
      if (filter.productId && record.productId !== filter.productId) continue
      const item = byRef.get(record.ref)
      if (!item) continue
      out.push({ ...item, review: record })
    }
    return out.sort((a, b) => (b.review.decidedAt || b.updatedAt) - (a.review.decidedAt || a.updatedAt))
  },

  async counts() {
    await this.sync()
    const db = await reviewStore.read()
    const counts = { pending: 0, approved: 0, redo: 0, discarded: 0 }
    for (const record of Object.values(db.records)) counts[record.decision] += 1
    return counts
  },

  async records(): Promise<ReviewRecord[]> {
    return Object.values((await reviewStore.read()).records)
  },

  /** `learn: false` keeps decisions the user did not make personally out of brand memory. */
  async decide(input: { ref: string; decision: Exclude<ReviewDecision, 'pending'>; reason?: string; note?: string; learn?: boolean }) {
    const item = await contentIndex.get(input.ref)
    if (!item) throw new Error('内容不存在或已被删除')
    const db = await reviewStore.read()
    const current = db.records[input.ref]
    if (!current) throw new Error('该内容不在审核收件箱中')

    let archivedAssetId = current.archivedAssetId
    if (input.decision === 'approved' && !archivedAssetId && item.mediaPath) {
      const folderId = await ensureArchiveFolder(item.line)
      const baseName = `${item.productName ? `${item.productName}-` : ''}${item.title}`.replace(/[\\/:*?"<>|]+/g, '_').slice(0, 80)
      const extension = (item.mediaPath.match(/\.[a-z0-9]+$/i)?.[0] || '.mp4').toLowerCase()
      const asset = await assetLibraryService.importFile(item.mediaPath, 'desktop', `${baseName}${extension}`, folderId)
      archivedAssetId = asset.id
      await lineage.record({ fromRef: item.ref, toRef: `asset:${asset.id}`, relation: 'archived_as', productId: item.productId })
    }

    const record = await reviewStore.mutate((stored) => {
      const next: ReviewRecord = {
        ...stored.records[input.ref],
        decision: input.decision,
        reason: input.reason?.trim() || undefined,
        note: input.note?.trim().slice(0, 500) || undefined,
        archivedAssetId,
        decidedAt: Date.now(),
      }
      stored.records[input.ref] = next
      return next
    })

    if (input.learn !== false) {
      await brandMemoryStore.addFeedback({
        ref: item.ref,
        line: item.line,
        productId: item.productId,
        decision: input.decision,
        reason: record.reason,
        note: record.note,
      })
    }
    contentIndex.invalidate()
    return { ...item, review: record }
  },

  /** Puts a decided item back into the pending queue (undo). */
  async reopen(ref: string) {
    return await reviewStore.mutate((db) => {
      const record = db.records[ref]
      if (!record) throw new Error('该内容不在审核收件箱中')
      record.decision = 'pending'
      record.decidedAt = undefined
      return record
    })
  },
}
