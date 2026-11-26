<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { AlertCircle, ChevronLeft, Eye, Pause, Play, Plus, RefreshCw, Send, Trash2, Zap } from 'lucide-vue-next'
import LaunchItemCard from './LaunchItemCard.vue'
import { jobCounts, type LaunchJob, type LaunchJobStatus, type LaunchStage } from '../../../../../shared/productLaunch'

const props = defineProps<{ jobId: string }>()
const emit = defineEmits<{ back: []; again: [] }>()
const { t, locale } = useI18n()
const k = (key: string, params: Record<string, unknown> = {}) => t(`ai.launch.${key}`, params)
const router = useRouter()

const job = ref<(LaunchJob & { status: LaunchJobStatus }) | null>(null)
const loaded = ref(false)
const busy = ref(false)
const error = ref('')
const counts = computed(() => (job.value ? jobCounts(job.value) : { running: 0, review: 0, done: 0, failed: 0 }))
const STATUS_PILL: Record<LaunchJobStatus, string> = { running: 'vg-pill--accent', paused: 'vg-pill--amber', review: 'vg-pill--amber', done: 'vg-pill--green', failed: 'vg-pill--red' }
const messageOf = (cause: unknown) => String((cause as Error)?.message || cause).replace(/^Error invoking remote method '[^']+': (\w*Error: )?/, '')

async function load() {
  try {
    job.value = await window.api.productLaunch.get(props.jobId)
  } catch (cause) {
    error.value = messageOf(cause)
  } finally {
    loaded.value = true
  }
}

async function act(work: () => Promise<(LaunchJob & { status: LaunchJobStatus }) | null | unknown>) {
  busy.value = true
  error.value = ''
  try {
    const next = await work()
    if (next && typeof next === 'object' && 'items' in next) job.value = next as LaunchJob & { status: LaunchJobStatus }
  } catch (cause) {
    error.value = messageOf(cause)
  } finally {
    busy.value = false
  }
}

const retry = (itemId: string, stage: LaunchStage) => act(() => window.api.productLaunch.retry({ jobId: props.jobId, itemId, stage }))
const skip = (itemId: string, stage: LaunchStage) => act(() => window.api.productLaunch.skip({ jobId: props.jobId, itemId, stage }))
const togglePause = () => act(() => window.api.productLaunch.setPaused({ jobId: props.jobId, paused: !job.value?.paused }))
async function remove() {
  if (!window.confirm(k('removeConfirm'))) return
  await act(() => window.api.productLaunch.remove(props.jobId))
  emit('back')
}

let timer: ReturnType<typeof setInterval> | undefined
onMounted(async () => {
  await load()
  timer = setInterval(() => {
    if (!busy.value) void load()
  }, 4000)
})
onUnmounted(() => clearInterval(timer))
</script>

<template>
  <div class="lp">
    <header class="vg-page-head">
      <button type="button" class="vg-icon-btn" :aria-label="k('back')" @click="emit('back')"><ChevronLeft :size="18" /></button>
      <span class="vg-page-head__icon"><Zap :size="20" /></span>
      <div class="vg-page-head__text">
        <h1>{{ job?.title || k('progressTitle') }}<span v-if="job" class="vg-pill vg-pill--dot" :class="STATUS_PILL[job.status]">{{ k(`jobStatus.${job.status}`) }}</span></h1>
        <p v-if="job">{{ k('progressSub', { count: job.items.length, markets: job.markets.map((code) => k(`market.${code}`)).join('、') || '—', time: new Date(job.createdAt).toLocaleString(String(locale), { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }) }}</p>
      </div>
      <div class="vg-page-head__actions">
        <button v-if="job && (job.status === 'running' || job.status === 'paused')" type="button" class="vg-btn" :disabled="busy" @click="togglePause"><Play v-if="job.paused" :size="14" /><Pause v-else :size="14" />{{ job.paused ? k('resume') : k('pause') }}</button>
        <button type="button" class="vg-btn" :disabled="busy" :aria-label="k('refresh')" @click="load"><RefreshCw :size="14" /></button>
        <button v-if="job" type="button" class="vg-btn vg-btn--ghost" :disabled="busy" @click="remove"><Trash2 :size="14" />{{ k('remove') }}</button>
        <button type="button" class="vg-btn vg-btn--primary" @click="emit('again')"><Plus :size="14" />{{ k('again') }}</button>
      </div>
    </header>

    <div v-if="error" class="vg-notice vg-notice--danger" role="alert">{{ error }}</div>

    <p v-if="loaded && !job" class="lp__none">{{ k('jobMissing') }}</p>

    <template v-if="job">
      <div class="vg-stats">
        <div class="vg-stat"><span class="vg-stat__icon"><RefreshCw :size="17" /></span><span class="vg-stat__body"><span class="vg-stat__label">{{ k('countRunning') }}</span><span class="vg-stat__value">{{ counts.running }}</span></span></div>
        <div class="vg-stat"><span class="vg-stat__icon vg-stat__icon--amber"><Eye :size="17" /></span><span class="vg-stat__body"><span class="vg-stat__label">{{ k('countReview') }}</span><span class="vg-stat__value">{{ counts.review }}</span></span></div>
        <div class="vg-stat"><span class="vg-stat__icon vg-stat__icon--blue"><Send :size="17" /></span><span class="vg-stat__body"><span class="vg-stat__label">{{ k('countDone') }}</span><span class="vg-stat__value">{{ counts.done }}</span></span></div>
        <div class="vg-stat"><span class="vg-stat__icon vg-stat__icon--red"><AlertCircle :size="17" /></span><span class="vg-stat__body"><span class="vg-stat__label">{{ k('countFailed') }}</span><span class="vg-stat__value">{{ counts.failed }}</span></span></div>
      </div>

      <p v-if="job.paused" class="vg-notice vg-notice--warning">{{ k('pausedHint') }}</p>

      <LaunchItemCard v-for="item in job.items" :key="item.id" :item="item" :markets="job.markets" :busy="busy" @retry="retry(item.id, $event)" @skip="skip(item.id, $event)" @inbox="router.push('/inbox')" />
    </template>
  </div>
</template>

<style scoped>
.lp { display: flex; flex-direction: column; gap: 14px; }
.lp h1 { display: flex; align-items: center; gap: 9px; }
.lp__none { margin: 40px 0; text-align: center; color: var(--theme-text-muted); }
</style>
