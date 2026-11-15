<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { CheckCircle2, Coins, Receipt, RotateCcw, Search, ShoppingBag, TrendingUp } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import type { CreatorHubOrder, CreatorHubShop } from '@/../../shared/creatorHub'
import { orderSummary } from '@/../../shared/creatorHubAnalytics'
import ChPager from './ChPager.vue'
import { formatCount, formatDateTime, formatMoney, formatPercent } from './creatorHubFormat'

const props = defineProps<{ orders: CreatorHubOrder[]; shops: CreatorHubShop[]; showShop: boolean; windowDays: number }>()
const { t } = useI18n()

const filters = reactive({ q: '', content: 'all', state: 'all' })
const view = ref<'orders' | 'creators'>('orders')
const page = ref(1)
const pageSize = ref(20)
const shopNames = computed(() => new Map(props.shops.map((item) => [item.id, item.name])))

function stateOf(order: CreatorHubOrder) {
  if (order.refundQuantity > 0 || order.returnQuantity > 0) return 'refunded'
  return order.settledAt ? 'settled' : 'unsettled'
}

const filtered = computed(() => {
  const q = filters.q.trim().toLowerCase()
  return props.orders.filter((order) => {
    if (filters.content !== 'all' && order.contentType !== filters.content) return false
    if (filters.state !== 'all' && stateOf(order) !== filters.state) return false
    if (q && !`${order.orderId} ${order.creatorHandle} ${order.creatorNickname} ${order.productTitle || ''} ${order.productId || ''}`.toLowerCase().includes(q)) return false
    return true
  })
})
const summary = computed(() => orderSummary(filtered.value))

const byCreator = computed(() => {
  const map = new Map<string, { key: string; shopId: string; handle: string; nickname: string; orders: number; amount: number; commission: number; refunded: number; video: number; live: number }>()
  for (const order of filtered.value) {
    const key = `${order.shopId}:${order.creatorId || order.creatorHandle}`
    let row = map.get(key)
    if (!row) { row = { key, shopId: order.shopId, handle: order.creatorHandle, nickname: order.creatorNickname, orders: 0, amount: 0, commission: 0, refunded: 0, video: 0, live: 0 }; map.set(key, row) }
    row.orders += 1
    row.amount += order.amount
    row.commission += order.actualCommission ?? order.estCommission
    if (stateOf(order) === 'refunded') row.refunded += 1
    if (order.contentType === 'video') row.video += 1
    if (order.contentType === 'live') row.live += 1
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount)
})

const rows = computed(() => (view.value === 'orders' ? filtered.value : byCreator.value))
const pagedOrders = computed(() => filtered.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value))
const pagedCreators = computed(() => byCreator.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value))
watch([filters, view], () => { page.value = 1 })

function stateTone(state: string) {
  return state === 'settled' ? 'vg-pill--green' : state === 'refunded' ? 'vg-pill--red' : 'vg-pill--amber'
}
</script>

<template>
  <div class="vg-stack" data-testid="creator-hub-orders">
    <div class="vg-stats">
      <div class="vg-stat"><span class="vg-stat__icon vg-stat__icon--blue"><ShoppingBag :size="17" /></span><div class="vg-stat__body"><span class="vg-stat__label">{{ t('creatorHub.orders.count') }}</span><span class="vg-stat__value">{{ formatCount(summary.orders) }}</span></div></div>
      <div class="vg-stat"><span class="vg-stat__icon"><TrendingUp :size="17" /></span><div class="vg-stat__body"><span class="vg-stat__label">{{ t('creatorHub.orders.amount') }}</span><span class="vg-stat__value">{{ formatMoney(summary.amount) }}</span></div></div>
      <div class="vg-stat"><span class="vg-stat__icon vg-stat__icon--violet"><Coins :size="17" /></span><div class="vg-stat__body"><span class="vg-stat__label">{{ t('creatorHub.orders.estCommission') }}</span><span class="vg-stat__value">{{ formatMoney(summary.estCommission) }}</span></div></div>
      <div class="vg-stat"><span class="vg-stat__icon"><CheckCircle2 :size="17" /></span><div class="vg-stat__body"><span class="vg-stat__label">{{ t('creatorHub.orders.actualCommission') }}</span><span class="vg-stat__value">{{ formatMoney(summary.actualCommission) }}</span></div></div>
      <div class="vg-stat"><span class="vg-stat__icon vg-stat__icon--amber"><Receipt :size="17" /></span><div class="vg-stat__body"><span class="vg-stat__label">{{ t('creatorHub.orders.adsCommission') }}</span><span class="vg-stat__value">{{ formatMoney(summary.adsCommission) }}</span></div></div>
      <div class="vg-stat"><span class="vg-stat__icon vg-stat__icon--red"><RotateCcw :size="17" /></span><div class="vg-stat__body"><span class="vg-stat__label">{{ t('creatorHub.orders.refunded') }}</span><span class="vg-stat__value">{{ formatCount(summary.refunded) }}<small>{{ formatPercent(summary.orders ? summary.refunded / summary.orders : undefined) }}</small></span></div></div>
    </div>

    <div class="vg-toolbar">
      <div class="vg-seg vg-seg--sm">
        <button class="vg-seg__btn" :class="{ 'is-active': view === 'orders' }" @click="view = 'orders'">{{ t('creatorHub.orders.viewOrders') }}</button>
        <button class="vg-seg__btn" :class="{ 'is-active': view === 'creators' }" @click="view = 'creators'">{{ t('creatorHub.orders.viewCreators') }}</button>
      </div>
      <div class="vg-search ch-search">
        <Search :size="15" />
        <input v-model="filters.q" class="vg-input" :placeholder="t('creatorHub.orders.search')" />
      </div>
      <select v-model="filters.content" class="vg-select" :aria-label="t('creatorHub.orders.colContent')">
        <option value="all">{{ t('creatorHub.orders.allContent') }}</option>
        <option value="video">{{ t('creatorHub.orders.content.video') }}</option>
        <option value="live">{{ t('creatorHub.orders.content.live') }}</option>
        <option value="showcase">{{ t('creatorHub.orders.content.showcase') }}</option>
        <option value="other">{{ t('creatorHub.orders.content.other') }}</option>
      </select>
      <select v-model="filters.state" class="vg-select" :aria-label="t('creatorHub.orders.colState')">
        <option value="all">{{ t('creatorHub.orders.allStates') }}</option>
        <option value="unsettled">{{ t('creatorHub.orders.state.unsettled') }}</option>
        <option value="settled">{{ t('creatorHub.orders.state.settled') }}</option>
        <option value="refunded">{{ t('creatorHub.orders.state.refunded') }}</option>
      </select>
      <span class="vg-toolbar__spacer" />
      <span class="vg-muted">{{ t('creatorHub.orders.windowHint', { days: windowDays }) }}</span>
    </div>

    <section class="vg-card vg-card--flush">
      <div v-if="!orders.length" class="vg-empty">
        <span class="vg-empty__icon"><Receipt :size="26" /></span>
        <h3>{{ t('creatorHub.orders.emptyTitle') }}</h3>
        <p>{{ t('creatorHub.videos.emptyDesc') }}</p>
      </div>
      <template v-else>
        <div class="ch-table-scroll">
          <table v-if="view === 'orders'" class="vg-table vg-table--compact">
            <thead>
              <tr>
                <th>{{ t('creatorHub.orders.colOrder') }}</th>
                <th>{{ t('creatorHub.samples.colProduct') }}</th>
                <th>{{ t('creatorHub.samples.colCreator') }}</th>
                <th v-if="showShop">{{ t('creatorHub.samples.colShop') }}</th>
                <th>{{ t('creatorHub.orders.colContent') }}</th>
                <th class="num">{{ t('creatorHub.orders.colAmount') }}</th>
                <th class="num">{{ t('creatorHub.orders.colRate') }}</th>
                <th class="num">{{ t('creatorHub.orders.estCommission') }}</th>
                <th class="num">{{ t('creatorHub.orders.actualCommission') }}</th>
                <th class="num">{{ t('creatorHub.orders.adsCommission') }}</th>
                <th>{{ t('creatorHub.orders.colState') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="order in pagedOrders" :key="order.id">
                <td><div class="vg-list__main"><span class="vg-list__title vg-num">{{ order.orderId }}</span><span class="vg-list__sub">{{ formatDateTime(order.createdAt) }}</span></div></td>
                <td><div class="vg-list__main ch-product"><span class="vg-list__title" :title="order.productTitle">{{ order.productTitle || order.productId || '-' }}</span><span class="vg-list__sub vg-num">SKU {{ order.skuId }}</span></div></td>
                <td><div class="vg-list__main"><span class="vg-list__title">{{ order.creatorNickname || order.creatorHandle || '-' }}</span><span class="vg-list__sub">@{{ order.creatorHandle }}</span></div></td>
                <td v-if="showShop" class="vg-muted">{{ shopNames.get(order.shopId) || '-' }}</td>
                <td><span class="vg-chip">{{ t(`creatorHub.orders.content.${order.contentType}`) }}</span></td>
                <td class="num ch-nowrap">{{ formatMoney(order.amount) }}<small v-if="order.quantity > 1" class="vg-muted"> x{{ order.quantity }}</small></td>
                <td class="num">{{ formatPercent(order.standardRate) }}</td>
                <td class="num">{{ formatMoney(order.estCommission) }}</td>
                <td class="num">{{ order.actualCommission != null ? formatMoney(order.actualCommission) : '-' }}</td>
                <td class="num">{{ formatMoney(order.estAdsCommission) }}</td>
                <td><span class="vg-pill vg-pill--dot" :class="stateTone(stateOf(order))">{{ t(`creatorHub.orders.state.${stateOf(order)}`) }}</span></td>
              </tr>
              <tr v-if="!pagedOrders.length"><td :colspan="showShop ? 11 : 10" class="vg-table__empty">{{ t('creatorHub.samples.noMatch') }}</td></tr>
            </tbody>
          </table>
          <table v-else class="vg-table vg-table--compact">
            <thead>
              <tr>
                <th>{{ t('creatorHub.samples.colCreator') }}</th>
                <th v-if="showShop">{{ t('creatorHub.samples.colShop') }}</th>
                <th class="num">{{ t('creatorHub.orders.count') }}</th>
                <th class="num">{{ t('creatorHub.orders.colAmount') }}</th>
                <th class="num">{{ t('creatorHub.orders.colCommissionTotal') }}</th>
                <th class="num">{{ t('creatorHub.orders.content.video') }} / {{ t('creatorHub.orders.content.live') }}</th>
                <th class="num">{{ t('creatorHub.orders.refunded') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in pagedCreators" :key="row.key">
                <td><div class="vg-list__main"><span class="vg-list__title">{{ row.nickname || row.handle || '-' }}</span><span class="vg-list__sub">@{{ row.handle }}</span></div></td>
                <td v-if="showShop" class="vg-muted">{{ shopNames.get(row.shopId) || '-' }}</td>
                <td class="num">{{ row.orders }}</td>
                <td class="num">{{ formatMoney(row.amount) }}</td>
                <td class="num">{{ formatMoney(row.commission) }}</td>
                <td class="num">{{ row.video }} / {{ row.live }}</td>
                <td class="num"><span :class="{ 'ch-error-line': row.refunded > 0 }">{{ row.refunded }}</span></td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="ch-pager-wrap"><ChPager v-model:page="page" v-model:page-size="pageSize" :total="rows.length" /></div>
      </template>
    </section>
  </div>
</template>
