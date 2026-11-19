/**
 * 网页版的视频解析下载接口：电脑端「视频解析下载」页面（VideoParserDownloadView）在网页上原样显示，
 * 它调用的 window.api.videoParserDownload 由这里提供——在云端解析下载（TikHub 由平台提供），
 * 记录存 video-tool-runs（kind = parse-link，手机 App 同一份），同一个分享链接不重复下载。
 *
 * - 页面检查「有没有 TikHub 密钥」：网页上由云端统一提供，直接视为已配置。
 * - 卡片上的「打开文件」在网页上是下载这个视频。
 */
import { cloudFileRef } from '@shared/cloud/relay'
import { detectPlatform, extractFirstUrl, type ParsePlatform } from '@shared/videoParserPlatforms'
import { SYNC_COLLECTIONS, type SyncAsset, type SyncVideoToolRun } from '@shared/cloud/sync'
import { fileBlob } from '../files'
import { cachedFileLink, resolveFileLinks } from '../fileLinks'
import { downloadBlob, fileNameFor } from '../platform'
import { errorMessage } from '../session'
import { listRecords, newId, saveRecord } from '../sync'
import { toast } from '../toast'
import { normalizeShareUrl, removeRuns, retryRun, runDownloads, startToolPolling, type VideoToolRunItem } from '../videoTools'
import type { DesktopApi } from './contract'
import { cloudFileIdOf, fileNameOf } from './files'

const MAX_LINKS = 50

async function runs(): Promise<VideoToolRunItem[]> {
  return (await listRecords<SyncVideoToolRun>(SYNC_COLLECTIONS.videoToolRuns))
    .filter((record) => record.data?.kind === 'parse-link')
    .map((record) => ({ ...(record.data as SyncVideoToolRun), id: record.id }))
    .sort((a, b) => b.createdAt - a.createdAt)
}

const safeName = (text: string) => text.replace(/[\\/:*?"<>|#\s]+/g, '_').slice(0, 40) || 'video'

function toItem(run: VideoToolRunItem) {
  const output = run.outputs[0]
  const title = run.title?.trim()
  return {
    id: run.id,
    shareUrl: run.url || run.label,
    videoId: '',
    platform: ((run.platform as ParsePlatform | undefined) || detectPlatform(run.url || '')?.platform || 'tiktok') as ParsePlatform,
    title: title || run.url || run.label,
    author: run.author,
    localVideoPath: output ? cloudFileRef(output.fileId, `${safeName(title || 'video')}.mp4`) : undefined,
    // A ready link as the online cover: the page would turn a local path into vg://, which fails before it can be
    // rewritten and marks the cover broken.
    coverUrl: cachedFileLink(output?.posterFileId),
    status: run.status === 'succeeded' ? ('completed' as const) : run.status === 'failed' ? ('failed' as const) : ('processing' as const),
    error: run.status === 'failed' ? run.error || '下载失败' : undefined,
    usedStatus: run.used ? ('used' as const) : ('unused' as const),
    updatedAt: run.createdAt,
  }
}

async function listItems(_payload: { userId: string }) {
  const list = await runs()
  if (list.some((run) => run.status === 'queued' || run.status === 'running')) startToolPolling()
  await resolveFileLinks(list.map((run) => run.outputs[0]?.posterFileId ?? '').filter(Boolean)).catch(() => undefined)
  return list.map(toItem)
}

/** 每条可以是链接或整段分享文案（原样交给云端，小红书要文案）；重复的链接复用已有记录（和电脑端「自动去重」一样） */
async function importShareUrls(payload: { userId: string; shareUrls: string[] }) {
  const errors: Array<{ shareUrl: string; message: string }> = []
  const shares: string[] = []
  for (const line of payload.shareUrls) {
    const url = extractFirstUrl(String(line))
    if (!url) errors.push({ shareUrl: line, message: '没有找到链接' })
    else if (!detectPlatform(url)) errors.push({ shareUrl: url, message: '暂不支持这个平台的链接' })
    else shares.push(String(line).trim())
  }
  if (shares.length > MAX_LINKS) {
    for (const share of shares.splice(MAX_LINKS)) errors.push({ shareUrl: extractFirstUrl(share), message: `一次最多 ${MAX_LINKS} 条，请分批导入` })
  }
  if (shares.length) await runDownloads(shares)
  const wanted = new Set(shares.map((share) => normalizeShareUrl(extractFirstUrl(share))))
  const items = (await runs()).filter((run) => wanted.has(normalizeShareUrl(run.url || ''))).map(toItem)
  return { items, errors }
}

async function retryItem(payload: { userId: string; id: string }) {
  const run = (await runs()).find((item) => item.id === payload.id)
  if (run) await retryRun(run)
}

async function deleteItem(payload: { userId: string; id: string }) {
  await removeRuns((await runs()).filter((item) => item.id === payload.id))
}

const videoParserDownload = { listItems, importShareUrls, retryItem, deleteItem } satisfies DesktopApi['videoParserDownload']

/** 卡片上的「打开文件」：下载这个视频 */
async function showItemInFolder(path: string) {
  try {
    downloadBlob(await fileBlob(await cloudFileIdOf(path)), fileNameFor(fileNameOf(path).replace(/\.[^.]+$/, ''), 'video/mp4'))
  } catch (error) {
    toast(errorMessage(error))
  }
}

/** 「存入素材库」：视频本来就在云端，只加一条素材记录（放「视频下载」文件夹），不重新上传 */
async function importPaths(payload: { paths: string[]; folderId?: string | null }) {
  const byFile = new Map((await runs()).flatMap((run) => (run.outputs[0] ? [[run.outputs[0].fileId, { run, output: run.outputs[0] }] as const] : [])))
  for (const path of payload.paths) {
    const fileId = await cloudFileIdOf(path)
    const found = byFile.get(fileId)
    await saveRecord<SyncAsset>(SYNC_COLLECTIONS.assets, newId('asset'), {
      name: fileNameOf(path),
      kind: 'video',
      fileId,
      mime: 'video/mp4',
      size: 0,
      folder: '视频下载',
      durationSec: found?.output.durationSec,
      posterFileId: found?.output.posterFileId,
      createdAt: Date.now(),
    })
  }
  return { ok: true }
}

/** 这个页面打开期间替换的 window.api 部分 */
export default {
  videoParserDownload,
  // TikHub is provided by the platform on the web: the page's "missing key" check always passes.
  clone: { getModelCredentials: async () => ({ tikhubApiKey: 'cloud' }) },
  shell: { showItemInFolder },
  assetLibrary: { importPaths },
}
