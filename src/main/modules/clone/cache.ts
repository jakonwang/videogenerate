import { createHash } from 'node:crypto'
import type {
  CloneCloudClipCacheEntry,
  CloneFrameCacheEntry,
  CloneProject,
  ClonePromptCacheEntry,
  CloneQualityMode,
  ShotSpec,
} from './types'

function stableHash(input: unknown) {
  return createHash('sha1').update(JSON.stringify(input)).digest('hex')
}

const PROMPT_CACHE_SCHEMA_VERSION = 'prompt-cache-2026-05-28-v2'

export function computePromptHash(input: {
  shot: ShotSpec
  productRefs: string[]
  productDescription?: string
  model: string
  qualityMode: CloneQualityMode
}) {
  return stableHash({
    schemaVersion: PROMPT_CACHE_SCHEMA_VERSION,
    shotId: input.shot.id,
    role: input.shot.shotRole || input.shot.role,
    type: input.shot.shotType,
    durationSec: input.shot.durationSec,
    framing: input.shot.framing,
    movement: input.shot.cameraMovement || input.shot.motion,
    action: input.shot.action,
    scriptText: input.shot.scriptText || '',
    scriptRole: input.shot.scriptRole || 'unknown',
    visualDescription: input.shot.visualDescription || '',
    actionDescription: input.shot.actionDescription || '',
    cameraDescription: input.shot.cameraDescription || '',
    productFocus: input.shot.productFocus || '',
    generationPrompt: input.shot.generationPrompt || '',
    scriptConfidence: input.shot.scriptConfidence ?? 0,
    referenceLock: input.shot.referenceLock ?? null,
    refs: [...input.productRefs].sort(),
    productDescription: input.productDescription || '',
    model: input.model,
    qualityMode: input.qualityMode,
  })
}

export function computeImagePromptHash(input: {
  promptHash: string
  which: 'start' | 'end' | 'both'
  refs: string[]
  model: string
  positivePrompt?: string
  negativePrompt?: string
}) {
  return stableHash({
    promptHash: input.promptHash,
    which: input.which,
    refs: [...input.refs].sort(),
    model: input.model,
    positivePrompt: input.positivePrompt || '',
    negativePrompt: input.negativePrompt || '',
  })
}

export function computeCloudClipHash(input: {
  promptHash: string
  firstFrame: string
  lastFrame: string
  model: string
  duration: number
  aspectRatio: string
  resolution: string
}) {
  return stableHash(input)
}

export function getCachedPromptResult(project: CloneProject, hash: string): ClonePromptCacheEntry | null {
  return project.promptCache?.[hash] ?? null
}

export function getCachedFrameResult(project: CloneProject, hash: string): CloneFrameCacheEntry | null {
  return project.frameCache?.[hash] ?? null
}

export function getCachedCloudClipResult(project: CloneProject, hash: string): CloneCloudClipCacheEntry | null {
  return project.cloudClipCache?.[hash] ?? null
}

export function setCachedPromptResult(project: CloneProject, entry: ClonePromptCacheEntry) {
  project.promptCache = {
    ...(project.promptCache ?? {}),
    [entry.hash]: entry,
  }
}

export function setCachedFrameResult(project: CloneProject, entry: CloneFrameCacheEntry) {
  project.frameCache = {
    ...(project.frameCache ?? {}),
    [entry.hash]: entry,
  }
}

export function setCachedCloudClipResult(project: CloneProject, entry: CloneCloudClipCacheEntry) {
  project.cloudClipCache = {
    ...(project.cloudClipCache ?? {}),
    [entry.hash]: entry,
  }
}
