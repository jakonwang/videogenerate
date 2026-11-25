<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Bell, Building2, CheckCircle2, ChevronRight, LoaderCircle, RefreshCcw } from 'lucide-vue-next'
import type { ShopCard, ShopsOverview, SiSyncProgress, SiSyncStage } from '../../../../shared/sellerInventory'
import ShopAccountsPanel from './shops/ShopAccountsPanel.vue'
import LiveAccountsSection from './shops/LiveAccountsSection.vue'
import LiveSessionsPanel from './shops/LiveSessionsPanel.vue'
import ProductCardsPanel from './shops/ProductCardsPanel.vue'
import StyleBoardPanel from './shops/StyleBoardPanel.vue'
import { findingText } from '../../../../shared/shopReportText'
import ShopReportDialog from './shops/ShopReportDialog.vue'
import { change, fmtChange, fmtMoney, fmtNumber, fmtPercent } from './shops/shopFormat'
import { useSyncWatcher } from './shops/useSyncWatcher'
import { freshnessText, friendlyStageError, friendlySyncError } from '../../../../shared/sellerSyncText'

/** 店铺: every shop's business at a glance; 账号 holds the shared logins. */
const { t, locale } = useI18n()
const router = useRouter()
const route = useRoute()
/** 直播账号的登录在电脑上，网页版没有 */
const hasLive = Boolean(window.api.liveAccounts)
/** 商品分析：按款号看下一步，或按商品链接看商品卡 */
const hasStyles = Boolean(window.api.productCodes?.board)
const productView = ref<'styles' | 'links'>(hasStyles ? 'styles' : 'links')
type ShopsTab = 'business' | 'products' | 'live' | 'accounts'
function tabOf(value: unknown): ShopsTab {
  return value === 'accounts' || value === 'products' || (value === 'live' && hasLive) ? value : 'business'
}
const tab = ref<ShopsTab>(tabOf(route.query.tab))
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

/** up / down / flat, where a change that rounds to 0.0% counts as flat. */
function trend(current: number, previous: number) {
  const value = change(current, previous)
  if (value === undefined || Math.abs(value) < 0.0005) return 'flat'
  return value > 0 ? 'up' : 'down'
}

/** Everything that needs a look, most serious first; the card shows the first and a +N for the rest. */
function issues(card: ShopCard) {
  const list = visibleAlerts(card).map((alert) => ({
    tone: alertTone(alert) === 'vg-pill--red' ? 'danger' : 'warn',
    text: alertText(alert),
    title: alert.kind === 'syncFailed' ? friendlySyncError(card.shop.state.lastSyncError, locale.value) : '',
  }))
  for (const [stage, error] of Object.entries(card.shop.state.stageErrors || {})) {
    if (isSyncing(card.shop.shopKey)) break
    list.push({ tone: 'warn', text: friendlyStageError(stage as SiSyncStage, error, locale.value, true), title: friendlyStageError(stage as SiSyncStage, error, locale.value) })
  }
  return list.sort((a, b) => Number(b.tone === 'danger') - Number(a.tone === 'danger'))
}

const LINE = String.fromCharCode(10)

/** Footer lines: problems first, then the top analysis finding, or a single "all good". */
function notes(card: ShopCard) {
  const list: Array<{ tone: string; text: string; title: string }> = issues(card)
  if (card.topFinding && card.topFinding.level !== 'ok') list.push({ tone: card.topFinding.level === 'growth' ? 'ok' : card.topFinding.level === 'error' ? 'danger' : 'warn', text: findingText(card.topFinding, locale.value), title: '' })
  return list.length ? list : [{ tone: 'ok', text: t('shops.allClear'), title: '' }]
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
watch(() => route.query.tab, (value) => { tab.value = tabOf(value) })
watch(tab, (next) => {
  void router.replace({ query: next === 'business' ? {} : { tab: next } })
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
      <button type="button" class="vg-tabs__btn" :class="{ 'is-active': tab === 'products' }" data-testid="shops-tab-products" @click="tab = 'products'">{{ t('shops.tabProducts') }}</button>
      <button v-if="hasLive" type="button" class="vg-tabs__btn" :class="{ 'is-active': tab === 'live' }" data-testid="shops-tab-live" @click="tab = 'live'">{{ t('shops.live.tab') }}</button>
      <button type="button" class="vg-tabs__btn" :class="{ 'is-active': tab === 'accounts' }" data-testid="shops-tab-accounts" @click="tab = 'accounts'">{{ t('shops.tabAccounts') }}</button>
    </nav>

    <template v-if="tab === 'accounts'">
      <ShopAccountsPanel />
      <LiveAccountsSection v-if="hasLive" />
    </template>
    <LiveSessionsPanel v-else-if="tab === 'live'" @accounts="tab = 'accounts'" />
    <div v-else-if="tab === 'products'" class="shops-view__products">
      <div v-if="hasStyles" class="vg-seg vg-seg--sm">
        <button type="button" class="vg-seg__btn" :class="{ 'is-active': productView === 'styles' }" data-testid="product-view-styles" @click="productView = 'styles'">{{ t('shops.sb.byStyle') }}</button>
        <button type="button" class="vg-seg__btn" :class="{ 'is-active': productView === 'links' }" data-testid="product-view-links" @click="productView = 'links'">{{ t('shops.sb.byLink') }}</button>
      </div>
      <StyleBoardPanel v-if="productView === 'styles'" />
      <ProductCardsPanel v-else :shops="(overview?.cards || []).map((card) => ({ shopKey: card.shop.shopKey, name: card.shop.name, region: card.shop.region }))" @sync="syncAll" />
    </div>

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
        <section class="vg-card shops-sum" data-testid="shops-totals">
          <div class="shops-sum__item shops-sum__item--lead">
            <span class="shops-sum__label">{{ t('shops.total.todayGmv') }}</span>
            <strong class="shops-sum__value">{{ money(overview.total.todayGmv, false) }}</strong>
            <small>{{ t('shops.vsYesterday', { value: money(overview.total.yesterdayGmv) }) }}</small>
          </div>
          <div class="shops-sum__item">
            <span class="shops-sum__label">{{ t('shops.total.todayOrders') }}</span>
            <strong class="shops-sum__value">{{ fmtNumber(overview.total.todayOrders, locale) }}</strong>
          </div>
          <div class="shops-sum__item">
            <span class="shops-sum__label">{{ t('shops.total.todayVisitors') }}</span>
            <strong class="shops-sum__value">{{ fmtNumber(overview.total.todayVisitors, locale) }}</strong>
          </div>
          <div class="shops-sum__item">
            <span class="shops-sum__label">{{ t('shops.total.gmv7') }}</span>
            <strong class="shops-sum__value">{{ money(overview.total.gmv7, false) }}</strong>
            <small v-if="change(overview.total.gmv7, overview.total.gmvPrev7) !== undefined" class="shops-chg" :class="trend(overview.total.gmv7, overview.total.gmvPrev7)">
              <ArrowUpRight v-if="trend(overview.total.gmv7, overview.total.gmvPrev7) === 'up'" :size="12" /><ArrowDownRight v-else-if="trend(overview.total.gmv7, overview.total.gmvPrev7) === 'down'" :size="12" />{{ fmtChange(change(overview.total.gmv7, overview.total.gmvPrev7)) }} <span>{{ t('shops.vsPrevPeriod') }}</span>
            </small>
          </div>
        </section>

        <section class="shops-view__grid">
          <button v-for="card in overview.cards" :key="card.shop.shopKey" type="button" class="vg-card shop-biz" :data-testid="`shop-biz-${card.shop.shopKey}`" @click="router.push(`/shops/${encodeURIComponent(card.shop.shopKey)}`)">
            <header class="shop-biz__head">
              <span class="shop-biz__avatar">{{ (card.shop.name || '?').slice(0, 1).toUpperCase() }}</span>
              <span class="shop-biz__name">
                <strong class="vg-ellipsis">{{ card.shop.name }}</strong>
                <small v-if="isSyncing(card.shop.shopKey)" class="shop-biz__fresh is-syncing"><LoaderCircle :size="11" class="vg-spin" />{{ t('shops.syncingShop') }}</small>
                <small v-else class="shop-biz__fresh" :class="{ 'is-stale': freshness(card).stale }" :data-testid="`shop-fresh-${card.shop.shopKey}`"><span class="shop-biz__region">{{ card.shop.region }}</span>{{ freshness(card).text }}</small>
              </span>
              <ChevronRight :size="16" class="shop-biz__chevron" />
            </header>

            <div class="shop-biz__main">
              <div class="shop-biz__headline">
                <span class="shop-biz__label">{{ t('shops.metric.todayGmv') }}</span>
                <strong class="shop-biz__gmv">{{ money(card.today?.gmv, false) }}</strong>
                <span class="shop-biz__vs">{{ t('shops.vsYesterday', { value: money(card.yesterday?.gmv) }) }}</span>
              </div>
              <svg viewBox="0 0 100 32" preserveAspectRatio="none" class="shop-biz__spark" aria-hidden="true">
                <defs><linearGradient :id="`spark-${card.shop.shopKey}`" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--vg-accent)" stop-opacity="0.28" /><stop offset="1" stop-color="var(--vg-accent)" stop-opacity="0" /></linearGradient></defs>
                <path :d="`${sparkPath(card)} L100,32 L0,32 Z`" :fill="`url(#spark-${card.shop.shopKey})`" stroke="none" />
                <path :d="sparkPath(card)" class="shop-biz__spark-line" />
              </svg>
            </div>

            <dl class="shop-biz__facts">
              <div><dt>{{ t('shops.metric.orders') }}</dt><dd>{{ fmtNumber(card.today?.orders, locale) }}</dd></div>
              <div><dt>{{ t('shops.metric.visitors') }}</dt><dd>{{ fmtNumber(card.today?.visitors, locale) }}</dd></div>
              <div><dt>{{ t('shops.metric.conversion') }}</dt><dd>{{ fmtPercent(card.today?.conversion, locale, 2) }}</dd></div>
              <div>
                <dt>{{ t('shops.metric.gmv7') }}</dt>
                <dd>
                  {{ money(card.gmv7) }}
                  <span v-if="change(card.gmv7, card.gmvPrev7) !== undefined" class="shops-chg" :class="trend(card.gmv7, card.gmvPrev7)">{{ fmtChange(change(card.gmv7, card.gmvPrev7)) }}</span>
                </dd>
              </div>
              <div>
                <dt>{{ t('shops.metric.profit7') }}</dt>
                <dd :class="{ 'is-neg': (card.profit7 ?? 0) < 0 }">
                  {{ card.profit7 === undefined ? '—' : money(card.profit7) }}
                  <span v-if="card.margin7 !== undefined" class="shop-biz__margin">{{ fmtPercent(card.margin7, locale, 0) }}</span>
                </dd>
              </div>
            </dl>

            <footer class="shop-biz__foot">
              <span v-for="(item, index) in notes(card).slice(0, 3)" :key="index" class="shop-biz__issue" :class="`is-${item.tone}`" :title="item.title || item.text">
                <i></i><span class="vg-ellipsis">{{ item.text }}</span>
                <span v-if="index === 2 && notes(card).length > 3" class="shop-biz__more" :title="notes(card).slice(3).map((rest) => rest.title || rest.text).join(LINE)">+{{ notes(card).length - 3 }}</span>
              </span>
            </footer>
          </button>
        </section>
        <p class="shops-view__note">{{ t('shops.dataNote') }}</p>
      </template>
      <section v-else-if="loading" class="vg-empty"><LoaderCircle :size="22" class="vg-spin" /></section>
    </template>
    <ShopReportDialog :open="reportOpen" @close="reportOpen = false" />
  </main>
</template>

<style scoped>
.shops-view { display: flex; flex-direction: column; gap: 16px; }
.shops-view__products { display: flex; flex-direction: column; align-items: stretch; gap: 14px; }
.shops-view__products > .vg-seg { align-self: flex-start; }
.shops-view__tabs { overflow-y: hidden; flex-shrink: 0; }
.shops-view__sync { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; }
.shops-view__grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(380px, 1fr)); gap: 16px; }
.shops-view__note { font-size: 11.5px; line-height: 1.6; margin: 0; color: var(--theme-text-muted); }
.shops-view__notice > span { flex: 1; white-space: pre-line; }

.shops-sum { display: grid; grid-template-columns: 1.3fr repeat(3, 1fr); padding: 0; overflow: hidden; }
.shops-sum__item { display: flex; flex-direction: column; gap: 4px; padding: 16px 20px; border-left: 1px solid var(--theme-divider); min-width: 0; }
.shops-sum__item:first-child { border-left: 0; }
.shops-sum__label { font-size: 12px; color: var(--theme-text-muted); }
.shops-sum__value { font-size: 22px; font-weight: 600; line-height: 1.2; font-variant-numeric: tabular-nums; letter-spacing: -0.01em; white-space: nowrap; }
.shops-sum__item--lead .shops-sum__value { font-size: 26px; }
.shops-sum__item small { font-size: 11.5px; color: var(--theme-text-muted); }

.shops-chg { display: inline-flex; align-items: center; gap: 2px; font-size: 11.5px; font-weight: 600; font-variant-numeric: tabular-nums; }
.shops-chg > span { font-weight: 400; color: var(--theme-text-muted); margin-left: 2px; }
.shops-chg.up { color: var(--vg-green, #16a34a) !important; }
.shops-chg.down { color: var(--vg-red) !important; }
.shops-chg.flat { color: var(--theme-text-muted) !important; }

.shop-biz { display: flex; flex-direction: column; align-items: stretch; width: 100%; gap: 16px; padding: 18px 18px 0; text-align: left; font: inherit; color: inherit; cursor: pointer; overflow: hidden; transition: border-color .15s, box-shadow .15s, transform .15s; }
.shop-biz > * { align-self: stretch; }
.shop-biz:hover { border-color: color-mix(in srgb, var(--vg-accent) 45%, var(--theme-border)); box-shadow: 0 6px 24px rgba(0, 0, 0, .18); }
.shop-biz:hover .shop-biz__chevron { color: var(--vg-accent); transform: translateX(2px); }
.shop-biz__head { display: flex; align-items: center; gap: 10px; min-width: 0; }
.shop-biz__avatar { width: 32px; height: 32px; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 13px; font-weight: 700; background: var(--theme-panel-soft); border: 1px solid var(--theme-border); color: var(--theme-text-secondary); }
.shop-biz__name { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.shop-biz__name strong { font-size: 14px; font-weight: 600; }
.shop-biz__chevron { color: var(--theme-text-muted); transition: transform .15s, color .15s; flex-shrink: 0; }
.shop-biz__fresh { display: inline-flex; align-items: center; gap: 6px; font-size: 11.5px; color: var(--theme-text-muted); }
.shop-biz__fresh.is-stale { color: var(--vg-amber); }
.shop-biz__fresh.is-syncing { color: var(--vg-accent); }
.shop-biz__region { padding: 0 5px; border-radius: 4px; border: 1px solid var(--theme-border); font-size: 10px; font-weight: 600; line-height: 15px; color: var(--theme-text-secondary); }
.shop-biz__main { display: grid; grid-template-columns: minmax(0, 1fr) minmax(120px, 42%); align-items: end; gap: 12px; }
.shop-biz__headline { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.shop-biz__label { font-size: 12px; color: var(--theme-text-muted); }
.shop-biz__gmv { font-size: 28px; font-weight: 600; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; line-height: 1.15; white-space: nowrap; }
.shop-biz__vs { font-size: 11.5px; color: var(--theme-text-muted); }
.shop-biz__spark { width: 100%; height: 44px; overflow: visible; }
.shop-biz__spark-line { fill: none; stroke: var(--vg-accent); stroke-width: 1.6; stroke-linejoin: round; vector-effect: non-scaling-stroke; }
.shop-biz__facts { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); margin: 0; padding: 12px 0; border-top: 1px solid var(--theme-divider); }
.shop-biz__facts > div { min-width: 0; padding: 0 10px; border-left: 1px solid var(--theme-divider); }
.shop-biz__facts > div:first-child { padding-left: 0; border-left: 0; }
.shop-biz__facts dt { font-size: 11px; color: var(--theme-text-muted); white-space: nowrap; }
.shop-biz__facts dd { margin: 3px 0 0; display: flex; flex-direction: column; font-size: 13.5px; font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; }
.shop-biz__facts dd.is-neg { color: var(--vg-red); }
.shop-biz__facts .shops-chg, .shop-biz__margin { font-size: 11px; }
.shop-biz__margin { font-weight: 500; color: var(--theme-text-muted); }
.shop-biz__foot { display: flex; flex-direction: column; gap: 6px; margin: 0 -18px; padding: 10px 18px; border-top: 1px solid var(--theme-divider); background: color-mix(in srgb, var(--theme-panel-soft) 60%, transparent); }
.shop-biz__issue { flex: 1; display: flex; align-items: center; gap: 8px; min-width: 0; font-size: 12.5px; color: var(--theme-text-secondary); }
.shop-biz__issue > .vg-ellipsis { flex: 1; min-width: 0; }
.shop-biz__issue i { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; background: var(--vg-green, #16a34a); }
.shop-biz__issue.is-warn i { background: var(--vg-amber); }
.shop-biz__issue.is-danger i { background: var(--vg-red); }
.shop-biz__issue.is-danger { color: var(--theme-text); }
.shop-biz__more { flex-shrink: 0; padding: 1px 7px; border-radius: 10px; border: 1px solid var(--theme-border); font-size: 11px; color: var(--theme-text-muted); }
@media (max-width: 960px) {
  .shops-sum { grid-template-columns: 1fr 1fr; }
  .shops-sum__item:nth-child(3) { border-left: 0; }
  .shops-sum__item:nth-child(n + 3) { border-top: 1px solid var(--theme-divider); }
}
</style>
