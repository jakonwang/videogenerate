import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core'
import { reactive } from 'vue'
import { SYNC_COLLECTIONS, type SyncResearchResult, type SyncResearchTask } from '@shared/cloud/sync'
import { uploadImageBlob } from './files'
import { getRecord, saveRecord } from './sync'

/**
 * 选品采集（原「选品助手」App 的功能，现在内置在 Klipmill 里）。
 * 两种用法：
 *  - 手机采集：在本机直接搜索抖音、按销量采集，结果同步到云端
 *  - 连接电脑：扫电脑端二维码配对，电脑下发任务、结果回传电脑
 */

export type ConnectionState = 'not_paired' | 'pairing' | 'connecting' | 'connected' | 'disconnected' | 'pair_failed' | 'protocol_error' | string

export type NativeTask = {
  id: string
  keyword?: string
  targetCount?: number
  collected?: number
  origin: 'local' | 'desktop'
  status?: 'running' | 'completed' | 'failed'
  error?: string
  startedAt?: number
  finishedAt?: number
}

type NativeResult = {
  taskId: string
  title: string
  priceText?: string
  priceValue?: number
  salesText?: string
  salesValue?: number
  rank: number
  capturedAt: number
  imageDataUrl?: string
}

type Status = {
  paired: boolean
  endpoint: string
  connection: ConnectionState
  accessibilityEnabled: boolean
  douyinInstalled: boolean
  task?: NativeTask
}

interface ProductResearchPlugin {
  getStatus(): Promise<Status>
  scanPairing(): Promise<{ endpoint: string }>
  pairManual(options: { endpoint: string; pairingCode: string }): Promise<{ endpoint: string }>
  unpair(): Promise<void>
  openAccessibilitySettings(): Promise<void>
  startLocalTask(options: { keyword: string; targetCount: number; sort: 'sales' | 'default' }): Promise<{ taskId: string }>
  cancelTask(options: { taskId: string }): Promise<void>
  drainLocalResults(): Promise<{ results: NativeResult[] }>
  addListener(event: 'state', listener: (data: { connection: ConnectionState }) => void): Promise<PluginListenerHandle>
  addListener(event: 'task', listener: (task: NativeTask) => void): Promise<PluginListenerHandle>
}

const native = registerPlugin<ProductResearchPlugin>('ProductResearch')
export const researchAvailable = Capacitor.isNativePlatform()

export const research = reactive({
  ready: false,
  paired: false,
  endpoint: '',
  connection: 'not_paired' as ConnectionState,
  accessibilityEnabled: false,
  douyinInstalled: true,
  task: null as NativeTask | null,
  /** 正在把手机采集结果写入云端 */
  ingesting: false,
})

let listening = false

export async function refreshResearch() {
  if (!researchAvailable) {
    research.ready = true
    return
  }
  const status = await native.getStatus()
  research.paired = status.paired
  research.endpoint = status.endpoint
  research.connection = status.connection
  research.accessibilityEnabled = status.accessibilityEnabled
  research.douyinInstalled = status.douyinInstalled
  if (status.task) onTask(status.task)
  research.ready = true
  if (!listening) {
    listening = true
    await native.addListener('state', ({ connection }) => {
      research.connection = connection
    })
    await native.addListener('task', onTask)
  }
  await ingestLocalResults()
}

function onTask(task: NativeTask) {
  const previous = research.task
  research.task = task
  if (task.origin !== 'local') return
  // Keep the task record in step; results are picked up when the app is in front again.
  if (!previous || previous.id !== task.id || previous.status !== task.status) void saveTaskRecord(task)
  if (task.status && task.status !== 'running') void ingestLocalResults()
}

async function saveTaskRecord(task: NativeTask) {
  const existing = await getRecord<SyncResearchTask>(SYNC_COLLECTIONS.researchTasks, task.id)
  const status: SyncResearchTask['status'] = task.status === 'failed' && task.error === 'cancelled' ? 'cancelled' : task.status || 'running'
  await saveRecord<SyncResearchTask>(SYNC_COLLECTIONS.researchTasks, task.id, {
    keyword: task.keyword || existing?.data?.keyword || '',
    targetCount: task.targetCount || existing?.data?.targetCount || 0,
    collected: task.collected ?? existing?.data?.collected ?? 0,
    status,
    error: status === 'failed' ? friendlyError(task.error) : undefined,
    source: 'mobile',
    startedAt: task.startedAt || existing?.data?.startedAt || Date.now(),
    finishedAt: task.finishedAt,
  })
}

let ingesting: Promise<void> | null = null

/** 取走手机采集到的商品：图片传到云端，商品写入 research-results 并同步 */
export function ingestLocalResults(): Promise<void> {
  if (!researchAvailable) return Promise.resolve()
  if (ingesting) return ingesting
  ingesting = (async () => {
    const { results } = await native.drainLocalResults()
    if (!results.length) return
    research.ingesting = true
    const keywords = new Map<string, string>()
    for (const item of results) {
      let keyword = keywords.get(item.taskId)
      if (keyword === undefined) {
        keyword = (await getRecord<SyncResearchTask>(SYNC_COLLECTIONS.researchTasks, item.taskId))?.data?.keyword || research.task?.keyword || ''
        keywords.set(item.taskId, keyword)
      }
      let image: SyncResearchResult['image']
      if (item.imageDataUrl) {
        try {
          image = await uploadImageBlob(await (await fetch(item.imageDataUrl)).blob())
        } catch {
          image = undefined // 图片上传失败不影响商品数据
        }
      }
      await saveRecord<SyncResearchResult>(SYNC_COLLECTIONS.researchResults, `${item.taskId}-${item.rank}`, {
        taskId: item.taskId,
        keyword,
        title: item.title,
        priceText: item.priceText,
        priceValue: item.priceValue,
        salesText: item.salesText,
        salesValue: item.salesValue,
        rank: item.rank,
        capturedAt: item.capturedAt,
        image,
      })
    }
  })().finally(() => {
    ingesting = null
    research.ingesting = false
  })
  return ingesting
}

export async function startLocalTask(keyword: string, targetCount: number) {
  const { taskId } = await native.startLocalTask({ keyword, targetCount, sort: 'sales' })
  return taskId
}

export const cancelTask = (taskId: string) => native.cancelTask({ taskId })
export const openAccessibilitySettings = () => native.openAccessibilitySettings()

export async function scanPairing() {
  await native.scanPairing()
  await refreshResearch()
}

export async function pairManual(endpoint: string, pairingCode: string) {
  await native.pairManual({ endpoint, pairingCode })
  await refreshResearch()
}

export async function unpair() {
  await native.unpair()
  await refreshResearch()
}

const ERRORS: Record<string, string> = {
  cancelled: '已取消',
  'Douyin is not installed.': '手机上没有安装抖音',
  'Search entry was not found.': '没找到抖音的搜索入口，请把抖音更新到最新版',
  'Search input was not found.': '没找到搜索框，请把抖音更新到最新版',
  'Search submit button was not found.': '没找到搜索按钮，请把抖音更新到最新版',
  'Product tab was not found.': '搜索结果里没有「商品」标签，换个搜索词试试',
  'Sales sort was not found.': '没找到「销量」排序',
  'Accessibility service was interrupted.': '无障碍服务被系统中断，请重新开启',
  'Another task is already running.': '已有采集任务在进行',
  'The product list ended before the requested quantity was collected.': '商品列表到底了，没有采集到目标数量',
}

export function friendlyError(error: string | undefined) {
  if (!error) return ''
  return ERRORS[error] || error
}

export function connectionLabel(state: ConnectionState): { label: string; tone: 'green' | 'amber' | 'red' | 'blue' | 'muted' } {
  if (state === 'connected') return { label: '已连接', tone: 'green' }
  if (state === 'not_paired') return { label: '未配对', tone: 'muted' }
  if (state === 'pairing') return { label: '配对中', tone: 'blue' }
  if (state === 'disconnected') return { label: '重连中', tone: 'amber' }
  if (state === 'pair_failed' || state === 'protocol_error') return { label: '配对失败', tone: 'red' }
  if (state.startsWith('connection_failed')) return { label: '连接失败', tone: 'red' }
  return { label: '连接中', tone: 'blue' }
}
