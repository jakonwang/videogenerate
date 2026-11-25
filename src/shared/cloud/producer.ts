import type { SyncBrand } from './sync'

/**
 * 手机端「AI 制片人」：一句话安排生产。模型只做决策（回复 / 追问 / 给出计划），
 * 计划里的每一步都对应手机 App 已有的功能，用户点「执行」后由 App 逐步调用。
 * 与桌面端 agent-os 同样的思路：大脑决定 → 计划需要批准 → 按能力目录执行。
 */

export type ProducerToolId = 'product-images' | 'image-to-video' | 'listing' | 'clone' | 'research' | 'model' | 'watermark' | 'subtitle' | 'mix'

export type ProducerTool = {
  id: ProducerToolId
  title: string
  /** 给模型看的说明（英文更稳定） */
  description: string
  /** 参数说明 */
  params: string
  needsProduct: boolean
  /** 需要从上下文 videos 里选视频（params.videoIds），至少几条 */
  minVideos?: number
}

export const PRODUCER_TOOLS: ProducerTool[] = [
  {
    id: 'product-images',
    title: '生成商品图',
    description: 'Generate AI product images from a product photo in the library.',
    params: 'productId (required); shots: array of 0-4 (0 hero product-only, 1 side wear, 2 front wear, 3 texture close-up, 4 detail macro), default [0,1,3]',
    needsProduct: true,
  },
  {
    id: 'image-to-video',
    title: '图生视频',
    description: 'Turn a product photo into a short vertical product video.',
    params: 'productId (required); motion: one of subtle | rotate | push | light (default subtle); durationSec: 5 | 6 | 8 (default 6)',
    needsProduct: true,
  },
  {
    id: 'listing',
    title: '写上架文案',
    description: 'Write a TikTok Shop title and description by looking at the product photos.',
    params: 'productId (required); language: zh-CN | en-US | vi-VN (default en-US); category: earring | ring | necklace | phone_case | bracelet | clothes | bag | shoes | toy, or any other short product category; omit to use the category of the product',
    needsProduct: true,
  },
  {
    id: 'clone',
    title: '复刻爆款视频',
    description: 'Recreate a viral reference video with our product. Requires the user to attach a reference video in this conversation.',
    params: 'productId (required); locale: zh-CN | en-US | vi-VN (default zh-CN)',
    needsProduct: true,
  },
  {
    id: 'research',
    title: '手机选品采集',
    description: 'Search Douyin on this phone by keyword and collect best-selling products.',
    params: 'keyword (required, Chinese search term); count: 20 | 50 | 100 (default 50)',
    needsProduct: false,
  },
  {
    id: 'model',
    title: '生成 AI 模特',
    description: 'Create a new virtual model in the model library from a short profile (one multi-angle reference image).',
    params: 'name (Chinese, short); gender: 女 | 男 (default 女); ageRange: 18-24 | 25-30 | 31-40 | 40+; style (optional, Chinese)',
    needsProduct: false,
  },
  {
    id: 'watermark',
    title: '视频加水印',
    description: 'Add a text watermark to existing videos.',
    params: 'videoIds (required, ids from context.videos); text (required, watermark text); position: tl | tr | bl | br | bottom (default br)',
    needsProduct: false,
    minVideos: 1,
  },
  {
    id: 'subtitle',
    title: '视频加字幕',
    description: 'Recognise speech in existing videos and burn in subtitles.',
    params: 'videoIds (required, ids from context.videos); language: zh | en | vi (optional, auto-detect when empty)',
    needsProduct: false,
    minVideos: 1,
  },
  {
    id: 'mix',
    title: '批量混剪',
    description: 'Randomly recombine several existing videos into new de-duplicated videos.',
    params: 'videoIds (required, at least 2 ids from context.videos); count: 1-10 (default 3); durationSec: 10-60 (default 15)',
    needsProduct: false,
    minVideos: 2,
  },
]

export type ProducerStep = {
  tool: ProducerToolId
  title: string
  params: Record<string, unknown>
}

export type ProducerDecision =
  | { action: 'reply'; response: string }
  | { action: 'clarify'; response: string }
  | { action: 'plan'; response: string; summary: string; steps: ProducerStep[] }

export type ProducerContext = {
  products: Array<{ id: string; name: string; type: string; images: number }>
  models: Array<{ id: string; name: string }>
  /** 最近生成好的视频（作品库），给水印 / 字幕 / 混剪用 */
  videos?: Array<{ id: string; label: string; productName?: string; approved: boolean }>
  /** 本次对话里用户附带了对标视频 */
  hasReferenceVideo: boolean
  pendingReview: number
  /** 品牌记忆（设置里填的），写文案和回复时遵守 */
  brand?: Partial<SyncBrand>
}

/** 品牌记忆转成给模型看的几行要求；没填就是空字符串 */
export function brandGuidance(brand: Partial<SyncBrand> | null | undefined): string {
  if (!brand) return ''
  const lines: string[] = []
  if (brand.brandName?.trim()) lines.push(`Brand: ${brand.brandName.trim()}`)
  if (brand.tone?.trim()) lines.push(`Brand tone: ${brand.tone.trim()}`)
  if (brand.audience?.trim()) lines.push(`Target audience: ${brand.audience.trim()}`)
  const banned = (brand.bannedWords ?? []).map((word) => word.trim()).filter(Boolean)
  if (banned.length) lines.push(`Never use these words: ${banned.join(', ')}`)
  if (brand.notes?.trim()) lines.push(`Brand notes: ${brand.notes.trim().slice(0, 600)}`)
  return lines.join('\n')
}

export type ProducerHistoryItem = { role: 'user' | 'assistant'; text: string }

const MAX_STEPS = 8

export function buildProducerSystemPrompt() {
  return [
    'You are "AI 制片人", the production assistant inside the Klipmill phone app for TikTok Shop sellers.',
    'Decide what to do with the latest user message and answer with JSON only, no markdown.',
    'Schema: {"action":"reply"|"clarify"|"plan","response":"<short Chinese message to the user>","summary":"<one-line Chinese plan summary, plan only>","steps":[{"tool":"<tool id>","title":"<short Chinese step title>","params":{...}}]}',
    'Use "plan" only when the user asks to produce something and you know which product(s) to use. Use the exact product ids from the context; never invent ids.',
    'Use "clarify" when a required product, reference video or keyword is missing or ambiguous, and ask one short question.',
    'Use "reply" for questions, greetings, or explaining what you can do.',
    'If context.brand is present, follow it in every reply and step title, and never use its banned words.',
    `At most ${MAX_STEPS} steps. Only use the tools listed. Respond to the user in Simplified Chinese.`,
  ].join('\n')
}

export function buildProducerUserPrompt(input: { message: string; context: ProducerContext; history: ProducerHistoryItem[] }) {
  return JSON.stringify({
    tools: PRODUCER_TOOLS.map(({ id, description, params }) => ({ id, description, params })),
    context: {
      products: input.context.products.slice(0, 60),
      models: input.context.models.slice(0, 30),
      videos: (input.context.videos ?? []).slice(0, 30),
      hasReferenceVideo: input.context.hasReferenceVideo,
      pendingReviewItems: input.context.pendingReview,
      ...(brandGuidance(input.context.brand) ? { brand: brandGuidance(input.context.brand) } : {}),
    },
    history: input.history.slice(-8),
    message: input.message,
  })
}

function extractJson(text: string): Record<string, unknown> {
  const source = String(text || '').trim()
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(source)?.[1]
  const candidate = fenced || source.slice(source.indexOf('{'), source.lastIndexOf('}') + 1)
  if (!candidate) throw new Error('no JSON')
  return JSON.parse(candidate) as Record<string, unknown>
}

/**
 * 解析并校验模型返回：只保留目录里的工具、只引用真实存在的商品；
 * 不合格的计划降级为追问，绝不执行模型编出来的东西。
 */
export function parseProducerDecision(text: string, context: ProducerContext): ProducerDecision {
  let raw: Record<string, unknown>
  try {
    raw = extractJson(text)
  } catch {
    const plain = String(text || '').trim()
    return { action: 'reply', response: plain.slice(0, 600) || '我没听明白，可以换个说法吗？' }
  }
  const action = String(raw.action || '').toLowerCase()
  const response = String(raw.response || '').trim()
  if (action !== 'plan') return { action: action === 'clarify' ? 'clarify' : 'reply', response: response || '可以说说你想做什么吗？' }

  const productIds = new Set(context.products.map((item) => item.id))
  const tools = new Map(PRODUCER_TOOLS.map((tool) => [tool.id, tool]))
  const steps: ProducerStep[] = []
  const problems: string[] = []
  for (const item of Array.isArray(raw.steps) ? raw.steps.slice(0, MAX_STEPS) : []) {
    const step = item as Record<string, unknown>
    const tool = tools.get(String(step?.tool || '') as ProducerToolId)
    if (!tool) continue
    const params = step.params && typeof step.params === 'object' && !Array.isArray(step.params) ? (step.params as Record<string, unknown>) : {}
    if (tool.needsProduct && !productIds.has(String(params.productId || ''))) {
      problems.push(`「${tool.title}」需要先选商品`)
      continue
    }
    if (tool.id === 'clone' && !context.hasReferenceVideo) {
      problems.push('复刻需要先附上一条对标视频')
      continue
    }
    if (tool.minVideos) {
      const known = new Set((context.videos ?? []).map((video) => video.id))
      const ids = Array.isArray(params.videoIds) ? [...new Set(params.videoIds.map(String))].filter((id) => known.has(id)) : []
      if (ids.length < tool.minVideos) {
        problems.push(tool.minVideos > 1 ? `「${tool.title}」至少需要 ${tool.minVideos} 条视频` : `「${tool.title}」需要先选视频`)
        continue
      }
      params.videoIds = ids
    }
    if (tool.id === 'watermark' && !String(params.text || '').trim()) {
      problems.push('加水印需要水印文字')
      continue
    }
    if (tool.id === 'research' && !String(params.keyword || '').trim()) {
      problems.push('选品需要一个搜索词')
      continue
    }
    steps.push({ tool: tool.id, title: String(step.title || tool.title).slice(0, 40), params })
  }
  if (!steps.length) {
    return { action: 'clarify', response: problems[0] ? `${problems[0]}，请补充一下。` : response || '想用哪个商品来做？' }
  }
  return { action: 'plan', response: response || '我安排了下面这些步骤，确认后开始执行。', summary: String(raw.summary || '').trim() || `${steps.length} 个步骤`, steps }
}
