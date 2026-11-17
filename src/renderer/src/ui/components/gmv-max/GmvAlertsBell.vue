<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Bell, BellOff } from 'lucide-vue-next'

/**
 * Top-bar alert bell: ROI under break-even, budget burning too fast, tired creatives. The same alerts are sent
 * as desktop notifications by the main process while desktop alerts are on.
 */
export type GmvAlert = {
  key: string
  kind: 'roi_below_floor' | 'budget_overspend' | 'creative_fatigue'
  severity: 'critical' | 'warning'
  campaignId: string
  campaignName: string
  value: string
  threshold?: string
}

defineProps<{ alerts: GmvAlert[]; desktopEnabled: boolean }>()
const emit = defineEmits<{ open: [campaignId: string]; desktop: [enabled: boolean] }>()
const { t } = useI18n()
const open = ref(false)
const root = ref<HTMLElement | null>(null)

const percent = (value?: string) => `${Math.round((Number(value) || 0) * 100)}%`
function detail(alert: GmvAlert) {
  if (alert.kind === 'budget_overspend') return t('gmvV2.alerts.budget_overspend.detail', { spent: percent(alert.value), expected: percent(alert.threshold) })
  if (alert.kind === 'creative_fatigue') return t('gmvV2.alerts.creative_fatigue.detail', { count: alert.value })
  return t('gmvV2.alerts.roi_below_floor.detail', { roi: alert.value, floor: alert.threshold })
}
function choose(alert: GmvAlert) {
  open.value = false
  emit('open', alert.campaignId)
}
function onPointerDown(event: PointerEvent) {
  if (open.value && !root.value?.contains(event.target as Node)) open.value = false
}
function onKey(event: KeyboardEvent) {
  if (event.key === 'Escape') open.value = false
}
onMounted(() => {
  window.addEventListener('pointerdown', onPointerDown, true)
  window.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', onPointerDown, true)
  window.removeEventListener('keydown', onKey)
})
</script>

<template>
  <div ref="root" class="gab">
    <button
      type="button"
      class="gmv-topnav__icon gab__trigger"
      :class="{ 'is-active': open }"
      :title="t('gmvV2.alerts.title')"
      :aria-label="t('gmvV2.alerts.title')"
      :aria-expanded="open"
      data-testid="gmv-alerts"
      @click="open = !open"
    >
      <Bell />
      <em v-if="alerts.length" data-testid="gmv-alerts-count">{{ alerts.length > 99 ? '99+' : alerts.length }}</em>
    </button>
    <div v-if="open" class="gab__panel" role="dialog" :aria-label="t('gmvV2.alerts.title')" data-testid="gmv-alerts-panel">
      <header>
        <strong>{{ t('gmvV2.alerts.title') }}</strong>
        <label class="gab__toggle" :title="t('gmvV2.alerts.desktopHint')">
          <input type="checkbox" :checked="desktopEnabled" data-testid="gmv-alerts-desktop" @change="emit('desktop', ($event.target as HTMLInputElement).checked)" />
          <span>{{ t('gmvV2.alerts.desktop') }}</span>
        </label>
      </header>
      <p v-if="!alerts.length" class="gab__empty"><BellOff />{{ t('gmvV2.alerts.empty') }}</p>
      <ul v-else>
        <li v-for="alert in alerts" :key="alert.key">
          <button type="button" data-testid="gmv-alert-item" @click="choose(alert)">
            <i :class="alert.severity === 'critical' ? 'is-critical' : 'is-warning'"></i>
            <span>
              <strong>{{ t(`gmvV2.alerts.${alert.kind}.title`) }}</strong>
              <small class="gab__campaign">{{ alert.campaignName }}</small>
              <small>{{ detail(alert) }}</small>
            </span>
          </button>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.gab { position: relative; display: inline-flex; }
.gab__panel {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 40;
  width: 360px;
  max-height: 460px;
  overflow-y: auto;
  border: 1px solid var(--theme-border);
  border-radius: 10px;
  background: var(--theme-panel);
  box-shadow: 0 18px 48px rgba(0, 0, 0, .35);
}
.gab__panel header { padding: 12px 14px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--theme-divider); }
.gab__panel header strong { color: var(--theme-text); font-size: 13.5px; }
.gab__toggle { display: inline-flex; align-items: center; gap: 6px; color: var(--theme-text-muted); font-size: 12px; cursor: pointer; }
.gab__toggle input { accent-color: var(--theme-accent); }
.gab__empty { margin: 0; padding: 28px 16px; display: flex; align-items: center; justify-content: center; gap: 8px; color: var(--theme-text-muted); font-size: 13px; }
.gab__empty svg { width: 16px; height: 16px; }
.gab ul { margin: 0; padding: 6px; list-style: none; }
.gab i { width: 8px; height: 8px; margin-top: 6px; flex-shrink: 0; border-radius: 50%; }
.gab i.is-critical { background: var(--status-critical, #d03b3b); }
.gab i.is-warning { background: var(--status-warning, #fab219); }
.gab li span { min-width: 0; display: grid; gap: 2px; text-align: left; }
.gab li strong { color: var(--theme-text); font-size: 13px; font-weight: 600; }
.gab li small { color: var(--theme-text-muted); font-size: 12px; line-height: 1.45; }
.gab li .gab__campaign { color: var(--theme-text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>

<style>
html[data-app-theme] body #app .gab .gab__trigger { position: relative; }
html[data-app-theme] body #app .gab .gab__trigger em { position: absolute; top: -4px; right: -6px; }
html[data-app-theme] body #app .gab li button {
  width: 100%;
  height: auto !important;
  min-height: 0 !important;
  padding: 9px 10px !important;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  border: 0 !important;
  border-radius: 8px !important;
  background: transparent !important;
  box-shadow: none !important;
  cursor: pointer;
}
html[data-app-theme] body #app .gab li button:hover { background: color-mix(in srgb, var(--theme-text) 6%, transparent) !important; }
</style>
