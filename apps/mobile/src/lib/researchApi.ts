/**
 * 网页版的 window.api.productResearch / products / shell：让电脑端的选品方案页面（ProductResearchView 等）
 * 原样在网页上运行。数据走云同步（src/shared/cloud/research.ts）；采集由电脑端连着的手机执行。
 */
import { SYNC_COLLECTIONS, type SyncFileRef, type SyncProduct, type SyncProductType } from '@shared/cloud/sync'
import { MOBILE_SCHEME_ID, RESEARCH_STATUS_ID, type PrRequest, type SyncPrRequest, type SyncPrResult, type SyncPrStatus, type SyncResearchScheme } from '@shared/cloud/research'
import { DESKTOP_ONLINE_MS } from '@shared/cloud/production'
import type { ProductResearchResult, ProductResearchScheme, ProductResearchSchemeState, ProductResearchSnapshot, ProductResearchTask } from '@shared/productResearch'
import { fileUrl } from './files'
import { deleteRecord, getRecord, listRecords, newId, requestSync, saveRecord } from './sync'

const emptyState = (): ProductResearchSchemeState => ({ keywords: [], candidateIds: [], productEdits: [], liveTestRecords: [] })

let lastSync = 0
/** Pull fresh data now and then while the research pages poll (they poll every few seconds). */
function freshen() {
  if (Date.now() - lastSync < 12_000) return
  lastSync = Date.now()
  void requestSync().catch(() => undefined)
}

async function status() {
  const record = (await getRecord<SyncPrStatus>(SYNC_COLLECTIONS.prStatus, RESEARCH_STATUS_ID))?.data
  const online = Boolean(record && Date.now() - record.at < DESKTOP_ONLINE_MS)
  return { record, online }
}

const imageCache = new Map<string, string>()
async function imageUrl(fileId?: string) {
  if (!fileId) return undefined
  if (!imageCache.has(fileId)) imageCache.set(fileId, (await fileUrl(fileId).catch(() => '')) || '')
  return imageCache.get(fileId) || undefined
}

async function allResults(): Promise<ProductResearchResult[]> {
  const records = await listRecords<SyncPrResult>(SYNC_COLLECTIONS.prResults)
  const list: ProductResearchResult[] = []
  for (const record of records) {
    if (!record.data) continue
    const { imageFileId, ...rest } = record.data
    list.push({ ...rest, id: record.id, imageDataUrl: await imageUrl(imageFileId) })
  }
  // Phone App captures not yet imported by the computer: show them in 手机采集 too.
  const phone = await listRecords<any>(SYNC_COLLECTIONS.researchResults)
  const known = new Set(list.map((item) => item.id))
  for (const record of phone) {
    const item = record.data
    if (!item || known.has(record.id)) continue
    list.push({
      id: record.id,
      taskId: item.taskId,
      schemeId: MOBILE_SCHEME_ID,
      keyword: item.keyword,
      title: item.title,
      priceText: item.priceText ?? '',
      priceValue: item.priceValue,
      salesText: item.salesText ?? '',
      salesValue: item.salesValue,
      shopName: '',
      rank: item.rank,
      capturedAt: item.capturedAt ?? record.updatedAt,
      confidence: 0.88,
      imageDataUrl: await imageUrl(item.image?.fileId),
    })
  }
  return list
}

async function requestRecords() {
  return (await listRecords<SyncPrRequest>(SYNC_COLLECTIONS.prRequests)).filter((record) => record.data)
}

async function allTasks(): Promise<ProductResearchTask[]> {
  const tasks = (await listRecords<ProductResearchTask>(SYNC_COLLECTIONS.prTasks)).filter((r) => r.data).map((r) => ({ ...(r.data as ProductResearchTask), id: r.id }))
  // Requests the computer has not run yet show up as queued; failed ones show why (for an hour).
  for (const record of await requestRecords()) {
    const request = record.data!
    if (request.action !== 'createTask') continue
    if (request.state === 'pending' || (request.state === 'failed' && Date.now() - request.createdAt < 3_600_000)) {
      tasks.push({
        id: `req:${record.id}`,
        schemeId: request.schemeId,
        keyword: request.keyword,
        sort: request.sort ?? 'sales',
        targetCount: request.targetCount ?? 100,
        status: request.state === 'failed' ? 'failed' : 'queued',
        collectedCount: 0,
        createdAt: request.createdAt,
        error: request.state === 'failed' ? request.error : '等电脑端派发给采集手机',
      })
    }
  }
  return tasks.sort((a, b) => b.createdAt - a.createdAt)
}

async function schemeRecords() {
  const records = (await listRecords<SyncResearchScheme>(SYNC_COLLECTIONS.prSchemes)).filter((r) => r.data?.scheme)
  return records.map((r) => ({ id: r.id, data: r.data! }))
}

/** The scheme's record; 手机采集 starts as a virtual scheme and gets a record on its first edit. */
async function schemeRecord(id: string): Promise<SyncResearchScheme | null> {
  const record = (await getRecord<SyncResearchScheme>(SYNC_COLLECTIONS.prSchemes, id))?.data
  if (record || id !== MOBILE_SCHEME_ID) return record ?? null
  const scheme = (await productResearch.listSchemes()).find((item) => item.id === MOBILE_SCHEME_ID)
  return scheme ? { scheme, state: emptyState() } : null
}

async function saveScheme(id: string, data: SyncResearchScheme) {
  await saveRecord<SyncResearchScheme>(SYNC_COLLECTIONS.prSchemes, id, data)
}

async function sendRequest(request: PrRequest) {
  const id = newId('prreq')
  await saveRecord<SyncPrRequest>(SYNC_COLLECTIONS.prRequests, id, { ...request, state: 'pending', createdAt: Date.now() } as SyncPrRequest)
  void requestSync().catch(() => undefined)
  return id
}

const productResearch = {
  async snapshot(schemeId?: string): Promise<ProductResearchSnapshot> {
    freshen()
    const { record, online } = await status()
    const [tasks, results] = await Promise.all([allTasks(), allResults()])
    return {
      serverRunning: online && Boolean(record?.serverRunning),
      endpoint: online ? record?.endpoint ?? '' : '',
      devices: (record?.devices ?? []).map((device) => ({ ...device, connected: online && device.connected })),
      tasks: tasks.filter((t) => !schemeId || t.schemeId === schemeId),
      results: results.filter((r) => !schemeId || r.schemeId === schemeId).sort((a, b) => b.capturedAt - a.capturedAt),
    }
  },

  async listSchemes(): Promise<ProductResearchScheme[]> {
    const [records, results] = await Promise.all([schemeRecords(), allResults()])
    const schemes = records.map(({ id, data }) => ({
      ...data.scheme,
      id,
      resultCount: results.filter((r) => r.schemeId === id).length,
      candidateCount: data.state?.candidateIds?.length ?? 0,
    }))
    // Phone captures without a computer yet: a read-only 手机采集 scheme.
    if (!schemes.some((s) => s.id === MOBILE_SCHEME_ID) && results.some((r) => r.schemeId === MOBILE_SCHEME_ID)) {
      const ts = Math.max(...results.filter((r) => r.schemeId === MOBILE_SCHEME_ID).map((r) => r.capturedAt))
      schemes.push({ id: MOBILE_SCHEME_ID, name: '手机采集', need: '在 TiktokCut 手机 App 上直接采集的抖音商品', market: '抖音', status: 'active', sopStage: 2, keywordCount: 0, resultCount: results.filter((r) => r.schemeId === MOBILE_SCHEME_ID).length, candidateCount: 0, createdAt: ts, updatedAt: ts })
    }
    return schemes.sort((a, b) => b.updatedAt - a.updatedAt)
  },

  async getSchemeState(id: string): Promise<ProductResearchSchemeState | null> {
    const record = (await getRecord<SyncResearchScheme>(SYNC_COLLECTIONS.prSchemes, id))?.data
    if (!record) return id === MOBILE_SCHEME_ID ? emptyState() : null
    return { ...emptyState(), ...record.state }
  },

  async saveSchemeState(id: string, patch: Partial<ProductResearchSchemeState>) {
    const record = await schemeRecord(id)
    if (!record) return false
    const state = { ...emptyState(), ...record.state, ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) }
    await saveScheme(id, { scheme: { ...record.scheme, keywordCount: state.keywords.length, candidateCount: state.candidateIds.length, updatedAt: Date.now() }, state })
    return true
  },

  async createScheme(input: { name: string; need: string; market: string; keywords: string[]; note?: string }) {
    const id = globalThis.crypto.randomUUID()
    const now = Date.now()
    const keywords = (input.keywords ?? []).map((value, index) => ({ id: `${id}-kw-${index}`, value: String(value).trim(), status: 'pending' as const }))
    const scheme: ProductResearchScheme = {
      id,
      name: String(input.name || '').trim(),
      need: String(input.need || '').trim(),
      market: String(input.market || '').trim(),
      note: input.note ? String(input.note).trim() : undefined,
      status: 'draft',
      sopStage: 1,
      keywordCount: keywords.length,
      resultCount: 0,
      candidateCount: 0,
      createdAt: now,
      updatedAt: now,
    }
    await saveScheme(id, { scheme, state: { ...emptyState(), keywords } })
    return scheme
  },

  async updateScheme(id: string, patch: Partial<ProductResearchScheme>) {
    const record = await schemeRecord(id)
    if (!record) return null
    const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined))
    const scheme = { ...record.scheme, ...clean, ...(patch.sopStage !== undefined ? { sopStage: Math.min(5, Math.max(1, Number(patch.sopStage) || 1)) } : {}), updatedAt: Date.now() }
    await saveScheme(id, { scheme, state: record.state })
    return scheme
  },

  async deleteScheme(id: string) {
    await deleteRecord(SYNC_COLLECTIONS.prSchemes, id)
    return true
  },

  async createTask(input: { keyword: string; schemeId?: string; sort?: 'comprehensive' | 'sales'; targetCount?: number }) {
    const keyword = String(input.keyword || '').trim()
    if (!keyword) throw new Error('Keyword is required.')
    const { record, online } = await status()
    if (!online) throw new Error('电脑端不在线：采集任务要由电脑派发给连接的手机，请打开电脑上的 TiktokCut')
    if (!record?.devices.some((device) => device.connected)) throw new Error('No paired phone is online.')
    const id = await sendRequest({ action: 'createTask', keyword, schemeId: input.schemeId, sort: input.sort, targetCount: input.targetCount })
    return { id: `req:${id}`, schemeId: input.schemeId, keyword, sort: input.sort ?? 'sales', targetCount: input.targetCount ?? 100, status: 'queued', collectedCount: 0, createdAt: Date.now() } as ProductResearchTask
  },

  async cancelTask(taskId: string) {
    if (taskId.startsWith('req:')) return void (await deleteRecord(SYNC_COLLECTIONS.prRequests, taskId.slice(4)))
    await sendRequest({ action: 'cancelTask', taskId })
  },

  async removeTask(taskId: string) {
    if (taskId.startsWith('req:')) {
      await deleteRecord(SYNC_COLLECTIONS.prRequests, taskId.slice(4))
      return true
    }
    await sendRequest({ action: 'removeTask', taskId })
    // Hide it right away; the computer removes it (and its results) on its next sync.
    await deleteRecord(SYNC_COLLECTIONS.prTasks, taskId)
    for (const r of await listRecords<SyncPrResult>(SYNC_COLLECTIONS.prResults)) if (r.data?.taskId === taskId) await deleteRecord(SYNC_COLLECTIONS.prResults, r.id)
    return true
  },

  async removeResults(resultIds: string[], schemeId?: string) {
    const ids = [...new Set(resultIds.map(String))]
    if (!ids.length) return 0
    await sendRequest({ action: 'removeResults', resultIds: ids, schemeId })
    for (const id of ids) {
      await deleteRecord(SYNC_COLLECTIONS.prResults, id)
      await deleteRecord(SYNC_COLLECTIONS.researchResults, id).catch(() => undefined)
    }
    return ids.length
  },

  async createPairing(): Promise<never> {
    throw new Error('手机配对需要在电脑端操作：打开电脑上的 TiktokCut →「选品」→「连接手机」，配对后这里会显示在线手机。')
  },
}

const TYPES = new Set<SyncProductType>(['phone_case', 'earring', 'necklace', 'ring', 'bracelet', 'clothes', 'bag', 'shoes', 'toy', 'general'])

const products = {
  async list() {
    return (await listRecords<SyncProduct>(SYNC_COLLECTIONS.products)).filter((r) => r.data).map((r) => ({ id: r.id, ...(r.data as SyncProduct) }))
  },
  /** StepWinners 把爆款加进商品库：按标题找回采集结果，带上它的主图 */
  async upsert(input: { name: string; type?: string; remark?: string; images?: unknown[] }) {
    const name = String(input.name || '').trim().slice(0, 80)
    const result = (await listRecords<SyncPrResult>(SYNC_COLLECTIONS.prResults)).find((r) => r.data && r.data.title.trim().slice(0, 80) === name)?.data
    const image: SyncFileRef | undefined = result?.imageFileId ? { fileId: result.imageFileId, mime: 'image/jpeg' } : undefined
    const id = newId('prod')
    const product: SyncProduct = {
      name,
      type: TYPES.has(input.type as SyncProductType) ? (input.type as SyncProductType) : 'general',
      remark: input.remark,
      images: image ? [image] : [],
      coverFileId: image?.fileId,
      createdAt: Date.now(),
    }
    await saveRecord<SyncProduct>(SYNC_COLLECTIONS.products, id, product)
    return { id, ...product }
  },
}

const shell = {
  async openExternal(url: string) {
    window.open(url, '_blank', 'noopener')
  },
}

export type WebApi = { productResearch: typeof productResearch; products: typeof products; shell: typeof shell }

/** Installs the web stand-ins (only where the desktop preload API is absent). */
export function installResearchApi() {
  const w = window as unknown as { api?: Record<string, unknown> }
  w.api = { ...(w.api ?? {}), productResearch, products: { ...((w.api?.products as object) ?? {}), ...products }, shell }
}
