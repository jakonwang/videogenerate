<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

/** The three ROI lines on one ruler: break-even, target, actual (7-day). */
const props = defineProps<{ breakEven: number | null; target: number | null; actual: number | null; compact?: boolean }>()
const { t } = useI18n()

const max = computed(() => {
  const values = [props.breakEven, props.target, props.actual].filter((value): value is number => typeof value === 'number' && value > 0)
  return values.length ? Math.max(...values) * 1.25 : 1
})
const pos = (value: number | null) => (value && value > 0 ? `${Math.min(100, (value / max.value) * 100)}%` : '0%')
const actualTone = computed(() => {
  if (!props.actual) return 'gray'
  if (props.breakEven && props.actual < props.breakEven) return 'red'
  if (props.target && props.actual < props.target * 0.97) return 'amber'
  return 'green'
})
</script>

<template>
  <div class="roi-lines" :class="{ 'is-compact': compact }" role="img" :aria-label="t('gmvV2.lines.aria', { breakEven: breakEven ?? '-', target: target ?? '-', actual: actual ?? '-' })">
    <div class="roi-lines__track">
      <span v-if="breakEven" class="roi-lines__loss" :style="{ width: pos(breakEven) }"></span>
      <span v-if="breakEven" class="roi-lines__mark roi-lines__mark--be" :style="{ left: pos(breakEven) }"></span>
      <span v-if="target" class="roi-lines__mark roi-lines__mark--target" :style="{ left: pos(target) }"></span>
      <span v-if="actual" class="roi-lines__dot" :class="`is-${actualTone}`" :style="{ left: pos(actual) }"></span>
    </div>
    <div v-if="!compact" class="roi-lines__legend">
      <span><i class="roi-lines__key roi-lines__key--be"></i>{{ t('gmvV2.lines.breakEven') }} {{ breakEven?.toFixed(2) ?? t('gmvV2.lines.unknown') }}</span>
      <span><i class="roi-lines__key roi-lines__key--target"></i>{{ t('gmvV2.lines.target') }} {{ target?.toFixed(2) ?? t('gmvV2.lines.maxDelivery') }}</span>
      <span><i class="roi-lines__key roi-lines__key--actual" :class="`is-${actualTone}`"></i>{{ t('gmvV2.lines.actual') }} {{ actual?.toFixed(2) ?? '-' }}</span>
    </div>
  </div>
</template>

<style scoped>
.roi-lines { display: flex; flex-direction: column; gap: 8px; min-width: 120px; }
.roi-lines__track { position: relative; height: 8px; border-radius: 999px; background: var(--theme-panel-soft); }
.roi-lines.is-compact .roi-lines__track { height: 6px; }
.roi-lines__loss { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 999px 0 0 999px; background: color-mix(in srgb, var(--vg-red) 22%, transparent); }
.roi-lines__mark { position: absolute; top: -4px; bottom: -4px; width: 2px; transform: translateX(-1px); border-radius: 2px; }
.roi-lines__mark--be { background: var(--vg-red); }
.roi-lines__mark--target { background: var(--theme-text-secondary); }
.roi-lines__dot { position: absolute; top: 50%; width: 12px; height: 12px; border-radius: 50%; transform: translate(-50%, -50%); border: 2px solid var(--theme-panel); }
.roi-lines.is-compact .roi-lines__dot { width: 10px; height: 10px; }
.is-green { background: var(--vg-green); }
.is-amber { background: var(--vg-amber); }
.is-red { background: var(--vg-red); }
.is-gray { background: var(--vg-gray); }
.roi-lines__legend { display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 12px; color: var(--theme-text-secondary); }
.roi-lines__legend span { display: inline-flex; align-items: center; gap: 6px; }
.roi-lines__key { display: inline-block; width: 10px; height: 10px; border-radius: 2px; }
.roi-lines__key--be { background: var(--vg-red); }
.roi-lines__key--target { background: var(--theme-text-secondary); }
.roi-lines__key--actual { border-radius: 50%; }
</style>
