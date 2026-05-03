import { mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { spawn } from 'node:child_process'
import { getFfmpegExecutable } from '../../lib/binariesPath'
import { existsSync } from 'node:fs'

export async function generateImageFromPrompt(input: {
  prompt: string
  negativePrompt?: string
  referenceImages?: string[]
  outPath: string
}) {
  await mkdir(dirname(input.outPath), { recursive: true })
  const ffmpeg = getFfmpegExecutable()
  const ref = (input.referenceImages ?? []).find((x) => x && existsSync(x))
  await new Promise<void>((resolve, reject) => {
    const args = ref
      ? [
          '-y',
          '-i',
          ref,
          '-vf',
          'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=#151824,eq=contrast=1.04:saturation=1.05',
          '-frames:v',
          '1',
          input.outPath,
        ]
      : [
          '-y',
          '-f',
          'lavfi',
          '-i',
          'color=c=#223a78:s=1080x1920:d=1',
          '-vf',
          "drawbox=x=60:y=160:w=960:h=1600:color=#0f172a@0.35:t=fill,drawbox=x=80:y=180:w=920:h=1560:color=#ffffff@0.08:t=2",
          '-frames:v',
          '1',
          input.outPath,
        ]
    const c = spawn(ffmpeg, args, { windowsHide: true })
    c.on('error', reject)
    c.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`generate image failed: ${code}`))))
  })
  return { ok: true as const, outPath: input.outPath, model: 'mock-image' }
}

export async function generateVideoFromFrames(input: {
  firstFramePath: string
  lastFramePath: string
  prompt: string
  durationSec: number
  outPath: string
}) {
  await mkdir(dirname(input.outPath), { recursive: true })
  const ffmpeg = getFfmpegExecutable()
  const dur = Math.max(0.8, Number(input.durationSec || 1.5))
  const offset = Math.max(0.2, dur - 0.35)
  await new Promise<void>((resolve, reject) => {
    const args = [
      '-y',
      '-loop', '1', '-t', `${dur}`, '-i', input.firstFramePath,
      '-loop', '1', '-t', `${dur}`, '-i', input.lastFramePath,
      '-filter_complex',
      `[0:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=#111827,setsar=1[v0];` +
        `[1:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=#111827,setsar=1[v1];` +
        `[v0][v1]xfade=transition=fade:duration=0.35:offset=${offset},fps=30,format=yuv420p[v]`,
      '-map', '[v]', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
      input.outPath,
    ]
    const c = spawn(ffmpeg, args, { windowsHide: true })
    c.on('error', reject)
    c.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`generate video failed: ${code}`))))
  })
  return { ok: true as const, outPath: input.outPath, model: 'mock-i2v' }
}

export async function generateVideoFromImage(input: {
  imagePath: string
  prompt: string
  durationSec: number
  outPath: string
}) {
  await mkdir(dirname(input.outPath), { recursive: true })
  const ffmpeg = getFfmpegExecutable()
  const dur = Math.max(0.8, Number(input.durationSec || 1.5))
  await new Promise<void>((resolve, reject) => {
    const args = [
      '-y',
      '-loop', '1', '-t', `${dur}`, '-i', input.imagePath,
      '-vf',
      "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=#111827,fps=30,format=yuv420p",
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
      input.outPath,
    ]
    const c = spawn(ffmpeg, args, { windowsHide: true })
    c.on('error', reject)
    c.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`image2video failed: ${code}`))))
  })
  return { ok: true as const, outPath: input.outPath, model: 'mock-image2video' }
}
