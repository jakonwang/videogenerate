<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Bell, Building2, ChevronRight, LoaderCircle, RefreshCcw } from 'lucide-vue-next'
import type { ShopCard, ShopsOverview, SiSyncProgress } from '../../../../shared/sellerInventory'
import ShopAccountsPanel from './shops/ShopAccountsPanel.vue'
import ShopFindings from './shops/ShopFindings.vue'
import ShopReportDialog from './shops/ShopReportDialog.vue'
import { change, fmtChange, fmtMoney, fmtNumber, fmtPercent } from './shops/shopFormat'

/** 店铺: every shop's business at a glance; 账号 holds the shared logins. */
const { t, locale } = useI18n()
const router = useRouter()
const route = useRoute()
const tab = ref<'business' | 'accounts'>(route.query.tab === 'accounts' ? 'accounts' : 'business')
const overview = ref<ShopsOverview | null>(null)
const progress = ref<SiSyncProgress[]>([])
const loading = ref(false)
const errorText = ref('')
let timer: ReturnType<typeof setInterval> | null = null
const reportOpen = ref(false)

const api = window.api.sellerInventory
const region = computed(() => overview.value?.cards[0]?.shop.region)
const syncing = computed(() => progress.value.some((item) => item.status === 'running'))
const running = computed(() => progress.value.find((item) => item.status === 'running'))

function money(value: number | undefined, compact = true) {
  return fmtMoney(value, locale.value, region.value, compact)
}

function sparkPath(card: ShopCard) {
  const max = Math.max(1, ...card.spark.map((point) => point.gmv))
  const step = card.spark.length > 1 ? 100 / (card.spark.length - 1) : 0
  return card.spark.map((point, index) => `${index ? 'L' : 'M'}${(index * step).toFixed(1)},${(30 - (point.gmv / max) * 28).toFixed(1)}`).join(' ')
}

function alertText(alert: ShopCard['alerts'][number]) {
  if (alert.kind === 'gmvDrop') return t('shops.alert.gmvDrop', { value: fmtChange(alert.value) })
  if (alert.kind === 'stock') return t('shops.alert.stock', { n: alert.value })
  if (alert.kind === 'health') return t('shops.alert.health', { n: alert.value })
  if (alert.kind === 'urgentShip') return t('shops.alert.urgentShip', { n: alert.value })
  return t(`shops.alert.${alert.kind}`)
}

function alertTone(alert: ShopCard['alerts'][number]) {
  return alert.kind === 'stock' || alert.kind === 'noData' ? 'vg-pill--amber' : 'vg-pill--red'
}

async function load() {
  loading.value = true
  try {
    overview.value = await api.getShopsOverview()
    errorText.value = ''
  } catch (error) {
    errorText.value = error instanceof Error ? error.message : String(error)
  } finally {
    loading.value = false
  }
}

async function poll() {
  const was = syncing.value
  progress.value = await api.getProgress().catch(() => progress.value)
  if (syncing.value) return
  if (timer) clearInterval(timer)
  timer = null
  if (was) await load()
}

async function syncAll() {
  await api.sync()
  progress.value = await api.getProgress()
  if (!timer) timer = setInterval(() => { void poll() }, 2000)
}

// Links such as "update cookies" land on /shops?tab=accounts while this page is already open.
watch(() => route.query.tab, (value) => { tab.value = value === 'accounts' ? 'accounts' : 'business' })
watch(tab, (next) => {
  void router.replace({ query: next === 'accounts' ? { tab: 'accounts' } : {} })
  if (next === 'business') void load()
})

onMounted(async () => {
  await load()
  progress.value = await api.getProgress().catch(() => [])
  if (syncing.value && !timer) timer = setInterval(() => { void poll() }, 2000)
})

onBeforeUnmount(() => { if (timer) clearInterval(timer) })
</script>

<template>
  <main class="vg-scope vg-page shops-view" data-testid="shops">
    <header class="vg-page-head">
      <span class="vg-page-head__icon"><Building2 :size="20" /></span>
      <div class="vg-page-head__text">
        <h1>{{ t('shops.hubTitle') }}</h1>
        <p>{{ t('shops.hubSubtitle') }}</p>
      </div>
      <div class="vg-page-head__actions">
        <span v-if="syncing" class="vg-muted shops-view__sync"><LoaderCircle :size="14" class="vg-spin" />{{ running ? t(`sellerInv.stage.${running.stage || 'account'}`, { detail: running.detail || '' }) : '' }}</span>
        <button type="button" class="vg-btn" :disabled="!overview?.cards.length" data-testid="shops-report" @click="reportOpen = true"><Bell :size="15" />{{ t('shops.report.button') }}</button>
        <button type="button" class="vg-btn vg-btn--primary" :disabled="syncing || !overview?.cards.length" data-testid="shops-sync" @click="syncAll"><RefreshCcw :size="15" :class="{ 'vg-spin': syncing }" />{{ t('shops.syncAll') }}</button>
      </div>
    </header>

    <nav class="vg-tabs shops-view__tabs">
      <button type="button" class="vg-tabs__btn" :class="{ 'is-active': tab === 'business' }" data-testid="shops-tab-business" @click="tab = 'business'">{{ t('shops.tabBusiness') }}</button>
      <button type="button" class="vg-tabs__btn" :class="{ 'is-active': tab === 'accounts' }" data-testid="shops-tab-accounts" @click="tab = 'accounts'">{{ t('shops.tabAccounts') }}</button>
    </nav>

    <ShopAccountsPanel v-if="tab === 'accounts'" />

    <template v-else>
      <div v-if="errorText" class="vg-notice vg-notice--danger"><AlertTriangle :size="16" /><span>{{ errorText }}</span></div>
      <section v-if="overview && !overview.cards.length" class="vg-card vg-empty">
        <span class="vg-empty__icon"><Building2 :size="26" /></span>
        <h3>{{ t('shops.emptyTitle') }}</h3>
        <p>{{ t('shops.emptyDesc') }}</p>
        <button type="button" class="vg-btn vg-btn--primary" @click="tab = 'accounts'">{{ t('shops.add') }}</button>
      </section>

      <template v-else-if="overview">
        <section class="vg-stats shops-view__totals" data-testid="shops-totals">
          <div class="vg-stat"><span class="vg-stat__body"><span class="vg-stat__label">{{ t('shops.total.todayGmv') }}</span><span class="vg-stat__value">{{ money(overview.total.todayGmv, false) }}</span><small class="vg-muted">{{ t('shops.vsYesterday', { value: money(overview.total.yesterdayGmv) }) }}</small></span></div>
          <div class="vg-stat"><span class="vg-stat__body"><span class="vg-stat__label">{{ t('shops.total.todayOrders') }}</span><span class="vg-stat__value">{{ fmtNumber(overview.total.todayOrders, locale) }}</span></span></div>
          <div class="vg-stat"><span class="vg-stat__body"><span class="vg-stat__label">{{ t('shops.total.todayVisitors') }}</span><span class="vg-stat__value">{{ fmtNumber(overview.total.todayVisitors, locale) }}</span></span></div>
          <div class="vg-stat"><span class="vg-stat__body"><span class="vg-stat__label">{{ t('shops.total.gmv7') }}</span><span class="vg-stat__value">{{ money(overview.total.gmv7, false) }}</span><small class="vg-muted">{{ t('shops.vsPrev7', { value: fmtChange(change(overview.total.gmv7, overview.total.gmvPrev7)) || '—' }) }}</small></span></div>
        </section>

        <section class="shops-view__grid">
          <button v-for="card in overview.cards" :key="card.shop.shopKey" type="button" class="vg-card vg-card--interactive shop-biz" :data-testid="`shop-biz-${card.shop.shopKey}`" @click="router.push(`/shops/${encodeURIComponent(card.shop.shopKey)}`)">
            <header class="shop-biz__head">
              <span class="shop-biz__avatar">{{ (card.shop.name || '?').slice(0, 1).toUpperCase() }}</span>
              <span class="shop-biz__name"><strong class="vg-ellipsis">{{ card.shop.name }}</strong><small class="vg-muted">{{ card.shop.region }}</small></span>
              <ChevronRight :size="16" class="vg-muted" />
            </header>
            <div class="shop-biz__main">
              <div>
                <span class="vg-muted shop-biz__label">{{ t('shops.metric.todayGmv') }}</span>
                <strong class="shop-biz__gmv">{{ money(card.today?.gmv, false) }}</strong>
                <span class="shop-biz__vs">
                  {{ t('shops.vsYesterday', { value: money(card.yesterday?.gmv) }) }}
                </span>
              </div>
              <svg viewBox="0 0 100 32" preserveAspectRatio="none" class="shop-biz__spark" aria-hidden="true"><path :d="sparkPath(card)" /></svg>
            </div>
            <dl class="shop-biz__facts">
              <div><dt>{{ t('shops.metric.orders') }}</dt><dd>{{ fmtNumber(card.today?.orders, locale) }}</dd></div>
              <div><dt>{{ t('shops.metric.visitors') }}</dt><dd>{{ fmtNumber(card.today?.visitors, locale) }}</dd></div>
              <div><dt>{{ t('shops.metric.conversion') }}</dt><dd>{{ fmtPercent(card.today?.conversion, locale, 2) }}</dd></div>
              <div>
                <dt>{{ t('shops.metric.gmv7') }}</dt>
                <dd>
                  {{ money(card.gmv7) }}
                  <span v-if="change(card.gmv7, card.gmvPrev7) !== undefined" class="shop-biz__chg" :class="(change(card.gmv7, card.gmvPrev7) || 0) >= 0 ? 'up' : 'down'">
                    <ArrowUpRight v-if="(change(card.gmv7, card.gmvPrev7) || 0) >= 0" :size="11" /><ArrowDownRight v-else :size="11" />{{ fmtChange(change(card.gmv7, card.gmvPrev7)) }}
                  </span>
                </dd>
              </div>
            </dl>
            <div v-if="card.profit7 !== undefined" class="shop-biz__profit" :class="{ 'is-neg': card.profit7 < 0 }">
              <span>{{ t('shops.metric.profit7') }}</span>
              <strong>{{ money(card.profit7) }}</strong>
              <small v-if="card.margin7 !== undefined">{{ t('shops.profit.margin', { value: fmtPercent(card.margin7, locale, 1) }) }}</small>
            </div>
            <ShopFindings v-if="card.topFinding" :findings="[card.topFinding]" compact class="shop-biz__finding" />
            <div v-if="card.alerts.length" class="shop-biz__alerts">
              <span v-for="alert in card.alerts" :key="alert.kind" class="vg-pill" :class="alertTone(alert)">{{ alertText(alert) }}</span>
            </div>
          </button>
        </section>
        <p class="vg-muted shops-view__note">{{ t('shops.dataNote') }}</p>
      </template>
      <section v-else-if="loading" class="vg-empty"><LoaderCircle :size="22" class="vg-spin" /></section>
    </template>
    <ShopReportDialog :open="reportOpen" @close="reportOpen = false" />
  </main>
</template>

<style scoped>
.shops-view { display: flex; flex-direction: column; gap: 14px; }
.shops-view__tabs { overflow-y: hidden; flex-shrink: 0; }
.shops-view__sync { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; }
.shops-view__totals { grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); }
.shops-view__totals small { font-size: 11px; margin-top: 2px; }
.shops-view__grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 14px; }
.shops-view__note { font-size: 12px; margin: 0; }
.shop-biz { display: flex; flex-direction: column; gap: 12px; text-align: left; font: inherit; color: inherit; cursor: pointer; }
.shop-biz__head { display: flex; align-items: center; gap: 10px; min-width: 0; }
.shop-biz__avatar { width: 34px; height: 34px; border-radius: 10px; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; font-weight: 700; background: var(--vg-accent-soft); color: var(--vg-accent); }
.shop-biz__name { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.shop-biz__main { display: grid; grid-template-columns: 1fr 120px; align-items: end; gap: 10px; }
.shop-biz__main > div { display: flex; flex-direction: column; min-width: 0; }
.shop-biz__label { font-size: 12px; }
.shop-biz__gmv { font-size: 24px; font-variant-numeric: tabular-nums; line-height: 1.2; }
.shop-biz__vs { font-size: 11px; color: var(--theme-text-muted); }
.shop-biz__spark { width: 120px; height: 34px; }
.shop-biz__spark path { fill: none; stroke: var(--vg-accent); stroke-width: 1.5; vector-effect: non-scaling-stroke; }
.shop-biz__facts { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 0; }
.shop-biz__facts dt { font-size: 11px; color: var(--theme-text-muted); }
.shop-biz__facts dd { margin: 2px 0 0; font-size: 13px; font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; }
.shop-biz__chg { display: inline-flex; align-items: center; font-size: 11px; font-weight: 600; }
.shop-biz__chg.up { color: var(--vg-green, #16a34a); }
.shop-biz__chg.down { color: var(--vg-red); }
.shop-biz__alerts { display: flex; flex-wrap: wrap; gap: 6px; }
.shop-biz__profit { display: flex; align-items: baseline; gap: 8px; font-size: 12px; color: var(--theme-text-muted); }
.shop-biz__profit strong { font-size: 14px; color: var(--vg-green, #16a34a); font-variant-numeric: tabular-nums; }
.shop-biz__profit.is-neg strong { color: var(--vg-red); }
.shop-biz__finding { padding: 8px 10px; border-radius: 8px; background: var(--theme-panel-soft); }
</style>
