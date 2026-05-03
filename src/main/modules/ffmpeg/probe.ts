import { spawn } from 'node:child_process'
import { getFfprobeExecutable } from '../../lib/binariesPath'

export type ProbeResult = {
  durationSec: number
  /** 是否存在可被当前 FFmpeg 解码并用于滤镜链的音频轨（会跳过 apac 等无法解码的轨） */
  hasAudio: boolean
  /** 首个可解码音频流在容器中的 stream index；与 hasAudio 同时为真时必有值 */
  audioStreamIndex?: number
  /** 容器里出现过 audio 类流，但均不可解码（常见：新 iPhone 仅 apac 空间声轨） */
  audioUndecodableOnly?: boolean
  width?: number
  height?: number
  fps?: number
  videoCodec?: string | null
  audioCodec?: string | null
  bitRate?: number
}

/** ffprobe 单条流是否可作为 FFmpeg 解码的「原声音频」输入（排除 apac / none 等） */
function isDecodableFfmpegAudioStream(s: any): boolean {
  if (String(s?.codec_type ?? '') !== 'audio') return false
  const cn = String(s?.codec_name ?? '').trim().toLowerCase()
  const tag = String(s?.codec_tag_string ?? '').trim().toLowerCase()
  if (tag === 'apac' || cn === 'apac') return false
  if (!cn || cn === 'none' || cn === 'unknown') return false
  return true
}

const cache = new Map<string, Promise<ProbeResult>>()

function splitLines(chunk: Buffer) {
  return chunk
    .toString('utf-8')
    .split(/\r?\n/g)
    .map((s) => s.trim())
    .filter(Boolean)
}

export function probeMedia(filePath: string): Promise<ProbeResult> {
  const existing = cache.get(filePath)
  if (existing) return existing

  const p = new Promise<ProbeResult>((resolve, reject) => {
    let exe: string
    try {
      exe = getFfprobeExecutable()
    } catch (e: any) {
      return reject(new Error(e?.message ?? String(e)))
    }

    // 输出：duration + streams(codec_type)
    const args = [
      '-v',
      'error',
      '-print_format',
      'json',
      '-show_format',
      '-show_streams',
      filePath,
    ]

    const child = spawn(exe as string, args, { windowsHide: true })
    const out: string[] = []
    const err: string[] = []
    child.stdout.on('data', (c: Buffer) => out.push(...splitLines(c)))
    child.stderr.on('data', (c: Buffer) => err.push(...splitLines(c)))
    child.on('error', reject)
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(`ffprobe 失败(${code}): ${err.join(' | ')}`))
      try {
        const json = JSON.parse(out.join('\n')) as any
        const durationSec = Number(json?.format?.duration ?? 0)
        const bitRate = Number(json?.format?.bit_rate ?? 0)
        const streams = Array.isArray(json?.streams) ? json.streams : []
        const v = streams.find((s: any) => s?.codec_type === 'video')
        const audioLike = streams.filter((s: any) => String(s?.codec_type) === 'audio')
        let audioStreamIndex: number | undefined
        let a: any
        for (const s of streams) {
          if (!isDecodableFfmpegAudioStream(s)) continue
          const idx = Number(s?.index)
          if (!Number.isFinite(idx)) continue
          audioStreamIndex = idx
          a = s
          break
        }
        const hasAudio = audioStreamIndex !== undefined
        const audioUndecodableOnly = audioLike.length > 0 && !hasAudio
        const parseFps = (s: any) => {
          const r = String(s?.avg_frame_rate ?? s?.r_frame_rate ?? '').trim()
          const m = r.match(/^(\d+)\s*\/\s*(\d+)$/)
          if (m) {
            const num = Number(m[1])
            const den = Number(m[2])
            if (Number.isFinite(num) && Number.isFinite(den) && den > 0) return num / den
          }
          const f = Number(r)
          return Number.isFinite(f) ? f : 0
        }
        resolve({
          durationSec: Number.isFinite(durationSec) ? durationSec : 0,
          hasAudio,
          ...(audioStreamIndex !== undefined ? { audioStreamIndex } : {}),
          ...(audioUndecodableOnly ? { audioUndecodableOnly: true } : {}),
          width: Number(v?.width ?? 0) || undefined,
          height: Number(v?.height ?? 0) || undefined,
          fps: (() => {
            const f = parseFps(v)
            return f > 0 ? Number(f.toFixed(3)) : undefined
          })(),
          videoCodec: typeof v?.codec_name === 'string' ? v.codec_name : null,
          audioCodec: typeof a?.codec_name === 'string' ? a.codec_name : null,
          bitRate: Number.isFinite(bitRate) && bitRate > 0 ? bitRate : undefined,
        })
      } catch (e: any) {
        reject(new Error(`ffprobe 解析失败: ${e?.message ?? String(e)}`))
      }
    })
  })

  cache.set(filePath, p)
  return p
}

