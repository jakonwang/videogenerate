<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { BarChart3, CalendarRange, Lightbulb, RefreshCcw, Send, Sparkles, Wand2 } from 'lucide-vue-next'
import { useAiProducerStore } from '@/stores/aiProducer'

type LineStats = { line: string; produced: number; approved: number; redo: number; discarded: number; published: number; approvalRate: number }
type Insights = {
  generatedAt: number
  rangeDays: number
  lines: LineStats[]
  topRedoReasons: Array<{ reason: string; count: number }>
  topProducts: Array<{ productId: string; productName: string; produced: number; approved: number; published: number }>
  publish: { total: number; published: number; failed: number; draft: number }
  recommendations: string[]
}
type Brief = { id: string; kind: 'daily' | 'weekly'; periodKey: string; headline: string; summary?: string; createdAt: number; items: Array<{ title: string; detail: string; aiPrompt?: string }> }

const { t } = useI18n()
const router = useRouter()
const ai = useAiProducerStore()
const range = ref(7)
const data = ref<Insights | null>(null)
const history = ref<Brief[]>([])
const loading = ref(false)
const generating = ref(false)

const totals = computed(() => {
  const lines = data.value?.lines || []
  const produced = lines.reduce((sum, row) => sum + row.produced, 0)
  const approved = lines.reduce((sum, row) => sum + row.approved, 0)
  const decided = lines.reduce((sum, row) => sum + row.approved + row.redo + row.discarded, 0)
  return { produced, approved, rate: decided ? Math.round((approved / decided) * 100) : 0, published: data.value?.publish.published || 0 }
})
const maxProduced = computed(() => Math.max(1, ...(data.value?.lines || []).map((row) => row.produced)))
const weeklyBriefs = computed(() => history.value.filter((brief) => brief.kind === 'weekly'))

async function load() {
  loading.value = true
  try {
    const [insights, briefs] = await Promise.all([window.api.contentHub.insights(range.value), window.api.contentHub.listBriefs(30)])
    data.value = insights as Insights
    history.value = briefs as Brief[]
  } finally {
    loading.value = false
  }
}

async function generateWeekly() {
  generating.value = true
  try {
    await window.api.contentHub.generateBrief('weekly')
    await load()
  } finally {
    generating.value = false
  }
}

function askAi(prompt: string) {
  void ai.open({ fresh: true, prompt, send: true })
}

watch(range, () => void load())
onMounted(load)
</script>

<template>
  <main class="vg-scope vg-page insights" data-testid="insights-view">
    <header class="vg-page-head">
      <span class="vg-page-head__icon"><BarChart3 :size="20" /></span>
      <div class="vg-page-head__text">
        <h1>{{ t('ai.insights.title') }}</h1>
        <p>{{ t('ai.insights.desc') }}</p>
      </div>
      <div class="vg-page-head__actions">
        <div class="vg-seg vg-seg--sm">
          <button v-for="days in [7, 30, 90]" :key="days" type="button" class="vg-seg__btn" :class="{ 'is-active': range === days }" @click="range = days">{{ t('ai.insights.days', { count: days }) }}</button>
        </div>
        <button type="button" class="vg-btn vg-btn--sm" :disabled="loading" @click="load"><RefreshCcw :size="14" :class="{ 'vg-spin': loading }" /></button>
        <button type="button" class="vg-btn vg-btn--sm vg-btn--primary" :disabled="generating" @click="generateWeekly"><CalendarRange :size="14" /> {{ t('ai.insights.generateWeekly') }}</button>
      </div>
    </header>

    <section class="vg-stats">
      <div class="vg-stat"><span class="vg-stat__body"><span class="vg-stat__label">{{ t('ai.insights.produced') }}</span><span class="vg-stat__value">{{ totals.produced }}</span></span></div>
      <div class="vg-stat"><span class="vg-stat__body"><span class="vg-stat__label">{{ t('ai.insights.approved') }}</span><span class="vg-stat__value">{{ totals.approved }}</span></span></div>
      <div class="vg-stat"><span class="vg-stat__body"><span class="vg-stat__label">{{ t('ai.insights.approvalRate') }}</span><span class="vg-stat__value">{{ totals.rate }}%</span></span></div>
      <div class="vg-stat"><span class="vg-stat__body"><span class="vg-stat__label">{{ t('ai.insights.published') }}</span><span class="vg-stat__value">{{ totals.published }}</span></span></div>
    </section>

    <div class="insights__grid">
      <section class="vg-card">
        <div class="vg-card__head"><span class="vg-card__title">{{ t('ai.insights.byLine') }}</span></div>
        <table class="vg-table vg-table--compact">
          <thead>
            <tr>
              <th>{{ t('ai.insights.line') }}</th>
              <th>{{ t('ai.insights.produced') }}</th>
              <th>{{ t('ai.insights.approved') }}</th>
              <th>{{ t('ai.insights.redo') }}</th>
              <th>{{ t('ai.insights.approvalRate') }}</th>
              <th>{{ t('ai.insights.published') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in data?.lines || []" :key="row.line">
              <td>
                <span class="insights__line">{{ t(`ai.line.${row.line}`) }}</span>
                <span class="insights__bar"><span :style="{ width: `${(row.produced / maxProduced) * 100}%` }"></span></span>
              </td>
              <td class="vg-num">{{ row.produced }}</td>
              <td class="vg-num">{{ row.approved }}</td>
              <td class="vg-num">{{ row.redo }}</td>
              <td class="vg-num">{{ row.approved + row.redo + row.discarded ? `${row.approvalRate}%` : '-' }}</td>
              <td class="vg-num">{{ row.published }}</td>
            </tr>
          </tbody>
        </table>
        <p class="vg-field__hint insights__hint">{{ t('ai.insights.dataNote') }}</p>
      </section>

      <section class="vg-card">
        <div class="vg-card__head"><span class="vg-card__title"><Lightbulb :size="16" /> {{ t('ai.insights.recommendations') }}</span></div>
        <ul class="insights__recs">
          <li v-for="item in data?.recommendations || []" :key="item">{{ item }}</li>
        </ul>
        <button type="button" class="vg-btn vg-btn--soft vg-btn--block" @click="askAi(t('ai.insights.askPlan'))"><Wand2 :size="14" /> {{ t('ai.insights.askPlanButton') }}</button>
      </section>

      <section class="vg-card">
        <div class="vg-card__head"><span class="vg-card__title">{{ t('ai.insights.topProducts') }}</span></div>
        <div class="vg-list">
          <button v-for="product in data?.topProducts || []" :key="product.productId" type="button" class="vg-list__item vg-list__item--button" @click="router.push(`/products/${product.productId}`)">
            <span class="vg-list__main">
              <span class="vg-list__title">{{ product.productName }}</span>
              <span class="vg-list__sub">{{ t('ai.insights.productLine', product) }}</span>
            </span>
          </button>
          <p v-if="!data?.topProducts.length" class="vg-muted insights__empty">{{ t('ai.insights.noData') }}</p>
        </div>
      </section>

      <section class="vg-card">
        <div class="vg-card__head"><span class="vg-card__title">{{ t('ai.insights.redoReasons') }}</span></div>
        <div class="vg-list">
          <div v-for="item in data?.topRedoReasons || []" :key="item.reason" class="vg-list__item">
            <span class="vg-list__main"><span class="vg-list__title">{{ item.reason }}</span></span>
            <span class="vg-count">{{ item.count }}</span>
          </div>
          <p v-if="!data?.topRedoReasons.length" class="vg-muted insights__empty">{{ t('ai.insights.noRedo') }}</p>
        </div>
        <button type="button" class="vg-btn vg-btn--ghost vg-btn--sm" @click="router.push('/settings?section=brand')"><Sparkles :size="14" /> {{ t('ai.insights.editMemory') }}</button>
      </section>

      <section class="vg-card">
        <div class="vg-card__head"><span class="vg-card__title"><Send :size="16" /> {{ t('ai.insights.publish') }}</span></div>
        <dl class="vg-kv">
          <dt>{{ t('ai.insights.publishTotal') }}</dt><dd>{{ data?.publish.total || 0 }}</dd>
          <dt>{{ t('ai.insights.publishDone') }}</dt><dd>{{ data?.publish.published || 0 }}</dd>
          <dt>{{ t('ai.insights.publishDraft') }}</dt><dd>{{ data?.publish.draft || 0 }}</dd>
          <dt>{{ t('ai.insights.publishFailed') }}</dt><dd>{{ data?.publish.failed || 0 }}</dd>
        </dl>
        <button type="button" class="vg-btn vg-btn--ghost vg-btn--sm" @click="router.push('/publish')">{{ t('ai.insights.openPublish') }}</button>
      </section>

      <section class="vg-card">
        <div class="vg-card__head"><span class="vg-card__title"><CalendarRange :size="16" /> {{ t('ai.insights.weeklyHistory') }}</span></div>
        <div class="vg-list">
          <div v-for="brief in weeklyBriefs" :key="brief.id" class="vg-list__item insights__brief">
            <span class="vg-list__main">
              <span class="vg-list__title">{{ brief.headline }}</span>
              <span class="vg-list__sub">{{ brief.periodKey.replace('W', '') }}{{ brief.summary ? ` · ${brief.summary}` : '' }}</span>
            </span>
          </div>
          <p v-if="!weeklyBriefs.length" class="vg-muted insights__empty">{{ t('ai.insights.noWeekly') }}</p>
        </div>
      </section>
    </div>
  </main>
</template>

<style scoped>
.insights { width: min(1400px, 100%); margin: 0 auto; }
.insights__grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.insights__grid > .vg-card:first-child { grid-column: 1 / -1; }
.insights__line { display: block; font-weight: 600; }
.insights__bar { display: block; height: 4px; margin-top: 4px; border-radius: 4px; background: var(--theme-panel-soft); overflow: hidden; width: 140px; }
.insights__bar span { display: block; height: 100%; background: var(--vg-accent); border-radius: 4px; }
.insights__hint { margin-top: 8px; }
.insights__recs { margin: 0 0 12px; padding-left: 18px; display: flex; flex-direction: column; gap: 8px; font-size: 13px; line-height: 1.6; }
.insights__empty { padding: 12px 4px; font-size: 12.5px; }
.insights__brief .vg-list__sub { white-space: normal; }
@media (max-width: 1100px) { .insights__grid { grid-template-columns: minmax(0, 1fr); } }
</style>
