/**
 * 网页版替身：电脑端 `@/lib/webApiClient`（本机 Web API 客户端）。
 * 用同一个 createWebApiClient，只把「发请求」换成交给服务器引擎（cloud.relay → engine 里的同一个 Web API，
 * 见 services/cloud/engine/cloneWorker.ts 的 webApiRequest）。网页不需要本机登录令牌。
 */
import { createWebApiClient } from '@shared/web-api/client'
import { cloud, errorMessage } from '@/lib/session'
import type { BatchSubtitleJob } from '@shared/web-api/types'

export type * from '@shared/web-api/types'

const ENGINE_BASE = 'https://engine.local'

/** fetch 的替身：把路径、方法、JSON 请求体交给引擎，结果包成一个 Response */
async function engineFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
  const path = `${url.pathname}${url.search}`
  let body: unknown
  if (typeof init?.body === 'string' && init.body) {
    try {
      body = JSON.parse(init.body)
    } catch {
      body = init.body
    }
  }
  try {
    const result = await cloud.relay.call<unknown>('webApi', 'request', [{ method: init?.method || 'GET', path, body }], 'server')
    return new Response(JSON.stringify(result ?? { ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: errorMessage(error) }), { status: 400, headers: { 'Content-Type': 'application/json' } })
  }
}

const client = createWebApiClient({ getBaseUrl: () => ENGINE_BASE, fetch: engineFetch as typeof fetch })

/** 渲染一整批要很久（中转最多等 10 分钟），网页不干等：几秒内没做完就先返回「处理中」的任务，
 *  服务器继续渲染，页面靠原有的轮询看进度。几秒内就出错的照常报错。 */
const RENDER_WAIT_MS = 4000
async function startInBackground(jobId: string, run: Promise<BatchSubtitleJob>): Promise<BatchSubtitleJob> {
  const settled = await Promise.race([
    run.then(
      (job) => ({ job }),
      (error: unknown) => ({ error }),
    ),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), RENDER_WAIT_MS)),
  ])
  if (settled && 'error' in settled) throw settled.error
  if (settled) return settled.job
  run.catch(() => undefined)
  const job = (await client.listBatchSubtitleJobs()).find((item) => item.id === jobId)
  if (!job) throw new Error('任务已提交，请稍后刷新查看进度')
  return { ...job, status: job.status === 'completed' || job.status === 'partial_failed' || job.status === 'failed' ? job.status : 'processing' }
}

export const webApiClient: typeof client = {
  ...client,
  runBatchSubtitleJob: (jobId) => startInBackground(jobId, client.runBatchSubtitleJob(jobId)),
  resumeBatchSubtitleJob: (jobId, input) => startInBackground(jobId, client.resumeBatchSubtitleJob(jobId, input)),
}

/* 电脑端的本机登录令牌：网页上用不到（引擎里按用户自己的数据处理） */
export const getStoredWebToken = () => ''
export const hasStoredWebToken = () => false
export const setStoredWebToken = (_token: string) => undefined
export const clearStoredWebToken = () => undefined
export const validateStoredWebSession = async () => true
