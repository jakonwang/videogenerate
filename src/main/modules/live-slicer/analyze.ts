import { access, stat } from 'node:fs/promises'
import { constants as fsConstants } from 'node:fs'
import { basename } from 'node:path'
import { probeMedia } from '../ffmpeg/probe'
import { runFfmpeg } from '../ffmpeg/runner'

/** Seconds covered by one entry of `LiveSlicerAnalysis.energy`. */
export const ENERGY_STEP_SEC = 0.5
const ENERGY_SAMPLE_RATE = 8000
const SILENT_DB = -90

export type LiveSlicerSource = {
  path: string
  fileName: string
  fileSize: number
  durationSec: number
  width: number
  height: number
  fps: number
  hasAudio: boolean
  videoCodec: string | null
  audioCodec: string | null
  bitRate: number
}

export type LiveSlicerAnalysis = {
  durationSec: number
  /** Seconds per energy entry. */
  step: number
  /** RMS loudness (dBFS, clamped to [-90, 0]) per `step` seconds; empty when the file has no audio. */
  energy: number[]
  /** Visual change points: [timeSec, score 0..1]. */
  scenes: Array<[number, number]>
}

export async function probeLiveSource(inputPath: string): Promise<LiveSlicerSource> {
  const path = String(inputPath ?? '').trim()
  if (!path) throw new Error('No input video selected.')
  await access(path, fsConstants.R_OK)
  const [info, probe] = await Promise.all([stat(path), probeMedia(path)])
  return {
    path,
    fileName: basename(path),
    fileSize: info.size,
    durationSec: Number(probe.durationSec) || 0,
    width: Number(probe.width) || 0,
    height: Number(probe.height) || 0,
    fps: Number(probe.fps) || 0,
    hasAudio: Boolean(probe.hasAudio),
    videoCodec: probe.videoCodec ?? null,
    audioCodec: probe.audioCodec ?? null,
    bitRate: Number(probe.bitRate) || 0,
  }
}

/** Parses `-progress` output (`out_time_us=…`) into seconds. */
export function parseProgressSeconds(line: string): number | null {
  const m = /^out_time_(?:us|ms)=(\d+)/.exec(line)
  if (m) return Number(m[1]) / 1_000_000
  return null
}

async function measureEnergy(opts: {
  inputPath: string
  audioStreamIndex?: number
  durationSec: number
  signal?: AbortSignal
  onProgress: (fraction: number) => void
}): Promise<number[]> {
  const samplesPerStep = Math.round(ENERGY_SAMPLE_RATE * ENERGY_STEP_SEC)
  const energy: number[] = []
  let pendingIndex = -1
  const map = opts.audioStreamIndex != null ? `0:${opts.audioStreamIndex}` : '0:a:0'
  await runFfmpeg({
    signal: opts.signal,
    args: [
      '-hide_banner',
      '-nostdin',
      '-loglevel',
      'error',
      '-nostats',
      '-progress',
      'pipe:2',
      '-i',
      opts.inputPath,
      '-vn',
      '-sn',
      '-dn',
      '-map',
      map,
      '-af',
      [
        `aresample=${ENERGY_SAMPLE_RATE}`,
        'aformat=channel_layouts=mono',
        `asetnsamples=n=${samplesPerStep}:p=0`,
        'astats=metadata=1:reset=1',
        'ametadata=mode=print:key=lavfi.astats.Overall.RMS_level:file=-',
      ].join(','),
      '-f',
      'null',
      '-',
    ],
    onStdout: (line) => {
      const frame = /pts_time:([\d.]+)/.exec(line)
      if (frame) {
        pendingIndex = Math.round(Number(frame[1]) / ENERGY_STEP_SEC)
        return
      }
      const value = /RMS_level=(.+)$/.exec(line)
      if (value && pendingIndex >= 0) {
        const db = Number(value[1])
        energy[pendingIndex] = Number.isFinite(db) ? Math.max(SILENT_DB, Math.min(0, db)) : SILENT_DB
        pendingIndex = -1
      }
    },
    onStderr: (line) => {
      const sec = parseProgressSeconds(line)
      if (sec != null && opts.durationSec > 0) opts.onProgress(Math.min(1, sec / opts.durationSec))
    },
  })
  for (let i = 0; i < energy.length; i += 1) if (energy[i] == null) energy[i] = SILENT_DB
  return energy
}

async function detectScenes(opts: {
  inputPath: string
  durationSec: number
  signal?: AbortSignal
  onProgress: (fraction: number) => void
}): Promise<Array<[number, number]>> {
  const scenes: Array<[number, number]> = []
  let pendingTime = -1
  await runFfmpeg({
    signal: opts.signal,
    args: [
      '-hide_banner',
      '-nostdin',
      '-loglevel',
      'error',
      '-nostats',
      '-progress',
      'pipe:2',
      // Key frames only: an order of magnitude faster on multi-hour recordings, and
      // live streams carry a key frame every 1-4 s which is plenty for cut detection.
      '-skip_frame',
      'nokey',
      '-i',
      opts.inputPath,
      '-an',
      '-sn',
      '-dn',
      '-map',
      '0:v:0',
      '-vf',
      'scale=96:-2,select=gt(scene\\,0.22),metadata=mode=print:key=lavfi.scene_score:file=-',
      '-f',
      'null',
      '-',
    ],
    onStdout: (line) => {
      const frame = /pts_time:([\d.]+)/.exec(line)
      if (frame) {
        pendingTime = Number(frame[1])
        return
      }
      const value = /scene_score=([\d.]+)/.exec(line)
      if (value && pendingTime >= 0) {
        scenes.push([Math.round(pendingTime * 100) / 100, Math.min(1, Number(value[1]))])
        pendingTime = -1
      }
    },
    onStderr: (line) => {
      const sec = parseProgressSeconds(line)
      if (sec != null && opts.durationSec > 0) opts.onProgress(Math.min(1, sec / opts.durationSec))
    },
  })
  return scenes
}

/**
 * Extracts the raw signals the renderer turns into clips: audio loudness per half second
 * (both passes run in parallel) and visual cut points. Segment building happens in the
 * renderer so tuning the parameters is instant and does not re-read the file.
 */
export async function analyzeLiveVideo(opts: {
  inputPath: string
  signal?: AbortSignal
  onProgress?: (p: { fraction: number; stage: 'audio' | 'video' }) => void
}): Promise<LiveSlicerAnalysis> {
  const source = await probeLiveSource(opts.inputPath)
  const probe = await probeMedia(source.path)
  const durationSec = source.durationSec
  let audioFraction = source.hasAudio ? 0 : 1
  let videoFraction = 0
  const report = (stage: 'audio' | 'video') => {
    const fraction = source.hasAudio ? audioFraction * 0.55 + videoFraction * 0.45 : videoFraction
    opts.onProgress?.({ fraction: Math.min(0.99, fraction), stage })
  }

  const [energy, scenes] = await Promise.all([
    source.hasAudio
      ? measureEnergy({
          inputPath: source.path,
          audioStreamIndex: probe.audioStreamIndex,
          durationSec,
          signal: opts.signal,
          onProgress: (f) => {
            audioFraction = f
            report('audio')
          },
        })
      : Promise.resolve([] as number[]),
    detectScenes({
      inputPath: source.path,
      durationSec,
      signal: opts.signal,
      onProgress: (f) => {
        videoFraction = f
        report('video')
      },
    }).catch((e) => {
      // Scene detection is a bonus signal; a cancel must still propagate.
      if (opts.signal?.aborted) throw e
      return [] as Array<[number, number]>
    }),
  ])

  return { durationSec, step: ENERGY_STEP_SEC, energy, scenes }
}
