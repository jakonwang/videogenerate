<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { Calculator, ChevronDown, CircleAlert, LoaderCircle } from 'lucide-vue-next'
import type { ShopProfit } from '../../../../../shared/shopProfit'
import { change, fmtChange, fmtMoney, fmtNumber, fmtPercent } from './shopFormat'

/** 利润: estimated payout after platform fees, minus product cost and ad spend, per day. */
const props = defineProps<{ shopKey: string; days: number; region?: string }>()
const { t, locale } = useI18n()
const router = useRouter()
const api = window.api.sellerInventory

const profit = ref<ShopProfit | null>(null)
const loading = ref(false)
const errorText = ref('')
const storeDraft = ref('')
const rateDraft = ref<number | null>(1)
const costDrafts = ref<Record<string, number | null>>({})
const savedCodes = ref<string[]>([])
const missingOpen = ref(true)

const totals = computed(() => profit.value?.totals)
const prev = computed(() => profit.value?.previousTotals)
const linkedStore = computed(() => profit.value?.adStores.find((store) => store.storeId === profit.value?.adLink?.storeId))
const draftStore = computed(() => profit.value?.adStores.find((store) => store.storeId === storeDraft.value))
const SHOP_CURRENCY: Record<string, string> = { VN: 'VND', TH: 'THB', MY: 'MYR', PH: 'PHP', ID: 'IDR', SG: 'SGD', US: 'USD', GB: 'GBP' }
const needsRate = computed(() => Boolean(draftStore.value?.currency && draftStore.value.currency !== SHOP_CURRENCY[(props.region || '').toUpperCase()]))
const hasLoss = computed(() => (profit.value?.days || []).some((day) => day.profit < 0))
const bars = computed(() => {
  const days = profit.value?.days || []
  const max = Math.max(1, ...days.map((day) => Math.abs(day.profit)))
  return days.map((day) => ({ ...day, height: Math.abs(day.profit) / max }))
})

function money(value: number | undefined, compact = true) {
  return fmtMoney(value, locale.value, props.region, compact)
}

async function load() {
  loading.value = true
  try {
    profit.value = await api.getShopProfit({ shopKey: props.shopKey, days: props.days })
    storeDraft.value = profit.value.adLink?.storeId || ''
    rateDraft.value = profit.value.adLink?.rate ?? 1
    errorText.value = ''
  } catch (error) {
    errorText.value = error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(error)
  } finally {
    loading.value = false
  }
}

async function saveLink() {
  await api.setAdLink({ shopKey: props.shopKey, storeId: storeDraft.value || undefined, rate: needsRate.value ? Number(rateDraft.value) : 1 })
  await load()
}

async function saveCost(code: string) {
  const value = costDrafts.value[code]
  if (value === null || value === undefined || !Number.isFinite(Number(value)) || Number(value) < 0) return
  await api.saveSkuSettings({ code, cost: Number(value) })
  savedCodes.value = [...savedCodes.value, code]
  await load()
}

watch(() => [props.shopKey, props.days], () => { void load() }, { immediate: true })
defineExpose({ reload: load })
</script>

<template>
  <section class="vg-card profit" data-testid="shop-profit">
    <header class="profit__head">
      <h2 class="vg-section-title">{{ t('shops.profit.title') }}</h2>
      <span class="profit__sub">{{ t('shops.profit.subtitle') }}</span>
    </header>
    <div v-if="errorText" class="vg-notice vg-notice--danger"><span>{{ errorText }}</span></div>
    <div v-if="loading && !profit" class="vg-empty"><LoaderCircle :size="20" class="vg-spin" /></div>

    <template v-if="profit && totals && prev">
      <div v-if="profit.feeRate === undefined" class="profit__empty" data-testid="profit-empty">
        <span class="profit__empty-icon"><Calculator :size="18" /></span>
        <div>
          <strong>{{ t('shops.profit.emptyTitle') }}</strong>
          <p>{{ t('shops.profit.emptyDesc') }}</p>
        </div>
      </div>

      <template v-else>
        <div class="profit__eq">
          <div class="profit__term">
            <span>{{ t('shops.metric.gmv') }}</span>
            <strong>{{ money(totals.gmv) }}</strong>
            <small>&nbsp;</small>
          </div>
          <div class="profit__term">
            <span><b class="profit__sign">−</b>{{ t('shops.profit.fees') }}</span>
            <strong>{{ money(totals.fees) }}</strong>
            <small :title="t('shops.profit.feeRate', { rate: fmtPercent(profit.feeRate, locale, 1), n: fmtNumber(profit.feeSample, locale) })">{{ t('shops.profit.feeRate', { rate: fmtPercent(profit.feeRate, locale, 1), n: fmtNumber(profit.feeSample, locale) }) }}</small>
          </div>
          <div class="profit__term">
            <span><b class="profit__sign">−</b>{{ t('shops.profit.cogs') }}</span>
            <strong>{{ money(totals.cogs) }}</strong>
            <small :class="{ 'profit__warn': (totals.costCoverage ?? 1) < 0.9 }">{{ t('shops.profit.coverage', { value: fmtPercent(totals.costCoverage ?? 0, locale, 0) }) }}</small>
          </div>
          <div class="profit__term">
            <span><b class="profit__sign">−</b>{{ t('shops.profit.ads') }}</span>
            <strong>{{ money(totals.adSpend) }}</strong>
            <small>{{ linkedStore ? linkedStore.storeName : t('shops.profit.noAds') }}</small>
          </div>
          <div class="profit__term profit__term--result" :class="{ 'is-neg': totals.profit < 0 }">
            <span><b class="profit__sign">=</b>{{ t('shops.profit.estimated') }}</span>
            <strong>{{ money(totals.profit, false) }}</strong>
            <small>{{ t('shops.profit.margin', { value: fmtPercent(totals.margin, locale, 1) }) }}<template v-if="change(totals.profit, prev.profit) !== undefined && prev.profit > 0"> · {{ fmtChange(change(totals.profit, prev.profit)) }} {{ t('shops.vsPrevPeriod') }}</template></small>
          </div>
        </div>

        <div class="profit__chart">
          <span class="profit__label">{{ t('shops.profit.daily') }}</span>
          <div class="profit__bars" :class="{ 'has-neg': hasLoss }" :aria-label="t('shops.profit.daily')">
            <div v-for="day in bars" :key="day.date" class="profit__bar" :title="`${day.date}  ${money(day.profit, false)}`">
              <span class="profit__bar-pos"><i v-if="day.profit > 0" :style="{ height: `${Math.max(day.height * 100, 2)}%` }"></i></span>
              <span class="profit__bar-neg"><i v-if="day.profit < 0" :style="{ height: `${Math.max(day.height * 100, 2)}%` }"></i></span>
            </div>
          </div>
        </div>
      </template>

      <div class="profit__grid">
        <div class="profit__block">
          <span class="profit__label">{{ t('shops.profit.adTitle') }}</span>
          <p v-if="!profit.adStores.length" class="profit__text">{{ t('shops.profit.noGmvMax') }}</p>
          <div v-else class="profit__row">
            <select v-model="storeDraft" class="vg-select vg-select--sm profit__select" data-testid="profit-ad-store">
              <option value="">{{ t('shops.profit.noLink') }}</option>
              <option v-for="store in profit.adStores" :key="store.storeId" :value="store.storeId">{{ store.storeName }} · {{ store.advertiserName }}{{ store.currency ? ` (${store.currency})` : '' }}{{ store.suggested ? ` · ${t('shops.profit.suggested')}` : '' }}</option>
            </select>
            <label v-if="needsRate" class="profit__rate">{{ t('shops.profit.rate', { from: draftStore?.currency, to: SHOP_CURRENCY[(region || '').toUpperCase()] || '' }) }}<input v-model.number="rateDraft" class="vg-input vg-input--sm" type="number" min="0" step="any" /></label>
            <button type="button" class="vg-btn vg-btn--sm" data-testid="profit-ad-save" @click="saveLink">{{ t('shops.profit.saveLink') }}</button>
          </div>
          <small v-if="profit.adLink && !linkedStore" class="profit__warn">{{ t('shops.profit.linkMissing') }}</small>
        </div>
        <div class="profit__block">
          <span class="profit__label">{{ t('shops.profit.settlementTitle') }}</span>
          <p class="profit__text">{{ t('shops.profit.pending', { n: fmtNumber(profit.pending.count, locale), amount: money(profit.pending.settlement, false) }) }}</p>
          <p class="profit__text">{{ t('shops.profit.settled', { n: fmtNumber(profit.settledRecent.count, locale), amount: money(profit.settledRecent.settlement, false) }) }}</p>
        </div>
      </div>

      <div v-if="profit.missingCost.length" class="profit__missing" data-testid="profit-missing-cost">
        <button type="button" class="profit__missing-head" @click="missingOpen = !missingOpen">
          <CircleAlert :size="14" />
          <strong>{{ t('shops.profit.missingTitle', { n: profit.missingCost.length }) }}</strong>
          <span>{{ t('shops.profit.missingHint') }}</span>
          <ChevronDown :size="14" :class="{ 'is-open': missingOpen }" />
        </button>
        <table v-if="missingOpen" class="vg-table vg-table--compact profit__table">
          <thead><tr><th>SKU</th><th class="num">{{ t('shops.profit.units30') }}</th><th class="num">{{ t('shops.profit.amount30') }}</th><th class="num">{{ t('shops.profit.unitCost') }}</th></tr></thead>
          <tbody>
            <tr v-for="item in profit.missingCost.slice(0, 10)" :key="item.code">
              <td>
                <div class="profit__sku">
                  <strong>{{ item.code }}</strong>
                  <small v-if="item.name && item.name !== item.code" class="vg-ellipsis">{{ item.name }}</small>
                </div>
              </td>
              <td class="num">{{ fmtNumber(item.units, locale) }}</td>
              <td class="num">{{ money(item.amount) }}</td>
              <td class="num"><input v-model.number="costDrafts[item.code]" class="vg-input vg-input--sm profit__cost" type="number" min="0" step="any" :placeholder="t('shops.profit.costPlaceholder')" :data-testid="`profit-cost-${item.code}`" @change="saveCost(item.code)" /></td>
            </tr>
          </tbody>
        </table>
        <button v-if="missingOpen && profit.missingCost.length > 10" type="button" class="vg-link profit__more" @click="router.push('/plugins/seller-inventory')">{{ t('shops.profit.moreInSales') }}</button>
      </div>
      <p class="profit__note">{{ t('shops.profit.note') }}</p>
    </template>
  </section>
</template>

<style scoped>
.profit { display: flex; flex-direction: column; gap: 16px; }
.profit__head { display: flex; align-items: baseline; gap: 10px; }
.profit__sub { font-size: 12px; color: var(--theme-text-muted); }
.profit__label { font-size: 12px; font-weight: 600; color: var(--theme-text-muted); }
.profit__text { margin: 0; font-size: 12.5px; color: var(--theme-text-secondary); line-height: 1.6; }
.profit__note { margin: 0; font-size: 11.5px; color: var(--theme-text-muted); }
.profit__warn { color: var(--vg-amber) !important; font-weight: 600; }
.profit__empty { display: flex; gap: 12px; align-items: flex-start; padding: 14px 16px; border: 1px dashed var(--theme-border); border-radius: 10px; }
.profit__empty-icon { width: 34px; height: 34px; flex-shrink: 0; border-radius: 9px; display: inline-flex; align-items: center; justify-content: center; background: var(--theme-panel-soft); color: var(--theme-text-muted); }
.profit__empty strong { font-size: 13.5px; }
.profit__empty p { margin: 4px 0 0; font-size: 12.5px; line-height: 1.6; color: var(--theme-text-muted); max-width: 720px; }
.profit__eq { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)) minmax(0, 1.3fr); align-items: stretch; border: 1px solid var(--theme-border); border-radius: 10px; overflow: hidden; }
.profit__term { display: flex; flex-direction: column; gap: 3px; padding: 12px 14px; min-width: 0; }
.profit__term span { font-size: 12px; color: var(--theme-text-muted); }
.profit__term strong { font-size: 18px; font-weight: 600; font-variant-numeric: tabular-nums; line-height: 1.25; white-space: nowrap; }
.profit__term small { font-size: 11px; color: var(--theme-text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.profit__term + .profit__term { border-left: 1px solid var(--theme-divider); }
.profit__sign { display: inline-block; width: 12px; margin-right: 2px; font-weight: 600; color: var(--theme-text-muted); }
.profit__term--result { background: color-mix(in srgb, var(--vg-green, #16a34a) 8%, transparent); border-left: 1px solid var(--theme-divider); }
.profit__term--result strong { font-size: 22px; color: var(--vg-green, #16a34a); }
.profit__term--result.is-neg { background: color-mix(in srgb, var(--vg-red) 8%, transparent); }
.profit__term--result.is-neg strong { color: var(--vg-red); }
.profit__chart { display: flex; flex-direction: column; gap: 8px; }
.profit__bars { display: flex; justify-content: space-between; gap: 4px; height: 64px; }
.profit__bars:not(.has-neg) .profit__bar-neg { display: none; }
.profit__bars.has-neg { height: 96px; }
.profit__bar { flex: 1; max-width: 22px; display: flex; flex-direction: column; }
.profit__bar-pos, .profit__bar-neg { flex: 1; display: flex; }
.profit__bar-pos { align-items: flex-end; border-bottom: 1px solid var(--theme-divider); }
.profit__bar-neg { align-items: flex-start; }
.profit__bar i { display: block; width: 100%; }
.profit__bar-pos i { background: color-mix(in srgb, var(--vg-green, #16a34a) 55%, transparent); border-radius: 3px 3px 0 0; }
.profit__bar-neg i { background: color-mix(in srgb, var(--vg-red) 55%, transparent); border-radius: 0 0 3px 3px; }
.profit__bar:hover i { filter: brightness(1.25); }
.profit__grid { display: grid; grid-template-columns: 1fr 1fr; border-top: 1px solid var(--theme-divider); padding-top: 14px; }
.profit__block { display: flex; flex-direction: column; gap: 8px; min-width: 0; padding-right: 16px; }
.profit__block + .profit__block { padding: 0 0 0 16px; border-left: 1px solid var(--theme-divider); }
.profit__row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.profit__select { max-width: 320px; flex: 1; }
.profit__rate { display: flex; align-items: center; gap: 6px; font-size: 12px; }
.profit__rate input { width: 110px; }
.profit__missing { display: flex; flex-direction: column; border: 1px solid color-mix(in srgb, var(--vg-amber) 35%, var(--theme-border)); border-radius: 10px; padding: 0 12px; }
.profit__missing-head { display: flex; align-items: center; gap: 8px; padding: 10px 0; border: 0; background: none; color: inherit; font: inherit; text-align: left; cursor: pointer; min-width: 0; }
.profit__missing-head > svg:first-child { color: var(--vg-amber); flex-shrink: 0; }
.profit__missing-head strong { font-size: 13px; white-space: nowrap; }
.profit__missing-head span { flex: 1; font-size: 12px; color: var(--theme-text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.profit__missing-head > svg:last-child { flex-shrink: 0; color: var(--theme-text-muted); transition: transform .15s; }
.profit__missing-head > svg.is-open { transform: rotate(180deg); }
.profit__table { margin-bottom: 8px; }
.profit__missing .num { text-align: right; font-variant-numeric: tabular-nums; }
.profit__sku { display: flex; flex-direction: column; min-width: 0; max-width: 320px; }
.profit__sku small { font-size: 11px; color: var(--theme-text-muted); }
.profit__cost { width: 120px; }
.profit__more { align-self: flex-start; margin-bottom: 10px; }
@media (max-width: 1100px) {
  .profit__eq { grid-template-columns: 1fr 1fr; }
  .profit__term:nth-child(odd) { border-left: 0; }
  .profit__term:nth-child(n + 3) { border-top: 1px solid var(--theme-divider); }
  .profit__term--result { grid-column: 1 / -1; border-left: 0; border-top: 1px solid var(--theme-divider); }
  .profit__grid { grid-template-columns: 1fr; gap: 14px; }
  .profit__block { padding-right: 0; }
  .profit__block + .profit__block { padding: 14px 0 0; border-left: 0; border-top: 1px solid var(--theme-divider); }
}
</style>
