/**
 * 一键上新：一张白底图（或商品库里的商品）→ 商品图 → 各国标题和详情 → 带货视频 → 审核收件箱。
 * 这里放三端共用的类型、国家表、提示词和纯函数；跑流程在 src/main/modules/product-launch。
 * 第一期做好以后只存草稿（进审核收件箱），不会自动发布。
 */

export const LAUNCH_MARKETS = [
  { code: 'VN', language: 'vi-VN', languageName: 'Vietnamese' },
  { code: 'TH', language: 'th-TH', languageName: 'Thai' },
  { code: 'ID', language: 'id-ID', languageName: 'Indonesian' },
  { code: 'MY', language: 'ms-MY', languageName: 'Malay' },
  { code: 'PH', language: 'en-PH', languageName: 'English (Philippines)' },
  { code: 'US', language: 'en-US', languageName: 'English (United States)' },
] as const
export type LaunchMarket = (typeof LAUNCH_MARKETS)[number]['code']
export const isLaunchMarket = (value: unknown): value is LaunchMarket => LAUNCH_MARKETS.some((item) => item.code === value)
export const launchMarketOf = (code: LaunchMarket) => LAUNCH_MARKETS.find((item) => item.code === code)!

export const LAUNCH_STAGES = ['product', 'images', 'copy', 'videos', 'review'] as const
export type LaunchStage = (typeof LAUNCH_STAGES)[number]
export type LaunchStageStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped'
export type LaunchStageState = { status: LaunchStageStatus; error?: string; done?: number; total?: number; updatedAt: number }

/** 上架助手一次固定出 5 张图，视频就从这几张里挑参考图，所以最多 5 条 */
export const LAUNCH_MAX_VIDEOS = 5
export const LAUNCH_MAX_TITLES = 3
export const LAUNCH_MAX_ITEMS = 20
export const LAUNCH_LISTING_IMAGES = 5

/** 出视频用哪个：tk创意室（电脑上的 TikTok 创意账号）或 图生视频（AI 出视频，扣点） */
export const LAUNCH_VIDEO_ENGINES = ['creative', 'livePhoto'] as const
export type LaunchVideoEngine = (typeof LAUNCH_VIDEO_ENGINES)[number]

export type LaunchOptions = {
  images: boolean
  copy: boolean
  videos: boolean
  /** 每个商品几条视频 */
  videoCount: number
  videoEngine: LaunchVideoEngine
  /** 每个国家几个备选标题 */
  titleCount: number
}

/** 违禁词检查后还剩的词；空数组 = 通过 */
export type LaunchCopy = { titles: string[]; description: string; flags?: string[] }

export type LaunchItem = {
  id: string
  source: 'upload' | 'library'
  productId?: string
  productName: string
  category: string
  sourceImagePath: string
  price?: string
  sellingPoints?: string
  stages: Record<LaunchStage, LaunchStageState>
  listingId?: string
  images: string[]
  copy: Partial<Record<LaunchMarket, LaunchCopy>>
  creativeTaskId?: string
  /** 图生视频：每条视频一个条目 id（和 videos[].shotId 一致） */
  livePhotoIds?: string[]
  videos: Array<{ shotId: string; style?: LaunchVideoStyle | LaunchMotionStyle; path?: string; status: 'running' | 'done' | 'failed'; error?: string }>
}

export type LaunchJobStatus = 'running' | 'review' | 'done' | 'failed' | 'paused'

export type LaunchJob = {
  id: string
  title: string
  markets: LaunchMarket[]
  options: LaunchOptions
  publishMode: 'draft'
  paused?: boolean
  items: LaunchItem[]
  createdAt: number
  updatedAt: number
}

export type LaunchCreateInput = {
  markets: LaunchMarket[]
  options: Partial<LaunchOptions>
  items: Array<{
    source: 'upload' | 'library'
    productId?: string
    imagePath?: string
    name?: string
    category?: string
    price?: string
    sellingPoints?: string
  }>
}

const clampInt = (value: unknown, min: number, max: number, fallback: number) => {
  const n = Math.round(Number(value))
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback
}

export function normalizeLaunchOptions(input: Partial<LaunchOptions> | undefined): LaunchOptions {
  return {
    images: input?.images !== false,
    copy: input?.copy !== false,
    videos: input?.videos !== false,
    videoCount: clampInt(input?.videoCount, 1, LAUNCH_MAX_VIDEOS, 3),
    videoEngine: input?.videoEngine === 'livePhoto' ? 'livePhoto' : 'creative',
    titleCount: clampInt(input?.titleCount, 1, LAUNCH_MAX_TITLES, 2),
  }
}

/** 这次会做出多少东西（新建页右侧的「这次会做出」） */
export function launchSummary(input: { itemCount: number; markets: number; options: LaunchOptions }) {
  const { itemCount, markets, options } = input
  return {
    products: itemCount,
    images: options.images ? itemCount * LAUNCH_LISTING_IMAGES : 0,
    details: options.copy ? itemCount * markets : 0,
    titles: options.copy ? itemCount * markets * options.titleCount : 0,
    videos: options.videos ? itemCount * options.videoCount : 0,
  }
}

export function freshStages(options: LaunchOptions, at: number): Record<LaunchStage, LaunchStageState> {
  const off = (enabled: boolean): LaunchStageState => ({ status: enabled ? 'pending' : 'skipped', updatedAt: at })
  return {
    product: off(true),
    images: off(options.images),
    copy: off(options.copy),
    videos: off(options.videos),
    review: off(options.videos),
  }
}

/** 下一步该跑哪一段；前面有失败就停（等用户重跑或跳过） */
export function nextStage(item: LaunchItem): LaunchStage | null {
  for (const stage of LAUNCH_STAGES) {
    const status = item.stages[stage].status
    if (status === 'failed') return null
    if (status === 'pending' || status === 'running') return stage
  }
  return null
}

export function itemStatus(item: LaunchItem): 'running' | 'review' | 'done' | 'failed' {
  const states = LAUNCH_STAGES.map((stage) => item.stages[stage])
  if (states.some((state) => state.status === 'failed')) return 'failed'
  if (states.some((state) => state.status === 'pending' || state.status === 'running')) return 'running'
  return item.stages.review.status === 'done' ? 'review' : 'done'
}

export function jobStatus(job: LaunchJob): LaunchJobStatus {
  const statuses = job.items.map(itemStatus)
  if (statuses.includes('running')) return job.paused ? 'paused' : 'running'
  if (statuses.includes('failed')) return 'failed'
  if (statuses.includes('review')) return 'review'
  return 'done'
}

export function jobCounts(job: LaunchJob) {
  const counts = { running: 0, review: 0, done: 0, failed: 0 }
  for (const item of job.items) counts[itemStatus(item)] += 1
  return counts
}

/** 重跑某一段：它和后面没跳过的都重新排队 */
export function resetFromStage(item: LaunchItem, stage: LaunchStage, at: number) {
  const from = LAUNCH_STAGES.indexOf(stage)
  for (const key of LAUNCH_STAGES.slice(from)) {
    if (item.stages[key].status === 'skipped' && key !== stage) continue
    item.stages[key] = { status: 'pending', updatedAt: at }
  }
}

/** 跳过失败的一段，后面的接着跑。商品建档不能跳 */
export function skipStage(item: LaunchItem, stage: LaunchStage, at: number) {
  if (stage === 'product') return false
  item.stages[stage] = { status: 'skipped', updatedAt: at }
  if (stage === 'videos') item.stages.review = { status: 'skipped', updatedAt: at }
  return true
}

/**
 * 视频参考图：一条视频一张。上架图按顺序取，不够就从头再轮一遍；没有上架图就每条都用原图。
 * 会有重复的路径，交给 tk创意室 前要复制成不同文件（它按路径去重）。
 */
export function videoReferenceImages(item: Pick<LaunchItem, 'images' | 'sourceImagePath'>, count: number) {
  const pool = Array.from(new Set(item.images.filter(Boolean)))
  if (!pool.length && item.sourceImagePath) pool.push(item.sourceImagePath)
  if (!pool.length) return []
  return Array.from({ length: Math.max(1, count) }, (_, index) => pool[index % pool.length])
}

/**
 * 每条视频一种开头拍法，按顺序轮流用，同一个商品的几条视频不会一个样。
 * 只写镜头和动作：不加字幕、不编包装，避免和商品图对不上。
 */
export const LAUNCH_VIDEO_STYLES = [
  { key: 'hero', prompt: 'Opening for this clip: quick push-in on the product as the hero, then a slow turn showing its full shape.' },
  { key: 'detail', prompt: 'Opening for this clip: extreme close-up gliding across the texture and details, then pull back to the whole product.' },
  { key: 'inUse', prompt: 'Opening for this clip: a hand picks up the product and uses it naturally, showing how it is used.' },
  { key: 'lifestyle', prompt: 'Opening for this clip: the product in a real everyday scene, camera glides in slowly from the side.' },
  { key: 'reveal', prompt: 'Opening for this clip: fast whip-pan reveal of the product, then a steady showcase with a soft light sweep.' },
] as const
export type LaunchVideoStyle = (typeof LAUNCH_VIDEO_STYLES)[number]['key']
export const launchVideoStyleAt = (index: number) => LAUNCH_VIDEO_STYLES[index % LAUNCH_VIDEO_STYLES.length]

/** 图生视频只有三种运镜，按顺序轮流用 */
export const LAUNCH_MOTION_STYLES = ['push_in', 'push_out', 'ambient_sway'] as const
export type LaunchMotionStyle = (typeof LAUNCH_MOTION_STYLES)[number]
export const launchMotionAt = (index: number) => LAUNCH_MOTION_STYLES[index % LAUNCH_MOTION_STYLES.length]

/**
 * 各国常见的违禁说法：绝对化用语、医疗功效、虚假承诺。AI 写完先查一遍，命中就让它重写一次，还有就标出来给人看。
 * 只是常见词，不等于平台完整规则。
 */
const BANNED_COMMON = ['100%', 'no.1', 'no 1', '#1', 'guaranteed', 'best seller', 'best-selling', 'cheapest', 'lowest price', 'free shipping', 'cure', 'cures', 'anti-cancer', 'fda approved', 'original brand', 'authentic brand']
const BANNED_BY_MARKET: Record<LaunchMarket, string[]> = {
  VN: ['tốt nhất', 'số 1', 'số một', 'rẻ nhất', 'cam kết 100%', 'chữa bệnh', 'trị bệnh', 'chữa khỏi', 'hàng chính hãng', 'duy nhất', 'đảm bảo'],
  TH: ['ดีที่สุด', 'อันดับ 1', 'อันดับหนึ่ง', 'ถูกที่สุด', 'รักษาโรค', 'รักษาหาย', 'การันตี', 'ของแท้ 100%', 'หนึ่งเดียว'],
  ID: ['terbaik', 'nomor 1', 'nomor satu', 'termurah', 'menyembuhkan', 'obat', 'dijamin', 'asli 100%', 'satu-satunya'],
  MY: ['terbaik', 'nombor 1', 'nombor satu', 'termurah', 'menyembuhkan', 'ubat', 'dijamin', 'tulen 100%', 'satu-satunya'],
  PH: ['best', 'number one', 'pinakamura', 'pinakamaganda', 'gamot'],
  US: ['best', 'number one', 'miracle', 'risk-free'],
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/** 拉丁字母的词要整词命中（best 不会命中 bestow），泰文没有空格只能按片段找 */
function containsTerm(haystack: string, term: string) {
  if (!/[a-z]/i.test(term)) return haystack.includes(term)
  return new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(term)}(?![\\p{L}\\p{N}])`, 'iu').test(haystack)
}

export function findBannedWords(text: string, market: LaunchMarket) {
  const haystack = String(text || '').toLowerCase()
  return Array.from(new Set([...BANNED_COMMON, ...BANNED_BY_MARKET[market]].filter((term) => containsTerm(haystack, term.toLowerCase()))))
}

export function copyBannedWords(copy: Pick<LaunchCopy, 'titles' | 'description'>, market: LaunchMarket) {
  return findBannedWords([...copy.titles, copy.description].join('\n'), market)
}

/**
 * 预计扣点：上架助手每个商品出 1 张分析板 + 5 张图；每条视频先换一次商品（1 张图）。
 * tk创意室 的视频走 TikTok 创意账号的额度；图生视频的视频按视频扣点。不同模型价格不同，给一个区间。
 */
export const LAUNCH_IMAGE_CALLS_PER_PRODUCT = LAUNCH_LISTING_IMAGES + 1
export function launchCostEstimate(input: { products: number; options: LaunchOptions; imagePoints: number[]; videoPoints?: number[] }) {
  const videos = input.options.videos ? input.products * input.options.videoCount : 0
  const imageCalls = (input.options.images ? input.products * LAUNCH_IMAGE_CALLS_PER_PRODUCT : 0) + videos
  const videoCalls = input.options.videoEngine === 'livePhoto' ? videos : 0
  const clean = (values: number[] | undefined) => (values ?? []).filter((value) => Number.isFinite(value) && value >= 0)
  const image = clean(input.imagePoints)
  const video = clean(input.videoPoints)
  if (!image.length || (videoCalls && !video.length)) return { imageCalls, videoCalls, min: null, max: null }
  const range = (pick: (values: number[]) => number) => imageCalls * pick(image) + (videoCalls ? videoCalls * pick(video) : 0)
  return { imageCalls, videoCalls, min: range((values) => Math.min(...values)), max: range((values) => Math.max(...values)) }
}

export function buildLaunchCopyPrompt(input: {
  market: LaunchMarket
  productName: string
  category: string
  price?: string
  sellingPoints?: string
  titleCount: number
  /** 上一版命中的违禁词，重写时让 AI 避开 */
  avoid?: string[]
}) {
  const market = launchMarketOf(input.market)
  return [
    'You are a TikTok Shop listing copywriter.',
    `Write for shoppers in market ${market.code}. Output language: ${market.languageName} (${market.language}).`,
    'Look at the product image carefully. Describe only what is visible; never invent materials, certifications, brands or features.',
    `Product name from the seller (may be in Chinese, only a hint): ${input.productName || 'unknown'}.`,
    `Category: ${input.category || 'general'}.`,
    input.price ? `Price shown to shoppers: ${input.price}.` : '',
    input.sellingPoints ? `Seller notes (translate, keep only what fits the image): ${input.sellingPoints}.` : '',
    `Write ${input.titleCount} different product titles, each under 180 characters, keyword-rich, natural for local shoppers, no emoji, no brand names, no prohibited claims (best, No.1, cure, 100%).`,
    input.avoid?.length ? `Your previous draft used words that TikTok Shop does not allow. Do not use any of these words or their translations: ${input.avoid.join(', ')}.` : '',
    'Then write a product description: 4 to 6 short bullet lines starting with "• " covering look, material that is visible, size or fit, and usage scenes.',
    'Reply with JSON only, no code fence: {"titles": ["..."], "description": "• ...\\n• ..."}',
  ].filter(Boolean).join('\n')
}

/** 解析 AI 回的 JSON；模型偶尔包代码块或多说话，尽量救回来 */
export function parseLaunchCopy(raw: string, titleCount: number): LaunchCopy {
  const text = String(raw || '').trim()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('AI 没有按格式返回标题')
  let data: { titles?: unknown; description?: unknown }
  try {
    data = JSON.parse(text.slice(start, end + 1))
  } catch {
    throw new Error('AI 返回的标题格式不对')
  }
  const titles = (Array.isArray(data.titles) ? data.titles : [])
    .map((title) => String(title ?? '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, titleCount)
  if (!titles.length) throw new Error('AI 没有写出标题')
  const description = String(data.description ?? '').replace(/\r/g, '').trim()
  return { titles, description }
}
