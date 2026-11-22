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
            <label class="report-row"><input type="checkbox" :checked="settings.enabled" data-testid="report-enabled" @change="save({ enabled: ($event.target as HTMLInputElement).checked })" /> {{ t('shops.report.enabled') }}</label>
            <label class="report-row">
              {{ t('shops.report.hour') }}
              <select class="vg-select vg-select--sm" :value="settings.hour" @change="save({ hour: Number(($event.target as HTMLSelectElement).value) })">
                <option v-for="h in 24" :key="h - 1" :value="h - 1">{{ String(h - 1).padStart(2, '0') }}:00</option>
              </select>
            </label>
            <label class="report-row"><input type="checkbox" :checked="settings.desktop" @change="save({ desktop: ($event.target as HTMLInputElement).checked })" /> {{ t('shops.report.desktop') }}</label>
            <small v-if="!desktopAllowed" class="vg-muted report-hint">{{ t('shops.report.desktopOff') }}</small>
            <label class="report-row"><input type="checkbox" :checked="settings.feishu" @change="save({ feishu: ($event.target as HTMLInputElement).checked })" /> {{ t('shops.report.feishu') }}</label>
            <small class="report-hint" :class="feishuReady ? 'vg-muted' : 'report-hint--warn'">
              {{ feishuReady ? t('shops.report.feishuReady') : t('shops.report.feishuMissing') }}
              <button type="button" class="vg-link" @click="emit('close'); router.push({ path: '/settings', query: { section: 'automation' } })">{{ t('shops.report.feishuSetup') }}</button>
            </small>
            <p class="vg-muted report-hint">{{ t('shops.report.how', { hour: String(settings.hour).padStart(2, '0') }) }}</p>
            <button type="button" class="vg-btn vg-btn--primary" :disabled="busy" data-testid="report-send" @click="sendNow"><LoaderCircle v-if="busy" :size="14" class="vg-spin" /><Send v-else :size="14" />{{ t('shops.report.sendNow') }}</button>
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
                <header>
                  <strong>{{ shop.name }}</strong>
                  <span v-if="shop.analysis.yesterday" class="vg-muted">
                    {{ t('shops.report.yesterday') }} {{ fmtMoney(shop.analysis.yesterday.gmv, locale, shop.region) }}
                    <template v-if="shop.analysis.gmvChangeDay !== undefined"> · {{ t('shops.report.vsLastWeek') }} {{ fmtChange(shop.analysis.gmvChangeDay) }}</template>
                  </span>
                  <span v-else class="vg-muted">{{ t('shops.report.noData') }}</span>
                </header>
                <ShopFindings :findings="shop.analysis.findings" :limit="8" />
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
.report-dialog__body { display: grid; grid-template-columns: 280px 1fr; gap: 18px; overflow: auto; }
.report-settings { display: flex; flex-direction: column; gap: 10px; }
.report-row { display: flex; align-items: center; gap: 8px; font-size: 13px; }
.report-hint { font-size: 12px; line-height: 1.5; margin: 0; }
.report-hint--warn { color: var(--vg-amber); }
.report-preview { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.report-preview__head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.report-shop { display: flex; flex-direction: column; gap: 8px; padding: 12px; border: 1px solid var(--theme-border); border-radius: 8px; }
.report-shop header { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
.report-shop header span { font-size: 12px; }
@media (max-width: 900px) { .report-dialog__body { grid-template-columns: 1fr; } }
</style>
