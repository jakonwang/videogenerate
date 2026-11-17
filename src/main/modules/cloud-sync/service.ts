import { createHash, randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { CloudClientError } from '../../../shared/cloud/client'
import {
  SYNC_COLLECTIONS,
  SYNC_MAX_PUSH,
  type SyncChange,
  type SyncFileRef,
  type SyncModel,
  type SyncProduct,
  type SyncProductType,
  type SyncResearchResult,
  type SyncResearchTask,
} from '../../../shared/cloud/sync'
import { getAppPaths } from '../../lib/paths'
import { readJsonFile, writeJsonFile } from '../../lib/storeJson'
import { cloneRepo } from '../clone/repo'
import type { ModelIdentityLibraryItem } from '../clone/types'
import { productsRepo } from '../products/repo'
import { productResearchService } from '../product-research/service'
import type { Product, ProductImageAsset } from '../products/types'

/**
 * 桌面端 ↔ 云端同步（商品库、模特库），让手机 App 看到电脑上的数据，反之亦然。
 *
 * 每条同步记录有一个 link：云端 id ↔ 本地 id，以及双方「已对齐」的版本号。
 *  - 本地 updatedAt 比 link.localUpdatedAt 新 → 推送
 *  - 云端 updatedAt 比 link.cloudUpdatedAt 新 → 拉回本地
 * 双方都改了时按 updatedAt 最后写入者胜（云端同样的规则会拒绝较旧的推送）。
 * 图片按内容 sha256 寻址，与云端 fileId 一致，传过的不再重复上传。
 */

type Collection = 'products' | 'models'

type Link = {
  localId: string
  /** 云端已确认的版本 */
  cloudUpdatedAt: number
  /** 与云端对齐时本地的版本 */
  localUpdatedAt: number
  /** 云端记录里桌面端没有的字段（如手机端填的标签），推送时原样带回 */
  extra?: Record<string, unknown>
}

type SyncStateFile = {
  userId: string
  cursor: number
  links: Record<Collection, Record<string, Link>>
  /** 本地图片路径 → 内容 hash（按大小 + 修改时间判断是否需要重算） */
  fileHashes: Record<string, { size: number; mtimeMs: number; fileId: string }>
  /** 已确认存在于云端的文件 */
  uploaded: Record<string, true>
}

export type CloudSyncStatus = {
  enabled: boolean
  running: boolean
  lastSyncedAt: number
  lastError: string
  pushed: number
  pulled: number
}

const INTERVAL_MS = 60_000
const IMAGE_MIME: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' }
const MIME_EXT: Record<string, string> = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif' }
const COLLECTION_NAME: Record<Collection, string> = { products: SYNC_COLLECTIONS.products, models: SYNC_COLLECTIONS.models }
const PRODUCT_TYPES = new Set<SyncProductType>(['phone_case', 'earring', 'necklace', 'ring', 'bracelet', 'clothes', 'bag', 'shoes', 'toy', 'general'])

const statePath = () => join(getAppPaths().dbDir, 'cloud-sync.json')
const downloadDir = () => join(getAppPaths().dataDir, 'cloud-sync', 'files')

const status: CloudSyncStatus = { enabled: false, running: false, lastSyncedAt: 0, lastError: '', pushed: 0, pulled: 0 }
let timer: NodeJS.Timeout | null = null
let inflight: Promise<CloudSyncStatus> | null = null
let rerun = false

function emptyState(userId: string): SyncStateFile {
  return { userId, cursor: 0, links: { products: {}, models: {} }, fileHashes: {}, uploaded: {} }
}

async function loadState(userId: string): Promise<SyncStateFile> {
  const saved = await readJsonFile<SyncStateFile | null>(statePath(), null)
  // A different account on this computer starts a fresh link table; nothing is shared across accounts.
  if (!saved || saved.userId !== userId) return emptyState(userId)
  return { ...emptyState(userId), ...saved, links: { products: saved.links?.products ?? {}, models: saved.links?.models ?? {} } }
}

/* ------------------------------------------------------------------ 文件 */

async function fileIdOf(state: SyncStateFile, path: string): Promise<string | null> {
  try {
    const info = await stat(path)
    const cached = state.fileHashes[path]
    if (cached && cached.size === info.size && cached.mtimeMs === info.mtimeMs) return cached.fileId
    const fileId = createHash('sha256').update(await readFile(path)).digest('hex')
    state.fileHashes[path] = { size: info.size, mtimeMs: info.mtimeMs, fileId }
    return fileId
  } catch {
    return null
  }
}

type Session = {
  client: ReturnType<typeof import('../../../shared/cloud/client').createCloudClient>
  userId: string
  canWrite: boolean
}

/** 上传本地图片（云端已有则跳过），返回云端引用；不支持的格式或文件丢失返回 null */
async function uploadLocalImage(session: Session, state: SyncStateFile, path: string | undefined): Promise<SyncFileRef | null> {
  if (!path) return null
  const mime = IMAGE_MIME[extname(path).toLowerCase()]
  if (!mime) return null
  const fileId = await fileIdOf(state, path)
  if (!fileId) return null
  if (!state.uploaded[fileId]) {
    const result = await session.client.sync.uploadFile(await readFile(path), mime)
    state.uploaded[result.fileId] = true
  }
  return { fileId, mime }
}

/** 把云端图片下载到本地（按 fileId 命名，下过的直接复用） */
async function downloadImage(session: Session, state: SyncStateFile, ref: SyncFileRef): Promise<string> {
  const target = join(downloadDir(), `${ref.fileId}${MIME_EXT[ref.mime] || '.jpg'}`)
  if (!existsSync(target)) {
    await mkdir(downloadDir(), { recursive: true })
    const blob = await session.client.sync.downloadFile(ref.fileId)
    await writeFile(target, Buffer.from(await blob.arrayBuffer()))
  }
  state.uploaded[ref.fileId] = true
  return target
}

/* ------------------------------------------------------------------ 商品 */

async function productToSync(session: Session, state: SyncStateFile, product: Product, extra: Record<string, unknown> = {}): Promise<SyncProduct> {
  const images: SyncFileRef[] = []
  for (const image of product.images ?? []) {
    const ref = await uploadLocalImage(session, state, image.filePath)
    if (ref && !images.some((item) => item.fileId === ref.fileId)) images.push({ ...ref, width: image.width, height: image.height })
  }
  const cover = await uploadLocalImage(session, state, product.coverImagePath)
  return {
    ...extra,
    name: product.name,
    type: PRODUCT_TYPES.has(product.type as SyncProductType) ? (product.type as SyncProductType) : 'general',
    remark: product.remark || '',
    tiktokProductIds: product.tiktokProductIds ?? [],
    images,
    coverFileId: cover && images.some((item) => item.fileId === cover.fileId) ? cover.fileId : images[0]?.fileId,
    createdAt: product.createdAt,
  }
}

async function applyProduct(session: Session, state: SyncStateFile, data: SyncProduct, localId: string | undefined): Promise<Product> {
  const existing = localId ? (await productsRepo.list()).find((p) => p.id === localId) : undefined
  // Reuse local images whose content already matches; download the rest.
  const images: ProductImageAsset[] = []
  let coverImagePath: string | undefined
  for (const ref of data.images ?? []) {
    let match: ProductImageAsset | undefined
    for (const image of existing?.images ?? []) {
      if ((await fileIdOf(state, image.filePath)) === ref.fileId) {
        match = image
        break
      }
    }
    const filePath = match?.filePath ?? (await downloadImage(session, state, ref))
    const ts = Date.now()
    images.push(match ?? { id: randomUUID(), productId: existing?.id ?? '', filePath, fileName: `${ref.fileId.slice(0, 12)}${MIME_EXT[ref.mime] || '.jpg'}`, fileSize: 0, width: ref.width, height: ref.height, createdAt: ts, updatedAt: ts })
    if (ref.fileId === (data.coverFileId || data.images[0]?.fileId)) coverImagePath = filePath
  }
  return productsRepo.upsert({
    ...(existing ? { id: existing.id } : {}),
    name: data.name || '未命名商品',
    type: PRODUCT_TYPES.has(data.type) ? data.type : 'general',
    remark: data.remark ?? '',
    tiktokProductIds: data.tiktokProductIds ?? [],
    images,
    coverImagePath,
  })
}

/* ------------------------------------------------------------------ 模特 */

const GENDER_TO_SYNC: Record<string, string> = { female: '女', male: '男' }
const GENDER_FROM_SYNC: Record<string, string> = { 女: 'female', 男: 'male' }

async function modelToSync(session: Session, state: SyncStateFile, model: ModelIdentityLibraryItem, extra: Record<string, unknown> = {}): Promise<SyncModel> {
  const images: SyncFileRef[] = []
  for (const path of model.imagePaths ?? []) {
    const ref = await uploadLocalImage(session, state, path)
    if (ref && !images.some((item) => item.fileId === ref.fileId)) images.push(ref)
  }
  const cover = await uploadLocalImage(session, state, model.coverImagePath)
  return {
    ...extra,
    name: model.name,
    gender: GENDER_TO_SYNC[model.gender] ?? model.gender,
    ageRange: model.ageRange,
    style: model.outfitStyle,
    description: model.description,
    images,
    coverFileId: cover && images.some((item) => item.fileId === cover.fileId) ? cover.fileId : images[0]?.fileId,
    createdAt: model.createdAt,
  }
}

async function applyModel(session: Session, state: SyncStateFile, cloudId: string, data: SyncModel, localId: string | undefined): Promise<ModelIdentityLibraryItem> {
  const existing = localId ? await cloneRepo.getModelIdentity(localId) : null
  const imagePaths: string[] = []
  let coverImagePath: string | undefined
  for (const ref of data.images ?? []) {
    let path: string | undefined
    for (const candidate of existing?.imagePaths ?? []) {
      if ((await fileIdOf(state, candidate)) === ref.fileId) {
        path = candidate
        break
      }
    }
    path ??= await downloadImage(session, state, ref)
    imagePaths.push(path)
    if (ref.fileId === (data.coverFileId || data.images[0]?.fileId)) coverImagePath = path
  }
  const base = existing ?? ({ id: localId || cloudId, createdAt: data.createdAt || Date.now(), status: 'done', productType: 'general', market: 'Southeast Asian market', hairStyle: 'natural dark hair', skinTone: 'natural warm skin tone', mood: 'calm confident friendly', sceneStyle: 'soft daylight social commerce studio' } as ModelIdentityLibraryItem)
  return cloneRepo.upsertModelIdentity({
    ...base,
    name: data.name || base.name,
    gender: GENDER_FROM_SYNC[data.gender || ''] ?? (data.gender || base.gender || 'female'),
    ageRange: data.ageRange || base.ageRange || '20-28',
    outfitStyle: data.style || base.outfitStyle || 'clean casual outfit',
    description: data.description ?? base.description ?? '',
    imagePaths,
    coverImagePath,
    updatedAt: Date.now(),
  })
}

/* ------------------------------------------------------------------ 同步主流程 */

const OWN_PRODUCT_FIELDS = ['name', 'type', 'remark', 'tiktokProductIds', 'images', 'coverFileId', 'createdAt']
const OWN_MODEL_FIELDS = ['name', 'gender', 'ageRange', 'style', 'description', 'images', 'coverFileId', 'createdAt']

function extraFields(data: Record<string, unknown> | null, own: string[]) {
  if (!data) return undefined
  const extra = Object.fromEntries(Object.entries(data).filter(([key]) => !own.includes(key)))
  return Object.keys(extra).length ? extra : undefined
}

async function push(session: Session, state: SyncStateFile): Promise<number> {
  const changes: SyncChange[] = []
  const pending: Array<{ collection: Collection; cloudId: string; localUpdatedAt: number; data: Record<string, unknown> | null }> = []

  const queue = async <T extends { id: string; updatedAt: number }>(collection: Collection, items: T[], toSync: (item: T, extra?: Record<string, unknown>) => Promise<unknown>) => {
    const links = state.links[collection]
    const byLocal = new Map(Object.entries(links).map(([cloudId, link]) => [link.localId, cloudId]))
    const present = new Set<string>()
    for (const item of items) {
      present.add(item.id)
      const cloudId = byLocal.get(item.id) ?? item.id
      const link = links[cloudId]
      if (link && Number(item.updatedAt || 0) <= link.localUpdatedAt) continue
      const data = (await toSync(item, link?.extra)) as Record<string, unknown>
      // Never send an older version than the one the cloud already has.
      const updatedAt = Math.max(Number(item.updatedAt || Date.now()), (link?.cloudUpdatedAt ?? 0) + 1)
      changes.push({ collection: COLLECTION_NAME[collection], id: cloudId, updatedAt, deleted: false, data })
      pending.push({ collection, cloudId, localUpdatedAt: Number(item.updatedAt || 0), data })
    }
    // Linked records that no longer exist locally were deleted on this computer. An entirely empty
    // local library is treated as unreadable rather than "user deleted everything", so it never wipes the cloud.
    if (!items.length && Object.keys(links).length) {
      console.warn(`[cloud-sync] 本地${collection}为空，跳过删除同步以防误删云端数据`)
      return
    }
    for (const [cloudId, link] of Object.entries(links)) {
      if (present.has(link.localId)) continue
      changes.push({ collection: COLLECTION_NAME[collection], id: cloudId, updatedAt: Math.max(Date.now(), link.cloudUpdatedAt + 1), deleted: true, data: null })
      pending.push({ collection, cloudId, localUpdatedAt: 0, data: null })
    }
  }

  await queue('products', await productsRepo.list(), (p, extra) => productToSync(session, state, p, extra))
  await queue('models', await cloneRepo.listModelIdentityLibrary(), (m, extra) => modelToSync(session, state, m, extra))

  let applied = 0
  for (let index = 0; index < changes.length; index += SYNC_MAX_PUSH) {
    const batch = changes.slice(index, index + SYNC_MAX_PUSH)
    const result = await session.client.sync.push(batch)
    for (const change of result.applied) {
      const entry = pending.find((item) => COLLECTION_NAME[item.collection] === change.collection && item.cloudId === change.id)
      if (!entry) continue
      const links = state.links[entry.collection]
      if (change.deleted) {
        delete links[entry.cloudId]
      } else {
        const localId = links[entry.cloudId]?.localId ?? entry.cloudId
        links[entry.cloudId] = { localId, cloudUpdatedAt: change.updatedAt, localUpdatedAt: entry.localUpdatedAt, extra: links[entry.cloudId]?.extra }
      }
      applied += 1
    }
    // Conflicts (cloud newer) are left for the pull that follows.
  }
  return applied
}

/** 手机采集的选品结果：只读导入桌面「选品 → 手机采集」方案（桌面不回写） */
async function importResearch(session: Session, state: SyncStateFile, changes: SyncChange[]): Promise<number> {
  const tasks: Parameters<typeof productResearchService.importMobileCollection>[0]['tasks'] = []
  const results: Parameters<typeof productResearchService.importMobileCollection>[0]['results'] = []
  for (const change of changes) {
    if (change.deleted || !change.data) continue
    if (change.collection === SYNC_COLLECTIONS.researchTasks) {
      tasks.push({ id: change.id, ...(change.data as SyncResearchTask) })
    } else if (change.collection === SYNC_COLLECTIONS.researchResults) {
      const data = change.data as SyncResearchResult
      let imagePath: string | undefined
      if (data.image) {
        try {
          imagePath = await downloadImage(session, state, data.image)
        } catch {
          imagePath = undefined
        }
      }
      results.push({
        id: change.id,
        taskId: data.taskId,
        keyword: data.keyword,
        title: data.title,
        priceText: data.priceText || '',
        priceValue: data.priceValue,
        salesText: data.salesText || '',
        salesValue: data.salesValue,
        rank: data.rank,
        capturedAt: data.capturedAt,
        imagePath,
      })
    }
  }
  const imported = await productResearchService.importMobileCollection({ tasks, results })
  return imported.results
}

async function pull(session: Session, state: SyncStateFile): Promise<number> {
  let pulled = 0
  for (;;) {
    const page = await session.client.sync.pull(state.cursor, [
      COLLECTION_NAME.products,
      COLLECTION_NAME.models,
      SYNC_COLLECTIONS.researchTasks,
      SYNC_COLLECTIONS.researchResults,
    ])
    const research = page.changes.filter((change) => change.collection === SYNC_COLLECTIONS.researchTasks || change.collection === SYNC_COLLECTIONS.researchResults)
    if (research.length) pulled += await importResearch(session, state, research)
    for (const change of page.changes) {
      if (research.includes(change)) continue
      const collection: Collection = change.collection === COLLECTION_NAME.models ? 'models' : 'products'
      const links = state.links[collection]
      const link = links[change.id]
      if (link && change.updatedAt <= link.cloudUpdatedAt) continue // our own push or already applied
      try {
        if (change.deleted) {
          if (link) {
            if (collection === 'products') await productsRepo.remove(link.localId)
            else await cloneRepo.deleteModelIdentity(link.localId)
            delete links[change.id]
            pulled += 1
          }
          continue
        }
        const own = collection === 'products' ? OWN_PRODUCT_FIELDS : OWN_MODEL_FIELDS
        const saved =
          collection === 'products'
            ? await applyProduct(session, state, change.data as SyncProduct, link?.localId)
            : await applyModel(session, state, change.id, change.data as SyncModel, link?.localId)
        links[change.id] = { localId: saved.id, cloudUpdatedAt: change.updatedAt, localUpdatedAt: Number(saved.updatedAt), extra: extraFields(change.data as Record<string, unknown>, own) }
        pulled += 1
      } catch (error) {
        console.warn('[cloud-sync] 应用云端改动失败', change.collection, change.id, (error as Error).message)
      }
    }
    state.cursor = page.cursor
    if (!page.hasMore) break
  }
  return pulled
}

type SessionSource = () => Session | null | Promise<Session | null>

// Loaded lazily so this module can run outside Electron (tests inject their own session).
let sessionSource: SessionSource = async () => (await import('../../lib/cloudLicense')).getCloudSyncSession()

/** 仅测试使用：替换云端会话来源 */
export function setCloudSyncSessionSource(source: SessionSource) {
  sessionSource = source
}

async function runOnce(): Promise<CloudSyncStatus> {
  const session = await sessionSource()
  status.enabled = Boolean(session)
  if (!session) return { ...status }
  status.running = true
  const state = await loadState(session.userId)
  try {
    // Membership lapsed: still receive the phone's data, but the cloud refuses new uploads.
    status.pushed = session.canWrite ? await push(session, state) : 0
    status.pulled = await pull(session, state)
    status.lastSyncedAt = Date.now()
    status.lastError = ''
  } catch (error) {
    status.lastError = error instanceof CloudClientError && error.code === 'NETWORK' ? '网络不可用' : (error as Error).message
  } finally {
    await writeJsonFile(statePath(), state)
    status.running = false
  }
  return { ...status }
}

/** 立即同步一次；正在同步时排队再跑一轮 */
export function runCloudSync(): Promise<CloudSyncStatus> {
  if (inflight) {
    rerun = true
    return inflight
  }
  inflight = (async () => {
    let result: CloudSyncStatus
    do {
      rerun = false
      result = await runOnce()
    } while (rerun)
    return result
  })().finally(() => {
    inflight = null
  })
  return inflight
}

export function getCloudSyncStatus(): CloudSyncStatus {
  return { ...status }
}

export function startCloudSync() {
  if (timer) clearInterval(timer)
  timer = setInterval(() => void runCloudSync(), INTERVAL_MS)
  timer.unref?.()
  setTimeout(() => void runCloudSync(), 5_000).unref?.()
}

export function stopCloudSync() {
  if (timer) clearInterval(timer)
  timer = null
}
