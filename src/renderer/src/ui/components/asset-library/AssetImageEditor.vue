<script setup lang="ts">
import { ref } from 'vue'
import { Pencil, X } from 'lucide-vue-next'
import type { LibraryAsset } from '../../../../../shared/assetLibrary'

const props = defineProps<{ asset: LibraryAsset }>()
const emit = defineEmits<{ close: []; saved: [id: string] }>()

type Mode = 'resize' | 'crop' | 'watermark'
const mode = ref<Mode>('resize')
const busy = ref(false)
const error = ref('')
const form = ref({ left: 0, top: 0, width: 1000, height: 1000, blur: 18, resizeWidth: 1080, resizeHeight: 1080 })
const cropStage = ref<HTMLElement | null>(null)
const cropImage = ref<HTMLImageElement | null>(null)
const natural = ref({ width: 1, height: 1 })
const selection = ref({ left: 0.1, top: 0.1, width: 0.8, height: 0.8 })
const dragging = ref(false)
const dragStart = ref({ x: 0, y: 0 })
const src = `vg://file?path=${encodeURIComponent(props.asset.filePath)}`

function close() { if (!busy.value) emit('close') }

function syncSelectionForm() {
  const sel = selection.value
  const stageRect = cropStage.value?.getBoundingClientRect()
  const imageRect = cropImage.value?.getBoundingClientRect()
  if (!stageRect || !imageRect || !imageRect.width || !imageRect.height) return
  const imageLeft = (imageRect.left - stageRect.left) / stageRect.width
  const imageTop = (imageRect.top - stageRect.top) / stageRect.height
  const imageWidth = imageRect.width / stageRect.width
  const imageHeight = imageRect.height / stageRect.height
  const left = Math.max(0, Math.min(1, (sel.left - imageLeft) / imageWidth))
  const top = Math.max(0, Math.min(1, (sel.top - imageTop) / imageHeight))
  const right = Math.max(left, Math.min(1, (sel.left + sel.width - imageLeft) / imageWidth))
  const bottom = Math.max(top, Math.min(1, (sel.top + sel.height - imageTop) / imageHeight))
  form.value.left = Math.round(left * natural.value.width)
  form.value.top = Math.round(top * natural.value.height)
  form.value.width = Math.max(1, Math.round((right - left) * natural.value.width))
  form.value.height = Math.max(1, Math.round((bottom - top) * natural.value.height))
}

function onImageLoad() {
  if (!cropImage.value) return
  natural.value = { width: cropImage.value.naturalWidth || 1, height: cropImage.value.naturalHeight || 1 }
  syncSelectionForm()
}

function selectMode(next: Mode) {
  mode.value = next
  if (next === 'crop') selection.value = { left: 0.1, top: 0.1, width: 0.8, height: 0.8 }
  if (next === 'watermark') selection.value = { left: 0.6, top: 0.72, width: 0.3, height: 0.18 }
}

function pointFor(event: PointerEvent) {
  const stageRect = cropStage.value?.getBoundingClientRect()
  const imageRect = cropImage.value?.getBoundingClientRect()
  if (!stageRect || !imageRect) return { x: 0, y: 0 }
  // Normalize against the rendered image so letterboxing cannot skew source pixels.
  const imageX = Math.max(0, Math.min(imageRect.width, event.clientX - imageRect.left))
  const imageY = Math.max(0, Math.min(imageRect.height, event.clientY - imageRect.top))
  const x = (imageRect.left - stageRect.left + imageX) / stageRect.width
  const y = (imageRect.top - stageRect.top + imageY) / stageRect.height
  return { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) }
}

function startDrag(event: PointerEvent) {
  if (!cropStage.value) return
  dragging.value = true
  dragStart.value = pointFor(event)
  selection.value = { left: dragStart.value.x, top: dragStart.value.y, width: 0, height: 0 }
  cropStage.value.setPointerCapture(event.pointerId)
}

function moveDrag(event: PointerEvent) {
  if (!dragging.value) return
  const point = pointFor(event)
  selection.value = {
    left: Math.min(dragStart.value.x, point.x),
    top: Math.min(dragStart.value.y, point.y),
    width: Math.max(0.01, Math.abs(point.x - dragStart.value.x)),
    height: Math.max(0.01, Math.abs(point.y - dragStart.value.y)),
  }
  syncSelectionForm()
}

function endDrag() { dragging.value = false }

async function save() {
  busy.value = true
  error.value = ''
  try {
    if (mode.value !== 'resize') syncSelectionForm()
    const f = form.value
    const input = mode.value === 'crop'
      ? { crop: { left: f.left, top: f.top, width: f.width, height: f.height } }
      : mode.value === 'watermark'
        ? { removeWatermark: { left: f.left, top: f.top, width: f.width, height: f.height, blur: f.blur } }
        : { resize: { width: f.resizeWidth, height: f.resizeHeight, fit: 'contain' as const } }
    await window.api.assetLibrary.editImage({ id: props.asset.id, input })
    emit('saved', props.asset.id)
  } catch (cause) { error.value = cause instanceof Error ? cause.message : String(cause) }
  finally { busy.value = false }
}
</script>

<template>
  <div class="vg-backdrop" @click.self="close">
    <section class="asset-editor" role="dialog" aria-modal="true" aria-label="编辑图片">
      <button class="asset-modal-close" type="button" aria-label="关闭" @click="close"><X :size="18" /></button>
      <div class="asset-editor-head"><Pencil :size="18" /><div><h2>编辑原图</h2><p :title="asset.name">{{ asset.name }}</p></div></div>
      <div class="asset-editor-tabs">
        <button type="button" :class="{ active: mode === 'resize' }" @click="selectMode('resize')">修改尺寸</button>
        <button type="button" :class="{ active: mode === 'crop' }" @click="selectMode('crop')">裁剪</button>
        <button type="button" :class="{ active: mode === 'watermark' }" @click="selectMode('watermark')">去水印</button>
      </div>
      <div v-if="mode === 'resize'" class="asset-editor-fields">
        <label>宽度<input v-model.number="form.resizeWidth" class="vg-input" type="number" min="1" max="12000" /></label>
        <label>高度<input v-model.number="form.resizeHeight" class="vg-input" type="number" min="1" max="12000" /></label>
        <small>保持原图比例适配到指定尺寸，结果会覆盖当前图片。</small>
      </div>
      <div v-else class="asset-editor-fields asset-editor-fields--stage">
        <div ref="cropStage" class="crop-stage" @pointerdown="startDrag" @pointermove="moveDrag" @pointerup="endDrag" @pointercancel="endDrag">
          <img ref="cropImage" :src="src" :alt="mode === 'crop' ? '裁剪预览' : '去水印预览'" @load="onImageLoad" />
          <div class="crop-selection" :class="{ 'crop-selection--watermark': mode === 'watermark' }" :style="{ left: `${selection.left * 100}%`, top: `${selection.top * 100}%`, width: `${selection.width * 100}%`, height: `${selection.height * 100}%` }">
            <span>{{ mode === 'crop' ? '拖拽选择区域' : '拖拽选择水印区域' }}</span>
          </div>
        </div>
        <div class="crop-readout"><template v-if="mode === 'watermark'">水印区域 </template>{{ form.width }} × {{ form.height }} px</div>
        <label v-if="mode === 'watermark'">模糊强度<input v-model.number="form.blur" class="vg-input" type="number" min="1" max="100" /></label>
        <small v-if="mode === 'crop'">直接在图片上拖拽选择裁剪区域，坐标会自动换算为原图像素。</small>
        <small v-else>直接在图片上框选水印区域，保存后使用局部模糊覆盖原图。</small>
      </div>
      <p v-if="error" class="asset-editor-error">{{ error }}</p>
      <footer class="asset-editor-footer">
        <span>保存后覆盖本地原图，并更新云端版本</span>
        <button type="button" class="vg-btn" :disabled="busy" @click="close">取消</button>
        <button type="button" class="vg-btn vg-btn--primary" :disabled="busy" @click="save">{{ busy ? '处理中…' : '保存覆盖' }}</button>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.asset-editor { position: relative; display: flex; flex-direction: column; gap: 14px; width: min(600px, calc(100vw - 40px)); max-height: 92vh; padding: 22px; overflow-y: auto; border: 1px solid var(--theme-border-control); border-radius: var(--vg-radius-lg); background: var(--theme-panel); color: var(--theme-text); box-shadow: var(--theme-shadow-dialog); }
.asset-modal-close { position: absolute; top: 12px; right: 12px; display: grid; place-items: center; width: 30px; height: 30px; padding: 0; border: 0; border-radius: 7px; background: transparent; color: var(--theme-text-muted); cursor: pointer; }
.asset-modal-close:hover { background: var(--theme-panel-soft); color: var(--theme-text); }
.asset-editor-head { display: flex; align-items: center; gap: 12px; min-width: 0; padding-right: 32px; }
.asset-editor-head > svg { width: 40px; height: 40px; padding: 10px; border-radius: 10px; background: var(--vg-accent-soft); border: 1px solid var(--vg-accent-line); color: var(--vg-accent); flex-shrink: 0; }
.asset-editor-head > div { min-width: 0; }
.asset-editor-head h2 { font-size: 18px; font-weight: 800; }
.asset-editor-head p { font-size: 12px; color: var(--theme-text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.asset-editor-tabs { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 2px; padding: 3px; border: 1px solid var(--theme-border); border-radius: var(--vg-radius-sm); background: var(--theme-panel-soft); }
.asset-editor-tabs button { height: 30px; border: 0; border-radius: 6px; background: transparent; color: var(--theme-text-secondary); font-size: 13px; cursor: pointer; }
.asset-editor-tabs button.active { background: var(--theme-panel); color: var(--vg-accent); font-weight: 600; box-shadow: 0 1px 2px color-mix(in srgb, var(--theme-root) 40%, transparent); }
.asset-editor-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; min-width: 0; }
.asset-editor-fields--stage { grid-template-columns: 1fr; }
.asset-editor-fields label { display: flex; flex-direction: column; gap: 6px; min-width: 0; font-size: 13px; font-weight: 600; }
.asset-editor-fields small { grid-column: 1 / -1; font-size: 12px; color: var(--theme-text-muted); }
.crop-stage { position: relative; justify-self: center; width: fit-content; max-width: 100%; overflow: hidden; border-radius: 7px; background: var(--theme-root); cursor: crosshair; touch-action: none; }
.crop-stage img { display: block; width: auto; max-width: 100%; max-height: 52vh; border-radius: 0; user-select: none; pointer-events: none; }
.crop-selection { position: absolute; border: 2px solid var(--vg-accent); background: color-mix(in srgb, var(--vg-accent) 16%, transparent); box-shadow: 0 0 0 9999px rgba(0, 0, 0, .45); }
.crop-selection span { position: absolute; left: 6px; top: 6px; padding: 2px 6px; border-radius: 4px; background: var(--vg-accent); color: var(--theme-on-accent); font-size: 11px; white-space: nowrap; }
.crop-selection--watermark { border-color: var(--vg-amber); background: color-mix(in srgb, var(--vg-amber) 16%, transparent); }
.crop-selection--watermark span { background: var(--vg-amber); }
.crop-readout { justify-self: center; font-size: 12px; color: var(--theme-text-secondary); font-variant-numeric: tabular-nums; }
.asset-editor-error { padding: 9px 12px; border: 1px solid color-mix(in srgb, var(--vg-red) 45%, transparent); border-radius: var(--vg-radius-sm); background: color-mix(in srgb, var(--vg-red) 8%, transparent); color: var(--vg-red); font-size: 12px; }
.asset-editor-footer { display: flex; align-items: center; gap: 10px; padding-top: 12px; border-top: 1px solid var(--theme-divider); }
.asset-editor-footer span { margin-right: auto; font-size: 12px; color: var(--theme-text-muted); }
</style>
