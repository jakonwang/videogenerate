import { join } from 'node:path'
import { stat } from 'node:fs/promises'
import { getAppPaths } from '../../lib/paths'
import { readJsonFile, writeJsonFile } from '../../lib/storeJson'
import type { VideoTask } from '../tasks/types'
import { mixPoolRepo, normalizePathKey } from '../mix-pool/repo'
import {
  GRADE_SCORE,
  SCORE_PRIOR,
  SCORE_PRIOR_WEIGHT,
  type CreativeGrade,
  type MixCreativeOption,
  type MixInsights,
  type MixLedgerEntry,
  type MixLedgerPerformance,
  type MixRefreshResult,
  type MixScoreRow,
} from '../../../shared/mixInsights'

type DbShape = { entries: MixLedgerEntry[] }

/** Minimal views of the GMV Max / publisher records this module reads (keeps those modules optional). */
export type CreativeVideoLike = {
  creativeId: string
  campaignId: string
  name: string
  grade: CreativeGrade
  coverUrl?: string
  externalUrl?: string
  durationSeconds?: number
  freshness?: 'fresh' | 'stale' | 'missing'
  performance: {
    available: boolean
    spend?: string
    gmv?: string
    roi?: string
    orders?: string
    ctr?: string
    cvr?: string
    play2sRate?: string
    playDepth?: string
  }
}
export type PublishTaskLike = { id: string; sourceVideoPath?: string; sourceRef?: string; videoTitle?: string; description?: string; state?: string }

const filePath = () => join(getAppPaths().dbDir, 'mix-ledger.json')

let chain: Promise<unknown> = Promise.resolve()
async function load(): Promise<DbShape> {
  const db = await readJsonFile<DbShape>(filePath(), { entries: [] })
  return { entries: Array.isArray(db.entries) ? db.entries : [] }
}
function mutate<T>(fn: (db: DbShape) => T | Promise<T>): Promise<T> {
  const next = chain.then(async () => {
    const db = await load()
    const out = await fn(db)
    await writeJsonFile(filePath(), db)
    return out
  })
  chain = next.catch(() => undefined)
  return next
}

const num = (v: unknown) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

// ---------- text matching ----------

/** Lowercased letters/digits only (any script), hashtags and mentions dropped. */
export function normalizeCaption(s: string) {
  return String(s || '')
    .toLowerCase()
    .replace(/[#@][^\s#@]+/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, '')
}

/** Character-bigram Dice similarity; script-agnostic (works for Vietnamese, Chinese, Thai). */
export function captionSimilarity(a: string, b: string) {
  const x = normalizeCaption(a)
  const y = normalizeCaption(b)
  if (x.length < 4 || y.length < 4) return 0
  if (x === y) return 1
  if ((x.length >= 10 && y.includes(x)) || (y.length >= 10 && x.includes(y))) return 0.9
  const grams = (s: string) => {
    const m = new Map<string, number>()
    const chars = [...s]
    for (let i = 0; i < chars.length - 1; i++) {
      const g = chars[i]! + chars[i + 1]!
      m.set(g, (m.get(g) ?? 0) + 1)
    }
    return m
  }
  const A = grams(x)
  const B = grams(y)
  let inter = 0
  let total = 0
  for (const v of A.values()) total += v
  for (const v of B.values()) total += v
  for (const [g, v] of A) inter += Math.min(v, B.get(g) ?? 0)
  return total ? (2 * inter) / total : 0
}

function toPerformance(c: CreativeVideoLike): MixLedgerPerformance {
  const p = c.performance
  return {
    grade: c.grade,
    spend: num(p.spend),
    gmv: num(p.gmv),
    roi: num(p.roi),
    orders: num(p.orders),
    ctr: num(p.ctr),
    cvr: num(p.cvr),
    play2sRate: num(p.play2sRate),
    playDepth: num(p.playDepth),
    freshness: c.freshness,
    syncedAt: Date.now(),
  }
}

/**
 * Proposes ledger→creative links. Evidence, strongest first:
 *  1. a publish task made from this exact file (sourceRef `mix:<id>` or same path) whose title/caption matches the creative name;
 *  2. the video's own on-screen hook title / voiceover opening matching the creative name (stricter threshold).
 * Duration, when both sides know it, must agree within 1.5s. Each creative links to at most one video.
 */
export function proposeLinks(entries: MixLedgerEntry[], creatives: CreativeVideoLike[], publishTasks: PublishTaskLike[]) {
  const taken = new Set(entries.filter((e) => e.link).map((e) => e.link!.creativeId))
  const pubByEntry = new Map<string, PublishTaskLike[]>()
  for (const e of entries) {
    const key = normalizePathKey(e.outPath)
    pubByEntry.set(
      e.id,
      publishTasks.filter((t) => t.sourceRef === `mix:${e.id}` || (t.sourceVideoPath && normalizePathKey(t.sourceVideoPath) === key)),
    )
  }
  const candidates: Array<{ entryId: string; creative: CreativeVideoLike; confidence: number }> = []
  for (const e of entries) {
    if (e.link || e.linkLocked) continue
    const pubTexts = (pubByEntry.get(e.id) ?? []).flatMap((t) => [t.videoTitle, t.description]).filter((x): x is string => Boolean(x))
    const ownTexts = [e.title, e.voiceover.split(/(?<=[.!?。！？])\s*/)[0] ?? ''].filter(Boolean)
    for (const c of creatives) {
      if (taken.has(c.creativeId)) continue
      if (c.durationSeconds && e.durationSec && Math.abs(c.durationSeconds - e.durationSec) > 1.5) continue
      const pubSim = Math.max(0, ...pubTexts.map((t) => captionSimilarity(t, c.name)))
      const ownSim = Math.max(0, ...ownTexts.map((t) => captionSimilarity(t, c.name)))
      const durBonus = c.durationSeconds && e.durationSec ? 0.05 : 0
      const confidence = pubSim >= 0.6 ? Math.min(1, pubSim + 0.05 + durBonus) : ownSim >= 0.75 ? Math.min(0.95, ownSim - 0.05 + durBonus) : 0
      if (confidence > 0) candidates.push({ entryId: e.id, creative: c, confidence })
    }
  }
  candidates.sort((a, b) => b.confidence - a.confidence)
  const usedEntries = new Set<string>()
  const out: Array<{ entryId: string; creative: CreativeVideoLike; confidence: number }> = []
  for (const cand of candidates) {
    if (usedEntries.has(cand.entryId) || taken.has(cand.creative.creativeId)) continue
    usedEntries.add(cand.entryId)
    taken.add(cand.creative.creativeId)
    out.push(cand)
  }
  return out
}

// ---------- scoring ----------

/** 0-1 conversion score of one measured video: grade, nudged by ROI and CVR when there is spend. */
export function videoScore(p: MixLedgerPerformance) {
  let s = GRADE_SCORE[p.grade] ?? SCORE_PRIOR
  if ((p.spend ?? 0) > 0 && p.roi !== undefined) s += Math.max(-0.1, Math.min(0.1, (p.roi - 2) * 0.03))
  if (p.cvr !== undefined) s += Math.max(-0.05, Math.min(0.05, (p.cvr - 0.02) * 1.5))
  return Math.max(0, Math.min(1, s))
}

function rollup(groups: Map<string, { label: string; thumb?: string; entries: MixLedgerEntry[] }>): MixScoreRow[] {
  const rows: MixScoreRow[] = []
  for (const [key, g] of groups) {
    const measured = g.entries.filter((e) => e.performance)
    const scores = measured.map((e) => videoScore(e.performance!))
    const score = (scores.reduce((a, b) => a + b, 0) + SCORE_PRIOR * SCORE_PRIOR_WEIGHT) / (scores.length + SCORE_PRIOR_WEIGHT)
    const avg = (pick: (p: MixLedgerPerformance) => number | undefined) => {
      const v = measured.map((e) => pick(e.performance!)).filter((x): x is number => x !== undefined)
      return v.length ? v.reduce((a, b) => a + b, 0) / v.length : undefined
    }
    rows.push({
      key,
      label: g.label,
      rendered: g.entries.length,
      measured: measured.length,
      sCount: measured.filter((e) => e.performance!.grade === 'S').length,
      aCount: measured.filter((e) => e.performance!.grade === 'A').length,
      score: Math.round(score * 1000) / 1000,
      // Neutral prior → 1.0; a proven winner group → up to ~1.6; a group of C's → ~0.55.
      weight: Math.round((0.4 + 1.5 * score) * 100) / 100,
      avgCtr: avg((p) => p.ctr),
      avgCvr: avg((p) => p.cvr),
      avgRoi: avg((p) => ((p.spend ?? 0) > 0 ? p.roi : undefined)),
      thumbnailPath: g.thumb,
    })
  }
  return rows.sort((a, b) => b.score - a.score || b.measured - a.measured)
}

export function buildInsights(entries: MixLedgerEntry[], productId?: string): MixInsights {
  const scoped = productId ? entries.filter((e) => e.productId === productId) : entries
  const byFormula = new Map<string, { label: string; entries: MixLedgerEntry[] }>()
  const byStyle = new Map<string, { label: string; entries: MixLedgerEntry[] }>()
  const byHook = new Map<string, { label: string; thumb?: string; entries: MixLedgerEntry[] }>()
  const add = <T extends { entries: MixLedgerEntry[] }>(m: Map<string, T>, key: string, init: () => T, e: MixLedgerEntry) => {
    if (!key) return
    if (!m.has(key)) m.set(key, init())
    m.get(key)!.entries.push(e)
  }
  for (const e of scoped) {
    add(byFormula, e.formulaId, () => ({ label: e.formulaName, entries: [] }), e)
    if (e.hookStyle) add(byStyle, e.hookStyle, () => ({ label: e.hookStyle!, entries: [] }), e)
    add(byHook, e.hookClipId, () => ({ label: e.title || e.hookClipId.slice(0, 8), thumb: e.hookThumbnailPath, entries: [] }), e)
  }
  return {
    productId,
    totals: {
      rendered: scoped.length,
      published: scoped.filter((e) => e.publishTaskIds?.length).length,
      linked: scoped.filter((e) => e.link).length,
      measured: scoped.filter((e) => e.performance).length,
      winners: scoped.filter((e) => e.performance && (e.performance.grade === 'S' || e.performance.grade === 'A')).length,
    },
    formulas: rollup(byFormula),
    hookStyles: rollup(byStyle),
    hookClips: rollup(byHook).filter((r) => r.measured > 0),
    generatedAt: Date.now(),
  }
}

/** Weights the planner/script writer use. Formula & hook-style weights are learned across products; hook shots per product. */
export type MixLearnedWeights = {
  formula: Map<string, number>
  hookStyle: Map<string, number>
  hookClip: Map<string, number>
  measured: number
}

// ---------- ledger API ----------

export const mixLedger = {
  async list(productId?: string) {
    const db = await load()
    return (productId ? db.entries.filter((e) => e.productId === productId) : db.entries).sort((a, b) => b.renderedAt - a.renderedAt)
  },

  async get(id: string) {
    return (await load()).entries.find((e) => e.id === id) ?? null
  },

  /** Called when a mix render task finishes. Idempotent per task id. */
  async recordRender(task: VideoTask) {
    if (!task.mix || task.status !== 'done') return null
    const mix = task.mix
    let hookThumb: string | undefined
    try {
      hookThumb = (await mixPoolRepo.getClips([mix.hookClipId]))[0]?.thumbnailPath
    } catch {
      hookThumb = undefined
    }
    let exists = true
    try {
      await stat(task.outPath)
    } catch {
      exists = false
    }
    if (!exists) return null
    return mutate((db) => {
      const prev = db.entries.find((e) => e.id === task.id)
      const entry: MixLedgerEntry = {
        ...(prev ?? {}),
        id: task.id,
        productId: task.productId,
        outPath: task.outPath,
        renderedAt: prev?.renderedAt ?? Date.now(),
        durationSec: task.plan.totalDurationSec,
        mode: mix.mode,
        formulaId: mix.formulaId,
        formulaName: mix.formulaName,
        hookClipId: mix.hookClipId,
        hookThumbnailPath: hookThumb,
        clipIds: mix.clipIds,
        title: mix.title,
        voiceover: mix.voiceover,
        hookStyle: mix.hookStyle,
        language: mix.language,
      }
      db.entries = [entry, ...db.entries.filter((e) => e.id !== task.id)]
      return entry
    })
  },

  addPublishTasks(map: Array<{ entryId: string; publishTaskId: string }>) {
    return mutate((db) => {
      for (const { entryId, publishTaskId } of map) {
        const e = db.entries.find((x) => x.id === entryId)
        if (e) e.publishTaskIds = [...new Set([...(e.publishTaskIds ?? []), publishTaskId])]
      }
    })
  },

  setLink(entryId: string, creative: CreativeVideoLike | null) {
    return mutate((db) => {
      const e = db.entries.find((x) => x.id === entryId)
      if (!e) return null
      if (creative) {
        // A creative belongs to one video: drop it from any other entry first.
        for (const other of db.entries) if (other.id !== entryId && other.link?.creativeId === creative.creativeId) {
          other.link = undefined
          other.performance = undefined
        }
        e.link = {
          creativeId: creative.creativeId,
          campaignId: creative.campaignId,
          creativeName: creative.name,
          coverUrl: creative.coverUrl,
          externalUrl: creative.externalUrl,
          method: 'manual',
          linkedAt: Date.now(),
        }
        e.performance = creative.performance.available ? toPerformance(creative) : undefined
        e.linkLocked = false
      } else {
        e.link = undefined
        e.performance = undefined
        e.linkLocked = true
      }
      return e
    })
  },

  remove(entryId: string) {
    return mutate((db) => {
      db.entries = db.entries.filter((e) => e.id !== entryId)
    })
  },

  /** Re-reads creatives: refreshes metrics of linked videos and auto-links new ones. */
  applyCreatives(creatives: CreativeVideoLike[], publishTasks: PublishTaskLike[]) {
    return mutate((db) => {
      const byId = new Map(creatives.map((c) => [c.creativeId, c]))
      let updated = 0
      for (const e of db.entries) {
        const c = e.link ? byId.get(e.link.creativeId) : undefined
        if (!c) continue
        e.link = { ...e.link!, creativeName: c.name, coverUrl: c.coverUrl ?? e.link!.coverUrl, externalUrl: c.externalUrl ?? e.link!.externalUrl }
        if (c.performance.available) {
          e.performance = toPerformance(c)
          updated++
        }
      }
      const proposals = proposeLinks(db.entries, creatives, publishTasks)
      for (const p of proposals) {
        const e = db.entries.find((x) => x.id === p.entryId)!
        e.link = {
          creativeId: p.creative.creativeId,
          campaignId: p.creative.campaignId,
          creativeName: p.creative.name,
          coverUrl: p.creative.coverUrl,
          externalUrl: p.creative.externalUrl,
          method: 'auto',
          confidence: Math.round(p.confidence * 100) / 100,
          linkedAt: Date.now(),
        }
        if (p.creative.performance.available) e.performance = toPerformance(p.creative)
      }
      return { newlyLinked: proposals.length, updated }
    })
  },

  async insights(productId?: string) {
    return buildInsights(await this.list(), productId)
  },

  async learnedWeights(productId: string): Promise<MixLearnedWeights> {
    const all = await this.list()
    const global = buildInsights(all)
    const local = buildInsights(all, productId)
    const toMap = (rows: MixScoreRow[]) => new Map(rows.filter((r) => r.measured > 0).map((r) => [r.key, r.weight]))
    return {
      formula: toMap(global.formulas),
      hookStyle: toMap(global.hookStyles),
      hookClip: toMap(local.hookClips),
      measured: global.totals.measured,
    }
  },

  /** S/A videos of this product (or any product), best first: style references for new scripts. */
  async winners(productId: string, limit = 3) {
    const all = (await this.list()).filter((e) => e.performance && (e.performance.grade === 'S' || e.performance.grade === 'A') && e.voiceover)
    const score = (e: MixLedgerEntry) => videoScore(e.performance!) + (e.productId === productId ? 0.2 : 0)
    return all.sort((a, b) => score(b) - score(a)).slice(0, limit)
  },
}

export function creativeOptions(creatives: CreativeVideoLike[], entries: MixLedgerEntry[]): MixCreativeOption[] {
  const linked = new Map(entries.filter((e) => e.link).map((e) => [e.link!.creativeId, e.id]))
  const seen = new Set<string>()
  const out: MixCreativeOption[] = []
  for (const c of creatives) {
    if (seen.has(c.creativeId)) continue
    seen.add(c.creativeId)
    out.push({
      creativeId: c.creativeId,
      campaignId: c.campaignId,
      name: c.name,
      grade: c.grade,
      coverUrl: c.coverUrl,
      externalUrl: c.externalUrl,
      durationSeconds: c.durationSeconds,
      linkedTo: linked.get(c.creativeId),
    })
  }
  return out
}

export type { MixRefreshResult }
