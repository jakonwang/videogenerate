/**
 * 手机端「复刻」：对标视频拆解结果、分镜图 / 分镜视频的提示词（云端与手机 App 共用）。
 *
 * 流程：上传对标视频 → 云端拆解成分镜（每个分镜一张参考帧 + 脚本）→ 用参考帧 + 自己的商品图生成分镜图
 * → 分镜图生成分镜视频 → 云端按原片节奏合成成片。
 */

export type CloneShotRole = 'hook' | 'pain_point' | 'solution' | 'show' | 'detail' | 'proof' | 'offer' | 'cta' | 'transition' | string

export type CloneAnalysisShot = {
  id: string
  index: number
  startSec: number
  durationSec: number
  role: CloneShotRole
  /** 这一镜在讲什么（口播 / 字幕的意思） */
  scriptText: string
  onScreenText?: string
  visual: string
  action: string
  camera: string
  /** 原片的参考帧（已存进云端文件） */
  frameFileId?: string
  /** 录屏、教学等不适合复刻的镜头 */
  eligible: boolean
}

export type CloneAnalysis = {
  totalDurationSec: number
  aspectRatio: '9:16' | '16:9'
  language: string
  summary: string
  hook: string
  cta: string
  shots: CloneAnalysisShot[]
  /** 脚本分析失败时的原因（分镜仍可用，只是没有 AI 脚本） */
  scriptError?: string
}

export const CLONE_SHOT_ROLE_LABELS: Record<string, string> = {
  hook: '开头钩子',
  pain_point: '痛点',
  solution: '解决方案',
  show: '商品展示',
  detail: '细节',
  proof: '效果证明',
  offer: '优惠',
  cta: '引导下单',
  transition: '转场',
}

/** 合成成片时的一段素材 */
export type CloneComposeClip = { fileId: string; durationSec: number }

/**
 * 分镜图：图 1 是原片这一镜的参考帧，图 2 是自己的商品（可选图 3 是模特）。
 * 保留原片构图、场景和光线，把商品换成自己的。
 */
export function buildCloneFramePrompt(shot: Pick<CloneAnalysisShot, 'visual' | 'action' | 'camera'>, options: { hasModel: boolean }) {
  return [
    'Image 1 is a frame from a viral reference video. Image 2 is our product.' + (options.hasModel ? ' Image 3 is our model.' : ''),
    'Recreate Image 1: keep its composition, camera angle, framing, scene, lighting and atmosphere.',
    'Replace the product in Image 1 with the exact physical product from Image 2. Treat Image 2 as the only source of truth for the product: preserve its colors, materials, textures, proportions, structure and every visible detail. Do not redesign, recolor, reshape or simplify it.',
    options.hasModel
      ? 'Replace the person in Image 1 with the model from Image 3, keeping the same pose, position and expression direction as Image 1.'
      : 'If a person appears in Image 1, keep a similar person in the same pose and position.',
    'Keep the product at a believable real-world size. Natural lighting adaptation only; no cut-and-paste look.',
    'Do not add any text, subtitles, logos or watermarks.',
    shot.visual ? `Shot content: ${shot.visual}` : '',
    shot.action ? `Action: ${shot.action}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

/** 分镜视频：以分镜图为首帧，按原片这一镜的动作和运镜动起来 */
export function buildCloneShotVideoPrompt(shot: Pick<CloneAnalysisShot, 'action' | 'camera' | 'durationSec'>) {
  return [
    `Create a realistic ${Math.max(2, Math.round(shot.durationSec))}-second vertical social-commerce video shot starting exactly from the given first frame.`,
    'Preserve the exact product identity, shape, color and details from the first frame throughout the shot.',
    shot.action ? `Action: ${shot.action}` : 'Action: subtle natural motion.',
    shot.camera ? `Camera: ${shot.camera}` : 'Camera: steady, slight handheld feel.',
    'No text, subtitles, logos or watermarks. No sudden scene changes.',
  ].join(' ')
}
