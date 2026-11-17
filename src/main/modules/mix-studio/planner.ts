import { randomUUID } from 'node:crypto'
import { effectiveClipRole, type ClipRole, type PoolClip, type PoolSource } from '../../../shared/mixPool'
import type { FormulaBeat, MixDraft, MixDraftShot, MixFormula } from '../../../shared/mixFormula'

const MIN_SHOT_SEC = 0.6
const MIN_QUALITY = 30
const FILLER_ROLES: ClipRole[] = ['detail', 'wear', 'demo', 'proof']

const r3 = (n: number) => Math.round(n * 1000) / 1000
const rand = (min: number, max: number) => min + Math.random() * (max - min)

export type PlannerPool = {
  clips: PoolClip[]
  sourceById: Map<string, PoolSource>
}

/** Batch-wide memory so N videos from one pool don't all open with the same hook or reuse the same shots. */
export type BatchUsage = {
  clipUse: Map<string, number>
  hookUse: Map<string, number>
  signatures: string[][]
}

export function createBatchUsage(): BatchUsage {
  return { clipUse: new Map(), hookUse: new Map(), signatures: [] }
}

function usable(pool: PlannerPool, allowAi: boolean) {
  const base = pool.clips.filter(
    (c) =>
      !c.disabled &&
      effectiveClipRole(c) &&
      c.durationSec >= MIN_SHOT_SEC &&
      (c.tags?.quality ?? 50) >= MIN_QUALITY &&
      // Showing a different product than the one being sold kills trust (and breaks TikTok Shop rules);
      // a manual role assignment is the user's explicit override.
      (c.tags?.matchesProduct !== false || Boolean(c.roleOverride)),
  )
  const real = base.filter((c) => c.origin !== 'ai')
  // AI shots are a fallback: only used when allowed, or when the pool has no real footage at all.
  return allowAi || !real.length ? base : real
}

function roleTier(clip: PoolClip, beat: FormulaBeat): number {
  const role = effectiveClipRole(clip)
  if (role === beat.role) return 30
  if (clip.tags?.secondaryRoles?.includes(beat.role)) return 18
  if (role && beat.altRoles?.includes(role)) return 12
  return 0
}

export type PlannerBias = {
  /** Learned per-hook-shot multipliers (≈0.5-1.6) from past results. */
  hookWeights?: Map<string, number>
  /** Force this clip as the opener (winner remakes). */
  pinHookClipId?: string
}

function scoreClip(clip: PoolClip, beat: FormulaBeat, beatIndex: number, usage: BatchUsage, jitter: number, bias?: PlannerBias) {
  const tier = roleTier(clip, beat)
  if (!tier) return -Infinity
  const t = clip.tags
  const isOpener = beatIndex === 0
  let s = tier + (t?.quality ?? 50) * 0.4
  if (clip.origin === 'real') s += 18
  if (t?.hasText) s -= 10
  if (t?.looksAi && clip.origin !== 'ai') s -= 8
  if (t?.hasProduct === false && beat.role !== 'pain_point' && beat.role !== 'broll') s -= 15
  if (isOpener) {
    s += (t?.hookScore ?? 30) * 0.6
    s -= (usage.hookUse.get(clip.id) ?? 0) * 60
    const w = bias?.hookWeights?.get(clip.id)
    // A proven opener earns back more than the reuse penalty; a proven dud is pushed down.
    if (w !== undefined) s += (w - 1) * 90
  }
  s -= (usage.clipUse.get(clip.id) ?? 0) * 22
  return s + Math.random() * jitter
}

function toShot(clip: PoolClip, beat: FormulaBeat, sourceById: Map<string, PoolSource>, opener: boolean): MixDraftShot {
  const want = rand(beat.durationSec.min, beat.durationSec.max)
  const dur = Math.max(Math.min(MIN_SHOT_SEC, clip.durationSec), Math.min(want, clip.durationSec))
  const slack = Math.max(0, clip.durationSec - dur)
  // Openers start at the beginning of the action; other beats take a random slice of the shot.
  const offset = opener ? Math.min(slack, 0.1) : rand(0, slack)
  const src = sourceById.get(clip.sourceId)
  return {
    clipId: clip.id,
    role: beat.role,
    filePath: clip.filePath,
    thumbnailPath: clip.thumbnailPath,
    startSec: r3(clip.startSec + offset),
    durationSec: r3(dur),
    clipStartSec: clip.startSec,
    clipEndSec: clip.endSec,
    sourceDurationSec: Number(src?.durationSec || clip.endSec),
    origin: clip.origin,
    description: clip.tags?.description,
  }
}

function jaccard(a: string[], b: string[]) {
  const A = new Set(a)
  const B = new Set(b)
  let inter = 0
  for (const x of A) if (B.has(x)) inter++
  const union = A.size + B.size - inter
  return union ? inter / union : 0
}

/** Picks one shot per beat. Returns null when a required beat can't be filled at all. */
function planOnce(pool: PlannerPool, formula: MixFormula, usage: BatchUsage, allowAi: boolean, jitter: number, bias?: PlannerBias) {
  const candidates = usable(pool, allowAi)
  const used = new Set<string>()
  const shots: MixDraftShot[] = []
  const warnings: string[] = []
  formula.beats.forEach((beat, i) => {
    let best: PoolClip | null = null
    let bestScore = -Infinity
    const pinned = shots.length === 0 && bias?.pinHookClipId ? pool.clips.find((c) => c.id === bias.pinHookClipId && !c.disabled) : undefined
    if (pinned) {
      used.add(pinned.id)
      shots.push(toShot(pinned, beat, pool.sourceById, true))
      return
    }
    for (const c of candidates) {
      if (used.has(c.id)) continue
      const s = scoreClip(c, beat, shots.length === 0 ? 0 : i || 1, usage, jitter, bias)
      if (s > bestScore) {
        bestScore = s
        best = c
      }
    }
    if (!best && shots.length === 0) {
      // No hook-like shot: open with the highest hook score we have rather than fail.
      best = candidates.filter((c) => !used.has(c.id)).sort((a, b) => (b.tags?.hookScore ?? 0) - (a.tags?.hookScore ?? 0))[0] ?? null
      if (best) warnings.push('没有钩子镜头，已用钩子分最高的镜头开场')
    }
    if (!best) {
      if (!beat.optional) warnings.push(`缺少「${beat.role}」镜头，已跳过该段`)
      return
    }
    used.add(best.id)
    shots.push(toShot(best, beat, pool.sourceById, shots.length === 0))
  })
  return { shots, warnings }
}

export function planDraftShots(input: {
  pool: PlannerPool
  formula: MixFormula
  usage: BatchUsage
  allowAi: boolean
  bias?: PlannerBias
}): { shots: MixDraftShot[]; warnings: string[] } | null {
  let attempt = planOnce(input.pool, input.formula, input.usage, input.allowAi, 12, input.bias)
  // Re-roll with more randomness when this cut is too close to one already in the batch.
  for (let tries = 0; tries < 4; tries++) {
    const sig = attempt.shots.map((s) => s.clipId)
    if (!input.usage.signatures.some((prev) => jaccard(prev, sig) > 0.75)) break
    attempt = planOnce(input.pool, input.formula, input.usage, input.allowAi, 30 + tries * 20, input.bias)
    if (tries === 3) attempt.warnings.push('素材不足，这条与本批其他视频镜头重合较多')
  }
  if (attempt.shots.length < 2) return null
  return attempt
}

export function commitUsage(usage: BatchUsage, shots: MixDraftShot[]) {
  shots.forEach((s, i) => {
    usage.clipUse.set(s.clipId, (usage.clipUse.get(s.clipId) ?? 0) + 1)
    if (i === 0) usage.hookUse.set(s.clipId, (usage.hookUse.get(s.clipId) ?? 0) + 1)
  })
  usage.signatures.unshift(shots.map((s) => s.clipId))
}

export function totalOf(shots: MixDraftShot[]) {
  return r3(shots.reduce((a, s) => a + s.durationSec, 0))
}

/**
 * Stretches / trims shot lengths (inside each pool clip's range) so the cut is about `targetSec` long,
 * adding filler shots before the CTA when the clips are simply too short for the voiceover.
 */
export function fitDraftToDuration(input: {
  shots: MixDraftShot[]
  targetSec: number
  pool: PlannerPool
  usage: BatchUsage
  allowAi: boolean
}): { shots: MixDraftShot[]; added: number } {
  let shots = input.shots.map((s) => ({ ...s }))
  const target = Math.max(4, input.targetSec)
  const room = (s: MixDraftShot) => s.clipEndSec - s.clipStartSec

  const grow = () => {
    let total = totalOf(shots)
    for (let it = 0; it < 6 && total < target - 0.05; it++) {
      const growable = shots.filter((s) => room(s) - s.durationSec > 0.05)
      if (!growable.length) break
      const each = (target - total) / growable.length
      for (const s of growable) {
        const next = Math.min(room(s), s.durationSec + each)
        s.durationSec = r3(next)
        // Keep the shot inside its clip: slide the start back when growing past the clip end.
        if (s.startSec + s.durationSec > s.clipEndSec) s.startSec = r3(Math.max(s.clipStartSec, s.clipEndSec - s.durationSec))
      }
      total = totalOf(shots)
    }
    return total
  }

  let total = totalOf(shots)
  if (total > target + 0.3) {
    // Too long: trim proportionally, never below the minimum shot length; the opener keeps its punch.
    const f = target / total
    shots = shots.map((s) => ({ ...s, durationSec: r3(Math.max(MIN_SHOT_SEC, s.durationSec * f)) }))
    return { shots, added: 0 }
  }
  total = grow()

  let added = 0
  const usedIds = new Set(shots.map((s) => s.clipId))
  while (total < target - 0.4 && added < 4) {
    const role = FILLER_ROLES[added % FILLER_ROLES.length]!
    const beat: FormulaBeat = { role, altRoles: FILLER_ROLES.filter((r) => r !== role), durationSec: { min: 1.5, max: 3 } }
    const cands = usable(input.pool, input.allowAi).filter((c) => !usedIds.has(c.id))
    let best: PoolClip | null = null
    let bestScore = -Infinity
    for (const c of cands) {
      const s = scoreClip(c, beat, 1, input.usage, 12)
      if (s > bestScore) {
        bestScore = s
        best = c
      }
    }
    if (!best) break
    usedIds.add(best.id)
    const shot = toShot(best, beat, input.pool.sourceById, false)
    const ctaIdx = shots.length > 1 && shots[shots.length - 1]!.role === 'cta' ? shots.length - 1 : shots.length
    shots.splice(ctaIdx, 0, shot)
    added++
    total = grow()
  }
  return { shots, added }
}

export function newDraft(formula: MixFormula, shots: MixDraftShot[], warnings: string[]): MixDraft {
  return {
    id: randomUUID(),
    formulaId: formula.id,
    formulaName: formula.name,
    shots,
    title: '',
    voiceover: '',
    totalDurationSec: totalOf(shots),
    scriptSource: 'none',
    warnings,
  }
}
