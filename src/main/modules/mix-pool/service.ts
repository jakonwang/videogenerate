import { existsSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { basename } from 'node:path'
import { randomUUID } from 'node:crypto'
import { productsRepo } from '../products/repo'
import { cloneRepo } from '../clone/repo'
import { cloneService } from '../clone/service'
import type { Product } from '../products/types'
import {
  CLIP_ROLES,
  CORE_CLIP_ROLES,
  effectiveClipRole,
  type ClipOrigin,
  type ClipRole,
  type MixPoolOverview,
  type MixPoolProgress,
  type PoolClip,
  type PoolSource,
  type PoolSourceKind,
} from '../../../shared/mixPool'
import { mixPoolFramesDir, mixPoolRepo } from './repo'
import { splitSourceIntoClips } from './splitter'
import { effectiveModel, heuristicTags, productReferenceImage, resolveVisionTarget, tagClipBatchWithAi, TAG_BATCH_SIZE } from './tagger'

const VIDEO_EXT = /\.(mp4|mov|m4v|webm|mkv)$/i

type ProgressListener = (p: MixPoolProgress) => void
let progressListener: ProgressListener | null = null
/** One running job per product; a second request while running is a no-op. */
const running = new Map<string, Promise<void>>()
let stuckReset: Promise<void> | null = null

function emit(p: MixPoolProgress) {
  try {
    progressListener?.(p)
  } catch {
    /* renderer gone */
  }
}

async function getProduct(productId: string): Promise<Product> {
  const product = (await productsRepo.list()).find((p) => p.id === productId)
  if (!product) throw new Error('未找到商品')
  return product
}

function newSource(productId: string, kind: PoolSourceKind, filePath: string, origin: ClipOrigin, ref?: string): PoolSource {
  const now = Date.now()
  return {
    id: randomUUID(),
    productId,
    kind,
    filePath,
    fileName: basename(filePath),
    origin,
    ref,
    status: 'pending',
    clipCount: 0,
    createdAt: now,
    updatedAt: now,
  }
}

export type LinkedScan = Record<'product_asset' | 'clone_output' | 'creative_studio' | 'live_photo', number>

/**
 * Every video already tied to the product anywhere in the app:
 * product segment footage, finished AI clone videos, TikTok creative-studio shots and Live Photo motion videos.
 * Each module is read independently so one broken store doesn't hide the others.
 */
async function collectLinkedSources(product: Product): Promise<{ sources: PoolSource[]; scan: LinkedScan }> {
  const out: PoolSource[] = []
  const scan: LinkedScan = { product_asset: 0, clone_output: 0, creative_studio: 0, live_photo: 0 }
  const push = (kind: PoolSourceKind, fp: string | undefined, origin: ClipOrigin, ref?: string) => {
    const p = String(fp || '')
    if (!p || !VIDEO_EXT.test(p) || !existsSync(p)) return
    out.push(newSource(product.id, kind, p, origin, ref))
    scan[kind as keyof LinkedScan]++
  }

  for (const [segment, assets] of Object.entries(product.assets ?? {})) {
    for (const a of assets ?? []) push('product_asset', a?.filePath, 'real', segment)
  }
  try {
    for (const project of await cloneRepo.listProjects()) {
      if (project.productId === product.id) push('clone_output', (project as any).finalCompose?.outputPath, 'ai', project.id)
    }
  } catch {
    /* clone store unavailable */
  }
  try {
    const { tiktokCreativeStudioRepo } = await import('../tiktok-creative-studio/repo')
    for (const task of await tiktokCreativeStudioRepo.list()) {
      if (task.productId !== product.id) continue
      // The clean render first: burned-in subtitles would clash with the mix's own captions.
      for (const shot of task.shots ?? []) push('creative_studio', shot.resultVideoPath || shot.subtitleVideoPath, 'ai', `${task.id}:${shot.shotId}`)
    }
  } catch {
    /* creative studio store unavailable */
  }
  try {
    const { livePhotoRepo } = await import('../live-photo/repo')
    for (const item of await livePhotoRepo.list()) {
      if (item.productId !== product.id) continue
      push('live_photo', item.motionVideoPath || item.originalMotionVideoPath, 'ai', item.id)
    }
  } catch {
    /* live photo store unavailable */
  }
  return { sources: out, scan }
}

function buildOverview(productId: string, sources: PoolSource[], clips: PoolClip[]): MixPoolOverview {
  const usable = clips.filter((c) => !c.disabled)
  const byRole = CLIP_ROLES.map((role) => {
    const list = usable.filter((c) => effectiveClipRole(c) === role)
    return {
      role,
      count: list.length,
      realCount: list.filter((c) => c.origin === 'real').length,
      totalSec: Math.round(list.reduce((s, c) => s + c.durationSec, 0) * 10) / 10,
    }
  })
  const tagged = usable.filter((c) => effectiveClipRole(c))
  return {
    productId,
    sources: sources.sort((a, b) => b.createdAt - a.createdAt),
    clips: clips.sort((a, b) => (a.sourceId === b.sourceId ? a.startSec - b.startSec : a.createdAt - b.createdAt)),
    stats: {
      sourceCount: sources.length,
      clipCount: usable.length,
      taggedCount: tagged.length,
      realCount: usable.filter((c) => c.origin === 'real').length,
      aiCount: usable.filter((c) => c.origin === 'ai').length,
      byRole,
      missingRoles: tagged.length ? CORE_CLIP_ROLES.filter((r) => !byRole.find((x) => x.role === r)?.count) : [],
      mismatchCount: usable.filter((c) => c.tags?.matchesProduct === false && !c.roleOverride).length,
    },
  }
}

async function splitPending(productId: string) {
  const { sources } = await mixPoolRepo.listByProduct(productId)
  const pending = sources.filter((s) => s.status === 'pending')
  for (let i = 0; i < pending.length; i++) {
    const src = pending[i]!
    emit({ productId, phase: 'split', done: i, total: pending.length, message: src.fileName })
    await mixPoolRepo.patchSource(src.id, { status: 'splitting', error: undefined })
    try {
      const { clips, meta } = await splitSourceIntoClips(src)
      await mixPoolRepo.replaceSourceClips(src.id, clips, { ...meta, status: 'ready', error: undefined })
    } catch (e: any) {
      await mixPoolRepo.patchSource(src.id, { status: 'failed', error: String(e?.message ?? e).slice(0, 300) })
    }
  }
  if (pending.length) emit({ productId, phase: 'split', done: pending.length, total: pending.length })
}

async function tagUntagged(productId: string, opts: { clipIds?: string[]; force?: boolean }) {
  const product = await getProduct(productId)
  const { sources, clips } = await mixPoolRepo.listByProduct(productId)
  const wanted = opts.clipIds?.length ? new Set(opts.clipIds) : null
  const queue = clips.filter((c) => (wanted ? wanted.has(c.id) : true) && (opts.force || c.tagStatus === 'untagged' || c.tagStatus === 'failed'))
  if (!queue.length) return
  const sourceById = new Map(sources.map((s) => [s.id, s]))

  let target = null
  try {
    target = resolveVisionTarget(await cloneService.getModelCredentials())
  } catch {
    target = null
  }

  const referenceImagePath = target ? await productReferenceImage(product) : null
  let done = 0
  emit({ productId, phase: 'tag', done, total: queue.length, message: target ? `AI: ${target.model}` : '规则识别' })
  for (let i = 0; i < queue.length; i += TAG_BATCH_SIZE) {
    const batch = queue.slice(i, i + TAG_BATCH_SIZE)
    await mixPoolRepo.patchClips(batch.map((c) => ({ id: c.id, patch: { tagStatus: 'tagging' as const } })))
    let aiTags: Array<ReturnType<typeof heuristicTags> | null> = batch.map(() => null)
    let aiError = ''
    if (target) {
      try {
        aiTags = await tagClipBatchWithAi({ target, product, clips: batch, referenceImagePath })
      } catch (e: any) {
        aiError = String(e?.message ?? e).slice(0, 300)
      }
    }
    await mixPoolRepo.patchClips(
      batch.map((clip, k) => {
        const tags = aiTags[k]
        if (tags) return { id: clip.id, patch: { tags, tagStatus: 'tagged' as const, tagProvider: `ai:${effectiveModel(target!)}`, tagError: undefined } }
        if (target && aiError) {
          // Keep a usable rule-based guess but flag it, so a retry can upgrade it to AI tags.
          return { id: clip.id, patch: { tags: heuristicTags(clip, sourceById.get(clip.sourceId)), tagStatus: 'failed' as const, tagProvider: 'heuristic', tagError: aiError } }
        }
        return { id: clip.id, patch: { tags: heuristicTags(clip, sourceById.get(clip.sourceId)), tagStatus: 'tagged' as const, tagProvider: 'heuristic', tagError: target ? '模型未返回该镜头' : undefined } }
      }),
    )
    done += batch.length
    emit({ productId, phase: 'tag', done, total: queue.length })
  }
}

function runExclusive(productId: string, job: () => Promise<void>) {
  const existing = running.get(productId)
  if (existing) return existing
  const p = (async () => {
    try {
      await job()
    } finally {
      running.delete(productId)
      emit({ productId, phase: 'done', done: 0, total: 0 })
    }
  })()
  running.set(productId, p)
  return p
}

async function ensureStuckReset() {
  stuckReset ??= mixPoolRepo.resetStuck().catch(() => undefined)
  await stuckReset
}

export const mixPoolService = {
  setProgressListener(fn: ProgressListener | null) {
    progressListener = fn
  },

  async overview(productId: string): Promise<MixPoolOverview> {
    await ensureStuckReset()
    const { sources, clips } = await mixPoolRepo.listByProduct(productId)
    return buildOverview(productId, sources, clips)
  },

  isRunning(productId: string) {
    return running.has(productId)
  },

  /** Pulls in product footage + AI clone outputs not yet in the pool. */
  async syncLinked(productId: string) {
    await ensureStuckReset()
    const product = await getProduct(productId)
    const { sources, scan } = await collectLinkedSources(product)
    const added = await mixPoolRepo.addSources(productId, sources)
    return { added: added.length, found: sources.length, scan }
  },

  async importFiles(productId: string, paths: string[], origin: ClipOrigin) {
    await getProduct(productId)
    const list = paths.map((p) => String(p || '').trim()).filter((p) => p && VIDEO_EXT.test(p) && existsSync(p))
    const added = await mixPoolRepo.addSources(productId, list.map((p) => newSource(productId, 'import', p, origin)))
    return { added: added.length, skipped: paths.length - added.length }
  },

  /** Splits every pending source, then tags every untagged shot. Runs in background; progress via listener. */
  process(productId: string) {
    void runExclusive(productId, async () => {
      await splitPending(productId)
      await tagUntagged(productId, {})
    })
    return { started: true }
  },

  retag(productId: string, clipIds?: string[]) {
    void runExclusive(productId, () => tagUntagged(productId, { clipIds, force: true }))
    return { started: true }
  },

  async resplitSource(sourceId: string, productId: string) {
    await mixPoolRepo.patchSource(sourceId, { status: 'pending', error: undefined })
    return this.process(productId)
  },

  async updateClip(id: string, patch: { roleOverride?: ClipRole | null; disabled?: boolean }) {
    const next: Partial<PoolClip> = {}
    if ('roleOverride' in patch) next.roleOverride = patch.roleOverride && (CLIP_ROLES as readonly string[]).includes(patch.roleOverride) ? patch.roleOverride : undefined
    if (typeof patch.disabled === 'boolean') next.disabled = patch.disabled
    const [clip] = await mixPoolRepo.patchClips([{ id, patch: next }])
    return clip ?? null
  },

  async setSourceOrigin(sourceId: string, origin: ClipOrigin) {
    const src = await mixPoolRepo.patchSource(sourceId, { origin })
    if (!src) return null
    const { clips } = await mixPoolRepo.listByProduct(src.productId)
    await mixPoolRepo.patchClips(clips.filter((c) => c.sourceId === sourceId).map((c) => ({ id: c.id, patch: { origin } })))
    return src
  },

  async removeSource(sourceId: string) {
    const src = await mixPoolRepo.removeSource(sourceId)
    if (src) await rm(mixPoolFramesDir(src.productId, src.id), { recursive: true, force: true }).catch(() => undefined)
    return { ok: Boolean(src) }
  },
}
