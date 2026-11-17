<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { AlertTriangle, ArrowLeft, Check, Download, Film, FolderOpen, LoaderCircle, Package, Play, Plus, RefreshCw, SlidersHorizontal, Sparkles, UserRound } from 'lucide-vue-next'

/**
 * The default face of a clone task for everyday users:
 * give three things, press one button, watch four plain-language phases, get the video.
 * It only presents state and emits intents; the project view keeps all pipeline logic.
 */
export type CloneSimpleState = 'setup' | 'running' | 'paused' | 'error' | 'done'
export type CloneSimplePhase = { key: string; state: 'done' | 'active' | 'pending' }

const props = defineProps<{
  state: CloneSimpleState
  busy: boolean
  referenceVideoName?: string
  referenceVideoUrl?: string
  productName?: string
  productImageUrl?: string
  modelName?: string
  modelImageUrl?: string
  phases: CloneSimplePhase[]
  statusText?: string
  errorText?: string
  finalVideoUrl?: string
  finalPosterUrl?: string
}>()

const emit = defineEmits<{
  'pick-video': []
  'pick-product': []
  'pick-model': []
  start: []
  resume: []
  'open-advanced': []
  'reveal-output': []
  'open-output': []
  'new-task': []
  back: []
}>()

const { t } = useI18n()

const hasVideo = computed(() => Boolean(props.referenceVideoName || props.referenceVideoUrl))
const hasProduct = computed(() => Boolean(props.productName))
const hasModel = computed(() => Boolean(props.modelName))
const missing = computed(() => {
  const items: string[] = []
  if (!hasVideo.value) items.push(t('cloneUi.simple.video.title'))
  if (!hasProduct.value) items.push(t('cloneUi.simple.product.title'))
  if (!hasModel.value) items.push(t('cloneUi.simple.model.title'))
  return items
})
const canStart = computed(() => !props.busy && missing.value.length === 0)
const headline = computed(() => t(`cloneUi.simple.headline.${props.state}`))
const subline = computed(() => t(`cloneUi.simple.subline.${props.state}`))
</script>

<template>
  <div class="vg-scope csp" data-testid="clone-simple-panel" :data-state="state">
    <button type="button" class="vg-btn vg-btn--sm vg-btn--ghost csp-back" data-testid="clone-simple-back" @click="emit('back')">
      <ArrowLeft :size="14" />{{ t('cloneUi.backToList') }}
    </button>
    <header class="csp-head">
      <div class="csp-head__text">
        <h1>{{ headline }}</h1>
        <p>{{ subline }}</p>
      </div>
      <button type="button" class="vg-btn vg-btn--sm vg-btn--ghost" data-testid="clone-simple-open-advanced" @click="emit('open-advanced')">
        <SlidersHorizontal :size="14" />{{ t('cloneUi.simple.openAdvanced') }}
      </button>
    </header>

    <!-- ============ 1. Give three things ============ -->
    <template v-if="state === 'setup'">
      <div class="csp-inputs">
        <button type="button" class="csp-input" :class="{ 'is-filled': hasVideo }" data-testid="clone-simple-pick-video" :disabled="busy" @click="emit('pick-video')">
          <span class="csp-input__step">1</span>
          <span class="csp-input__media csp-input__media--video">
            <video v-if="referenceVideoUrl" :src="referenceVideoUrl" muted preload="metadata"></video>
            <Film v-else :size="26" />
          </span>
          <span class="csp-input__copy">
            <strong>{{ t('cloneUi.simple.video.title') }}</strong>
            <small :title="referenceVideoName">{{ hasVideo ? referenceVideoName || t('cloneUi.simple.video.chosen') : t('cloneUi.simple.video.hint') }}</small>
          </span>
          <span class="csp-input__action"><Check v-if="hasVideo" :size="14" /><Plus v-else :size="14" />{{ hasVideo ? t('cloneUi.simple.change') : t('cloneUi.simple.video.action') }}</span>
        </button>

        <button type="button" class="csp-input" :class="{ 'is-filled': hasProduct }" data-testid="clone-simple-pick-product" :disabled="busy" @click="emit('pick-product')">
          <span class="csp-input__step">2</span>
          <span class="csp-input__media">
            <img v-if="productImageUrl" :src="productImageUrl" alt="" />
            <Package v-else :size="26" />
          </span>
          <span class="csp-input__copy">
            <strong>{{ t('cloneUi.simple.product.title') }}</strong>
            <small :title="productName">{{ hasProduct ? productName : t('cloneUi.simple.product.hint') }}</small>
          </span>
          <span class="csp-input__action"><Check v-if="hasProduct" :size="14" /><Plus v-else :size="14" />{{ hasProduct ? t('cloneUi.simple.change') : t('cloneUi.simple.product.action') }}</span>
        </button>

        <button type="button" class="csp-input" :class="{ 'is-filled': hasModel }" data-testid="clone-simple-pick-model" :disabled="busy" @click="emit('pick-model')">
          <span class="csp-input__step">3</span>
          <span class="csp-input__media">
            <img v-if="modelImageUrl" :src="modelImageUrl" alt="" />
            <UserRound v-else :size="26" />
          </span>
          <span class="csp-input__copy">
            <strong>{{ t('cloneUi.simple.model.title') }}</strong>
            <small :title="modelName">{{ hasModel ? modelName : t('cloneUi.simple.model.hint') }}</small>
          </span>
          <span class="csp-input__action"><Check v-if="hasModel" :size="14" /><Plus v-else :size="14" />{{ hasModel ? t('cloneUi.simple.change') : t('cloneUi.simple.model.action') }}</span>
        </button>
      </div>

      <p v-if="errorText" class="csp-alert" role="alert" data-testid="clone-simple-error"><AlertTriangle :size="16" /><span>{{ errorText }}</span></p>

      <div class="csp-cta">
        <button type="button" class="vg-btn vg-btn--primary vg-btn--lg csp-cta__btn" data-testid="clone-simple-start" :disabled="!canStart" @click="emit('start')">
          <LoaderCircle v-if="busy" :size="18" class="vg-spin" /><Sparkles v-else :size="18" />
          {{ busy ? t('cloneUi.simple.starting') : t('cloneUi.simple.start') }}
        </button>
        <small data-testid="clone-simple-cta-hint">{{ missing.length ? t('cloneUi.simple.missing', { items: missing.join('、') }) : t('cloneUi.simple.startHint') }}</small>
      </div>
    </template>

    <!-- ============ 2. Watch it run ============ -->
    <template v-else-if="state !== 'done'">
      <ol class="csp-phases" data-testid="clone-simple-phases">
        <li v-for="(phase, index) in phases" :key="phase.key" class="csp-phase" :class="`is-${phase.state}`" :data-phase="phase.key" :data-phase-state="phase.state">
          <span class="csp-phase__dot">
            <Check v-if="phase.state === 'done'" :size="16" />
            <LoaderCircle v-else-if="phase.state === 'active' && state === 'running'" :size="16" class="vg-spin" />
            <template v-else>{{ index + 1 }}</template>
          </span>
          <span class="csp-phase__copy">
            <strong>{{ t(`cloneUi.simple.phases.${phase.key}.title`) }}</strong>
            <small>{{ t(`cloneUi.simple.phases.${phase.key}.desc`) }}</small>
          </span>
        </li>
      </ol>

      <p v-if="state === 'error' && errorText" class="csp-alert" role="alert" data-testid="clone-simple-error"><AlertTriangle :size="16" /><span>{{ errorText }}</span></p>
      <p v-else-if="statusText" class="csp-status" data-testid="clone-simple-status">{{ statusText }}</p>

      <div class="csp-cta">
        <button v-if="state === 'error' || state === 'paused'" type="button" class="vg-btn vg-btn--primary vg-btn--lg csp-cta__btn" data-testid="clone-simple-resume" :disabled="busy" @click="emit('resume')">
          <RefreshCw v-if="state === 'error'" :size="18" /><Play v-else :size="18" />
          {{ state === 'error' ? t('cloneUi.simple.retry') : t('cloneUi.simple.resume') }}
        </button>
        <small>{{ state === 'running' ? t('cloneUi.simple.runningHint') : state === 'error' ? t('cloneUi.simple.errorHint') : t('cloneUi.simple.pausedHint') }}</small>
      </div>
    </template>

    <!-- ============ 3. Get the video ============ -->
    <template v-else>
      <div class="csp-result">
        <div class="csp-result__player">
          <video v-if="finalVideoUrl" :src="finalVideoUrl" :poster="finalPosterUrl || undefined" controls preload="metadata" data-testid="clone-simple-final-video"></video>
        </div>
        <div class="csp-result__actions">
          <button type="button" class="vg-btn vg-btn--primary vg-btn--lg" data-testid="clone-simple-reveal" @click="emit('reveal-output')"><Download :size="18" />{{ t('cloneUi.simple.reveal') }}</button>
          <button type="button" class="vg-btn" @click="emit('open-output')"><FolderOpen :size="15" />{{ t('cloneUi.simple.open') }}</button>
          <button type="button" class="vg-btn" data-testid="clone-simple-new-task" @click="emit('new-task')"><Plus :size="15" />{{ t('cloneUi.simple.newTask') }}</button>
          <small>{{ t('cloneUi.simple.doneHint') }}</small>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.csp { display: flex; flex-direction: column; gap: 22px; width: 100%; max-width: 980px; margin: 0 auto; padding: 28px 8px 72px; color: var(--theme-text); }
.csp-back { align-self: flex-start; margin: 0 0 -10px -8px; }
.csp-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.csp-head__text h1 { margin: 0 0 6px; font-size: 24px; font-weight: 800; }
.csp-head__text p { margin: 0; font-size: 13px; color: var(--theme-text-muted); }

.csp-inputs { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
.csp-input { position: relative; display: flex; flex-direction: column; align-items: stretch; gap: 12px; min-width: 0; padding: 16px; text-align: left; cursor: pointer; border: 1px dashed var(--theme-border-control); border-radius: 14px; background: var(--theme-panel); color: var(--theme-text); transition: border-color .15s ease, background .15s ease; }
.csp-input:hover:not(:disabled) { border-color: var(--vg-accent-line); background: var(--theme-panel-soft); }
.csp-input:disabled { opacity: .6; cursor: not-allowed; }
.csp-input.is-filled { border-style: solid; border-color: var(--vg-accent-line); }
.csp-input__step { position: absolute; top: 12px; left: 12px; z-index: 1; display: grid; place-items: center; width: 22px; height: 22px; border-radius: 999px; font-size: 12px; font-weight: 700; background: var(--theme-panel-soft); color: var(--theme-text-secondary); border: 1px solid var(--theme-border); }
.csp-input.is-filled .csp-input__step { background: var(--vg-accent); border-color: var(--vg-accent); color: var(--theme-on-accent); }
.csp-input__media { display: grid; place-items: center; width: 100%; aspect-ratio: 4 / 3; overflow: hidden; border-radius: 10px; background: var(--theme-panel-soft); color: var(--theme-text-muted); }
.csp-input__media img, .csp-input__media video { width: 100%; height: 100%; object-fit: cover; }
.csp-input__media--video video { object-fit: contain; background: #000; }
.csp-input__copy { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.csp-input__copy strong { font-size: 15px; font-weight: 700; }
.csp-input__copy small { font-size: 12px; color: var(--theme-text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.csp-input__action { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 600; color: var(--vg-accent); }

.csp-cta { display: flex; flex-direction: column; align-items: center; gap: 10px; }
.csp-cta__btn { min-width: 240px; }
.csp-cta small { font-size: 12px; color: var(--theme-text-muted); text-align: center; }

.csp-alert { display: flex; align-items: flex-start; gap: 8px; margin: 0; padding: 12px 14px; font-size: 13px; line-height: 1.55; border-radius: 12px; color: var(--vg-red); background: color-mix(in srgb, var(--vg-red) 10%, transparent); border: 1px solid color-mix(in srgb, var(--vg-red) 35%, transparent); white-space: pre-wrap; word-break: break-word; }
.csp-alert svg { flex-shrink: 0; margin-top: 2px; }
.csp-status { margin: 0; padding: 12px 14px; font-size: 13px; border-radius: 12px; color: var(--theme-text-secondary); background: var(--theme-panel-soft); border: 1px solid var(--theme-border); }

.csp-phases { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin: 0; padding: 0; list-style: none; }
.csp-phase { display: flex; align-items: flex-start; gap: 10px; min-width: 0; padding: 14px; border: 1px solid var(--theme-border); border-radius: 14px; background: var(--theme-panel); }
.csp-phase__dot { display: grid; place-items: center; width: 30px; height: 30px; flex-shrink: 0; border-radius: 999px; font-size: 13px; font-weight: 700; background: var(--theme-panel-soft); color: var(--theme-text-muted); border: 1px solid var(--theme-border); }
.csp-phase__copy { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.csp-phase__copy strong { font-size: 14px; font-weight: 700; color: var(--theme-text-secondary); }
.csp-phase__copy small { font-size: 12px; line-height: 1.5; color: var(--theme-text-muted); }
.csp-phase.is-active { border-color: var(--vg-accent-line); background: var(--vg-accent-soft); }
.csp-phase.is-active .csp-phase__dot { background: var(--theme-panel); border-color: var(--vg-accent-line); color: var(--vg-accent); }
.csp-phase.is-active .csp-phase__copy strong { color: var(--theme-text); }
.csp-phase.is-done .csp-phase__dot { background: var(--vg-accent); border-color: var(--vg-accent); color: var(--theme-on-accent); }
.csp-phase.is-done .csp-phase__copy strong { color: var(--theme-text); }

.csp-result { display: grid; grid-template-columns: minmax(0, 1fr) 260px; gap: 18px; align-items: start; }
.csp-result__player { display: grid; place-items: center; min-height: 360px; max-height: 68vh; overflow: hidden; border-radius: 14px; background: #000; border: 1px solid var(--theme-border); }
.csp-result__player video { max-width: 100%; max-height: 68vh; }
.csp-result__actions { display: flex; flex-direction: column; gap: 10px; }
.csp-result__actions small { font-size: 12px; line-height: 1.6; color: var(--theme-text-muted); }

@media (max-width: 860px) {
  .csp-inputs { grid-template-columns: minmax(0, 1fr); }
  .csp-input { flex-direction: row; align-items: center; }
  .csp-input__media { width: 96px; flex-shrink: 0; }
  .csp-input__copy { flex: 1; }
  .csp-phases { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .csp-result { grid-template-columns: minmax(0, 1fr); }
}
</style>
