/**
 * 网页版的商品库：电脑端「商品库」「商品详情」页面（ProductLibraryView / ProductDetailView）在网页上原样显示。
 *
 * - 商品本身（列表、编辑、删除、提示词版本、AI 分析 / 标准源图）在**服务器引擎**上执行，跑电脑端同一套商品代码；
 *   引擎里的商品经云同步和电脑端互通（AI 结果和生成图也同步，见 src/main/modules/cloud-sync/productBridge.ts）。
 * - 商品详情里的投放 / 内容表现、商品记忆、关联 TikTok 商品要用电脑上的数据：经电脑代办交给电脑。
 *   引擎里的商品 id 先换成云端 id，电脑再换成自己的（relayWorker）。
 * - 选图：上传到云端（cloudfile:），引擎用的时候自动下载。
 */
import type { DesktopApi } from './contract'
import { cloud } from '../session'
import { toast } from '../toast'
import { getPathForFile, pickFiles } from './files'

type Products = DesktopApi['products']
type ContentHub = DesktopApi['contentHub']

const engine = <T>(method: string, args: unknown[]) => cloud.relay.call<T>('products', method, args, 'server')
const onEngine =
  <K extends keyof Products>(method: K) =>
  (...args: Parameters<Products[K]>) =>
    engine<Awaited<ReturnType<Products[K]>>>(method, args)

const products = {
  list: onEngine('list'),
  upsert: onEngine('upsert'),
  remove: onEngine('remove'),
  listPromptVersions: onEngine('listPromptVersions'),
  savePromptVersion: onEngine('savePromptVersion'),
  activatePromptVersion: onEngine('activatePromptVersion'),
  rollbackPromptVersion: onEngine('rollbackPromptVersion'),
  refreshCanonicalSource: onEngine('refreshCanonicalSource'),
  refreshProductAnalysis: onEngine('refreshProductAnalysis'),
  ensureSegmentBucketsFromTemplates: onEngine('ensureSegmentBucketsFromTemplates'),
} satisfies Products

/** 引擎里的商品 id → 云端 id（同一个商品在电脑上的 id 可能不同，电脑按云端 id 找回自己的） */
const cloudIds = new Map<string, Promise<string>>()
function cloudIdOf(id: string) {
  let hit = cloudIds.get(id)
  if (!hit) {
    hit = engine<string>('cloudIdOf', [id]).catch(() => id)
    cloudIds.set(id, hit)
  }
  return hit
}

/** 电脑不在线时，商品空间里的投放 / 内容数据是空的：提示一次原因（页面本身不显示这个错误） */
let offlineNoticeAt = 0
const desktop = <T>(method: string, args: unknown[]) =>
  cloud.relay.call<T>('contentHub', method, args).catch((error) => {
    if ((error as { code?: string })?.code === 'DESKTOP_OFFLINE' && Date.now() - offlineNoticeAt > 60_000) {
      offlineNoticeAt = Date.now()
      toast('商品的投放和内容表现要电脑在线才能查看：打开电脑上的 Klipmill（登录同一账号）后刷新')
    }
    throw error
  })
const withCloudId = async <T extends { productId: string }>(payload: T) => ({ ...payload, productId: await cloudIdOf(payload.productId) })

const contentHub = {
  productOverview: async (productId: string) => desktop<Awaited<ReturnType<ContentHub['productOverview']>>>('productOverview', [await cloudIdOf(productId)]),
  creativeGenes: async (productId: string) => desktop<Awaited<ReturnType<ContentHub['creativeGenes']>>>('creativeGenes', [await cloudIdOf(productId)]),
  analyzeCreativeGenes: async (productId: string) => desktop<Awaited<ReturnType<ContentHub['analyzeCreativeGenes']>>>('analyzeCreativeGenes', [await cloudIdOf(productId)]),
  saveProductMemory: async (payload: { productId: string } & Record<string, unknown>) => desktop<Awaited<ReturnType<ContentHub['saveProductMemory']>>>('saveProductMemory', [await withCloudId(payload)]),
  linkProductChannels: async (payload: Parameters<ContentHub['linkProductChannels']>[0]) => desktop<Awaited<ReturnType<ContentHub['linkProductChannels']>>>('linkProductChannels', [await withCloudId(payload)]),
  linkContentPerformance: (payload: Parameters<ContentHub['linkContentPerformance']>[0]) => desktop<Awaited<ReturnType<ContentHub['linkContentPerformance']>>>('linkContentPerformance', [payload]),
  unlinkContentPerformance: (ref: string) => desktop<Awaited<ReturnType<ContentHub['unlinkContentPerformance']>>>('unlinkContentPerformance', [ref]),
  downloadCreativeVideo: (creativeId: string) => desktop<Awaited<ReturnType<ContentHub['downloadCreativeVideo']>>>('downloadCreativeVideo', [creativeId]),
} satisfies Partial<ContentHub>

/** 这两个页面打开期间替换的 window.api 部分 */
export default {
  products,
  contentHub,
  pickFiles,
  getPathForFile,
}
