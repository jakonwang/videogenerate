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
  type SyncGeneration,
  type SyncListing,
  type SyncAsset,
  type SyncBrand,
  type SyncProductMemory,
  type SyncTemplate,
  BRAND_RECORD_ID,
} from '../../../shared/cloud/sync'
import { getAppPaths } from '../../lib/paths'
import { readJsonFile, writeJsonFile } from '../../lib/storeJson'
import { cloneRepo } from '../clone/repo'
import type { ModelIdentityLibraryItem } from '../clone/types'
import { productsRepo } from '../products/repo'
import { productResearchService } from '../product-research/service'
import { applyGmvDecision, buildGmvDigest, digestFingerprint, type GmvService } from './gmvBridge'
import { buildBusinessDigest, businessFingerprint, DEFAULT_BUSINESS_SOURCES, isEmptyBusinessDigest, type BusinessSources } from './businessBridge'
import { BUSINESS_DIGEST_ID, CREATIVE_REQUEST_MAX_IMAGES, GMV_DIGEST_ID, type SyncCreativeRequest, type SyncGmvDecision } from '../../../shared/cloud/selling'
import { defaultProductionService, localizeDrafts, orderResults, poolFingerprint, toSyncPool, type ProductionService } from './productionBridge'
import { DESKTOP_STATUS_ID, PRODUCTION_COLLECTIONS, type SyncDesktopStatus, type SyncMixOrder, type SyncMixPoolEdits, type SyncMixPoolImport } from '../../../shared/cloud/production'
import { RESEARCH_COLLECTIONS, RESEARCH_STATUS_ID, type SyncPrRequest, type SyncPrResult, type SyncPrStatus, type SyncResearchScheme } from '../../../shared/cloud/research'
import type { ProductResearchDevice, ProductResearchResult, ProductResearchScheme, ProductResearchSchemeState, ProductResearchTask } from '../../../shared/productResearch'
import { defaultTemplateStore, fromSyncTemplate, toSyncTemplate, type TemplateLink, type TemplateStore } from './templateBridge'
import { brandDirection, defaultBrandStore, toSyncBrand, type BrandLink, type BrandStore } from './brandBridge'
import { defaultCreativeService, reportFingerprint, requestState, shotState, type CreativeService } from './creativeBridge'
import { defaultCloneStore, syncCloneWorkspaces, type CloneIdMaps, type CloneStore } from './cloneBridge'
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
  /** 上次发布的 GMV Max 摘要指纹，没变化就不重复上传 */
  gmvDigestFingerprint?: string
  /** 上次发布的经营摘要（数据复盘 / 达人 / 库存 / 创意室）指纹 */
  businessFingerprint?: string
  /** 已导入电脑素材库的手机作品（generations 记录 id） */
  importedGenerations?: Record<string, true>
  /** 已导入电脑素材库的网页 / 手机素材（assets 记录 id → 导入时的文件） */
  importedAssets?: Record<string, string>
  /** 网页 / 手机下的 tk创意室单，电脑正在执行的（云端记录 id → 进度） */
  creativeRequests?: Record<string, { taskId: string; request: SyncCreativeRequest; uploaded: Record<string, string>; reported?: string; updatedAt?: number }>
  /** 已拉到、还没处理完的新单（处理中断网也不会丢） */
  creativeQueue?: SyncChange[]
  /** 品牌记忆上次两边对齐时的版本 */
  brand?: BrandLink
  /** 商品记忆：云端商品 id → 两边对齐时的版本 */
  productMemory?: Record<string, BrandLink>
  /** 模板库：云端 id → 电脑端模板 */
  templates?: Record<string, TemplateLink>
  /** 生产中心：已发布的素材池指纹（云端商品 id → 指纹） */
  poolFingerprints?: Record<string, string>
  poolFiles?: { thumbs: Record<string, string>; sources: Record<string, string> }
  formulaFingerprint?: string
  /** 已应用的网页镜头修正版本（云端商品 id → updatedAt） */
  poolEditsApplied?: Record<string, number>
  /** 网页上传进素材池、还没处理完的视频 / 网页下的生产单（处理中断网也不会丢） */
  productionQueue?: SyncChange[]
  /** 电脑正在执行的网页生产单 */
  mixOrders?: Record<string, { outDir: string; order: SyncMixOrder; missing: number[]; uploaded: Record<string, string>; reported?: string; updatedAt: number }>
  desktopStatusAt?: number
  /** 选品方案：方案 id → 两边对齐时的版本 */
  researchSchemes?: Record<string, { cloudUpdatedAt: number; localUpdatedAt: number }>
  /** 已发布的采集任务（指纹）/ 采集结果（id） */
  researchTasks?: Record<string, string>
  researchResults?: Record<string, true>
  researchStatus?: string
  researchStatusAt?: number
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
const AUDIO_MIME: Record<string, string> = { '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.ogg': 'audio/ogg' }
const IMAGE_MIME: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' }
const MIME_EXT: Record<string, string> = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif', 'video/mp4': '.mp4', 'video/quicktime': '.mov', 'video/webm': '.webm', 'audio/mpeg': '.mp3', 'audio/mp3': '.mp3', 'audio/wav': '.wav', 'audio/x-wav': '.wav', 'audio/mp4': '.m4a', 'audio/x-m4a': '.m4a', 'audio/aac': '.aac', 'audio/ogg': '.ogg' }
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

/* ------------------------------------------------------------------ GMV Max（手机看摘要、批准建议） */

// Loaded lazily: the GMV Max module is large and only needed when the account uses it.
let gmvSource: () => Promise<GmvService | null> = async () => {
  try {
    return (await import('../tiktok-gmv-max/service')).gmvMaxService as unknown as GmvService
  } catch {
    return null
  }
}

/** 仅测试使用：替换 GMV Max 服务 */
export function setCloudSyncGmvSource(source: () => Promise<GmvService | null>) {
  gmvSource = source
}

/** 执行手机上的批准 / 拒绝，并把结果写回同一条记录 */
async function applyGmvDecisions(session: Session, changes: SyncChange[]): Promise<number> {
  const todo = changes.filter((change) => !change.deleted && change.data && !(change.data as SyncGmvDecision).result)
  if (!todo.length) return 0
  const service = await gmvSource()
  const results: SyncChange[] = []
  for (const change of todo) {
    const decision = change.data as SyncGmvDecision
    const outcome = service ? await applyGmvDecision(service, change.id, decision) : { ...decision, result: 'skipped' as const, resultAt: Date.now(), error: '这台电脑没有开启 GMV Max' }
    results.push({ collection: SYNC_COLLECTIONS.gmvDecisions, id: change.id, updatedAt: Math.max(Date.now(), change.updatedAt + 1), deleted: false, data: outcome })
  }
  if (session.canWrite) await session.client.sync.push(results)
  return results.length
}

/** 发布 GMV Max 摘要给手机（只在连接了 GMV Max、内容有变化时上传） */
async function publishGmvDigest(session: Session, state: SyncStateFile) {
  const service = await gmvSource()
  if (!service) return
  let digest
  try {
    digest = await buildGmvDigest(service)
  } catch {
    return // GMV Max not set up on this computer
  }
  if (!digest.connected && !digest.campaigns.length) return
  const fingerprint = digestFingerprint(digest)
  if (fingerprint === state.gmvDigestFingerprint) return
  await session.client.sync.push([{ collection: SYNC_COLLECTIONS.gmvDigest, id: GMV_DIGEST_ID, updatedAt: Date.now(), deleted: false, data: digest }])
  state.gmvDigestFingerprint = fingerprint
}

/* ------------------------------------------------------------------ 经营摘要 */

let businessSources: BusinessSources = DEFAULT_BUSINESS_SOURCES

/** 仅测试使用：替换经营数据来源 */
export function setCloudSyncBusinessSources(sources: BusinessSources) {
  businessSources = sources
}

async function publishBusinessDigest(session: Session, state: SyncStateFile) {
  const digest = await buildBusinessDigest(businessSources)
  if (isEmptyBusinessDigest(digest)) return
  const fingerprint = businessFingerprint(digest)
  if (fingerprint === state.businessFingerprint) return
  await session.client.sync.push([{ collection: SYNC_COLLECTIONS.businessDigest, id: BUSINESS_DIGEST_ID, updatedAt: Date.now(), deleted: false, data: digest }])
  state.businessFingerprint = fingerprint
}

/* ------------------------------------------------------------------ 手机作品 → 电脑 */

export type PhoneImportTargets = {
  /** 导入电脑素材库；folderPath 为逐级文件夹名，默认「手机 App」 */
  importAsset: (path: string, name: string, folderPath?: string[]) => Promise<void>
  /** 写进电脑端上架助手（id 固定，重复导入是更新） */
  saveListing: (input: {
    id: string
    sourceImagePath: string
    referenceImagePaths: string[]
    category: SyncListing['category']
    sku: string
    localDisplayPrice: string
    titleLanguage: SyncListing['language']
    generatedTitle: string
    generatedDescription: string
  }) => Promise<void>
}

const PHONE_FOLDER = '手机 App'
const CLOUD_ASSET_FOLDER = '网页素材库'

let phoneImportTargets: PhoneImportTargets = {
  importAsset: async (path, name, folderPath = [PHONE_FOLDER]) => {
    const { assetLibraryService } = await import('../asset-library/service')
    let parentId: string | null = null
    for (const folderName of folderPath) {
      const folders = await assetLibraryService.listFolders(parentId)
      const folder: { id: string } = folders.find((item: { name: string }) => item.name === folderName) ?? (await assetLibraryService.createFolder(folderName, parentId))
      parentId = folder.id
    }
    await assetLibraryService.importFile(path, 'mobile', name, parentId)
  },
  saveListing: async (input) => {
    const { tiktokListingService } = await import('../tiktok-listing/service')
    await tiktokListingService.createOrUpdate({ ...input, generationStatus: input.generatedTitle ? 'done' : 'idle', listingImages: [] } as any)
  },
}

/** 仅测试使用：替换导入目标 */
export function setCloudSyncPhoneImportTargets(targets: PhoneImportTargets) {
  phoneImportTargets = targets
}

/** 手机上审核通过的作品进电脑素材库；手机写的上架文案进电脑上架助手 */
async function importPhoneOutputs(session: Session, state: SyncStateFile, changes: SyncChange[]): Promise<number> {
  let imported = 0
  state.importedGenerations ??= {}
  for (const change of changes) {
    if (change.deleted || !change.data) continue
    try {
      if (change.collection === SYNC_COLLECTIONS.generations) {
        const item = change.data as SyncGeneration
        if (item.review !== 'approved' || !item.outputFileId || state.importedGenerations[change.id]) continue
        const path = await downloadImage(session, state, { fileId: item.outputFileId, mime: item.outputMime || (item.kind === 'video' ? 'video/mp4' : 'image/png') })
        const name = `${item.productName ? `${item.productName}-` : ''}${item.label}${MIME_EXT[item.outputMime || ''] || (item.kind === 'video' ? '.mp4' : '.png')}`
        await phoneImportTargets.importAsset(path, name.replace(/[\\/:*?"<>|]/g, '_'))
        state.importedGenerations[change.id] = true
        imported += 1
      } else if (change.collection === SYNC_COLLECTIONS.listings) {
        const listing = change.data as SyncListing
        if (!listing.images.length) continue
        const paths: string[] = []
        for (const image of listing.images.slice(0, 5)) paths.push(await downloadImage(session, state, image))
        await phoneImportTargets.saveListing({
          id: `mobile-${change.id}`,
          sourceImagePath: paths[0]!,
          referenceImagePaths: paths.slice(1),
          category: listing.category,
          sku: listing.sku,
          localDisplayPrice: listing.price,
          titleLanguage: listing.language,
          generatedTitle: listing.title,
          generatedDescription: listing.description,
        })
        imported += 1
      }
    } catch (error) {
      console.warn('[cloud-sync] 导入手机作品失败', change.collection, change.id, (error as Error).message)
    }
  }
  return imported
}

/** 网页 / 手机素材库里上传的文件进电脑素材库（「网页素材库」下，保留文件夹）。只导入，不删除电脑上的副本。 */
async function importCloudAssets(session: Session, state: SyncStateFile, changes: SyncChange[]): Promise<number> {
  let imported = 0
  const done = (state.importedAssets ??= {})
  for (const change of changes) {
    if (change.deleted || !change.data) continue
    const asset = change.data as SyncAsset
    if (!asset.fileId || asset.trashedAt || done[change.id] === asset.fileId) continue
    try {
      const path = await downloadImage(session, state, { fileId: asset.fileId, mime: asset.mime })
      const ext = extname(asset.name) ? '' : MIME_EXT[asset.mime] || ''
      const folder = asset.folder?.trim()
      await phoneImportTargets.importAsset(path, `${asset.name}${ext}`.replace(/[\\/:*?"<>|]/g, '_'), folder ? [CLOUD_ASSET_FOLDER, folder] : [CLOUD_ASSET_FOLDER])
      done[change.id] = asset.fileId
      imported += 1
    } catch (error) {
      if (error instanceof CloudClientError && error.code === 'NETWORK') throw error
      console.warn('[cloud-sync] 导入网页素材失败', change.id, (error as Error).message)
    }
  }
  return imported
}

const PRODUCTION_INBOX = new Set<string>([PRODUCTION_COLLECTIONS.orders, PRODUCTION_COLLECTIONS.poolImports, PRODUCTION_COLLECTIONS.poolEdits, RESEARCH_COLLECTIONS.requests])

async function pull(session: Session, state: SyncStateFile, creativeInbox: SyncChange[] = [], productionInbox: SyncChange[] = [], only?: string[]): Promise<number> {
  let pulled = 0
  for (;;) {
    const page = await session.client.sync.pull(state.cursor, only ?? [
      COLLECTION_NAME.products,
      COLLECTION_NAME.models,
      SYNC_COLLECTIONS.researchTasks,
      SYNC_COLLECTIONS.researchResults,
      SYNC_COLLECTIONS.gmvDecisions,
      SYNC_COLLECTIONS.generations,
      SYNC_COLLECTIONS.listings,
      SYNC_COLLECTIONS.creativeRequests,
      SYNC_COLLECTIONS.assets,
      ...PRODUCTION_INBOX,
    ])
    const creative = page.changes.filter((change) => change.collection === SYNC_COLLECTIONS.creativeRequests)
    if (creative.length) creativeInbox.push(...creative)
    const assets = page.changes.filter((change) => change.collection === SYNC_COLLECTIONS.assets)
    const production = page.changes.filter((change) => PRODUCTION_INBOX.has(change.collection))
    if (production.length) productionInbox.push(...production)
    if (assets.length) pulled += await importCloudAssets(session, state, assets)
    const research = page.changes.filter((change) => change.collection === SYNC_COLLECTIONS.researchTasks || change.collection === SYNC_COLLECTIONS.researchResults)
    if (research.length) pulled += await importResearch(session, state, research)
    const decisions = page.changes.filter((change) => change.collection === SYNC_COLLECTIONS.gmvDecisions)
    if (decisions.length) pulled += await applyGmvDecisions(session, decisions)
    const outputs = page.changes.filter((change) => change.collection === SYNC_COLLECTIONS.generations || change.collection === SYNC_COLLECTIONS.listings)
    if (outputs.length) pulled += await importPhoneOutputs(session, state, outputs)
    for (const change of page.changes) {
      if (research.includes(change) || decisions.includes(change) || outputs.includes(change) || creative.includes(change) || assets.includes(change) || production.includes(change)) continue
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

/* ------------------------------------------------------------------ 品牌记忆：电脑 ↔ 网页 / 手机 */

let brandSource: () => Promise<BrandStore | null> = defaultBrandStore

/** 仅测试使用：替换品牌记忆存储 */
export function setCloudSyncBrandSource(source: () => Promise<BrandStore | null>) {
  brandSource = source
}

async function syncBrand(session: Session, state: SyncStateFile): Promise<number> {
  const store = await brandSource().catch(() => null)
  if (!store) return 0
  const link = (state.brand ??= { cloudUpdatedAt: 0, localUpdatedAt: 0 })
  // One small record: read it directly instead of tracking it through the shared cursor.
  const remoteChange = (await session.client.sync.pull(0, [SYNC_COLLECTIONS.brand])).changes.find((change) => change.id === BRAND_RECORD_ID && !change.deleted && change.data)
  const local = await store.read()
  const direction = brandDirection(link, local, remoteChange ?? null)
  if (direction === 'pull' && remoteChange) {
    const saved = await store.save(toSyncBrand(remoteChange.data as SyncBrand))
    state.brand = { cloudUpdatedAt: remoteChange.updatedAt, localUpdatedAt: saved.updatedAt }
    return 1
  }
  if (direction === 'push' && session.canWrite) {
    const updatedAt = Math.max(local.updatedAt, (remoteChange?.updatedAt ?? 0) + 1)
    await session.client.sync.push([{ collection: SYNC_COLLECTIONS.brand, id: BRAND_RECORD_ID, updatedAt, deleted: false, data: toSyncBrand(local) }])
    state.brand = { cloudUpdatedAt: updatedAt, localUpdatedAt: local.updatedAt }
  }
  return await syncProductMemory(session, state, store)
}

/** 商品记忆：每个已同步商品一条，两边都能改，以后改的为准 */
async function syncProductMemory(session: Session, state: SyncStateFile, store: BrandStore): Promise<number> {
  if (!store.readProducts || !store.saveProduct) return 0
  const links = (state.productMemory ??= {})
  const local = await store.readProducts()
  const remote = new Map((await session.client.sync.pull(0, [SYNC_COLLECTIONS.productMemory])).changes.filter((c) => !c.deleted && c.data).map((c) => [c.id, c]))
  const clean = (m: Partial<SyncProductMemory>): SyncProductMemory => ({ sellingPoints: String(m.sellingPoints ?? ''), audience: String(m.audience ?? ''), avoid: String(m.avoid ?? ''), notes: String(m.notes ?? '') })
  let pulled = 0
  const pushes: SyncChange[] = []
  for (const [cloudId, productLink] of Object.entries(state.links.products)) {
    const link = (links[cloudId] ??= { cloudUpdatedAt: 0, localUpdatedAt: 0 })
    const mine = local[productLink.localId] ?? { ...clean({}), updatedAt: 0 }
    const theirs = remote.get(cloudId) ?? null
    const direction = brandDirection(link, mine, theirs)
    if (direction === 'pull' && theirs) {
      const saved = await store.saveProduct(productLink.localId, clean(theirs.data as SyncProductMemory))
      links[cloudId] = { cloudUpdatedAt: theirs.updatedAt, localUpdatedAt: saved.updatedAt }
      pulled += 1
    } else if (direction === 'push' && session.canWrite) {
      const updatedAt = Math.max(mine.updatedAt, (theirs?.updatedAt ?? 0) + 1)
      pushes.push({ collection: SYNC_COLLECTIONS.productMemory, id: cloudId, updatedAt, deleted: false, data: clean(mine) } as SyncChange)
      links[cloudId] = { cloudUpdatedAt: updatedAt, localUpdatedAt: mine.updatedAt }
    }
  }
  for (let i = 0; i < pushes.length; i += SYNC_MAX_PUSH) await session.client.sync.push(pushes.slice(i, i + SYNC_MAX_PUSH) as any)
  return pulled
}

/* ------------------------------------------------------------------ 模板库：电脑 ↔ 网页 / 手机 */

let templateSource: () => Promise<TemplateStore | null> = defaultTemplateStore

/** 仅测试使用：替换模板存储 */
export function setCloudSyncTemplateSource(source: () => Promise<TemplateStore | null>) {
  templateSource = source
}

async function uploadLocalAudio(session: Session, state: SyncStateFile, path: string): Promise<string | null> {
  const mime = AUDIO_MIME[extname(path).toLowerCase()]
  if (!mime) return null
  const fileId = await fileIdOf(state, path)
  if (!fileId) return null
  if (!state.uploaded[fileId]) {
    await session.client.sync.uploadFile(await readFile(path), mime)
    state.uploaded[fileId] = true
  }
  return fileId
}

async function syncTemplates(session: Session, state: SyncStateFile): Promise<number> {
  const store = await templateSource().catch(() => null)
  if (!store) return 0
  const links = (state.templates ??= {})
  // A template library is small: read the whole collection instead of tracking it through the shared cursor.
  const remote = (await session.client.sync.pull(0, [SYNC_COLLECTIONS.templates])).changes
  let local = await store.list()
  const byLocal = new Map(Object.entries(links).map(([cloudId, link]) => [link.localId, cloudId]))
  let pulled = 0

  for (const change of remote) {
    const link = links[change.id]
    if (link && change.updatedAt <= link.cloudUpdatedAt) continue // our own push or already applied
    try {
      if (change.deleted) {
        if (link) {
          if (local.some((t) => t.id === link.localId)) await store.remove(link.localId)
          delete links[change.id]
          byLocal.delete(link.localId)
          pulled += 1
        }
        continue
      }
      const data = change.data as SyncTemplate
      const prev = link ? local.find((t) => t.id === link.localId) ?? null : null
      // Edited on this computer after the web's edit: keep ours, it is pushed below.
      if (prev && link && prev.updatedAt > link.localUpdatedAt && prev.updatedAt > change.updatedAt) continue
      const bgmPaths: string[] = []
      for (const fileId of data.bgmFileIds ?? []) bgmPaths.push(await downloadImage(session, state, { fileId, mime: 'audio/mpeg' }))
      const saved = await store.upsert({ ...fromSyncTemplate(data, prev, bgmPaths), ...(prev ? { id: prev.id } : {}) })
      links[change.id] = { localId: saved.id, cloudUpdatedAt: change.updatedAt, localUpdatedAt: saved.updatedAt }
      byLocal.set(saved.id, change.id)
      pulled += 1
    } catch (error) {
      if (error instanceof CloudClientError && error.code === 'NETWORK') throw error
      console.warn('[cloud-sync] 应用云端模板失败', change.id, (error as Error).message)
    }
  }
  if (!session.canWrite) return pulled

  local = await store.list()
  const pushes: SyncChange[] = []
  for (const template of local) {
    const cloudId = byLocal.get(template.id) ?? `tpl_${template.id}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120)
    const link = links[cloudId]
    if (link && template.updatedAt <= link.localUpdatedAt) continue
    const bgmFileIds: string[] = []
    for (const path of template.bgm?.filePaths ?? []) {
      const fileId = await uploadLocalAudio(session, state, path)
      if (fileId) bgmFileIds.push(fileId)
    }
    const updatedAt = Math.max(template.updatedAt, (link?.cloudUpdatedAt ?? 0) + 1)
    pushes.push({ collection: SYNC_COLLECTIONS.templates, id: cloudId, updatedAt, deleted: false, data: toSyncTemplate(template, bgmFileIds) } as SyncChange)
    links[cloudId] = { localId: template.id, cloudUpdatedAt: updatedAt, localUpdatedAt: template.updatedAt }
  }
  // Deleted on this computer → delete for the web too.
  const localIds = new Set(local.map((t) => t.id))
  for (const [cloudId, link] of Object.entries(links)) {
    if (localIds.has(link.localId)) continue
    pushes.push({ collection: SYNC_COLLECTIONS.templates, id: cloudId, updatedAt: Math.max(Date.now(), link.cloudUpdatedAt + 1), deleted: true, data: null } as SyncChange)
    delete links[cloudId]
  }
  for (let i = 0; i < pushes.length; i += SYNC_MAX_PUSH) await session.client.sync.push(pushes.slice(i, i + SYNC_MAX_PUSH) as any)
  return pulled
}

/* ------------------------------------------------------------------ 选品方案：电脑 ↔ 网页 */

export type ResearchService = {
  exportForSync: () => Promise<{
    schemes: ProductResearchScheme[]
    schemeStates: Record<string, ProductResearchSchemeState>
    tasks: ProductResearchTask[]
    results: ProductResearchResult[]
    devices: ProductResearchDevice[]
    serverRunning: boolean
    endpoint: string
  }>
  applySchemeFromSync: (scheme: ProductResearchScheme, state: ProductResearchSchemeState) => Promise<unknown>
  deleteScheme: (id: string) => Promise<unknown>
  createTask: (input: { keyword: string; schemeId?: string; sort?: 'comprehensive' | 'sales'; targetCount?: number }) => Promise<ProductResearchTask>
  cancelTask: (taskId: string) => Promise<unknown>
  removeTask: (taskId: string) => Promise<unknown>
  removeResults: (ids: string[], schemeId?: string) => Promise<unknown>
}

let researchSource: () => Promise<ResearchService | null> = async () => (await import('../product-research/service')).productResearchService

/** 仅测试使用：替换选品服务 */
export function setCloudSyncResearchSource(source: () => Promise<ResearchService | null>) {
  researchSource = source
}

const RESEARCH_ERROR: Array<[RegExp, string]> = [[/No paired phone is online/i, '没有在线的采集手机：请在电脑端「选品 → 连接手机」配对，并保持手机上的 TiktokCut 打开']]
const researchError = (error: unknown) => {
  const message = (error as Error)?.message ?? String(error)
  return (RESEARCH_ERROR.find(([pattern]) => pattern.test(message))?.[1] ?? message).slice(0, 300)
}

async function handleResearchRequest(session: Session, svc: ResearchService, change: SyncChange) {
  const request = change.data as SyncPrRequest
  if (change.deleted || !request || request.state !== 'pending') return
  const finish = (patch: Partial<SyncPrRequest>) =>
    session.client.sync.push([{ collection: RESEARCH_COLLECTIONS.requests, id: change.id, updatedAt: Math.max(Date.now(), change.updatedAt + 1), deleted: false, data: { ...request, ...patch } }] as any)
  try {
    if (request.action === 'createTask') {
      const task = await svc.createTask({ keyword: request.keyword, schemeId: request.schemeId, sort: request.sort, targetCount: request.targetCount })
      await finish({ state: 'done', taskId: task.id })
    } else {
      if (request.action === 'cancelTask') await svc.cancelTask(request.taskId)
      else if (request.action === 'removeTask') await svc.removeTask(request.taskId)
      else if (request.action === 'removeResults') await svc.removeResults(request.resultIds, request.schemeId)
      await finish({ state: 'done' })
    }
  } catch (error) {
    if (error instanceof CloudClientError && error.code === 'NETWORK') throw error
    await finish({ state: 'failed', error: researchError(error) })
  }
}

async function syncResearch(session: Session, state: SyncStateFile, svc: ResearchService) {
  const links = (state.researchSchemes ??= {})
  let data = await svc.exportForSync()

  // 1. Schemes edited / created / deleted on the web.
  const remote = (await session.client.sync.pull(0, [RESEARCH_COLLECTIONS.schemes])).changes
  for (const change of remote) {
    const link = links[change.id]
    if (link && change.updatedAt <= link.cloudUpdatedAt) continue
    const local = data.schemes.find((scheme) => scheme.id === change.id)
    if (change.deleted) {
      if (local) await svc.deleteScheme(change.id)
      delete links[change.id]
      continue
    }
    const incoming = change.data as SyncResearchScheme
    if (!incoming?.scheme) continue
    // Edited here after the web's edit: keep ours (pushed below).
    if (local && link && local.updatedAt > link.localUpdatedAt && local.updatedAt > incoming.scheme.updatedAt) continue
    await svc.applySchemeFromSync({ ...incoming.scheme, id: change.id }, incoming.state)
    links[change.id] = { cloudUpdatedAt: change.updatedAt, localUpdatedAt: incoming.scheme.updatedAt }
  }
  data = await svc.exportForSync()
  if (!session.canWrite) return

  const pushes: SyncChange[] = []
  for (const scheme of data.schemes) {
    const link = links[scheme.id]
    if (link && scheme.updatedAt <= link.localUpdatedAt) continue
    const updatedAt = Math.max(scheme.updatedAt, (link?.cloudUpdatedAt ?? 0) + 1)
    const record: SyncResearchScheme = { scheme, state: data.schemeStates[scheme.id] ?? { keywords: [], candidateIds: [], productEdits: [], liveTestRecords: [] } }
    pushes.push({ collection: RESEARCH_COLLECTIONS.schemes, id: scheme.id, updatedAt, deleted: false, data: record } as SyncChange)
    links[scheme.id] = { cloudUpdatedAt: updatedAt, localUpdatedAt: scheme.updatedAt }
  }
  for (const id of Object.keys(links)) {
    if (data.schemes.some((scheme) => scheme.id === id)) continue
    pushes.push({ collection: RESEARCH_COLLECTIONS.schemes, id, updatedAt: Math.max(Date.now(), links[id]!.cloudUpdatedAt + 1), deleted: true, data: null } as SyncChange)
    delete links[id]
  }

  // 2. Collection tasks and results (produced here by the paired phone).
  const taskMarks = (state.researchTasks ??= {})
  for (const task of data.tasks) {
    const mark = `${task.status}:${task.collectedCount}:${task.error ?? ''}`
    if (taskMarks[task.id] === mark) continue
    pushes.push({ collection: RESEARCH_COLLECTIONS.tasks, id: task.id, updatedAt: Date.now(), deleted: false, data: task } as SyncChange)
    taskMarks[task.id] = mark
  }
  for (const id of Object.keys(taskMarks)) {
    if (data.tasks.some((task) => task.id === id)) continue
    pushes.push({ collection: RESEARCH_COLLECTIONS.tasks, id, updatedAt: Date.now(), deleted: true, data: null } as SyncChange)
    delete taskMarks[id]
  }
  const resultMarks = (state.researchResults ??= {})
  for (const result of data.results) {
    if (resultMarks[result.id]) continue
    const { imagePath, imageDataUrl: _inline, ...rest } = result
    const image = imagePath ? await uploadLocalImage(session, state, imagePath).catch(() => null) : null
    const record: SyncPrResult = { ...rest, ...(image ? { imageFileId: image.fileId } : {}) }
    pushes.push({ collection: RESEARCH_COLLECTIONS.results, id: result.id, updatedAt: Date.now(), deleted: false, data: record } as SyncChange)
    resultMarks[result.id] = true
  }
  for (const id of Object.keys(resultMarks)) {
    if (data.results.some((result) => result.id === id)) continue
    pushes.push({ collection: RESEARCH_COLLECTIONS.results, id, updatedAt: Date.now(), deleted: true, data: null } as SyncChange)
    delete resultMarks[id]
  }

  // 3. LAN server + paired phones, so the web knows whether collection can run.
  const status: SyncPrStatus = { at: Date.now(), serverRunning: data.serverRunning, endpoint: data.endpoint, devices: data.devices }
  const fingerprint = JSON.stringify([status.serverRunning, status.endpoint, status.devices.map((d) => [d.id, d.connected, d.name])])
  if (fingerprint !== state.researchStatus || Date.now() - (state.researchStatusAt ?? 0) > 50_000) {
    pushes.push({ collection: RESEARCH_COLLECTIONS.status, id: RESEARCH_STATUS_ID, updatedAt: Date.now(), deleted: false, data: status } as SyncChange)
    state.researchStatus = fingerprint
    state.researchStatusAt = Date.now()
  }
  for (let i = 0; i < pushes.length; i += SYNC_MAX_PUSH) await session.client.sync.push(pushes.slice(i, i + SYNC_MAX_PUSH) as any)
}

/* ------------------------------------------------------------------ 生产中心：素材池、生产单 */

let productionSource: () => Promise<ProductionService | null> = defaultProductionService

/** 仅测试使用：替换生产中心服务 */
export function setCloudSyncProductionSource(source: () => Promise<ProductionService | null>) {
  productionSource = source
}

/** 素材原视频超过这个大小就不传云端（云端简版成片用不到它，电脑端照常可用） */
const POOL_SOURCE_UPLOAD_MAX = 60 * 1024 * 1024
const VIDEO_MIME: Record<string, string> = { '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm', '.m4v': 'video/mp4' }

async function uploadLocalFile(session: Session, state: SyncStateFile, path: string, mime: string): Promise<string | null> {
  const fileId = await fileIdOf(state, path)
  if (!fileId) return null
  if (!state.uploaded[fileId]) {
    await session.client.sync.uploadFile(await readFile(path), mime)
    state.uploaded[fileId] = true
  }
  return fileId
}

const localProductIdOf = (state: SyncStateFile, cloudId: string) => state.links.products[cloudId]?.localId

/** 让网页知道电脑在线（可以接生产单） */
async function publishDesktopStatus(session: Session, state: SyncStateFile) {
  const now = Date.now()
  if (state.desktopStatusAt && now - state.desktopStatusAt < 50_000) return
  const data: SyncDesktopStatus = { at: now, features: ['mix-render'] }
  await session.client.sync.push([{ collection: PRODUCTION_COLLECTIONS.desktopStatus, id: DESKTOP_STATUS_ID, updatedAt: now, deleted: false, data }] as any)
  state.desktopStatusAt = now
}

/** 每个已同步商品的素材池发布给网页（镜头缩略图上传；原视频 60 MB 以内也上传，供云端简版成片） */
async function publishPools(session: Session, state: SyncStateFile, svc: ProductionService) {
  const fingerprints = (state.poolFingerprints ??= {})
  const files = (state.poolFiles ??= { thumbs: {}, sources: {} })
  const products = await productsRepo.list()
  for (const [cloudId, link] of Object.entries(state.links.products)) {
    const pool = await svc.pool(link.localId).catch(() => null)
    if (!pool || (!pool.sources.length && !fingerprints[cloudId])) continue
    const fingerprint = poolFingerprint(pool)
    if (fingerprints[cloudId] === fingerprint) continue
    const thumbs = new Map<string, string>()
    for (const clip of pool.clips) {
      if (files.thumbs[clip.id]) {
        thumbs.set(clip.id, files.thumbs[clip.id]!)
        continue
      }
      const ref = await uploadLocalImage(session, state, clip.thumbnailPath).catch(() => null)
      if (ref) thumbs.set(clip.id, (files.thumbs[clip.id] = ref.fileId))
    }
    const sourceFiles = new Map<string, string>()
    for (const source of pool.sources) {
      if (files.sources[source.id]) {
        sourceFiles.set(source.id, files.sources[source.id]!)
        continue
      }
      const mime = VIDEO_MIME[extname(source.filePath).toLowerCase()]
      const size = await stat(source.filePath).then((info) => info.size).catch(() => 0)
      if (!mime || !size || size > POOL_SOURCE_UPLOAD_MAX) continue
      const fileId = await uploadLocalFile(session, state, source.filePath, mime).catch((error) => {
        if (error instanceof CloudClientError && error.code === 'NETWORK') throw error
        return null
      })
      if (fileId) sourceFiles.set(source.id, (files.sources[source.id] = fileId))
    }
    const productName = products.find((p) => p.id === link.localId)?.name ?? ''
    const data = { ...toSyncPool({ productName, ...pool, thumbs, sourceFiles }), publishedAt: Date.now() }
    await session.client.sync.push([{ collection: PRODUCTION_COLLECTIONS.pools, id: cloudId, updatedAt: Date.now(), deleted: false, data }] as any)
    fingerprints[cloudId] = fingerprint
  }
}

/** 电脑端自建的公式给网页选用（内置公式两边都有） */
async function publishFormulas(session: Session, state: SyncStateFile, svc: ProductionService) {
  const formulas = (await svc.formulas().catch(() => [])).filter((formula) => formula.source !== 'builtin')
  const fingerprint = JSON.stringify(formulas.map((f) => [f.id, f.updatedAt]))
  if (state.formulaFingerprint === fingerprint) return
  await session.client.sync.push([{ collection: PRODUCTION_COLLECTIONS.formulas, id: 'formulas', updatedAt: Date.now(), deleted: false, data: { formulas } }] as any)
  state.formulaFingerprint = fingerprint
}

async function pushOrder(session: Session, id: string, data: SyncMixOrder, after = 0) {
  const updatedAt = Math.max(Date.now(), after + 1)
  await session.client.sync.push([{ collection: PRODUCTION_COLLECTIONS.orders, id, updatedAt, deleted: false, data }] as any)
  return updatedAt
}

/** 处理网页来的镜头修正、上传进素材池的视频和生产单 */
async function handleProductionInbox(session: Session, state: SyncStateFile, svc: ProductionService, inbox: SyncChange[]) {
  const queue = (state.productionQueue ??= [])
  for (const change of inbox) if (!queue.some((item) => item.collection === change.collection && item.id === change.id && item.updatedAt >= change.updatedAt)) queue.push(change)
  const applied = (state.poolEditsApplied ??= {})
  const tracked = (state.mixOrders ??= {})
  while (queue.length) {
    const change = queue[0]!
    try {
      if (change.deleted || !change.data) {
        // nothing to do
      } else if (change.collection === PRODUCTION_COLLECTIONS.poolEdits) {
        const localId = localProductIdOf(state, change.id)
        if (localId && change.updatedAt > (applied[change.id] ?? 0)) {
          const pool = await svc.pool(localId)
          const edits = (change.data as SyncMixPoolEdits).clips ?? {}
          for (const clip of pool.clips) {
            const edit = edits[clip.id]
            if (!edit) continue
            if ((clip.roleOverride ?? null) !== edit.roleOverride || Boolean(clip.disabled) !== edit.disabled) await svc.updateClip(clip.id, { roleOverride: edit.roleOverride, disabled: edit.disabled })
          }
          applied[change.id] = change.updatedAt
        }
      } else if (change.collection === PRODUCTION_COLLECTIONS.poolImports) {
        const item = change.data as SyncMixPoolImport
        if (item.state === 'pending') {
          const localId = localProductIdOf(state, item.productId)
          const done = async (patch: Partial<SyncMixPoolImport>) =>
            session.client.sync.push([{ collection: PRODUCTION_COLLECTIONS.poolImports, id: change.id, updatedAt: Math.max(Date.now(), change.updatedAt + 1), deleted: false, data: { ...item, ...patch } }] as any)
          if (!localId) await done({ state: 'failed', error: '电脑上找不到这个商品，请确认商品已同步到电脑端' })
          else {
            const path = await downloadImage(session, state, { fileId: item.fileId, mime: item.mime })
            await svc.importFiles(localId, [path], item.origin)
            await done({ state: 'done' })
          }
        }
      } else if (change.collection === RESEARCH_COLLECTIONS.requests) {
        const research = await researchSource().catch(() => null)
        if (research) await handleResearchRequest(session, research, change)
      } else if (change.collection === PRODUCTION_COLLECTIONS.orders) {
        const order = change.data as SyncMixOrder
        if (order.runner === 'desktop' && order.state === 'pending' && !tracked[change.id]) {
          const reject = (error: string) => pushOrder(session, change.id, { ...order, state: 'failed', error, reportedAt: Date.now() }, change.updatedAt)
          const localId = localProductIdOf(state, order.productId)
          if (!localId) await reject('电脑上找不到这个商品，请确认商品已同步到电脑端')
          else {
            const pool = await svc.pool(localId)
            const { drafts, missing } = localizeDrafts(order.drafts, pool.clips)
            if (!drafts.length) await reject('电脑上找不到这些方案用到的镜头，请刷新素材池后重新出方案')
            else {
              const outDir = join(getAppPaths().dataDir, 'web-production', change.id.replace(/[^a-zA-Z0-9_-]/g, '_'))
              const templateId = order.input.templateId ? state.templates?.[order.input.templateId]?.localId : undefined
              await svc.enqueue({ ...order.input, productId: localId, templateId, outDir }, drafts)
              const running: SyncMixOrder = { ...order, state: 'running', results: orderResults(order.drafts.length, missing, svc.tasks(outDir), {}), reportedAt: Date.now() }
              const updatedAt = await pushOrder(session, change.id, running, change.updatedAt)
              tracked[change.id] = { outDir, order: running, missing, uploaded: {}, updatedAt }
            }
          }
        }
      }
    } catch (error) {
      if (error instanceof CloudClientError && error.code === 'NETWORK') throw error // retry on the next sync
      console.warn('[cloud-sync] 处理生产中心改动失败', change.collection, change.id, (error as Error).message)
    }
    queue.shift()
  }
}

/** 渲染进度和成片回传；成片同时进作品库和审核收件箱 */
async function reportMixOrders(session: Session, state: SyncStateFile, svc: ProductionService) {
  const tracked = state.mixOrders ?? {}
  for (const [id, entry] of Object.entries(tracked)) {
    const tasks = svc.tasks(entry.outDir)
    for (const [index, task] of tasks.entries()) {
      if (task.status !== 'done' || entry.uploaded[task.outPath] || !existsSync(task.outPath)) continue
      const fileId = await uploadLocalFile(session, state, task.outPath, 'video/mp4')
      if (!fileId) continue
      entry.uploaded[task.outPath] = fileId
      const generationId = `gen_mix_${id}_${index}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120)
      const generation: SyncGeneration = {
        purpose: 'mix',
        kind: 'video',
        jobId: `desktop-${id}`,
        sourceFileId: fileId,
        label: task.formulaName ? `混剪 · ${task.formulaName}` : '混剪成片',
        productId: entry.order.productId,
        productName: entry.order.productName,
        status: 'succeeded',
        outputFileId: fileId,
        outputMime: 'video/mp4',
        review: 'pending',
        createdAt: Date.now(),
      }
      await session.client.sync.push([{ collection: SYNC_COLLECTIONS.generations, id: generationId, updatedAt: Date.now(), deleted: false, data: generation }])
      ;(state.importedGenerations ??= {})[generationId] = true
    }
    const results = orderResults(entry.order.drafts.length, entry.missing, tasks, entry.uploaded)
    const finished = results.every((r) => r.status === 'done' || r.status === 'error' || r.status === 'skipped')
    const next: SyncMixOrder = {
      ...entry.order,
      results,
      state: finished ? (results.some((r) => r.status === 'done') ? 'completed' : 'failed') : 'running',
      ...(finished && !results.some((r) => r.status === 'done') ? { error: results.find((r) => r.error)?.error ?? '全部失败' } : {}),
      reportedAt: Date.now(),
    }
    const fingerprint = JSON.stringify([next.state, results])
    if (fingerprint !== entry.reported) {
      entry.updatedAt = await pushOrder(session, id, next, entry.updatedAt)
      entry.reported = fingerprint
      entry.order = next
    }
    if (finished) delete tracked[id]
  }
}

async function syncProduction(session: Session, state: SyncStateFile, inbox: SyncChange[]) {
  const research = await researchSource().catch(() => null)
  const svc = await productionSource().catch(() => null)
  if (!svc) {
    // Research requests still need handling without the production service.
    if (research) for (const change of inbox.filter((item) => item.collection === RESEARCH_COLLECTIONS.requests)) await handleResearchRequest(session, research, change)
    if (research) await syncResearch(session, state, research)
    return
  }
  await publishDesktopStatus(session, state)
  await handleProductionInbox(session, state, svc, inbox)
  await publishPools(session, state, svc)
  await publishFormulas(session, state, svc)
  await reportMixOrders(session, state, svc)
  // After the inbox, so tasks the web just asked for are published in this same sync.
  if (research) await syncResearch(session, state, research)
}

/* ------------------------------------------------------------------ tk创意室：网页下单，电脑代跑 */

let creativeSource: () => Promise<CreativeService | null> = defaultCreativeService

/** 仅测试使用：替换 tk创意室服务 */
export function setCloudSyncCreativeSource(source: () => Promise<CreativeService | null>) {
  creativeSource = source
}

/** Writes an order update; always newer than the last version so another device's clock can't win. */
async function pushCreative(session: Session, id: string, data: SyncCreativeRequest, after = 0) {
  const updatedAt = Math.max(Date.now(), after + 1)
  await session.client.sync.push([{ collection: SYNC_COLLECTIONS.creativeRequests, id, updatedAt, deleted: false, data }])
  return updatedAt
}

async function acceptCreativeRequests(session: Session, state: SyncStateFile, changes: SyncChange[]) {
  const tracked = (state.creativeRequests ??= {})
  // Keep orders in the saved state until handled: the pull cursor has already moved past them.
  const queue = (state.creativeQueue ??= [])
  for (const change of changes) if (!queue.some((item) => item.id === change.id && item.updatedAt >= change.updatedAt)) queue.push(change)
  while (queue.length) {
    const change = queue[0]
    const request = change.data as SyncCreativeRequest | null
    if (change.deleted || !request || request.state !== 'pending' || tracked[change.id]) {
      queue.shift()
      continue
    }
    const reject = (error: string, kind: 'failed' | 'skipped' = 'failed') => pushCreative(session, change.id, { ...request, state: kind, error, reportedAt: Date.now() }, change.updatedAt)
    const service = await creativeSource()
    if (!service) {
      await reject('这台电脑没有开启 tk创意室', 'skipped')
      queue.shift()
      continue
    }
    const localProductId = state.links.products[request.productId]?.localId
    if (!localProductId) {
      await reject('电脑上找不到这个商品，请确认商品已同步到电脑端后重新提交')
      queue.shift()
      continue
    }
    try {
      const dir = join(getAppPaths().dataDir, 'cloud-creative', change.id.replace(/[^a-zA-Z0-9_-]/g, '_'))
      await mkdir(dir, { recursive: true })
      const paths: string[] = []
      for (const [index, fileId] of request.referenceFileIds.slice(0, CREATIVE_REQUEST_MAX_IMAGES).entries()) {
        const blob = await session.client.sync.downloadFile(fileId)
        const ext = blob.type === 'image/png' ? '.png' : blob.type === 'image/webp' ? '.webp' : '.jpg'
        const path = join(dir, `ref-${index}${ext}`)
        await writeFile(path, Buffer.from(await blob.arrayBuffer()))
        paths.push(path)
      }
      if (!paths.length) throw new Error('没有参考图')
      const task = await service.createFromReference({ referenceImagePaths: paths, productId: localProductId, mode: request.mode })
      const running: SyncCreativeRequest = { ...request, state: 'running', taskId: task.id, shots: paths.map(() => ({ status: 'running' as const })), error: undefined, reportedAt: Date.now() }
      tracked[change.id] = { taskId: task.id, request: running, uploaded: {}, reported: reportFingerprint(running) }
      tracked[change.id].updatedAt = await pushCreative(session, change.id, running, change.updatedAt)
    } catch (error) {
      if (error instanceof CloudClientError && error.code === 'NETWORK') throw error // retry on the next sync
      await reject(`电脑端创建任务失败：${(error as Error).message}`.slice(0, 300))
    }
    queue.shift()
  }
}

async function reportCreativeProgress(session: Session, state: SyncStateFile) {
  const tracked = state.creativeRequests ?? {}
  const ids = Object.keys(tracked)
  if (!ids.length) return
  const service = await creativeSource()
  if (!service) return
  for (const id of ids) {
    const entry = tracked[id]
    const task = await service.get(entry.taskId).catch(() => null)
    if (!task) {
      await pushCreative(session, id, { ...entry.request, state: 'failed', error: '电脑端的任务已被删除', reportedAt: Date.now() }, entry.updatedAt)
      delete tracked[id]
      continue
    }
    const shots: NonNullable<SyncCreativeRequest['shots']> = []
    for (const [index, shot] of task.shots.entries()) {
      const status = shotState(shot.status)
      let outputFileId = entry.uploaded[shot.shotId]
      if (status === 'completed' && !outputFileId && shot.resultVideoPath && existsSync(shot.resultVideoPath)) {
        // Upload the finished video and hand it to the web's 作品库 / 审核收件箱 as a generation.
        const body = await readFile(shot.resultVideoPath)
        outputFileId = (await session.client.sync.uploadFile(body, 'video/mp4')).fileId
        entry.uploaded[shot.shotId] = outputFileId
        const generationId = `gen_creative_${entry.taskId}_${shot.shotId}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120)
        ;(state.importedGenerations ??= {})[generationId] = true // our own output: never re-import it into this computer's library
        const generation: SyncGeneration = {
          kind: 'video',
          purpose: 'creative',
          jobId: `creative:${entry.taskId}:${shot.shotId}`,
          status: 'succeeded',
          productId: entry.request.productId,
          productName: entry.request.productName,
          sourceFileId: entry.request.referenceFileIds[index] || '',
          label: `tk创意室 · 镜头 ${index + 1}`,
          outputFileId,
          outputMime: 'video/mp4',
          review: 'pending',
          createdAt: Date.now(),
        }
        await session.client.sync.push([{ collection: SYNC_COLLECTIONS.generations, id: generationId, updatedAt: Date.now(), deleted: false, data: generation }])
      }
      const shown: 'running' | 'completed' | 'failed' = status === 'completed' && !outputFileId ? 'running' : status
      shots.push({ status: shown, outputFileId, error: status === 'failed' ? (shot.lastError || '出片失败').slice(0, 200) : undefined })
    }
    const next: SyncCreativeRequest = { ...entry.request, state: requestState(shots), shots, reportedAt: Date.now() }
    const fingerprint = reportFingerprint(next)
    if (fingerprint !== entry.reported) {
      entry.updatedAt = await pushCreative(session, id, next, entry.updatedAt)
      entry.reported = fingerprint
      entry.request = next
    }
    if (next.state !== 'running') delete tracked[id]
  }
}

type SessionSource = () => Session | null | Promise<Session | null>

// Loaded lazily so this module can run outside Electron (tests inject their own session).
let sessionSource: SessionSource = async () => (await import('../../lib/cloudLicense')).getCloudSyncSession()

/** 仅测试使用：替换云端会话来源 */
export function setCloudSyncSessionSource(source: SessionSource) {
  sessionSource = source
}

/* ------------------------------------------------------------------ 复刻项目：电脑 ↔ 服务器（见 cloneBridge.ts） */

function cloneIdMaps(state: SyncStateFile): CloneIdMaps {
  const reverse = (links: Record<string, { localId: string }>) => new Map(Object.entries(links).map(([cloudId, link]) => [link.localId, cloudId]))
  const products = reverse(state.links.products)
  const models = reverse(state.links.models)
  return {
    productToCloud: (id) => products.get(id),
    productToLocal: (id) => state.links.products[id]?.localId,
    modelToCloud: (id) => models.get(id),
    modelToLocal: (id) => state.links.models[id]?.localId,
  }
}

let cloneStoreSource: () => Promise<CloneStore> = defaultCloneStore
/** 仅测试使用：替换复刻项目存储 */
export function setCloudSyncCloneStore(source: () => Promise<CloneStore>) {
  cloneStoreSource = source
}

async function syncClone(session: Session, state: SyncStateFile, only?: string[]) {
  const result = await syncCloneWorkspaces(session, { origin: syncMode === 'clone-engine' ? 'server' : 'desktop', store: await cloneStoreSource(), ids: cloneIdMaps(state), only })
  return result.pulled
}

/**
 * desktop：电脑端（全部同步）。clone-engine：服务器上的复刻引擎，只同步商品、模特和复刻项目，
 * 不接 tk创意室订单、不发布经营数据（这些要用电脑上的账号）。
 */
let syncMode: 'desktop' | 'clone-engine' = 'desktop'
export function setCloudSyncMode(mode: 'desktop' | 'clone-engine') {
  syncMode = mode
}

async function runOnce(): Promise<CloudSyncStatus> {
  const session = await sessionSource()
  status.enabled = Boolean(session)
  if (!session) return { ...status }
  status.running = true
  const state = await loadState(session.userId)
  if (syncMode === 'clone-engine') {
    try {
      status.pushed = session.canWrite ? await push(session, state) : 0
      status.pulled = await pull(session, state, [], [], [COLLECTION_NAME.products, COLLECTION_NAME.models])
      status.pulled += await syncClone(session, state)
      status.lastSyncedAt = Date.now()
      status.lastError = ''
    } catch (error) {
      status.lastError = (error as Error).message
    } finally {
      await writeJsonFile(statePath(), state)
      status.running = false
    }
    return { ...status }
  }
  try {
    // Membership lapsed: still receive the phone's data, but the cloud refuses new uploads.
    status.pushed = session.canWrite ? await push(session, state) : 0
    const creativeInbox: SyncChange[] = []
    const productionInbox: SyncChange[] = []
    status.pulled = await pull(session, state, creativeInbox, productionInbox)
    status.pulled += await syncBrand(session, state)
    status.pulled += await syncTemplates(session, state)
    // After products / models, so projects can find them by their local ids.
    status.pulled += await syncClone(session, state).catch((error) => {
      console.warn('[cloud-sync] 复刻项目同步失败', (error as Error).message)
      return 0
    })
    if (session.canWrite) {
      await publishGmvDigest(session, state)
      await publishBusinessDigest(session, state)
      // After products are applied, so new orders can find their product on this computer.
      await acceptCreativeRequests(session, state, creativeInbox)
      await reportCreativeProgress(session, state)
      await syncProduction(session, state, productionInbox)
    }
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
