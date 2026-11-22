/**
 * GeeLark 云手机发布通道（主进程和界面共用）。
 * 每台云手机在每个开启的平台上算一个「发布账号」，账号 uid = geelark:<云手机ID>:<平台>，
 * 这样矩阵分发、账号规则、利润都能直接用。
 */
export type GeelarkPlatform = 'tiktok' | 'youtube' | 'instagram' | 'facebook'

export const GEELARK_PLATFORMS: Record<GeelarkPlatform, { label: string; short: string }> = {
  tiktok: { label: 'TikTok', short: 'TikTok' },
  youtube: { label: 'YouTube Shorts', short: 'YouTube' },
  instagram: { label: 'Instagram Reels', short: 'Instagram' },
  facebook: { label: 'Facebook Reels', short: 'Facebook' },
}
export const GEELARK_PLATFORM_KEYS = Object.keys(GEELARK_PLATFORMS) as GeelarkPlatform[]

const PREFIX = 'geelark:'
export function geelarkAccountUid(phoneId: string, platform: GeelarkPlatform) {
  return `${PREFIX}${phoneId}:${platform}`
}
export function parseGeelarkAccountUid(uid?: string): { phoneId: string; platform: GeelarkPlatform } | null {
  const text = String(uid || '')
  if (!text.startsWith(PREFIX)) return null
  const [phoneId, platform] = text.slice(PREFIX.length).split(':')
  if (!phoneId || !platform || !(platform in GEELARK_PLATFORMS)) return null
  return { phoneId, platform: platform as GeelarkPlatform }
}
export function isGeelarkAccount(uid?: string) {
  return Boolean(parseGeelarkAccountUid(uid))
}

/** GeeLark 任务状态：1 等待 2 执行中 3 完成 4 失败 7 取消 */
export function geelarkTaskState(status: unknown): 'scheduled' | 'publishing' | 'published' | 'failed' | 'cancelled' | null {
  const code = Number(status)
  if (code === 1) return 'scheduled'
  if (code === 2) return 'publishing'
  if (code === 3) return 'published'
  if (code === 4) return 'failed'
  if (code === 7) return 'cancelled'
  return null
}

const FAIL_HINTS: Record<number, string> = {
  20002: '云手机正在执行别的任务，稍后重试（矩阵里把这台手机的两条间隔调大一些）',
  20003: '执行超时，请到 App 里看看是否已经发出去了',
  20005: '任务被取消了',
  20006: '同样的任务被取消了',
  20007: '这台云手机不支持这个任务类型',
  20008: 'App 语言被改过，要把 App 语言改回英文再重试',
  20100: '云手机没有网络，检查代理',
  20101: '代理参数错误，检查这台云手机的代理设置',
}
/** 手填商品 ID 时商品列表里显示的名字（不能当商品链接文字发出去） */
export const MANUAL_PRODUCT_TITLE_PREFIX = '商品 ID '
export function isManualProductTitle(title?: string) {
  return String(title || '').startsWith(MANUAL_PRODUCT_TITLE_PREFIX)
}

/**
 * 云手机账号的商品列表：没有 CreatOK 的店铺商品接口，就用软件已知的 TikTok Shop 商品
 * （投放、达人、发布记录、商品库绑定），按名称 / ID 搜；搜的是一串商品 ID 而列表里没有，就让用户直接用这个 ID。
 */
export function filterKnownProducts<T extends { id: string; title: string }>(products: T[], query?: string, limit = 100): Array<T | { id: string; title: string; imageUrl?: string; manual: true }> {
  const q = String(query || '').trim().toLowerCase()
  const hits = q ? products.filter((item) => item.id.toLowerCase().includes(q) || item.title.toLowerCase().includes(q)) : products
  const out: Array<T | { id: string; title: string; imageUrl?: string; manual: true }> = hits.slice(0, limit)
  const typedId = String(query || '').trim()
  if (/^\d{10,25}$/.test(typedId) && !products.some((item) => item.id === typedId)) out.unshift({ id: typedId, title: `${MANUAL_PRODUCT_TITLE_PREFIX}${typedId}`, manual: true })
  return out
}

export function geelarkFailText(code?: number, desc?: string) {
  const hint = code ? FAIL_HINTS[code] : ''
  return [hint, desc && desc !== hint ? desc : ''].filter(Boolean).join('：') || '云手机发布失败'
}
