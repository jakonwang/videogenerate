<script setup lang="ts">
import { computed, ref } from 'vue'
import { AlertTriangle, ChevronDown, Clapperboard, LoaderCircle, RefreshCw, X } from 'lucide-vue-next'

/** 同款模板 returned by window.api.styleReference.analyze. */
export type StyleReference = {
  id: string
  videoPath: string
  videoName: string
  durationSec: number
  aspectRatio: '9:16' | '16:9'
  shotCount: number
  firstFramePath: string
  lastFramePath: string
  camera: string
  action: string
  lighting: string
  background: string
  style: string
  motionPrompt: string
  analysisOk: boolean
  warning?: string
}

const props = defineProps<{
  modelValue: StyleReference | null
  /** Whether the closing frame is used (tk创意室 首尾帧 mode). */
  usesLastFrame?: boolean
  /** Render without card chrome, to sit as a field inside another card (图生视频). */
  bare?: boolean
}>()

const emit = defineEmits<{ 'update:modelValue': [value: StyleReference | null] }>()

const analyzing = ref(false)
const errorText = ref('')
const detailsOpen = ref(false)

function previewSrc(path?: string) {
  const value = String(path || '').trim()
  return value ? `vg://file?path=${encodeURIComponent(value)}` : ''
}

/** Plain-Chinese name for the camera move, so the card reads without English. */
const cameraLabel = computed(() => {
  const value = String(props.modelValue?.camera || '').toLowerCase()
  const moves: Array<[RegExp, string]> = [
    [/orbit|arc|circl/, '环绕'],
    [/push|dolly in|zoom in|move in|approach|closer|grows larger/, '推近'],
    [/pull|dolly out|zoom out|retreat|move back/, '拉远'],
    [/pan/, '横移'],
    [/tilt/, '上下摇'],
    [/track|follow/, '跟拍'],
    [/handheld/, '手持'],
    [/static|locked|fixed|still/, '固定机位'],
  ]
  const found = moves.filter(([pattern]) => pattern.test(value)).map(([, label]) => label)
  return found.length ? Array.from(new Set(found)).slice(0, 2).join(' + ') : '按参考视频'
})

const details = computed(() => {
  const value = props.modelValue
  if (!value) return []
  return [
    ['运镜', value.camera],
    ['动作', value.action],
    ['光线', value.lighting],
    ['背景', value.background],
    ['风格', value.style],
  ].filter(([, text]) => String(text || '').trim())
})

async function pickVideo() {
  if (analyzing.value) return
  const paths = await window.api.pickFiles({
    title: '选择参考视频',
    filters: [{ name: 'Video', extensions: ['mp4', 'mov', 'm4v', 'webm'] }],
    multiple: false,
  })
  const videoPath = Array.isArray(paths) ? String(paths[0] || '') : ''
  if (!videoPath) return
  analyzing.value = true
  errorText.value = ''
  try {
    emit('update:modelValue', await window.api.styleReference.analyze({ videoPath }))
  } catch (error: any) {
    errorText.value = error?.message || String(error)
  } finally {
    analyzing.value = false
  }
}
</script>

<template>
  <article :class="bare ? 'sr-bare' : ['ts-card', 'ts-block', 'sr-card', { 'is-on': modelValue }]">
    <header :class="bare ? 'sr-bare__head' : 'ts-block__head'">
      <div :class="bare ? 'sr-bare__title' : 'ts-block__title'">
        <h2>同款参考视频<em class="sr-optional">可选</em></h2>
        <p>上传一条效果好的视频，批量给多个商品生成同款：运镜、光线、构图照着它来</p>
      </div>
      <div v-if="modelValue" class="ts-block__tools">
        <button class="vg-btn vg-btn--sm" type="button" :disabled="analyzing" @click="pickVideo"><RefreshCw :size="13" />更换</button>
        <button class="vg-btn vg-btn--sm vg-btn--ghost" type="button" :disabled="analyzing" @click="emit('update:modelValue', null)"><X :size="13" />不用了</button>
      </div>
    </header>

    <div v-if="analyzing" class="sr-busy">
      <LoaderCircle :size="18" class="vg-spin" />
      <span>正在分析参考视频的运镜和光线，大约需要半分钟…</span>
    </div>

    <div v-else-if="modelValue" class="sr-body">
      <div class="sr-frames">
        <figure>
          <img :src="previewSrc(modelValue.firstFramePath)" alt="开头画面" />
          <figcaption>开头</figcaption>
        </figure>
        <figure v-if="usesLastFrame">
          <img :src="previewSrc(modelValue.lastFramePath)" alt="结尾画面" />
          <figcaption>结尾</figcaption>
        </figure>
      </div>
      <div class="sr-facts">
        <strong :title="modelValue.videoName">{{ modelValue.videoName }}</strong>
        <dl>
          <div><dt>运镜</dt><dd>{{ cameraLabel }}</dd></div>
          <div><dt>时长</dt><dd>{{ modelValue.durationSec.toFixed(1) }} 秒</dd></div>
        </dl>
        <p class="sr-how">
          {{ usesLastFrame
            ? '每个商品会被换进开头和结尾两张画面，视频模型只负责中间的动作。'
            : '每个商品会被换进开头画面，再按参考视频的运镜生成。' }}
        </p>
        <p v-if="modelValue.warning" class="sr-warn"><AlertTriangle :size="13" />{{ modelValue.warning }}</p>
        <button v-if="details.length" type="button" class="sr-toggle" @click="detailsOpen = !detailsOpen">
          查看提取到的画面描述<ChevronDown :size="13" :class="{ 'is-open': detailsOpen }" />
        </button>
        <dl v-if="detailsOpen" class="sr-details">
          <div v-for="[label, text] in details" :key="label"><dt>{{ label }}</dt><dd>{{ text }}</dd></div>
        </dl>
      </div>
    </div>

    <button v-else class="ts-dropzone sr-drop" type="button" @click="pickVideo">
      <span class="ts-dropzone__icon"><Clapperboard :size="22" /></span>
      <span class="ts-dropzone__copy">
        <strong>上传参考视频</strong>
        <small>5–10 秒的单镜头产品视频效果最好 · 只分析一次，之后可反复使用</small>
      </span>
    </button>

    <p v-if="errorText" class="sr-warn sr-error"><AlertTriangle :size="13" />{{ errorText }}</p>
  </article>
</template>

<style scoped>
.sr-card.is-on { border-color: var(--vg-accent-line, var(--theme-accent)); }
.sr-bare { display: grid; gap: 10px; }
.sr-bare .sr-drop { display: flex; gap: 14px; align-items: center; width: 100%; padding: 18px; border: 1px solid var(--theme-border); border-radius: 10px; background: var(--theme-panel-soft); color: var(--theme-text); text-align: left; cursor: pointer; }
.sr-bare .sr-drop:hover { border-color: var(--theme-border-control); }
.sr-bare .sr-drop .ts-dropzone__icon { display: inline-flex; color: var(--theme-text-muted); }
.sr-bare .sr-drop .ts-dropzone__copy { display: flex; flex-direction: column; gap: 3px; }
.sr-bare .sr-drop strong { font-size: 13px; font-weight: 600; }
.sr-bare .sr-drop small { color: var(--theme-text-muted); font-size: 12px; }
.sr-bare__head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
.sr-bare__head .ts-block__tools { display: flex; gap: 6px; }
.sr-bare__title h2 { margin: 0; font-size: 13px; font-weight: 600; color: var(--theme-text); }
.sr-bare__title p { margin: 4px 0 0; color: var(--theme-text-muted); font-size: 12px; }
.sr-optional { font-style: normal; margin-left: 8px; padding: 1px 7px; border-radius: 999px; background: var(--theme-panel-soft); color: var(--theme-text-muted); font-size: 11px; font-weight: 500; }
.sr-drop { min-height: 96px; }
.sr-busy { display: flex; align-items: center; gap: 10px; min-height: 96px; padding: 0 18px; border-radius: 12px; background: var(--vg-accent-soft, var(--theme-accent-soft)); color: var(--theme-text); font-size: 13px; }
.sr-body { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 16px; align-items: start; }
.sr-frames { display: flex; gap: 8px; }
.sr-frames figure { margin: 0; display: grid; gap: 4px; }
.sr-frames img { width: 92px; aspect-ratio: 9 / 16; object-fit: cover; border-radius: 8px; border: 1px solid var(--theme-border); background: var(--theme-panel-soft); }
.sr-frames figcaption { text-align: center; color: var(--theme-text-muted); font-size: 11px; }
.sr-facts { min-width: 0; display: grid; gap: 8px; }
.sr-facts > strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; color: var(--theme-text); }
.sr-facts dl { margin: 0; display: flex; flex-wrap: wrap; gap: 6px 18px; }
.sr-facts dl div { display: flex; gap: 6px; font-size: 12px; }
.sr-facts dt { color: var(--theme-text-muted); }
.sr-facts dd { margin: 0; color: var(--theme-text); font-weight: 600; }
.sr-how { margin: 0; color: var(--theme-text-secondary, var(--theme-text-muted)); font-size: 12px; line-height: 1.5; }
.sr-warn { margin: 0; display: flex; align-items: flex-start; gap: 6px; color: var(--color-warning, #b7791f); font-size: 12px; line-height: 1.5; }
.sr-warn svg { flex-shrink: 0; margin-top: 2px; }
.sr-error { margin-top: 10px; color: var(--color-danger, #c53030); }
.sr-toggle { justify-self: start; display: inline-flex; align-items: center; gap: 4px; padding: 0; border: 0; background: none; color: var(--vg-accent, var(--theme-accent)); font-size: 12px; cursor: pointer; }
.sr-toggle svg { transition: transform .15s; }
.sr-toggle svg.is-open { transform: rotate(180deg); }
.sr-facts .sr-details { display: grid; gap: 6px; padding: 10px 12px; border-radius: 8px; background: var(--theme-panel-soft); }
.sr-details div { display: grid !important; grid-template-columns: 36px minmax(0, 1fr); }
.sr-details dd { font-weight: 400 !important; color: var(--theme-text-secondary, var(--theme-text)) !important; line-height: 1.5; }
@media (max-width: 640px) { .sr-body { grid-template-columns: 1fr; } }
</style>
