import { existsSync } from 'node:fs'
import { generateGptShotFrameImage } from './gptImage'
import type { ModelCredentials } from './types'

function normalizeRefs(paths: string[]) {
  return Array.from(new Set(paths.map((item) => String(item || '').trim()).filter(Boolean))).filter((item) => existsSync(item))
}

export function buildProductAnalysisBoardPrompt() {
  return [
    'You are preparing a high-consistency product-only analysis board from multiple reference images of the same exact product.',
    'The final board must be product only and must look like a real ecommerce multi-angle product board.',
    'Output exactly one 6-panel board arranged as a clean 3x2 contact sheet.',
    'Treat all uploaded images as evidence of the same physical item from different angles or detail crops.',
    'Cross-check the references before generating any unseen angle.',
    'Use a pure white background with clean studio lighting only.',
    'Show multiple realistic product angles of the same exact physical item only.',
    'Generate these six exact labeled views only: Front View, Three-Quarter Front View, Side View, Rear View, Three-Quarter Rear View, Single Earring Front View.',
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
}

export async function buildProductAnalysisBoard(input: {
  credentials: ModelCredentials
  imagePaths: string[]
  outDir: string
  filePrefix: string
  allowFallback?: boolean
}) {
  const refs = normalizeRefs(input.imagePaths)
  if (!refs.length) return ''

  try {
    return await generateGptShotFrameImage({
      credentials: input.credentials,
      prompt: buildProductAnalysisBoardPrompt(),
      negativePrompt: [
        'human',
        'person',
        'face',
        'ear',
        'earlobe',
        'skin',
        'hair',
        'hand',
        'body',
        'wearing context',
        'background clutter',
        'fantasy structure',
        'invented backside',
        'hallucinated detail',
        'extra accessory',
        'extra decoration',
        'redesign',
        'shape change',
        'wrong geometry',
        'wrong thickness',
        'wrong proportions',
        'wrong material',
        'wrong color',
        'cgi',
        '3d render',
        'illustration',
        'stylized product',
        'logo',
        'watermark',
      ].join(', '),
      imagePaths: refs,
      outDir: input.outDir,
      filePrefix: input.filePrefix,
      normalizeOutput: 'preserve',
    })
  } catch (error) {
    if (!input.allowFallback) {
      throw new Error(`Product analysis board generation failed: ${String((error as any)?.message ?? error ?? 'unknown error')}`)
    }
    return await generateGptShotFrameImage({
      credentials: input.credentials,
      prompt: buildProductAnalysisBoardPrompt(),
      negativePrompt: [
        'human',
        'person',
        'face',
        'ear',
        'earlobe',
        'skin',
        'hair',
        'hand',
        'body',
        'wearing context',
        'background clutter',
        'fantasy structure',
        'invented backside',
        'hallucinated detail',
        'extra accessory',
        'extra decoration',
        'redesign',
        'shape change',
        'wrong geometry',
        'wrong thickness',
        'wrong proportions',
        'wrong material',
        'wrong color',
        'cgi',
        '3d render',
        'illustration',
        'stylized product',
        'logo',
        'watermark',
      ].join(', '),
      imagePaths: refs,
      outDir: input.outDir,
      filePrefix: input.filePrefix,
      normalizeOutput: 'preserve',
    })
  }
}
