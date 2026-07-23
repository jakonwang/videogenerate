export type ProductImageMaterialCategory = 'necklace' | 'ring' | 'earring' | 'bracelet'

export type ProductImageMaterialUsageStatus = 'unused' | 'used'

export type ProductImageMaterialBatchStatus = 'queued' | 'processing' | 'completed' | 'partial_failed' | 'failed'

export type ProductImageMaterialSourceStatus = 'queued' | 'processing' | 'completed' | 'failed'

export type ProductImageMaterialSourceItem = {
  id: string
  sourceVideoPath: string
  sourceVideoName: string
  parserVideoId?: string
  status: ProductImageMaterialSourceStatus
  generatedCount: number
  skippedCount: number
  error?: string
  startedAt?: number
  completedAt?: number
  updatedAt: number
}

export type ProductImageMaterialItem = {
  id: string
  userId: string
  batchId: string
  category: ProductImageMaterialCategory
  sourceVideoPath: string
  sourceVideoName: string
  segmentIndex: number
  segmentPath: string
  frameTimeSec: number
  localImagePath: string
  thumbnailPath?: string
  qiniuUrl: string
  materialOrigin?: 'original' | 'derived'
  derivedFromMaterialId?: string
  derivedVariantIndex?: number
  usageStatus: ProductImageMaterialUsageStatus
  boundProductId?: string
  createdAt: number
  updatedAt: number
}

export type ProductImageMaterialBatch = {
  id: string
  userId: string
  category: ProductImageMaterialCategory
  status: ProductImageMaterialBatchStatus
  segmentTimeSec: number
  sourceItems: ProductImageMaterialSourceItem[]
  totalVideos: number
  completedVideos: number
  failedVideos: number
  generatedImageCount: number
  currentSourceVideoPath?: string
  lastError?: string
  createdAt: number
  updatedAt: number
}

export type ProductImageMaterialDb = {
  batches: ProductImageMaterialBatch[]
  materials: ProductImageMaterialItem[]
}

export type ProductImageMaterialListFilters = {
  category?: ProductImageMaterialCategory | 'all'
  usageStatus?: ProductImageMaterialUsageStatus | 'all'
  boundProductId?: string
}

export type ProductImageMaterialProductSummary = {
  id: string
  name: string
  type: string
  coverImagePath?: string
}

export type ProductImageMaterialHermesOption = {
  id: string
  index: number
  category: ProductImageMaterialCategory
  thumbnailUrl: string
  materialOrigin?: 'original' | 'derived'
  boundProductId?: string
  localImagePath: string
  derivedFromMaterialId?: string
}
