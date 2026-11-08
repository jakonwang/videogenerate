import { createHash, randomUUID } from 'node:crypto'
import {
  activateLivePhotoPromptVersionInSqlite,
  readActiveLivePhotoPromptVersionFromSqlite,
  readLivePhotoPromptVersionsFromSqlite,
  upsertLivePhotoPromptVersionInSqlite,
} from './sqlite'
import type { LivePhotoPromptKind, LivePhotoPromptVersion, SaveLivePhotoPromptVersionInput } from './types'

export const DEFAULT_LIVE_PHOTO_REPLACEMENT_PROMPT = [
  'Replace the product in Image 1 with the exact physical product from Image 2 while preserving the original scene, composition, lighting, and atmosphere of Image 1.',
  '',
  'Treat the product in Image 2 as the only source of truth for the product. Preserve its text, colors, materials, textures, proportions, structure, and all visible details exactly as shown. Do not redesign, recreate, recolor, reshape, simplify, or modify the product in any way.',
  '',
  'Allow only natural environmental adaptation, including realistic ambient lighting, reflections, highlights, and stable contact shadows consistent with Image 1. These lighting effects must not alter the product\'s original appearance or identity.',
  '',
  'The replacement should be seamlessly integrated into Image 1 with no cut-and-paste artifacts, appearing as if the product had always been part of the original photograph.',
].join('\n')

const DEFAULT_LIVE_PHOTO_VIDEO_PROMPT = 'Create a realistic six-second product close-up video with subtle natural motion while preserving the exact product identity and composition.'

export function hashLivePhotoPrompt(prompt: string) {
  return createHash('sha256').update(String(prompt || ''), 'utf8').digest('hex')
}

function normalizePromptVersion(input: LivePhotoPromptVersion): LivePhotoPromptVersion {
  const prompt = String(input.prompt || '').trim()
  return {
    ...input,
    name: String(input.name || '').trim() || `Prompt V${input.version}`,
    prompt,
    promptHash: hashLivePhotoPrompt(prompt),
    active: Boolean(input.active),
    kind: input.kind || 'image',
  }
}

function ensureDefaultPromptVersions() {
  const existing = readLivePhotoPromptVersionsFromSqlite().map(normalizePromptVersion)
  const timestamp = Date.now()
  const defaults: Array<{ kind: LivePhotoPromptKind; name: string; prompt: string }> = [
    { kind: 'image', name: 'Live Photo Product Replacement', prompt: DEFAULT_LIVE_PHOTO_REPLACEMENT_PROMPT },
    { kind: 'video', name: 'Live Photo Video Motion', prompt: DEFAULT_LIVE_PHOTO_VIDEO_PROMPT },
  ]
  for (const item of defaults) {
    if (existing.some((version) => version.kind === item.kind)) continue
    const seeded = normalizePromptVersion({
      id: randomUUID(),
      name: item.name,
      version: 1,
      prompt: item.prompt,
      promptHash: hashLivePhotoPrompt(item.prompt),
      active: true,
      createdAt: timestamp,
      updatedAt: timestamp,
      kind: item.kind,
    })
    upsertLivePhotoPromptVersionInSqlite(seeded)
    existing.push(seeded)
  }
  return existing
}

export const livePhotoPromptVersionService = {
  list(kind: LivePhotoPromptKind = 'image') {
    return ensureDefaultPromptVersions().filter((item) => (item.kind || 'image') === kind).sort((a, b) => b.version - a.version)
  },

  getActive(kind: LivePhotoPromptKind = 'image') {
    const versions = ensureDefaultPromptVersions().filter((item) => (item.kind || 'image') === kind)
    if (versions.length) return normalizePromptVersion(readActiveLivePhotoPromptVersionFromSqlite(kind) || versions[0]!)
    const timestamp = Date.now()
    const seeded = normalizePromptVersion({ id: randomUUID(), name: 'Live Photo Video Motion', version: 1, prompt: DEFAULT_LIVE_PHOTO_VIDEO_PROMPT, promptHash: '', active: true, createdAt: timestamp, updatedAt: timestamp, kind })
    upsertLivePhotoPromptVersionInSqlite(seeded)
    return seeded
  },

  save(input: SaveLivePhotoPromptVersionInput) {
    const prompt = String(input.prompt || '').trim()
    if (!prompt) throw new Error('Prompt content is required')
    const kind = input.kind || 'image'
    const versions = ensureDefaultPromptVersions().filter((item) => (item.kind || 'image') === kind)
    const existing = String(input.id || '').trim() ? versions.find((item) => item.id === String(input.id || '').trim()) : undefined
    const timestamp = Date.now()
    const next = normalizePromptVersion({
      id: existing?.id || randomUUID(),
      name: String(input.name || '').trim() || existing?.name || `Prompt V${versions.length + 1}`,
      version: existing?.version || Math.max(0, ...versions.map((item) => item.version)) + 1,
      prompt,
      promptHash: hashLivePhotoPrompt(prompt),
      active: existing?.active || false,
      createdAt: existing?.createdAt || timestamp,
      updatedAt: timestamp,
      kind,
    })
    upsertLivePhotoPromptVersionInSqlite(next)
    return next
  },

  activate(id: string) {
    const target = ensureDefaultPromptVersions().find((item) => item.id === String(id || '').trim())
    if (!target) throw new Error('Prompt version does not exist')
    activateLivePhotoPromptVersionInSqlite(target.id, target.kind || 'image')
    return this.getActive(target.kind || 'image')
  },

  rollback(id: string) {
    const source = ensureDefaultPromptVersions().find((item) => item.id === String(id || '').trim())
    if (!source) throw new Error('Prompt version does not exist')
    const copy = this.save({ name: `${source.name} Rollback`, prompt: source.prompt, kind: source.kind || 'image' })
    return this.activate(copy.id)
  },
}
