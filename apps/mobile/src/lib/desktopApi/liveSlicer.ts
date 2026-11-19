/**
 * 网页版的直播切片接口：电脑端「直播切片」页面（LiveSlicerView）在网页上原样显示，
 * 它调用的 window.api.liveSlicer 由这里提供。
 *
 * - 视频：选择 / 拖入后上传到云端（路径是 `cloudfile:<fileId>/<名字>`），读取信息时用上传时量到的时长和尺寸。
 * - 分析（音量 + 画面切换）和导出在云端 ffmpeg 队列里执行（live-analyze / live-export 任务），进度按时长估算，
 *   通过页面的 onProgress 推给页面；「取消」只是不再等结果（云端任务会自己跑完）。
 * - 片段缩略图在浏览器里从视频截取。
 * - 成片在云端：结果的「打开文件」下载这一段，「打开文件夹」下载这一批。
 */
import { cloudFileRef, parseCloudFileRef } from '@shared/cloud/relay'
import type { VideoJobResult } from '@shared/cloud/videoTools'
import type { LiveSlicerAnalysis } from '@shared/liveSlicer'
import { fileBlob } from '../files'
import { fileLink } from '../fileLinks'
import { downloadBlob, fileNameFor } from '../platform'
import { cloud, errorMessage } from '../session'
import { toast } from '../toast'
import type { DesktopApi } from './contract'
import { cloudFileIdOf, fileNameOf, getPathForFile, pickFiles, uploadedMeta } from './files'

type ExportSegment = { id: string; start: number; end: number; title?: string }
type ExportOptions = Parameters<DesktopApi['liveSlicer']['export']>[0]['options']
type ExportResult = { id: string; ok: boolean; outputPath?: string; sizeBytes?: number; error?: string }
type Progress = Record<string, unknown>

const BATCH_PREFIX = 'cloudslices:'
const listeners = new Set<(p: Progress) => void>()
const emit = (p: Progress) => listeners.forEach((listener) => listener(p))
const cancelled = new Set<string>()
/** 每次导出的成片（「打开文件夹」= 下载这一批） */
const batches = new Map<string, Array<{ fileId: string; name: string }>>()

/* ------------------------------------------------------------------ 视频信息 */

async function measure(fileId: string) {
  const known = uploadedMeta(fileId)
  if (known?.durationSec && known.width && known.height) return { size: known.size, durationSec: known.durationSec, width: known.width, height: known.height }
  const video = document.createElement('video')
  video.preload = 'metadata'
  video.muted = true
  video.src = await fileLink(fileId)
  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve()
    video.onerror = () => reject(new Error('读取视频信息失败，请换一个视频再试'))
    setTimeout(() => reject(new Error('读取视频信息超时')), 20_000)
  })
  return { size: known?.size ?? 0, durationSec: video.duration || 0, width: video.videoWidth, height: video.videoHeight }
}

async function probe(inputPath: string) {
  try {
    const fileId = await cloudFileIdOf(inputPath)
    const fileName = fileNameOf(inputPath)
    const info = await measure(fileId)
    return {
      ok: true as const,
      source: { path: cloudFileRef(fileId, fileName), fileName, fileSize: info.size, durationSec: info.durationSec, width: info.width, height: info.height, fps: 0, hasAudio: true, videoCodec: null, audioCodec: null, bitRate: 0 },
    }
  } catch (error) {
    return { ok: false as const, error: errorMessage(error) }
  }
}

/* ------------------------------------------------------------------ 云端任务 */

/** 等云端任务完成，期间按估算推进度；页面取消时返回 null */
async function waitJob(pageJobId: string, cloudJobId: string, onTick: (elapsedSec: number) => void) {
  const started = Date.now()
  for (;;) {
    if (cancelled.has(pageJobId)) return null
    const { job } = await cloud.ai.getJob(cloudJobId)
    if (job.status === 'succeeded' || job.status === 'failed') return job
    onTick((Date.now() - started) / 1000)
    await new Promise((resolve) => setTimeout(resolve, 1500))
  }
}

async function analyze(payload: { jobId: string; inputPath: string }) {
  cancelled.delete(payload.jobId)
  try {
    const fileId = await cloudFileIdOf(payload.inputPath)
    const durationSec = uploadedMeta(fileId)?.durationSec || 60
    const { job: created } = await cloud.ai.createJob({ kind: 'live-analyze', videoFileId: fileId, purpose: 'live-analyze' })
    // 云端约按 20 倍速读完音量和画面
    const job = await waitJob(payload.jobId, created.id, (elapsed) => emit({ kind: 'analyze', jobId: payload.jobId, fraction: Math.min(0.95, elapsed / Math.max(8, durationSec / 20)) }))
    if (!job) return { ok: false as const, cancelled: true, error: '' }
    const analysis = (job.result as VideoJobResult | undefined)?.analysis as LiveSlicerAnalysis | undefined
    if (job.status !== 'succeeded' || !analysis) return { ok: false as const, cancelled: false, error: String(job.error || '分析失败') }
    return { ok: true as const, analysis }
  } catch (error) {
    return { ok: false as const, cancelled: false, error: errorMessage(error) }
  } finally {
    cancelled.delete(payload.jobId)
  }
}

function clipName(options: ExportOptions, sourceName: string, index: number, segment: ExportSegment) {
  const prefix = options.namePrefix?.trim() || sourceName.replace(/\.[^.]+$/, '')
  return `${prefix}_${String(index + 1).padStart(2, '0')}_${(segment.title || '').replace(/[\\/:*?"<>|#]/g, '_')}`.replace(/_+$/, '').slice(0, 80)
}

async function exportClips(payload: { jobId: string; inputPath: string; segments: ExportSegment[]; options: ExportOptions }) {
  cancelled.delete(payload.jobId)
  const list = payload.segments
  const o = payload.options
  try {
    const fileId = await cloudFileIdOf(payload.inputPath)
    const { job: created } = await cloud.ai.createJob({
      kind: 'live-export',
      videoFileId: fileId,
      purpose: 'live-export',
      options: {
        segments: list.map((x) => ({ id: x.id, start: x.start, end: x.end, title: x.title })),
        cutMode: o.cutMode,
        aspectMode: o.aspect,
        resolution: o.resolution,
        fade: o.fade,
        normalizeAudio: o.normalizeAudio,
        padding: o.padding,
      },
    })
    const totalSec = list.reduce((sum, x) => sum + (x.end - x.start), 0)
    const job = await waitJob(payload.jobId, created.id, (elapsed) => {
      const done = Math.min(0.95, elapsed / Math.max(6, totalSec / (o.cutMode === 'fast' ? 30 : 4)))
      const index = Math.min(list.length - 1, Math.floor(done * list.length))
      emit({ kind: 'export', jobId: payload.jobId, index, total: list.length, fraction: done * list.length - index })
    })
    if (!job) return { ok: false as const, cancelled: true, error: '' }
    if (job.status !== 'succeeded') return { ok: false as const, cancelled: false, error: String(job.error || '导出失败') }
    const outputs = (job.result as VideoJobResult | undefined)?.outputs ?? []
    const sourceName = fileNameOf(payload.inputPath)
    const files: Array<{ fileId: string; name: string }> = []
    const results: ExportResult[] = list.map((segment, index) => {
      const out = outputs.find((output) => output.segmentId === segment.id)
      if (!out) return { id: segment.id, ok: false, error: '片段太短，没有导出' }
      const name = fileNameFor(clipName(o, sourceName, index, segment), out.mime || 'video/mp4')
      files.push({ fileId: out.fileId, name })
      return { id: segment.id, ok: true, outputPath: cloudFileRef(out.fileId, name) }
    })
    batches.set(payload.jobId, files)
    return { ok: true as const, outputDir: `${BATCH_PREFIX}${payload.jobId}/${sourceName.replace(/\.[^.]+$/, '')}`, results }
  } catch (error) {
    return { ok: false as const, cancelled: false, error: errorMessage(error) }
  } finally {
    cancelled.delete(payload.jobId)
  }
}

/* ------------------------------------------------------------------ 缩略图（浏览器里截取） */

let thumbVideo: HTMLVideoElement | null = null
let thumbFor = ''
async function thumbnail(payload: { inputPath: string; atSec: number; width?: number; height?: number }) {
  try {
    const fileId = parseCloudFileRef(payload.inputPath)?.fileId
    if (!fileId) return null
    if (!thumbVideo) {
      thumbVideo = document.createElement('video')
      thumbVideo.muted = true
      thumbVideo.preload = 'auto'
    }
    const v = thumbVideo
    if (thumbFor !== fileId) {
      thumbFor = fileId
      v.src = await fileLink(fileId)
      await new Promise((resolve) => {
        v.onloadeddata = resolve
        v.onerror = resolve
        setTimeout(resolve, 8000)
      })
    }
    await new Promise((resolve) => {
      v.onseeked = resolve
      v.currentTime = Math.max(0, Math.min(payload.atSec, (v.duration || payload.atSec) - 0.05))
      setTimeout(resolve, 4000)
    })
    const canvas = document.createElement('canvas')
    canvas.width = payload.width || 192
    canvas.height = payload.height || 108
    canvas.getContext('2d')!.drawImage(v, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.72)
  } catch {
    return null
  }
}

const liveSlicer = {
  probe,
  analyze,
  thumbnail,
  export: exportClips,
  cancel: async (jobId: string) => {
    cancelled.add(jobId)
    return { ok: true }
  },
  onProgress: (callback: (p: Progress) => void) => {
    listeners.add(callback)
    return () => {
      listeners.delete(callback)
    }
  },
} satisfies DesktopApi['liveSlicer']

/* ------------------------------------------------------------------ 打开文件 / 文件夹 = 下载 */

async function download(fileId: string, name: string) {
  downloadBlob(await fileBlob(fileId), name)
}

async function openPath(path: string) {
  try {
    if (path.startsWith(BATCH_PREFIX)) {
      const files = batches.get(path.slice(BATCH_PREFIX.length).split('/')[0] ?? '') ?? []
      if (!files.length) return toast('这批成片已不在当前页面，请重新导出'), ''
      for (const file of files) await download(file.fileId, file.name)
      toast(`已下载 ${files.length} 个片段`)
      return ''
    }
    const ref = parseCloudFileRef(path)
    if (ref) await download(ref.fileId, ref.name)
  } catch (error) {
    toast(errorMessage(error))
  }
  return ''
}

/** 这个页面打开期间替换的 window.api 部分 */
export default {
  liveSlicer,
  pickFiles,
  getPathForFile,
  // 网页上成片由浏览器下载，「输出目录」只是个说明
  getPaths: async () => ({ dataDir: '浏览器下载' }),
  pickDir: async () => '浏览器下载',
  shell: { openPath, showItemInFolder: openPath },
}
