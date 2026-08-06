export const DIANXIAOMI_INVENTORY_SCHEMA_VERSION = 2

export type InventoryRisk = 'not_synced' | 'out_of_stock' | 'reorder' | 'healthy' | 'no_sales'

export type InventorySku = {
  id: string
  sku: string
  imageUrl?: string
  imageFallbackUrl?: string
  baselineDate: string
  baselineStock: number
  forecastWindowDays: number
  warningDays: number
  createdAt: number
  updatedAt: number
  lastSyncAt?: number
  lastSyncError?: string
}

export type InventoryBaselineChange = {
  id: string
  skuId: string
  previousDate: string
  previousStock: number
  nextDate: string
  nextStock: number
  changedAt: number
}

export type InventoryDailyShipment = {
  id: string
  skuId: string
  date: string
  quantity: number
  orderCount: number
  syncedAt: number
}

export type InventorySyncRun = {
  id: string
  startedAt: number
  finishedAt: number
  skuIds: string[]
  syncedSkuIds: string[]
  failed: Array<{ skuId: string; message: string }>
}

export type InventoryDb = {
  version: number
  skus: InventorySku[]
  baselineChanges: InventoryBaselineChange[]
  shipments: InventoryDailyShipment[]
  syncRuns: InventorySyncRun[]
}

export type SaveInventorySkuInput = {
  id?: string
  sku: string
  baselineDate: string
  baselineStock: number
  forecastWindowDays?: number
  warningDays?: number
}

export type InventorySkuSummary = InventorySku & {
  currentStock: number
  totalShipmentQuantity: number
  windowShipmentQuantity: number
  averageDaily: number
  daysToStockout?: number
  risk: InventoryRisk
  analysisStartDate: string
  analysisEndDate: string
  availableDays: number
}

export type InventoryDashboard = {
  items: InventorySkuSummary[]
  auth: InventoryAuthStatus
  summary: {
    skuCount: number
    outOfStockCount: number
    reorderCount: number
    windowShipmentQuantity: number
    lastSyncAt?: number
  }
}

export type InventoryDetail = {
  sku: InventorySkuSummary
  shipments: InventoryDailyShipment[]
  baselineChanges: InventoryBaselineChange[]
}

export type InventoryAuthStatus = {
  available: boolean
  authenticated: boolean
  checkedAt: number
  message?: string
}

export type InventorySyncResult = {
  ok: boolean
  authRequired: boolean
  syncedSkuIds: string[]
  failed: Array<{ skuId: string; message: string }>
  syncedAt?: number
}

export type DianxiaomiSearchPayload = {
  searchTypes: string
  contents: string
  orderAdvSearchType: number
  state: string
  isVoided: string
  isRemoved: string
  commitPlatforms: string
  isOversea: string
  shopId: string
  platform: string
  orderField: string
  isDesc: string
  timeOut: string
  warehouseCode: string
  isGreen: string
  isYellow: string
  isOrange: string
  isRed: string
  isViolet: string
  isBlue: string
  cornflowerBlue: string
  pink: string
  teal: string
  turquoise: string
  unmarked: string
  shippedStart: string
  shippedEnd: string
  pageNo: number
  pageSize: number
  history: string
  authId: string
  days: string
  isPrintJh: string
  isPrintJhTemp: string
  isPrintMd: string
  signPriorShip: string
  isHasOrderMessage: string
  isHasOrderComment: string
  isHasServiceComment: string
  isHasPickComment: string
  forbiddenStatus: string
  forbiddenReason: string
  pickingInstructions: string
  priceStart: string
  priceEnd: string
  orderCreateStart: string
  orderCreateEnd: string
  orderPayStart: string
  orderPayEnd: string
  applyTimeStart: string
  applyTimeEnd: string
  refundedStart: string
  refundedEnd: string
  mdSignStart: string
  mdSignEnd: string
  jhSignStart: string
  jhSignEnd: string
  timeOutQuery: string
  productCountStart: string
  productCountEnd: string
  storageIds: string
  storageId: string
  country: string
  globalCollection: string
  platformOrderStatus: string
  productStatus: string
}

export type ParsedShipmentLine = {
  sku: string
  imageUrl?: string
  imageFallbackUrl?: string
  date: string
  quantity: number
  orderKey: string
  lineKey?: string
}
