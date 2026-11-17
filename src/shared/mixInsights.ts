/**
 * Mix performance loop: every rendered mix video is kept in a ledger, linked to its TikTok GMV Max
 * creative once published, and its results are rolled up into scores per formula / hook style / hook shot.
 */

export type CreativeGrade = 'S' | 'A' | 'B' | 'C'

export type MixLedgerPerformance = {
  grade: CreativeGrade
  spend?: number
  gmv?: number
  roi?: number
  orders?: number
  /** 0-1 */
  ctr?: number
  /** 0-1 */
  cvr?: number
  play2sRate?: number
  playDepth?: number
  freshness?: 'fresh' | 'stale' | 'missing'
  syncedAt: number
}

export type MixLedgerLink = {
  creativeId: string
  campaignId: string
  creativeName: string
  coverUrl?: string
  externalUrl?: string
  method: 'auto' | 'manual'
  /** 0-1 confidence of the auto match. */
  confidence?: number
  linkedAt: number
}

export type MixLedgerEntry = {
  /** Render task id. */
  id: string
  productId: string
  outPath: string
  renderedAt: number
  durationSec?: number
  mode: 'auto' | 'ai'
  formulaId: string
  formulaName: string
  hookClipId: string
  hookThumbnailPath?: string
  clipIds: string[]
  title: string
  voiceover: string
  hookStyle?: string
  language: string
  /** Set when the video was sent to the publish center. */
  publishTaskIds?: string[]
  /** User asked to never auto-link this video again. */
  linkLocked?: boolean
  link?: MixLedgerLink
  performance?: MixLedgerPerformance
}

export type MixScoreRow = {
  key: string
  label: string
  /** Videos rendered with it. */
  rendered: number
  /** Videos with performance data. */
  measured: number
  sCount: number
  aCount: number
  /** Smoothed 0-1 conversion score (prior-weighted). */
  score: number
  /** Multiplier applied when planning (≈0.5-1.6). */
  weight: number
  avgCtr?: number
  avgCvr?: number
  avgRoi?: number
  thumbnailPath?: string
}

export type MixInsights = {
  productId?: string
  totals: { rendered: number; published: number; linked: number; measured: number; winners: number }
  formulas: MixScoreRow[]
  hookStyles: MixScoreRow[]
  hookClips: MixScoreRow[]
  generatedAt: number
}

export type MixCreativeOption = {
  creativeId: string
  campaignId: string
  name: string
  grade: CreativeGrade
  coverUrl?: string
  externalUrl?: string
  durationSeconds?: number
  linkedTo?: string
}

export type MixRefreshResult = {
  creatives: number
  newlyLinked: number
  updated: number
  /** GMV Max not connected / no SOP instance yet. */
  gmvMaxAvailable: boolean
  message?: string
}

export const GRADE_SCORE: Record<CreativeGrade, number> = { S: 1, A: 0.75, B: 0.4, C: 0.12 }

/** Score prior and pseudo-count: a single result can only move a formula partway from neutral. */
export const SCORE_PRIOR = 0.4
export const SCORE_PRIOR_WEIGHT = 2
