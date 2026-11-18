/**
 * Mix formulas (爆款公式) and mix-studio job/draft shapes.
 * A formula is a beat sheet: an ordered list of shot roles with target durations,
 * taken from a proven content angle or extracted from a reference video.
 */
import type { ClipRole } from './mixPool'

export type MixAngle = 'problem_solution' | 'result_first' | 'unboxing' | 'comparison' | 'gift' | 'three_reasons' | 'custom'

export type FormulaBeat = {
  role: ClipRole
  /** Also acceptable when no shot with `role` is left. */
  altRoles?: ClipRole[]
  durationSec: { min: number; max: number }
  /** Beat may be dropped when the pool has no fitting shot. */
  optional?: boolean
  /** What the voiceover should say over this beat (guidance for the script writer). */
  scriptHint?: string
}

export type MixFormula = {
  id: string
  name: string
  angle: MixAngle
  description: string
  beats: FormulaBeat[]
  source: 'builtin' | 'reference' | 'custom'
  referenceVideoPath?: string
  /** Lines lifted from the reference video, used as style examples for the script writer. */
  referenceScript?: { hook?: string; voiceover?: string; cta?: string; sellingLogic?: string }
  createdAt: number
  updatedAt: number
}

export type MixLanguage = 'vi-VN' | 'zh-CN' | 'en-US' | 'th-TH' | 'id-ID'

export const MIX_VOICES: Record<MixLanguage, Array<{ id: string; label: string }>> = {
  'vi-VN': [
    { id: 'vi-VN-HoaiMyNeural', label: 'HoaiMy ♀' },
    { id: 'vi-VN-NamMinhNeural', label: 'NamMinh ♂' },
  ],
  'zh-CN': [
    { id: 'zh-CN-XiaoxiaoNeural', label: '晓晓 ♀' },
    { id: 'zh-CN-YunxiNeural', label: '云希 ♂' },
  ],
  'en-US': [
    { id: 'en-US-JennyNeural', label: 'Jenny ♀' },
    { id: 'en-US-GuyNeural', label: 'Guy ♂' },
  ],
  'th-TH': [
    { id: 'th-TH-PremwadeeNeural', label: 'Premwadee ♀' },
    { id: 'th-TH-NiwatNeural', label: 'Niwat ♂' },
  ],
  'id-ID': [
    { id: 'id-ID-GadisNeural', label: 'Gadis ♀' },
    { id: 'id-ID-ArdiNeural', label: 'Ardi ♂' },
  ],
}

/** Rough speaking speed used to size the edit to its voiceover before TTS runs. */
export const SPEECH_UNITS_PER_SEC: Record<MixLanguage, number> = {
  'vi-VN': 3.6, // words
  'zh-CN': 4.6, // characters
  'en-US': 2.7, // words
  'th-TH': 9, // characters (no spaces)
  'id-ID': 2.5, // words
}

export function estimateSpeechSec(text: string, lang: MixLanguage) {
  const t = String(text || '').trim()
  if (!t) return 0
  const units =
    lang === 'zh-CN' || lang === 'th-TH'
      ? t.replace(/[\s\p{P}]/gu, '').length
      : t.split(/\s+/).filter(Boolean).length
  // + small pause per sentence
  const pauses = (t.match(/[.!?。！？,，]/g) ?? []).length * 0.15
  return units / SPEECH_UNITS_PER_SEC[lang] + pauses
}

export type MixMode = 'auto' | 'ai'

export type MixJobInput = {
  productId: string
  mode: MixMode
  formulaIds: string[]
  count: number
  language: MixLanguage
  voice: string
  /** Optional template: only its finishing (BGM, transitions, subtitle style, color, LUT, sticker) is used. */
  templateId?: string
  outDir: string
  /** Keep the shots' own audio under the voiceover. */
  keepOriginalAudio: boolean
  /** Use AI-generated shots when no real one fits (real shots are always preferred). */
  allowAiClips: boolean
  /** Free text from the seller: selling points, price, offer, target buyer. */
  sellingPoints?: string
  /** auto mode: one per line. `{product}` is replaced by the product name. */
  hookLines?: string[]
  bodyLines?: string[]
  ctaLines?: string[]
  /** Use past GMV Max results to weight formulas, hook styles and hook shots (default on). */
  useInsights?: boolean
  /** Ledger id of a winning video: make variations that keep its formula, hook shot and hook idea. */
  winnerOf?: string
}

export type MixDraftShot = {
  clipId: string
  role: ClipRole
  filePath: string
  thumbnailPath: string
  /** Start inside the source file. */
  startSec: number
  durationSec: number
  /** The pool clip's range inside the source; the shot may move/grow within it. */
  clipStartSec: number
  clipEndSec: number
  /** Length of the source file (lets the renderer stretch a shot to fit a longer voiceover). */
  sourceDurationSec: number
  origin: 'real' | 'ai' | 'unknown'
  description?: string
}

export type MixDraft = {
  id: string
  formulaId: string
  formulaName: string
  shots: MixDraftShot[]
  /** Big on-screen hook title (top of frame, whole video). */
  title: string
  /** Full voiceover text read by TTS; subtitles follow it. */
  voiceover: string
  totalDurationSec: number
  /** Hook style the script writer used (for later performance analysis). */
  hookStyle?: string
  scriptSource: 'ai' | 'pool' | 'none'
  warnings: string[]
}

export type MixPreviewResult = {
  drafts: MixDraft[]
  warnings: string[]
  scriptModel?: string
  /** How past results shaped this batch (absent when there is no measured data yet). */
  learned?: {
    measured: number
    formulaShares: Array<{ formulaId: string; formulaName: string; count: number; weight: number }>
    winnerRefs: number
  }
}

const now = 0
const beat = (role: ClipRole, min: number, max: number, extra: Partial<FormulaBeat> = {}): FormulaBeat => ({
  role,
  durationSec: { min, max },
  ...extra,
})

/** Proven TikTok Shop selling angles. Durations target a 15-25s video. */
export const BUILTIN_FORMULAS: MixFormula[] = [
  {
    id: 'builtin:problem_solution',
    name: '痛点 → 解决',
    angle: 'problem_solution',
    description: '先戳痛点，再让产品出场解决，演示 + 细节证明，最后催单。',
    source: 'builtin',
    beats: [
      beat('hook', 1.2, 2.2, { altRoles: ['pain_point'], scriptHint: 'Call out the buyer and the pain in one punchy line' }),
      beat('pain_point', 1.5, 3, { optional: true, altRoles: ['comparison'], scriptHint: 'Describe the frustration' }),
      beat('demo', 2, 3.5, { altRoles: ['wear'], scriptHint: 'Product appears and fixes it' }),
      beat('detail', 1.5, 3, { scriptHint: 'Key selling point / material' }),
      beat('wear', 2, 3.5, { optional: true, altRoles: ['demo'], scriptHint: 'Result in real use' }),
      beat('proof', 1.5, 2.5, { optional: true, altRoles: ['detail'], scriptHint: 'Trust: quality, reviews, sold count' }),
      beat('cta', 1.5, 2.5, { altRoles: ['wear', 'detail'], scriptHint: 'Price / offer + tap the yellow cart' }),
    ],
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'builtin:result_first',
    name: '效果先行',
    angle: 'result_first',
    description: '第一秒就给最终效果，再倒回来看细节和使用，适合饰品、服装、美妆。',
    source: 'builtin',
    beats: [
      beat('wear', 1.2, 2.2, { altRoles: ['hook'], scriptHint: 'Show-off line about the final look' }),
      beat('hook', 1, 2, { optional: true, altRoles: ['wear'], scriptHint: 'Tease: you will not believe the price' }),
      beat('detail', 1.5, 3, { scriptHint: 'Zoom into the detail that makes it special' }),
      beat('demo', 2, 3, { altRoles: ['wear'], scriptHint: 'How it is worn / used' }),
      beat('detail', 1.5, 2.5, { optional: true, altRoles: ['proof'], scriptHint: 'Second selling point' }),
      beat('cta', 1.5, 2.5, { altRoles: ['wear'], scriptHint: 'Offer + yellow cart' }),
    ],
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'builtin:unboxing',
    name: '开箱',
    angle: 'unboxing',
    description: '包裹到手 → 拆开 → 第一眼 → 试用，真实感强，适合新品和礼盒。',
    source: 'builtin',
    beats: [
      beat('hook', 1.2, 2, { altRoles: ['unboxing'], scriptHint: 'It finally arrived / I ordered this from TikTok' }),
      beat('unboxing', 2, 3.5, { altRoles: ['detail'], scriptHint: 'Packaging first impression' }),
      beat('detail', 1.5, 3, { scriptHint: 'What is inside, quality' }),
      beat('demo', 2, 3.5, { altRoles: ['wear'], scriptHint: 'Trying it' }),
      beat('wear', 1.5, 3, { optional: true, altRoles: ['demo'], scriptHint: 'Honest verdict' }),
      beat('cta', 1.5, 2.5, { altRoles: ['unboxing', 'detail'], scriptHint: 'Where to get it + offer' }),
    ],
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'builtin:comparison',
    name: '对比',
    angle: 'comparison',
    description: '和普通款 / 便宜货对比，突出差异点，用细节和测试证明。',
    source: 'builtin',
    beats: [
      beat('hook', 1.2, 2, { altRoles: ['comparison'], scriptHint: 'Cheap one vs this one - spot the difference' }),
      beat('comparison', 2, 3.5, { altRoles: ['detail'], scriptHint: 'Side by side' }),
      beat('detail', 1.5, 3, { scriptHint: 'Why this one is better' }),
      beat('proof', 1.5, 3, { optional: true, altRoles: ['demo'], scriptHint: 'Test / durability proof' }),
      beat('demo', 2, 3, { altRoles: ['wear'], scriptHint: 'Using it' }),
      beat('cta', 1.5, 2.5, { altRoles: ['wear', 'detail'], scriptHint: 'Price is almost the same - get it now' }),
    ],
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'builtin:gift',
    name: '送礼 / 场景',
    angle: 'gift',
    description: '锁定送礼对象或场合（生日、节日、情侣），包装 + 上身效果。',
    source: 'builtin',
    beats: [
      beat('hook', 1.2, 2, { altRoles: ['wear', 'unboxing'], scriptHint: 'Gift idea for her / him / mom - name the occasion' }),
      beat('unboxing', 1.5, 3, { optional: true, altRoles: ['detail'], scriptHint: 'Gift-ready packaging' }),
      beat('detail', 1.5, 3, { scriptHint: 'Why it feels premium' }),
      beat('wear', 2, 3.5, { altRoles: ['demo'], scriptHint: 'Their reaction / how it looks on' }),
      beat('cta', 1.5, 2.5, { altRoles: ['wear', 'detail'], scriptHint: 'Order before the date + offer' }),
    ],
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'builtin:three_reasons',
    name: '3 个理由',
    angle: 'three_reasons',
    description: '“3 个理由让我回购”，每个理由配一个镜头，信息密度高。',
    source: 'builtin',
    beats: [
      beat('hook', 1.2, 2, { altRoles: ['wear', 'demo'], scriptHint: '3 reasons I keep buying this' }),
      beat('detail', 2, 3, { altRoles: ['demo'], scriptHint: 'Reason 1' }),
      beat('demo', 2, 3, { altRoles: ['wear', 'detail'], scriptHint: 'Reason 2' }),
      beat('proof', 2, 3, { altRoles: ['wear', 'detail'], scriptHint: 'Reason 3' }),
      beat('cta', 1.5, 2.5, { altRoles: ['wear', 'detail'], scriptHint: 'Offer + yellow cart' }),
    ],
    createdAt: now,
    updatedAt: now,
  },
]
