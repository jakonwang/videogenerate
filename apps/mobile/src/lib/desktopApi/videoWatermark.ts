/**
 * 网页版的视频批量水印接口：电脑端「视频批量水印」页面（VideoBatchWatermarkView）在网页上原样显示，
 * 它调用的 window.api.videoWatermark 由这里提供——在云端 ffmpeg 队列里处理，记录存 video-tool-runs（手机 App 同一份）。
 *
 * - 文字水印和原网页版一样，在浏览器里画成透明 PNG（预览和成片是同一张图），提交时上传。
 * - 批次的「打开文件夹」在网页上是「下载这批成片」（outputDir 是 `cloudbatch:<批次号>`）。
 * - 选视频 / 图片：浏览器选文件后传到云端，路径是 `cloudfile:<fileId>/<名字>`。
 */
import { cloudFileRef, parseCloudFileRef } from '@shared/cloud/relay'
import { SYNC_COLLECTIONS, type SyncJobState, type SyncVideoToolRun } from '@shared/cloud/sync'
import type { VideoJobOptions } from '@shared/cloud/videoTools'
import { fileBlob, uploadRaw } from '../files'
import { downloadBlob, fileNameFor } from '../platform'
import { errorMessage } from '../session'
import { listRecords } from '../sync'
import { toast } from '../toast'
import { removeRuns, retryRun, runVideoBatch, startToolPolling, type VideoToolRunItem } from '../videoTools'
import { openDesktopFile } from '../desktopShims/localMedia'
import type { DesktopApi } from './contract'
import { pickFiles } from './files'

type Position = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center'
type Settings = { kind: 'text' | 'image'; text: string; imagePath: string; color: string; position: Position; opacity: number; scale: number; margin: number }
type ItemStatus = 'queued' | 'running' | 'done' | 'failed'

const ARCHIVE_FOLDER = 'AI 成片 / 加水印'
const BATCH_PREFIX = 'cloudbatch:'
const SETTINGS_KEY = 'web-video-watermark-settings'
const POSITION_KEY: Record<Position, NonNullable<VideoJobOptions['position']>> = { 'top-left': 'tl', 'top-right': 'tr', center: 'center', 'bottom-left': 'bl', 'bottom-right': 'br' }
const DEFAULT_SETTINGS: Settings = { kind: 'text', text: '', imagePath: '', color: '#FFFFFF', position: 'bottom-right', opacity: 0.8, scale: 0.22, margin: 0.04 }

/* ------------------------------------------------------------------ 上次的设置（本浏览器） */

function lastSettings(): Settings {
  try {
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') as Partial<Settings>) }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}
function saveSettings(settings: Settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    // Private mode: just don't remember.
  }
}

/* ------------------------------------------------------------------ 文字水印画成透明 PNG（和电脑端同样的字体和阴影） */

async function renderTextMark(text: string, color: string): Promise<Blob> {
  const fontSize = 120
  const font = `700 ${fontSize}px 'Microsoft YaHei','PingFang SC','Noto Sans CJK SC','Source Han Sans SC',Arial,sans-serif`
  const probe = document.createElement('canvas').getContext('2d')!
  probe.font = font
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(16, Math.ceil(probe.measureText(text).width + fontSize * 0.4))
  canvas.height = Math.ceil(fontSize * 1.5)
  const ctx = canvas.getContext('2d')!
  ctx.font = font
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)'
  ctx.fillText(text, fontSize * 0.2 + 3, fontSize * 1.12 + 3)
  ctx.fillStyle = color
  ctx.fillText(text, fontSize * 0.2, fontSize * 1.12)
  return await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('水印生成失败'))), 'image/png'))
}

/** 预览图：文字画成 PNG 后给 data: 地址（页面直接显示）；图片水印就是那张图本身 */
async function preview(input: Record<string, unknown>) {
  const s = { ...DEFAULT_SETTINGS, ...(input as Partial<Settings>) }
  if (s.kind === 'image') return { path: s.imagePath }
  const blob = await renderTextMark(s.text.trim(), s.color)
  return await new Promise<{ path: string }>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve({ path: String(reader.result) })
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

/* ------------------------------------------------------------------ 批次 */

const ITEM_STATUS: Record<SyncJobState, ItemStatus> = { queued: 'queued', running: 'running', succeeded: 'done', failed: 'failed' }

async function runs(): Promise<VideoToolRunItem[]> {
  return (await listRecords<SyncVideoToolRun>(SYNC_COLLECTIONS.videoToolRuns))
    .filter((record) => record.data?.kind === 'watermark')
    .map((record) => ({ ...(record.data as SyncVideoToolRun), id: record.id }))
}

function toBatches(list: VideoToolRunItem[]) {
  const groups = new Map<string, VideoToolRunItem[]>()
  for (const run of list) groups.set(run.batchId || run.id, [...(groups.get(run.batchId || run.id) ?? []), run])
  const fallback = lastSettings()
  return [...groups.entries()]
    .map(([id, items]) => {
      items.sort((a, b) => a.createdAt - b.createdAt)
      return {
        id,
        createdAt: Math.min(...items.map((run) => run.createdAt)),
        outputDir: `${BATCH_PREFIX}${id}`,
        settings: fallback,
        items: items.map((run) => {
          const name = run.inputNames?.[0] || run.label
          const output = run.outputs[0]
          return {
            id: run.id,
            sourcePath: cloudFileRef(run.inputFileIds[0] ?? '', name),
            outputPath: output ? cloudFileRef(output.fileId, fileNameFor(`${name.replace(/\.[^.]+$/, '')}_watermark`, output.mime)) : undefined,
            status: ITEM_STATUS[run.status],
            error: run.status === 'failed' ? run.error || '处理失败' : undefined,
          }
        }),
      }
    })
    .sort((a, b) => b.createdAt - a.createdAt)
}

async function getState() {
  const list = await runs()
  if (list.some((run) => run.status === 'queued' || run.status === 'running')) startToolPolling()
  return { batches: toBatches(list), lastSettings: lastSettings() }
}

function videoOf(path: string) {
  const ref = parseCloudFileRef(path)
  if (!ref) throw new Error('有视频不在云端，请重新添加')
  return ref
}

async function start(payload: { videoPaths: string[]; settings: Record<string, unknown>; outputDir?: string; archiveToLibrary?: boolean }) {
  const s = { ...DEFAULT_SETTINGS, ...(payload.settings as Partial<Settings>) }
  const videos = payload.videoPaths.map(videoOf)
  if (!videos.length) throw new Error('请先添加视频')
  let logoFileId: string
  if (s.kind === 'image') {
    const image = parseCloudFileRef(s.imagePath)
    if (!image) throw new Error('请先选择水印图片')
    logoFileId = image.fileId
  } else {
    if (!s.text.trim()) throw new Error('请填写水印文字')
    logoFileId = (await uploadRaw(await renderTextMark(s.text.trim(), s.color), 'image/png')).fileId
  }
  saveSettings(s)
  const options: VideoJobOptions = { logoFileId, position: POSITION_KEY[s.position], opacity: s.opacity, scale: s.scale, margin: s.margin }
  const batchId = await runVideoBatch(
    'watermark',
    videos.map((video) => ({ fileId: video.fileId, name: video.name, options })),
    s.kind === 'text' ? `文字水印：${s.text.trim()}` : '图片水印',
    payload.archiveToLibrary === false ? {} : { archiveFolder: ARCHIVE_FOLDER },
  )
  const batch = toBatches(await runs()).find((item) => item.id === batchId)
  if (!batch) throw new Error('任务已提交，请刷新页面查看')
  return batch
}

async function retryFailed(batchId: string) {
  const failed = (await runs()).filter((run) => (run.batchId || run.id) === batchId && run.status === 'failed')
  for (const run of failed) await retryRun(run).catch((error) => toast(`重试失败：${errorMessage(error)}`))
}

async function removeBatch(batchId: string) {
  await removeRuns((await runs()).filter((run) => (run.batchId || run.id) === batchId))
}

/** 电脑端由主进程推送变化；网页上定时比对一次（进度由 startToolPolling 从云端取回） */
function onChanged(callback: (batch: unknown) => void) {
  let last = new Map<string, string>()
  let stopped = false
  const tick = async () => {
    const next = new Map<string, string>()
    for (const batch of toBatches(await runs())) {
      const key = JSON.stringify(batch.items)
      next.set(batch.id, key)
      if (last.size && last.get(batch.id) !== key && !stopped) callback(batch)
    }
    last = next
  }
  void tick()
  const timer = window.setInterval(() => void tick().catch(() => undefined), 3000)
  return () => {
    stopped = true
    window.clearInterval(timer)
  }
}

const videoWatermark = { getState, start, retryFailed, removeBatch, preview, onChanged } satisfies DesktopApi['videoWatermark']

/* ------------------------------------------------------------------ 这个页面里的文件夹 */

async function pickDir() {
  toast('网页版不用选输出文件夹：处理完在「处理记录」里点文件夹图标下载，成片也会存进素材库')
  return null
}

/** 批次的「打开文件夹」：下载这批的成片 */
async function downloadBatch(batchId: string) {
  const done = (await runs()).filter((run) => (run.batchId || run.id) === batchId && run.status === 'succeeded')
  if (!done.length) return toast('这批还没有处理完成的视频')
  let count = 0
  for (const run of done) {
    for (const output of run.outputs) {
      try {
        const name = (run.inputNames?.[0] || run.label).replace(/\.[^.]+$/, '')
        downloadBlob(await fileBlob(output.fileId), fileNameFor(`${name}_watermark`, output.mime))
        count += 1
      } catch (error) {
        toast(errorMessage(error))
      }
    }
  }
  if (count) toast(`已下载 ${count} 个视频`)
}

async function openPath(path: string) {
  if (path.startsWith(BATCH_PREFIX)) await downloadBatch(path.slice(BATCH_PREFIX.length))
  else await openDesktopFile(path).catch((error) => toast(errorMessage(error)))
  return ''
}

/** 这个页面打开期间替换的 window.api 部分 */
export default {
  videoWatermark,
  pickFiles,
  pickDir,
  shell: { openPath },
}
