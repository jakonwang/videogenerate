import { registerPlugin } from '@capacitor/core'
import { ref, watch } from 'vue'
import { SYNC_COLLECTIONS, type SyncListing, type SyncPublishRecord } from '@shared/cloud/sync'
import { listRecords, newId, saveRecord, syncState } from './sync'
import { session } from './session'
import { fileBlob } from './files'
import { downloadBlob, fileNameFor, isWeb } from './platform'

/**
 * 发布中心：手机上直接发——视频交给 TikTok / 抖音 App 的发布页，或保存到相册。
 * 网页版：下载视频、复制描述，并在新标签页打开 TikTok / 抖音的网页上传页。
 * 不走 TikTok 接口，不需要授权；发布记录同步到云端。
 */

type Target = 'tiktok' | 'douyin' | 'any'

interface PublishPluginApi {
  installedTargets(): Promise<{ tiktok: boolean; douyin: boolean }>
  saveToGallery(options: { url: string; token: string; fileId: string; mime?: string }): Promise<{ uri: string }>
  share(options: { url: string; token: string; fileId: string; target: Target; caption?: string; mime?: string }): Promise<{ opened: string }>
}

const native = registerPlugin<PublishPluginApi>('Publish')
/** Native share/gallery on the phone; download + upload page in the browser. Both can publish. */
export const publishAvailable = true
export const publishLabels = isWeb
  ? { gallery: '下载', galleryDone: '已下载，可在浏览器的下载列表里找到', other: '分享 / 下载' }
  : { gallery: '存到相册', galleryDone: '已保存到相册「Movies/TiktokCut」', other: '其他应用' }

/** Web upload pages the browser opens after downloading the video. */
const WEB_UPLOAD_PAGES: Record<'tiktok' | 'douyin', string> = {
  tiktok: 'https://www.tiktok.com/tiktokstudio/upload',
  douyin: 'https://creator.douyin.com/creator-micro/content/upload',
}

const fileApiUrl = (fileId: string) => `${session.baseUrl.replace(/\/+$/, '')}/api/v1/files/${encodeURIComponent(fileId)}`

export async function installedTargets() {
  // In the browser both web upload pages are always reachable.
  if (isWeb) return { tiktok: true, douyin: true }
  return native.installedTargets()
}

async function webDownload(fileId: string, label: string, mime?: string) {
  const blob = await fileBlob(fileId)
  downloadBlob(blob, fileNameFor(label, mime || blob.type))
  return blob
}

async function webShare(target: Target, input: { fileId: string; caption?: string; label: string; mime?: string }) {
  if (target === 'tiktok' || target === 'douyin') {
    // Open the tab first: browsers only allow pop-ups straight from the click.
    const tab = window.open(WEB_UPLOAD_PAGES[target], '_blank')
    if (tab) tab.opener = null
    await webDownload(input.fileId, input.label, input.mime)
    return { opened: tab ? target : 'download' }
  }
  const blob = await fileBlob(input.fileId)
  const file = new File([blob], fileNameFor(input.label, input.mime || blob.type), { type: blob.type })
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], text: input.caption })
    return { opened: 'share' }
  }
  downloadBlob(blob, file.name)
  return { opened: 'download' }
}

async function record(input: Omit<SyncPublishRecord, 'at'>) {
  await saveRecord<SyncPublishRecord>(SYNC_COLLECTIONS.publishRecords, newId('pub'), { ...input, at: Date.now() })
}

/** 交给 TikTok / 抖音；描述文字先复制到剪贴板（这两个 App 不读分享里的文字） */
export async function shareTo(target: Target, input: { fileId: string; caption?: string; label: string; generationId?: string; mime?: string }) {
  if (input.caption) await navigator.clipboard.writeText(input.caption).catch(() => undefined)
  const result = isWeb ? await webShare(target, input) : await native.share({ url: fileApiUrl(input.fileId), token: session.token, fileId: input.fileId, target, caption: input.caption, mime: input.mime })
  await record({ fileId: input.fileId, generationId: input.generationId, target: target === 'any' ? 'other' : target, caption: input.caption, label: input.label })
  return result
}

export async function saveToGallery(input: { fileId: string; label: string; generationId?: string; mime?: string }) {
  if (isWeb) await webDownload(input.fileId, input.label, input.mime)
  else await native.saveToGallery({ url: fileApiUrl(input.fileId), token: session.token, fileId: input.fileId, mime: input.mime })
  await record({ fileId: input.fileId, generationId: input.generationId, target: 'gallery', label: input.label })
}

export function usePublishRecords() {
  const items = ref<(SyncPublishRecord & { id: string })[]>([])
  watch(
    () => syncState.version,
    async () => {
      const records = await listRecords<SyncPublishRecord>(SYNC_COLLECTIONS.publishRecords)
      items.value = records.filter((r) => r.data).map((r) => ({ ...(r.data as SyncPublishRecord), id: r.id })).sort((a, b) => b.at - a.at)
    },
    { immediate: true },
  )
  return items
}

/** 上架助手里写好的标题，作为发布描述的候选 */
export function useCaptionSuggestions() {
  const items = ref<string[]>([])
  watch(
    () => syncState.version,
    async () => {
      const records = await listRecords<SyncListing>(SYNC_COLLECTIONS.listings)
      items.value = records
        .filter((r) => r.data?.title)
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .map((r) => r.data!.title)
        .slice(0, 8)
    },
    { immediate: true },
  )
  return items
}
