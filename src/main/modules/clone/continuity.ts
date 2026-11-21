/*
 * Shot-to-shot continuity for cloned videos.
 *
 * A reference video is often one continuous take that the analyzer split at fixed points (no scene
 * cuts were found). Generating every piece on its own makes the person / hand / angle jump at each
 * split. This module decides which boundaries were continuous in the reference, groups short
 * continuous runs into one longer generation ("long take"), and pins each generation's end frame to
 * the next piece's start frame ("relay") so the joins line up.
 */
import { spawn } from 'node:child_process'
import { getFfmpegExecutable } from '../../lib/binariesPath'
import type { ClipColorStats } from '../../../shared/cloud/cloneContinuity'

export * from '../../../shared/cloud/cloneContinuity'

export const LONG_TAKE_PART_SUFFIX = '.longtake-part.mp4'

const similarityCache = new Map<string, number | null>()

function runFfmpegCapture(args: string[], timeoutMs = 20_000): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve) => {
    let ffmpeg = ''
    try {
      ffmpeg = getFfmpegExecutable()
    } catch {
      resolve({ code: -1, stderr: '' })
      return
    }
    const child = spawn(ffmpeg, args, { windowsHide: true })
    let stderr = ''
    const timer = setTimeout(() => child.kill(), timeoutMs)
    child.stderr.on('data', (chunk: Buffer) => {
      if (stderr.length < 400_000) stderr += chunk.toString('utf8')
    })
    child.on('error', () => {
      clearTimeout(timer)
      resolve({ code: -1, stderr })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code: Number(code ?? -1), stderr })
    })
  })
}

/** Structural similarity (0..1) of two still frames, or null when it cannot be measured. */
export async function measureFrameSimilarity(a?: string, b?: string): Promise<number | null> {
  const left = String(a || '').trim()
  const right = String(b || '').trim()
  if (!left || !right) return null
  const key = `${left}\n${right}`
  if (similarityCache.has(key)) return similarityCache.get(key) ?? null
  const { code, stderr } = await runFfmpegCapture([
    '-hide_banner',
    '-i', left,
    '-i', right,
    '-lavfi', '[0:v]scale=144:256,format=gray[a];[1:v]scale=144:256,format=gray[b];[a][b]ssim',
    '-f', 'null', '-',
  ])
  const match = code === 0 ? /All:\s*([0-9.]+)/.exec(stderr) : null
  const value = match ? Number(match[1]) : NaN
  const result = Number.isFinite(value) ? value : null
  similarityCache.set(key, result)
  return result
}

export async function cutVideoPart(input: { src: string; out: string; startSec: number; durationSec: number }) {
  // Re-encode so the cut is frame accurate (stream copy would snap to keyframes and break the joins).
  const { code, stderr } = await runFfmpegCapture(
    [
      '-y', '-hide_banner',
      '-ss', `${input.startSec}`,
      '-i', input.src,
      '-t', `${input.durationSec}`,
      '-an',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '16', '-pix_fmt', 'yuv420p',
      input.out,
    ],
    120_000,
  )
  if (code !== 0) throw new Error(`长镜头切分失败: ${stderr.slice(-300)}`)
  return input.out
}

/* ---------------- compose helpers ---------------- */

/** Frozen frames at the very start / end of a generated clip (models often hold the first or last frame). */
export async function detectFreezeEdges(src: string, durationSec: number): Promise<{ headSec: number; tailSec: number }> {
  const { code, stderr } = await runFfmpegCapture([
    '-hide_banner', '-i', src, '-an',
    '-vf', 'scale=160:-2,freezedetect=n=0.003:d=0.2',
    '-f', 'null', '-',
  ], 60_000)
  if (code !== 0) return { headSec: 0, tailSec: 0 }
  const starts = [...stderr.matchAll(/freeze_start:\s*([0-9.]+)/g)].map((m) => Number(m[1]))
  const ends = [...stderr.matchAll(/freeze_end:\s*([0-9.]+)/g)].map((m) => Number(m[1]))
  let headSec = 0
  let tailSec = 0
  starts.forEach((start, i) => {
    const end = ends[i] ?? durationSec
    if (start <= 0.05) headSec = Math.max(headSec, end)
    if (end >= durationSec - 0.1) tailSec = Math.max(tailSec, durationSec - start)
  })
  // Never trim more than 0.8s per side or more than half the clip.
  const cap = Math.min(0.8, durationSec * 0.25)
  return { headSec: round3(Math.min(cap, headSec)), tailSec: round3(Math.min(cap, tailSec)) }
}

export async function measureClipColor(src: string, startSec: number, durationSec: number): Promise<ClipColorStats | null> {
  const { code, stderr } = await runFfmpegCapture([
    '-hide_banner',
    '-ss', `${Math.max(0, startSec)}`,
    '-i', src,
    '-t', `${Math.max(0.3, durationSec)}`,
    '-an',
    '-vf', 'fps=3,scale=96:-2,signalstats,metadata=print',
    '-f', 'null', '-',
  ], 60_000)
  if (code !== 0) return null
  const luma = [...stderr.matchAll(/lavfi\.signalstats\.YAVG=([0-9.]+)/g)].map((m) => Number(m[1]))
  const sat = [...stderr.matchAll(/lavfi\.signalstats\.SATAVG=([0-9.]+)/g)].map((m) => Number(m[1]))
  if (!luma.length || !sat.length) return null
  const avg = (values: number[]) => values.reduce((sum, v) => sum + v, 0) / values.length
  return { luma: avg(luma), saturation: avg(sat) }
}

function round3(value: number) {
  return Math.round(value * 1000) / 1000
}
