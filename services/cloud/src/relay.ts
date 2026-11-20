import { randomUUID } from 'node:crypto'
import { CloudError, badRequest } from './security'
import { RELAY_NAMESPACES, relayAllows, type RelayCall, type RelayResult } from '../../../src/shared/cloud/relay'

/**
 * 电脑代办（实时）：网页调用电脑端的功能（GMV Max、达人中心——需要电脑上的 TikTok 登录），
 * 云端只在内存里转交请求和结果，不保存数据，几乎不占资源。
 *
 * - 电脑端长轮询 GET /relay/next 取请求，执行后 POST /relay/result 回传；
 * - 网页 POST /relay/call 等结果（最长 CALL_TIMEOUT_MS），电脑 30 秒内没来取过就直接返回「电脑端不在线」。
 */

const CALL_TIMEOUT_MS = 120_000
const POLL_WAIT_MS = 25_000
const DESKTOP_FRESH_MS = 40_000
const MAX_QUEUE = 50

type Pending = { call: RelayCall; resolve: (result: RelayResult) => void; timer: NodeJS.Timeout }
type UserRelay = {
  queue: RelayCall[]
  pending: Map<string, Pending>
  waiter: ((calls: RelayCall[]) => void) | null
  lastPollAt: number
}

export function createRelay() {
  const users = new Map<string, UserRelay>()
  const of = (userId: string) => {
    let entry = users.get(userId)
    if (!entry) users.set(userId, (entry = { queue: [], pending: new Map(), waiter: null, lastPollAt: 0 }))
    return entry
  }

  function online(userId: string) {
    const entry = users.get(userId)
    return Boolean(entry && (entry.waiter || Date.now() - entry.lastPollAt < DESKTOP_FRESH_MS))
  }

  /** Web side: run one call on the user's computer and wait for its answer. */
  async function call(userId: string, body: { ns?: unknown; method?: unknown; args?: unknown }): Promise<unknown> {
    const ns = String(body?.ns || '')
    const method = String(body?.method || '')
    if (!(RELAY_NAMESPACES as readonly string[]).includes(ns)) throw badRequest(`不支持的功能：${ns}`)
    if (!/^[a-zA-Z][a-zA-Z0-9]{0,63}$/.test(method)) throw badRequest('方法名不合法')
    if (!relayAllows(ns, method)) throw badRequest('这个操作需要在电脑端完成')
    const args = Array.isArray(body?.args) ? body.args : []
    if (!online(userId)) throw new CloudError('DESKTOP_OFFLINE', '电脑端不在线：请打开电脑上的 Vidloom 并登录同一账号', 503)
    const entry = of(userId)
    if (entry.queue.length >= MAX_QUEUE) throw new CloudError('RATE_LIMITED', '电脑端忙，请稍后再试', 429)
    const relayCall: RelayCall = { id: randomUUID(), ns, method, args }
    const result = await new Promise<RelayResult>((resolve) => {
      const timer = setTimeout(() => {
        entry.pending.delete(relayCall.id)
        entry.queue = entry.queue.filter((item) => item.id !== relayCall.id)
        resolve({ id: relayCall.id, ok: false, error: '电脑端没有及时响应，请稍后刷新再试' })
      }, CALL_TIMEOUT_MS)
      entry.pending.set(relayCall.id, { call: relayCall, resolve, timer })
      entry.queue.push(relayCall)
      if (entry.waiter) {
        const waiter = entry.waiter
        entry.waiter = null
        waiter(entry.queue.splice(0))
      }
    })
    if (!result.ok) throw new CloudError('RELAY_FAILED', String(result.error || '电脑端执行失败').slice(0, 500), 502)
    return { result: result.result }
  }

  /** Desktop side: wait (long poll) for calls from the web. */
  async function next(userId: string, waitMs = POLL_WAIT_MS): Promise<{ calls: RelayCall[] }> {
    const entry = of(userId)
    entry.lastPollAt = Date.now()
    if (entry.queue.length) return { calls: entry.queue.splice(0) }
    if (entry.waiter) entry.waiter([]) // a newer poll replaces an older one
    const calls = await new Promise<RelayCall[]>((resolve) => {
      const timer = setTimeout(() => {
        if (entry.waiter === done) entry.waiter = null
        resolve([])
      }, Math.max(1000, Math.min(POLL_WAIT_MS, waitMs)))
      const done = (items: RelayCall[]) => {
        clearTimeout(timer)
        resolve(items)
      }
      entry.waiter = done
    })
    // Freshness counts from when a poll starts: a computer that died mid-poll must not look online afterwards.
    return { calls }
  }

  /** Desktop side: hand back one call's result. */
  function result(userId: string, body: RelayResult) {
    const entry = users.get(userId)
    const pending = entry?.pending.get(String(body?.id || ''))
    if (!entry || !pending) return { ok: true, stale: true }
    clearTimeout(pending.timer)
    entry.pending.delete(pending.call.id)
    pending.resolve({ id: pending.call.id, ok: Boolean(body.ok), result: body.result, error: body.error })
    return { ok: true }
  }

  return { call, next, result, online: (userId: string) => ({ online: online(userId) }) }
}

export type RelayService = ReturnType<typeof createRelay>
