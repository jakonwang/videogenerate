<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { BadgeCheck, ChevronDown, ChevronUp, Link2, Unlink, Wand2 } from 'lucide-vue-next'

type Verdict = 'winner' | 'average' | 'weak' | 'unproven'
export type ContentPerformance = { creativeId: string; creativeName: string; method: 'auto' | 'manual'; confidence?: number; spend: number; revenue: number; orders: number; roi: number; verdict: Verdict }
export type PerformanceItem = { ref: string; line: string; title: string; status: string; route: string; performance?: ContentPerformance }
export type ProductPerformance = {
  windowDays: number
  productRoi: number
  measuredCount: number
  publishedUnlinkedCount: number
  unlinkedCreatives: Array<{ creativeId: string; name: string; spend: number; revenue: number; orders: number; roi: number }>
}

const props = defineProps<{ items: PerformanceItem[]; performance: ProductPerformance }>()
const emit = defineEmits<{ (event: 'make-variant', item: PerformanceItem): void; (event: 'changed'): void }>()

const { t } = useI18n()
const router = useRouter()
const picks = reactive<Record<string, string>>({})
const busy = ref('')
const error = ref('')

const number = (value: number) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value || 0)
const linked = computed(() => props.items
  .filter((item): item is PerformanceItem & { performance: ContentPerformance } => Boolean(item.performance))
  .sort((a, b) => b.performance.revenue - a.performance.revenue))
const linkable = computed(() => props.items.filter((item) => !item.performance && item.line !== 'publish' && item.status === 'ready'))
const COLLAPSED_COUNT = 5
const expanded = ref(false)
const creatives = computed(() => [...props.performance.unlinkedCreatives].sort((a, b) => b.spend - a.spend))
const visibleCreatives = computed(() => (expanded.value ? creatives.value : creatives.value.slice(0, COLLAPSED_COUNT)))
function roiTone(roi: number) {
  if (roi <= 0) return 'pp__roi--none'
  if (roi < 1) return 'pp__roi--bad'
  return roi >= props.performance.productRoi ? 'pp__roi--good' : ''
}
const verdictPill: Record<Verdict, string> = { winner: 'vg-pill--green', average: 'vg-pill--blue', weak: 'vg-pill--red', unproven: '' }

async function run(key: string, action: () => Promise<unknown>) {
  busy.value = key
  error.value = ''
  try {
    await action()
    emit('changed')
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    busy.value = ''
  }
}

function link(creative: { creativeId: string; name: string }) {
  const target = picks[creative.creativeId]
  if (!target) return
  void run(creative.creativeId, () => window.api.contentHub.linkContentPerformance({ ref: target, creativeId: creative.creativeId, creativeName: creative.name }))
}

function unlink(item: PerformanceItem) {
  void run(item.ref, () => window.api.contentHub.unlinkContentPerformance(item.ref))
}
</script>

<template>
  <section class="vg-card pp" data-testid="product-performance">
    <div class="vg-card__head">
      <span class="vg-card__title"><BadgeCheck :size="16" /> {{ t('ai.perf.title') }} <small>{{ performance.measuredCount }}</small></span>
      <span class="vg-muted pp__hint">{{ t('ai.perf.hint', { days: performance.windowDays, roi: number(performance.productRoi) }) }}</span>
    </div>

    <div v-if="linked.length" class="vg-table-wrap">
      <table class="vg-table vg-table--compact">
        <thead>
          <tr>
            <th>{{ t('ai.perf.col.content') }}</th>
            <th>{{ t('ai.perf.col.verdict') }}</th>
            <th class="pp__num">{{ t('ai.perf.col.spend') }}</th>
            <th class="pp__num">{{ t('ai.perf.col.revenue') }}</th>
            <th class="pp__num">{{ t('ai.perf.col.orders') }}</th>
            <th class="pp__num">ROI</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in linked" :key="item.ref" :data-testid="`product-performance-row-${item.ref}`">
            <td>
              <button type="button" class="pp__title vg-ellipsis" @click="router.push(item.route)">{{ item.title }}</button>
              <span class="pp__sub vg-ellipsis">{{ t(`ai.line.${item.line}`) }} · {{ item.performance.creativeName }} · {{ t(`ai.perf.method.${item.performance.method}`) }}</span>
            </td>
            <td><span class="vg-pill" :class="verdictPill[item.performance.verdict]">{{ t(`ai.perf.verdict.${item.performance.verdict}`) }}</span></td>
            <td class="pp__num">{{ number(item.performance.spend) }}</td>
            <td class="pp__num">{{ number(item.performance.revenue) }}</td>
            <td class="pp__num">{{ item.performance.orders }}</td>
            <td class="pp__num">{{ number(item.performance.roi) }}</td>
            <td class="pp__actions">
              <button v-if="item.performance.verdict === 'winner'" type="button" class="vg-btn vg-btn--xs vg-btn--soft" @click="emit('make-variant', item)"><Wand2 :size="13" /> {{ t('ai.spine.action.make_variant') }}</button>
              <button type="button" class="vg-btn vg-btn--xs vg-btn--ghost" :disabled="busy === item.ref" :title="t('ai.perf.unlink')" :data-testid="`product-performance-unlink-${item.ref}`" @click="unlink(item)"><Unlink :size="13" /></button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-else class="vg-muted pp__empty">{{ t('ai.perf.empty') }}</p>

    <p v-if="performance.publishedUnlinkedCount" class="vg-muted pp__note">{{ t('ai.perf.unmatched', { count: performance.publishedUnlinkedCount }) }}</p>

    <template v-if="creatives.length">
      <div class="pp__subhead">
        <h4>{{ t('ai.perf.unlinkedTitle') }} <small>{{ creatives.length }}</small></h4>
        <span v-if="!linkable.length" class="vg-muted pp__subhint">{{ t('ai.perf.noLinkableHint') }}</span>
      </div>
      <div class="vg-table-wrap">
        <table class="vg-table vg-table--compact pp__creatives">
          <thead>
            <tr>
              <th>{{ t('ai.perf.col.creative') }}</th>
              <th class="pp__num">{{ t('ai.perf.col.spend') }}</th>
              <th class="pp__num">{{ t('ai.perf.col.revenue') }}</th>
              <th class="pp__num">{{ t('ai.perf.col.orders') }}</th>
              <th class="pp__num">ROI</th>
              <th v-if="linkable.length" class="pp__linkcol">{{ t('ai.perf.col.linkTo') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="creative in visibleCreatives" :key="creative.creativeId" :data-testid="`product-performance-creative-${creative.creativeId}`">
              <td><span class="pp__creative-name vg-ellipsis" :title="creative.name">{{ creative.name }}</span></td>
              <td class="pp__num">{{ number(creative.spend) }}</td>
              <td class="pp__num">{{ number(creative.revenue) }}</td>
              <td class="pp__num" :class="{ 'pp__dim': !creative.orders }">{{ creative.orders }}</td>
              <td class="pp__num"><span class="pp__roi" :class="roiTone(creative.roi)">{{ number(creative.roi) }}</span></td>
              <td v-if="linkable.length" class="pp__linkcol">
                <div class="pp__link">
                  <select :value="picks[creative.creativeId] ?? ''" class="vg-input vg-input--sm pp__select" @change="picks[creative.creativeId] = ($event.target as HTMLSelectElement).value">
                    <option value="">{{ t('ai.perf.pickContent') }}</option>
                    <option v-for="item in linkable" :key="item.ref" :value="item.ref">{{ t(`ai.line.${item.line}`) }} · {{ item.title }}</option>
                  </select>
                  <button type="button" class="vg-btn vg-btn--xs vg-btn--soft" :disabled="!picks[creative.creativeId] || busy === creative.creativeId" @click="link(creative)"><Link2 :size="13" /> {{ t('ai.perf.link') }}</button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <button v-if="creatives.length > COLLAPSED_COUNT" type="button" class="vg-btn vg-btn--xs vg-btn--ghost pp__more" @click="expanded = !expanded">
        <component :is="expanded ? ChevronUp : ChevronDown" :size="13" />
        {{ expanded ? t('ai.perf.collapse') : t('ai.perf.showAll', { count: creatives.length }) }}
      </button>
    </template>
    <p v-if="error" class="pp__error">{{ error }}</p>
  </section>
</template>

<style scoped>
.pp__hint { font-size: 11.5px; }
.pp__num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.pp__title { display: block; max-width: 320px; padding: 0; border: 0; background: transparent; color: var(--theme-text); font-size: 12.5px; font-weight: 600; text-align: left; cursor: pointer; }
.pp__title:hover { color: var(--vg-accent); }
.pp__sub { display: block; max-width: 320px; font-size: 11.5px; color: var(--theme-text-muted); }
.pp__actions { display: flex; justify-content: flex-end; gap: 6px; white-space: nowrap; }
.pp__empty, .pp__note { margin: 0; font-size: 12.5px; }
.pp__note { margin-top: 10px; }
.pp__subhead { display: flex; align-items: baseline; flex-wrap: wrap; gap: 4px 12px; margin: 16px 0 8px; }
.pp__subhead h4 { margin: 0; font-size: 12.5px; font-weight: 700; color: var(--theme-text); }
.pp__subhead small { margin-left: 4px; font-weight: 500; color: var(--theme-text-muted); }
.pp__subhint { font-size: 11.5px; }
.pp__creative-name { display: block; max-width: 300px; font-family: var(--vg-font-mono, ui-monospace, SFMono-Regular, Consolas, monospace); font-size: 12px; color: var(--theme-text-secondary, var(--theme-text)); }
.pp__dim { color: var(--theme-text-muted); }
.pp__roi { font-weight: 600; }
.pp__roi--good { color: var(--vg-green); }
.pp__roi--bad { color: var(--vg-red); }
.pp__roi--none { color: var(--theme-text-muted); font-weight: 400; }
.pp__linkcol { width: 1%; white-space: nowrap; }
.pp__link { display: flex; align-items: center; gap: 6px; }
.pp__select { width: 200px; }
.pp__more { margin-top: 6px; }
.pp__error { margin: 10px 0 0; font-size: 12px; color: var(--vg-red); }
</style>
