<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Dna, Loader2, ScanSearch, Wand2 } from 'lucide-vue-next'
import { GENE_MIN_SAMPLES, type GeneReport } from '../../../../../shared/creativeGenes'

type Job = { running: boolean; total: number; done: number; failed: number; stage?: 'downloading' | 'analyzing'; lastError?: string }
const props = defineProps<{ productId: string; productName: string }>()
const emit = defineEmits<{ (event: 'make-with-recipe', prompt: string): void }>()
const { t } = useI18n()

const report = ref<GeneReport | null>(null)
const pending = ref(0)
const job = ref<Job | null>(null)
const error = ref('')
let timer: number | undefined

const number = (value: number) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value || 0)
const percent = (value: number) => `${value >= 0 ? '+' : ''}${Math.round(value * 100)}%`
const dimensions = computed(() => (report.value?.dimensions || []).filter((dimension) => dimension.values.length))
const maxRoi = computed(() => Math.max(0.01, ...dimensions.value.flatMap((dimension) => dimension.values.map((value) => value.roi))))

async function load() {
  try {
    const result = await window.api.contentHub.creativeGenes(props.productId)
    report.value = result.report
    pending.value = result.pending
    job.value = result.job
    schedule()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  }
}
function schedule() {
  window.clearTimeout(timer)
  if (job.value?.running) timer = window.setTimeout(() => void load(), 2500)
}

async function analyze() {
  error.value = ''
  job.value = await window.api.contentHub.analyzeCreativeGenes(props.productId)
  schedule()
}

function makeWithRecipe() {
  const recipe = (report.value?.bestRecipe || []).map((row) => `${t(`ai.genes.dim.${row.dimension}`)}：${row.label}`).join('；')
  emit('make-with-recipe', t('ai.genes.makePrompt', { product: props.productName, category: report.value?.category || '', recipe }))
}

watch(() => props.productId, () => void load(), { immediate: true })
onBeforeUnmount(() => window.clearTimeout(timer))
</script>

<template>
  <section class="vg-card cg" data-testid="creative-genes">
    <div class="vg-card__head">
      <span class="vg-card__title"><Dna :size="16" /> {{ t('ai.genes.title') }}<small v-if="report?.category">{{ report.category }}</small></span>
      <span v-if="report" class="vg-muted cg__hint">{{ t('ai.genes.hint', { count: report.measured, roi: number(report.avgRoi) }) }}</span>
    </div>

    <div v-if="job?.running" class="cg__progress" data-testid="creative-genes-progress">
      <Loader2 :size="14" class="cg__spin" />
      {{ t('ai.genes.progress', { done: Math.min(job.done + 1, Math.max(job.total, 1)), total: Math.max(job.total, 1), stage: t(`ai.genes.stage.${job.stage || 'downloading'}`) }) }}
    </div>
    <p v-else-if="job && job.finishedAt && job.failed" class="vg-muted cg__note">{{ t('ai.genes.someFailed', { count: job.failed, error: job.lastError || '' }) }}</p>

    <template v-if="report && report.bestRecipe.length">
      <div class="cg__recipe" data-testid="creative-genes-recipe">
        <span class="cg__recipe-label">{{ t('ai.genes.best') }}</span>
        <span v-for="row in report.bestRecipe" :key="row.dimension" class="vg-pill vg-pill--green cg__chip">
          {{ t(`ai.genes.dim.${row.dimension}`) }}：{{ row.label }} <b>{{ percent(row.lift) }}</b>
        </span>
        <button type="button" class="vg-btn vg-btn--xs vg-btn--soft cg__make" data-testid="creative-genes-make" @click="makeWithRecipe"><Wand2 :size="13" /> {{ t('ai.genes.make') }}</button>
      </div>
    </template>

    <div v-if="dimensions.length" class="cg__grid">
      <div v-for="dimension in dimensions" :key="dimension.dimension" class="cg__dim">
        <h4>{{ t(`ai.genes.dim.${dimension.dimension}`) }}</h4>
        <div v-for="value in dimension.values" :key="value.value" class="cg__row" :class="{ 'is-best': dimension.best?.value === value.value, 'is-thin': value.creatives < GENE_MIN_SAMPLES }" :title="t('ai.genes.rowTitle', { count: value.creatives, spend: number(value.spend), orders: value.orders })">
          <span class="cg__name">{{ value.label }}</span>
          <span class="cg__bar"><i :style="{ width: `${Math.max(4, (value.roi / maxRoi) * 100)}%` }" /></span>
          <span class="cg__roi">ROI {{ number(value.roi) }}</span>
          <span class="cg__count">{{ value.creatives < GENE_MIN_SAMPLES ? t('ai.genes.thin') : t('ai.genes.count', { count: value.creatives }) }}</span>
        </div>
      </div>
    </div>
    <p v-else-if="!job?.running" class="vg-muted cg__note">{{ pending ? t('ai.genes.emptyPending') : t('ai.genes.empty') }}</p>

    <div v-if="pending && !job?.running" class="cg__actions">
      <button type="button" class="vg-btn vg-btn--sm" data-testid="creative-genes-analyze" @click="analyze"><ScanSearch :size="14" /> {{ t('ai.genes.analyze', { count: pending }) }}</button>
      <span class="vg-muted cg__cost">{{ t('ai.genes.cost') }}</span>
    </div>
    <p v-if="error" class="cg__error">{{ error }}</p>
  </section>
</template>

<style scoped>
.cg__hint { font-size: 11.5px; }
.vg-card__title small { margin-left: 6px; padding: 1px 6px; border-radius: 4px; background: var(--theme-panel-soft); color: var(--theme-text-muted); font-size: 11px; font-weight: 500; }
.cg__progress { display: flex; align-items: center; gap: 6px; margin-bottom: 10px; padding: 8px 12px; border-radius: 8px; background: var(--vg-accent-soft); font-size: 12.5px; color: var(--theme-text); }
.cg__spin { animation: cg-spin 1s linear infinite; color: var(--vg-accent); }
@keyframes cg-spin { to { transform: rotate(360deg); } }
.cg__recipe { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-bottom: 12px; padding: 10px 12px; border: 1px solid var(--vg-accent-line); border-radius: 8px; background: var(--vg-accent-soft); }
.cg__recipe-label { font-size: 12.5px; font-weight: 700; color: var(--theme-text); margin-right: 4px; }
.cg__chip b { margin-left: 4px; }
.cg__make { margin-left: auto; }
.cg__grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 12px 20px; }
.cg__dim h4 { margin: 0 0 6px; font-size: 12.5px; font-weight: 700; color: var(--theme-text); }
.cg__row { display: grid; grid-template-columns: 110px minmax(0, 1fr) 70px 64px; align-items: center; gap: 8px; padding: 3px 0; font-size: 12px; color: var(--theme-text); }
.cg__row.is-best .cg__name { color: var(--vg-green); font-weight: 700; }
.cg__row.is-thin { opacity: 0.55; }
.cg__name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cg__bar { height: 6px; border-radius: 3px; background: var(--theme-panel-soft); overflow: hidden; }
.cg__bar i { display: block; height: 100%; border-radius: 3px; background: var(--vg-accent); }
.cg__row.is-best .cg__bar i { background: var(--vg-green); }
.cg__roi { text-align: right; font-variant-numeric: tabular-nums; }
.cg__count { text-align: right; color: var(--theme-text-muted); font-size: 11px; }
.cg__note { margin: 0; font-size: 12.5px; }
.cg__actions { display: flex; align-items: center; gap: 10px; margin-top: 12px; }
.cg__cost { font-size: 11.5px; }
.cg__error { margin: 8px 0 0; font-size: 12px; color: var(--vg-red); }
</style>
