import { spawn } from 'node:child_process'
import { getFfmpegExecutable } from '../../lib/binariesPath'

export type EncoderPick =
  | { codec: 'libx264'; args: string[]; note: string }
  | { codec: 'h264_nvenc'; args: string[]; note: string }
  | { codec: 'h264_qsv'; args: string[]; note: string }

let cached: Promise<Set<string>> | null = null
let nvencProbe: Promise<boolean> | null = null
let qsvProbe: Promise<boolean> | null = null

function ffmpegExe(): string | null {
  try {
    return getFfmpegExecutable()
  } catch {
    return null
  }
}

function splitLines(chunk: Buffer) {
  return chunk
    .toString('utf-8')
    .split(/\r?\n/g)
    .map((s) => s.trim())
    .filter(Boolean)
}

/** 试编码 1 帧；参数尽量与正式渲染一致（NVENC API 不匹配时仅看 exit code 可能不够可靠）。 */
function probeHwEncoder(codec: 'h264_nvenc' | 'h264_qsv'): Promise<boolean> {
  const cache = codec === 'h264_nvenc' ? nvencProbe : qsvProbe
  if (cache) return cache
  const exe = ffmpegExe()
  if (!exe) return Promise.resolve(false)

  const codecArgs =
    codec === 'h264_nvenc'
      ? (['-preset', 'p4', '-rc', 'vbr', '-cq', '23', '-b:v', '0'] as const)
      : (['-preset', 'veryfast', '-global_quality', '23'] as const)

  const pending = new Promise<boolean>((resolve) => {
    let stderr = ''
    const child = spawn(
      exe,
      [
        '-hide_banner',
        '-nostdin',
        '-loglevel',
        'warning',
        '-f',
        'lavfi',
        '-i',
        'color=c=black:s=64x64:d=0.04',
        '-frames:v',
        '1',
        '-c:v',
        codec,
        ...codecArgs,
        '-pix_fmt',
        'yuv420p',
        '-f',
        'null',
        '-',
      ],
      { windowsHide: true },
    )
    child.stderr.on('data', (c: Buffer) => {
      stderr += c.toString('utf-8')
    })
    child.on('error', () => resolve(false))
    child.on('close', (code) => {
      if (code == null || code !== 0) return resolve(false)
      const fail =
        codec === 'h264_nvenc'
          ? /Driver does not support|required nvenc api|Error while opening encoder|Function not implemented/i.test(
              stderr,
            )
          : /Error while opening encoder|Function not implemented|does not support device/i.test(stderr)
      resolve(!fail)
    })
  })
  if (codec === 'h264_nvenc') nvencProbe = pending
  else qsvProbe = pending
  return pending
}

/** 渲染时发现硬编实际不可用，清除缓存以免同进程后续任务重复踩坑 */
export function invalidateHwEncoderProbes() {
  nvencProbe = null
  qsvProbe = null
}

export function libx264Pick(note: string): EncoderPick {
  return { codec: 'libx264', args: ['-preset', 'veryfast'], note }
}

async function listEncoders(): Promise<Set<string>> {
  if (cached) return cached
  cached = new Promise<Set<string>>((resolve) => {
    const exe = ffmpegExe()
    if (!exe) return resolve(new Set())

    const child = spawn(exe as string, ['-hide_banner', '-encoders'], { windowsHide: true })
    const out: string[] = []
    child.stdout.on('data', (c: Buffer) => out.push(...splitLines(c)))
    child.stderr.on('data', (c: Buffer) => out.push(...splitLines(c)))
    child.on('error', () => resolve(new Set()))
    child.on('close', () => {
      const set = new Set<string>()
      for (const line of out) {
        // typical line: " V..... h264_nvenc           NVIDIA NVENC H.264 encoder"
        const m = line.match(/\s([a-z0-9_]+)\s{2,}/i)
        if (m?.[1]) set.add(m[1])
      }
      resolve(set)
    })
  })
  return cached
}

/** Windows 下是否尝试 NVENC（默认不尝试：ffmpeg-static 常要求较新 NVENC API，与旧驱动不兼容） */
function win32ShouldTryNvenc(env: string): boolean {
  return ['nvenc', 'on', 'try', 'hw', '1', 'yes', 'all'].includes(env)
}

export async function pickH264Encoder(): Promise<EncoderPick> {
  const env = String(process.env.VG_HWENC ?? 'auto').toLowerCase().trim()
  if (env === 'off' || env === '0' || env === 'false') {
    return libx264Pick('硬编已关闭（VG_HWENC=off）')
  }

  const enc = await listEncoders()

  // Windows：默认 QSV（若可用）→ libx264；仅当 VG_HWENC=nvenc/on/try… 时才尝试 NVENC
  if (process.platform === 'win32') {
    if (win32ShouldTryNvenc(env) && enc.has('h264_nvenc') && (await probeHwEncoder('h264_nvenc'))) {
      return {
        codec: 'h264_nvenc',
        args: [
          '-preset',
          'p4',
          '-rc',
          'vbr',
          '-cq',
          '23',
          '-b:v',
          '0',
        ],
        note: '使用 NVIDIA NVENC 硬件编码（VG_HWENC 已启用）',
      }
    }
    if (enc.has('h264_qsv') && (await probeHwEncoder('h264_qsv'))) {
      return {
        codec: 'h264_qsv',
        args: ['-preset', 'veryfast', '-global_quality', '23'],
        note: '使用 Intel QSV 硬件编码',
      }
    }
  }

  const hwListedWin = process.platform === 'win32' && (enc.has('h264_nvenc') || enc.has('h264_qsv'))
  const autoWin = process.platform === 'win32' && env === 'auto'
  return {
    codec: 'libx264',
    args: ['-preset', 'veryfast'],
    note: autoWin
      ? 'Windows 默认 libx264（避免 NVENC 驱动 API 与静态 FFmpeg 不匹配）；可选 VG_HWENC=nvenc 尝试 NVIDIA 硬编'
      : hwListedWin
        ? '硬编探测未通过，已改用 libx264'
        : '使用软件编码 libx264',
  }
}

