<script setup lang="ts">
import { computed } from 'vue'

/** Ring chart of how the period's output splits across production lines, with a legend beside it. */
export type DonutSegment = { key: string; label: string; value: number; color: string }

const props = defineProps<{ segments: DonutSegment[]; totalLabel: string; locale: string }>()

const SIZE = 150
const STROKE = 18
const R = (SIZE - STROKE) / 2
const C = 2 * Math.PI * R

const total = computed(() => props.segments.reduce((sum, row) => sum + row.value, 0))
const arcs = computed(() => {
  let offset = 0
  return props.segments.filter((row) => row.value > 0).map((row) => {
    const length = (row.value / total.value) * C
    const arc = { key: row.key, color: row.color, dash: `${Math.max(0, length - (props.segments.length > 1 ? 2 : 0))} ${C}`, offset: -offset }
    offset += length
    return arc
  })
})

function share(value: number) {
  if (!total.value) return '0%'
  const pct = (value / total.value) * 100
  return `${new Intl.NumberFormat(props.locale, { maximumFractionDigits: 1 }).format(pct)}%`
}
</script>

<template>
  <div class="donut-wrap">
  <div class="donut">
    <div class="donut__ring">
      <svg :viewBox="`0 0 ${SIZE} ${SIZE}`" aria-hidden="true">
        <circle :cx="SIZE / 2" :cy="SIZE / 2" :r="R" class="donut__track" :stroke-width="STROKE" />
        <circle
          v-for="arc in arcs"
          :key="arc.key"
          :cx="SIZE / 2"
          :cy="SIZE / 2"
          :r="R"
          fill="none"
          :stroke="arc.color"
          :stroke-width="STROKE"
          :stroke-dasharray="arc.dash"
          :stroke-dashoffset="arc.offset"
          :transform="`rotate(-90 ${SIZE / 2} ${SIZE / 2})`"
          class="donut__arc"
        />
      </svg>
      <span class="donut__center">
        <strong class="vg-num">{{ new Intl.NumberFormat(locale).format(total) }}</strong>
        <span>{{ totalLabel }}</span>
      </span>
    </div>
    <ul class="donut__legend">
      <li v-for="row in segments" :key="row.key">
        <i :style="{ background: row.color }"></i>
        <span class="donut__name" :title="row.label">{{ row.label }}</span>
        <span class="donut__count vg-num">{{ row.value }}</span>
        <span class="donut__share vg-num">{{ share(row.value) }}</span>
      </li>
    </ul>
  </div>
  </div>
</template>

<style scoped>
.donut-wrap { flex: 1; display: flex; container-type: inline-size; }
.donut { display: flex; align-items: center; justify-content: center; gap: 20px; flex: 1; min-width: 0; }
.donut__ring { position: relative; width: 136px; height: 136px; flex-shrink: 0; }
.donut__ring svg { width: 100%; height: 100%; display: block; }
.donut__track { fill: none; stroke: color-mix(in srgb, var(--theme-text) 7%, transparent); }
.donut__arc { filter: drop-shadow(0 0 6px color-mix(in srgb, var(--vg-accent) 35%, transparent)); }
.donut__center { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; }
.donut__center strong { font-size: 26px; font-weight: 800; color: var(--theme-text); line-height: 1; }
.donut__center span { font-size: 12px; color: var(--theme-text-muted); }
.donut__legend { display: flex; flex-direction: column; gap: 12px; flex: 1; min-width: 0; margin: 0; padding: 0; list-style: none; }
.donut__legend { max-width: 260px; }
.donut__legend li { display: grid; grid-template-columns: 9px minmax(max-content, 1fr) 28px 46px; align-items: center; gap: 8px; font-size: 13px; color: var(--theme-text-secondary); }
.donut__legend i { width: 9px; height: 9px; border-radius: 50%; }
.donut__name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--theme-text); }
.donut__count, .donut__share { text-align: right; font-variant-numeric: tabular-nums; }
.donut__count { color: var(--theme-text); font-weight: 700; }
/* Too narrow for ring and legend side by side: stack them so names never get cut. */
@container (max-width: 380px) {
  .donut { flex-direction: column; gap: 14px; }
  .donut__legend { width: 100%; max-width: none; }
}
</style>
