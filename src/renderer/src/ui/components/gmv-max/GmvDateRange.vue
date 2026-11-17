<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { CalendarRange } from 'lucide-vue-next'

/**
 * One date-range control for every GMV MAX data page: quick presets ending yesterday (the last complete day),
 * a custom range, and a "compare with the previous period" switch.
 */
const props = defineProps<{ startDate: string; endDate: string; compare: boolean }>()
const emit = defineEmits<{ change: [range: { startDate: string; endDate: string }]; compare: [enabled: boolean] }>()
const { t } = useI18n()

const DAY = 86_400_000
const iso = (value: number) => new Date(value).toISOString().slice(0, 10)
const yesterday = () => iso(Date.now() - DAY)
const PRESETS = [1, 7, 14, 30] as const
const presetRange = (days: number) => ({ startDate: iso(Date.now() - days * DAY), endDate: yesterday() })

const activePreset = computed(() => {
  if (props.endDate !== yesterday()) return null
  return PRESETS.find((days) => presetRange(days).startDate === props.startDate) ?? null
})
const customOpen = ref(false)
watch(activePreset, (value) => {
  if (value === null) customOpen.value = true
}, { immediate: true })

const draftStart = ref(props.startDate)
const draftEnd = ref(props.endDate)
watch(() => [props.startDate, props.endDate], ([start, end]) => {
  draftStart.value = start
  draftEnd.value = end
})

function pick(days: number) {
  customOpen.value = false
  emit('change', presetRange(days))
}
function applyCustom() {
  if (!draftStart.value || !draftEnd.value) return
  const [startDate, endDate] = draftStart.value <= draftEnd.value ? [draftStart.value, draftEnd.value] : [draftEnd.value, draftStart.value]
  emit('change', { startDate, endDate })
}

const previousLabel = computed(() => {
  const start = Date.parse(`${props.startDate}T00:00:00Z`)
  const end = Date.parse(`${props.endDate}T00:00:00Z`)
  if (!Number.isFinite(start) || !Number.isFinite(end)) return ''
  const length = Math.round((end - start) / DAY) + 1
  const short = (value: number) => iso(value).slice(5).replace('-', '/')
  return length === 1 ? short(start - DAY) : `${short(start - length * DAY)}–${short(start - DAY)}`
})
</script>

<template>
  <div class="gmv-range vg-scope" data-testid="gmv-date-range">
    <CalendarRange class="gmv-range__icon" aria-hidden="true" />
    <div class="gmv-range__presets" role="group" :aria-label="t('gmvV2.range.label')">
      <button
        v-for="days in PRESETS"
        :key="days"
        type="button"
        :class="{ 'is-active': activePreset === days && !customOpen }"
        :data-testid="`gmv-range-${days}`"
        @click="pick(days)"
      >
        {{ days === 1 ? t('gmvV2.range.yesterday') : t('gmvV2.range.lastDays', { days }) }}
      </button>
      <button type="button" :class="{ 'is-active': customOpen }" data-testid="gmv-range-custom" @click="customOpen = !customOpen">
        {{ t('gmvV2.range.custom') }}
      </button>
    </div>
    <div v-if="customOpen" class="gmv-range__custom">
      <input v-model="draftStart" type="date" :max="draftEnd" :aria-label="t('gmvV2.range.start')" @change="applyCustom" />
      <span>–</span>
      <input v-model="draftEnd" type="date" :min="draftStart" :aria-label="t('gmvV2.range.end')" @change="applyCustom" />
    </div>
    <label class="gmv-range__compare" :title="previousLabel">
      <input type="checkbox" :checked="compare" data-testid="gmv-range-compare" @change="emit('compare', ($event.target as HTMLInputElement).checked)" />
      <span>{{ t('gmvV2.range.compare') }}</span>
      <small v-if="compare && previousLabel">{{ previousLabel }}</small>
    </label>
  </div>
</template>

<style scoped>
.gmv-range { display: inline-flex; align-items: center; gap: 12px; flex-wrap: wrap; min-width: 0; }
.gmv-range__icon { width: 16px; height: 16px; color: var(--theme-text-muted); flex-shrink: 0; }
.gmv-range__presets { display: inline-flex; padding: 2px; border: 1px solid var(--theme-border); border-radius: 8px; }
.gmv-range__custom { display: inline-flex; align-items: center; gap: 6px; color: var(--theme-text-muted); }
.gmv-range__compare { display: inline-flex; align-items: center; gap: 6px; color: var(--theme-text-secondary); font-size: 12.5px; cursor: pointer; white-space: nowrap; }
.gmv-range__compare input { width: 14px; height: 14px; accent-color: var(--theme-accent); }
.gmv-range__compare small { color: var(--theme-text-muted); font-size: 12px; }
</style>

<style>
html[data-app-theme] body #app .gmv-range .gmv-range__presets button {
  height: 28px !important;
  min-height: 28px !important;
  padding: 0 10px !important;
  border: 0 !important;
  border-radius: 6px !important;
  background: transparent !important;
  box-shadow: none !important;
  color: var(--theme-text-muted) !important;
  font-size: 12.5px !important;
  font-weight: 500 !important;
  white-space: nowrap;
  cursor: pointer;
}
html[data-app-theme] body #app .gmv-range .gmv-range__presets button:hover { color: var(--theme-text) !important; }
html[data-app-theme] body #app .gmv-range .gmv-range__presets button.is-active {
  background: color-mix(in srgb, var(--theme-text) 11%, transparent) !important;
  color: var(--theme-text) !important;
  font-weight: 600 !important;
}
html[data-app-theme] body #app .gmv-range .gmv-range__custom input {
  height: 30px !important;
  min-height: 30px !important;
  padding: 0 8px !important;
  border: 1px solid var(--theme-border) !important;
  border-radius: 7px !important;
  background: transparent !important;
  color: var(--theme-text) !important;
  font-size: 12.5px !important;
  color-scheme: inherit;
}
</style>
