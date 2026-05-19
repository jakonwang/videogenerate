import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { getFfmpegExecutable } from '../../lib/binariesPath'
import type { ShotSpec } from './types'

type FinalComposeClipMode = 'reference_trim' | 'smart_middle_tail' | 'full_generated_clip'

type ClipWindow = {
  sourceDurationSec: number
  clipStartSec: number
  clipDurationSec: number
  mode: FinalComposeClipMode
}

const FINAL_COMPOSE_CLIP_MODE: FinalComposeClipMode = 'smart_middle_tail'

async function run(args: string[]) {
  const ffmpeg = getFfmpegExecutable()
  await new Promise<void>((resolve, reject) => {
    const c = spawn(ffmpeg, args, { windowsHide: true })
    c.on('error', reject)
    c.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg failed: ${code}`))))
  })
}

async function probeDurationSec(src: string) {
  const ffmpeg = getFfmpegExecutable()
  const ffprobe = ffmpeg.toLowerCase().includes('ffmpeg') ? ffmpeg.replace(/ffmpeg(\.exe)?$/i, 'ffprobe$1') : 'ffprobe'
  return await new Promise<number>((resolve, reject) => {
    const args = ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', src]
    let stdout = ''
    let stderr = ''
    const c = spawn(ffprobe, args, { windowsHide: true })
    c.stdout.on('data', (chunk) => {
      stdout += String(chunk)
    })
    c.stderr.on('data', (chunk) => {
      stderr += String(chunk)
    })
    c.on('error', reject)
    c.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`ffprobe failed: ${code} ${stderr}`.trim()))
        return
      }
      const dur = Number(String(stdout).trim())
      if (!Number.isFinite(dur) || dur <= 0) {
        reject(new Error(`invalid source duration: ${stdout}`.trim()))
        return
      }
      resolve(dur)
    })
  })
}

function round3(value: number) {
  return Math.round(value * 1000) / 1000
}

function pickClipWindow(input: {
  mode: FinalComposeClipMode
  sourceDurationSec: number
  targetDurationSec: number
}) {
  const sourceDurationSec = Math.max(0.5, Number(input.sourceDurationSec || 0.5))
  const targetDurationSec = Math.max(0.5, Number(input.targetDurationSec || 0.5))
  const clampedTarget = Math.min(targetDurationSec, sourceDurationSec)
  const remaining = Math.max(0, sourceDurationSec - clampedTarget)
  if (input.mode === 'full_generated_clip' || remaining <= 0.2) {
    return {
      sourceDurationSec: round3(sourceDurationSec),
      clipStartSec: 0,
      clipDurationSec: round3(sourceDurationSec),
      mode: input.mode,
    } satisfies ClipWindow
  }
  if (input.mode === 'reference_trim') {
    return {
      sourceDurationSec: round3(sourceDurationSec),
      clipStartSec: 0,
      clipDurationSec: round3(clampedTarget),
      mode: input.mode,
    } satisfies ClipWindow
  }
  const shortTarget = clampedTarget <= 1.2
  const anchor = shortTarget ? 0.72 : clampedTarget <= 2.5 ? 0.64 : 0.58
  const leadingPad = shortTarget ? Math.min(0.18, clampedTarget * 0.15) : Math.min(0.35, clampedTarget * 0.18)
  const clipStartSec = Math.max(0, Math.min(remaining, sourceDurationSec * anchor - leadingPad))
  return {
    sourceDurationSec: round3(sourceDurationSec),
    clipStartSec: round3(clipStartSec),
    clipDurationSec: round3(clampedTarget),
    mode: input.mode,
  } satisfies ClipWindow
}

async function normalizeClip(input: { src: string; durationSec: number; out: string; clipStartSec?: number }) {
  await run([
    '-y',
    '-ss',
    `${Math.max(0, Number(input.clipStartSec || 0))}`,
    '-i', input.src,
    '-t', `${Math.max(0.5, input.durationSec)}`,
    '-vf', 'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black,fps=30',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest',
    input.out,
  ])
}

export async function renderViralCloneBatch(input: {
  projectId: string
  shots: ShotSpec[]
  outDir: string
  count: number
  bgmPath?: string
  maxRetry?: number
}) {
  await mkdir(input.outDir, { recursive: true })
  const results: string[] = []
  const report: Array<{
    index: number
    output: string
    success: boolean
    error?: string
    shotSources: Array<{
      shotId: string
      source: string
      sourceDurationSec?: number
      clipStartSec?: number
      clipDurationSec?: number
      clipMode?: FinalComposeClipMode
    }>
  }> = []
  const retries = Math.max(0, Number(input.maxRetry ?? 1))
  for (let i = 0; i < Math.max(1, input.count); i++) {
    const index = i + 1
    let done = false
    let lastErr = ''
    for (let attempt = 0; attempt <= retries && !done; attempt++) {
      try {
        const jobDir = join(input.outDir, `job_${String(index).padStart(3, '0')}_try_${attempt + 1}`)
        await mkdir(jobDir, { recursive: true })
        const normalized: string[] = []
        const shotSourceReport: Array<{
          shotId: string
          source: string
          sourceDurationSec?: number
          clipStartSec?: number
          clipDurationSec?: number
          clipMode?: FinalComposeClipMode
        }> = []
        for (const shot of input.shots) {
          if (shot.isMock || shot.generatedSource === 'mock' || shot.generatedSource === 'local') {
            throw new Error(`shot ${shot.index + 1} is mock/local and cannot be rendered`)
          }
          const src = shot.uploadedAssetPath || shot.generatedClipPath
          if (!src) continue
          const out = join(jobDir, `${shot.id}.mp4`)
          const sourceDurationSec = await probeDurationSec(src)
          const clipWindow = pickClipWindow({
            mode: FINAL_COMPOSE_CLIP_MODE,
            sourceDurationSec,
            targetDurationSec: Number(shot.durationSec || 1.5),
          })
          await normalizeClip({
            src,
            durationSec: clipWindow.clipDurationSec,
            clipStartSec: clipWindow.clipStartSec,
            out,
          })
          normalized.push(out)
          shotSourceReport.push({
            shotId: shot.id,
            source: shot.generatedClipPath ? 'ai' : shot.uploadedAssetPath ? 'upload' : 'none',
            sourceDurationSec: clipWindow.sourceDurationSec,
            clipStartSec: clipWindow.clipStartSec,
            clipDurationSec: clipWindow.clipDurationSec,
            clipMode: clipWindow.mode,
          })
        }
        const listFile = join(jobDir, 'concat.txt')
        await writeFile(listFile, normalized.map((x) => `file '${x.replace(/'/g, "'\\''")}'`).join('\n'), 'utf8')
        const rawOut = join(jobDir, 'joined.mp4')
        await run(['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', rawOut])
        const finalOut = join(input.outDir, `viral_clone_${String(index).padStart(3, '0')}.mp4`)
        if (input.bgmPath) {
          await run([
            '-y',
            '-stream_loop',
            '-1',
            '-i',
            input.bgmPath,
            '-i',
            rawOut,
            '-map',
            '1:v:0',
            '-map',
            '0:a:0',
            '-shortest',
            '-c:v',
            'copy',
            '-c:a',
            'aac',
            '-b:a',
            '192k',
            finalOut,
          ])
        } else {
          await run(['-y', '-i', rawOut, '-c', 'copy', finalOut])
        }
        results.push(finalOut)
        report.push({
          index,
          output: finalOut,
          success: true,
          shotSources: shotSourceReport,
        })
        done = true
      } catch (e: any) {
        lastErr = String(e?.message ?? e)
      }
    }
    if (!done) {
      report.push({
        index,
        output: '',
        success: false,
        error: lastErr || 'render_failed',
        shotSources: input.shots.map((s) => ({
          shotId: s.id,
          source: s.generatedClipPath ? 'ai' : s.uploadedAssetPath ? 'upload' : 'none',
          clipMode: FINAL_COMPOSE_CLIP_MODE,
        })),
      })
    }
  }
  const reportPath = join(input.outDir, 'batch-report.json')
  await writeFile(
    reportPath,
    JSON.stringify(
      {
        projectId: input.projectId,
        createdAt: Date.now(),
        total: Math.max(1, input.count),
        success: report.filter((x) => x.success).length,
        failed: report.filter((x) => !x.success).length,
        items: report,
      },
      null,
      2,
    ),
    'utf8',
  )
  return { outputs: results, reportPath }
}
