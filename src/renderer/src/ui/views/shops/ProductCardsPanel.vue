<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ArrowDown, ArrowDownRight, ArrowUp, ArrowUpRight, ChevronDown, ChevronRight, Copy, ExternalLink, Image as ImageIcon, LoaderCircle, PackageSearch, Search } from 'lucide-vue-next'
import { PC_VERDICTS, type PcOverview, type PcProduct, type PcRates, type PcTotals, type PcVerdict } from '../../../../../shared/productCards'
import { friendlySyncError, freshnessText } from '../../../../../shared/sellerSyncText'
import ShopTrendChart from './ShopTrendChart.vue'
import { change, fmtChange, fmtMoney, fmtNumber, fmtPercent } from './shopFormat'
import { useSyncWatcher } from './useSyncWatcher'

/**
 * 商品分析: product card funnel for every product of every shop, with a verdict per product
 * (test passed / potential / clicks without sales / weak / steady / still testing) and stock.
 */
const props = defineProps<{ shops: Array<{ shopKey: string; name: string; region: string }> }>()
const emit = defineEmits<{ sync: [] }>()
const { t, locale } = useI18n()
const api = window.api.sellerInventory

const days = ref(7)
const shopKey = ref('')
const data = ref<PcOverview | null>(null)
const loading = ref(false)
const errorText = ref('')
const verdictFilter = ref<PcVerdict | 'restock' | 'new' | ''>('')
const query = ref('')
const expanded = ref<string | null>(null)
const limit = ref(50)
const copied = ref('')

type SortKey = 'gmv' | 'viewers' | 'ctr' | 'cartRate' | 'clickToPay' | 'buyers' | 'viewersChange' | 'daysLeft'
const sortKey = ref<SortKey>('gmv')
const sortDesc = ref(true)

type KpiKey = 'viewers' | 'clickUsers' | 'ctr' | 'cartUsers' | 'cartRate' | 'buyers' | 'clickToPay' | 'gmv'
const KPIS: KpiKey[] = ['viewers', 'clickUsers', 'ctr', 'cartUsers', 'cartRate', 'buyers', 'clickToPay', 'gmv']
const RATE_KPIS = new Set<KpiKey>(['ctr', 'cartRate', 'clickToPay'])
const metric = ref<KpiKey>('gmv')

const region = computed(() => (shopKey.value ? props.shops.find((shop) => shop.shopKey === shopKey.value)?.region : props.shops[0]?.region))
const multiShop = computed(() => !shopKey.value && props.shops.length > 1)

const { syncing, markLoaded } = useSyncWatcher({ refresh: () => load() })

async function load() {
  loading.value = true
  try {
    data.value = await api.getProductCards({ days: days.value, shopKey: shopKey.value || undefined })
    errorText.value = ''
    void markLoaded()
  } catch (error) {
    errorText.value = friendlySyncError(error, locale.value)
  } finally {
    loading.value = false
  }
}

watch([days, shopKey], () => { limit.value = 50; void load() }, { immediate: true })

function money(value: number | undefined, compact = true) {
  return fmtMoney(value, locale.value, region.value, compact)
}

function kpiValue(key: KpiKey, totals: PcTotals, rates: PcRates) {
  return RATE_KPIS.has(key) ? rates[key as keyof PcRates] : totals[key as keyof PcTotals]
}

function fmtKpi(key: KpiKey, value: number | undefined, compact = true) {
  if (RATE_KPIS.has(key)) return fmtPercent(value, locale.value, 2)
  if (key === 'gmv') return money(value, compact)
  return compact && (value || 0) >= 10_000 ? new Intl.NumberFormat(locale.value, { notation: 'compact', maximumFractionDigits: 1 }).format(value || 0) : fmtNumber(value, locale.value)
}

/** Counts change by percent; rates change by percentage points. */
function kpiDelta(key: KpiKey) {
  if (!data.value) return undefined
  const now = kpiValue(key, data.value.totals, data.value.rates)
  const before = kpiValue(key, data.value.prevTotals, data.value.prevRates)
  if (now === undefined || before === undefined) return undefined
  if (RATE_KPIS.has(key)) {
    const points = (now - before) * 100
    return { dir: Math.abs(points) < 0.005 ? 'flat' : points > 0 ? 'up' : 'down', text: `${points > 0 ? '+' : ''}${points.toFixed(2)}pp` }
  }
  const value = change(now, before)
  if (value === undefined) return undefined
  return { dir: Math.abs(value) < 0.0005 ? 'flat' : value > 0 ? 'up' : 'down', text: fmtChange(value) }
}

const trendPoints = computed(() => (data.value?.daily || []).map((day) => {
  const totals = { views: 0, clicks: 0, cartAdds: 0, skuOrders: 0, ...day } as PcTotals
  const rates: PcRates = { ctr: day.viewers ? day.clickUsers / day.viewers : 0, cartRate: day.clickUsers ? day.cartUsers / day.clickUsers : 0, clickToPay: day.clickUsers ? day.buyers / day.clickUsers : 0 }
  return { date: day.date, value: kpiValue(metric.value, totals, rates) || 0 }
}))

const funnel = computed(() => {
  const totals = data.value?.totals
  if (!totals) return []
  return [
    { key: 'viewers', value: totals.viewers, rate: undefined as number | undefined, rateKey: '' },
    { key: 'clickUsers', value: totals.clickUsers, rate: data.value?.rates.ctr, rateKey: 'ctr' },
    { key: 'cartUsers', value: totals.cartUsers, rate: data.value?.rates.cartRate, rateKey: 'cartRate' },
    { key: 'buyers', value: totals.buyers, rate: data.value?.rates.cartToPay, rateKey: 'cartToPay' },
  ]
})
const funnelMax = computed(() => Math.max(1, ...funnel.value.map((step) => step.value)))

const VERDICT_TONE: Record<PcVerdict, string> = { winner: 'green', potential: 'blue', leaky: 'amber', weak: 'red', steady: 'gray', testing: 'violet' }

const visible = computed(() => {
  const words = query.value.trim().toLowerCase()
  let list = data.value?.products || []
  if (verdictFilter.value === 'restock') list = list.filter((item) => (item.verdict === 'winner' || item.verdict === 'potential') && (item.restock === 'urgent' || item.restock === 'soon'))
  else if (verdictFilter.value === 'new') list = list.filter((item) => item.isNew)
  else if (verdictFilter.value) list = list.filter((item) => item.verdict === verdictFilter.value)
  if (words) list = list.filter((item) => item.name.toLowerCase().includes(words) || item.productId.includes(words) || item.codes.some((code) => code.toLowerCase().includes(words)))
  const value = (item: PcProduct): number | undefined => {
    switch (sortKey.value) {
      case 'gmv': return item.totals.gmv
      case 'viewers': return item.totals.viewers
      case 'buyers': return item.totals.buyers
      case 'viewersChange': return item.viewersChange
      case 'daysLeft': return item.daysLeft
      default: return item.rates[sortKey.value]
    }
  }
  const direction = sortDesc.value ? -1 : 1
  return [...list].sort((a, b) => {
    const left = value(a)
    const right = value(b)
    if (left === undefined && right === undefined) return 0
    if (left === undefined) return 1
    if (right === undefined) return -1
    return (left - right) * direction
  })
})

function sortBy(key: SortKey) {
  if (sortKey.value === key) sortDesc.value = !sortDesc.value
  else {
    sortKey.value = key
    // Days left reads best shortest first; everything else biggest first.
    sortDesc.value = key !== 'daysLeft'
  }
}

function pickFilter(value: PcVerdict | 'restock' | 'new') {
  verdictFilter.value = verdictFilter.value === value ? '' : value
  limit.value = 50
}

function indexClass(index: number | undefined) {
  if (index === undefined) return ''
  return index >= 1.15 ? 'is-good' : index < 0.75 ? 'is-bad' : ''
}

function spark(item: PcProduct) {
  const values = item.daily.map((day) => day.viewers)
  const max = Math.max(1, ...values)
  const step = values.length > 1 ? 100 / (values.length - 1) : 0
  return values.map((value, index) => `${index ? 'L' : 'M'}${(index * step).toFixed(1)},${(22 - (value / max) * 20).toFixed(1)}`).join(' ')
}

function restockText(item: PcProduct) {
  if (!item.codes.length) return t('shops.pc.restock.unlinked')
  if (item.restock === 'unknown') return t('shops.pc.restock.unknown')
  const daysText = item.daysLeft !== undefined ? t('shops.pc.daysLeft', { n: Math.max(0, Math.floor(item.daysLeft)) }) : ''
  return [t(`shops.pc.restock.${item.restock}`), daysText].filter(Boolean).join(' · ')
}

function advice(item: PcProduct) {
  const restock = (item.verdict === 'winner' || item.verdict === 'potential') && (item.restock === 'urgent' || item.restock === 'soon')
  const base = t(`shops.pc.advice.${item.verdict}`)
  return restock ? `${t('shops.pc.advice.restock', { qty: fmtNumber(item.suggestQty, locale.value) })} ${base}` : base
}

/** Why the verdict, in numbers against the shop average. */
function evidence(item: PcProduct) {
  const parts: string[] = []
  if (item.ctrIndex !== undefined) parts.push(t('shops.pc.evidence.ctr', { value: fmtPercent(item.rates.ctr, locale.value, 2), index: item.ctrIndex.toFixed(2) }))
  if (item.clickToPayIndex !== undefined) parts.push(t('shops.pc.evidence.pay', { value: fmtPercent(item.rates.clickToPay, locale.value, 2), index: item.clickToPayIndex.toFixed(2) }))
  parts.push(t('shops.pc.evidence.volume', { viewers: fmtNumber(item.totals.viewers, locale.value), buyers: fmtNumber(item.totals.buyers, locale.value) }))
  return parts.join(' · ')
}

function detailFunnel(item: PcProduct) {
  const totals = item.totals
  return [
    { key: 'viewers', value: totals.viewers, sub: t('shops.pc.views', { n: fmtNumber(totals.views, locale.value) }) },
    { key: 'clickUsers', value: totals.clickUsers, sub: fmtPercent(item.rates.ctr, locale.value, 2) },
    { key: 'cartUsers', value: totals.cartUsers, sub: fmtPercent(item.rates.cartRate, locale.value, 2) },
    { key: 'buyers', value: totals.buyers, sub: fmtPercent(item.rates.cartToPay, locale.value, 1) },
  ]
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    copied.value = text
    setTimeout(() => { if (copied.value === text) copied.value = '' }, 1500)
  } catch {
    // Clipboard can be unavailable; the ID stays visible to copy by hand.
  }
}

const rangeText = computed(() => (data.value ? `${data.value.start.slice(5).replace('-', '/')} – ${data.value.end.slice(5).replace('-', '/')}` : ''))
</script>

<template>
  <div class="pc" data-testid="product-cards">
    <div class="pc-toolbar">
      <div class="vg-seg vg-seg--sm">
        <button v-for="n in [7, 14, 30]" :key="n" type="button" class="vg-seg__btn" :class="{ 'is-active': days === n }" @click="days = n">{{ t('sellerInv.days', { n }) }}</button>
      </div>
      <select v-if="shops.length > 1" v-model="shopKey" class="vg-select vg-select--sm pc-toolbar__shop">
        <option value="">{{ t('shops.pc.allShops') }}</option>
        <option v-for="shop in shops" :key="shop.shopKey" :value="shop.shopKey">{{ shop.name }}</option>
      </select>
      <span v-if="data && !data.empty" class="pc-toolbar__range">{{ t('shops.pc.range', { range: rangeText }) }}<template v-if="data.lastFetchedAt"> · {{ freshnessText(data.lastFetchedAt, Date.now(), locale).text }}</template></span>
      <LoaderCircle v-if="loading" :size="15" class="vg-spin vg-muted" />
    </div>

    <div v-if="errorText" class="vg-notice vg-notice--danger"><span>{{ errorText }}</span></div>

    <section v-if="data && data.empty" class="vg-card vg-empty" data-testid="product-cards-empty">
      <span class="vg-empty__icon"><PackageSearch :size="26" /></span>
      <h3>{{ t('shops.pc.emptyTitle') }}</h3>
      <p>{{ t('shops.pc.emptyDesc') }}</p>
      <button type="button" class="vg-btn vg-btn--primary" :disabled="syncing" @click="emit('sync')"><LoaderCircle v-if="syncing" :size="14" class="vg-spin" />{{ syncing ? t('shops.pc.syncing') : t('shops.syncAll') }}</button>
    </section>

    <template v-else-if="data">
      <!-- Verdicts first: the answer, then the numbers behind it. -->
      <section class="vg-card pc-verdicts" data-testid="product-cards-verdicts">
        <header class="pc-head">
          <div>
            <h2 class="vg-section-title">{{ t('shops.pc.verdictTitle') }}</h2>
            <p class="pc-hint">{{ t('shops.pc.verdictHint') }}</p>
          </div>
          <div class="pc-callouts">
            <button type="button" class="pc-callout pc-callout--restock" :class="{ 'is-active': verdictFilter === 'restock' }" :disabled="!data.restockCount" @click="pickFilter('restock')">
              <strong>{{ data.restockCount }}</strong><span>{{ t('shops.pc.restockCallout') }}</span>
            </button>
            <button type="button" class="pc-callout" :class="{ 'is-active': verdictFilter === 'new' }" :disabled="!data.newCount" @click="pickFilter('new')">
              <strong>{{ data.newCount }}</strong><span>{{ t('shops.pc.newCallout') }}</span>
            </button>
          </div>
        </header>
        <div class="pc-verdict-grid">
          <button
            v-for="verdict in PC_VERDICTS"
            :key="verdict"
            type="button"
            class="pc-verdict"
            :class="[`tone-${VERDICT_TONE[verdict]}`, { 'is-active': verdictFilter === verdict }]"
            :data-testid="`pc-verdict-${verdict}`"
            @click="pickFilter(verdict)"
          >
            <span class="pc-verdict__top"><i></i>{{ t(`shops.pc.verdict.${verdict}`) }}</span>
            <strong>{{ data.counts[verdict] }}</strong>
            <small>{{ t(`shops.pc.verdictDesc.${verdict}`) }}</small>
          </button>
        </div>
      </section>

      <section class="vg-card pc-perf">
        <header class="pc-head">
          <div>
            <h2 class="vg-section-title">{{ t('shops.pc.overviewTitle') }}</h2>
            <p class="pc-hint">{{ t('shops.pc.overviewHint', { n: data.days }) }}</p>
          </div>
        </header>
        <div class="pc-kpis">
          <button v-for="key in KPIS" :key="key" type="button" class="pc-kpi" :class="{ 'is-active': metric === key }" @click="metric = key">
            <span class="pc-kpi__label">{{ t(`shops.pc.metric.${key}`) }}</span>
            <strong class="pc-kpi__value">{{ fmtKpi(key, kpiValue(key, data.totals, data.rates)) }}</strong>
            <small v-if="kpiDelta(key)" class="pc-chg" :class="kpiDelta(key)?.dir">
              <ArrowUpRight v-if="kpiDelta(key)?.dir === 'up'" :size="11" /><ArrowDownRight v-else-if="kpiDelta(key)?.dir === 'down'" :size="11" />{{ kpiDelta(key)?.text }}
            </small>
            <small v-else class="pc-chg flat">—</small>
          </button>
        </div>
        <div class="pc-two">
          <div class="pc-funnel">
            <h3 class="pc-sub">{{ t('shops.pc.funnelTitle') }}</h3>
            <div v-for="step in funnel" :key="step.key" class="pc-funnel__step">
              <div class="pc-funnel__label"><span>{{ t(`shops.pc.metric.${step.key}`) }}</span><strong>{{ fmtNumber(step.value, locale) }}</strong></div>
              <div class="pc-funnel__bar"><span :style="{ width: `${Math.max(1.5, (step.value / funnelMax) * 100)}%` }"></span></div>
              <small v-if="step.rate !== undefined">{{ t(`shops.pc.stepRate.${step.rateKey}`, { value: fmtPercent(step.rate, locale, 2) }) }}</small>
            </div>
            <p class="pc-funnel__total">{{ t('shops.pc.viewToPay', { value: fmtPercent(data.rates.viewToPay, locale, 3) }) }} · GPM {{ money(data.rates.gpm) }}</p>
          </div>
          <div class="pc-trend">
            <h3 class="pc-sub">{{ t('shops.pc.trendTitle', { metric: t(`shops.pc.metric.${metric}`) }) }}</h3>
            <ShopTrendChart :points="trendPoints" :format="(v: number) => fmtKpi(metric, v, false)" :height="210" />
          </div>
        </div>
      </section>

      <section class="vg-card vg-card--flush pc-list" data-testid="product-cards-table">
        <div class="vg-card__head pc-list__head">
          <h2 class="vg-card__title">{{ t('shops.pc.listTitle') }}</h2>
          <span class="vg-muted pc-list__count">{{ t('shops.pc.count', { n: visible.length }) }}</span>
          <button v-if="verdictFilter" type="button" class="vg-chip pc-list__filter" @click="verdictFilter = ''">
            {{ verdictFilter === 'restock' ? t('shops.pc.restockCallout') : verdictFilter === 'new' ? t('shops.pc.newCallout') : t(`shops.pc.verdict.${verdictFilter}`) }} ×
          </button>
          <label class="vg-search pc-list__search">
            <Search :size="14" />
            <input v-model="query" class="vg-input vg-input--sm" :placeholder="t('shops.pc.searchPlaceholder')" />
          </label>
        </div>
        <div class="vg-table-wrap pc-table-wrap">
          <table class="vg-table vg-table--compact pc-table">
            <thead>
              <tr>
                <th class="pc-col-product">{{ t('shops.pc.col.product') }}</th>
                <th>{{ t('shops.pc.col.verdict') }}</th>
                <th v-for="col in (['viewers', 'ctr', 'cartRate', 'clickToPay', 'buyers', 'gmv'] as SortKey[])" :key="col" class="num is-sortable" @click="sortBy(col)">
                  <span class="pc-th">{{ t(`shops.pc.col.${col}`) }}<ArrowDown v-if="sortKey === col && sortDesc" :size="11" /><ArrowUp v-else-if="sortKey === col" :size="11" /></span>
                </th>
                <th>{{ t('shops.pc.col.trend') }}</th>
                <th class="is-sortable" @click="sortBy('daysLeft')">
                  <span class="pc-th">{{ t('shops.pc.col.stock') }}<ArrowDown v-if="sortKey === 'daysLeft' && sortDesc" :size="11" /><ArrowUp v-else-if="sortKey === 'daysLeft'" :size="11" /></span>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!visible.length"><td colspan="10" class="vg-table__empty">{{ t('shops.pc.noMatch') }}</td></tr>
              <template v-for="item in visible.slice(0, limit)" :key="item.key">
                <tr class="pc-row" :class="{ 'is-open': expanded === item.key }" @click="expanded = expanded === item.key ? null : item.key">
                  <td class="pc-col-product">
                    <div class="pc-product">
                      <component :is="expanded === item.key ? ChevronDown : ChevronRight" :size="14" class="pc-product__caret" />
                      <span class="vg-thumb pc-product__thumb"><img v-if="item.image" :src="item.image" alt="" loading="lazy" /><ImageIcon v-else :size="14" /></span>
                      <span class="pc-product__text">
                        <strong class="vg-ellipsis" :title="item.name">{{ item.name }}</strong>
                        <span class="pc-product__meta">
                          <button type="button" class="pc-id" :title="t('shops.pc.copyId')" @click.stop="copy(item.productId)">ID {{ item.productId }}<Copy :size="10" /></button>
                          <span v-if="copied === item.productId" class="pc-copied">{{ t('shops.pc.copied') }}</span>
                          <span v-for="code in item.codes.slice(0, 3)" :key="code" class="pc-code">{{ code }}</span>
                          <span v-if="item.codes.length > 3" class="pc-code">+{{ item.codes.length - 3 }}</span>
                          <span v-if="item.isNew" class="pc-new">NEW</span>
                          <span v-if="multiShop" class="vg-muted">{{ item.shopName }}</span>
                        </span>
                      </span>
                    </div>
                  </td>
                  <td><span class="pc-tag" :class="`tone-${VERDICT_TONE[item.verdict]}`">{{ t(`shops.pc.verdict.${item.verdict}`) }}</span></td>
                  <td class="num">
                    {{ fmtNumber(item.totals.viewers, locale) }}
                    <small v-if="item.viewersChange !== undefined" class="pc-chg" :class="item.viewersChange >= 0 ? 'up' : 'down'">{{ fmtChange(item.viewersChange) }}</small>
                  </td>
                  <td class="num"><span :class="indexClass(item.ctrIndex)">{{ fmtPercent(item.rates.ctr, locale, 2) }}</span></td>
                  <td class="num">{{ fmtPercent(item.rates.cartRate, locale, 2) }}</td>
                  <td class="num"><span :class="indexClass(item.clickToPayIndex)">{{ fmtPercent(item.rates.clickToPay, locale, 2) }}</span></td>
                  <td class="num">{{ fmtNumber(item.totals.buyers, locale) }}</td>
                  <td class="num">
                    <strong>{{ money(item.totals.gmv) }}</strong>
                    <small v-if="item.gmvChange !== undefined" class="pc-chg" :class="item.gmvChange >= 0 ? 'up' : 'down'">{{ fmtChange(item.gmvChange) }}</small>
                  </td>
                  <td><svg viewBox="0 0 100 24" preserveAspectRatio="none" class="pc-spark"><path :d="spark(item)" vector-effect="non-scaling-stroke" /></svg></td>
                  <td><span class="pc-stock" :class="`is-${item.codes.length ? item.restock : 'unknown'}`"><i></i>{{ restockText(item) }}</span></td>
                </tr>
                <tr v-if="expanded === item.key" class="pc-detail-row">
                  <td colspan="10">
                    <div class="pc-detail">
                      <div class="pc-detail__side">
                        <p class="pc-advice" :class="`tone-${VERDICT_TONE[item.verdict]}`"><strong>{{ t(`shops.pc.verdict.${item.verdict}`) }}</strong>{{ advice(item) }}</p>
                        <p class="pc-evidence">{{ evidence(item) }}</p>
                        <div class="pc-detail__funnel">
                          <div v-for="step in detailFunnel(item)" :key="step.key">
                            <span>{{ t(`shops.pc.metric.${step.key}`) }}</span>
                            <strong>{{ fmtNumber(step.value, locale) }}</strong>
                            <small>{{ step.sub }}</small>
                          </div>
                        </div>
                        <dl class="pc-detail__facts">
                          <div><dt>{{ t('shops.pc.fact.orders') }}</dt><dd>{{ fmtNumber(item.totals.skuOrders, locale) }}</dd></div>
                          <div><dt>{{ t('shops.pc.fact.cartToPay') }}</dt><dd>{{ fmtPercent(item.rates.cartToPay, locale, 1) }}</dd></div>
                          <div><dt>GPM</dt><dd>{{ money(item.rates.gpm) }}</dd></div>
                          <div><dt>{{ t('shops.pc.fact.stock') }}</dt><dd>{{ item.stock === undefined ? '—' : fmtNumber(item.stock, locale) }}</dd></div>
                          <div v-if="item.suggestQty"><dt>{{ t('shops.pc.fact.suggest') }}</dt><dd>{{ fmtNumber(item.suggestQty, locale) }}</dd></div>
                          <div v-if="item.firstSeen"><dt>{{ t('shops.pc.fact.firstSeen') }}</dt><dd>{{ item.firstSeen }}</dd></div>
                        </dl>
                        <button type="button" class="vg-btn vg-btn--sm" @click.stop="api.openSellerCenter(item.shopKey, '/compass/single-product-card')"><ExternalLink :size="13" />{{ t('shops.pc.openSeller') }}</button>
                      </div>
                      <div class="pc-detail__chart">
                        <h3 class="pc-sub">{{ t('shops.pc.dailyTitle') }}</h3>
                        <ShopTrendChart :points="item.daily.map((day) => ({ date: day.date, value: day.gmv }))" :format="(v: number) => money(v, false)" :height="150" />
                        <table class="pc-daily">
                          <thead><tr><th>{{ t('shops.pc.col.date') }}</th><th class="num">{{ t('shops.pc.metric.viewers') }}</th><th class="num">{{ t('shops.pc.metric.ctr') }}</th><th class="num">{{ t('shops.pc.metric.cartUsers') }}</th><th class="num">{{ t('shops.pc.metric.buyers') }}</th><th class="num">{{ t('shops.pc.metric.gmv') }}</th></tr></thead>
                          <tbody>
                            <tr v-for="day in [...item.daily].reverse()" :key="day.date">
                              <td>{{ day.date.slice(5).replace('-', '/') }}</td>
                              <td class="num">{{ fmtNumber(day.viewers, locale) }}</td>
                              <td class="num">{{ day.viewers ? fmtPercent(day.clickUsers / day.viewers, locale, 2) : '—' }}</td>
                              <td class="num">{{ fmtNumber(day.cartUsers, locale) }}</td>
                              <td class="num">{{ fmtNumber(day.buyers, locale) }}</td>
                              <td class="num">{{ money(day.gmv) }}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
        <div v-if="visible.length > limit" class="pc-more"><button type="button" class="vg-btn vg-btn--sm" @click="limit += 50">{{ t('shops.pc.showMore', { n: visible.length - limit }) }}</button></div>
      </section>
      <p class="pc-note">{{ t('shops.pc.note') }}</p>
    </template>

    <section v-else-if="loading" class="vg-empty"><LoaderCircle :size="22" class="vg-spin" /></section>
  </div>
</template>

<style scoped>
.pc { display: flex; flex-direction: column; gap: 16px; }
.pc .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.pc-toolbar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.pc-toolbar__shop { width: auto; min-width: 160px; }
.pc-toolbar__range { font-size: 12px; color: var(--theme-text-muted); }

.pc-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.pc-hint { margin: 3px 0 0; font-size: 12px; color: var(--theme-text-muted); line-height: 1.5; }
.pc-sub { margin: 0 0 10px; font-size: 13px; font-weight: 600; color: var(--theme-text-secondary); }

/* tones */
.tone-green { --tone: var(--vg-green, #16a34a); }
.tone-blue { --tone: #3b82f6; }
.tone-amber { --tone: var(--vg-amber, #d97706); }
.tone-red { --tone: var(--vg-red, #dc2626); }
.tone-gray { --tone: var(--theme-text-muted); }
.tone-violet { --tone: #8b5cf6; }

.pc-verdicts { display: flex; flex-direction: column; gap: 14px; }
.pc-callouts { display: flex; gap: 8px; }
.pc-callout { display: inline-flex; align-items: baseline; gap: 6px; padding: 7px 12px; border: 1px solid var(--theme-border); border-radius: 8px; background: transparent; color: inherit; font: inherit; font-size: 12.5px; cursor: pointer; transition: background .15s, border-color .15s; }
.pc-callout strong { font-size: 17px; font-variant-numeric: tabular-nums; }
.pc-callout--restock strong { color: var(--vg-red); }
.pc-callout:hover:not(:disabled), .pc-callout.is-active { border-color: var(--vg-accent); background: color-mix(in srgb, var(--vg-accent) 8%, transparent); }
.pc-callout:disabled { opacity: .55; cursor: default; }
.pc-verdict-grid { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 10px; }
.pc-verdict { position: relative; display: flex; flex-direction: column; gap: 4px; padding: 12px 14px 12px 16px; border: 1px solid var(--theme-border); border-radius: 10px; background: color-mix(in srgb, var(--tone) 5%, transparent); color: inherit; font: inherit; text-align: left; cursor: pointer; overflow: hidden; min-width: 0; transition: border-color .15s, background .15s; }
.pc-verdict::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 3px; background: var(--tone); }
.pc-verdict:hover { border-color: color-mix(in srgb, var(--tone) 60%, transparent); }
.pc-verdict.is-active { border-color: var(--tone); background: color-mix(in srgb, var(--tone) 13%, transparent); }
.pc-verdict__top { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 600; color: var(--theme-text-secondary); white-space: nowrap; }
.pc-verdict__top i { width: 7px; height: 7px; border-radius: 50%; background: var(--tone); }
.pc-verdict strong { font-size: 26px; font-weight: 650; line-height: 1.15; font-variant-numeric: tabular-nums; }
.pc-verdict small { font-size: 11.5px; line-height: 1.45; color: var(--theme-text-muted); }

.pc-perf { display: flex; flex-direction: column; gap: 14px; }
.pc-kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); border: 1px solid var(--theme-border); border-radius: 10px; overflow: hidden; }
.pc-kpi { position: relative; display: flex; flex-direction: column; gap: 3px; padding: 12px 14px; border: 0; border-left: 1px solid var(--theme-divider); border-top: 1px solid var(--theme-divider); background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer; min-width: 0; transition: background .15s; }
.pc-kpi:nth-child(4n + 1) { border-left: 0; }
.pc-kpi:nth-child(-n + 4) { border-top: 0; }
.pc-kpi:hover { background: var(--theme-panel-soft); }
.pc-kpi.is-active { background: color-mix(in srgb, var(--vg-accent) 9%, transparent); }
.pc-kpi.is-active::after { content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 2px; background: var(--vg-accent); }
.pc-kpi__label { font-size: 12px; color: var(--theme-text-muted); white-space: nowrap; }
.pc-kpi.is-active .pc-kpi__label { color: var(--vg-accent); }
.pc-kpi__value { font-size: 20px; font-weight: 600; line-height: 1.25; font-variant-numeric: tabular-nums; white-space: nowrap; }
.pc-chg { display: inline-flex; align-items: center; gap: 2px; font-size: 11.5px; font-weight: 600; font-variant-numeric: tabular-nums; }
.pc-chg.up { color: var(--vg-green, #16a34a); }
.pc-chg.down { color: var(--vg-red); }
.pc-chg.flat { color: var(--theme-text-muted); font-weight: 500; }
td .pc-chg { display: block; font-size: 10.5px; }

.pc-two { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 3fr); gap: 24px; }
.pc-funnel__step { display: flex; flex-direction: column; gap: 5px; padding: 8px 0; border-top: 1px solid var(--theme-divider); }
.pc-funnel__step:first-of-type { border-top: 0; padding-top: 0; }
.pc-funnel__label { display: flex; align-items: baseline; gap: 10px; font-size: 13px; }
.pc-funnel__label span { flex: 1; color: var(--theme-text-secondary); }
.pc-funnel__label strong { font-size: 15px; font-weight: 600; font-variant-numeric: tabular-nums; }
.pc-funnel__bar { height: 8px; border-radius: 4px; background: var(--theme-panel-soft); overflow: hidden; }
.pc-funnel__bar span { display: block; height: 100%; border-radius: 4px; background: linear-gradient(90deg, color-mix(in srgb, var(--vg-accent) 60%, transparent), var(--vg-accent)); }
.pc-funnel__step small { font-size: 11.5px; color: var(--theme-text-muted); }
.pc-funnel__total { margin: 8px 0 0; font-size: 12px; color: var(--theme-text-secondary); }

.pc-list__head { gap: 10px; flex-wrap: wrap; }
.pc-list__count { font-size: 12px; }
.pc-list__filter { cursor: pointer; }
.pc-list__search { margin-left: auto; min-width: 220px; }
.pc-table-wrap { border: 0; border-radius: 0; max-height: 680px; }
.pc-table th.is-sortable { cursor: pointer; user-select: none; white-space: nowrap; }
.pc-table th.is-sortable:hover { color: var(--vg-accent); }
.pc-th { display: inline-flex; align-items: center; gap: 2px; white-space: nowrap; }
.pc-col-product { min-width: 320px; max-width: 420px; }
.pc-row { cursor: pointer; }
.pc-row.is-open td { background: color-mix(in srgb, var(--vg-accent) 6%, transparent); }
.pc-product { display: flex; align-items: center; gap: 8px; min-width: 0; }
.pc-product__caret { flex-shrink: 0; color: var(--theme-text-muted); }
.pc-product__thumb { width: 40px; height: 40px; flex-shrink: 0; overflow: hidden; display: inline-flex; align-items: center; justify-content: center; border-radius: 6px; }
.pc-product__thumb img { width: 100%; height: 100%; object-fit: cover; }
.pc-product__text { display: flex; flex-direction: column; gap: 3px; min-width: 0; flex: 1; }
.pc-product__text strong { font-size: 12.5px; font-weight: 600; max-width: 360px; }
.pc-product__meta { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; font-size: 11px; }
.pc-id { display: inline-flex; align-items: center; gap: 3px; padding: 0; border: 0; background: none; color: var(--theme-text-muted); font: inherit; font-variant-numeric: tabular-nums; cursor: copy; }
.pc-id:hover { color: var(--vg-accent); }
.pc-copied { color: var(--vg-green, #16a34a); }
.pc-code { padding: 0 5px; border-radius: 4px; background: var(--theme-panel-soft); border: 1px solid var(--theme-divider); font-weight: 600; color: var(--theme-text-secondary); line-height: 16px; }
.pc-new { padding: 0 5px; border-radius: 4px; background: color-mix(in srgb, #8b5cf6 16%, transparent); color: #8b5cf6; font-weight: 700; font-size: 10px; line-height: 16px; }
.pc-tag { display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 999px; font-size: 11.5px; font-weight: 600; white-space: nowrap; color: var(--tone); background: color-mix(in srgb, var(--tone) 13%, transparent); }
.is-good { color: var(--vg-green, #16a34a); font-weight: 600; }
.is-bad { color: var(--vg-red); }
.pc-spark { width: 84px; height: 24px; display: block; overflow: visible; }
.pc-spark path { fill: none; stroke: var(--vg-accent); stroke-width: 1.5; }
.pc-stock { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; white-space: nowrap; color: var(--theme-text-secondary); }
.pc-stock i { width: 6px; height: 6px; border-radius: 50%; background: var(--theme-text-muted); flex-shrink: 0; }
.pc-stock.is-urgent { color: var(--theme-text); font-weight: 600; }
.pc-stock.is-urgent i { background: var(--vg-red); }
.pc-stock.is-soon i { background: var(--vg-amber); }
.pc-stock.is-ok i { background: var(--vg-green, #16a34a); }
.pc-stock.is-unknown { color: var(--theme-text-muted); }

.pc-detail-row > td { padding: 0 !important; background: var(--theme-panel-soft); }
.pc-detail { display: grid; grid-template-columns: minmax(280px, 2fr) minmax(0, 3fr); gap: 24px; padding: 16px 20px 18px 46px; white-space: normal; }
.pc-detail__side { display: flex; flex-direction: column; gap: 12px; align-items: flex-start; }
.pc-advice { margin: 0; padding: 10px 12px; border-radius: 8px; border-left: 3px solid var(--tone); background: color-mix(in srgb, var(--tone) 9%, var(--theme-panel)); font-size: 13px; line-height: 1.6; }
.pc-advice strong { margin-right: 8px; color: var(--tone); }
.pc-evidence { margin: 0; font-size: 12px; color: var(--theme-text-muted); line-height: 1.6; }
.pc-detail__funnel { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); width: 100%; border: 1px solid var(--theme-border); border-radius: 8px; background: var(--theme-panel); }
.pc-detail__funnel > div { display: flex; flex-direction: column; gap: 2px; padding: 8px 10px; border-left: 1px solid var(--theme-divider); min-width: 0; }
.pc-detail__funnel > div:first-child { border-left: 0; }
.pc-detail__funnel span { font-size: 11px; color: var(--theme-text-muted); white-space: nowrap; }
.pc-detail__funnel strong { font-size: 16px; font-variant-numeric: tabular-nums; }
.pc-detail__funnel small { font-size: 11px; color: var(--vg-accent); font-variant-numeric: tabular-nums; }
.pc-detail__facts { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px 16px; width: 100%; margin: 0; }
.pc-detail__facts dt { font-size: 11px; color: var(--theme-text-muted); }
.pc-detail__facts dd { margin: 2px 0 0; font-size: 13px; font-weight: 600; font-variant-numeric: tabular-nums; }
.pc-daily { width: 100%; margin-top: 10px; border-collapse: collapse; font-size: 12px; }
.pc-daily th { font-weight: 500; color: var(--theme-text-muted); text-align: left; padding: 4px 6px; border-bottom: 1px solid var(--theme-divider); }
.pc-daily td { padding: 4px 6px; border-bottom: 1px solid var(--theme-divider); }
.pc-daily th.num, .pc-daily td.num { text-align: right; }
.pc-more { display: flex; justify-content: center; padding: 10px; border-top: 1px solid var(--theme-divider); }
.pc-note { margin: -4px 2px 0; font-size: 11.5px; color: var(--theme-text-muted); line-height: 1.6; }

@media (max-width: 1280px) {
  .pc-verdict-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
@media (max-width: 960px) {
  .pc-two, .pc-detail { grid-template-columns: 1fr; }
  .pc-detail { padding-left: 16px; }
  .pc-kpis { grid-template-columns: repeat(2, 1fr); }
  .pc-kpi:nth-child(4n + 1) { border-left: 1px solid var(--theme-divider); }
  .pc-kpi:nth-child(2n + 1) { border-left: 0; }
  .pc-kpi:nth-child(3), .pc-kpi:nth-child(4) { border-top: 1px solid var(--theme-divider); }
  .pc-verdict-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .pc-list__search { margin-left: 0; width: 100%; }
}
</style>
