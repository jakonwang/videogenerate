import { mkdir, readFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { getAppPaths } from '../../lib/paths'
import { generateGptShotFrameImage } from './gptImage'
import { cloneRepo } from './repo'
import type { CloneProductType } from './types'

export type ProductImageSanitizationDiagnostic = {
  originalPath: string
  sanitizedPath?: string
  status: 'kept' | 'sanitized' | 'failed'
  note?: string
  prompt?: string
  fallbackToOriginal?: boolean
}

export type ProductImageSanitizationResult = {
  sanitizedPaths: string[]
  failed: string[]
  diagnostics: ProductImageSanitizationDiagnostic[]
}

const PRODUCT_CANONICAL_SOURCE_PROMPT = [
  'Generate a single product-only extraction image.',
  'Extract only the product from the reference and remove the entire human context.',
  'Keep the exact same product identity:',
  '- exact shape',
  '- exact structure',
  '- exact material',
  '- exact color',
  '- exact proportions',
  '- exact decorative details',
  '- exact depth and thickness',
  '- exact closure, joint, hole, edge, and attachment structure',
  'Treat the uploaded reference as the highest authority for product facts.',
  'Do not redesign, beautify, simplify, or repair the product.',
  'Do not invent hidden structure or replace uncertain details with generic ecommerce product assumptions.',
  'If some structure is partially occluded, reconstruct conservatively and keep it as close as possible to the visible evidence.',
  'Place the product alone on a clean white or very light neutral background.',
  'No human, no ear, no earlobe, no skin, no face, no hair, no hand, no neck, no body, no wearing context.',
  'No display stand, no props, no mannequin, no text, no logo, no watermark.',
  'High fidelity to the original product only.',
].join('\n')

function mimeForImage(filePath: string) {
  const ext = extname(filePath).toLowerCase()
  if (ext === '.png') return 'image/png'
  if (ext === '.webp') return 'image/webp'
  return 'image/jpeg'
}

async function imageDataUrl(filePath: string) {
  const buf = await readFile(filePath)
  return `data:${mimeForImage(filePath)};base64,${buf.toString('base64')}`
}

async function auditSanitizedImagePureProduct(imagePath: string) {
  const credentials = await cloneRepo.getCredentials()
  const apiKey = String(credentials.grsaiApiKey || '').trim()
  const host = String(credentials.grsaiHost || 'https://grsaiapi.com').trim().replace(/\/+$/, '') || 'https://grsaiapi.com'
  const model = String(credentials.grsaiAnalysisModel || 'gemini-3.1-pro').trim() || 'gemini-3.1-pro'
  if (!apiKey) {
    return {
      passed: true,
      note: 'Skipped pure-product audit because GRS.AI analysis credentials are unavailable.',
    }
  }

  const content: any[] = [
    {
      type: 'text',
      text: [
        'You are validating whether this image is a pure product-only e-commerce reference.',
        'Reject the image if it contains any human residue or wearing context.',
        'Human residue includes: ear, earlobe, skin, face, hair, hand, finger, neck, body, mannequin, or visible wearing context.',
        'Return JSON only with this shape:',
        '{"passed":true,"containsHumanResidue":false,"residueTypes":[],"note":""}',
      ].join('\n'),
    },
    {
      type: 'image_url',
      image_url: { url: await imageDataUrl(imagePath) },
    },
  ]

  const res = await fetch(`${host}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      stream: false,
      temperature: 0,
      messages: [
        { role: 'system', content: 'You are a strict JSON-only product image validator.' },
        { role: 'user', content },
      ],
    }),
  })
  const text = await res.text()
  if (!res.ok) {
    const lowered = String(text || '').toLowerCase()
    if (lowered.includes('model not register')) {
      throw new Error('白底校验模型配置无效：当前对话模型未注册，请在设置中改为可用模型（例如 gemini-3.1-pro）后重试。')
    }
    throw new Error(`白底校验请求失败（HTTP ${res.status}），请稍后重试。`)
  }
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) {
    throw new Error(`Pure-product audit returned invalid JSON: ${text.slice(0, 240)}`)
  }
  const parsed = JSON.parse(match[0])
  const containsHumanResidue = Boolean(parsed?.containsHumanResidue)
  const passed = Boolean(parsed?.passed) && !containsHumanResidue
  const residueTypes = Array.isArray(parsed?.residueTypes) ? parsed.residueTypes.map((item: unknown) => String(item || '').trim()).filter(Boolean) : []
  const note = String(parsed?.note || '').trim()
  return {
    passed,
    note:
      note ||
      (passed
        ? 'Pure product audit passed.'
        : `Pure product audit failed${residueTypes.length ? `: ${residueTypes.join(', ')}` : ': human residue detected'}.`),
  }
}

export async function auditDirectProductWhiteBackgroundImage(imagePath: string) {
  const credentials = await cloneRepo.getCredentials()
  const apiKey = String(credentials.grsaiApiKey || '').trim()
  const host = String(credentials.grsaiHost || 'https://grsaiapi.com').trim().replace(/\/+$/, '') || 'https://grsaiapi.com'
  const model = String(credentials.grsaiAnalysisModel || 'gemini-3.1-pro').trim() || 'gemini-3.1-pro'
  if (!apiKey) {
    return {
      passed: false,
      note: 'Skipped direct white-background audit because GRS.AI analysis credentials are unavailable.',
    }
  }

  const content: any[] = [
    {
      type: 'text',
      text: [
        'You are validating whether this image can be used directly as a product canonical source.',
        'Pass only if all conditions are true:',
        '1. The image contains only the product, with no human residue or wearing context.',
        '2. The background is pure white or very light neutral studio white.',
        '3. The product is fully visible and readable as a clean ecommerce product image.',
        'Reject if there is ear, skin, face, hair, hand, neck, body, mannequin, prop, clutter, or obvious non-white lifestyle background.',
        'Return JSON only with this shape:',
        '{"passed":true,"containsHumanResidue":false,"isWhiteBackground":true,"isCleanProductShot":true,"note":""}',
      ].join('\n'),
    },
    {
      type: 'image_url',
      image_url: { url: await imageDataUrl(imagePath) },
    },
  ]

  const res = await fetch(`${host}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      stream: false,
      temperature: 0,
      messages: [
        { role: 'system', content: 'You are a strict JSON-only ecommerce product image validator.' },
        { role: 'user', content },
      ],
    }),
  })
  const text = await res.text()
  if (!res.ok) {
    const lowered = String(text || '').toLowerCase()
    if (lowered.includes('model not register')) {
      throw new Error('白底校验模型配置无效：当前对话模型未注册，请在设置中改为可用模型（例如 gemini-3.1-pro）后重试。')
    }
    throw new Error(`白底校验请求失败（HTTP ${res.status}），请稍后重试。`)
  }
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) {
    throw new Error(`Direct product audit returned invalid JSON: ${text.slice(0, 240)}`)
  }
  const parsed = JSON.parse(match[0])
  const passed =
    Boolean(parsed?.passed) &&
    !Boolean(parsed?.containsHumanResidue) &&
    Boolean(parsed?.isWhiteBackground) &&
    Boolean(parsed?.isCleanProductShot)
  const note = String(parsed?.note || '').trim()
  return {
    passed,
    note:
      note ||
      (passed
        ? 'Direct white-background product audit passed.'
        : 'Direct white-background product audit failed.'),
  }
}

export function getProductCanonicalSourcePrompt() {
  return PRODUCT_CANONICAL_SOURCE_PROMPT
}

function sanitizerOutputDir(projectId: string, outDir?: string) {
  return outDir ? outDir : join(getAppPaths().tmpDir, 'clone-product-canonical-source', projectId)
}

function normalizeOriginals(paths: string[]) {
  return paths.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 1)
}

async function sanitizeOneImage(input: {
  cloneProjectId: string
  productType: CloneProductType
  originalPath: string
  outDir?: string
  index: number
}) {
  const credentials = await cloneRepo.getCredentials()
  const targetDir = sanitizerOutputDir(input.cloneProjectId, input.outDir)
  await mkdir(targetDir, { recursive: true })
  const originalName = basename(input.originalPath, extname(input.originalPath)) || `product_${input.index + 1}`
  const canonicalPath = await generateGptShotFrameImage({
    credentials,
    outDir: targetDir,
    filePrefix: `${originalName}_canonical_source`,
    prompt: PRODUCT_CANONICAL_SOURCE_PROMPT,
    negativePrompt: [
      'human',
      'person',
      'ear',
      'earlobe',
      'skin',
      'face',
      'hair',
      'hand',
      'neck',
      'body',
      'wearing context',
      'mannequin',
      'display stand',
      'props',
      'model',
      'presenter',
      'extra product parts',
      'invented backside',
      'hallucinated detail',
      'generic replacement',
      'redesign',
      'shape change',
      'wrong geometry',
      'wrong thickness',
      'wrong material',
      'wrong color',
      'wrong proportions',
      'cgi',
      '3d render',
      'illustration',
      'text',
      'logo',
      'watermark',
      'background clutter',
    ].join(', '),
    imagePaths: [input.originalPath],
    normalizeOutput: 'preserve',
  })
  const audit = await auditSanitizedImagePureProduct(canonicalPath)
  return {
    canonicalPath,
    prompt: PRODUCT_CANONICAL_SOURCE_PROMPT,
    auditPassed: audit.passed,
    auditNote: audit.note,
  }
}

export async function sanitizeProductReferenceImages(input: {
  cloneProjectId: string
  productType: CloneProductType
  originalPaths: string[]
  outDir: string
}) {
  const originals = normalizeOriginals(input.originalPaths)
  if (!originals.length) {
    return {
      sanitizedPaths: [],
      failed: [],
      diagnostics: [],
    } satisfies ProductImageSanitizationResult
  }

  const sanitizedPaths: string[] = []
  const failed: string[] = []
  const diagnostics: ProductImageSanitizationDiagnostic[] = []

  for (const [index, originalPath] of originals.entries()) {
    try {
      const { canonicalPath, prompt, auditNote, auditPassed } = await sanitizeOneImage({
        cloneProjectId: input.cloneProjectId,
        productType: input.productType,
        originalPath,
        outDir: input.outDir,
        index,
      })
      sanitizedPaths.push(canonicalPath)
      diagnostics.push({
        originalPath,
        sanitizedPath: canonicalPath,
        status: 'sanitized',
        note: auditPassed
          ? auditNote || 'Product Canonical Source generated successfully'
          : `Pure product audit warning: ${auditNote || 'human residue may still exist in the generated canonical image'}`,
        prompt,
        fallbackToOriginal: false,
      })
    } catch (error: any) {
      failed.push(originalPath)
      diagnostics.push({
        originalPath,
        status: 'failed',
        note: String(error?.message ?? error ?? 'Product Canonical Source generation failed'),
        prompt: PRODUCT_CANONICAL_SOURCE_PROMPT,
        fallbackToOriginal: true,
      })
    }
  }

  return {
    sanitizedPaths,
    failed,
    diagnostics,
  } satisfies ProductImageSanitizationResult
}
