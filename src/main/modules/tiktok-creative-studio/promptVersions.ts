import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { getAppPaths } from '../../lib/paths'
import { readJsonFile, writeJsonFile } from '../../lib/storeJson'
import { DEFAULT_LIVE_PHOTO_REPLACEMENT_PROMPT, hashLivePhotoPrompt } from '../live-photo/promptVersions'

export type TiktokCreativePromptVersion = {
  id: string
  name: string
  version: number
  prompt: string
  promptHash: string
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
    active: Boolean(input.active),
  }
}

async function readDb() {
  const db = await readJsonFile<PromptVersionDb>(promptVersionsPath(), { versions: [] })
  if (db.versions.length) return { versions: db.versions.map(normalize) }
  const timestamp = Date.now()
  const seeded: TiktokCreativePromptVersion = {
    id: randomUUID(),
    name: 'TikTok Product Replacement',
    version: 1,
    prompt: DEFAULT_LIVE_PHOTO_REPLACEMENT_PROMPT,
    promptHash: hashLivePhotoPrompt(DEFAULT_LIVE_PHOTO_REPLACEMENT_PROMPT),
    active: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  const next = { versions: [seeded] }
  await writeJsonFile(promptVersionsPath(), next)
  return next
}

async function saveDb(db: PromptVersionDb) {
  await writeJsonFile(promptVersionsPath(), db)
}

export const tiktokCreativePromptVersions = {
  async list() {
    const db = await readDb()
    return db.versions.sort((a, b) => b.version - a.version)
  },

  async getActive() {
    const versions = await this.list()
    return versions.find((item) => item.active) || versions[0]!
  },

  async save(input: { id?: string; name: string; prompt: string }) {
    const prompt = String(input.prompt || '').trim()
    if (!prompt) throw new Error('Prompt content is required')
    const db = await readDb()
    const existingIndex = db.versions.findIndex((item) => item.id === String(input.id || '').trim())
    const existing = existingIndex >= 0 ? db.versions[existingIndex] : undefined
    const timestamp = Date.now()
    const next = normalize({
      id: existing?.id || randomUUID(),
      name: String(input.name || '').trim() || existing?.name || `Prompt V${db.versions.length + 1}`,
      version: existing?.version || Math.max(0, ...db.versions.map((item) => item.version)) + 1,
      prompt,
      promptHash: hashLivePhotoPrompt(prompt),
      active: existing?.active || false,
      createdAt: existing?.createdAt || timestamp,
      updatedAt: timestamp,
    })
    if (existingIndex >= 0) db.versions[existingIndex] = next
    else db.versions.push(next)
    await saveDb(db)
    return next
  },

  async activate(id: string) {
    const db = await readDb()
    const targetId = String(id || '').trim()
    if (!db.versions.some((item) => item.id === targetId)) throw new Error('Prompt version does not exist')
    db.versions = db.versions.map((item) => ({ ...item, active: item.id === targetId, updatedAt: item.id === targetId ? Date.now() : item.updatedAt }))
    await saveDb(db)
    return db.versions.find((item) => item.id === targetId)!
  },

  async rollback(id: string) {
    const source = (await this.list()).find((item) => item.id === String(id || '').trim())
    if (!source) throw new Error('Prompt version does not exist')
    const copy = await this.save({ name: `${source.name} Rollback`, prompt: source.prompt })
    return await this.activate(copy.id)
  },
}
