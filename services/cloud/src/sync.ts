import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { CloudDb } from './db'
import { transaction } from './db'
import { badRequest, CloudError } from './security'
import type { SyncChange, SyncPullResponse, SyncPushResponse } from '../../../src/shared/cloud/sync'
import { SYNC_COLLECTION_PATTERN, SYNC_MAX_PULL, SYNC_MAX_PUSH, SYNC_MAX_RECORD_BYTES } from '../../../src/shared/cloud/sync'

/**
 * 多端数据同步：桌面端与手机端共用的「记录 + 文件」云存储。
 *
 * - 记录：按 (用户, 集合, id) 存一份 JSON，最后写入者胜（比较客户端 updatedAt）。
 *   每次写入分配该用户内单调递增的 seq，客户端用 since=seq 增量拉取。删除是墓碑（deleted=1），保留以便其他端感知。
 * - 文件：按内容 sha256 去重存放，记录里只引用 fileId。
 */

type RecordRow = { collection: string; id: string; data: string; updated_at: number; deleted: number; seq: number }

const FILE_ID_PATTERN = /^[a-f0-9]{64}$/
const ALLOWED_MIME = /^(image\/(png|jpeg|webp|gif)|video\/(mp4|quicktime|webm)|audio\/(mpeg|mp4|wav|x-wav))$/

export function createSyncService(deps: { db: CloudDb; dataDir: string; quotaBytes: number; now: () => number }) {
  const { db, now } = deps
  const filesRoot = join(deps.dataDir, 'files')

  function assertCollection(collection: string) {
    if (!SYNC_COLLECTION_PATTERN.test(collection)) throw badRequest(`集合名不合法：${collection}`)
  }

  function toChange(row: RecordRow): SyncChange {
    return {
      collection: row.collection,
      id: row.id,
      updatedAt: row.updated_at,
      deleted: Boolean(row.deleted),
      seq: row.seq,
      data: row.deleted ? null : JSON.parse(row.data),
    }
  }

  function currentSeq(userId: string): number {
    const row = db.prepare('SELECT COALESCE(MAX(seq), 0) AS seq FROM sync_records WHERE user_id = ?').get(userId) as { seq: number }
    return Number(row.seq)
  }

  function pull(userId: string, input: { since?: unknown; collections?: unknown; limit?: unknown }): SyncPullResponse {
    const since = Math.max(0, Math.floor(Number(input.since) || 0))
    const limit = Math.min(SYNC_MAX_PULL, Math.max(1, Math.floor(Number(input.limit) || SYNC_MAX_PULL)))
    const collections = String(input.collections || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
    collections.forEach(assertCollection)
    const filter = collections.length ? ` AND collection IN (${collections.map(() => '?').join(',')})` : ''
    const rows = db
      .prepare(`SELECT collection, id, data, updated_at, deleted, seq FROM sync_records WHERE user_id = ? AND seq > ?${filter} ORDER BY seq ASC LIMIT ?`)
      .all(userId, since, ...collections, limit + 1) as RecordRow[]
    const hasMore = rows.length > limit
    const page = rows.slice(0, limit)
    const cursor = page.length ? page[page.length - 1].seq : hasMore ? since : Math.max(since, currentSeq(userId))
    return { changes: page.map(toChange), cursor, hasMore }
  }

  function push(userId: string, input: { changes?: unknown }): SyncPushResponse {
    const changes = Array.isArray(input.changes) ? input.changes : []
    if (changes.length > SYNC_MAX_PUSH) throw badRequest(`单次最多提交 ${SYNC_MAX_PUSH} 条`)
    const applied: SyncChange[] = []
    const conflicts: SyncChange[] = []
    transaction(db, () => {
      let seq = currentSeq(userId)
      const select = db.prepare('SELECT collection, id, data, updated_at, deleted, seq FROM sync_records WHERE user_id = ? AND collection = ? AND id = ?')
      const upsert = db.prepare(`
        INSERT INTO sync_records (user_id, collection, id, data, updated_at, deleted, seq, server_updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (user_id, collection, id) DO UPDATE SET
          data = excluded.data, updated_at = excluded.updated_at, deleted = excluded.deleted,
          seq = excluded.seq, server_updated_at = excluded.server_updated_at
      `)
      for (const raw of changes as Array<Record<string, unknown>>) {
        const collection = String(raw?.collection || '')
        const id = String(raw?.id || '')
        assertCollection(collection)
        if (!id || id.length > 128) throw badRequest('记录 id 不合法')
        const updatedAt = Math.floor(Number(raw.updatedAt) || 0)
        if (updatedAt <= 0) throw badRequest('缺少 updatedAt')
        const deleted = Boolean(raw.deleted)
        const data = deleted ? 'null' : JSON.stringify(raw.data ?? null)
        if (Buffer.byteLength(data) > SYNC_MAX_RECORD_BYTES) throw badRequest(`记录过大：${collection}/${id}`)

        const existing = select.get(userId, collection, id) as RecordRow | undefined
        // Last write wins; equal timestamps go to the incoming write so a retry is idempotent.
        if (existing && existing.updated_at > updatedAt) {
          conflicts.push(toChange(existing))
          continue
        }
        seq += 1
        upsert.run(userId, collection, id, data, updatedAt, deleted ? 1 : 0, seq, now())
        applied.push({ collection, id, updatedAt, deleted, seq, data: deleted ? null : JSON.parse(data) })
      }
    })
    return { applied, conflicts, cursor: currentSeq(userId) }
  }

  /* ---------------------------------------------------------------- 文件 */

  function userDir(userId: string) {
    return join(filesRoot, userId.replace(/[^a-zA-Z0-9_-]/g, '_'))
  }

  function usedBytes(userId: string): number {
    const row = db.prepare('SELECT COALESCE(SUM(size), 0) AS size FROM sync_files WHERE user_id = ?').get(userId) as { size: number }
    return Number(row.size)
  }

  function uploadFile(userId: string, body: Buffer, mimeHeader: string) {
    const mime = String(mimeHeader || '').split(';')[0].trim().toLowerCase()
    if (!ALLOWED_MIME.test(mime)) throw badRequest(`不支持的文件类型：${mime || '未知'}`)
    if (!body.length) throw badRequest('文件为空')
    const fileId = createHash('sha256').update(body).digest('hex')
    const existing = db.prepare('SELECT size FROM sync_files WHERE user_id = ? AND id = ?').get(userId, fileId) as { size: number } | undefined
    if (existing) return { fileId, size: existing.size, mime }
    if (usedBytes(userId) + body.length > deps.quotaBytes) {
      throw new CloudError('QUOTA_EXCEEDED', '云端存储空间已满，请清理后再试', 413)
    }
    const dir = userDir(userId)
    mkdirSync(dir, { recursive: true })
    const target = join(dir, fileId)
    if (!existsSync(target)) {
      const temp = `${target}.${process.pid}.tmp`
      writeFileSync(temp, body)
      renameSync(temp, target)
    }
    db.prepare('INSERT OR IGNORE INTO sync_files (user_id, id, mime, size, created_at) VALUES (?, ?, ?, ?, ?)').run(userId, fileId, mime, body.length, now())
    return { fileId, size: body.length, mime }
  }

  function readFile(userId: string, fileId: string) {
    if (!FILE_ID_PATTERN.test(fileId)) throw badRequest('文件 id 不合法')
    const row = db.prepare('SELECT mime, size FROM sync_files WHERE user_id = ? AND id = ?').get(userId, fileId) as { mime: string; size: number } | undefined
    const path = join(userDir(userId), fileId)
    if (!row || !existsSync(path)) throw new CloudError('NOT_FOUND', '文件不存在', 404)
    return { mime: row.mime, size: statSync(path).size, body: readFileSync(path) }
  }

  function usage(userId: string) {
    const records = db.prepare('SELECT COUNT(*) AS count FROM sync_records WHERE user_id = ? AND deleted = 0').get(userId) as { count: number }
    return { records: Number(records.count), fileBytes: usedBytes(userId), quotaBytes: deps.quotaBytes, cursor: currentSeq(userId) }
  }

  return { pull, push, uploadFile, readFile, usage }
}

export type SyncService = ReturnType<typeof createSyncService>
