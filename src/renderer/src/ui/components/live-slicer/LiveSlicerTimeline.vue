<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { energyPeaks, formatTime, type LiveSegment } from './segmentEngine'

const props = defineProps<{
  duration: number
  energy: number[]
  scenes: Array<[number, number]>
  segments: LiveSegment[]
  activeId: string
  currentTime: number
  inPoint: number | null
  outPoint: number | null
  zoom: number
  playing: boolean
}>()

const emit = defineEmits<{
  (e: 'seek', t: number): void
  (e: 'select', id: string): void
  (e: 'update', id: string, range: { start: number; end: number }): void
}>()

const scrollEl = ref<HTMLDivElement | null>(null)
const viewWidth = ref(800)
let observer: ResizeObserver | null = null

const WAVE_H = 72
const canvasWidth = computed(() => Math.max(200, Math.round(viewWidth.value * Math.max(1, props.zoom))))
const pps = computed(() => (props.duration > 0 ? canvasWidth.value / props.duration : 0))
const x = (t: number) => t * pps.value

const peaks = computed(() => energyPeaks(props.energy, Math.max(1, Math.round(canvasWidth.value / 3))))
const wavePath = computed(() => {
  const list = peaks.value
  if (!props.energy.length || !list.length) return ''
  const w = canvasWidth.value / list.length
  const mid = WAVE_H / 2
  let top = `M0 ${mid}`
  let bottom = ''
  list.forEach((v, i) => {
    const h = Math.max(0.6, v * (mid - 3))
    top += ` L${(i * w + w / 2).toFixed(1)} ${(mid - h).toFixed(1)}`
    bottom = ` L${(i * w + w / 2).toFixed(1)} ${(mid + h).toFixed(1)}` + bottom
  })
  return `${top} L${canvasWidth.value} ${mid}${bottom} Z`
})

const ticks = computed(() => {
  if (!pps.value) return [] as Array<{ t: number; major: boolean }>
  const steps = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600]
  const minor = steps.find((s) => s * pps.value >= 14) ?? 3600
  const major = steps.find((s) => s >= minor * 4 && s * pps.value >= 80) ?? minor * 5
  const out: Array<{ t: number; major: boolean }> = []
  for (let t = 0; t <= props.duration; t += minor) out.push({ t, major: Math.round(t) % major === 0 })
  return out
})

const sceneMarks = computed(() => props.scenes.filter(([, s]) => s >= 0.3).map(([t, s]) => ({ t, s })))

// ---------- pointer interactions ----------
type Drag =
  | { kind: 'scrub' }
  | { kind: 'start' | 'end' | 'move'; id: string; originX: number; start: number; end: number; moved: boolean }
let drag: Drag | null = null

function timeAt(clientX: number) {
  const el = scrollEl.value
  if (!el || !pps.value) return 0
  const rect = el.getBoundingClientRect()
  const t = (clientX - rect.left + el.scrollLeft) / pps.value
  return Math.max(0, Math.min(props.duration, t))
}

function onTrackDown(e: PointerEvent) {
  if (e.button !== 0) return
  drag = { kind: 'scrub' }
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  emit('seek', timeAt(e.clientX))
}

function onSegDown(e: PointerEvent, seg: LiveSegment, kind: 'start' | 'end' | 'move') {
  if (e.button !== 0) return
  e.stopPropagation()
  drag = { kind, id: seg.id, originX: e.clientX, start: seg.start, end: seg.end, moved: false }
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  emit('select', seg.id)
}

function onPointerMove(e: PointerEvent) {
  if (!drag) return
  if (drag.kind === 'scrub') {
    emit('seek', timeAt(e.clientX))
    return
  }
  const dt = (e.clientX - drag.originX) / (pps.value || 1)
  if (Math.abs(e.clientX - drag.originX) > 2) drag.moved = true
  if (!drag.moved) return
  const minLen = 0.5
  let { start, end } = drag
  if (drag.kind === 'start') start = Math.max(0, Math.min(end - minLen, start + dt))
  else if (drag.kind === 'end') end = Math.min(props.duration, Math.max(start + minLen, end + dt))
  else {
    const len = end - start
    start = Math.max(0, Math.min(props.duration - len, start + dt))
    end = start + len
  }
  emit('update', drag.id, { start: Math.round(start * 10) / 10, end: Math.round(end * 10) / 10 })
  emit('seek', drag.kind === 'end' ? end : start)
}

function onPointerUp() {
  if (drag && drag.kind !== 'scrub' && !drag.moved) emit('seek', drag.start)
  drag = null
}

// keep the playhead in view while playing on a zoomed timeline
watch(
  () => props.currentTime,
  (t) => {
    const el = scrollEl.value
    if (!el || !props.playing || props.zoom <= 1 || drag) return
    const px = x(t)
    if (px < el.scrollLeft || px > el.scrollLeft + el.clientWidth - 40) el.scrollLeft = Math.max(0, px - 60)
  },
)

// zoom around the playhead
watch(
  () => props.zoom,
  () => {
    requestAnimationFrame(() => {
      const el = scrollEl.value
      if (!el) return
      el.scrollLeft = Math.max(0, x(props.currentTime) - el.clientWidth / 2)
    })
  },
)

function scrollToTime(t: number) {
  const el = scrollEl.value
  if (!el) return
  const px = x(t)
  if (px < el.scrollLeft || px > el.scrollLeft + el.clientWidth - 20) el.scrollLeft = Math.max(0, px - el.clientWidth / 3)
}
defineExpose({ scrollToTime })

onMounted(() => {
  const el = scrollEl.value
  if (!el) return
  viewWidth.value = el.clientWidth || 800
  observer = new ResizeObserver(() => {
    viewWidth.value = el.clientWidth || viewWidth.value
  })
  observer.observe(el)
})
onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
  <div ref="scrollEl" class="ls-tl" data-testid="live-slicer-timeline">
    <div
      class="ls-tl__canvas"
      :style="{ width: `${canvasWidth}px` }"
      @pointerdown="onTrackDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
    >
      <div class="ls-tl__ruler">
        <span
          v-for="tick in ticks"
          :key="tick.t"
          class="ls-tl__tick"
          :class="{ 'is-major': tick.major }"
          :style="{ left: `${x(tick.t)}px` }"
        >
          <em v-if="tick.major">{{ formatTime(tick.t) }}</em>
        </span>
      </div>

      <div class="ls-tl__wave">
        <svg :width="canvasWidth" :height="WAVE_H" :viewBox="`0 0 ${canvasWidth} ${WAVE_H}`" preserveAspectRatio="none">
          <line x1="0" :x2="canvasWidth" :y1="WAVE_H / 2" :y2="WAVE_H / 2" class="ls-tl__axis" />
          <path v-if="wavePath" :d="wavePath" class="ls-tl__energy" />
        </svg>
        <span
          v-for="mark in sceneMarks"
          :key="`sc-${mark.t}`"
          class="ls-tl__scene"
          :style="{ left: `${x(mark.t)}px`, opacity: 0.35 + mark.s * 0.65 }"
        />
        <div
          v-if="inPoint != null"
          class="ls-tl__range"
          :style="{
            left: `${x(outPoint != null ? Math.min(inPoint, outPoint) : inPoint)}px`,
            width: `${outPoint != null ? Math.max(2, Math.abs(x(outPoint) - x(inPoint))) : 2}px`,
          }"
        />
      </div>

      <div class="ls-tl__clips">
        <div
          v-for="(seg, idx) in segments"
          :key="seg.id"
          class="ls-tl__clip"
          :class="{ 'is-active': seg.id === activeId, 'is-off': !seg.selected, 'is-manual': seg.origin === 'manual' }"
          :style="{ left: `${x(seg.start)}px`, width: `${Math.max(4, x(seg.end) - x(seg.start))}px` }"
          :title="`${seg.title} · ${formatTime(seg.start)} – ${formatTime(seg.end)}`"
          @pointerdown="onSegDown($event, seg, 'move')"
        >
          <span class="ls-tl__handle ls-tl__handle--l" @pointerdown="onSegDown($event, seg, 'start')" />
          <b>{{ idx + 1 }}</b>
          <span class="ls-tl__handle ls-tl__handle--r" @pointerdown="onSegDown($event, seg, 'end')" />
        </div>
      </div>

      <div class="ls-tl__playhead" :style="{ left: `${x(currentTime)}px` }"><i /></div>
    </div>
  </div>
</template>
