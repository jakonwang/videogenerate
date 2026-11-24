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

export type ProductResearchTaskStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'

export type ProductResearchTask = {
  id: string
  schemeId?: string
  keyword: string
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
  updatedAt: number
}

export type ProductResearchSchemeState = {
  keywords: ProductResearchKeyword[]
  candidateIds: string[]
  productEdits: ProductResearchProductEdit[]
  liveTestRecords: ProductResearchLiveTestRecord[]
}
