<script setup lang="ts">
import { computed } from 'vue'

/** Tiny day-by-day line for table cells; a flat line when there is nothing to show. */
const props = withDefaults(defineProps<{ values: number[]; width?: number; height?: number }>(), { width: 84, height: 24 })

const path = computed(() => {
  const values = props.values.length ? props.values : [0, 0]
  const max = Math.max(...values)
  const step = props.width / Math.max(1, values.length - 1)
  const pad = 3
  const y = (value: number) => (max > 0 ? pad + (props.height - pad * 2) * (1 - value / max) : props.height - pad)
  return values.map((value, index) => {
    if (index === 0) return `M0,${y(value)}`
    const midX = (index - 0.5) * step
    return `C${midX},${y(values[index - 1])} ${midX},${y(value)} ${index * step},${y(value)}`
  }).join(' ')
})
const active = computed(() => props.values.some((value) => value > 0))
</script>

<template>
  <svg class="spark" :class="{ 'is-flat': !active }" :width="width" :height="height" :viewBox="`0 0 ${width} ${height}`" aria-hidden="true">
    <path :d="path" />
  </svg>
</template>

<style scoped>
.spark { display: block; overflow: visible; }
.spark path { fill: none; stroke: var(--vg-accent); stroke-width: 1.8; stroke-linecap: round; filter: drop-shadow(0 0 4px color-mix(in srgb, var(--vg-accent) 60%, transparent)); }
.spark.is-flat path { stroke: var(--theme-text-muted); stroke-dasharray: 3 4; opacity: .5; filter: none; }
</style>
