<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { AlertTriangle, ArrowDown, ArrowDownRight, ArrowUp, ArrowUpRight, ChevronRight, FileImage, Link2Off, LoaderCircle, Radio, RefreshCcw, Tv } from 'lucide-vue-next'
import type { LiveOverview, LiveRoomView, LiveSyncState } from '../../../../../shared/liveAccounts'
import { dateRange, zonedDate } from '../../../../../shared/sellerInventory'
import { freshnessText } from '../../../../../shared/sellerSyncText'
import { formatMoney } from '../product-research/productResearchUtils'
import { fmtMoney, fmtNumber, fmtPercent } from './shopFormat'
import { liveErrorText } from './liveText'
import { daysOf, looseOf, per, slotsOf, stylesOf, sumRooms, type LiveDay, type LiveStyle } from './liveAnalysis'
import LiveRoomDrawer from './LiveRoomDrawer.vue'
import ShopTrendChart from './ShopTrendChart.vue'

/** 店铺 → 直播：先看结论（成交、走势、哪个时段好、哪些款好卖），再看每一场。 */
const emit = defineEmits<{ accounts: [] }>()
const { t, locale } = useI18n()
const DAY = 86_400_000
const TIME_ZONE = 'Asia/Ho_Chi_Minh'
const PAGE = 12

const data = ref<LiveOverview | null>(null)
const progress = ref<LiveSyncState[]>([])
const error = ref('')
const loading = ref(false)
const days = ref(30)
const account = ref('')
const tab = ref<'rooms' | 'codes' | 'unassigned'>('rooms')
const metric = ref<'gmv' | 'sales' | 'views' | 'perHour'>('gmv')
const order = ref<'time' | 'gmv' | 'perHour'>('time')
const shown = ref(PAGE)
const opened = ref<LiveRoomView | null>(null)
const now = ref(Date.now())
const syncing = computed(() => progress.value.some((item) => item.status === 'running'))
const syncText = computed(() => {
  const jobs = progress.value.filter((item) => item.status === 'running')
  return t('shops.live.syncing', { done: jobs.reduce((sum, item) => sum + item.done, 0), total: jobs.reduce((sum, item) => sum + item.total, 0) })
})

async function load() {
  loading.value = true
  try {
    now.value = Date.now()
    // 多取一段用来和上一段比较
    data.value = await window.api.liveAccounts.overview({ since: now.value - (days.value * 2 + 1) * DAY })
    error.value = ''
  } catch (reason) {
    error.value = liveErrorText(reason, t)
  } finally {
    loading.value = false
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
watch(days, () => void load())
watch([days, account, tab, order], () => { shown.value = PAGE })

async function syncAll() {
  await window.api.liveAccounts.sync()
  await poll()
}

// ===== 时间段 =====
const dateOf = (ms: number) => zonedDate(ms, TIME_ZONE)
const end = computed(() => dateOf(now.value))
const start = computed(() => dateOf(now.value - (days.value - 1) * DAY))
const prevStart = computed(() => dateOf(now.value - (days.value * 2 - 1) * DAY))
const mine = computed(() => (data.value?.rooms || []).filter((room) => !account.value || room.accountId === account.value))
const rooms = computed(() => mine.value.filter((room) => dateOf(room.startAt) >= start.value))
const previousRooms = computed(() => mine.value.filter((room) => dateOf(room.startAt) >= prevStart.value && dateOf(room.startAt) < start.value))
/** 已同步的数据不够长时，上一段不完整，不比较 */
const comparable = computed(() => previousRooms.value.length > 0 && days.value <= 30)
const currency = computed(() => rooms.value[0]?.currency || data.value?.accounts[0]?.currency || '')
const region = computed(() => data.value?.accounts[0]?.region)
const mixed = computed(() => new Set(rooms.value.map((room) => room.currency)).size > 1)
const lastSync = computed(() => Math.max(0, ...(data.value?.accounts || []).map((item) => item.lastSyncAt || 0)))

// ===== 指标 =====
const total = computed(() => sumRooms(rooms.value))
const prev = computed(() => sumRooms(previousRooms.value))
const money = (value: number | undefined, compact = false) => (value === undefined ? '—' : compact ? fmtMoney(value, locale.value, region.value, true) : formatMoney(value, currency.value))
const num = (value: number | undefined) => fmtNumber(value, locale.value)
const pct = (value: number | undefined, digits = 1) => fmtPercent(value, locale.value, digits)

const kpis = computed(() => {
  const a = total.value
  const b = prev.value
  const list: Array<{ key: string; text: string; value?: number; before?: number; chart?: typeof metric.value; points?: boolean; hint?: string }> = [
    { key: 'gmv', text: money(a.gmv, true), value: a.gmv, before: b.gmv, chart: 'gmv' },
    { key: 'sales', text: num(a.sales), value: a.sales, before: b.sales, chart: 'sales' },
    { key: 'views', text: num(a.views), value: a.views, before: b.views, chart: 'views' },
    { key: 'perHour', text: money(per(a.gmv, a.hours), true), value: per(a.gmv, a.hours), before: per(b.gmv, b.hours), chart: 'perHour' },
    { key: 'aov', text: money(per(a.gmv, a.sales), true), value: per(a.gmv, a.sales), before: per(b.gmv, b.sales) },
    { key: 'rooms', text: t('shops.live.roomsHours', { rooms: a.rooms, hours: Math.round(a.hours) }), value: a.rooms, before: b.rooms },
    { key: 'enterRate', text: pct(per(a.views, a.impressions)), value: per(a.views, a.impressions), before: per(b.views, b.impressions), points: true },
    { key: 'ctr', text: pct(per(a.clicks, a.exposures)), value: per(a.clicks, a.exposures), before: per(b.clicks, b.exposures), points: true },
    { key: 'cartRate', text: pct(per(a.carts, a.clicks)), value: per(a.carts, a.clicks), before: per(b.carts, b.clicks), points: true },
    { key: 'cvr', text: pct(per(a.orders, a.clicks)), value: per(a.orders, a.clicks), before: per(b.orders, b.clicks), points: true },
  ]
  return list.map((item) => {
    const diff = !comparable.value || item.value === undefined || item.before === undefined ? undefined : item.points ? (item.value - item.before) * 100 : item.before ? item.value / item.before - 1 : undefined
    const trend = diff === undefined ? 'flat' : Math.abs(diff) < (item.points ? 0.005 : 0.0005) ? 'flat' : diff > 0 ? 'up' : 'down'
    return { ...item, trend, diffText: diff === undefined ? '' : item.points ? `${diff > 0 ? '+' : ''}${diff.toFixed(2)}pp` : `${diff > 0 ? '+' : ''}${pct(diff)}` }
  })
})

const pick = (day: LiveDay) => (metric.value === 'perHour' ? per(day.gmv, day.hours) || 0 : day[metric.value])
const series = computed(() => daysOf(rooms.value, dateRange(start.value, end.value), dateOf).map((day) => ({ date: day.date, value: pick(day) })))
const previousSeries = computed(() => (comparable.value ? daysOf(previousRooms.value, dateRange(prevStart.value, dateOf(now.value - days.value * DAY)), dateOf).map(pick) : undefined))
const formatPoint = (value: number) => (metric.value === 'gmv' || metric.value === 'perHour' ? money(value, true) : num(value))

// ===== 时段 =====
const hourOf = (ms: number) => Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: TIME_ZONE }).format(new Date(ms)))
const slots = computed(() => slotsOf(rooms.value, hourOf))
const slotPeak = computed(() => Math.max(1, ...slots.value.map((slot) => slot.perHour)))
/** 至少播过 3 场的时段才下结论 */
const bestSlot = computed(() => [...slots.value].filter((slot) => slot.rooms >= 3).sort((a, b) => b.perHour - a.perHour)[0])
const pad = (value: number) => String(value).padStart(2, '0')

// ===== 款号 =====
const styles = computed(() => stylesOf(rooms.value))
const topStyles = computed(() => styles.value.slice(0, 5))
const stylePeak = computed(() => Math.max(1, ...styles.value.map((item) => item.gmv)))
type StyleSort = 'gmv' | 'sales' | 'soldRooms' | 'exposures' | 'ctr' | 'carts' | 'cartRate' | 'cartToOrder' | 'cvr' | 'gpm'
const STYLE_COLUMNS: StyleSort[] = ['gmv', 'sales', 'soldRooms', 'exposures', 'ctr', 'carts', 'cartRate', 'cartToOrder', 'cvr', 'gpm']
const styleSort = ref<StyleSort>('gmv')
const styleDesc = ref(true)
function sortStyles(key: StyleSort) {
  styleDesc.value = styleSort.value === key ? !styleDesc.value : true
  styleSort.value = key
}
/** 比率只用直播实测的成交；点击太少的比率没有意义，排序时放后面 */
function styleValue(item: LiveStyle, key: StyleSort): number | undefined {
  switch (key) {
    case 'ctr': return per(item.clicks, item.exposures)
    case 'cartRate': return per(item.carts, item.clicks)
    case 'cartToOrder': return per(item.measuredOrders, item.carts)
    case 'cvr': return per(item.measuredOrders, item.clicks)
    case 'gpm': return item.exposures ? (item.measuredGmv / item.exposures) * 1000 : undefined
    default: return item[key]
  }
}
const RATES = new Set<StyleSort>(['ctr', 'cartRate', 'cartToOrder', 'cvr'])
const styleText = (item: LiveStyle, key: StyleSort) => {
  const value = styleValue(item, key)
  if (key === 'exposures' || key === 'carts') return item.exposures ? num(value) : '—'
  return RATES.has(key) ? pct(value) : key === 'gmv' || key === 'gpm' ? money(value) : num(value)
}
/** 和全部商品的平均比，明显高低才标色 */
const styleAverage = computed(() => {
  const a = total.value
  return { ctr: per(a.clicks, a.exposures), cartRate: per(a.carts, a.clicks), cartToOrder: per(a.orders, a.carts), cvr: per(a.orders, a.clicks) } as Partial<Record<StyleSort, number>>
})
function styleTone(item: LiveStyle, key: StyleSort) {
  const base = styleAverage.value[key]
  const value = styleValue(item, key)
  if (!base || value === undefined || item.clicks < 50) return ''
  return value >= base * 1.3 ? 'up' : value <= base * 0.6 ? 'down' : ''
}
const sortedStyles = computed(() => {
  const key = styleSort.value
  const rate = RATES.has(key) || key === 'gpm'
  const rank = (item: LiveStyle) => (rate && item.clicks < 50 ? undefined : styleValue(item, key))
  return [...styles.value].sort((a, b) => {
    const left = rank(a)
    const right = rank(b)
    if (left === undefined || right === undefined) return (left === undefined ? 1 : 0) - (right === undefined ? 1 : 0)
    return (left - right) * (styleDesc.value ? -1 : 1)
  })
})
const generic = computed(() => new Map((data.value?.unassigned || []).map((item) => [item.productId, item.reason === 'generic'])))
const loose = computed(() => looseOf(rooms.value, generic.value))
const assignedRate = computed(() => per(total.value.assigned, total.value.productGmv))

// ===== 场次 =====
const average = computed(() => per(total.value.gmv, total.value.rooms) || 0)
const roomPeak = computed(() => Math.max(1, ...rooms.value.map((room) => room.gmv)))
const roomHours = (room: LiveRoomView) => (room.endAt - room.startAt) / 3_600_000
const sorted = computed(() => {
  const list = [...rooms.value]
  if (order.value === 'gmv') return list.sort((a, b) => b.gmv - a.gmv)
  if (order.value === 'perHour') return list.sort((a, b) => b.gmv / roomHours(b) - a.gmv / roomHours(a))
  return list
})
const day = (ms: number) => new Intl.DateTimeFormat(locale.value, { month: '2-digit', day: '2-digit', timeZone: TIME_ZONE }).format(new Date(ms))
const weekday = (ms: number) => new Intl.DateTimeFormat(locale.value, { weekday: 'short', timeZone: TIME_ZONE }).format(new Date(ms))
const clock = (ms: number) => new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: TIME_ZONE }).format(new Date(ms))
const whenOf = (room: LiveRoomView) => `${day(room.startAt)} ${weekday(room.startAt)} ${clock(room.startAt)}–${clock(room.endAt)}`
const bestOf = (room: LiveRoomView) => [...room.products].filter((item) => item.sales > 0).sort((a, b) => b.gmv - a.gmv).slice(0, 4)
const vs = (room: LiveRoomView) => (average.value ? room.gmv / average.value - 1 : 0)
</script>

<template>
  <section class="lv" data-testid="live-sessions">
    <div v-if="error" class="vg-notice vg-notice--danger"><AlertTriangle :size="16" /><span>{{ error }}</span></div>
    <section v-if="data && !data.accounts.length" class="vg-card vg-empty">
      <span class="vg-empty__icon"><Tv :size="26" /></span>
      <h3>{{ t('shops.live.empty') }}</h3>
      <p>{{ t('shops.live.accountsHint') }}</p>
      <button type="button" class="vg-btn vg-btn--primary" @click="emit('accounts')">{{ t('shops.live.add') }}</button>
    </section>

    <template v-else-if="data">
      <div class="lv-toolbar">
        <div class="vg-seg vg-seg--sm">
          <button v-for="n in [7, 14, 30, 60]" :key="n" type="button" class="vg-seg__btn" :class="{ 'is-active': days === n }" @click="days = n">{{ t('sellerInv.days', { n }) }}</button>
        </div>
        <select v-if="data.accounts.length > 1" v-model="account" class="vg-select vg-select--sm lv-toolbar__account" :aria-label="t('shops.live.account')"><option value="">{{ t('shops.live.allAccounts') }}</option><option v-for="item in data.accounts" :key="item.id" :value="item.id">{{ item.name }}</option></select>
        <span class="lv-toolbar__range">{{ start.slice(5).replace('-', '/') }} – {{ end.slice(5).replace('-', '/') }}<template v-if="lastSync"> · {{ freshnessText(lastSync, now, locale).text }}</template></span>
        <LoaderCircle v-if="loading" :size="15" class="vg-spin vg-muted" />
        <span class="vg-toolbar__spacer"></span>
        <button type="button" class="vg-btn vg-btn--sm" :disabled="syncing" @click="syncAll"><LoaderCircle v-if="syncing" :size="13" class="vg-spin" /><RefreshCcw v-else :size="13" />{{ syncing ? syncText : t('shops.live.sync') }}</button>
      </div>

      <section v-if="!rooms.length" class="vg-card vg-empty">
        <span class="vg-empty__icon"><Radio :size="26" /></span>
        <h3>{{ t('shops.live.noRooms') }}</h3>
      </section>
      <template v-else>
        <div v-if="mixed" class="vg-notice vg-notice--warning"><AlertTriangle :size="16" /><span>{{ t('shops.live.mixed') }}</span></div>
        <!-- 概览 -->
        <section class="vg-card lv-perf">
          <header>
            <h2 class="vg-section-title">{{ t('shops.live.overview') }}</h2>
            <p class="lv-hint">{{ comparable ? t('shops.live.overviewHint', { n: days }) : t('shops.live.overviewHintNoCompare') }}</p>
          </header>
          <div class="lv-kpis">
            <component :is="item.chart ? 'button' : 'div'" v-for="item in kpis" :key="item.key" :type="item.chart ? 'button' : undefined" class="lv-kpi" :class="{ 'is-active': item.chart === metric, 'is-link': item.chart }" @click="item.chart && (metric = item.chart)">
              <span class="lv-kpi__label">{{ t(`shops.live.metric.${item.key}`) }}</span>
              <span class="lv-kpi__value">{{ item.text }}</span>
              <span v-if="item.diffText" class="lv-chg" :class="item.trend"><ArrowUpRight v-if="item.trend === 'up'" :size="12" /><ArrowDownRight v-else-if="item.trend === 'down'" :size="12" />{{ item.diffText }}</span>
            </component>
          </div>
          <div class="lv-two">
            <div>
              <h3 class="lv-sub">{{ t('shops.live.daily', { name: t(`shops.live.metric.${metric}`) }) }}</h3>
              <ShopTrendChart :points="series" :previous="previousSeries" :format="formatPoint" :height="190" />
            </div>
            <div>
              <h3 class="lv-sub">{{ t('shops.live.slots') }}<small v-if="bestSlot">{{ t('shops.live.bestSlot', { hour: `${pad(bestSlot.hour)}:00`, value: money(bestSlot.perHour, true) }) }}</small></h3>
              <ul class="lv-slots">
                <li v-for="slot in slots" :key="slot.hour" :class="{ 'is-best': bestSlot?.hour === slot.hour }">
                  <span>{{ pad(slot.hour) }}:00</span>
                  <div><i :style="{ width: `${Math.max(1.5, (slot.perHour / slotPeak) * 100)}%` }"></i></div>
                  <b>{{ money(slot.perHour, true) }}</b>
                  <small>{{ t('shops.live.roomCount', { n: slot.rooms }) }}</small>
                </li>
              </ul>
            </div>
          </div>
        </section>

        <!-- 爆款榜 -->
        <section class="vg-card lv-top">
          <header class="lv-head">
            <div><h2 class="vg-section-title">{{ t('shops.live.topStyles') }}</h2><p class="lv-hint">{{ t('shops.live.topHint') }}</p></div>
            <div v-if="assignedRate !== undefined" class="lv-ring" :title="t('shops.live.assignedHint')">
              <svg viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="15" /><circle class="is-value" cx="18" cy="18" r="15" pathLength="100" :stroke-dasharray="`${assignedRate * 100} 100`" /></svg>
              <div><b>{{ pct(assignedRate, 0) }}</b><small>{{ t('shops.live.assigned') }}</small></div>
            </div>
          </header>
          <div v-if="topStyles.length" class="lv-styles">
            <article v-for="(item, index) in topStyles" :key="item.code" class="lv-style">
              <div class="lv-style__img"><img v-if="item.image" :src="item.image" alt="" loading="lazy" /><FileImage v-else :size="22" /><span>{{ index + 1 }}</span></div>
              <div class="lv-style__body">
                <strong>{{ item.code }}</strong>
                <b>{{ money(item.gmv, true) }}</b>
                <small>{{ t('shops.live.units', { n: num(item.sales) }) }} · {{ t('shops.live.soldIn', { n: item.soldRooms }) }}</small>
                <small>{{ t('shops.live.col.ctr') }} {{ pct(per(item.clicks, item.exposures)) }} · {{ t('shops.live.col.cartRate') }} {{ pct(per(item.carts, item.clicks)) }} · {{ t('shops.live.col.cvr') }} {{ pct(per(item.measuredOrders, item.clicks)) }}</small>
              </div>
            </article>
          </div>
          <p v-else class="lv-none">{{ t('shops.live.noCodes') }}</p>
          <button v-if="loose.length && loose[0].gmv > 0" type="button" class="lv-loose" @click="tab = 'unassigned'">
            <Link2Off :size="15" /><span>{{ t('shops.live.looseLine', { n: loose.filter((item) => item.gmv > 0).length, share: pct(loose.reduce((sum, item) => sum + item.share, 0), 0) }) }}</span><ChevronRight :size="15" />
          </button>
        </section>

        <!-- 明细 -->
        <section class="vg-card lv-detail">
          <header class="lv-head">
            <nav class="lv-tabs">
              <button v-for="item in (['rooms', 'codes', 'unassigned'] as const)" :key="item" type="button" :class="{ 'is-active': tab === item }" :data-testid="`live-tab-${item}`" @click="tab = item">{{ t(`shops.live.view.${item}`) }}<span>{{ item === 'rooms' ? rooms.length : item === 'codes' ? styles.length : loose.length }}</span></button>
            </nav>
            <div v-if="tab === 'rooms'" class="vg-seg vg-seg--sm">
              <button v-for="item in (['time', 'gmv', 'perHour'] as const)" :key="item" type="button" class="vg-seg__btn" :class="{ 'is-active': order === item }" @click="order = item">{{ t(`shops.live.order.${item}`) }}</button>
            </div>
          </header>

          <div v-if="tab === 'rooms'" class="lv-rooms">
            <button v-for="room in sorted.slice(0, shown)" :key="room.id" type="button" class="lv-room" data-testid="live-room" @click="opened = room">
              <span class="lv-room__date"><b>{{ day(room.startAt) }}</b><small>{{ weekday(room.startAt) }}</small></span>
              <span class="lv-room__time"><b>{{ clock(room.startAt) }}–{{ clock(room.endAt) }}</b><small>@{{ room.accountName }} · {{ t('shops.live.hours', { n: roomHours(room).toFixed(1) }) }}</small></span>
              <span class="lv-room__gmv">
                <span><b>{{ money(room.gmv) }}</b><em :class="Math.abs(vs(room)) < 0.05 ? 'flat' : vs(room) > 0 ? 'up' : 'down'">{{ vs(room) > 0 ? '+' : '' }}{{ pct(vs(room), 0) }}</em></span>
                <i><u :style="{ width: `${(room.gmv / roomPeak) * 100}%` }"></u></i>
              </span>
              <span class="lv-room__num"><b>{{ money(room.gmv / roomHours(room), true) }}</b><small>{{ t('shops.live.metric.perHour') }}</small></span>
              <span class="lv-room__num"><b>{{ num(room.sales) }}</b><small>{{ t('shops.live.sales') }}</small></span>
              <span class="lv-room__num"><b>{{ num(room.views) }}</b><small>{{ t('shops.live.metric.enterRate') }} {{ pct(per(room.views, room.impressions)) }}</small></span>
              <span class="lv-room__best">
                <span v-for="item in bestOf(room)" :key="item.productId" :title="`${item.codes.map((code) => code.code).join('、') || t('shops.live.noCode')} · ${money(item.gmv)}`"><img v-if="item.image" :src="item.image" alt="" loading="lazy" /><FileImage v-else :size="14" /></span>
              </span>
              <ChevronRight :size="16" class="lv-room__go" />
            </button>
          </div>

          <div v-else-if="tab === 'codes'" class="lv-scroll">
            <table class="lv-table lv-table--styles">
              <thead><tr><th>#</th><th>{{ t('shops.live.code') }}</th><th v-for="key in STYLE_COLUMNS" :key="key" class="num lv-sort" :class="{ 'is-active': styleSort === key }" :title="t(`shops.live.colHint.${key}`)" :data-testid="`live-sort-${key}`" @click="sortStyles(key)"><span>{{ t(`shops.live.col.${key}`) }}<ArrowDown v-if="styleSort === key && styleDesc" :size="11" /><ArrowUp v-else-if="styleSort === key" :size="11" /></span></th></tr></thead>
              <tbody>
                <tr v-for="(item, index) in sortedStyles.slice(0, shown)" :key="item.code">
                  <td class="lv-rank">{{ index + 1 }}</td>
                  <td><span class="lv-prod"><img v-if="item.image" :src="item.image" alt="" loading="lazy" /><span v-else class="lv-ph"><FileImage :size="14" /></span><span><b>{{ item.code }}</b><small :title="item.name">{{ item.name }}</small></span></span></td>
                  <td v-for="key in STYLE_COLUMNS" :key="key" class="num" :class="styleTone(item, key)">
                    <template v-if="key === 'gmv'"><b>{{ money(item.gmv) }}</b><span class="lv-track"><i :style="{ width: `${(item.gmv / stylePeak) * 100}%` }"></i></span><small v-if="item.estimated" class="lv-tag" :title="t('shops.live.estimatedHint')">{{ t('shops.live.estimated') }}</small></template>
                    <template v-else>{{ styleText(item, key) }}</template>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <template v-else>
            <p class="lv-tip">{{ t('shops.live.unassignedTip') }} {{ t('shops.live.unassignedFix') }}</p>
            <table class="lv-table">
              <thead><tr><th>{{ t('shops.live.product') }}</th><th class="num">{{ t('shops.live.gmv') }}</th><th class="num">{{ t('shops.live.share') }}</th><th class="num">{{ t('shops.live.sales') }}</th><th class="num">{{ t('shops.live.sessions') }}</th><th>{{ t('shops.live.why') }}</th></tr></thead>
              <tbody>
                <tr v-for="item in loose.slice(0, shown)" :key="item.productId">
                  <td><span class="lv-prod"><img v-if="item.image" :src="item.image" alt="" loading="lazy" /><span v-else class="lv-ph"><FileImage :size="14" /></span><span><b class="is-plain" :title="item.name">{{ item.name }}</b><small>ID {{ item.productId }}</small></span></span></td>
                  <td class="num"><b>{{ money(item.gmv) }}</b></td><td class="num">{{ pct(item.share) }}</td><td class="num">{{ num(item.sales) }}</td><td class="num">{{ item.sessions }}</td><td>{{ t(`shops.live.reason.${item.generic ? 'generic' : 'noCode'}`) }}</td>
                </tr>
                <tr v-if="!loose.length"><td colspan="6" class="lv-none">{{ t('shops.live.allAssigned') }}</td></tr>
              </tbody>
            </table>
          </template>
          <button v-if="shown < (tab === 'rooms' ? rooms.length : tab === 'codes' ? styles.length : loose.length)" type="button" class="vg-btn vg-btn--ghost lv-more" @click="shown += 24">{{ t('shops.live.more') }}</button>
        </section>
      </template>
    </template>
    <LiveRoomDrawer v-if="opened" :room="opened" :average="total" :when="whenOf(opened)" @close="opened = null" />
  </section>
</template>

<style scoped>
.lv { display: flex; flex-direction: column; gap: 16px; }
.lv-toolbar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.lv-toolbar__account { width: auto; min-width: 150px; }
.lv-toolbar__range { font-size: 12px; color: var(--theme-text-muted); font-variant-numeric: tabular-nums; }
.lv-hint { margin: 3px 0 0; font-size: 12px; line-height: 1.5; color: var(--theme-text-muted); }
.lv-head { display: flex; align-items: center; justify-content: space-between; gap: 14px; flex-wrap: wrap; }
.lv-sub { display: flex; align-items: baseline; gap: 10px; margin: 0 0 12px; font-size: 13px; font-weight: 600; color: var(--theme-text-secondary); }
.lv-sub small { font-size: 12px; font-weight: 500; color: var(--vg-accent); }
.lv-none { margin: 0; padding: 30px !important; text-align: center; font-size: 13px; color: var(--theme-text-muted); }
.up { color: var(--vg-green, #16a34a); } .down { color: var(--vg-red); } .flat { color: var(--theme-text-muted); }

.lv-perf { display: flex; flex-direction: column; gap: 16px; }
.lv-kpis { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); border: 1px solid var(--theme-border); border-radius: 10px; overflow: hidden; }
.lv-kpi { position: relative; display: flex; flex-direction: column; gap: 3px; padding: 13px 16px; border: 0; border-left: 1px solid var(--theme-divider); border-top: 1px solid var(--theme-divider); background: transparent; color: inherit; font: inherit; text-align: left; }
.lv-kpi:nth-child(5n + 1) { border-left: 0; }
.lv-kpi:nth-child(-n + 5) { border-top: 0; }
.lv-kpi.is-link { cursor: pointer; }
.lv-kpi.is-link:hover { background: var(--theme-panel-soft); }
.lv-kpi.is-active { background: color-mix(in srgb, var(--vg-accent) 9%, transparent); }
.lv-kpi.is-active::after { content: ''; position: absolute; inset: auto 0 0; height: 2px; background: var(--vg-accent); }
.lv-kpi__label { font-size: 12px; color: var(--theme-text-muted); }
.lv-kpi.is-active .lv-kpi__label { color: var(--vg-accent); }
.lv-kpi__value { font-size: 21px; font-weight: 620; line-height: 1.25; font-variant-numeric: tabular-nums; white-space: nowrap; }
.lv-chg { display: inline-flex; align-items: center; gap: 2px; font-size: 11.5px; font-weight: 600; font-variant-numeric: tabular-nums; }
.lv-two { display: grid; grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); gap: 32px; }
.lv-slots { list-style: none; margin: 0; padding: 0 4px 0 0; display: flex; flex-direction: column; gap: 9px; max-height: 210px; overflow-y: auto; scrollbar-width: thin; }
.lv-slots li { display: grid; grid-template-columns: 46px 1fr 74px 48px; align-items: center; gap: 10px; font-size: 12px; font-variant-numeric: tabular-nums; color: var(--theme-text-secondary); }
.lv-slots div { height: 8px; border-radius: 4px; background: var(--theme-panel-soft); overflow: hidden; }
.lv-slots i { display: block; height: 100%; border-radius: 4px; background: color-mix(in srgb, var(--vg-accent) 45%, transparent); }
.lv-slots .is-best i { background: var(--vg-accent); }
.lv-slots .is-best span { color: var(--vg-accent); font-weight: 650; }
.lv-slots b { text-align: right; font-weight: 600; color: var(--theme-text); }
.lv-slots small { color: var(--theme-text-muted); text-align: right; }

.lv-top { display: flex; flex-direction: column; gap: 16px; }
.lv-ring { display: flex; align-items: center; gap: 12px; }
.lv-ring svg { width: 46px; height: 46px; transform: rotate(-90deg); }
.lv-ring circle { fill: none; stroke: var(--theme-panel-soft); stroke-width: 4; }
.lv-ring .is-value { stroke: var(--vg-accent); stroke-linecap: round; }
.lv-ring b { display: block; font-size: 18px; line-height: 1.2; font-variant-numeric: tabular-nums; }
.lv-ring small { font-size: 12px; color: var(--theme-text-muted); }
.lv-styles { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 14px; }
.lv-style { display: flex; flex-direction: column; overflow: hidden; border: 1px solid var(--theme-border); border-radius: 12px; background: var(--theme-panel-soft); }
.lv-style__img { position: relative; aspect-ratio: 4 / 3; display: grid; place-items: center; overflow: hidden; background: color-mix(in srgb, var(--theme-panel-soft) 60%, #000); color: var(--theme-text-muted); }
.lv-style__img img { width: 100%; height: 100%; object-fit: cover; }
.lv-style__img span { position: absolute; left: 10px; top: 10px; display: grid; place-items: center; min-width: 24px; height: 24px; border-radius: 7px; font-size: 13px; font-weight: 700; color: #eafff7; background: rgb(3 18 16 / .72); backdrop-filter: blur(4px); }
.lv-style:first-child .lv-style__img span { color: #06261d; background: var(--vg-accent); }
.lv-style__body { display: grid; grid-template-columns: 1fr auto; align-items: baseline; gap: 4px 8px; padding: 12px 14px 14px; }
.lv-style__body strong { font-size: 15px; font-weight: 700; }
.lv-style__body b { font-size: 15px; font-weight: 650; font-variant-numeric: tabular-nums; color: var(--vg-accent); }
.lv-style__body small { grid-column: 1 / -1; font-size: 11.5px; color: var(--theme-text-muted); font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.lv-loose { display: flex; align-items: center; gap: 10px; padding: 11px 14px; border: 1px solid color-mix(in srgb, var(--vg-amber, #d97706) 32%, transparent); border-radius: 10px; background: color-mix(in srgb, var(--vg-amber, #d97706) 8%, transparent); color: var(--theme-text-secondary); font: inherit; font-size: 12.5px; text-align: left; cursor: pointer; }
.lv-loose > svg:first-child { color: var(--vg-amber, #d97706); flex: none; }
.lv-loose span { flex: 1; }
.lv-loose:hover { border-color: var(--vg-amber, #d97706); }

.lv-detail { display: flex; flex-direction: column; gap: 10px; overflow: hidden; }
.lv-tabs { display: flex; gap: 22px; }
.lv-tabs button { padding: 4px 0 8px; border: 0; border-bottom: 2px solid transparent; background: none; color: var(--theme-text-muted); font: inherit; font-size: 14px; font-weight: 600; cursor: pointer; }
.lv-tabs button span { margin-left: 6px; font-size: 12px; font-weight: 500; opacity: .75; font-variant-numeric: tabular-nums; }
.lv-tabs button.is-active { color: var(--theme-text); border-color: var(--vg-accent); }
.lv-tabs button.is-active span { color: var(--vg-accent); opacity: 1; }
.lv-rooms { display: flex; flex-direction: column; margin: 0 -10px; }
.lv-room { display: grid; grid-template-columns: 58px minmax(150px, 1.1fr) minmax(170px, 1.6fr) 96px 62px 108px 154px 18px; align-items: center; gap: 18px; padding: 13px 10px; border: 0; border-radius: 10px; background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer; transition: background .15s; }
.lv-room + .lv-room { box-shadow: 0 -1px 0 var(--theme-divider); }
.lv-room:hover, .lv-room:focus-visible { background: var(--theme-panel-soft); box-shadow: none; }
.lv-room > span { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.lv-room b { font-weight: 620; font-variant-numeric: tabular-nums; white-space: nowrap; }
.lv-room small { font-size: 11.5px; color: var(--theme-text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-variant-numeric: tabular-nums; }
.lv-room__date { align-items: center; padding: 6px 0; border-radius: 9px; background: var(--theme-panel-soft); }
.lv-room__date b { font-size: 14px; }
.lv-room__time b { font-size: 13.5px; }
.lv-room__gmv > span { display: flex; align-items: baseline; gap: 10px; }
.lv-room__gmv b { font-size: 16px; }
.lv-room__gmv em { font-size: 11.5px; font-style: normal; font-weight: 600; }
.lv-room__gmv i { height: 4px; border-radius: 2px; background: var(--theme-panel-soft); overflow: hidden; }
.lv-room:hover .lv-room__gmv i { background: var(--theme-border); }
.lv-room__gmv u { display: block; height: 100%; border-radius: 2px; background: var(--vg-accent); }
.lv-room__num b { font-size: 14px; }
.lv-room > .lv-room__best { flex-direction: row; gap: 5px; }
.lv-room__best > span { width: 34px; height: 34px; flex: none; display: grid; place-items: center; overflow: hidden; border-radius: 7px; background: var(--theme-panel-soft); color: var(--theme-text-muted); }
.lv-room__best img { width: 100%; height: 100%; object-fit: cover; }
.lv-room__go { color: var(--theme-text-muted); transition: transform .15s; }
.lv-room:hover .lv-room__go { transform: translateX(3px); color: var(--vg-accent); }
.lv-more { align-self: center; }

.lv-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.lv-table th { padding: 8px 10px; text-align: left; font-size: 12px; font-weight: 500; color: var(--theme-text-muted); white-space: nowrap; }
.lv-table td { padding: 10px; border-top: 1px solid var(--theme-divider); font-variant-numeric: tabular-nums; }
.lv-table tbody tr:hover { background: var(--theme-panel-soft); }
.lv-table .num { text-align: right; white-space: nowrap; }
.lv-rank { width: 34px; color: var(--theme-text-muted); }
.lv-prod { display: flex; align-items: center; gap: 12px; min-width: 0; }
.lv-prod img, .lv-ph { width: 42px; height: 42px; flex: none; border-radius: 8px; object-fit: cover; background: var(--theme-panel-soft); display: grid; place-items: center; color: var(--theme-text-muted); }
.lv-prod > span:last-child { min-width: 0; max-width: 360px; display: flex; flex-direction: column; gap: 2px; }
.lv-prod b { font-weight: 650; }
.lv-prod b.is-plain { font-weight: 500; }
.lv-prod b, .lv-prod small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lv-prod small { font-size: 11.5px; color: var(--theme-text-muted); }
.lv-scroll { overflow-x: auto; scrollbar-width: thin; }
.lv-table--styles .lv-prod > span:last-child { max-width: 190px; }
.lv-sort { cursor: pointer; user-select: none; }
.lv-sort span { display: inline-flex; align-items: center; gap: 3px; }
.lv-sort:hover, .lv-sort.is-active { color: var(--vg-accent) !important; }
.lv-track { display: block; width: 92px; height: 4px; margin: 5px 0 0 auto; border-radius: 2px; background: var(--theme-panel-soft); overflow: hidden; }
.lv-track i { display: block; height: 100%; border-radius: 2px; background: var(--vg-accent); }
.lv-tag { display: block; font-size: 11px; color: var(--theme-text-muted); }
.lv-tip { margin: 0; font-size: 12px; line-height: 1.6; color: var(--theme-text-muted); }
@media (max-width: 1240px) {
  .lv-room { grid-template-columns: 58px minmax(130px, 1fr) minmax(150px, 1.4fr) 90px 56px 18px; }
  .lv-room__best, .lv-room > .lv-room__num:nth-of-type(6) { display: none !important; }
  .lv-two { grid-template-columns: 1fr; gap: 20px; }
}
@media (max-width: 900px) {
  .lv-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .lv-kpi { border-top: 1px solid var(--theme-divider) !important; }
  .lv-styles { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .lv-room { grid-template-columns: 58px 1fr 1fr 18px; }
  .lv-room__num { display: none !important; }
  .lv-detail { overflow-x: auto; }
}
</style>
