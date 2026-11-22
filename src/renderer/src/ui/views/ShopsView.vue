<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Bell, Building2, CheckCircle2, ChevronRight, Clock, LoaderCircle, RefreshCcw } from 'lucide-vue-next'
import type { ShopCard, ShopsOverview, SiSyncProgress, SiSyncStage } from '../../../../shared/sellerInventory'
import ShopAccountsPanel from './shops/ShopAccountsPanel.vue'
import ShopFindings from './shops/ShopFindings.vue'
import ShopReportDialog from './shops/ShopReportDialog.vue'
import { change, fmtChange, fmtMoney, fmtNumber, fmtPercent } from './shops/shopFormat'
import { useSyncWatcher } from './shops/useSyncWatcher'
import { freshnessText, friendlyStageError, friendlySyncError } from '../../../../shared/sellerSyncText'

/** 店铺: every shop's business at a glance; 账号 holds the shared logins. */
const { t, locale } = useI18n()
const router = useRouter()
const route = useRoute()
const tab = ref<'business' | 'accounts'>(route.query.tab === 'accounts' ? 'accounts' : 'business')
const overview = ref<ShopsOverview | null>(null)
const loading = ref(false)
const errorText = ref('')
const notice = ref<{ tone: 'accent' | 'warning' | 'danger'; text: string } | null>(null)
const reportOpen = ref(false)
const now = ref(Date.now())
const clock = setInterval(() => { now.value = Date.now() }, 30_000)
/** Shops sync side by side, so every running shop gets its own status. */
const runningText = computed(() => progress.value
  .filter((item) => item.status === 'running')
  .map((item) => `${overview.value?.cards.find((card) => card.shop.shopKey === item.shopKey)?.shop.name || ''} ${t(`sellerInv.stage.${item.stage || 'account'}`, { detail: item.detail || '' })}`.trim())
  .join(' · '))

const api = window.api.sellerInventory
const region = computed(() => overview.value?.cards[0]?.shop.region)
const { progress, syncing, started, markLoaded } = useSyncWatcher({ refresh: () => load(), onFinished: finished })

function isSyncing(shopKey: string) {
  return progress.value.some((item) => item.shopKey === shopKey && item.status === 'running')
}

function freshness(card: ShopCard) {
  return freshnessText(card.shop.state.lastSyncAt, now.value, locale.value)
}

/** How a sync the user started ended, in one sentence. Background updates stay quiet unless they fail. */
function finished(jobs: SiSyncProgress[]) {
  const name = (shopKey: string) => overview.value?.cards.find((card) => card.shop.shopKey === shopKey)?.shop.name || ''
  const failed = jobs.filter((job) => job.status === 'failed')
  const partial = jobs.filter((job) => job.status === 'done' && job.stageErrors && Object.keys(job.stageErrors).length)
  if (failed.length) notice.value = { tone: 'danger', text: failed.map((job) => `${name(job.shopKey)}：${friendlySyncError(job.error, locale.value)}`).join('\n') }
  else if (partial.length) notice.value = { tone: 'warning', text: partial.flatMap((job) => Object.entries(job.stageErrors || {}).map(([stage, error]) => `${name(job.shopKey)}：${friendlyStageError(stage as SiSyncStage, error, locale.value)}`)).join('\n') }
  else if (jobs.some((job) => !job.automatic)) notice.value = { tone: 'accent', text: t('shops.syncDone') }
  if (notice.value?.tone === 'accent') setTimeout(() => { if (notice.value?.tone === 'accent') notice.value = null }, 4000)
}

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

function visibleAlerts(card: ShopCard) {
  // While a shop is syncing, "not synced yet" is just noise.
  return card.alerts.filter((alert) => !(alert.kind === 'noData' && isSyncing(card.shop.shopKey)))
}

function alertTone(alert: ShopCard['alerts'][number]) {
  return alert.kind === 'stock' || alert.kind === 'noData' ? 'vg-pill--amber' : 'vg-pill--red'
}

async function load() {
  loading.value = true
  try {
    overview.value = await api.getShopsOverview()
    errorText.value = ''
    void markLoaded()
  } catch (error) {
    errorText.value = friendlySyncError(error, locale.value)
  } finally {
    loading.value = false
  }
}

async function syncAll() {
  notice.value = null
  const result = await api.sync()
  if (!result.started) notice.value = { tone: 'accent', text: friendlySyncError('SELLER_INVENTORY_SYNC_RUNNING', locale.value) }
  await started()
}

// Links such as "update cookies" land on /shops?tab=accounts while this page is already open.
watch(() => route.query.tab, (value) => { tab.value = value === 'accounts' ? 'accounts' : 'business' })
watch(tab, (next) => {
  void router.replace({ query: next === 'accounts' ? { tab: 'accounts' } : {} })
  if (next === 'business') void load()
})

onMounted(() => { void load() })
onBeforeUnmount(() => clearInterval(clock))
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
        <span v-if="syncing" class="vg-muted shops-view__sync"><LoaderCircle :size="14" class="vg-spin" />{{ runningText }}</span>
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
      <div v-if="notice" class="vg-notice shops-view__notice" :class="`vg-notice--${notice.tone}`" data-testid="shops-notice">
        <CheckCircle2 v-if="notice.tone === 'accent'" :size="16" /><AlertTriangle v-else :size="16" /><span>{{ notice.text }}</span>
        <button type="button" class="vg-btn vg-btn--xs vg-btn--ghost" @click="notice = null">{{ t('shops.dismiss') }}</button>
      </div>
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
              <span class="shop-biz__name">
                <strong class="vg-ellipsis">{{ card.shop.name }}</strong>
                <small v-if="isSyncing(card.shop.shopKey)" class="shop-biz__fresh is-syncing"><LoaderCircle :size="11" class="vg-spin" />{{ t('shops.syncingShop') }}</small>
                <small v-else class="shop-biz__fresh" :class="{ 'is-stale': freshness(card).stale }" :data-testid="`shop-fresh-${card.shop.shopKey}`"><Clock :size="11" />{{ card.shop.region }} · {{ freshness(card).text }}</small>
              </span>
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
            <div v-if="visibleAlerts(card).length || card.shop.state.stageErrors" class="shop-biz__alerts">
              <span v-for="alert in visibleAlerts(card)" :key="alert.kind" class="vg-pill" :class="alertTone(alert)" :title="alert.kind === 'syncFailed' ? friendlySyncError(card.shop.state.lastSyncError, locale) : undefined">{{ alertText(alert) }}</span>
              <span v-for="(error, stage) in card.shop.state.stageErrors || {}" :key="stage" class="vg-pill vg-pill--amber" :title="friendlyStageError(stage as SiSyncStage, error, locale)">{{ friendlyStageError(stage as SiSyncStage, error, locale, true) }}</span>
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
.shops-view__notice > span { flex: 1; white-space: pre-line; }
.shop-biz__fresh { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; color: var(--theme-text-muted); }
.shop-biz__fresh.is-stale { color: var(--vg-amber); font-weight: 600; }
.shop-biz__fresh.is-syncing { color: var(--vg-accent); }
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
