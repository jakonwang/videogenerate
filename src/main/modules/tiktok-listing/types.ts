export type TiktokListingCategory = 'earring' | 'ring' | 'necklace' | 'phone_case' | 'bracelet'
export type TiktokListingLanguage = 'zh-CN' | 'en-US' | 'vi-VN'
export type TiktokListingGenerationStatus = 'idle' | 'generating' | 'done' | 'failed'

export type TiktokListingExportCategoryConfig = {
  category: TiktokListingCategory
  categoryId: string
  productAttributes: string
}

export type TiktokListingImage = {
  id: string
  filePath: string
  fileName: string
  publicUrl?: string
  createdAt: number
}

export type TiktokListingItem = {
  id: string
  sourceImagePath: string
  referenceImagePaths: string[]
  category: TiktokListingCategory
  sku: string
  localDisplayPrice: string
  titleLanguage: TiktokListingLanguage
  generatedTitle?: string
  generatedDescription?: string
  analysisBoardImage?: TiktokListingImage
  listingImages: TiktokListingImage[]
  generationStatus: TiktokListingGenerationStatus
  generationError?: string
  generatedAt?: number
  createdAt: number
  updatedAt: number
}
