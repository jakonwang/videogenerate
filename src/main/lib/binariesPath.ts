import { existsSync } from 'node:fs'
import { app } from 'electron'
import ffmpegStatic from 'ffmpeg-static'
import ffprobeStatic from 'ffprobe-static'

/**
 * electron-builder 将 ffmpeg/ffprobe 解包到 app.asar.unpacked，但 *-static 包用 __dirname 拼路径仍落在 app.asar 下，
 * Windows 上 spawn 会报 ENOENT（asar 内不能执行原生 exe）。
 */
function resolveAsarUnpackedPath(moduleResolvedPath: string): string {
  if (!moduleResolvedPath) return moduleResolvedPath
  try {
    if (app.isPackaged && moduleResolvedPath.includes('app.asar') && !moduleResolvedPath.includes('app.asar.unpacked')) {
      const swapped = moduleResolvedPath.replace(/app\.asar([\\/])/g, 'app.asar.unpacked$1')
      if (existsSync(swapped)) return swapped
    }
  } catch {
    // ignore
  }
  return moduleResolvedPath
}

let cachedFfprobe: string | null = null
let cachedFfmpeg: string | null = null

export function getFfprobeExecutable(): string {
  if (cachedFfprobe && existsSync(cachedFfprobe)) return cachedFfprobe
  const raw = typeof ffprobeStatic === 'string' ? ffprobeStatic : String(ffprobeStatic?.path ?? '')
  const p = resolveAsarUnpackedPath(raw)
  if (!p || !existsSync(p)) {
    throw new Error(`找不到 ffprobe。已尝试: ${p}`)
  }
  cachedFfprobe = p
  return p
}

export function getFfmpegExecutable(): string {
  if (cachedFfmpeg && existsSync(cachedFfmpeg)) return cachedFfmpeg
  const raw =
    typeof ffmpegStatic === 'string'
      ? ffmpegStatic
      : String((ffmpegStatic as unknown as { path?: string } | undefined)?.path ?? '')
  const p = resolveAsarUnpackedPath(raw)
  if (!p || !existsSync(p)) {
    throw new Error(`找不到 ffmpeg。已尝试: ${p}`)
  }
  cachedFfmpeg = p
  return p
}
