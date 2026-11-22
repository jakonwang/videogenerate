/**
 * 矩阵发布：把发布中心里的视频一次分发到多个 TikTok 号。
 * 每个号一条任务、错峰排好时间、各自一个不重复的版本；变体在后台慢慢生成，生成完才能提交。
 * 提交和定时仍走 CreatOK（schedule.at），所以电脑不用一直开着等到发布时间。
 */
import { randomUUID } from 'node:crypto'
import { join, resolve, sep } from 'node:path'
import { unlink } from 'node:fs/promises'
import { getAppPaths } from '../../lib/paths'
import { readJsonFile, writeJsonFile } from '../../lib/storeJson'
import { cloneRepo } from '../clone/repo'
import { generateChatCompletion } from '../clone/unifiedChat'
import { creatokPublisherRepo } from './repo'
import { newOperationKeys } from './creatokClient'
import { captionVariants, renderVideoVariant } from './variants'
import type { CreatokPublishTask } from './types'
import {
  expandMatrixItems,
  normalizeMatrixAccount,
  planMatrixSchedule,
  type MatrixAccountSettings,
  type MatrixScheduleSkip,
} from '../../../shared/publishMatrix'

const settingsPath = () => join(getAppPaths().dbDir, 'publish-matrix-accounts.json')
const variantDir = () => resolve(getAppPaths().dataDir, 'publish-variants')
const localizedDir = () => resolve(getAppPaths().dataDir, 'publish-localized')
const LOCKED_STATES: CreatokPublishTask['state'][] = ['published', 'queued', 'scheduled', 'publishing', 'result_unknown']

type Deps = {
  ai?: (input: { system: string; prompt: string }) => Promise<string>
  renderVideo: typeof renderVideoVariant
  now: () => number
}
const defaultDeps: Deps = {
  ai: async ({ system, prompt }) => {
    const credentials = await cloneRepo.getCredentials()
    const response = await generateChatCompletion({ credentials, system, prompt, timeoutMs: 45_000 })
    return String(response.content || '')
  },
  renderVideo: renderVideoVariant,
  now: () => Date.now(),
}
let deps: Deps = defaultDeps
export function setPublishMatrixTestDependencies(next: Partial<Deps>) { deps = { ...defaultDeps, ...next } }
export function resetPublishMatrixTestDependencies() { deps = defaultDeps }

async function readSettings(): Promise<Record<string, MatrixAccountSettings>> {
  const data = await readJsonFile<{ accounts?: Record<string, Partial<MatrixAccountSettings>> }>(settingsPath(), {})
  const out: Record<string, MatrixAccountSettings> = {}
  for (const [uid, value] of Object.entries(data.accounts || {})) out[uid] = normalizeMatrixAccount(uid, value)
  return out
}

// ---------- 后台变体队列 ----------
let queue = Promise.resolve()
const queued = new Set<string>()
let resumed = false

function enqueueVariants(taskIds: string[]) {
  const fresh = taskIds.filter((id) => !queued.has(id))
  if (!fresh.length) return queue
  fresh.forEach((id) => queued.add(id))
  queue = queue
    .then(() => processVariants(fresh))
    .catch((error) => console.error('[publish-matrix] variant queue failed', error))
    .finally(() => fresh.forEach((id) => queued.delete(id)))
  return queue
}

async function patchTask(id: string, patch: (task: CreatokPublishTask) => CreatokPublishTask | null) {
  const latest = await creatokPublisherRepo.get(id)
  if (!latest) return null
  const next = patch(latest)
  return next ? creatokPublisherRepo.upsert({ ...next, updatedAt: deps.now() }) : null
}

async function processVariants(taskIds: string[]) {
  const tasks = (await Promise.all(taskIds.map((id) => creatokPublisherRepo.get(id))))
    .filter((task): task is CreatokPublishTask => Boolean(task?.variant && ['pending', 'rendering'].includes(task.variant.status)))

  // 文案：同一个源视频的几个号一起改写，一次 AI 调用
  const groups = new Map<string, CreatokPublishTask[]>()
  for (const task of tasks) if (task.variant?.caption) {
    const key = task.matrixSourceId || task.id
    groups.set(key, [...(groups.get(key) || []), task])
  }
  const captions = new Map<string, { videoTitle?: string; description?: string }>()
  for (const group of groups.values()) {
    const sorted = [...group].sort((a, b) => (a.variant!.index - b.variant!.index))
    const source = { videoTitle: sorted[0].videoTitle, description: sorted[0].description }
    const rewritten = await captionVariants(source, sorted.length, deps.ai)
    sorted.forEach((task, i) => captions.set(task.id, rewritten[i]))
  }

  for (const task of tasks) {
    const variant = task.variant!
    await patchTask(task.id, (t) => ({ ...t, variant: { ...variant, status: 'rendering', error: undefined } }))
    try {
      const caption = captions.get(task.id)
      const videoPath = variant.video
        ? await deps.renderVideo({ source: variant.originalVideoPath, batchId: task.matrixBatchId || 'single', taskId: task.id, index: variant.index })
        : variant.originalVideoPath
      await patchTask(task.id, (t) => ({
        ...t,
        sourceVideoPath: videoPath,
        posterPath: variant.video ? undefined : t.posterPath,
        ...(caption?.videoTitle ? { videoTitle: caption.videoTitle } : {}),
        ...(caption?.description ? { description: caption.description } : {}),
        variant: { ...variant, status: 'ready', error: undefined },
      }))
    } catch (error: any) {
      console.error('[publish-matrix] variant failed', { taskId: task.id, error })
      await patchTask(task.id, (t) => ({ ...t, variant: { ...variant, status: 'failed', error: String(error?.message || error).slice(0, 500) } }))
    }
  }
}

function isVariantFile(path?: string) {
  if (!path) return false
  const full = resolve(path)
  return full.startsWith(variantDir() + sep) || full.startsWith(localizedDir() + sep)
}

export const publishMatrixService = {
  async accounts(): Promise<MatrixAccountSettings[]> {
    return Object.values(await readSettings())
  },

  async saveAccounts(list: Array<Partial<MatrixAccountSettings> & { uid: string }>) {
    const current = await readSettings()
    for (const item of list || []) {
      const uid = String(item?.uid || '').trim()
      if (!uid) continue
      current[uid] = normalizeMatrixAccount(uid, { ...current[uid], ...item, updatedAt: deps.now() })
    }
    await writeJsonFile(settingsPath(), { accounts: current })
    return Object.values(current)
  },

  /**
   * 分发：每个源视频 × 每个选中的号 = 一条任务。第 1 个号沿用源任务（原片原文案），其余号新建任务并生成变体。
   * 暂停或排不出时间的号会跳过并告诉用户。
   */
  async distribute(input: {
    taskIds: string[]
    accounts: Array<{ uid: string; name?: string }>
    startAt?: string
    videoVariants?: boolean
    captionVariants?: boolean
  }) {
    const uids = [...new Set((input.accounts || []).map((a) => String(a?.uid || '').trim()).filter(Boolean))]
    if (!uids.length) throw new Error('请至少选一个发布账号')
    const names = new Map((input.accounts || []).map((a) => [String(a.uid), String(a.name || '')]))
    const sources: CreatokPublishTask[] = []
    for (const id of [...new Set(input.taskIds || [])]) {
      const task = await creatokPublisherRepo.get(String(id))
      if (!task) continue
      if (LOCKED_STATES.includes(task.state)) throw new Error('已提交的视频不能再分发，请只选草稿或失败的视频')
      if (task.variant && task.variant.status !== 'ready') throw new Error('有视频的变体还在生成，等生成完再分发')
      sources.push(task)
    }
    if (!sources.length) throw new Error('请先选要分发的视频')

    const now = deps.now()
    const requestedStart = input.startAt ? Date.parse(input.startAt) : NaN
    // CreatOK 要求至少 1 分钟以后，变体还要时间生成，所以最早排在 10 分钟后
    const startAt = Math.max(Number.isFinite(requestedStart) ? requestedStart : now, now + 10 * 60_000)
    const settings = await readSettings()
    const sourceIds = new Set(sources.map((t) => t.id))
    const existing = (await creatokPublisherRepo.list())
      .filter((t) => !sourceIds.has(t.id) && t.connectionUid && uids.includes(t.connectionUid) && t.scheduleAt && !['failed', 'cancelled'].includes(t.state))
      .map((t) => ({ uid: t.connectionUid!, at: Date.parse(t.scheduleAt!) }))
    const items = expandMatrixItems(sources.map((t) => t.id), uids)
    const plan = planMatrixSchedule({
      items,
      accounts: uids.map((uid) => settings[uid] || normalizeMatrixAccount(uid)),
      existing,
      startAt,
    })
    const slotByKey = new Map(plan.slots.map((s) => [s.key, s]))
    const batchId = randomUUID()
    const videoOn = input.videoVariants !== false
    const captionOn = input.captionVariants !== false
    const saved: CreatokPublishTask[] = []
    const needVariant: string[] = []

    for (const source of sources) {
      const own = items.filter((item) => item.sourceId === source.id)
      const placed = own.filter((item) => slotByKey.has(item.key))
      placed.forEach((item, order) => {
        const slot = slotByKey.get(item.key)!
        const index = order // 第一个排上的号用原版
        const base = {
          connectionUid: item.uid,
          connectionName: names.get(item.uid) || (item.uid === source.connectionUid ? source.connectionName : undefined) || item.uid,
          scheduleAt: new Date(slot.at).toISOString(),
          matrixBatchId: batchId,
          matrixSourceId: source.id,
          updatedAt: now,
        }
        const original = source.variant?.originalVideoPath || source.sourceVideoPath
        if (index === 0) {
          saved.push({ ...source, ...base, state: 'draft', error: undefined, precheck: undefined, variant: { status: 'ready', index: 0, originalVideoPath: original, video: false, caption: false } })
          return
        }
        const wantVariant = videoOn || captionOn
        const keys = newOperationKeys()
        const task: CreatokPublishTask = {
          ...source,
          ...base,
          ...keys,
          id: randomUUID(),
          sourceVideoPath: original,
          posterPath: source.posterPath,
          state: 'draft',
          remoteJobId: undefined,
          assetId: undefined,
          preparedVideo: undefined,
          precheck: undefined,
          error: undefined,
          variant: { status: wantVariant ? 'pending' : 'ready', index, originalVideoPath: original, video: videoOn, caption: captionOn },
          createdAt: now,
        }
        saved.push(task)
        if (wantVariant) needVariant.push(task.id)
      })
    }
    await creatokPublisherRepo.upsertMany(saved)
    if (needVariant.length) void enqueueVariants(needVariant)
    const lastAt = plan.slots.reduce((max, s) => Math.max(max, s.at), 0)
    return {
      batchId,
      tasks: saved,
      created: saved.length - sources.filter((s) => saved.some((t) => t.id === s.id)).length,
      variants: needVariant.length,
      skipped: plan.skipped.map((s: MatrixScheduleSkip) => ({ ...s, name: names.get(s.uid) || s.uid })),
      firstAt: plan.slots.length ? new Date(Math.min(...plan.slots.map((s) => s.at))).toISOString() : undefined,
      lastAt: lastAt ? new Date(lastAt).toISOString() : undefined,
    }
  },

  /** 变体失败后重试。 */
  async retryVariants(ids: string[]) {
    const ok: string[] = []
    for (const id of ids || []) {
      const task = await patchTask(String(id), (t) => (t.variant && t.variant.status === 'failed' ? { ...t, variant: { ...t.variant, status: 'pending', error: undefined } } : null))
      if (task) ok.push(task.id)
    }
    if (ok.length) void enqueueVariants(ok)
    return creatokPublisherRepo.list()
  },

  /** 不要变体了，直接用原片发。 */
  async useOriginal(ids: string[]) {
    for (const id of ids || []) {
      await patchTask(String(id), (t) => (t.variant && t.variant.status !== 'rendering' && !LOCKED_STATES.includes(t.state)
        ? { ...t, sourceVideoPath: t.variant.originalVideoPath, variant: { ...t.variant, status: 'ready', video: false, error: undefined } }
        : null))
    }
    return creatokPublisherRepo.list()
  },

  /** 应用重启后，把没做完的变体接着做。 */
  resumePending(tasks: CreatokPublishTask[]) {
    if (resumed) return
    resumed = true
    const ids = tasks.filter((t) => t.variant && ['pending', 'rendering'].includes(t.variant.status)).map((t) => t.id)
    if (ids.length) void enqueueVariants(ids)
  },

  /** 删除任务时顺手删掉它的变体文件（只删软件自己生成的）。 */
  async cleanupTaskFiles(task: CreatokPublishTask | null) {
    if (!task || !isVariantFile(task.sourceVideoPath) || task.sourceVideoPath === task.variant?.originalVideoPath || task.sourceVideoPath === task.localize?.originalVideoPath) return
    await unlink(task.sourceVideoPath).catch(() => undefined)
  },

  /** 测试用：等后台变体队列跑完。 */
  async idle() { await queue },
}

/** 提交 / 检查前调用：变体没好不能发。 */
export function assertVariantReady(task: CreatokPublishTask) {
  if (!task.variant) return
  if (task.variant.status === 'pending' || task.variant.status === 'rendering') throw new Error('这条的变体视频还在生成中，生成完再提交')
  if (task.variant.status === 'failed') throw new Error(`变体视频生成失败：${task.variant.error || '未知原因'}。可以重新生成变体，或改用原片`)
}
