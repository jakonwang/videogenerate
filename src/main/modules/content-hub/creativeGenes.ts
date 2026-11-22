/**
 * 爆款基因库（主进程）：
 *   分析：商品近 30 天有花费的投放素材 → 下载原视频 → 量时长和剪辑节奏 → 抽 4 帧 + 识别口播 → AI 标出开头方式等基因
 *   汇总：同一类目下所有分析过的素材，按基因看 ROI，得出「这个类目什么样的视频出单」
 *   使用：AI 制片人规划新素材时带上最佳结构（brandMemory 里接入）
 * 每条素材只分析一次（结果存 creative-genes.json）；分析会下载视频、调 AI，所以由用户点按钮触发。
 */
import { mkdir, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { getAppPaths } from '../../lib/paths'
import { runFfmpeg } from '../ffmpeg/runner'
import { probeMedia } from '../ffmpeg/probe'
import { detectSceneCuts } from '../clone/analyzer'
import { cloneRepo } from '../clone/repo'
import { generateChatCompletion, type ChatImageInput } from '../clone/unifiedChat'
import { gmvMaxRepo } from '../tiktok-gmv-max/sqlite'
import { productsRepo } from '../products/repo'
import { recognizeSpeech } from '../tiktok-publisher/localize'
import { downloadCreativeVideo } from './creativeVideo'
import { readCreativesForProducts } from './publishProfit'
import { createJsonStore } from './stores'
import {
  GENE_AI_SYSTEM,
  aggregateGenes,
  geneGuidance,
  measuredGenes,
  normalizeCategory,
  parseGenes,
  type CreativeGenes,
  type GeneReport,
} from '../../../shared/creativeGenes'

export type GeneRecord = { creativeId: string; productId: string; category: string; genes: CreativeGenes; analyzedAt: number }
type GeneDb = { schemaVersion: 1; records: Record<string, GeneRecord>; failed: Record<string, { error: string; at: number }> }

export const geneStore = createJsonStore<GeneDb>('creative-genes.json', () => ({ schemaVersion: 1, records: {}, failed: {} }), (db) => ({
  schemaVersion: 1,
  records: db?.records && typeof db.records === 'object' ? db.records : {},
  failed: db?.failed && typeof db.failed === 'object' ? db.failed : {},
}))

/** 一次最多分析几条（按花费从高到低），控制下载和 AI 的消耗 */
export const GENE_ANALYZE_BATCH = 8
/** 下载失败的素材隔多久再试 */
const RETRY_FAILED_MS = 24 * 3600_000

type Deps = {
  download: (creativeId: string) => Promise<{ localVideoPath?: string; error?: string }>
  recognize: (videoPath: string) => Promise<Array<{ text: string }>>
  ai: (input: { system: string; prompt: string; images: ChatImageInput[] }) => Promise<string>
  creatives: (productIds: string[]) => Array<{ creativeId: string; productId: string; spend: number; revenue: number; orders: number }>
  productCategory: (productIds: string[]) => string
  now: () => number
}
const defaultDeps: Deps = {
  download: async (creativeId) => {
    const result = await downloadCreativeVideo({ creativeId, timeoutMs: 180_000 })
    return { localVideoPath: result.localVideoPath, error: result.error }
  },
  recognize: (videoPath) => recognizeSpeech(videoPath),
  ai: async ({ system, prompt, images }) => {
    const response = await generateChatCompletion({ credentials: await cloneRepo.getCredentials(), system, prompt, images, timeoutMs: 90_000 })
    return String(response.content || '')
  },
  creatives: (productIds) => readCreativesForProducts(productIds),
  productCategory: (productIds) => {
    try {
      const costs = gmvMaxRepo.listProductCosts()
      return costs.find((item) => productIds.includes(item.productId) && item.categoryName)?.categoryName || ''
    } catch {
      return ''
    }
  },
  now: () => Date.now(),
}
let deps: Deps = defaultDeps
export function setGeneTestDependencies(next: Partial<Deps>) { deps = { ...defaultDeps, ...next } }

/** 商品的类目：店铺类目（GMV MAX 商品资料）> AI 识别的品类 > 商品类型 */
async function productScope(productId: string) {
  const product = (await productsRepo.list()).find((item) => item.id === productId)
  const tiktokProductIds = [...new Set((product?.tiktokProductIds || []).map((id) => String(id).trim()).filter(Boolean))]
  const category = normalizeCategory(deps.productCategory(tiktokProductIds) || product?.productAnalysis?.category || product?.type || '')
  return { product, tiktokProductIds, category }
}

async function sampleFrames(videoPath: string, durationSec: number, workDir: string): Promise<ChatImageInput[]> {
  const images: ChatImageInput[] = []
  for (const [index, ratio] of [0.05, 0.3, 0.6, 0.9].entries()) {
    const out = join(workDir, `frame-${index}.jpg`)
    await runFfmpeg({ args: ['-y', '-ss', (durationSec * ratio).toFixed(2), '-i', videoPath, '-frames:v', '1', '-vf', 'scale=360:-2', '-q:v', '4', out] })
    images.push({ label: `frame ${index + 1} at ${Math.round(ratio * 100)}%`, mimeType: 'image/jpeg', base64: (await readFile(out)).toString('base64') })
  }
  return images
}

/** 分析一条视频的基因。时长、节奏量出来；其他让 AI 看帧和口播判断。 */
export async function analyzeVideoGenes(videoPath: string): Promise<CreativeGenes> {
  const probe = await probeMedia(videoPath)
  const durationSec = probe.durationSec || 0
  const cuts = await detectSceneCuts(videoPath)
  const measured = measuredGenes({ durationSec, cutCount: cuts.length })
  const workDir = join(getAppPaths().tmpDir, 'creative-genes', `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
  await mkdir(workDir, { recursive: true })
  try {
    const images = await sampleFrames(videoPath, durationSec, workDir)
    const transcript = (await deps.recognize(videoPath).catch(() => [])).map((cue) => cue.text).join(' ').slice(0, 1500)
    const content = await deps.ai({ system: GENE_AI_SYSTEM, prompt: JSON.stringify({ durationSec: Math.round(durationSec), transcript: transcript || '(no speech)' }), images })
    const genes = parseGenes(content)
    if (!genes) throw new Error('AI 没有返回可用的结构分析')
    // 没有口播却说是配音，以识别结果为准
    if (!transcript && (genes.delivery === 'voiceover' || genes.delivery === 'talking_head')) genes.delivery = 'music_only'
    return { ...genes, ...measured }
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined)
  }
}

// ---------- 后台分析任务（每个商品一个） ----------
export type GeneJob = { productId: string; running: boolean; total: number; done: number; failed: number; current?: string; stage?: 'downloading' | 'analyzing'; finishedAt?: number; lastError?: string }
const jobs = new Map<string, GeneJob>()
const isVideoCreative = (creativeId: string) => /^\d{8,25}$/.test(creativeId)

async function pendingCreatives(productId: string) {
  const { tiktokProductIds, category } = await productScope(productId)
  const db = await geneStore.read()
  const now = deps.now()
  const candidates = deps.creatives(tiktokProductIds)
    .filter((creative) => creative.spend > 0 && isVideoCreative(creative.creativeId) && !db.records[creative.creativeId])
    .filter((creative) => !db.failed[creative.creativeId] || now - db.failed[creative.creativeId]!.at > RETRY_FAILED_MS)
    .sort((a, b) => b.spend - a.spend)
  return { candidates, category }
}

async function runJob(productId: string) {
  const job = jobs.get(productId)!
  try {
    const { candidates, category } = await pendingCreatives(productId)
    const batch = candidates.slice(0, GENE_ANALYZE_BATCH)
    job.total = batch.length
    for (const creative of batch) {
      job.current = creative.creativeId
      try {
        job.stage = 'downloading'
        const video = await deps.download(creative.creativeId)
        if (!video.localVideoPath) throw new Error(video.error || '原视频下载失败')
        job.stage = 'analyzing'
        const genes = await analyzeVideoGenes(video.localVideoPath)
        await geneStore.mutate((db) => {
          db.records[creative.creativeId] = { creativeId: creative.creativeId, productId: creative.productId, category, genes, analyzedAt: deps.now() }
          delete db.failed[creative.creativeId]
        })
      } catch (error: any) {
        job.failed += 1
        job.lastError = String(error?.message || error).slice(0, 300)
        await geneStore.mutate((db) => { db.failed[creative.creativeId] = { error: job.lastError!, at: deps.now() } })
      }
      job.done += 1
    }
  } catch (error: any) {
    job.lastError = String(error?.message || error).slice(0, 300)
  } finally {
    job.running = false
    job.current = undefined
    job.stage = undefined
    job.finishedAt = deps.now()
  }
}

export const creativeGenes = {
  /** 开始分析这个商品的投放素材（已在跑就返回当前进度） */
  async analyze(productId: string): Promise<GeneJob> {
    const existing = jobs.get(productId)
    if (existing?.running) return { ...existing }
    const job: GeneJob = { productId, running: true, total: 0, done: 0, failed: 0 }
    jobs.set(productId, job)
    void runJob(productId)
    return { ...job }
  },

  job(productId: string): GeneJob | null {
    const job = jobs.get(productId)
    return job ? { ...job } : null
  },

  /** 等后台分析跑完（测试用） */
  async idle(productId: string) {
    while (jobs.get(productId)?.running) await new Promise((resolve) => setTimeout(resolve, 20))
  },

  /** 这个商品所在类目的基因报告 + 还有几条素材没分析 */
  async report(productId: string): Promise<{ report: GeneReport | null; pending: number; job: GeneJob | null }> {
    const { category, tiktokProductIds } = await productScope(productId)
    const { candidates } = await pendingCreatives(productId)
    if (!category) return { report: null, pending: tiktokProductIds.length ? candidates.length : 0, job: this.job(productId) }
    const db = await geneStore.read()
    const records = Object.values(db.records).filter((record) => record.category === category)
    const metrics = new Map(deps.creatives([...new Set(records.map((record) => record.productId))]).map((row) => [row.creativeId, row]))
    const samples = records.map((record) => {
      const m = metrics.get(record.creativeId)
      return { creativeId: record.creativeId, genes: record.genes, spend: m?.spend || 0, revenue: m?.revenue || 0, orders: m?.orders || 0 }
    })
    return { report: records.length ? aggregateGenes(category, samples) : null, pending: candidates.length, job: this.job(productId) }
  },
}

/** AI 制片人规划用：这个商品所在类目验证过的视频结构。没数据时为空。 */
export async function categoryGeneGuidance(productId: string): Promise<string> {
  const { report } = await creativeGenes.report(productId)
  return report ? geneGuidance(report) : ''
}
