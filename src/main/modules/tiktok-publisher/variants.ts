/**
 * 矩阵发布的「每个号一个版本」：
 * - 视频：轻微放大裁边、调色、变速，去掉元数据后重新编码，画面内容不变（不镜像，免得商品上的字反过来）
 * - 文案：AI 按原语言改写标题和描述，话题保留；AI 不可用时按规则打乱话题顺序
 */
import { mkdir } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { getAppPaths } from '../../lib/paths'
import { runFfmpeg } from '../ffmpeg/runner'
import { probeMedia } from '../ffmpeg/probe'
import { pickH264Encoder } from '../ffmpeg/encoders'

export type VideoVariantParams = { zoom: number; speed: number; brightness: number; contrast: number; saturation: number }

/** 按序号和种子算一组微调参数（同一序号不同种子也不同；序号 0 不改）。 */
export function videoVariantParams(index: number, random: () => number = Math.random): VideoVariantParams {
  if (index <= 0) return { zoom: 1, speed: 1, brightness: 0, contrast: 1, saturation: 1 }
  const between = (min: number, max: number) => min + (max - min) * random()
  const sign = random() < 0.5 ? -1 : 1
  return {
    zoom: Number(between(1.02, 1.06).toFixed(3)),
    speed: Number((1 + sign * between(0.01, 0.035)).toFixed(3)),
    brightness: Number(between(-0.03, 0.03).toFixed(3)),
    contrast: Number(between(0.97, 1.05).toFixed(3)),
    saturation: Number(between(0.95, 1.08).toFixed(3)),
  }
}

export function buildVariantVideoArgs(input: {
  source: string
  output: string
  width: number
  height: number
  hasAudio: boolean
  params: VideoVariantParams
  encoderArgs: string[]
  codec: string
}) {
  const { params } = input
  const w = Math.max(2, Math.round(input.width / 2) * 2)
  const h = Math.max(2, Math.round(input.height / 2) * 2)
  const zw = Math.round((w * params.zoom) / 2) * 2
  const zh = Math.round((h * params.zoom) / 2) * 2
  const video = [
    `scale=${zw}:${zh}`,
    `crop=${w}:${h}`,
    `eq=brightness=${params.brightness}:contrast=${params.contrast}:saturation=${params.saturation}`,
    `setpts=PTS/${params.speed}`,
    'format=yuv420p',
  ].join(',')
  return [
    '-y',
    '-i', input.source,
    '-map', '0:v:0',
    ...(input.hasAudio ? ['-map', '0:a:0?'] : []),
    '-vf', video,
    ...(input.hasAudio ? ['-af', `atempo=${params.speed}`, '-c:a', 'aac', '-b:a', '128k'] : ['-an']),
    '-c:v', input.codec, ...input.encoderArgs,
    '-map_metadata', '-1',
    '-metadata', `comment=${randomUUID()}`,
    '-movflags', '+faststart',
    input.output,
  ]
}

export async function renderVideoVariant(input: { source: string; batchId: string; taskId: string; index: number }) {
  const probe = await probeMedia(input.source)
  if (!probe.width || !probe.height) throw new Error('读不到视频尺寸，无法生成变体')
  const dir = join(getAppPaths().dataDir, 'publish-variants', input.batchId)
  await mkdir(dir, { recursive: true })
  // 文件名保留原片名，方便在列表里认出来：earrings__v2_1a2b3c4d.mp4
  const base = basename(input.source, extname(input.source)).replace(/[\\/:*?"<>|]+/g, '_').slice(0, 60) || 'video'
  const output = join(dir, `${base}__v${input.index}_${input.taskId.slice(0, 8)}.mp4`)
  const encoder = await pickH264Encoder()
  await runFfmpeg({
    args: buildVariantVideoArgs({
      source: input.source,
      output,
      width: probe.width,
      height: probe.height,
      hasAudio: probe.hasAudio,
      params: videoVariantParams(input.index),
      codec: encoder.codec,
      encoderArgs: encoder.codec === 'libx264' ? [...encoder.args, '-crf', '20'] : encoder.args,
    }),
  })
  return output
}

export type CaptionDraft = { videoTitle?: string; description?: string }

const HASHTAG = /#[\p{L}\p{N}_]+/gu

function shuffled<T>(list: T[], random: () => number) {
  const copy = [...list]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    const swap = copy[i]!
    copy[i] = copy[j]!
    copy[j] = swap
  }
  return copy
}

/** 没有 AI 时的兜底：正文不动，话题换个顺序，保证每个号的描述不完全一样。 */
export function ruleCaptionVariant(source: CaptionDraft, index: number, random: () => number = Math.random): CaptionDraft {
  if (index <= 0) return { ...source }
  const description = String(source.description || '')
  const tags: string[] = [...(description.match(HASHTAG) || [])]
  if (tags.length < 2) return { ...source }
  const body = description.replace(HASHTAG, '').replace(/[ \t]+/g, ' ').replace(/\s+\n/g, '\n').trim()
  let order = shuffled(tags, random)
  if (order.join(' ') === tags.join(' ')) order = [...tags.slice(1), tags[0]!]
  return { ...source, description: [body, order.join(' ')].filter(Boolean).join('\n') }
}

export const CAPTION_VARIANT_SYSTEM = [
  'You rewrite TikTok Shop video captions so several accounts can post the same product without duplicate text.',
  'Keep the SAME language as the original. Keep every #hashtag exactly as written (you may reorder them).',
  'Keep the meaning and the selling points; change wording, order and openers. No new claims, no prices, no emojis spam.',
  'Title max 150 characters, description max 500 characters.',
  'Reply with JSON only: {"variants":[{"title":"...","description":"..."}]}',
].join('\n')

export function parseCaptionVariants(content: string, count: number): CaptionDraft[] {
  const text = String(content || '')
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return []
  try {
    const parsed = JSON.parse(text.slice(start, end + 1))
    const list = Array.isArray(parsed?.variants) ? parsed.variants : []
    return list.slice(0, count).map((item: any) => ({
      videoTitle: String(item?.title || '').trim().slice(0, 150) || undefined,
      description: String(item?.description || '').trim().slice(0, 500) || undefined,
    }))
  } catch {
    return []
  }
}

/** 给第 1..count 个号各出一版文案（第 0 个号用原文案，不在这里）。AI 失败时用规则兜底。 */
export async function captionVariants(
  source: CaptionDraft,
  count: number,
  ai?: (input: { system: string; prompt: string }) => Promise<string>,
): Promise<CaptionDraft[]> {
  if (count <= 0) return []
  let fromAi: CaptionDraft[] = []
  if (ai && (source.videoTitle || source.description)) {
    try {
      fromAi = parseCaptionVariants(
        await ai({ system: CAPTION_VARIANT_SYSTEM, prompt: JSON.stringify({ count, title: source.videoTitle || '', description: source.description || '' }) }),
        count,
      )
    } catch {
      fromAi = []
    }
  }
  return Array.from({ length: count }, (_, i) => {
    const rewritten = fromAi[i]
    const fallback = ruleCaptionVariant(source, i + 1)
    return {
      videoTitle: rewritten?.videoTitle || fallback.videoTitle,
      description: rewritten?.description || fallback.description,
    }
  })
}
