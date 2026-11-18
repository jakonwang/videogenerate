// Creator marketplace search (affiliate "Find creators"): request body and response parsing.
import type { CreatorHubDiscoverQuery, CreatorHubPoolCreator, CreatorHubTopVideo } from '../../../shared/creatorHub'

/** The marketplace rejects pages larger than 20 (code 98001004). */
export const DISCOVER_PAGE_SIZE = 20
export const DISCOVER_MAX_PAGES = 10

export type DiscoverCursor = { page: number; searchKey?: string; nextItemCursor?: number }

/** Platform fields are mostly wrapped as `{ value, is_authorized, status }`; a wrapper without `value` means "not disclosed". */
function val(field: unknown): any {
  if (field && typeof field === 'object' && !Array.isArray(field)) return 'value' in (field as object) ? (field as { value: unknown }).value : undefined
  return field
}
function num(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

export function discoverBody(query: CreatorHubDiscoverQuery, cursor: DiscoverCursor = { page: 0 }) {
  const filter: Record<string, unknown> = {}
  const categories = (query.categoryIds || []).map(String).filter((id) => /^\d+$/.test(id))
  if (categories.length) filter.category_list = categories.map((id) => ({ string_list: [id] }))
  const min = Math.max(0, Math.round(Number(query.followersMin) || 0))
  const max = Math.round(Number(query.followersMax) || 0)
  if (min > 0 || max > 0) filter.follower_filter = { left_bound: min, right_bound: max > min ? max : -1 }
  const groups = (list?: number[], top = 5) => [...new Set((list || []).map(Number).filter((id) => Number.isInteger(id) && id >= 1 && id <= top))]
  const gmv = groups(query.gmvGroups, 5)
  if (gmv.length) filter.gmv_group_v2 = gmv
  const units = groups(query.unitsGroups, 4)
  if (units.length) filter.units_sold_group = units
  if (query.starOnly) filter.is_rising_star = true
  const pagination: Record<string, unknown> = { size: DISCOVER_PAGE_SIZE, page: cursor.page }
  if (cursor.searchKey) pagination.search_key = cursor.searchKey
  if (cursor.nextItemCursor != null) pagination.next_item_cursor = cursor.nextItemCursor
  return { query: String(query.keyword || '').trim().slice(0, 100), pagination, filter_params: filter, algorithm: 1 }
}

function topVideos(raw: unknown): CreatorHubTopVideo[] {
  const list = val(raw)
  if (!Array.isArray(list)) return []
  return list.slice(0, 3).map((item: any) => ({
    itemId: String(item?.item_id || item?.video?.id || ''),
    title: String(item?.name || '').trim().slice(0, 200),
    plays: num(item?.play_cnt) || 0,
    likes: num(item?.like_cnt) || 0,
    comments: num(item?.comment_cnt) || 0,
    postedAt: num(item?.release_date) ? Number(item.release_date) * 1000 : undefined,
    products: Array.isArray(item?.video_products) ? item.video_products.map((product: any) => String(product?.name || '')).filter(Boolean).slice(0, 3) : [],
  })).filter((video) => video.itemId)
}

/** Parses one search page into pool creators (local fields left at their defaults). */
export function parseDiscoverPage(json: any, shopId: string, now = Date.now()) {
  if (Number(json?.code) !== 0) throw new Error(`CREATOR_HUB_API_DISCOVER:${json?.code ?? 'none'} ${String(json?.message || '').slice(0, 80)}`.trim())
  const rows: CreatorHubPoolCreator[] = []
  for (const item of Array.isArray(json?.creator_profile_list) ? json.creator_profile_list : []) {
    const creatorId = String(val(item?.creator_oecuid) || '')
    const handle = String(val(item?.handle) || '')
    if (!creatorId || !handle) continue
    const gpm = val(item?.ec_video_gpm)
    const gender = val(item?.top_follower_gender)
    const engagement = num(val(item?.video_engagement)) ?? num(val(item?.ec_video_engagement))
    const genderShare = Array.isArray(gender) ? num(gender[0]?.value) : undefined
    rows.push({
      id: `${shopId}:${creatorId}`,
      shopId,
      creatorId,
      handle,
      nickname: String(val(item?.nickname) || handle),
      avatar: val(item?.avatar)?.thumb_url_list?.[0] || undefined,
      region: val(item?.selection_region) || undefined,
      followers: num(val(item?.follower_cnt)) || 0,
      level: num(val(item?.creator_level)),
      categories: Array.isArray(val(item?.category)) ? val(item.category).map((cat: any) => String(cat?.name || '')).filter(Boolean) : [],
      gmv: num(val(item?.med_gmv_revenue)?.value),
      gmvRange: val(item?.med_gmv_revenue_range) ? String(val(item.med_gmv_revenue_range)) : undefined,
      videoGmv: num(val(item?.video_gmv)?.value),
      liveGmv: num(val(item?.live_gmv)?.value),
      unitsSold: num(val(item?.units_sold)) || 0,
      avgViews: num(val(item?.ec_video_avg_view_cnt)) || 0,
      medianViews: num(val(item?.ec_video_med_view_cnt)) || 0,
      // Rates come in basis points of a percent: 77 = 0.77%.
      engagementRate: engagement != null ? engagement / 10_000 : undefined,
      liveAvgViewers: num(val(item?.ec_live_avg_uv)) || 0,
      videoGpmMin: num(gpm?.minimal) || undefined,
      videoGpmMax: num(gpm?.maximum) || undefined,
      topGender: Array.isArray(gender) && gender[0]?.key ? { key: String(gender[0].key), share: genderShare != null ? genderShare / 10_000 : undefined } : undefined,
      topAges: Array.isArray(val(item?.top_follower_ages)) ? val(item.top_follower_ages).map(String) : [],
      risingStar: Boolean(val(item?.is_rising_star)),
      invitedIn90d: Boolean(val(item?.has_invited_before_90d)),
      collaborated: Boolean(val(item?.has_collaborated)),
      blockedByShop: Boolean(val(item?.is_creator_blocked_by_shop)),
      topVideos: topVideos(item?.top_video_data),
      starred: false,
      sources: [],
      firstSeenAt: now,
      lastSeenAt: now,
    })
  }
  const next = json?.next_pagination || {}
  const cursor: DiscoverCursor | undefined = next.has_more
    ? { page: num(next.next_page) ?? 0, searchKey: next.search_key ? String(next.search_key) : undefined, nextItemCursor: num(next.next_item_cursor) }
    : undefined
  return { rows, hasMore: Boolean(next.has_more), cursor }
}

/** Creator profile (basic section) request: what the backend creator page loads first. */
export function profileBody(creatorId: string) {
  return { creator_oec_id: String(creatorId), profile_types: [1] }
}

/** Bio and the "creator shared contact info" flag from a profile response. */
export function parseProfile(json: any) {
  if (Number(json?.code) !== 0) throw new Error(`CREATOR_HUB_API_PROFILE:${json?.code ?? 'none'} ${String(json?.message || '').slice(0, 80)}`.trim())
  const profile = json?.creator_profile || {}
  const bio = val(profile.bio)
  return {
    bio: bio != null ? String(bio).slice(0, 500) : undefined,
    contactInfoAvailable: Boolean(val(profile.contact_info_available)),
    handle: val(profile.handle) ? String(val(profile.handle)) : undefined,
  }
}

/** Short human label of a search, kept on each creator it found. */
export function discoverLabel(query: CreatorHubDiscoverQuery, categoryName: (id: string) => string) {
  const parts: string[] = []
  if (query.keyword?.trim()) parts.push(`"${query.keyword.trim().slice(0, 30)}"`)
  if (query.categoryIds?.length) parts.push(query.categoryIds.map(categoryName).join('/'))
  if (query.followersMin || query.followersMax) parts.push(`${query.followersMin || 0}-${query.followersMax || '∞'}`)
  if (query.gmvGroups?.length) parts.push(`GMV#${query.gmvGroups.join(',')}`)
  if (query.unitsGroups?.length) parts.push(`Units#${query.unitsGroups.join(',')}`)
  if (query.starOnly) parts.push('Star')
  return (parts.join(' · ') || 'All').slice(0, 80)
}
