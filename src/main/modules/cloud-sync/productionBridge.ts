import type { MixDraft, MixFormula, MixJobInput } from '../../../shared/mixFormula'
import type { ClipOrigin, ClipRole, PoolClip, PoolSource } from '../../../shared/mixPool'
import type { MixOrderResult, SyncMixPool, SyncPoolClip, SyncPoolSource } from '../../../shared/cloud/production'

/**
 * 生产中心：电脑端素材池 / 公式 / 渲染任务 ↔ 网页。这里放映射和默认服务，网络与状态在 service.ts。
 */

export type ProductionTask = { status: string; progress?: number; outPath: string; error?: string; formulaName?: string }

export type ProductionService = {
  pool: (productId: string) => Promise<{ sources: PoolSource[]; clips: PoolClip[]; busy: boolean }>
  formulas: () => Promise<MixFormula[]>
  updateClip: (id: string, patch: { roleOverride?: ClipRole | null; disabled?: boolean }) => Promise<unknown>
  importFiles: (productId: string, paths: string[], origin: ClipOrigin) => Promise<unknown>
  enqueue: (input: MixJobInput, drafts: MixDraft[]) => Promise<{ enqueued: number; skipped: number }>
  /** Render tasks written into this folder (one web order = one folder). */
  tasks: (outDir: string) => ProductionTask[]
}

export const defaultProductionService = async (): Promise<ProductionService> => {
  const [{ mixPoolService }, { mixPoolRepo }, { mixStudioService }, { taskQueue }] = await Promise.all([
    import('../mix-pool/service'),
    import('../mix-pool/repo'),
    import('../mix-studio/service'),
    import('../tasks/queue'),
  ])
  return {
    pool: async (productId) => ({ ...(await mixPoolRepo.listByProduct(productId)), busy: mixPoolService.isRunning(productId) }),
    formulas: () => mixStudioService.listFormulas(),
    updateClip: (id, patch) => mixPoolService.updateClip(id, patch),
    importFiles: (productId, paths, origin) => mixPoolService.importFiles(productId, paths, origin),
    enqueue: (input, drafts) => mixStudioService.enqueue(input, drafts),
    tasks: (outDir) =>
      taskQueue
        .list()
        .filter((task) => task.outDir === outDir)
        .sort((a, b) => a.createdAt - b.createdAt)
        .map((task) => ({ status: task.status, progress: task.progress, outPath: task.outPath, error: task.error, formulaName: task.mix?.formulaName })),
  }
}

/** Keeps the published pool under the 256 KB record limit: best shots first. */
export const POOL_CLIP_LIMIT = 350

export function toSyncPool(input: {
  productName: string
  sources: PoolSource[]
  clips: PoolClip[]
  busy: boolean
  thumbs: Map<string, string>
  sourceFiles: Map<string, string>
}): SyncMixPool {
  const clips = [...input.clips]
    .sort((a, b) => Number(Boolean(a.disabled)) - Number(Boolean(b.disabled)) || (b.tags?.quality ?? 0) - (a.tags?.quality ?? 0))
    .slice(0, POOL_CLIP_LIMIT)
    .map(
      (clip): SyncPoolClip => ({
        id: clip.id,
        sourceId: clip.sourceId,
        startSec: clip.startSec,
        endSec: clip.endSec,
        durationSec: clip.durationSec,
        origin: clip.origin,
        tagStatus: clip.tagStatus,
        ...(clip.tags ? { tags: { ...clip.tags, description: clip.tags.description.slice(0, 120), issues: clip.tags.issues.slice(0, 3) } } : {}),
        ...(clip.roleOverride ? { roleOverride: clip.roleOverride } : {}),
        ...(clip.disabled ? { disabled: true } : {}),
        ...(input.thumbs.get(clip.id) ? { thumbFileId: input.thumbs.get(clip.id) } : {}),
      }),
    )
  const sources = input.sources.map(
    (source): SyncPoolSource => ({
      id: source.id,
      fileName: source.fileName,
      kind: source.kind,
      origin: source.origin,
      status: source.status,
      ...(source.error ? { error: source.error.slice(0, 200) } : {}),
      clipCount: source.clipCount,
      ...(source.durationSec ? { durationSec: source.durationSec } : {}),
      ...(input.sourceFiles.get(source.id) ? { fileId: input.sourceFiles.get(source.id) } : {}),
    }),
  )
  return { productName: input.productName, sources, clips, busy: input.busy || undefined, publishedAt: 0 }
}

/** What changed for the web (file ids and timestamps excluded, so re-uploads don't cause re-publishing). */
export function poolFingerprint(pool: { sources: PoolSource[]; clips: PoolClip[]; busy: boolean }) {
  return JSON.stringify([
    pool.busy,
    pool.sources.map((s) => [s.id, s.status, s.clipCount]),
    pool.clips.map((c) => [c.id, c.tagStatus, c.roleOverride ?? '', c.disabled ? 1 : 0, c.tags?.role ?? '', c.updatedAt]),
  ])
}

/**
 * A web draft refers to this computer's clip ids; swap in the local file paths before rendering.
 * Drafts whose shots no longer exist here are dropped (and reported as skipped).
 */
export function localizeDrafts(drafts: MixDraft[], clips: PoolClip[]): { drafts: MixDraft[]; missing: number[] } {
  const byId = new Map(clips.map((clip) => [clip.id, clip]))
  const out: MixDraft[] = []
  const missing: number[] = []
  drafts.forEach((draft, index) => {
    const shots = draft.shots.map((shot) => {
      const clip = byId.get(shot.clipId)
      return clip ? { ...shot, filePath: clip.filePath, thumbnailPath: clip.thumbnailPath } : null
    })
    if (shots.some((shot) => !shot) || shots.length < 2) missing.push(index)
    else out.push({ ...draft, shots: shots as MixDraft['shots'] })
  })
  return { drafts: out, missing }
}

/** Map render tasks back onto the order's drafts (tasks are created in draft order; missing ones were skipped). */
export function orderResults(draftCount: number, missing: number[], tasks: ProductionTask[], uploaded: Record<string, string>): MixOrderResult[] {
  const results: MixOrderResult[] = []
  let t = 0
  for (let i = 0; i < draftCount; i += 1) {
    if (missing.includes(i)) {
      results.push({ status: 'skipped', error: '电脑上找不到这条方案用到的镜头' })
      continue
    }
    const task = tasks[t++]
    if (!task) {
      results.push({ status: 'skipped', error: '和已生产过的视频重复，已跳过' })
      continue
    }
    const status: MixOrderResult['status'] =
      task.status === 'done' ? 'done' : task.status === 'error' || task.status === 'cancelled' ? 'error' : task.status === 'running' ? 'running' : task.status === 'skipped' ? 'skipped' : 'queued'
    results.push({
      status,
      ...(task.progress ? { progress: Math.round(Math.min(1, task.progress) * 100) } : {}),
      ...(uploaded[task.outPath] ? { outputFileId: uploaded[task.outPath] } : {}),
      ...(task.error && status === 'error' ? { error: task.error.slice(0, 200) } : {}),
    })
  }
  return results
}
