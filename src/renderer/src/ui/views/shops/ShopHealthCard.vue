<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ChevronDown, ChevronRight, CircleCheck, CircleX } from 'lucide-vue-next'
import { indicatorPasses, type ShopHealth } from '../../../../../shared/shopAnalysis'
import { fmtIndicator, indicatorLabel } from '../../../../../shared/shopReportText'

/**
 * Seller-center service health. To-dos sit in one divided row; indicators that miss their target
 * come first and the passing ones fold into a single line, so a healthy shop reads as one sentence.
 */
const props = defineProps<{ health?: ShopHealth }>()
const emit = defineEmits<{ open: [path: string] }>()
const { t, locale } = useI18n()
const showAll = ref(false)

const lang = computed(() => (locale.value.startsWith('zh') ? 'zh' : locale.value.startsWith('vi') ? 'vi' : 'en') as 'zh' | 'en' | 'vi')
const failingList = computed(() => (props.health?.indicators || []).filter((item) => !indicatorPasses(item)))
const passingList = computed(() => (props.health?.indicators || []).filter((item) => indicatorPasses(item)))
const shown = computed(() => (showAll.value ? [...failingList.value, ...passingList.value] : failingList.value))
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

function target(item: ShopHealth['indicators'][number]) {
  return `${['ge', 'gt'].includes(item.operator) ? '≥' : '≤'} ${fmtIndicator(item.target, item.unit, lang.value)}`
}
</script>

<template>
  <section class="vg-card health" data-testid="shop-health">
    <header class="health__head">
      <h2 class="vg-section-title">{{ t('shops.health.title') }}</h2>
      <span v-if="health" class="health__status" :class="failingList.length ? 'is-warn' : 'is-ok'">
        <i></i>{{ failingList.length ? t('shops.health.failing', { n: failingList.length }) : t('shops.health.allPass') }}
      </span>
    </header>
    <p v-if="!health" class="vg-muted health__empty">{{ t('shops.health.empty') }}</p>
    <template v-else>
      <div class="health__todos">
        <button v-for="item in todos" :key="item.key" type="button" class="health__todo" @click="emit('open', item.path)">
          <span class="health__todo-label">{{ t(`shops.health.todo.${item.key}`) }}<ChevronRight :size="11" /></span>
          <strong :class="{ 'is-zero': !item.value }">{{ item.value }}</strong>
          <small v-if="item.urgent" class="health__urgent">{{ t('shops.health.urgent', { n: item.urgent }) }}</small>
        </button>
        <div class="health__todo">
          <span class="health__todo-label">{{ t('shops.health.violationScore') }}</span>
          <strong :class="health.violationScore > 0 ? 'is-bad' : 'is-zero'">{{ health.violationScore }}</strong>
          <small v-if="health.warnings" class="health__muted">{{ t('shops.health.warnings', { n: health.warnings }) }}</small>
        </div>
      </div>

      <div v-if="health.indicators.length" class="health__indicators">
        <div class="health__sub">{{ t('shops.health.indicators') }}</div>
        <ul v-if="shown.length" class="health__list">
          <li v-for="item in shown" :key="item.key" :class="{ 'is-fail': !indicatorPasses(item) }">
            <CircleCheck v-if="indicatorPasses(item)" :size="14" class="health__ok" /><CircleX v-else :size="14" class="health__bad" />
            <span class="health__name">{{ indicatorLabel(item, locale) }}</span>
            <strong class="health__value">{{ item.value === undefined ? '—' : fmtIndicator(item.value, item.unit, lang) }}</strong>
            <span class="health__target">{{ target(item) }}</span>
          </li>
        </ul>
        <button v-if="passingList.length" type="button" class="health__fold" @click="showAll = !showAll">
          <CircleCheck v-if="!showAll" :size="14" class="health__ok" />
          <span>{{ showAll ? t('shops.health.hide') : t('shops.health.othersPass', { n: passingList.length }) }}</span>
          <span v-if="!showAll" class="health__link">{{ t('shops.health.showAll') }}</span>
          <ChevronDown :size="13" :class="{ 'is-open': showAll }" />
        </button>
      </div>
    </template>
  </section>
</template>

<style scoped>
.health { display: flex; flex-direction: column; gap: 14px; }
.health__head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.health__status { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; }
.health__status i { width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
.health__status.is-ok { color: var(--vg-green, #16a34a); }
.health__status.is-warn { color: var(--vg-amber); }
.health__empty { margin: 0; font-size: 12px; }
.health__todos { display: grid; grid-template-columns: repeat(5, 1fr); border: 1px solid var(--theme-border); border-radius: 10px; overflow: hidden; }
.health__todo { display: flex; flex-direction: column; gap: 3px; padding: 10px 12px; border: 0; border-left: 1px solid var(--theme-divider); background: transparent; color: inherit; font: inherit; text-align: left; min-width: 0; }
.health__todo:first-child { border-left: 0; }
button.health__todo { cursor: pointer; transition: background .15s; }
button.health__todo:hover { background: var(--theme-panel-soft); }
.health__todo-label { display: inline-flex; align-items: center; gap: 2px; font-size: 11.5px; color: var(--theme-text-muted); white-space: nowrap; }
.health__todo-label svg { opacity: 0; transition: opacity .15s; }
button.health__todo:hover .health__todo-label svg { opacity: 1; }
.health__todo strong { font-size: 20px; font-weight: 600; line-height: 1.2; font-variant-numeric: tabular-nums; }
.health__todo strong.is-zero { color: var(--theme-text-muted); font-weight: 500; }
.health__todo strong.is-bad { color: var(--vg-red); }
.health__todo small { font-size: 11px; }
.health__urgent { color: var(--vg-red); font-weight: 600; }
.health__muted { color: var(--theme-text-muted); }
.health__indicators { display: flex; flex-direction: column; gap: 4px; }
.health__sub { font-size: 12px; font-weight: 600; color: var(--theme-text-muted); margin-bottom: 2px; }
.health__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.health__list li { display: grid; grid-template-columns: 16px 1fr auto 90px; align-items: center; gap: 8px; padding: 7px 2px; border-bottom: 1px solid var(--theme-divider); font-size: 12.5px; }
.health__list li.is-fail .health__name { color: var(--theme-text); font-weight: 600; }
.health__name { color: var(--theme-text-secondary); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.health__value { font-variant-numeric: tabular-nums; font-weight: 600; }
.health__list li.is-fail .health__value { color: var(--vg-amber); }
.health__target { text-align: right; font-size: 11.5px; color: var(--theme-text-muted); font-variant-numeric: tabular-nums; white-space: nowrap; }
.health__ok { color: var(--vg-green, #16a34a); flex-shrink: 0; }
.health__bad { color: var(--vg-red); flex-shrink: 0; }
.health__fold { display: flex; align-items: center; gap: 8px; padding: 8px 2px; border: 0; background: none; color: var(--theme-text-secondary); font: inherit; font-size: 12.5px; text-align: left; cursor: pointer; }
.health__fold > span:first-of-type { flex: 1; }
.health__link { color: var(--vg-accent); font-size: 12px; }
.health__fold svg:last-child { color: var(--theme-text-muted); transition: transform .15s; }
.health__fold svg.is-open { transform: rotate(180deg); }
@media (max-width: 960px) { .health__todos { grid-template-columns: repeat(3, 1fr); } .health__todo:nth-child(4) { border-left: 0; } }
</style>
