/**
 * 模板库「导入视频 → AI 识别模板」。
 *
 * 复用复刻模块的参考视频分析（场景切点 + 关键帧 + AI 脚本分析），
 * 但不创建复刻项目：只把分析结果换算成一份可保存的混剪模板草稿，
 * 由用户在模板库里确认、改名后再保存。
 */
import { randomUUID } from 'node:crypto'
import { copyFile, mkdir, rm } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { getAppPaths } from '../../lib/paths'
import { analyzeReferenceVideo } from '../clone/analyzer'
import { cloneRepo } from '../clone/repo'
import type { CloneLocale, ShotSpec } from '../clone/types'
import { sweepUnusedRefDirs, templateRefsRoot } from './refAssets'
import { templatesRepo } from './repo'
import type { SegmentFx, Template, TemplateReferenceShot, TransitionConfig } from './types'

export type VideoTemplateDraft = {
  sourceVideoName: string
  durationSec: number
  aspectRatio: string
  shotCount: number
  scriptAnalysisError?: string
  shots: TemplateReferenceShot[]
  /** 可直接交给 templates:upsert 的模板内容 */
  template: Partial<Template> & Pick<Template, 'name' | 'structure'>
}

const round = (n: number, d = 2) => {
  const m = 10 ** d
  return Math.round(Number(n || 0) * m) / m
}
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n))

/** 混剪模板总时长上限（模板库里也按这个限制） */
export const TEMPLATE_MAX_TOTAL_SEC = 60

/**
 * 参考视频时长 → 模板总时长范围（上下浮动约 15%）。
 * 超过上限的长视频收到上限以内，并保证 min < max，不会出现 60–61 这种超限范围。
 */
export function totalDurationRange(totalSec: number): { min: number; max: number } {
  const total = Number.isFinite(totalSec) && totalSec > 0 ? totalSec : 10
  const min = clamp(Math.floor(total * 0.85), 3, TEMPLATE_MAX_TOTAL_SEC - 1)
  const max = clamp(Math.ceil(total * 1.15), min + 1, TEMPLATE_MAX_TOTAL_SEC)
  return { min, max }
}

/** 分镜在模板里的段位：按「这段在卖货视频里干什么」归类，同类镜头合成一段。 */
function segmentKeyOf(shot: ShotSpec): string {
  const script = String(shot.scriptRole || '')
  if (script === 'hook') return 'hook'
  if (script === 'pain_point') return 'pain'
  if (script === 'proof') return 'proof'
  if (script === 'offer') return 'offer'
  if (script === 'cta') return 'cta'
  if (script === 'detail') return 'detail'
  if (script === 'solution' || script === 'show') return 'show'
  const role = String(shot.role || '')
  if (role === 'hook') return 'hook'
  if (role === 'detail') return 'detail'
  if (role === 'model_scene') return 'scene'
  if (role === 'price_offer') return 'offer'
  if (role === 'social_proof') return 'proof'
  if (role === 'cta') return 'cta'
  return 'show'
}

function fxOfMotion(motion?: string): SegmentFx {
  switch (motion) {
    case 'zoom_in':
      return { zoom: { min: 1.02, max: 1.1 }, move: { x: { min: -0.015, max: 0.015 }, y: { min: -0.01, max: 0.01 } } }
    case 'zoom_out':
      return { zoom: { min: 1.0, max: 1.06 }, move: { x: { min: -0.015, max: 0.015 }, y: { min: -0.01, max: 0.01 } } }
    case 'pan_left':
    case 'pan_right':
      return { zoom: { min: 1.04, max: 1.08 }, move: { x: { min: -0.06, max: 0.06 }, y: { min: -0.01, max: 0.01 } } }
    case 'shake':
    case 'fast_cut':
      return { zoom: { min: 1.02, max: 1.08 }, move: { x: { min: -0.04, max: 0.04 }, y: { min: -0.03, max: 0.03 } } }
    default:
      return { zoom: { min: 1.0, max: 1.03 }, move: { x: { min: -0.015, max: 0.015 }, y: { min: -0.01, max: 0.01 } } }
  }
}

function transitionOf(name?: string): TransitionConfig['pool'][number] {
  if (name === 'fade' || name === 'flash' || name === 'zoom') return 'fade'
  if (name === 'slide') return 'slideleft'
  return 'hardcut'
}

function mostCommon<T>(items: T[]): T | undefined {
  const count = new Map<T, number>()
  for (const x of items) count.set(x, (count.get(x) ?? 0) + 1)
  return [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
}

async function keepThumbnail(src: string | undefined, dir: string, index: number): Promise<string | undefined> {
  const from = String(src || '').trim()
  if (!from) return undefined
  try {
    const to = join(dir, `shot_${index + 1}${extname(from) || '.jpg'}`)
    await copyFile(from, to)
    return to
  } catch {
    return undefined
  }
}

export async function analyzeVideoToTemplateDraft(input: {
  videoPath: string
  locale?: string
}): Promise<VideoTemplateDraft> {
  const videoPath = String(input?.videoPath ?? '').trim()
  if (!videoPath) throw new Error('请先选择要识别的视频')
  const locale: CloneLocale | undefined = String(input?.locale || '').startsWith('zh')
    ? 'zh-CN'
    : String(input?.locale || '').startsWith('vi')
      ? 'vi-VN'
      : undefined

  // 顺手清掉以前识别完没保存的草稿缩略图
  await sweepUnusedRefDirs(await templatesRepo.list()).catch(() => undefined)

  const jobId = randomUUID()
  const workDir = join(getAppPaths().tmpDir, 'template-analyze', jobId)
  // 关键帧留存在数据目录：模板保存后还要在「参考分镜」里显示
  const thumbDir = join(templateRefsRoot(), jobId)
  await mkdir(thumbDir, { recursive: true })

  try {
    const credentials = await cloneRepo.getCredentials()
    const { referenceVideoName, blueprint } = await analyzeReferenceVideo({
      videoPath,
      locale,
      outputDir: workDir,
      credentials,
    })

    const sourceShots = (blueprint.shots ?? []).filter((s) => Number(s.durationSec || 0) > 0)
    if (!sourceShots.length) throw new Error('没有从视频里识别到可用分镜')

    const shots: TemplateReferenceShot[] = []
    for (let i = 0; i < sourceShots.length; i++) {
      const s = sourceShots[i]!
      shots.push({
        index: i,
        segment: segmentKeyOf(s),
        startSec: round(s.startSec),
        durationSec: round(s.durationSec),
        motion: String(s.motion || 'static'),
        transitionIn: String(s.transitionIn || 'hardcut'),
        scriptText: String(s.narrationText || s.scriptText || '').trim(),
        onScreenText: String(s.onScreenText || s.originalCaption || '').trim(),
        visual: String(s.visualDescription || s.visualPrompt || '').trim().slice(0, 240),
        thumbnailPath: await keepThumbnail(s.thumbnailPath || s.referenceFramePaths?.mid, thumbDir, i),
      })
    }

    // 段位：按首次出现顺序去重
    const structure: string[] = []
    for (const s of shots) if (!structure.includes(s.segment)) structure.push(s.segment)
    if (structure.length < 2) structure.push(structure[0] === 'show' ? 'detail' : 'show')

    const segmentDurationSec: Template['segmentDurationSec'] = {}
    const segmentFx: Template['segmentFx'] = {}
    for (const seg of structure) {
      const group = shots.filter((s) => s.segment === seg)
      const durs = group.map((s) => s.durationSec)
      const base = durs.length ? durs : [2]
      const min = clamp(round(Math.min(...base) * 0.85, 1), 0.5, 20)
      const max = clamp(round(Math.max(...base) * 1.15, 1), min + 0.3, 30)
      segmentDurationSec[seg] = { min, max }
      segmentFx[seg] = fxOfMotion(mostCommon(group.map((s) => s.motion)))
    }

    const total = Number(blueprint.totalDurationSec || shots.reduce((sum, s) => sum + s.durationSec, 0))
    const transitions = shots.slice(1).map((s) => transitionOf(s.transitionIn))
    const pool = [...new Set(transitions)]
    const softTransitions = transitions.filter((x) => x !== 'hardcut').length
    const avgShot = total / Math.max(1, shots.length)
    const hasSpeech = shots.some((s) => s.scriptText)

    const voiceover = shots.map((s) => s.scriptText).filter(Boolean).join('\n')
    const captions = [...new Set(shots.map((s) => s.onScreenText).filter(Boolean))].slice(0, 6)
    const g = blueprint.globalScript

    const template: VideoTemplateDraft['template'] = {
      name: `AI 识别-${basename(referenceVideoName, extname(referenceVideoName)).slice(0, 24)}`,
      structure,
      segmentSyncMode: 'fixed',
      totalDurationSec: totalDurationRange(total),
      skipStartSec: 0.5,
      segmentDurationSec,
      segmentFx,
      randomizeOrder: { mode: 'partial', keepFirstCount: 1 },
      transition: {
        enabled: softTransitions > 0,
        pool: pool.length ? pool : ['hardcut'],
        durationSec: avgShot < 1.5 ? { min: 0.05, max: 0.12 } : { min: 0.1, max: 0.25 },
      },
      audio: { source: hasSpeech ? 'mute' : 'keep', ducking: { enabled: !hasSpeech, amountDb: 12 } },
      aspectUnifyMode: 'cover_crop',
      // 口播与画面字幕先带上识别结果，默认不开，用户确认后再启用
      tts: voiceover
        ? {
            enabled: false,
            textPool: [voiceover],
            voice: locale === 'vi-VN' ? 'vi-VN-HoaiMyNeural' : 'zh-CN-XiaoxiaoNeural',
            mixVolume: 0.9,
            keepOriginal: false,
          }
        : undefined,
      titleOverlay: captions.length ? { enabled: false, textPool: captions } : undefined,
      meta: {
        source: 'video_ai',
        sourceVideoName: referenceVideoName,
        sourceDurationSec: round(total),
        aspectRatio: String(blueprint.referenceAspectRatio || ''),
        hookType: blueprint.hookType,
        productCategory: blueprint.productCategory,
        rhythm: blueprint.rhythm,
        visualStyle: blueprint.visualStyle,
        summary: String(g?.summary || '').trim() || undefined,
        sellingLogic: String(g?.sellingLogic || '').trim() || undefined,
        hookLine: String(g?.hook || '').trim() || undefined,
        ctaLine: String(g?.cta || '').trim() || undefined,
        referenceShots: shots,
      },
    } as any

    return {
      sourceVideoName: referenceVideoName,
      durationSec: round(total),
      aspectRatio: String(blueprint.referenceAspectRatio || ''),
      shotCount: shots.length,
      scriptAnalysisError: blueprint.scriptAnalysisError,
      shots,
      template,
    }
  } catch (error) {
    await rm(thumbDir, { recursive: true, force: true }).catch(() => undefined)
    throw error
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined)
  }
}
