<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { BookOpen, ExternalLink, X } from 'lucide-vue-next'

const props = defineProps<{ lessonId: string | null }>()
const emit = defineEmits<{ (e: 'close'): void }>()
const { t, tm, rt } = useI18n()

const steps = computed(() => {
  if (!props.lessonId) return [] as string[]
  const value = tm(`gmvV2.lessons.${props.lessonId}.how`) as unknown
  return Array.isArray(value) ? value.map((item: any) => (typeof item === 'string' ? item : rt(item))) : []
})

function openSource(url: string) {
  void window.api.shell.openExternal(url)
}
</script>

<template>
  <Teleport to="body">
    <div v-if="lessonId" class="vg-scope vg-backdrop" @click.self="emit('close')">
      <div class="vg-dialog lesson" role="dialog" aria-modal="true" data-testid="gmv-v2-lesson">
        <div class="vg-dialog__head">
          <div class="vg-dialog__title">
            <span class="vg-dialog__title-icon"><BookOpen :size="18" /></span>
            <div>
              <h2>{{ t(`gmvV2.lessons.${lessonId}.title`) }}</h2>
              <p>{{ t(`gmvV2.lessons.${lessonId}.oneLine`) }}</p>
            </div>
          </div>
          <button class="vg-icon-btn" type="button" :aria-label="t('common.close')" @click="emit('close')"><X :size="16" /></button>
        </div>
        <div class="vg-dialog__body lesson__body">
          <section>
            <h3>{{ t('gmvV2.lesson.why') }}</h3>
            <p>{{ t(`gmvV2.lessons.${lessonId}.why`) }}</p>
          </section>
          <section v-if="steps.length">
            <h3>{{ t('gmvV2.lesson.how') }}</h3>
            <ol>
              <li v-for="step in steps" :key="step">{{ step }}</li>
            </ol>
          </section>
          <section class="lesson__source">
            <span class="vg-pill" :class="t(`gmvV2.lessons.${lessonId}.sourceType`) === 'official' ? 'vg-pill--accent' : 'vg-pill--amber'">
              {{ t(`gmvV2.lesson.source.${t(`gmvV2.lessons.${lessonId}.sourceType`)}`) }}
            </span>
            <button type="button" class="vg-link" @click="openSource(t(`gmvV2.lessons.${lessonId}.url`))">
              {{ t(`gmvV2.lessons.${lessonId}.sourceName`) }} <ExternalLink :size="12" />
            </button>
          </section>
        </div>
        <div class="vg-dialog__foot">
          <div class="vg-dialog__foot-actions">
            <button class="vg-btn vg-btn--primary" type="button" @click="emit('close')">{{ t('gmvV2.lesson.gotIt') }}</button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.lesson { width: min(620px, calc(100vw - 32px)); }
.lesson__body { display: flex; flex-direction: column; gap: 16px; font-size: 13.5px; line-height: 1.7; }
.lesson__body h3 { margin: 0 0 6px; font-size: 13px; color: var(--theme-text-secondary); }
.lesson__body p { margin: 0; }
.lesson__body ol { margin: 0; padding-left: 20px; display: flex; flex-direction: column; gap: 6px; }
.lesson__source { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-size: 12.5px; }
.lesson__source .vg-link { display: inline-flex; align-items: center; gap: 4px; }
</style>
