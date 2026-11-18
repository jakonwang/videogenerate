import { ref, watch } from 'vue'
import { SYNC_COLLECTIONS, type SyncGeneration } from '@shared/cloud/sync'
import { closestAspect, generateProductReplacement, generateVideo, onGenerationsRefreshed, startPolling, VIDEO_MOTIONS } from './generate'
import { getRecord, listRecords, newId, saveRecord, syncState } from './sync'

/**
 * 图生视频（和电脑端一样的流程）：参考图 + 商品 → 云端先做商品替换图 → 替换图完成后自动接着生成视频。
 * 每张参考图是一条记录（live-photo-items），两步各自是一条生成任务（generations），出现在审核收件箱。
 */

export type LivePhotoItemData = {
  productId: string
  productName: string
  refFileId: string
  aspect: '1:1' | '9:16' | '16:9'
  productFileIds: string[]
  motion: (typeof VIDEO_MOTIONS)[number]['key']
  durationSec: number
  replaceGenId: string
  videoGenId?: string
  createdAt: number
}

export type LivePhotoStage = 'replacing' | 'replace-failed' | 'video' | 'video-failed' | 'done'
export type LivePhotoItem = LivePhotoItemData & {
  id: string
  stage: LivePhotoStage
  replaceFileId?: string
  videoFileId?: string
  error?: string
}

export const LIVE_PHOTO_STAGE: Record<LivePhotoStage, { label: string; tone: string }> = {
  replacing: { label: '生成替换图', tone: 'blue' },
  'replace-failed': { label: '替换失败', tone: 'red' },
  video: { label: '生成视频中', tone: 'blue' },
  'video-failed': { label: '视频失败', tone: 'red' },
  done: { label: '已完成', tone: 'green' },
}

const genOf = async (id?: string) => (id ? (await getRecord<SyncGeneration>(SYNC_COLLECTIONS.generations, id))?.data ?? null : null)

function stageOf(replace: SyncGeneration | null, video: SyncGeneration | null): Pick<LivePhotoItem, 'stage' | 'error'> {
  if (!replace || replace.status === 'queued' || replace.status === 'running') return { stage: 'replacing' }
  if (replace.status === 'failed') return { stage: 'replace-failed', error: replace.error }
  if (!video || video.status === 'queued' || video.status === 'running') return { stage: 'video' }
  if (video.status === 'failed') return { stage: 'video-failed', error: video.error }
  return { stage: 'done' }
}

export function useLivePhotoItems() {
  const items = ref<LivePhotoItem[]>([])
  watch(
    () => syncState.version,
    async () => {
      const records = (await listRecords<LivePhotoItemData>(SYNC_COLLECTIONS.livePhotoItems)).filter((r) => r.data)
      const list: LivePhotoItem[] = []
      for (const record of records) {
        const data = record.data!
        const [replace, video] = await Promise.all([genOf(data.replaceGenId), genOf(data.videoGenId)])
        list.push({ ...data, id: record.id, ...stageOf(replace, video), replaceFileId: replace?.outputFileId, videoFileId: video?.outputFileId })
      }
      items.value = list.sort((a, b) => b.createdAt - a.createdAt)
    },
    { immediate: true },
  )
  return items
}

/** 每张参考图建一条任务：先做商品替换图 */
export async function createLivePhotoItems(input: {
  product: { id: string; name: string; fileIds: string[] }
  refs: Array<{ fileId: string; width?: number; height?: number }>
  motion: LivePhotoItemData['motion']
  durationSec: number
}) {
  for (const ref of input.refs) {
    const aspect = closestAspect(ref.width, ref.height)
    const [replaceGenId] = await generateProductReplacement({
      productId: input.product.id,
      productName: input.product.name,
      scenes: [{ fileId: ref.fileId, aspectRatio: aspect }],
      productFileIds: input.product.fileIds,
    })
    await saveRecord<LivePhotoItemData>(SYNC_COLLECTIONS.livePhotoItems, newId('lp'), {
      productId: input.product.id,
      productName: input.product.name,
      refFileId: ref.fileId,
      aspect,
      productFileIds: input.product.fileIds.slice(0, 3),
      motion: input.motion,
      durationSec: input.durationSec,
      replaceGenId: replaceGenId!,
      createdAt: Date.now(),
    })
  }
  startPolling()
}

async function startVideo(id: string, data: LivePhotoItemData, replaceFileId: string) {
  const videoGenId = await generateVideo({ productId: data.productId, productName: data.productName, sourceFileId: replaceFileId, motion: data.motion, durationSec: data.durationSec })
  await saveRecord<LivePhotoItemData>(SYNC_COLLECTIONS.livePhotoItems, id, { ...data, videoGenId })
}

/** 替换图完成的条目接着生成视频（挂在生成任务轮询上，页面关着也会在下次轮询时继续） */
export async function advanceLivePhotoItems(): Promise<number> {
  let started = 0
  for (const record of await listRecords<LivePhotoItemData>(SYNC_COLLECTIONS.livePhotoItems)) {
    const data = record.data
    if (!data || data.videoGenId) continue
    const replace = await genOf(data.replaceGenId)
    if (replace?.status !== 'succeeded' || !replace.outputFileId) continue
    await startVideo(record.id, data, replace.outputFileId)
    started += 1
  }
  return started
}
onGenerationsRefreshed(advanceLivePhotoItems)

/** 失败的那一步重做 */
export async function retryLivePhotoItem(item: LivePhotoItem) {
  const { id, stage, replaceFileId, videoFileId, error, ...data } = item
  if (stage === 'replace-failed') {
    const [replaceGenId] = await generateProductReplacement({
      productId: data.productId,
      productName: data.productName,
      scenes: [{ fileId: data.refFileId, aspectRatio: data.aspect }],
      productFileIds: data.productFileIds,
    })
    await saveRecord<LivePhotoItemData>(SYNC_COLLECTIONS.livePhotoItems, id, { ...data, replaceGenId: replaceGenId!, videoGenId: undefined })
  } else if (stage === 'video-failed' && replaceFileId) {
    await startVideo(id, { ...data, videoGenId: undefined }, replaceFileId)
  }
  startPolling()
}
