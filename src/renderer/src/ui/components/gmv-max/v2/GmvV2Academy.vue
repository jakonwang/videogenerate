<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { BookOpen, GraduationCap, Save, SlidersHorizontal } from 'lucide-vue-next'
import GmvV2Lesson from './GmvV2Lesson.vue'
import { LESSON_IDS, emptyWorkspace, useGmvV2Text, type V2Workspace } from './useGmvV2'

const props = defineProps<{ storeId: string }>()
const { t, friendlyError } = useGmvV2Text()
const workspace = ref<V2Workspace>(emptyWorkspace())
const lesson = ref<string | null>(null)
const margins = ref<Record<string, string>>({})
const thresholds = ref({ safetyMargin: 15, learningDays: 3, underspendUtilization: 50, scaleUtilization: 80, roiStep: 10, budgetStep: 30, minDeliveringCreatives: 40, minOrdersForVerdict: 10 })
const saved = ref(false)
const error = ref('')

async function load() {
  try {
    workspace.value = (await window.api.tiktokGmvMax.getV2Workspace({ storeId: props.storeId })) as V2Workspace
  } catch (cause) {
    error.value = friendlyError(cause)
    return
  }
  margins.value = Object.fromEntries(workspace.value.stores.map((store) => [store.storeId, store.marginPercent !== null ? String(store.marginPercent) : '']))
  const th = workspace.value.settings.thresholds
  thresholds.value = {
    safetyMargin: Math.round((th.safetyMargin ?? 0.15) * 100),
    learningDays: th.learningDays ?? 3,
    underspendUtilization: Math.round((th.underspendUtilization ?? 0.5) * 100),
    scaleUtilization: Math.round((th.scaleUtilization ?? 0.8) * 100),
    roiStep: Math.round((th.roiStep ?? 0.1) * 100),
    budgetStep: Math.round((th.budgetStep ?? 0.3) * 100),
    minDeliveringCreatives: th.minDeliveringCreatives ?? 40,
    minOrdersForVerdict: th.minOrdersForVerdict ?? 10,
  }
}

async function save() {
  error.value = ''
  try {
    for (const store of workspace.value.stores) {
      const raw = margins.value[store.storeId]
      if (raw === '' || raw === undefined) continue
      await window.api.tiktokGmvMax.saveV2Settings({ storeId: store.storeId, marginPercent: Number(raw) })
    }
    const th = thresholds.value
    await window.api.tiktokGmvMax.saveV2Settings({
      thresholds: {
        safetyMargin: th.safetyMargin / 100,
        learningDays: th.learningDays,
        underspendUtilization: th.underspendUtilization / 100,
        scaleUtilization: th.scaleUtilization / 100,
        roiStep: th.roiStep / 100,
        budgetStep: th.budgetStep / 100,
        minDeliveringCreatives: th.minDeliveringCreatives,
        minOrdersForVerdict: th.minOrdersForVerdict,
      },
    })
    saved.value = true
    window.setTimeout(() => (saved.value = false), 2000)
    await load()
  } catch (cause) {
    error.value = friendlyError(cause)
  }
}

onMounted(load)
</script>

<template>
  <div class="vg-scope academy" data-testid="gmv-v2-academy">
    <div v-if="error && !workspace.generatedAt" class="vg-notice vg-notice--danger">{{ error }}</div>
    <section class="vg-stack">
      <h2 class="vg-section-title"><GraduationCap :size="16" /> {{ t('gmvV2.academy.lessonsTitle') }} <small>{{ t('gmvV2.academy.lessonsHint') }}</small></h2>
      <div class="academy__grid">
        <button v-for="(id, index) in LESSON_IDS" :key="id" type="button" class="vg-card vg-card--interactive academy__lesson" @click="lesson = id">
          <span class="academy__index">{{ index + 1 }}</span>
          <span class="academy__copy">
            <strong>{{ t(`gmvV2.lessons.${id}.title`) }}</strong>
            <small>{{ t(`gmvV2.lessons.${id}.oneLine`) }}</small>
          </span>
          <BookOpen :size="15" class="academy__icon" />
        </button>
      </div>
    </section>

    <section class="vg-card">
      <div class="vg-card__head"><span class="vg-card__title"><SlidersHorizontal :size="16" /> {{ t('gmvV2.academy.settingsTitle') }} <small>{{ t('gmvV2.academy.settingsHint') }}</small></span></div>
      <div v-if="error" class="vg-notice vg-notice--danger">{{ error }}</div>
      <h4 class="academy__sub">{{ t('gmvV2.academy.margins') }}</h4>
      <div class="vg-form-grid">
        <label v-for="store in workspace.stores" :key="store.storeId" class="vg-field">
          <span class="vg-field__label">{{ store.storeName }}</span>
          <span class="academy__pct"><input v-model="margins[store.storeId]" class="vg-input" type="number" min="1" max="99" /> %</span>
          <span class="vg-field__hint">{{ margins[store.storeId] ? t('gmvV2.setup.breakEvenPreview', { roi: (100 / Number(margins[store.storeId])).toFixed(2) }) : t('gmvV2.setup.placeholder') }}</span>
        </label>
        <p v-if="!workspace.stores.length" class="vg-muted">{{ t('gmvV2.academy.noStores') }}</p>
      </div>
      <h4 class="academy__sub">{{ t('gmvV2.academy.rules') }}</h4>
      <div class="vg-form-grid vg-form-grid--3">
        <label v-for="key in (Object.keys(thresholds) as Array<keyof typeof thresholds>)" :key="key" class="vg-field">
          <span class="vg-field__label">{{ t(`gmvV2.academy.thresholds.${key}`) }}</span>
          <input v-model.number="thresholds[key]" class="vg-input" type="number" min="0" />
          <span class="vg-field__hint">{{ t(`gmvV2.academy.thresholdHints.${key}`) }}</span>
        </label>
      </div>
      <div class="vg-row academy__save">
        <button type="button" class="vg-btn vg-btn--primary vg-btn--sm" @click="save"><Save :size="14" /> {{ t('common.save') }}</button>
        <span v-if="saved" class="vg-pill vg-pill--green">{{ t('gmvV2.academy.saved') }}</span>
      </div>
    </section>

    <GmvV2Lesson :lesson-id="lesson" @close="lesson = null" />
  </div>
</template>

<style scoped>
.academy { display: flex; flex-direction: column; gap: 16px; }
.academy__grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 10px; }
.academy__lesson { display: flex; align-items: flex-start; gap: 12px; padding: 14px; text-align: left; color: var(--theme-text); }
.academy__index { width: 26px; height: 26px; flex-shrink: 0; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; background: var(--vg-accent-soft); color: var(--vg-accent); font-weight: 800; font-size: 12.5px; }
.academy__copy { flex: 1; display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.academy__copy strong { font-size: 13.5px; }
.academy__copy small { font-size: 12px; color: var(--theme-text-secondary); line-height: 1.5; }
.academy__icon { color: var(--theme-text-muted); flex-shrink: 0; margin-top: 4px; }
.academy__sub { margin: 14px 0 8px; font-size: 13px; color: var(--theme-text-secondary); }
.academy__pct { display: inline-flex; align-items: center; gap: 6px; }
.academy__pct .vg-input { width: 100px; }
.academy__save { margin-top: 14px; }
</style>
