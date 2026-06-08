import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import * as XLSX from 'xlsx'
import { cleanAiText, extractModelMessageContent } from '../clone/aiResponse'
import { resolveApifoxHubCredentials, resolveApifoxHubProfile } from '../clone/apifoxProfile'
import { generateGptShotFrameImage } from '../clone/gptImage'
import { buildProductAnalysisBoard } from '../clone/productAnalysisBoard'
import { cloneRepo } from '../clone/repo'
import { toPublicUrlViaQiniu } from '../clone/qiniu'
import { generateChatCompletion } from '../clone/unifiedChat'
import type { ModelCredentials } from '../clone/types'
import { getAppPaths } from '../../lib/paths'
import { buildTiktokListingImagePrompt, buildTiktokListingTitlePrompt } from './prompts'
import { tiktokListingRepo } from './repo'
import type {
  TiktokListingCategory,
  TiktokListingExportCategoryConfig,
  TiktokListingImage,
  TiktokListingItem,
  TiktokListingLanguage,
} from './types'

type TiktokListingResolvedRoute = {
  provider: string
  model: string
  baseUrl: string
  endpointStyle?: string
  profile?: string
}

const TIKTOK_LISTING_MAX_RETRIES = 2
const TIKTOK_LISTING_IMAGE_SIZE = '1024x1024'

type TiktokListingGenerationDeps = {
  generateTitle: typeof generateListingTitle
  generateAnalysisBoard: typeof generateListingAnalysisBoard
  generateImages: (
    input: Parameters<typeof generateListingImages>[0] & {
      buildImagePrompt: typeof buildImagePrompt
    },
  ) => ReturnType<typeof generateListingImages>
  ensurePublicUrl: typeof ensurePublicUrl
}

let generationDeps: TiktokListingGenerationDeps | null = null

const TIKTOK_LISTING_RING_EXPORT_CONFIG: TiktokListingExportCategoryConfig = {
  category: 'ring',
  categoryId: '605273',
  productAttributes:
    '[{"attributeId":"100347","attributeName":"S? l??ng tr?n m?i g?i","values":[{"valueId":"1000256","valueName":"1"}]},{"attributeId":"100392","attributeName":"D?p","values":[{"valueId":"1001082","valueName":"H?ng ng?y"}]},{"attributeId":"100445","attributeName":"Gi?i","values":[{"valueId":"1001452","valueName":"Phi gi?i t?nh"}]},{"attributeId":"100701","attributeName":"V?t li?u","values":[{"valueId":"1001475","valueName":"Ph? kim lo?i"}]},{"attributeId":"100757","attributeName":"Thi?t k?","values":[{"valueId":"1003618","valueName":"H?nh h?c"}]},{"attributeId":"101155","attributeName":"Ph? ki?n c?p ??i","values":[{"valueId":"1000059","valueName":"Kh?ng"}]},{"attributeId":"101157","attributeName":"B? nh?n","values":[{"valueId":"1000059","valueName":"Kh?ng"}]}]',
}

const TIKTOK_LISTING_DEFAULT_EXPORT_CATEGORY_CONFIG: Record<TiktokListingCategory, TiktokListingExportCategoryConfig> = {
  earring: {
    category: 'earring',
    categoryId: '605268',
    productAttributes:
      '[{"attributeId":"100392","attributeName":"D?p","values":[{"valueId":"1001532","valueName":"?i?m l?nh"}]},{"attributeId":"100347","attributeName":"S? l??ng tr?n m?i g?i","values":[{"valueId":"1000256","valueName":"1"}]},{"attributeId":"100462","attributeName":"Ki?u b?ng tai","values":[{"valueId":"1001168","valueName":"Thanh l?ch"}]},{"attributeId":"100461","attributeName":"Lo?i b?ng tai","values":[{"valueId":"1001538","valueName":"B?ng tai v?ng"}]},{"attributeId":"100445","attributeName":"Gi?i","values":[{"valueId":"1001450","valueName":"N?"}]},{"attributeId":"100701","attributeName":"V?t li?u","values":[{"valueId":"1001475","valueName":"Ph? kim lo?i"}]},{"attributeId":"100757","attributeName":"Thi?t k?","values":[{"valueId":"1001230","valueName":"Kim c??ng gi?"}]},{"attributeId":"101152","attributeName":"B? b?ng tai","values":[{"valueId":"1000059","valueName":"Kh?ng"}]}]',
  },
  ring: TIKTOK_LISTING_RING_EXPORT_CONFIG,
  necklace: { ...TIKTOK_LISTING_RING_EXPORT_CONFIG, category: 'necklace' },
  phone_case: { ...TIKTOK_LISTING_RING_EXPORT_CONFIG, category: 'phone_case' },
  bracelet: { ...TIKTOK_LISTING_RING_EXPORT_CONFIG, category: 'bracelet' },
}

const TIKTOK_LISTING_EXPORT_HEADERS = [
  '*分类id\n（必填）',
  '*产品标题\n（必填）',
  '*产品描述\n（必填）',
  '品牌',
  '产品属性',
  'SKU',
  '变种属性名称一',
  '变种属性值一',
  '变种属性名称二',
  '变种属性值二',
  '变种属性名称三',
  '变种属性值三',
  '识别码类型',
  '识别码',
  '*本地展示价(站点币种)\n（必填）',
  '*库存\n（必填）',
  '*产品主图(URL)地址\n（必填）',
  '附图一',
  '附图二',
  '附图三',
  '附图四',
  '附图五',
  '附图六',
  '附图七',
  '附图八',
  '视频链接',
  '尺码图',
  '变种主图1图片',
  '*重量(kg)\n（必填）',
  '*长(cm)\n（必填）',
  '*宽(cm)\n（必填）',
  '*高(cm)\n（必填）',
  '*仓库名称\n（必填）',
  '货到付款',
  '来源URL',
]

function now() {
  return Date.now()
}

function safeName(input: string, fallback: string) {
  const value = String(input || '')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .trim()
  return value || fallback
}

function normalizeErrorMessage(error: unknown, fallback: string) {
  const message = String((error as any)?.message ?? error ?? '').trim()
  return message || fallback
}

function categoryLabel(category: TiktokListingCategory) {
  if (category === 'earring') return '耳环'
  if (category === 'ring') return '戒指'
  if (category === 'necklace') return '项链'
  if (category === 'phone_case') return '手机壳'
  return '手链'
}

export function resolveTiktokListingGenerationConfig(credentials: ModelCredentials): {
  image: TiktokListingResolvedRoute
  chat: TiktokListingResolvedRoute
} {
  const imageProvider =
    credentials.imageProviderPrimary === 'kling' ||
    credentials.imageProviderPrimary === 'grsai' ||
    credentials.imageProviderPrimary === 'openai'
      ? credentials.imageProviderPrimary
      : 'apifox_hub'
  const chatProvider = credentials.chatProviderPrimary === 'grsai' ? 'grsai' : 'apifox_hub'
  const imageHub = resolveApifoxHubCredentials(credentials, 'image')
  const chatHub = resolveApifoxHubCredentials(credentials, 'chat')

  return {
    image:
      imageProvider === 'apifox_hub'
        ? {
            provider: 'apifox_hub',
            model: String(imageHub?.imageEditModel || imageHub?.imageModel || '').trim(),
            baseUrl: String(imageHub?.baseUrl || '').trim(),
            endpointStyle: String(imageHub?.imageEndpointStyle || '').trim(),
            profile: resolveApifoxHubProfile(credentials, 'image'),
          }
        : imageProvider === 'grsai'
          ? {
              provider: 'grsai',
              model: String(credentials.grsaiImageModel || '').trim() || 'gpt-image-2',
              baseUrl: String(credentials.grsaiHost || 'https://grsaiapi.com').trim().replace(/\/+$/, '') || 'https://grsaiapi.com',
            }
          : imageProvider === 'kling'
            ? {
                provider: 'kling',
                model: String(credentials.klingImageModel || '').trim() || 'openai/gpt-image-1/edit',
                baseUrl: String(credentials.klingHost || 'https://api.atlascloud.ai').trim().replace(/\/+$/, '') || 'https://api.atlascloud.ai',
              }
            : {
                provider: 'openai',
                model: String(credentials.openaiImageModel || '').trim() || 'gpt-image-2',
                baseUrl: 'https://api.openai.com',
              },
    chat:
      chatProvider === 'apifox_hub'
        ? {
            provider: 'apifox_hub',
            model: String(chatHub?.chatModel || '').trim(),
            baseUrl: String(chatHub?.baseUrl || '').trim(),
            endpointStyle: String(chatHub?.chatEndpointStyle || '').trim(),
            profile: resolveApifoxHubProfile(credentials, 'chat'),
          }
        : {
            provider: 'grsai',
            model: String(credentials.grsaiAnalysisModel || '').trim() || 'gemini-3.1-pro',
            baseUrl: String(credentials.grsaiHost || 'https://grsaiapi.com').trim().replace(/\/+$/, '') || 'https://grsaiapi.com',
            endpointStyle: 'openai_chat',
          },
  }
}

function hasSelectedImageProviderCredential(credentials: ModelCredentials) {
  const route = resolveTiktokListingGenerationConfig(credentials).image
  if (route.provider === 'apifox_hub') return Boolean(String(resolveApifoxHubCredentials(credentials, 'image')?.apiKey || '').trim())
  if (route.provider === 'grsai') return Boolean(String(credentials.grsaiApiKey || '').trim())
  if (route.provider === 'kling') return Boolean(String(credentials.klingApiKey || '').trim())
  return Boolean(String(credentials.openaiApiKey || '').trim())
}

function hasAnyImageProviderCredential(credentials: ModelCredentials) {
  return (
    Boolean(String(resolveApifoxHubCredentials(credentials, 'image')?.apiKey || '').trim()) ||
    Boolean(String(credentials.grsaiApiKey || '').trim()) ||
    Boolean(String(credentials.klingApiKey || '').trim()) ||
    Boolean(String(credentials.openaiApiKey || '').trim())
  )
}

function assertTiktokListingImageProviderReady(credentials: ModelCredentials) {
  if (credentials.allowMockWhenNoKey && !hasAnyImageProviderCredential(credentials)) return
  if (hasSelectedImageProviderCredential(credentials)) return
  const route = resolveTiktokListingGenerationConfig(credentials).image
  if (route.provider === 'apifox_hub') throw new Error(`当前图片模型平台为 ${route.profile === 'ai666' ? 'AI666' : 'VectorEngine'}，但未配置对应图片 API Key`)
  if (route.provider === 'grsai') throw new Error('当前图片模型平台为 GRS.AI，但未配置 GRS.AI API Key')
  if (route.provider === 'kling') throw new Error('当前图片模型平台为 AtlasCloud，但未配置 AtlasCloud API Key')
  throw new Error('当前图片模型平台为 OpenAI，但未配置 OpenAI API Key')
}

function assertTiktokListingChatProviderReady(credentials: ModelCredentials) {
  const route = resolveTiktokListingGenerationConfig(credentials).chat
  if (route.provider === 'apifox_hub') {
    if (String(resolveApifoxHubCredentials(credentials, 'chat')?.apiKey || '').trim()) return
    throw new Error(`当前对话模型平台为 ${route.profile === 'ai666' ? 'AI666' : 'VectorEngine'}，但未配置对应对话 API Key`)
  }
  if (String(credentials.grsaiApiKey || '').trim()) return
  throw new Error('当前对话模型平台为 GRS.AI，但未配置 GRS.AI API Key')
}

function clearHubApiKey(hub: ModelCredentials['ai666Hub']) {
  if (!hub) return hub
  return { ...hub, apiKey: undefined }
}

function buildStrictImageCredentials(credentials: ModelCredentials): ModelCredentials {
  const route = resolveTiktokListingGenerationConfig(credentials).image
  if (route.provider === 'apifox_hub') {
    return {
      ...credentials,
      imageProviderPrimary: 'apifox_hub',
      openaiApiKey: undefined,
      klingApiKey: undefined,
      grsaiApiKey: undefined,
    }
  }
  if (route.provider === 'grsai') {
    return {
      ...credentials,
      imageProviderPrimary: 'grsai',
      openaiApiKey: undefined,
      klingApiKey: undefined,
      ai666Hub: clearHubApiKey(credentials.ai666Hub),
      vectorEngineHub: clearHubApiKey(credentials.vectorEngineHub),
      apifoxHub: clearHubApiKey(credentials.apifoxHub),
    }
  }
  if (route.provider === 'kling') {
    return {
      ...credentials,
      imageProviderPrimary: 'kling',
      openaiApiKey: undefined,
      grsaiApiKey: undefined,
      ai666Hub: clearHubApiKey(credentials.ai666Hub),
      vectorEngineHub: clearHubApiKey(credentials.vectorEngineHub),
      apifoxHub: clearHubApiKey(credentials.apifoxHub),
    }
  }
  return {
    ...credentials,
    imageProviderPrimary: 'openai',
    klingApiKey: undefined,
    grsaiApiKey: undefined,
    ai666Hub: clearHubApiKey(credentials.ai666Hub),
    vectorEngineHub: clearHubApiKey(credentials.vectorEngineHub),
    apifoxHub: clearHubApiKey(credentials.apifoxHub),
  }
}

async function generateChatCompletionBySettings(input: {
  credentials: ModelCredentials
  system?: string
  prompt: string
}) {
  assertTiktokListingChatProviderReady(input.credentials)
  const route = resolveTiktokListingGenerationConfig(input.credentials).chat
  if (route.provider === 'apifox_hub') return await generateChatCompletion(input)

  const key = String(input.credentials.grsaiApiKey || '').trim()
  const res = await fetch(`${route.baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: route.model,
      stream: false,
      temperature: 0.3,
      messages: [
        ...(input.system ? [{ role: 'system', content: input.system }] : []),
        { role: 'user', content: input.prompt },
      ],
    }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`GRS.AI 对话请求失败 HTTP ${res.status}: ${text.slice(0, 500)}`)
  return {
    provider: 'grsai',
    model: route.model,
    endpointStyle: 'openai_chat',
    baseUrl: route.baseUrl,
    content: cleanAiText(extractModelMessageContent(text)),
    raw: text,
  }
}

function buildImagePrompt(input: {
  category: TiktokListingCategory
  index: number
  sku?: string
  anchorMode?: 'source_only' | 'source_plus_hero'
}) {
  return buildTiktokListingImagePrompt({
    category: input.category,
    index: input.index,
    sku: input.sku,
    anchorMode: input.anchorMode,
    detailText: `${categoryLabel(input.category)} ecommerce listing image`,
  })
}

async function ensurePublicUrl(credentials: ModelCredentials, filePath: string, keyPrefix: string) {
  return await toPublicUrlViaQiniu(credentials, filePath, keyPrefix)
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function normalizeGeneratedTitle(title: string, sku: string) {
  const cleanTitle = String(title || '').replace(/\s+/g, ' ').trim()
  const cleanSku = String(sku || '').replace(/\s+/g, ' ').trim()
  if (!cleanTitle || !cleanSku) return cleanTitle.slice(0, 200)

  const skuPattern = new RegExp(`(?:^|[\\s,.:;\\-\\[\\]()])${escapeRegExp(cleanSku)}(?=$|[\\s,.:;\\-\\[\\]()])`, 'gi')
  const stripped = cleanTitle
    .replace(skuPattern, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[-,:;]+$/g, '')

  const base = stripped || cleanTitle
  const normalized = base.toLowerCase().endsWith(cleanSku.toLowerCase()) ? base : `${base} ${cleanSku}`.trim()
  return normalized.slice(0, 200)
}

async function generateListingTitle(input: {
  credentials: ModelCredentials
  category: TiktokListingCategory
  sku: string
  language: TiktokListingLanguage
}) {
  const titleResult = await generateChatCompletionBySettings({
    credentials: input.credentials,
    system: 'Only output the final title.',
    prompt: buildTiktokListingTitlePrompt({
      category: input.category,
      language: input.language,
      sku: input.sku,
      detailText: `${categoryLabel(input.category)} ecommerce title`,
    }),
  })
  const title = normalizeGeneratedTitle(String(titleResult.content || '').trim(), input.sku)
  if (!title) throw new Error('标题生成失败')
  return title
}

function buildListingDescriptionFromImages(images: TiktokListingImage[]) {
  const imageTags = images
    .map((image) => String(image.publicUrl || '').trim())
    .filter(Boolean)
    .map((url) => `<img src="${url}" />`)
  if (!imageTags.length) throw new Error('描述图片拼接失败')
  return imageTags.join('\n')
}

async function generateListingAnalysisBoard(input: {
  credentials: ModelCredentials
  sourceImagePath: string
  referenceImagePaths?: string[]
  itemId: string
}) {
  assertTiktokListingImageProviderReady(input.credentials)
  const strictCredentials = buildStrictImageCredentials(input.credentials)
  const outDir = join(getAppPaths().dataDir, 'plugin-tiktok-listing', input.itemId, 'analysis-board')
  await mkdir(outDir, { recursive: true })
  const outputPath = await buildProductAnalysisBoard({
    credentials: strictCredentials,
    imagePaths: input.referenceImagePaths?.length ? input.referenceImagePaths : [input.sourceImagePath],
    outDir,
    filePrefix: 'listing_analysis_board',
    allowFallback: true,
  })
  if (!String(outputPath || '').trim()) throw new Error('analysis board generation failed')
  return {
    id: randomUUID(),
    filePath: outputPath,
    fileName: basename(outputPath),
    createdAt: now(),
  } satisfies TiktokListingImage
}

async function generateListingImages(input: {
  credentials: ModelCredentials
  category: TiktokListingCategory
  sourceImagePath: string
  referenceImagePaths?: string[]
  analysisBoardPath: string
  itemId: string
  sku: string
}) {
  assertTiktokListingImageProviderReady(input.credentials)
  const strictCredentials = buildStrictImageCredentials(input.credentials)
  const outDir = join(getAppPaths().dataDir, 'plugin-tiktok-listing', input.itemId, 'images')
  await mkdir(outDir, { recursive: true })
  const images: TiktokListingImage[] = []
  let heroImagePath = ''
  const extraReferenceImagePaths = Array.from(
    new Set(
      (Array.isArray(input.referenceImagePaths) ? input.referenceImagePaths : [])
        .map((item) => String(item || '').trim())
        .filter((item) => item && item !== input.sourceImagePath),
    ),
  )
  for (let index = 0; index < 5; index += 1) {
    const imagePaths =
      index === 0 || !heroImagePath
        ? [input.sourceImagePath, input.analysisBoardPath, ...extraReferenceImagePaths]
        : [input.sourceImagePath, input.analysisBoardPath, heroImagePath, ...extraReferenceImagePaths]
    const outputPath = await generateGptShotFrameImage({
      credentials: strictCredentials,
      prompt: buildImagePrompt({
        category: input.category,
        index,
        sku: input.sku,
        anchorMode: index === 0 || !heroImagePath ? 'source_only' : 'source_plus_hero',
      }),
      negativePrompt: '',
      imagePaths,
      outDir,
      filePrefix: `listing_${index + 1}`,
      normalizeOutput: 'preserve',
      outputSize: TIKTOK_LISTING_IMAGE_SIZE,
    })
    if (index === 0) heroImagePath = outputPath
    images.push({
      id: randomUUID(),
      filePath: outputPath,
      fileName: basename(outputPath),
      createdAt: now(),
    })
  }
  return images
}

async function withRetry<T>(input: {
  label: 'title' | 'analysis-board' | 'images'
  sku: string
  run: () => Promise<T>
}) {
  let lastError: unknown
  for (let attempt = 1; attempt <= TIKTOK_LISTING_MAX_RETRIES + 1; attempt += 1) {
    try {
      if (attempt > 1) {
        console.log(`[tiktok-listing] retry ${input.label} sku=${input.sku} attempt=${attempt}`)
      }
      return await input.run()
    } catch (error) {
      lastError = error
      const message = normalizeErrorMessage(error, `${input.label} generate failed`)
      console.log(`[tiktok-listing] retry-failed ${input.label} sku=${input.sku} attempt=${attempt} message=${message}`)
      if (attempt > TIKTOK_LISTING_MAX_RETRIES) {
        throw new Error(`${input.label}:${message}`)
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError ?? 'generate failed'))
}

export function __setTiktokListingGenerationDepsForTest(deps: TiktokListingGenerationDeps | null) {
  generationDeps = deps
}

async function listExportCategoryConfigs(): Promise<TiktokListingExportCategoryConfig[]> {
  const savedConfigs = await tiktokListingRepo.getExportCategoryConfigs()
  const map = new Map<TiktokListingCategory, TiktokListingExportCategoryConfig>()
  for (const category of Object.keys(TIKTOK_LISTING_DEFAULT_EXPORT_CATEGORY_CONFIG) as TiktokListingCategory[]) {
    map.set(category, { ...TIKTOK_LISTING_DEFAULT_EXPORT_CATEGORY_CONFIG[category] })
  }
  for (const config of savedConfigs) {
    if (!config?.category) continue
    map.set(config.category, {
      category: config.category,
      categoryId: String(config.categoryId || '').trim(),
      productAttributes: String(config.productAttributes || '').trim(),
    })
  }
  return Array.from(map.values())
}

async function resolveExportCategoryConfigMap() {
  const configs = await listExportCategoryConfigs()
  return new Map<TiktokListingCategory, TiktokListingExportCategoryConfig>(configs.map((config) => [config.category, config]))
}

function buildWorksheetRows(
  items: TiktokListingItem[],
  configMap: Map<TiktokListingCategory, TiktokListingExportCategoryConfig>,
) {
  return items.map((item) => {
    const exportConfig = configMap.get(item.category) || TIKTOK_LISTING_DEFAULT_EXPORT_CATEGORY_CONFIG[item.category]
    return {
      '*分类id\n（必填）': exportConfig.categoryId,
      '*产品标题\n（必填）': item.generatedTitle || '',
      '*产品描述\n（必填）': item.generatedDescription || '',
      品牌: '无品牌',
      产品属性: exportConfig.productAttributes,
      SKU: item.sku,
      变种属性名称一: '',
      变种属性值一: '',
      变种属性名称二: '',
      变种属性值二: '',
      变种属性名称三: '',
      变种属性值三: '',
      识别码类型: '',
      识别码: '',
      '*本地展示价(站点币种)\n（必填）': item.localDisplayPrice,
      '*库存\n（必填）': '45',
      '*产品主图(URL)地址\n（必填）': item.listingImages[0]?.publicUrl || '',
      附图一: item.listingImages[1]?.publicUrl || '',
      附图二: item.listingImages[2]?.publicUrl || '',
      附图三: item.listingImages[3]?.publicUrl || '',
      附图四: item.listingImages[4]?.publicUrl || '',
      附图五: '',
      附图六: '',
      附图七: '',
      附图八: '',
      视频链接: '',
      尺码图: '',
      变种主图1图片: '',
      '*重量(kg)\n（必填）': '0.001',
      '*长(cm)\n（必填）': '1',
      '*宽(cm)\n（必填）': '1',
      '*高(cm)\n（必填）': '1',
      '*仓库名称\n（必填）': 'Lys',
      货到付款: '是',
      来源URL: '',
    }
  })
}

export const tiktokListingService = {
  async list() {
    return await tiktokListingRepo.list()
  },

  async getExportCategoryConfigs() {
    return await listExportCategoryConfigs()
  },

  async saveExportCategoryConfigs(configs: TiktokListingExportCategoryConfig[]) {
    const normalized = (Array.isArray(configs) ? configs : []).map((config) => ({
      category: config.category,
      categoryId: String(config.categoryId || '').trim(),
      productAttributes: String(config.productAttributes || '').trim(),
    }))
    return await tiktokListingRepo.saveExportCategoryConfigs(normalized)
  },

  async createOrUpdate(
    payload: Partial<TiktokListingItem> & {
      sourceImagePath: string
      referenceImagePaths?: string[]
      category: TiktokListingCategory
      sku: string
      localDisplayPrice: string
      titleLanguage: TiktokListingLanguage
    },
  ) {
    return await tiktokListingRepo.createOrUpdate(payload)
  },

  async remove(id: string) {
    return await tiktokListingRepo.remove(id)
  },

  async generate(payload: { id: string }) {
    const current = await tiktokListingRepo.get(payload.id)
    if (!current) throw new Error('商品记录不存在')

    const credentials = await cloneRepo.getCredentials()
    const routing = resolveTiktokListingGenerationConfig(credentials)
    console.log('[clone-debug] tiktok-listing-model-routing', {
      itemId: current.id,
      sku: current.sku,
      category: current.category,
      image: routing.image,
      chat: routing.chat,
    })

    const processing = await tiktokListingRepo.createOrUpdate({
      ...current,
      generationStatus: 'generating',
      generationError: '',
    })

    try {
      console.log(`[tiktok-listing] stage title sku=${current.sku}`)
      const deps = generationDeps
      const title = await withRetry({
        label: 'title',
        sku: current.sku,
        run: async () =>
          await (deps?.generateTitle || generateListingTitle)({
            credentials,
            category: current.category,
            sku: current.sku,
            language: current.titleLanguage,
          }),
      })

      console.log(`[tiktok-listing] stage analysis-board sku=${current.sku}`)
      const analysisBoardImage = await withRetry({
        label: 'analysis-board',
        sku: current.sku,
        run: async () =>
          await (deps?.generateAnalysisBoard || generateListingAnalysisBoard)({
            credentials,
            sourceImagePath: current.sourceImagePath,
            referenceImagePaths: current.referenceImagePaths,
            itemId: current.id,
          }),
      })

      console.log(`[tiktok-listing] stage images sku=${current.sku}`)
      const images = await withRetry({
        label: 'images',
        sku: current.sku,
        run: async () =>
          await (deps?.generateImages || generateListingImages)({
            credentials,
            category: current.category,
            sourceImagePath: current.sourceImagePath,
            referenceImagePaths: current.referenceImagePaths,
            analysisBoardPath: analysisBoardImage.filePath,
            itemId: current.id,
            sku: current.sku,
            buildImagePrompt,
          }),
      })

      const analysisBoardWithUrl: TiktokListingImage = {
        ...analysisBoardImage,
        publicUrl: await (deps?.ensurePublicUrl || ensurePublicUrl)(
          credentials,
          analysisBoardImage.filePath,
          `tiktok-listing/${current.id}/analysis-board`,
        ),
      }

      const withUrls: TiktokListingImage[] = []
      for (const image of images) {
        withUrls.push({
          ...image,
          publicUrl: await (deps?.ensurePublicUrl || ensurePublicUrl)(credentials, image.filePath, `tiktok-listing/${current.id}`),
        })
      }

      console.log(`[tiktok-listing] stage description-html sku=${current.sku}`)
      const descriptionHtml = buildListingDescriptionFromImages(withUrls)

      return await tiktokListingRepo.createOrUpdate({
        ...processing,
        generatedTitle: title,
        generatedDescription: descriptionHtml,
        analysisBoardImage: analysisBoardWithUrl,
        listingImages: withUrls,
        generationStatus: 'done',
        generationError: '',
        generatedAt: now(),
      })
    } catch (error) {
      const message = normalizeErrorMessage(error, '生成失败')
      console.log('[clone-debug] tiktok-listing-generate-failed', {
        itemId: current.id,
        sku: current.sku,
        category: current.category,
        message,
      })
      return await tiktokListingRepo.createOrUpdate({
        ...processing,
        generationStatus: 'failed',
        generationError: message,
      })
    }
  },

  async exportExcel(payload: { ids: string[] }) {
    const ids = Array.isArray(payload.ids) ? payload.ids.map((item) => String(item || '').trim()).filter(Boolean) : []
    if (!ids.length) throw new Error('请选择要导出的商品')

    const all = await tiktokListingRepo.list()
    const selected = all.filter((item) => ids.includes(item.id))
    if (!selected.length) throw new Error('未找到可导出的商品')

    for (const item of selected) {
      if (!item.sku.trim()) throw new Error(`SKU 为空：${item.id}`)
      if (!item.localDisplayPrice.trim()) throw new Error(`价格为空：${item.sku || item.id}`)
      if (!item.generatedTitle?.trim()) throw new Error(`标题未生成：${item.sku || item.id}`)
      if ((item.listingImages?.length || 0) < 5) throw new Error(`商品图不足 5 张：${item.sku || item.id}`)
      if (!item.listingImages.every((image) => String(image.publicUrl || '').trim())) {
        throw new Error(`存在未上传公网 URL 的图片：${item.sku || item.id}`)
      }
    }

    const configMap = await resolveExportCategoryConfigMap()
    const rows = buildWorksheetRows(
      selected.map((item) => ({
        ...item,
        generatedDescription: buildListingDescriptionFromImages(item.listingImages || []),
      })),
      configMap,
    )

    const workbook = XLSX.utils.book_new()
    const worksheet = XLSX.utils.json_to_sheet(rows, { header: TIKTOK_LISTING_EXPORT_HEADERS })
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1')

    const exportDir = join(getAppPaths().dataDir, 'exports', 'tiktok-listing')
    await mkdir(exportDir, { recursive: true })
    const filePath = join(exportDir, safeName(`tiktok-listing-${Date.now()}.xlsx`, 'tiktok-listing.xlsx'))

    try {
      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer
      await writeFile(filePath, buffer)
    } catch (error) {
      throw new Error(`cannot save file ${filePath}: ${normalizeErrorMessage(error, 'unknown error')}`)
    }

    return {
      filePath,
      total: selected.length,
    }
  },
}
