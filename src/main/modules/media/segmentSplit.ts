import { access, mkdir, readdir, rm, stat } from 'node:fs/promises'
import { constants as fsConstants } from 'node:fs'
import { join, extname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { getAppPaths } from '../../lib/paths'
import { runFfmpeg } from '../ffmpeg/runner'

function toFfmpegPath(p: string) {
  return p.replace(/\\/g, '/')
}

export type SegmentSplitPhase = 'ffmpeg' | 'collect'

/**
 * 使用 FFmpeg segment 复用流（-c copy）极速切分，输出写入 userData cache（持久路径，便于产品 JSON 引用）。
 * 实际切段时长依赖关键帧，可能略大于 segmentTimeSec。
 */
export async function splitVideoToSegmentFiles(opts: {
  inputPath: string
  segmentTimeSec: number
  outputDir?: string
  outputFormat?: 'source' | 'mp4'
  onProgress?: (p: { phase: SegmentSplitPhase }) => void
}): Promise<string[]> {
  const inputPath = String(opts.inputPath ?? '').trim()
  if (!inputPath) throw new Error('未选择输入文件')
  await access(inputPath, fsConstants.R_OK)

  const segTime = Math.max(1, Math.min(600, Math.round(Number(opts.segmentTimeSec) || 3)))
  const { cacheDir } = getAppPaths()
  const outputRoot = String(opts.outputDir ?? '').trim()
  const outDir = outputRoot || join(cacheDir, 'segment_clips', randomUUID())
  await mkdir(outDir, { recursive: true })

  let ext = extname(inputPath).toLowerCase()
  if (!['.mp4', '.mov', '.mkv', '.webm'].includes(ext)) ext = '.mp4'
  if (opts.outputFormat === 'mp4') ext = '.mp4'
  const pattern = toFfmpegPath(join(outDir, `part_%03d${ext}`))

  opts.onProgress?.({ phase: 'ffmpeg' })

  const args = [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-i',
    toFfmpegPath(inputPath),
    '-c',
    'copy',
    '-map',
    '0',
    '-f',
    'segment',
    '-segment_time',
    String(segTime),
    '-reset_timestamps',
    '1',
    pattern,
  ]

  try {
    await runFfmpeg({ args })
  } catch (e) {
    try {
      await rm(outDir, { recursive: true, force: true })
    } catch {
      /* ignore */
    }
    throw e
  }

  opts.onProgress?.({ phase: 'collect' })

  const names = (await readdir(outDir))
    .filter((n) => n.startsWith('part_'))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  const out: string[] = []
  for (const n of names) {
    const fp = join(outDir, n)
    try {
      const s = await stat(fp)
      if (s.size > 256) out.push(fp)
    } catch {
      /* skip */
    }
  }
  if (!out.length) {
    await rm(outDir, { recursive: true, force: true }).catch(() => {})
    throw new Error('切片未生成任何片段（请检查原片是否可读，或略增大切分秒数后重试）')
  }
  return out
}
