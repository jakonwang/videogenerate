/**
 * 网页版的 TikTok 上架助手接口：电脑端「上架助手」页面（TiktokListingHelperView）在网页上原样显示，
 * 它调用的 window.api.tiktokListing 由这里提供——数据存在 listings / listing-export-config（手机 App 同一份），
 * 生成用云端（标题和描述走 AI 对话，5 张商品图走云端出图，见 lib/listing.ts）。
 *
 * - 电脑端「生成」要等全部做完才返回；这里同样等云端出完 5 张图（最多 15 分钟，超时就先返回，状态仍是「生成中」）。
 * - 「导出店小秘 Excel」在浏览器里生成并下载；图片地址用云端的公网链接（30 天有效）。
 * - 图片路径都是 `cloudfile:<fileId>/<名字>`。
 */
import { cloudFileRef } from '@shared/cloud/relay'
import { SYNC_COLLECTIONS, type SyncListing } from '@shared/cloud/sync'
import { LISTING_EXPORT_HEADERS, buildListingDescriptionFromUrls, buildListingExportRow, type ListingExportCategoryConfig } from '@shared/tiktokListingExport'
import { LISTING_IMAGE_COUNT, generateListing, loadExportConfigs, refreshListings, saveExportConfigs, startListingPolling } from '../listing'
import { downloadBlob } from '../platform'
import { cloud, errorMessage } from '../session'
import { deleteRecord, getRecord, listRecords, newId, saveRecord } from '../sync'
import { toast } from '../toast'
import type { DesktopApi } from './contract'
import { cloudFileIdOf, getPathForFile, pickFiles } from './files'

const GENERATE_WAIT_MS = 15 * 60_000

type Row = SyncListing & { id: string; updatedAt: number }

const imagePath = (fileId: string, name: string) => cloudFileRef(fileId, `${name}.jpg`)

function toItem(row: Row) {
  const sku = row.sku || 'listing'
  const [source, ...refs] = row.images
  return {
    id: row.id,
    sourceImagePath: source ? imagePath(source.fileId, `${sku}-main`) : '',
    referenceImagePaths: refs.map((image, index) => imagePath(image.fileId, `${sku}-ref-${index + 1}`)),
    category: row.category,
    sku: row.sku,
    localDisplayPrice: row.price,
    titleLanguage: row.language,
    generatedTitle: row.title || undefined,
    generatedDescription: row.description || undefined,
    listingImages: (row.listingImages ?? [])
      .filter((image) => image.status === 'succeeded' && image.fileId)
      .map((image, index) => ({ id: image.fileId!, filePath: imagePath(image.fileId!, `${sku}-${index + 1}`), fileName: `${sku}-${index + 1}.jpg`, createdAt: row.generatedAt ?? row.createdAt })),
    generationStatus: row.generationStatus ?? 'idle',
    generationError: row.generationError,
    generatedAt: row.generatedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

async function rows(): Promise<Row[]> {
  return (await listRecords<SyncListing>(SYNC_COLLECTIONS.listings))
    .filter((record) => record.data)
    .map((record) => ({ ...(record.data as SyncListing), id: record.id, updatedAt: record.updatedAt }))
    .sort((a, b) => b.createdAt - a.createdAt)
}

async function row(id: string): Promise<Row> {
  const record = await getRecord<SyncListing>(SYNC_COLLECTIONS.listings, id)
  if (!record?.data) throw new Error('这个商品不存在，请刷新后重试')
  return { ...record.data, id, updatedAt: record.updatedAt }
}

async function list() {
  const all = await rows()
  if (all.some((item) => item.generationStatus === 'generating')) startListingPolling()
  return all.map(toItem)
}

/** 新建或保存：主图 + 参考图（页面交回的路径）→ 云端图片；删除商品图时页面会带上剩下的 listingImages */
async function createOrUpdate(payload: {
  id?: string
  sourceImagePath?: string
  referenceImagePaths?: string[]
  category?: SyncListing['category']
  sku?: string
  localDisplayPrice?: string
  titleLanguage?: SyncListing['language']
  listingImages?: Array<{ id: string }>
}) {
  const existing = payload.id ? await row(payload.id) : null
  const paths = [...new Set([payload.sourceImagePath, ...(payload.referenceImagePaths ?? [])].map((path) => String(path || '').trim()).filter(Boolean))]
  if (!paths.length && !existing) throw new Error('请先上传商品主图')
  const images = paths.length ? await Promise.all(paths.map(async (path) => ({ fileId: await cloudFileIdOf(path), mime: 'image/jpeg' }))) : existing!.images
  const keep = payload.listingImages ? new Set(payload.listingImages.map((image) => image.id)) : null
  const next: SyncListing = {
    productId: existing?.productId,
    images,
    category: payload.category ?? existing?.category ?? 'earring',
    language: payload.titleLanguage ?? existing?.language ?? 'en-US',
    sku: String(payload.sku ?? existing?.sku ?? '').trim(),
    price: String(payload.localDisplayPrice ?? existing?.price ?? '').trim(),
    title: existing?.title ?? '',
    description: existing?.description ?? '',
    generatedAt: existing?.generatedAt,
    listingImages: keep ? (existing?.listingImages ?? []).filter((image) => image.fileId && keep.has(image.fileId)) : existing?.listingImages,
    generationStatus: existing?.generationStatus ?? 'idle',
    generationError: existing?.generationError,
    createdAt: existing?.createdAt ?? Date.now(),
  }
  const id = existing?.id ?? newId('listing')
  await saveRecord<SyncListing>(SYNC_COLLECTIONS.listings, id, next)
  return toItem({ ...next, id, updatedAt: Date.now() })
}

/** 生成：标题 + 描述 + 第 1 张商品图，再等其余 4 张（和电脑端一样等全部做完才返回） */
async function generate(payload: { id: string }) {
  await generateListing(payload.id, await row(payload.id))
  const deadline = Date.now() + GENERATE_WAIT_MS
  for (;;) {
    await refreshListings().catch(() => 0)
    const current = await row(payload.id)
    if (current.generationStatus === 'failed') throw new Error(current.generationError || '商品图生成失败')
    if (current.generationStatus !== 'generating' || Date.now() > deadline) return toItem(current)
    await new Promise((resolve) => setTimeout(resolve, 4000))
  }
}

async function remove(id: string) {
  await deleteRecord(SYNC_COLLECTIONS.listings, id)
  return { ok: true }
}

/** 店小秘 Excel：和电脑端同样的检查和表头，在浏览器里生成后下载 */
async function exportExcel(payload: { ids: string[] }) {
  const ids = new Set((payload.ids ?? []).map(String))
  if (!ids.size) throw new Error('请选择要导出的商品')
  const chosen = (await rows()).filter((item) => ids.has(item.id))
  if (!chosen.length) throw new Error('未找到可导出的商品')
  const imagesOf = (item: Row) => (item.listingImages ?? []).filter((image) => image.status === 'succeeded' && image.fileId).map((image) => image.fileId!)
  for (const item of chosen) {
    if (!item.sku.trim()) throw new Error(`SKU 为空：${item.id}`)
    if (!item.price.trim()) throw new Error(`价格为空：${item.sku}`)
    if (!item.title.trim()) throw new Error(`标题未生成：${item.sku}`)
    if (imagesOf(item).length < LISTING_IMAGE_COUNT) throw new Error(`商品图不足 5 张：${item.sku}`)
  }
  const { urls } = await cloud.ai.publicUrls(chosen.flatMap(imagesOf), 30)
  const configs = new Map((await loadExportConfigs()).map((config) => [config.category, config]))
  const sheetRows = chosen.map((item) => {
    const imageUrls = imagesOf(item).map((fileId) => urls[fileId] || '')
    return buildListingExportRow({ category: item.category, title: item.title, description: buildListingDescriptionFromUrls(imageUrls), sku: item.sku, price: item.price, imageUrls }, configs.get(item.category))
  })
  const XLSX = await import('xlsx')
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(sheetRows, { header: LISTING_EXPORT_HEADERS }), 'Sheet1')
  const array = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  const name = `tiktok-listing-${Date.now()}.xlsx`
  downloadBlob(new Blob([array], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), name)
  return { filePath: name, count: chosen.length }
}

const tiktokListing = {
  list,
  getExportCategoryConfigs: () => loadExportConfigs(),
  saveExportCategoryConfigs: async (configs: ListingExportCategoryConfig[]) => {
    await saveExportConfigs(configs)
    return loadExportConfigs()
  },
  createOrUpdate,
  generate,
  remove,
  exportExcel,
} satisfies DesktopApi['tiktokListing']

/** 打开图片：新标签页；导出后的「打开所在文件夹」：Excel 已由浏览器下载，不用再做什么 */
async function openCloudFile(path: string) {
  if (!path.startsWith('cloudfile:')) return ''
  try {
    const { openDesktopFile } = await import('../desktopShims/localMedia')
    await openDesktopFile(path)
  } catch (error) {
    toast(errorMessage(error))
  }
  return ''
}

/** 这个页面打开期间替换的 window.api 部分 */
export default {
  tiktokListing,
  pickFiles,
  getPathForFile,
  shell: { openPath: openCloudFile, showItemInFolder: openCloudFile },
}
