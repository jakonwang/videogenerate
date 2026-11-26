import type { CloudDb } from './db'
import type { SyncService } from './sync'
import type { GenerationService } from './generate'
import { badRequest, CloudError } from './security'
import type {
  AdminDataFile,
  AdminDataRecord,
  AdminFileLinks,
  AdminGeneration,
  AdminGenerationQuery,
  AdminGenerationSource,
  AdminGenerationStatus,
  AdminUserDataSummary,
} from '../../../src/shared/cloud/adminData'
import { SYNC_COLLECTION_PATTERN } from '../../../src/shared/cloud/sync'

/**
 * 总后台「用户数据」：超级管理员只读查看每个用户在云端的全部数据。
 * 不提供任何修改；每次查看由 http 层写操作日志。
 */

const FILE_LINK_TTL_MS = 2 * 60 * 60 * 1000
const MAX_PAGE_SIZE = 60
const MAX_PAGE = 50

const JOB_KIND_LABELS: Record<string, string> = {
  image: 'AI 生图',
  video: '图生视频',
  'analyze-video': '视频拆解',
  compose: '视频合成',
  watermark: '加水印',
  subtitle: '加字幕',
  slice: '视频切片',
  mix: '混剪',
  frames: '抽帧',
  'live-analyze': '直播分析',
  'live-export': '直播切片',
  'parse-link': '链接解析',
}
const JOB_VIDEO_KINDS = ['video', 'compose', 'watermark', 'subtitle', 'slice', 'mix', 'live-export']
const JOB_IMAGE_KINDS = ['image', 'frames']
const SWAP_TASK_LABELS: Record<string, string> = { scene: '换场景', model: '换模特', tryon: '生成模特图', product: '换商品' }

function page(q: { page?: unknown; pageSize?: unknown }, fallbackSize = 30) {
  const size = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(Number(q.pageSize) || fallbackSize)))
  const p = Math.min(MAX_PAGE, Math.max(1, Math.floor(Number(q.page) || 1)))
  return { page: p, pageSize: size, offset: (p - 1) * size }
}

function parse(text: string | null | undefined): any {
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function like(keyword: string) {
  return `%${keyword.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
}

export function createAdminDataService(deps: { db: CloudDb; now: () => number; sync: SyncService; generation: Pick<GenerationService, 'signedLink'> }) {
  const { db } = deps

  function assertUser(userId: string) {
    const row = db.prepare('SELECT id FROM users WHERE id = ?').get(userId)
    if (!row) throw new CloudError('NOT_FOUND', '用户不存在', 404)
  }

  /* ---------------------------------------------------------------- 汇总 */

  function summary(userId: string): AdminUserDataSummary {
    assertUser(userId)
    const collections = (
      db
        .prepare('SELECT collection, SUM(deleted = 0) AS count, SUM(deleted) AS deleted, MAX(server_updated_at) AS last FROM sync_records WHERE user_id = ? GROUP BY collection ORDER BY count DESC')
        .all(userId) as Array<{ collection: string; count: number; deleted: number; last: number }>
    ).map((row) => ({ collection: row.collection, count: Number(row.count) || 0, deleted: Number(row.deleted) || 0, lastUpdatedAt: Number(row.last) || 0 }))
    const files = db
      .prepare(
        `SELECT COUNT(*) AS count, COALESCE(SUM(size), 0) AS bytes,
           SUM(mime LIKE 'image/%') AS images, SUM(mime LIKE 'video/%') AS videos, SUM(mime LIKE 'audio/%') AS audios
         FROM sync_files WHERE user_id = ?`,
      )
      .get(userId) as { count: number; bytes: number; images: number | null; videos: number | null; audios: number | null }
    const count = (sql: string) => db.prepare(sql).get(userId) as { total: number; failed: number | null; last: number | null }
    const proxy = count("SELECT COUNT(*) AS total, SUM(status = 'failed') AS failed, MAX(created_at) AS last FROM ai_gen_logs WHERE user_id = ?")
    const job = count("SELECT COUNT(*) AS total, SUM(status = 'failed') AS failed, MAX(created_at) AS last FROM ai_jobs WHERE user_id = ?")
    const swap = count("SELECT COUNT(*) AS total, SUM(status IN ('failed', 'rejected')) AS failed, MAX(updated_at) AS last FROM scene_swap_items WHERE user_id = ?")
    const lastActivityAt = Math.max(0, ...collections.map((c) => c.lastUpdatedAt), Number(proxy.last) || 0, Number(job.last) || 0, Number(swap.last) || 0)
    const images = Number(files.images) || 0
    const videos = Number(files.videos) || 0
    const audios = Number(files.audios) || 0
    return {
      userId,
      collections,
      files: { count: Number(files.count) || 0, bytes: Number(files.bytes) || 0, images, videos, audios, others: Math.max(0, Number(files.count) - images - videos - audios) },
      generations: {
        proxy: { total: Number(proxy.total) || 0, failed: Number(proxy.failed) || 0 },
        job: { total: Number(job.total) || 0, failed: Number(job.failed) || 0 },
        'scene-swap': { total: Number(swap.total) || 0, failed: Number(swap.failed) || 0 },
      },
      lastActivityAt,
    }
  }

  /* ---------------------------------------------------------------- 同步记录 */

  function records(userId: string, q: { collection?: string; keyword?: string; includeDeleted?: string; page?: unknown; pageSize?: unknown }) {
    assertUser(userId)
    const collection = String(q.collection || '').trim()
    if (!SYNC_COLLECTION_PATTERN.test(collection)) throw badRequest('请选择数据类型')
    const p = page(q, 20)
    const where = ['user_id = ?', 'collection = ?']
    const values: Array<string | number> = [userId, collection]
    if (q.includeDeleted !== '1') where.push('deleted = 0')
    const keyword = String(q.keyword || '').trim()
    if (keyword) {
      where.push("(id LIKE ? ESCAPE '\\' OR data LIKE ? ESCAPE '\\')")
      values.push(like(keyword), like(keyword))
    }
    const clause = where.join(' AND ')
    const total = Number((db.prepare(`SELECT COUNT(*) AS n FROM sync_records WHERE ${clause}`).get(...values) as { n: number }).n)
    const rows = db
      .prepare(`SELECT collection, id, data, updated_at, deleted FROM sync_records WHERE ${clause} ORDER BY updated_at DESC LIMIT ? OFFSET ?`)
      .all(...values, p.pageSize, p.offset) as Array<{ collection: string; id: string; data: string; updated_at: number; deleted: number }>
    const items: AdminDataRecord[] = rows.map((row) => ({ collection: row.collection, id: row.id, updatedAt: row.updated_at, deleted: Boolean(row.deleted), data: row.deleted ? null : parse(row.data) }))
    return { items, total, page: p.page, pageSize: p.pageSize }
  }

  /* ---------------------------------------------------------------- 文件 */

  function files(userId: string, q: { kind?: string; page?: unknown; pageSize?: unknown }) {
    assertUser(userId)
    const p = page(q, 40)
    const kind = String(q.kind || '')
    const filter = kind === 'image' || kind === 'video' || kind === 'audio' ? ' AND mime LIKE ?' : ''
    const values: Array<string | number> = filter ? [userId, `${kind}/%`] : [userId]
    const total = Number((db.prepare(`SELECT COUNT(*) AS n FROM sync_files WHERE user_id = ?${filter}`).get(...values) as { n: number }).n)
    const rows = db
      .prepare(`SELECT id, mime, size, created_at FROM sync_files WHERE user_id = ?${filter} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
      .all(...values, p.pageSize, p.offset) as Array<{ id: string; mime: string; size: number; created_at: number }>
    const items: AdminDataFile[] = rows.map((row) => ({ fileId: row.id, mime: row.mime, size: row.size, createdAt: row.created_at }))
    return { items, total, page: p.page, pageSize: p.pageSize }
  }

  /** 给后台签文件链接（图片直接显示、视频按需拖动播放） */
  function fileLinks(body: { files?: unknown }): AdminFileLinks {
    const list = (Array.isArray(body?.files) ? body.files : []).slice(0, 200) as Array<{ userId?: unknown; fileId?: unknown }>
    const expiresAt = deps.now() + FILE_LINK_TTL_MS
    const links: Record<string, string> = {}
    const mimes: Record<string, string> = {}
    for (const entry of list) {
      const userId = String(entry?.userId || '')
      const fileId = String(entry?.fileId || '')
      if (!userId || !fileId || links[`${userId}:${fileId}`]) continue
      try {
        const info = deps.sync.fileInfo(userId, fileId)
        links[`${userId}:${fileId}`] = deps.generation.signedLink(userId, fileId, info.mime, expiresAt)
        mimes[`${userId}:${fileId}`] = info.mime
      } catch {
        // 文件已被清理：前端显示「文件已删除」
      }
    }
    return { links, mimes, expiresAt }
  }

  /* ---------------------------------------------------------------- 生成记录（全站 / 单个用户） */

  function generations(q: AdminGenerationQuery & Record<string, unknown>) {
    const p = page(q, 30)
    const limit = p.page * p.pageSize
    const userId = String(q.userId || '').trim()
    const source = String(q.source || '') as AdminGenerationSource | ''
    const kind = String(q.kind || '')
    const status = String(q.status || '') as AdminGenerationStatus | ''
    const keyword = String(q.keyword || '').trim()
    const k = keyword ? like(keyword) : ''
    const parts: Array<{ total: number; items: AdminGeneration[] }> = []

    if (!source || source === 'proxy') {
      const where: string[] = []
      const values: Array<string | number> = []
      if (userId) where.push('l.user_id = ?'), values.push(userId)
      if (kind === 'image' || kind === 'video') where.push('l.capability = ?'), values.push(kind)
      if (status) where.push('l.status = ?'), values.push(status)
      if (k) where.push("(l.prompt LIKE ? ESCAPE '\\' OR l.model LIKE ? ESCAPE '\\' OR u.account LIKE ? ESCAPE '\\')"), values.push(k, k, k)
      const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''
      const total = Number((db.prepare(`SELECT COUNT(*) AS n FROM ai_gen_logs l JOIN users u ON u.id = l.user_id ${clause}`).get(...values) as { n: number }).n)
      const rows = db.prepare(`SELECT l.*, u.account FROM ai_gen_logs l JOIN users u ON u.id = l.user_id ${clause} ORDER BY l.created_at DESC LIMIT ?`).all(...values, limit) as any[]
      parts.push({
        total,
        items: rows.map((row) => ({
          key: `proxy:${row.id}`,
          source: 'proxy',
          id: row.id,
          userId: row.user_id,
          account: row.account,
          kind: row.capability === 'video' ? 'video' : row.capability === 'image' ? 'image' : 'other',
          label: row.capability === 'video' ? 'AI 视频' : 'AI 图片',
          prompt: row.prompt,
          platform: row.platform,
          model: row.model,
          client: row.client,
          status: row.status,
          error: row.error,
          outputFileId: '',
          outputMime: '',
          thumbFileId: row.thumb_file_id,
          outputUrl: row.output_url,
          createdAt: row.created_at,
        })),
      })
    }

    if (!source || source === 'job') {
      const where: string[] = []
      const values: Array<string | number> = []
      if (userId) where.push('j.user_id = ?'), values.push(userId)
      if (kind === 'video') where.push(`(j.output_mime LIKE 'video/%' OR (j.output_mime IS NULL AND j.kind IN (${JOB_VIDEO_KINDS.map(() => '?').join(',')})))`), values.push(...JOB_VIDEO_KINDS)
      if (kind === 'image') where.push(`(j.output_mime LIKE 'image/%' OR (j.output_mime IS NULL AND j.kind IN (${JOB_IMAGE_KINDS.map(() => '?').join(',')})))`), values.push(...JOB_IMAGE_KINDS)
      if (status === 'running') where.push("j.status IN ('queued', 'running')")
      else if (status) where.push('j.status = ?'), values.push(status)
      if (k) where.push("(j.input LIKE ? ESCAPE '\\' OR j.kind LIKE ? ESCAPE '\\' OR u.account LIKE ? ESCAPE '\\')"), values.push(k, k, k)
      const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''
      const total = Number((db.prepare(`SELECT COUNT(*) AS n FROM ai_jobs j JOIN users u ON u.id = j.user_id ${clause}`).get(...values) as { n: number }).n)
      const rows = db
        .prepare(`SELECT j.id, j.user_id, j.kind, j.status, j.input, j.output_file_id, j.output_mime, j.error, j.result, j.created_at, u.account FROM ai_jobs j JOIN users u ON u.id = j.user_id ${clause} ORDER BY j.created_at DESC LIMIT ?`)
        .all(...values, limit) as any[]
      parts.push({
        total,
        items: rows.map((row) => {
          const input = parse(row.input) || {}
          const result = parse(row.result) || {}
          const first = Array.isArray(result.outputs) ? result.outputs[0] : null
          const outputFileId = String(row.output_file_id || first?.fileId || '')
          const outputMime = String(row.output_mime || first?.mime || '')
          const outputs = Array.isArray(result.outputs) ? result.outputs.length : 0
          return {
            key: `job:${row.id}`,
            source: 'job',
            id: row.id,
            userId: row.user_id,
            account: row.account,
            kind: outputMime.startsWith('video/') || (!outputMime && JOB_VIDEO_KINDS.includes(row.kind)) ? 'video' : outputMime.startsWith('image/') || JOB_IMAGE_KINDS.includes(row.kind) ? 'image' : 'other',
            label: `${JOB_KIND_LABELS[row.kind] || row.kind}${outputs > 1 ? ` · ${outputs} 份` : ''}`,
            prompt: String(input.prompt || ''),
            platform: '',
            model: String(input.model || ''),
            client: '',
            status: row.status === 'queued' || row.status === 'running' ? 'running' : row.status === 'succeeded' ? 'succeeded' : 'failed',
            error: String(row.error || ''),
            outputFileId,
            outputMime,
            thumbFileId: '',
            outputUrl: '',
            createdAt: row.created_at,
          } satisfies AdminGeneration
        }),
      })
    }

    if ((!source || source === 'scene-swap') && kind !== 'video') {
      const where: string[] = []
      const values: Array<string | number> = []
      if (userId) where.push('i.user_id = ?'), values.push(userId)
      if (status === 'succeeded') where.push("i.status IN ('passed', 'review')")
      else if (status === 'failed') where.push("i.status IN ('failed', 'rejected')")
      else if (status === 'running') where.push("i.status IN ('waiting', 'queued', 'running')")
      if (k) where.push("(b.data LIKE ? ESCAPE '\\' OR i.data LIKE ? ESCAPE '\\' OR u.account LIKE ? ESCAPE '\\')"), values.push(k, k, k)
      const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''
      const from = 'FROM scene_swap_items i JOIN scene_swap_batches b ON b.id = i.batch_id JOIN users u ON u.id = i.user_id'
      const total = Number((db.prepare(`SELECT COUNT(*) AS n ${from} ${clause}`).get(...values) as { n: number }).n)
      const rows = db
        .prepare(`SELECT i.id, i.user_id, i.status, i.output_file_id, i.data, i.updated_at, b.data AS batch, b.created_at, u.account ${from} ${clause} ORDER BY b.created_at DESC, i.ord ASC LIMIT ?`)
        .all(...values, limit) as any[]
      parts.push({
        total,
        items: rows.map((row) => {
          const item = parse(row.data) || {}
          const batch = parse(row.batch) || {}
          const passed = row.status === 'passed' || row.status === 'review'
          const failed = row.status === 'failed' || row.status === 'rejected'
          return {
            key: `scene-swap:${row.id}`,
            source: 'scene-swap',
            id: row.id,
            userId: row.user_id,
            account: row.account,
            kind: 'image',
            label: [SWAP_TASK_LABELS[batch.task] || 'AI 修图', batch.title, item.sceneName].filter(Boolean).join(' · '),
            prompt: '',
            platform: '',
            model: '',
            client: '',
            status: passed ? 'succeeded' : failed ? 'failed' : 'running',
            error: String(item.error || (row.status === 'rejected' ? '用户不要这张' : '')),
            outputFileId: String(row.output_file_id || ''),
            outputMime: row.output_file_id ? 'image/png' : '',
            thumbFileId: '',
            outputUrl: '',
            createdAt: Number(row.created_at) || Number(row.updated_at) || 0,
          } satisfies AdminGeneration
        }),
      })
    }

    const merged = parts.flatMap((part) => part.items).sort((a, b) => b.createdAt - a.createdAt)
    return {
      items: merged.slice(p.offset, p.offset + p.pageSize),
      total: parts.reduce((sum, part) => sum + part.total, 0),
      page: p.page,
      pageSize: p.pageSize,
    }
  }

  return { summary, records, files, fileLinks, generations }
}

export type AdminDataService = ReturnType<typeof createAdminDataService>
