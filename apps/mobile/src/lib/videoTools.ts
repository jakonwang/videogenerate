import { reactive, ref, watch } from 'vue'
import { SYNC_COLLECTIONS, type SyncAsset, type SyncGeneration, type SyncVideoToolRun } from '@shared/cloud/sync'
import type { VideoJobOptions, VideoJobResult, VideoToolKind } from '@shared/cloud/videoTools'
import { detectPlatform, extractFirstUrl } from '@shared/videoParserPlatforms'
import { cloud } from './session'

/** Place in the server's ffmpeg queue per job id (in memory only; changes too often to sync). */
export const queuePositions = reactive<Record<string, number>>({})
import { deleteRecord, listRecords, newId, saveRecord, syncState } from './sync'

/**
 * 视频工具（第三阶段）：每个视频一个云端任务，记录存 video-tool-runs；
 * 完成后每个输出视频再写一条 generations，出现在审核收件箱。
 */

export type VideoToolRunItem = SyncVideoToolRun & { id: string }

export function useToolRuns(kind: VideoToolKind) {
  const items = ref<VideoToolRunItem[]>([])
  watch(
    () => syncState.version,
    async () => {
      const records = await listRecords<SyncVideoToolRun>(SYNC_COLLECTIONS.videoToolRuns)
      items.value = records
        .filter((record) => record.data?.kind === kind)
        .map((record) => ({ ...(record.data as SyncVideoToolRun), id: record.id }))
        .sort((a, b) => b.createdAt - a.createdAt)
    },
    { immediate: true },
  )
  return items
}

type RunExtra = Pick<SyncVideoToolRun, 'inputNames' | 'batchId' | 'archiveFolder' | 'url' | 'shareText' | 'platform' | 'options' | 'jobKind'>

async function submit(kind: VideoToolKind, label: string, request: Parameters<typeof cloud.ai.createJob>[0], inputFileIds: string[], extra: RunExtra = {}) {
  const jobKind = extra.jobKind ?? kind
  const { job } = await cloud.ai.createJob({ ...request, kind: jobKind, purpose: kind })
  await saveRecord<SyncVideoToolRun>(SYNC_COLLECTIONS.videoToolRuns, newId('run'), {
    kind,
    jobId: job.id,
    status: job.status,
    label,
    inputFileIds,
    outputs: [],
    createdAt: Date.now(),
    ...extra,
  })
  startToolPolling()
  return job.id
}

/** 水印 / 字幕：每个视频各一个任务 */
export async function runPerVideo(kind: 'watermark' | 'subtitle', videoFileIds: string[], options: VideoJobOptions, label: string) {
  for (const videoFileId of videoFileIds) await submit(kind, label, { kind, videoFileId, options }, [videoFileId])
}

export async function runSlice(videoFileId: string, segmentSec: number) {
  await submit('slice', `每段 ${segmentSec} 秒`, { kind: 'slice', videoFileId, options: { segmentSec } }, [videoFileId])
}

export async function runMix(clipFileIds: string[], options: VideoJobOptions) {
  await submit(
    'mix',
    options.templateName
      ? `模板「${options.templateName}」 · ${options.count} 条`
      : `${options.count} 条 × ${options.durationSec} 秒${options.bgmFileId ? ' · 配乐' : ''}`,
    { kind: 'mix', clips: clipFileIds.map((fileId) => ({ fileId, durationSec: 0 })), options },
    clipFileIds,
  )
}

/** 生产中心云端简版：按方案的镜头剪成 1 条（clips 依次是镜头） */
export async function runMixShots(shots: Array<{ fileId: string; startSec: number; durationSec: number }>, options: VideoJobOptions, label: string) {
  return await submit('mix', label, { kind: 'mix', clips: shots, options }, [...new Set(shots.map((shot) => shot.fileId))])
}

/** 链接下载：同一个分享链接已经在下 / 下好了就不再重复下载（和电脑端「自动去重」一样）；返回实际提交的条数 */
/** 每条可以是链接，也可以是整段分享文案（小红书等平台解析要文案，原样交给云端） */
export async function runDownloads(shares: string[]) {
  const records = await listRecords<SyncVideoToolRun>(SYNC_COLLECTIONS.videoToolRuns)
  const known = new Set(records.filter((r) => r.data?.kind === 'parse-link' && r.data.status !== 'failed').map((r) => normalizeShareUrl(r.data!.url || '')).filter(Boolean))
  let submitted = 0
  for (const share of shares) {
    const text = String(share || '').trim()
    const url = extractFirstUrl(text) || text
    const key = normalizeShareUrl(url)
    if (key && known.has(key)) continue
    known.add(key)
    const shareText = text !== url ? text.slice(0, 2000) : undefined
    await submit('parse-link', url.replace(/^https?:\/\//, '').slice(0, 40), { kind: 'parse-link', url: shareText ?? url }, [], { url, shareText, platform: detectPlatform(url)?.platform })
    submitted += 1
  }
  return submitted
}

export function normalizeShareUrl(url: string) {
  const match = String(url || '').match(/https?:\/\/[^\s]+/)?.[0]
  return match ? match.replace(/[?#].*$/, '').replace(/\/+$/, '').toLowerCase() : ''
}

/** 一批视频各跑一个任务（批量水印 / 批量字幕），同一批共用 batchId；每条可带自己的参数 */
export async function runVideoBatch(
  kind: 'watermark' | 'subtitle',
  videos: Array<{ fileId: string; name: string; options: VideoJobOptions }>,
  label: string | ((video: { name: string }) => string),
  extra: Pick<SyncVideoToolRun, 'archiveFolder' | 'jobKind'> = {},
) {
  const batchId = newId('batch')
  const jobKind = extra.jobKind ?? kind
  for (const video of videos) {
    await submit(kind, typeof label === 'function' ? label(video) : label, { kind: jobKind, videoFileId: video.fileId, options: video.options }, [video.fileId], { batchId, inputNames: [video.name], archiveFolder: extra.archiveFolder, options: video.options, jobKind: extra.jobKind })
  }
  return batchId
}

/** 失败的任务用同样的参数重新跑（原记录改为新任务） */
export async function retryRun(run: VideoToolRunItem) {
  const { id, ...data } = run
  const request: Parameters<typeof cloud.ai.createJob>[0] =
    run.kind === 'parse-link' ? { kind: run.kind, url: run.shareText || run.url || run.label } : { kind: run.jobKind ?? run.kind, videoFileId: run.inputFileIds[0], options: run.options ?? {} }
  const { job } = await cloud.ai.createJob({ ...request, purpose: run.kind })
  await saveRecord<SyncVideoToolRun>(SYNC_COLLECTIONS.videoToolRuns, id, { ...data, jobId: job.id, status: job.status, error: undefined, outputs: [] })
  startToolPolling()
}

export const removeRuns = (runs: VideoToolRunItem[]) => Promise.all(runs.map((run) => deleteRecord(SYNC_COLLECTIONS.videoToolRuns, run.id)))

export async function markRunUsed(run: VideoToolRunItem) {
  if (run.used) return
  const { id, ...data } = run
  await saveRecord<SyncVideoToolRun>(SYNC_COLLECTIONS.videoToolRuns, id, { ...data, used: true })
}

/* ------------------------------------------------------------------ 进度 */

let timer: ReturnType<typeof setTimeout> | null = null

export function startToolPolling() {
  if (timer) return
  const tick = async () => {
    timer = null
    const still = await refreshToolRuns().catch(() => 1)
    if (still && document.visibilityState === 'visible') timer = setTimeout(tick, 5000)
  }
  timer = setTimeout(tick, 2000)
}

export async function refreshToolRuns(): Promise<number> {
  const records = await listRecords<SyncVideoToolRun>(SYNC_COLLECTIONS.videoToolRuns)
  const pending = records.filter((record) => record.data && (record.data.status === 'queued' || record.data.status === 'running'))
  if (!pending.length) return 0
  const { jobs } = await cloud.ai.listJobs(pending.map((record) => record.data!.jobId))
  let still = 0
  for (const record of pending) {
    const run = record.data!
    const job = jobs.find((item) => item.id === run.jobId)
    if (!job) continue
    queuePositions[job.id] = job.status === 'queued' ? job.queuePosition ?? 0 : 0
    if (job.status === 'queued' || job.status === 'running') {
      still += 1
      if (job.status !== run.status) await saveRecord<SyncVideoToolRun>(SYNC_COLLECTIONS.videoToolRuns, record.id, { ...run, status: job.status })
      continue
    }
    const result = (job.result as VideoJobResult | undefined) ?? { outputs: [] }
    // 完成后存进素材库（和电脑端「完成后存入素材库」一样）
    const archive = Boolean(run.archiveFolder && job.status === 'succeeded' && result.outputs.length && !run.archived)
    if (archive) {
      for (const [index, output] of result.outputs.entries()) {
        const base = (run.inputNames?.[0] || run.label).replace(/\.[^.]+$/, '')
        await saveRecord<SyncAsset>(SYNC_COLLECTIONS.assets, newId('asset'), {
          name: `${base}${result.outputs.length > 1 ? `_${index + 1}` : ''}`.slice(0, 80),
          kind: 'video',
          fileId: output.fileId,
          mime: output.mime,
          size: 0,
          folder: run.archiveFolder,
          durationSec: output.durationSec,
          posterFileId: output.posterFileId,
          createdAt: Date.now(),
        })
      }
    }
    await saveRecord<SyncVideoToolRun>(SYNC_COLLECTIONS.videoToolRuns, record.id, {
      ...run,
      status: job.status,
      outputs: result.outputs,
      transcript: result.transcript?.text,
      title: result.title ?? run.title,
      author: result.author ?? run.author,
      platform: result.platform ?? run.platform,
      archived: run.archived || archive,
      error: job.error,
    })
    // Every finished video also goes to the review inbox.
    for (const [index, output] of result.outputs.entries()) {
      await saveRecord<SyncGeneration>(SYNC_COLLECTIONS.generations, newId('gen'), {
        kind: 'video',
        purpose: run.kind,
        jobId: job.id,
        status: 'succeeded',
        sourceFileId: run.inputFileIds[0] || output.fileId,
        label: result.outputs.length > 1 ? `${run.label} · ${index + 1}` : result.title?.slice(0, 20) || run.label,
        outputFileId: output.fileId,
        outputMime: output.mime,
        review: 'pending',
        createdAt: Date.now(),
      })
    }
  }
  return still
}
