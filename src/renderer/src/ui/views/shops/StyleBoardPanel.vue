<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { AlertTriangle, ArrowDown, ArrowUp, Clapperboard, FileImage, LoaderCircle, PackageSearch, Radio, RefreshCcw, Search, ShoppingCart, Store, Tag, TrendingDown, Truck } from 'lucide-vue-next'
import { STYLE_ACTIONS, type StyleAction, type StyleActionKind, type StyleBoard, type StyleRow } from '../../../../../shared/styleBoard'
import { formatMoney } from '../product-research/productResearchUtils'
import { fmtNumber, fmtPercent } from './shopFormat'
import StyleBoardDrawer from './StyleBoardDrawer.vue'

/** 商品分析 → 按款号：店铺、商品卡、直播、广告合在一起，先告诉你每个款该做什么。 */
const { t, locale } = useI18n()
const PAGE = 30
const data = ref<StyleBoard | null>(null)
const loading = ref(false)
const error = ref('')
const filter = ref<StyleActionKind | 'all' | ''>('all')
const query = ref('')
const shown = ref(PAGE)
const opened = ref<StyleRow | null>(null)

type SortKey = 'amount30' | 'units30' | 'cardCart' | 'cardPay' | 'liveGmv' | 'liveCart' | 'liveCvr' | 'adsSpend' | 'adsRoi' | 'daysLeft'
const COLUMNS: SortKey[] = ['amount30', 'units30', 'cardCart', 'cardPay', 'liveGmv', 'liveCart', 'liveCvr', 'adsSpend', 'adsRoi', 'daysLeft']
const sort = ref<SortKey | ''>('')
const desc = ref(true)

const ICONS = { restock: Truck, cutAds: TrendingDown, makeVideo: Clapperboard, livePush: Radio, fixPrice: Tag, fixDetail: ShoppingCart, gap: Store }
const TONES: Record<StyleActionKind, string> = { restock: 'red', cutAds: 'red', makeVideo: 'green', livePush: 'green', fixPrice: 'amber', fixDetail: 'amber', gap: 'blue' }

async function load() {
  loading.value = true
  try {
    data.value = await window.api.productCodes.board()
    error.value = ''
    if (opened.value) opened.value = data.value.items.find((item) => item.code === opened.value?.code) || null
    if (filter.value === 'all' && !data.value.items.some((item) => item.actions.length)) filter.value = ''
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason)
  } finally {
    loading.value = false
  }
}
onMounted(load)
watch([filter, query, sort], () => { shown.value = PAGE })

const money = (value: number | undefined) => (value === undefined ? '—' : formatMoney(value, data.value?.currency || ''))
const num = (value: number | undefined) => fmtNumber(value, locale.value)
const pct = (value: number | undefined, digits = 1) => fmtPercent(value, locale.value, digits)
const per = (part: number, whole: number) => (whole > 0 ? part / whole : undefined)

function reason(action: StyleAction) {
  const p = action.params
  const value = (key: string) => {
    const raw = p[key]
    if (typeof raw !== 'number') return raw
    if (['cvr', 'cartRate', 'cartToOrder', 'ctr'].includes(key)) return pct(raw)
    if (key === 'roi') return raw.toFixed(2)
    if (key === 'gpm' || key === 'spend') return money(raw)
    if (key === 'avg') return 'roi' in p ? raw.toFixed(2) : 'gpm' in p ? money(raw) : pct(raw)
    return num(raw)
  }
  return t(`shops.sb.reason.${action.reason}`, Object.fromEntries(Object.keys(p).map((key) => [key, value(key)])))
}

function valueOf(item: StyleRow, key: SortKey): number | undefined {
  switch (key) {
    case 'cardCart': return item.cardRates?.cartRate
    case 'cardPay': return item.cardRates?.clickToPay
    case 'liveGmv': return item.live?.gmv
    case 'liveCart': return item.live ? per(item.live.carts, item.live.clicks) : undefined
    case 'liveCvr': return item.live ? per(item.live.measuredOrders, item.live.clicks) : undefined
    case 'adsSpend': return item.ads?.spend
    case 'adsRoi': return item.ads ? per(item.ads.revenue, item.ads.spend) : undefined
    default: return item[key]
  }
}
function textOf(item: StyleRow, key: SortKey) {
  const value = valueOf(item, key)
  if (value === undefined) return '—'
  if (key === 'amount30' || key === 'liveGmv' || key === 'adsSpend') return money(value)
  if (key === 'adsRoi') return value.toFixed(2)
  if (key === 'units30') return num(value)
  if (key === 'daysLeft') return t('shops.sb.days', { n: Math.max(0, Math.floor(value)) })
  return pct(value)
}
function sortBy(key: SortKey) {
  if (sort.value === key) desc.value = !desc.value
  else {
    sort.value = key
    desc.value = key !== 'daysLeft'
  }
}

const visible = computed(() => {
  const words = query.value.trim().toLowerCase()
  let list = data.value?.items || []
  if (filter.value === 'all') list = list.filter((item) => item.actions.length)
  else if (filter.value) list = list.filter((item) => item.actions.some((action) => action.kind === filter.value))
  if (words) list = (data.value?.items || []).filter((item) => `${item.code} ${item.name}`.toLowerCase().includes(words))
  const key = sort.value
  if (!key) return list
  return [...list].sort((a, b) => {
    const left = valueOf(a, key)
    const right = valueOf(b, key)
    if (left === undefined || right === undefined) return (left === undefined ? 1 : 0) - (right === undefined ? 1 : 0)
    return (left - right) * (desc.value ? -1 : 1)
  })
})
/** 选了某个动作，就把这个动作的依据放在前面 */
const mainAction = (item: StyleRow) => item.actions.find((action) => action.kind === filter.value) || item.actions[0]
const otherActions = (item: StyleRow) => item.actions.filter((action) => action !== mainAction(item))
const withActions = computed(() => (data.value?.items || []).filter((item) => item.actions.length).length)
const coverage = computed(() => {
  const items = data.value?.items || []
  return { live: items.filter((item) => item.live).length, ads: items.filter((item) => item.ads).length }
})
</script>

<template>
  <div class="sb" data-testid="style-board">
    <div v-if="error" class="vg-notice vg-notice--danger"><AlertTriangle :size="16" /><span>{{ error }}</span></div>
    <section v-if="loading && !data" class="vg-empty"><LoaderCircle :size="22" class="vg-spin" /></section>
    <section v-else-if="data && !data.items.length" class="vg-card vg-empty">
      <span class="vg-empty__icon"><PackageSearch :size="26" /></span>
      <h3>{{ t('shops.sb.emptyTitle') }}</h3>
      <p>{{ t('shops.sb.emptyDesc') }}</p>
    </section>
    <template v-else-if="data">
      <section class="vg-card sb-todo">
        <header>
          <div><h2 class="vg-section-title">{{ t('shops.sb.title') }}</h2><p>{{ t('shops.sb.hint', { n: data.days, live: coverage.live, ads: coverage.ads }) }}</p></div>
          <button type="button" class="vg-btn vg-btn--sm" :disabled="loading" @click="load"><LoaderCircle v-if="loading" :size="13" class="vg-spin" /><RefreshCcw v-else :size="13" />{{ t('shops.sb.refresh') }}</button>
        </header>
        <div class="sb-acts">
          <button v-for="kind in STYLE_ACTIONS" :key="kind" type="button" class="sb-act" :class="[`tone-${TONES[kind]}`, { 'is-active': filter === kind }]" :disabled="!data.counts[kind]" :data-testid="`style-action-${kind}`" @click="filter = filter === kind ? 'all' : kind">
            <span class="sb-act__icon"><component :is="ICONS[kind]" :size="17" /></span>
            <span class="sb-act__text"><b>{{ data.counts[kind] }}</b><strong>{{ t(`shops.sb.action.${kind}`) }}</strong><small>{{ t(`shops.sb.actionDesc.${kind}`) }}</small></span>
          </button>
        </div>
      </section>

      <section class="vg-card sb-list">
        <header class="sb-list__head">
          <div class="vg-seg vg-seg--sm">
            <button type="button" class="vg-seg__btn" :class="{ 'is-active': filter !== '' }" @click="filter = 'all'">{{ t('shops.sb.todo') }} {{ withActions }}</button>
            <button type="button" class="vg-seg__btn" :class="{ 'is-active': filter === '' }" @click="filter = ''">{{ t('shops.sb.allStyles') }} {{ data.items.length }}</button>
          </div>
          <span v-if="filter && filter !== 'all'" class="sb-list__filter">{{ t(`shops.sb.action.${filter}`) }} {{ visible.length }}</span>
          <label class="vg-search"><Search :size="14" /><input v-model="query" class="vg-input vg-input--sm" :placeholder="t('shops.sb.search')" /></label>
        </header>
        <div class="sb-scroll">
          <table class="sb-table">
            <thead>
              <tr class="sb-groups"><th></th><th></th><th colspan="2">{{ t('shops.sb.group.shop') }}</th><th colspan="2">{{ t('shops.sb.group.card') }}</th><th colspan="3">{{ t('shops.sb.group.live') }}</th><th colspan="2">{{ t('shops.sb.group.ads') }}</th><th></th></tr>
              <tr><th>{{ t('shops.sb.style') }}</th><th>{{ t('shops.sb.next') }}</th><th v-for="key in COLUMNS" :key="key" class="num sb-sort" :class="{ 'is-active': sort === key }" @click="sortBy(key)"><span>{{ t(`shops.sb.col.${key}`) }}<ArrowDown v-if="sort === key && desc" :size="11" /><ArrowUp v-else-if="sort === key" :size="11" /></span></th></tr>
            </thead>
            <tbody>
              <tr v-for="item in visible.slice(0, shown)" :key="item.code" data-testid="style-row" tabindex="0" @click="opened = item" @keydown.enter="opened = item">
                <td><span class="sb-prod"><img v-if="item.image" :src="item.image" alt="" loading="lazy" /><span v-else class="sb-ph"><FileImage :size="15" /></span><span><b>{{ item.code }}<em v-if="item.hotType || item.suggestion">{{ item.hotType || item.suggestion }}</em></b><small :title="item.name">{{ item.name }}</small></span></span></td>
                <td class="sb-next">
                  <template v-if="mainAction(item)">
                    <span class="sb-tag" :class="`tone-${TONES[mainAction(item).kind]}`">{{ t(`shops.sb.action.${mainAction(item).kind}`) }}</span>
                    <span v-for="action in otherActions(item).slice(0, 2)" :key="action.kind" class="sb-tag sb-tag--soft" :title="reason(action)">{{ t(`shops.sb.action.${action.kind}`) }}</span>
                    <small>{{ reason(mainAction(item)) }}</small>
                  </template>
                  <small v-else>{{ t('shops.sb.nothing') }}</small>
                </td>
                <td v-for="key in COLUMNS" :key="key" class="num" :class="{ 'is-low': key === 'daysLeft' && (item.risk === 'out' || item.risk === 'urgent'), 'is-strong': key === 'amount30' }">{{ textOf(item, key) }}</td>
              </tr>
              <tr v-if="!visible.length"><td :colspan="COLUMNS.length + 2" class="sb-none">{{ t('shops.sb.noMatch') }}</td></tr>
            </tbody>
          </table>
        </div>
        <button v-if="shown < visible.length" type="button" class="vg-btn vg-btn--ghost sb-more" @click="shown += PAGE">{{ t('shops.live.more') }}</button>
      </section>
    </template>
    <StyleBoardDrawer v-if="opened && data" :row="opened" :baseline="data.baseline" :currency="data.currency" :reason="reason" @close="opened = null" @changed="load" />
  </div>
</template>

<style scoped>
.sb { display: flex; flex-direction: column; gap: 16px; }
.sb-todo { display: flex; flex-direction: column; gap: 16px; }
.sb-todo header { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; }
.sb-todo p { margin: 3px 0 0; font-size: 12px; line-height: 1.5; color: var(--theme-text-muted); }
.sb-acts { display: grid; grid-template-columns: repeat(auto-fit, minmax(148px, 1fr)); gap: 10px; }
.tone-red { --tone: var(--vg-red, #f87171); } .tone-green { --tone: var(--vg-accent); } .tone-amber { --tone: var(--vg-amber, #d97706); } .tone-blue { --tone: #60a5fa; }
.sb-act { display: flex; align-items: flex-start; gap: 10px; padding: 12px; border: 1px solid var(--theme-border); border-radius: 12px; background: var(--theme-panel-soft); color: inherit; font: inherit; text-align: left; cursor: pointer; transition: border-color .15s; }
.sb-act:hover:not(:disabled), .sb-act.is-active { border-color: var(--tone); }
.sb-act.is-active { background: color-mix(in srgb, var(--tone) 10%, transparent); }
.sb-act:disabled { opacity: .45; cursor: default; }
.sb-act__icon { width: 30px; height: 30px; flex: none; display: grid; place-items: center; border-radius: 9px; color: var(--tone); background: color-mix(in srgb, var(--tone) 14%, transparent); }
.sb-act__text { min-width: 0; display: grid; grid-template-columns: auto 1fr; align-items: baseline; gap: 2px 8px; }
.sb-act b { font-size: 20px; font-weight: 650; line-height: 1.2; font-variant-numeric: tabular-nums; }
.sb-act strong { font-size: 13px; font-weight: 600; }
.sb-act small { grid-column: 1 / -1; font-size: 11.5px; line-height: 1.45; color: var(--theme-text-muted); }
.sb-list { display: flex; flex-direction: column; gap: 10px; overflow: hidden; }
.sb-list__head { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.sb-list__filter { font-size: 12px; color: var(--vg-accent); }
.sb-list__head .vg-search { margin-left: auto; width: 220px; }
.sb-scroll { overflow-x: auto; }
.sb-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.sb-table th { padding: 7px 9px; text-align: left; font-size: 12px; font-weight: 500; color: var(--theme-text-muted); white-space: nowrap; }
.sb-groups th { padding-bottom: 0; font-size: 11px; text-align: center; opacity: .8; }
.sb-table td { padding: 11px 9px; border-top: 1px solid var(--theme-divider); font-variant-numeric: tabular-nums; }
.sb-table tbody tr { cursor: pointer; }
.sb-table tbody tr:hover, .sb-table tbody tr:focus-visible { background: var(--theme-panel-soft); outline: none; }
.sb-table .num { text-align: right; white-space: nowrap; }
.sb-sort { cursor: pointer; user-select: none; }
.sb-sort span { display: inline-flex; align-items: center; gap: 3px; }
.sb-sort:hover, .sb-sort.is-active { color: var(--vg-accent) !important; }
.is-strong { font-weight: 650; }
.is-low { color: var(--vg-red); }
.sb-prod { display: flex; align-items: center; gap: 11px; }
.sb-prod img, .sb-ph { width: 44px; height: 44px; flex: none; border-radius: 8px; object-fit: cover; background: var(--theme-panel-soft); display: grid; place-items: center; color: var(--theme-text-muted); }
.sb-prod > span:last-child { width: 150px; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.sb-prod b { font-weight: 650; white-space: nowrap; }
.sb-prod em { margin-left: 7px; font-size: 11px; font-style: normal; font-weight: 500; color: var(--vg-accent); }
.sb-prod small { font-size: 11.5px; color: var(--theme-text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sb-next { min-width: 220px; max-width: 290px; }
.sb-next small { display: block; margin-top: 4px; font-size: 11.5px; line-height: 1.5; color: var(--theme-text-muted); }
.sb-tag { display: inline-block; margin-right: 5px; padding: 0 8px; border-radius: 5px; font-size: 11.5px; font-weight: 600; line-height: 20px; color: var(--tone); background: color-mix(in srgb, var(--tone) 14%, transparent); }
.sb-tag--soft { color: var(--theme-text-muted); background: var(--theme-panel-soft); font-weight: 500; }
.sb-none { padding: 34px !important; text-align: center; color: var(--theme-text-muted); }
.sb-more { align-self: center; }
</style>
