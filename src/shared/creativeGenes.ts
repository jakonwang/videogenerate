/**
 * 爆款基因库：把投放素材拆成几个「基因」（开头方式、节奏、讲法……），按类目汇总每种基因的转化，
 * 告诉用户「这个类目什么样的视频出单」，并在 AI 做新素材时默认套效果最好的结构。
 * 这里是主进程和界面共用的纯函数。
 */

export const GENE_DIMENSIONS = {
  hook: {
    label: '开头方式',
    values: {
      pain_point: '痛点开头', result_first: '先show效果', unboxing: '开箱', question: '提问开头', price_offer: '价格/优惠开头',
      before_after: '前后对比', try_on: '上身/上手试戴', social_proof: '好评/销量开头', curiosity: '悬念开头', other: '其他',
    },
  },
  delivery: {
    label: '讲法',
    values: { voiceover: '画外配音', talking_head: '真人出镜讲', text_only: '只有字幕', music_only: '只有音乐' },
  },
  pace: {
    label: '节奏',
    values: { fast: '快（1.5 秒内一切）', medium: '中等', slow: '慢（长镜头）' },
  },
  length: {
    label: '时长',
    values: { under15: '15 秒内', s15to30: '15–30 秒', s30to60: '30–60 秒', over60: '1 分钟以上' },
  },
  subtitle: {
    label: '字幕样式',
    values: { none: '无字幕', plain: '普通字幕', bold_highlight: '大字高亮', emoji: '带表情符号' },
  },
  person: {
    label: '出镜',
    values: { model: '模特/真人', hands: '只露手', product_only: '只拍商品' },
  },
  cta: {
    label: '结尾引导',
    values: { yes: '有明确引导下单', no: '没有引导' },
  },
} as const

export type GeneDimension = keyof typeof GENE_DIMENSIONS
export type CreativeGenes = { [K in GeneDimension]?: keyof (typeof GENE_DIMENSIONS)[K]['values'] } & {
  /** 卖点顺序（AI 写的短句，比如「材质 → 上耳效果 → 价格」） */
  sellingOrder?: string
}
export const GENE_DIMENSION_KEYS = Object.keys(GENE_DIMENSIONS) as GeneDimension[]

export function geneLabel(dimension: GeneDimension, value: string) {
  return (GENE_DIMENSIONS[dimension].values as Record<string, string>)[value] || value
}

/** 时长和节奏用视频本身算，不靠 AI 猜 */
export function measuredGenes(input: { durationSec: number; cutCount: number }): Pick<CreativeGenes, 'length' | 'pace'> {
  const d = Math.max(0, input.durationSec)
  const length = d < 15 ? 'under15' : d < 30 ? 's15to30' : d < 60 ? 's30to60' : 'over60'
  const avgShot = d / Math.max(1, input.cutCount + 1)
  const pace = avgShot <= 1.5 ? 'fast' : avgShot <= 3.5 ? 'medium' : 'slow'
  return { length, pace }
}

export const GENE_AI_SYSTEM = [
  'You analyze the structure of a TikTok Shop selling video from a few frames (in time order) and its transcript.',
  'Classify it with exactly these keys and allowed values:',
  ...(['hook', 'delivery', 'subtitle', 'person', 'cta'] as const).map((key) => `- ${key}: ${Object.keys(GENE_DIMENSIONS[key].values).join(' | ')}`),
  '- sellingOrder: the order of selling points in 3-6 words joined by " → ", in Chinese.',
  'Reply with JSON only, e.g. {"hook":"pain_point","delivery":"voiceover","subtitle":"plain","person":"hands","cta":"yes","sellingOrder":"材质 → 上耳效果 → 价格"}',
].join('\n')

/** AI 返回 → 只留合法的值 */
export function parseGenes(content: string): CreativeGenes | null {
  const text = String(content || '')
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const raw = JSON.parse(text.slice(start, end + 1))
    const out: Record<string, string> = {}
    for (const key of ['hook', 'delivery', 'subtitle', 'person', 'cta'] as const) {
      const value = String(raw?.[key] ?? '').trim()
      if (value in GENE_DIMENSIONS[key].values) out[key] = value
    }
    if (!Object.keys(out).length) return null
    const order = String(raw?.sellingOrder ?? '').trim().slice(0, 60)
    if (order) out.sellingOrder = order
    return out as CreativeGenes
  } catch {
    return null
  }
}

export type GeneSample = { creativeId: string; genes: CreativeGenes; spend: number; revenue: number; orders: number }
export type GeneValueStat = { dimension: GeneDimension; value: string; label: string; creatives: number; spend: number; revenue: number; orders: number; roi: number; lift: number }
export type GeneDimensionStat = { dimension: GeneDimension; label: string; values: GeneValueStat[]; best?: GeneValueStat }
export type GeneReport = {
  category: string
  analyzed: number
  measured: number
  avgRoi: number
  dimensions: GeneDimensionStat[]
  /** 每个维度效果最好的值拼成的「最佳结构」 */
  bestRecipe: GeneValueStat[]
}

/** 一个值至少要 2 条有花费的素材才算数，少于这个不下结论 */
export const GENE_MIN_SAMPLES = 2
const round = (value: number, digits = 2) => Math.round(value * 10 ** digits) / 10 ** digits

export function aggregateGenes(category: string, samples: GeneSample[]): GeneReport {
  const measured = samples.filter((sample) => sample.spend > 0)
  const spend = measured.reduce((sum, s) => sum + s.spend, 0)
  const revenue = measured.reduce((sum, s) => sum + s.revenue, 0)
  const avgRoi = spend > 0 ? revenue / spend : 0
  const dimensions: GeneDimensionStat[] = GENE_DIMENSION_KEYS.map((dimension) => {
    const byValue = new Map<string, GeneValueStat>()
    for (const sample of measured) {
      const value = sample.genes[dimension] as string | undefined
      if (!value) continue
      const row = byValue.get(value) || { dimension, value, label: geneLabel(dimension, value), creatives: 0, spend: 0, revenue: 0, orders: 0, roi: 0, lift: 0 }
      row.creatives += 1
      row.spend += sample.spend
      row.revenue += sample.revenue
      row.orders += sample.orders
      byValue.set(value, row)
    }
    const values = [...byValue.values()].map((row) => {
      const roi = row.spend > 0 ? row.revenue / row.spend : 0
      return { ...row, spend: round(row.spend), revenue: round(row.revenue), roi: round(roi), lift: avgRoi > 0 ? round(roi / avgRoi - 1, 3) : 0 }
    }).sort((a, b) => b.roi - a.roi)
    const eligible = values.filter((row) => row.creatives >= GENE_MIN_SAMPLES)
    // 只有一个值的维度没法比，不给「最佳」
    const best = eligible.length >= 2 && eligible[0]!.lift > 0 ? eligible[0] : undefined
    return { dimension, label: GENE_DIMENSIONS[dimension].label, values, ...(best ? { best } : {}) }
  })
  return {
    category,
    analyzed: samples.length,
    measured: measured.length,
    avgRoi: round(avgRoi),
    dimensions,
    bestRecipe: dimensions.map((d) => d.best).filter((row): row is GeneValueStat => Boolean(row)),
  }
}

/** 给 AI 制片人的规划提示：这个类目验证过的结构 */
export function geneGuidance(report: GeneReport): string {
  if (!report.bestRecipe.length) return ''
  const parts = report.bestRecipe.map((row) => `${GENE_DIMENSIONS[row.dimension].label}=${row.label} (ROI ${row.roi}, +${Math.round(row.lift * 100)}% vs category average, ${row.creatives} creatives)`)
  return `Sales-proven video structure for the "${report.category}" category (from ${report.measured} ad creatives with spend): ${parts.join('; ')}. Use this structure by default for new videos unless the user asks otherwise.`
}

export function normalizeCategory(value: unknown) {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 60)
}
