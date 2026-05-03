export type ProductType = 'phone_case' | 'earring'
export type SegmentKey = string

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

export type Product = {
  id: string
  name: string
  type: ProductType
  assets: Record<SegmentKey, MediaAsset[]>
  createdAt: number
  updatedAt: number
}

