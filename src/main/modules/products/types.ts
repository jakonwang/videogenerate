import type { ProductCategory } from '../../../shared/productCategories'

/** 常用分类，或用户自己填的分类 */
export type ProductType = ProductCategory
export type SegmentKey = string
export type ProductCanonicalSourceStatus = 'idle' | 'processing' | 'done' | 'failed'
export type ProductStoryboardTemplateType = 'general' | 'jewelry' | 'ecommerce_packaging' | 'lifestyle_interaction'

export type MediaAsset = {
  id: string
  filePath: string
  fileName: string
  fileSize: number
  durationSec: number
  width?: number
  height?: number
  fps?: number
  bitRate?: number
  qualityScore?: number // 0~100
  qualityIssues?: string[] // 简短原因列表
  thumbnailPath?: string | null
  thumbnailDataUrl?: string | null
  createdAt: number
}

export type ProductCanonicalSourceDiagnostic = {
  originalPath: string
  sanitizedPath?: string
  status: 'kept' | 'sanitized' | 'failed'
  note?: string
  prompt?: string
  fallbackToOriginal?: boolean
}

export type ProductImageAsset = {
  id: string
  productId: string
  filePath: string
  fileName: string
  fileSize: number
  width?: number
  height?: number
  thumbnailPath?: string | null
  createdAt: number
  updatedAt: number
  isCover?: boolean
}

export type Product = {
  id: string
  name: string
  type: ProductType
  storyboardTemplateType?: ProductStoryboardTemplateType
  assets: Record<SegmentKey, MediaAsset[]>
  images?: ProductImageAsset[]
  coverImagePath?: string
  livePhotoReferenceImagePath?: string
  remark?: string
  /** 款号（统一写法，如 A-152）：和选品、店铺商品、订单、库存关联，见 src/shared/productCode.ts */
  code?: string
  /** 爆款类型（人工），如 大爆款、畅销款 */
  hotType?: string
  /** TikTok Shop product ids this library product is sold as. Joins ads (GMV Max) and creator data to the product. */
  tiktokProductIds?: string[]
  analysisBoardPath?: string
  analysisBoardStatus?: ProductCanonicalSourceStatus
  analysisBoardPrompt?: string
  analysisBoardDiagnostics?: ProductCanonicalSourceDiagnostic[]
  analysisBoardUpdatedAt?: number
  analysisSourceSignature?: string
  canonicalSourcePath?: string
  canonicalSourceStatus?: ProductCanonicalSourceStatus
  canonicalSourcePrompt?: string
  canonicalSourceDiagnostics?: ProductCanonicalSourceDiagnostic[]
  canonicalSourceUpdatedAt?: number
  canonicalSourceSourceSignature?: string
  productAnalysis?: {
    category: string
    summary: string
    coreSubject: string
    connectionStructure: string
    materialDetails: string
    wearingPosition: string
    surfaceDetails: string
    colorDetails: string
    geometryDetails: string
    sizeScale: string
    matchingRules: string[]
    rawDescription: string
    updatedAt: number
  }
  createdAt: number
  updatedAt: number
}
