import { spawn } from 'node:child_process'
import { getFfmpegExecutable } from '../../lib/binariesPath'

export type FfmpegRunOptions = {
  args: string[]
  onStdout?: (line: string) => void
  onStderr?: (line: string) => void
  signal?: AbortSignal
}

function splitLines(chunk: Buffer) {
  return chunk
    .toString('utf-8')
    .split(/\r?\n/g)
    .map((s) => s.trim())
    .filter(Boolean)
}

function buildFfmpegError(code: number | null, stderrTail: string[], stdoutTail: string[]) {
  const tail = [...stderrTail, ...stdoutTail].slice(-80).join('\n')
  const normalizedTail = tail.toLowerCase()

  if (normalizedTail.includes('no space left on device')) {
    return new Error(
      [
        'FFmpeg 写入输出文件失败：磁盘空间不足。',
        '请先清理系统磁盘或 VideoGenerate 应用数据目录后重试。',
        tail ? `--- ffmpeg tail ---\n${tail}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    )
  }

  return new Error(`ffmpeg 退出码: ${code}\n${tail ? `--- ffmpeg tail ---\n${tail}` : ''}`.trim())
}

export function runFfmpeg(opts: FfmpegRunOptions): Promise<void> {
  let ffmpegPath: string
  try {
    ffmpegPath = getFfmpegExecutable()
  } catch (e: any) {
    return Promise.reject(new Error(e?.message ?? String(e)))
  }

  return new Promise((resolve, reject) => {
    const env = { ...process.env } as NodeJS.ProcessEnv
    if (process.platform !== 'win32') {
      env.LC_ALL = env.LC_ALL || 'C.UTF-8'
      env.LANG = env.LANG || 'C.UTF-8'
    }

    const child = spawn(ffmpegPath as string, opts.args, { windowsHide: true, env })
    let aborted = false
    const stderrTail: string[] = []
    const stdoutTail: string[] = []
    const tailLimit = 80

    const onAbort = () => {
      aborted = true
      try {
        child.kill('SIGKILL')
      } catch {
        // ignore
      }
    }

    if (opts.signal) {
      if (opts.signal.aborted) onAbort()
      else opts.signal.addEventListener('abort', onAbort, { once: true })
    }

    child.stdout.on('data', (c: Buffer) =>
      splitLines(c).forEach((l) => {
        stdoutTail.push(l)
        if (stdoutTail.length > tailLimit) stdoutTail.splice(0, stdoutTail.length - tailLimit)
        opts.onStdout?.(l)
      }),
    )

    child.stderr.on('data', (c: Buffer) =>
      splitLines(c).forEach((l) => {
        stderrTail.push(l)
        if (stderrTail.length > tailLimit) stderrTail.splice(0, stderrTail.length - tailLimit)
        opts.onStderr?.(l)
      }),
    )

    child.on('error', reject)
    child.on('close', (code) => {
      if (opts.signal) opts.signal.removeEventListener('abort', onAbort)
      if (aborted) {
        reject(new Error('ffmpeg 已中止'))
        return
      }
      if (code === 0) {
        resolve()
        return
      }
      reject(buildFfmpegError(code, stderrTail, stdoutTail))
    })
  })
}
