<script setup lang="ts">
import { computed, ref } from 'vue'

/** Line chart of one metric per day, with the previous period dashed behind it. */
const props = defineProps<{
  points: Array<{ date: string; value: number }>
  previous?: number[]
  format: (value: number) => string
  height?: number
}>()

const W = 800
const H = computed(() => props.height ?? 200)
const PAD = { top: 12, right: 8, bottom: 22, left: 8 }
const hover = ref<number | null>(null)

const max = computed(() => Math.max(1, ...props.points.map((point) => point.value), ...(props.previous || [])))
const step = computed(() => (props.points.length > 1 ? (W - PAD.left - PAD.right) / (props.points.length - 1) : 0))
const x = (index: number) => PAD.left + index * step.value
const y = (value: number) => PAD.top + (1 - value / max.value) * (H.value - PAD.top - PAD.bottom)

const line = computed(() => props.points.map((point, index) => `${index ? 'L' : 'M'}${x(index).toFixed(1)},${y(point.value).toFixed(1)}`).join(' '))
const area = computed(() => (props.points.length ? `${line.value} L${x(props.points.length - 1)},${H.value - PAD.bottom} L${x(0)},${H.value - PAD.bottom} Z` : ''))
const prevLine = computed(() => (props.previous || []).slice(0, props.points.length).map((value, index) => `${index ? 'L' : 'M'}${x(index).toFixed(1)},${y(value).toFixed(1)}`).join(' '))
const labels = computed(() => {
  const count = props.points.length
  if (!count) return []
  const every = Math.max(1, Math.ceil(count / 7))
  return props.points.map((point, index) => ({ index, text: point.date.slice(5).replace('-', '/') })).filter((item) => item.index % every === 0 || item.index === count - 1)
})

function onMove(event: MouseEvent) {
  const box = (event.currentTarget as SVGElement).getBoundingClientRect()
  const ratio = (event.clientX - box.left) / box.width
  const index = Math.round((ratio * W - PAD.left) / (step.value || 1))
  hover.value = Math.min(props.points.length - 1, Math.max(0, index))
}
</script>

<template>
  <div class="trend">
    <svg :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="none" class="trend__svg" :style="{ height: `${H}px` }" @mousemove="onMove" @mouseleave="hover = null">
      <line v-for="ratio in [0.25, 0.5, 0.75]" :key="ratio" :x1="PAD.left" :x2="W - PAD.right" :y1="PAD.top + ratio * (H - PAD.top - PAD.bottom)" :y2="PAD.top + ratio * (H - PAD.top - PAD.bottom)" class="trend__grid" />
      <path v-if="prevLine" :d="prevLine" class="trend__prev" vector-effect="non-scaling-stroke" />
      <path :d="area" class="trend__area" />
      <path :d="line" class="trend__line" vector-effect="non-scaling-stroke" />
      <line v-if="hover !== null" :x1="x(hover)" :x2="x(hover)" :y1="PAD.top" :y2="H - PAD.bottom" class="trend__cursor" vector-effect="non-scaling-stroke" />
    </svg>
    <div class="trend__axis">
      <span v-for="label in labels" :key="label.index" :style="{ left: `${(x(label.index) / W) * 100}%` }">{{ label.text }}</span>
    </div>
    <div v-if="hover !== null && points[hover]" class="trend__tip" :style="{ left: `${(x(hover) / W) * 100}%` }">
      <strong>{{ points[hover].date }}</strong>
      <span>{{ format(points[hover].value) }}</span>
      <small v-if="previous && previous[hover] !== undefined">{{ format(previous[hover]) }}</small>
    </div>
  </div>
</template>

<style scoped>
.trend { position: relative; }
.trend__svg { width: 100%; display: block; overflow: visible; }
.trend__grid { stroke: var(--theme-divider); stroke-width: 1; }
.trend__line { fill: none; stroke: var(--vg-accent); stroke-width: 2; }
.trend__area { fill: color-mix(in srgb, var(--vg-accent) 14%, transparent); }
.trend__prev { fill: none; stroke: var(--theme-text-muted); stroke-width: 1.5; stroke-dasharray: 4 4; opacity: 0.6; }
.trend__cursor { stroke: var(--theme-text-muted); stroke-width: 1; }
.trend__axis { position: relative; height: 16px; font-size: 11px; color: var(--theme-text-muted); }
.trend__axis span { position: absolute; transform: translateX(-50%); white-space: nowrap; }
.trend__tip { position: absolute; top: 0; transform: translateX(-50%); display: flex; flex-direction: column; gap: 1px; padding: 6px 8px; border: 1px solid var(--theme-border); border-radius: 6px; background: var(--theme-panel); font-size: 12px; pointer-events: none; white-space: nowrap; box-shadow: 0 4px 12px rgb(0 0 0 / 0.2); }
.trend__tip small { color: var(--theme-text-muted); }
</style>
