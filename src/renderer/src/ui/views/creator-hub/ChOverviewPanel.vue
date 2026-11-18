<script setup lang="ts">
import { computed } from 'vue'
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Clapperboard, ClipboardCheck, Clock3, Coins, LayoutDashboard, Package, ShoppingBag, TrendingUp, Users, Wallet } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import type { CreatorHubOverview, CreatorHubShop, CreatorHubShopOverview } from '../../../../../shared/creatorHub'
import { formatCount, formatDate, formatDateTime, formatMoney, formatPercent, rateTone } from './creatorHubFormat'

const props = defineProps<{ overview: CreatorHubOverview | null; shops: CreatorHubShop[]; showShops: boolean }>()
const emit = defineEmits<{ go: [target: 'samples-review' | 'samples-overdue' | 'costs' | 'shops' | 'fulfillment'] }>()
const { t } = useI18n()

const totals = computed(() => props.overview?.totals)
const shopNames = computed(() => new Map(props.shops.map((item) => [item.id, item])))
const expiredShops = computed(() => props.shops.filter((item) => item.loginState === 'expired'))
const neverSynced = computed(() => props.shops.filter((item) => !item.lastSyncAt))
const hasAnalytics = computed(() => Boolean(totals.value?.window))

function change(current?: number, previous?: number) {
  if (current == null || previous == null || previous === 0) return undefined
  return (current - previous) / previous
}

const kpis = computed(() => {
  const value = totals.value
  if (!value) return []
  return [
    { key: 'gmv', icon: TrendingUp, tone: '', label: t('creatorHub.overview.gmv'), value: formatMoney(value.gmv), delta: change(value.gmv, value.previousGmv) },
    { key: 'commission', icon: Coins, tone: 'violet', label: t('creatorHub.overview.commission'), value: formatMoney(value.commission), delta: change(value.commission, value.previousCommission) },
    { key: 'orders', icon: ShoppingBag, tone: 'blue', label: t('creatorHub.overview.orders'), value: formatCount(value.orders), delta: change(value.orders, value.previousOrders) },
    { key: 'refunds', icon: Wallet, tone: 'red', label: t('creatorHub.overview.refunds'), value: formatMoney(value.refundedGmv), delta: undefined },
    { key: 'videos', icon: Clapperboard, tone: 'blue', label: t('creatorHub.overview.content'), value: `${formatCount(value.videos)} / ${formatCount(value.lives)}`, delta: undefined },
    { key: 'creators', icon: Users, tone: 'amber', label: t('creatorHub.overview.creators'), value: `${formatCount(value.creatorsWithSales)} / ${formatCount(value.creatorsPosting)}`, delta: undefined },
  ]
})

const funnel = computed(() => {
  const f = totals.value?.sampleFunnel
  if (!f) return []
  const steps = [
    { label: t('creatorHub.overview.funnelApplications'), value: f.applications },
    { label: t('creatorHub.overview.funnelShipped'), value: f.shipped },
    { label: t('creatorHub.overview.funnelFulfilled'), value: f.fulfilled },
    { label: t('creatorHub.overview.funnelWithSales'), value: f.withSales },
  ]
  const max = Math.max(1, steps[0].value)
  return steps.map((step, index) => ({ ...step, width: Math.max(3, (step.value / max) * 100), rate: index ? (steps[index - 1].value ? step.value / steps[index - 1].value : undefined) : undefined }))
})

function shopRow(item: CreatorHubShopOverview) {
  return shopNames.value.get(item.shopId)
}
</script>

<template>
  <div class="vg-stack" data-testid="creator-hub-overview">
    <div v-if="!shops.length" class="vg-card vg-empty">
      <span class="vg-empty__icon"><LayoutDashboard :size="26" /></span>
      <h3>{{ t('creatorHub.overview.emptyTitle') }}</h3>
      <p>{{ t('creatorHub.noShopNotice') }}</p>
      <button class="vg-btn vg-btn--primary" @click="emit('go', 'shops')">{{ t('creatorHub.shops.add') }}</button>
    </div>
    <template v-else>
      <div class="vg-row ch-window-line">
        <span class="vg-muted" v-if="hasAnalytics">{{ t('creatorHub.overview.window', { start: formatDate(totals?.window?.start), end: formatDate((totals?.window?.end || 0) - 1) }) }}</span>
        <span class="vg-muted" v-else>{{ t('creatorHub.overview.noAnalytics') }}</span>
      </div>

      <div class="vg-stats">
        <div v-for="item in kpis" :key="item.key" class="vg-stat">
          <span class="vg-stat__icon" :class="item.tone && `vg-stat__icon--${item.tone}`"><component :is="item.icon" :size="17" /></span>
          <div class="vg-stat__body">
            <span class="vg-stat__label">{{ item.label }}</span>
            <span class="vg-stat__value">{{ item.value }}</span>
            <span v-if="item.delta != null" class="ch-delta" :class="item.delta >= 0 ? 'is-up' : 'is-down'">
              <ArrowUpRight v-if="item.delta >= 0" :size="12" /><ArrowDownRight v-else :size="12" />{{ formatPercent(Math.abs(item.delta)) }}
            </span>
          </div>
        </div>
      </div>

      <div class="ch-overview-grid">
        <section class="vg-card">
          <div class="vg-card__head"><span class="vg-card__title"><ClipboardCheck :size="16" />{{ t('creatorHub.overview.todoTitle') }}</span></div>
          <div class="vg-list">
            <button class="vg-list__item vg-list__item--button" @click="emit('go', 'samples-review')">
              <span class="vg-stat__icon vg-stat__icon--amber"><Package :size="15" /></span>
              <div class="vg-list__main"><span class="vg-list__title">{{ t('creatorHub.overview.todoReview') }}</span><span class="vg-list__sub">{{ t('creatorHub.overview.todoReviewHint') }}</span></div>
              <span class="vg-count">{{ totals?.pendingReview || 0 }}</span>
            </button>
            <button class="vg-list__item vg-list__item--button" @click="emit('go', 'samples-overdue')">
              <span class="vg-stat__icon vg-stat__icon--red"><AlertTriangle :size="15" /></span>
              <div class="vg-list__main"><span class="vg-list__title">{{ t('creatorHub.overview.todoOverdue') }}</span><span class="vg-list__sub">{{ t('creatorHub.overview.todoOverdueHint') }}</span></div>
              <span class="vg-count">{{ totals?.overdueSamples || 0 }}</span>
            </button>
            <button class="vg-list__item vg-list__item--button" @click="emit('go', 'samples-overdue')">
              <span class="vg-stat__icon vg-stat__icon--blue"><Clock3 :size="15" /></span>
              <div class="vg-list__main"><span class="vg-list__title">{{ t('creatorHub.overview.todoAwaiting') }}</span><span class="vg-list__sub">{{ t('creatorHub.overview.todoAwaitingHint') }}</span></div>
              <span class="vg-count">{{ totals?.awaitingContent || 0 }}</span>
            </button>
            <button class="vg-list__item vg-list__item--button" @click="emit('go', 'costs')">
              <span class="vg-stat__icon vg-stat__icon--violet"><Wallet :size="15" /></span>
              <div class="vg-list__main"><span class="vg-list__title">{{ t('creatorHub.overview.todoCost') }}</span><span class="vg-list__sub">{{ t('creatorHub.overview.todoCostHint') }}</span></div>
              <span class="vg-count">{{ totals?.productsMissingCost || 0 }}</span>
            </button>
            <button v-if="expiredShops.length || neverSynced.length" class="vg-list__item vg-list__item--button" @click="emit('go', 'shops')">
              <span class="vg-stat__icon vg-stat__icon--red"><AlertTriangle :size="15" /></span>
              <div class="vg-list__main"><span class="vg-list__title">{{ t('creatorHub.overview.todoShops') }}</span><span class="vg-list__sub">{{ [...expiredShops, ...neverSynced].map((item) => item.name).join(', ') }}</span></div>
              <span class="vg-count">{{ new Set([...expiredShops, ...neverSynced].map((item) => item.id)).size }}</span>
            </button>
          </div>
        </section>

        <section class="vg-card">
          <div class="vg-card__head">
            <span class="vg-card__title"><Package :size="16" />{{ t('creatorHub.overview.funnelTitle') }}</span>
            <button class="vg-link" @click="emit('go', 'fulfillment')">{{ t('creatorHub.overview.fulfillmentRate', { rate: formatPercent(totals?.fulfillmentRate) }) }}</button>
          </div>
          <div class="ch-funnel">
            <div v-for="step in funnel" :key="step.label" class="ch-funnel__row">
              <span class="ch-funnel__label">{{ step.label }}</span>
              <div class="ch-funnel__track"><div class="ch-funnel__bar" :style="{ width: `${step.width}%` }" /></div>
              <span class="ch-funnel__value vg-num">{{ formatCount(step.value) }}</span>
              <span class="ch-funnel__rate vg-muted vg-num">{{ step.rate != null ? formatPercent(step.rate) : '' }}</span>
            </div>
          </div>
          <p class="vg-muted ch-small">{{ t('creatorHub.overview.funnelHint') }}</p>
        </section>
      </div>

      <section v-if="showShops && overview?.shops.length" class="vg-card vg-card--flush">
        <div class="vg-card__head"><span class="vg-card__title"><LayoutDashboard :size="16" />{{ t('creatorHub.overview.byShop') }}</span></div>
        <div class="ch-table-scroll">
          <table class="vg-table vg-table--compact">
            <thead>
              <tr>
                <th>{{ t('creatorHub.shops.colShop') }}</th>
                <th class="num">{{ t('creatorHub.overview.gmv') }}</th>
                <th class="num">{{ t('creatorHub.overview.commission') }}</th>
                <th class="num">{{ t('creatorHub.overview.orders') }}</th>
                <th class="num">{{ t('creatorHub.overview.todoReview') }}</th>
                <th class="num">{{ t('creatorHub.overview.todoOverdue') }}</th>
                <th class="num">{{ t('creatorHub.tabs.fulfillment') }}</th>
                <th>{{ t('creatorHub.shops.colLogin') }}</th>
                <th>{{ t('creatorHub.shops.colSync') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in overview.shops" :key="item.shopId">
                <td>{{ shopRow(item)?.name || item.shopId }}</td>
                <td class="num">{{ formatMoney(item.gmv) }}</td>
                <td class="num">{{ formatMoney(item.commission) }}</td>
                <td class="num">{{ formatCount(item.orders) }}</td>
                <td class="num">{{ item.pendingReview }}</td>
                <td class="num"><span :class="{ 'ch-error-line': item.overdueSamples > 0 }">{{ item.overdueSamples }}</span></td>
                <td class="num"><span v-if="item.fulfillmentRate != null" class="vg-pill" :class="`vg-pill--${rateTone(item.fulfillmentRate)}`">{{ formatPercent(item.fulfillmentRate) }}</span><span v-else class="vg-muted">-</span></td>
                <td><span class="vg-pill vg-pill--dot" :class="shopRow(item)?.loginState === 'valid' ? 'vg-pill--green' : shopRow(item)?.loginState === 'expired' ? 'vg-pill--red' : 'vg-pill--amber'">{{ t(`creatorHub.login.${shopRow(item)?.loginState || 'none'}`) }}</span></td>
                <td class="vg-muted ch-nowrap">{{ formatDateTime(shopRow(item)?.lastSyncAt) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>
  </div>
</template>
