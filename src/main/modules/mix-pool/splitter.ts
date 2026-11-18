import { mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { probeMedia } from '../ffmpeg/probe'
import { runFfmpeg } from '../ffmpeg/runner'
import { detectSceneCuts } from '../clone/analyzer'
import type { PoolClip, PoolSource } from '../../../shared/mixPool'
import { mixPoolFramesDir } from './repo'

/** A TikTok selling edit rarely holds a shot longer than this; longer takes get cut into beats. */
const MAX_CLIP_SEC = 4.5
/** Shorter than this is a flash frame / transition residue, merged into its neighbour. */
const MIN_CLIP_SEC = 0.7
const MAX_CLIPS_PER_SOURCE = 60

const round3 = (n: number) => Math.round(n * 1000) / 1000

export function planClipRanges(durationSec: number, sceneCuts: number[]): Array<{ startSec: number; endSec: number }> {
  const duration = Math.max(0, durationSec)
  if (duration < MIN_CLIP_SEC) return duration > 0.2 ? [{ startSec: 0, endSec: round3(duration) }] : []

  const points = [0, ...sceneCuts.filter((t) => t > 0 && t < duration), duration].sort((a, b) => a - b)
  // Merge too-short scenes into the previous one (or the next, for a short first scene).
  const merged: number[] = [points[0]!]
  for (let i = 1; i < points.length; i++) {
    const p = points[i]!
    const isLast = i === points.length - 1
    if (p - merged[merged.length - 1]! < MIN_CLIP_SEC) {
      if (isLast) merged[merged.length - 1] = p
      continue
    }
    merged.push(p)
  }
  if (merged.length === 1) merged.push(duration)
  if (merged.length > 2 && merged[merged.length - 1]! - merged[merged.length - 2]! < MIN_CLIP_SEC) merged.splice(merged.length - 2, 1)

  const ranges: Array<{ startSec: number; endSec: number }> = []
  for (let i = 0; i < merged.length - 1; i++) {
    const a = merged[i]!
    const b = merged[i + 1]!
    const len = b - a
    const parts = Math.max(1, Math.ceil(len / MAX_CLIP_SEC))
    const step = len / parts
    for (let j = 0; j < parts; j++) {
      ranges.push({ startSec: round3(a + step * j), endSec: round3(j === parts - 1 ? b : a + step * (j + 1)) })
    }
  }
  return ranges.slice(0, MAX_CLIPS_PER_SOURCE)
}

async function grabFrame(videoPath: string, atSec: number, outPath: string) {
  await runFfmpeg({
    args: ['-y', '-hide_banner', '-loglevel', 'error', '-ss', `${Math.max(0, atSec)}`, '-i', videoPath, '-frames:v', '1', '-q:v', '4', '-vf', 'scale=360:-2', outPath],
  })
  return outPath
}

/** Probes the source, cuts it into shot ranges and extracts start/mid/end frames per shot. */
export async function splitSourceIntoClips(source: PoolSource): Promise<{ clips: PoolClip[]; meta: Partial<PoolSource> }> {
  const meta = await probeMedia(source.filePath)
  const duration = Number(meta.durationSec || 0)
  if (!(duration > 0)) throw new Error('无法读取视频时长')

  const cuts = duration > MAX_CLIP_SEC ? await detectSceneCuts(source.filePath) : []
  const ranges = planClipRanges(duration, cuts)
  if (!ranges.length) throw new Error('视频过短，无法切出镜头')

  const dir = mixPoolFramesDir(source.productId, source.id)
  await rm(dir, { recursive: true, force: true })
  await mkdir(dir, { recursive: true })

  const now = Date.now()
  const clips: PoolClip[] = []
  for (let i = 0; i < ranges.length; i++) {
    const r = ranges[i]!
    const len = r.endSec - r.startSec
    const edge = Math.min(0.12, len * 0.1)
    const prefix = join(dir, `clip_${String(i + 1).padStart(3, '0')}`)
    const framePaths = [
      await grabFrame(source.filePath, r.startSec + edge, `${prefix}_s.jpg`),
      await grabFrame(source.filePath, r.startSec + len / 2, `${prefix}_m.jpg`),
      await grabFrame(source.filePath, Math.max(r.startSec, r.endSec - edge - 0.05), `${prefix}_e.jpg`),
    ]
    clips.push({
      id: randomUUID(),
      productId: source.productId,
      sourceId: source.id,
      filePath: source.filePath,
      startSec: r.startSec,
      endSec: r.endSec,
      durationSec: round3(len),
      origin: source.origin,
      framePaths,
      thumbnailPath: framePaths[1]!,
      tagStatus: 'untagged',
      createdAt: now,
      updatedAt: now,
    })
  }
  return {
    clips,
    meta: { durationSec: round3(duration), width: meta.width, height: meta.height },
  }
}
