<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { Move, RotateCcw, X } from 'lucide-vue-next'

/**
 * 「调整摆放」：在擦掉旧商品的参考图上摆真实商品（拖动改位置、拖右下角或滑块改大小、滑块改角度）。
 * 大小 100% = 和原商品一样大（主进程按原商品的框算好的默认摆放）。确认后从融合那步重做。
 */
type Placement = { cx: number; cy: number; width: number; rotation: number }
type PlacementData = {
  ready: true
  erasedScenePath: string
  cutoutPath: string
  sceneWidth: number
  sceneHeight: number
  cutoutWidth: number
  cutoutHeight: number
  region: { x: number; y: number; width: number; height: number }
  placement: Placement & { confirmedAt?: number }
  defaultPlacement: Placement
}

const props = defineProps<{ itemId: string; title?: string; previewSrc: (path?: string) => string }>()
const emit = defineEmits<{ close: []; confirmed: [item: unknown] }>()

const data = ref<PlacementData | null>(null)
const loadError = ref('')
const busy = ref(false)
const draft = reactive<Placement>({ cx: 0.5, cy: 0.5, width: 0.1, rotation: 0 })
const stage = ref<HTMLElement | null>(null)

async function load() {
  data.value = null
  loadError.value = ''
  try {
    const result = await (window as any).api.livePhoto.getPlacement({ id: props.itemId })
    if (!result?.ready) {
      loadError.value = String(result?.message || '还没准备好，稍等一下再调整')
      return
    }
    data.value = result as PlacementData
    Object.assign(draft, { cx: result.placement.cx, cy: result.placement.cy, width: result.placement.width, rotation: result.placement.rotation || 0 })
  } catch (error: any) {
    loadError.value = error?.message ?? String(error)
  }
}
watch(() => props.itemId, () => void load(), { immediate: true })

/** 商品高度占整张图高度的比例（由宽度和抠图的长宽比算出） */
const heightRatio = computed(() => {
  const d = data.value
  if (!d) return 0
  return (draft.width * d.sceneWidth * (d.cutoutHeight / Math.max(1, d.cutoutWidth))) / Math.max(1, d.sceneHeight)
})
const productStyle = computed(() => ({
  left: `${(draft.cx - draft.width / 2) * 100}%`,
  top: `${(draft.cy - heightRatio.value / 2) * 100}%`,
  width: `${draft.width * 100}%`,
  height: `${heightRatio.value * 100}%`,
  transform: `rotate(${draft.rotation}deg)`,
}))
const regionStyle = computed(() => {
  const r = data.value?.region
  if (!r) return {}
  return { left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.width * 100}%`, height: `${r.height * 100}%` }
})
const stageStyle = computed(() => {
  const d = data.value
  // 宽度按「高度不超过 66vh」算，保证显示比例和原图一致（拖动坐标才准）
  return d ? { aspectRatio: `${d.sceneWidth} / ${d.sceneHeight}`, width: `min(100%, calc(66vh * ${(d.sceneWidth / Math.max(1, d.sceneHeight)).toFixed(4)}))` } : {}
})

const sizePercent = computed({
  get: () => Math.round((draft.width / Math.max(0.0001, data.value?.defaultPlacement.width || draft.width)) * 100),
  set: (value: number) => {
    const base = data.value?.defaultPlacement.width || draft.width
    draft.width = Math.min(1, Math.max(0.005, (base * Number(value)) / 100))
  },
})

let drag: { mode: 'move' | 'resize'; startX: number; startY: number; start: Placement; startDist: number } | null = null

function pointerRatio(event: PointerEvent) {
  const rect = stage.value!.getBoundingClientRect()
  return { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height, rect }
}

function beginDrag(event: PointerEvent, mode: 'move' | 'resize') {
  if (!stage.value || busy.value) return
  const point = pointerRatio(event)
  const dx = (point.x - draft.cx) * point.rect.width
  const dy = (point.y - draft.cy) * point.rect.height
  drag = { mode, startX: point.x, startY: point.y, start: { ...draft }, startDist: Math.max(4, Math.hypot(dx, dy)) }
  ;(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId)
  window.addEventListener('pointermove', onDrag)
  window.addEventListener('pointerup', endDrag, { once: true })
}

function onDrag(event: PointerEvent) {
  if (!drag || !stage.value) return
  const point = pointerRatio(event)
  if (drag.mode === 'move') {
    draft.cx = Math.min(1, Math.max(0, drag.start.cx + point.x - drag.startX))
    draft.cy = Math.min(1, Math.max(0, drag.start.cy + point.y - drag.startY))
    return
  }
  const dx = (point.x - drag.start.cx) * point.rect.width
  const dy = (point.y - drag.start.cy) * point.rect.height
  draft.width = Math.min(1, Math.max(0.005, drag.start.width * (Math.hypot(dx, dy) / drag.startDist)))
}

function endDrag() {
  drag = null
  window.removeEventListener('pointermove', onDrag)
}
onBeforeUnmount(endDrag)

function reset() {
  const d = data.value
  if (!d) return
  Object.assign(draft, { ...d.defaultPlacement })
}

async function confirm() {
  if (!data.value || busy.value) return
  busy.value = true
  try {
    const item = await (window as any).api.livePhoto.confirmPlacement({ id: props.itemId, placement: { ...draft } })
    emit('confirmed', item)
  } catch (error: any) {
    loadError.value = error?.message ?? String(error)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="ppd" data-testid="live-photo-placement-dialog" @click.self="!busy && emit('close')">
    <section class="ppd__panel" role="dialog" aria-modal="true" aria-label="调整商品摆放">
      <header class="ppd__head">
        <div>
          <strong>调整商品摆放</strong>
          <span v-if="title">{{ title }}</span>
        </div>
        <button class="vg-icon-btn" type="button" aria-label="关闭" :disabled="busy" @click="emit('close')"><X :size="16" /></button>
      </header>

      <p v-if="loadError" class="ppd__error">{{ loadError }}</p>
      <div v-else-if="!data" class="ppd__loading">正在读取…</div>

      <div v-else class="ppd__body">
        <div class="ppd__stage-wrap">
          <div ref="stage" class="ppd__stage" :style="stageStyle">
            <img class="ppd__scene" :src="previewSrc(data.erasedScenePath)" alt="" draggable="false" />
            <span class="ppd__region" :style="regionStyle" title="原商品的位置" />
            <div class="ppd__product" :style="productStyle" data-testid="live-photo-placement-product" @pointerdown.prevent="beginDrag($event, 'move')">
              <img :src="previewSrc(data.cutoutPath)" alt="" draggable="false" />
              <span class="ppd__handle" title="拖动改大小" @pointerdown.stop.prevent="beginDrag($event, 'resize')" />
            </div>
          </div>
        </div>

        <aside class="ppd__side">
          <p class="ppd__tip"><Move :size="14" />拖动商品改位置，拖右下角改大小。虚线框是原商品的位置。</p>

          <label class="ppd__field">
            <span>大小 <em>{{ sizePercent }}%</em></span>
            <input v-model.number="sizePercent" type="range" min="20" max="300" step="1" data-testid="live-photo-placement-size" />
            <small>100% = 和原商品一样大</small>
          </label>

          <label class="ppd__field">
            <span>角度 <em>{{ Math.round(draft.rotation) }}°</em></span>
            <input v-model.number="draft.rotation" type="range" min="-90" max="90" step="1" />
          </label>

          <button class="vg-btn vg-btn--sm" type="button" :disabled="busy" @click="reset"><RotateCcw :size="13" />还原自动摆放</button>

          <p class="ppd__note">确认后会重新融合并生成视频，商品本身不会变样。</p>
          <div class="ppd__actions">
            <button class="vg-btn" type="button" :disabled="busy" @click="emit('close')">取消</button>
            <button class="vg-btn vg-btn--primary" type="button" data-testid="live-photo-placement-confirm" :disabled="busy" @click="confirm">
              {{ busy ? '提交中…' : '确认并生成' }}
            </button>
          </div>
        </aside>
      </div>
    </section>
  </div>
</template>

<style scoped>
.ppd { position: fixed; inset: var(--app-titlebar-height, 62px) 0 0; z-index: 90; display: grid; place-items: center; padding: 24px; background: color-mix(in srgb, var(--theme-input) 78%, transparent); backdrop-filter: blur(10px); }
.ppd__panel { width: min(1040px, 100%); max-height: calc(100vh - var(--app-titlebar-height, 62px) - 48px); display: flex; flex-direction: column; gap: 14px; overflow: auto; padding: 18px; border: 1px solid var(--theme-border); border-radius: 14px; background: var(--theme-panel); }
.ppd__head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.ppd__head > div { display: grid; gap: 3px; }
.ppd__head strong { font-size: 16px; color: var(--theme-text); }
.ppd__head span { font-size: 12px; color: var(--theme-text-muted); }
.ppd__error { margin: 0; padding: 10px 12px; border-radius: 8px; background: color-mix(in srgb, var(--vg-amber) 12%, transparent); color: var(--vg-amber); font-size: 13px; }
.ppd__loading { padding: 40px; text-align: center; color: var(--theme-text-muted); font-size: 13px; }
.ppd__body { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(240px, 1fr); gap: 18px; min-height: 0; }
.ppd__stage-wrap { display: grid; place-items: center; min-width: 0; border-radius: 10px; background: var(--theme-panel-soft); padding: 8px; }
.ppd__stage { position: relative; overflow: hidden; border-radius: 8px; user-select: none; touch-action: none; }
.ppd__scene { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: fill; pointer-events: none; }
.ppd__region { position: absolute; border: 1.5px dashed color-mix(in srgb, var(--vg-accent) 80%, transparent); border-radius: 4px; pointer-events: none; }
.ppd__product { position: absolute; cursor: move; outline: 1px solid color-mix(in srgb, var(--vg-accent) 70%, transparent); outline-offset: 2px; transform-origin: center; }
.ppd__product img { width: 100%; height: 100%; object-fit: fill; pointer-events: none; }
.ppd__handle { position: absolute; right: -7px; bottom: -7px; width: 12px; height: 12px; border: 1.5px solid var(--vg-accent); border-radius: 3px; background: var(--theme-panel); cursor: nwse-resize; }
.ppd__side { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
.ppd__tip { display: flex; gap: 6px; align-items: flex-start; margin: 0; font-size: 12.5px; line-height: 1.5; color: var(--theme-text-secondary); }
.ppd__tip svg { flex-shrink: 0; margin-top: 2px; color: var(--vg-accent); }
.ppd__field { display: grid; gap: 6px; font-size: 13px; color: var(--theme-text-secondary); }
.ppd__field em { font-style: normal; color: var(--theme-text); font-variant-numeric: tabular-nums; margin-left: 4px; }
.ppd__field small { font-size: 11.5px; color: var(--theme-text-muted); }
.ppd__field input[type='range'] { width: 100%; accent-color: var(--vg-accent); }
.ppd__note { margin: auto 0 0; font-size: 12px; color: var(--theme-text-muted); }
.ppd__actions { display: flex; justify-content: flex-end; gap: 8px; }
@media (max-width: 760px) { .ppd__body { grid-template-columns: 1fr; } }
</style>
