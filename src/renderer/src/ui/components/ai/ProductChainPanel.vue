<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { ArrowRight, Check, Clapperboard, Link2, Megaphone, Search, Send, TrendingUp, Users, X } from 'lucide-vue-next'

type SignalAction = 'bind' | 'make_content' | 'make_variant' | 'replenish' | 'open_ads' | 'open_creators'
type Signal = { key: string; level: 'info' | 'warning' | 'success'; action: SignalAction; params: Record<string, string | number> }
type ChannelProduct = { id: string; title: string; imageUrl?: string; sources: Array<'ads' | 'creators' | 'publish'> }
export type ProductSpine = {
  boundIds: string[]
  inferredIds: string[]
  tiktokProductIds: string[]
  channelProducts: ChannelProduct[]
  ads: { windowDays: number; spend: number; revenue: number; orders: number; roi: number; creativeCount: number; activeCreativeCount: number; breakEvenRoi?: number; profit?: number } | null
  creators: { sampleCount: number; awaitingContentCount: number; creatorCount: number; videoCount: number; gmv: number; orders: number } | null
  signals: Signal[]
}

const props = defineProps<{
  productId: string
  productName: string
  spine: ProductSpine
  contentReady: number
  contentRunning: number
  published: number
}>()
const emit = defineEmits<{ (event: 'make-content'): void; (event: 'make-variant', name: string, creativeId: string): void; (event: 'changed'): void }>()

const { t } = useI18n()
const router = useRouter()

const ADS_ROUTE = '/plugins/tiktok-gmv-max-optimizer'
const CREATORS_ROUTE = '/plugins/tiktok-creator-hub'

const bindOpen = ref(false)
const search = ref('')
const manualId = ref('')
const picked = ref<string[]>([])
const saving = ref(false)
const bindError = ref('')

const bound = computed(() => props.spine.tiktokProductIds.length > 0)
const number = (value: number) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value || 0)

const stages = computed(() => {
  const { ads, creators } = props.spine
  return [
    {
      key: 'content', icon: Clapperboard, active: props.contentReady + props.contentRunning > 0,
      value: String(props.contentReady), detail: t('ai.spine.contentDetail', { running: props.contentRunning }),
      action: () => emit('make-content'),
    },
    {
      key: 'publish', icon: Send, active: props.published > 0,
      value: String(props.published), detail: t('ai.spine.publishDetail'),
      action: () => void router.push('/publish'),
    },
    {
      key: 'ads', icon: Megaphone, active: Boolean(ads && ads.spend > 0),
      value: ads ? `ROI ${number(ads.roi)}` : '—',
      detail: ads
        ? [
            ads.profit !== undefined ? t(ads.profit < 0 ? 'ai.spine.adsLosing' : 'ai.spine.adsProfit', { profit: number(Math.abs(ads.profit)) }) : '',
            t('ai.spine.adsDetail', { days: ads.windowDays, spend: number(ads.spend), creatives: ads.activeCreativeCount }),
          ].filter(Boolean).join(' · ')
        : t(bound.value ? 'ai.spine.adsEmpty' : 'ai.spine.needBind'),
      action: () => (bound.value ? void router.push(ADS_ROUTE) : openBind()),
    },
    {
      key: 'creators', icon: Users, active: Boolean(creators && (creators.videoCount || creators.sampleCount)),
      value: creators ? String(creators.videoCount) : '—',
      detail: creators ? t('ai.spine.creatorsDetail', { samples: creators.sampleCount, gmv: number(creators.gmv) }) : t(bound.value ? 'ai.spine.creatorsEmpty' : 'ai.spine.needBind'),
      action: () => (bound.value ? void router.push(CREATORS_ROUTE) : openBind()),
    },
  ]
})

const candidates = computed(() => {
  const keyword = search.value.trim().toLowerCase()
  const known = props.spine.channelProducts
  const extra = picked.value.filter((id) => !known.some((item) => item.id === id)).map((id) => ({ id, title: '', sources: [] as ChannelProduct['sources'] }))
  return [...extra, ...known].filter((item) => !keyword || item.id.toLowerCase().includes(keyword) || item.title.toLowerCase().includes(keyword))
})

function openBind() {
  picked.value = [...props.spine.tiktokProductIds]
  search.value = ''
  manualId.value = ''
  bindError.value = ''
  bindOpen.value = true
}

function toggle(id: string) {
  picked.value = picked.value.includes(id) ? picked.value.filter((item) => item !== id) : [...picked.value, id]
}

function addManual() {
  const id = manualId.value.trim()
  if (id && !picked.value.includes(id)) picked.value = [...picked.value, id]
  manualId.value = ''
}

async function saveBind() {
  saving.value = true
  bindError.value = ''
  try {
    await window.api.contentHub.linkProductChannels({ productId: props.productId, tiktokProductIds: [...picked.value] })
    bindOpen.value = false
    emit('changed')
  } catch (error) {
    bindError.value = error instanceof Error ? error.message : String(error)
  } finally {
    saving.value = false
  }
}

/** 衰退素材有「还能撑几天」时换一句更具体的提示 */
function signalText(signal: Signal) {
  if (signal.key === 'ads_fatigue' && signal.params.daysLeft !== undefined) {
    const floorName = t(`ai.spine.floor.${signal.params.floorKind === 'break_even' ? 'break_even' : 'average'}`)
    return Number(signal.params.daysLeft) === 0
      ? t('ai.spine.signal.ads_fatigue_below', { ...signal.params, floorName })
      : t('ai.spine.signal.ads_fatigue_runway', { ...signal.params, floorName })
  }
  return t(`ai.spine.signal.${signal.key}`, signal.params)
}
function runSignal(signal: Signal) {
  if (signal.action === 'bind') openBind()
  else if (signal.action === 'make_content') emit('make-content')
  // 补货：照着正在衰退的主力素材做一批变体，走 AI 制片人 → 审核收件箱
  else if (signal.action === 'make_variant' || signal.action === 'replenish') emit('make-variant', String(signal.params.name || ''), String(signal.params.creativeId || ''))
  else if (signal.action === 'open_ads') void router.push(ADS_ROUTE)
  else void router.push(CREATORS_ROUTE)
}
</script>

<template>
  <section class="vg-card pc" data-testid="product-chain">
    <div class="vg-card__head">
      <span class="vg-card__title"><TrendingUp :size="16" /> {{ t('ai.spine.title') }}</span>
      <div class="vg-card__actions">
        <span v-if="bound" class="vg-pill vg-pill--green" data-testid="product-chain-bound"><Check :size="12" /> {{ t('ai.spine.bound', { count: spine.tiktokProductIds.length }) }}</span>
        <button type="button" class="vg-btn vg-btn--xs" data-testid="product-chain-bind" @click="openBind"><Link2 :size="13" /> {{ t(bound ? 'ai.spine.editBind' : 'ai.spine.bind') }}</button>
      </div>
    </div>

    <div class="pc__stages">
      <template v-for="(stage, index) in stages" :key="stage.key">
        <ArrowRight v-if="index" :size="15" class="pc__arrow" />
        <button type="button" class="pc__stage" :class="{ 'is-active': stage.active }" :data-testid="`product-chain-${stage.key}`" @click="stage.action()">
          <span class="vg-stat__icon"><component :is="stage.icon" :size="16" /></span>
          <span class="pc__stage-body">
            <span class="pc__stage-label">{{ t(`ai.spine.stage.${stage.key}`) }}</span>
            <span class="pc__stage-value">{{ stage.value }}</span>
            <span class="pc__stage-detail vg-ellipsis">{{ stage.detail }}</span>
          </span>
        </button>
      </template>
    </div>

    <ul v-if="spine.signals.length" class="pc__signals">
      <li v-for="signal in spine.signals" :key="signal.key" class="pc__signal" :data-testid="`product-signal-${signal.key}`">
        <span class="vg-pill" :class="{ 'vg-pill--amber': signal.level === 'warning', 'vg-pill--green': signal.level === 'success', 'vg-pill--blue': signal.level === 'info' }">{{ t(`ai.spine.level.${signal.level}`) }}</span>
        <span class="pc__signal-text">{{ signalText(signal) }}</span>
        <button type="button" class="vg-btn vg-btn--xs vg-btn--soft" @click="runSignal(signal)">{{ t(`ai.spine.action.${signal.action}`) }}</button>
      </li>
    </ul>
    <p v-else-if="bound" class="vg-muted pc__quiet">{{ t('ai.spine.noSignals') }}</p>

    <div v-if="bindOpen" class="vg-backdrop" @click.self="bindOpen = false">
      <section class="vg-dialog pc__dialog" role="dialog" aria-modal="true" :aria-label="t('ai.spine.bindTitle')">
        <header class="vg-dialog__head">
          <div class="vg-dialog__title">
            <span class="vg-dialog__title-icon"><Link2 :size="20" /></span>
            <div><h2>{{ t('ai.spine.bindTitle') }}</h2><p>{{ t('ai.spine.bindDesc', { name: productName }) }}</p></div>
          </div>
          <button type="button" class="vg-icon-btn" :aria-label="t('common.close')" @click="bindOpen = false"><X :size="18" /></button>
        </header>
        <div class="vg-dialog__body pc__dialog-body">
          <label class="pc__search"><Search :size="15" /><input v-model="search" class="vg-input vg-input--sm" :placeholder="t('ai.spine.searchPlaceholder')" /></label>
          <div v-if="candidates.length" class="pc__list">
            <button v-for="item in candidates" :key="item.id" type="button" class="pc__row" :class="{ 'is-active': picked.includes(item.id) }" @click="toggle(item.id)">
              <span class="pc__check"><Check v-if="picked.includes(item.id)" :size="13" /></span>
              <span class="pc__row-main">
                <span class="pc__row-title vg-ellipsis">{{ item.title || t('ai.spine.untitled') }}</span>
                <span class="pc__row-sub">{{ item.id }}</span>
              </span>
              <span v-for="source in item.sources" :key="source" class="vg-pill">{{ t(`ai.spine.source.${source}`) }}</span>
            </button>
          </div>
          <p v-else class="vg-muted pc__quiet">{{ t('ai.spine.noCandidates') }}</p>
          <div class="pc__manual">
            <input v-model="manualId" class="vg-input vg-input--sm" :placeholder="t('ai.spine.manualPlaceholder')" data-testid="product-chain-manual-id" @keydown.enter.prevent="addManual" />
            <button type="button" class="vg-btn vg-btn--sm" :disabled="!manualId.trim()" @click="addManual">{{ t('ai.spine.addManual') }}</button>
          </div>
          <p v-if="bindError" class="pc__error">{{ bindError }}</p>
        </div>
        <footer class="vg-dialog__foot">
          <span class="vg-muted">{{ t('ai.spine.pickedCount', { count: picked.length }) }}</span>
          <div class="vg-dialog__foot-actions">
            <button type="button" class="vg-btn" @click="bindOpen = false">{{ t('common.cancel') }}</button>
            <button type="button" class="vg-btn vg-btn--primary" :disabled="saving" data-testid="product-chain-save" @click="saveBind">{{ t('common.save') }}</button>
          </div>
        </footer>
      </section>
    </div>
  </section>
</template>

<style scoped>
.pc__stages { display: flex; align-items: stretch; gap: 8px; }
.pc__arrow { align-self: center; flex-shrink: 0; color: var(--theme-text-muted); }
.pc__stage { flex: 1 1 0; min-width: 0; display: flex; align-items: center; gap: 10px; padding: 10px 12px; border: 1px solid var(--theme-border); border-radius: var(--vg-radius-sm); background: var(--theme-panel-soft); color: var(--theme-text); text-align: left; cursor: pointer; opacity: 0.72; }
.pc__stage.is-active { opacity: 1; background: var(--theme-panel); }
.pc__stage:hover { border-color: var(--vg-accent-line); opacity: 1; }
.pc__stage-body { display: flex; flex-direction: column; min-width: 0; }
.pc__stage-label { font-size: 12px; color: var(--theme-text-muted); }
.pc__stage-value { font-size: 17px; font-weight: 800; font-variant-numeric: tabular-nums; }
.pc__stage-detail { font-size: 11.5px; color: var(--theme-text-muted); }
.pc__signals { list-style: none; margin: 12px 0 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.pc__signal { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 10px; padding: 8px 10px; border: 1px solid var(--theme-border); border-radius: var(--vg-radius-sm); background: var(--theme-panel-soft); font-size: 12.5px; }
.pc__signal-text { color: var(--theme-text); }
.pc__quiet { margin: 12px 0 0; font-size: 12.5px; }
.pc__dialog { width: min(560px, 100%); }
.pc__dialog-body { display: flex; flex-direction: column; gap: 10px; }
.pc__search { display: flex; align-items: center; gap: 8px; color: var(--theme-text-muted); }
.pc__search .vg-input { flex: 1; }
.pc__list { display: flex; flex-direction: column; gap: 4px; max-height: 300px; overflow-y: auto; }
.pc__row { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border: 1px solid var(--theme-border); border-radius: var(--vg-radius-sm); background: transparent; color: var(--theme-text); text-align: left; cursor: pointer; }
.pc__row.is-active { border-color: var(--vg-accent-line); background: var(--vg-accent-soft); }
.pc__check { width: 16px; height: 16px; flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center; border: 1px solid var(--theme-border); border-radius: 4px; color: var(--vg-accent); }
.pc__row-main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.pc__row-title { font-size: 12.5px; font-weight: 600; }
.pc__row-sub { font-size: 11.5px; color: var(--theme-text-muted); font-variant-numeric: tabular-nums; }
.pc__manual { display: flex; gap: 8px; }
.pc__manual .vg-input { flex: 1; }
.pc__error { margin: 0; font-size: 12px; color: var(--vg-red); }
@media (max-width: 1100px) {
  .pc__stages { flex-wrap: wrap; }
  .pc__arrow { display: none; }
  .pc__stage { flex-basis: calc(50% - 4px); }
}
</style>
