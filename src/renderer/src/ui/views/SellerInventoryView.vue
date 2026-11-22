<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Boxes,
  ChevronLeft,
  Cookie,
  ExternalLink,
  Flame,
  ImageIcon,
  LoaderCircle,
  PackageX,
  PackagePlus,
  Plus,
  RefreshCcw,
  Search,
  ShoppingCart,
  Trash2,
  TrendingUp,
  Wallet,
  X,
} from 'lucide-vue-next'
import type {
  SiCodeSummary,
  SiDashboard,
  SiMappingRow,
  SiSettings,
  SiShop,
  SiStockMove,
  SiStockMoveKind,
  SiSyncProgress,
} from '../../../../shared/sellerInventory'
import type { CreatorHubShop } from '../../../../shared/creatorHub'
import ChCookieDialog from './creator-hub/ChCookieDialog.vue'

type Tab = 'overview' | 'daily' | 'stock' | 'mapping' | 'settings'
type Filter = 'all' | 'attention' | 'hot' | 'slow' | 'unmapped'

const api = window.api.sellerInventory
const router = useRouter()
const { t, locale } = useI18n()

const tab = ref<Tab>('overview')
const days = ref(30)
const shopKey = ref('')
const filter = ref<Filter>('all')
const keyword = ref('')
const dailyMetric = ref<'units' | 'amount'>('units')
const loading = ref(false)
const dashboard = ref<SiDashboard | null>(null)
const progress = ref<SiSyncProgress[]>([])
const mappings = ref<SiMappingRow[]>([])
const mappingDrafts = reactive<Record<string, string>>({})
const onlyUnmapped = ref(true)
const moves = ref<SiStockMove[]>([])
const settingsForm = reactive<SiSettings>({ leadDays: 7, safetyDays: 7, coverDays: 30, historyDays: 90, orderWindowDays: 14 })
const notice = ref('')
const errorText = ref('')
const moveForm = reactive<{ code: string; kind: SiStockMoveKind; quantity: number | null; date: string; unitCost: number | null; note: string }>({ code: '', kind: 'count', quantity: null, date: '', unitCost: null, note: '' })
const detailKey = ref('')
const detailRules = reactive<{ name: string; leadDays: number | null; safetyDays: number | null; cost: number | null }>({ name: '', leadDays: null, safetyDays: null, cost: null })
const cookieDialog = ref<{ open: boolean; shop: CreatorHubShop | null }>({ open: false, shop: null })
let pollTimer: ReturnType<typeof setInterval> | null = null
let noticeTimer: ReturnType<typeof setTimeout> | null = null
let pollCount = 0

const CURRENCY: Record<string, string> = { VN: '₫', TH: '฿', MY: 'RM', PH: '₱', ID: 'Rp', SG: 'S$', US: '$', GB: '£' }

const allShops = ref<SiShop[]>([])
const currency = computed(() => CURRENCY[(allShops.value[0]?.region || '').toUpperCase()] || '')
const syncing = computed(() => progress.value.some((item) => item.status === 'running'))
const runningJob = computed(() => progress.value.find((item) => item.status === 'running'))
const items = computed(() => dashboard.value?.items || [])
const kpi = computed(() => dashboard.value?.kpi)
const dates = computed(() => [...(dashboard.value?.dates || [])].reverse().slice(0, days.value))
const detail = computed(() => items.value.find((item) => item.key === detailKey.value) || null)
const mappedCodes = computed(() => items.value.filter((item) => item.mapped).map((item) => item.key).sort())

const failedShops = computed(() => allShops.value.filter((shop) => shop.state.lastSyncError))
const neverSynced = computed(() => allShops.value.length > 0 && allShops.value.every((shop) => !shop.state.lastSyncAt))

const filteredItems = computed(() => {
  const needle = keyword.value.trim().toLowerCase()
  return items.value.filter((item) => {
    if (needle && !`${item.key} ${item.name}`.toLowerCase().includes(needle)) return false
    if (filter.value === 'attention') return ['out', 'urgent', 'reorder'].includes(item.risk)
    if (filter.value === 'hot') return item.tag === 'hot' || item.tag === 'rising'
    if (filter.value === 'slow') return item.tag === 'slow' || item.risk === 'overstock'
    if (filter.value === 'unmapped') return !item.mapped
    return true
  })
})

const filterCounts = computed(() => ({
  all: items.value.length,
  attention: items.value.filter((item) => ['out', 'urgent', 'reorder'].includes(item.risk)).length,
  hot: items.value.filter((item) => item.tag === 'hot' || item.tag === 'rising').length,
  slow: items.value.filter((item) => item.tag === 'slow' || item.risk === 'overstock').length,
  unmapped: items.value.filter((item) => !item.mapped).length,
}))

type Todo = { key: string; tone: 'red' | 'amber' | 'accent' | 'blue'; text: string; item?: SiCodeSummary; action?: () => void; actionLabel?: string }
const todos = computed<Todo[]>(() => {
  const list: Todo[] = []
  for (const item of items.value) {
    if (item.risk === 'out' && item.units7 > 0) list.push({ key: `out-${item.key}`, tone: 'red', item, text: t('sellerInv.todo.out', { code: item.key, units: fmt(item.units7) }) })
  }
  for (const item of items.value) {
    if (item.risk === 'urgent') list.push({ key: `urgent-${item.key}`, tone: 'red', item, text: t('sellerInv.todo.urgent', { code: item.key, days: fmtDays(item.daysLeft), qty: fmt(item.suggestQty) }) })
  }
  for (const item of items.value) {
    if (item.risk === 'reorder') list.push({ key: `reorder-${item.key}`, tone: 'amber', item, text: t('sellerInv.todo.reorder', { code: item.key, qty: fmt(item.suggestQty) }) })
  }
  for (const item of items.value.filter((entry) => entry.tag === 'hot').slice(0, 5)) {
    list.push({ key: `hot-${item.key}`, tone: 'accent', item, text: t('sellerInv.todo.hot', { code: item.key, units: fmt(item.units7), growth: fmtGrowth(item.growth7) }) })
  }
  const unmapped = kpi.value?.unmappedCount || 0
  if (unmapped) list.push({ key: 'unmapped', tone: 'blue', text: t('sellerInv.todo.unmapped', { n: unmapped }), action: () => { tab.value = 'mapping' }, actionLabel: t('sellerInv.todo.fixMapping') })
  return list.slice(0, 12)
})

const filteredMappings = computed(() => (onlyUnmapped.value ? mappings.value.filter((row) => !row.sellerSku && !row.mappedCode) : mappings.value))
const suggestionCount = computed(() => mappings.value.filter((row) => !row.sellerSku && !row.mappedCode && row.suggestion).length)

const detailSeries = computed(() => {
  if (!detail.value || !dashboard.value) return []
  const cells = dashboard.value.matrix[detail.value.key] || {}
  return [...dashboard.value.dates].slice(-Math.min(days.value, 60)).map((date) => ({ date, units: cells[date]?.units || 0 }))
})
const detailMax = computed(() => Math.max(1, ...detailSeries.value.map((point) => point.units)))
const detailMoves = computed(() => moves.value.filter((move) => move.code === detail.value?.key))

function fmt(value: number | undefined, digits = 0) {
  if (value === undefined || value === null || !Number.isFinite(value)) return '—'
  return new Intl.NumberFormat(locale.value, { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(value)
}

function fmtMoney(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value)) return '—'
  const text = new Intl.NumberFormat(locale.value, { maximumFractionDigits: value >= 1000 ? 0 : 2 }).format(value)
  return currency.value ? `${text}${currency.value}` : text
}

function fmtGrowth(value: number | undefined) {
  if (value === undefined) return 'NEW'
  const pct = Math.round(value * 100)
  return `${pct > 0 ? '+' : ''}${pct}%`
}

function fmtDays(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value)) return '—'
  return value >= 100 ? '99+' : fmt(value, value < 10 ? 1 : 0)
}

function fmtTime(ms: number | undefined) {
  if (!ms) return t('sellerInv.neverSynced')
  return new Intl.DateTimeFormat(locale.value, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(ms))
}

function shortDate(date: string) {
  return date.slice(5).replace('-', '/')
}

function riskTone(risk: SiCodeSummary['risk']) {
  return { out: 'vg-pill--red', urgent: 'vg-pill--red', reorder: 'vg-pill--amber', healthy: 'vg-pill--green', overstock: 'vg-pill--violet', unknown: '' }[risk]
}

function tagTone(tag: SiCodeSummary['tag']) {
  return { hot: 'vg-pill--solid-red', rising: 'vg-pill--green', stable: 'vg-pill--blue', declining: 'vg-pill--amber', slow: 'vg-pill--violet', new: 'vg-pill--accent', none: '' }[tag]
}

function shopName(key: string) {
  return allShops.value.find((shop) => shop.shopKey === key)?.name || key
}

function errorMessage(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error || '')
  const code = Object.keys({ SELLER_LOGIN_REQUIRED: 1, SELLER_INVENTORY_CODE_REQUIRED: 1, SELLER_INVENTORY_QUANTITY_INVALID: 1, SELLER_INVENTORY_DATE_IN_FUTURE: 1, SELLER_INVENTORY_SYNC_RUNNING: 1 }).find((key) => raw.includes(key))
  return code ? t(`sellerInv.errors.${code}`) : raw.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

function flash(text: string) {
  notice.value = text
  if (noticeTimer) clearTimeout(noticeTimer)
  noticeTimer = setTimeout(() => { notice.value = '' }, 3000)
}

function stageText(job: SiSyncProgress | undefined) {
  if (!job?.stage) return t('sellerInv.syncing')
  return `${shopName(job.shopKey)} · ${t(`sellerInv.stage.${job.stage}`, { detail: job.detail || '' })}`
}

async function loadDashboard() {
  loading.value = true
  errorText.value = ''
  try {
    const [next, shopList] = await Promise.all([
      api.getDashboard({ days: days.value, shopKey: shopKey.value || undefined }),
      api.listShops(),
    ])
    dashboard.value = next
    allShops.value = shopList
    Object.assign(settingsForm, next.settings)
  } catch (error) {
    errorText.value = errorMessage(error)
  } finally {
    loading.value = false
  }
}

async function loadMappings() {
  try {
    mappings.value = await api.listMappings()
    for (const row of mappings.value) mappingDrafts[row.skuKey] = row.mappedCode || ''
  } catch (error) {
    errorText.value = errorMessage(error)
  }
}

async function loadMoves() {
  try {
    moves.value = await api.listMoves()
  } catch (error) {
    errorText.value = errorMessage(error)
  }
}

async function pollProgress() {
  const wasSyncing = syncing.value
  progress.value = await api.getProgress().catch(() => progress.value)
  if (syncing.value) {
    // Show partial results every few polls while a long first sync runs.
    pollCount += 1
    if (pollCount % 4 === 0) void loadDashboard()
    return
  }
  stopPolling()
  if (wasSyncing) {
    await Promise.all([loadDashboard(), loadMappings()])
    const failed = progress.value.filter((item) => item.status === 'failed')
    if (failed.length) errorText.value = failed.map((item) => t('sellerInv.syncFailed', { shop: shopName(item.shopKey), error: errorMessage(item.error) })).join('\n')
  }
}

function startPolling() {
  if (pollTimer) return
  pollTimer = setInterval(() => { void pollProgress() }, 1500)
}

function stopPolling() {
  if (pollTimer) clearInterval(pollTimer)
  pollTimer = null
}

async function sync(key?: string) {
  errorText.value = ''
  try {
    await api.sync(key ? { shopKey: key } : undefined)
    progress.value = await api.getProgress()
    startPolling()
  } catch (error) {
    errorText.value = errorMessage(error)
  }
}

async function openSellerCenter(key: string) {
  try {
    await api.openSellerCenter(key)
  } catch (error) {
    errorText.value = errorMessage(error)
  }
}

async function saveMapping(row: SiMappingRow, code = mappingDrafts[row.skuKey]) {
  try {
    await api.setMapping({ skuKey: row.skuKey, code: code || '' })
    mappingDrafts[row.skuKey] = (code || '').trim().toUpperCase()
    row.mappedCode = mappingDrafts[row.skuKey] || undefined
    flash(t('sellerInv.mapping.saved'))
    void loadDashboard()
  } catch (error) {
    errorText.value = errorMessage(error)
  }
}

async function applySuggestions() {
  try {
    const result = await api.applySuggestions()
    flash(t('sellerInv.mapping.applied', { n: result.applied }))
    await Promise.all([loadMappings(), loadDashboard()])
  } catch (error) {
    errorText.value = errorMessage(error)
  }
}

function startMove(code: string, kind: SiStockMoveKind = 'inbound') {
  moveForm.code = code
  moveForm.kind = kind
  moveForm.quantity = null
  moveForm.date = dashboard.value?.today || ''
  detailKey.value = ''
  tab.value = 'stock'
}

async function saveMove() {
  try {
    await api.addMove({
      code: moveForm.code,
      kind: moveForm.kind,
      quantity: Number(moveForm.quantity),
      date: moveForm.date || dashboard.value?.today || '',
      unitCost: moveForm.unitCost ?? undefined,
      note: moveForm.note,
    })
    moveForm.quantity = null
    moveForm.note = ''
    moveForm.unitCost = null
    flash(t('sellerInv.stock.saved'))
    await Promise.all([loadMoves(), loadDashboard()])
  } catch (error) {
    errorText.value = errorMessage(error)
  }
}

async function removeMove(move: SiStockMove) {
  if (!window.confirm(t('sellerInv.stock.confirmRemove'))) return
  try {
    await api.removeMove(move.id)
    await Promise.all([loadMoves(), loadDashboard()])
  } catch (error) {
    errorText.value = errorMessage(error)
  }
}

async function saveSettings() {
  try {
    const saved = await api.saveSettings({ ...settingsForm })
    Object.assign(settingsForm, saved)
    flash(t('sellerInv.settings.saved'))
    await loadDashboard()
  } catch (error) {
    errorText.value = errorMessage(error)
  }
}

/** Shop logins are shared with 达人管理: the same dialog and the same stored cookies. */
function openCookieDialog(shop?: SiShop) {
  cookieDialog.value = { open: true, shop: shop ? ({ id: shop.shopKey, name: shop.name, region: shop.region } as CreatorHubShop) : null }
}

async function onCookieImported(payload: { shop: CreatorHubShop }) {
  cookieDialog.value = { open: false, shop: null }
  flash(t('sellerInv.cookieSaved', { shop: payload.shop.name }))
  await loadDashboard()
  if (!syncing.value) await sync(payload.shop.id)
}

function openDetail(item: SiCodeSummary) {
  detailKey.value = item.key
  detailRules.name = ''
  detailRules.leadDays = item.leadDays === settingsForm.leadDays ? null : item.leadDays
  detailRules.safetyDays = item.safetyDays === settingsForm.safetyDays ? null : item.safetyDays
  detailRules.cost = item.cost ?? null
}

async function saveDetailRules() {
  if (!detail.value) return
  try {
    await api.saveSkuSettings({ code: detail.value.key, ...(detailRules.name ? { name: detailRules.name } : {}), leadDays: detailRules.leadDays, safetyDays: detailRules.safetyDays, cost: detailRules.cost })
    flash(t('sellerInv.settings.saved'))
    await loadDashboard()
  } catch (error) {
    errorText.value = errorMessage(error)
  }
}

watch([days, shopKey], () => { void loadDashboard() })
watch(tab, (next) => {
  if (next === 'mapping') void loadMappings()
  if (next === 'stock') void loadMoves()
})

onMounted(async () => {
  moveForm.date = ''
  await Promise.all([loadDashboard(), loadMoves()])
  progress.value = await api.getProgress().catch(() => [])
  if (syncing.value) startPolling()
  else if (allShops.value.length && (!dashboard.value?.lastSyncAt || Date.now() - dashboard.value.lastSyncAt > 60 * 60 * 1000)) {
    // Opening the page refreshes data that is more than an hour old.
    void sync()
  }
})

onBeforeUnmount(() => {
  stopPolling()
  if (noticeTimer) clearTimeout(noticeTimer)
})
</script>

<template>
  <main class="vg-scope vg-page si-page" data-testid="seller-inventory">
    <header class="vg-page-head">
      <span class="vg-page-head__icon"><Boxes :size="20" /></span>
      <div class="vg-page-head__text">
        <h1>{{ t('sellerInv.title') }}</h1>
        <p>{{ t('sellerInv.subtitle') }}</p>
      </div>
      <div class="vg-page-head__actions">
        <button type="button" class="vg-btn vg-btn--ghost" @click="router.push('/plugins')"><ChevronLeft :size="15" />{{ t('sellerInv.back') }}</button>
      </div>
    </header>

    <section class="vg-toolbar si-toolbar">
      <select v-model="shopKey" class="vg-select vg-select--sm" data-testid="si-shop">
        <option value="">{{ t('sellerInv.allShops') }}</option>
        <option v-for="shop in allShops" :key="shop.shopKey" :value="shop.shopKey">{{ shop.name }}</option>
      </select>
      <div class="vg-seg vg-seg--sm">
        <button v-for="n in [7, 14, 30, 90]" :key="n" type="button" class="vg-seg__btn" :class="{ 'is-active': days === n }" @click="days = n">{{ t('sellerInv.days', { n }) }}</button>
      </div>
      <span class="vg-toolbar__spacer"></span>
      <span class="vg-muted si-sync-status">
        <template v-if="syncing"><LoaderCircle :size="14" class="vg-spin" /> {{ stageText(runningJob) }}</template>
        <template v-else>{{ t('sellerInv.lastSync', { time: fmtTime(dashboard?.lastSyncAt) }) }}</template>
      </span>
      <button type="button" class="vg-btn vg-btn--primary vg-btn--sm" :disabled="syncing || !allShops.length" data-testid="si-sync" @click="sync()">
        <RefreshCcw :size="14" :class="{ 'vg-spin': syncing }" />{{ syncing ? t('sellerInv.syncing') : t('sellerInv.sync') }}
      </button>
    </section>

    <div v-if="!loading && dashboard && !allShops.length" class="vg-notice vg-notice--warning si-notice">
      <AlertTriangle :size="16" /><span>{{ t('sellerInv.noShop') }}</span>
      <button type="button" class="vg-btn vg-btn--primary vg-btn--sm" data-testid="si-add-shop" @click="openCookieDialog()"><Plus :size="13" />{{ t('sellerInv.addShop') }}</button>
    </div>
    <div v-else-if="neverSynced && syncing" class="vg-notice vg-notice--accent si-notice">
      <LoaderCircle :size="16" class="vg-spin" /><span>{{ t('sellerInv.firstSyncHint', { orders: settingsForm.orderWindowDays, history: settingsForm.historyDays }) }}</span>
    </div>
    <div v-for="shop in failedShops" :key="`err-${shop.shopKey}`" class="vg-notice vg-notice--danger si-notice">
      <AlertTriangle :size="16" />
      <span>{{ (shop.state.lastSyncError || '').includes('LOGIN') ? t('sellerInv.loginExpired', { shop: shop.name }) : t('sellerInv.syncFailed', { shop: shop.name, error: errorMessage(shop.state.lastSyncError) }) }}</span>
      <button type="button" class="vg-btn vg-btn--primary vg-btn--sm" :data-testid="`si-update-cookie-${shop.shopKey}`" @click="openCookieDialog(shop)"><Cookie :size="13" />{{ t('sellerInv.updateCookie') }}</button>
      <button type="button" class="vg-btn vg-btn--sm" @click="openSellerCenter(shop.shopKey)"><ExternalLink :size="13" />{{ t('sellerInv.openSellerCenter') }}</button>
      <button type="button" class="vg-btn vg-btn--sm" :disabled="syncing" @click="sync(shop.shopKey)">{{ t('sellerInv.syncAgain') }}</button>
    </div>
    <div v-if="errorText" class="vg-notice vg-notice--danger si-notice si-pre"><AlertTriangle :size="16" /><span>{{ errorText }}</span></div>
    <div v-if="notice" class="vg-notice vg-notice--accent si-notice"><span>{{ notice }}</span></div>

    <section v-if="kpi" class="vg-stats si-stats" data-testid="si-kpi">
      <div class="vg-stat">
        <span class="vg-stat__icon"><Wallet :size="17" /></span>
        <span class="vg-stat__body"><span class="vg-stat__label">{{ t('sellerInv.kpi.amountToday') }}</span><span class="vg-stat__value">{{ fmtMoney(kpi.amountToday) }}</span><small class="vg-muted">{{ t('sellerInv.kpi.vsYesterday', { value: fmtMoney(kpi.amountYesterday) }) }}</small></span>
      </div>
      <div class="vg-stat">
        <span class="vg-stat__icon vg-stat__icon--blue"><ShoppingCart :size="17" /></span>
        <span class="vg-stat__body"><span class="vg-stat__label">{{ t('sellerInv.kpi.unitsToday') }}</span><span class="vg-stat__value">{{ fmt(kpi.unitsToday) }}</span><small class="vg-muted">{{ t('sellerInv.kpi.orders', { n: fmt(kpi.ordersToday) }) }} · {{ t('sellerInv.kpi.vsYesterday', { value: fmt(kpi.unitsYesterday) }) }}</small></span>
      </div>
      <div class="vg-stat">
        <span class="vg-stat__icon vg-stat__icon--violet"><TrendingUp :size="17" /></span>
        <span class="vg-stat__body"><span class="vg-stat__label">{{ t('sellerInv.kpi.amount7') }}</span><span class="vg-stat__value">{{ fmtMoney(kpi.amount7) }}</span><small class="vg-muted">{{ t('sellerInv.kpi.vsPrev7', { value: kpi.amountPrev7 ? fmtGrowth((kpi.amount7 - kpi.amountPrev7) / kpi.amountPrev7) : '—' }) }}</small></span>
      </div>
      <button type="button" class="vg-stat si-stat-btn" @click="tab = 'overview'; filter = 'attention'">
        <span class="vg-stat__icon vg-stat__icon--amber"><PackagePlus :size="17" /></span>
        <span class="vg-stat__body"><span class="vg-stat__label">{{ t('sellerInv.kpi.reorder') }}</span><span class="vg-stat__value">{{ fmt(kpi.reorderCount) }}</span><small class="vg-muted">{{ t('sellerInv.kpi.skuUnit') }}</small></span>
      </button>
      <button type="button" class="vg-stat si-stat-btn" @click="tab = 'overview'; filter = 'attention'">
        <span class="vg-stat__icon vg-stat__icon--red"><PackageX :size="17" /></span>
        <span class="vg-stat__body"><span class="vg-stat__label">{{ t('sellerInv.kpi.out') }}</span><span class="vg-stat__value">{{ fmt(kpi.outCount) }}</span><small class="vg-muted">{{ t('sellerInv.kpi.skuUnit') }}</small></span>
      </button>
      <button type="button" class="vg-stat si-stat-btn" @click="tab = 'overview'; filter = 'hot'">
        <span class="vg-stat__icon vg-stat__icon--red"><Flame :size="17" /></span>
        <span class="vg-stat__body"><span class="vg-stat__label">{{ t('sellerInv.kpi.hot') }}</span><span class="vg-stat__value">{{ fmt(kpi.hotCount) }}</span><small class="vg-muted">{{ t('sellerInv.kpi.skuUnit') }}</small></span>
      </button>
    </section>

    <nav class="vg-tabs">
      <button v-for="name in (['overview', 'daily', 'stock', 'mapping', 'settings'] as Tab[])" :key="name" type="button" class="vg-tabs__btn" :class="{ 'is-active': tab === name }" :data-testid="`si-tab-${name}`" @click="tab = name">
        {{ t(`sellerInv.tabs.${name}`) }}<span v-if="name === 'mapping' && kpi?.unmappedCount" class="vg-count">{{ kpi.unmappedCount }}</span>
      </button>
    </nav>

    <!-- Overview -->
    <template v-if="tab === 'overview'">
      <section class="vg-card si-todo" data-testid="si-todo">
        <h2 class="vg-section-title">{{ t('sellerInv.todo.title') }}</h2>
        <p v-if="!todos.length" class="vg-muted">{{ t('sellerInv.todo.empty') }}</p>
        <ul v-else class="si-todo__list">
          <li v-for="todo in todos" :key="todo.key" class="si-todo__item">
            <span class="si-dot" :class="`si-dot--${todo.tone}`"></span>
            <button v-if="todo.item" type="button" class="vg-link si-todo__text" @click="openDetail(todo.item)">{{ todo.text }}</button>
            <span v-else class="si-todo__text">{{ todo.text }}</span>
            <button v-if="todo.item && todo.item.mapped && todo.tone !== 'accent'" type="button" class="vg-btn vg-btn--xs vg-btn--soft" @click="startMove(todo.item.key)">{{ t('sellerInv.table.inbound') }}</button>
            <button v-if="todo.action" type="button" class="vg-btn vg-btn--xs vg-btn--soft" @click="todo.action">{{ todo.actionLabel }}</button>
          </li>
        </ul>
      </section>

      <section class="vg-card vg-card--flush si-table-card">
        <div class="vg-toolbar si-filter">
          <div class="vg-seg vg-seg--sm">
            <button v-for="name in (['all', 'attention', 'hot', 'slow', 'unmapped'] as Filter[])" :key="name" type="button" class="vg-seg__btn" :class="{ 'is-active': filter === name }" @click="filter = name">
              {{ t(`sellerInv.filter.${name}`) }} <span class="vg-muted">{{ filterCounts[name] }}</span>
            </button>
          </div>
          <span class="vg-toolbar__spacer"></span>
          <label class="vg-search"><Search :size="14" /><input v-model="keyword" class="vg-input vg-input--sm" :placeholder="t('sellerInv.filter.search')" /></label>
        </div>
        <div class="vg-table-wrap si-table-wrap">
          <table class="vg-table vg-table--compact si-table" data-testid="si-table">
            <thead>
              <tr>
                <th>{{ t('sellerInv.table.sku') }}</th>
                <th class="num">{{ t('sellerInv.table.today') }}</th>
                <th class="num">{{ t('sellerInv.table.yesterday') }}</th>
                <th class="num">{{ t('sellerInv.table.units7') }}</th>
                <th class="num">{{ t('sellerInv.table.growth') }}</th>
                <th class="num">{{ t('sellerInv.table.amount7') }}</th>
                <th class="num">{{ t('sellerInv.table.stock') }}</th>
                <th class="num">{{ t('sellerInv.table.daysLeft') }}</th>
                <th>{{ t('sellerInv.table.status') }}</th>
                <th class="num">{{ t('sellerInv.table.suggest') }}</th>
                <th>{{ t('sellerInv.table.actions') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="loading && !items.length"><td colspan="11" class="vg-table__empty"><LoaderCircle :size="18" class="vg-spin" /></td></tr>
              <tr v-else-if="!items.length"><td colspan="11" class="vg-table__empty">{{ t('sellerInv.table.empty') }}</td></tr>
              <tr v-else-if="!filteredItems.length"><td colspan="11" class="vg-table__empty">{{ t('sellerInv.table.noMatch') }}</td></tr>
              <tr v-for="item in filteredItems" :key="item.key" class="si-row" @click="openDetail(item)">
                <td>
                  <div class="si-sku">
                    <span class="vg-thumb vg-thumb--sm si-thumb"><img v-if="item.image" :src="item.image" alt="" loading="lazy" /><ImageIcon v-else :size="14" /></span>
                    <span class="si-sku__text">
                      <strong>{{ item.mapped ? item.key : t('sellerInv.table.unmappedBadge') }}</strong>
                      <small class="vg-ellipsis" :title="item.name">{{ item.name }}</small>
                    </span>
                    <span v-if="item.tag !== 'none'" class="vg-pill" :class="tagTone(item.tag)">{{ t(`sellerInv.tag.${item.tag}`) }}</span>
                  </div>
                </td>
                <td class="num">{{ fmt(item.unitsToday) }}</td>
                <td class="num">{{ fmt(item.unitsYesterday) }}</td>
                <td class="num"><strong>{{ fmt(item.units7) }}</strong></td>
                <td class="num">
                  <span v-if="item.units7 || item.unitsPrev7" class="si-growth" :class="{ up: (item.growth7 ?? 1) > 0, down: (item.growth7 ?? 0) < 0 }">
                    <ArrowUpRight v-if="(item.growth7 ?? 1) > 0" :size="12" /><ArrowDownRight v-else-if="(item.growth7 ?? 0) < 0" :size="12" />{{ fmtGrowth(item.growth7) }}
                  </span>
                  <span v-else class="vg-muted">—</span>
                </td>
                <td class="num">{{ fmtMoney(item.amount7) }}</td>
                <td class="num" :title="t(item.stockSource === 'ledger' ? 'sellerInv.table.stockLedger' : item.stockSource === 'platform' ? 'sellerInv.table.stockPlatform' : 'sellerInv.table.stockNone')">
                  <span :class="{ 'si-neg': (item.stock ?? 1) <= 0 }">{{ fmt(item.stock) }}</span>
                  <small v-if="item.stockSource === 'platform'" class="vg-muted si-src">P</small>
                </td>
                <td class="num">{{ fmtDays(item.daysLeft) }}</td>
                <td><span v-if="item.risk !== 'unknown'" class="vg-pill" :class="riskTone(item.risk)">{{ t(`sellerInv.risk.${item.risk}`) }}</span><span v-else class="vg-muted">—</span></td>
                <td class="num"><strong v-if="item.suggestQty">{{ fmt(item.suggestQty) }}</strong><span v-else class="vg-muted">—</span></td>
                <td @click.stop>
                  <button v-if="item.mapped" type="button" class="vg-btn vg-btn--xs vg-btn--soft" @click="startMove(item.key)">{{ t('sellerInv.table.inbound') }}</button>
                  <button v-else type="button" class="vg-btn vg-btn--xs vg-btn--soft" @click="tab = 'mapping'">{{ t('sellerInv.todo.fixMapping') }}</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>

    <!-- Daily matrix -->
    <section v-else-if="tab === 'daily'" class="vg-card vg-card--flush si-table-card" data-testid="si-daily">
      <div class="vg-toolbar si-filter">
        <div class="vg-seg vg-seg--sm">
          <button type="button" class="vg-seg__btn" :class="{ 'is-active': dailyMetric === 'units' }" @click="dailyMetric = 'units'">{{ t('sellerInv.daily.units') }}</button>
          <button type="button" class="vg-seg__btn" :class="{ 'is-active': dailyMetric === 'amount' }" @click="dailyMetric = 'amount'">{{ t('sellerInv.daily.amount') }}</button>
        </div>
        <label class="vg-search"><Search :size="14" /><input v-model="keyword" class="vg-input vg-input--sm" :placeholder="t('sellerInv.filter.search')" /></label>
        <span class="vg-toolbar__spacer"></span>
        <small class="vg-muted si-hint">{{ t('sellerInv.daily.hint') }}</small>
      </div>
      <div class="vg-table-wrap si-table-wrap">
        <table class="vg-table vg-table--compact si-matrix">
          <thead>
            <tr>
              <th class="si-sticky">{{ t('sellerInv.table.sku') }}</th>
              <th class="num">{{ t('sellerInv.table.total') }}</th>
              <th v-for="date in dates" :key="date" class="num">{{ shortDate(date) }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="!filteredItems.length"><td :colspan="dates.length + 2" class="vg-table__empty">{{ t('sellerInv.table.empty') }}</td></tr>
            <tr v-for="item in filteredItems" :key="item.key" class="si-row" @click="openDetail(item)">
              <td class="si-sticky"><strong>{{ item.mapped ? item.key : t('sellerInv.table.unmappedBadge') }}</strong> <small class="vg-muted vg-ellipsis si-matrix__name">{{ item.name }}</small></td>
              <td class="num"><strong>{{ dailyMetric === 'units' ? fmt(dates.reduce((s, d) => s + (dashboard?.matrix[item.key]?.[d]?.units || 0), 0)) : fmtMoney(dates.reduce((s, d) => s + (dashboard?.matrix[item.key]?.[d]?.amount || 0), 0)) }}</strong></td>
              <td v-for="date in dates" :key="date" class="num" :class="{ 'si-zero': !dashboard?.matrix[item.key]?.[date]?.units }">
                {{ dailyMetric === 'units' ? fmt(dashboard?.matrix[item.key]?.[date]?.units || 0) : fmtMoney(dashboard?.matrix[item.key]?.[date]?.amount || 0) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Stock -->
    <section v-else-if="tab === 'stock'" class="si-stock" data-testid="si-stock">
      <form class="vg-card si-move-form" @submit.prevent="saveMove">
        <h2 class="vg-section-title">{{ t('sellerInv.stock.addTitle') }}</h2>
        <div class="vg-seg vg-seg--sm si-kinds">
          <button v-for="kind in (['count', 'inbound', 'adjust'] as SiStockMoveKind[])" :key="kind" type="button" class="vg-seg__btn" :class="{ 'is-active': moveForm.kind === kind }" @click="moveForm.kind = kind">{{ t(`sellerInv.stock.kindShort.${kind}`) }}</button>
        </div>
        <p class="vg-muted si-small">{{ t(`sellerInv.stock.kinds.${moveForm.kind}`) }}</p>
        <label class="vg-field">
          <span class="vg-field__label">{{ t('sellerInv.stock.code') }}</span>
          <input v-model.trim="moveForm.code" class="vg-input" list="si-codes" autocomplete="off" data-testid="si-move-code" />
          <datalist id="si-codes"><option v-for="code in mappedCodes" :key="code" :value="code" /></datalist>
        </label>
        <label class="vg-field">
          <span class="vg-field__label">{{ t('sellerInv.stock.quantity') }}</span>
          <input v-model.number="moveForm.quantity" class="vg-input" type="number" step="1" data-testid="si-move-qty" />
          <span class="vg-field__hint">{{ t(`sellerInv.stock.quantityHint.${moveForm.kind}`) }}</span>
        </label>
        <div class="vg-form-grid">
          <label class="vg-field"><span class="vg-field__label">{{ t('sellerInv.stock.date') }}</span><input v-model="moveForm.date" class="vg-input" type="date" :max="dashboard?.today" /></label>
          <label class="vg-field"><span class="vg-field__label">{{ t('sellerInv.stock.unitCost') }}</span><input v-model.number="moveForm.unitCost" class="vg-input" type="number" min="0" step="any" /></label>
        </div>
        <label class="vg-field"><span class="vg-field__label">{{ t('sellerInv.stock.note') }}</span><input v-model.trim="moveForm.note" class="vg-input" maxlength="200" /></label>
        <button type="submit" class="vg-btn vg-btn--primary" :disabled="!moveForm.code || moveForm.quantity === null || (moveForm.quantity as unknown as string) === ''" data-testid="si-move-save">{{ t('sellerInv.stock.save') }}</button>
        <p class="vg-muted si-small">{{ t('sellerInv.stock.howItWorks') }}</p>
      </form>
      <section class="vg-card vg-card--flush si-ledger">
        <div class="vg-card__head"><h2 class="vg-card__title">{{ t('sellerInv.stock.ledgerTitle') }}</h2></div>
        <div class="vg-table-wrap si-table-wrap">
          <table class="vg-table vg-table--compact">
            <thead><tr><th>{{ t('sellerInv.stock.date') }}</th><th>{{ t('sellerInv.stock.code') }}</th><th>{{ t('sellerInv.stock.kind') }}</th><th class="num">{{ t('sellerInv.stock.quantity') }}</th><th>{{ t('sellerInv.stock.note') }}</th><th></th></tr></thead>
            <tbody>
              <tr v-if="!moves.length"><td colspan="6" class="vg-table__empty">{{ t('sellerInv.stock.ledgerEmpty') }}</td></tr>
              <tr v-for="move in moves" :key="move.id">
                <td>{{ move.date }}</td>
                <td><strong>{{ move.code }}</strong></td>
                <td><span class="vg-pill" :class="move.kind === 'count' ? 'vg-pill--blue' : move.kind === 'inbound' ? 'vg-pill--green' : 'vg-pill--amber'">{{ t(`sellerInv.stock.kindShort.${move.kind}`) }}</span></td>
                <td class="num">{{ move.kind === 'inbound' ? '+' : move.kind === 'adjust' && move.quantity > 0 ? '+' : '' }}{{ fmt(move.quantity) }}</td>
                <td class="vg-muted">{{ move.note || '' }}<template v-if="move.unitCost"> · {{ fmtMoney(move.unitCost) }}</template></td>
                <td><button type="button" class="vg-icon-btn vg-icon-btn--sm vg-icon-btn--danger" :title="t('sellerInv.stock.remove')" @click="removeMove(move)"><Trash2 :size="13" /></button></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </section>

    <!-- Mapping -->
    <section v-else-if="tab === 'mapping'" class="vg-card vg-card--flush si-table-card" data-testid="si-mapping">
      <div class="vg-toolbar si-filter">
        <p class="vg-muted si-small si-intro">{{ t('sellerInv.mapping.intro') }}</p>
        <span class="vg-toolbar__spacer"></span>
        <label class="si-check"><input v-model="onlyUnmapped" type="checkbox" /> {{ t('sellerInv.mapping.onlyUnmapped') }}</label>
        <button type="button" class="vg-btn vg-btn--primary vg-btn--sm" :disabled="!suggestionCount" @click="applySuggestions">{{ t('sellerInv.mapping.applyAll', { n: suggestionCount }) }}</button>
      </div>
      <div class="vg-table-wrap si-table-wrap">
        <table class="vg-table vg-table--compact">
          <thead><tr><th>{{ t('sellerInv.mapping.product') }}</th><th>{{ t('sellerInv.mapping.shop') }}</th><th>{{ t('sellerInv.mapping.sellerSku') }}</th><th>{{ t('sellerInv.mapping.code') }}</th><th>{{ t('sellerInv.mapping.suggestion') }}</th><th class="num">{{ t('sellerInv.mapping.units30') }}</th></tr></thead>
          <tbody>
            <tr v-if="!filteredMappings.length"><td colspan="6" class="vg-table__empty">{{ t('sellerInv.mapping.empty') }}</td></tr>
            <tr v-for="row in filteredMappings" :key="row.skuKey">
              <td>
                <div class="si-sku">
                  <span class="vg-thumb vg-thumb--sm si-thumb"><img v-if="row.image" :src="row.image" alt="" loading="lazy" /><ImageIcon v-else :size="14" /></span>
                  <span class="si-sku__text"><strong class="vg-ellipsis" :title="row.productName">{{ row.productName }}</strong><small>{{ row.skuName || row.skuId }}</small></span>
                </div>
              </td>
              <td class="vg-muted">{{ row.shopName }}</td>
              <td>{{ row.sellerSku || '—' }}</td>
              <td><input v-model.trim="mappingDrafts[row.skuKey]" class="vg-input vg-input--sm si-code-input" :placeholder="row.sellerSku || t('sellerInv.mapping.placeholder')" @change="saveMapping(row)" /></td>
              <td>
                <button v-if="row.suggestion && !row.sellerSku && row.mappedCode !== row.suggestion" type="button" class="vg-btn vg-btn--xs vg-btn--soft" @click="saveMapping(row, row.suggestion)">{{ row.suggestion }} · {{ t('sellerInv.mapping.use') }}</button>
                <span v-else class="vg-muted">—</span>
              </td>
              <td class="num">{{ fmt(row.units30) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Settings -->
    <section v-else class="si-settings" data-testid="si-settings">
      <form class="vg-card" @submit.prevent="saveSettings">
        <h2 class="vg-section-title">{{ t('sellerInv.settings.title') }}</h2>
        <div class="vg-form-grid">
          <label class="vg-field"><span class="vg-field__label">{{ t('sellerInv.settings.leadDays') }}</span><input v-model.number="settingsForm.leadDays" class="vg-input" type="number" min="0" max="180" /><span class="vg-field__hint">{{ t('sellerInv.settings.leadDaysHint') }}</span></label>
          <label class="vg-field"><span class="vg-field__label">{{ t('sellerInv.settings.safetyDays') }}</span><input v-model.number="settingsForm.safetyDays" class="vg-input" type="number" min="0" max="180" /><span class="vg-field__hint">{{ t('sellerInv.settings.safetyDaysHint') }}</span></label>
          <label class="vg-field"><span class="vg-field__label">{{ t('sellerInv.settings.coverDays') }}</span><input v-model.number="settingsForm.coverDays" class="vg-input" type="number" min="1" max="365" /></label>
          <label class="vg-field"><span class="vg-field__label">{{ t('sellerInv.settings.historyDays') }}</span><input v-model.number="settingsForm.historyDays" class="vg-input" type="number" min="7" max="365" /></label>
          <label class="vg-field"><span class="vg-field__label">{{ t('sellerInv.settings.orderWindowDays') }}</span><input v-model.number="settingsForm.orderWindowDays" class="vg-input" type="number" min="1" max="60" /></label>
        </div>
        <p class="vg-muted si-small">{{ t('sellerInv.settings.formula') }}</p>
        <p class="vg-muted si-small">{{ t('sellerInv.settings.tagRule') }}</p>
        <button type="submit" class="vg-btn vg-btn--primary">{{ t('sellerInv.settings.save') }}</button>
      </form>
      <section class="vg-card">
        <div class="si-shops-head">
          <h2 class="vg-section-title">{{ t('sellerInv.settings.shopsTitle') }}</h2>
          <span class="vg-row">
            <button type="button" class="vg-btn vg-btn--sm" @click="router.push('/shops')">{{ t('sellerInv.manageShops') }}</button>
            <button type="button" class="vg-btn vg-btn--primary vg-btn--sm" @click="openCookieDialog()"><Plus :size="13" />{{ t('sellerInv.addShop') }}</button>
          </span>
        </div>
        <p class="vg-muted si-small">{{ t('sellerInv.sharedLogin') }}</p>
        <ul class="vg-list">
          <li v-for="shop in allShops" :key="shop.shopKey" class="vg-list__item si-shop">
            <span class="vg-list__main">
              <span class="vg-list__title">{{ shop.name }} <span class="vg-pill" :class="shop.state.lastSyncError ? 'vg-pill--red' : shop.state.lastSyncAt ? 'vg-pill--green' : ''">{{ t(`sellerInv.settings.shopState.${shop.state.lastSyncError ? 'failed' : shop.state.lastSyncAt ? 'ok' : 'never'}`) }}</span></span>
              <span class="vg-list__sub">{{ shop.region }} · {{ t('sellerInv.lastSync', { time: fmtTime(shop.state.lastSyncAt) }) }}<template v-if="shop.state.skuCount"> · {{ t('sellerInv.settings.skuCount', { n: shop.state.skuCount }) }}</template></span>
            </span>
            <button type="button" class="vg-btn vg-btn--sm" @click="openCookieDialog(shop)"><Cookie :size="13" />{{ t('sellerInv.updateCookie') }}</button>
            <button type="button" class="vg-btn vg-btn--sm" @click="openSellerCenter(shop.shopKey)"><ExternalLink :size="13" />{{ t('sellerInv.openSellerCenter') }}</button>
            <button type="button" class="vg-btn vg-btn--sm" :disabled="syncing" @click="sync(shop.shopKey)"><RefreshCcw :size="13" />{{ t('sellerInv.sync') }}</button>
          </li>
        </ul>
      </section>
    </section>

    <!-- Detail -->
    <div v-if="detail" class="vg-backdrop" @click.self="detailKey = ''">
      <section class="vg-dialog vg-dialog--wide si-detail" data-testid="si-detail">
        <header class="vg-dialog__head">
          <span class="vg-thumb si-thumb"><img v-if="detail.image" :src="detail.image" alt="" /><ImageIcon v-else :size="16" /></span>
          <div class="si-detail__title">
            <h2 class="vg-dialog__title">{{ t('sellerInv.detail.title', { code: detail.mapped ? detail.key : t('sellerInv.table.unmappedBadge') }) }}</h2>
            <small class="vg-muted vg-ellipsis">{{ detail.name }}</small>
          </div>
          <button type="button" class="vg-icon-btn" @click="detailKey = ''"><X :size="16" /></button>
        </header>
        <div class="vg-dialog__body si-detail__body">
          <div class="si-detail__stats">
            <div><span>{{ t('sellerInv.table.stock') }}</span><strong>{{ fmt(detail.stock) }}</strong><small class="vg-muted">{{ t(detail.stockSource === 'ledger' ? 'sellerInv.table.stockLedger' : detail.stockSource === 'platform' ? 'sellerInv.table.stockPlatform' : 'sellerInv.table.stockNone') }}</small></div>
            <div><span>{{ t('sellerInv.table.daysLeft') }}</span><strong>{{ fmtDays(detail.daysLeft) }}</strong><small><span v-if="detail.risk !== 'unknown'" class="vg-pill" :class="riskTone(detail.risk)">{{ t(`sellerInv.risk.${detail.risk}`) }}</span></small></div>
            <div><span>{{ t('sellerInv.detail.avgDaily') }}</span><strong>{{ fmt(detail.avgDaily, 1) }}</strong><small class="vg-muted">{{ t('sellerInv.detail.reorderPoint') }} {{ fmt(detail.reorderPoint) }}</small></div>
            <div><span>{{ t('sellerInv.table.suggest') }}</span><strong>{{ detail.suggestQty ? fmt(detail.suggestQty) : '—' }}</strong></div>
            <div><span>{{ t('sellerInv.detail.units30') }}</span><strong>{{ fmt(detail.units30) }}</strong><small class="vg-muted">{{ t('sellerInv.table.growth') }} {{ fmtGrowth(detail.growth7) }}</small></div>
            <div><span>{{ t('sellerInv.detail.amount30') }}</span><strong>{{ fmtMoney(detail.amount30) }}</strong></div>
          </div>

          <h3 class="vg-section-title">{{ t('sellerInv.detail.chart') }}</h3>
          <div class="si-chart" role="img" :aria-label="t('sellerInv.detail.chart')">
            <div v-for="point in detailSeries" :key="point.date" class="si-chart__col" :title="`${point.date}: ${point.units}`">
              <span class="si-chart__bar" :style="{ height: `${Math.max(point.units ? 3 : 0, (point.units / detailMax) * 100)}%` }"></span>
            </div>
          </div>
          <div class="si-chart__axis vg-muted"><span>{{ detailSeries[0]?.date }}</span><span>{{ detailSeries[detailSeries.length - 1]?.date }}</span></div>

          <template v-if="detail.shops.length > 1">
            <h3 class="vg-section-title">{{ t('sellerInv.detail.byShop') }}</h3>
            <ul class="si-shops">
              <li v-for="row in detail.shops" :key="row.shopKey"><span>{{ shopName(row.shopKey) }}</span><strong>{{ fmt(row.units7) }}</strong></li>
            </ul>
          </template>

          <template v-if="detail.mapped">
            <h3 class="vg-section-title">{{ t('sellerInv.detail.ownRules') }}</h3>
            <form class="vg-form-grid vg-form-grid--3 si-rules" @submit.prevent="saveDetailRules">
              <label class="vg-field"><span class="vg-field__label">{{ t('sellerInv.detail.name') }}</span><input v-model.trim="detailRules.name" class="vg-input vg-input--sm" :placeholder="detail.name" /></label>
              <label class="vg-field"><span class="vg-field__label">{{ t('sellerInv.settings.leadDays') }}</span><input v-model.number="detailRules.leadDays" class="vg-input vg-input--sm" type="number" min="0" :placeholder="`${t('sellerInv.detail.useDefault')} (${settingsForm.leadDays})`" /></label>
              <label class="vg-field"><span class="vg-field__label">{{ t('sellerInv.settings.safetyDays') }}</span><input v-model.number="detailRules.safetyDays" class="vg-input vg-input--sm" type="number" min="0" :placeholder="`${t('sellerInv.detail.useDefault')} (${settingsForm.safetyDays})`" /></label>
              <label class="vg-field"><span class="vg-field__label">{{ t('sellerInv.detail.cost') }}</span><input v-model.number="detailRules.cost" class="vg-input vg-input--sm" type="number" min="0" step="any" :placeholder="t('sellerInv.detail.costPlaceholder')" data-testid="si-detail-cost" /></label>
              <button type="submit" class="vg-btn vg-btn--sm">{{ t('sellerInv.detail.saveRules') }}</button>
            </form>

            <h3 class="vg-section-title">{{ t('sellerInv.detail.moves') }}</h3>
            <p v-if="!detailMoves.length" class="vg-muted si-small">{{ t('sellerInv.stock.ledgerEmpty') }}</p>
            <ul v-else class="si-shops">
              <li v-for="move in detailMoves.slice(0, 8)" :key="move.id"><span>{{ move.date }} · {{ t(`sellerInv.stock.kindShort.${move.kind}`) }}</span><strong>{{ move.kind === 'inbound' ? '+' : '' }}{{ fmt(move.quantity) }}</strong></li>
            </ul>
          </template>
          <p v-else class="vg-notice vg-notice--warning si-small">{{ t('sellerInv.detail.needCode') }}</p>
        </div>
        <footer class="vg-dialog__foot">
          <span></span>
          <div class="vg-dialog__foot-actions">
            <button v-if="detail.mapped" type="button" class="vg-btn vg-btn--primary" @click="startMove(detail.key)"><PackagePlus :size="14" />{{ t('sellerInv.detail.addInbound') }}</button>
            <button v-else type="button" class="vg-btn vg-btn--primary" @click="detailKey = ''; tab = 'mapping'">{{ t('sellerInv.todo.fixMapping') }}</button>
          </div>
        </footer>
      </section>
    </div>
    <ChCookieDialog :open="cookieDialog.open" :shop="cookieDialog.shop" @close="cookieDialog = { open: false, shop: null }" @imported="onCookieImported" />
  </main>
</template>

<style scoped>
.si-page { display: flex; flex-direction: column; gap: 14px; }
.si-page > .vg-tabs { overflow-y: hidden; flex-shrink: 0; }
.si-toolbar { flex-wrap: wrap; gap: 10px; }
.si-sync-status { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; }
.si-notice { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.si-notice > span { flex: 1; min-width: 200px; }
.si-pre > span { white-space: pre-line; }
.si-stats { grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); }
.si-stat-btn { text-align: left; cursor: pointer; font: inherit; color: inherit; }
.si-stat-btn:hover { border-color: var(--vg-accent); }
.si-stats small { font-size: 11px; margin-top: 2px; }
.si-todo { display: flex; flex-direction: column; gap: 8px; }
.si-todo__list { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); }
.si-todo__item { display: flex; align-items: center; gap: 8px; font-size: 13px; min-width: 0; }
.si-todo__text { flex: 1; min-width: 0; text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.si-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; background: var(--vg-blue); }
.si-dot--red { background: var(--vg-red); }
.si-dot--amber { background: var(--vg-amber); }
.si-dot--accent { background: var(--vg-accent); }
.si-table-card { display: flex; flex-direction: column; min-height: 0; }
.si-filter { padding: 10px 12px; flex-wrap: wrap; gap: 10px; border-bottom: 1px solid var(--theme-border); }
.si-table-wrap { border: 0; border-radius: 0; max-height: calc(100vh - 360px); min-height: 240px; }
.si-table .num, .si-matrix .num, .vg-table .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.si-row { cursor: pointer; }
.si-row:hover td { background: color-mix(in srgb, var(--vg-accent) 5%, transparent); }
.si-sku { display: flex; align-items: center; gap: 8px; min-width: 220px; max-width: 360px; }
.si-sku__text { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.si-sku__text small { color: var(--theme-text-muted); font-size: 11px; }
.si-thumb { overflow: hidden; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
.si-thumb img { width: 100%; height: 100%; object-fit: cover; }
.si-growth { display: inline-flex; align-items: center; gap: 2px; font-weight: 600; }
.si-growth.up { color: var(--vg-green, #16a34a); }
.si-growth.down { color: var(--vg-red); }
.si-neg { color: var(--vg-red); font-weight: 700; }
.si-src { margin-left: 3px; font-size: 10px; }
.si-hint { font-size: 11px; max-width: 520px; }
.si-sticky { position: sticky; left: 0; z-index: 2; background: var(--theme-panel); min-width: 200px; max-width: 280px; }
thead .si-sticky { z-index: 3; background: var(--theme-panel-soft); }
.si-matrix__name { display: block; max-width: 240px; font-size: 11px; }
.si-zero { color: var(--theme-text-muted); opacity: 0.45; }
.si-stock { display: grid; grid-template-columns: minmax(280px, 360px) 1fr; gap: 14px; align-items: start; }
.si-move-form { display: flex; flex-direction: column; gap: 10px; }
.si-kinds { align-self: flex-start; }
.si-small { font-size: 12px; margin: 0; line-height: 1.5; }
.si-intro { max-width: 640px; }
.si-check { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; }
.si-code-input { width: 150px; }
.si-settings { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; align-items: start; }
.si-settings form { display: flex; flex-direction: column; gap: 12px; }
.si-shop { display: flex; align-items: center; gap: 8px; }
.si-shops-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.si-detail { max-height: 88vh; display: flex; flex-direction: column; }
.si-detail__title { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.si-detail__body { overflow: auto; display: flex; flex-direction: column; gap: 12px; }
.si-detail__stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.si-detail__stats > div { display: flex; flex-direction: column; gap: 2px; padding: 10px 12px; border: 1px solid var(--theme-border); border-radius: 8px; }
.si-detail__stats span { font-size: 12px; color: var(--theme-text-muted); }
.si-detail__stats strong { font-size: 20px; font-variant-numeric: tabular-nums; }
.si-chart { display: flex; align-items: flex-end; gap: 2px; height: 120px; padding: 6px 0; border-bottom: 1px solid var(--theme-border); }
.si-chart__col { flex: 1; height: 100%; display: flex; align-items: flex-end; }
.si-chart__bar { width: 100%; background: var(--vg-accent); border-radius: 2px 2px 0 0; min-height: 0; }
.si-chart__col:hover .si-chart__bar { background: color-mix(in srgb, var(--vg-accent) 70%, var(--theme-text)); }
.si-chart__axis { display: flex; justify-content: space-between; font-size: 11px; }
.si-shops { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
.si-shops li { display: flex; justify-content: space-between; font-size: 13px; padding: 4px 0; border-bottom: 1px dashed var(--theme-divider); }
.si-rules { align-items: end; }
@media (max-width: 960px) {
  .si-stock, .si-settings { grid-template-columns: 1fr; }
  .si-detail__stats { grid-template-columns: repeat(2, 1fr); }
}
</style>
