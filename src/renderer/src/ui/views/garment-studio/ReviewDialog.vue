<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ChevronLeft, ChevronRight, Download, LoaderCircle, RefreshCw, X } from 'lucide-vue-next'
import { SCENE_REDO_REASONS, type SceneSwapItem } from '../../../../../shared/sceneSwap'
import CompareImage from './CompareImage.vue'
import SwapImage from './SwapImage.vue'

const props = defineProps<{ item: SceneSwapItem; aligned: boolean; busy: boolean }>()
const emit = defineEmits<{ close: []; step: [offset: number]; act: [action: 'redo' | 'accept' | 'reject', reasons: string[]]; download: [] }>()
const { t } = useI18n()
const k = (key: string) => t(`ai.sceneSwap.${key}`)
const reasons = ref<string[]>([])
watch(() => props.item.id, () => (reasons.value = []))
const toggle = (reason: string) => (reasons.value = reasons.value.includes(reason) ? reasons.value.filter((item) => item !== reason) : [...reasons.value, reason])
const working = () => ['queued', 'running'].includes(props.item.status)

function onKey(event: KeyboardEvent) {
  if (event.key === 'Escape') emit('close')
  else if (event.key === 'ArrowLeft') emit('step', -1)
  else if (event.key === 'ArrowRight') emit('step', 1)
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="review" role="dialog" aria-modal="true" :aria-label="item.sourceName" @click.self="emit('close')">
    <div class="review__box">
      <header class="review__head">
        <strong>{{ item.sourceName }}</strong><span class="review__scene">{{ item.sceneName }}</span>
        <span class="vg-toolbar__spacer" />
        <button type="button" class="vg-icon-btn" :aria-label="k('prev')" @click="emit('step', -1)"><ChevronLeft :size="18" /></button>
        <button type="button" class="vg-icon-btn" :aria-label="k('next')" @click="emit('step', 1)"><ChevronRight :size="18" /></button>
        <button type="button" class="vg-icon-btn" :aria-label="k('close')" @click="emit('close')"><X :size="18" /></button>
      </header>
      <div class="review__body">
        <div class="review__stage">
          <CompareImage v-if="aligned && item.outputFileId" :before="item.sourceFileId" :after="item.outputFileId" />
          <div v-else class="review__pair"><SwapImage :file-id="item.sourceFileId" fill :alt="k('original')" /><SwapImage v-if="item.outputFileId" :file-id="item.outputFileId" fill :alt="k('result')" /></div>
        </div>
        <aside class="review__side">
          <div v-if="item.checks.length">
            <h2 class="review__label">{{ k('checks') }}</h2>
            <div v-for="check in item.checks" :key="check.key" class="check"><span>{{ k(`check.${check.key}`) }}</span><strong :class="`is-${check.level}`">{{ k(`level.${check.level}`) }}</strong></div>
          </div>
          <div v-if="item.error" class="vg-notice vg-notice--danger">{{ item.error }}</div>
          <div v-if="item.status === 'review'" class="vg-notice vg-notice--warning">{{ item.trial ? k('reviewNoticeTrial') : k('reviewNotice') }}</div>
          <p v-if="working()" class="vg-row"><LoaderCircle :size="16" class="vg-spin" /> {{ k(`status.${item.status}`) }}</p>
          <template v-else>
            <div>
              <h2 class="review__label">{{ k('whatsWrong') }}</h2>
              <div class="reasons"><button v-for="reason in SCENE_REDO_REASONS" :key="reason" type="button" class="reason" :class="{ 'is-on': reasons.includes(reason) }" :aria-pressed="reasons.includes(reason)" @click="toggle(reason)">{{ k(`reason.${reason}`) }}</button></div>
            </div>
            <button type="button" class="vg-btn" :class="{ 'vg-btn--primary': item.status === 'review' || item.status === 'failed' }" :disabled="busy" @click="emit('act', 'redo', reasons)"><RefreshCw :size="15" /> {{ item.status === 'passed' || item.status === 'rejected' ? k('redoPaid') : k('redo') }}</button>
            <template v-if="item.status === 'review'">
              <button type="button" class="vg-btn" :disabled="busy" @click="emit('act', 'accept', [])">{{ item.trial ? k('acceptFree') : k('accept') }}</button>
              <button type="button" class="vg-btn vg-btn--danger" :disabled="busy" @click="emit('act', 'reject', [])">{{ item.trial ? k('rejectFree') : k('reject') }}</button>
            </template>
            <button v-if="item.status === 'passed'" type="button" class="vg-btn vg-btn--primary" :disabled="busy" @click="emit('download')"><Download :size="15" /> {{ k('downloadOne') }}</button>
          </template>
        </aside>
      </div>
    </div>
  </div>
</template>

<style scoped>
.review { position: fixed; inset: 0; z-index: 2000; display: flex; padding: 28px; background: rgba(0, 0, 0, .72); }
.review__box { display: flex; flex: 1; flex-direction: column; max-width: 1400px; margin: 0 auto; overflow: hidden; border: 1px solid var(--gs-line); border-radius: 12px; background: var(--gs-bg); color: var(--theme-text); }
.review__head { display: flex; gap: 10px; align-items: center; padding: 10px 12px 10px 20px; border-bottom: 1px solid var(--gs-line); }
.review__head strong { overflow: hidden; font-size: 14px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.review__scene { color: var(--theme-text-muted); white-space: nowrap; }
.review__body { display: grid; flex: 1; grid-template-columns: minmax(0, 1fr) 300px; min-height: 0; }
.review__stage { min-height: 0; padding: 20px; background: var(--gs-well); }
.review__pair { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; height: 100%; min-height: 0; }
.review__side { display: flex; flex-direction: column; gap: 14px; overflow: auto; padding: 20px; border-left: 1px solid var(--gs-line); }
.review__label { margin-bottom: 8px; color: var(--theme-text-muted); font-size: 12px; font-weight: 500; }
.check { display: flex; justify-content: space-between; padding: 7px 0; font-size: 13px; }
.check strong { font-weight: 500; }
.is-ok { color: var(--vg-accent); }
.is-warn { color: var(--vg-amber); }
.is-unknown { color: var(--theme-text-muted); }
.reasons { display: flex; flex-wrap: wrap; gap: 6px; }
.reason { padding: 5px 10px; border: 1px solid var(--gs-line); border-radius: 6px; background: none; color: var(--theme-text-secondary); font-size: 12.5px; cursor: pointer; }
.reason:hover { border-color: var(--theme-text-muted); }
.reason.is-on { border-color: var(--vg-accent); background: var(--vg-accent-soft); color: var(--vg-accent); }
.review__side > .vg-btn { width: 100%; flex-shrink: 0; }
button:focus-visible { outline: 2px solid var(--vg-accent); outline-offset: 2px; }
@media (max-width: 900px) { .review { padding: 0; } .review__box { border-radius: 0; overflow: auto; } .review__body { grid-template-columns: 1fr; } .review__stage { height: 56vh; } .review__side { border-left: 0; overflow: visible; } }
</style>
