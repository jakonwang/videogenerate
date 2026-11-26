<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { CalendarClock, Check, CheckCheck, Loader2, Play, RefreshCcw, Settings2, SkipForward } from 'lucide-vue-next'
import { useAiProducerStore } from '@/stores/aiProducer'
import type { AutopilotDay, AutopilotProposal, AutopilotSettings } from '../../../../../shared/autopilot'

const { t } = useI18n()
const router = useRouter()
const ai = useAiProducerStore()

const settings = ref<AutopilotSettings | null>(null)
const day = ref<AutopilotDay | null>(null)
const used = ref(0)
const busy = ref('')
const error = ref('')
const showSettings = ref(false)
let timer: number | undefined

const clean = (cause: unknown) => String((cause as Error)?.message || cause).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
const order: Record<string, number> = { pending: 0, failed: 1, running: 2, done: 3, acknowledged: 4, skipped: 5 }
const proposals = computed(() => [...(day.value?.proposals || [])].sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9)))
const pendingPlans = computed(() => proposals.value.filter((item) => item.status === 'pending' && item.action.type === 'plan'))
const pendingCount = computed(() => proposals.value.filter((item) => item.status === 'pending').length)

async function load() {
  try {
    const result = await window.api.contentHub.autopilotToday()
    settings.value = result.settings
    day.value = result.day
    used.value = result.used
  } catch (cause) {
    error.value = clean(cause)
  }
  window.clearTimeout(timer)
  if ((day.value?.proposals || []).some((item) => item.status === 'running')) timer = window.setTimeout(() => void load(), 8000)
}

async function run(key: string, action: () => Promise<unknown>) {
  busy.value = key
  error.value = ''
  try {
    await action()
  } catch (cause) {
    error.value = clean(cause)
  } finally {
    busy.value = ''
    await load()
  }
}

const generate = () => run('generate', () => window.api.contentHub.autopilotGenerate())
const approve = (item: AutopilotProposal) => run(item.id, () => window.api.contentHub.autopilotApprove(item.id))
const skip = (item: AutopilotProposal) => run(item.id, () => window.api.contentHub.autopilotSkip(item.id))
function openRoute(item: AutopilotProposal) {
  if (item.action.type === 'route') void router.push(item.action.route)
  void run(item.id, () => window.api.contentHub.autopilotApprove(item.id))
}
async function approveAll() {
  await run('all', async () => {
    for (const item of pendingPlans.value) await window.api.contentHub.autopilotApprove(item.id)
  })
}
async function saveSettings(patch: Partial<AutopilotSettings>) {
  await run('settings', async () => { settings.value = await window.api.contentHub.autopilotSaveSettings(patch) })
}
function openRun(item: AutopilotProposal) {
  if (!item.conversationId) return
  ai.panelOpen = true
  void ai.selectConversation(item.conversationId)
}

onMounted(() => void load())
onBeforeUnmount(() => window.clearTimeout(timer))
</script>

<template>
  <section class="vg-card apd" data-testid="autopilot-daily">
    <div class="apd__head">
      <span class="apd__icon"><CalendarClock :size="20" /></span>
      <div class="apd__copy">
        <strong>{{ t('ai.daily.title') }}<span v-if="pendingCount" class="vg-pill vg-pill--amber apd__badge" data-testid="autopilot-pending">{{ t('ai.daily.pending', { count: pendingCount }) }}</span></strong>
        <small v-if="settings?.enabled">{{ t(settings.mode === 'auto' ? 'ai.daily.onAuto' : 'ai.daily.onSuggest', { hour: settings.hour, max: settings.maxTasksPerDay }) }}</small>
        <small v-else>{{ t('ai.daily.off') }}</small>
      </div>
      <label class="vg-switch" :class="{ 'is-on': settings?.enabled }">
        <input type="checkbox" class="apd__sr" :checked="settings?.enabled" data-testid="autopilot-enabled" @change="saveSettings({ enabled: ($event.target as HTMLInputElement).checked })" />
        <span class="vg-switch__track" />
      </label>
      <button type="button" class="vg-icon-btn vg-icon-btn--sm" :title="t('ai.daily.settings')" data-testid="autopilot-settings-toggle" @click="showSettings = !showSettings"><Settings2 :size="15" /></button>
    </div>

    <div v-if="showSettings && settings" class="apd__settings" data-testid="autopilot-settings">
      <label>{{ t('ai.daily.hour') }}
        <select class="vg-select vg-select--sm" :value="settings.hour" @change="saveSettings({ hour: Number(($event.target as HTMLSelectElement).value) })">
          <option v-for="h in 24" :key="h - 1" :value="h - 1">{{ h - 1 }}:00</option>
        </select>
      </label>
      <label>{{ t('ai.daily.max') }}
        <input class="vg-input vg-input--sm apd__num" type="number" min="1" max="20" :value="settings.maxTasksPerDay" data-testid="autopilot-max" @change="saveSettings({ maxTasksPerDay: Number(($event.target as HTMLInputElement).value) })" />
      </label>
      <div class="apd__seg" role="radiogroup">
        <button type="button" :class="{ 'is-on': settings.mode === 'suggest' }" @click="saveSettings({ mode: 'suggest' })">{{ t('ai.daily.modeSuggest') }}</button>
        <button type="button" :class="{ 'is-on': settings.mode === 'auto' }" data-testid="autopilot-mode-auto" @click="saveSettings({ mode: 'auto' })">{{ t('ai.daily.modeAuto') }}</button>
      </div>
      <label class="apd__check"><input type="checkbox" :checked="settings.includePublish" @change="saveSettings({ includePublish: ($event.target as HTMLInputElement).checked })" />{{ t('ai.daily.includePublish') }}</label>
      <small class="vg-muted">{{ t('ai.daily.guard') }}</small>
    </div>

    <div v-if="!day" class="apd__empty">
      <span class="vg-muted">{{ t('ai.daily.notYet') }}</span>
      <button type="button" class="vg-btn vg-btn--sm vg-btn--primary" :disabled="busy === 'generate'" data-testid="autopilot-generate" @click="generate">
        <Loader2 v-if="busy === 'generate'" :size="14" class="apd__spin" /><Play v-else :size="14" /> {{ t('ai.daily.generate') }}
      </button>
    </div>
    <template v-else>
      <p v-if="!proposals.length" class="vg-muted apd__none">{{ t('ai.daily.nothing') }}</p>
      <ul v-else class="apd__list">
        <li v-for="item in proposals" :key="item.id" class="apd__item" :class="`is-${item.status}`" :data-testid="`autopilot-item-${item.kind}`">
          <span class="vg-pill apd__kind" :class="`apd__kind--${item.kind}`">{{ t(`ai.daily.kind.${item.kind}`) }}</span>
          <div class="apd__text">
            <strong>{{ item.title }}</strong>
            <small>{{ item.reason }}</small>
            <small v-if="item.status === 'failed'" class="apd__error">{{ item.error }}</small>
          </div>
          <div class="apd__actions">
            <template v-if="item.status === 'pending' || item.status === 'failed'">
              <template v-if="item.action.type === 'plan'">
                <button type="button" class="vg-btn vg-btn--xs vg-btn--primary" :disabled="Boolean(busy)" :data-testid="`autopilot-approve-${item.kind}`" @click="approve(item)">
                  <Loader2 v-if="busy === item.id" :size="12" class="apd__spin" /><Check v-else :size="12" /> {{ item.status === 'failed' ? t('ai.daily.retry') : t('ai.daily.approve') }}
                </button>
                <button type="button" class="vg-btn vg-btn--xs vg-btn--ghost" :disabled="Boolean(busy)" @click="skip(item)"><SkipForward :size="12" /> {{ t('ai.daily.skip') }}</button>
              </template>
              <template v-else>
                <button type="button" class="vg-btn vg-btn--xs" @click="openRoute(item)">{{ t('ai.daily.goHandle') }}</button>
                <button type="button" class="vg-btn vg-btn--xs vg-btn--ghost" :disabled="Boolean(busy)" @click="skip(item)">{{ t('ai.daily.dismiss') }}</button>
              </template>
            </template>
            <button v-else-if="item.status === 'running'" type="button" class="vg-link apd__state" @click="openRun(item)"><Loader2 :size="12" class="apd__spin" /> {{ t(item.auto ? 'ai.daily.runningAuto' : 'ai.daily.running') }}</button>
            <button v-else-if="item.status === 'done'" type="button" class="vg-link apd__state apd__state--done" @click="router.push('/inbox')"><Check :size="12" /> {{ t('ai.daily.done') }}</button>
            <span v-else class="vg-muted apd__state">{{ t(`ai.daily.status.${item.status}`) }}</span>
          </div>
        </li>
      </ul>
      <div class="apd__foot">
        <span class="vg-muted">{{ t('ai.daily.used', { used, max: settings?.maxTasksPerDay || 0 }) }}</span>
        <span class="vg-toolbar__spacer" />
        <button type="button" class="vg-btn vg-btn--xs vg-btn--ghost" :disabled="Boolean(busy)" data-testid="autopilot-regenerate" @click="generate"><RefreshCcw :size="12" /> {{ t('ai.daily.regenerate') }}</button>
        <button v-if="pendingPlans.length > 1" type="button" class="vg-btn vg-btn--xs vg-btn--soft" :disabled="Boolean(busy)" data-testid="autopilot-approve-all" @click="approveAll"><CheckCheck :size="12" /> {{ t('ai.daily.approveAll', { count: pendingPlans.length }) }}</button>
      </div>
    </template>
    <p v-if="error" class="apd__error apd__error--block" data-testid="autopilot-error">{{ error }}</p>
  </section>
</template>

<style scoped>
.apd__head { display: flex; align-items: center; gap: 12px; }
.apd__icon { width: 40px; height: 40px; display: inline-flex; align-items: center; justify-content: center; border-radius: 10px; background: var(--vg-accent-soft); color: var(--vg-accent); flex-shrink: 0; }
.apd__copy { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.apd__copy strong { font-size: 14px; color: var(--theme-text); display: flex; align-items: center; gap: 8px; }
.apd__copy small { font-size: 12px; color: var(--theme-text-muted); }
/* Kept on top of its own switch: without a positioned parent the hidden box sat somewhere else on the
 * page, and focusing it on click scrolled the whole window there. */
.apd .vg-switch { position: relative; }
.apd__sr { position: absolute; inset: 0; width: 100%; height: 100%; margin: 0; opacity: 0; cursor: pointer; }
.apd__settings { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 16px; margin-top: 12px; padding: 10px 12px; border-radius: 8px; background: var(--theme-panel-soft); font-size: 12.5px; color: var(--theme-text); }
.apd__settings label { display: inline-flex; align-items: center; gap: 6px; }
.apd__settings small { flex-basis: 100%; font-size: 11.5px; }
.apd__num { width: 60px; }
.apd__seg { display: inline-flex; padding: 2px; border: 1px solid var(--theme-border); border-radius: var(--vg-radius-sm); }
.apd__seg button { padding: 4px 10px; border: 0; border-radius: calc(var(--vg-radius-sm) - 2px); background: transparent; color: var(--theme-text-muted); font-size: 12px; cursor: pointer; }
.apd__seg button.is-on { background: var(--vg-accent-soft); color: var(--theme-text); font-weight: 600; }
.apd__check { gap: 6px; }
.apd__empty { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 14px; font-size: 12.5px; }
.apd__none { margin: 14px 0 0; font-size: 12.5px; }
.apd__list { list-style: none; margin: 14px 0 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.apd__item { display: grid; grid-template-columns: 76px minmax(0, 1fr) auto; align-items: center; gap: 12px; padding: 10px 12px; border: 1px solid var(--theme-border); border-radius: var(--vg-radius-sm); background: var(--theme-panel-soft); }
.apd__item.is-skipped, .apd__item.is-acknowledged { opacity: 0.55; }
.apd__kind { justify-self: start; }
.apd__kind--stop_loss { background: var(--vg-red-soft, rgba(220, 70, 70, 0.15)); color: var(--vg-red); }
.apd__kind--replenish { color: var(--vg-amber, #d99a1e); }
.apd__kind--scale_winner { color: var(--vg-green); }
.apd__text { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.apd__text strong { font-size: 13px; color: var(--theme-text); }
.apd__text small { font-size: 12px; color: var(--theme-text-muted); line-height: 1.5; }
.apd__actions { display: flex; align-items: center; gap: 6px; white-space: nowrap; }
.apd__state { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; }
.apd__state--done { color: var(--vg-green); }
.apd__foot { display: flex; align-items: center; gap: 8px; margin-top: 10px; font-size: 12px; }
.apd__error { color: var(--vg-red); }
.apd__error--block { margin: 8px 0 0; font-size: 12px; }
.apd__spin { animation: apd-spin 1s linear infinite; }
@keyframes apd-spin { to { transform: rotate(360deg); } }
.apd__badge { font-size: 11px; }
@media (max-width: 760px) { .apd__item { grid-template-columns: 1fr; } }
</style>
