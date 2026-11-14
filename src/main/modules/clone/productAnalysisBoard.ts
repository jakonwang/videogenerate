import { existsSync } from 'node:fs'
import { generateGptShotFrameImage } from './gptImage'
import type { ModelCredentials } from './types'
import { DEFAULT_PRODUCT_ANALYSIS_BOARD_PROMPT } from '../products/promptVersions'

function normalizeRefs(paths: string[]) {
  return Array.from(new Set(paths.map((item) => String(item || '').trim()).filter(Boolean))).filter((item) => existsSync(item))
}

export function buildProductAnalysisBoardPrompt() {
  return DEFAULT_PRODUCT_ANALYSIS_BOARD_PROMPT
}

export async function buildProductAnalysisBoard(input: {
  credentials: ModelCredentials
  imagePaths: string[]
  outDir: string
  filePrefix: string
  allowFallback?: boolean
  prompt?: string
}) {
  const refs = normalizeRefs(input.imagePaths)
  if (!refs.length) return ''

  try {
    return await generateGptShotFrameImage({
      credentials: input.credentials,
      prompt: String(input.prompt || '').trim() || buildProductAnalysisBoardPrompt(),
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
      prompt: String(input.prompt || '').trim() || buildProductAnalysisBoardPrompt(),
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
