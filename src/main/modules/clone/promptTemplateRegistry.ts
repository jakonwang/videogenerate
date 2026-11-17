import type { CloneProductType } from './types'

/**
 * In-memory registry of the user's active clone prompt templates.
 *
 * It is deliberately free of file and Electron access so that the synchronous
 * prompt builders (and their tests) can read it. `promptTemplates.ts` owns the
 * persistence and pushes the active set in here.
 */
export type ClonePromptKind = 'shot_video' | 'storyboard_model' | 'storyboard_product' | 'script_analysis'
export type ClonePromptScope = CloneProductType | 'all'

export const CLONE_PROMPT_KINDS: readonly ClonePromptKind[] = [
  'shot_video',
  'storyboard_model',
  'storyboard_product',
  'script_analysis',
]

/** Placeholders each kind may use. Anything else would be sent to the model literally, so saving rejects it. */
export const CLONE_PROMPT_PLACEHOLDERS: Record<ClonePromptKind, readonly string[]> = {
  shot_video: [
    'productName',
    'targetBodyPart',
    'cameraMovement',
    'referenceAction',
    'referenceScene',
    'referenceActionLine',
    'referenceSceneLine',
    'specificMicroAction',
    'faceRuleLine',
  ],
  storyboard_model: ['productName'],
  storyboard_product: ['productName', 'humanSupportRule'],
  script_analysis: ['targetMarket', 'productCategory'],
}

const activeTemplates = new Map<string, string>()

const keyOf = (kind: ClonePromptKind, scope: ClonePromptScope) => `${kind}::${scope}`

export function setActiveClonePromptTemplates(entries: Array<{ kind: ClonePromptKind; productType: ClonePromptScope; prompt: string }>) {
  activeTemplates.clear()
  for (const entry of entries) {
    const prompt = String(entry.prompt || '').trim()
    if (prompt) activeTemplates.set(keyOf(entry.kind, entry.productType), prompt)
  }
}

/**
 * The user's active template for this kind: the one scoped to the product
 * category if there is one, else the one for all categories, else undefined
 * (the caller then uses its built-in default).
 */
export function getActiveClonePromptTemplate(kind: ClonePromptKind, productType?: CloneProductType) {
  return (productType ? activeTemplates.get(keyOf(kind, productType)) : undefined) ?? activeTemplates.get(keyOf(kind, 'all'))
}

export function findUnknownClonePromptPlaceholders(kind: ClonePromptKind, prompt: string) {
  const allowed = new Set(CLONE_PROMPT_PLACEHOLDERS[kind])
  const found = new Set<string>()
  for (const match of String(prompt || '').matchAll(/\{\{\s*([^{}]*?)\s*\}\}/g)) {
    const name = match[1]
    if (!allowed.has(name)) found.add(name)
  }
  return Array.from(found)
}

/** Fill `{{name}}` placeholders. Values are inserted literally ("$" is never interpreted). */
export function fillClonePromptTemplate(template: string, variables: Record<string, string>) {
  return String(template || '').replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (whole, name: string) =>
    Object.prototype.hasOwnProperty.call(variables, name) ? String(variables[name] ?? '').trim() : whole,
  )
}
