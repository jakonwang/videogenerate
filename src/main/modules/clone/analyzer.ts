import { basename, join } from 'node:path'
import { mkdir } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { probeMedia } from '../ffmpeg/probe'
import { getFfmpegExecutable } from '../../lib/binariesPath'
import type {
  CloneBlueprint,
  CloneLocale,
  CloneProductType,
  CloneScriptFramework,
  CloneShotRole,
  CloneShotType,
  CloneVisualStyleProfile,
  ModelCredentials,
  ShotCloneClass,
  ShotPurpose,
  ShotSpec,
  ViralShotRole,
} from './types'
import { buildReferenceLock } from './prompt'
import { analyzeReferenceScriptWithGrs, applyScriptAnalysisToShots } from './aiScriptAnalyzer'

function inferAspectRatio(width: number, height: number): '9:16' | '16:9' {
  if (!width || !height) return '9:16'
  return width > height ? '16:9' : '9:16'
}

function round3(n: number) {
  return Math.round(n * 1000) / 1000
}

function pickByLocale(locale: CloneLocale, vi: string, zh: string) {
  return locale === 'zh-CN' ? zh : vi
}

function mapRoleToPurpose(role: ViralShotRole): ShotPurpose {
  if (role === 'hook') return 'hook'
  if (role === 'product_closeup' || role === 'model_scene') return 'problem'
  if (role === 'detail' || role === 'price_offer') return 'solution'
  if (role === 'social_proof') return 'proof'
  return 'cta'
}

async function detectSceneCuts(filePath: string): Promise<number[]> {
  let ffmpeg = ''
  try {
    ffmpeg = getFfmpegExecutable()
  } catch {
    return []
  }
  return await new Promise<number[]>((resolve) => {
    const args = ['-hide_banner', '-loglevel', 'info', '-i', filePath, '-an', '-filter:v', "select='gt(scene,0.33)',showinfo", '-f', 'null', '-']
    const child = spawn(ffmpeg, args, { windowsHide: true })
    let stderr = ''
    child.stderr.on('data', (c: Buffer) => (stderr += c.toString('utf8')))
    child.on('error', () => resolve([]))
    child.on('close', () => {
      const out: number[] = []
      const reg = /pts_time:([0-9.]+)/g
      let m: RegExpExecArray | null
      while ((m = reg.exec(stderr))) {
        const t = Number(m[1])
        if (Number.isFinite(t)) out.push(round3(t))
      }
      resolve(out)
    })
  })
}

function fallbackCuts(duration: number): number[] {
  if (duration <= 6) return [0, duration]
  if (duration <= 12) return [0, duration * 0.35, duration * 0.72, duration]
  if (duration <= 20) return [0, duration * 0.2, duration * 0.42, duration * 0.62, duration * 0.82, duration]
  return [0, duration * 0.14, duration * 0.29, duration * 0.43, duration * 0.58, duration * 0.72, duration * 0.86, duration]
}

function toSegments(duration: number, cuts: number[]) {
  const points = [...cuts].filter((x) => x >= 0 && x <= duration).sort((a, b) => a - b)
  if (!points.length || points[0] > 0.02) points.unshift(0)
  if (points[points.length - 1] < duration) points.push(duration)
  const merged: number[] = []
  for (const p of points) {
    const prev = merged[merged.length - 1]
    if (prev == null || Math.abs(prev - p) > 0.12) merged.push(p)
  }
  const segs: Array<{ startSec: number; endSec: number; durationSec: number }> = []
  for (let i = 0; i < merged.length - 1; i++) {
    const startSec = round3(merged[i]!)
    const endSec = round3(merged[i + 1]!)
    const durationSec = Math.max(0.5, round3(endSec - startSec))
    segs.push({ startSec, endSec, durationSec })
  }
  return segs.slice(0, 16)
}

function inferRole(i: number, total: number): ViralShotRole {
  if (i === 0) return 'hook'
  if (i === total - 1) return 'cta'
  if (i === total - 2) return 'social_proof'
  if (i === 1) return 'product_closeup'
  if (i === 2) return 'model_scene'
  if (i === 3) return 'detail'
  return i % 2 === 0 ? 'detail' : 'price_offer'
}

function inferBlueprintShotRole(role: ViralShotRole, idx: number, total: number): CloneShotRole {
  if (idx === 0 || role === 'hook') return 'hook'
  if (idx === total - 1 || role === 'cta') return 'cta'
  if (role === 'social_proof') return 'proof'
  if (role === 'price_offer') return 'price'
  if (role === 'model_scene') return 'try_on'
  if (role === 'product_closeup') return 'product_show'
  return 'detail'
}

function inferBlueprintShotType(cloneClass: ShotCloneClass, role: ViralShotRole): CloneShotType {
  if (cloneClass === 'screen_recording') return 'screen_recording'
  if (cloneClass === 'result_showcase') return 'result_showcase'
  if (role === 'product_closeup') return 'closeup'
  if (cloneClass === 'real_product') return 'real_product'
  if (cloneClass === 'model_demo') return 'model_demo'
  return 'handheld'
}

function inferProductCategory(shots: ShotSpec[]): CloneProductType {
  const first = shots.find((shot) => shot.productType && shot.productType !== 'general')?.productType
  return (first as CloneProductType | undefined) ?? 'general'
}

function inferHookType(shots: ShotSpec[]): CloneBlueprint['hookType'] {
  const first = shots[0]
  if (!first) return 'unknown'
  if (first.role === 'price_offer') return 'price'
  if (first.cloneClass === 'model_demo') return 'style_showcase'
  if (first.motion === 'fast_cut') return 'visual_impact'
  return 'curiosity'
}

function buildScriptFramework(locale: CloneLocale): CloneScriptFramework {
  return {
    hook: pickByLocale(locale, 'Mo dau 1-2s tao hook ro rang.', '开头 1-2 秒快速建立钩子。'),
    painPoint: pickByLocale(locale, 'Neu tinh huong hoac pain point gan nhu cau mua hang.', '提出与购买相关的痛点或场景。'),
    solution: pickByLocale(locale, 'Cho thay san pham giai quyet van de nhu the nao.', '展示产品如何解决问题。'),
    proof: pickByLocale(locale, 'Bo sung chi tiet, bang chung, feedback hoac ket qua.', '补充细节、证明、反馈或结果。'),
    offer: pickByLocale(locale, 'Neu gia tri, uu dai hoac ly do nen mua ngay.', '交代价值、优惠或购买理由。'),
    cta: pickByLocale(locale, 'Ket thuc bang CTA ngan gon, ro rang.', '结尾给出明确 CTA。'),
  }
}

function buildVisualStyle(referenceAspectRatio: '9:16' | '16:9'): CloneVisualStyleProfile {
  return {
    scene: referenceAspectRatio === '9:16' ? 'social commerce vertical product scene' : 'commercial demonstration scene',
    lighting: 'soft natural daylight with realistic contrast',
    cameraStyle: 'smartphone-first framing',
    movementStyle: 'short-form handheld micro movement',
    realismStyle: referenceAspectRatio === '9:16' ? 'ugc' : 'studio',
  }
}

function summarizeVideoStructure(locale: CloneLocale, shots: ShotSpec[], eligibleCount: number, filteredCount: number) {
  return pickByLocale(
    locale,
    `Video duoc tach thanh ${shots.length} canh, co ${eligibleCount} canh co the tai tao va ${filteredCount} canh bi loc bo.`,
    `视频已拆成 ${shots.length} 个分镜，其中 ${eligibleCount} 个可复刻，${filteredCount} 个已过滤。`,
  )
}

function inferMotion(durationSec: number, idx: number): ShotSpec['motion'] {
  if (durationSec < 0.9) return 'fast_cut'
  const arr: Array<NonNullable<ShotSpec['motion']>> = ['static', 'zoom_in', 'zoom_out', 'pan_left', 'pan_right', 'shake']
  return arr[idx % arr.length]
}

function inferTransition(idx: number, total: number): ShotSpec['transitionOut'] {
  if (idx === total - 1) return 'hardcut'
  const arr: Array<NonNullable<ShotSpec['transitionOut']>> = ['hardcut', 'fade', 'flash', 'slide', 'zoom']
  return arr[idx % arr.length]
}

function classifyShot(input: {
  idx: number
  total: number
  durationSec: number
  videoDuration: number
  sceneCuts: number
  startSec: number
}): { cloneClass: ShotCloneClass; cloneEligible: boolean; filterReason?: string; visualPrompt: string } {
  const progress = input.videoDuration > 0 ? input.startSec / input.videoDuration : 0
  const longVideo = input.videoDuration >= 60
  const veryLongShot = input.durationSec >= 12
  const firstPart = progress < 0.22
  const middlePart = progress >= 0.22 && progress < 0.78
  const lastPart = progress >= 0.78

  if (longVideo && veryLongShot && middlePart) {
    return {
      cloneClass: 'screen_recording',
      cloneEligible: false,
      filterReason: '录屏/教学操作画面，默认不参与真实商品复刻',
      visualPrompt: 'Screen recording or software operation segment. Use only as workflow reference, do not generate it as product video.',
    }
  }
  if (longVideo && firstPart && input.idx <= 1) {
    return {
      cloneClass: 'tutorial_talking',
      cloneEligible: false,
      filterReason: '真人教学口播段，避免复制原人物身份',
      visualPrompt: 'Talking-head tutorial introduction. Keep only the pacing idea; do not clone the original person identity.',
    }
  }
  if (longVideo && lastPart) {
    return {
      cloneClass: 'result_showcase',
      cloneEligible: true,
      visualPrompt: 'Result showcase shot with realistic model/product demo. Recreate as a real product social commerce scene.',
    }
  }
  if (veryLongShot && input.sceneCuts < 6) {
    return {
      cloneClass: 'ui_demo',
      cloneEligible: false,
      filterReason: '疑似界面演示长镜头，默认过滤',
      visualPrompt: 'Long UI demonstration segment. Do not generate browser, app UI or tutorial subtitles.',
    }
  }
  if (input.idx === 0) {
    return {
      cloneClass: 'model_demo',
      cloneEligible: true,
      visualPrompt: 'Opening model demonstration shot. Replace the person with a target-market model while keeping gesture rhythm.',
    }
  }
  return {
    cloneClass: input.idx % 3 === 0 ? 'real_product' : 'model_demo',
    cloneEligible: true,
    visualPrompt:
      input.idx % 3 === 0
        ? 'Real product close-up or hand-held product shot. Preserve action timing and replace only the product.'
        : 'Model usage demonstration shot. Preserve body/hand action rhythm and replace product/model identity.',
  }
}

async function makeShotThumbnail(input: {
  videoPath: string
  outPath: string
  atSec: number
}): Promise<string> {
  const ffmpeg = getFfmpegExecutable()
  await new Promise<void>((resolve, reject) => {
    const args = [
      '-y',
      '-ss',
      `${Math.max(0, input.atSec)}`,
      '-i',
      input.videoPath,
      '-frames:v',
      '1',
      '-vf',
      'scale=320:-1',
      input.outPath,
    ]
    const child = spawn(ffmpeg, args, { windowsHide: true })
    child.on('error', reject)
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg thumb failed: ${code}`))))
  })
  return input.outPath
}

async function extractShotFrames(input: {
  videoPath: string
  outPrefix: string
  seg: { startSec: number; endSec: number; durationSec: number }
}) {
  const startAt = input.seg.startSec + Math.min(0.08, input.seg.durationSec * 0.08)
  const midAt = input.seg.startSec + input.seg.durationSec * 0.5
  const endAt = Math.max(input.seg.startSec, input.seg.endSec - Math.min(0.08, input.seg.durationSec * 0.08))
  const start = `${input.outPrefix}_start.jpg`
  const mid = `${input.outPrefix}_mid.jpg`
  const end = `${input.outPrefix}_end.jpg`
  await makeShotThumbnail({ videoPath: input.videoPath, outPath: start, atSec: startAt })
  await makeShotThumbnail({ videoPath: input.videoPath, outPath: mid, atSec: midAt })
  await makeShotThumbnail({ videoPath: input.videoPath, outPath: end, atSec: endAt })
  return { start, mid, end }
}

function defaultScriptRole(index: number, total: number): ShotSpec['scriptRole'] {
  if (index === 0) return 'hook'
  if (index === total - 1) return 'cta'
  if (index === 1) return 'pain_point'
  if (index === 2) return 'solution'
  if (index === total - 2) return 'proof'
  return 'transition'
}

function withDefaultScriptFields(shot: ShotSpec, total: number): ShotSpec {
  const visualDescription = shot.visualPrompt || shot.visual || 'reference product demonstration shot'
  const actionDescription = shot.action || shot.visualPrompt || 'reference shot action'
  const cameraDescription = `${shot.framing || 'closeup'} framing, ${shot.cameraMovement || shot.motion || 'static'} movement`
  const productFocus = 'preserve the reference product-display purpose while replacing the product with the uploaded item'
  return {
    ...shot,
    scriptText: shot.scriptText || '',
    scriptRole: shot.scriptRole || defaultScriptRole(shot.index, total),
    narrationText: shot.narrationText || '',
    onScreenText: shot.onScreenText || '',
    visualDescription: shot.visualDescription || visualDescription,
    actionDescription: shot.actionDescription || actionDescription,
    cameraDescription: shot.cameraDescription || cameraDescription,
    productFocus: shot.productFocus || productFocus,
    generationPrompt:
      shot.generationPrompt ||
      [visualDescription, actionDescription, cameraDescription, productFocus].filter(Boolean).join('\n'),
    negativePrompt: shot.negativePrompt || shot.negativePromptHint,
    scriptConfidence: typeof shot.scriptConfidence === 'number' ? shot.scriptConfidence : 0,
    analysisNotes: Array.isArray(shot.analysisNotes) ? shot.analysisNotes : [],
  }
}

function buildShot(input: {
  locale: CloneLocale
  aspectRatio: '9:16' | '16:9'
  idx: number
  total: number
  seg: { startSec: number; endSec: number; durationSec: number }
  thumbnailPath: string
  videoDuration: number
  sceneCuts: number
}): ShotSpec {
  const role = inferRole(input.idx, input.total)
  const purpose = mapRoleToPurpose(role)
  const cls = classifyShot({
    idx: input.idx,
    total: input.total,
    durationSec: input.seg.durationSec,
    videoDuration: input.videoDuration,
    sceneCuts: input.sceneCuts,
    startSec: input.seg.startSec,
  })
  const shot: ShotSpec = {
    id: `shot_${input.idx + 1}`,
    index: input.idx,
    purpose,
    startSec: input.seg.startSec,
    endSec: input.seg.endSec,
    durationSec: input.seg.durationSec,
    role,
    visualType: role,
    cloneClass: cls.cloneClass,
    cloneEligible: cls.cloneEligible,
    filterReason: cls.filterReason,
    visualPrompt: cls.visualPrompt,
    thumbnailPath: input.thumbnailPath,
    originalCaption: '',
    captionPosition: 'bottom',
    motion: inferMotion(input.seg.durationSec, input.idx),
    transitionIn: input.idx === 0 ? 'hardcut' : inferTransition(input.idx - 1, input.total),
    transitionOut: inferTransition(input.idx, input.total),
    replaceMode: cls.cloneEligible ? 'upload_video' : 'locked',
    shotRole: inferBlueprintShotRole(role, input.idx, input.total),
    shotType: inferBlueprintShotType(cls.cloneClass, role),
    framing: role === 'product_closeup' ? 'extreme_closeup' : role === 'model_scene' ? 'medium' : 'closeup',
    cameraMovement: String(inferMotion(input.seg.durationSec, input.idx) ?? 'static'),
    action:
      role === 'model_scene'
        ? 'model or hand demonstrates product usage naturally'
        : role === 'product_closeup'
          ? 'tight detail reveal with subtle hand interaction'
          : 'short practical product reveal action',
    productVisibility: role === 'cta' ? 'medium' : 'high',
    replacementMode: cls.cloneEligible ? 'local_video' : 'skip',
    aiDifficulty: cls.cloneClass === 'model_demo' ? 'medium' : 'low',
    realismRisk: cls.cloneClass === 'model_demo' ? 'medium' : cls.cloneClass === 'screen_recording' ? 'high' : 'low',
    requiredAssets: [role === 'model_scene' ? 'model_video' : role === 'product_closeup' ? 'product_video' : 'product_image'],
    promptHint: cls.visualPrompt,
    negativePromptHint: pickByLocale(
      input.locale,
      'Khong logo, watermark, giao dien app, chu ngau nhien, khuon mat gia, tay loi.',
      '不要 logo、水印、平台 UI、乱码字幕、AI 假脸、异常手部。',
    ),
    realismStyle: input.aspectRatio === '9:16' ? 'ugc' : 'studio',
    assetMatchReasons: [],
    qualityStatusDetail: 'pending',
    canEnterRender: false,
    requiredAssetType: role === 'model_scene' ? 'model_video' : role === 'product_closeup' ? 'product_video' : 'any',
    productReferenceImagePaths: [],
    scriptText: '',
    scriptRole: defaultScriptRole(input.idx, input.total),
    narrationText: '',
    onScreenText: '',
    visualDescription: cls.visualPrompt,
    actionDescription:
      role === 'model_scene'
        ? 'model or hand demonstrates product usage naturally'
        : role === 'product_closeup'
          ? 'tight detail reveal with subtle hand interaction'
          : 'short practical product reveal action',
    cameraDescription: `${role === 'product_closeup' ? 'extreme_closeup' : role === 'model_scene' ? 'medium' : 'closeup'} framing, ${String(inferMotion(input.seg.durationSec, input.idx) ?? 'static')} movement`,
    productFocus: 'preserve the reference product-display purpose while replacing the product with the uploaded item',
    generationPrompt: [cls.visualPrompt, String(inferMotion(input.seg.durationSec, input.idx) ?? 'static')].filter(Boolean).join('\n'),
    scriptConfidence: 0,
    analysisNotes: [],
    aiPrompt: '',
    negativePrompt: '',
    locked: !cls.cloneEligible,
    status: cls.cloneEligible ? 'empty' : 'ready',
    visual: pickByLocale(input.locale, cls.visualPrompt, cls.visualPrompt),
    subtitleSuggestion: pickByLocale(input.locale, `Shot ${input.idx + 1} subtitle`, `分镜${input.idx + 1}字幕建议`),
    materialNeed: pickByLocale(input.locale, 'Bo sung media theo vai tro canh.', '按分镜作用补充素材。'),
    sourceMode: cls.cloneEligible ? 'pending' : 'pending',
    uploadedAssetIds: [],
    aiEnabled: false,
    prompt: {
      positive: pickByLocale(input.locale, cls.visualPrompt, cls.visualPrompt),
      negative: pickByLocale(input.locale, 'browser UI, chat interface, screen recording, tutorial subtitles, original person identity, watermark, account name, logo mismatch, shape mismatch, color mismatch, low quality', '浏览器界面、聊天界面、录屏、教学字幕、原人物身份、水印、账号、logo错误、形状偏差、颜色偏差、低质量'),
      cameraMotion: String(inferMotion(input.seg.durationSec, input.idx) ?? 'static'),
      aspectRatio: input.aspectRatio,
    },
    reviewStatus: 'pending',
  }
  return {
    ...shot,
    referenceLock: buildReferenceLock(shot, 'reference video scene atmosphere'),
  }
}

export async function analyzeReferenceVideo(input: {
  videoPath: string
  locale: CloneLocale
  outputDir: string
  credentials?: ModelCredentials
}): Promise<{
  referenceVideoName: string
  blueprint: CloneBlueprint
}> {
  const videoPath = String(input.videoPath ?? '').trim()
  const locale: CloneLocale = input.locale === 'zh-CN' ? 'zh-CN' : 'vi-VN'
  const meta = await probeMedia(videoPath)
  const duration = Math.max(3, Number(meta.durationSec ?? 0))
  const referenceWidth = Number(meta.width ?? 0)
  const referenceHeight = Number(meta.height ?? 0)
  const referenceAspectRatio = inferAspectRatio(referenceWidth, referenceHeight)
  const sceneCuts = await detectSceneCuts(videoPath)
  const points = sceneCuts.length ? [0, ...sceneCuts, duration] : fallbackCuts(duration)
  const segments = toSegments(duration, points)

  const shotDir = join(input.outputDir, 'shots')
  await mkdir(shotDir, { recursive: true })
  const shots: ShotSpec[] = []
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!
    const frames = await extractShotFrames({ videoPath, outPrefix: join(shotDir, `shot_${i + 1}`), seg })
    const shot = buildShot({
      locale,
      aspectRatio: referenceAspectRatio,
      idx: i,
      total: segments.length,
      seg,
      thumbnailPath: frames.mid || frames.start,
      videoDuration: duration,
      sceneCuts: sceneCuts.length,
    })
    shots.push(withDefaultScriptFields({ ...shot, referenceFramePaths: frames }, segments.length))
  }
  const eligibleCount = shots.filter((x) => x.cloneEligible !== false).length
  const filteredCount = shots.length - eligibleCount

  let scriptAnalysisError = ''
  let analyzedShots = shots
  let globalScript: CloneBlueprint['globalScript'] | undefined
  try {
    const scriptAnalysis = await analyzeReferenceScriptWithGrs({
      videoPath,
      locale,
      credentials: input.credentials ?? ({ allowMockWhenNoKey: false } as ModelCredentials),
      shots,
      targetMarket: locale,
      productCategory: inferProductCategory(shots),
    })
    analyzedShots = applyScriptAnalysisToShots(shots, scriptAnalysis)
    globalScript = scriptAnalysis.globalScript
  } catch (e: any) {
    scriptAnalysisError = String(e?.message ?? e)
    analyzedShots = applyScriptAnalysisToShots(shots, null, `脚本分析失败：${scriptAnalysisError}`)
  }

  const blueprint: CloneBlueprint = {
    videoSummary: summarizeVideoStructure(locale, shots, eligibleCount, filteredCount),
    productCategory: inferProductCategory(shots),
    totalDurationSec: round3(duration),
    referenceAspectRatio,
    referenceWidth: referenceWidth || undefined,
    referenceHeight: referenceHeight || undefined,
    hookType: inferHookType(shots),
    scriptFramework: buildScriptFramework(locale),
    rhythm: {
      avgShotDurationSec: round3(shots.reduce((sum, shot) => sum + Number(shot.durationSec || 0), 0) / Math.max(1, shots.length)),
      cutDensity: shots.length >= 10 ? 'high' : shots.length >= 6 ? 'medium' : 'low',
      first3SecShotCount: shots.filter((shot) => Number(shot.startSec || 0) < 3).length,
      hasFastCut: shots.some((shot) => shot.motion === 'fast_cut' || Number(shot.durationSec || 0) <= 0.9),
    },
    visualStyle: buildVisualStyle(referenceAspectRatio),
    globalScript,
    scriptAnalysisError: scriptAnalysisError || undefined,
    scriptFrame: {
      hook: globalScript?.hook || analyzedShots.find((shot) => shot.scriptRole === 'hook')?.scriptText || pickByLocale(locale, 'Opening hook.', '开头钩子'),
      problem: analyzedShots.find((shot) => shot.scriptRole === 'pain_point')?.scriptText || pickByLocale(locale, 'Pain point.', '痛点场景'),
      solution: analyzedShots.find((shot) => shot.scriptRole === 'solution')?.scriptText || pickByLocale(locale, 'Product solution.', '产品方案'),
      proof: analyzedShots.find((shot) => shot.scriptRole === 'proof')?.scriptText || pickByLocale(locale, 'Proof or comparison.', '证明对比'),
      cta: globalScript?.cta || analyzedShots.find((shot) => shot.scriptRole === 'cta')?.scriptText || pickByLocale(locale, 'Short CTA.', '行动号召'),
    },
    shots: analyzedShots,
    analysisNotes: [
      pickByLocale(locale, 'Da phan tich theo kieu structure clone.', '已按结构复刻方式分析'),
      `duration=${round3(duration)}s fps=${meta.fps ?? 0} resolution=${meta.width ?? 0}x${meta.height ?? 0}`,
      `cuts=${Math.max(0, segments.length - 1)}`,
      `clone_eligible=${eligibleCount} filtered=${filteredCount}`,
      filteredCount > 0
        ? '已自动过滤录屏/教学/UI 操作类分镜，仅保留真实商品或人物展示片段进入生成。'
        : '未检测到明显教学/录屏片段。',
      scriptAnalysisError ? `script_analysis_failed=${scriptAnalysisError}` : `script_analysis=grsai:${input.credentials?.grsaiAnalysisModel || 'gemini-3.1-pro'}`,
    ],
    transcript: '',
  }

  return {
    referenceVideoName: basename(videoPath),
    blueprint,
  }
}
