<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { Bell, LoaderCircle, Send, X } from 'lucide-vue-next'
import type { MorningReport, ReportSettings } from '../../../../../shared/shopAnalysis'
import ShopFindings from './ShopFindings.vue'
import { fmtChange, fmtMoney } from './shopFormat'

/** 店铺早报: when and where it is sent, send one now, and the last reports. */
const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()
const { t, locale } = useI18n()
const router = useRouter()
const api = window.api.sellerInventory

const settings = ref<ReportSettings>({ enabled: true, hour: 9, desktop: true, feishu: true })
const reports = ref<MorningReport[]>([])
const feishuReady = ref(false)
const desktopAllowed = ref(true)
const busy = ref(false)
const message = ref('')
const errorText = ref('')
const selected = ref(0)

const current = computed(() => reports.value[selected.value])

async function load() {
  const [nextSettings, list, automation] = await Promise.all([
    api.getReportSettings(),
    api.listReports(),
    window.api.contentHub.getAutomationSettings().catch(() => null),
  ])
  settings.value = nextSettings
  reports.value = list
  selected.value = 0
  const auto = automation as { desktopNotifications?: boolean; feishu?: { enabled?: boolean; webhookUrl?: string } } | null
  feishuReady.value = Boolean(auto?.feishu?.enabled && auto.feishu.webhookUrl)
  desktopAllowed.value = auto?.desktopNotifications !== false
}

async function save(patch: Partial<ReportSettings>) {
  settings.value = await api.saveReportSettings({ ...settings.value, ...patch })
}

async function sendNow() {
  busy.value = true
  message.value = ''
  errorText.value = ''
  try {
    const report = await api.generateReport()
    reports.value = [report, ...reports.value]
    selected.value = 0
    const parts = [report.delivered.desktop ? t('shops.report.sentDesktop') : '', report.delivered.feishu ? t('shops.report.sentFeishu') : ''].filter(Boolean)
    message.value = parts.length ? t('shops.report.sent', { where: parts.join(' + ') }) : t('shops.report.savedOnly')
    if (report.delivered.feishuError) errorText.value = t('shops.report.feishuFailed', { error: report.delivered.feishuError })
  } catch (error) {
    errorText.value = error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(error)
  } finally {
    busy.value = false
  }
}

function fmtTime(ms: number) {
  return new Intl.DateTimeFormat(locale.value, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(ms))
}

watch(() => props.open, (open) => { if (open) void load() })
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="vg-scope vg-backdrop" @click.self="!busy && emit('close')">
      <div class="vg-dialog vg-dialog--xl report-dialog" role="dialog" aria-modal="true" data-testid="shop-report-dialog">
        <div class="vg-dialog__head">
          <div class="vg-dialog__title">
            <span class="vg-dialog__title-icon"><Bell :size="19" /></span>
            <div><h2>{{ t('shops.report.title') }}</h2><p>{{ t('shops.report.subtitle') }}</p></div>
          </div>
          <button type="button" class="vg-icon-btn" :disabled="busy" @click="emit('close')"><X :size="16" /></button>
        </div>
        <div class="vg-dialog__body report-dialog__body">
          <section class="report-settings">
            <div class="report-panel">
              <button type="button" class="report-row" data-testid="report-enabled" @click="save({ enabled: !settings.enabled })">
                <span class="report-row__text">{{ t('shops.report.enabled') }}</span>
                <span class="vg-switch" :class="{ 'is-on': settings.enabled }"><span class="vg-switch__track"></span></span>
              </button>
              <label class="report-row">
                <span class="report-row__text">{{ t('shops.report.hour') }}</span>
                <select class="vg-select vg-select--sm report-row__select" :value="settings.hour" @change="save({ hour: Number(($event.target as HTMLSelectElement).value) })">
                  <option v-for="h in 24" :key="h - 1" :value="h - 1">{{ String(h - 1).padStart(2, '0') }}:00</option>
                </select>
              </label>
            </div>
            <div class="report-panel">
              <button type="button" class="report-row" @click="save({ desktop: !settings.desktop })">
                <span class="report-row__text">{{ t('shops.report.desktop') }}<small v-if="!desktopAllowed" class="report-hint--warn">{{ t('shops.report.desktopOff') }}</small></span>
                <span class="vg-switch" :class="{ 'is-on': settings.desktop }"><span class="vg-switch__track"></span></span>
              </button>
              <button type="button" class="report-row" @click="save({ feishu: !settings.feishu })">
                <span class="report-row__text">{{ t('shops.report.feishu') }}<small :class="feishuReady ? '' : 'report-hint--warn'">{{ feishuReady ? t('shops.report.feishuReady') : t('shops.report.feishuMissing') }}</small></span>
                <span class="vg-switch" :class="{ 'is-on': settings.feishu }"><span class="vg-switch__track"></span></span>
              </button>
              <div v-if="!feishuReady" class="report-row report-row--link">
                <button type="button" class="vg-link" @click="emit('close'); router.push({ path: '/settings', query: { section: 'automation' } })">{{ t('shops.report.feishuSetup') }} →</button>
              </div>
            </div>
            <p class="report-hint">{{ t('shops.report.how', { hour: String(settings.hour).padStart(2, '0') }) }}</p>
            <button type="button" class="vg-btn vg-btn--primary report-send" :disabled="busy" data-testid="report-send" @click="sendNow"><LoaderCircle v-if="busy" :size="14" class="vg-spin" /><Send v-else :size="14" />{{ t('shops.report.sendNow') }}</button>
            <div v-if="message" class="vg-notice vg-notice--accent"><span>{{ message }}</span></div>
            <div v-if="errorText" class="vg-notice vg-notice--danger"><span>{{ errorText }}</span></div>
          </section>
          <section class="report-preview">
            <div class="report-preview__head">
              <h3 class="vg-section-title">{{ t('shops.report.history') }}</h3>
              <select v-if="reports.length > 1" v-model.number="selected" class="vg-select vg-select--sm">
                <option v-for="(report, index) in reports" :key="report.id" :value="index">{{ report.date }} · {{ fmtTime(report.createdAt) }}</option>
              </select>
            </div>
            <p v-if="!current" class="vg-muted">{{ t('shops.report.none') }}</p>
            <template v-else>
              <article v-for="shop in current.shops" :key="shop.shopKey" class="report-shop" data-testid="report-shop">
                <header class="report-shop__head">
                  <span class="report-shop__avatar">{{ (shop.name || '?').slice(0, 1).toUpperCase() }}</span>
                  <strong class="vg-ellipsis">{{ shop.name }}</strong>
                  <span v-if="shop.analysis.yesterday" class="report-shop__figure">
                    <small>{{ t('shops.report.yesterday') }}</small>
                    <b>{{ fmtMoney(shop.analysis.yesterday.gmv, locale, shop.region) }}</b>
                    <em v-if="shop.analysis.gmvChangeDay !== undefined" :class="shop.analysis.gmvChangeDay >= 0 ? 'up' : 'down'">{{ t('shops.report.vsLastWeek') }} {{ fmtChange(shop.analysis.gmvChangeDay) }}</em>
                  </span>
                  <span v-else class="report-shop__figure"><small>{{ t('shops.report.noData') }}</small></span>
                </header>
                <ShopFindings :findings="shop.analysis.findings" grouped :per-group="3" />
              </article>
            </template>
          </section>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.report-dialog { max-height: 88vh; display: flex; flex-direction: column; }
.report-dialog__body { display: grid; grid-template-columns: 300px minmax(0, 1fr); gap: 20px; overflow: auto; align-items: start; }
.report-settings { display: flex; flex-direction: column; gap: 12px; position: sticky; top: 0; }
.report-panel { display: flex; flex-direction: column; border: 1px solid var(--theme-border); border-radius: 10px; overflow: hidden; }
.report-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 11px 14px; border: 0; border-top: 1px solid var(--theme-divider); background: transparent; color: inherit; font: inherit; font-size: 13px; text-align: left; }
.report-row:first-child { border-top: 0; }
button.report-row { cursor: pointer; transition: background .15s; }
button.report-row:hover { background: var(--theme-panel-soft); }
.report-row__text { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.report-row__text small { font-size: 11.5px; line-height: 1.5; color: var(--theme-text-muted); }
.report-row__select { width: 96px; }
.report-row--link { padding-top: 0; border-top: 0; }
.report-row .vg-switch { pointer-events: none; }
.report-hint { font-size: 12px; line-height: 1.6; margin: 0; color: var(--theme-text-muted); }
.report-hint--warn { color: var(--vg-amber) !important; }
.report-send { width: 100%; justify-content: center; }
.report-preview { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.report-preview__head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.report-shop { display: flex; flex-direction: column; gap: 14px; padding: 14px 16px; border: 1px solid var(--theme-border); border-radius: 10px; }
.report-shop__head { display: flex; align-items: center; gap: 10px; min-width: 0; padding-bottom: 12px; border-bottom: 1px solid var(--theme-divider); }
.report-shop__head > strong { flex: 1; min-width: 0; font-size: 14px; }
.report-shop__avatar { width: 28px; height: 28px; border-radius: 7px; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 12px; font-weight: 700; background: var(--theme-panel-soft); border: 1px solid var(--theme-border); color: var(--theme-text-secondary); }
.report-shop__figure { display: flex; align-items: baseline; gap: 8px; flex-shrink: 0; }
.report-shop__figure small { font-size: 11.5px; color: var(--theme-text-muted); }
.report-shop__figure b { font-size: 15px; font-weight: 600; font-variant-numeric: tabular-nums; }
.report-shop__figure em { font-style: normal; font-size: 11.5px; font-weight: 600; font-variant-numeric: tabular-nums; }
.report-shop__figure em.up { color: var(--vg-green, #16a34a); }
.report-shop__figure em.down { color: var(--vg-red); }
@media (max-width: 900px) { .report-dialog__body { grid-template-columns: 1fr; } .report-settings { position: static; } }
</style>
