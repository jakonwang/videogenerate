<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

/**
 * Single-axis line chart with a snapping crosshair + tooltip, reference lines, a legend (≥ 2 series)
 * and a direct label on each series' last point. Colours come from the .gv-viz tokens.
 */
export type ChartSeries = { key: string; label: string; color: 'series-1' | 'series-2'; values: Array<number | null> }
export type ChartRefLine = { label: string; value: number; tone: 'critical' | 'neutral' }

const props = defineProps<{
  dates: string[]
  series: ChartSeries[]
  refLines?: ChartRefLine[]
  format: (value: number) => string
  /** Shorter formatter for the y-axis ticks; defaults to `format`. */
  axisFormat?: (value: number) => string
  height?: number
  ariaLabel: string
}>()

// Drawn at the real pixel width (measured), so text and strokes never scale with the container.
const plot = ref<HTMLElement | null>(null)
const measured = ref(640)
let observer: ResizeObserver | null = null
onMounted(() => {
  if (!plot.value) return
  measured.value = Math.max(240, Math.round(plot.value.clientWidth) || 640)
  observer = new ResizeObserver((entries) => {
    const next = Math.round(entries[0]?.contentRect.width || 0)
    if (next > 0) measured.value = Math.max(240, next)
  })
  observer.observe(plot.value)
})
onBeforeUnmount(() => observer?.disconnect())
const height = computed(() => props.height || 200)
const hover = ref<number | null>(null)
const textWidth = (text: string) => text.length * 6.6

const allValues = computed(() => [
  ...props.series.flatMap((serie) => serie.values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value))),
  ...(props.refLines || []).map((line) => line.value),
])
const yMax = computed(() => {
  const max = Math.max(0, ...allValues.value)
  if (max <= 0) return 1
  const magnitude = 10 ** Math.floor(Math.log10(max))
  return Math.ceil((max * 1.12) / magnitude) * magnitude
})
const ticks = computed(() => [0, 0.25, 0.5, 0.75, 1].map((ratio) => ratio * yMax.value))
const width = computed(() => measured.value)
const pad = computed(() => {
  const lastLabels = props.series.map((serie) => {
    const last = [...serie.values].reverse().find((value) => value !== null && Number.isFinite(value))
    return last === undefined || last === null ? '' : props.format(last)
  })
  return {
    top: 14,
    bottom: 26,
    left: Math.ceil(Math.max(28, ...ticks.value.map((tick) => textWidth((props.axisFormat || props.format)(tick)))) + 10),
    right: Math.ceil(Math.max(16, ...lastLabels.map(textWidth)) + 16),
  }
})
const innerW = computed(() => width.value - pad.value.left - pad.value.right)
const innerH = computed(() => height.value - pad.value.top - pad.value.bottom)
const x = (index: number) => pad.value.left + (props.dates.length <= 1 ? innerW.value / 2 : (index / (props.dates.length - 1)) * innerW.value)
const y = (value: number) => pad.value.top + innerH.value - (value / yMax.value) * innerH.value

const paths = computed(() => props.series.map((serie) => {
  let d = ''
  let pen = false
  serie.values.forEach((value, index) => {
    if (value === null || !Number.isFinite(value)) {
      pen = false
      return
    }
    d += `${pen ? 'L' : 'M'}${x(index).toFixed(1)},${y(value).toFixed(1)} `
    pen = true
  })
  const lastIndex = [...serie.values].map((value, index) => (value === null ? -1 : index)).filter((index) => index >= 0).pop()
  return { ...serie, d, last: lastIndex !== undefined ? { x: x(lastIndex), y: y(serie.values[lastIndex] as number), value: serie.values[lastIndex] as number } : null }
}))

const xLabels = computed(() => {
  const n = props.dates.length
  if (!n) return []
  const picks = new Set([0, Math.floor((n - 1) / 2), n - 1])
  return [...picks].map((index) => ({ x: x(index), label: props.dates[index].slice(5) }))
})

function onMove(event: PointerEvent) {
  const svg = event.currentTarget as SVGSVGElement
  const rect = svg.getBoundingClientRect()
  const px = ((event.clientX - rect.left) / rect.width) * width.value
  if (!props.dates.length) return
  const ratio = (px - pad.value.left) / innerW.value
  hover.value = Math.max(0, Math.min(props.dates.length - 1, Math.round(ratio * (props.dates.length - 1))))
}

function onKey(event: KeyboardEvent) {
  if (!props.dates.length) return
  if (event.key === 'ArrowLeft') hover.value = Math.max(0, (hover.value ?? props.dates.length) - 1)
  else if (event.key === 'ArrowRight') hover.value = Math.min(props.dates.length - 1, (hover.value ?? -1) + 1)
  else return
  event.preventDefault()
}

const tooltipLeft = computed(() => (hover.value === null ? 0 : (x(hover.value) / width.value) * 100))
</script>

<template>
  <div class="gv-viz chart">
    <div v-if="series.length >= 2 || refLines?.length" class="chart__legend">
      <span v-for="serie in series" :key="serie.key" class="chart__key"><i class="chart__line" :style="{ background: `var(--${serie.color})` }"></i>{{ serie.label }}</span>
      <span v-for="line in refLines || []" :key="line.label" class="chart__key"><i class="chart__ref" :class="`gvt-${line.tone}`"></i>{{ line.label }}</span>
    </div>
    <div ref="plot" class="chart__plot">
      <svg
        :viewBox="`0 0 ${width} ${height}`"
        :width="width"
        :height="height"
        role="img"
        :aria-label="ariaLabel"
        tabindex="0"
        @pointermove="onMove"
        @pointerleave="hover = null"
        @focus="hover = dates.length - 1"
        @blur="hover = null"
        @keydown="onKey"
      >
        <g class="chart__grid">
          <line v-for="tick in ticks" :key="tick" :x1="pad.left" :x2="width - pad.right" :y1="y(tick)" :y2="y(tick)" />
        </g>
        <g class="chart__axis">
          <text v-for="tick in ticks" :key="`t${tick}`" :x="pad.left - 8" :y="y(tick) + 4" text-anchor="end">{{ (axisFormat || format)(tick) }}</text>
          <text v-for="item in xLabels" :key="item.label" :x="item.x" :y="height - 6" text-anchor="middle">{{ item.label }}</text>
        </g>
        <g v-for="line in refLines || []" :key="`r${line.label}`">
          <line class="chart__refline" :class="`gvt-${line.tone}`" :x1="pad.left" :x2="width - pad.right" :y1="y(line.value)" :y2="y(line.value)" />
        </g>
        <line v-if="hover !== null" class="chart__crosshair" :x1="x(hover)" :x2="x(hover)" :y1="pad.top" :y2="pad.top + innerH" />
        <g v-for="serie in paths" :key="serie.key">
          <path :d="serie.d" class="chart__path" :style="{ stroke: `var(--${serie.color})` }" />
          <circle
            v-if="hover !== null && serie.values[hover] !== null && serie.values[hover] !== undefined"
            :cx="x(hover)"
            :cy="y(serie.values[hover] as number)"
            r="4.5"
            class="chart__dot"
            :style="{ fill: `var(--${serie.color})` }"
          />
          <template v-if="serie.last && hover === null">
            <circle :cx="serie.last.x" :cy="serie.last.y" r="4" class="chart__dot" :style="{ fill: `var(--${serie.color})` }" />
            <text :x="serie.last.x + 8" :y="serie.last.y + 4" class="chart__direct">{{ format(serie.last.value) }}</text>
          </template>
        </g>
      </svg>
      <div v-if="hover !== null" class="chart__tooltip" :class="{ 'is-left': tooltipLeft > 60 }" :style="{ left: `${tooltipLeft}%` }" role="status">
        <div class="chart__tooltip-date">{{ dates[hover] }}</div>
        <div v-for="serie in series" :key="serie.key" class="chart__tooltip-row">
          <i class="chart__line" :style="{ background: `var(--${serie.color})` }"></i>
          <strong>{{ serie.values[hover] === null || serie.values[hover] === undefined ? '-' : format(serie.values[hover] as number) }}</strong>
          <span>{{ serie.label }}</span>
        </div>
        <div v-for="line in refLines || []" :key="`tt${line.label}`" class="chart__tooltip-row">
          <i class="chart__ref" :class="`gvt-${line.tone}`"></i>
          <strong>{{ format(line.value) }}</strong>
          <span>{{ line.label }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.chart { display: flex; flex-direction: column; gap: 8px; }
.chart__legend { display: flex; flex-wrap: wrap; gap: 4px 16px; font-size: 12px; color: var(--text-secondary); }
.chart__key { display: inline-flex; align-items: center; gap: 6px; }
.chart__line { display: inline-block; width: 14px; height: 2px; border-radius: 2px; }
.chart__ref { display: inline-block; width: 14px; height: 0; border-top: 2px dashed var(--text-secondary); }
.chart__ref.gvt-critical { border-top-color: var(--status-critical); }
.chart__plot { position: relative; }
.chart__plot svg { display: block; max-width: 100%; overflow: visible; outline: none; }
.chart__plot svg:focus-visible { outline: 2px solid var(--series-1); outline-offset: 4px; border-radius: 4px; }
.chart__grid line { stroke: var(--grid); stroke-width: 1; vector-effect: non-scaling-stroke; }
.chart__axis text { fill: var(--text-muted); font-size: 11px; font-variant-numeric: tabular-nums; }
.chart__path { fill: none; stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; vector-effect: non-scaling-stroke; }
.chart__dot { stroke: var(--surface-1); stroke-width: 2; }
.chart__direct { fill: var(--text-primary); font-size: 11.5px; font-weight: 600; font-variant-numeric: tabular-nums; }
.chart__refline { stroke: var(--text-secondary); stroke-width: 1.5; stroke-dasharray: 5 4; vector-effect: non-scaling-stroke; }
.chart__refline.gvt-critical { stroke: var(--status-critical); }
.chart__crosshair { stroke: var(--text-muted); stroke-width: 1; vector-effect: non-scaling-stroke; }
.chart__tooltip { position: absolute; top: 4px; transform: translateX(12px); min-width: 150px; padding: 8px 10px; border: 1px solid var(--grid); border-radius: 8px; background: var(--surface-1); box-shadow: 0 8px 24px rgba(0, 0, 0, .25); font-size: 12px; pointer-events: none; z-index: 2; }
.chart__tooltip.is-left { transform: translateX(calc(-100% - 12px)); }
.chart__tooltip-date { color: var(--text-muted); margin-bottom: 4px; }
.chart__tooltip-row { display: flex; align-items: center; gap: 6px; line-height: 1.7; }
.chart__tooltip-row strong { color: var(--text-primary); font-variant-numeric: tabular-nums; }
.chart__tooltip-row span { color: var(--text-secondary); }
</style>
