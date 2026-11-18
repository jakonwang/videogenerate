import { ref, watch } from 'vue'
import {
  SYNC_COLLECTIONS,
  type SyncCloneProject,
  type SyncGeneration,
  type SyncJobState,
  type SyncResearchTask,
  type SyncVideoToolRun,
} from '@shared/cloud/sync'
import type { SyncProducerChat } from '@shared/cloud/sync'
import { deleteRecord, listRecords, syncState } from './sync'

/**
 * 任务中心：把各模块正在跑 / 失败的任务汇总成一张表。
 * 只读汇总，点进去回到各自的页面处理；失败的单条生成可以删掉。
 */

export type TaskState = 'running' | 'failed' | 'done'

export type TaskEntry = {
  key: string
  module: string
  title: string
  detail: string
  state: TaskState
  at: number
  route: string
  /** 可删除的记录（只用于失败的单条生成 / 工具任务） */
  remove?: { collection: string; id: string }
}

const TOOL_ROUTE: Record<string, string> = { watermark: 'watermark', subtitle: 'subtitle', slice: 'slice', mix: 'mix', 'parse-link': 'download' }
const TOOL_NAME: Record<string, string> = { watermark: '批量水印', subtitle: '批量字幕', slice: '直播切片', mix: '批量混剪', 'parse-link': '链接下载' }
const PURPOSE: Record<string, [string, string]> = {
  'product-image': ['商品图素材', '/product-images'],
  'image-to-video': ['图生视频', '/image-to-video'],
  clone: ['复刻', '/clone'],
  'product-replace': ['商品替换', '/product-replace'],
  'product-watermark': ['商品图水印', '/product-watermark'],
  creative: ['tk创意室', '/creative'],
  model: ['AI 模特', '/library?tab=models'],
}

const stateOf = (status: SyncJobState | undefined): TaskState | null =>
  status === 'queued' || status === 'running' ? 'running' : status === 'failed' ? 'failed' : status === 'succeeded' ? 'done' : null

function generationTasks(records: Awaited<ReturnType<typeof listRecords<SyncGeneration>>>): TaskEntry[] {
  const out: TaskEntry[] = []
  for (const record of records) {
    const item = record.data
    if (!item) continue
    const state = stateOf(item.status)
    if (state !== 'running' && state !== 'failed') continue
    // 视频工具的输出由工具任务汇总，这里只看 AI 生成
    if (TOOL_NAME[item.purpose]) continue
    const [module, route] = PURPOSE[item.purpose] ?? ['AI 生成', '/review']
    out.push({
      key: `gen-${record.id}`,
      module,
      title: item.productName ? `${item.productName} · ${item.label}` : item.label,
      detail: state === 'failed' ? item.error || '生成失败' : item.status === 'queued' ? '排队中' : '生成中',
      state,
      at: item.createdAt,
      route: item.modelId ? `/library/models/${item.modelId}` : route,
      remove: state === 'failed' ? { collection: SYNC_COLLECTIONS.generations, id: record.id } : undefined,
    })
  }
  return out
}

function toolTasks(records: Awaited<ReturnType<typeof listRecords<SyncVideoToolRun>>>): TaskEntry[] {
  const out: TaskEntry[] = []
  for (const record of records) {
    const run = record.data
    if (!run) continue
    const state = stateOf(run.status)
    if (state !== 'running' && state !== 'failed') continue
    out.push({
      key: `tool-${record.id}`,
      module: TOOL_NAME[run.kind] ?? '视频工具',
      title: run.label,
      detail: state === 'failed' ? run.error || '处理失败' : run.status === 'queued' ? '排队中' : `处理中 · ${run.inputFileIds.length} 个视频`,
      state,
      at: run.createdAt,
      route: `/tools/${TOOL_ROUTE[run.kind] ?? run.kind}`,
      remove: state === 'failed' ? { collection: SYNC_COLLECTIONS.videoToolRuns, id: record.id } : undefined,
    })
  }
  return out
}

function cloneTasks(records: Awaited<ReturnType<typeof listRecords<SyncCloneProject>>>): TaskEntry[] {
  const out: TaskEntry[] = []
  for (const record of records) {
    const p = record.data
    if (!p) continue
    const shots = Object.values(p.shots || {})
    const running =
      stateOf(p.analyzeStatus) === 'running' ||
      stateOf(p.composeStatus) === 'running' ||
      shots.some((shot) => stateOf(shot.frameStatus) === 'running' || stateOf(shot.videoStatus) === 'running')
    const errors = [
      p.analyzeStatus === 'failed' ? `拆解失败：${p.analyzeError || ''}` : '',
      p.composeStatus === 'failed' ? `合成失败：${p.composeError || ''}` : '',
      shots.some((shot) => shot.frameStatus === 'failed' || shot.videoStatus === 'failed')
        ? `${shots.filter((shot) => shot.frameStatus === 'failed' || shot.videoStatus === 'failed').length} 个分镜失败`
        : '',
    ].filter(Boolean)
    if (!running && !errors.length) continue
    const step =
      stateOf(p.analyzeStatus) === 'running' ? '正在拆解对标视频' : stateOf(p.composeStatus) === 'running' ? '正在合成成片' : '正在生成分镜'
    out.push({
      key: `clone-${record.id}`,
      module: '复刻',
      title: p.name,
      detail: running ? step : errors.join('；'),
      state: running ? 'running' : 'failed',
      at: p.createdAt,
      route: `/clone/${record.id}`,
    })
  }
  return out
}

function researchTasks(records: Awaited<ReturnType<typeof listRecords<SyncResearchTask>>>): TaskEntry[] {
  const out: TaskEntry[] = []
  for (const record of records) {
    const task = record.data
    if (!task || (task.status !== 'running' && task.status !== 'failed')) continue
    out.push({
      key: `research-${record.id}`,
      module: '选品',
      title: `搜索「${task.keyword}」`,
      detail: task.status === 'failed' ? task.error || '采集失败' : `已采集 ${task.collected}/${task.targetCount}`,
      state: task.status === 'failed' ? 'failed' : 'running',
      at: task.startedAt,
      route: `/research/${record.id}`,
    })
  }
  return out
}

function producerTasks(records: Awaited<ReturnType<typeof listRecords<SyncProducerChat>>>): TaskEntry[] {
  const out: TaskEntry[] = []
  for (const record of records) {
    const chat = record.data
    if (!chat) continue
    for (const message of chat.messages ?? []) {
      const steps = message.plan?.steps ?? []
      const running = steps.filter((step) => step.status === 'running')
      const failed = steps.filter((step) => step.status === 'failed')
      if (!running.length && !failed.length) continue
      out.push({
        key: `producer-${record.id}-${message.id}`,
        module: 'AI 制片人',
        title: message.plan?.summary || chat.title || '生产计划',
        detail: running.length ? `执行中：${running.map((s) => s.title).join('、')}` : `失败：${failed.map((s) => `${s.title}${s.error ? `（${s.error}）` : ''}`).join('、')}`,
        state: running.length ? 'running' : 'failed',
        at: message.at,
        route: '/producer',
      })
    }
  }
  return out
}

export function useTasks() {
  const items = ref<TaskEntry[]>([])
  watch(
    () => syncState.version,
    async () => {
      const [gens, tools, clones, research, chats] = await Promise.all([
        listRecords<SyncGeneration>(SYNC_COLLECTIONS.generations),
        listRecords<SyncVideoToolRun>(SYNC_COLLECTIONS.videoToolRuns),
        listRecords<SyncCloneProject>(SYNC_COLLECTIONS.cloneProjects),
        listRecords<SyncResearchTask>(SYNC_COLLECTIONS.researchTasks),
        listRecords<SyncProducerChat>(SYNC_COLLECTIONS.producerChats),
      ])
      items.value = [...generationTasks(gens), ...toolTasks(tools), ...cloneTasks(clones), ...researchTasks(research), ...producerTasks(chats)].sort(
        (a, b) => Number(b.state === 'running') - Number(a.state === 'running') || b.at - a.at,
      )
    },
    { immediate: true },
  )
  return items
}

export async function removeTask(entry: TaskEntry) {
  if (entry.remove) await deleteRecord(entry.remove.collection, entry.remove.id)
}
