/**
 * Plain-language wording for sync problems and data freshness in 店铺 / 销售与库存. Every
 * technical error code becomes one sentence that says what happened and what to do next.
 */
import type { SiSyncStage } from './sellerInventory'

type Lang = 'zh' | 'en' | 'vi'

function lang(locale: string): Lang {
  return locale.startsWith('zh') ? 'zh' : locale.startsWith('vi') ? 'vi' : 'en'
}

const STAGE: Record<Lang, Record<SiSyncStage, string>> = {
  zh: { account: '店铺账号', shopDaily: '店铺每日数据', health: '店铺健康', products: '商品和库存', orders: '订单', compass: '商品销量历史', finance: '结算数据' },
  en: { account: 'shop account', shopDaily: 'daily shop data', health: 'shop health', products: 'products and stock', orders: 'orders', compass: 'SKU sales history', finance: 'settlements' },
  vi: { account: 'tài khoản cửa hàng', shopDaily: 'số liệu theo ngày', health: 'sức khỏe cửa hàng', products: 'sản phẩm và tồn kho', orders: 'đơn hàng', compass: 'lịch sử bán SKU', finance: 'dữ liệu quyết toán' },
}

/** What a missing step means for the numbers on screen. */
const IMPACT: Record<Lang, Partial<Record<SiSyncStage, string>>> = {
  zh: { finance: '利润可能不准', orders: '今天的销量可能不全', products: '库存可能不是最新', compass: '较早日期的销量可能不全', health: '店铺健康不是最新', shopDaily: '店铺数字不是最新' },
  en: { finance: 'profit may be off', orders: "today's sales may be incomplete", products: 'stock may be out of date', compass: 'older daily sales may be incomplete', health: 'shop health is not current', shopDaily: 'shop numbers are not current' },
  vi: { finance: 'lợi nhuận có thể chưa đúng', orders: 'doanh số hôm nay có thể chưa đủ', products: 'tồn kho có thể chưa mới', compass: 'doanh số các ngày cũ có thể chưa đủ', health: 'sức khỏe cửa hàng chưa mới', shopDaily: 'số liệu cửa hàng chưa mới' },
}

const TEXT: Record<Lang, Record<string, string>> = {
  zh: {
    login: '商家后台登录已失效。到「店铺 → 账号」粘贴新的 Cookie，或点「登录商家后台」重新登录，然后再同步。',
    account: '没找到这个登录对应的店铺。请确认导入的是这个店铺自己的商家后台登录。',
    network: '网络不稳定，没连上 TikTok 后台。软件会自动再试，也可以稍后手动同步。',
    busy: 'TikTok 后台说访问太频繁了，过一会儿会自动再试。',
    server: 'TikTok 后台暂时出错了，过一会儿会自动再试。',
    badData: 'TikTok 后台返回的数据不完整，过一会儿会自动再试。',
    window: '同步用的后台窗口被关掉了，请重新同步。',
    rejected: 'TikTok 后台拒绝了这次读取，过一会儿会自动再试。',
    running: '正在同步，请稍等，完成后会自动刷新。',
    unknown: '同步时遇到问题，过一会儿会自动再试。',
    partial: '{stage}没有更新（{reason}），{impact}；其它数据已更新。',
    partialShort: '{stage}没更新',
    justNow: '刚刚更新',
    updated: '{time}更新',
    stale: '数据已经 {hours} 小时没更新',
    never: '还没同步过',
  },
  en: {
    login: 'The Seller Center login has expired. Paste new cookies under Shops → Accounts, or log in to Seller Center, then sync again.',
    account: "No shop matches this login. Make sure the cookies come from this shop's own Seller Center.",
    network: 'The network is unstable and TikTok could not be reached. The app will retry; you can also sync later.',
    busy: 'TikTok says there were too many requests. The app will retry shortly.',
    server: 'TikTok Seller Center had a temporary error. The app will retry shortly.',
    badData: 'TikTok sent incomplete data. The app will retry shortly.',
    window: 'The sync window was closed. Please sync again.',
    rejected: 'TikTok refused this request. The app will retry shortly.',
    running: 'Syncing; the page refreshes when it is done.',
    unknown: 'Something went wrong while syncing. The app will retry shortly.',
    partial: '{stage} was not updated ({reason}); {impact}. Everything else is up to date.',
    partialShort: '{stage} not updated',
    justNow: 'Updated just now',
    updated: 'Updated {time}',
    stale: 'Data is {hours} hours old',
    never: 'Never synced',
  },
  vi: {
    login: 'Đăng nhập Seller Center đã hết hạn. Dán cookie mới ở Cửa hàng → Tài khoản hoặc đăng nhập lại, rồi đồng bộ.',
    account: 'Không tìm thấy cửa hàng cho đăng nhập này. Hãy dùng cookie từ Seller Center của chính cửa hàng này.',
    network: 'Mạng không ổn định, chưa kết nối được TikTok. Ứng dụng sẽ tự thử lại.',
    busy: 'TikTok báo truy cập quá nhiều, ứng dụng sẽ tự thử lại sau.',
    server: 'Seller Center tạm thời gặp lỗi, ứng dụng sẽ tự thử lại sau.',
    badData: 'TikTok trả về dữ liệu chưa đầy đủ, ứng dụng sẽ tự thử lại sau.',
    window: 'Cửa sổ đồng bộ đã bị đóng, hãy đồng bộ lại.',
    rejected: 'TikTok từ chối yêu cầu này, ứng dụng sẽ tự thử lại sau.',
    running: 'Đang đồng bộ, trang sẽ tự làm mới khi xong.',
    unknown: 'Đồng bộ gặp sự cố, ứng dụng sẽ tự thử lại sau.',
    partial: '{stage} chưa cập nhật ({reason}); {impact}. Phần còn lại đã cập nhật.',
    partialShort: '{stage} chưa cập nhật',
    justNow: 'Vừa cập nhật',
    updated: 'Cập nhật {time}',
    stale: 'Dữ liệu đã {hours} giờ chưa cập nhật',
    never: 'Chưa đồng bộ',
  },
}

function fill(template: string, params: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(params[key] ?? ''))
}

/** Kind of problem behind a raw error message from the sync. */
export function syncErrorKind(raw: unknown) {
  const text = String((raw as Error)?.message ?? raw ?? '')
  if (/LOGIN/.test(text)) return 'login'
  if (/SELLER_ACCOUNT_NOT_FOUND/.test(text)) return 'account'
  if (/SELLER_API_HTTP_(0|-1)\b|timeout|timed out|net::|network|Failed to fetch|aborted/i.test(text)) return 'network'
  if (/HTTP_429/.test(text)) return 'busy'
  if (/HTTP_5\d\d/.test(text)) return 'server'
  if (/BAD_JSON/.test(text)) return 'badData'
  if (/WINDOW_CLOSED/.test(text)) return 'window'
  if (/SYNC_RUNNING/.test(text)) return 'running'
  if (/code=/.test(text)) return 'rejected'
  return 'unknown'
}

/** One sentence for a sync error: what happened and what happens next. */
export function friendlySyncError(raw: unknown, locale: string) {
  return TEXT[lang(locale)][syncErrorKind(raw)]
}

/** A step that failed while the rest of the sync succeeded. */
export function friendlyStageError(stage: SiSyncStage, raw: unknown, locale: string, short = false) {
  const l = lang(locale)
  const kind = syncErrorKind(raw)
  const reason = { network: { zh: '网络不稳定', en: 'unstable network', vi: 'mạng không ổn định' }, busy: { zh: '后台繁忙', en: 'TikTok busy', vi: 'TikTok bận' }, server: { zh: '后台出错', en: 'TikTok error', vi: 'lỗi TikTok' } }[kind as 'network']?.[l]
    ?? { zh: '后台暂时没返回', en: 'TikTok did not answer', vi: 'TikTok chưa trả lời' }[l]
  if (short) return fill(TEXT[l].partialShort, { stage: STAGE[l][stage] })
  return fill(TEXT[l].partial, { stage: STAGE[l][stage], reason, impact: IMPACT[l][stage] || '' })
}

/** "Updated 5 minutes ago", or a warning once data is older than `staleHours`. */
export function freshnessText(lastSyncAt: number | undefined, now: number, locale: string, staleHours = 3) {
  const l = lang(locale)
  if (!lastSyncAt) return { text: TEXT[l].never, stale: true }
  const minutes = Math.max(0, Math.round((now - lastSyncAt) / 60_000))
  if (minutes >= staleHours * 60) return { text: fill(TEXT[l].stale, { hours: Math.floor(minutes / 60) }), stale: true }
  if (minutes < 1) return { text: TEXT[l].justNow, stale: false }
  const relative = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  const time = minutes < 60 ? relative.format(-minutes, 'minute') : relative.format(-Math.round(minutes / 60), 'hour')
  return { text: fill(TEXT[l].updated, { time }), stale: false }
}
