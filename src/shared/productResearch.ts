export type ProductResearchDevice = {
  id: string
  name: string
  platform: 'android'
  connected: boolean
  model?: string
  batteryLevel?: number
  pairedAt: number
  lastSeenAt: number
}

/** 商品数据的来源平台。新增平台只需在这里登记，各页面会按来源显示平台名和币种。 */
export const PRODUCT_RESEARCH_SOURCES = {
  douyin: { label: '抖音', currency: 'CNY', color: '#111111', mark: '抖' },
  taobao: { label: '淘宝', currency: 'CNY', color: '#ff5000', mark: '淘' },
  xiaohongshu: { label: '小红书', currency: 'CNY', color: '#ff2442', mark: '书' },
  kuaishou: { label: '快手', currency: 'CNY', color: '#ff4906', mark: '快' },
  pinduoduo: { label: '拼多多', currency: 'CNY', color: '#e02e24', mark: '拼' },
  '1688': { label: '1688', currency: 'CNY', color: '#ff6a00', mark: '16' },
  // 跨境平台各站点币种不同，采集时必须写入 currency
  tiktok: { label: 'TikTok Shop', currency: '', color: '#111111', mark: '♪' },
  shopee: { label: 'Shopee', currency: '', color: '#ee4d2d', mark: 'S' },
} as const

export type ProductResearchSource = keyof typeof PRODUCT_RESEARCH_SOURCES

export const DEFAULT_PRODUCT_RESEARCH_SOURCE: ProductResearchSource = 'douyin'

export function normalizeResearchSource(value: unknown): ProductResearchSource | undefined {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(PRODUCT_RESEARCH_SOURCES, value)
    ? (value as ProductResearchSource)
    : undefined
}

export function researchSourceOf(item: { source?: string }): ProductResearchSource {
  return normalizeResearchSource(item.source) || DEFAULT_PRODUCT_RESEARCH_SOURCE
}

/** 价格币种；空字符串表示未知，界面不显示货币符号。 */
export function researchCurrencyOf(item: { source?: string; currency?: string }): string {
  return (item.currency || '').toUpperCase() || PRODUCT_RESEARCH_SOURCES[researchSourceOf(item)].currency
}

export type ProductResearchTaskStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'

export type ProductResearchTask = {
  id: string
  schemeId?: string
  keyword: string
  /** 采集平台，缺省为抖音（旧数据） */
  source?: ProductResearchSource
  sort: 'comprehensive' | 'sales'
  targetCount: number
  status: ProductResearchTaskStatus
  deviceId?: string
  collectedCount: number
  createdAt: number
  dispatchedAt?: number
  startedAt?: number
  completedAt?: number
  error?: string
}

export type ProductResearchResult = {
  id: string
  taskId: string
  schemeId?: string
  keyword: string
  /** 来源平台，缺省为抖音（旧数据） */
  source?: ProductResearchSource
  /** 价格币种（ISO 代码），缺省取来源平台的币种；与方案的目标市场无关 */
  currency?: string
  title: string
  priceText: string
  priceValue?: number
  salesText: string
  salesValue?: number
  shopName: string
  rating?: number
  productUrl?: string
  productId?: string
  rank: number
  imageDataUrl?: string
  imagePath?: string
  capturedAt: number
  confidence: number
}

export type ProductResearchPairing = {
  qrDataUrl: string
  endpoint: string
  /** 电脑所有局域网地址（多网卡 / 开了 VPN 时手机挨个试），第一个与 endpoint 相同 */
  endpoints?: string[]
  pairingCode: string
  expiresAt: number
}

/** Windows 防火墙是否放行了手机连接端口 */
export type ProductResearchFirewall = { supported: boolean; allowed: boolean }

export type ProductResearchSnapshot = {
  serverRunning: boolean
  endpoint: string
  endpoints?: string[]
  devices: ProductResearchDevice[]
  tasks: ProductResearchTask[]
  results: ProductResearchResult[]
}

export type ProductResearchSchemeStatus = 'draft' | 'active' | 'pending' | 'completed'

export type ProductResearchScheme = {
  id: string
  name: string
  need: string
  market: string
  note?: string
  starred?: boolean
  category?: string
  status: ProductResearchSchemeStatus
  sopStage: number
  keywordCount: number
  resultCount: number
  candidateCount: number
  createdAt: number
  updatedAt: number
}

export type ProductResearchKeyword = {
  id: string
  value: string
  status: 'pending' | 'collected' | 'running' | 'failed'
}

export type ProductResearchProductEdit = {
  resultId: string
  /** 款号 */
  code?: string
  kept: boolean
  category: string
  targetPrice: string
  sellingPoint: string
}

export type ProductResearchLiveTestRecord = {
  id: string
  schemeId: string
  resultId: string
  sessions: number
  views: number
  clicks: number
  orders: number
  revenue: number
  refundRate: number
  hostFeedback: string
  conclusion: 'excellent' | 'potential' | 'observe' | 'eliminate' | ''
  /** 上次从直播后台自动填的值；某一项和它不同就是人工改过，不再覆盖 */
  auto?: { sessions: number; views: number; clicks: number; orders: number; revenue: number; at: number }
  updatedAt: number
}

export type ProductResearchSchemeState = {
  keywords: ProductResearchKeyword[]
  candidateIds: string[]
  productEdits: ProductResearchProductEdit[]
  liveTestRecords: ProductResearchLiveTestRecord[]
}
