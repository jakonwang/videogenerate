<script setup lang="ts">
/** Compare the reference with the product-swapped picture before Muse quota is spent; redraw the region if needed. */
import { m } from './museText'
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { Check, RefreshCcw, ScanLine, X } from 'lucide-vue-next'
import type { MuseJob } from '../../../../../main/modules/muse-creative-studio/types'

type Region = { x: number; y: number; width: number; height: number }
type Drag = { mode: 'draw' | 'move' | 'nw' | 'ne' | 'sw' | 'se'; x: number; y: number; from: Region }

const props = defineProps<{ job: MuseJob | null; title: string; busy?: boolean }>()
const emit = defineEmits<{ close: []; approve: []; redo: [region: Region | undefined, closing: boolean] }>()

const MIN = 0.02
const editing = ref(false)
const asking = ref(false)
const closing = ref(false)
const source = computed(() => (closing.value ? props.job?.lastFrameSourcePath : props.job?.imagePath))
const prepared = computed(() => (closing.value ? props.job?.preparedLastFramePath : props.job?.preparedImagePath))
const stage = ref<HTMLElement | null>(null)
const region = reactive<Region>({ x: 0.25, y: 0.25, width: 0.5, height: 0.5 })
let drag: Drag | null = null

watch(() => props.job?.id, () => { closing.value = false })
watch([() => props.job?.id, closing], () => {
  const saved = closing.value ? props.job?.image?.lastRegion : props.job?.image?.region
  Object.assign(region, saved ? { x: saved.x, y: saved.y, width: saved.width, height: saved.height } : { x: 0.25, y: 0.25, width: 0.5, height: 0.5 })
  editing.value = Boolean(props.job && !prepared.value)
  asking.value = false
}, { immediate: true })

const src = (path?: string) => (path ? `vg://file?path=${encodeURIComponent(path)}` : '')
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

function point(event: PointerEvent) {
  const box = stage.value!.getBoundingClientRect()
  return { x: clamp((event.clientX - box.left) / Math.max(1, box.width), 0, 1), y: clamp((event.clientY - box.top) / Math.max(1, box.height), 0, 1) }
}

function begin(event: PointerEvent, mode: Drag['mode']) {
  const at = point(event)
  stage.value?.setPointerCapture(event.pointerId)
  drag = { mode, ...at, from: { ...region } }
}

function move(event: PointerEvent) {
  if (!drag) return
  const at = point(event)
  const { from, mode } = drag
  const dx = at.x - drag.x
  const dy = at.y - drag.y
  if (mode === 'move') {
    Object.assign(region, { x: clamp(from.x + dx, 0, 1 - from.width), y: clamp(from.y + dy, 0, 1 - from.height) })
    return
  }
  let [left, top, right, bottom] = mode === 'draw'
    ? [Math.min(drag.x, at.x), Math.min(drag.y, at.y), Math.max(drag.x, at.x), Math.max(drag.y, at.y)]
    : [from.x, from.y, from.x + from.width, from.y + from.height]
  if (mode === 'nw' || mode === 'sw') left = clamp(left + dx, 0, right - MIN)
  if (mode === 'ne' || mode === 'se') right = clamp(right + dx, left + MIN, 1)
  if (mode === 'nw' || mode === 'ne') top = clamp(top + dy, 0, bottom - MIN)
  if (mode === 'sw' || mode === 'se') bottom = clamp(bottom + dy, top + MIN, 1)
  // A drawn box needs a minimum size that still fits inside the picture.
  left = Math.min(left, 1 - MIN)
  top = Math.min(top, 1 - MIN)
  Object.assign(region, { x: left, y: top, width: Math.max(MIN, right - left), height: Math.max(MIN, bottom - top) })
}

function end(event: PointerEvent) {
  drag = null
  if (stage.value?.hasPointerCapture(event.pointerId)) stage.value.releasePointerCapture(event.pointerId)
}

function redo() {
  asking.value = false
  emit('redo', editing.value ? { ...region } : undefined, closing.value)
}

const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && props.job) emit('close') }
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div v-if="job" class="vg-scope vg-backdrop" data-testid="muse-review" @click.self="emit('close')">
    <section class="vg-dialog vg-dialog--xl" role="dialog" aria-modal="true" aria-labelledby="mr-title">
      <header class="vg-dialog__head">
        <div class="vg-dialog__title"><span class="vg-dialog__title-icon"><ScanLine :size="20" /></span><div><h2 id="mr-title">{{ m('确认换图 ·') }} {{ title }}</h2><p>{{ m('检查商品的颜色、形状、数量和细节。通过后才会发给 Muse 生成视频。') }}</p></div></div>
        <button class="vg-icon-btn" type="button" :aria-label="m('关闭')" @click="emit('close')"><X :size="18" /></button>
      </header>
      <div class="vg-dialog__body">
        <p v-if="job.error" class="vg-notice vg-notice--warning">{{ m(job.error) }}</p>
        <div v-if="job.lastFrameSourcePath" class="ts-seg mr__frames" role="group" :aria-label="m('首尾帧')">
          <button type="button" :class="{ 'is-on': !closing }" @click="closing = false">{{ m('首帧') }}</button>
          <button type="button" :class="{ 'is-on': closing }" :disabled="!job.preparedImagePath" data-testid="muse-review-closing" @click="closing = true">{{ m('尾帧') }}{{ job.preparedLastFramePath ? '' : m('（用首帧放大）') }}</button>
        </div>
        <div class="mr__pair">
          <figure>
            <figcaption>{{ m('参考图') }}{{ editing ? m('：拖动框选要替换的商品') : '' }}</figcaption>
            <div ref="stage" class="mr__stage" :class="{ 'is-editing': editing }" data-testid="muse-region" @pointerdown.self="editing && begin($event, 'draw')" @pointermove="move" @pointerup="end" @pointercancel="end">
              <img :src="src(source)" :alt="m('参考图')" draggable="false" />
              <div v-if="editing" class="mr__box" :style="{ left: `${region.x * 100}%`, top: `${region.y * 100}%`, width: `${region.width * 100}%`, height: `${region.height * 100}%` }" @pointerdown.stop="begin($event, 'move')">
                <span v-for="corner in (['nw', 'ne', 'sw', 'se'] as const)" :key="corner" :class="`is-${corner}`" @pointerdown.stop="begin($event, corner)" />
              </div>
            </div>
          </figure>
          <figure>
            <figcaption>{{ m('换图结果') }}{{ !closing && job.image?.attempts ? m(' · 第 {0} 次', job.image.attempts) : '' }}</figcaption>
            <div class="mr__stage"><img v-if="prepared" :src="src(prepared)" :alt="m('换图结果')" /><div v-else class="mr__none">{{ m('还没有换图结果') }}</div></div>
          </figure>
        </div>
      </div>
      <footer class="vg-dialog__foot">
        <button class="vg-btn vg-btn--ghost" type="button" @click="editing = !editing"><ScanLine :size="14" />{{ editing ? m('取消框选') : m('框选区域') }}</button>
        <div class="vg-dialog__foot-actions">
          <template v-if="asking">
            <span class="vg-muted">{{ m('会调用图片模型并产生费用') }}</span>
            <button class="vg-btn" type="button" @click="asking = false">{{ m('取消') }}</button>
            <button class="vg-btn vg-btn--primary" type="button" :disabled="busy" data-testid="muse-redo-confirm" @click="redo">{{ m('确定换图') }}</button>
          </template>
          <template v-else>
            <button class="vg-btn" type="button" :disabled="busy" data-testid="muse-redo" @click="asking = true"><RefreshCcw :size="14" />{{ editing ? m('按框选重新换图') : m('重新换图') }}</button>
            <button class="vg-btn vg-btn--primary" type="button" :disabled="busy || !job.preparedImagePath" data-testid="muse-approve" @click="emit('approve')"><Check :size="14" />{{ m('通过，生成视频') }}</button>
          </template>
        </div>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.mr__frames { width: fit-content; }
.mr__pair { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; margin-top: 12px; }
.mr__pair figure { display: flex; flex-direction: column; align-items: center; gap: 8px; margin: 0; min-width: 0; }
.mr__pair figcaption { align-self: flex-start; font-size: 12.5px; color: var(--theme-text-muted); }
.mr__stage { position: relative; width: fit-content; max-width: 100%; overflow: hidden; border: 1px solid var(--theme-border); border-radius: 12px; touch-action: none; user-select: none; }
.mr__stage.is-editing { cursor: crosshair; }
.mr__stage img { display: block; max-width: 100%; max-height: min(56vh, 600px); pointer-events: none; }
.mr__none { display: grid; place-items: center; width: 260px; height: 320px; color: var(--theme-text-muted); font-size: 13px; }
.mr__box { position: absolute; border: 2px solid var(--vg-accent); box-shadow: 0 0 0 9999px rgba(5, 8, 16, .46); cursor: move; }
.mr__box span { position: absolute; width: 14px; height: 14px; border: 2px solid #fff; border-radius: 50%; background: var(--vg-accent); }
.mr__box .is-nw { left: -8px; top: -8px; cursor: nwse-resize; }
.mr__box .is-ne { right: -8px; top: -8px; cursor: nesw-resize; }
.mr__box .is-sw { left: -8px; bottom: -8px; cursor: nesw-resize; }
.mr__box .is-se { right: -8px; bottom: -8px; cursor: nwse-resize; }
@media (max-width: 800px) { .mr__pair { grid-template-columns: minmax(0, 1fr); } }
</style>
