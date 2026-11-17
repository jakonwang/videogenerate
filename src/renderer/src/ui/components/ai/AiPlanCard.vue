<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import {
  AlertTriangle,
  Check,
  CircleDashed,
  Clock3,
  Coins,
  Cpu,
  ExternalLink,
  Loader2,
  Pause,
  Play,
  ShieldAlert,
  X,
  XCircle,
} from 'lucide-vue-next'
import { useAiProducerStore, type AiRunDetail } from '@/stores/aiProducer'

const props = defineProps<{ detail: AiRunDetail; compact?: boolean }>()
const { t, te } = useI18n()
const router = useRouter()
const ai = useAiProducerStore()
const busy = ref(false)

const run = computed(() => props.detail.run)
const steps = computed(() => props.detail.steps)
const revision = computed(() => run.value.revisions.find((item) => item.version === run.value.activeRevision))
const estimate = computed(() => props.detail.estimate)
const doneCount = computed(() => steps.value.filter((step) => step.status === 'completed' || step.status === 'skipped').length)
const progress = computed(() => (steps.value.length ? Math.round((doneCount.value / steps.value.length) * 100) : 0))
const awaitingStep = computed(() => steps.value.find((step) => step.status === 'blocked' && step.error === 'awaiting_confirmation'))
const visibleArtifacts = computed(() => props.detail.artifacts.filter((artifact) => artifact.kind !== 'report' || artifact.metadata?.level).slice(0, 8))

const statusTone: Record<string, string> = {
  planning: 'blue',
  waiting_approval: 'amber',
  running: 'blue',
  paused: 'amber',
  reviewing: 'blue',
  completed: 'green',
  failed: 'red',
  cancelled: 'gray',
}

function intentLabel(intent: string, fallback: string) {
  const key = `ai.intent.${intent.replace('Intent.', '')}`
  return te(key) ? t(key) : fallback
}

function stepError(error?: string) {
  if (!error || error === 'awaiting_confirmation') return ''
  if (error === 'Dependency failed') return t('ai.plan.dependencyFailed')
  return error
}

async function act(fn: () => Promise<unknown>) {
  if (busy.value) return
  busy.value = true
  try {
    await fn()
  } finally {
    busy.value = false
  }
}

function openArtifact(artifactId: string, uri: string) {
  if (uri.startsWith('agent-product://')) {
    void router.push(`/products/${uri.replace('agent-product://', '')}`)
    return
  }
  if (uri.startsWith('agent-clone-project://')) {
    void router.push(`/clone/${uri.replace('agent-clone-project://', '')}`)
    return
  }
  if (uri.startsWith('publish://')) {
    void router.push('/publish')
    return
  }
  if (uri.startsWith('creative://')) {
    void router.push('/plugins/tiktok-creative-studio')
    return
  }
  if (uri.startsWith('livephoto://')) {
    void router.push('/plugins/live-photo-generator')
    return
  }
  if (uri.startsWith('content-hub://inbox')) {
    void router.push('/inbox')
    return
  }
  void ai.openArtifact(artifactId)
}
</script>

<template>
  <article class="ai-plan" :class="[`is-${run.status}`, { 'is-compact': compact }]" data-testid="ai-plan-card">
    <header class="ai-plan__head">
      <span class="ai-plan__id">#{{ run.shortId }}</span>
      <span class="vg-pill vg-pill--dot" :class="`vg-pill--${statusTone[run.status] || 'gray'}`">{{ t(`ai.status.${run.status}`) }}</span>
      <span v-if="run.status === 'running' || run.status === 'reviewing'" class="ai-plan__progress">{{ doneCount }}/{{ steps.length }}</span>
    </header>
    <p v-if="revision?.summary" class="ai-plan__summary">{{ revision.summary }}</p>

    <div v-if="run.status === 'running' || run.status === 'paused'" class="vg-progress ai-plan__bar">
      <span class="vg-progress__bar"><span class="vg-progress__fill" :style="{ width: `${progress}%` }"></span></span>
    </div>

    <ol class="ai-plan__steps">
      <li v-for="(step, index) in steps" :key="step.id" class="ai-plan__step" :class="`is-${step.status}`">
        <span class="ai-plan__step-icon">
          <Check v-if="step.status === 'completed'" :size="13" />
          <Loader2 v-else-if="step.status === 'running' || step.status === 'reviewing'" :size="13" class="vg-spin" />
          <XCircle v-else-if="step.status === 'failed' || step.status === 'cancelled'" :size="13" />
          <ShieldAlert v-else-if="step.error === 'awaiting_confirmation'" :size="13" />
          <AlertTriangle v-else-if="step.status === 'blocked'" :size="13" />
          <CircleDashed v-else :size="13" />
        </span>
        <span class="ai-plan__step-body">
          <span class="ai-plan__step-title">{{ index + 1 }}. {{ intentLabel(step.intentType, step.title) }}</span>
          <span v-if="stepError(step.error)" class="ai-plan__step-error">{{ stepError(step.error) }}</span>
        </span>
      </li>
    </ol>

    <div v-if="estimate && (run.status === 'waiting_approval' || !compact)" class="ai-plan__estimate">
      <span :title="t('ai.plan.modelCallsHint')"><Cpu :size="13" /> {{ estimate.modelCalls ? t('ai.plan.modelCalls', { count: estimate.modelCalls }) : t('ai.plan.noModelCalls') }}</span>
      <span v-if="estimate.accountCredits" :title="t('ai.plan.accountCreditsHint')"><Coins :size="13" /> {{ t('ai.plan.accountCredits', { count: estimate.accountCredits }) }}</span>
      <span><Clock3 :size="13" /> {{ t('ai.plan.minutes', { count: estimate.minutes }) }}</span>
    </div>
    <ul v-if="estimate?.dangerousSteps?.length && run.status === 'waiting_approval'" class="ai-plan__danger">
      <li v-for="item in estimate.dangerousSteps" :key="item"><ShieldAlert :size="13" /> {{ item }}</li>
    </ul>

    <div v-if="awaitingStep" class="vg-notice vg-notice--warning ai-plan__confirm">
      <span>{{ t('ai.plan.awaitingConfirmation', { title: intentLabel(awaitingStep.intentType, awaitingStep.title) }) }}</span>
      <button type="button" class="vg-btn vg-btn--sm vg-btn--danger" :disabled="busy" @click="act(() => ai.confirmStep(run.id, awaitingStep!.id))">
        {{ t('ai.plan.confirmStep') }}
      </button>
    </div>

    <p v-if="run.error && run.status === 'failed'" class="ai-plan__error">{{ run.error }}</p>

    <div v-if="visibleArtifacts.length" class="ai-plan__artifacts">
      <button v-for="artifact in visibleArtifacts" :key="artifact.id" type="button" class="vg-chip ai-plan__artifact" :title="artifact.name" @click="openArtifact(artifact.id, artifact.uri)">
        <ExternalLink :size="12" /> <span class="vg-ellipsis">{{ artifact.name }}</span>
      </button>
    </div>

    <footer class="ai-plan__actions">
      <template v-if="run.status === 'waiting_approval'">
        <button type="button" class="vg-btn vg-btn--primary vg-btn--sm" data-testid="ai-plan-approve" :disabled="busy" @click="act(() => ai.approve(run.id))">
          <Play :size="14" /> {{ t('ai.plan.approve') }}
        </button>
        <button type="button" class="vg-btn vg-btn--sm" :disabled="busy" @click="act(() => ai.reject(run.id))">
          <X :size="14" /> {{ t('ai.plan.reject') }}
        </button>
      </template>
      <template v-else-if="run.status === 'running' || run.status === 'reviewing'">
        <button type="button" class="vg-btn vg-btn--sm" :disabled="busy" @click="act(() => ai.control(run.id, 'pause'))"><Pause :size="14" /> {{ t('ai.plan.pause') }}</button>
        <button type="button" class="vg-btn vg-btn--ghost vg-btn--sm" :disabled="busy" @click="act(() => ai.control(run.id, 'cancel'))">{{ t('ai.plan.cancel') }}</button>
      </template>
      <template v-else-if="run.status === 'paused' && !awaitingStep">
        <button type="button" class="vg-btn vg-btn--primary vg-btn--sm" :disabled="busy" @click="act(() => ai.control(run.id, 'resume'))"><Play :size="14" /> {{ t('ai.plan.resume') }}</button>
        <button type="button" class="vg-btn vg-btn--ghost vg-btn--sm" :disabled="busy" @click="act(() => ai.control(run.id, 'cancel'))">{{ t('ai.plan.cancel') }}</button>
      </template>
      <template v-else-if="run.status === 'completed'">
        <button type="button" class="vg-btn vg-btn--soft vg-btn--sm" @click="router.push('/inbox')">{{ t('ai.plan.goReview') }}</button>
      </template>
    </footer>
  </article>
</template>

<style scoped>
.ai-plan {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--theme-border);
  border-radius: var(--vg-radius);
  background: var(--theme-panel);
}
.ai-plan.is-waiting_approval { border-color: var(--vg-accent-line); box-shadow: 0 0 0 3px var(--vg-accent-soft); }
.ai-plan__head { display: flex; align-items: center; gap: 8px; }
.ai-plan__id { font-size: 11px; font-weight: 700; color: var(--theme-text-muted); letter-spacing: .04em; }
.ai-plan__progress { margin-left: auto; font-size: 12px; color: var(--theme-text-secondary); font-variant-numeric: tabular-nums; }
.ai-plan__summary { margin: 0; font-size: 13px; line-height: 1.5; color: var(--theme-text); }
.ai-plan__bar { width: 100%; }
.ai-plan__bar .vg-progress__bar { flex: 1; }
.ai-plan__steps { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.ai-plan__step { display: flex; gap: 8px; align-items: flex-start; font-size: 12.5px; color: var(--theme-text-secondary); }
.ai-plan__step.is-completed { color: var(--theme-text); }
.ai-plan__step.is-running, .ai-plan__step.is-reviewing { color: var(--theme-text); font-weight: 600; }
.ai-plan__step-icon { display: inline-flex; width: 18px; height: 18px; align-items: center; justify-content: center; flex-shrink: 0; border-radius: 50%; background: var(--theme-panel-soft); color: var(--theme-text-muted); }
.ai-plan__step.is-completed .ai-plan__step-icon { background: var(--vg-accent-soft); color: var(--vg-accent); }
.ai-plan__step.is-running .ai-plan__step-icon { color: var(--vg-blue); }
.ai-plan__step.is-failed .ai-plan__step-icon, .ai-plan__step.is-blocked .ai-plan__step-icon { color: var(--vg-red); }
.ai-plan__step-body { display: flex; flex-direction: column; gap: 2px; min-width: 0; padding-top: 1px; }
.ai-plan__step-error { color: var(--vg-red); font-size: 11.5px; overflow-wrap: anywhere; }
.ai-plan__estimate { display: flex; flex-wrap: wrap; gap: 6px 12px; padding: 8px 10px; border-radius: var(--vg-radius-sm); background: var(--theme-panel-soft); font-size: 12px; color: var(--theme-text-secondary); }
.ai-plan__estimate span { display: inline-flex; align-items: center; gap: 5px; }
.ai-plan__danger { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 3px; font-size: 12px; color: var(--vg-amber); }
.ai-plan__danger li { display: flex; gap: 6px; align-items: flex-start; }
.ai-plan__confirm { display: flex; align-items: center; gap: 8px; justify-content: space-between; }
.ai-plan__error { margin: 0; font-size: 12px; color: var(--vg-red); overflow-wrap: anywhere; }
.ai-plan__artifacts { display: flex; flex-wrap: wrap; gap: 6px; }
.ai-plan__artifact { max-width: 100%; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; }
.ai-plan__actions { display: flex; gap: 8px; flex-wrap: wrap; }
.ai-plan__actions:empty { display: none; }
.ai-plan.is-compact { padding: 10px; }
</style>
