import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { getAppPaths } from '../../lib/paths'
import { readJsonFile, writeJsonFile } from '../../lib/storeJson'
import { runFfmpeg } from '../ffmpeg/runner'
import { analyzeReferenceVideo } from '../clone/analyzer'
import { cloneRepo } from '../clone/repo'
import type { CloneBlueprint, ShotSpec } from '../clone/types'

/**
 * 同款模板：one good reference clip, analysed once, reused for many products.
 *
 * The cheap video models (Veo in tk创意室, Seedance 1.5 in 图生视频) do badly when they
 * have to invent the camera work. A template hands them the reference's own start/end
 * frames (product swapped in later) and a motion prompt read off the reference, so they
 * only have to fill in the motion between two fixed frames.
 */
export type StyleReference = {
  id: string
  videoPath: string
  videoName: string
  /** Length of the shot that is copied (phase 1: one shot). */
  durationSec: number
  aspectRatio: '9:16' | '16:9'
  /** Cuts found in the whole reference; only one shot is copied in phase 1. */
  shotCount: number
  shotStartSec: number
  shotEndSec: number
  firstFramePath: string
  lastFramePath: string
  camera: string
  action: string
  lighting: string
  background: string
  style: string
  /** English motion prompt sent to the video model. */
  motionPrompt: string
  /** False when the AI look-analysis failed and generic wording was used. */
  analysisOk: boolean
  warning?: string
  createdAt: number
}

type StyleReferenceDb = { items: StyleReference[] }

const MAX_KEPT = 30

function dbPath() {
  return join(getAppPaths().dbDir, 'style-references.json')
}

function rootDir(id: string) {
  return join(getAppPaths().dataDir, 'style-references', id)
}

async function readDb(): Promise<StyleReferenceDb> {
  const db = await readJsonFile<StyleReferenceDb>(dbPath(), { items: [] })
  return { items: Array.isArray(db?.items) ? db.items : [] }
}

function text(value: unknown) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    const next = text(value)
    if (next) return next
  }
  return ''
}

/** Same file (path + size + mtime) → same template, so re-picking a clip never pays for analysis twice. */
async function fingerprint(videoPath: string) {
  const info = await stat(videoPath)
  return createHash('sha1').update(`${videoPath}|${info.size}|${Math.floor(info.mtimeMs)}`).digest('hex').slice(0, 20)
}

/** The shot to copy: the longest usable one. Short-form product clips are usually one long shot anyway. */
function pickShot(shots: ShotSpec[]) {
  const usable = shots.filter((shot) => shot.cloneEligible !== false)
  const pool = usable.length ? usable : shots
  return [...pool].sort((a, b) => Number(b.durationSec || 0) - Number(a.durationSec || 0))[0]
}

async function extractFrame(videoPath: string, atSec: number, outPath: string) {
  await runFfmpeg({
    args: ['-y', '-ss', Math.max(0, atSec).toFixed(3), '-i', videoPath, '-frames:v', '1', '-q:v', '2', outPath],
  })
  if (!existsSync(outPath)) throw new Error('无法从参考视频截取画面')
}

export function buildStyleReferenceMotionPrompt(input: {
  camera: string
  action: string
  lighting: string
  background: string
  style: string
  durationSec: number
  hasLastFrame: boolean
}) {
  const lines = [
    `Recreate the camera work and look of the reference clip with the product shown in the first frame, as one continuous ${Math.round(input.durationSec)}-second shot.`,
    input.camera ? `Camera: ${input.camera}.` : 'Camera: follow the framing of the first frame with slow, steady movement.',
    input.action ? `Action: ${input.action}.` : '',
    input.lighting ? `Lighting: ${input.lighting}.` : '',
    input.background ? `Background: ${input.background}.` : '',
    input.style ? `Look: ${input.style}.` : '',
    input.hasLastFrame
      ? 'The first image is the exact opening frame and the second image is the exact closing frame. Move smoothly from the first to the second following the camera movement above; do not cut.'
      : 'Start exactly on the given image and keep its composition as the anchor of the shot; do not cut.',
    'Keep the product identical in every frame: same shape, proportions, color, material, stone count and details. Do not redesign, add or remove product parts.',
    'Do not add text, logos, watermarks, extra people or extra hands that are not already in the frame.',
  ]
  return lines.filter(Boolean).join('\n')
}

function describeFromBlueprint(blueprint: CloneBlueprint, shot: ShotSpec | undefined) {
  const global = blueprint.globalScript
  const scene = shot?.sceneDescription
  return {
    camera: firstText(shot?.cameraDescription, global?.cameraMotion),
    action: firstText(shot?.actionDescription, global?.subjectAction),
    lighting: firstText(scene?.lighting, [global?.lighting, global?.colorTone].filter(Boolean).join('; ')),
    background: firstText(scene?.background, scene?.location, global?.environment),
    style: firstText(scene?.style, global?.shotScale),
  }
}

export const styleReferenceService = {
  async get(id: string) {
    const db = await readDb()
    return db.items.find((item) => item.id === String(id || '').trim())
  },

  async list() {
    const db = await readDb()
    return db.items.filter((item) => existsSync(item.firstFramePath)).sort((a, b) => b.createdAt - a.createdAt)
  },

  /** Analyse a reference clip into a reusable template. Cached per file. */
  async analyze(input: { videoPath: string }): Promise<StyleReference> {
    const videoPath = text(input?.videoPath)
    if (!videoPath || !existsSync(videoPath)) throw new Error('参考视频不存在')
    const id = await fingerprint(videoPath)
    const cached = await this.get(id)
    if (cached && cached.analysisOk && existsSync(cached.firstFramePath) && existsSync(cached.lastFramePath)) return cached

    const dir = rootDir(id)
    await mkdir(dir, { recursive: true })
    const credentials = await cloneRepo.getCredentials()
    const { blueprint } = await analyzeReferenceVideo({ videoPath, outputDir: join(dir, 'analysis'), credentials })
    const shot = pickShot(blueprint.shots || [])
    const shotStartSec = Number(shot?.startSec || 0)
    const shotEndSec = Number(shot?.endSec ?? blueprint.totalDurationSec ?? 0) || Number(blueprint.totalDurationSec || 0)
    const durationSec = Math.max(1, shotEndSec - shotStartSec)
    const edge = Math.min(0.08, durationSec * 0.05)
    const firstFramePath = join(dir, 'first.jpg')
    const lastFramePath = join(dir, 'last.jpg')
    await extractFrame(videoPath, shotStartSec + edge, firstFramePath)
    await extractFrame(videoPath, shotEndSec - edge, lastFramePath)

    const look = describeFromBlueprint(blueprint, shot)
    const analysisOk = !blueprint.scriptAnalysisError
    const shotCount = (blueprint.shots || []).length
    const warnings: string[] = []
    if (!analysisOk) warnings.push('画面风格分析失败，已用通用描述；首尾帧仍然有效')
    if (shotCount > 1) warnings.push(`参考视频有 ${shotCount} 个镜头，本次只照着最长的一个（${shotStartSec.toFixed(1)}–${shotEndSec.toFixed(1)} 秒）生成`)
    const record: StyleReference = {
      id,
      videoPath,
      videoName: basename(videoPath),
      durationSec: Number(durationSec.toFixed(2)),
      aspectRatio: blueprint.referenceAspectRatio === '16:9' ? '16:9' : '9:16',
      shotCount,
      shotStartSec,
      shotEndSec,
      firstFramePath,
      lastFramePath,
      ...look,
      motionPrompt: buildStyleReferenceMotionPrompt({ ...look, durationSec, hasLastFrame: true }),
      analysisOk,
      warning: warnings.join('；') || undefined,
      createdAt: Date.now(),
    }
    const db = await readDb()
    const items = [record, ...db.items.filter((item) => item.id !== id)].slice(0, MAX_KEPT)
    await writeJsonFile(dbPath(), { items })
    return record
  },
}
