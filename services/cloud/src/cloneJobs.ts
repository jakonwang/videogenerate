import { spawn } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { badRequest } from './security'
import type { CloneAnalysis, CloneComposeClip } from '../../../src/shared/cloud/clone'
// Same analyser as the desktop: scene cuts + reference frames + AI script analysis.
import { analyzeReferenceVideo } from '../../../src/main/modules/clone/analyzer'
import { probeMedia } from '../../../src/main/modules/ffmpeg/probe'
import { getFfmpegExecutable } from '../../../src/main/lib/binariesPath'
import {
  classifyBoundary,
  detectFreezeEdges,
  longTakePartWindow,
  measureClipColor,
  measureFrameSimilarity,
  resolveColorMatchFilters,
  resolveRetimeFactor,
} from '../../../src/main/modules/clone/continuity'
import type { ModelCredentials } from '../../../src/main/modules/clone/types'

/**
 * 复刻相关的云端任务：拆解对标视频、合成成片。都用服务器上的 ffmpeg（ffmpeg-static 自带）。
 */

const MAX_REFERENCE_SEC = 180
const MAX_SHOTS = 30

export type CloneProviders = {
  analyzeReferenceVideo: typeof analyzeReferenceVideo
  probeDuration: (path: string) => Promise<number>
  /** 宽高、时长、有没有音轨（直播切片导出用） */
  probe?: (path: string) => Promise<{ durationSec: number; width: number; height: number; hasAudio: boolean }>
  /** cwd：在工作目录里运行，让滤镜里的相对路径（字幕、字体）不需要转义盘符 */
  ffmpeg: (args: string[], cwd?: string) => Promise<void>
}

export const DEFAULT_CLONE_PROVIDERS: CloneProviders = {
  analyzeReferenceVideo,
  probeDuration: async (path) => Number((await probeMedia(path)).durationSec ?? 0),
  probe: async (path) => {
    const info = await probeMedia(path)
    return { durationSec: Number(info.durationSec ?? 0), width: Number(info.width ?? 0), height: Number(info.height ?? 0), hasAudio: Boolean(info.hasAudio) }
  },
  ffmpeg: (args, cwd) =>
    new Promise((resolve, reject) => {
      const child = spawn(getFfmpegExecutable(), ['-hide_banner', '-loglevel', 'error', '-y', ...args], { windowsHide: true, cwd })
      let stderr = ''
      child.stderr.on('data', (chunk) => (stderr += String(chunk)).length > 8000 && (stderr = stderr.slice(-4000)))
      child.on('error', reject)
      child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg 失败(${code}): ${stderr.trim().slice(-500)}`))))
    }),
}

type Files = {
  read: (fileId: string) => { mime: string; body: Buffer }
  store: (body: Buffer, mime: string) => { fileId: string }
}

/** 拆解对标视频：分镜 + 每镜参考帧（存进云端文件）+ AI 脚本 */
export async function runAnalyze(input: { videoFileId: string; locale?: string; workDir: string; credentials: ModelCredentials; files: Files; providers: CloneProviders }): Promise<CloneAnalysis> {
  const video = input.files.read(input.videoFileId)
  if (!video.mime.startsWith('video/')) throw badRequest('请上传视频文件')
  const videoPath = join(input.workDir, 'reference.mp4')
  await writeFile(videoPath, video.body)
  const duration = await input.providers.probeDuration(videoPath)
  if (!duration) throw badRequest('无法读取视频，请换一个视频')
  if (duration > MAX_REFERENCE_SEC) throw badRequest(`对标视频最长 ${MAX_REFERENCE_SEC / 60} 分钟，请先剪短`)

  const locale = input.locale === 'zh-CN' || input.locale === 'vi-VN' ? input.locale : 'en-US'
  const { blueprint } = await input.providers.analyzeReferenceVideo({ videoPath, outputDir: input.workDir, credentials: input.credentials, locale: locale as any })
  const shots = blueprint.shots.slice(0, MAX_SHOTS)
  const result: CloneAnalysis = {
    totalDurationSec: Number(blueprint.totalDurationSec || duration),
    aspectRatio: blueprint.referenceAspectRatio === '16:9' ? '16:9' : '9:16',
    language: String(blueprint.globalScript?.language || locale),
    summary: String(blueprint.globalScript?.summary || blueprint.videoSummary || ''),
    hook: String(blueprint.globalScript?.hook || blueprint.scriptFrame?.hook || ''),
    cta: String(blueprint.globalScript?.cta || blueprint.scriptFrame?.cta || ''),
    scriptError: blueprint.scriptAnalysisError,
    shots: [],
  }
  for (const [index, shot] of shots.entries()) {
    const framePath = shot.referenceFramePaths?.mid || shot.referenceFramePaths?.start || shot.thumbnailPath
    let frameFileId: string | undefined
    if (framePath) {
      try {
        frameFileId = input.files.store(await readFile(framePath), 'image/jpeg').fileId
      } catch {
        frameFileId = undefined
      }
    }
    const s = shot as typeof shot & Record<string, any>
    result.shots.push({
      id: shot.id,
      index,
      startSec: Number(shot.startSec || 0),
      durationSec: Math.max(0.5, Number(shot.durationSec || 0)),
      role: String(s.scriptRole || shot.purpose || 'show'),
      scriptText: String(s.scriptText || ''),
      onScreenText: s.onScreenText ? String(s.onScreenText) : undefined,
      visual: String(s.visualDescription || shot.visualPrompt || ''),
      action: String(s.actionDescription || s.action || ''),
      camera: String(s.cameraDescription || s.cameraMovement || ''),
      frameFileId,
      eligible: shot.cloneEligible !== false,
    })
  }
  // Which neighbouring shots were really one continuous take (the analyzer may split a single take
  // at fixed points): their clips are later generated to join up instead of jumping.
  for (let i = 0; i < result.shots.length - 1; i++) {
    const similarity = await measureFrameSimilarity(
      shots[i]?.referenceFramePaths?.end || shots[i]?.referenceFramePaths?.mid,
      shots[i + 1]?.referenceFramePaths?.start || shots[i + 1]?.referenceFramePaths?.mid,
    )
    result.shots[i]!.continuousWithNext = classifyBoundary(similarity) === 'continuous'
  }
  return result
}

const SIZE = { '9:16': [720, 1280], '16:9': [1280, 720] } as const

/** 合成成片：每段按目标时长裁剪 / 补帧，统一尺寸和帧率后拼接（不带声音，配乐在发布时加） */
export async function runCompose(input: { clips: CloneComposeClip[]; aspectRatio?: '9:16' | '16:9' | '1:1'; workDir: string; files: Files; providers: CloneProviders }) {
  if (!input.clips.length) throw badRequest('没有可合成的片段')
  if (input.clips.length > MAX_SHOTS) throw badRequest(`最多合成 ${MAX_SHOTS} 段`)
  const [width, height] = SIZE[input.aspectRatio === '16:9' ? '16:9' : '9:16']
  const fit = `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=30,format=yuv420p`

  type Plan = { source: string; isImage: boolean; startSec: number; usedSec: number; outSec: number; speed: number; pad: boolean }
  const plans: Plan[] = []
  for (const [index, clip] of input.clips.entries()) {
    const file = input.files.read(clip.fileId)
    const isImage = file.mime.startsWith('image/')
    const source = join(input.workDir, `clip_${index}${isImage ? '.img' : '.mp4'}`)
    await writeFile(source, file.body)
    const target = Math.max(0.5, Math.min(20, Number(clip.durationSec) || 3))
    if (isImage) {
      plans.push({ source, isImage, startSec: 0, usedSec: target, outSec: target, speed: 1, pad: false })
      continue
    }
    const sourceSec = Number(await input.providers.probeDuration(source).catch(() => 0)) || 0
    const lockedIn = input.clips[index - 1]?.joinNext === 'locked'
    const lockedOut = clip.joinNext === 'locked'
    // Part of a long take shared with neighbouring shots: only this shot's stretch of it.
    const window = clip.take && sourceSec > 0 ? longTakePartWindow(clip.take, sourceSec) : { startSec: 0, durationSec: sourceSec }
    // Models often hold the first / last frame; at a join that reads as a stall.
    const freeze = sourceSec > 0 ? await detectFreezeEdges(source, sourceSec) : { headSec: 0, tailSec: 0 }
    const head = window.startSec <= 0.01 ? freeze.headSec : 0
    const tail = window.startSec + window.durationSec >= sourceSec - 0.01 ? freeze.tailSec : 0
    const startSec = window.startSec + head
    const usedSec = Math.max(0.3, window.durationSec - head - tail)
    if ((lockedIn || lockedOut || clip.take) && sourceSec > 0) {
      // Generated to start / end exactly where its neighbours do: keep it whole, retime to the shot length.
      const speed = resolveRetimeFactor(usedSec, target)
      plans.push({ source, isImage, startSec, usedSec, outSec: Math.min(target, usedSec * speed), speed, pad: false })
    } else {
      // Short videos hold their last frame so every shot keeps the reference rhythm.
      plans.push({ source, isImage, startSec, usedSec: target, outSec: target, speed: 1, pad: true })
    }
  }

  // Pull brightness / saturation of every clip toward the median so cuts do not flicker.
  const colorFilters = resolveColorMatchFilters(
    await Promise.all(plans.map((plan) => (plan.isImage ? Promise.resolve(null) : measureClipColor(plan.source, plan.startSec, Math.min(plan.usedSec, 4))))),
  )
  const parts: string[] = []
  for (const [index, plan] of plans.entries()) {
    const part = join(input.workDir, `part_${index}.mp4`)
    const duration = plan.outSec.toFixed(2)
    const filters = [
      plan.speed !== 1 ? `setpts=PTS*${plan.speed}` : '',
      fit,
      plan.pad ? `tpad=stop_mode=clone:stop_duration=${duration}` : '',
      colorFilters[index] || '',
    ].filter(Boolean)
    await input.providers.ffmpeg([
      ...(plan.isImage ? ['-loop', '1'] : plan.startSec > 0 ? ['-ss', plan.startSec.toFixed(3)] : []),
      '-i', plan.source,
      '-t', duration,
      '-vf', filters.join(','),
      '-an',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
      part,
    ])
    parts.push(part)
  }

  const output = join(input.workDir, 'final.mp4')
  // Reference-continuous joins that could not be lined up get a short fade instead of a jump.
  const fades = input.clips.slice(0, -1).map((clip) => clip.joinNext === 'continuous')
  if (parts.length > 1 && fades.some(Boolean)) {
    const graph: string[] = parts.map((_, i) => `[${i}:v]settb=AVTB,setpts=PTS-STARTPTS[v${i}]`)
    let label = 'v0'
    let length = plans[0]!.outSec
    for (let i = 1; i < parts.length; i++) {
      const next = `x${i}`
      if (fades[i - 1]) {
        const fade = Math.min(0.25, length - 0.1, plans[i]!.outSec - 0.1)
        if (fade > 0.05) {
          graph.push(`[${label}][v${i}]xfade=transition=fade:duration=${fade.toFixed(3)}:offset=${(length - fade).toFixed(3)}[${next}]`)
          length += plans[i]!.outSec - fade
          label = next
          continue
        }
      }
      graph.push(`[${label}][v${i}]concat=n=2:v=1:a=0[${next}]`)
      length += plans[i]!.outSec
      label = next
    }
    await input.providers.ffmpeg([
      ...parts.flatMap((part) => ['-i', part]),
      '-filter_complex', graph.join(';'),
      '-map', `[${label}]`,
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      output,
    ])
    return output
  }
  const list = join(input.workDir, 'list.txt')
  await writeFile(list, parts.map((part) => `file '${part.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`).join('\n'))
  await input.providers.ffmpeg(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', output])
  return output
}
