/**
 * Shot-to-shot continuity planning for 复刻, shared by the desktop / server engine (src/main/modules/clone/continuity.ts)
 * and the phone App's cloud pipeline. Pure functions only (no ffmpeg / node APIs).
 *
 * A reference video is often one continuous take that the analyzer split at fixed points. Generating
 * each piece on its own makes the person / hand / angle jump at each split, so: continuous runs are
 * generated together as one "long take", and a clip's end frame is pinned to the next piece's start
 * frame ("relay").
 */

export type ContinuityBoundary = 'continuous' | 'cut'

/** Per-shot long-take membership, stored on the shot (`ShotSpec.longTake`). */
export type LongTakeMembership = {
  groupId: string
  leaderShotId: string
  shotIds: string[]
  /** Where this shot starts inside the group, in reference-video seconds. */
  offsetSec: number
  durationSec: number
  groupDurationSec: number
}

/** The window a shot cuts out of a shared long-take clip, stored when the task is submitted. */
export type LongTakeWindow = {
  taskId: string
  leaderShotId: string
  offsetSec: number
  durationSec: number
  groupDurationSec: number
}

export const CONTINUITY_SIMILARITY_THRESHOLD = 0.5
export const LONG_TAKE_MAX_SEC = 10
export const LONG_TAKE_MAX_SHOTS = 4

export type ClipColorStats = { luma: number; saturation: number }

export function classifyBoundary(similarity: number | null): ContinuityBoundary {
  return similarity !== null && similarity >= CONTINUITY_SIMILARITY_THRESHOLD ? 'continuous' : 'cut'
}

type PlanShot = { id: string; durationSec: number; continuousWithNext: boolean }

/**
 * Split the sequence into groups. Runs of continuous shots are cut into the fewest groups that each
 * fit one generation (≤ maxTakeSec, ≤ maxShots), with group lengths as even as possible.
 */
export function planLongTakeGroups(shots: PlanShot[], opts: { maxTakeSec?: number; maxShots?: number } = {}): string[][] {
  const maxTakeSec = opts.maxTakeSec ?? LONG_TAKE_MAX_SEC
  const maxShots = Math.max(1, opts.maxShots ?? LONG_TAKE_MAX_SHOTS)
  const runs: PlanShot[][] = []
  let run: PlanShot[] = []
  for (const shot of shots) {
    run.push(shot)
    if (!shot.continuousWithNext) {
      runs.push(run)
      run = []
    }
  }
  if (run.length) runs.push(run)

  const groups: string[][] = []
  for (const items of runs) {
    const n = items.length
    const dur = items.map((item) => Math.max(0.1, Number(item.durationSec) || 0.1))
    const prefix = [0]
    for (const d of dur) prefix.push(prefix[prefix.length - 1]! + d)
    const fits = (i: number, j: number) => j - i <= maxShots && (j - i === 1 || prefix[j]! - prefix[i]! <= maxTakeSec)
    // best[j] = [groupCount, sumOfSquares] for the first j shots; fewest groups first, then evenness.
    const best: Array<[number, number] | null> = Array(n + 1).fill(null)
    const prev: number[] = Array(n + 1).fill(-1)
    best[0] = [0, 0]
    for (let j = 1; j <= n; j++) {
      for (let i = 0; i < j; i++) {
        const base = best[i]
        if (!base || !fits(i, j)) continue
        const length = prefix[j]! - prefix[i]!
        const candidate: [number, number] = [base[0] + 1, base[1] + length * length]
        const current = best[j]
        if (!current || candidate[0] < current[0] || (candidate[0] === current[0] && candidate[1] < current[1])) {
          best[j] = candidate
          prev[j] = i
        }
      }
    }
    const cuts: Array<[number, number]> = []
    for (let j = n; j > 0; j = prev[j]!) cuts.unshift([prev[j]!, j])
    for (const [i, j] of cuts) groups.push(items.slice(i, j).map((item) => item.id))
  }
  return groups
}

export function buildLongTakeMemberships(
  groups: string[][],
  durationById: Record<string, number>,
): Record<string, LongTakeMembership | undefined> {
  const out: Record<string, LongTakeMembership | undefined> = {}
  for (const ids of groups) {
    if (ids.length < 2) {
      for (const id of ids) out[id] = undefined
      continue
    }
    const groupDurationSec = round3(ids.reduce((sum, id) => sum + Math.max(0.1, Number(durationById[id]) || 0.1), 0))
    let offset = 0
    for (const id of ids) {
      const durationSec = round3(Math.max(0.1, Number(durationById[id]) || 0.1))
      out[id] = { groupId: `take_${ids[0]}`, leaderShotId: ids[0]!, shotIds: [...ids], offsetSec: round3(offset), durationSec, groupDurationSec }
      offset += durationSec
    }
  }
  return out
}

/**
 * The clip length to ask the provider for, or undefined to keep the provider default. Only set for
 * providers whose accepted lengths are known; compose retimes the result to the shot length anyway.
 */
export function snapRequestedVideoDurationSec(provider: string, targetSec: number): number | undefined {
  const target = Math.max(1, Number(targetSec) || 0)
  const pick = (options: number[]) => options.find((value) => value >= target - 0.25) ?? options[options.length - 1]
  switch (String(provider || '').trim().toLowerCase()) {
    case 'kling':
    case 'jimeng':
      return pick([5, 10])
    case 'vidu':
      return pick([4, 8])
    case 'seedance':
    case 'seedance2':
      return Math.max(4, Math.min(10, Math.ceil(target - 0.25)))
    case 'sora':
    case 'openai_video':
      return pick([4, 8, 12])
    default:
      return undefined
  }
}

/** Prompt for one generation that covers several reference shots as a single uninterrupted take. */
export function buildLongTakePrompt(leaderPrompt: string, members: Array<{ offsetSec: number; durationSec: number; text: string }>) {
  const lines = members
    .slice(1)
    .map((item) => {
      const text = String(item.text || '').replace(/\s+/g, ' ').trim().slice(0, 240)
      return text ? `- From ${item.offsetSec.toFixed(1)}s: ${text}` : ''
    })
    .filter(Boolean)
  const total = members.reduce((sum, item) => sum + item.durationSec, 0)
  return [
    String(leaderPrompt || '').trim(),
    `One continuous single take of about ${total.toFixed(1)}s with no cuts, no scene change and no jump: the same person, hand position, lighting and background flow smoothly from start to end.`,
    lines.length ? `Then, in the same uninterrupted take:\n${lines.join('\n')}` : '',
  ]
    .filter(Boolean)
    .join('\n\n')
}

/** Start and length (in source seconds) of a member's part of a long-take clip of `clipDurationSec`. */
export function longTakePartWindow(window: Pick<LongTakeWindow, 'offsetSec' | 'durationSec' | 'groupDurationSec'>, clipDurationSec: number) {
  const scale = clipDurationSec > 0 && window.groupDurationSec > 0 ? clipDurationSec / window.groupDurationSec : 1
  const startSec = Math.max(0, window.offsetSec * scale)
  const durationSec = Math.max(0.2, Math.min(clipDurationSec - startSec, window.durationSec * scale))
  return { startSec: round3(startSec), durationSec: round3(durationSec) }
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

/** An `eq` filter per clip that pulls brightness and saturation toward the median of all clips. */
export function resolveColorMatchFilters(stats: Array<ClipColorStats | null>): string[] {
  const valid = stats.filter((item): item is ClipColorStats => Boolean(item))
  if (valid.length < 2) return stats.map(() => '')
  const targetLuma = median(valid.map((item) => item.luma))
  const targetSat = median(valid.map((item) => item.saturation))
  return stats.map((item) => {
    if (!item) return ''
    const lumaDiff = targetLuma - item.luma
    const brightness = Math.abs(lumaDiff) >= 2 ? clamp(lumaDiff / 255, -0.06, 0.06) : 0
    const saturation = item.saturation > 1 && Math.abs(targetSat - item.saturation) / item.saturation >= 0.04
      ? clamp(targetSat / item.saturation, 0.88, 1.12)
      : 1
    if (!brightness && saturation === 1) return ''
    return `eq=brightness=${round3(brightness)}:saturation=${round3(saturation)}`
  })
}

/** Speed factor for `setpts=PTS*factor` so `usedSec` of footage fills `targetSec`, kept natural-looking. */
export function resolveRetimeFactor(usedSec: number, targetSec: number) {
  if (!(usedSec > 0) || !(targetSec > 0)) return 1
  const factor = clamp(targetSec / usedSec, 0.55, 1.8)
  return Math.abs(factor - 1) < 0.03 ? 1 : round3(factor)
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function round3(value: number) {
  return Math.round(value * 1000) / 1000
}
