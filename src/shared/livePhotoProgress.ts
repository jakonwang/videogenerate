/**
 * 图生视频任务进行到哪一步、这一步什么时候开始的。主进程（列表摘要里带上开始时间）和界面共用。
 */
export type LivePhotoProgressPhase = 'queued' | 'locate' | 'image' | 'video' | 'package' | 'done'

type ProgressItemLike = {
  sourceType?: string
  packagingStatus?: string
  replacementRegion?: unknown
  generatedStillPath?: string
  imageTaskId?: string
  workflow?: { currentStep?: string; updatedAt?: number }
  autoFlowStatus?: { status?: string; currentStage?: string; lastStartedAt?: number }
  logs?: Array<{ message?: string; time?: number }>
}

/** 每一步开始时写的日志（按优先级）：图片 / 视频以「已提交」为准，轮询时反复写的 stage started 只作后备 */
const PHASE_START_MARKERS: Record<Exclude<LivePhotoProgressPhase, 'queued' | 'done'>, RegExp[]> = {
  locate: [/stage locate_product started/],
  image: [/image task submitted/, /stage image_generation started/],
  video: [/video task submitted/, /stage video_generation started/],
  package: [/stage live_photo_packaging started/],
}

export function resolveLivePhotoPhase(item: ProgressItemLike): LivePhotoProgressPhase {
  const auto = item.autoFlowStatus
  if (item.packagingStatus === 'completed' || auto?.status === 'done' || item.workflow?.currentStep === 'completed') return 'done'
  const step = item.workflow?.currentStep || auto?.currentStage || 'queued'
  if (step === 'video_generation') return 'video'
  if (step === 'live_photo_packaging') return 'package'
  const needsLocate =
    item.sourceType === 'reference_replace' &&
    !item.replacementRegion &&
    !String(item.generatedStillPath || '').trim() &&
    !String(item.imageTaskId || '').trim()
  if (step === 'queued') {
    if (auto?.status === 'running' || item.packagingStatus === 'processing') return needsLocate ? 'locate' : 'image'
    return 'queued'
  }
  return needsLocate ? 'locate' : 'image'
}

export function resolveLivePhotoPhaseStartedAt(item: ProgressItemLike, phase = resolveLivePhotoPhase(item)): number | undefined {
  if (phase === 'done' || phase === 'queued') return undefined
  const logs = Array.isArray(item.logs) ? item.logs : []
  for (const re of PHASE_START_MARKERS[phase]) {
    for (let index = logs.length - 1; index >= 0; index -= 1) {
      if (re.test(String(logs[index]?.message || ''))) return Number(logs[index]!.time) || undefined
    }
  }
  return undefined
}
