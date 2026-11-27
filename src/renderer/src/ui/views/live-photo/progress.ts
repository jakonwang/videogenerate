import { onBeforeUnmount, onMounted, ref } from 'vue'
import type { LivePhotoItem } from './types'
import { resolveLivePhotoPhase, resolveLivePhotoPhaseStartedAt } from '../../../../../shared/livePhotoProgress'

/**
 * 把一个图生视频任务翻译成普通用户能看懂的进度：进行到哪一步、在等什么、多久了、失败的原因、下一步做什么。
 * 纯函数（除 useNow），卡片和详情弹窗共用。
 */

export const LP_STEPS = ['locate', 'image', 'video', 'package'] as const
export type LpStepKey = (typeof LP_STEPS)[number]
export type LpPhase = 'queued' | LpStepKey | 'done'
export type LpStepState = 'done' | 'active' | 'failed' | 'todo'
export type LpState = 'running' | 'waiting' | 'paused' | 'retrying' | 'failed' | 'done' | 'draft'
export type LpFailureKind = 'locate' | 'region' | 'reference' | 'image_quality' | 'image' | 'video' | 'timeout' | 'other'
export type LpNext = 'auto' | 'retry' | 'region' | 'resume' | 'play' | 'decide' | 'none'

export type LpModelCall = { step: string; provider: string; model: string; endpoint: string; cached: boolean; at: number }

export type LivePhotoProgress = {
  phase: LpPhase
  state: LpState
  steps: Array<{ key: LpStepKey; state: LpStepState }>
  /** 正在等远端结果时的任务号 */
  remoteTaskId: string
  /** 当前这一步开始的时间 */
  startedAt?: number
  /** 这一步通常要多久（秒） */
  expectedSec?: [number, number]
  failure?: { kind: LpFailureKind; detail: string; limitReached: boolean }
  retryCount: number
  retryLimit: number
  next: LpNext
  modelCalls: LpModelCall[]
}

const EXPECTED: Record<LpStepKey, [number, number]> = {
  locate: [10, 60],
  image: [60, 180],
  video: [120, 360],
  package: [10, 60],
}

function logs(item: LivePhotoItem) {
  return Array.isArray(item.logs) ? item.logs : []
}

export function parseModelCalls(item: LivePhotoItem): LpModelCall[] {
  const re = /model call: step=(\S+) provider=(\S+) model=(\S+) endpoint=(\S+)( cached=1)?/
  const calls: LpModelCall[] = []
  for (const log of logs(item)) {
    const match = re.exec(String(log?.message || ''))
    if (!match) continue
    calls.push({ step: match[1]!, provider: match[2]!, model: match[3]!, endpoint: match[4]!, cached: Boolean(match[5]), at: Number(log.time) || 0 })
  }
  return calls
}

/** 去掉 [tag]、taskId=… 这类给程序看的部分，留下原因本身 */
export function cleanReason(text: string) {
  return String(text || '')
    .replace(/\[[a-z_]+\]/gi, '')
    .replace(/\s*taskId=\S+/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function failureKind(item: LivePhotoItem, reason: string): LpFailureKind {
  if (reason.includes('[locate_failed]')) return 'locate'
  if (reason.includes('[replacement_region_required]')) return 'region'
  if (reason.includes('[reference_unsuitable]')) return 'reference'
  if (reason.includes('[image_validation_failed]')) return 'image_quality'
  if (item.autoFlowStatus?.failedStage === 'video' || /video/i.test(String(item.workflow?.currentStep || '')) && !reason.includes('[retryable_remote]')) return 'video'
  if (reason.includes('[retryable_timeout]') || /timed out|timeout/i.test(reason)) return 'timeout'
  if (reason.includes('[retryable_remote]')) return 'image'
  return 'other'
}

/**
 * 贴真实商品的细分步骤（擦除 → 抠图 → 摆放 → 融合 → 视频），按任务里已有的结果推出来；不是这种任务返回 null。
 */
export function pasteReplaceSteps(item: LivePhotoItem): Array<{ label: string; state: 'done' | 'active' | 'todo' }> | null {
  if (item.replaceMode !== 'paste' || item.sourceType !== 'reference_replace') return null
  const done = [
    Boolean(item.erasedScenePath),
    Boolean(item.productCutoutPath),
    Boolean(item.placement && (item.placementMode !== 'confirm' || item.placement.confirmedAt)),
    Boolean(item.generatedStillPath),
    Boolean(item.motionVideoPath) || item.packagingStatus === 'completed',
  ]
  const labels = ['擦掉旧商品', '抠图', '摆放', '融合', '视频']
  const active = done.indexOf(false)
  return labels.map((label, index) => ({ label, state: done[index] ? 'done' : index === active ? 'active' : 'todo' }))
}

export function livePhotoProgress(item: LivePhotoItem): LivePhotoProgress {
  const auto = item.autoFlowStatus
  const reason = String(item.error || auto?.lastError || '').trim()
  const phase: LpPhase = resolveLivePhotoPhase(item)
  const steps: LpStepKey[] = item.sourceType === 'clone_shot' ? ['image', 'video', 'package'] : [...LP_STEPS]
  const retryCount = Number(auto?.retryCount || 0)
  const retryLimit = Number(auto?.retryLimit || 0) || 2
  const remotePending = reason.includes('[remote_pending]')
  const remoteTaskId = remotePending
    ? String((phase === 'video' ? item.videoTaskId : item.imageTaskId) || /taskId=(\S+)/.exec(reason)?.[1] || '').trim()
    : ''

  let state: LpState
  if (phase === 'done') state = 'done'
  else if (auto?.paused) state = 'paused'
  else if (auto?.status === 'failed_terminal' || (item.packagingStatus === 'failed' && auto?.status !== 'failed_retryable')) state = 'failed'
  else if (auto?.status === 'failed_retryable') state = 'retrying'
  else if (remotePending && remoteTaskId) state = 'waiting'
  else if (auto?.status === 'running' || item.packagingStatus === 'processing') state = 'running'
  else state = 'draft'

  const failed = state === 'failed' || state === 'retrying' || (state === 'paused' && Boolean(reason) && !remotePending)
  const failure = failed && reason
    ? { kind: failureKind(item, reason), detail: cleanReason(reason), limitReached: reason.includes('[retry_limit]') || retryCount >= retryLimit }
    : undefined

  const activeIndex = phase === 'done' ? steps.length : phase === 'queued' ? 0 : Math.max(0, steps.indexOf(phase))
  const stepStates = steps.map((key, index) => ({
    key,
    state: (index < activeIndex
      ? 'done'
      : index === activeIndex && phase !== 'done' && phase !== 'queued'
        ? failed ? 'failed' : 'active'
        : 'todo') as LpStepState,
  }))

  // 列表摘要不带日志，主进程算好了 stageStartedAt
  const startedAt = phase === 'done' || phase === 'queued'
    ? undefined
    : resolveLivePhotoPhaseStartedAt(item, phase) || item.stageStartedAt || auto?.lastStartedAt || item.workflow?.updatedAt

  let next: LpNext = 'none'
  if (state === 'done') next = 'play'
  else if (state === 'paused' && failure?.kind === 'image_quality' && item.generatedStillPath) next = 'decide'
  else if (state === 'paused') next = 'resume'
  else if (failure?.kind === 'region') next = 'region'
  else if (state === 'failed') next = 'retry'
  else if (state === 'running' || state === 'waiting' || state === 'retrying') next = 'auto'

  return {
    phase,
    state,
    steps: stepStates,
    remoteTaskId,
    startedAt,
    expectedSec: phase === 'done' || phase === 'queued' ? undefined : EXPECTED[phase],
    failure,
    retryCount,
    retryLimit,
    next,
    modelCalls: parseModelCalls(item),
  }
}

/** 一个全局的秒级时钟：所有卡片共用一个定时器 */
const nowRef = ref(Date.now())
let tickers = 0
let timer: ReturnType<typeof setInterval> | null = null

export function useNow() {
  onMounted(() => {
    tickers += 1
    if (!timer) timer = setInterval(() => (nowRef.value = Date.now()), 1000)
  })
  onBeforeUnmount(() => {
    tickers -= 1
    if (tickers <= 0 && timer) {
      clearInterval(timer)
      timer = null
    }
  })
  return nowRef
}

/** 秒数 → { h, m, s }，给 i18n 拼「3 分 12 秒」 */
export function splitDuration(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000))
  return { h: Math.floor(total / 3600), m: Math.floor((total % 3600) / 60), s: total % 60 }
}
