import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { runFfmpeg } from '../ffmpeg/runner'
import { createGrsImageTask, isPublicHttpUrl, requireGrsKey, waitGrsResult } from './grsai'
import { toPublicUrlViaQiniu } from './qiniu'
import { downloadAtlasToBuffer, getAtlasJson, pickAtlasOutputUrl, postAtlasJson, uploadAtlasMedia } from './atlasRetry'
import { resolveApifoxHubCredentials } from './apifoxProfile'
import { generateImage as generateApifoxImage } from './unifiedImage'
import type { CloneProductType, ImageProviderName, ModelCredentials, ModelIdentityPack, ShotSpec } from './types'
import type { ModelProfileOptions } from './types'
import {
  getModelProfileOptionPrompt,
  getRecommendedModelProfileOptions,
  type ModelProfileOptionValue,
} from '../../../shared/modelProfileOptions'
import {
  buildShotAntiGlowPromptBlock,
  buildFailInsteadRuleText,
  buildFrameContinuityLockText,
  buildHumanPriorityRuleText,
  buildJewelryLightEffectBanText,
  buildNoSpeakingInstruction,
  buildNoSubstituteRuleText,
  buildReferenceImageLockText,
  buildReferenceLockText,
  buildShotScriptConstraintText,
  prependSilentCommercialGlobalRule,
  sanitizeGeneratedVideoPrompt,
} from './prompt'
import { canUseMockGeneration } from './mockPolicy'

type GenerateImageInput = {
  credentials: ModelCredentials
  prompt: string
  negativePrompt?: string
  imagePaths?: string[]
  outDir: string
  filePrefix: string
  normalizeOutput?: 'vertical_9_16' | 'preserve'
  outputSize?: string
}

function inferAspectRatioFromOutputSize(outputSize: string | undefined): '1:1' | '9:16' | '16:9' {
  const value = String(outputSize || '').trim().toLowerCase()
  const match = value.match(/^(\d+)\s*x\s*(\d+)$/)
  if (!match) return '9:16'
  const width = Number(match[1])
  const height = Number(match[2])
  if (!width || !height) return '9:16'
  if (width === height) return '1:1'
  return width > height ? '16:9' : '9:16'
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

function hasProviderCredential(credentials: ModelCredentials, provider: ImageProviderName) {
  if (provider === 'kling') return Boolean(String(credentials.klingApiKey || '').trim())
  if (provider === 'grsai') return Boolean(String(credentials.grsaiApiKey || '').trim())
  if (provider === 'apifox_hub') return Boolean(String(resolveApifoxHubCredentials(credentials, 'image')?.apiKey || '').trim())
  return Boolean(String(credentials.openaiApiKey || '').trim())
}

function imageProviderCandidates(credentials: ModelCredentials): ImageProviderName[] {
  const preferred = imageProvider(credentials)
  const fallbackOrder: ImageProviderName[] = ['apifox_hub', 'openai', 'kling', 'grsai']
  const out: ImageProviderName[] = []
  for (const provider of [preferred, ...fallbackOrder]) {
    if (out.includes(provider)) continue
    if (!hasProviderCredential(credentials, provider)) continue
    out.push(provider)
  }
  return out
}

function withImageProvider(credentials: ModelCredentials, provider: ImageProviderName): ModelCredentials {
  if (provider === 'openai') {
    return {
      ...credentials,
      imageProviderPrimary: 'openai',
    }
  }
  return {
    ...credentials,
    imageProviderPrimary: provider,
  }
}

function isRetryableImageProviderError(error: unknown) {
  const message = String((error as any)?.message ?? error ?? '').toLowerCase()
  return (
    message.includes('连接超时') ||
    message.includes('task timeout') ||
    message.includes('fetch failed') ||
    message.includes('无法访问') ||
    message.includes('connection') ||
    message.includes('timeout')
  )
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
      size: String(input.outputSize || '1024x1536'),
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
  form.set('size', String(input.outputSize || '1024x1536'))
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
    negative_prompt: String(input.negativePrompt || '').trim() || undefined,
    quality: imageQuality(input.credentials),
    size: String(input.outputSize || '1024x1536'),
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
    negativePrompt: input.negativePrompt,
    aspectRatio: inferAspectRatioFromOutputSize(input.outputSize),
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
  const providers = imageProviderCandidates(input.credentials)
  if (!providers.length) {
    return await postEditImage(input)
  }
  const errors: string[] = []
  for (let index = 0; index < providers.length; index += 1) {
    const provider = providers[index]
    const scopedInput = {
      ...input,
      credentials: withImageProvider(input.credentials, provider),
    }
    try {
      if (provider === 'apifox_hub') {
        return (await generateApifoxImage({
          credentials: scopedInput.credentials,
          prompt: scopedInput.prompt,
          negativePrompt: scopedInput.negativePrompt,
          imagePaths: scopedInput.imagePaths,
          outDir: scopedInput.outDir,
          filePrefix: scopedInput.filePrefix,
          capability: scopedInput.imagePaths?.length ? 'image_edit' : 'image_generate',
        })).outputPath
      }
      if (provider === 'kling') return await postKlingImage(scopedInput)
      if (provider === 'grsai') return await postGrsImage(scopedInput)
      return await postEditImage(scopedInput)
    } catch (error: any) {
      const text = String(error?.message ?? error ?? '').trim() || 'unknown error'
      errors.push(`${provider}: ${text}`)
      const isLast = index >= providers.length - 1
      if (!isRetryableImageProviderError(error) || isLast) {
        throw new Error(errors.join(' | '))
      }
    }
  }
  throw new Error(errors.join(' | ') || '图片生成失败')
}

async function buildMockImageFromReference(input: GenerateImageInput) {
  await mkdir(input.outDir, { recursive: true })
  const refs = (input.imagePaths ?? []).map((item) => String(item || '').trim()).filter(Boolean)
  const source = refs.find((item) => existsSync(item))
  if (!source) {
    throw new Error('缺少可用参考图，无法生成本地测试图片')
  }
  const ext = extname(source).toLowerCase() || '.png'
  const rawPath = join(input.outDir, `${input.filePrefix}_mock_raw_${Date.now()}_${randomUUID()}${ext}`)
  await copyFile(source, rawPath)
  return await finalizeImageOutput({
    rawPath,
    outDir: input.outDir,
    filePrefix: `${input.filePrefix}_mock`,
    normalizeOutput: input.normalizeOutput,
  })
}

export function defaultModelIdentityDescription(productType: CloneProductType, genderHint?: 'female' | 'male') {
  const gender = genderHint === 'male' ? 'male' : 'female'
  if (gender === 'male') {
    if (productType === 'earrings') {
      return {
        market: 'Global social-commerce market',
        gender: 'male',
        ageRange: '20-30',
        faceShape: 'defined face shape',
        hairStyle: 'hair tied back or tucked cleanly away from product area',
        hairColor: 'natural dark black hair color',
        skinTone: 'healthy neutral skin tone',
        bodyType: 'balanced natural build',
        outfitStyle: 'minimal clean outfit that does not compete with the product',
        mood: 'calm confident expression',
        sceneStyle: 'real indoor environment with depth, soft natural lighting, subtle background blur, neutral lifestyle setting such as bedroom, dressing area, or minimal apartment corner',
        languageStyle: 'Chinese-speaking social-commerce expression style',
        cameraPresence: 'close-up product-led camera presence',
        styleBias: 'wearing demonstration focus',
      }
    }
    if (productType === 'clothes') {
      return {
        market: 'Global social-commerce market',
        gender: 'male',
        ageRange: '20-30',
        faceShape: 'defined face shape',
        hairStyle: 'natural straight hair',
        hairColor: 'natural dark black hair color',
        skinTone: 'healthy neutral skin tone',
        bodyType: 'balanced natural build',
        outfitStyle: 'refined commute outfit',
        mood: 'calm confident expression',
        sceneStyle: 'light retail lifestyle environment',
        languageStyle: 'Chinese-speaking social-commerce expression style',
        cameraPresence: 'natural social-commerce camera presence',
        styleBias: 'styling and look focus',
      }
    }
    return {
      market: 'Global social-commerce market',
      gender: 'male',
      ageRange: '20-30',
      faceShape: 'defined face shape',
      hairStyle: 'natural straight hair',
      hairColor: 'natural dark black hair color',
      skinTone: 'healthy neutral skin tone',
      bodyType: 'balanced natural build',
      outfitStyle: 'clean casual outfit',
      mood: 'calm confident expression',
      sceneStyle: 'soft daylight clean product demo setting',
      languageStyle: 'Chinese-speaking social-commerce expression style',
      cameraPresence: 'natural social-commerce camera presence',
      styleBias: 'conversion-focused product demo style',
    }
  }
  if (productType === 'earrings') {
    return {
      market: 'Southeast Asian market',
      gender: 'female',
      ageRange: '20-28',
      faceShape: 'oval face shape',
      hairStyle: 'natural dark hair tucked behind one ear',
      hairColor: 'natural dark black hair color',
      skinTone: 'natural warm skin tone',
      bodyType: 'petite build',
      outfitStyle: 'minimal light-colored top, clean beauty e-commerce style',
      mood: 'calm confident friendly, subtle smile',
      sceneStyle: 'soft daylight, clean background with gentle greenery or neutral wall',
      languageStyle: 'soft bilingual social-sell expression style',
      cameraPresence: 'close-up product-led camera presence',
      styleBias: 'wearing demonstration focus',
    }
  }
  if (productType === 'clothes') {
    return {
      market: 'Southeast Asian market',
      gender: 'female',
      ageRange: '20-30',
      faceShape: 'oval face shape',
      hairStyle: 'natural dark hair, tidy styling',
      hairColor: 'natural dark brown hair color',
      skinTone: 'natural warm skin tone',
      bodyType: 'balanced natural build',
      outfitStyle: 'simple styling that does not compete with the product clothing',
      mood: 'relaxed confident lifestyle feeling',
      sceneStyle: 'soft daylight fitting-room or clean home setting',
      languageStyle: 'Chinese-speaking social-commerce expression style',
      cameraPresence: 'natural social-commerce camera presence',
      styleBias: 'styling and look focus',
    }
  }
  return {
    market: 'Southeast Asian market',
    gender: 'female',
    ageRange: '20-30',
    faceShape: 'oval face shape',
    hairStyle: 'natural dark hair',
    hairColor: 'natural dark black hair color',
    skinTone: 'natural warm skin tone',
    bodyType: 'slim build',
    outfitStyle: 'clean casual outfit',
    mood: 'friendly natural social-commerce model',
    sceneStyle: 'soft daylight clean product demo setting',
    languageStyle: 'Chinese-speaking social-commerce expression style',
    cameraPresence: 'natural social-commerce camera presence',
    styleBias: 'conversion-focused product demo style',
  }
}

function recommendedMaleModelProfileOptions(productType: CloneProductType): ModelProfileOptions {
  if (productType === 'earrings') {
    return {
      market: 'global_female',
      gender: 'male',
      ageRange: '20_28',
      faceShape: 'defined',
      hairStyle: 'tied_back',
      hairColor: 'dark_black',
      skinTone: 'healthy_neutral',
      bodyType: 'balanced',
      outfitStyle: 'clean_minimal',
      mood: 'calm_confident',
      sceneStyle: 'clean_studio',
      languageStyle: 'chinese_fluent',
      cameraPresence: 'closeup_product_led',
      styleBias: 'wearing_focus',
    }
  }
  if (productType === 'clothes') {
    return {
      market: 'global_female',
      gender: 'male',
      ageRange: '25_32',
      faceShape: 'defined',
      hairStyle: 'dark_straight',
      hairColor: 'dark_black',
      skinTone: 'healthy_neutral',
      bodyType: 'balanced',
      outfitStyle: 'refined_commute',
      mood: 'calm_confident',
      sceneStyle: 'retail_lifestyle',
      languageStyle: 'chinese_fluent',
      cameraPresence: 'natural_social_commerce',
      styleBias: 'styling_focus',
    }
  }
  return {
    market: 'global_female',
    gender: 'male',
    ageRange: '25_32',
    faceShape: 'defined',
    hairStyle: 'dark_straight',
    hairColor: 'dark_black',
    skinTone: 'healthy_neutral',
    bodyType: 'balanced',
    outfitStyle: 'refined_commute',
    mood: 'calm_confident',
    sceneStyle: 'retail_lifestyle',
    languageStyle: 'chinese_fluent',
    cameraPresence: 'natural_social_commerce',
    styleBias: 'conversion_focus',
  }
}

function mergeModelIdentityProfile(productType: CloneProductType, options?: ModelProfileOptions) {
  const explicitGender = options?.gender === 'male' ? 'male' : options?.gender === 'female' ? 'female' : undefined
  const base = defaultModelIdentityDescription(productType, explicitGender)
  const femaleRecommended = getRecommendedModelProfileOptions(productType)
  const maleRecommended = recommendedMaleModelProfileOptions(productType)
  const merged = { ...(explicitGender === 'male' ? maleRecommended : femaleRecommended), ...(options ?? {}) }
  if (explicitGender === 'male') {
    for (const [key, value] of Object.entries(merged) as Array<[keyof ModelProfileOptions, ModelProfileOptionValue | undefined]>) {
      if (key === 'gender' || !value) continue
      if (value === femaleRecommended[key]) {
        merged[key] = maleRecommended[key]
      }
    }
  }
  const valueMap = new Map<keyof ModelProfileOptions, string>()
  for (const [key, value] of Object.entries(merged) as Array<[keyof ModelProfileOptions, ModelProfileOptionValue | undefined]>) {
    if (value) valueMap.set(key, getModelProfileOptionPrompt(key, value))
  }
  return {
    market: valueMap.get('market') || base.market,
    gender: valueMap.get('gender') || base.gender,
    ageRange: valueMap.get('ageRange') || base.ageRange,
    faceShape: valueMap.get('faceShape') || base.faceShape || 'oval face shape',
    hairStyle: valueMap.get('hairStyle') || base.hairStyle,
    hairColor: valueMap.get('hairColor') || base.hairColor || 'natural dark black hair color',
    skinTone: valueMap.get('skinTone') || base.skinTone,
    bodyType: valueMap.get('bodyType') || base.bodyType || 'slim build',
    outfitStyle: valueMap.get('outfitStyle') || base.outfitStyle,
    mood: valueMap.get('mood') || base.mood,
    sceneStyle: valueMap.get('sceneStyle') || base.sceneStyle,
    languageStyle: valueMap.get('languageStyle') || base.languageStyle || 'Chinese-speaking social-commerce expression style',
    cameraPresence: valueMap.get('cameraPresence') || base.cameraPresence || 'natural social-commerce camera presence',
    styleBias: valueMap.get('styleBias') || base.styleBias || 'conversion-focused product demo style',
  }
}

function buildModelIdentityDescription(profile: ReturnType<typeof defaultModelIdentityDescription>) {
  return [
    'New virtual model for this clone project',
    `${profile.market}, ${profile.gender}, ${profile.ageRange}`,
    `${profile.faceShape || 'oval face shape'}, ${profile.hairStyle}, ${profile.hairColor || 'natural dark black hair color'}`,
    `${profile.skinTone}, ${profile.bodyType || 'slim build'}`,
    `${profile.outfitStyle}, ${profile.mood}`,
    `${profile.sceneStyle}`,
    `${profile.languageStyle || 'Chinese-speaking social-commerce expression style'}`,
    `${profile.cameraPresence || 'natural social-commerce camera presence'}, ${profile.styleBias || 'conversion-focused product demo style'}`,
  ].join('. ')
}

export function buildModelIdentityPackPromptPreview(input: {
  productType: CloneProductType
  productPoints?: string
  modelProfileOptions?: ModelProfileOptions
  productReferenceImagePaths?: string[]
}) {
  const profile = mergeModelIdentityProfile(input.productType, input.modelProfileOptions)
  return {
    profile,
    description: buildModelIdentityDescription(profile),
    prompt: buildIdentityPackPrompt({
      productType: input.productType,
      productPoints: input.productPoints,
      profile,
    }),
    productType: input.productType,
    productPoints: input.productPoints || '',
    modelProfileOptions: { ...(input.modelProfileOptions ?? {}) },
    productReferenceImageCount: (input.productReferenceImagePaths ?? []).map(String).filter(Boolean).length,
    productReferenceImagePaths: (input.productReferenceImagePaths ?? []).map(String).filter(Boolean),
  }
}

export function buildIdentityPackPrompt(input: {
  productType: CloneProductType
  productPoints?: string
  profile: ReturnType<typeof defaultModelIdentityDescription>
}) {
  const p = input.profile
  const genderHardRule =
    p.gender === 'male'
      ? 'CRITICAL GENDER LOCK: male only. The model must read clearly as a real adult man. Do not generate a woman, feminine face, feminine styling, feminine body shape, or female-presenting identity.'
      : 'CRITICAL GENDER LOCK: female only. The model must read clearly as a real adult woman. Do not generate a man, masculine face, masculine styling, masculine body shape, or male-presenting identity.'
  return [
    'Create one single realistic 3x3 contact-sheet image for a new virtual model identity package for short-form social commerce videos.',
    'The model must be a new person and must not copy any person from the reference video.',
    genderHardRule,
    `Market: ${p.market}. Gender: ${p.gender}. Age range: ${p.ageRange}.`,
    `Face shape: ${p.faceShape || 'oval face shape'}. Hair: ${p.hairStyle}. Hair color: ${p.hairColor || 'natural dark black hair color'}.`,
    `Skin tone: ${p.skinTone}. Body type: ${p.bodyType || 'slim build'}. Outfit: ${p.outfitStyle}.`,
    `Mood: ${p.mood}. Scene: ${p.sceneStyle}. Language style: ${p.languageStyle || 'Chinese-speaking social-commerce expression style'}.`,
    `Camera presence: ${p.cameraPresence || 'natural social-commerce camera presence'}. Style bias: ${p.styleBias || 'conversion-focused product demo style'}.`,
    `Product category: ${input.productType}. Product selling points: ${input.productPoints || 'realistic product texture and clean usage value'}.`,
    'Output exactly one final image that contains 9 panels arranged in a clean 3x3 grid; do not output 9 separate files.',
    'Keep the same person, same identity, same outfit direction, same lighting family, and same scene style across all 9 panels.',
    'IDENTITY CONSISTENCY LOCK: all 9 panels must depict the exact same model identity, not lookalikes or identity drift.',
    'Do not change face shape, facial proportions, eye structure, nose shape, lip shape, jawline, skin tone, age impression, hairstyle, hair color, makeup direction, or body build between panels.',
    'Do not change outfit category, outfit color direction, neckline, accessory language, styling logic, or overall wardrobe identity between panels.',
    'WARDROBE COLOR LOCK: keep the same outfit color family, same fabric direction, same styling set, and same accessory intensity across all 9 panels.',
    'BACKGROUND CONSISTENCY LOCK: keep the same scene family, same background logic, same depth feeling, same light direction, and same environment mood across all 9 panels; no sudden scene switching.',
    'Only the camera angle, crop, pose, hand position, and product-interaction viewpoint may change from panel to panel.',
    'Panels should cover reusable product-commerce reference views: front portrait, left three-quarter, right three-quarter, side profile with visible wearing area, half-body lifestyle, hand interaction, close-up wearing area, indoor social-commerce lifestyle, and product interaction view.',
    'Show the model in practical product-commerce reference poses. Keep face, outfit, lighting and scene style stable and reusable.',
    'No age drift, no hairstyle swap, no makeup swap, no outfit swap, no outfit recolor, no background replacement, no scene jump, no face drift, no identity mix, and no second person.',
    'No text, no subtitles, no watermark, no logo, no UI overlay, no random letters.',
    'Realistic smartphone photo style, natural skin texture, clean commercial composition.',
  ].join('\n')
}

function productLock(productType: CloneProductType) {
  const common =
    'Product must match reference exactly: same color, shape, material, pattern, holes, pins, layout, scale, and decorative details. No logo, no redesign, no generic similar product.'
  if (productType === 'earrings') return `${common} Earrings: keep dangling structure, metal or stone details, wearing/support position, and gravity direction; no sparkle VFX or upright floating earring.`
  if (productType === 'phone_case') return `${common} Phone case: camera hole, border, and printed pattern must remain identical.`
  if (productType === 'clothes') return `${common} Clothes: cut, fabric, collar, sleeves, and pattern must remain identical.`
  return common
}

function buildLayeredReferencePriorityText(input: { isEnd: boolean }) {
  return [
    '[PRODUCT - ABSOLUTE LOCK]',
    'Use Image 1 as the product reference image and the ONLY source of truth for the product.',
    'The product is fixed and must remain 100% identical.',
    'No redesign, no replacement, no approximation.',
    'If any conflict occurs, ALWAYS follow Image 1.',
    'The product should appear as if directly copied from Image 1 into the scene.',
    '[ROLE SEPARATION]',
    'Image 1 defines product only. Image 2 defines identity only.',
    input.isEnd
      ? 'Image 3 defines continuation angle, pose, framing, action, and composition only.'
      : 'Image 3 defines pose, framing, action, and composition only.',
    '[IDENTITY]',
    'Replace only the human model using Image 2. Do not change the product from Image 1.',
    '[NO INFERENCE RULE]',
    'Do not infer or reconstruct any unseen part of the product.',
    'If part of the product is occluded or unclear, keep it consistent with the visible reference and do not guess or complete missing structure.',
    '[STRUCTURE LOCK]',
    'The product structure must remain rigid.',
    'No bending, no reshaping, and no proportion change, even under perspective or hand interaction.',
    '[STRICT RULES]',
    'Do not regenerate the product, modify the product, simplify or restyle the product, or infer product identity from Image 2 or Image 3.',
  ].join('\n')
}

function identityText(pack: ModelIdentityPack) {
  const compactBits = [
    pack.gender ? `gender ${pack.gender}` : '',
    pack.ageRange ? `age ${pack.ageRange}` : '',
    pack.hairStyle ? `hair ${pack.hairStyle}` : '',
    pack.skinTone ? `skin ${pack.skinTone}` : '',
    pack.outfitStyle ? `outfit ${pack.outfitStyle}` : '',
  ]
    .filter(Boolean)
    .join(', ')
  return [
    'Use the same new virtual model from Image 2 only.',
    compactBits ? `Minimal identity anchor: ${compactBits}.` : 'Minimal identity anchor only; do not expand the person with extra styling.',
    'Keep the person calm and neutral. Human identity is secondary to product visibility and must not become the visual subject.',
    'This is a new model identity. Do not copy the original reference video person, face, identity, account or watermark.',
  ].join(' ')
}

export function buildModelIdentityLockText(pack: ModelIdentityPack) {
  return [
    'STRICT MODEL IDENTITY LOCK: same selected model across all storyboard frames; one human model only.',
    'Use Image 2 as the only model identity source.',
    'Product references lock product only, never person identity; ignore any face, hair, skin, body, outfit, pose, or human traits from product reference images.',
    'No second model, no mixed identity, and no borrowed product-reference person.',
  ]
    .filter(Boolean)
    .join(' ')
}

export function buildReferenceResponsibilityText(input?: {
  mode?: 'storyboard_frame' | 'generic'
  isEndFrame?: boolean
}) {
  if (input?.mode === 'storyboard_frame') {
    return [
      'REFERENCE RESPONSIBILITY MAP:',
      'Image 1 is the product canonical source; use it only for product identity and structure.',
      'Image 2 is the model identity reference; use it only for the same person identity.',
      input.isEndFrame
        ? 'Image 3 is the provided start-frame continuity reference; use it only for continuity of angle, crop, composition, and scene, never product redesign.'
        : 'Image 3 is the storyboard shot reference; use it only for target angle, crop, composition, and scene layout, never product redesign.',
      'Do not use Image 1 for person identity. Do not use Image 2 to redefine the product.',
      'PRODUCT REFERENCES LOCK PRODUCT ONLY, NOT PERSON IDENTITY. Use product images only for structure, material, color, scale, and attachment details; never use the product-reference person.',
    ].join(' ')
  }
  return 'PRODUCT REFERENCES LOCK PRODUCT ONLY, NOT PERSON IDENTITY. Use product images only for structure, material, color, scale, and attachment details; never use the product-reference person.'
}

export function buildProductDescriptionLockText(productDescription?: string) {
  const text = String(productDescription || '').trim()
  if (!text) return ''
  return [
    'TEXT PRODUCT DESCRIPTION LOCK: use the latest bound-product Product DNA only for structure, material, color, geometry, placement, and scale; reference images still win on visual identity.',
    sanitizeGeneratedVideoPrompt(text, 420),
  ].join('\n')
}

function looksLikeEarringStoryboardShot(productType: CloneProductType, shot: ShotSpec, productDescription?: string) {
  const haystack = [
    productType,
    shot.visualDescription,
    shot.generationPrompt,
    shot.visualPrompt,
    shot.visual,
    shot.actionDescription,
    shot.productFocus,
    shot.materialNeed,
    productDescription,
  ]
    .map((item) => String(item || '').toLowerCase())
    .join('\n')
  return /earrings?|ear\s|earring|hoop|dangle|drop earring|stud|ear jewelry|jewelry|jewellery|zircon|silver|gold|star-shaped dangles/.test(
    haystack,
  )
}

function isWearableStoryboardShot(productType: CloneProductType, shot: ShotSpec, productDescription?: string) {
  if (looksLikeEarringStoryboardShot(productType, shot, productDescription)) return true
  const haystack = [
    productType,
    shot.visualDescription,
    shot.generationPrompt,
    shot.visualPrompt,
    shot.visual,
    shot.actionDescription,
    shot.productFocus,
    shot.materialNeed,
    productDescription,
  ]
    .map((item) => String(item || '').toLowerCase())
    .join('\n')
  return /ring|bracelet|necklace|pendant|wrist|finger|neck|clavicle|wearing|worn accessory|wear shot/.test(haystack)
}

function sanitizeCompiledFramePrompt(productType: CloneProductType, compiledPrompt?: string) {
  const text = String(compiledPrompt || '').trim()
  if (!text) return ''
  const isEarrings = /earrings?/.test(String(productType || '').trim().toLowerCase())
  if (!isEarrings) return sanitizeGeneratedVideoPrompt(text, 760)
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/TEXT PRODUCT DESCRIPTION LOCK/i.test(line))
    .filter((line) => !/^Subject:/i.test(line))
    .filter((line) => !/^Visual direction:/i.test(line))
    .filter((line) => !/camera presence|Chinese-speaking social-commerce expression style|calm confident expression|presenter|host-style|spokesperson|talking-head/i.test(line))
    .filter((line) => !/silver hoop earring|star-shaped dangles|drop earring|dangle earring/i.test(line))
  return sanitizeGeneratedVideoPrompt(lines.join('\n'), 760)
}

function buildStoryboardLockedSceneText(productType: CloneProductType, shot: ShotSpec) {
  const normalizedType = String(productType || '').trim().toLowerCase()
  if (/earrings?/.test(normalizedType)) return 'Extreme close-up of ear wearing the earring.'
  if (isWearableStoryboardShot(productType, shot)) return 'Tight wearable product crop with the product area as the visual center. Keep only the minimum body area needed to support the wearing relation.'
  return compactSceneText(
    [shot.visualDescription, shot.generationPrompt, shot.visualPrompt, shot.visual],
    'same real-world background category as the storyboard/reference shot',
  )
}

function buildStoryboardLockedActionText(productType: CloneProductType, actionDescription?: unknown) {
  const normalizedType = String(productType || '').trim().toLowerCase()
  const action = sanitizeGeneratedVideoPrompt(String(actionDescription || '').trim(), 220)
  if (/earrings?/.test(normalizedType)) {
    if (/\bfinger|touch|hand\b/i.test(action)) return 'Minimal finger interaction below the ear.'
    return 'Very subtle movement only.'
  }
  if (/ring|bracelet|necklace/.test(normalizedType)) {
    if (/\bfinger|touch|hand\b/i.test(action)) return 'Minimal product-supporting hand interaction only.'
    return 'Very subtle wearable-context movement only.'
  }
  return action || 'Natural product demonstration with believable movement.'
}

function buildStoryboardLockedProductFocusText(productType: CloneProductType) {
  const normalizedType = String(productType || '').trim().toLowerCase()
  if (/earrings?/.test(normalizedType)) {
    return 'Preserve shape, proportions, structure, connector relation, hanging direction, and ear attachment point. Keep the product close, sharp, and fully readable so small structural details remain clear. Avoid deformation or redesign.'
  }
  if (/ring|bracelet|necklace/.test(normalizedType)) {
    return 'Preserve shape, proportions, structure, attachment relation, and wearing scale. Keep the product close, sharp, and fully readable so structural details remain clear. The product must stay larger and clearer than surrounding body features.'
  }
  return 'Keep the product clearly visible and structurally stable.'
}

function buildShotControlText(input: {
  productType: CloneProductType
  shot: ShotSpec
  isEnd: boolean
}) {
  const shotType = isWearableStoryboardShot(input.productType, input.shot) ? 'Product-led demonstration' : 'Product-led commercial frame'
  const framing = isWearableStoryboardShot(input.productType, input.shot)
    ? [
        'product is the visual center',
        'occupies 40% to 60% of the frame',
        'prefer a tighter crop when needed so the product reads larger and clearer than surrounding face or body context',
        'always sharp and fully visible',
        'product details must remain crisp and immediately readable',
      ]
    : ['product remains clearly readable', 'product stays sharp and visually primary']
  const hierarchy = isWearableStoryboardShot(input.productType, input.shot) ? 'product > hands > body > face' : 'product > hands > body > background'
  const cameraMotion = sanitizeGeneratedVideoPrompt(String(input.shot.motion || input.shot.cameraMovement || 'static').trim(), 80) || 'static'
  return [
    '[SHOT CONTROL]',
    `Shot type: ${shotType}`,
    'Framing:',
    ...framing.map((item) => `- ${item}`),
    'Camera:',
    '- close-up or tighter if needed to keep the product dominant',
    `- ${cameraMotion}`,
    '- minimal movement only',
    '- no zoom-out that reduces product size or priority',
    `Hierarchy: ${hierarchy}`,
    input.isEnd ? '- ending frame must remain a direct continuation of the starting frame' : '',
  ]
    .filter(Boolean)
    .join('\n')
}

function buildFaceControlText(productType: CloneProductType, shot: ShotSpec) {
  const isEarringLike = looksLikeEarringStoryboardShot(productType, shot)
  const wearableLike = isWearableStoryboardShot(productType, shot)
  if (!wearableLike) return ''
  return [
    '[FACE CONTROL]',
    isEarringLike ? 'Do NOT show full face' : 'Do NOT use full face as the main subject',
    'No eye contact',
    isEarringLike
      ? 'Face must be cropped, off-center, secondary, or reduced to ear/jawline/neck support only'
      : 'Face must be cropped, off-center, secondary, or reduced to support context only',
    'Never let the face become the dominant visual area',
  ].join('\n')
}

function buildRestrictionsText(productType: CloneProductType, shot: ShotSpec) {
  const wearableLike = isWearableStoryboardShot(productType, shot)
  return [
    '[RESTRICTIONS]',
    'Do NOT infer unseen product parts',
    'Do NOT reconstruct hidden product structure',
    'Do NOT regenerate or redesign the product',
    wearableLike ? 'Do NOT shrink product visibility' : 'Do NOT reduce product readability',
    wearableLike ? 'Do NOT let the product become small, distant, soft, or detail-blurred' : 'Do NOT let the product become soft, distant, or detail-blurred',
    wearableLike ? 'Do NOT let the model dominate the frame' : 'Do NOT let any non-product element dominate the frame',
    'If the person conflicts with the product, adjust the person or crop, never the product',
  ].join('\n')
}

function buildOutputText() {
  return [
    '[OUTPUT]',
    'Clean studio-like or reference-aligned background',
    'Natural TikTok commercial style',
    'No text, watermark, logo, subtitles, or UI overlay',
  ].join('\n')
}

function buildDirectProductReuseLockText(productType: CloneProductType, productDescription?: string) {
  const normalizedType = String(productType || 'general').trim().toLowerCase()
  const descriptionAnchor =
    normalizedType === 'earrings' ? '' : sanitizeGeneratedVideoPrompt(String(productDescription || '').trim(), 360)
  const typeAnchor =
    normalizedType === 'earrings'
      ? 'Earring visual anchor: preserve shape, proportions, structure, connector relation, hanging direction, and ear attachment point.'
      : 'Product visual anchor: preserve exact silhouette, component count, attachment points, holes, edges, material finish, color family, proportions, and real wearing/display scale.'
  return [
    'PRODUCT VISUAL ANCHOR LOCK:',
    typeAnchor,
    descriptionAnchor ? `Anchor facts: ${descriptionAnchor}.` : '',
    'Use the Product Canonical Source as the highest-priority visual reference; match these visible features consistently instead of inventing a new design.',
    'No redesign, no simplification, no beautified variant, no merged parts, no extra decoration, no missing parts.',
  ].join(' ')
}

function isModelPresentationShot(shot: ShotSpec) {
  const role = String(shot.role || shot.shotRole || shot.purpose || '').trim().toLowerCase()
  const shotType = String(shot.shotType || '').trim().toLowerCase()
  return role === 'model_scene' || shotType === 'model_demo'
}

function buildCrossShotInstanceLock(shot: ShotSpec, modelPresentationShot: boolean) {
  return [
    'SILENT VISUAL COMMERCIAL.',
    modelPresentationShot ? 'No dialogue or presenter delivery. Keep the frame product-led.' : 'No face, no dialogue.',
    `STRICT PRODUCT LOCK: shot ${shot.index + 1} uses the same product instance and same model identity.`,
    'Do not reconstruct or reinterpret the scene.',
  ].join('\n')
}

function compactSceneText(items: Array<unknown>, fallback: string) {
  const text = items
    .map((item) => String(item || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('. ')
  return sanitizeGeneratedVideoPrompt(text || fallback, 520)
}

export function buildFrameSceneAtmosphereText(shot: ShotSpec) {
  const scene = shot.sceneDescription || {}
  const explicitScene = compactSceneText(
    [scene.location, scene.background, scene.lighting, scene.style],
    '',
  )
  const inferredScene = explicitScene || compactSceneText(
    [shot.visualDescription, shot.generationPrompt, shot.visualPrompt, shot.visual],
    'same real-world background category as the storyboard/reference shot',
  )
  return [
    'FRAME SCENE ATMOSPHERE LOCK:',
    `Preserve original storyboard/reference scene: ${inferredScene}.`,
    'Use a real indoor/lifestyle environment with visible background depth, soft natural lighting, subtle background blur, warm or neutral ambient color, natural skin reflection, soft shadows, and slight imperfection realism.',
    'Keep same scene category, lighting family, camera distance, and composition intent; not a plain white background, blank studio void, catalog cutout, or seamless backdrop.',
  ].join(' ')
}

function buildCompactFrameReferenceLockText(productType: CloneProductType) {
  const normalizedType = String(productType || '').trim().toLowerCase()
  if (/earrings?/.test(normalizedType)) {
    return [
      'REFERENCE IMAGE PRIORITY:',
      'Use the provided reference image as primary visual source.',
      'Preserve product shape, proportions, and structure.',
      'Avoid deformation or redesign.',
      'Do not rebuild the product from text.',
    ].join(' ')
  }
  return 'REFERENCE IMAGE LOCK (CRITICAL): product reference image is the only valid product identity source; directly preserve it, no text-based recreation or lookalike replacement.'
}

function buildCompactHumanPriorityRuleText() {
  return 'HUMAN PRIORITY RULE: adjust human pose, hand, ear, neck, or framing to fit the product; never reshape or restyle the product.'
}

function buildCompactFrameContinuityText(input: { isEnd: boolean; shotIndex: number }) {
  return input.isEnd
    ? 'FRAME CONTINUITY LOCK: ending keyframe continues the provided start frame with same product, model, scene, lighting, background depth, and natural shadows. Do not reconstruct, reinterpret, or rerender the scene.'
    : `FRAME CONTINUITY LOCK: shot ${input.shotIndex + 1} start frame locks the base product, model, scene, background depth, natural shadows, and composition. Treat the image as final visual truth, not a scene to recreate.`
}

function buildStoryboardAngleLockText(shot: ShotSpec, input: { isEnd: boolean }) {
  const cameraText = sanitizeGeneratedVideoPrompt(
    String(shot.cameraDescription || shot.cameraMovement || shot.motion || '').trim(),
    220,
  ) || 'follow the storyboard shot camera direction exactly'
  return [
    'STORYBOARD ANGLE LOCK:',
    input.isEnd
      ? 'Image 3 defines the required continuation angle, crop, framing distance, and composition progression for this ending frame.'
      : 'Image 3 defines the required storyboard angle, crop, framing distance, and composition for this shot.',
    `Camera direction anchor: ${cameraText}.`,
    'Keep the same viewing side, same product-facing direction, same ear/hand/body relation, and same composition intent as the storyboard shot.',
    'Do not invent a new angle, reverse the side, reveal hidden structure, rotate the product, or switch to a different framing logic.',
  ].join(' ')
}

function buildStoryboardSceneAuthorityText(shot: ShotSpec, input: { isEnd: boolean }) {
  const sceneAnchor = compactSceneText(
    [shot.visualDescription, shot.generationPrompt, shot.visualPrompt, shot.visual, shot.cameraDescription],
    'follow the storyboard scene and composition only',
  )
  return [
    'STORYBOARD SCENE AUTHORITY:',
    input.isEnd
      ? 'Use the storyboard continuity image only as the target continuation of scene, angle, crop, and composition.'
      : 'Use the storyboard shot image only as the target source of scene, angle, crop, and composition.',
    `Scene and composition anchor: ${sceneAnchor}.`,
    'The storyboard image may define scene mood, camera distance, crop, hand placement, and pose composition only.',
    'It must not redefine who the model is, and it must not redefine product structure, material, or accessory details.',
  ].join(' ')
}

function buildStoryboardFaceCropLockText(productType: CloneProductType, shot: ShotSpec) {
  const isEarringLike = looksLikeEarringStoryboardShot(productType, shot)
  const wearableLike = isWearableStoryboardShot(productType, shot)
  const modelPresentationShot = isModelPresentationShot(shot)
  if (isEarringLike) {
    return [
      'FRAMING PRIORITY - PRODUCT FIRST:',
      'The product must be the visual center and dominant subject.',
      'The human face must NOT be the focal point.',
      'FACE VISIBILITY CONTROL:',
      'Do NOT reveal the full face.',
      'Only allow partial face, cropped face, tight side profile, or ear/jawline/neck crop.',
      'Keep the eyes out of frame whenever possible.',
      'Avoid full frontal beauty portrait composition, avoid eye contact with the camera, and avoid face occupying center frame.',
      'COMPOSITION LOCK:',
      'The product must occupy the primary focus area, center or rule-of-thirds dominant zone.',
      'The face must stay off-center, partially cropped, or secondary in depth.',
      'JEWELRY PRESENTATION RULE:',
      'Focus on ear, neck, and hand area.',
      'Face is only supporting structure, not the subject.',
      'The product must be larger, clearer, and more visually dominant than facial features.',
    ].join(' ')
  }
  if (wearableLike) {
    return [
      'FRAMING PRIORITY - PRODUCT FIRST:',
      'Do NOT use full face, face-centered framing, or face-dominant composition.',
      'Only allow partial face, side crop, ear-jawline-neck crop, or hand-product crop when human context is necessary.',
      'The product must stay larger, sharper, and more centered than surrounding body or facial features.',
      'Adjust the human pose or crop to fit the product. Never reshape the product to fit the human.',
    ].join(' ')
  }
  if (modelPresentationShot) {
    return 'FRAMING PRIORITY - PRODUCT FIRST: avoid full-face centered portrait framing; prefer partial face, side-angle crop, or off-center face placement so product demonstration remains primary.'
  }
  return 'FACE CROP LOCK: keep the human head out of frame whenever possible.'
}

export function buildGptFramePrompt(input: {
  shot: ShotSpec
  productType: CloneProductType
  modelPack: ModelIdentityPack
  productPoints?: string
  productDescription?: string
  which: 'start' | 'end'
  compiledPrompt?: string
}) {
  const shot = input.shot
  const isEnd = input.which === 'end'
  const productSceneLock = buildStoryboardLockedSceneText(input.productType, shot)
  const actionLock = buildStoryboardLockedActionText(input.productType, shot.actionDescription)
  const productFocusLock = buildStoryboardLockedProductFocusText(input.productType)
  const faceCropLock = buildStoryboardFaceCropLockText(input.productType, shot)
  const continuityLock = buildCompactFrameContinuityText({ isEnd, shotIndex: shot.index })
  const compiledFramePrompt = sanitizeCompiledFramePrompt(input.productType, input.compiledPrompt)
  const faceControlText = buildFaceControlText(input.productType, shot)
  return [
    isEnd
      ? `Generate the ending keyframe for shot ${shot.index + 1}. It must be a small continuation from the provided GPT start frame.`
      : `Generate the opening keyframe for shot ${shot.index + 1}.`,
    [
      '[ABSOLUTE RULES]',
      'Product = Image 1 (ONLY source of truth)',
      'The product is fixed and must remain 100% identical',
      'No redesign, no replacement, no approximation',
      'If conflict occurs -> ALWAYS follow Image 1',
    ].join('\n'),
    [
      '[INPUT ROLE MAP]',
      'Image 1 -> product only',
      'Image 2 -> model identity only',
      isEnd ? 'Image 3 -> continuation angle / framing / composition only' : 'Image 3 -> pose / framing / composition only',
      'No cross-usage allowed',
      buildReferenceResponsibilityText({ mode: 'storyboard_frame', isEndFrame: isEnd }),
    ].join('\n'),
    buildShotControlText({ productType: input.productType, shot, isEnd }),
    faceControlText,
    buildRestrictionsText(input.productType, shot),
    buildOutputText(),
    'Execution notes:',
    faceCropLock,
    continuityLock,
    `Action lock: ${actionLock}`,
    `Scene lock: ${productSceneLock}`,
    `Product focus lock: ${productFocusLock}`,
    identityText(input.modelPack),
    `Reference shot translation: ${String(shot.visualPrompt || shot.visual || 'use only composition, framing, action rhythm and camera grammar from the reference shot').trim()}.`,
    `Shot role: ${String(shot.role || shot.purpose || 'product demo')}. Duration target: ${Number(shot.durationSec || 3).toFixed(1)} seconds.`,
    `Camera motion target: ${String(shot.motion || 'static')}. Keep changes restrained and realistic.`,
    isEnd
      ? 'The ending frame must keep the same new model, same product, same outfit, same location, same lighting, same emotion and same camera setup as the provided start frame. Only allow subtle hand, expression or camera-position continuation.'
      : 'Keep the original shot background category, composition, body pose, hand placement and product demonstration action. Replace only the person identity with the new virtual model. Do not let the human become the subject.',
    buildStoryboardAngleLockText(shot, { isEnd }),
    buildStoryboardSceneAuthorityText(shot, { isEnd }),
    buildDirectProductReuseLockText(input.productType, input.productDescription || input.productPoints),
    compiledFramePrompt ? `Compiled product-control layer: ${compiledFramePrompt}` : '',
  ].join('\n')
}

export async function generateModelIdentityPackImages(input: {
  credentials: ModelCredentials
  outDir: string
  productType: CloneProductType
  productPoints?: string
  modelProfileOptions?: ModelProfileOptions
  productReferenceImagePaths: string[]
  onImageGenerated?: (filePath: string, index: number) => Promise<void> | void
}) {
  const profile = mergeModelIdentityProfile(input.productType, input.modelProfileOptions)
  if (
    canUseMockGeneration(input.credentials) &&
    !String(resolveApifoxHubCredentials(input.credentials, 'image')?.apiKey ?? '').trim() &&
    !String(input.credentials.openaiApiKey ?? '').trim() &&
    !String(input.credentials.klingApiKey ?? '').trim() &&
    !String(input.credentials.grsaiApiKey ?? '').trim()
  ) {
    const path = await buildMockImageFromReference({
      credentials: input.credentials,
      prompt: 'mock model identity 3x3 contact sheet',
      imagePaths: input.productReferenceImagePaths,
      outDir: input.outDir,
      filePrefix: 'model_identity_grid',
    })
    const imagePaths = [path]
    await input.onImageGenerated?.(path, 0)
    return { profile, imagePaths, model: 'mock-image' }
  }
  const prompt = buildIdentityPackPrompt({
    productType: input.productType,
    productPoints: input.productPoints,
    profile,
  })
  const path = await generateProviderImage({
    credentials: input.credentials,
    prompt,
    imagePaths: input.productReferenceImagePaths,
    outDir: input.outDir,
    filePrefix: 'model_identity_grid',
  })
  const imagePaths = [path]
  await input.onImageGenerated?.(path, 0)
  const provider = imageProvider(input.credentials)
  const model = provider === 'kling' ? klingImageModel(input.credentials) : provider === 'grsai' ? grsImageModel(input.credentials) : imageModel(input.credentials)
  return { profile, imagePaths, model }
}

export async function generateGptShotFrameImage(input: {
  credentials: ModelCredentials
  prompt: string
  negativePrompt?: string
  outDir: string
  filePrefix: string
  imagePaths: string[]
  normalizeOutput?: 'vertical_9_16' | 'preserve'
  outputSize?: string
}) {
  if (
    canUseMockGeneration(input.credentials) &&
    !String(resolveApifoxHubCredentials(input.credentials, 'image')?.apiKey ?? '').trim() &&
    !String(input.credentials.openaiApiKey ?? '').trim() &&
    !String(input.credentials.klingApiKey ?? '').trim() &&
    !String(input.credentials.grsaiApiKey ?? '').trim()
  ) {
    return await buildMockImageFromReference(input)
  }
  return await generateProviderImage(input)
}
