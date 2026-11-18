<script setup lang="ts">
import { computed } from 'vue'

/** Tiny single-series trend line for stat tiles and table rows (no axes; the number beside it carries the value). */
const props = defineProps<{ values: Array<number | null>; reference?: number | null; width?: number; height?: number; label: string; fluid?: boolean }>()
const w = computed(() => props.width || 96)
const h = computed(() => props.height || 28)
const finite = computed(() => props.values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value)))
const range = computed(() => {
  const values = [...finite.value, ...(props.reference ? [props.reference] : [])]
  const min = Math.min(...values)
  const max = Math.max(...values)
  return { min, max: max === min ? min + 1 : max }
})
const point = (value: number, index: number) => {
  const x = props.values.length <= 1 ? w.value / 2 : (index / (props.values.length - 1)) * (w.value - 4) + 2
  const y = h.value - 3 - ((value - range.value.min) / (range.value.max - range.value.min)) * (h.value - 6)
  return { x, y }
}
const path = computed(() => {
  let d = ''
  let pen = false
  props.values.forEach((value, index) => {
    if (value === null || !Number.isFinite(value)) {
      pen = false
      return
    }
    const p = point(value, index)
    d += `${pen ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)} `
    pen = true
  })
  return d
})
const last = computed(() => {
  for (let index = props.values.length - 1; index >= 0; index -= 1) {
    const value = props.values[index]
    if (value !== null && Number.isFinite(value)) return point(value, index)
  }
  return null
})
const refY = computed(() => (props.reference ? point(props.reference, 0).y : null))
</script>

<template>
  <svg v-if="finite.length > 1" class="gv-viz spark" :class="{ 'is-fluid': fluid }" :width="fluid ? undefined : w" :height="h" :preserveAspectRatio="fluid ? 'none' : undefined" :viewBox="`0 0 ${w} ${h}`" role="img" :aria-label="label">
    <line v-if="refY !== null" class="spark__ref" x1="0" :x2="w" :y1="refY" :y2="refY" />
    <path :d="path" class="spark__path" />
    <circle v-if="last && !fluid" :cx="last.x" :cy="last.y" r="2.5" class="spark__dot" />
  </svg>
  <span v-else class="spark__empty" :style="{ width: `${w}px` }">–</span>
</template>

<style scoped>
.spark { display: block; overflow: visible; }
.spark.is-fluid { width: 100%; }
.spark path, .spark line { vector-effect: non-scaling-stroke; }
.spark__path { fill: none; stroke: var(--series-1); stroke-width: 1.75; stroke-linejoin: round; stroke-linecap: round; }
.spark__dot { fill: var(--series-1); }
.spark__ref { stroke: var(--status-critical); stroke-width: 1; stroke-dasharray: 3 3; opacity: .8; }
.spark__empty { display: inline-block; color: var(--theme-text-muted); text-align: center; }
</style>
