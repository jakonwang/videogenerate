import { AsyncLocalStorage } from 'node:async_hooks'
import type { BillingCapability, UsageClient } from '../../../shared/cloud/billing'

/**
 * 点数计费挂钩：每次向 AI 平台发起视频 / 图片生成前先冻结点数，成功确认，失败退回。
 *
 * - 服务器复刻引擎会注册计量器（向云端冻结 / 结算）。电脑端商业版不注册：它的生成请求走云端 AI 代理，由云端扣点（services/cloud/src/aiProxy.ts）。
 * - 内部版和云端自己的生成任务不注册，这里直接放行。
 * - 嵌套调用（一个计费函数里又调了另一个）只算外层一次。
 */

export type UsageCharge = { capability: BillingCapability; platform: string; model: string }

export type UsageMeter = {
  /** 冻结点数，返回冻结记录 id；点数不足、套餐不含时抛错（错误信息直接给用户看） */
  hold: (charge: UsageCharge & { feature?: string }) => Promise<string>
  settle: (holdId: string, ok: boolean, reason?: string) => Promise<void>
}

let meter: UsageMeter | null = null
const scope = new AsyncLocalStorage<{ feature?: string; inside?: boolean }>()

export function setUsageMeter(next: UsageMeter | null) {
  meter = next
}

export function hasUsageMeter() {
  return meter !== null
}

/** 标记这段调用来自哪个功能（复刻、图生视频……），只用于后台统计 */
export function runWithUsageFeature<T>(feature: string, fn: () => T): T {
  return scope.run({ ...scope.getStore(), feature }, fn)
}

type MeterClient = {
  holdUsage: (input: { capability: BillingCapability; platform: string; model: string; client?: UsageClient; feature?: string }) => Promise<{ hold: { id: string } }>
  settleUsage: (holdId: string, ok: boolean, reason?: string) => Promise<unknown>
}

/**
 * 向云端冻结 / 结算的计量器。
 * shouldCharge 返回 false 时不计费（例如电脑端没有使用后台下发的平台密钥，用的是用户自己的 Key）。
 */
export function createCloudUsageMeter(options: { client: () => MeterClient | null; clientKind: UsageClient; shouldCharge?: () => boolean }): UsageMeter {
  return {
    async hold(charge) {
      if (options.shouldCharge && !options.shouldCharge()) return ''
      const client = options.client()
      if (!client) throw new Error('请先登录账号再生成')
      try {
        const { hold } = await client.holdUsage({ ...charge, client: options.clientKind })
        return hold.id
      } catch (error) {
        const code = (error as { code?: string })?.code
        if (code === 'NETWORK') throw new Error('连不上云端服务器，暂时无法生成（生成要先在云端扣点），请检查网络后重试')
        throw error
      }
    },
    async settle(holdId, ok, reason) {
      if (!holdId) return
      const client = options.client()
      if (!client) return
      // 网络抖动时多试几次；仍失败的冻结 12 小时后由云端自动确认
      for (let attempt = 0; attempt < 4; attempt += 1) {
        try {
          await client.settleUsage(holdId, ok, reason)
          return
        } catch (error) {
          if ((error as { code?: string })?.code !== 'NETWORK') throw error
          await new Promise((resolve) => setTimeout(resolve, 2_000 * (attempt + 1)))
        }
      }
    },
  }
}

export async function withUsageCharge<T>(charge: UsageCharge, fn: () => Promise<T>): Promise<T> {
  const current = meter
  const store = scope.getStore()
  if (!current || store?.inside) return await fn()
  const holdId = await current.hold({ ...charge, feature: store?.feature })
  if (!holdId) return await scope.run({ ...store, inside: true }, fn)
  let result: T
  try {
    result = await scope.run({ ...store, inside: true }, fn)
  } catch (error) {
    const reason = String((error as Error)?.message || error).slice(0, 200)
    void current.settle(holdId, false, reason).catch((settleError) => console.warn('[usage-meter] 退回点数失败', holdId, settleError))
    throw error
  }
  void current.settle(holdId, true).catch((settleError) => console.warn('[usage-meter] 确认扣点失败', holdId, settleError))
  return result
}
