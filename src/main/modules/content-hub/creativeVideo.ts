import { creatorHubRepo } from '../tiktok-creator-hub/repo'
import { videoParserDownloadService, waitForVideoParserItem } from '../video-parser-download/service'
import type { VideoParserDownloadItem } from '../video-parser-download/types'

/**
 * The video behind a GMV MAX ad creative. TikTok's ads API does not hand out the video itself, but
 * a creative's id is the TikTok post id, so the post link can be rebuilt and fetched with the
 * user's own video download interface (视频解析下载). Many winners are creator (达人) posts that were
 * never made in this app; this is how they become a reference video to clone from.
 */

const USER_ID = 'desktop-local'

/** Creator handle of the post, when the creator hub has synced it. */
export function creatorHandleForPost(postId: string, listVideos: () => Array<{ itemId?: string; creatorHandle?: string }> = () => creatorHubRepo.listVideos()) {
  try {
    const match = listVideos().find((video) => String(video.itemId || '') === postId && String(video.creatorHandle || '').trim())
    return match ? String(match.creatorHandle).trim().replace(/^@/, '') : ''
  } catch {
    return ''
  }
}

/** TikTok resolves /@/video/<id> without the handle; with the handle the link is the real one. */
export function creativePostUrl(postId: string, handle = '') {
  return `https://www.tiktok.com/@${encodeURIComponent(handle)}/video/${postId}`
}

export type CreativeVideoResult = {
  creativeId: string
  shareUrl: string
  creatorHandle?: string
  status: 'completed' | 'processing' | 'failed'
  localVideoPath?: string
  thumbnailPath?: string
  title?: string
  author?: string
  error?: string
}

type Deps = {
  importShareUrls: typeof videoParserDownloadService.importShareUrls
  waitForItem: typeof waitForVideoParserItem
  handleFor: (postId: string) => string
}

const defaultDeps: Deps = {
  importShareUrls: (input) => videoParserDownloadService.importShareUrls(input),
  waitForItem: (input) => waitForVideoParserItem(input),
  handleFor: (postId) => creatorHandleForPost(postId),
}
let deps = defaultDeps

export function setCreativeVideoTestDependencies(overrides: Partial<Deps> | null) {
  deps = overrides ? { ...defaultDeps, ...overrides } : defaultDeps
}

/** Download an ad creative's video (reused when it was downloaded before) and wait for the file. */
export async function downloadCreativeVideo(input: { creativeId: string; timeoutMs?: number }): Promise<CreativeVideoResult> {
  const creativeId = String(input.creativeId || '').trim()
  if (!/^\d{8,25}$/.test(creativeId)) throw new Error('这条投放素材没有 TikTok 视频 ID，没法下载原视频')
  const handle = deps.handleFor(creativeId)
  const shareUrl = creativePostUrl(creativeId, handle)
  const base = { creativeId, shareUrl, ...(handle ? { creatorHandle: handle } : {}) }
  const imported = await deps.importShareUrls({ userId: USER_ID, shareUrls: [shareUrl] })
  const started = imported.items[0]
  if (!started) return { ...base, status: 'failed', error: imported.errors[0]?.message || '下载接口没有接收这条链接' }
  const item: VideoParserDownloadItem = await deps.waitForItem({ userId: USER_ID, item: started, videoId: creativeId, timeoutMs: input.timeoutMs })
  return {
    ...base,
    status: item.status,
    localVideoPath: item.status === 'completed' ? item.localVideoPath : undefined,
    thumbnailPath: item.thumbnailPath,
    title: item.title,
    author: item.author,
    error: item.status === 'failed' ? item.error || '下载失败' : item.status === 'processing' ? '视频还在下载，稍后在「视频解析下载」里查看' : undefined,
  }
}
