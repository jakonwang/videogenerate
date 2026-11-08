export type ProductReplacementStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled'

export type ProductReplacementItem = {
  id: string
  sourcePath: string
  sourceName: string
  status: ProductReplacementStatus
  variantIndex: number
  outputPath?: string
  assetId?: string
  exportedAt?: number
  error?: string
  updatedAt: number
}

export type ProductReplacementBatch = {
  id: string
  status: 'queued' | 'processing' | 'paused' | 'completed' | 'partial_failed' | 'failed' | 'cancelled'
  productName: string
  productId?: string
  productImagePaths: string[]
  promptVersionId: string
  promptVersion: number
  promptHash: string
  prompt: string
  modelSnapshot: { provider: string; model: string }
  variantCount: number
  items: ProductReplacementItem[]
  createdAt: number
  updatedAt: number
}

export type ProductReplacementPromptVersion = {
  id: string
  name: string
  version: number
  prompt: string
  promptHash: string
  active: boolean
  createdAt: number
  updatedAt: number
}
