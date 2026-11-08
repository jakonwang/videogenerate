import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { getAppPaths } from '../../lib/paths'
import { readJsonFile, writeJsonFile } from '../../lib/storeJson'
import { DEFAULT_LIVE_PHOTO_REPLACEMENT_PROMPT, hashLivePhotoPrompt } from '../live-photo/promptVersions'

export const DEFAULT_TIKTOK_REFERENCE_VIDEO_PROMPT = 'Create a smooth ten-second product showcase with gentle natural motion and stable product identity.'
export const DEFAULT_TIKTOK_REFERENCE_IMAGE_PROMPT = DEFAULT_LIVE_PHOTO_REPLACEMENT_PROMPT
export type TiktokPromptKind = 'image' | 'video'

export function isImageReplacementPrompt(prompt: string) {
  const value = String(prompt || '').trim()
  if (!value) return false
  return /replace\s+the\s+product\s+in\s+image\s*1.{0,120}image\s*2|image\s*1.{0,120}replace\s+the\s+product.{0,120}image\s*2/i.test(value)
    || /将图片\s*1.{0,24}(?:产品|商品).{0,12}替换为.{0,32}图片\s*2|(?:把|将)图片\s*1.{0,24}(?:产品|商品).{0,12}替换成.{0,32}图片\s*2/.test(value)
}

export type TiktokCreativePromptVersion = {
  id: string
  name: string
  version: number
  prompt: string
  promptHash: string
  kind: TiktokPromptKind
  active: boolean
  createdAt: number
  updatedAt: number
}

type PromptVersionDb = {
  versions: TiktokCreativePromptVersion[]
}

function promptVersionsPath() {
  return join(getAppPaths().dbDir, 'tiktok-creative-studio-prompt-versions.json')
}

function normalize(input: TiktokCreativePromptVersion): TiktokCreativePromptVersion {
  const prompt = String(input.prompt || '').trim()
  return {
    ...input,
    name: String(input.name || '').trim() || `Prompt V${input.version}`,
    prompt,
    promptHash: hashLivePhotoPrompt(prompt),
    kind: input.kind === 'image' ? 'image' : 'video',
    active: Boolean(input.active),
  }
}

async function readDb() {
  const db = await readJsonFile<PromptVersionDb>(promptVersionsPath(), { versions: [] })
  if (db.versions.length) {
    const versions = db.versions.map(normalize)
    const timestamp = Date.now()
    if (!versions.some((item) => item.kind === 'video')) {
      versions.push({ id: randomUUID(), name: 'TikTok Reference to Video', version: 1, prompt: DEFAULT_TIKTOK_REFERENCE_VIDEO_PROMPT, promptHash: hashLivePhotoPrompt(DEFAULT_TIKTOK_REFERENCE_VIDEO_PROMPT), kind: 'video', active: true, createdAt: timestamp, updatedAt: timestamp })
    }
    if (!versions.some((item) => item.kind === 'image')) {
      versions.push({ id: randomUUID(), name: 'TikTok Reference Image', version: 1, prompt: DEFAULT_TIKTOK_REFERENCE_IMAGE_PROMPT, promptHash: hashLivePhotoPrompt(DEFAULT_TIKTOK_REFERENCE_IMAGE_PROMPT), kind: 'image', active: true, createdAt: timestamp, updatedAt: timestamp })
    }
    const next = { versions }
    await writeJsonFile(promptVersionsPath(), next)
    return next
  }
  const timestamp = Date.now()
  const seeded: TiktokCreativePromptVersion = {
    id: randomUUID(),
    name: 'TikTok Product Replacement',
    version: 1,
    prompt: DEFAULT_TIKTOK_REFERENCE_VIDEO_PROMPT,
    promptHash: hashLivePhotoPrompt(DEFAULT_TIKTOK_REFERENCE_VIDEO_PROMPT),
    kind: 'video',
    active: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  const next = { versions: [seeded, { ...seeded, id: randomUUID(), name: 'TikTok Reference Image', prompt: DEFAULT_TIKTOK_REFERENCE_IMAGE_PROMPT, promptHash: hashLivePhotoPrompt(DEFAULT_TIKTOK_REFERENCE_IMAGE_PROMPT), kind: 'image' as const }] }
  await writeJsonFile(promptVersionsPath(), next)
  return next
}

async function saveDb(db: PromptVersionDb) {
  await writeJsonFile(promptVersionsPath(), db)
}

export const tiktokCreativePromptVersions = {
  async list(kind: TiktokPromptKind = 'video') {
    const db = await readDb()
    return db.versions.filter((item) => item.kind === kind).sort((a, b) => b.version - a.version)
  },

  async getActive(kind: TiktokPromptKind = 'video') {
    const versions = await this.list(kind)
    const active = versions.find((item) => item.active) || versions[0]!
    // Migrate the old shared Live Photo replacement seed to a valid R2V motion prompt.
    if (kind === 'video' && isImageReplacementPrompt(active.prompt)) {
      return await this.save({
        id: active.id,
        name: 'TikTok Reference to Video',
        prompt: DEFAULT_TIKTOK_REFERENCE_VIDEO_PROMPT,
        kind,
      })
    }
    return active
  },

  async save(input: { id?: string; name: string; prompt: string; kind?: TiktokPromptKind }) {
    const prompt = String(input.prompt || '').trim()
    if (!prompt) throw new Error('Prompt content is required')
    const db = await readDb()
    const kind = input.kind === 'image' ? 'image' : 'video'
    const existingIndex = db.versions.findIndex((item) => item.id === String(input.id || '').trim() && item.kind === kind)
    const existing = existingIndex >= 0 ? db.versions[existingIndex] : undefined
    const timestamp = Date.now()
    const next = normalize({
      id: existing?.id || randomUUID(),
      name: String(input.name || '').trim() || existing?.name || `Prompt V${db.versions.length + 1}`,
      version: existing?.version || Math.max(0, ...db.versions.filter((item) => item.kind === kind).map((item) => item.version)) + 1,
      prompt,
      promptHash: hashLivePhotoPrompt(prompt),
      kind,
      active: existing?.active || false,
      createdAt: existing?.createdAt || timestamp,
      updatedAt: timestamp,
    })
    if (existingIndex >= 0) db.versions[existingIndex] = next
    else db.versions.push(next)
    await saveDb(db)
    return next
  },

  async activate(id: string, kind: TiktokPromptKind = 'video') {
    const db = await readDb()
    const targetId = String(id || '').trim()
    if (!db.versions.some((item) => item.id === targetId && item.kind === kind)) throw new Error('Prompt version does not exist')
    db.versions = db.versions.map((item) => ({ ...item, active: item.kind === kind ? item.id === targetId : item.active, updatedAt: item.kind === kind && item.id === targetId ? Date.now() : item.updatedAt }))
    await saveDb(db)
    return db.versions.find((item) => item.id === targetId && item.kind === kind)!
  },

  async rollback(id: string, kind: TiktokPromptKind = 'video') {
    const source = (await this.list(kind)).find((item) => item.id === String(id || '').trim())
    if (!source) throw new Error('Prompt version does not exist')
    const copy = await this.save({ name: `${source.name} Rollback`, prompt: source.prompt, kind })
    return await this.activate(copy.id, kind)
  },
}
