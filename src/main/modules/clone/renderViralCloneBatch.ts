import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { getFfmpegExecutable } from '../../lib/binariesPath'
import type { ShotSpec } from './types'

async function run(args: string[]) {
  const ffmpeg = getFfmpegExecutable()
  await new Promise<void>((resolve, reject) => {
    const c = spawn(ffmpeg, args, { windowsHide: true })
    c.on('error', reject)
    c.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg failed: ${code}`))))
  })
}

async function normalizeClip(input: { src: string; durationSec: number; out: string }) {
  await run([
    '-y',
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
    shotSources: Array<{ shotId: string; source: string }>
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
        for (const shot of input.shots) {
          if (shot.isMock || shot.generatedSource === 'mock' || shot.generatedSource === 'local') {
            throw new Error(`shot ${shot.index + 1} is mock/local and cannot be rendered`)
          }
          const src = shot.uploadedAssetPath || shot.generatedClipPath
          if (!src) continue
          const out = join(jobDir, `${shot.id}.mp4`)
          await normalizeClip({ src, durationSec: Number(shot.durationSec || 1.5), out })
          normalized.push(out)
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
          shotSources: input.shots.map((s) => ({
            shotId: s.id,
            source: s.generatedClipPath ? 'ai' : s.uploadedAssetPath ? 'upload' : 'none',
          })),
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
