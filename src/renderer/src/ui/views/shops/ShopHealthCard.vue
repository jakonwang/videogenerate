<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { CircleCheck, CircleX } from 'lucide-vue-next'
import { indicatorPasses, type ShopHealth } from '../../../../../shared/shopAnalysis'
import { fmtIndicator, indicatorLabel } from '../../../../../shared/shopReportText'

/** Seller-center service health: to-dos, violation points and every indicator against its target. */
const props = defineProps<{ health?: ShopHealth }>()
const emit = defineEmits<{ open: [path: string] }>()
const { t, locale } = useI18n()

const lang = computed(() => (locale.value.startsWith('zh') ? 'zh' : locale.value.startsWith('vi') ? 'vi' : 'en') as 'zh' | 'en' | 'vi')
const failing = computed(() => (props.health?.indicators || []).filter((item) => !indicatorPasses(item)).length)
const todos = computed(() => {
  const todo = props.health?.todo
  if (!todo) return []
  return [
    { key: 'toShip', value: todo.toShip, urgent: todo.urgentToShip, path: '/order?selected_sort=11&tab=to_ship' },
    { key: 'returns', value: todo.returns, urgent: todo.urgentReturns, path: '/order/return?subTab=all&tab=to_process' },
    { key: 'negativeReviews', value: todo.negativeReviews, urgent: 0, path: '/product/rating?ratings=1%2C2' },
    { key: 'outOfStock', value: todo.outOfStock, urgent: 0, path: '/product/stock?search_filter_status=1&tab_id=alert' },
  ]
})
</script>

<template>
  <section class="vg-card health" data-testid="shop-health">
    <div class="health__head">
      <h2 class="vg-section-title">{{ t('shops.health.title') }}</h2>
      <span v-if="health" class="vg-pill" :class="failing ? 'vg-pill--amber' : 'vg-pill--green'">{{ failing ? t('shops.health.failing', { n: failing }) : t('shops.health.allPass') }}</span>
    </div>
    <p v-if="!health" class="vg-muted health__empty">{{ t('shops.health.empty') }}</p>
    <template v-else>
      <div class="health__todos">
        <button v-for="item in todos" :key="item.key" type="button" class="health__todo" @click="emit('open', item.path)">
          <span class="vg-muted">{{ t(`shops.health.todo.${item.key}`) }}</span>
          <strong>{{ item.value }}</strong>
          <small v-if="item.urgent" class="health__urgent">{{ t('shops.health.urgent', { n: item.urgent }) }}</small>
        </button>
        <div class="health__todo">
          <span class="vg-muted">{{ t('shops.health.violationScore') }}</span>
          <strong :class="{ 'health__bad': health.violationScore > 0 }">{{ health.violationScore }}</strong>
          <small v-if="health.warnings" class="vg-muted">{{ t('shops.health.warnings', { n: health.warnings }) }}</small>
        </div>
      </div>
      <table class="vg-table vg-table--compact health__table">
        <thead><tr><th>{{ t('shops.health.indicator') }}</th><th class="num">{{ t('shops.health.value') }}</th><th class="num">{{ t('shops.health.target') }}</th><th></th></tr></thead>
        <tbody>
          <tr v-for="item in health.indicators" :key="item.key" :class="{ 'is-fail': !indicatorPasses(item) }">
            <td>{{ indicatorLabel(item, locale) }}</td>
            <td class="num">{{ item.value === undefined ? '—' : fmtIndicator(item.value, item.unit, lang) }}</td>
            <td class="num vg-muted">{{ ['ge', 'gt'].includes(item.operator) ? '≥' : '≤' }} {{ fmtIndicator(item.target, item.unit, lang) }}</td>
            <td><CircleCheck v-if="indicatorPasses(item)" :size="14" class="health__ok" /><CircleX v-else :size="14" class="health__bad" /></td>
          </tr>
        </tbody>
      </table>
    </template>
  </section>
</template>

<style scoped>
.health { display: flex; flex-direction: column; gap: 12px; }
.health__head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.health__empty { margin: 0; font-size: 12px; }
.health__todos { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; }
.health__todo { display: flex; flex-direction: column; gap: 2px; padding: 8px 10px; border: 1px solid var(--theme-border); border-radius: 8px; background: transparent; color: inherit; font: inherit; text-align: left; }
button.health__todo { cursor: pointer; }
button.health__todo:hover { border-color: var(--vg-accent); }
.health__todo span { font-size: 11px; }
.health__todo strong { font-size: 18px; font-variant-numeric: tabular-nums; }
.health__todo small { font-size: 11px; }
.health__urgent { color: var(--vg-red); font-weight: 600; }
.health__table .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.health__table tr.is-fail td:first-child { color: var(--vg-amber); font-weight: 600; }
.health__ok { color: var(--vg-green, #16a34a); }
.health__bad { color: var(--vg-red); }
@media (max-width: 960px) { .health__todos { grid-template-columns: repeat(2, 1fr); } }
</style>
