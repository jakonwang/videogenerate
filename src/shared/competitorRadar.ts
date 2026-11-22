/**
 * 竞品爆款雷达：盯住几个竞品 / 对标 TikTok 账号，定时拉它们最近的视频，
 * 哪条突然跑得比它平时好很多就提醒，并能一键下载原视频照着复刻。
 * 数据来自 TikHub（和「视频解析下载」同一个密钥 / 云端代理）。
 */

/** 雷达用到的 TikHub 接口（云端代理要放行，路径小写） */
export const TIKHUB_RADAR_PATHS = ['/api/v1/tiktok/web/fetch_user_profile', '/api/v1/tiktok/app/v3/fetch_user_post_videos'] as const

export type RadarCompetitor = { handle: string; note?: string; secUid?: string; nickname?: string; followers?: number; addedAt: number; lastCheckedAt?: number; error?: string }

export type RadarVideo = {
  id: string
  handle: string
  desc: string
  createdAt: number
  plays: number
  likes: number
  comments: number
  shares: number
  cover?: string
}

export type RadarBreakout = RadarVideo & {
  /** 是这个账号平时播放（中位数）的几倍 */
  multiple: number
  baseline: number
  firstSeenAt: number
  dismissed?: boolean
}

export function normalizeHandle(input: string) {
  const text = String(input || '').trim()
  const fromUrl = text.match(/tiktok\.com\/@([A-Za-z0-9._]+)/i)?.[1]
  const handle = (fromUrl || text).replace(/^@/, '').trim()
  return /^[A-Za-z0-9._]{2,24}$/.test(handle) ? handle.toLowerCase() : ''
}

export function videoUrl(video: Pick<RadarVideo, 'handle' | 'id'>) {
  return `https://www.tiktok.com/@${video.handle}/video/${video.id}`
}

const num = (value: unknown) => {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : 0
}

/** TikHub「用户作品」返回 → 视频列表（字段名在不同版本里略有差别，都兼容） */
export function parseTikhubPosts(payload: any, handle: string): RadarVideo[] {
  const data = payload?.data ?? payload
  const list: any[] = data?.aweme_list || data?.awemeList || data?.itemList || data?.items || []
  return list.map((item) => {
    const stats = item?.statistics || item?.stats || {}
    const cover = item?.video?.cover?.url_list?.[0] || item?.video?.origin_cover?.url_list?.[0] || item?.video?.cover || ''
    return {
      id: String(item?.aweme_id || item?.id || '').trim(),
      handle: String(item?.author?.unique_id || item?.author?.uniqueId || handle).toLowerCase(),
      desc: String(item?.desc || '').trim().slice(0, 300),
      createdAt: num(item?.create_time || item?.createTime) * 1000,
      plays: num(stats.play_count ?? stats.playCount),
      likes: num(stats.digg_count ?? stats.diggCount),
      comments: num(stats.comment_count ?? stats.commentCount),
      shares: num(stats.share_count ?? stats.shareCount),
      ...(typeof cover === 'string' && cover ? { cover } : {}),
    }
  }).filter((video) => /^\d{8,25}$/.test(video.id))
}

export function parseTikhubProfile(payload: any): { secUid?: string; nickname?: string; followers?: number } {
  const info = payload?.data?.userInfo || payload?.userInfo || payload?.data || {}
  const user = info?.user || {}
  const stats = info?.stats || info?.statsV2 || {}
  return {
    ...(user.secUid ? { secUid: String(user.secUid) } : {}),
    ...(user.nickname ? { nickname: String(user.nickname) } : {}),
    ...(num(stats.followerCount) ? { followers: num(stats.followerCount) } : {}),
  }
}

export const BREAKOUT_RULES = { maxAgeDays: 7, minPlays: 10_000, multiple: 3 }

function median(values: number[]) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

/**
 * 爆款：近 7 天发的、播放 ≥1 万、且 ≥ 这个账号其他视频播放中位数的 3 倍。
 * 账号视频少于 4 条时没法判断「平时」，不报。
 */
export function detectBreakouts(videos: RadarVideo[], now: number, rules = BREAKOUT_RULES): Array<RadarVideo & { multiple: number; baseline: number }> {
  const byHandle = new Map<string, RadarVideo[]>()
  for (const video of videos) byHandle.set(video.handle, [...(byHandle.get(video.handle) || []), video])
  const out: Array<RadarVideo & { multiple: number; baseline: number }> = []
  for (const list of byHandle.values()) {
    if (list.length < 4) continue
    for (const video of list) {
      if (now - video.createdAt > rules.maxAgeDays * 86_400_000 || video.plays < rules.minPlays) continue
      const baseline = median(list.filter((other) => other.id !== video.id).map((other) => other.plays))
      if (baseline <= 0) continue
      const multiple = video.plays / baseline
      if (multiple >= rules.multiple) out.push({ ...video, baseline: Math.round(baseline), multiple: Math.round(multiple * 10) / 10 })
    }
  }
  return out.sort((a, b) => b.multiple - a.multiple)
}

export function formatCount(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (value >= 10_000) return `${(value / 1000).toFixed(0)}K`
  if (value >= 1000) return `${(value / 1000).toFixed(1).replace(/\.0$/, '')}K`
  return String(Math.round(value))
}
