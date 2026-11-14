import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { getAppPaths } from '../../lib/paths'
import { readJsonFile, writeJsonFile } from '../../lib/storeJson'

export type ProductAnalysisBoardPromptVersion = {
  id: string
  name: string
  version: number
  prompt: string
  active: boolean
  createdAt: number
  updatedAt: number
}

export const DEFAULT_PRODUCT_ANALYSIS_BOARD_PROMPT = [
  'You are preparing a high-consistency product-only analysis board from multiple reference images of the same exact product.',
  'The final board must be product only and must look like a real ecommerce multi-angle product board.',
  'Output exactly one 6-panel board arranged as a clean 3x2 contact sheet.',
  'Treat all uploaded images as evidence of the same physical item from different angles or detail crops.',
  'Cross-check the references before generating any unseen angle.',
  'Use a pure white background with clean studio lighting only.',
  'Show multiple realistic product angles of the same exact physical item only.',
  'First identify the product category from the references, then preserve that exact category in every panel.',
  'Never transform the product into another category, split it into a different product, or show an isolated component as if it were a separate product.',
  'Generate these six exact labeled views only: Front View, Three-Quarter Front View, Side View, Rear View, Three-Quarter Rear View, Close-Up Detail View.',
  'Each panel must include its own professional English view label rendered as clear overlay text inside the image.',
  'The label text must exactly match the required view name for that panel.',
  'Use clean, minimal ecommerce annotation styling for the labels: simple sans-serif, high legibility, consistent size, unobtrusive placement.',
  'Each cell must be a believable camera view of the same product instance, not a redesign, not a stylized reinterpretation, and not a newly invented variant.',
  'Prioritize true-to-life geometry, depth, thickness, curvature, closures, joints, holes, edges, attachment logic, and material response.',
  'Actively verify backside structure, connectors, edge profile, openings, clasp logic, layer order, and thickness cues across the references.',
  'The deep-angle views must remain physically plausible and consistent with how the product would actually look when rotated in a real studio shoot.',
  'Do not hallucinate hidden structure, missing backside details, extra layers, extra accessories, extra decorations, or speculative construction that is not supported by the reference.',
  'If the unseen side cannot be inferred safely, keep it conservative, minimal, and structurally consistent with the visible product evidence.',
  'Do not flatten the product into generic icon-like views. Preserve real volume, perspective, and thickness.',
  'No model, no face, no ear, no skin, no hand, no body, no wearing context.',
  'Do not add any hands, fingers, arms, human limbs, hand gestures, or hand actions in any cell.',
  'Keep the exact same product identity, structure, material, proportions, and details across all cells.',
].join('\n')

const promptVersionsPath = () => join(getAppPaths().dbDir, 'product-analysis-board-prompts.json')

async function listPromptVersions() {
  const db = await readJsonFile(promptVersionsPath(), { versions: [] as ProductAnalysisBoardPromptVersion[] })
  if (db.versions.length) return db.versions.sort((a, b) => b.version - a.version)
  const timestamp = Date.now()
  const version: ProductAnalysisBoardPromptVersion = {
    id: randomUUID(),
    name: 'Product Multi-Angle Board',
    version: 1,
    prompt: DEFAULT_PRODUCT_ANALYSIS_BOARD_PROMPT,
    active: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  await writeJsonFile(promptVersionsPath(), { versions: [version] })
  return [version]
}

export const productAnalysisBoardPromptVersionService = {
  list: listPromptVersions,

  async getActive() {
    const versions = await listPromptVersions()
    return versions.find((item) => item.active) || versions[0]!
  },

  async save(input: { id?: string; name?: string; prompt: string }) {
    const prompt = String(input.prompt || '').trim()
    if (!prompt) throw new Error('Prompt content is required')
    if (prompt.length > 20_000) throw new Error('Prompt content is too long')
    const versions = await listPromptVersions()
    const existing = versions.find((item) => item.id === String(input.id || '').trim())
    const timestamp = Date.now()
    const version: ProductAnalysisBoardPromptVersion = {
      id: existing?.id || randomUUID(),
      name: String(input.name || '').trim() || existing?.name || `Prompt V${Math.max(0, ...versions.map((item) => item.version)) + 1}`,
      version: existing?.version || Math.max(0, ...versions.map((item) => item.version)) + 1,
      prompt,
      active: existing?.active || false,
      createdAt: existing?.createdAt || timestamp,
      updatedAt: timestamp,
    }
    await writeJsonFile(promptVersionsPath(), { versions: [version, ...versions.filter((item) => item.id !== version.id)] })
    return version
  },

  async activate(id: string) {
    const versions = await listPromptVersions()
    if (!versions.some((item) => item.id === id)) throw new Error('Prompt version does not exist')
    const updated = versions.map((item) => ({ ...item, active: item.id === id, updatedAt: item.id === id ? Date.now() : item.updatedAt }))
    await writeJsonFile(promptVersionsPath(), { versions: updated })
    return updated.find((item) => item.id === id)!
  },

  async rollback(id: string) {
    const versions = await listPromptVersions()
    const source = versions.find((item) => item.id === id)
    if (!source) throw new Error('Prompt version does not exist')
    const copy = await this.save({ name: `${source.name} Rollback`, prompt: source.prompt })
    return await this.activate(copy.id)
  },
}
