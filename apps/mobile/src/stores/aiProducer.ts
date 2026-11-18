/**
 * 网页版替身：电脑端页面里「交给 AI 制片人」的按钮（如 GMV Max 今日诊断）在网页上打开网页版 AI 制片人。
 * 电脑端页面 import '@/stores/aiProducer'，在网页构建里解析到这里。
 */
import { router } from '@/router'

export type AiOpenOptions = { prompt?: string; send?: boolean; fresh?: boolean; context?: Record<string, unknown> }

export function useAiProducerStore() {
  return {
    async open(options: AiOpenOptions = {}) {
      await router.push({ path: '/producer', query: options.prompt ? { prompt: options.prompt } : {} })
    },
  }
}
