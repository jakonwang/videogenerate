<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ArrowLeft, Download, LoaderCircle, Pause, Play, RefreshCw, Trash2 } from 'lucide-vue-next'
import type { SceneSwapBatch, SceneSwapItem } from '../../../../../shared/sceneSwap'
import ReviewDialog from './ReviewDialog.vue'
import CompareImage from './CompareImage.vue'
import SwapImage from './SwapImage.vue'

const props = defineProps<{ batch: SceneSwapBatch; busy: boolean; pointsPerImage: number }>()
const emit = defineEmits<{
  back: []
  action: [action: 'run' | 'pause' | 'resume' | 'retrial']
  item: [itemId: string, action: 'redo' | 'accept' | 'reject', reasons: string[]]
  remove: []
  again: []
  download: [items: SceneSwapItem[]]
}>()
const { t } = useI18n()
const k = (key: string, params: Record<string, unknown> = {}) => t(`ai.sceneSwap.${key}`, params)

const trialMode = computed(() => ['trial', 'trial_ready'].includes(props.batch.status) && props.batch.items.some((item) => item.status === 'waiting'))
const visible = computed(() => props.batch.items.filter((item) => !trialMode.value || item.status !== 'waiting'))
const count = (status: SceneSwapItem['status']) => props.batch.items.filter((item) => item.status === status).length
const passed = computed(() => props.batch.items.filter((item) => item.status === 'passed'))
const finished = computed(() => props.batch.items.filter((item) => ['passed', 'review', 'failed', 'rejected'].includes(item.status)).length)
const working = computed(() => count('queued') + count('running'))
const percent = computed(() => Math.round((finished.value / Math.max(1, props.batch.items.length)) * 100))

type Filter = 'all' | 'passed' | 'review' | 'working' | 'bad'
const filter = ref<Filter>('all')
const groups: Record<Filter, Array<SceneSwapItem['status']> | null> = { all: null, passed: ['passed'], review: ['review'], working: ['queued', 'running', 'waiting'], bad: ['failed', 'rejected'] }
const shown = computed(() => visible.value.filter((item) => groups[filter.value]?.includes(item.status) ?? true))

const openId = ref('')
const opened = computed(() => props.batch.items.find((item) => item.id === openId.value))
const viewable = computed(() => visible.value.filter((item) => item.outputFileId || item.status === 'failed'))
function step(offset: number) {
  const index = viewable.value.findIndex((item) => item.id === openId.value)
  openId.value = viewable.value[(index + offset + viewable.value.length) % viewable.value.length]?.id ?? ''
}
watch(() => props.batch.id, () => { openId.value = ''; filter.value = 'all' })
/** 只有画面没变（保真 + 原尺寸）时前后能对齐，才用拖动对比 */
const aligned = computed(() => props.batch.mode === 'keep' && props.batch.size === 'original')
const tabCount = (name: Filter) => (groups[name] ? visible.value.filter((item) => groups[name]!.includes(item.status)).length : visible.value.length)
const runCost = computed(() => count('waiting') * props.pointsPerImage)
</script>

<template>
  <section class="batch" data-testid="scene-batch">
    <header class="batch__head">
      <button type="button" class="vg-icon-btn" :aria-label="k('back')" @click="emit('back')"><ArrowLeft :size="18" /></button>
      <div class="batch__title">
        <h1>{{ trialMode && batch.status === 'trial_ready' ? k('trialReady') : batch.title }}</h1>
        <p>{{ trialMode ? k('trialHint') : k('batchHint', { mode: k(`mode.${batch.mode}`) }) }}</p>
      </div>
      <div class="batch__actions">
        <button type="button" class="vg-icon-btn" :aria-label="k('removeBatch')" :title="k('removeBatch')" :disabled="busy" @click="emit('remove')"><Trash2 :size="16" /></button>
        <button type="button" class="vg-btn vg-btn--ghost" :disabled="busy" @click="emit('again')">{{ k('again') }}</button>
        <button v-if="batch.status === 'running'" type="button" class="vg-btn" :disabled="busy" @click="emit('action', 'pause')"><Pause :size="15" /> {{ k('pause') }}</button>
        <button v-if="batch.status === 'paused'" type="button" class="vg-btn vg-btn--primary" :disabled="busy" @click="emit('action', 'resume')"><Play :size="15" /> {{ k('resume') }}</button>
        <button v-if="passed.length && !trialMode" type="button" class="vg-btn" :class="{ 'vg-btn--primary': batch.status !== 'paused' }" :disabled="busy" @click="emit('download', passed)"><Download :size="15" /> {{ k('downloadPassed', { count: passed.length }) }}</button>
      </div>
      <div v-if="!trialMode && percent < 100" class="batch__bar" role="progressbar" :aria-valuenow="percent" aria-valuemin="0" aria-valuemax="100"><span :style="{ width: `${percent}%` }" /></div>
    </header>

    <p v-if="batch.notice" class="batch__notice" role="alert">{{ batch.notice }}</p>

    <div v-if="trialMode" class="trial">
      <article v-for="item in visible" :key="item.id" class="trial__item">
        <div class="trial__stage">
          <CompareImage v-if="item.outputFileId && aligned" :before="item.sourceFileId" :after="item.outputFileId" />
          <div v-else-if="item.outputFileId" class="trial__pair"><SwapImage :file-id="item.sourceFileId" fill :alt="k('original')" /><SwapImage :file-id="item.outputFileId" fill :alt="k('result')" /></div>
          <div v-else class="trial__wait"><span class="trial__ghost"><SwapImage :file-id="item.sourceFileId" fill :alt="k('original')" /></span><span class="trial__status"><LoaderCircle v-if="['queued', 'running'].includes(item.status)" :size="16" class="vg-spin" />{{ item.error || k(`status.${item.status}`) }}</span></div>
        </div>
        <div class="trial__meta">
          <span class="dot" :class="`is-${item.status}`" />
          <span class="trial__name">{{ item.sourceName }}</span>
          <span class="trial__sub">{{ item.sceneName }} · {{ item.trial ? k('freeTrial') : k('paidTrial') }}</span>
          <button v-if="item.outputFileId || item.status === 'failed'" type="button" class="vg-link" @click="openId = item.id">{{ k('inspect') }}</button>
        </div>
      </article>
    </div>

    <template v-else>
      <nav class="batch__tabs" :aria-label="k('done', { done: finished, total: batch.items.length })">
        <button v-for="name in (['all', 'passed', 'review', 'working', 'bad'] as Filter[])" :key="name" type="button" :class="{ 'is-on': filter === name }" :aria-pressed="filter === name" @click="filter = name">{{ k(`filter.${name}`) }}<span>{{ tabCount(name) }}</span></button>
        <small v-if="passed.length && !working">{{ k('savedToLibrary') }}</small>
      </nav>
      <div class="wall">
        <button v-for="item in shown" :key="item.id" type="button" class="shot" :disabled="!item.outputFileId && item.status !== 'failed'" @click="openId = item.id">
          <span class="shot__img" :class="{ 'is-dim': !item.outputFileId }"><SwapImage :file-id="item.outputFileId || item.sourceFileId" :alt="item.sourceName" :width="260" /><LoaderCircle v-if="item.status === 'running'" :size="20" class="vg-spin shot__spin" /></span>
          <span class="shot__name">{{ item.sourceName.replace(/\.[^.]+$/, '') }}</span>
          <span class="shot__meta"><span class="dot" :class="`is-${item.status}`" /><span class="shot__status">{{ k(`status.${item.status}`) }}</span><span class="shot__scene">{{ item.sceneName }}</span></span>
        </button>
      </div>
      <p v-if="!shown.length" class="batch__empty">{{ k('nothingHere') }}</p>
    </template>

    <footer v-if="trialMode && batch.status === 'trial_ready'" class="batch__foot">
      <div><strong>{{ k('runTitle', { count: count('waiting') }) }}</strong><span>{{ k('runCost', { points: runCost }) }}</span></div>
      <button type="button" class="vg-btn" :disabled="busy" @click="emit('action', 'retrial')">{{ k('retrial') }}</button>
      <button type="button" class="vg-btn vg-btn--primary vg-btn--lg" :disabled="busy" @click="emit('action', 'run')">{{ k('run') }}</button>
    </footer>

    <ReviewDialog v-if="opened" :item="opened" :aligned="aligned" :busy="busy" @close="openId = ''" @step="step" @act="(action, reasons) => emit('item', opened!.id, action, reasons)" @download="emit('download', [opened!])" />
  </section>
</template>

<style scoped>
.batch { display: flex; flex: 1; flex-direction: column; min-height: 0; }
.batch__head { position: relative; display: flex; flex-wrap: wrap; gap: 8px 14px; align-items: center; padding: 16px 20px 14px; border-bottom: 1px solid var(--gs-line); }
.batch__title { flex: 1; min-width: 200px; }
.batch__title h1 { font-size: 20px; font-weight: 700; line-height: 1.25; letter-spacing: -.01em; }
.batch__title p { color: var(--theme-text-muted); font-size: 12.5px; }
.batch__actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.batch__bar { position: absolute; inset: auto 0 -1px; height: 2px; }
.batch__bar span { display: block; height: 100%; background: var(--vg-accent); transition: width .4s; }
.batch__notice { margin: 14px 20px 0; padding: 10px 14px; border-radius: 10px; background: var(--theme-danger-soft); color: var(--theme-danger-text); }
.batch__tabs { display: flex; flex-wrap: wrap; gap: 0 26px; align-items: center; margin: 0 20px; border-bottom: 1px solid var(--theme-divider); }
.batch__tabs button { display: flex; gap: 7px; align-items: center; height: 40px; margin-bottom: -1px; padding: 0; border: 0; border-bottom: 2px solid transparent; background: none; color: var(--theme-text-muted); font-size: 13.5px; font-weight: 500; cursor: pointer; }
.batch__tabs button span { font-variant-numeric: tabular-nums; opacity: .7; }
.batch__tabs button:hover { color: var(--theme-text); }
.batch__tabs button.is-on { border-color: var(--vg-accent); color: var(--theme-text); font-weight: 600; }
.batch__tabs small { margin-left: auto; color: var(--theme-text-muted); font-size: 12px; }
.batch__empty { padding: 60px 24px; color: var(--theme-text-muted); text-align: center; }
.wall { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 26px 16px; padding: 18px 20px 28px; }
.shot { display: block; min-width: 0; padding: 0; border: 0; background: none; color: var(--theme-text); text-align: left; cursor: pointer; }
.shot:disabled { cursor: default; }
.shot__img { position: relative; display: block; overflow: hidden; border-radius: 6px; }
.shot__img :deep(img) { transition: transform .35s ease; }
.shot:not(:disabled):hover .shot__img :deep(img) { transform: scale(1.025); }
.shot__img.is-dim :deep(img) { opacity: .28; }
.shot__spin { position: absolute; inset: 0; margin: auto; }
.shot__name { display: block; margin-top: 9px; overflow: hidden; font-size: 13px; font-weight: 500; text-overflow: ellipsis; white-space: nowrap; }
.shot__meta { display: flex; gap: 6px; align-items: center; margin-top: 2px; color: var(--theme-text-muted); font-size: 12px; }
.shot__status { flex-shrink: 0; white-space: nowrap; }
.shot__scene { min-width: 0; margin-left: auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dot { width: 6px; height: 6px; flex-shrink: 0; border-radius: 50%; background: var(--theme-text-muted); }
.dot.is-passed { background: var(--vg-green); }
.dot.is-review { background: var(--vg-amber); }
.dot.is-failed { background: var(--vg-red); }
.trial { display: grid; flex: 1; grid-template-columns: repeat(auto-fit, minmax(min(100%, 340px), 1fr)); gap: 24px; min-height: 0; padding: 18px 20px; }
.trial__item { display: flex; flex-direction: column; min-width: 0; }
.trial__stage { flex: 1; height: 58vh; min-height: 340px; overflow: hidden; border-radius: 8px; background: var(--gs-well); }
.trial__pair { display: grid; grid-template-columns: 1fr 1fr; gap: 2px; height: 100%; }
.trial__wait { position: relative; display: grid; height: 100%; place-items: center; }
.trial__ghost { position: absolute; inset: 0; opacity: .22; }
.trial__status { position: relative; display: flex; gap: 8px; align-items: center; max-width: 80%; padding: 8px 14px; border-radius: 6px; background: var(--gs-bg); font-size: 13px; }
.trial__meta { display: flex; gap: 8px; align-items: center; padding-top: 12px; font-size: 13px; }
.trial__name { overflow: hidden; font-weight: 500; text-overflow: ellipsis; white-space: nowrap; }
.trial__sub { margin-right: auto; color: var(--theme-text-muted); white-space: nowrap; }
.batch__foot { position: sticky; bottom: 0; display: flex; flex-wrap: wrap; gap: 10px; align-items: center; padding: 14px 20px; border-top: 1px solid var(--gs-line); background: var(--gs-bg); }
.batch__foot div { display: flex; flex: 1; flex-direction: column; min-width: 160px; }
.batch__foot strong { font-size: 14px; font-weight: 600; }
.batch__foot span { color: var(--theme-text-muted); font-size: 12.5px; }
button:focus-visible { outline: 2px solid var(--vg-accent); outline-offset: 2px; }
</style>
