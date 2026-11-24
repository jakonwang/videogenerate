import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import type { CloudDb } from '../db'
import { transaction } from '../db'
import type { BillingService } from '../billing'
import { badRequest, CloudError } from '../security'
import type { SyncService } from '../sync'
import { SYNC_COLLECTIONS, type SyncAsset } from '../../../../src/shared/cloud/sync'
import {
  SCENE_CATEGORIES,
  SCENE_REDO_REASONS,
  SCENE_SWAP_MAX_IMAGES,
  SCENE_SWAP_MAX_SCENES,
  SCENE_SWAP_TRIAL_IMAGES,
  styleGroupOf,
  type SceneSwapBatch,
  type SceneSwapBatchStatus,
  type SceneSwapCheck,
  type SceneSwapCreateInput,
  type SceneSwapInfo,
  type SceneSwapItem,
  type SceneSwapItemStatus,
  type SceneSwapMode,
  type SceneSwapScene,
  type SceneSwapSize,
} from '../../../../src/shared/sceneSwap'
import { checkBlendColor, checkKeep, composeKeep, maskStats, normalizeSource, readMask, type MaskStats } from './compose'
import type { Matting } from './matting'
import { blendPrompt, inspectPrompt, parseInspection, platePrompt } from './prompts'

/**
 * 批量换景：批次和队列都在云端，三端只是看和点，关掉页面也会跑完。
 * 保真 = 原图抠人 + AI 出空背景 + 原像素贴回；融合 = 整张重画。
 * 计费：每张成品按一次图片生成计费；质检不确定的先冻结，用户点「可以用」才扣，不要就全退。
 */

type BatchRow = { id: string; user_id: string; status: SceneSwapBatchStatus | 'deleted'; data: string; created_at: number; updated_at: number }
type BatchData = { title: string; mode: SceneSwapMode; size: SceneSwapSize; matchLight: boolean; notice?: string }
type ItemRow = { id: string; batch_id: string; user_id: string; ord: number; status: SceneSwapItemStatus; trial: number; hold_id: string | null; output_file_id: string | null; attempts: number; data: string; updated_at: number }
type ItemData = { sourceFileId: string; sourceName: string; group: string; sceneId: string; sceneName: string; sceneFileId: string; checks?: SceneSwapCheck[]; error?: string; reasons?: string[] }
type SceneRow = { id: string; owner_id: string; is_system: number; name: string; category: string; file_id: string; created_at: number }

export type RenderImage = (input: { userId: string; prompt: string; refs: Array<{ fileId: string; path: string }>; width: number; height: number; workDir: string }) => Promise<string>
/** 视觉质检：返回模型的文字；没配置对话模型时抛错 */
export type Inspect = (prompt: string, images: Buffer[]) => Promise<string>

const MAX_ATTEMPTS = 6
const DAY_MS = 24 * 60 * 60 * 1000
/** 重新生成背景可能解决的问题；抠图边缘、画面被切重做也没用 */
const RETRYABLE: Array<SceneSwapCheck['key']> = ['light', 'face', 'pattern', 'color']

export function createSceneSwapService(deps: {
  db: CloudDb
  now: () => number
  dataDir: string
  sync: SyncService
  billing: Pick<BillingService, 'hold' | 'settle'>
  imageModel: () => { platform: string; model: string }
  /** 没配置图片平台时抛错 */
  assertConfigured: () => void
  quota: { remaining: (userId: string) => number; record: (userId: string, ok: boolean) => void }
  matting: Matting
  renderImage: RenderImage
  inspect: Inspect
  concurrency: number
  trialsPerDay: number
}) {
  const { db, now } = deps
  const cacheRoot = join(deps.dataDir, 'scene-swap-cache')
  let running = 0
  let closed = false

  // 重启时正在跑的重新排队（冻结的点数沿用，不会重复扣）
  db.prepare("UPDATE scene_swap_items SET status = 'queued' WHERE status = 'running'").run()

  /* ---------------------------------------------------------------- 读写 */

  const parse = <T>(text: string) => JSON.parse(text) as T
  const itemsOf = (batchId: string) => db.prepare('SELECT * FROM scene_swap_items WHERE batch_id = ? ORDER BY ord').all(batchId) as ItemRow[]

  function batchRow(userId: string, id: string) {
    const row = db.prepare("SELECT * FROM scene_swap_batches WHERE id = ? AND user_id = ? AND status != 'deleted'").get(id, userId) as BatchRow | undefined
    if (!row) throw new CloudError('NOT_FOUND', '批次不存在', 404)
    return row
  }

  function itemRow(userId: string, batchId: string, itemId: string) {
    batchRow(userId, batchId)
    const row = db.prepare('SELECT * FROM scene_swap_items WHERE id = ? AND batch_id = ?').get(itemId, batchId) as ItemRow | undefined
    if (!row) throw new CloudError('NOT_FOUND', '图片不存在', 404)
    return row
  }

  function toItem(row: ItemRow): SceneSwapItem {
    const data = parse<ItemData>(row.data)
    return {
      id: row.id,
      sourceFileId: data.sourceFileId,
      sourceName: data.sourceName,
      group: data.group,
      sceneId: data.sceneId,
      sceneName: data.sceneName,
      sceneFileId: data.sceneFileId,
      status: row.status,
      trial: Boolean(row.trial),
      outputFileId: row.output_file_id ?? undefined,
      checks: data.checks ?? [],
      error: data.error,
      attempts: row.attempts,
    }
  }

  function toBatch(row: BatchRow): SceneSwapBatch {
    const data = parse<BatchData>(row.data)
    return { id: row.id, ...data, status: row.status as SceneSwapBatchStatus, items: itemsOf(row.id).map(toItem), createdAt: row.created_at, updatedAt: row.updated_at }
  }

  function setItem(id: string, patch: Partial<Pick<ItemRow, 'status' | 'trial' | 'hold_id' | 'output_file_id' | 'attempts'>>, data?: Partial<ItemData>) {
    const row = db.prepare('SELECT * FROM scene_swap_items WHERE id = ?').get(id) as ItemRow
    const next = { ...row, ...patch }
    db.prepare('UPDATE scene_swap_items SET status = ?, trial = ?, hold_id = ?, output_file_id = ?, attempts = ?, data = ?, updated_at = ? WHERE id = ?').run(
      next.status,
      next.trial,
      next.hold_id,
      next.output_file_id,
      next.attempts,
      JSON.stringify({ ...parse<ItemData>(row.data), ...data }),
      now(),
      id,
    )
  }

  function setBatch(id: string, status: BatchRow['status'], data?: Partial<BatchData>) {
    const row = db.prepare('SELECT * FROM scene_swap_batches WHERE id = ?').get(id) as BatchRow
    if (row.status === 'deleted') return
    db.prepare('UPDATE scene_swap_batches SET status = ?, data = ?, updated_at = ? WHERE id = ?').run(status, JSON.stringify({ ...parse<BatchData>(row.data), ...data }), now(), id)
  }

  /** 没有在跑的了：试图阶段 → 等用户确认；整批 → 完成 */
  function refreshBatch(id: string) {
    const row = db.prepare('SELECT * FROM scene_swap_batches WHERE id = ?').get(id) as BatchRow
    if (row.status === 'deleted' || row.status === 'paused') return
    const statuses = itemsOf(id).map((item) => item.status)
    if (statuses.some((status) => status === 'queued' || status === 'running')) return
    setBatch(id, statuses.includes('waiting') ? 'trial_ready' : 'done')
  }

  function trialsLeft(userId: string) {
    const used = db.prepare('SELECT COALESCE(SUM(calls), 0) AS n FROM ai_usage WHERE user_id = ? AND day = ? AND purpose = ?').get(userId, dayKey(), 'scene-swap-trial') as { n: number }
    return Math.max(0, deps.trialsPerDay - Number(used.n))
  }
  const dayKey = () => new Date(now()).toISOString().slice(0, 10)

  /** 占用免费试图名额；名额不够返回 false（这张按正常扣点） */
  function takeTrial(userId: string) {
    if (trialsLeft(userId) <= 0) return false
    db.prepare('INSERT INTO ai_usage (user_id, day, purpose, calls, failures) VALUES (?, ?, ?, 1, 0) ON CONFLICT (user_id, day, purpose) DO UPDATE SET calls = calls + 1').run(userId, dayKey(), 'scene-swap-trial')
    return true
  }

  /* ---------------------------------------------------------------- 场景库 */

  const toScene = (row: SceneRow): SceneSwapScene => ({ id: row.id, name: row.name, category: row.category, fileId: row.file_id, source: row.is_system ? 'system' : 'mine' })

  function listScenes(userId: string) {
    return (db.prepare('SELECT * FROM scene_swap_scenes WHERE deleted = 0 AND (is_system = 1 OR owner_id = ?) ORDER BY is_system, created_at DESC').all(userId) as SceneRow[]).map(toScene)
  }

  function addScene(userId: string, body: { fileId?: unknown; name?: unknown; category?: unknown }, system = false) {
    const fileId = String(body?.fileId || '')
    const file = deps.sync.readFile(userId, fileId)
    if (!file.mime.startsWith('image/')) throw badRequest('场景要用图片')
    const category = SCENE_CATEGORIES.find((item) => item === body.category) ?? (system ? '室内' : '我的场景')
    const id = `scn_${randomUUID()}`
    db.prepare('INSERT INTO scene_swap_scenes (id, owner_id, is_system, name, category, file_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, userId, system ? 1 : 0, String(body.name || '').trim().slice(0, 40) || '场景', category, fileId, now())
    return toScene(db.prepare('SELECT * FROM scene_swap_scenes WHERE id = ?').get(id) as SceneRow)
  }

  function removeScene(userId: string, id: string, system = false) {
    const result = system
      ? db.prepare('UPDATE scene_swap_scenes SET deleted = 1 WHERE id = ? AND is_system = 1').run(id)
      : db.prepare('UPDATE scene_swap_scenes SET deleted = 1 WHERE id = ? AND is_system = 0 AND owner_id = ?').run(id, userId)
    if (!result.changes) throw new CloudError('NOT_FOUND', '场景不存在', 404)
    return {}
  }

  const systemScenes = () => (db.prepare('SELECT * FROM scene_swap_scenes WHERE deleted = 0 AND is_system = 1 ORDER BY created_at DESC').all() as SceneRow[]).map(toScene)

  /* ---------------------------------------------------------------- 批次 */

  function create(userId: string, body: SceneSwapCreateInput): SceneSwapBatch {
    const images = (Array.isArray(body?.images) ? body.images : []).map((image) => ({ fileId: String(image?.fileId || ''), name: String(image?.name || '图片').slice(0, 120), group: String(image?.group || '').trim().slice(0, 40) }))
    if (!images.length) throw badRequest('请先上传图片')
    if (images.length > SCENE_SWAP_MAX_IMAGES) throw badRequest(`一次最多 ${SCENE_SWAP_MAX_IMAGES} 张图片`)
    const sceneIds = [...new Set((Array.isArray(body.sceneIds) ? body.sceneIds : []).map(String))]
    if (!sceneIds.length) throw badRequest('请选择场景')
    if (sceneIds.length > SCENE_SWAP_MAX_SCENES) throw badRequest(`一次最多选 ${SCENE_SWAP_MAX_SCENES} 个场景`)
    const all = new Map(listScenes(userId).map((scene) => [scene.id, scene]))
    const scenes = sceneIds.map((id) => all.get(id) ?? (() => { throw badRequest('有场景已被删除，请重新选择') })())
    const mode: SceneSwapMode = body.mode === 'blend' ? 'blend' : 'keep'
    if (mode === 'keep' && !deps.matting.available()) throw new CloudError('NO_ENTITLEMENT', '服务器还没有安装抠图组件，暂时不能用保真模式，请联系客服', 503)
    deps.assertConfigured()
    for (const image of images) if (!deps.sync.readFile(userId, image.fileId).mime.startsWith('image/')) throw badRequest(`「${image.name}」不是图片`)
    const size: SceneSwapSize = body.size === '3:4' || body.size === '1:1' || body.size === '9:16' ? body.size : 'original'

    const withGroup = images.map((image) => ({ ...image, group: image.group || styleGroupOf(image.name) }))
    const groups = [...new Set(withGroup.map((image) => image.group))]
    const title = String(body.title || '').trim().slice(0, 60) || `${groups.slice(0, 2).join('、')} · ${scenes.map((scene) => scene.name).slice(0, 2).join('、')}`

    // 试图：第一个场景，从不同款里各抽一张，不够再补
    const firstOfGroup = groups.map((group) => withGroup.findIndex((image) => image.group === group))
    const trial = new Set([...firstOfGroup, ...withGroup.keys()].slice(0, firstOfGroup.length + withGroup.length))
    const trialImages = new Set([...trial].slice(0, SCENE_SWAP_TRIAL_IMAGES))

    const id = `ssb_${randomUUID()}`
    const t = now()
    transaction(db, () => {
      db.prepare('INSERT INTO scene_swap_batches (id, user_id, status, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(id, userId, 'trial', JSON.stringify({ title, mode, size, matchLight: body.matchLight !== false } satisfies BatchData), t, t)
      let ord = 0
      for (const [sceneIndex, scene] of scenes.entries()) {
        for (const [imageIndex, image] of withGroup.entries()) {
          const isTrial = sceneIndex === 0 && trialImages.has(imageIndex)
          const data: ItemData = { sourceFileId: image.fileId, sourceName: image.name, group: image.group, sceneId: scene.id, sceneName: scene.name, sceneFileId: scene.fileId }
          db.prepare('INSERT INTO scene_swap_items (id, batch_id, user_id, ord, status, trial, attempts, data, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)').run(`ssi_${randomUUID()}`, id, userId, (ord += 1), isTrial ? 'queued' : 'waiting', isTrial && takeTrial(userId) ? 1 : 0, JSON.stringify(data), t)
        }
      }
    })
    pump()
    return get(userId, id)
  }

  const get = (userId: string, id: string) => toBatch(batchRow(userId, id))
  const list = (userId: string) => (db.prepare("SELECT * FROM scene_swap_batches WHERE user_id = ? AND status != 'deleted' ORDER BY created_at DESC LIMIT 50").all(userId) as BatchRow[]).map(toBatch)

  /** 满意，跑整批 / 暂停后继续 */
  function run(userId: string, id: string) {
    batchRow(userId, id)
    db.prepare("UPDATE scene_swap_items SET status = 'queued', updated_at = ? WHERE batch_id = ? AND status = 'waiting'").run(now(), id)
    setBatch(id, 'running', { notice: undefined })
    refreshBatch(id)
    pump()
    return get(userId, id)
  }

  function pause(userId: string, id: string) {
    const row = batchRow(userId, id)
    if (row.status === 'running' || row.status === 'trial') {
      // 还在试图阶段暂停：继续时只跑完试图，不会直接跑整批
      setBatch(id, 'paused', { notice: undefined })
    }
    return get(userId, id)
  }

  function resume(userId: string, id: string) {
    batchRow(userId, id)
    setBatch(id, itemsOf(id).some((item) => item.status === 'waiting') ? 'trial' : 'running', { notice: undefined })
    refreshBatch(id)
    pump()
    return get(userId, id)
  }

  /** 换 2 张再试 */
  function retrial(userId: string, id: string) {
    const row = batchRow(userId, id)
    if (row.status !== 'trial_ready') throw badRequest('试图完成后才能换图再试')
    const waiting = itemsOf(id).filter((item) => item.status === 'waiting').slice(0, SCENE_SWAP_TRIAL_IMAGES)
    for (const item of waiting) setItem(item.id, { status: 'queued', trial: takeTrial(userId) ? 1 : 0 })
    setBatch(id, 'trial', { notice: undefined })
    pump()
    return get(userId, id)
  }

  function remove(userId: string, id: string) {
    batchRow(userId, id)
    for (const item of itemsOf(id)) if (item.hold_id && item.status !== 'running' && item.status !== 'passed') settle(item, false, '批次已删除')
    db.prepare("UPDATE scene_swap_batches SET status = 'deleted', updated_at = ? WHERE id = ?").run(now(), id)
    return {}
  }

  function redo(userId: string, batchId: string, itemId: string, body: { reasons?: unknown }) {
    const row = itemRow(userId, batchId, itemId)
    if (!['passed', 'review', 'failed', 'rejected'].includes(row.status)) throw badRequest('这张正在处理，请稍等')
    if (row.attempts >= MAX_ATTEMPTS) throw badRequest('这张已经重做多次，换张原图或场景试试')
    const reasons = SCENE_REDO_REASONS.filter((reason) => Array.isArray(body?.reasons) && body.reasons.includes(reason))
    // 质检没过的重做沿用冻结的点数；已经通过的重做要再扣一次；试图免费只算一次
    const reusable = row.status === 'review' && row.hold_id
    setItem(itemId, { status: 'queued', hold_id: reusable ? row.hold_id : null, trial: row.status === 'review' || row.status === 'failed' ? row.trial : 0 }, { reasons: [...reasons], error: undefined })
    if (['done', 'trial_ready'].includes(batchRow(userId, batchId).status)) setBatch(batchId, itemsOf(batchId).some((item) => item.status === 'waiting') ? 'trial' : 'running')
    pump()
    return get(userId, batchId)
  }

  function accept(userId: string, batchId: string, itemId: string) {
    const row = itemRow(userId, batchId, itemId)
    if (row.status !== 'review') throw badRequest('这张不需要确认')
    settle(row, true, '')
    setItem(itemId, { status: 'passed' })
    saveAsset(row)
    return get(userId, batchId)
  }

  function reject(userId: string, batchId: string, itemId: string) {
    const row = itemRow(userId, batchId, itemId)
    if (row.status !== 'review') throw badRequest('只有要看一下的图可以不要')
    settle(row, false, '质检未通过')
    setItem(itemId, { status: 'rejected', hold_id: null })
    return get(userId, batchId)
  }

  function settle(row: Pick<ItemRow, 'hold_id'>, ok: boolean, reason: string) {
    if (!row.hold_id) return
    try {
      deps.billing.settle(null, row.hold_id, ok, reason, { alwaysRefund: true })
    } catch (error) {
      console.warn('[scene-swap] 点数结算失败', row.hold_id, (error as Error).message)
    }
  }

  /** 合格的图进素材库（三端都能看到） */
  function saveAsset(row: ItemRow) {
    const current = db.prepare('SELECT * FROM scene_swap_items WHERE id = ?').get(row.id) as ItemRow
    if (!current.output_file_id) return
    const data = parse<ItemData>(current.data)
    const file = deps.sync.readFile(row.user_id, current.output_file_id)
    const asset: SyncAsset = { name: `${data.sourceName.replace(/\.[^.]+$/, '')}_${data.sceneName}`, kind: 'image', fileId: current.output_file_id, mime: file.mime, size: file.size, folder: `批量换景 / ${data.group}`, createdAt: now() }
    deps.sync.push(row.user_id, { changes: [{ collection: SYNC_COLLECTIONS.assets, id: row.id, updatedAt: now(), deleted: false, data: asset }] })
  }

  /* ---------------------------------------------------------------- 执行 */

  const preparing = new Map<string, Promise<unknown>>()
  async function shared<T>(key: string, work: () => Promise<T>): Promise<T> {
    let pending = preparing.get(key) as Promise<T> | undefined
    if (!pending) {
      pending = work().finally(() => preparing.delete(key))
      preparing.set(key, pending)
    }
    return pending
  }

  /** 同一张原图的规范化和抠图只做一次（多场景、重做都复用） */
  async function prepareSource(userId: string, fileId: string, withMask: boolean) {
    const dir = join(cacheRoot, userId.replace(/[^a-zA-Z0-9_-]/g, '_'))
    const path = join(dir, `${fileId}.png`)
    const maskPath = join(dir, `${fileId}.mask.png`)
    await shared(path, async () => {
      if (existsSync(path)) return
      await mkdir(dir, { recursive: true })
      await normalizeSource(deps.sync.readFile(userId, fileId).body, path)
    })
    const meta = await sharp(path).metadata()
    const width = meta.width!
    const height = meta.height!
    if (!withMask) return { path, width, height, mask: null }
    await shared(maskPath, async () => {
      if (!existsSync(maskPath)) await deps.matting.run(path, maskPath)
    })
    return { path, width, height, mask: await readMask(maskPath, width, height) }
  }

  async function thumb(path: string) {
    return sharp(path).resize(1024, 1024, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer()
  }

  async function vision(mode: SceneSwapMode, before: string, after: string): Promise<SceneSwapCheck[]> {
    try {
      return parseInspection(mode, await deps.inspect(inspectPrompt(mode), [await thumb(before), await thumb(after)]))
    } catch {
      return parseInspection(mode, '')
    }
  }

  async function attempt(row: ItemRow, batch: BatchData, workDir: string, reasons: string[]): Promise<{ output: string; checks: SceneSwapCheck[] }> {
    const data = parse<ItemData>(row.data)
    const canMatte = deps.matting.available()
    if (batch.mode === 'keep' && !canMatte) throw new Error('服务器的抠图组件不可用')
    const source = await prepareSource(row.user_id, data.sourceFileId, canMatte)
    const scenePath = join(workDir, 'scene.png')
    if (!existsSync(scenePath)) await normalizeSource(deps.sync.readFile(row.user_id, data.sceneFileId).body, scenePath)
    const scene = { fileId: data.sceneFileId, path: scenePath }
    const output = join(workDir, `out_${randomUUID()}.jpg`)

    if (batch.mode === 'keep') {
      const mask = source.mask!
      const stats: MaskStats = maskStats(mask, source.width, source.height)
      if (stats.coverage < 0.005) throw new Error('没有在图里找到人物或衣服，请换一张图')
      let plate = ''
      let ok = false
      try {
        plate = await deps.renderImage({ userId: row.user_id, prompt: platePrompt({ stats, width: source.width, height: source.height, variation: row.ord, reasons }), refs: [scene], width: source.width, height: source.height, workDir })
        ok = true
      } finally {
        deps.quota.record(row.user_id, ok)
      }
      const composed = await composeKeep({ source: source.path, mask, plate, width: source.width, height: source.height, size: batch.size, matchLight: batch.matchLight, output })
      const base = checkKeep(composed.stats, composed.canvas, source.width, source.height)
      const seen = await vision('keep', source.path, output)
      const merged = base.map((check) => (seen.some((item) => item.key === check.key && item.level === 'warn') ? { ...check, level: 'warn' as const } : check))
      return { output, checks: [...merged, ...seen.filter((item) => !base.some((check) => check.key === item.key))] }
    }

    let rendered = ''
    let ok = false
    try {
      rendered = await deps.renderImage({ userId: row.user_id, prompt: blendPrompt(reasons), refs: [{ fileId: data.sourceFileId, path: source.path }, scene], width: source.width, height: source.height, workDir })
      ok = true
    } finally {
      deps.quota.record(row.user_id, ok)
    }
    await sharp(rendered).rotate().flatten({ background: '#ffffff' }).jpeg({ quality: 95 }).toFile(output)
    const checks = await vision('blend', source.path, output)
    if (source.mask) {
      const maskPath = join(workDir, `mask_${randomUUID()}.png`)
      await deps.matting.run(output, maskPath)
      const meta = await sharp(output).metadata()
      const mask = await readMask(maskPath, meta.width!, meta.height!)
      const color = await checkBlendColor({ path: source.path, mask: source.mask, width: source.width, height: source.height }, { path: output, mask, width: meta.width!, height: meta.height! })
      return { output, checks: [...checks.filter((check) => check.key !== 'color'), checks.some((check) => check.key === 'color' && check.level === 'warn') ? { key: 'color', level: 'warn' } : color] }
    }
    return { output, checks }
  }

  /** 融合模式没法确认衣服没变时也算不确定；保真模式衣服来自原图，只看明确的问题 */
  const needsReview = (mode: SceneSwapMode, checks: SceneSwapCheck[]) => checks.some((check) => check.level === 'warn' || (mode === 'blend' && check.level === 'unknown'))

  async function execute(row: ItemRow) {
    const batchOf = () => db.prepare('SELECT * FROM scene_swap_batches WHERE id = ?').get(row.batch_id) as BatchRow
    const batch = parse<BatchData>(batchOf().data)
    const workDir = join(tmpdir(), 'klipmill-scene-swap', row.id)
    let hold = row.hold_id
    try {
      if (!row.trial && !hold) {
        try {
          if (deps.quota.remaining(row.user_id) <= 0) throw new CloudError('RATE_LIMITED', '今天的 AI 次数已用完，明天可以继续', 429)
          hold = deps.billing.hold(row.user_id, { capability: 'image', ...deps.imageModel(), client: 'server', feature: 'scene-swap' }).id
          setItem(row.id, { hold_id: hold })
        } catch (error) {
          // 点数不足 / 套餐不含：整批暂停，这张放回队列，充值后继续
          setItem(row.id, { status: 'queued' })
          setBatch(row.batch_id, 'paused', { notice: (error as Error).message })
          return
        }
      }
      await mkdir(workDir, { recursive: true })
      const reasons = parse<ItemData>(row.data).reasons ?? []
      let result = await attempt(row, batch, workDir, reasons)
      let attempts = row.attempts + 1
      const retryable = result.checks.some((check) => check.level === 'warn' && RETRYABLE.includes(check.key))
      if (retryable && batchOf().status !== 'deleted') {
        // 自动重做一次；重做失败就用第一次的结果
        const second = await attempt(row, batch, workDir, reasons).catch(() => null)
        attempts += 1
        const warns = (checks: SceneSwapCheck[]) => checks.filter((check) => check.level === 'warn').length
        if (second && warns(second.checks) <= warns(result.checks)) result = second
      }
      if (batchOf().status === 'deleted') {
        settle({ hold_id: hold }, false, '批次已删除')
        return
      }
      const stored = deps.sync.uploadFile(row.user_id, await readFile(result.output), 'image/jpeg')
      const review = needsReview(batch.mode, result.checks)
      setItem(row.id, { status: review ? 'review' : 'passed', output_file_id: stored.fileId, attempts }, { checks: result.checks, error: undefined })
      if (!review) {
        settle({ hold_id: hold }, true, '')
        saveAsset(row)
      }
    } catch (error) {
      const message = String((error as Error)?.message || error).slice(0, 300)
      console.warn('[scene-swap] 失败', row.id, message)
      settle({ hold_id: hold }, false, message)
      setItem(row.id, { status: 'failed', hold_id: null, attempts: row.attempts + 1 }, { error: message })
    } finally {
      await rm(workDir, { recursive: true, force: true }).catch(() => undefined)
    }
  }

  function pump() {
    while (!closed && running < Math.max(1, deps.concurrency)) {
      // 在跑的最少的用户优先，一个大批次不会堵住别人
      const row = db
        .prepare(
          `SELECT i.* FROM scene_swap_items i JOIN scene_swap_batches b ON b.id = i.batch_id
           WHERE i.status = 'queued' AND b.status IN ('trial', 'running')
           ORDER BY (SELECT COUNT(*) FROM scene_swap_items r WHERE r.user_id = i.user_id AND r.status = 'running'), b.created_at, i.ord LIMIT 1`,
        )
        .get() as ItemRow | undefined
      if (!row) return
      running += 1
      setItem(row.id, { status: 'running' })
      void execute(row)
        .catch((error) => console.error('[scene-swap] 队列异常', error))
        .finally(() => {
          running -= 1
          if (closed) return
          refreshBatch(row.batch_id)
          pump()
        })
    }
  }

  function info(userId: string, pointsPerImage: number): SceneSwapInfo {
    return { keepAvailable: deps.matting.available(), trialsLeft: trialsLeft(userId), pointsPerImage, scenes: listScenes(userId) }
  }

  /** 清掉 7 天没用的抠图缓存 */
  async function cleanupCache() {
    const { readdir, stat } = await import('node:fs/promises')
    for (const user of await readdir(cacheRoot).catch(() => [] as string[])) {
      for (const name of await readdir(join(cacheRoot, user)).catch(() => [] as string[])) {
        const path = join(cacheRoot, user, name)
        const meta = await stat(path).catch(() => null)
        if (meta && now() - meta.mtimeMs > 7 * DAY_MS) await rm(path, { force: true })
      }
    }
  }

  async function idle() {
    while (running) await new Promise((resolve) => setTimeout(resolve, 20))
  }

  return {
    info, list, get, create, run, pause, resume, retrial, remove, redo, accept, reject,
    addScene, removeScene, systemScenes, start: pump, cleanupCache, idle,
    close: () => {
      closed = true
      deps.matting.close()
    },
  }
}

export type SceneSwapService = ReturnType<typeof createSceneSwapService>
