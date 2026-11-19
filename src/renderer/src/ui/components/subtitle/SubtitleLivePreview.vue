<script setup lang="ts">
/**
 * 标题字幕实时预览：9:16 画面上直接画标题（和成片同一套排版、同样的三层画法），不用渲染、不占机器。
 * 可以在画面上拖动标题摆位置（改成「自定义」位置）。默认插槽盖在最上面（放真实画面、加载提示等）。
 */
import { computed, ref } from 'vue'
import { TITLE_CANVAS_HEIGHT, TITLE_CANVAS_WIDTH, layoutTitle, titleBoldPx } from '../../../../../shared/subtitleTitleLayout'
import { measureSubtitleText, subtitleFontStack, type SubtitleCaptionStyle } from '@/lib/subtitleStyle'

const props = withDefaults(
  defineProps<{
    captionStyle: SubtitleCaptionStyle
    title: string
    /** 背景画面（视频封面）地址 */
    imageSrc?: string
    draggable?: boolean
    emptyText?: string
  }>(),
  { imageSrc: '', draggable: true, emptyText: '' },
)
const emit = defineEmits<{ 'update:captionStyle': [value: SubtitleCaptionStyle] }>()

const style = computed(() => props.captionStyle)
const fontStack = computed(() => subtitleFontStack(style.value.fontName))
const layout = computed(() => layoutTitle(props.title, { ...style.value, lineMode: 'multi' }, (text, size) => measureSubtitleText(style.value.fontName, text, size)))
const boldPx = computed(() => titleBoldPx(style.value.fontWeight, layout.value.lines[0]?.fontSize ?? style.value.fontSize))
const shadowBlur = computed(() => Math.max(0.6, Number(style.value.shadowBlur || 0) / 3))
const shadowOffset = computed(() => Math.max(2, Math.round((Number(style.value.strokeWidth) || 0) * 0.45 + (Number(style.value.shadowBlur) || 0) * 0.15)))
const filterId = `slp-blur-${Math.random().toString(36).slice(2, 8)}`

const frameRef = ref<HTMLElement | null>(null)
const dragging = ref(false)
const canDrag = computed(() => props.draggable && Boolean(props.title))
function moveTo(event: PointerEvent) {
  const rect = frameRef.value?.getBoundingClientRect()
  if (!rect) return
  const x = Math.max(0.05, Math.min(0.95, (event.clientX - rect.left) / rect.width))
  const y = Math.max(0.05, Math.min(0.95, (event.clientY - rect.top) / rect.height))
  emit('update:captionStyle', { ...style.value, offsetXRatio: Math.round(x * 100) / 100, offsetYRatio: Math.round(y * 100) / 100 })
}
function onDown(event: PointerEvent) {
  if (!canDrag.value) return
  dragging.value = true
  ;(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId)
  moveTo(event)
}
function onMove(event: PointerEvent) {
  if (dragging.value) moveTo(event)
}
function onUp() {
  dragging.value = false
}
</script>

<template>
  <div
    ref="frameRef"
    class="slp"
    :class="{ 'is-draggable': canDrag, 'is-dragging': dragging }"
    @pointerdown="onDown"
    @pointermove="onMove"
    @pointerup="onUp"
    @pointercancel="onUp"
  >
    <img v-if="imageSrc" class="slp__bg" :src="imageSrc" alt="" draggable="false" />
    <svg class="slp__title" :viewBox="`0 0 ${TITLE_CANVAS_WIDTH} ${TITLE_CANVAS_HEIGHT}`" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <defs>
        <filter :id="filterId" x="-10%" y="-30%" width="120%" height="160%"><feGaussianBlur :stdDeviation="shadowBlur" /></filter>
      </defs>
      <!-- 和成片同样的三层：阴影 → 描边 → 文字（常规字形 + 同色描边加粗） -->
      <g :filter="style.shadowBlur ? `url(#${filterId})` : undefined" :opacity="style.shadowBlur ? 0.55 : 0.34">
        <text v-for="(line, index) in layout.lines" :key="`s${index}`" :x="line.x" :y="line.baselineY + shadowOffset" :font-size="line.fontSize" font-weight="400" :font-family="fontStack" :fill="style.shadowColor" :stroke="style.shadowColor" :stroke-width="boldPx" stroke-linejoin="round">{{ line.text }}</text>
      </g>
      <g v-if="style.strokeWidth">
        <text v-for="(line, index) in layout.lines" :key="`o${index}`" :x="line.x" :y="line.baselineY" :font-size="line.fontSize" font-weight="400" :font-family="fontStack" :fill="style.strokeColor" :stroke="style.strokeColor" :stroke-width="Number(style.strokeWidth) + boldPx" stroke-linejoin="round">{{ line.text }}</text>
      </g>
      <text v-for="(line, index) in layout.lines" :key="`f${index}`" :x="line.x" :y="line.baselineY" :font-size="line.fontSize" font-weight="400" :font-family="fontStack" :fill="style.fontColor" :stroke="boldPx ? style.fontColor : 'none'" :stroke-width="boldPx" stroke-linejoin="round">{{ line.text }}</text>
    </svg>
    <span v-if="!title && emptyText" class="slp__empty">{{ emptyText }}</span>
    <slot />
  </div>
</template>

<style scoped>
.slp { position: relative; aspect-ratio: 9 / 16; width: 100%; margin: 0 auto; border-radius: var(--vg-radius-sm, 8px); overflow: hidden; background: #05070b; user-select: none; }
.slp.is-draggable { cursor: grab; touch-action: none; }
.slp.is-dragging { cursor: grabbing; }
.slp__bg, .slp :slotted(img), .slp :slotted(video) { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; display: block; }
.slp__title { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
.slp__empty { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; padding: 24px; text-align: center; color: rgba(255, 255, 255, .6); font-size: 12.5px; }
</style>
