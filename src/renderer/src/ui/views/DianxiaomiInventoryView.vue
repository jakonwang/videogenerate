<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import {
  Activity,
  AlertTriangle,
  Boxes,
  CheckCircle2,
  ChevronLeft,
  Eye,
  ImageIcon,
  LogIn,
  LogOut,
  LoaderCircle,
  PackageCheck,
  Pencil,
  Plus,
  RefreshCcw,
  Save,
  Trash2,
  X,
} from 'lucide-vue-next'

type Risk = 'not_synced' | 'out_of_stock' | 'reorder' | 'healthy' | 'no_sales'

type SkuSummary = {
  id: string
  sku: string
  imageUrl?: string
  imageFallbackUrl?: string
  baselineDate: string
  baselineStock: number
  forecastWindowDays: number
  warningDays: number
  currentStock: number
  totalShipmentQuantity: number
  windowShipmentQuantity: number
  averageDaily: number
  daysToStockout?: number
  risk: Risk
  analysisStartDate: string
  analysisEndDate: string
  availableDays: number
  createdAt: number
  updatedAt: number
  lastSyncAt?: number
  lastSyncError?: string
}

type Dashboard = {
  items: SkuSummary[]
  auth: { available: boolean; authenticated: boolean; checkedAt: number; message?: string }
  summary: { skuCount: number; outOfStockCount: number; reorderCount: number; windowShipmentQuantity: number; lastSyncAt?: number }
}

type Detail = {
  sku: SkuSummary
  shipments: Array<{ id: string; skuId: string; date: string; quantity: number; orderCount: number; syncedAt: number }>
  baselineChanges: Array<{ id: string; skuId: string; previousDate: string; previousStock: number; nextDate: string; nextStock: number; changedAt: number }>
}

const router = useRouter()
const { t } = useI18n()
const loading = ref(false)
const syncing = ref(false)
const notice = ref('')
const errorText = ref('')
const dashboard = ref<Dashboard>({
  items: [],
  auth: { available: true, authenticated: false, checkedAt: 0 },
  summary: { skuCount: 0, outOfStockCount: 0, reorderCount: 0, windowShipmentQuantity: 0 },
})
const editorOpen = ref(false)
const detailOpen = ref(false)
const detailLoading = ref(false)
const detail = ref<Detail | null>(null)
const failedImageUrls = ref<string[]>([])
const form = reactive({
  id: '',
  sku: '',
  baselineDate: '',
  baselineStock: 0,
  forecastWindowDays: 30,
  warningDays: 7,
})

function localDate() {
  const value = new Date()
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`
}

function formatNumber(value: unknown, digits = 0) {
  const number = Number(value)
  if (!Number.isFinite(number)) return '--'
  return number.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

function formatDateTime(value?: number) {
  if (!value) return '--'
  return new Date(value).toLocaleString(undefined, { hour12: false })
}

function formatDays(value?: number) {
  if (value === undefined || !Number.isFinite(value)) return '--'
  return `${formatNumber(value, 1)} d`
}

function riskLabel(risk: Risk) {
  return t(`dianxiaomiInventory.risk.${risk}`)
}

function riskClass(risk: Risk) {
  return `risk-${risk.replace('_', '-')}`
}

function productImageSource(item?: { imageUrl?: string; imageFallbackUrl?: string }) {
  return [item?.imageUrl, item?.imageFallbackUrl].find((url) => url && !failedImageUrls.value.includes(url)) || ''
}

function markImageFailed(imageUrl?: string) {
  if (imageUrl && !failedImageUrls.value.includes(imageUrl)) failedImageUrls.value = [...failedImageUrls.value, imageUrl]
}

const isAuthenticated = computed(() => dashboard.value.auth.authenticated)
const lastSyncLabel = computed(() => formatDateTime(dashboard.value.summary.lastSyncAt))
const totalCurrentStock = computed(() => dashboard.value.items.reduce((total, item) => total + item.currentStock, 0))

function clearFeedback() {
  notice.value = ''
  errorText.value = ''
}

async function refresh(showLoading = true, preserveFeedback = false) {
  if (showLoading) loading.value = true
  if (!preserveFeedback) clearFeedback()
  try {
    dashboard.value = await window.api.dianxiaomiInventory.getDashboard() as Dashboard
  } catch (error: any) {
    errorText.value = error?.message || t('dianxiaomiInventory.errors.generic')
  } finally {
    loading.value = false
  }
}

async function openLogin() {
  clearFeedback()
  try {
    await window.api.dianxiaomiInventory.openLogin()
    notice.value = t('dianxiaomiInventory.authHint')
    await refresh(false, true)
  } catch (error: any) {
    errorText.value = error?.message || t('dianxiaomiInventory.errors.generic')
  }
}

async function logout() {
  clearFeedback()
  try {
    await window.api.dianxiaomiInventory.logout()
    notice.value = t('dianxiaomiInventory.messages.loggedOut')
    await refresh(false, true)
  } catch (error: any) {
    errorText.value = error?.message || t('dianxiaomiInventory.errors.generic')
  }
}

async function syncData(silent = false) {
  if (syncing.value) return
  syncing.value = true
  if (!silent) clearFeedback()
  try {
    const result = await window.api.dianxiaomiInventory.sync()
    if (result.authRequired) {
      if (!silent) {
        await window.api.dianxiaomiInventory.openLogin()
        errorText.value = t('dianxiaomiInventory.errors.auth')
        notice.value = t('dianxiaomiInventory.authHint')
      }
    } else if (result.failed.length) {
      errorText.value = `${t('dianxiaomiInventory.messages.partialSync')} ${result.failed.map((item) => item.message).join('; ')}`
    } else if (!silent && result.syncedSkuIds.length) {
      notice.value = t('dianxiaomiInventory.messages.synced')
    }
    await refresh(false, true)
  } catch (error: any) {
    errorText.value = error?.message || t('dianxiaomiInventory.errors.generic')
  } finally {
    syncing.value = false
  }
}

function resetForm() {
  form.id = ''
  form.sku = ''
  form.baselineDate = localDate()
  form.baselineStock = 0
  form.forecastWindowDays = 30
  form.warningDays = 7
}

function openCreate() {
  clearFeedback()
  resetForm()
  editorOpen.value = true
}

function openEdit(item: SkuSummary) {
  clearFeedback()
  form.id = item.id
  form.sku = item.sku
  form.baselineDate = item.baselineDate
  form.baselineStock = item.baselineStock
  form.forecastWindowDays = item.forecastWindowDays
  form.warningDays = item.warningDays
  editorOpen.value = true
}

async function saveSku() {
  clearFeedback()
  try {
    await window.api.dianxiaomiInventory.saveSku({
      id: form.id || undefined,
      sku: form.sku,
      baselineDate: form.baselineDate,
      baselineStock: Number(form.baselineStock),
      forecastWindowDays: Number(form.forecastWindowDays),
      warningDays: Number(form.warningDays),
    })
    editorOpen.value = false
    notice.value = t('dianxiaomiInventory.messages.saved')
    await refresh(false, true)
  } catch (error: any) {
    errorText.value = error?.message || t('dianxiaomiInventory.errors.generic')
  }
}

async function removeSku(item: SkuSummary) {
  if (!window.confirm(t('dianxiaomiInventory.messages.confirmRemove'))) return
  clearFeedback()
  try {
    await window.api.dianxiaomiInventory.removeSku(item.id)
    notice.value = t('dianxiaomiInventory.messages.removed')
    await refresh(false, true)
  } catch (error: any) {
    errorText.value = error?.message || t('dianxiaomiInventory.errors.generic')
  }
}

async function openDetail(item: SkuSummary) {
  detailOpen.value = true
  detailLoading.value = true
  detail.value = null
  try {
    detail.value = await window.api.dianxiaomiInventory.getDetail({ skuId: item.id }) as Detail
  } catch (error: any) {
    errorText.value = error?.message || t('dianxiaomiInventory.errors.generic')
    detailOpen.value = false
  } finally {
    detailLoading.value = false
  }
}

onMounted(async () => {
  await refresh()
  if (dashboard.value.auth.authenticated && dashboard.value.items.length) await syncData(true)
})
</script>

<template>
  <div class="inventory-page">
    <section class="inventory-head">
      <div class="inventory-head__intro">
        <div class="inventory-head__icon"><Boxes class="h-5 w-5" /></div>
        <div>
          <div class="inventory-kicker">{{ t('plugins.categories.inventoryAnalysis') }}</div>
          <h1>{{ t('dianxiaomiInventory.title') }}</h1>
          <p>{{ t('dianxiaomiInventory.subtitle') }}</p>
        </div>
      </div>
      <div class="inventory-head__actions">
        <button class="ghost-button" type="button" @click="router.push('/plugins')"><ChevronLeft class="h-4 w-4" />{{ t('dianxiaomiInventory.back') }}</button>
      </div>
    </section>

    <section class="inventory-toolbar">
      <div class="inventory-toolbar__status">
        <div class="connection-state" :class="{ connected: isAuthenticated }">
          <span class="connection-state__indicator">
            <CheckCircle2 v-if="isAuthenticated" class="h-4 w-4" />
            <AlertTriangle v-else class="h-4 w-4" />
          </span>
          <div>
            <strong>{{ isAuthenticated ? t('dianxiaomiInventory.connected') : t('dianxiaomiInventory.notConnected') }}</strong>
            <small v-if="!isAuthenticated">{{ t('dianxiaomiInventory.authHint') }}</small>
          </div>
        </div>
        <div class="sync-status">
          <span>{{ t('dianxiaomiInventory.summary.lastSync') }}</span>
          <strong>{{ lastSyncLabel }}</strong>
        </div>
      </div>
      <div class="inventory-toolbar__actions">
        <button v-if="!isAuthenticated" class="primary-button" type="button" @click="openLogin"><LogIn class="h-4 w-4" />{{ t('dianxiaomiInventory.login') }}</button>
        <button v-else class="ghost-button" type="button" @click="logout"><LogOut class="h-4 w-4" />{{ t('dianxiaomiInventory.logout') }}</button>
        <button class="ghost-button" type="button" :disabled="loading" @click="refresh()"><RefreshCcw class="h-4 w-4" />{{ t('dianxiaomiInventory.refresh') }}</button>
        <button class="ghost-button sync-button" type="button" :disabled="syncing || !dashboard.items.length || !isAuthenticated" @click="syncData()"><LoaderCircle v-if="syncing" class="h-4 w-4 spin" /><RefreshCcw v-else class="h-4 w-4" />{{ t('dianxiaomiInventory.sync') }}</button>
        <button class="primary-button add-button" type="button" @click="openCreate"><Plus class="h-4 w-4" />{{ t('dianxiaomiInventory.addSku') }}</button>
      </div>
    </section>

    <div v-if="notice" class="inventory-banner inventory-banner--success"><CheckCircle2 class="h-4 w-4" />{{ notice }}</div>
    <div v-if="errorText" class="inventory-banner inventory-banner--error"><AlertTriangle class="h-4 w-4" />{{ errorText }}</div>

    <section class="inventory-summary-grid">
      <article class="summary-card summary-card--stock">
        <div class="summary-card__top"><span>{{ t('dianxiaomiInventory.summary.currentStock') }}</span><span class="summary-card__icon"><Boxes class="h-5 w-5" /></span></div>
        <strong>{{ formatNumber(totalCurrentStock) }}</strong>
        <small>{{ formatNumber(dashboard.summary.skuCount) }} {{ t('dianxiaomiInventory.summary.trackedSkus') }}</small>
      </article>
      <article class="summary-card summary-card--shipments">
        <div class="summary-card__top"><span>{{ t('dianxiaomiInventory.summary.windowShipments') }}</span><span class="summary-card__icon"><Activity class="h-5 w-5" /></span></div>
        <strong>{{ formatNumber(dashboard.summary.windowShipmentQuantity) }}</strong>
        <small>{{ t('dianxiaomiInventory.summary.shipmentHint') }}</small>
      </article>
      <article class="summary-card summary-card--warning">
        <div class="summary-card__top"><span>{{ t('dianxiaomiInventory.summary.reorder') }}</span><span class="summary-card__icon"><PackageCheck class="h-5 w-5" /></span></div>
        <strong>{{ formatNumber(dashboard.summary.reorderCount) }}</strong>
        <small>{{ t('dianxiaomiInventory.summary.reorderHint') }}</small>
      </article>
      <article class="summary-card summary-card--danger">
        <div class="summary-card__top"><span>{{ t('dianxiaomiInventory.summary.outOfStock') }}</span><span class="summary-card__icon"><AlertTriangle class="h-5 w-5" /></span></div>
        <strong>{{ formatNumber(dashboard.summary.outOfStockCount) }}</strong>
        <small>{{ t('dianxiaomiInventory.summary.outOfStockHint') }}</small>
      </article>
    </section>

    <section class="panel-card inventory-table-card">
      <div class="panel-heading">
        <div><strong>{{ t('dianxiaomiInventory.table.title') }}</strong><small>{{ dashboard.items.length }} {{ t('dianxiaomiInventory.summary.trackedSkus') }}</small></div>
        <span class="panel-heading__legend"><span class="legend-dot"></span>{{ t('dianxiaomiInventory.table.priorityHint') }}</span>
      </div>
      <div v-if="loading" class="inventory-empty"><LoaderCircle class="h-6 w-6 spin" /><span>{{ t('dianxiaomiInventory.refresh') }}...</span></div>
      <div v-else-if="!dashboard.items.length" class="inventory-empty"><Boxes class="h-8 w-8" /><strong>{{ t('dianxiaomiInventory.table.empty') }}</strong></div>
      <div v-else class="inventory-table-wrap">
        <table class="inventory-table">
          <thead>
            <tr>
              <th>{{ t('dianxiaomiInventory.table.sku') }}</th>
              <th>{{ t('dianxiaomiInventory.table.baseline') }}</th>
              <th>{{ t('dianxiaomiInventory.table.currentStock') }}</th>
              <th>{{ t('dianxiaomiInventory.table.dailyAverage') }}</th>
              <th>{{ t('dianxiaomiInventory.table.stockout') }}</th>
              <th>{{ t('dianxiaomiInventory.table.risk') }}</th>
              <th>{{ t('dianxiaomiInventory.table.lastSync') }}</th>
              <th>{{ t('dianxiaomiInventory.table.actions') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in dashboard.items" :key="item.id" :class="`row-${riskClass(item.risk)}`">
              <td>
                <div class="sku-product">
                  <span class="product-thumbnail">
                    <img v-if="productImageSource(item)" :src="productImageSource(item)" :alt="item.sku" @error="markImageFailed(productImageSource(item))" />
                    <ImageIcon v-else class="h-5 w-5" />
                  </span>
                  <span class="sku-product__copy"><strong class="sku-code">{{ item.sku }}</strong><small>{{ item.baselineDate }}</small></span>
                </div>
              </td>
              <td>{{ formatNumber(item.baselineStock) }}</td>
              <td><strong class="stock-value" :class="{ 'negative-stock': item.currentStock <= 0 }">{{ formatNumber(item.currentStock) }}</strong></td>
              <td><span class="data-value">{{ formatNumber(item.averageDaily, 2) }}</span></td>
              <td><strong class="stockout-value" :class="{ 'stockout-value--urgent': item.risk === 'out_of_stock' || item.risk === 'reorder' }">{{ formatDays(item.daysToStockout) }}</strong></td>
              <td><span class="risk-badge" :class="riskClass(item.risk)">{{ riskLabel(item.risk) }}</span></td>
              <td>{{ formatDateTime(item.lastSyncAt) }}</td>
              <td>
                <div class="row-actions">
                  <button class="icon-button" type="button" :title="t('dianxiaomiInventory.table.details')" @click="openDetail(item)"><Eye class="h-4 w-4" /></button>
                  <button class="icon-button" type="button" :title="t('dianxiaomiInventory.table.edit')" @click="openEdit(item)"><Pencil class="h-4 w-4" /></button>
                  <button class="icon-button danger" type="button" :title="t('dianxiaomiInventory.table.remove')" @click="removeSku(item)"><Trash2 class="h-4 w-4" /></button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <div v-if="editorOpen" class="inventory-overlay" @click.self="editorOpen = false">
      <section class="inventory-dialog">
        <header class="dialog-heading"><div><strong>{{ form.id ? t('dianxiaomiInventory.form.editTitle') : t('dianxiaomiInventory.form.addTitle') }}</strong><small>{{ t('dianxiaomiInventory.subtitle') }}</small></div><button class="icon-button" type="button" @click="editorOpen = false"><X class="h-4 w-4" /></button></header>
        <div class="form-grid">
          <label><span>{{ t('dianxiaomiInventory.form.sku') }}</span><input v-model.trim="form.sku" type="text" autocomplete="off" /></label>
          <label><span>{{ t('dianxiaomiInventory.form.baselineDate') }}</span><input v-model="form.baselineDate" type="date" /></label>
          <label><span>{{ t('dianxiaomiInventory.form.baselineStock') }}</span><input v-model.number="form.baselineStock" type="number" min="0" step="1" /></label>
          <label><span>{{ t('dianxiaomiInventory.form.forecastWindow') }}</span><input v-model.number="form.forecastWindowDays" type="number" min="1" max="365" step="1" /></label>
          <label><span>{{ t('dianxiaomiInventory.form.warningDays') }}</span><input v-model.number="form.warningDays" type="number" min="0" max="365" step="1" /></label>
        </div>
        <footer class="dialog-actions"><button class="ghost-button" type="button" @click="editorOpen = false">{{ t('dianxiaomiInventory.form.cancel') }}</button><button class="primary-button" type="button" :disabled="!form.sku.trim() || !form.baselineDate" @click="saveSku"><Save class="h-4 w-4" />{{ t('dianxiaomiInventory.form.save') }}</button></footer>
      </section>
    </div>

    <div v-if="detailOpen" class="inventory-overlay" @click.self="detailOpen = false">
      <section class="inventory-dialog inventory-dialog--wide">
        <header class="dialog-heading"><div class="detail-product"><span v-if="detail?.sku" class="product-thumbnail product-thumbnail--detail"><img v-if="productImageSource(detail.sku)" :src="productImageSource(detail.sku)" :alt="detail.sku.sku" @error="markImageFailed(productImageSource(detail.sku))" /><ImageIcon v-else class="h-5 w-5" /></span><div><strong>{{ detail?.sku ? `${t('dianxiaomiInventory.detail.title')} - ${detail.sku.sku}` : t('dianxiaomiInventory.detail.title') }}</strong><small v-if="detail?.sku">{{ riskLabel(detail.sku.risk) }} | {{ formatDays(detail.sku.daysToStockout) }}</small></div></div><button class="icon-button" type="button" @click="detailOpen = false"><X class="h-4 w-4" /></button></header>
        <div v-if="detailLoading" class="inventory-empty"><LoaderCircle class="h-6 w-6 spin" /></div>
        <template v-else-if="detail">
          <div class="detail-metrics"><div><span>{{ t('dianxiaomiInventory.table.currentStock') }}</span><strong>{{ formatNumber(detail.sku.currentStock) }}</strong></div><div><span>{{ t('dianxiaomiInventory.table.dailyAverage') }}</span><strong>{{ formatNumber(detail.sku.averageDaily, 2) }}</strong></div><div><span>{{ t('dianxiaomiInventory.table.stockout') }}</span><strong>{{ formatDays(detail.sku.daysToStockout) }}</strong></div><div><span>{{ t('dianxiaomiInventory.table.baseline') }}</span><strong>{{ formatNumber(detail.sku.baselineStock) }} / {{ detail.sku.baselineDate }}</strong></div></div>
          <div class="detail-columns">
            <div class="detail-section"><div class="detail-section__heading"><strong>{{ t('dianxiaomiInventory.detail.dailyShipments') }}</strong><span>{{ detail.sku.analysisStartDate }} - {{ detail.sku.analysisEndDate }}</span></div><div v-if="!detail.shipments.length" class="detail-empty">{{ t('dianxiaomiInventory.detail.noData') }}</div><table v-else class="detail-table"><thead><tr><th>{{ t('dianxiaomiInventory.detail.date') }}</th><th>{{ t('dianxiaomiInventory.detail.quantity') }}</th><th>{{ t('dianxiaomiInventory.detail.orders') }}</th></tr></thead><tbody><tr v-for="row in detail.shipments" :key="row.id"><td>{{ row.date }}</td><td>{{ formatNumber(row.quantity) }}</td><td>{{ formatNumber(row.orderCount) }}</td></tr></tbody></table></div>
            <div class="detail-section"><div class="detail-section__heading"><strong>{{ t('dianxiaomiInventory.detail.baselineHistory') }}</strong></div><div v-if="!detail.baselineChanges.length" class="detail-empty">{{ t('dianxiaomiInventory.detail.noData') }}</div><div v-for="change in detail.baselineChanges" v-else :key="change.id" class="history-row"><span>{{ formatDateTime(change.changedAt) }}</span><small>{{ t('dianxiaomiInventory.detail.from') }} {{ formatNumber(change.previousStock) }} / {{ change.previousDate }}</small><small>{{ t('dianxiaomiInventory.detail.to') }} {{ formatNumber(change.nextStock) }} / {{ change.nextDate }}</small></div></div>
          </div>
        </template>
      </section>
    </div>
  </div>
</template>

<style scoped>
.inventory-page { display: grid; gap: 14px; min-width: 0; padding: 8px 12px 24px; color: var(--theme-text); }
.inventory-page > * { min-width: 0; }
.inventory-head, .inventory-toolbar, .inventory-table-card, .summary-card, .inventory-dialog { border: 1px solid var(--theme-border); background: var(--theme-panel); border-radius: 8px; }
.inventory-head { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 18px 20px; border-color: color-mix(in srgb, var(--theme-accent) 24%, var(--theme-border)); background: var(--theme-panel); }
.inventory-head__intro, .inventory-head__actions, .inventory-toolbar__actions, .inventory-toolbar__status, .connection-state, .row-actions, .dialog-actions { display: flex; align-items: center; gap: 10px; min-width: 0; }
.inventory-head__icon { width: 44px; height: 44px; display: grid; flex: 0 0 44px; place-items: center; border: 1px solid color-mix(in srgb, var(--theme-accent) 30%, var(--theme-border)); border-radius: 8px; background: var(--theme-accent-soft); color: var(--theme-control-selected-text); }
.inventory-kicker { color: var(--theme-control-selected-text); font-size: 10px; font-weight: 800; letter-spacing: 0; text-transform: uppercase; }
.inventory-head h1 { margin: 4px 0 0; color: var(--theme-text); font-size: 24px; line-height: 1.2; }
.inventory-head p { margin: 5px 0 0; color: var(--theme-text-muted); font-size: 12px; }
.inventory-head__actions { flex-wrap: wrap; justify-content: flex-end; }
.panel-card { padding: 16px 18px; }
.inventory-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 16px; min-width: 0; padding: 11px 12px 11px 16px; background: var(--theme-panel-soft); }
.inventory-toolbar__status { gap: 18px; }
.connection-state { color: var(--theme-warning-text); }
.connection-state.connected { color: var(--theme-success-text); }
.connection-state__indicator { display: grid; width: 30px; height: 30px; flex: 0 0 30px; place-items: center; border-radius: 50%; background: var(--theme-warning-soft); }
.connection-state.connected .connection-state__indicator { background: var(--theme-success-soft); }
.connection-state strong, .connection-state small, .sync-status span, .sync-status strong { display: block; }
.connection-state strong { color: var(--theme-text); font-size: 12px; }
.connection-state small { margin-top: 2px; color: var(--theme-text-muted); font-size: 11px; }
.sync-status { padding-left: 18px; border-left: 1px solid var(--theme-divider); }
.sync-status span { color: var(--theme-text-muted); font-size: 10px; }
.sync-status strong { margin-top: 3px; color: var(--theme-text-secondary); font-size: 11px; font-weight: 600; }
.inventory-toolbar__actions { flex-wrap: wrap; justify-content: flex-end; }
.ghost-button, .primary-button, .icon-button { display: inline-flex; align-items: center; justify-content: center; gap: 7px; min-height: 36px; border-radius: 7px; border: 1px solid var(--theme-border-control); padding: 0 12px; color: var(--theme-text-secondary); background: var(--theme-control); font-size: 12px; font-weight: 650; cursor: pointer; transition: border-color .16s ease, background .16s ease, color .16s ease; }
.primary-button { border-color: var(--theme-accent); background: var(--theme-accent); color: #fff; }
.sync-button { border-color: color-mix(in srgb, #3b82f6 42%, var(--theme-border)); color: color-mix(in srgb, #3b82f6 76%, var(--theme-text)); }
.add-button { min-width: 104px; }
.ghost-button:hover, .icon-button:hover { border-color: var(--theme-border-control); background: var(--theme-control-hover); color: var(--theme-text); }
.primary-button:hover { background: color-mix(in srgb, var(--theme-accent) 86%, #000); }
button:disabled { cursor: not-allowed; opacity: .55; }
.icon-button { width: 32px; min-height: 32px; padding: 0; }
.icon-button.danger { color: var(--theme-danger-text); }
.inventory-banner { display: flex; align-items: center; gap: 8px; padding: 11px 14px; border-radius: 7px; font-size: 13px; }
.inventory-banner--success { color: var(--theme-success-text); background: var(--theme-success-soft); border: 1px solid color-mix(in srgb, var(--theme-success-text) 26%, transparent); }
.inventory-banner--error { color: var(--theme-danger-text); background: var(--theme-danger-soft); border: 1px solid color-mix(in srgb, var(--theme-danger) 26%, transparent); }
.inventory-summary-grid { display: grid; grid-template-columns: 1.35fr 1fr 1fr 1fr; gap: 10px; }
.summary-card { position: relative; display: grid; gap: 7px; min-height: 126px; padding: 16px 17px 15px; overflow: hidden; }
.summary-card::after { position: absolute; inset: auto 0 0; height: 2px; background: var(--metric-color); content: ''; opacity: .8; }
.summary-card__top { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.summary-card__top > span:first-child { color: var(--theme-text-muted); font-size: 11px; font-weight: 700; }
.summary-card__icon { display: grid; width: 34px; height: 34px; flex: 0 0 34px; place-items: center; border-radius: 7px; color: var(--metric-color); background: var(--metric-background); }
.summary-card strong { color: var(--theme-text); font-size: 29px; line-height: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.summary-card small { color: var(--theme-text-muted); font-size: 10px; }
.summary-card--stock { --metric-color: var(--theme-control-selected-text); --metric-background: var(--theme-accent-soft); border-color: color-mix(in srgb, var(--theme-accent) 30%, var(--theme-border)); background: color-mix(in srgb, var(--theme-accent) 7%, var(--theme-panel)); }
.summary-card--shipments { --metric-color: #3b82f6; --metric-background: color-mix(in srgb, #3b82f6 13%, var(--theme-panel)); }
.summary-card--warning { --metric-color: var(--theme-warning-text); --metric-background: var(--theme-warning-soft); }
.summary-card--danger { --metric-color: var(--theme-danger); --metric-background: var(--theme-danger-soft); }
.panel-heading, .dialog-heading, .detail-section__heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.panel-heading strong, .dialog-heading strong { display: block; font-size: 15px; }
.panel-heading small, .dialog-heading small { display: block; margin-top: 4px; color: var(--theme-text-muted); font-size: 11px; }
.panel-heading__legend { display: inline-flex; align-items: center; gap: 7px; color: var(--theme-text-muted); font-size: 10px; }
.legend-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--theme-warning-text); box-shadow: 0 0 0 3px var(--theme-warning-soft); }
.inventory-table-wrap { margin: 14px -18px -16px; overflow-x: auto; }
.inventory-table, .detail-table { width: 100%; border-collapse: collapse; min-width: 920px; }
.inventory-table th, .inventory-table td, .detail-table th, .detail-table td { padding: 13px 12px; border-bottom: 1px solid var(--theme-divider); text-align: left; font-size: 12px; white-space: nowrap; }
.inventory-table th:first-child, .inventory-table td:first-child { padding-left: 18px; }
.inventory-table th:last-child, .inventory-table td:last-child { padding-right: 18px; }
.inventory-table th { background: var(--theme-panel-soft); }
.inventory-table th, .detail-table th { color: var(--theme-text-muted); font-size: 10px; font-weight: 800; text-transform: uppercase; }
.inventory-table tbody tr { box-shadow: inset 2px 0 transparent; transition: background .15s ease, box-shadow .15s ease; }
.inventory-table tbody tr:hover { background: var(--theme-panel-soft); }
.inventory-table tbody tr.row-risk-out-of-stock { box-shadow: inset 2px 0 var(--theme-danger); }
.inventory-table tbody tr.row-risk-reorder { box-shadow: inset 2px 0 var(--theme-warning-text); }
.inventory-table td > small, .sku-code + small { display: block; margin-top: 5px; color: var(--theme-text-muted); font-size: 10px; }
.sku-product, .detail-product { display: flex; align-items: center; gap: 10px; min-width: 0; }
.sku-product__copy { min-width: 0; }
.product-thumbnail { display: grid; width: 46px; height: 46px; flex: 0 0 46px; place-items: center; overflow: hidden; border: 1px solid var(--theme-border); border-radius: 7px; background: var(--theme-panel-soft); color: var(--theme-text-muted); }
.product-thumbnail img { width: 100%; height: 100%; object-fit: cover; }
.product-thumbnail--detail { width: 52px; height: 52px; flex-basis: 52px; }
.sku-code { display: block; max-width: 180px; overflow: hidden; color: var(--theme-text); font-size: 14px; font-weight: 800; text-overflow: ellipsis; }
.stock-value { color: var(--theme-text); font-size: 17px; }
.data-value { color: var(--theme-text-secondary); font-variant-numeric: tabular-nums; }
.stockout-value { color: var(--theme-text-secondary); font-size: 13px; }
.stockout-value--urgent { color: var(--theme-warning-text); }
.negative-stock { color: var(--theme-danger-text); }
.risk-badge { display: inline-flex; align-items: center; min-height: 24px; padding: 0 8px; border: 1px solid transparent; border-radius: 999px; font-size: 10px; font-weight: 800; }
.risk-not-synced { color: var(--theme-text-secondary); background: var(--theme-control); border-color: var(--theme-border); } .risk-out-of-stock { color: var(--theme-danger-text); background: var(--theme-danger-soft); border-color: color-mix(in srgb, var(--theme-danger) 22%, transparent); } .risk-reorder { color: var(--theme-warning-text); background: var(--theme-warning-soft); border-color: color-mix(in srgb, var(--theme-warning-text) 22%, transparent); } .risk-healthy { color: var(--theme-success-text); background: var(--theme-success-soft); border-color: color-mix(in srgb, var(--theme-success-text) 22%, transparent); } .risk-no-sales { color: color-mix(in srgb, #0284c7 72%, var(--theme-text)); background: color-mix(in srgb, #0ea5e9 12%, var(--theme-panel)); border-color: color-mix(in srgb, #0ea5e9 20%, transparent); }
.inventory-empty, .detail-empty { display: grid; place-items: center; gap: 8px; min-height: 180px; color: var(--theme-text-muted); font-size: 13px; }
.inventory-empty strong { color: var(--theme-text); }
.inventory-overlay { position: fixed; inset: 0; z-index: 30; display: grid; place-items: center; padding: 18px; background: rgba(2, 6, 12, .72); }
.inventory-dialog { width: min(560px, 100%); padding: 18px; box-shadow: 0 24px 70px rgba(0, 0, 0, .35); }
.inventory-dialog--wide { width: min(980px, 100%); max-height: min(760px, 92vh); overflow: auto; }
.form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; margin-top: 20px; }
.form-grid label { display: grid; gap: 7px; }
.form-grid label:first-child { grid-column: span 2; }
.form-grid span { color: var(--theme-text-secondary); font-size: 12px; }
.form-grid input { width: 100%; min-height: 38px; padding: 0 10px; border: 1px solid var(--theme-border-control); border-radius: 7px; background: var(--theme-input); color: var(--theme-text); outline: none; }
.form-grid input:focus { border-color: var(--theme-accent); }
.dialog-actions { justify-content: flex-end; margin-top: 22px; }
.detail-metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin-top: 18px; }
.detail-metrics > div { padding: 12px; border: 1px solid var(--theme-border); border-radius: 8px; background: var(--theme-panel-soft); }
.detail-metrics span, .detail-metrics strong { display: block; }
.detail-metrics span { color: var(--theme-text-muted); font-size: 11px; }
.detail-metrics strong { margin-top: 5px; color: var(--theme-text); font-size: 16px; }
.detail-columns { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(260px, .75fr); gap: 16px; margin-top: 18px; }
.detail-section { min-width: 0; }
.detail-section__heading { margin-bottom: 9px; }
.detail-section__heading strong { font-size: 13px; }
.detail-section__heading span { color: var(--theme-text-muted); font-size: 11px; }
.detail-table { min-width: 0; }
.detail-table th, .detail-table td { padding: 9px 8px; }
.history-row { display: grid; gap: 4px; padding: 10px 0; border-bottom: 1px solid var(--theme-divider); }
.history-row span { color: var(--theme-text-secondary); font-size: 12px; }
.history-row small { color: var(--theme-text-muted); font-size: 11px; }
.spin { animation: inventory-spin 1s linear infinite; }
@keyframes inventory-spin { to { transform: rotate(360deg); } }
@media (max-width: 1040px) { .inventory-summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 760px) { .inventory-head, .inventory-toolbar { align-items: flex-start; flex-direction: column; } .inventory-head__actions, .inventory-toolbar__actions { width: 100%; justify-content: flex-start; } .inventory-toolbar__status { width: 100%; justify-content: space-between; } .detail-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); } .detail-columns { grid-template-columns: 1fr; } }
@media (max-width: 480px) { .inventory-page { padding: 8px; } .inventory-summary-grid { grid-template-columns: 1fr; } .summary-card { min-height: 112px; } .form-grid { grid-template-columns: 1fr; } .form-grid label:first-child { grid-column: auto; } .inventory-head h1 { font-size: 20px; } .inventory-toolbar__status { align-items: flex-start; flex-direction: column; gap: 10px; } .sync-status { width: 100%; padding: 9px 0 0; border-top: 1px solid var(--theme-divider); border-left: 0; } .inventory-toolbar__actions > button { flex: 1 1 auto; } .panel-heading__legend { display: none; } .ghost-button, .primary-button { min-height: 34px; padding: 0 9px; } }
</style>
