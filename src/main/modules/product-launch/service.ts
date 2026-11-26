/**
 * 一键上新（主进程）：按商品一段一段跑 —— 建档 → 商品图（上架助手）→ 各国标题详情 → 视频（tk创意室）→ 审核收件箱。
 * 同一时间只跑一段，跑完一段存一次盘；重启软件后接着跑。视频段只建任务，靠轮询等它出片。
 * 第一期只存草稿：视频进审核收件箱，不会自动发布。
 */
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { copyFile, mkdir, readFile, stat } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { getAppPaths } from '../../lib/paths'
import { cloneRepo } from '../clone/repo'
import { generateChatCompletion } from '../clone/unifiedChat'
import { productsRepo } from '../products/repo'
import { tiktokListingService } from '../tiktok-listing/service'
import type { tiktokCreativeStudioService } from '../tiktok-creative-studio/service'
import { livePhotoService } from '../live-photo/service'
import { createJsonStore } from '../content-hub/stores'
import {
  LAUNCH_MAX_ITEMS,
  LAUNCH_STAGES,
  buildLaunchCopyPrompt,
  copyBannedWords,
  freshStages,
  launchMotionAt,
  launchVideoStyleAt,
  isLaunchMarket,
  jobStatus,
  nextStage,
  normalizeLaunchOptions,
  parseLaunchCopy,
  resetFromStage,
  skipStage,
  videoReferenceImages,
  LAUNCH_VIDEO_ENGINES,
  type LaunchCreateInput,
  type LaunchVideoEngine,
  type LaunchItem,
  type LaunchJob,
  type LaunchMarket,
  type LaunchStage,
} from '../../../shared/productLaunch'

type LaunchDb = { schemaVersion: 1; jobs: LaunchJob[] }
const store = createJsonStore<LaunchDb>('product-launch.json', () => ({ schemaVersion: 1, jobs: [] }), (db) => ({
  schemaVersion: 1,
  jobs: Array.isArray(db?.jobs) ? db.jobs : [],
}))

const POLL_MS = 15_000
const IMAGE_MIME: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' }

const text = (value: unknown) => String(value ?? '').trim()
const messageOf = (error: unknown, fallback: string) => text((error as Error)?.message || error) || fallback

type Deps = {
  now: () => number
  credentials: () => Promise<any>
  chat: typeof generateChatCompletion
  products: Pick<typeof productsRepo, 'list' | 'upsert'>
  listing: Pick<typeof tiktokListingService, 'createOrUpdate' | 'generate'>
  creative: Pick<typeof tiktokCreativeStudioService, 'createFromReference' | 'getTask' | 'listAccounts'>
  livePhoto: Pick<typeof livePhotoService, 'createFromReference' | 'get'>
  syncInbox: () => Promise<unknown>
}
const defaultDeps: Deps = {
  now: () => Date.now(),
  credentials: () => cloneRepo.getCredentials(),
  chat: generateChatCompletion,
  products: productsRepo,
  listing: tiktokListingService,
  // tk创意室 和审核收件箱按需加载：服务器引擎里不用它们（网页只能用图生视频，成片由引擎发到作品库）
  creative: {
    createFromReference: async (input) => (await import('../tiktok-creative-studio/service')).tiktokCreativeStudioService.createFromReference(input),
    getTask: async (id) => (await import('../tiktok-creative-studio/service')).tiktokCreativeStudioService.getTask(id),
    listAccounts: async () => (await import('../tiktok-creative-studio/service')).tiktokCreativeStudioService.listAccounts(),
  },
  livePhoto: livePhotoService,
  syncInbox: async () => {
    const [{ contentIndex }, { reviewInbox }] = await Promise.all([import('../content-hub/contentIndex'), import('../content-hub/reviewInbox')])
    contentIndex.invalidate()
    return await reviewInbox.sync()
  },
}
let deps: Deps = defaultDeps
export function setProductLaunchTestDependencies(next: Partial<Deps>) {
  deps = { ...defaultDeps, ...next }
}

/** 这台机器能用的出视频方式：电脑端两种都行；服务器引擎没有 TikTok 创意账号，只能图生视频 */
let videoEngines: LaunchVideoEngine[] = [...LAUNCH_VIDEO_ENGINES]
/** 服务器引擎用：只开放图生视频；成片进作品库 / 审核收件箱的方式换成引擎自己的同步 */
export function configureProductLaunch(input: { videoEngines?: LaunchVideoEngine[]; syncInbox?: () => Promise<unknown> }) {
  if (input.videoEngines?.length) videoEngines = [...input.videoEngines]
  if (input.syncInbox) {
    defaultDeps.syncInbox = input.syncInbox
    deps = { ...deps, syncInbox: input.syncInbox }
  }
}

/* ------------------------------------------------------------------ 每一段 */

function productImage(product: Awaited<ReturnType<typeof productsRepo.list>>[number]) {
  const images = product.images || []
  return [product.coverImagePath, images.find((image) => image.isCover)?.filePath, ...images.map((image) => image.filePath), product.canonicalSourcePath]
    .map(text)
    .find((path) => path && existsSync(path)) || ''
}

function listingLanguage(markets: LaunchMarket[]) {
  return markets[0] === 'VN' ? 'vi-VN' : 'en-US'
}

function skuFor(item: LaunchItem) {
  const base = item.productName.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 24)
  return `${base || 'SKU'}-${(item.productId || item.id).slice(0, 6)}`.toUpperCase()
}

async function runProduct(item: LaunchItem) {
  if (item.source === 'library') {
    const product = (await deps.products.list()).find((entry) => entry.id === item.productId)
    if (!product) throw new Error('商品已经被删了')
    const image = productImage(product)
    if (!image) throw new Error('这个商品还没有图片，先到商品管理里加一张')
    item.productName = product.name
    item.category = text(product.type) || item.category
    item.sourceImagePath = image
    return
  }
  if (!existsSync(item.sourceImagePath)) throw new Error('找不到上传的图片，可能被移动或删除了')
  const at = deps.now()
  const info = await stat(item.sourceImagePath)
  const saved = await deps.products.upsert({
    ...(item.productId ? { id: item.productId } : {}),
    name: item.productName,
    type: item.category || 'general',
    remark: item.sellingPoints ? `卖点：${item.sellingPoints}` : undefined,
    images: [{ id: randomUUID(), productId: item.productId || '', filePath: item.sourceImagePath, fileName: basename(item.sourceImagePath), fileSize: info.size, createdAt: at, updatedAt: at, isCover: true }],
    coverImagePath: item.sourceImagePath,
    livePhotoReferenceImagePath: item.sourceImagePath,
  } as any)
  item.productId = saved.id
  item.sourceImagePath = productImage(saved) || item.sourceImagePath
}

async function runImages(job: LaunchJob, item: LaunchItem) {
  const saved = await deps.listing.createOrUpdate({
    ...(item.listingId ? { id: item.listingId } : {}),
    sourceImagePath: item.sourceImagePath,
    referenceImagePaths: [],
    category: item.category || 'general',
    sku: skuFor(item),
    localDisplayPrice: item.price || '-',
    titleLanguage: listingLanguage(job.markets),
  })
  item.listingId = saved.id
  const result = await deps.listing.generate({ id: saved.id })
  if (result.generationStatus !== 'done') throw new Error(text(result.generationError) || '出图失败')
  item.images = result.listingImages.map((image) => image.filePath).filter(Boolean)
  if (!item.images.length) throw new Error('出图失败：没有拿到图片')
}

async function imageInput(path: string) {
  const mimeType = IMAGE_MIME[extname(path).toLowerCase()]
  if (!mimeType || !existsSync(path)) return null
  return { mimeType, base64: (await readFile(path)).toString('base64') }
}

async function runCopy(job: LaunchJob, item: LaunchItem, update: (done: number) => Promise<void>) {
  const credentials = await deps.credentials()
  const images = (await Promise.all([item.sourceImagePath, item.images[0]].filter(Boolean).map(imageInput))).filter((image): image is NonNullable<typeof image> => Boolean(image))
  let done = 0
  for (const market of job.markets) {
    if (item.copy[market]?.titles.length) {
      done += 1
      continue
    }
    const write = async (avoid?: string[]) => {
      const result = await deps.chat({
        credentials,
        system: 'You write e-commerce listings. Reply with JSON only.',
        prompt: buildLaunchCopyPrompt({ market, productName: item.productName, category: item.category, price: item.price, sellingPoints: item.sellingPoints, titleCount: job.options.titleCount, avoid }),
        images,
        timeoutMs: 120_000,
      })
      return parseLaunchCopy(text((result as { content?: unknown }).content), job.options.titleCount)
    }
    // 命中违禁词就带着这些词重写一次；还有就留着标出来给人看
    let copy = await write()
    const hits = copyBannedWords(copy, market)
    if (hits.length) {
      const rewritten = await write(hits).catch(() => null)
      if (rewritten) copy = rewritten
    }
    item.copy[market] = { ...copy, flags: copyBannedWords(copy, market) }
    done += 1
    await update(done)
  }
}

/** tk创意室 按路径去重：同一张图要出几条，就复制几份不同名字的文件 */
async function distinctReferences(itemId: string, paths: string[]) {
  const seen = new Set<string>()
  const out: string[] = []
  for (const [index, path] of paths.entries()) {
    if (!seen.has(path)) {
      seen.add(path)
      out.push(path)
      continue
    }
    const dir = join(getAppPaths().dataDir, 'product-launch', itemId)
    await mkdir(dir, { recursive: true })
    const copy = join(dir, `video-ref-${index + 1}${extname(path) || '.png'}`)
    await copyFile(path, copy)
    out.push(copy)
  }
  return out
}

/** 视频任务已经建好、在等结果 */
const hasVideoTask = (item: LaunchItem) => Boolean(item.creativeTaskId || item.livePhotoIds?.length)

async function startVideos(job: LaunchJob, item: LaunchItem) {
  if (job.options.videoEngine === 'livePhoto') return await startLivePhotos(job, item)
  const { accounts } = await deps.creative.listAccounts()
  if (!accounts.some((account) => account.enabled && account.state !== 'disabled' && account.state !== 'expired')) {
    throw new Error('还没有可用的 TikTok 创意账号，先到「智能出片 → tk创意室」添加账号')
  }
  if (!item.productId) throw new Error('商品还没建档')
  const references = await distinctReferences(item.id, videoReferenceImages(item, job.options.videoCount))
  if (!references.length) throw new Error('没有可以做视频的图片')
  const styles = references.map((_, index) => launchVideoStyleAt(index))
  const task = await deps.creative.createFromReference({ referenceImagePaths: references, productId: item.productId, shotPromptSuffixes: styles.map((style) => style.prompt) })
  item.creativeTaskId = task.id
  item.videos = task.shots.map((shot, index) => ({ shotId: shot.shotId, style: styles[index]?.key, status: 'running' as const }))
}

/** 图生视频：一张参考图一条，运镜按 推近 / 拉远 / 轻晃 轮流 */
async function startLivePhotos(job: LaunchJob, item: LaunchItem) {
  if (!item.productId) throw new Error('商品还没建档')
  const references = await distinctReferences(item.id, videoReferenceImages(item, job.options.videoCount))
  if (!references.length) throw new Error('没有可以做视频的图片')
  item.livePhotoIds = []
  item.videos = []
  for (const [index, path] of references.entries()) {
    const motion = launchMotionAt(index)
    const created = await deps.livePhoto.createFromReference({ productId: item.productId, referenceImagePaths: [path], motionTemplate: motion })
    const entry = (Array.isArray(created) ? created[0] : created) as { id?: string } | undefined
    if (!entry?.id) throw new Error('图生视频没有建好任务')
    item.livePhotoIds.push(entry.id)
    item.videos.push({ shotId: entry.id, style: motion, status: 'running' })
  }
}

/** 图生视频条目算好没有：和审核收件箱同一个判断（打包完成且有视频文件） */
function livePhotoState(entry: any): { status: 'running' | 'done' | 'failed'; path?: string; error?: string } {
  if (!entry) return { status: 'failed', error: '图生视频条目被删了' }
  const path = [entry.subtitleOutputPath, entry.previewVideoPath, entry.livePhotoVideoPath, entry.motionVideoPath].map(text).find((value) => value && existsSync(value))
  if (entry.packagingStatus === 'completed' && path) return { status: 'done', path }
  if (entry.packagingStatus === 'failed' || /^failed/.test(text(entry.autoFlowStatus?.status)) || (text(entry.error) && !path)) return { status: 'failed', error: text(entry.error) || '生成失败' }
  return { status: 'running' }
}

/** 看一眼视频任务；全部有结果返回 true */
async function checkVideos(item: LaunchItem) {
  if (item.livePhotoIds?.length) {
    const styleOf = new Map(item.videos.map((video) => [video.shotId, video.style]))
    item.videos = []
    for (const id of item.livePhotoIds) item.videos.push({ shotId: id, style: styleOf.get(id), ...livePhotoState(await deps.livePhoto.get(id)) })
    return videoOutcome(item)
  }
  if (!item.creativeTaskId) return { finished: true, error: '视频任务丢了，请重跑这一步' }
  const task = await deps.creative.getTask(item.creativeTaskId)
  if (!task) return { finished: true, error: '视频任务被删了，请重跑这一步' }
  const styleOf = new Map(item.videos.map((video) => [video.shotId, video.style]))
  item.videos = task.shots.map((shot) => {
    const style = styleOf.get(shot.shotId)
    if (shot.status === 'completed' && shot.resultVideoPath) return { shotId: shot.shotId, style, path: shot.subtitleVideoPath || shot.resultVideoPath, status: 'done' as const }
    if (shot.status === 'failed') return { shotId: shot.shotId, style, status: 'failed' as const, error: text(shot.lastError) || '生成失败' }
    if (shot.status === 'requires_manual') return { shotId: shot.shotId, style, status: 'failed' as const, error: '需要到 tk创意室 手动处理' }
    return { shotId: shot.shotId, style, status: 'running' as const }
  })
  return videoOutcome(item)
}

function videoOutcome(item: LaunchItem) {
  const finished = item.videos.every((video) => video.status !== 'running')
  const ok = item.videos.filter((video) => video.status === 'done').length
  return { finished, error: finished && !ok ? item.videos.find((video) => video.error)?.error || '视频全部失败了' : '' }
}

/* ------------------------------------------------------------------ 调度 */

async function patchItem(jobId: string, itemId: string, fn: (item: LaunchItem, job: LaunchJob) => void) {
  await store.mutate((db) => {
    const job = db.jobs.find((entry) => entry.id === jobId)
    const item = job?.items.find((entry) => entry.id === itemId)
    if (!job || !item) return
    fn(item, job)
    job.updatedAt = deps.now()
  })
}

async function setStage(jobId: string, itemId: string, stage: LaunchStage, state: Partial<LaunchItem['stages'][LaunchStage]>, fields?: Partial<LaunchItem>) {
  await patchItem(jobId, itemId, (item) => {
    if (fields) Object.assign(item, fields)
    item.stages[stage] = { ...item.stages[stage], ...state, updatedAt: deps.now() }
    if (state.status && state.status !== 'failed') delete item.stages[stage].error
  })
}

async function runStage(job: LaunchJob, item: LaunchItem, stage: LaunchStage) {
  await setStage(job.id, item.id, stage, { status: 'running' })
  const work: LaunchItem = structuredClone(item)
  try {
    if (stage === 'product') await runProduct(work)
    if (stage === 'images') await runImages(job, work)
    if (stage === 'copy') {
      await setStage(job.id, item.id, stage, { done: 0, total: job.markets.length })
      await runCopy(job, work, async (done) => setStage(job.id, item.id, stage, { done }, { copy: work.copy }))
    }
    if (stage === 'videos') {
      await startVideos(job, work)
      // 视频要几分钟，留在 running，轮询来收尾
      await setStage(job.id, item.id, stage, { done: 0, total: work.videos.length }, { creativeTaskId: work.creativeTaskId, livePhotoIds: work.livePhotoIds, videos: work.videos })
      schedulePoll(1_000)
      return
    }
    if (stage === 'review') await deps.syncInbox()
    const { stages: _stages, ...fields } = work
    await setStage(job.id, item.id, stage, { status: 'done' }, fields)
  } catch (error) {
    const { stages: _stages, ...fields } = work
    await setStage(job.id, item.id, stage, { status: 'failed', error: messageOf(error, '这一步失败了') }, fields)
  }
}

let looping: Promise<void> | null = null

async function pickWork() {
  const db = await store.read()
  for (const job of [...db.jobs].sort((a, b) => a.createdAt - b.createdAt)) {
    if (job.paused) continue
    for (const item of job.items) {
      const stage = nextStage(item)
      if (stage && item.stages[stage].status === 'pending') return { job: structuredClone(job), item: structuredClone(item), stage }
    }
  }
  return null
}

function kick() {
  looping ??= (async () => {
    try {
      for (let next = await pickWork(); next; next = await pickWork()) await runStage(next.job, next.item, next.stage)
    } catch (error) {
      console.error('[product-launch] loop failed', error)
    } finally {
      looping = null
    }
  })()
  return looping
}

let pollTimer: ReturnType<typeof setTimeout> | null = null
function schedulePoll(delay = POLL_MS) {
  if (pollTimer) clearTimeout(pollTimer)
  pollTimer = setTimeout(() => {
    pollTimer = null
    void pollVideos()
  }, delay)
}

async function pollVideos() {
  let waiting = false
  try {
    const db = await store.read()
    for (const job of db.jobs) {
      for (const item of job.items) {
        if (item.stages.videos.status !== 'running' || !hasVideoTask(item)) continue
        const work = structuredClone(item)
        const result = await checkVideos(work)
        const done = work.videos.filter((video) => video.status === 'done').length
        if (!result.finished) {
          waiting = true
          await setStage(job.id, item.id, 'videos', { done, total: work.videos.length }, { videos: work.videos })
        } else if (result.error) {
          await setStage(job.id, item.id, 'videos', { status: 'failed', error: result.error, done, total: work.videos.length }, { videos: work.videos })
        } else {
          await setStage(job.id, item.id, 'videos', { status: 'done', done, total: work.videos.length }, { videos: work.videos })
          void kick()
        }
      }
    }
  } catch (error) {
    console.error('[product-launch] poll failed', error)
    waiting = true
  }
  if (waiting) schedulePoll()
}

/* ------------------------------------------------------------------ 对外 */

export const productLaunchService = {
  /** 页面用：这里能用哪些出视频方式 */
  async info() {
    return { videoEngines: [...videoEngines] }
  },

  /** 还有没做完的步骤（服务器引擎据此决定能不能退出） */
  async busy() {
    const db = await store.read()
    return db.jobs.some((job) => !job.paused && job.items.some((item) => LAUNCH_STAGES.some((stage) => ['pending', 'running'].includes(item.stages[stage].status))))
  },

  async list() {
    const db = await store.read()
    return [...db.jobs].sort((a, b) => b.createdAt - a.createdAt).map((job) => ({ ...job, status: jobStatus(job) }))
  },

  async get(id: string) {
    const job = (await store.read()).jobs.find((entry) => entry.id === id)
    return job ? { ...job, status: jobStatus(job) } : null
  },

  async create(input: LaunchCreateInput) {
    const markets = Array.from(new Set((input?.markets ?? []).filter(isLaunchMarket)))
    const options = normalizeLaunchOptions(input?.options)
    if (options.copy && !markets.length) throw new Error('至少选一个国家')
    if (!options.images && !options.copy && !options.videos) throw new Error('至少选一样要 AI 做的')
    if (options.videos && !videoEngines.includes(options.videoEngine)) throw new Error('网页版不能用 tk创意室 出视频（要用电脑上的 TikTok 创意账号），请改选图生视频，或到电脑端上新')
    const rawItems = Array.isArray(input?.items) ? input.items.slice(0, LAUNCH_MAX_ITEMS) : []
    const products = await deps.products.list()
    const at = deps.now()
    const items: LaunchItem[] = []
    for (const raw of rawItems) {
      const base = { id: randomUUID(), price: text(raw.price) || undefined, sellingPoints: text(raw.sellingPoints) || undefined, stages: freshStages(options, at), images: [], copy: {}, videos: [] }
      if (raw.source === 'library') {
        const product = products.find((entry) => entry.id === raw.productId)
        if (!product) continue
        items.push({ ...base, source: 'library', productId: product.id, productName: product.name, category: text(product.type) || 'general', sourceImagePath: productImage(product) })
      } else {
        const path = text(raw.imagePath)
        if (!path) continue
        const name = text(raw.name) || basename(path, extname(path))
        items.push({ ...base, source: 'upload', productName: name.slice(0, 60), category: text(raw.category) || 'general', sourceImagePath: path })
      }
    }
    if (!items.length) throw new Error('先放一张商品白底图，或从商品库选商品')
    const job: LaunchJob = {
      id: randomUUID(),
      title: items.length === 1 ? items[0].productName : `${items[0].productName} 等 ${items.length} 个商品`,
      markets,
      options,
      publishMode: 'draft',
      items,
      createdAt: at,
      updatedAt: at,
    }
    await store.mutate((db) => {
      db.jobs.unshift(job)
    })
    void kick()
    return { ...job, status: jobStatus(job) }
  },

  async retry(input: { jobId: string; itemId: string; stage: LaunchStage }) {
    if (!LAUNCH_STAGES.includes(input.stage)) throw new Error('不认识的步骤')
    await patchItem(input.jobId, input.itemId, (item) => {
      if (input.stage === 'copy') item.copy = {}
      if (input.stage === 'videos') {
        item.creativeTaskId = undefined
        item.livePhotoIds = undefined
        item.videos = []
      }
      resetFromStage(item, input.stage, deps.now())
    })
    void kick()
    return await this.get(input.jobId)
  },

  async skip(input: { jobId: string; itemId: string; stage: LaunchStage }) {
    let ok = false
    await patchItem(input.jobId, input.itemId, (item) => {
      ok = skipStage(item, input.stage, deps.now())
    })
    if (!ok) throw new Error('商品建档这一步不能跳过')
    void kick()
    return await this.get(input.jobId)
  },

  async setPaused(input: { jobId: string; paused: boolean }) {
    await store.mutate((db) => {
      const job = db.jobs.find((entry) => entry.id === input.jobId)
      if (job) job.paused = input.paused
    })
    if (!input.paused) void kick()
    return await this.get(input.jobId)
  },

  /** 只删上新记录；商品、图片、视频都留着 */
  async remove(id: string) {
    await store.mutate((db) => {
      db.jobs = db.jobs.filter((job) => job.id !== id)
    })
    return { ok: true }
  },

  /** 启动时：做到一半的步骤（视频除外）重新排队，视频接着等 */
  async resume() {
    let videos = false
    await store.mutate((db) => {
      for (const job of db.jobs) {
        for (const item of job.items) {
          for (const stage of LAUNCH_STAGES) {
            if (item.stages[stage].status !== 'running') continue
            if (stage === 'videos' && hasVideoTask(item)) videos = true
            else item.stages[stage] = { status: 'pending', updatedAt: deps.now() }
          }
        }
      }
    })
    if (videos) schedulePoll(5_000)
    void kick()
  },

  /** 测试用：等当前这一轮跑完 */
  async idle() {
    while (looping) await looping
  },
  async pollNow() {
    await pollVideos()
  },
  resetCache() {
    store.resetCache()
  },
}
