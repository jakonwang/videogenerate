import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { getAppPaths } from '../../lib/paths'
import { readJsonFile, writeJsonFile } from '../../lib/storeJson'
import { getDefaultScriptAnalysisPromptTemplate } from './aiScriptAnalyzer'
import { getDefaultStoryboardPromptTemplate } from './gptImage'
import { CLONE_PRODUCT_TYPES, normalizeCloneProductType } from './productCategory'
import { DEFAULT_SHOT_VIDEO_PROMPT_TEMPLATE } from './prompt'
import {
  CLONE_PROMPT_KINDS,
  CLONE_PROMPT_PLACEHOLDERS,
  findUnknownClonePromptPlaceholders,
  setActiveClonePromptTemplates,
  type ClonePromptKind,
  type ClonePromptScope,
} from './promptTemplateRegistry'

/**
 * Versioned, user-managed prompt templates for the clone pipeline.
 *
 * Same model as the other prompt managers in the app (save / copy / activate /
 * roll back), with two additions: a `kind` (which prompt in the pipeline) and a
 * `productType` scope, so a category can have its own active template while
 * everything else keeps using the "all categories" one or the built-in default.
 */
export type ClonePromptVersion = {
  id: string
  kind: ClonePromptKind
  productType: ClonePromptScope
  name: string
  version: number
  prompt: string
  active: boolean
  /** The built-in default. It is not stored, cannot be edited, and is active when no saved version is. */
  builtin: boolean
  createdAt: number
  updatedAt: number
}

type StoredVersion = Omit<ClonePromptVersion, 'builtin'>

export const CLONE_PROMPT_BUILTIN_ID_PREFIX = 'builtin:'

const storePath = () => join(getAppPaths().dbDir, 'clone-prompt-templates.json')

function normalizeKind(value: unknown): ClonePromptKind {
  const kind = String(value ?? '').trim() as ClonePromptKind
  if (!CLONE_PROMPT_KINDS.includes(kind)) throw new Error(`Unknown clone prompt kind: ${String(value ?? '')}`)
  return kind
}

function normalizeScope(value: unknown): ClonePromptScope {
  const text = String(value ?? '').trim().toLowerCase()
  if (!text || text === 'all') return 'all'
  const type = normalizeCloneProductType(text)
  // An unknown category must not silently become the catch-all `general` scope.
  if (type === 'general' && text !== 'general') throw new Error(`Unknown product category: ${String(value ?? '')}`)
  return type
}

export function getDefaultClonePromptTemplate(kind: ClonePromptKind) {
  if (kind === 'shot_video') return DEFAULT_SHOT_VIDEO_PROMPT_TEMPLATE
  if (kind === 'storyboard_model') return getDefaultStoryboardPromptTemplate('model_presentation')
  if (kind === 'storyboard_product') return getDefaultStoryboardPromptTemplate('product_closeup')
  return getDefaultScriptAnalysisPromptTemplate()
}

async function readStored(): Promise<StoredVersion[]> {
  const db = await readJsonFile(storePath(), { versions: [] as StoredVersion[] })
  const versions = Array.isArray(db?.versions) ? db.versions : []
  return versions.filter(
    (item) => item && typeof item.id === 'string' && CLONE_PROMPT_KINDS.includes(item.kind) && typeof item.prompt === 'string',
  )
}

function syncRegistry(versions: StoredVersion[]) {
  setActiveClonePromptTemplates(versions.filter((item) => item.active))
}

async function writeStored(versions: StoredVersion[]) {
  await writeJsonFile(storePath(), { versions })
  syncRegistry(versions)
}

function builtinVersion(kind: ClonePromptKind, productType: ClonePromptScope, active: boolean): ClonePromptVersion {
  return {
    id: `${CLONE_PROMPT_BUILTIN_ID_PREFIX}${kind}`,
    kind,
    productType,
    name: 'Built-in default',
    version: 0,
    prompt: getDefaultClonePromptTemplate(kind),
    active,
    builtin: true,
    createdAt: 0,
    updatedAt: 0,
  }
}

const inScope = (item: StoredVersion, kind: ClonePromptKind, productType: ClonePromptScope) =>
  item.kind === kind && item.productType === productType

function nextVersionNumber(versions: StoredVersion[], kind: ClonePromptKind, productType: ClonePromptScope) {
  return Math.max(0, ...versions.filter((item) => inScope(item, kind, productType)).map((item) => item.version)) + 1
}

export const clonePromptTemplateService = {
  /** Load the saved templates into the in-memory registry the prompt builders read. Call once at startup. */
  async load() {
    syncRegistry(await readStored())
  },

  describe() {
    return {
      kinds: CLONE_PROMPT_KINDS.map((kind) => ({ kind, placeholders: [...CLONE_PROMPT_PLACEHOLDERS[kind]] })),
      productTypes: ['all', ...CLONE_PRODUCT_TYPES] as ClonePromptScope[],
    }
  },

  /** Saved versions for one kind + category scope, newest first, followed by the built-in default. */
  async list(input: { kind: string; productType?: string }): Promise<ClonePromptVersion[]> {
    const kind = normalizeKind(input?.kind)
    const productType = normalizeScope(input?.productType)
    const saved = (await readStored())
      .filter((item) => inScope(item, kind, productType))
      .sort((a, b) => b.version - a.version)
      .map((item) => ({ ...item, builtin: false }))
    return [...saved, builtinVersion(kind, productType, !saved.some((item) => item.active))]
  },

  /** Which scopes of a kind currently have an active saved template (for the category picker). */
  async listActiveScopes(input: { kind: string }): Promise<ClonePromptScope[]> {
    const kind = normalizeKind(input?.kind)
    return (await readStored()).filter((item) => item.kind === kind && item.active).map((item) => item.productType)
  },

  /** Update a saved version in place, or create a new one when `id` is empty or names the built-in default. */
  async save(input: { id?: string; kind: string; productType?: string; name?: string; prompt: string }): Promise<ClonePromptVersion> {
    const kind = normalizeKind(input?.kind)
    const productType = normalizeScope(input?.productType)
    const prompt = String(input?.prompt || '').trim()
    if (!prompt) throw new Error('Prompt content is required')
    if (prompt.length > 20_000) throw new Error('Prompt content is too long')
    const unknown = findUnknownClonePromptPlaceholders(kind, prompt)
    if (unknown.length) {
      throw new Error(
        `Unknown placeholders: ${unknown.map((name) => `{{${name}}}`).join(', ')}. Allowed: ${CLONE_PROMPT_PLACEHOLDERS[kind].map((name) => `{{${name}}}`).join(', ')}`,
      )
    }
    const versions = await readStored()
    const id = String(input?.id || '').trim()
    const existing = id.startsWith(CLONE_PROMPT_BUILTIN_ID_PREFIX)
      ? undefined
      : versions.find((item) => item.id === id && inScope(item, kind, productType))
    const timestamp = Date.now()
    const versionNumber = existing?.version ?? nextVersionNumber(versions, kind, productType)
    const version: StoredVersion = {
      id: existing?.id || randomUUID(),
      kind,
      productType,
      name: String(input?.name || '').trim().slice(0, 80) || existing?.name || `Prompt V${versionNumber}`,
      version: versionNumber,
      prompt,
      active: existing?.active || false,
      createdAt: existing?.createdAt || timestamp,
      updatedAt: timestamp,
    }
    await writeStored([version, ...versions.filter((item) => item.id !== version.id)])
    return { ...version, builtin: false }
  },

  /** Make one version the active one for its kind + scope. Activating the built-in default deactivates all saved ones. */
  async activate(input: { id: string; kind: string; productType?: string }): Promise<ClonePromptVersion> {
    const kind = normalizeKind(input?.kind)
    const productType = normalizeScope(input?.productType)
    const id = String(input?.id || '').trim()
    const versions = await readStored()
    const useBuiltin = id.startsWith(CLONE_PROMPT_BUILTIN_ID_PREFIX)
    if (!useBuiltin && !versions.some((item) => item.id === id && inScope(item, kind, productType))) {
      throw new Error('Prompt version does not exist')
    }
    const timestamp = Date.now()
    const updated = versions.map((item) =>
      inScope(item, kind, productType)
        ? { ...item, active: !useBuiltin && item.id === id, updatedAt: item.id === id ? timestamp : item.updatedAt }
        : item,
    )
    await writeStored(updated)
    if (useBuiltin) return builtinVersion(kind, productType, true)
    return { ...updated.find((item) => item.id === id)!, builtin: false }
  },

  /** Copy an older version (or the built-in default) into a new version and activate it. */
  async rollback(input: { id: string; kind: string; productType?: string }): Promise<ClonePromptVersion> {
    const kind = normalizeKind(input?.kind)
    const productType = normalizeScope(input?.productType)
    const source = (await this.list({ kind, productType })).find((item) => item.id === String(input?.id || '').trim())
    if (!source) throw new Error('Prompt version does not exist')
    const copy = await this.save({ kind, productType, name: `${source.name} Rollback`.slice(0, 80), prompt: source.prompt })
    return await this.activate({ id: copy.id, kind, productType })
  },

  /** Delete a saved version. The built-in default cannot be removed. */
  async remove(input: { id: string }): Promise<{ removed: boolean }> {
    const id = String(input?.id || '').trim()
    const versions = await readStored()
    if (!versions.some((item) => item.id === id)) return { removed: false }
    await writeStored(versions.filter((item) => item.id !== id))
    return { removed: true }
  },
}
