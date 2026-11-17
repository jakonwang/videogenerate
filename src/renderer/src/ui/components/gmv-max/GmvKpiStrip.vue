<script setup lang="ts">
import { useI18n } from 'vue-i18n'

/**
 * A single row of headline numbers, each with an optional change against the previous period.
 * goodWhenUp: true = rising is good (GMV), false = rising is bad, null = neutral (spend).
 */
export type GmvKpi = { key: string; label: string; value: string; change?: number | null; goodWhenUp?: boolean | null; hint?: string }

defineProps<{ items: GmvKpi[]; compare: boolean }>()
const { t } = useI18n()

function tone(value: number | null | undefined, goodWhenUp: boolean | null | undefined) {
  if (value == null || Math.abs(value) < 0.005 || goodWhenUp == null) return 'is-flat'
  return value > 0 === goodWhenUp ? 'is-up' : 'is-down'
}
function text(value: number) {
  if (Math.abs(value) < 0.005) return '0%'
  return `${value > 0 ? '▲' : '▼'} ${Math.min(999, Math.abs(value * 100)).toFixed(1)}%`
}
</script>

<template>
  <div class="gmv-kpistrip" :style="{ '--kpi-count': items.length }">
    <div v-for="kpi in items" :key="kpi.key" class="gmv-kpistrip__item" :data-kpi="kpi.key">
      <span>{{ kpi.label }}</span>
      <strong :title="kpi.value">{{ kpi.value }}</strong>
      <small v-if="compare && kpi.change !== undefined" :class="['gmv-kpistrip__change', tone(kpi.change, kpi.goodWhenUp)]">
        <template v-if="kpi.change !== null">{{ text(kpi.change) }} <i>{{ t('gmvV2.compare.vsPrevious') }}</i></template>
        <i v-else>{{ t('gmvV2.compare.noPrevious') }}</i>
      </small>
      <small v-else-if="kpi.hint" class="gmv-kpistrip__hint">{{ kpi.hint }}</small>
    </div>
  </div>
</template>
