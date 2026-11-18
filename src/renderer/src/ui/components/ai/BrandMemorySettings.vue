<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Brain, History, Save, Trash2 } from 'lucide-vue-next'

type Feedback = { id: string; line: string; decision: string; reason?: string; note?: string; createdAt: number }

const { t } = useI18n()
const brand = ref({ brandName: '', tone: '', audience: '', bannedWords: '', subtitleStyle: '', watermarkText: '', notes: '' })
const feedback = ref<Feedback[]>([])
const saving = ref(false)
const saved = ref(false)

async function load() {
  const data = (await window.api.contentHub.getBrandMemory()) as { brand: any; feedback: Feedback[] }
  brand.value = { ...data.brand, bannedWords: (data.brand.bannedWords || []).join('，') }
  feedback.value = data.feedback
}

async function save() {
  saving.value = true
  try {
    await window.api.contentHub.saveBrand({
      ...brand.value,
      bannedWords: brand.value.bannedWords.split(/[,，、\n]/).map((word) => word.trim()).filter(Boolean),
    })
    saved.value = true
    window.setTimeout(() => (saved.value = false), 2000)
  } finally {
    saving.value = false
  }
}

async function forget(id: string) {
  await window.api.contentHub.removeFeedback(id)
  feedback.value = feedback.value.filter((item) => item.id !== id)
}

onMounted(load)
</script>

<template>
  <div class="vg-stack" data-testid="settings-brand-memory">
    <section class="vg-card">
      <div class="vg-card__head">
        <span class="vg-card__title"><Brain :size="16" /> {{ t('ai.brand.title') }} <small>{{ t('ai.brand.subtitle') }}</small></span>
      </div>
      <div class="vg-form-grid">
        <label class="vg-field"><span class="vg-field__label">{{ t('ai.brand.brandName') }}</span><input v-model="brand.brandName" class="vg-input" maxlength="80" /></label>
        <label class="vg-field"><span class="vg-field__label">{{ t('ai.brand.watermarkText') }}</span><input v-model="brand.watermarkText" class="vg-input" maxlength="80" /></label>
        <label class="vg-field"><span class="vg-field__label">{{ t('ai.brand.tone') }}</span><textarea v-model="brand.tone" class="vg-textarea" rows="3" :placeholder="t('ai.brand.tonePlaceholder')"></textarea></label>
        <label class="vg-field"><span class="vg-field__label">{{ t('ai.brand.audience') }}</span><textarea v-model="brand.audience" class="vg-textarea" rows="3" :placeholder="t('ai.brand.audiencePlaceholder')"></textarea></label>
        <label class="vg-field"><span class="vg-field__label">{{ t('ai.brand.bannedWords') }}</span><textarea v-model="brand.bannedWords" class="vg-textarea" rows="2" :placeholder="t('ai.brand.bannedWordsPlaceholder')"></textarea></label>
        <label class="vg-field"><span class="vg-field__label">{{ t('ai.brand.subtitleStyle') }}</span><textarea v-model="brand.subtitleStyle" class="vg-textarea" rows="2"></textarea></label>
      </div>
      <label class="vg-field brand__notes"><span class="vg-field__label">{{ t('ai.brand.notes') }}</span><textarea v-model="brand.notes" class="vg-textarea" rows="3"></textarea></label>
      <div class="vg-row brand__actions">
        <button type="button" class="vg-btn vg-btn--primary vg-btn--sm" :disabled="saving" data-testid="brand-save" @click="save"><Save :size="14" /> {{ t('common.save') }}</button>
        <span v-if="saved" class="vg-pill vg-pill--green">{{ t('ai.space.saved') }}</span>
        <span class="vg-muted brand__hint">{{ t('ai.brand.hint') }}</span>
      </div>
    </section>

    <section class="vg-card">
      <div class="vg-card__head">
        <span class="vg-card__title"><History :size="16" /> {{ t('ai.brand.learned') }} <small>{{ t('ai.brand.learnedHint') }}</small></span>
      </div>
      <div v-if="feedback.length" class="vg-list">
        <div v-for="item in feedback.slice(0, 40)" :key="item.id" class="vg-list__item">
          <span class="vg-list__main">
            <span class="vg-list__title">{{ t(`ai.inbox.tabs.${item.decision}`) }} · {{ t(`ai.line.${item.line}`) }}<template v-if="item.reason"> · {{ t(`ai.redo.${item.reason}`) }}</template></span>
            <span class="vg-list__sub">{{ item.note || new Date(item.createdAt).toLocaleString() }}</span>
          </span>
          <button type="button" class="vg-icon-btn vg-icon-btn--sm" :title="t('ai.brand.forget')" @click="forget(item.id)"><Trash2 :size="14" /></button>
        </div>
      </div>
      <p v-else class="vg-muted">{{ t('ai.brand.noFeedback') }}</p>
    </section>
  </div>
</template>

<style scoped>
.brand__notes { margin-top: 12px; }
.brand__actions { margin-top: 12px; }
.brand__hint { font-size: 12px; }
</style>
