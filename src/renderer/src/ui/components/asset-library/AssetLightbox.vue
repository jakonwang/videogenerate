<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { ChevronLeft, ChevronRight, Crop, FolderOpen, Trash2, X, ZoomIn, ZoomOut } from 'lucide-vue-next'
import type { LibraryAsset } from '../../../../../shared/assetLibrary'
import { assetFileUrl, formatBytes, formatDateTime } from './assetFormat'

const props = defineProps<{ assets: LibraryAsset[]; index: number }>()
const emit = defineEmits<{ close: []; 'update:index': [value: number]; edit: [asset: LibraryAsset]; reveal: [asset: LibraryAsset]; remove: [asset: LibraryAsset] }>()

const zoomed = ref(false)
const dims = ref('')
const asset = computed(() => props.assets[props.index] || null)
const src = computed(() => (asset.value ? assetFileUrl(asset.value.filePath) : ''))

watch(() => asset.value?.id, () => { zoomed.value = false; dims.value = '' })
watch(() => props.assets.length, (length) => { if (!length) emit('close'); else if (props.index >= length) emit('update:index', length - 1) })

function go(offset: number) {
  const length = props.assets.length
  if (length < 2) return
  emit('update:index', (props.index + offset + length) % length)
}

function onImageLoad(event: Event) {
  const img = event.target as HTMLImageElement
  dims.value = `${img.naturalWidth} × ${img.naturalHeight}`
}

function onVideoMeta(event: Event) {
  const video = event.target as HTMLVideoElement
  if (video.videoWidth) dims.value = `${video.videoWidth} × ${video.videoHeight}`
}

function onKey(event: KeyboardEvent) {
  if ((event.target as HTMLElement | null)?.matches('input, textarea, select')) return
  if (event.key === 'Escape') { event.preventDefault(); emit('close') }
  else if (event.key === 'ArrowLeft') { event.preventDefault(); go(-1) }
  else if (event.key === 'ArrowRight') { event.preventDefault(); go(1) }
  else if (event.key === ' ' && asset.value?.type === 'image') { event.preventDefault(); emit('close') }
  event.stopImmediatePropagation()
}

onMounted(() => window.addEventListener('keydown', onKey, true))
onUnmounted(() => window.removeEventListener('keydown', onKey, true))
</script>

<template>
  <div v-if="asset" class="lightbox" role="dialog" aria-modal="true" :aria-label="asset.name" @click.self="emit('close')">
    <header class="lightbox__bar">
      <div class="lightbox__title">
        <strong :title="asset.name">{{ asset.name }}</strong>
        <span>{{ index + 1 }} / {{ assets.length }}<template v-if="dims"> · {{ dims }}</template> · {{ formatBytes(asset.size) }} · {{ formatDateTime(asset.createdAt) }}</span>
      </div>
      <div class="lightbox__actions">
        <button v-if="asset.type === 'image'" type="button" :title="zoomed ? '适应窗口' : '原始大小'" @click="zoomed = !zoomed"><ZoomOut v-if="zoomed" :size="17" /><ZoomIn v-else :size="17" /></button>
        <button v-if="asset.type === 'image'" type="button" title="编辑图片" @click="emit('edit', asset)"><Crop :size="17" /></button>
        <button type="button" title="在文件夹中显示" @click="emit('reveal', asset)"><FolderOpen :size="17" /></button>
        <button type="button" class="danger" title="删除" @click="emit('remove', asset)"><Trash2 :size="17" /></button>
        <span class="lightbox__sep" />
        <button type="button" title="关闭 (Esc)" @click="emit('close')"><X :size="19" /></button>
      </div>
    </header>

    <div class="lightbox__stage" :class="{ 'is-zoomed': zoomed }" @click.self="emit('close')">
      <img v-if="asset.type === 'image'" :key="asset.id" :src="src" :alt="asset.name" draggable="false" @load="onImageLoad" @click="zoomed = !zoomed" />
      <video v-else :key="asset.id" :src="src" controls autoplay playsinline @loadedmetadata="onVideoMeta" />
    </div>

    <button v-if="assets.length > 1" type="button" class="lightbox__nav lightbox__nav--prev" title="上一个 (←)" @click="go(-1)"><ChevronLeft :size="26" /></button>
    <button v-if="assets.length > 1" type="button" class="lightbox__nav lightbox__nav--next" title="下一个 (→)" @click="go(1)"><ChevronRight :size="26" /></button>
  </div>
</template>

<style scoped>
.lightbox { position: fixed; inset: 0; z-index: 2400; display: grid; grid-template-rows: auto minmax(0, 1fr); background: color-mix(in srgb, #05080c 92%, transparent); backdrop-filter: blur(6px); color: #e8eef2; }
.lightbox__bar { display: flex; align-items: center; gap: 16px; padding: 12px 16px 12px 22px; background: linear-gradient(to bottom, rgba(0, 0, 0, .55), transparent); }
.lightbox__title { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
.lightbox__title strong { font-size: 14px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lightbox__title span { font-size: 12px; color: rgba(232, 238, 242, .62); font-variant-numeric: tabular-nums; }
.lightbox__actions { display: flex; align-items: center; gap: 4px; }
.lightbox__actions button { display: grid; place-items: center; width: 36px; height: 36px; border: 0; border-radius: 9px; background: transparent; color: rgba(232, 238, 242, .82); cursor: pointer; transition: background .15s, color .15s; }
.lightbox__actions button:hover { background: rgba(255, 255, 255, .1); color: #fff; }
.lightbox__actions button.danger:hover { background: color-mix(in srgb, var(--vg-red) 22%, transparent); color: var(--vg-red); }
.lightbox__sep { width: 1px; height: 20px; margin: 0 6px; background: rgba(255, 255, 255, .16); }
.lightbox__stage { display: flex; align-items: center; justify-content: center; min-height: 0; padding: 8px 84px 32px; overflow: hidden; }
.lightbox__stage img, .lightbox__stage video { max-width: 100%; max-height: 100%; border-radius: 6px; box-shadow: 0 24px 80px rgba(0, 0, 0, .55); object-fit: contain; }
.lightbox__stage img { cursor: zoom-in; user-select: none; }
.lightbox__stage.is-zoomed { display: block; overflow: auto; padding: 8px 84px 32px; text-align: center; }
.lightbox__stage.is-zoomed img { max-width: none; max-height: none; cursor: zoom-out; }
.lightbox__nav { position: absolute; top: 50%; display: grid; place-items: center; width: 48px; height: 48px; margin-top: -24px; border: 1px solid rgba(255, 255, 255, .12); border-radius: 50%; background: rgba(20, 26, 32, .7); color: #e8eef2; cursor: pointer; transition: background .15s, transform .15s; }
.lightbox__nav:hover { background: var(--vg-accent); border-color: var(--vg-accent); color: var(--theme-on-accent); }
.lightbox__nav--prev { left: 20px; }
.lightbox__nav--next { right: 20px; }
</style>
