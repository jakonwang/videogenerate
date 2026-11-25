import { productCategoryLabel } from '@shared/productCategories'
import { SYNC_COLLECTIONS, type SyncFileRef, type SyncListing } from '@shared/cloud/sync'
import { buildTiktokListingImagePrompt } from '@shared/tiktokListingPrompts'
import { mergeListingExportConfigs, normalizeGeneratedTitle, type ListingExportCategoryConfig } from '@shared/tiktokListingExport'
import { getRecord, listRecords, saveRecord } from './sync'
import {
  buildTiktokListingDescriptionPrompt,
  buildTiktokListingTitlePrompt,
  type TiktokListingCategory,
  type TiktokListingLanguage,
} from '@shared/tiktokListingPrompts'
import { brandGuidance } from '@shared/cloud/producer'
import { loadBrand } from './brand'
import { cloud } from './session'

/** 上架文案生成（上架助手页面和 AI 制片人共用） */

export function cleanTitle(text: string) {
  return (
    text
      .split('\n')
      .map((line) => line.trim())
      .find(Boolean)
      ?.replace(/^["'“”「」《》]+|["'“”「」《》]+$/g, '')
      .replace(/^(title|标题)\s*[:：]\s*/i, '')
      .slice(0, 200) || ''
  )
}

export async function writeListingCopy(input: {
  images: SyncFileRef[]
  coverFileId?: string
  category: TiktokListingCategory
  language: TiktokListingLanguage
  sku?: string
  price?: string
}) {
  // The cover first, so the model looks at the main product shot.
  const ordered = [...input.images].sort((a, b) => Number(b.fileId === input.coverFileId) - Number(a.fileId === input.coverFileId))
  const imageFileIds = ordered.slice(0, 2).map((image) => image.fileId)
  const detailText = input.price ? `Price: ${input.price}` : undefined
  const sku = input.sku || ''
  // 品牌记忆：语气、人群和禁用词同样适用于上架文案。
  const brand = brandGuidance(await loadBrand().catch(() => null))
  const withBrand = (prompt: string) => (brand ? `${prompt}\n\nBrand guidance (follow it; never use the banned words):\n${brand}` : prompt)
  const [title, description] = await Promise.all([
    cloud.ai.chat({
      system: 'Only output the final title.',
      prompt: withBrand(buildTiktokListingTitlePrompt({ category: input.category, language: input.language, sku, detailText })),
      imageFileIds,
      purpose: 'listing-title',
    }),
    cloud.ai.chat({
      system: 'Only output the final description.',
      prompt: withBrand(buildTiktokListingDescriptionPrompt({ category: input.category, language: input.language, sku, detailText })),
      imageFileIds,
      purpose: 'listing-description',
    }),
  ])
  return { title: cleanTitle(title.content), description: description.content.trim() }
}

/* ------------------------------------------------------------------ 上架助手（和电脑端一样：标题 + 5 张商品图） */

export const LISTING_IMAGE_COUNT = 5

function imagePrompt(category: TiktokListingCategory, index: number, sku: string, anchorMode: 'source_only' | 'source_plus_hero') {
  return buildTiktokListingImagePrompt({ category, index, sku, anchorMode, detailText: `${productCategoryLabel(category)} ecommerce listing image` })
}

/** 第 1 张：主图 + 参考图；第 2–5 张：主图 + 第 1 张成图 + 参考图（同电脑端，云端最多 5 张参考） */
async function submitListingImage(listing: SyncListing, index: number, heroFileId?: string) {
  const [source, ...refs] = listing.images.map((image) => image.fileId)
  const imageFileIds = heroFileId ? [source!, heroFileId, ...refs.slice(0, 3)] : [source!, ...refs.slice(0, 4)]
  const { job } = await cloud.ai.createJob({ kind: 'image', prompt: imagePrompt(listing.category, index, listing.sku, heroFileId ? 'source_plus_hero' : 'source_only'), imageFileIds, aspectRatio: '1:1', purpose: 'listing-image' })
  return { jobId: job.id, status: job.status }
}

/** 生成：先写标题（结尾带 SKU）和描述，再出第 1 张商品图；其余 4 张等第 1 张好了再出（refreshListings 接着做） */
export async function generateListing(id: string, listing: SyncListing) {
  if (!listing.images.length) throw new Error('先上传商品主图')
  const working: SyncListing = { ...listing, generationStatus: 'generating', generationError: undefined, listingImages: [] }
  await saveRecord<SyncListing>(SYNC_COLLECTIONS.listings, id, working)
  try {
    const copy = await writeListingCopy({ images: listing.images, category: listing.category, language: listing.language, sku: listing.sku, price: listing.price })
    const first = await submitListingImage(listing, 0)
    const next: SyncListing = { ...working, title: normalizeGeneratedTitle(copy.title, listing.sku), description: copy.description, listingImages: [first] }
    await saveRecord<SyncListing>(SYNC_COLLECTIONS.listings, id, next)
    startListingPolling()
    return next
  } catch (error) {
    const failed: SyncListing = { ...working, generationStatus: 'failed', generationError: error instanceof Error ? error.message : String(error) }
    await saveRecord<SyncListing>(SYNC_COLLECTIONS.listings, id, failed)
    throw error
  }
}

let timer: ReturnType<typeof setTimeout> | null = null
export function startListingPolling() {
  if (timer) return
  const tick = async () => {
    timer = null
    const still = await refreshListings().catch(() => 1)
    if (still && document.visibilityState === 'visible') timer = setTimeout(tick, 4000)
  }
  timer = setTimeout(tick, 1500)
}

const pending = (state: string) => state === 'queued' || state === 'running'

export async function refreshListings(): Promise<number> {
  const records = (await listRecords<SyncListing>(SYNC_COLLECTIONS.listings)).filter((r) => r.data?.generationStatus === 'generating')
  const jobIds = records.flatMap((r) => (r.data!.listingImages ?? []).filter((img) => img.jobId && pending(img.status)).map((img) => img.jobId!))
  const jobs = jobIds.length ? new Map((await cloud.ai.listJobs(jobIds)).jobs.map((job) => [job.id, job])) : new Map()
  let still = 0
  for (const record of records) {
    const listing = record.data!
    let images = [...(listing.listingImages ?? [])]
    let changed = false
    images = images.map((img) => {
      const job = img.jobId ? jobs.get(img.jobId) : undefined
      if (!job || !pending(img.status) || job.status === img.status) return img
      changed = true
      return { ...img, status: job.status, fileId: job.outputFileId, error: job.error }
    })
    const failed = images.find((img) => img.status === 'failed')
    let status: SyncListing['generationStatus'] = 'generating'
    if (failed) status = 'failed'
    else if (images[0]?.status === 'succeeded' && images.length === 1) {
      // 主图好了：接着出其余 4 张，参考第 1 张成图
      for (let index = 1; index < LISTING_IMAGE_COUNT; index += 1) images.push(await submitListingImage(listing, index, images[0].fileId))
      changed = true
    } else if (images.length === LISTING_IMAGE_COUNT && images.every((img) => img.status === 'succeeded')) status = 'done'
    if (status === 'generating') still += 1
    if (changed || status !== listing.generationStatus) {
      await saveRecord<SyncListing>(SYNC_COLLECTIONS.listings, record.id, {
        ...listing,
        listingImages: images,
        generationStatus: status,
        generationError: failed ? failed.error || '商品图生成失败' : undefined,
        generatedAt: status === 'done' ? Date.now() : listing.generatedAt,
      })
    }
  }
  return still
}

/* ------------------------------------------------------------------ 导出店小秘 Excel */

const EXPORT_CONFIG_ID = 'config'
export async function loadExportConfigs(): Promise<ListingExportCategoryConfig[]> {
  const record = await getRecord<{ configs: ListingExportCategoryConfig[] }>(SYNC_COLLECTIONS.listingExportConfig, EXPORT_CONFIG_ID)
  return mergeListingExportConfigs(record?.data?.configs ?? [])
}
export async function saveExportConfigs(configs: ListingExportCategoryConfig[]) {
  await saveRecord(SYNC_COLLECTIONS.listingExportConfig, EXPORT_CONFIG_ID, { configs: mergeListingExportConfigs(configs) })
}
