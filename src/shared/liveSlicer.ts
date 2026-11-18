/**
 * 直播切片：音量能量 / 画面切换的 ffmpeg 滤镜和输出解析、导出画面比例与滤镜链。
 * 电脑端 live-slicer 模块和云端（网页版）共用，算出来的片段和成片一致。
 */

/** Seconds covered by one entry of `energy`. */
export const ENERGY_STEP_SEC = 0.5
export const ENERGY_SAMPLE_RATE = 8000
export const SILENT_DB = -90
export const FADE_SEC = 0.35

export type LiveSlicerAnalysis = {
  durationSec: number
  /** Seconds per energy entry. */
  step: number
  /** RMS loudness (dBFS, clamped to [-90, 0]) per `step` seconds; empty when the file has no audio. */
  energy: number[]
  /** Visual change points: [timeSec, score 0..1]. */
  scenes: Array<[number, number]>
}

export type LiveSlicerCutMode = 'precise' | 'fast'
export type LiveSlicerAspect = 'original' | '9:16-crop' | '9:16-blur' | '1:1' | '16:9'
export type LiveSlicerResolution = 'source' | '1080' | '720'
export type LiveSlicerLook = { aspect: LiveSlicerAspect; resolution: LiveSlicerResolution; fade: boolean; normalizeAudio: boolean }
export type LiveSlicerSegment = { id: string; start: number; end: number; title?: string }

/** `-af` for the loudness pass: one RMS reading per ENERGY_STEP_SEC, printed by ametadata to `target` (`-` = stdout). */
export function energyFilter(target = '-') {
  const samplesPerStep = Math.round(ENERGY_SAMPLE_RATE * ENERGY_STEP_SEC)
  return [
    `aresample=${ENERGY_SAMPLE_RATE}`,
    'aformat=channel_layouts=mono',
    `asetnsamples=n=${samplesPerStep}:p=0`,
    'astats=metadata=1:reset=1',
    `ametadata=mode=print:key=lavfi.astats.Overall.RMS_level:file=${target}`,
  ].join(',')
}

/** `-vf` for the cut pass (run with `-skip_frame nokey`). */
export function sceneFilter(target = '-') {
  return `scale=96:-2,select=gt(scene\\,0.22),metadata=mode=print:key=lavfi.scene_score:file=${target}`
}

/** Reads ametadata lines (`frame:… pts_time:…` then `…RMS_level=…`) into the energy array. */
export function createEnergyParser() {
  const energy: number[] = []
  let pendingIndex = -1
  return {
    push(line: string) {
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
    result() {
      for (let i = 0; i < energy.length; i += 1) if (energy[i] == null) energy[i] = SILENT_DB
      return energy
    },
  }
}

/** Reads metadata lines (`pts_time:…` then `scene_score=…`) into [time, score] pairs. */
export function createSceneParser() {
  const scenes: Array<[number, number]> = []
  let pendingTime = -1
  return {
    push(line: string) {
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
    result() {
      return scenes
    },
  }
}

function even(n: number) {
  const v = Math.max(2, Math.round(n))
  return v % 2 === 0 ? v : v - 1
}

export function targetFrame(srcW: number, srcH: number, aspect: LiveSlicerAspect, resolution: LiveSlicerResolution) {
  const w = srcW > 0 ? srcW : 1920
  const h = srcH > 0 ? srcH : 1080
  const ratio =
    aspect === '9:16-crop' || aspect === '9:16-blur' ? 9 / 16 : aspect === '1:1' ? 1 : aspect === '16:9' ? 16 / 9 : w / h
  // The short side of the output, capped by the requested resolution and by what the
  // source can provide without upscaling.
  let outW: number
  let outH: number
  if (ratio >= 1) {
    outH = Math.min(h, Math.round(w / ratio))
    outW = outH * ratio
  } else {
    outW = Math.min(w, Math.round(h * ratio))
    outH = outW / ratio
  }
  if (aspect === '9:16-blur') {
    // The whole source sits inside the frame over a blurred copy, so the frame width
    // matches the source's short side (1920x1080 -> 1080x1920).
    outW = Math.min(w, h)
    outH = outW / ratio
  }
  const cap = resolution === '1080' ? 1080 : resolution === '720' ? 720 : 0
  const shortSide = Math.min(outW, outH)
  if (cap && shortSide > cap) {
    const k = cap / shortSide
    outW *= k
    outH *= k
  }
  return { width: even(outW), height: even(outH) }
}

export function buildVideoChain(srcW: number, srcH: number, opts: LiveSlicerLook, duration: number): { graph: string; width: number; height: number } {
  const { width: W, height: H } = targetFrame(srcW, srcH, opts.aspect, opts.resolution)
  const fades = opts.fade && duration > FADE_SEC * 3
    ? `,fade=t=in:st=0:d=${FADE_SEC},fade=t=out:st=${(duration - FADE_SEC).toFixed(3)}:d=${FADE_SEC}`
    : ''
  let graph: string
  if (opts.aspect === '9:16-blur') {
    graph = [
      `[0:v]setsar=1,split=2[lsbg][lsfg]`,
      `[lsbg]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},boxblur=luma_radius=24:luma_power=2,eq=brightness=-0.06[lsbgb]`,
      `[lsfg]scale=${W}:${H}:force_original_aspect_ratio=decrease[lsfgs]`,
      `[lsbgb][lsfgs]overlay=(W-w)/2:(H-h)/2,format=yuv420p${fades}[vout]`,
    ].join(';')
  } else if (opts.aspect === 'original') {
    graph = `[0:v]setsar=1,scale=${W}:${H},format=yuv420p${fades}[vout]`
  } else {
    // Centre crop to the requested ratio, then scale.
    graph = `[0:v]setsar=1,scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},format=yuv420p${fades}[vout]`
  }
  return { graph, width: W, height: H }
}

export function buildAudioChain(opts: Pick<LiveSlicerLook, 'fade' | 'normalizeAudio'>, duration: number, audioMap: string) {
  const parts: string[] = []
  if (opts.normalizeAudio) parts.push('loudnorm=I=-14:TP=-1.5:LRA=11')
  if (opts.fade && duration > FADE_SEC * 3) {
    parts.push(`afade=t=in:st=0:d=${FADE_SEC}`, `afade=t=out:st=${(duration - FADE_SEC).toFixed(3)}:d=${FADE_SEC}`)
  }
  parts.push('aresample=48000')
  return `[${audioMap}]${parts.join(',')}[aout]`
}
