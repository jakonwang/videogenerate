import type { CostEstimate } from './types'

type StepLike = { intentType: string; title?: string; input?: Record<string, unknown> }

/** Rough per-unit costs used for the plan card. Values are deliberately conservative. */
const UNIT_COST: Record<string, { modelCalls: number; accountCredits: number; minutes: number; unit: string }> = {
  'Intent.CommerceVideoCreate': { modelCalls: 16, accountCredits: 0, minutes: 25, unit: '条复刻视频' },
  'Intent.LivePhotoCreate': { modelCalls: 3, accountCredits: 0, minutes: 6, unit: '个 Live Photo' },
  'Intent.LivePhotoFromVideo': { modelCalls: 0, accountCredits: 0, minutes: 1, unit: '个 Live Photo（仅打包）' },
  'Intent.CreativeFromImages': { modelCalls: 2, accountCredits: 1, minutes: 6, unit: '条创意短视频' },
  'Intent.TiktokCreativeManage': { modelCalls: 2, accountCredits: 1, minutes: 6, unit: '条创意短视频' },
  'Intent.CloneShotsSend': { modelCalls: 3, accountCredits: 0, minutes: 6, unit: '个分镜' },
  'Intent.SubtitleGenerate': { modelCalls: 1, accountCredits: 0, minutes: 2, unit: '条字幕' },
  'Intent.ListingGenerate': { modelCalls: 3, accountCredits: 0, minutes: 3, unit: '条上架文案' },
  'Intent.ProductAnalyze': { modelCalls: 2, accountCredits: 0, minutes: 2, unit: '次商品分析' },
  'Intent.ModelIdentityManage': { modelCalls: 2, accountCredits: 0, minutes: 3, unit: '次模特操作' },
  'Intent.MaterialPrepare': { modelCalls: 1, accountCredits: 0, minutes: 3, unit: '批素材' },
  'Intent.SourceVideoImport': { modelCalls: 0, accountCredits: 0, minutes: 1, unit: '条链接' },
  'Intent.ProductImportFromLink': { modelCalls: 0, accountCredits: 0, minutes: 1, unit: '个商品' },
  'Intent.VideoSlice': { modelCalls: 0, accountCredits: 0, minutes: 2, unit: '条长视频' },
  'Intent.ProductionBatchCreate': { modelCalls: 0, accountCredits: 0, minutes: 2, unit: '条混剪' },
}

const DANGEROUS_INTENTS: Record<string, string> = {
  'Intent.ProductManage': '可能删除商品',
  'Intent.MaterialManage': '可能删除素材',
  'Intent.SourceVideoManage': '可能删除来源视频',
  'Intent.TemplateManage': '可能删除模板',
  'Intent.ProductionTaskManage': '可能取消或删除任务',
  'Intent.ProductionQueueControl': '会暂停或取消整个生产队列',
  'Intent.ListingManage': '可能删除上架记录',
  'Intent.PublishDraft': '生成发布草稿（实际发布仍需你在发布中心确认）',
}

function quantityFor(step: StepLike) {
  const input = step.input || {}
  const count = (key: string) => (Array.isArray(input[key]) ? (input[key] as unknown[]).length : 0)
  if (step.intentType === 'Intent.CommerceVideoCreate') {
    // Variants of a proven project: one new project each, capped like the capability caps it.
    if (String(input.variantOfProjectId || '').trim()) return Math.max(1, Math.min(4, Math.floor(Number(input.variantProjects) || 1)))
    // One clone project per (reference video × product) pair; links imported upstream count as references.
    const references = Math.max(1, count('referenceVideoPaths') || count('shareUrls') || count('videoPaths') || Math.min(6, Number(input.referenceCount) || 0))
    return Math.min(12, references * Math.max(1, count('productIds')))
  }
  const arrays = ['shotIds', 'referenceImagePaths', 'imagePaths', 'shareUrls', 'productIds', 'videoPaths', 'refs']
  for (const key of arrays) {
    const value = input[key]
    if (Array.isArray(value) && value.length) return value.length
  }
  const quantity = Number(input.quantity || input.count || 1)
  return Number.isFinite(quantity) && quantity > 0 ? Math.min(100, Math.round(quantity)) : 1
}

export function estimatePlanCost(steps: StepLike[]): CostEstimate {
  const estimate: CostEstimate = { modelCalls: 0, accountCredits: 0, minutes: 0, notes: [], dangerousSteps: [] }
  for (const step of steps) {
    const unit = UNIT_COST[step.intentType]
    const quantity = quantityFor(step)
    if (unit) {
      estimate.modelCalls += unit.modelCalls * quantity
      estimate.accountCredits += unit.accountCredits * quantity
      estimate.minutes += unit.minutes * quantity
      if (unit.modelCalls || unit.accountCredits) estimate.notes.push(`${step.title || step.intentType}：约 ${quantity} ${unit.unit}`)
    } else {
      estimate.minutes += 0.5
    }
    const danger = DANGEROUS_INTENTS[step.intentType]
    if (danger) estimate.dangerousSteps.push(`${step.title || step.intentType}：${danger}`)
  }
  estimate.minutes = Math.max(1, Math.round(estimate.minutes))
  return estimate
}
