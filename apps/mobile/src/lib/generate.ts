import { ref, watch } from 'vue'
import { SYNC_COLLECTIONS, type SyncGeneration, type SyncModel, type SyncProduct } from '@shared/cloud/sync'
import { buildModelLibraryPrompt } from '@shared/modelLibraryPrompt'
import { PRODUCT_REPLACEMENT_PROMPT } from '@shared/productReplacementPrompt'
import { normalizeProductCategory } from '@shared/productCategories'
import { buildTiktokListingImagePrompt, type TiktokListingCategory } from '@shared/tiktokListingPrompts'
import type { AiGenerationRequest } from '@shared/cloud/ai'
import { cloud } from './session'
import { getRecord, listRecords, newId, saveRecord, syncState } from './sync'

/**
 * AI 素材生成（商品图、图生视频）：提交到云端后台任务，记录写进 generations 集合（多端同步），
 * 页面打开期间每隔几秒查一次进度；生成好的素材进审核收件箱。
 */

export type GenerationItem = SyncGeneration & { id: string; updatedAt: number }

/** 商品图的五种镜头（与桌面端上架助手同一套提示词） */
export const PRODUCT_IMAGE_SHOTS = [
  { index: 0, label: '商品主图', hint: '纯商品、干净背景' },
  { index: 1, label: '侧面上身', hint: '模特侧面佩戴 / 使用' },
  { index: 2, label: '正面上身', hint: '模特正面佩戴 / 使用' },
  { index: 3, label: '质感特写', hint: '材质和光泽' },
  { index: 4, label: '细节微距', hint: '佩戴处细节' },
] as const

/** 图生视频的运动方式 */
export const VIDEO_MOTIONS = [
  { key: 'subtle', label: '自然微动', prompt: 'subtle natural motion with gentle light shimmer' },
  { key: 'rotate', label: '缓慢旋转', prompt: 'the product slowly rotates to show its form from several angles' },
  { key: 'push', label: '镜头推近', prompt: 'a smooth slow camera push-in towards the product details' },
  { key: 'light', label: '光影流动', prompt: 'soft moving light sweeps across the product, highlights glide over the surface' },
] as const

export const VIDEO_BASE_PROMPT = 'Create a realistic six-second product close-up video while preserving the exact product identity and composition. Keep the product shape, color, material and every visible detail unchanged.'

export function categoryForProduct(type: string | undefined): TiktokListingCategory | null {
  const category = normalizeProductCategory(type)
  return category && category !== 'general' ? category : null
}

function productImagePrompt(category: TiktokListingCategory | null, shot: number) {
  if (category) return buildTiktokListingImagePrompt({ category, index: shot })
  // Product types outside the jewelry / phone-case presets get a neutral studio prompt.
  const scenes = ['clean product-only hero shot on a light neutral background', 'the product in use, side angle, lifestyle context', 'the product in use, front angle, lifestyle context', 'texture and material close-up', 'macro detail of the most distinctive part']
  return `Create a photorealistic TikTok ecommerce product image. Keep the exact same product as the reference image with no redesign. ${scenes[shot] || scenes[0]}. Square 1:1, soft studio lighting, no text or watermark.`
}

async function submit(request: AiGenerationRequest, record: Omit<SyncGeneration, 'jobId' | 'status' | 'review' | 'createdAt'>) {
  const { job } = await cloud.ai.createJob(request)
  const id = newId('gen')
  await saveRecord<SyncGeneration>(SYNC_COLLECTIONS.generations, id, { ...record, jobId: job.id, status: job.status, review: 'pending', createdAt: Date.now() })
  startPolling()
  return id
}

/** 给其它模块（商品替换批次等）提交一条生成任务，记录进 generations */
export const submitGeneration = submit

export async function generateProductImages(input: { productId?: string; productName?: string; category: TiktokListingCategory | null; sourceFileId: string; shots: number[] }) {
  const category = input.category
  const ids: string[] = []
  for (const shot of input.shots) {
    const meta = PRODUCT_IMAGE_SHOTS[shot]
    ids.push(
      await submit(
        { kind: 'image', prompt: productImagePrompt(category, shot), imageFileIds: [input.sourceFileId], aspectRatio: '1:1', purpose: 'product-image' },
        { kind: 'image', purpose: 'product-image', productId: input.productId, productName: input.productName, sourceFileId: input.sourceFileId, label: meta.label },
      ),
    )
  }
  return ids
}

export async function generateVideo(input: { productId?: string; productName?: string; sourceFileId: string; motion: (typeof VIDEO_MOTIONS)[number]['key']; durationSec: number }) {
  const motion = VIDEO_MOTIONS.find((item) => item.key === input.motion) ?? VIDEO_MOTIONS[0]
  return submit(
    { kind: 'video', prompt: `${VIDEO_BASE_PROMPT} Motion: ${motion.prompt}.`, imageFileIds: [input.sourceFileId], aspectRatio: '9:16', durationSec: input.durationSec, purpose: 'image-to-video' },
    { kind: 'video', purpose: 'image-to-video', productId: input.productId, productName: input.productName, sourceFileId: input.sourceFileId, label: motion.label },
  )
}

/** 商品替换：每张场景图一个任务，参考图 = [场景, 商品图最多 3 张] */
export async function generateProductReplacement(input: {
  productId?: string
  productName?: string
  scenes: Array<{ fileId: string; aspectRatio: '1:1' | '9:16' | '16:9' }>
  productFileIds: string[]
  note?: string
}) {
  const prompt = input.note?.trim() ? `${PRODUCT_REPLACEMENT_PROMPT}
${input.note.trim()}` : PRODUCT_REPLACEMENT_PROMPT
  const refs = input.productFileIds.slice(0, 3)
  const ids: string[] = []
  for (const [index, scene] of input.scenes.entries()) {
    ids.push(
      await submit(
        { kind: 'image', prompt, imageFileIds: [scene.fileId, ...refs], aspectRatio: scene.aspectRatio, purpose: 'product-replace' },
        { kind: 'image', purpose: 'product-replace', productId: input.productId, productName: input.productName, sourceFileId: scene.fileId, label: `替换 ${index + 1}` },
      ),
    )
  }
  return ids
}

/** AI 模特：按模特资料生成一张 3x3 多角度参考图，通过后加进这个模特的图片 */
export async function generateModelImage(input: { modelId: string; model: Pick<SyncModel, 'name' | 'gender' | 'ageRange' | 'style' | 'description'> }) {
  const male = input.model.gender === '男'
  const extra = [input.model.style, input.model.description].map((value) => value?.trim()).filter(Boolean).join('. ')
  const prompt = buildModelLibraryPrompt({
    profile: {
      market: 'Southeast Asian social-commerce market',
      gender: male ? 'male' : 'female',
      ageRange: input.model.ageRange || (male ? '23-32' : '20-28'),
      hairStyle: male ? 'natural short hair' : 'natural long hair',
      skinTone: 'healthy natural Southeast Asian skin tone',
      outfitStyle: extra ? `simple everyday outfit matching: ${extra}` : 'simple light short-sleeve everyday outfit',
      mood: 'friendly natural everyday expression',
      sceneStyle: 'real indoor home environment with soft natural lighting',
    },
  })
  return submit(
    { kind: 'image', prompt, aspectRatio: '1:1', purpose: 'model' },
    { kind: 'image', purpose: 'model', modelId: input.modelId, sourceFileId: '', label: `${input.model.name || '模特'} · AI 形象` },
  )
}

/** 手机本地做好的图（如商品图水印）直接记成一条已完成的作品，进审核收件箱 */
export async function saveLocalResult(record: Omit<SyncGeneration, 'jobId' | 'status' | 'review' | 'createdAt'>) {
  const id = newId('gen')
  await saveRecord<SyncGeneration>(SYNC_COLLECTIONS.generations, id, { ...record, jobId: '', status: 'succeeded', review: 'pending', createdAt: Date.now() })
  return id
}

/** 按宽高选最接近的出图比例 */
export function closestAspect(width?: number, height?: number): '1:1' | '9:16' | '16:9' {
  if (!width || !height) return '1:1'
  const ratio = width / height
  const options: Array<['1:1' | '9:16' | '16:9', number]> = [['1:1', 1], ['9:16', 9 / 16], ['16:9', 16 / 9]]
  return options.reduce((best, item) => (Math.abs(Math.log(ratio / item[1])) < Math.abs(Math.log(ratio / best[1])) ? item : best))[0]
}

/* ------------------------------------------------------------------ 进度轮询 */

let timer: ReturnType<typeof setTimeout> | null = null

export function startPolling() {
  if (timer) return
  const tick = async () => {
    timer = null
    const pending = await refreshPending().catch(() => 1)
    if (pending && document.visibilityState === 'visible') timer = setTimeout(tick, 5000)
  }
  timer = setTimeout(tick, 1500)
}

/** 每次刷新任务后再跑的步骤（如图生视频：替换图完成后接着生成视频），返回新开的任务数 */
const afterRefresh: Array<() => Promise<number>> = []
export function onGenerationsRefreshed(hook: () => Promise<number>) {
  afterRefresh.push(hook)
}

/** 查询所有未完成的任务并更新记录，返回仍在进行中的数量 */
export async function refreshPending(): Promise<number> {
  const still = await refreshJobs()
  let started = 0
  for (const hook of afterRefresh) started += await hook().catch(() => 0)
  return still + started
}

async function refreshJobs(): Promise<number> {
  const records = await listRecords<SyncGeneration>(SYNC_COLLECTIONS.generations)
  const pending = records.filter((record) => record.data && (record.data.status === 'queued' || record.data.status === 'running'))
  if (!pending.length) return 0
  const { jobs } = await cloud.ai.listJobs(pending.map((record) => record.data!.jobId))
  let still = 0
  for (const record of pending) {
    const job = jobs.find((item) => item.id === record.data!.jobId)
    if (!job) continue
    if (job.status === 'queued' || job.status === 'running') still += 1
    if (job.status === record.data!.status) continue
    await saveRecord<SyncGeneration>(SYNC_COLLECTIONS.generations, record.id, {
      ...record.data!,
      status: job.status,
      outputFileId: job.outputFileId,
      outputMime: job.outputMime,
      error: job.error,
    })
  }
  return still
}

/* ------------------------------------------------------------------ 列表 / 审核 */

export function useGenerations(filter?: (item: GenerationItem) => boolean) {
  const items = ref<GenerationItem[]>([])
  watch(
    () => syncState.version,
    async () => {
      const records = await listRecords<SyncGeneration>(SYNC_COLLECTIONS.generations)
      items.value = records
        .filter((record) => record.data)
        .map((record) => ({ ...(record.data as SyncGeneration), id: record.id, updatedAt: record.updatedAt }))
        .filter((item) => !filter || filter(item))
        .sort((a, b) => b.createdAt - a.createdAt)
    },
    { immediate: true },
  )
  return items
}

/** 通过：商品图加进对应商品的图片里（视频只标记通过，后续发布时使用） */
export async function approve(item: GenerationItem) {
  if (item.kind === 'image' && item.productId && item.outputFileId) {
    const product = await getRecord<SyncProduct>(SYNC_COLLECTIONS.products, item.productId)
    if (product?.data && !product.data.images.some((image) => image.fileId === item.outputFileId)) {
      await saveRecord<SyncProduct>(SYNC_COLLECTIONS.products, item.productId, {
        ...product.data,
        images: [...product.data.images, { fileId: item.outputFileId, mime: item.outputMime || 'image/png' }],
      })
    }
  }
  if (item.kind === 'image' && item.modelId && item.outputFileId) {
    const model = await getRecord<SyncModel>(SYNC_COLLECTIONS.models, item.modelId)
    if (model?.data && !model.data.images.some((image) => image.fileId === item.outputFileId)) {
      await saveRecord<SyncModel>(SYNC_COLLECTIONS.models, item.modelId, {
        ...model.data,
        images: [...model.data.images, { fileId: item.outputFileId, mime: item.outputMime || 'image/png' }],
        coverFileId: model.data.coverFileId || item.outputFileId,
      })
    }
  }
  const { id, updatedAt: _updatedAt, ...data } = item
  await saveRecord<SyncGeneration>(SYNC_COLLECTIONS.generations, id, { ...data, review: 'approved' })
}

export async function reject(item: GenerationItem) {
  const { id, updatedAt: _updatedAt, ...data } = item
  await saveRecord<SyncGeneration>(SYNC_COLLECTIONS.generations, id, { ...data, review: 'rejected' })
}
