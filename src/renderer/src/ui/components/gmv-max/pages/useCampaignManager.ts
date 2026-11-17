import { computed, reactive, ref, watch } from 'vue'
import type { GmvChangeResult, GmvChangeRow } from '../gmvChangeTypes'
import type { GmvWorkspaceContext } from './workspaceContext'

/**
 * Ads manager behaviour on top of the workspace state: inline budget / target ROI edits, on-off switches,
 * bulk changes, the column chooser and saved views. Every write goes through a confirm dialog and then the
 * main-process manual-change executor, which verifies TikTok state, logs the change and allows rollback.
 */

type Campaign = {
  id: string
  name: string
  storeId: string
  budget: string
  roasBid: string
  operationStatus: string
  profitGuard: { complete: boolean; effectiveRoiFloor?: string }
}
type Change = { campaignId: string; budget?: string; roasBid?: string; operationStatus?: string }
type AdjustMode = 'up' | 'down' | 'set'

export const CAMPAIGN_COLUMNS = ['status', 'budget', 'spend', 'gmv', 'roi', 'orders', 'cpa', 'aov', 'protection'] as const
export type CampaignColumn = (typeof CAMPAIGN_COLUMNS)[number]
const DEFAULT_COLUMNS: CampaignColumn[] = ['status', 'budget', 'spend', 'gmv', 'roi', 'orders']
const COLUMNS_KEY = 'gmv-campaign-columns'
const VIEWS_KEY = 'gmv-campaign-views'

export type CampaignView = {
  id: string
  name: string
  columns: CampaignColumn[]
  pacingState: string
  status: string
  search: string
  minSpend?: number
  minOrders?: number
  minRoi?: number
  minUtilization?: number
  sortBy: string
  sortDirection: 'asc' | 'desc'
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}
function writeJson(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* preferences are optional */
  }
}

export function useCampaignManager(ws: GmvWorkspaceContext) {
  const t = ws.t as (key: string, values?: Record<string, unknown>) => string
  const money = (value: number | string, storeId: string) => ws.formatCny(value, storeId) as string
  const roi = (value: number | string) => ws.formatRoi(value) as string

  // ---------- selection ----------
  const selected = ref<string[]>([])
  const pageIds = computed<string[]>(() => (ws.pagedCampaigns.value as Campaign[]).map((item) => item.id))
  const allSelected = computed(() => pageIds.value.length > 0 && pageIds.value.every((id) => selected.value.includes(id)))
  function toggleSelect(id: string) {
    selected.value = selected.value.includes(id) ? selected.value.filter((item) => item !== id) : [...selected.value, id]
  }
  function toggleSelectAll() {
    selected.value = allSelected.value ? [] : [...pageIds.value]
  }
  watch(pageIds, (ids) => {
    selected.value = selected.value.filter((id) => ids.includes(id))
  })
  const selectedCampaigns = computed(() => (ws.pagedCampaigns.value as Campaign[]).filter((item) => selected.value.includes(item.id)))

  // ---------- risk notes ----------
  function budgetWarnings(campaign: Campaign, next: number) {
    const current = Number(campaign.budget) || 0
    const notes: string[] = []
    if (current > 0 && next > current * 1.5) notes.push(t('gmvV2.edit.warn.budgetJump'))
    if (current > 0 && next < current * 0.5) notes.push(t('gmvV2.edit.warn.budgetCut'))
    return notes
  }
  function roiWarnings(campaign: Campaign, next: number) {
    const current = Number(campaign.roasBid) || 0
    const floor = Number(campaign.profitGuard?.effectiveRoiFloor) || 0
    const notes: string[] = []
    if (campaign.profitGuard?.complete && floor > 0 && next < floor) notes.push(t('gmvV2.edit.warn.belowFloor', { floor: roi(floor) }))
    if (current > 0 && Math.abs(next - current) / current > 0.3) notes.push(t('gmvV2.edit.warn.roiJump'))
    return notes
  }
  const ratio = (next: number, current: number) => (current > 0 ? (next - current) / current : null)

  function budgetRow(campaign: Campaign, next: number): GmvChangeRow {
    const current = Number(campaign.budget) || 0
    return {
      campaignId: campaign.id,
      campaignName: campaign.name,
      field: 'budget',
      before: money(current, campaign.storeId),
      after: money(next, campaign.storeId),
      change: ratio(next, current),
      warnings: budgetWarnings(campaign, next),
    }
  }
  function roiRow(campaign: Campaign, next: number): GmvChangeRow {
    const current = Number(campaign.roasBid) || 0
    return {
      campaignId: campaign.id,
      campaignName: campaign.name,
      field: 'roi',
      before: roi(current),
      after: roi(next),
      change: ratio(next, current),
      warnings: roiWarnings(campaign, next),
    }
  }
  function statusRow(campaign: Campaign, status: 'ENABLE' | 'DISABLE'): GmvChangeRow {
    return {
      campaignId: campaign.id,
      campaignName: campaign.name,
      field: 'status',
      before: ws.operationStatusLabel(campaign.operationStatus),
      after: ws.operationStatusLabel(status),
      warnings: status === 'DISABLE' ? [t('gmvV2.edit.warn.pause')] : [],
    }
  }

  // ---------- dialog ----------
  const dialog = reactive({
    open: false,
    phase: 'confirm' as 'confirm' | 'running' | 'done',
    rows: [] as GmvChangeRow[],
    changes: [] as Change[],
    results: [] as GmvChangeResult[],
  })
  const blockedReason = computed(() => (ws.dashboard.value?.scheduler?.emergencyStopped ? t('gmvV2.edit.errors.stopped') : ''))
  function openDialog(rows: GmvChangeRow[], changes: Change[]) {
    if (!changes.length) return
    Object.assign(dialog, { open: true, phase: 'confirm', rows, changes, results: [] })
  }
  function closeDialog() {
    const changed = dialog.phase === 'done' && dialog.results.some((item) => item.ok)
    dialog.open = false
    if (changed) {
      selected.value = []
      void ws.refreshWorkspace(false)
    }
  }

  function errorMessage(error: unknown) {
    const raw = error instanceof Error ? error.message : String(error || '')
    const codes: Array<[RegExp, string]> = [
      [/GMV_MAX_MANUAL_NO_CHANGE/, 'noChange'],
      [/GMV_MAX_MANUAL_BUDGET_INVALID/, 'budgetInvalid'],
      [/GMV_MAX_MANUAL_ROI_INVALID/, 'roiInvalid'],
      [/emergency stop/i, 'stopped'],
      [/ACTION_PENDING_VERIFICATION/, 'pending'],
      [/precondition failed/i, 'changedRemotely'],
      [/binding is unavailable|capability is unavailable|not connected|No GMV MAX connection|authorization is required/i, "notConnected"],
    ]
    const hit = codes.find(([pattern]) => pattern.test(raw))
    return hit ? t(`gmvV2.edit.errors.${hit[1]}`) : raw.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
  }

  async function confirmDialog() {
    if (blockedReason.value) return
    dialog.phase = 'running'
    dialog.results = []
    const api = window.api.tiktokGmvMax
    if (dialog.changes.length === 1) {
      // IPC needs plain objects, not reactive proxies.
      const change = { ...dialog.changes[0] }
      try {
        const executed = await api.applyManualChange(change)
        dialog.results = [{ campaignId: change.campaignId, ok: true, undoId: executed?.id }]
      } catch (error) {
        dialog.results = [{ campaignId: change.campaignId, ok: false, error: errorMessage(error) }]
      }
    } else {
      try {
        const outcome = await api.applyManualChanges({ changes: dialog.changes.map((item) => ({ ...item })) })
        dialog.results = (outcome?.items || []).map((item: { campaignId: string; status: string; error?: string }) => ({
          campaignId: item.campaignId,
          ok: item.status === 'succeeded',
          error: item.error ? errorMessage(item.error) : undefined,
        }))
      } catch (error) {
        const message = errorMessage(error)
        dialog.results = dialog.changes.map((item) => ({ campaignId: item.campaignId, ok: false, error: message }))
      }
    }
    dialog.phase = 'done'
  }

  async function undo(id: string) {
    try {
      await window.api.tiktokGmvMax.rollback({ id })
      dialog.results = dialog.results.map((item) => (item.undoId === id ? { ...item, undoId: undefined, error: t('gmvV2.edit.undone') } : item))
      void ws.refreshWorkspace(false)
    } catch (error) {
      dialog.results = dialog.results.map((item) => (item.undoId === id ? { ...item, error: errorMessage(error) } : item))
    }
  }

  // ---------- inline edit ----------
  const editing = ref<{ campaignId: string; field: 'budget' | 'roi'; value: string } | null>(null)
  function startEdit(campaign: Campaign, field: 'budget' | 'roi') {
    editing.value = { campaignId: campaign.id, field, value: field === 'budget' ? String(Number(campaign.budget) || '') : String(Number(campaign.roasBid) || '') }
  }
  function cancelEdit() {
    editing.value = null
  }
  function submitEdit(campaign: Campaign) {
    const edit = editing.value
    if (!edit || edit.campaignId !== campaign.id) return
    const next = Number(edit.value)
    editing.value = null
    if (!Number.isFinite(next) || next <= 0) return
    if (edit.field === 'budget') {
      if (Math.abs(next - (Number(campaign.budget) || 0)) < 0.005) return
      openDialog([budgetRow(campaign, next)], [{ campaignId: campaign.id, budget: next.toFixed(2) }])
    } else {
      if (Math.abs(next - (Number(campaign.roasBid) || 0)) < 0.005) return
      openDialog([roiRow(campaign, next)], [{ campaignId: campaign.id, roasBid: next.toFixed(2) }])
    }
  }
  function toggleStatus(campaign: Campaign) {
    const next = String(campaign.operationStatus).toUpperCase() === 'ENABLE' ? 'DISABLE' : 'ENABLE'
    openDialog([statusRow(campaign, next)], [{ campaignId: campaign.id, operationStatus: next }])
  }

  // ---------- bulk ----------
  const bulkBudget = reactive({ mode: 'up' as AdjustMode, value: 10 })
  const bulkRoi = reactive({ mode: 'set' as AdjustMode, value: 2 })
  function adjusted(current: number, mode: AdjustMode, value: number) {
    if (mode === 'set') return value
    return current * (1 + (mode === 'up' ? 1 : -1) * (value / 100))
  }
  function bulkStatus(status: 'ENABLE' | 'DISABLE') {
    const targets = selectedCampaigns.value.filter((item) => String(item.operationStatus).toUpperCase() !== status)
    openDialog(targets.map((item) => statusRow(item, status)), targets.map((item) => ({ campaignId: item.id, operationStatus: status })))
  }
  function bulkBudgetApply() {
    const value = Number(bulkBudget.value)
    if (!Number.isFinite(value) || value <= 0) return
    const rows: GmvChangeRow[] = []
    const changes: Change[] = []
    for (const campaign of selectedCampaigns.value) {
      const next = Math.round(adjusted(Number(campaign.budget) || 0, bulkBudget.mode, value) * 100) / 100
      if (next <= 0 || Math.abs(next - (Number(campaign.budget) || 0)) < 0.005) continue
      rows.push(budgetRow(campaign, next))
      changes.push({ campaignId: campaign.id, budget: next.toFixed(2) })
    }
    openDialog(rows, changes)
  }
  function bulkRoiApply() {
    const value = Number(bulkRoi.value)
    if (!Number.isFinite(value) || value <= 0) return
    const rows: GmvChangeRow[] = []
    const changes: Change[] = []
    for (const campaign of selectedCampaigns.value) {
      const next = Math.round(adjusted(Number(campaign.roasBid) || 0, bulkRoi.mode, value) * 100) / 100
      if (next <= 0 || Math.abs(next - (Number(campaign.roasBid) || 0)) < 0.005) continue
      rows.push(roiRow(campaign, next))
      changes.push({ campaignId: campaign.id, roasBid: next.toFixed(2) })
    }
    openDialog(rows, changes)
  }

  // ---------- columns ----------
  const columns = ref<CampaignColumn[]>(
    readJson<CampaignColumn[]>(COLUMNS_KEY, DEFAULT_COLUMNS).filter((item) => (CAMPAIGN_COLUMNS as readonly string[]).includes(item)),
  )
  const showColumn = (column: CampaignColumn) => columns.value.includes(column)
  function toggleColumn(column: CampaignColumn) {
    columns.value = showColumn(column)
      ? columns.value.filter((item) => item !== column)
      : CAMPAIGN_COLUMNS.filter((item) => item === column || columns.value.includes(item))
    writeJson(COLUMNS_KEY, columns.value)
  }
  function resetColumns() {
    columns.value = [...DEFAULT_COLUMNS]
    writeJson(COLUMNS_KEY, columns.value)
  }

  // ---------- saved views ----------
  const views = ref<CampaignView[]>(readJson<CampaignView[]>(VIEWS_KEY, []))
  const viewName = ref('')
  const activeViewId = ref('')
  function saveView() {
    const name = viewName.value.trim()
    if (!name) return
    const view: CampaignView = {
      id: `${Date.now()}`,
      name,
      columns: [...columns.value],
      pacingState: ws.campaignPacingState.value,
      status: ws.campaignStatus.value,
      search: ws.searchText.value,
      minSpend: ws.minCampaignSpend.value,
      minOrders: ws.minCampaignOrders.value,
      minRoi: ws.minCampaignRoi.value,
      minUtilization: ws.minCampaignUtilization.value,
      sortBy: ws.campaignSortBy.value,
      sortDirection: ws.campaignSortDirection.value,
    }
    views.value = [...views.value.filter((item) => item.name !== name), view]
    writeJson(VIEWS_KEY, views.value)
    activeViewId.value = view.id
    viewName.value = ''
  }
  function applyView(view: CampaignView) {
    activeViewId.value = view.id
    columns.value = view.columns.filter((item) => (CAMPAIGN_COLUMNS as readonly string[]).includes(item))
    writeJson(COLUMNS_KEY, columns.value)
    ws.campaignPacingState.value = view.pacingState || 'all'
    ws.campaignStatus.value = view.status || 'all'
    ws.searchText.value = view.search || ''
    ws.minCampaignSpend.value = view.minSpend
    ws.minCampaignOrders.value = view.minOrders
    ws.minCampaignRoi.value = view.minRoi
    ws.minCampaignUtilization.value = view.minUtilization
    ws.campaignSortBy.value = view.sortBy || 'cost'
    ws.campaignSortDirection.value = view.sortDirection || 'desc'
    void ws.loadCampaignPage(1)
  }
  function removeView(id: string) {
    views.value = views.value.filter((item) => item.id !== id)
    writeJson(VIEWS_KEY, views.value)
    if (activeViewId.value === id) activeViewId.value = ''
  }

  return {
    selected,
    allSelected,
    toggleSelect,
    toggleSelectAll,
    clearSelection: () => (selected.value = []),
    dialog,
    blockedReason,
    confirmDialog,
    closeDialog,
    undo,
    editing,
    startEdit,
    cancelEdit,
    submitEdit,
    toggleStatus,
    bulkBudget,
    bulkRoi,
    bulkStatus,
    bulkBudgetApply,
    bulkRoiApply,
    columns,
    showColumn,
    toggleColumn,
    resetColumns,
    views,
    viewName,
    activeViewId,
    saveView,
    applyView,
    removeView,
  }
}
