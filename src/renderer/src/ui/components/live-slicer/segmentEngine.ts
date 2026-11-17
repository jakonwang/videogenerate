/**
 * Turns the raw signals from `liveSlicer:analyze` (half-second loudness + visual cut points)
 * into clip candidates. Pure and synchronous so the page can re-slice on every parameter change.
 */

export type LiveSegment = {
  id: string
  start: number
  end: number
  title: string
  /** 0..100, relative to the rest of the recording; null for manual clips. */
  score: number | null
  origin: 'auto' | 'manual'
  selected: boolean
}

export type SliceMode = 'highlight' | 'pause' | 'interval' | 'manual'

export type SliceParams = {
  minSec: number
  maxSec: number
  maxClips: number
  /** 0..1: higher keeps more of the recording as highlight candidates. */
  sensitivity: number
  intervalSec: number
  skipSilence: boolean
}

export type Signals = {
  durationSec: number
  step: number
  energy: number[]
  scenes: Array<[number, number]>
}

let seq = 0
export function newSegmentId() {
  seq += 1
  return `seg_${Date.now().toString(36)}_${seq}`
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v))
}

function median(values: number[]) {
  if (!values.length) return 0
  const s = [...values].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

function quantile(values: number[], q: number) {
  if (!values.length) return 0
  const s = [...values].sort((a, b) => a - b)
  return s[clamp(Math.floor(q * (s.length - 1)), 0, s.length - 1)]
}

function smooth(values: number[], radius: number) {
  if (radius <= 0) return values.slice()
  const out = new Array<number>(values.length)
  let sum = 0
  let count = 0
  // sliding window [i - radius, i + radius]
  for (let i = 0; i < Math.min(values.length, radius); i += 1) {
    sum += values[i]
    count += 1
  }
  for (let i = 0; i < values.length; i += 1) {
    const add = i + radius
    if (add < values.length) {
      sum += values[add]
      count += 1
    }
    const drop = i - radius - 1
    if (drop >= 0) {
      sum -= values[drop]
      count -= 1
    }
    out[i] = sum / Math.max(1, count)
  }
  return out
}

type Prepared = {
  step: number
  n: number
  duration: number
  raw: number[]
  /** per-sample interest score (robust z of loudness + visual-change boost) */
  score: number[]
  quietDb: number
  silentDb: number
  hasAudio: boolean
}

function prepare(sig: Signals): Prepared {
  const step = sig.step > 0 ? sig.step : 0.5
  const duration = Math.max(0, sig.durationSec)
  const n = Math.max(1, Math.ceil(duration / step))
  const hasAudio = sig.energy.length > 0
  const raw = new Array<number>(n)
  for (let i = 0; i < n; i += 1) raw[i] = hasAudio ? (sig.energy[i] ?? -90) : -40

  const voiced = raw.filter((v) => v > -70)
  const med = median(voiced.length ? voiced : raw)
  const mad = median((voiced.length ? voiced : raw).map((v) => Math.abs(v - med))) * 1.4826 || 3
  const loud = smooth(raw, Math.round(1.5 / step))

  // Visual changes: spread each cut over ±2 s so it lifts the surrounding window.
  const sceneBoost = new Array<number>(n).fill(0)
  const spread = Math.round(2 / step)
  for (const [t, s] of sig.scenes) {
    const c = Math.round(t / step)
    for (let k = -spread; k <= spread; k += 1) {
      const i = c + k
      if (i >= 0 && i < n) sceneBoost[i] = Math.max(sceneBoost[i], s * (1 - Math.abs(k) / (spread + 1)))
    }
  }

  // Excitement also shows up as loudness variation (laughs, shouting, applause).
  const dyn = smooth(raw.map((v, i) => (i ? Math.abs(v - raw[i - 1]) : 0)), Math.round(2 / step))
  const dynMed = median(dyn) || 1

  const score = new Array<number>(n)
  for (let i = 0; i < n; i += 1) {
    const z = hasAudio ? clamp((loud[i] - med) / mad, -4, 4) : 0
    const d = hasAudio ? clamp(dyn[i] / dynMed - 1, -1, 3) * 0.35 : 0
    score[i] = z + d + sceneBoost[i] * (hasAudio ? 1.2 : 3)
  }

  return {
    step,
    n,
    duration,
    raw,
    score: smooth(score, Math.round(2 / step)),
    quietDb: hasAudio ? Math.min(med - 8, -30) : -Infinity,
    silentDb: hasAudio ? Math.min(med - 18, -48) : -Infinity,
    hasAudio,
  }
}

/** Nearest quiet sample within `windowSec` of `t`, so cuts land between sentences. */
function snapToPause(p: Prepared, t: number, windowSec: number, lo: number, hi: number) {
  if (!p.hasAudio) return clamp(t, lo, hi)
  const c = Math.round(t / p.step)
  const w = Math.round(windowSec / p.step)
  let best = c
  let bestDb = Infinity
  for (let k = -w; k <= w; k += 1) {
    const i = c + k
    if (i < 0 || i >= p.n) continue
    const ti = i * p.step
    if (ti < lo || ti > hi) continue
    // prefer the quietest point, lightly biased towards the original position
    const db = p.raw[i] + Math.abs(k) * 0.4
    if (db < bestDb) {
      bestDb = db
      best = i
    }
  }
  return clamp(best * p.step, lo, hi)
}

function meanScore(p: Prepared, start: number, end: number) {
  const a = clamp(Math.floor(start / p.step), 0, p.n - 1)
  const b = clamp(Math.ceil(end / p.step), a + 1, p.n)
  let sum = 0
  for (let i = a; i < b; i += 1) sum += p.score[i]
  return sum / (b - a)
}

function meanDb(p: Prepared, start: number, end: number) {
  const a = clamp(Math.floor(start / p.step), 0, p.n - 1)
  const b = clamp(Math.ceil(end / p.step), a + 1, p.n)
  let sum = 0
  for (let i = a; i < b; i += 1) sum += p.raw[i]
  return sum / (b - a)
}

/** Maps raw window scores onto 0..100 by rank so the numbers read the same on every video. */
function rankScores(p: Prepared, ranges: Array<{ start: number; end: number }>) {
  const raw = ranges.map((r) => meanScore(p, r.start, r.end))
  const sorted = [...raw].sort((a, b) => a - b)
  return raw.map((v) => {
    const below = sorted.findIndex((x) => x >= v)
    const rank = sorted.length > 1 ? below / (sorted.length - 1) : 1
    return Math.round(55 + rank * 44)
  })
}

function toSegments(ranges: Array<{ start: number; end: number; score?: number }>, prefix: string): LiveSegment[] {
  return ranges.map((r, i) => ({
    id: newSegmentId(),
    start: Math.round(r.start * 10) / 10,
    end: Math.round(r.end * 10) / 10,
    title: `${prefix} ${i + 1}`,
    score: r.score ?? null,
    origin: 'auto' as const,
    selected: true,
  }))
}

function buildHighlights(p: Prepared, params: SliceParams) {
  const minSec = clamp(params.minSec, 3, 600)
  const maxSec = clamp(Math.max(params.maxSec, minSec), minSec, 900)
  const minN = Math.round(minSec / p.step)
  const maxN = Math.round(maxSec / p.step)
  const hotShare = 0.12 + clamp(params.sensitivity, 0, 1) * 0.38
  const threshold = quantile(p.score, 1 - hotShare)

  // 1. hot regions, merging gaps shorter than 3 s
  const regions: Array<[number, number]> = []
  const gap = Math.round(3 / p.step)
  let i = 0
  while (i < p.n) {
    if (p.score[i] < threshold) {
      i += 1
      continue
    }
    let j = i
    while (j < p.n && p.score[j] >= threshold) j += 1
    const last = regions[regions.length - 1]
    if (last && i - last[1] <= gap) last[1] = j
    else regions.push([i, j])
    i = j
  }

  // 2. fit each region into [min, max]: grow around the peak or split long ones
  const windows: Array<[number, number]> = []
  for (const [a, b] of regions) {
    const len = b - a
    if (len > maxN) {
      const parts = Math.ceil(len / maxN)
      const size = Math.max(minN, Math.floor(len / parts))
      for (let k = 0; k < parts; k += 1) {
        const s = a + k * size
        windows.push([s, Math.min(b, s + size)])
      }
      continue
    }
    let s = a
    let e = b
    while (e - s < minN) {
      const left = s > 0 ? p.score[s - 1] : -Infinity
      const right = e < p.n ? p.score[e] : -Infinity
      if (left === -Infinity && right === -Infinity) break
      if (left >= right) s -= 1
      else e += 1
    }
    windows.push([s, e])
  }

  // 3. snap edges to pauses, rank, keep the best non-overlapping ones
  const candidates = windows
    .map(([a, b]) => {
      let start = snapToPause(p, a * p.step, 1.5, 0, p.duration)
      let end = snapToPause(p, b * p.step, 1.5, start + minSec * 0.8, p.duration)
      if (end - start > maxSec) end = start + maxSec
      if (end - start < Math.min(minSec, p.duration)) {
        end = Math.min(p.duration, start + minSec)
        start = Math.max(0, end - minSec)
      }
      return { start, end, raw: meanScore(p, start, end) }
    })
    .filter((c) => c.end - c.start >= 1 && (!p.hasAudio || meanDb(p, c.start, c.end) > p.silentDb))
    .sort((x, y) => y.raw - x.raw)

  const kept: Array<{ start: number; end: number; raw: number }> = []
  for (const c of candidates) {
    if (kept.length >= params.maxClips) break
    if (kept.some((k) => c.start < k.end - 0.5 && c.end > k.start + 0.5)) continue
    kept.push(c)
  }
  kept.sort((x, y) => x.start - y.start)
  const scores = rankScores(p, kept)
  return kept.map((k, idx) => ({ start: k.start, end: k.end, score: scores[idx] }))
}

function buildByPauses(p: Prepared, params: SliceParams) {
  const minSec = clamp(params.minSec, 3, 600)
  const maxSec = clamp(Math.max(params.maxSec, minSec), minSec, 900)
  const out: Array<{ start: number; end: number }> = []
  let start = 0
  while (start < p.duration - 1) {
    // first quiet point after minSec, otherwise the quietest point before maxSec
    let cut = -1
    const from = Math.round((start + minSec) / p.step)
    const to = Math.min(p.n - 1, Math.round((start + maxSec) / p.step))
    for (let i = from; i <= to; i += 1) {
      if (p.raw[i] <= p.quietDb) {
        cut = i * p.step
        break
      }
    }
    if (cut < 0) {
      if (start + maxSec >= p.duration) cut = p.duration
      else cut = snapToPause(p, start + maxSec - 2, 2, start + minSec, start + maxSec)
    }
    out.push({ start, end: Math.min(p.duration, cut) })
    start = cut
  }
  // merge a too-short tail into the previous clip
  const tail = out[out.length - 1]
  if (out.length > 1 && tail.end - tail.start < minSec * 0.5) {
    out.pop()
    out[out.length - 1].end = tail.end
  }
  const kept = p.hasAudio ? out.filter((r) => meanDb(p, r.start, r.end) > p.silentDb) : out
  const scores = rankScores(p, kept)
  return kept.map((r, i) => ({ ...r, score: scores[i] }))
}

function buildByInterval(p: Prepared, params: SliceParams) {
  const size = clamp(params.intervalSec, 3, 900)
  const out: Array<{ start: number; end: number }> = []
  for (let s = 0; s < p.duration - 0.5; s += size) out.push({ start: s, end: Math.min(p.duration, s + size) })
  const kept = params.skipSilence && p.hasAudio ? out.filter((r) => meanDb(p, r.start, r.end) > p.silentDb) : out
  const scores = rankScores(p, kept)
  return kept.map((r, i) => ({ ...r, score: scores[i] }))
}

/** Builds automatic clips. `interval` also works without analysis signals (empty energy). */
export function buildSegments(mode: SliceMode, sig: Signals, params: SliceParams, titlePrefix: string): LiveSegment[] {
  if (mode === 'manual' || sig.durationSec <= 0) return []
  const p = prepare(sig)
  if (mode === 'interval') return toSegments(buildByInterval(p, params), titlePrefix)
  if (mode === 'pause') return toSegments(buildByPauses(p, params), titlePrefix)
  return toSegments(buildHighlights(p, params), titlePrefix)
}

/** Downsamples loudness into `buckets` peaks in 0..1 for drawing. */
export function energyPeaks(energy: number[], buckets: number) {
  const out = new Array<number>(Math.max(1, buckets)).fill(0)
  if (!energy.length) return out
  const per = energy.length / out.length
  for (let b = 0; b < out.length; b += 1) {
    const a = Math.floor(b * per)
    const e = Math.max(a + 1, Math.floor((b + 1) * per))
    let peak = -90
    for (let i = a; i < e && i < energy.length; i += 1) peak = Math.max(peak, energy[i])
    out[b] = clamp((peak + 60) / 60, 0, 1)
  }
  return out
}

export function formatTime(sec: number, withMs = false) {
  const s = Math.max(0, Number(sec) || 0)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = Math.floor(s % 60)
  const base = `${h > 0 ? `${h}:` : ''}${String(m).padStart(h > 0 ? 2 : 1, '0')}:${String(r).padStart(2, '0')}`
  return withMs ? `${base}.${Math.floor((s % 1) * 10)}` : base
}

export function formatDuration(sec: number) {
  const s = Math.max(0, Number(sec) || 0)
  if (s < 60) return `${s.toFixed(1)}s`
  return formatTime(s)
}
