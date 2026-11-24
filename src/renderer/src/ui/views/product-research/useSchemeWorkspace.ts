import { computed, inject, onBeforeUnmount, provide, ref, watch, type InjectionKey, type Ref } from 'vue'
import type {
  ProductResearchDevice,
  ProductResearchKeyword,
  ProductResearchLiveTestRecord,
  ProductResearchProductEdit,
  ProductResearchResult,
  ProductResearchScheme,
  ProductResearchTask,
} from '../../../../../shared/productResearch'
import { gmvOf, matchScore } from './productResearchUtils'

export type ToastTone = 'info' | 'success' | 'error'
export type ProductRow = ProductResearchResult & { gmv: number; match: number }

function errorText(error: unknown) {
  return error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(error)
}

export function translateError(message: string) {
  if (/No paired phone is online/i.test(message)) return '没有在线的采集手机，请先连接手机'
  if (/Another task is already running/i.test(message)) return '手机上已有任务在采集'
  if (/Douyin is not installed/i.test(message)) return '手机上没有安装抖音'
  if (/Search entry was not found/i.test(message)) return '没找到抖音的搜索入口，请把抖音更新到最新版后重试'
  if (/Search input was not found/i.test(message)) return '没找到抖音的搜索框，请重试'
  if (/Search submit button was not found/i.test(message)) return '没找到抖音的搜索按钮，请重试'
  if (/Product tab was not found/i.test(message)) return '搜索结果里没有「商品」分类，换个搜索词试试'
  if (/Sales sort was not found/i.test(message)) return '没找到「销量」排序，请重试'
  if (/product list ended/i.test(message)) return '商品已全部采完，没有达到目标数量'
  if (/Accessibility service was interrupted/i.test(message)) return '手机无障碍服务被系统关闭了，请在手机上重新开启'
  if (/^cancelled$/i.test(message)) return '已取消'
  if (/Keyword is required/i.test(message)) return '搜索词不能为空'
  return message
}

export function createSchemeWorkspace(schemeId: Ref<string>) {
  const scheme = ref<ProductResearchScheme | null>(null)
  const keywords = ref<ProductResearchKeyword[]>([])
  const candidateIds = ref<string[]>([])
  const productEdits = ref<ProductResearchProductEdit[]>([])
  const liveTestRecords = ref<ProductResearchLiveTestRecord[]>([])
  const tasks = ref<ProductResearchTask[]>([])
  const results = ref<ProductResearchResult[]>([])
  const devices = ref<ProductResearchDevice[]>([])
  const endpoint = ref('')
  const serverRunning = ref(false)

  const loading = ref(true)
  const loadError = ref('')
  const saving = ref(false)
  const dirty = ref(false)
  const lastSavedAt = ref(0)
  const currentStep = ref(1)
  const toast = ref<{ id: number; text: string; tone: ToastTone } | null>(null)

  let hydrating = false
  let saveTimer: ReturnType<typeof setTimeout> | null = null
  let pollTimer: ReturnType<typeof setInterval> | null = null
  let toastTimer: ReturnType<typeof setTimeout> | null = null

  function notify(text: string, tone: ToastTone = 'info') {
    toast.value = { id: Date.now(), text, tone }
    if (toastTimer) clearTimeout(toastTimer)
    toastTimer = setTimeout(() => { toast.value = null }, 3200)
  }

  // ===== Derived =====
  const connectedDevices = computed(() => devices.value.filter((item) => item.connected))
  const activeTasks = computed(() => tasks.value.filter((item) => item.status === 'queued' || item.status === 'running'))
  const failedTasks = computed(() => tasks.value.filter((item) => item.status === 'failed'))
  const candidateSet = computed(() => new Set(candidateIds.value))
  const resultMap = computed(() => new Map(results.value.map((item) => [item.id, item])))

  const productRows = computed<ProductRow[]>(() => {
    const need = scheme.value?.need || ''
    return results.value.map((item) => ({
      ...item,
      gmv: gmvOf(item),
      match: matchScore(item.title, item.keyword, need, item.salesValue || 0, item.rank || 0),
    }))
  })
  const candidateRows = computed(() => productRows.value.filter((item) => candidateSet.value.has(item.id)))
  const keptCount = computed(() => productEdits.value.filter((item) => item.kept && candidateSet.value.has(item.resultId)).length)

  // ===== Loading =====
  function applyKeywordStatus() {
    const latest = new Map<string, ProductResearchTask>()
    for (const task of [...tasks.value].sort((a, b) => a.createdAt - b.createdAt)) latest.set(task.keyword, task)
    for (const keyword of keywords.value) {
      const task = latest.get(keyword.value)
      if (!task) {
        if (keyword.status !== 'pending') keyword.status = 'pending'
        continue
      }
      const next: ProductResearchKeyword['status'] =
        task.status === 'queued' || task.status === 'running' ? 'running'
          : task.status === 'completed' ? 'collected'
            : task.status === 'failed' ? 'failed'
              : task.collectedCount > 0 ? 'collected' : 'pending'
      if (keyword.status !== next) keyword.status = next
    }
  }

  async function refreshSnapshot(silent = true) {
    try {
      const snap = await window.api.productResearch.snapshot(schemeId.value)
      serverRunning.value = snap.serverRunning
      endpoint.value = snap.endpoint
      devices.value = snap.devices
      tasks.value = snap.tasks.filter((item) => item.schemeId === schemeId.value)
      results.value = snap.results.filter((item) => item.schemeId === schemeId.value)
      const before = JSON.stringify(keywords.value.map((item) => item.status))
      applyKeywordStatus()
      if (JSON.stringify(keywords.value.map((item) => item.status)) !== before) scheduleSave()
      const known = new Set(results.value.map((item) => item.id))
      if (candidateIds.value.some((id) => !known.has(id))) candidateIds.value = candidateIds.value.filter((id) => known.has(id))
    } catch (error) {
      if (!silent) notify(`刷新失败：${translateError(errorText(error))}`, 'error')
    }
  }

  async function load() {
    loading.value = true
    loadError.value = ''
    hydrating = true
    try {
      const [schemes, state] = await Promise.all([
        window.api.productResearch.listSchemes(),
        window.api.productResearch.getSchemeState(schemeId.value),
      ])
      scheme.value = schemes.find((item) => item.id === schemeId.value) || null
      if (!scheme.value) throw new Error('方案不存在或已被删除')
      keywords.value = (state?.keywords || []).map((item) => ({ ...item }))
      candidateIds.value = [...(state?.candidateIds || [])]
      productEdits.value = (state?.productEdits || []).map((item) => ({ ...item }))
      liveTestRecords.value = (state?.liveTestRecords || []).map((item) => ({ ...item }))
      currentStep.value = Math.min(5, Math.max(1, scheme.value.sopStage || 1))
      await refreshSnapshot(false)
      dirty.value = false
    } catch (error) {
      loadError.value = errorText(error)
    } finally {
      loading.value = false
      setTimeout(() => { hydrating = false }, 0)
    }
  }

  // ===== Persistence =====
  async function save(options: { silent?: boolean } = {}) {
    if (!scheme.value) return false
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null }
    saving.value = true
    try {
      await window.api.productResearch.saveSchemeState(schemeId.value, JSON.parse(JSON.stringify({
        keywords: keywords.value,
        candidateIds: candidateIds.value,
        productEdits: productEdits.value,
        liveTestRecords: liveTestRecords.value,
      })))
      dirty.value = false
      lastSavedAt.value = Date.now()
      scheme.value.keywordCount = keywords.value.length
      scheme.value.candidateCount = candidateIds.value.length
      scheme.value.updatedAt = Date.now()
      if (!options.silent) notify('方案已保存', 'success')
      return true
    } catch (error) {
      notify(`保存失败：${errorText(error)}`, 'error')
      return false
    } finally {
      saving.value = false
    }
  }

  function scheduleSave() {
    if (hydrating) return
    dirty.value = true
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => { void save({ silent: true }) }, 800)
  }

  watch([keywords, candidateIds, productEdits, liveTestRecords], scheduleSave, { deep: true })

  async function updateScheme(patch: Partial<Pick<ProductResearchScheme, 'name' | 'need' | 'market' | 'note' | 'status' | 'sopStage' | 'starred' | 'category'>>) {
    try {
      const next = await window.api.productResearch.updateScheme(schemeId.value, patch)
      if (next && scheme.value) Object.assign(scheme.value, next)
      return next
    } catch (error) {
      notify(`更新方案失败：${errorText(error)}`, 'error')
      return null
    }
  }

  async function goStep(step: number) {
    const target = Math.min(5, Math.max(1, step))
    if (target === currentStep.value) return
    await save({ silent: true })
    currentStep.value = target
    const patch: Parameters<typeof updateScheme>[0] = { sopStage: target }
    if (scheme.value?.status === 'draft' && target > 1) patch.status = 'active'
    if (target === 4 && scheme.value?.status === 'active') patch.status = 'pending'
    await updateScheme(patch)
  }

  // ===== Keywords =====
  function addKeywords(values: string[]) {
    const existing = new Set(keywords.value.map((item) => item.value.toLowerCase()))
    let added = 0
    for (const raw of values) {
      const value = raw.trim()
      if (!value || existing.has(value.toLowerCase())) continue
      if (keywords.value.length >= 200) { notify('搜索词最多 200 个', 'error'); break }
      existing.add(value.toLowerCase())
      keywords.value.push({ id: `kw-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, value, status: 'pending' })
      added += 1
    }
    applyKeywordStatus()
    return added
  }

  function renameKeyword(id: string, value: string) {
    const next = value.trim()
    const keyword = keywords.value.find((item) => item.id === id)
    if (!keyword || !next) return false
    if (keywords.value.some((item) => item.id !== id && item.value.toLowerCase() === next.toLowerCase())) {
      notify('搜索词已存在', 'error')
      return false
    }
    keyword.value = next
    applyKeywordStatus()
    return true
  }

  function removeKeywords(ids: string[]) {
    const set = new Set(ids)
    keywords.value = keywords.value.filter((item) => !set.has(item.id))
  }

  // ===== Collection =====
  function collectedFor(keyword: string) {
    return results.value.filter((item) => item.keyword === keyword).length
  }

  async function startCollection(options: { keywordIds: string[]; sort: 'sales' | 'comprehensive'; targetCount: number; supplementOnly: boolean }) {
    if (!devices.value.length) {
      notify('还没有连接过采集手机，请先连接手机', 'error')
      return 0
    }
    const running = new Set(activeTasks.value.map((item) => item.keyword))
    const targets = keywords.value.filter((item) => options.keywordIds.includes(item.id) && !running.has(item.value))
      .filter((item) => !options.supplementOnly || collectedFor(item.value) < options.targetCount)
    if (!targets.length) {
      notify(options.supplementOnly ? '所选搜索词采集数量均已达标，无需补采' : '没有可采集的搜索词（可能已在采集中）', 'info')
      return 0
    }
    let created = 0
    for (const keyword of targets) {
      try {
        const targetCount = options.supplementOnly ? Math.max(1, options.targetCount - collectedFor(keyword.value)) : options.targetCount
        await window.api.productResearch.createTask({ keyword: keyword.value, schemeId: schemeId.value, sort: options.sort, targetCount })
        keyword.status = 'running'
        created += 1
      } catch (error) {
        keyword.status = 'failed'
        notify(`「${keyword.value}」创建任务失败：${translateError(errorText(error))}`, 'error')
        break
      }
    }
    if (created) {
      notify(connectedDevices.value.length
        ? `已创建 ${created} 个采集任务，手机会按顺序逐个采集`
        : `已排队 ${created} 个采集任务，手机连上电脑后会自动开始`, 'success')
      if (scheme.value?.status === 'draft') await updateScheme({ status: 'active' })
    }
    await refreshSnapshot()
    return created
  }

  async function cancelTask(taskId: string) {
    try {
      await window.api.productResearch.cancelTask(taskId)
      await refreshSnapshot()
    } catch (error) {
      notify(`取消失败：${errorText(error)}`, 'error')
    }
  }

  async function retryTask(task: ProductResearchTask) {
    try {
      await window.api.productResearch.createTask({ keyword: task.keyword, schemeId: schemeId.value, sort: task.sort, targetCount: task.targetCount })
      notify(`已重新提交「${task.keyword}」`, 'success')
      await refreshSnapshot()
    } catch (error) {
      notify(`重试失败：${translateError(errorText(error))}`, 'error')
    }
  }

  async function removeTask(taskId: string) {
    try {
      await window.api.productResearch.removeTask(taskId)
      await refreshSnapshot()
    } catch (error) {
      notify(`删除失败：${errorText(error)}`, 'error')
    }
  }

  async function removeResults(ids: string[]) {
    if (!ids.length) return 0
    try {
      const removed = await window.api.productResearch.removeResults(ids, schemeId.value)
      const set = new Set(ids)
      candidateIds.value = candidateIds.value.filter((id) => !set.has(id))
      productEdits.value = productEdits.value.filter((item) => !set.has(item.resultId))
      await refreshSnapshot()
      notify(`已删除 ${removed} 个商品`, 'success')
      return removed
    } catch (error) {
      notify(`删除失败：${errorText(error)}`, 'error')
      return 0
    }
  }

  // ===== Candidates & edits =====
  function addCandidates(ids: string[]) {
    const set = new Set(candidateIds.value)
    let added = 0
    for (const id of ids) if (!set.has(id)) { set.add(id); added += 1 }
    candidateIds.value = [...set]
    return added
  }

  function removeCandidates(ids: string[]) {
    const set = new Set(ids)
    candidateIds.value = candidateIds.value.filter((id) => !set.has(id))
  }

  function toggleCandidate(id: string) {
    if (candidateSet.value.has(id)) removeCandidates([id])
    else addCandidates([id])
  }

  function editFor(resultId: string): ProductResearchProductEdit {
    return productEdits.value.find((item) => item.resultId === resultId)
      || { resultId, kept: false, category: scheme.value?.category || '', targetPrice: '', sellingPoint: '' }
  }

  function setEdits(resultIds: string[], patch: Partial<Omit<ProductResearchProductEdit, 'resultId'>>) {
    for (const resultId of resultIds) {
      const existing = productEdits.value.find((item) => item.resultId === resultId)
      if (existing) Object.assign(existing, patch)
      else productEdits.value.push({ ...editFor(resultId), ...patch })
    }
  }

  // ===== Live tests =====
  function upsertTestRecord(record: Omit<ProductResearchLiveTestRecord, 'id' | 'schemeId' | 'updatedAt'> & { id?: string }) {
    const now = Date.now()
    if (record.id) {
      const existing = liveTestRecords.value.find((item) => item.id === record.id)
      if (existing) {
        Object.assign(existing, record, { updatedAt: now })
        return existing
      }
    }
    const created: ProductResearchLiveTestRecord = { ...record, id: `lt-${now.toString(36)}-${Math.random().toString(36).slice(2, 6)}`, schemeId: schemeId.value, updatedAt: now }
    liveTestRecords.value.push(created)
    return created
  }

  function removeTestRecords(ids: string[]) {
    const set = new Set(ids)
    liveTestRecords.value = liveTestRecords.value.filter((item) => !set.has(item.id))
  }

  function setConclusion(ids: string[], conclusion: ProductResearchLiveTestRecord['conclusion']) {
    const now = Date.now()
    for (const record of liveTestRecords.value) {
      if (ids.includes(record.id)) { record.conclusion = conclusion; record.updatedAt = now }
    }
  }

  // ===== Polling =====
  function startPolling() {
    stopPolling()
    let tick = 0
    pollTimer = setInterval(() => {
      tick += 1
      // Fast refresh while tasks run, otherwise refresh device status every ~10s.
      if (activeTasks.value.length > 0 || tick % 5 === 0) void refreshSnapshot()
    }, 2000)
  }

  function stopPolling() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
  }

  onBeforeUnmount(() => {
    stopPolling()
    if (saveTimer) { clearTimeout(saveTimer); void save({ silent: true }) }
    if (toastTimer) clearTimeout(toastTimer)
  })

  return {
    schemeId, scheme, keywords, candidateIds, productEdits, liveTestRecords, tasks, results, devices, endpoint, serverRunning,
    loading, loadError, saving, dirty, lastSavedAt, currentStep, toast,
    connectedDevices, activeTasks, failedTasks, candidateSet, resultMap, productRows, candidateRows, keptCount,
    notify, load, refreshSnapshot, save, updateScheme, goStep,
    addKeywords, renameKeyword, removeKeywords, collectedFor, startCollection, cancelTask, retryTask, removeTask, removeResults,
    addCandidates, removeCandidates, toggleCandidate, editFor, setEdits,
    upsertTestRecord, removeTestRecords, setConclusion,
    startPolling, stopPolling,
  }
}

export type SchemeWorkspace = ReturnType<typeof createSchemeWorkspace>

const KEY: InjectionKey<SchemeWorkspace> = Symbol('product-research-scheme-workspace')

export function provideSchemeWorkspace(schemeId: Ref<string>) {
  const workspace = createSchemeWorkspace(schemeId)
  provide(KEY, workspace)
  return workspace
}

export function useSchemeWorkspace() {
  const workspace = inject(KEY)
  if (!workspace) throw new Error('useSchemeWorkspace() must be used inside ProductResearchDetailView')
  return workspace
}
