import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { runFfmpeg } from '../ffmpeg/runner'
import { createGrsImageTask, isPublicHttpUrl, requireGrsKey, waitGrsResult } from './grsai'
import { toPublicUrlViaQiniu } from './qiniu'
import { downloadAtlasToBuffer, getAtlasJson, pickAtlasOutputUrl, postAtlasJson, uploadAtlasMedia } from './atlasRetry'
import { generateImage as generateApifoxImage } from './unifiedImage'
import type { CloneProductType, ImageProviderName, ModelCredentials, ModelIdentityPack, ShotSpec } from './types'
import { buildReferenceLockText, buildShotScriptConstraintText } from './prompt'

type GenerateImageInput = {
  credentials: ModelCredentials
  prompt: string
  imagePaths?: string[]
  outDir: string
  filePrefix: string
  normalizeOutput?: 'vertical_9_16' | 'preserve'
}

const OPENAI_IMAGE_URL = 'https://api.openai.com/v1/images/generations'
const OPENAI_IMAGE_EDIT_URL = 'https://api.openai.com/v1/images/edits'
const ATLASCLOUD_IMAGE_HOST = 'https://api.atlascloud.ai'

function imageModel(credentials: ModelCredentials) {
  return String(credentials.openaiImageModel || '').trim() || 'gpt-image-2'
}

function imageProvider(credentials: ModelCredentials): ImageProviderName {
  if (credentials.imageProviderPrimary === 'kling' || credentials.imageProviderPrimary === 'grsai' || credentials.imageProviderPrimary === 'apifox_hub') {
    return credentials.imageProviderPrimary
  }
  return 'openai'
}

function klingImageModel(credentials: ModelCredentials) {
  return String(credentials.klingImageModel || '').trim() || 'openai/gpt-image-1/edit'
}

function grsImageModel(credentials: ModelCredentials) {
  return String(credentials.grsaiImageModel || '').trim() || 'gpt-image-2'
}

function cleanHost(v: string | undefined, fallback: string) {
  return String(v || fallback).replace(/\/+$/, '')
}

function atlasImageHost(credentials: ModelCredentials) {
  const host = cleanHost(credentials.klingHost, ATLASCLOUD_IMAGE_HOST)
  if (!host || /kling3api\.com/i.test(host)) return ATLASCLOUD_IMAGE_HOST
  return host
}

function imageQuality(credentials: ModelCredentials) {
  const q = String(credentials.openaiImageQuality || 'high')
  return q === 'low' || q === 'medium' || q === 'high' ? q : 'high'
}

function mimeByPath(filePath: string) {
  const ext = extname(String(filePath || '').toLowerCase())
  if (ext === '.png') return 'image/png'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  return 'application/octet-stream'
}

function requireOpenAiKey(credentials: ModelCredentials) {
  const key = String(credentials.openaiApiKey || '').trim()
  if (!key) throw new Error('OpenAI API Key is required for image generation')
  return key
}

function requireKlingKey(credentials: ModelCredentials) {
  const key = String(credentials.klingApiKey || '').trim()
  if (!key) throw new Error('Kling API Key is required for image generation')
  return key
}

async function ensureGrsPublicRefs(credentials: ModelCredentials, paths: string[] | undefined) {
  const refs = (paths ?? []).map((x) => String(x || '').trim()).filter(Boolean)
  const urls: string[] = []
  for (const ref of refs.slice(0, 8)) {
    urls.push(isPublicHttpUrl(ref) ? ref : await toPublicUrlViaQiniu(credentials, ref, 'grsai-input/images'))
  }
  return urls
}

async function normalizeToVerticalPng(input: string, output: string) {
  await runFfmpeg({
    args: [
      '-y',
      '-i',
      input,
      '-frames:v',
      '1',
      '-vf',
      'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,format=rgba',
      output,
    ],
  })
}

function pickTaskId(json: any) {
  return String(json?.taskId ?? json?.task_id ?? json?.id ?? json?.data?.task_id ?? json?.data?.taskId ?? json?.data?.id ?? '').trim()
}

function pickStatus(json: any) {
  return String(json?.status ?? json?.data?.status ?? json?.task?.status ?? '').toLowerCase()
}

function pickError(json: any) {
  const err = json?.error ?? json?.data?.error
  if (typeof err === 'string') return err.trim()
  if (err && typeof err === 'object') return [err.code, err.message].filter(Boolean).map(String).join(': ').trim()
  return String(json?.error_message ?? json?.data?.error_message ?? json?.message ?? '').trim()
}

async function saveOpenAiImageResult(data: any, outDir: string, filePrefix: string) {
  await mkdir(outDir, { recursive: true })
  const item = data?.data?.[0]
  if (!item) throw new Error('OpenAI image response is empty')
  const rawPath = join(outDir, `${filePrefix}_raw_${Date.now()}_${randomUUID()}.png`)
  if (item.b64_json) {
    await writeFile(rawPath, Buffer.from(String(item.b64_json), 'base64'))
  } else if (item.url) {
    await writeFile(rawPath, await downloadAtlasToBuffer(String(item.url), 'OpenAI 图片下载'))
  } else {
    throw new Error('OpenAI image error')
  }
  return rawPath
}

async function saveImageUrl(url: string, outDir: string, filePrefix: string) {
  await mkdir(outDir, { recursive: true })
  const rawPath = join(outDir, `${filePrefix}_raw_${Date.now()}_${randomUUID()}.png`)
  await writeFile(rawPath, await downloadAtlasToBuffer(url, '图片下载'))
  return rawPath
}

async function finalizeImageOutput(input: {
  rawPath: string
  outDir: string
  filePrefix: string
  normalizeOutput?: 'vertical_9_16' | 'preserve'
}) {
  if (input.normalizeOutput === 'preserve') {
    const finalPath = join(input.outDir, `${input.filePrefix}_${Date.now()}_${randomUUID()}.png`)
    await writeFile(finalPath, await readFile(input.rawPath))
    return finalPath
  }
  const finalPath = join(input.outDir, `${input.filePrefix}_${Date.now()}_${randomUUID()}.png`)
  await normalizeToVerticalPng(input.rawPath, finalPath)
  return finalPath
}

async function postJsonImage(input: GenerateImageInput) {
  const key = requireOpenAiKey(input.credentials)
  const res = await fetch(OPENAI_IMAGE_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: imageModel(input.credentials),
      prompt: input.prompt,
      quality: imageQuality(input.credentials),
      size: '1024x1536',
      n: 1,
    }),
  })
  const text = await res.text()
  let data: any = null
  try {
    data = JSON.parse(text)
  } catch {
    data = { raw: text }
  }
  if (!res.ok) {
    const message = data?.error?.message || text || res.statusText
    throw new Error(`OpenAI image generation failed: HTTP ${res.status} ${message}`)
  }
  const rawPath = await saveOpenAiImageResult(data, input.outDir, input.filePrefix)
  return await finalizeImageOutput({
    rawPath,
    outDir: input.outDir,
    filePrefix: input.filePrefix,
    normalizeOutput: input.normalizeOutput,
  })
}

async function postEditImage(input: GenerateImageInput) {
  const refs = (input.imagePaths ?? []).filter((p) => p && existsSync(p))
  if (!refs.length) return await postJsonImage(input)
  const key = requireOpenAiKey(input.credentials)
  const form = new FormData()
  form.set('model', imageModel(input.credentials))
  form.set('prompt', input.prompt)
  form.set('quality', imageQuality(input.credentials))
  form.set('size', '1024x1536')
  for (const ref of refs.slice(0, 8)) {
    const buf = await readFile(ref)
    form.append('image[]', new Blob([buf], { type: mimeByPath(ref) }), basename(ref))
  }
  const res = await fetch(OPENAI_IMAGE_EDIT_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  })
  const text = await res.text()
  let data: any = null
  try {
    data = JSON.parse(text)
  } catch {
    data = { raw: text }
  }
  if (!res.ok) {
    const message = data?.error?.message || text || res.statusText
    throw new Error(`OpenAI image edit failed: HTTP ${res.status} ${message}`)
  }
  const rawPath = await saveOpenAiImageResult(data, input.outDir, input.filePrefix)
  return await finalizeImageOutput({
    rawPath,
    outDir: input.outDir,
    filePrefix: input.filePrefix,
    normalizeOutput: input.normalizeOutput,
  })
}

async function waitKlingImageOutput(key: string, host: string, taskId: string, timeoutMs = 10 * 60 * 1000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const json = await getAtlasJson(`${host}/api/v1/model/prediction/${encodeURIComponent(taskId)}`, key, `AtlasCloud 查询图片任务 ${taskId}`)
    const status = pickStatus(json)
    const outputUrl = pickAtlasOutputUrl(json)
    if ((status === 'success' || status === 'succeeded' || status === 'completed' || status === 'done') && outputUrl) return outputUrl
    if (outputUrl && !status) return outputUrl
    if (status === 'fail' || status === 'failed' || status === 'error') throw new Error(pickError(json) || JSON.stringify(json))
    await new Promise((r) => setTimeout(r, 3000))
  }
  throw new Error('Kling image task timeout')
}

async function postKlingImage(input: GenerateImageInput) {
  const key = requireKlingKey(input.credentials)
  const host = atlasImageHost(input.credentials)
  const refs = (input.imagePaths ?? []).filter((p) => p && existsSync(p))
  const images = await Promise.all(refs.slice(0, 8).map((ref) => uploadAtlasMedia({ key, host, filePath: ref, kind: 'image', label: 'AtlasCloud 上传参考图' })))
  const body = {
    model: klingImageModel(input.credentials),
    enable_base64_output: false,
    enable_sync_mode: false,
    images,
    input_fidelity: 'high',
    output_format: 'jpeg',
    prompt: input.prompt,
    quality: imageQuality(input.credentials),
    size: '1024x1536',
  }
  const json = await postAtlasJson(`${host}/api/v1/model/generateImage`, key, body, 'AtlasCloud 提交图片任务')
  const directUrl = pickAtlasOutputUrl(json)
  const outputUrl = directUrl || (pickTaskId(json) ? await waitKlingImageOutput(key, host, pickTaskId(json)) : '')
  if (!outputUrl) throw new Error(`AtlasCloud image response missing output URL or prediction id: ${JSON.stringify(json)}`)
  const rawPath = await saveImageUrl(outputUrl, input.outDir, input.filePrefix)
  return await finalizeImageOutput({
    rawPath,
    outDir: input.outDir,
    filePrefix: input.filePrefix,
    normalizeOutput: input.normalizeOutput,
  })
}

async function postGrsImage(input: GenerateImageInput) {
  requireGrsKey(input.credentials)
  const urls = await ensureGrsPublicRefs(input.credentials, input.imagePaths)
  const created = await createGrsImageTask({
    credentials: input.credentials,
    prompt: input.prompt,
    urls,
  })
  const outputUrl = created.directUrl || (created.taskId ? (await waitGrsResult(input.credentials, created.taskId)).outputUrl : '')
  if (!outputUrl) throw new Error(`GRS.AI 图片任务没有返回输出 URL: ${JSON.stringify(created.raw)}`)
  const rawPath = await saveImageUrl(outputUrl, input.outDir, input.filePrefix)
  return await finalizeImageOutput({
    rawPath,
    outDir: input.outDir,
    filePrefix: input.filePrefix,
    normalizeOutput: input.normalizeOutput,
  })
}

async function generateProviderImage(input: GenerateImageInput) {
  const provider = imageProvider(input.credentials)
  if (provider === 'apifox_hub') {
    return (await generateApifoxImage({
      credentials: input.credentials,
      prompt: input.prompt,
      outDir: input.outDir,
      filePrefix: input.filePrefix,
      capability: input.imagePaths?.length ? 'image_edit' : 'image_generate',
    })).outputPath
  }
  if (provider === 'kling') return await postKlingImage(input)
  if (provider === 'grsai') return await postGrsImage(input)
  return await postEditImage(input)
}

export function defaultModelIdentityDescription(productType: CloneProductType) {
  if (productType === 'earrings') {
    return {
      market: 'Southeast Asian market',
      gender: 'female',
      ageRange: '20-28',
      hairStyle: 'natural dark hair tucked behind one ear',
      skinTone: 'natural warm skin tone',
      outfitStyle: 'minimal light-colored top, clean beauty e-commerce style',
      mood: 'calm confident friendly, subtle smile',
      sceneStyle: 'soft daylight, clean background with gentle greenery or neutral wall',
    }
  }
  if (productType === 'clothes') {
    return {
      market: 'Southeast Asian market',
      gender: 'female',
      ageRange: '20-30',
      hairStyle: 'natural dark hair, tidy styling',
      skinTone: 'natural warm skin tone',
      outfitStyle: 'simple styling that does not compete with the product clothing',
      mood: 'relaxed confident lifestyle feeling',
      sceneStyle: 'soft daylight fitting-room or clean home setting',
    }
  }
  return {
    market: 'Southeast Asian market',
    gender: 'female',
    ageRange: '20-30',
    hairStyle: 'natural dark hair',
    skinTone: 'natural warm skin tone',
    outfitStyle: 'clean casual outfit',
    mood: 'friendly natural social-commerce model',
    sceneStyle: 'soft daylight clean product demo setting',
  }
}

export function buildIdentityPackPrompt(input: {
  productType: CloneProductType
  productPoints?: string
  profile: ReturnType<typeof defaultModelIdentityDescription>
}) {
  const p = input.profile
  return [
    'Create one realistic reference image for a new virtual model identity package for short-form social commerce videos.',
    'The model must be a new person and must not copy any person from the reference video.',
    `Market: ${p.market}. Gender: ${p.gender}. Age range: ${p.ageRange}.`,
    `Hair: ${p.hairStyle}. Skin tone: ${p.skinTone}. Outfit: ${p.outfitStyle}.`,
    `Mood: ${p.mood}. Scene: ${p.sceneStyle}.`,
    `Product category: ${input.productType}. Product selling points: ${input.productPoints || 'realistic product texture and clean usage value'}.`,
    'Show the model in a practical product-commerce reference pose. Keep face, outfit, lighting and scene style stable and reusable.',
    'No text, no subtitles, no watermark, no logo, no UI overlay, no random letters.',
    'Realistic smartphone photo style, natural skin texture, clean commercial composition.',
  ].join('\n')
}

function productLock(productType: CloneProductType) {
  const common =
    'The product must match the user reference product images exactly: same color, shape, material, pattern, holes, pins, layout and decorative details. Do not add logo or redesign the product.'
  if (productType === 'earrings') return `${common} Earrings must keep the same dangling structure, metal texture, pearls or zircon details if any.`
  if (productType === 'phone_case') return `${common} Phone case camera hole, border and printed pattern must remain identical.`
  if (productType === 'clothes') return `${common} Clothing cut, fabric, collar, sleeves and pattern must remain identical.`
  return common
}

function identityText(pack: ModelIdentityPack) {
  return [
    `Use the same new virtual model: ${pack.description || ''}`,
    `Market ${pack.market}, ${pack.gender}, age ${pack.ageRange}, ${pack.hairStyle}, ${pack.skinTone}.`,
    `Outfit ${pack.outfitStyle}. Mood ${pack.mood}. Scene style ${pack.sceneStyle}.`,
    'This is a new model identity. Do not copy the original reference video person, face, identity, account or watermark.',
  ].join(' ')
}

export function buildGptFramePrompt(input: {
  shot: ShotSpec
  productType: CloneProductType
  modelPack: ModelIdentityPack
  productPoints?: string
  which: 'start' | 'end'
}) {
  const shot = input.shot
  const isEnd = input.which === 'end'
  const referenceLock = buildReferenceLockText(shot, input.modelPack.sceneStyle || 'reference shot scene atmosphere')
  const scriptLock = buildShotScriptConstraintText(shot)
  return [
    isEnd
      ? `Generate the ending keyframe for shot ${shot.index + 1}. It must be a small continuation from the provided GPT start frame.`
      : `Generate the opening keyframe for shot ${shot.index + 1}.`,
    identityText(input.modelPack),
    scriptLock,
    referenceLock,
    productLock(input.productType),
    `Reference shot translation: ${String(shot.visualPrompt || shot.visual || 'use only composition, framing, action rhythm and camera grammar from the reference shot').trim()}.`,
    `Shot role: ${String(shot.role || shot.purpose || 'product demo')}. Duration target: ${Number(shot.durationSec || 3).toFixed(1)} seconds.`,
    `Camera motion target: ${String(shot.motion || 'static')}. Keep changes restrained and realistic.`,
    isEnd
      ? 'The ending frame must keep the same new model, same product, same outfit, same location, same lighting, same emotion and same camera setup as the provided start frame. Only allow subtle hand, expression or camera-position continuation.'
      : 'Keep the original shot background category, composition, body pose, hand placement and product demonstration action. Replace only the person identity with the new virtual model and replace only the product with the user product.',
    `Product selling points: ${input.productPoints || shot.materialNeed || 'clear product texture and usage value'}.`,
    'No text, no subtitles, no watermark, no logo, no UI overlay, no random letters, no platform controls.',
    'Realistic smartphone TikTok social-commerce style, natural skin texture, natural hands, clean background, product sharp and clearly visible.',
  ].join('\n')
}

export async function generateModelIdentityPackImages(input: {
  credentials: ModelCredentials
  outDir: string
  productType: CloneProductType
  productPoints?: string
  productReferenceImagePaths: string[]
  onImageGenerated?: (filePath: string, index: number) => Promise<void> | void
}) {
  const profile = defaultModelIdentityDescription(input.productType)
  const prompts = [
    'clean white background front portrait, neutral expression',
    'clean white background left three-quarter portrait',
    'clean white background right three-quarter portrait',
    'side profile with clear ear, hair not covering product area',
    'half-body lifestyle reference, natural posture',
    'hands and fingers reference for holding or wearing the product',
    'close-up product wearing area reference, skin texture natural',
    'TikTok UGC indoor lifestyle reference, natural light',
    'product interaction reference, realistic handheld smartphone style',
  ]
  const imagePaths: string[] = []
  for (let i = 0; i < prompts.length; i++) {
    const prompt = `${buildIdentityPackPrompt({ productType: input.productType, productPoints: input.productPoints, profile })}\nReference angle: ${prompts[i]}.`
    const path = await generateProviderImage({
      credentials: input.credentials,
      prompt,
      imagePaths: input.productReferenceImagePaths,
      outDir: input.outDir,
      filePrefix: `model_identity_${i + 1}`,
    })
    imagePaths.push(path)
    await input.onImageGenerated?.(path, i)
  }
  const provider = imageProvider(input.credentials)
  const model = provider === 'kling' ? klingImageModel(input.credentials) : provider === 'grsai' ? grsImageModel(input.credentials) : imageModel(input.credentials)
  return { profile, imagePaths, model }
}

export async function generateGptShotFrameImage(input: {
  credentials: ModelCredentials
  prompt: string
  outDir: string
  filePrefix: string
  imagePaths: string[]
  normalizeOutput?: 'vertical_9_16' | 'preserve'
}) {
  return await generateProviderImage(input)
}
