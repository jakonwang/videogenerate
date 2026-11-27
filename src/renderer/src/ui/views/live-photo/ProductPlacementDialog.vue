<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { FlipHorizontal, Maximize, Move, RotateCcw, X, ZoomIn } from 'lucide-vue-next'

/**
 * 「调整摆放」：在擦掉旧商品的参考图上摆真实商品（拖动改位置、拖右下角或滑块改大小、滑块改角度）。
 * 大小 100% = 和原商品一样大（主进程按原商品的框算好的默认摆放）。确认后从融合那步重做。
 */
type Placement = { cx: number; cy: number; width: number; rotation: number; squash?: number; flip?: boolean }
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
const draft = reactive<Required<Placement>>({ cx: 0.5, cy: 0.5, width: 0.1, rotation: 0, squash: 1, flip: false })
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
    Object.assign(draft, { cx: result.placement.cx, cy: result.placement.cy, width: result.placement.width, rotation: result.placement.rotation || 0, squash: result.placement.squash ?? 1, flip: Boolean(result.placement.flip) })
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
/**
 * 显示范围（占整张图的比例）。默认放大看商品附近：商品在整张图里往往只有几十个像素，不放大没法摆。
 */
const zoomed = ref(true)
const view = computed(() => {
  const d = data.value
  if (!d || !zoomed.value) return { x: 0, y: 0, w: 1, h: 1 }
  const W = d.sceneWidth
  const H = d.sceneHeight
  const r = d.region
  // 只按原商品的框和默认大小算，拖动、缩放时显示范围不跟着跳
  const productPx = d.defaultPlacement.width * W * Math.max(1, d.cutoutHeight / Math.max(1, d.cutoutWidth))
  const side = Math.min(W, H, Math.max(Math.max(r.width * W, r.height * H) * 6, productPx * 4, Math.min(W, H) * 0.3))
  const cx = (r.x + r.width / 2) * W
  const cy = (r.y + r.height / 2) * H
  const left = Math.min(W - side, Math.max(0, cx - side / 2))
  const top = Math.min(H - side, Math.max(0, cy - side / 2))
  return { x: left / W, y: top / H, w: side / W, h: side / H }
})
/** 整张图坐标 → 显示范围里的百分比 */
const vx = (x: number) => `${((x - view.value.x) / view.value.w) * 100}%`
const vy = (y: number) => `${((y - view.value.y) / view.value.h) * 100}%`
const sceneStyle = computed(() => ({
  left: vx(0),
  top: vy(0),
  width: `${100 / view.value.w}%`,
  height: `${100 / view.value.h}%`,
}))
const productStyle = computed(() => ({
  left: vx(draft.cx - draft.width / 2),
  top: vy(draft.cy - heightRatio.value / 2),
  width: `${(draft.width / view.value.w) * 100}%`,
  height: `${(heightRatio.value / view.value.h) * 100}%`,
  // 侧倾 = 横向压窄（高度不变），翻面 = 左右镜像；和主进程贴图的做法一致（先压窄、镜像，再旋转）
  transform: `rotate(${draft.rotation}deg) scaleX(${draft.squash * (draft.flip ? -1 : 1)})`,
}))
const regionStyle = computed(() => {
  const r = data.value?.region
  if (!r) return {}
  return { left: vx(r.x), top: vy(r.y), width: `${(r.width / view.value.w) * 100}%`, height: `${(r.height / view.value.h) * 100}%` }
})
const stageStyle = computed(() => {
  const d = data.value
  if (!d) return {}
  // 宽度按「高度不超过 66vh」算，显示比例和图一致（拖动坐标才准）
  const ratio = (view.value.w * d.sceneWidth) / Math.max(1, view.value.h * d.sceneHeight)
  return { aspectRatio: `${ratio.toFixed(4)}`, width: `min(100%, calc(66vh * ${ratio.toFixed(4)}))` }
})

const sizePercent = computed({
  get: () => Math.round((draft.width / Math.max(0.0001, data.value?.defaultPlacement.width || draft.width)) * 100),
  set: (value: number) => {
    const base = data.value?.defaultPlacement.width || draft.width
    draft.width = Math.min(1, Math.max(0.005, (base * Number(value)) / 100))
  },
})

let drag: { mode: 'move' | 'resize'; startX: number; startY: number; start: Placement; startDist: number } | null = null

/** 鼠标位置 → 整张图坐标；pxPerX / pxPerY：整张图坐标 1 对应屏幕多少像素 */
function pointerRatio(event: PointerEvent) {
  const rect = stage.value!.getBoundingClientRect()
  const v = view.value
  return {
    x: v.x + ((event.clientX - rect.left) / rect.width) * v.w,
    y: v.y + ((event.clientY - rect.top) / rect.height) * v.h,
    pxPerX: rect.width / v.w,
    pxPerY: rect.height / v.h,
  }
}

function beginDrag(event: PointerEvent, mode: 'move' | 'resize') {
  if (!stage.value || busy.value) return
  const point = pointerRatio(event)
  const dx = (point.x - draft.cx) * point.pxPerX
  const dy = (point.y - draft.cy) * point.pxPerY
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
  const dx = (point.x - drag.start.cx) * point.pxPerX
  const dy = (point.y - drag.start.cy) * point.pxPerY
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
  Object.assign(draft, { squash: 1, flip: false, ...d.defaultPlacement })
}

async function confirm() {
  if (!data.value || busy.value) return
  busy.value = true
  try {
    const item = await (window as any).api.livePhoto.confirmPlacement({ id: props.itemId, placement: { cx: draft.cx, cy: draft.cy, width: draft.width, rotation: draft.rotation, squash: draft.squash, flip: draft.flip } })
    emit('confirmed', item)
  } catch (error: any) {
    loadError.value = error?.message ?? String(error)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="ppd vg-scope" data-testid="live-photo-placement-dialog" @click.self="!busy && emit('close')">
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
            <img class="ppd__scene" :style="sceneStyle" :src="previewSrc(data.erasedScenePath)" alt="" draggable="false" />
            <span class="ppd__region" :style="regionStyle" title="原商品的位置" />
            <div class="ppd__product" :style="productStyle" data-testid="live-photo-placement-product" @pointerdown.prevent="beginDrag($event, 'move')">
              <img :src="previewSrc(data.cutoutPath)" alt="" draggable="false" />
              <span class="ppd__handle" title="拖动改大小" @pointerdown.stop.prevent="beginDrag($event, 'resize')" />
            </div>
          </div>
        </div>

        <aside class="ppd__side">
          <p class="ppd__tip"><Move :size="14" />拖动商品改位置，拖右下角改大小。虚线框是原商品的位置。</p>
          <div class="ppd__view" role="group" aria-label="显示范围">
            <button type="button" :class="{ 'is-on': zoomed }" @click="zoomed = true"><ZoomIn :size="13" />放大看</button>
            <button type="button" :class="{ 'is-on': !zoomed }" @click="zoomed = false"><Maximize :size="13" />看全图</button>
          </div>

          <label class="ppd__field">
            <span>大小 <em>{{ sizePercent }}%</em></span>
            <input v-model.number="sizePercent" type="range" min="20" max="300" step="1" data-testid="live-photo-placement-size" />
            <small>100% = 和原商品一样大</small>
          </label>

          <label class="ppd__field">
            <span>角度 <em>{{ Math.round(draft.rotation) }}°</em></span>
            <input v-model.number="draft.rotation" type="range" min="-90" max="90" step="1" />
          </label>

          <label class="ppd__field">
            <span>侧倾 <em>{{ Math.round(draft.squash * 100) }}%</em></span>
            <input v-model.number="draft.squash" type="range" min="0.2" max="1" step="0.01" data-testid="live-photo-placement-squash" />
            <small>往左拉，商品像侧过来、斜过来（适合手里捏着、侧躺的商品）</small>
          </label>

          <button class="vg-btn vg-btn--sm" type="button" :class="{ 'is-on': draft.flip }" :disabled="busy" data-testid="live-photo-placement-flip" @click="draft.flip = !draft.flip"><FlipHorizontal :size="13" />{{ draft.flip ? '已翻面（左右镜像）' : '翻面（左右镜像）' }}</button>

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
.ppd__scene { position: absolute; max-width: none; object-fit: fill; pointer-events: none; }
.ppd__region { position: absolute; border: 1.5px dashed color-mix(in srgb, var(--vg-accent) 80%, transparent); border-radius: 4px; pointer-events: none; }
.ppd__product { position: absolute; cursor: move; outline: 1px solid color-mix(in srgb, var(--vg-accent) 70%, transparent); outline-offset: 2px; transform-origin: center; }
.ppd__product img { width: 100%; height: 100%; object-fit: fill; pointer-events: none; }
.ppd__handle { position: absolute; right: -5px; bottom: -5px; width: 9px; height: 9px; border: 1.5px solid var(--vg-accent); border-radius: 50%; background: transparent; cursor: nwse-resize; }
.ppd__view { display: inline-flex; align-self: flex-start; padding: 2px; border: 1px solid var(--theme-border); border-radius: 8px; }
.ppd__view button { display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; border: 0; border-radius: 6px; background: transparent; color: var(--theme-text-secondary); font-size: 12px; cursor: pointer; }
.ppd__view button.is-on { background: var(--vg-accent-soft); color: var(--vg-accent); }
.ppd__side { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
.ppd__tip { display: flex; gap: 6px; align-items: flex-start; margin: 0; font-size: 12.5px; line-height: 1.5; color: var(--theme-text-secondary); }
.ppd__tip svg { flex-shrink: 0; margin-top: 2px; color: var(--vg-accent); }
.ppd__field { display: grid; gap: 6px; font-size: 13px; color: var(--theme-text-secondary); }
.ppd__field em { font-style: normal; color: var(--theme-text); font-variant-numeric: tabular-nums; margin-left: 4px; }
.ppd__field small { font-size: 11.5px; color: var(--theme-text-muted); }
.ppd__field input[type='range'] { width: 100%; accent-color: var(--vg-accent); }
.ppd__side .vg-btn.is-on { border-color: var(--vg-accent); color: var(--vg-accent); background: var(--vg-accent-soft); }
.ppd__note { margin: auto 0 0; font-size: 12px; color: var(--theme-text-muted); }
.ppd__actions { display: flex; justify-content: flex-end; gap: 8px; }
@media (max-width: 760px) { .ppd__body { grid-template-columns: 1fr; } }
</style>
