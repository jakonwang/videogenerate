<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { Clapperboard, LoaderCircle, Megaphone, X } from 'lucide-vue-next'
import type { StyleAction, StyleBaseline, StyleRow } from '../../../../../shared/styleBoard'
import ProductStyleStats from '../../components/product/ProductStyleStats.vue'
import { formatMoney } from '../product-research/productResearchUtils'
import { fmtNumber, fmtPercent } from './shopFormat'

/** 一个款的全部数据和下一步。 */
const props = defineProps<{ row: StyleRow; baseline: StyleBaseline; currency: string; reason: (action: StyleAction) => string }>()
const emit = defineEmits<{ close: []; changed: [] }>()
const { t, locale } = useI18n()
const router = useRouter()
const busy = ref(false)
const error = ref('')

const money = (value: number | undefined) => (value === undefined ? '—' : formatMoney(value, props.currency))
const num = (value: number | undefined) => fmtNumber(value, locale.value)
const pct = (value: number | undefined) => fmtPercent(value, locale.value, 1)
const per = (part: number, whole: number) => (whole > 0 ? part / whole : undefined)

type Cell = { key: string; text: string; mine?: number; base?: number }
const withDiff = (list: Cell[]) => list.map((item) => ({ ...item, diff: item.mine !== undefined && item.base ? item.mine / item.base - 1 : undefined }))
const live = computed(() => {
  const a = props.row.live
  const b = props.baseline
  if (!a) return []
  const gpm = a.exposures ? (a.measuredGmv / a.exposures) * 1000 : undefined
  return withDiff([
    { key: 'gmv', text: money(a.gmv) },
    { key: 'sales', text: num(a.sales) },
    { key: 'exposures', text: num(a.exposures), mine: a.exposures, base: b.liveExposures },
    { key: 'ctr', text: pct(per(a.clicks, a.exposures)), mine: per(a.clicks, a.exposures), base: b.liveCtr },
    { key: 'cartRate', text: pct(per(a.carts, a.clicks)), mine: per(a.carts, a.clicks), base: b.liveCartRate },
    { key: 'cartToOrder', text: pct(per(a.measuredOrders, a.carts)), mine: per(a.measuredOrders, a.carts), base: b.liveCartToOrder },
    { key: 'cvr', text: pct(per(a.measuredOrders, a.clicks)), mine: per(a.measuredOrders, a.clicks), base: b.liveCvr },
    { key: 'gpm', text: money(gpm), mine: gpm, base: b.liveGpm },
  ])
})
const ads = computed(() => {
  const a = props.row.ads
  if (!a) return []
  const roi = per(a.revenue, a.spend)
  return withDiff([
    { key: 'spend', text: money(a.spend) },
    { key: 'revenue', text: money(a.revenue) },
    { key: 'roi', text: roi === undefined ? '—' : roi.toFixed(2), mine: roi, base: props.baseline.adsRoi },
    { key: 'creatives', text: num(a.creatives) },
  ])
})

/** 没有档案先建档（带款号、店铺图片），再去商品页出片 */
async function openProduct() {
  busy.value = true
  error.value = ''
  try {
    const result = props.row.productId ? { productId: props.row.productId } : await window.api.productCodes.archive(props.row.code)
    await router.push(`/products/${result.productId}`)
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : String(reason)
    error.value = message.includes('PRODUCT_CODE_NOT_LISTED') ? t('shops.sb.notListed') : t('shops.sb.archiveFailed', { message })
    busy.value = false
  }
}

function onKey(event: KeyboardEvent) {
  if (event.key === 'Escape') emit('close')
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <Teleport to="body">
    <div class="vg-scope sbd" @click.self="emit('close')">
      <aside class="sbd__panel" role="dialog" aria-modal="true" :aria-label="row.code" data-testid="style-drawer">
        <header class="sbd__head">
          <img v-if="row.image" :src="row.image" alt="" />
          <div><h2>{{ row.code }}</h2><p :title="row.name">{{ row.name }}</p></div>
          <button type="button" class="vg-icon-btn" data-testid="style-drawer-close" :aria-label="t('creatorHub.actions.close')" @click="emit('close')"><X :size="17" /></button>
        </header>
        <div class="sbd__body">
          <ul v-if="row.actions.length" class="sbd__acts">
            <li v-for="action in row.actions" :key="action.kind"><b>{{ t(`shops.sb.action.${action.kind}`) }}</b><span>{{ reason(action) }}</span></li>
          </ul>
          <div class="sbd__btns">
            <button type="button" class="vg-btn vg-btn--primary" :disabled="busy" data-testid="style-produce" @click="openProduct"><LoaderCircle v-if="busy" :size="14" class="vg-spin" /><Clapperboard v-else :size="14" />{{ row.productId ? t('shops.sb.produce') : t('shops.sb.archiveAndProduce') }}</button>
            <button type="button" class="vg-btn" @click="router.push('/plugins/tiktok-gmv-max-optimizer')"><Megaphone :size="14" />GMV Max</button>
          </div>
          <p v-if="error" class="sbd__error">{{ error }}</p>

          <section>
            <h3>{{ t('shops.sb.group.live') }}<small v-if="row.live">{{ t('shops.live.roomCount', { n: row.live.sessions }) }}</small></h3>
            <div v-if="live.length" class="sbd__grid"><div v-for="item in live" :key="item.key"><small>{{ t(`shops.live.col.${item.key}`) }}</small><b>{{ item.text }}</b><em v-if="item.diff !== undefined" :class="Math.abs(item.diff) < 0.03 ? '' : item.diff > 0 ? 'up' : 'down'">{{ item.diff > 0 ? '+' : '' }}{{ fmtPercent(item.diff, locale, 0) }}</em></div></div>
            <p v-else class="sbd__none">{{ t('shops.sb.noLive') }}</p>
          </section>
          <section>
            <h3>{{ t('shops.sb.group.ads') }}</h3>
            <div v-if="ads.length" class="sbd__grid"><div v-for="item in ads" :key="item.key"><small>{{ t(`shops.sb.ads.${item.key}`) }}</small><b>{{ item.text }}</b><em v-if="item.diff !== undefined" :class="Math.abs(item.diff) < 0.03 ? '' : item.diff > 0 ? 'up' : 'down'">{{ item.diff > 0 ? '+' : '' }}{{ fmtPercent(item.diff, locale, 0) }}</em></div></div>
            <p v-else class="sbd__none">{{ t('shops.sb.noAds') }}</p>
          </section>
          <p class="sbd__note">{{ t('shops.sb.vsNote') }}</p>
          <ProductStyleStats :code="row.code" />
        </div>
      </aside>
    </div>
  </Teleport>
</template>

<style scoped>
.sbd { position: fixed; inset: 0; z-index: 2100; display: flex; justify-content: flex-end; background: rgb(2 8 8 / .6); backdrop-filter: blur(3px); }
.sbd__panel { display: flex; flex-direction: column; width: min(720px, 100vw); height: 100%; background: var(--theme-panel); border-left: 1px solid var(--theme-border); box-shadow: -24px 0 60px rgb(0 0 0 / .4); animation: sbd-in .2s ease-out; }
@keyframes sbd-in { from { transform: translateX(28px); opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .sbd__panel { animation: none; } }
.sbd__head { display: flex; align-items: center; gap: 14px; padding: 18px 22px; border-bottom: 1px solid var(--theme-divider); }
.sbd__head img { width: 52px; height: 52px; flex: none; border-radius: 10px; object-fit: cover; }
.sbd__head div { flex: 1; min-width: 0; }
.sbd__head h2 { margin: 0; font-size: 19px; font-weight: 650; }
.sbd__head p { margin: 3px 0 0; font-size: 12px; color: var(--theme-text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sbd__body { flex: 1; min-height: 0; overflow-y: auto; padding: 18px 22px 30px; display: flex; flex-direction: column; gap: 16px; scrollbar-width: thin; }
.sbd__acts { list-style: none; margin: 0; padding: 4px 16px; border: 1px solid color-mix(in srgb, var(--vg-accent) 30%, var(--theme-border)); border-radius: 10px; background: color-mix(in srgb, var(--vg-accent) 6%, transparent); }
.sbd__acts li { display: flex; gap: 14px; padding: 10px 0; font-size: 13px; line-height: 1.55; }
.sbd__acts li + li { border-top: 1px solid var(--theme-divider); }
.sbd__acts b { flex: none; width: 64px; font-weight: 650; color: var(--vg-accent); }
.sbd__acts span { color: var(--theme-text-secondary); }
.sbd__btns { display: flex; gap: 10px; }
.sbd__error { margin: 0; font-size: 12px; color: var(--vg-red); }
.sbd h3 { display: flex; align-items: baseline; gap: 8px; margin: 0 0 9px; font-size: 13px; font-weight: 650; }
.sbd h3 small { font-size: 12px; font-weight: 400; color: var(--theme-text-muted); }
.sbd__grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); border: 1px solid var(--theme-border); border-radius: 10px; overflow: hidden; }
.sbd__grid > div { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 7px; padding: 10px 13px; border: solid var(--theme-divider); border-width: 1px 0 0 1px; margin: -1px 0 0 -1px; }
.sbd__grid small { width: 100%; font-size: 11.5px; color: var(--theme-text-muted); }
.sbd__grid b { font-size: 15px; font-weight: 600; font-variant-numeric: tabular-nums; }
.sbd__grid em { font-size: 11.5px; font-style: normal; font-weight: 600; color: var(--theme-text-muted); }
.sbd__grid .up { color: var(--vg-green, #16a34a); } .sbd__grid .down { color: var(--vg-red); }
.sbd__none, .sbd__note { margin: 0; font-size: 12px; color: var(--theme-text-muted); }
.sbd__body > * { flex: none; }
</style>
