<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { FileImage, Search, X } from 'lucide-vue-next'
import type { LiveRoomView } from '../../../../../shared/liveAccounts'
import { formatMoney } from '../product-research/productResearchUtils'
import { fmtNumber, fmtPercent } from './shopFormat'
import { per, sumRooms, type LiveKpis } from './liveAnalysis'

/** 一场直播的详情：和平均水平比，再看每个商品。 */
const props = defineProps<{ room: LiveRoomView; average: LiveKpis; when: string }>()
const emit = defineEmits<{ close: [] }>()
const { t, locale } = useI18n()
const onlySold = ref(true)
const query = ref('')

const own = computed(() => sumRooms([props.room]))
const money = (value: number | undefined) => (value === undefined ? '—' : formatMoney(value, props.room.currency))
const pct = (value: number | undefined, digits = 1) => fmtPercent(value, locale.value, digits)
const num = (value: number) => fmtNumber(value, locale.value)

const metrics = computed(() => {
  const a = own.value
  const b = props.average
  const list: Array<{ key: string; text: string; mine?: number; base?: number }> = [
    { key: 'perHour', text: money(per(a.gmv, a.hours)), mine: per(a.gmv, a.hours), base: per(b.gmv, b.hours) },
    { key: 'sales', text: num(a.sales), mine: a.sales, base: per(b.sales, b.rooms) },
    { key: 'aov', text: money(per(a.gmv, a.sales)), mine: per(a.gmv, a.sales), base: per(b.gmv, b.sales) },
    { key: 'views', text: num(a.views), mine: a.views, base: per(b.views, b.rooms) },
    { key: 'enterRate', text: pct(per(a.views, a.impressions)), mine: per(a.views, a.impressions), base: per(b.views, b.impressions) },
    { key: 'ctr', text: pct(per(a.clicks, a.exposures)), mine: per(a.clicks, a.exposures), base: per(b.clicks, b.exposures) },
    { key: 'cartRate', text: pct(per(a.carts, a.clicks)), mine: per(a.carts, a.clicks), base: per(b.carts, b.clicks) },
    { key: 'cartToOrder', text: pct(per(a.orders, a.carts)), mine: per(a.orders, a.carts), base: per(b.orders, b.carts) },
    { key: 'cvr', text: pct(per(a.orders, a.clicks)), mine: per(a.orders, a.clicks), base: per(b.orders, b.clicks) },
  ]
  return list.map((item) => ({ ...item, diff: item.mine !== undefined && item.base ? item.mine / item.base - 1 : undefined }))
})

const sold = computed(() => props.room.products.filter((item) => item.sales > 0).length)
const peak = computed(() => Math.max(1, ...props.room.products.map((item) => item.gmv)))
const products = computed(() => {
  const q = query.value.trim().toLowerCase()
  return props.room.products
    .filter((item) => (!onlySold.value || item.sales > 0) && (!q || `${item.name} ${item.productId} ${item.codes.map((code) => code.code).join(' ')}`.toLowerCase().includes(q)))
    .sort((a, b) => b.gmv - a.gmv || b.clicks - a.clicks)
})

function onKey(event: KeyboardEvent) {
  if (event.key === 'Escape') emit('close')
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <Teleport to="body">
    <div class="vg-scope lrd" @click.self="emit('close')">
      <aside class="lrd__panel" role="dialog" aria-modal="true" :aria-label="when">
        <header class="lrd__head">
          <div>
            <h2>{{ when }}</h2>
            <p>@{{ room.accountName }} · {{ t('shops.live.hours', { n: own.hours.toFixed(1) }) }} · ID {{ room.id }}</p>
          </div>
          <button type="button" class="vg-icon-btn" data-testid="live-room-close" :aria-label="t('creatorHub.actions.close')" @click="emit('close')"><X :size="17" /></button>
        </header>
        <div class="lrd__body">
          <div class="lrd__hero">
            <small>{{ t('shops.live.gmv') }}</small>
            <strong>{{ money(room.gmv) }}</strong>
            <span v-if="per(average.gmv, average.rooms)" :class="room.gmv * average.rooms >= average.gmv ? 'up' : 'down'">{{ t('shops.live.vsAverage', { value: `${room.gmv * average.rooms >= average.gmv ? '+' : ''}${pct((room.gmv * average.rooms) / average.gmv - 1, 0)}` }) }}</span>
          </div>
          <div class="lrd__metrics">
            <div v-for="item in metrics" :key="item.key">
              <small>{{ t(`shops.live.metric.${item.key}`) }}</small>
              <b>{{ item.text }}</b>
              <span v-if="item.diff !== undefined" :class="Math.abs(item.diff) < 0.03 ? 'flat' : item.diff > 0 ? 'up' : 'down'">{{ item.diff > 0 ? '+' : '' }}{{ pct(item.diff, 0) }}</span>
            </div>
          </div>

          <div class="lrd__bar">
            <h3>{{ t('shops.live.products') }}</h3>
            <div class="vg-seg vg-seg--sm">
              <button type="button" class="vg-seg__btn" :class="{ 'is-active': onlySold }" @click="onlySold = true">{{ t('shops.live.soldOnly') }} {{ sold }}</button>
              <button type="button" class="vg-seg__btn" :class="{ 'is-active': !onlySold }" @click="onlySold = false">{{ t('shops.live.allProducts') }} {{ room.products.length }}</button>
            </div>
            <label class="vg-search"><Search :size="13" /><input v-model="query" class="vg-input vg-input--sm" :placeholder="t('shops.live.searchProduct')" /></label>
          </div>
          <ul class="lrd__list">
            <li v-for="item in products" :key="item.productId">
              <img v-if="item.image" :src="item.image" alt="" loading="lazy" /><span v-else class="lrd__ph"><FileImage :size="16" /></span>
              <div class="lrd__info">
                <p :title="item.name"><b v-for="code in item.codes.slice(0, 3)" :key="code.code">{{ code.code }}</b><em v-if="!item.codes.length">{{ t('shops.live.noCode') }}</em>{{ item.name }}</p>
                <div class="lrd__track"><i :style="{ width: `${(item.gmv / peak) * 100}%` }"></i></div>
                <small>{{ t('shops.live.exposures') }} {{ num(item.exposures) }} · {{ t('shops.live.col.ctr') }} {{ pct(per(item.clicks, item.exposures)) }} · {{ t('shops.live.carts') }} {{ num(item.carts) }}（{{ pct(per(item.carts, item.clicks)) }}） · {{ t('shops.live.metric.cvr') }} {{ pct(per(item.orders, item.clicks)) }}</small>
                <small v-if="item.codes.some((code) => code.estimated)" class="lrd__est">{{ t('shops.live.estimated') }}：{{ item.codes.map((code) => `${code.code} ×${code.sales}`).join('、') }}</small>
              </div>
              <div class="lrd__sum"><strong>{{ money(item.gmv) }}</strong><small>{{ t('shops.live.units', { n: num(item.sales) }) }}</small></div>
            </li>
            <li v-if="!products.length" class="lrd__none">{{ t('shops.live.noProducts') }}</li>
          </ul>
        </div>
      </aside>
    </div>
  </Teleport>
</template>

<style scoped>
.lrd { position: fixed; inset: 0; z-index: 2100; display: flex; justify-content: flex-end; background: rgb(2 8 8 / .6); backdrop-filter: blur(3px); }
.lrd__panel { display: flex; flex-direction: column; width: min(640px, 100vw); height: 100%; background: var(--theme-panel); border-left: 1px solid var(--theme-border); box-shadow: -24px 0 60px rgb(0 0 0 / .4); animation: lrd-in .2s ease-out; }
@keyframes lrd-in { from { transform: translateX(28px); opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .lrd__panel { animation: none; } }
.lrd__head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 20px 22px 16px; border-bottom: 1px solid var(--theme-divider); }
.lrd__head h2 { margin: 0; font-size: 18px; font-weight: 650; }
.lrd__head p { margin: 4px 0 0; font-size: 12px; color: var(--theme-text-muted); font-variant-numeric: tabular-nums; }
.lrd__body { flex: 1; min-height: 0; overflow-y: auto; padding: 20px 22px 30px; scrollbar-width: thin; scrollbar-color: color-mix(in srgb, var(--theme-text-muted) 40%, transparent) transparent; }
.lrd__hero { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
.lrd__hero small { width: 100%; font-size: 12px; color: var(--theme-text-muted); }
.lrd__hero strong { font-size: 32px; font-weight: 650; line-height: 1.15; font-variant-numeric: tabular-nums; }
.lrd__hero span, .lrd__metrics span { font-size: 12px; font-weight: 600; font-variant-numeric: tabular-nums; }
.up { color: var(--vg-green, #16a34a); } .down { color: var(--vg-red); } .flat { color: var(--theme-text-muted); }
.lrd__metrics { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); margin: 16px 0 24px; border: 1px solid var(--theme-border); border-radius: 10px; overflow: hidden; }
.lrd__metrics > div { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 8px; padding: 11px 14px; border-left: 1px solid var(--theme-divider); border-top: 1px solid var(--theme-divider); margin: -1px 0 0 -1px; }
.lrd__metrics small { width: 100%; font-size: 12px; color: var(--theme-text-muted); }
.lrd__metrics b { font-size: 17px; font-weight: 600; font-variant-numeric: tabular-nums; }
.lrd__bar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 6px; }
.lrd__bar h3 { margin: 0 auto 0 0; font-size: 14px; font-weight: 650; }
.lrd__bar .vg-search { width: 170px; }
.lrd__list { list-style: none; margin: 0; padding: 0; }
.lrd__list li { display: flex; align-items: flex-start; gap: 12px; padding: 13px 0; border-bottom: 1px solid var(--theme-divider); }
.lrd__list li:last-child { border-bottom: 0; }
.lrd__list img, .lrd__ph { width: 48px; height: 48px; flex: none; border-radius: 8px; object-fit: cover; background: var(--theme-panel-soft); display: grid; place-items: center; color: var(--theme-text-muted); }
.lrd__info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 5px; }
.lrd__info p { margin: 0; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--theme-text-secondary); }
.lrd__info p b, .lrd__info p em { display: inline-block; margin-right: 7px; padding: 0 6px; border-radius: 4px; font-size: 11px; font-weight: 700; font-style: normal; line-height: 18px; }
.lrd__info p b { color: var(--vg-accent); background: var(--vg-accent-soft); }
.lrd__info p em { color: var(--theme-text-muted); background: var(--theme-panel-soft); }
.lrd__info small { font-size: 11.5px; color: var(--theme-text-muted); font-variant-numeric: tabular-nums; }
.lrd__track { height: 4px; border-radius: 2px; background: var(--theme-panel-soft); overflow: hidden; }
.lrd__track i { display: block; height: 100%; border-radius: 2px; background: var(--vg-accent); }
.lrd__sum { flex: none; min-width: 92px; text-align: right; font-variant-numeric: tabular-nums; }
.lrd__sum strong { display: block; font-size: 14px; font-weight: 650; }
.lrd__sum small { font-size: 11.5px; color: var(--theme-text-muted); }
.lrd__none { justify-content: center; padding: 34px 0 !important; font-size: 13px; color: var(--theme-text-muted); }
</style>
