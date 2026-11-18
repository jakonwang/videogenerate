import { router } from '@/router'

/**
 * 网页版替身：电脑端页面里的 `useAiProducerStore().open(...)`（交给 AI / 配方）打开网页的 AI 制片人，
 * 把目标或配方说明放进输入框，用户确认后发送。
 */

const RECIPES: Record<string, string> = {
  autopilot: '全自动打爆：从选品到发布草稿一条龙——建商品 → 找爆款参考 → 复刻成片 → 质检 → 排期 → 复盘',
  'product-content-pack': '一个商品，一套内容：选商品和参考视频，自动复刻成片，并把分镜做成图生视频 / 创意短视频',
  'scene-images': '场景图批量出片：把好看的场景图换成我的商品，批量出短视频 / 图生视频',
  'follow-viral': '跟拍一条爆款：贴爆款链接，自动解析下载，为每个商品复刻一条',
  'research-winners': '爆品转商品：把选品方案里测款结论为「爆品」的商品建入商品库',
  'import-link': '贴链接建商品：贴一个商品页链接，自动读取标题和主图创建商品',
  'publish-approved': '通过的内容排期发布：把审核通过的视频生成发布草稿',
}

type OpenOptions = { prompt?: string; recipeId?: string; fresh?: boolean; send?: boolean; context?: unknown }

export function useAiProducerStore() {
  return {
    async open(options: OpenOptions = {}) {
      const prompt = options.prompt?.trim() || (options.recipeId ? RECIPES[options.recipeId] ?? '' : '')
      await router.push(prompt ? { path: '/producer', query: { prompt } } : '/producer')
    },
  }
}
