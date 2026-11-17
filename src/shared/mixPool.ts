/**
 * Mix pool (混剪素材池): every usable shot for a product, split out of its source
 * videos and tagged by the role it can play in a conversion-oriented TikTok edit.
 * Shared by main (storage / analysis) and renderer (pool page).
 */

/** The job a shot can do inside a selling video. Order = typical story order. */
export const CLIP_ROLES = [
  'hook',
  'pain_point',
  'unboxing',
  'demo',
  'wear',
  'detail',
  'comparison',
  'proof',
  'cta',
  'broll',
] as const

export type ClipRole = (typeof CLIP_ROLES)[number]

/** Roles a complete conversion edit needs at least one shot for. */
export const CORE_CLIP_ROLES: ClipRole[] = ['hook', 'demo', 'detail', 'proof', 'cta']

/** real = shot by a camera; ai = model generated; unknown = not stated. */
export type ClipOrigin = 'real' | 'ai' | 'unknown'

export type PoolSourceKind = 'product_asset' | 'clone_output' | 'creative_studio' | 'live_photo' | 'import'

export type PoolSourceStatus = 'pending' | 'splitting' | 'ready' | 'failed'

export type PoolSource = {
  id: string
  productId: string
  kind: PoolSourceKind
  filePath: string
  fileName: string
  origin: ClipOrigin
  /** Product segment key (hook/show/detail…) or clone project id the source came from. */
  ref?: string
  durationSec?: number
  width?: number
  height?: number
  status: PoolSourceStatus
  error?: string
  clipCount: number
  createdAt: number
  updatedAt: number
}

export type ClipShotScale = 'close' | 'medium' | 'wide'
export type ClipMotion = 'static' | 'slow' | 'fast'

export type ClipTags = {
  role: ClipRole
  secondaryRoles: ClipRole[]
  /** One short sentence: what happens in the shot. */
  description: string
  hasProduct: boolean
  hasHand: boolean
  hasFace: boolean
  /** Burned-in text / captions / platform UI visible. */
  hasText: boolean
  /** Model judgement that the frames look AI generated. */
  looksAi: boolean
  /**
   * false = the item on screen is clearly a different product than this one (other design/colour/type).
   * Such shots never go into this product's edits unless a role is assigned by hand.
   */
  matchesProduct?: boolean
  shotScale: ClipShotScale
  motion: ClipMotion
  /** 0-100 visual quality (sharpness, lighting, framing). */
  quality: number
  /** 0-100 how well this works as the first 1-2 seconds. */
  hookScore: number
  issues: string[]
}

export type ClipTagStatus = 'untagged' | 'tagging' | 'tagged' | 'failed'

export type PoolClip = {
  id: string
  productId: string
  sourceId: string
  /** Source video; the clip is the [startSec, endSec) range inside it. */
  filePath: string
  startSec: number
  endSec: number
  durationSec: number
  origin: ClipOrigin
  /** Representative frames (start / mid / end), JPG. */
  framePaths: string[]
  thumbnailPath: string
  tagStatus: ClipTagStatus
  tags?: ClipTags
  /** "ai:<model>" or "heuristic". */
  tagProvider?: string
  tagError?: string
  /** Manual correction from the pool page; wins over tags.role. */
  roleOverride?: ClipRole
  disabled?: boolean
  createdAt: number
  updatedAt: number
}

export type MixPoolRoleStat = {
  role: ClipRole
  count: number
  realCount: number
  totalSec: number
}

export type MixPoolOverview = {
  productId: string
  sources: PoolSource[]
  clips: PoolClip[]
  stats: {
    sourceCount: number
    clipCount: number
    taggedCount: number
    realCount: number
    aiCount: number
    byRole: MixPoolRoleStat[]
    /** Core roles with no usable shot yet. */
    missingRoles: ClipRole[]
    /** Shots the AI judged to show a different product (excluded from edits). */
    mismatchCount: number
  }
}

export type MixPoolProgress = {
  productId: string
  phase: 'split' | 'tag' | 'done'
  done: number
  total: number
  message?: string
}

export function effectiveClipRole(clip: Pick<PoolClip, 'roleOverride' | 'tags'>): ClipRole | null {
  return clip.roleOverride ?? clip.tags?.role ?? null
}
