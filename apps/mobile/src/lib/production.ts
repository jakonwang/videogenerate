import { computed, ref, watch, type Ref } from 'vue'
import { SYNC_COLLECTIONS, type SyncProduct, type SyncTemplate, type SyncVideoToolRun } from '@shared/cloud/sync'
import {
  DESKTOP_ONLINE_MS,
  DESKTOP_STATUS_ID,
  type MixOrderInput,
  type MixOrderResult,
  type SyncDesktopStatus,
  type SyncMixFormulas,
  type SyncMixOrder,
  type SyncMixPool,
  type SyncMixPoolEdits,
  type SyncMixPoolImport,
  type SyncPoolClip,
} from '@shared/cloud/production'
import { BUILTIN_FORMULAS, estimateSpeechSec, type MixDraft, type MixFormula, type MixLanguage } from '@shared/mixFormula'
import { CLIP_ROLES, CORE_CLIP_ROLES, effectiveClipRole, type ClipOrigin, type ClipRole, type PoolClip, type PoolSource } from '@shared/mixPool'
import { allocateFormulas, commitUsage, createBatchUsage, fitDraftToDuration, newDraft, planDraftShots, totalOf, type PlannerPool } from '@shared/mixPlanner'
import { buildScriptPrompt, parseScripts, pickHookStyles, scriptFromPools } from '@shared/mixScript'
import { templateMixOptions } from '@shared/cloud/templates'
import { uploadRaw } from './files'
import { cloud } from './session'
import { getRecord, listRecords, newId, saveRecord, syncState } from './sync'
import { runMixShots } from './videoTools'

/**
 * 生产中心（网页版）：素材池由电脑端切分打标后同步上来；方案用和电脑端同一套规划逻辑，文案用云端模型写；
 * 生产单交给电脑完整成片，电脑不在线时可以改用云端简版成片。
 */

export const ROLE_LABEL: Record<ClipRole, string> = {
  hook: '钩子开头',
  pain_point: '痛点',
  unboxing: '开箱',
  demo: '使用演示',
  wear: '上身/场景',
  detail: '细节特写',
  comparison: '对比',
  proof: '信任证明',
  cta: '结尾CTA',
  broll: '空镜',
}
export const ORIGIN_LABEL: Record<ClipOrigin, string> = { real: '实拍', ai: 'AI', unknown: '未标注' }
export const SOURCE_KIND_LABEL: Record<string, string> = { creative_studio: 'tk创意室', live_photo: '图生视频', product_asset: '商品素材', clone_output: 'AI 复刻成片', import: '导入' }
export const SOURCE_STATUS_LABEL: Record<string, string> = { pending: '待处理', splitting: '切分中', ready: '已就绪', failed: '失败' }
export const LANGUAGE_LABEL: Record<MixLanguage, string> = { 'vi-VN': '越南语', 'zh-CN': '中文', 'en-US': '英语', 'th-TH': '泰语', 'id-ID': '印尼语' }
export const FORMULA_SOURCE_LABEL: Record<MixFormula['source'], string> = { builtin: '内置', reference: '参考视频', custom: '自定义' }
export const TASK_STATUS_LABEL: Record<MixOrderResult['status'], string> = { queued: '排队中', running: '运行中', done: '已完成', error: '失败', skipped: '已跳过' }
export { CLIP_ROLES, effectiveClipRole }

/** 网页一次最多出 20 条（单条记录 256 KB 上限） */
export const WEB_MAX_COUNT = 20

/* ------------------------------------------------------------------ 电脑是否在线 */

export function useDesktopOnline() {
  const at = ref(0)
  const now = ref(Date.now())
  watch(
    () => syncState.version,
    async () => {
      at.value = (await getRecord<SyncDesktopStatus>(SYNC_COLLECTIONS.desktopStatus, DESKTOP_STATUS_ID))?.data?.at ?? 0
      now.value = Date.now()
    },
    { immediate: true },
  )
  return { online: computed(() => at.value > 0 && now.value - at.value < DESKTOP_ONLINE_MS), lastSeen: at }
}

/* ------------------------------------------------------------------ 商品与素材池 */

export type ProductOption = { id: string; name: string; type: string; remark?: string }

export function useProductOptions() {
  const items = ref<ProductOption[]>([])
  watch(
    () => syncState.version,
    async () => {
      const records = await listRecords<SyncProduct>(SYNC_COLLECTIONS.products)
      items.value = records
        .filter((record) => record.data)
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .map((record) => ({ id: record.id, name: record.data!.name, type: record.data!.type, remark: record.data!.remark }))
    },
    { immediate: true },
  )
  return items
}

export type WebPoolClip = SyncPoolClip & { pendingEdit: boolean }

export type PoolView = {
  pool: SyncMixPool | null
  clips: WebPoolClip[]
  stats: { sourceCount: number; clipCount: number; taggedCount: number; realCount: number; aiCount: number; missingRoles: ClipRole[]; mismatchCount: number }
  imports: Array<SyncMixPoolImport & { id: string }>
}

const usableForRole = (clip: SyncPoolClip) => !clip.disabled && (clip.tags?.matchesProduct !== false || Boolean(clip.roleOverride))

export function computePoolView(pool: SyncMixPool | null, edits: SyncMixPoolEdits | null, imports: Array<SyncMixPoolImport & { id: string }>): PoolView {
  const clips = (pool?.clips ?? []).map((clip) => {
    const edit = edits?.clips[clip.id]
    if (!edit) return { ...clip, pendingEdit: false }
    const pendingEdit = (clip.roleOverride ?? null) !== edit.roleOverride || Boolean(clip.disabled) !== edit.disabled
    return { ...clip, roleOverride: edit.roleOverride ?? undefined, disabled: edit.disabled || undefined, pendingEdit }
  })
  const active = clips.filter((clip) => !clip.disabled)
  const present = new Set(clips.filter(usableForRole).map((clip) => effectiveClipRole(clip)).filter(Boolean))
  return {
    pool,
    clips,
    stats: {
      sourceCount: pool?.sources.length ?? 0,
      clipCount: active.length,
      taggedCount: active.filter((clip) => clip.tagStatus === 'tagged' || clip.roleOverride).length,
      realCount: active.filter((clip) => clip.origin === 'real').length,
      aiCount: active.filter((clip) => clip.origin === 'ai').length,
      missingRoles: pool ? CORE_CLIP_ROLES.filter((role) => !present.has(role)) : [],
      mismatchCount: active.filter((clip) => clip.tags?.matchesProduct === false && !clip.roleOverride).length,
    },
    imports,
  }
}

export function usePool(productId: Ref<string>) {
  const view = ref<PoolView>(computePoolView(null, null, []))
  async function load() {
    if (!productId.value) {
      view.value = computePoolView(null, null, [])
      return
    }
    const [pool, edits, imports] = await Promise.all([
      getRecord<SyncMixPool>(SYNC_COLLECTIONS.mixPools, productId.value),
      getRecord<SyncMixPoolEdits>(SYNC_COLLECTIONS.mixPoolEdits, productId.value),
      listRecords<SyncMixPoolImport>(SYNC_COLLECTIONS.mixPoolImports),
    ])
    view.value = computePoolView(
      pool?.data ?? null,
      edits?.data ?? null,
      imports
        .filter((record) => record.data?.productId === productId.value)
        .map((record) => ({ ...(record.data as SyncMixPoolImport), id: record.id }))
        .sort((a, b) => b.createdAt - a.createdAt),
    )
  }
  watch([() => syncState.version, productId], load, { immediate: true })
  return view
}

/** 改镜头作用 / 停用：写进修正记录，电脑端下次同步时应用 */
export async function editClip(productId: string, clipId: string, edit: { roleOverride: ClipRole | null; disabled: boolean }) {
  const current = (await getRecord<SyncMixPoolEdits>(SYNC_COLLECTIONS.mixPoolEdits, productId))?.data ?? { clips: {} }
  await saveRecord<SyncMixPoolEdits>(SYNC_COLLECTIONS.mixPoolEdits, productId, { clips: { ...current.clips, [clipId]: edit } })
}

/** 上传视频进素材池：存到云端，电脑端下载后切分打标 */
export async function importToPool(productId: string, file: File, origin: ClipOrigin) {
  const mime = file.type || 'video/mp4'
  const ref = await uploadRaw(file, mime)
  await saveRecord<SyncMixPoolImport>(SYNC_COLLECTIONS.mixPoolImports, newId('poolimp'), {
    productId,
    fileId: ref.fileId,
    name: file.name.slice(0, 120),
    mime,
    origin,
    state: 'pending',
    createdAt: Date.now(),
  })
}

/* ------------------------------------------------------------------ 公式 */

export function useFormulas() {
  const items = ref<MixFormula[]>([...BUILTIN_FORMULAS])
  watch(
    () => syncState.version,
    async () => {
      const custom = (await getRecord<SyncMixFormulas>(SYNC_COLLECTIONS.mixFormulas, 'formulas'))?.data?.formulas ?? []
      items.value = [...BUILTIN_FORMULAS, ...custom.filter((f) => f.beats?.length)]
    },
    { immediate: true },
  )
  return items
}

/* ------------------------------------------------------------------ 方案（和电脑端同一套规划逻辑） */

export type PreviewInput = MixOrderInput & {
  hookLines?: string[]
  bodyLines?: string[]
  ctaLines?: string[]
  /** 复刻爆款（来自混剪数据洞察）：沿用它的公式、开头镜头和钩子思路 */
  winner?: { formulaId: string; hookClipId: string; hookStyle?: string; title: string; voiceover: string }
}

/** Sync clips → the planner's pool shape. filePath carries the source's cloud file id (for cloud renders). */
function plannerPool(pool: PoolView): PlannerPool {
  const sources = new Map<string, PoolSource>(
    (pool.pool?.sources ?? []).map((source) => [
      source.id,
      { ...source, productId: '', filePath: source.fileId ?? '', status: source.status, createdAt: 0, updatedAt: 0 } as PoolSource,
    ]),
  )
  const clips = pool.clips.map(
    (clip) =>
      ({
        ...clip,
        productId: '',
        filePath: sources.get(clip.sourceId)?.filePath ?? '',
        framePaths: [],
        thumbnailPath: clip.thumbFileId ?? '',
        createdAt: 0,
        updatedAt: 0,
      }) as PoolClip,
  )
  return { clips, sourceById: sources }
}

const SCRIPT_BATCH = 4

export async function previewDrafts(input: PreviewInput, product: ProductOption, pool: PoolView, formulas: MixFormula[]) {
  const chosen = (input.winner ? [input.winner.formulaId] : input.formulaIds).map((id) => formulas.find((f) => f.id === id)).filter((f): f is MixFormula => Boolean(f))
  if (!chosen.length) throw new Error('请至少选择一个公式')
  const planner = plannerPool(pool)
  const usage = createBatchUsage()
  const warnings: string[] = []
  const { seq } = allocateFormulas(chosen, Math.min(WEB_MAX_COUNT, input.count), null)
  const drafts: MixDraft[] = []
  seq.forEach((formula, i) => {
    const planned = planDraftShots({ pool: planner, formula, usage, allowAi: input.allowAiClips, bias: input.winner ? { pinHookClipId: input.winner.hookClipId } : undefined })
    if (!planned) {
      warnings.push(`第 ${i + 1} 条：素材不足，无法按「${formula.name}」拼出视频`)
      return
    }
    commitUsage(usage, planned.shots)
    drafts.push(newDraft(formula, planned.shots, planned.warnings))
  })
  if (!drafts.length) throw new Error('素材池镜头不足，没有生成任何方案')

  const scriptProduct = { name: product.name, type: product.type }
  let scriptModel: string | undefined
  if (input.mode === 'ai') {
    const formulaById = new Map(chosen.map((f) => [f.id, f]))
    const styles = input.winner?.hookStyle ? drafts.map(() => input.winner!.hookStyle!) : pickHookStyles(drafts.length, null)
    for (let i = 0; i < drafts.length; i += SCRIPT_BATCH) {
      const batch = drafts.slice(i, i + SCRIPT_BATCH)
      try {
        const built = buildScriptPrompt({
          product: scriptProduct,
          drafts: batch,
          formulas: formulaById,
          language: input.language,
          sellingPoints: input.sellingPoints,
          styles: styles.slice(i, i + batch.length),
          keepHookFrom: input.winner ? { title: input.winner.title, voiceover: input.winner.voiceover } : undefined,
        })
        const reply = await cloud.ai.chat({ system: built.system, prompt: built.prompt, purpose: 'mix-script' })
        scriptModel = reply.model ?? scriptModel
        parseScripts(reply.content, batch, built.styles).forEach((script, k) => {
          if (script) Object.assign(batch[k]!, { title: script.title, voiceover: script.voiceover, hookStyle: script.hookStyle, scriptSource: 'ai' as const })
        })
      } catch (error) {
        warnings.push(`AI 文案生成失败（第 ${i + 1}-${i + batch.length} 条）：${String((error as Error)?.message ?? error).slice(0, 160)}`)
      }
    }
  }
  drafts.forEach((draft, i) => {
    if (draft.voiceover) return
    const script = scriptFromPools({ product: scriptProduct, index: i, hookLines: input.hookLines, bodyLines: input.bodyLines, ctaLines: input.ctaLines, language: input.language })
    if (script) Object.assign(draft, { title: script.title, voiceover: script.voiceover, hookStyle: script.hookStyle, scriptSource: 'pool' as const })
  })
  for (const draft of drafts) {
    if (!draft.voiceover) {
      draft.warnings.push('没有配音文案，只会输出画面 + 标题')
      continue
    }
    const speech = estimateSpeechSec(draft.voiceover, input.language)
    const fitted = fitDraftToDuration({ shots: draft.shots, targetSec: Math.max(6, speech + 0.8), pool: planner, usage, allowAi: input.allowAiClips })
    draft.shots = fitted.shots
    draft.totalDurationSec = totalOf(draft.shots)
    if (fitted.added) draft.warnings.push(`配音较长，已补 ${fitted.added} 个镜头`)
    if (draft.totalDurationSec < speech) draft.warnings.push(`镜头总长 ${draft.totalDurationSec.toFixed(1)}s 短于预计配音 ${speech.toFixed(1)}s，渲染时会自动延长镜头`)
  }
  return { drafts, warnings, scriptModel }
}

/** Cloud renders need every shot's source video in the cloud. */
export function cloudReady(draft: MixDraft) {
  return draft.shots.every((shot) => Boolean(shot.filePath))
}

/* ------------------------------------------------------------------ 生产单 */

export type OrderItem = SyncMixOrder & { id: string; updatedAt: number }

export async function submitOrder(input: { product: ProductOption; orderInput: MixOrderInput; drafts: MixDraft[]; runner: 'desktop' | 'cloud'; template?: SyncTemplate | null }) {
  const id = newId('mixorder')
  // Shots keep only what the computer / cloud needs (file ids, not data urls).
  const drafts = input.drafts.map((draft) => ({ ...draft, shots: draft.shots.map((shot) => ({ ...shot })) }))
  const order: SyncMixOrder = {
    productId: input.product.id,
    productName: input.product.name,
    input: input.orderInput,
    drafts,
    runner: input.runner,
    state: input.runner === 'desktop' ? 'pending' : 'running',
    createdAt: Date.now(),
  }
  if (input.runner === 'cloud') {
    const base = input.template ? templateMixOptions(input.template, 1) : {}
    const jobIds: string[] = []
    for (const draft of drafts) {
      if (!cloudReady(draft)) {
        jobIds.push('')
        continue
      }
      jobIds.push(
        await runMixShots(
          draft.shots.map((shot) => ({ fileId: shot.filePath, startSec: shot.startSec, durationSec: shot.durationSec })),
          { ...base, count: 1, exactShots: true, title: draft.title, titles: undefined },
          `${input.product.name} · ${draft.formulaName}`,
        ),
      )
    }
    order.cloudJobIds = jobIds
  }
  await saveRecord<SyncMixOrder>(SYNC_COLLECTIONS.mixOrders, id, order)
  return id
}

/** Cloud orders: results come from the tool runs of their jobs. */
function cloudResults(order: SyncMixOrder, runs: SyncVideoToolRun[]): Pick<SyncMixOrder, 'results' | 'state' | 'error'> {
  const results: MixOrderResult[] = (order.cloudJobIds ?? []).map((jobId) => {
    if (!jobId) return { status: 'skipped', error: '用到的原视频太大，没有上传云端，只能在电脑上成片' }
    const run = runs.find((item) => item.jobId === jobId)
    if (!run) return { status: 'queued' }
    if (run.status === 'succeeded') return { status: 'done', outputFileId: run.outputs[0]?.fileId }
    if (run.status === 'failed') return { status: 'error', error: run.error }
    return { status: run.status === 'running' ? 'running' : 'queued' }
  })
  const finished = results.length > 0 && results.every((r) => r.status === 'done' || r.status === 'error' || r.status === 'skipped')
  const ok = results.some((r) => r.status === 'done')
  return { results, state: finished ? (ok ? 'completed' : 'failed') : 'running', error: finished && !ok ? results.find((r) => r.error)?.error : undefined }
}

export function useOrders() {
  const items = ref<OrderItem[]>([])
  watch(
    () => syncState.version,
    async () => {
      const [orders, runs] = await Promise.all([listRecords<SyncMixOrder>(SYNC_COLLECTIONS.mixOrders), listRecords<SyncVideoToolRun>(SYNC_COLLECTIONS.videoToolRuns)])
      const runList = runs.map((record) => record.data).filter((run): run is SyncVideoToolRun => Boolean(run))
      items.value = orders
        .filter((record) => record.data)
        .map((record) => {
          const order = record.data as SyncMixOrder
          return { ...order, ...(order.runner === 'cloud' ? cloudResults(order, runList) : {}), id: record.id, updatedAt: record.updatedAt }
        })
        .sort((a, b) => b.createdAt - a.createdAt)
    },
    { immediate: true },
  )
  return items
}

/** 电脑一直没接单时，改用云端简版成片 */
export async function switchOrderToCloud(order: OrderItem, template: SyncTemplate | null) {
  const { id, updatedAt: _u, ...data } = order
  const product = { id: data.productId, name: data.productName, type: 'general' }
  const fresh = await submitOrder({ product, orderInput: data.input, drafts: data.drafts, runner: 'cloud', template })
  await saveRecord<SyncMixOrder>(SYNC_COLLECTIONS.mixOrders, id, { ...data, state: 'failed', error: '已改用云端简版成片' })
  return fresh
}
