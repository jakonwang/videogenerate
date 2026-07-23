export type VideoParserPlatform = 'tiktok'

export type VideoParserDownloadStatus = 'processing' | 'completed' | 'failed'

export type VideoParserUsedStatus = 'unused' | 'used'

export type VideoParserDownloadItem = {
  id: string
  userId: string
  shareUrl: string
  videoId: string
  platform: VideoParserPlatform
  title?: string
  author?: string
  coverUrl?: string
  downloadUrl?: string
  localVideoPath?: string
  thumbnailPath?: string
  status: VideoParserDownloadStatus
  error?: string
  usedStatus: VideoParserUsedStatus
  createdAt: number
  updatedAt: number
}

export type VideoParserDownloadDb = {
  items: VideoParserDownloadItem[]
}
