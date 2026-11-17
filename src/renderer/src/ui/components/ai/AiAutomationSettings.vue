<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { Activity, AlarmClock, CheckCircle2, AlertTriangle, XCircle, RefreshCcw, Save, Send } from 'lucide-vue-next'

type Health = { checkedAt: number; level: string; items: Array<{ key: string; level: 'ok' | 'warning' | 'error'; title: string; detail: string; route?: string }> }

const { t } = useI18n()
const router = useRouter()
const settings = ref({
  dailyBrief: { enabled: true, hour: 8 },
  weeklyReview: { enabled: true, weekday: 1, hour: 9 },
  aiSummary: true,
  desktopNotifications: true,
  feishu: { enabled: false, webhookUrl: '', secret: '', daily: true, weekly: true },
})
const health = ref<Health | null>(null)
const checking = ref(false)
const saving = ref(false)
const saved = ref(false)
const saveError = ref('')
const feishuOpen = ref(false)
const feishuTesting = ref(false)
const feishuResult = ref<{ ok: boolean; text: string } | null>(null)

function errorText(error: unknown) {
  const text = error instanceof Error ? error.message : String(error)
  return text.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

async function load() {
  settings.value = (await window.api.contentHub.getAutomationSettings()) as typeof settings.value
  feishuOpen.value = settings.value.feishu.enabled
  health.value = (await window.api.contentHub.healthCheck(false)) as Health
}

async function check() {
  checking.value = true
  try {
    health.value = (await window.api.contentHub.healthCheck(true)) as Health
  } finally {
    checking.value = false
  }
}

async function save() {
  saving.value = true
  saveError.value = ''
  try {
    settings.value = (await window.api.contentHub.saveAutomationSettings(JSON.parse(JSON.stringify(settings.value)))) as typeof settings.value
    saved.value = true
    window.setTimeout(() => (saved.value = false), 2000)
  } catch (error) {
    saveError.value = errorText(error)
  } finally {
    saving.value = false
  }
}

async function testFeishu() {
  feishuTesting.value = true
  feishuResult.value = null
  try {
    await window.api.contentHub.testFeishuPush({ webhookUrl: settings.value.feishu.webhookUrl, secret: settings.value.feishu.secret })
    feishuResult.value = { ok: true, text: t('ai.automation.feishuTestOk') }
  } catch (error) {
    feishuResult.value = { ok: false, text: errorText(error) }
  } finally {
    feishuTesting.value = false
  }
}

function toggleFeishu() {
  settings.value.feishu.enabled = !settings.value.feishu.enabled
  if (settings.value.feishu.enabled) feishuOpen.value = true
}

onMounted(load)
</script>

<template>
  <div class="vg-stack" data-testid="settings-ai-automation">
    <section class="vg-card">
      <div class="vg-card__head">
        <span class="vg-card__title"><Activity :size="16" /> {{ t('ai.automation.healthTitle') }} <small>{{ t('ai.automation.healthSubtitle') }}</small></span>
        <div class="vg-card__actions">
          <button type="button" class="vg-btn vg-btn--sm" :disabled="checking" @click="check"><RefreshCcw :size="14" :class="{ 'vg-spin': checking }" /> {{ t('ai.automation.checkNow') }}</button>
        </div>
      </div>
      <div class="vg-list">
        <button v-for="item in health?.items || []" :key="item.key" type="button" class="vg-list__item vg-list__item--button" @click="item.route && router.push(item.route)">
          <CheckCircle2 v-if="item.level === 'ok'" :size="16" class="auto__ok" />
          <AlertTriangle v-else-if="item.level === 'warning'" :size="16" class="auto__warn" />
          <XCircle v-else :size="16" class="auto__err" />
          <span class="vg-list__main">
            <span class="vg-list__title">{{ item.title }}</span>
            <span class="vg-list__sub">{{ item.detail }}</span>
          </span>
        </button>
      </div>
      <p v-if="health" class="vg-field__hint">{{ t('ai.automation.checkedAt', { time: new Date(health.checkedAt).toLocaleString() }) }}</p>
    </section>

    <section class="vg-card">
      <div class="vg-card__head">
        <span class="vg-card__title"><AlarmClock :size="16" /> {{ t('ai.automation.title') }} <small>{{ t('ai.automation.subtitle') }}</small></span>
      </div>
      <div class="auto__rows">
        <div class="auto__row">
          <button type="button" class="vg-switch auto__switch" :class="{ 'is-on': settings.dailyBrief.enabled }" @click="settings.dailyBrief.enabled = !settings.dailyBrief.enabled"><span class="vg-switch__track"></span></button>
          <div class="auto__copy"><strong>{{ t('ai.automation.daily') }}</strong><small>{{ t('ai.automation.dailyDesc') }}</small></div>
          <label class="auto__time">{{ t('ai.automation.at') }} <input v-model.number="settings.dailyBrief.hour" class="vg-input vg-input--sm" type="number" min="0" max="23" /> {{ t('ai.automation.oclock') }}</label>
        </div>
        <div class="auto__row">
          <button type="button" class="vg-switch auto__switch" :class="{ 'is-on': settings.weeklyReview.enabled }" @click="settings.weeklyReview.enabled = !settings.weeklyReview.enabled"><span class="vg-switch__track"></span></button>
          <div class="auto__copy"><strong>{{ t('ai.automation.weekly') }}</strong><small>{{ t('ai.automation.weeklyDesc') }}</small></div>
          <label class="auto__time">
            <select v-model.number="settings.weeklyReview.weekday" class="vg-select vg-select--sm">
              <option v-for="day in [1, 2, 3, 4, 5, 6, 0]" :key="day" :value="day">{{ t(`ai.automation.weekday.${day}`) }}</option>
            </select>
            <input v-model.number="settings.weeklyReview.hour" class="vg-input vg-input--sm" type="number" min="0" max="23" /> {{ t('ai.automation.oclock') }}
          </label>
        </div>
        <div class="auto__row">
          <button type="button" class="vg-switch auto__switch" :class="{ 'is-on': settings.aiSummary }" @click="settings.aiSummary = !settings.aiSummary"><span class="vg-switch__track"></span></button>
          <div class="auto__copy"><strong>{{ t('ai.automation.aiSummary') }}</strong><small>{{ t('ai.automation.aiSummaryDesc') }}</small></div>
        </div>
        <div class="auto__row">
          <button type="button" class="vg-switch auto__switch" :class="{ 'is-on': settings.desktopNotifications }" @click="settings.desktopNotifications = !settings.desktopNotifications"><span class="vg-switch__track"></span></button>
          <div class="auto__copy"><strong>{{ t('ai.automation.notifications') }}</strong><small>{{ t('ai.automation.notificationsDesc') }}</small></div>
        </div>
        <div class="auto__row">
          <button type="button" class="vg-switch auto__switch" data-testid="feishu-toggle" :class="{ 'is-on': settings.feishu.enabled }" @click="toggleFeishu"><span class="vg-switch__track"></span></button>
          <div class="auto__copy"><strong>{{ t('ai.automation.feishu') }}</strong><small>{{ t('ai.automation.feishuDesc') }}</small></div>
          <button v-if="!feishuOpen" type="button" class="vg-btn vg-btn--ghost vg-btn--sm" @click="feishuOpen = true">{{ t('ai.automation.feishuSetup') }}</button>
        </div>
        <div v-if="feishuOpen" class="auto__feishu" data-testid="feishu-config">
          <label class="vg-field">
            <span class="vg-field__label">{{ t('ai.automation.feishuWebhook') }}</span>
            <input v-model.trim="settings.feishu.webhookUrl" class="vg-input" type="url" placeholder="https://open.feishu.cn/open-apis/bot/v2/hook/..." />
            <span class="vg-field__hint">{{ t('ai.automation.feishuWebhookHint') }}</span>
          </label>
          <label class="vg-field">
            <span class="vg-field__label">{{ t('ai.automation.feishuSecret') }}</span>
            <input v-model.trim="settings.feishu.secret" class="vg-input" type="password" autocomplete="off" :placeholder="t('ai.automation.feishuSecretPlaceholder')" />
          </label>
          <div class="auto__checks">
            <label><input v-model="settings.feishu.daily" type="checkbox" /> {{ t('ai.automation.daily') }}</label>
            <label><input v-model="settings.feishu.weekly" type="checkbox" /> {{ t('ai.automation.weekly') }}</label>
            <button type="button" class="vg-btn vg-btn--sm" :disabled="feishuTesting || !settings.feishu.webhookUrl" @click="testFeishu"><Send :size="14" /> {{ t('ai.automation.feishuTest') }}</button>
            <span v-if="feishuResult" class="vg-pill" :class="feishuResult.ok ? 'vg-pill--green' : 'vg-pill--red'">{{ feishuResult.text }}</span>
          </div>
        </div>
      </div>
      <p class="vg-field__hint">{{ t('ai.automation.safetyNote') }}</p>
      <div class="vg-row">
        <button type="button" class="vg-btn vg-btn--primary vg-btn--sm" :disabled="saving" @click="save"><Save :size="14" /> {{ t('common.save') }}</button>
        <span v-if="saved" class="vg-pill vg-pill--green">{{ t('ai.space.saved') }}</span>
        <span v-if="saveError" class="vg-pill vg-pill--red">{{ saveError }}</span>
      </div>
    </section>
  </div>
</template>

<style scoped>
.auto__ok { color: var(--vg-green); flex-shrink: 0; }
.auto__warn { color: var(--vg-amber); flex-shrink: 0; }
.auto__err { color: var(--vg-red); flex-shrink: 0; }
.auto__rows { display: flex; flex-direction: column; gap: 12px; margin-bottom: 12px; }
.auto__row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.auto__switch { border: 0; background: transparent; padding: 0; }
.auto__copy { flex: 1; min-width: 200px; display: flex; flex-direction: column; gap: 2px; }
.auto__copy strong { font-size: 13px; }
.auto__copy small { font-size: 12px; color: var(--theme-text-muted); }
.auto__time { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--theme-text-secondary); }
.auto__time .vg-input { width: 64px; }
.auto__feishu { display: flex; flex-direction: column; gap: 10px; padding: 12px; margin-left: 48px; border-radius: 10px; background: var(--theme-panel-soft); border: 1px solid var(--theme-divider); }
.auto__checks { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; font-size: 12.5px; color: var(--theme-text-secondary); }
.auto__checks label { display: inline-flex; align-items: center; gap: 6px; }
</style>
