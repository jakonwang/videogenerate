export type LibraryAsset = {
  id: string
  name: string
  fileName: string
  filePath: string
  type: 'image' | 'video'
  mimeType: string
  size: number
  source: 'desktop' | 'mobile'
  createdAt: number
  folderId?: string | null
  deletedAt?: number
  originalFolderId?: string | null
  pluginUsage?: Record<string, 'used' | 'unused'>
  qiniuUrl?: string
  qiniuError?: string
}

export type AssetFolder = {
  id: string
  name: string
  parentId: string | null
  createdAt: number
  updatedAt: number
  deletedAt?: number
  originalParentId?: string | null
}

export type AssetLibraryTrash = {
  assets: LibraryAsset[]
  folders: AssetFolder[]
}

export type AssetLibraryAudit = {
  missingAssetIds: string[]
  orphanAssetIds: string[]
  orphanFolderIds: string[]
  repaired: boolean
}

export type AssetLibraryIndex = {
  assets: LibraryAsset[]
  folders: AssetFolder[]
}

export type AssetImageEditInput = {
  crop?: { left: number; top: number; width: number; height: number }
  resize?: { width: number; height: number; fit?: 'contain' | 'cover' | 'fill' }
  removeWatermark?: { left: number; top: number; width: number; height: number; blur?: number }
}
