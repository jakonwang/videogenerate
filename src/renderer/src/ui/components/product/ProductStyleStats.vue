<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { BarChart3 } from 'lucide-vue-next'
import { ratesOf } from '../../../../../shared/productCards'
import type { CodeStatsDetail } from '../../../../../shared/productCodeStats'
import { formatMoney } from '../../views/product-research/productResearchUtils'

/** 这个款卖得怎么样：各店销量、漏斗、库存、毛利。数据按款号自动汇总。 */
const props = defineProps<{ code: string }>()
const { t } = useI18n()
const data = ref<CodeStatsDetail | null>(null)
const state = ref<'loading' | 'ready' | 'empty' | 'error'>('loading')

let request = 0
watch(() => props.code, async (code) => {
  const id = ++request
  state.value = 'loading'
  try {
    const next = await window.api.productCodes.detail(code)
    if (id !== request) return
    data.value = next
    state.value = next ? 'ready' : 'empty'
  } catch {
    if (id === request) state.value = 'error'
  }
}, { immediate: true })

const money = (value?: number) => formatMoney(value, data.value?.currency || '')
const num = (value?: number) => (value === undefined ? '-' : Math.round(value).toLocaleString())
const pct = (value?: number) => (value === undefined ? '-' : `${(value * 100).toFixed(value < 0.1 ? 1 : 0)}%`)
const change = computed(() => {
  const item = data.value
  if (!item || !item.unitsPrev7) return undefined
  return (item.units7 - item.unitsPrev7) / item.unitsPrev7
})
const rates = computed(() => (data.value?.funnel ? ratesOf(data.value.funnel) : undefined))
const funnel = computed(() => {
  const item = data.value?.funnel
  if (!item) return []
  return [
    { key: 'viewers', value: item.viewers, rate: undefined },
    { key: 'clicks', value: item.clickUsers, rate: rates.value?.ctr },
    { key: 'cart', value: item.cartUsers, rate: rates.value?.cartRate },
    { key: 'buyers', value: item.buyers, rate: rates.value?.cartToPay },
  ]
})
const peak = computed(() => Math.max(1, ...(data.value?.daily.map((day) => day.units) || [1])))
const low = computed(() => data.value && (data.value.risk === 'out' || data.value.risk === 'urgent' || data.value.risk === 'reorder'))
</script>

<template>
  <article class="vg-card pss" data-testid="product-style-stats">
    <div class="vg-card__head">
      <span class="vg-card__title"><BarChart3 :size="16" /> {{ t('productLibrary.style.title', { code }) }}</span>
      <span v-if="data?.rank30" class="pss-rank">{{ t('productLibrary.style.rank', { rank: data.rank30, share: pct(data.share30) }) }}</span>
    </div>
    <p v-if="state !== 'ready'" class="pss-empty">{{ t(`productLibrary.style.${state}`) }}</p>
    <template v-else-if="data">
      <div class="pss-kpis">
        <div><small>{{ t('productLibrary.style.units7') }}</small><b>{{ num(data.units7) }}</b><em v-if="change !== undefined" :class="change >= 0 ? 'is-up' : 'is-down'">{{ change >= 0 ? '+' : '' }}{{ pct(change) }}</em></div>
        <div><small>{{ t('productLibrary.style.units30') }}</small><b>{{ num(data.units30) }}</b></div>
        <div><small>{{ t('productLibrary.style.amount30') }}</small><b>{{ money(data.amount30) }}</b></div>
        <div><small>{{ t('productLibrary.style.stock') }}</small><b :class="{ 'is-down': low }">{{ num(data.stock) }}</b><em v-if="data.daysLeft !== undefined" :class="{ 'is-down': low }">{{ t('productLibrary.style.daysLeft', { days: Math.floor(data.daysLeft) }) }}</em></div>
        <div :title="t('productLibrary.style.profitHint')"><small>{{ t('productLibrary.style.profit') }}</small><b>{{ data.profit30 === undefined ? '-' : money(data.profit30) }}</b><em v-if="data.profit30 === undefined">{{ t(data.cost === undefined ? 'productLibrary.style.noCost' : 'productLibrary.style.noFee') }}</em></div>
      </div>
      <div class="pss-chart" role="img" :aria-label="t('productLibrary.style.trend')">
        <i v-for="day in data.daily" :key="day.date" :style="{ height: `${Math.max(2, (day.units / peak) * 100)}%` }" :class="{ 'is-zero': !day.units }" :title="`${day.date}：${day.units}`" />
      </div>
      <div class="pss-cols">
        <section>
          <h4>{{ t('productLibrary.style.byShop') }}</h4>
          <table class="pss-table">
            <thead><tr><th>{{ t('productLibrary.style.shop') }}</th><th>{{ t('productLibrary.style.units7') }}</th><th>{{ t('productLibrary.style.units30') }}</th><th>{{ t('productLibrary.style.amount30') }}</th></tr></thead>
            <tbody>
              <tr v-for="shop in data.shops" :key="shop.shopKey"><td>{{ shop.shopName }}<em v-if="!shop.listed">{{ t('productLibrary.style.notListed') }}</em></td><td>{{ num(shop.units7) }}</td><td>{{ num(shop.units30) }}</td><td>{{ money(shop.amount30) }}</td></tr>
            </tbody>
          </table>
        </section>
        <section>
          <h4>{{ t('productLibrary.style.funnel') }}</h4>
          <div v-if="funnel.length" class="pss-funnel">
            <div v-for="step in funnel" :key="step.key"><small>{{ t(`productLibrary.style.steps.${step.key}`) }}</small><b>{{ num(step.value) }}</b><em v-if="step.rate !== undefined">{{ pct(step.rate) }}</em></div>
          </div>
          <p v-else class="pss-empty">{{ t('productLibrary.style.noFunnel') }}</p>
        </section>
      </div>
      <p v-if="data.suggestQty" class="pss-tip">{{ t('productLibrary.style.restock', { qty: data.suggestQty }) }}</p>
    </template>
  </article>
</template>

<style scoped>
.pss { margin-bottom: 14px; }
.pss-rank { font-size: 12px; color: var(--vg-accent); }
.pss-empty { margin: 4px 0; font-size: 12px; color: var(--theme-text-muted); }
.pss-kpis { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; }
.pss-kpis > div { padding: 10px 12px; border: 1px solid var(--theme-border); border-radius: 8px; background: var(--theme-panel-soft); min-width: 0; }
.pss-kpis small, .pss-funnel small { display: block; font-size: 11px; color: var(--theme-text-muted); }
.pss-kpis b { font-size: 17px; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.pss-kpis em, .pss-funnel em { margin-left: 6px; font-style: normal; font-size: 11px; color: var(--theme-text-muted); }
.is-up { color: var(--theme-tone-green) !important; }
.is-down { color: var(--theme-tone-red) !important; }
.pss-chart { display: flex; align-items: flex-end; gap: 3px; height: 64px; margin: 14px 0 4px; }
.pss-chart i { flex: 1; min-width: 2px; border-radius: 2px 2px 0 0; background: var(--vg-accent); }
.pss-chart i.is-zero { background: var(--theme-border); }
.pss-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-top: 10px; }
.pss-cols h4 { margin: 0 0 8px; font-size: 12px; color: var(--theme-text-secondary); }
.pss-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.pss-table th { font-weight: 500; color: var(--theme-text-muted); text-align: right; padding: 4px 0; }
.pss-table td { text-align: right; padding: 6px 0; border-top: 1px solid var(--theme-divider); font-variant-numeric: tabular-nums; }
.pss-table th:first-child, .pss-table td:first-child { text-align: left; }
.pss-table em { margin-left: 6px; font-style: normal; font-size: 11px; color: var(--theme-tone-amber); }
.pss-funnel { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
.pss-funnel b { font-size: 15px; font-variant-numeric: tabular-nums; }
.pss-tip { margin: 12px 0 0; font-size: 12px; color: var(--theme-tone-amber); }
@media (max-width: 1100px) { .pss-kpis { grid-template-columns: repeat(3, minmax(0, 1fr)); } .pss-cols { grid-template-columns: 1fr; } }
</style>
