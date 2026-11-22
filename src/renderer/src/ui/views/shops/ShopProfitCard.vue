<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { CircleAlert, LoaderCircle } from 'lucide-vue-next'
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

const totals = computed(() => profit.value?.totals)
const prev = computed(() => profit.value?.previousTotals)
const linkedStore = computed(() => profit.value?.adStores.find((store) => store.storeId === profit.value?.adLink?.storeId))
const draftStore = computed(() => profit.value?.adStores.find((store) => store.storeId === storeDraft.value))
const SHOP_CURRENCY: Record<string, string> = { VN: 'VND', TH: 'THB', MY: 'MYR', PH: 'PHP', ID: 'IDR', SG: 'SGD', US: 'USD', GB: 'GBP' }
const needsRate = computed(() => Boolean(draftStore.value?.currency && draftStore.value.currency !== SHOP_CURRENCY[(props.region || '').toUpperCase()]))
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
    <div class="profit__head">
      <h2 class="vg-section-title">{{ t('shops.profit.title') }}</h2>
      <span class="vg-muted profit__small">{{ t('shops.profit.formula') }}</span>
    </div>
    <div v-if="errorText" class="vg-notice vg-notice--danger"><span>{{ errorText }}</span></div>
    <div v-if="loading && !profit" class="vg-empty"><LoaderCircle :size="20" class="vg-spin" /></div>

    <template v-if="profit && totals && prev">
      <div class="profit__kpis">
        <div class="profit__kpi profit__kpi--main" :class="{ 'is-neg': totals.profit < 0 }">
          <span>{{ t('shops.profit.estimated') }}</span>
          <strong>{{ profit.feeRate === undefined ? '—' : money(totals.profit, false) }}</strong>
          <small v-if="profit.feeRate !== undefined">{{ t('shops.profit.margin', { value: fmtPercent(totals.margin, locale, 1) }) }}<template v-if="change(totals.profit, prev.profit) !== undefined && prev.profit > 0"> · {{ fmtChange(change(totals.profit, prev.profit)) }} {{ t('shops.vsPrevPeriod') }}</template></small>
        </div>
        <div class="profit__kpi"><span>{{ t('shops.metric.gmv') }}</span><strong>{{ money(totals.gmv) }}</strong></div>
        <div class="profit__kpi">
          <span>{{ t('shops.profit.fees') }}</span><strong>−{{ money(totals.fees) }}</strong>
          <small>{{ profit.feeRate === undefined ? t('shops.profit.feeUnknown') : t('shops.profit.feeRate', { rate: fmtPercent(profit.feeRate, locale, 1), n: fmtNumber(profit.feeSample, locale) }) }}</small>
        </div>
        <div class="profit__kpi">
          <span>{{ t('shops.profit.cogs') }}</span><strong>−{{ money(totals.cogs) }}</strong>
          <small :class="{ 'profit__warn': (totals.costCoverage ?? 1) < 0.9 }">{{ t('shops.profit.coverage', { value: fmtPercent(totals.costCoverage ?? 0, locale, 0) }) }}</small>
        </div>
        <div class="profit__kpi">
          <span>{{ t('shops.profit.ads') }}</span><strong>−{{ money(totals.adSpend) }}</strong>
          <small>{{ linkedStore ? linkedStore.storeName : t('shops.profit.noAds') }}</small>
        </div>
      </div>

      <div v-if="profit.feeRate !== undefined" class="profit__bars" :aria-label="t('shops.profit.daily')">
        <div v-for="day in bars" :key="day.date" class="profit__bar" :title="`${day.date}  ${money(day.profit, false)}`">
          <span class="profit__bar-pos"><i v-if="day.profit >= 0" :style="{ height: `${day.height * 100}%` }"></i></span>
          <span class="profit__bar-neg"><i v-if="day.profit < 0" :style="{ height: `${day.height * 100}%` }"></i></span>
        </div>
      </div>

      <div class="profit__grid">
        <div class="profit__block">
          <h3>{{ t('shops.profit.adTitle') }}</h3>
          <p v-if="!profit.adStores.length" class="vg-muted profit__small">{{ t('shops.profit.noGmvMax') }}</p>
          <template v-else>
            <select v-model="storeDraft" class="vg-select vg-select--sm" data-testid="profit-ad-store">
              <option value="">{{ t('shops.profit.noLink') }}</option>
              <option v-for="store in profit.adStores" :key="store.storeId" :value="store.storeId">{{ store.storeName }} · {{ store.advertiserName }}{{ store.currency ? ` (${store.currency})` : '' }}{{ store.suggested ? ` · ${t('shops.profit.suggested')}` : '' }}</option>
            </select>
            <label v-if="needsRate" class="profit__rate">{{ t('shops.profit.rate', { from: draftStore?.currency, to: SHOP_CURRENCY[(region || '').toUpperCase()] || '' }) }}<input v-model.number="rateDraft" class="vg-input vg-input--sm" type="number" min="0" step="any" /></label>
            <button type="button" class="vg-btn vg-btn--sm" data-testid="profit-ad-save" @click="saveLink">{{ t('shops.profit.saveLink') }}</button>
            <small v-if="profit.adLink && !linkedStore" class="vg-muted">{{ t('shops.profit.linkMissing') }}</small>
          </template>
        </div>
        <div class="profit__block">
          <h3>{{ t('shops.profit.settlementTitle') }}</h3>
          <p class="profit__small">{{ t('shops.profit.pending', { n: fmtNumber(profit.pending.count, locale), amount: money(profit.pending.settlement, false) }) }}</p>
          <p class="profit__small">{{ t('shops.profit.settled', { n: fmtNumber(profit.settledRecent.count, locale), amount: money(profit.settledRecent.settlement, false) }) }}</p>
        </div>
      </div>

      <div v-if="profit.missingCost.length" class="profit__missing" data-testid="profit-missing-cost">
        <h3><CircleAlert :size="14" /> {{ t('shops.profit.missingTitle', { n: profit.missingCost.length }) }}</h3>
        <p class="vg-muted profit__small">{{ t('shops.profit.missingHint') }}</p>
        <table class="vg-table vg-table--compact">
          <thead><tr><th>SKU</th><th class="num">{{ t('shops.profit.units30') }}</th><th class="num">{{ t('shops.profit.amount30') }}</th><th>{{ t('shops.profit.unitCost') }}</th></tr></thead>
          <tbody>
            <tr v-for="item in profit.missingCost.slice(0, 10)" :key="item.code">
              <td><strong>{{ item.code }}</strong> <small class="vg-muted vg-ellipsis profit__name">{{ item.name }}</small></td>
              <td class="num">{{ fmtNumber(item.units, locale) }}</td>
              <td class="num">{{ money(item.amount) }}</td>
              <td><input v-model.number="costDrafts[item.code]" class="vg-input vg-input--sm profit__cost" type="number" min="0" step="any" :placeholder="t('shops.profit.costPlaceholder')" :data-testid="`profit-cost-${item.code}`" @change="saveCost(item.code)" /></td>
            </tr>
          </tbody>
        </table>
        <button v-if="profit.missingCost.length > 10" type="button" class="vg-link" @click="router.push('/plugins/seller-inventory')">{{ t('shops.profit.moreInSales') }}</button>
      </div>
      <p class="vg-muted profit__small">{{ t('shops.profit.note') }}</p>
    </template>
  </section>
</template>

<style scoped>
.profit { display: flex; flex-direction: column; gap: 12px; }
.profit__head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
.profit__small { font-size: 12px; margin: 0; }
.profit__kpis { display: grid; grid-template-columns: 1.4fr repeat(4, 1fr); gap: 10px; }
.profit__kpi { display: flex; flex-direction: column; gap: 2px; padding: 10px 12px; border: 1px solid var(--theme-border); border-radius: 8px; min-width: 0; }
.profit__kpi span { font-size: 12px; color: var(--theme-text-muted); }
.profit__kpi strong { font-size: 18px; font-variant-numeric: tabular-nums; }
.profit__kpi small { font-size: 11px; color: var(--theme-text-muted); }
.profit__kpi--main { border-color: color-mix(in srgb, var(--vg-green, #16a34a) 50%, var(--theme-border)); }
.profit__kpi--main strong { font-size: 24px; color: var(--vg-green, #16a34a); }
.profit__kpi--main.is-neg { border-color: color-mix(in srgb, var(--vg-red) 50%, var(--theme-border)); }
.profit__kpi--main.is-neg strong { color: var(--vg-red); }
.profit__warn { color: var(--vg-amber) !important; font-weight: 600; }
.profit__bars { display: flex; gap: 2px; height: 90px; }
.profit__bar { flex: 1; display: flex; flex-direction: column; }
.profit__bar-pos, .profit__bar-neg { flex: 1; display: flex; }
.profit__bar-pos { align-items: flex-end; border-bottom: 1px solid var(--theme-divider); }
.profit__bar-neg { align-items: flex-start; }
.profit__bar i { display: block; width: 100%; border-radius: 2px; }
.profit__bar-pos i { background: var(--vg-green, #16a34a); }
.profit__bar-neg i { background: var(--vg-red); }
.profit__grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.profit__block { display: flex; flex-direction: column; gap: 6px; padding: 10px 12px; border: 1px solid var(--theme-border); border-radius: 8px; align-items: flex-start; }
.profit__block h3, .profit__missing h3 { margin: 0; font-size: 13px; display: flex; align-items: center; gap: 6px; }
.profit__rate { display: flex; align-items: center; gap: 6px; font-size: 12px; }
.profit__rate input { width: 110px; }
.profit__missing { display: flex; flex-direction: column; gap: 6px; }
.profit__missing h3 { color: var(--vg-amber); }
.profit__missing .num { text-align: right; font-variant-numeric: tabular-nums; }
.profit__name { display: inline-block; max-width: 260px; vertical-align: bottom; }
.profit__cost { width: 120px; }
@media (max-width: 1100px) { .profit__kpis { grid-template-columns: repeat(2, 1fr); } .profit__grid { grid-template-columns: 1fr; } }
</style>
