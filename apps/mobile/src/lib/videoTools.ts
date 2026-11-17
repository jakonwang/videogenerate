import { ref, watch } from 'vue'
import { SYNC_COLLECTIONS, type SyncGeneration, type SyncVideoToolRun } from '@shared/cloud/sync'
import type { VideoJobOptions, VideoJobResult, VideoToolKind } from '@shared/cloud/videoTools'
import { cloud } from './session'
import { listRecords, newId, saveRecord, syncState } from './sync'

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

async function submit(kind: VideoToolKind, label: string, request: Parameters<typeof cloud.ai.createJob>[0], inputFileIds: string[]) {
  const { job } = await cloud.ai.createJob({ ...request, kind, purpose: kind })
  await saveRecord<SyncVideoToolRun>(SYNC_COLLECTIONS.videoToolRuns, newId('run'), {
    kind,
    jobId: job.id,
    status: job.status,
    label,
    inputFileIds,
    outputs: [],
    createdAt: Date.now(),
  })
  startToolPolling()
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
    `${options.count} 条 × ${options.durationSec} 秒${options.bgmFileId ? ' · 配乐' : ''}`,
    { kind: 'mix', clips: clipFileIds.map((fileId) => ({ fileId, durationSec: 0 })), options },
    clipFileIds,
  )
}

export async function runDownloads(urls: string[]) {
  for (const url of urls) await submit('parse-link', url.replace(/^https?:\/\//, '').slice(0, 40), { kind: 'parse-link', url }, [])
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
    if (job.status === 'queued' || job.status === 'running') {
      still += 1
      if (job.status !== run.status) await saveRecord<SyncVideoToolRun>(SYNC_COLLECTIONS.videoToolRuns, record.id, { ...run, status: job.status })
      continue
    }
    const result = (job.result as VideoJobResult | undefined) ?? { outputs: [] }
    await saveRecord<SyncVideoToolRun>(SYNC_COLLECTIONS.videoToolRuns, record.id, {
      ...run,
      status: job.status,
      outputs: result.outputs,
      transcript: result.transcript?.text,
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
