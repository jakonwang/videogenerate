import type { SyncFileRef } from '@shared/cloud/sync'
import { uploadImage } from './files'

/** 换景用的图要保细节：最长边 2048、高质量（和云端处理的尺寸一致） */
export const uploadSceneImage = (file: Blob): Promise<SyncFileRef> => uploadImage(file, { maxEdge: 2048, quality: 0.95 })
