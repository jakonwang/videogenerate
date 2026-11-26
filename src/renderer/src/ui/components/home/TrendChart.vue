<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

/**
 * Two-series line chart for the home page: this period (solid, filled) against the previous one
 * (dashed). Drawn in pixels from the measured size so text and strokes never stretch.
 */
/** null = no data for that day (not synced yet); the line breaks there instead of dropping to 0. */
type Point = { label: string; current: number | null; previous: number | null }

const props = defineProps<{
  points: Point[]
  format: (value: number) => string
  /** Shorter labels for the y axis (e.g. "300M"); falls back to `format`. */
  axisFormat?: (value: number) => string
  currentLabel: string
  previousLabel: string
  /** Shown in the tooltip for a day without data. */
  noDataLabel?: string
}>()

const root = ref<HTMLElement | null>(null)
const width = ref(600)
const height = ref(200)
const hover = ref<number | null>(null)
let observer: ResizeObserver | null = null

onMounted(() => {
  if (!root.value) return
  observer = new ResizeObserver(([entry]) => {
    width.value = Math.max(200, entry.contentRect.width)
    height.value = Math.max(120, entry.contentRect.height)
  })
  observer.observe(root.value)
})
onBeforeUnmount(() => observer?.disconnect())

const PAD_BASE = { top: 12, right: 12, bottom: 24 }
/** Room for the y-axis labels, sized to the longest one ("100M" vs "7092.6万₫"). */
const padLeft = computed(() => {
  const longest = Math.max(...[0, 1, 2, 3, 4].map((index) => (props.axisFormat || props.format)((top.value / 4) * index).length))
  return Math.min(96, Math.max(36, Math.round(longest * 7 + 14)))
})
const PAD = computed(() => ({ ...PAD_BASE, left: padLeft.value }))

/** A round axis maximum (1, 2, 2.5, 5 × 10^n) so the tick labels read cleanly. */
function niceMax(value: number) {
  if (value <= 0) return 1
  const power = 10 ** Math.floor(Math.log10(value))
  const step = [1, 2, 2.5, 5, 10].find((factor) => factor * power >= value) || 10
  return step * power
}

const top = computed(() => niceMax(Math.max(0, ...props.points.flatMap((point) => [point.current ?? 0, point.previous ?? 0]))))
const plotWidth = computed(() => width.value - PAD.value.left - PAD.value.right)
const plotHeight = computed(() => height.value - PAD.value.top - PAD.value.bottom)

function x(index: number) {
  const count = props.points.length
  return PAD.value.left + (count <= 1 ? plotWidth.value / 2 : (index / (count - 1)) * plotWidth.value)
}
function y(value: number) {
  return PAD.value.top + plotHeight.value - (Math.max(0, value) / top.value) * plotHeight.value
}

/** Runs of consecutive days that have a value, as [index, value] pairs. */
function segments(values: Array<number | null>) {
  const runs: Array<Array<[number, number]>> = []
  let run: Array<[number, number]> = []
  values.forEach((value, index) => {
    if (value === null) {
      if (run.length) runs.push(run)
      run = []
    } else run.push([index, value])
  })
  if (run.length) runs.push(run)
  return runs
}
/** Smooth path through one run (cubic, control points at the horizontal midpoints). */
function curve(run: Array<[number, number]>) {
  return run.map(([index, value], i) => {
    if (i === 0) return `M${x(index)},${y(value)}`
    const [prevIndex, prevValue] = run[i - 1]
    const midX = (x(prevIndex) + x(index)) / 2
    return `C${midX},${y(prevValue)} ${midX},${y(value)} ${x(index)},${y(value)}`
  }).join(' ')
}
const baseline = computed(() => PAD.value.top + plotHeight.value)
const currentRuns = computed(() => segments(props.points.map((point) => point.current)))
const currentPath = computed(() => currentRuns.value.map(curve).join(' '))
const previousPath = computed(() => segments(props.points.map((point) => point.previous)).map(curve).join(' '))
const areaPath = computed(() => currentRuns.value.map((run) => {
  const first = run[0][0]
  const last = run[run.length - 1][0]
  return `${curve(run)} L${x(last)},${baseline.value} L${x(first)},${baseline.value} Z`
}).join(' '))
/** A lone day with data has no line to show; mark it with a dot. */
const singles = computed(() => currentRuns.value.filter((run) => run.length === 1).map(([[index, value]]) => ({ x: x(index), y: y(value) })))

const ticks = computed(() => Array.from({ length: 5 }, (_, index) => {
  const value = (top.value / 4) * index
  return { value, y: y(value), label: (props.axisFormat || props.format)(value) }
}))

/** Show at most ~8 date labels so they never overlap. */
const labelEvery = computed(() => Math.max(1, Math.ceil(props.points.length / 8)))
/** Every n-th date plus the last one; a regular label too close to the last one is dropped. */
function showLabel(index: number) {
  const last = props.points.length - 1
  if (index === last) return true
  return index % labelEvery.value === 0 && last - index >= Math.ceil(labelEvery.value * 0.6)
}

function onMove(event: MouseEvent) {
  if (!root.value || !props.points.length) return
  const box = root.value.getBoundingClientRect()
  const offset = event.clientX - box.left - PAD.value.left
  const count = props.points.length
  const index = count <= 1 ? 0 : Math.round((offset / plotWidth.value) * (count - 1))
  hover.value = Math.min(count - 1, Math.max(0, index))
}

const tip = computed(() => {
  if (hover.value === null) return null
  const point = props.points[hover.value]
  const left = x(hover.value)
  return { point, left, y: y(point.current ?? point.previous ?? 0), hasValue: point.current !== null, flip: left > width.value - 190 }
})
</script>

<template>
  <div ref="root" class="trend" @mousemove="onMove" @mouseleave="hover = null">
    <svg :width="width" :height="height" class="trend__svg" aria-hidden="true">
      <defs>
        <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--vg-accent)" stop-opacity=".38" />
          <stop offset="100%" stop-color="var(--vg-accent)" stop-opacity="0" />
        </linearGradient>
        <linearGradient id="trend-stroke" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="var(--vg-accent)" stop-opacity=".55" />
          <stop offset="100%" stop-color="var(--vg-accent)" />
        </linearGradient>
      </defs>
      <g class="trend__grid">
        <line v-for="tick in ticks" :key="tick.value" :x1="PAD.left" :x2="width - PAD.right" :y1="tick.y" :y2="tick.y" />
      </g>
      <g class="trend__ylabels">
        <text v-for="tick in ticks" :key="tick.value" :x="PAD.left - 8" :y="tick.y + 4" text-anchor="end">{{ tick.label }}</text>
      </g>
      <g class="trend__xlabels">
        <template v-for="(point, index) in points" :key="point.label">
          <text v-if="showLabel(index)" :x="x(index)" :y="height - 6" text-anchor="middle">{{ point.label }}</text>
        </template>
      </g>
      <path :d="areaPath" fill="url(#trend-fill)" />
      <path :d="previousPath" class="trend__previous" />
      <path :d="currentPath" class="trend__current" />
      <circle v-for="dot in singles" :key="`${dot.x}`" class="trend__dot" :cx="dot.x" :cy="dot.y" r="3.5" />
      <template v-if="tip">
        <line class="trend__cursor" :x1="tip.left" :x2="tip.left" :y1="PAD.top" :y2="PAD.top + plotHeight" />
        <circle v-if="tip.hasValue" class="trend__dot" :cx="tip.left" :cy="tip.y" r="5" />
      </template>
    </svg>
    <div v-if="tip" class="trend__tip" :style="{ left: `${tip.left}px`, top: `${Math.max(4, tip.y - 70)}px` }" :class="{ 'trend__tip--flip': tip.flip }">
      <strong>{{ tip.point.label }}</strong>
      <span><i class="trend__swatch"></i>{{ currentLabel }}：{{ tip.point.current === null ? (noDataLabel || '—') : format(tip.point.current) }}</span>
      <span><i class="trend__swatch trend__swatch--prev"></i>{{ previousLabel }}：{{ tip.point.previous === null ? (noDataLabel || '—') : format(tip.point.previous) }}</span>
    </div>
  </div>
</template>

<style scoped>
.trend { position: relative; width: 100%; height: 100%; min-height: 150px; }
.trend__svg { position: absolute; inset: 0; display: block; overflow: visible; }
.trend__grid line { stroke: color-mix(in srgb, var(--theme-text) 8%, transparent); stroke-dasharray: 3 4; }
.trend__ylabels text, .trend__xlabels text { fill: var(--theme-text-muted); font-size: 11px; font-variant-numeric: tabular-nums; }
.trend__current { fill: none; stroke: url(#trend-stroke); stroke-width: 2.5; stroke-linecap: round; filter: drop-shadow(0 0 6px color-mix(in srgb, var(--vg-accent) 55%, transparent)); }
.trend__previous { fill: none; stroke: var(--vg-violet); stroke-width: 1.5; stroke-dasharray: 5 5; opacity: .75; }
.trend__cursor { stroke: color-mix(in srgb, var(--theme-text) 30%, transparent); stroke-dasharray: 3 3; }
.trend__dot { fill: var(--vg-accent); stroke: var(--theme-panel); stroke-width: 2; filter: drop-shadow(0 0 6px var(--vg-accent)); }
.trend__tip { position: absolute; z-index: 2; display: flex; flex-direction: column; gap: 3px; min-width: 170px; padding: 8px 10px; transform: translateX(12px); border: 1px solid color-mix(in srgb, var(--vg-accent) 30%, var(--theme-border)); border-radius: 8px; background: color-mix(in srgb, var(--theme-panel) 92%, transparent); backdrop-filter: blur(6px); font-size: 12px; color: var(--theme-text); pointer-events: none; white-space: nowrap; font-variant-numeric: tabular-nums; }
.trend__tip--flip { transform: translateX(calc(-100% - 12px)); }
.trend__tip strong { font-size: 12px; }
.trend__swatch { display: inline-block; width: 7px; height: 7px; margin-right: 6px; border-radius: 50%; background: var(--vg-accent); }
.trend__swatch--prev { background: var(--vg-violet); }
</style>
