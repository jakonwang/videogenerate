<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { AlertTriangle, ChevronDown, ChevronRight, Loader2, RefreshCcw, Tv } from 'lucide-vue-next'
import type { LiveOverview, LiveSyncState } from '../../../../../shared/liveAccounts'
import { formatMoney } from '../product-research/productResearchUtils'
import { liveErrorText } from './liveText'

/** 店铺 → 直播：每场卖了什么，按款号汇总，以及哪些链接归不到款。 */
const emit = defineEmits<{ accounts: [] }>()
const { t, locale } = useI18n()
const data = ref<LiveOverview | null>(null)
const progress = ref<LiveSyncState[]>([])
const error = ref('')
const days = ref(30)
const account = ref('')
const view = ref<'rooms' | 'codes' | 'unassigned'>('rooms')
const opened = ref(new Set<string>())
const syncing = computed(() => progress.value.some((item) => item.status === 'running'))

async function load() {
  try {
    data.value = await window.api.liveAccounts.overview({ since: Date.now() - days.value * 86_400_000 })
    error.value = ''
  } catch (reason) {
    error.value = liveErrorText(reason, t)
  }
}
async function poll() {
  const before = syncing.value
  progress.value = await window.api.liveAccounts.getProgress()
  if (before && !syncing.value) await load()
}
let timer: ReturnType<typeof setInterval> | null = null
onMounted(() => { void load(); void poll(); timer = setInterval(() => void poll().catch(() => undefined), 2500) })
onBeforeUnmount(() => { if (timer) clearInterval(timer) })

async function syncAll() {
  await window.api.liveAccounts.sync()
  await poll()
}
const rooms = computed(() => (data.value?.rooms || []).filter((room) => !account.value || room.accountId === account.value))
const num = (value: number) => Math.round(value).toLocaleString()
const rate = (part: number, whole: number) => (whole > 0 ? `${((part / whole) * 100).toFixed(1)}%` : '-')
const time = (ms: number) => new Intl.DateTimeFormat(locale.value, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(ms))
const hours = (ms: number) => `${(ms / 3_600_000).toFixed(1)}h`
function toggle(id: string) {
  const next = new Set(opened.value)
  if (!next.delete(id)) next.add(id)
  opened.value = next
}
</script>

<template>
  <section class="lvs" data-testid="live-sessions">
    <div v-if="error" class="vg-notice vg-notice--danger"><AlertTriangle :size="16" /><span>{{ error }}</span></div>
    <section v-if="data && !data.accounts.length" class="vg-card vg-empty">
      <span class="vg-empty__icon"><Tv :size="26" /></span>
      <h3>{{ t('shops.live.empty') }}</h3>
      <p>{{ t('shops.live.accountsHint') }}</p>
      <button type="button" class="vg-btn vg-btn--primary" @click="emit('accounts')">{{ t('shops.live.add') }}</button>
    </section>
    <template v-else-if="data">
      <div class="lvs-bar">
        <select v-model.number="days" class="vg-select vg-select--sm" @change="load"><option :value="7">{{ t('shops.live.days', { n: 7 }) }}</option><option :value="30">{{ t('shops.live.days', { n: 30 }) }}</option><option :value="60">{{ t('shops.live.days', { n: 60 }) }}</option></select>
        <select v-if="data.accounts.length > 1" v-model="account" class="vg-select vg-select--sm"><option value="">{{ t('shops.live.allAccounts') }}</option><option v-for="item in data.accounts" :key="item.id" :value="item.id">{{ item.name }}</option></select>
        <div class="lvs-tabs">
          <button v-for="item in (['rooms', 'codes', 'unassigned'] as const)" :key="item" type="button" class="vg-btn vg-btn--sm" :class="{ 'vg-btn--soft': view === item }" @click="view = item">{{ t(`shops.live.view.${item}`) }} <b class="vg-num">{{ item === 'rooms' ? rooms.length : data[item].length }}</b></button>
        </div>
        <span class="vg-toolbar__spacer"></span>
        <button type="button" class="vg-btn vg-btn--sm" :disabled="syncing" @click="syncAll"><Loader2 v-if="syncing" :size="13" class="vg-spin" /><RefreshCcw v-else :size="13" />{{ t('shops.live.sync') }}</button>
      </div>
      <div v-for="item in data.totals" :key="item.currency" class="vg-card lvs-total">
        <div><small>{{ t('shops.live.gmv') }}</small><b>{{ formatMoney(item.gmv, item.currency) }}</b></div>
        <div><small>{{ t('shops.live.sales') }}</small><b>{{ num(item.sales) }}</b></div>
        <div><small>{{ t('shops.live.assigned') }}</small><b :class="{ 'is-low': item.gmv && item.assignedGmv / item.gmv < 0.5 }">{{ rate(item.assignedGmv, item.gmv) }}</b></div>
        <p v-if="item.gmv && item.assignedGmv / item.gmv < 0.5">{{ t('shops.live.assignedHint') }}</p>
      </div>

      <div class="vg-card lvs-table">
        <table v-if="view === 'rooms'">
          <thead><tr><th></th><th>{{ t('shops.live.start') }}</th><th>{{ t('shops.live.account') }}</th><th>{{ t('shops.live.gmv') }}</th><th>{{ t('shops.live.sales') }}</th><th>{{ t('shops.live.views') }}</th><th>{{ t('shops.live.impressions') }}</th><th>{{ t('shops.live.products') }}</th></tr></thead>
          <tbody>
            <template v-for="room in rooms" :key="room.id">
              <tr class="is-click" @click="toggle(room.id)"><td><ChevronDown v-if="opened.has(room.id)" :size="14" /><ChevronRight v-else :size="14" /></td><td>{{ time(room.startAt) }} <small>{{ hours(room.endAt - room.startAt) }}</small></td><td>{{ room.accountName }}</td><td>{{ formatMoney(room.gmv, room.currency) }}</td><td>{{ num(room.sales) }}</td><td>{{ num(room.views) }}</td><td>{{ num(room.impressions) }}</td><td>{{ room.products.length }}</td></tr>
              <tr v-for="product in opened.has(room.id) ? room.products : []" :key="`${room.id}-${product.productId}`" class="is-sub">
                <td></td>
                <td colspan="2"><span class="lvs-product"><img v-if="product.image" :src="product.image" alt="" loading="lazy" /><span :title="product.name">{{ product.name }}<small><template v-if="product.codes.length"><b v-for="code in product.codes" :key="code.code">{{ code.code }}<template v-if="code.estimated"> {{ t('shops.live.estimatedUnits', { n: code.sales }) }}</template></b></template><em v-else>{{ t('shops.live.noCode') }}</em></small></span></span></td>
                <td>{{ formatMoney(product.gmv, room.currency) }}</td><td>{{ num(product.sales) }}</td>
                <td>{{ t('shops.live.exposures') }} {{ num(product.exposures) }}</td><td>{{ t('shops.live.clicks') }} {{ num(product.clicks) }} ({{ rate(product.clicks, product.exposures) }})</td><td>{{ t('shops.live.carts') }} {{ num(product.carts) }}</td>
              </tr>
            </template>
            <tr v-if="!rooms.length"><td colspan="8" class="lvs-empty">{{ t('shops.live.noRooms') }}</td></tr>
          </tbody>
        </table>
        <table v-else-if="view === 'codes'">
          <thead><tr><th>{{ t('shops.live.code') }}</th><th>{{ t('shops.live.sessions') }}</th><th>{{ t('shops.live.exposures') }}</th><th>{{ t('shops.live.ctr') }}</th><th>{{ t('shops.live.orders') }}</th><th>{{ t('shops.live.cvr') }}</th><th>{{ t('shops.live.sales') }}</th><th>{{ t('shops.live.gmv') }}</th></tr></thead>
          <tbody>
            <tr v-for="item in data.codes" :key="item.code + item.currency"><td><b>{{ item.code }}</b> <small v-if="item.estimated">{{ t('shops.live.estimated') }}</small></td><td>{{ item.sessions }}</td><td>{{ item.exposures ? num(item.exposures) : '-' }}</td><td>{{ rate(item.clicks, item.exposures) }}</td><td>{{ num(item.orders) }}</td><td>{{ rate(item.orders, item.clicks) }}</td><td>{{ num(item.sales) }}</td><td>{{ formatMoney(item.gmv, item.currency) }}</td></tr>
            <tr v-if="!data.codes.length"><td colspan="8" class="lvs-empty">{{ t('shops.live.noCodes') }}</td></tr>
          </tbody>
        </table>
        <template v-else>
          <p class="lvs-tip">{{ t('shops.live.unassignedTip') }}</p>
          <table>
            <thead><tr><th>{{ t('shops.live.product') }}</th><th>{{ t('shops.live.sessions') }}</th><th>{{ t('shops.live.sales') }}</th><th>{{ t('shops.live.why') }}</th></tr></thead>
            <tbody>
              <tr v-for="item in data.unassigned" :key="item.productId"><td><span class="lvs-product"><img v-if="item.image" :src="item.image" alt="" loading="lazy" /><span :title="item.name">{{ item.name }}<small>ID {{ item.productId }}</small></span></span></td><td>{{ item.sessions }}</td><td>{{ num(item.sales) }}</td><td>{{ t(`shops.live.reason.${item.reason}`) }}</td></tr>
              <tr v-if="!data.unassigned.length"><td colspan="4" class="lvs-empty">{{ t('shops.live.allAssigned') }}</td></tr>
            </tbody>
          </table>
        </template>
      </div>
    </template>
  </section>
</template>

<style scoped>
.lvs { display: flex; flex-direction: column; gap: 12px; }
.lvs-bar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.lvs-tabs { display: flex; gap: 6px; }
.lvs-total { display: flex; align-items: center; gap: 34px; flex-wrap: wrap; }
.lvs-total small { display: block; font-size: 12px; color: var(--theme-text-muted); }
.lvs-total b { font-size: 19px; font-variant-numeric: tabular-nums; }
.lvs-total p { flex: 1; min-width: 260px; margin: 0; font-size: 12px; line-height: 1.6; color: var(--theme-tone-amber); }
.is-low { color: var(--theme-tone-amber); }
.lvs-table { overflow-x: auto; padding: 0; scrollbar-width: thin; }
.lvs-table table { width: 100%; border-collapse: collapse; font-size: 13px; }
.lvs-table th { padding: 10px 12px; text-align: left; font-size: 12px; font-weight: 600; color: var(--theme-text-muted); white-space: nowrap; }
.lvs-table td { padding: 10px 12px; border-top: 1px solid var(--theme-divider); font-variant-numeric: tabular-nums; }
.lvs-table td small { color: var(--theme-text-muted); font-size: 11px; }
.is-click { cursor: pointer; }
.is-click:hover, .is-sub { background: var(--theme-panel-soft); }
.lvs-product { display: flex; align-items: center; gap: 10px; min-width: 0; }
.lvs-product img { width: 36px; height: 36px; flex: none; border-radius: 6px; object-fit: cover; }
.lvs-product > span { max-width: 420px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lvs-product small { display: block; }
.lvs-product small b { margin-right: 8px; color: var(--vg-accent); }
.lvs-product small em { font-style: normal; color: var(--theme-tone-amber); }
.lvs-tip { margin: 0; padding: 12px 14px 4px; font-size: 12px; line-height: 1.6; color: var(--theme-text-muted); }
.lvs-empty { padding: 30px !important; text-align: center; color: var(--theme-text-muted); }
</style>
