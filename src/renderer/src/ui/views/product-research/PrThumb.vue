<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { ImageOff, X, ZoomIn, ZoomOut } from 'lucide-vue-next'
import type { ProductResearchResult } from '../../../../../shared/productResearch'
import { imageSrc } from './productResearchUtils'

const props = withDefaults(defineProps<{
  result?: Pick<ProductResearchResult, 'imagePath' | 'imageDataUrl' | 'title'> | null
  size?: 'sm' | 'md' | 'lg'
  /** 点击缩略图打开大图预览 */
  preview?: boolean
}>(), { size: 'md', preview: true })

const failed = ref(false)
const open = ref(false)
const zoomed = ref(false)
const src = computed(() => imageSrc(props.result || undefined))
watch(src, () => { failed.value = false })
const sizeClass = computed(() => (props.size === 'md' ? '' : `prd-thumb--${props.size}`))

function onKey(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  event.preventDefault()
  event.stopImmediatePropagation()
  close()
}

function show() {
  if (!props.preview || !src.value || failed.value) return
  zoomed.value = false
  open.value = true
  window.addEventListener('keydown', onKey, true)
}

function close() {
  open.value = false
  window.removeEventListener('keydown', onKey, true)
}

onUnmounted(() => window.removeEventListener('keydown', onKey, true))
</script>

<template>
  <img
    v-if="src && !failed"
    :src="src"
    :alt="result?.title || ''"
    class="prd-thumb"
    :class="[sizeClass, { 'prd-thumb--clickable': preview }]"
    :title="preview ? '点击查看大图' : undefined"
    loading="lazy"
    @error="failed = true"
    @click.stop="show"
  />
  <span v-else class="prd-thumb" :class="sizeClass"><ImageOff :size="size === 'sm' ? 13 : 16" /></span>

  <Teleport to="body">
    <div v-if="open" class="pr-preview" role="dialog" aria-modal="true" :aria-label="result?.title || '商品图片'" @click.self="close">
      <header class="pr-preview__bar">
        <strong class="pr-preview__title" :title="result?.title">{{ result?.title || '商品图片' }}</strong>
        <button type="button" :title="zoomed ? '适应窗口' : '原始大小'" @click="zoomed = !zoomed"><ZoomOut v-if="zoomed" :size="17" /><ZoomIn v-else :size="17" /></button>
        <button type="button" title="关闭 (Esc)" @click="close"><X :size="19" /></button>
      </header>
      <div class="pr-preview__stage" :class="{ 'is-zoomed': zoomed }" @click.self="close">
        <img :src="src" :alt="result?.title || ''" draggable="false" @click="zoomed = !zoomed" />
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.prd-thumb--clickable { cursor: zoom-in; transition: transform .15s, box-shadow .15s; }
.prd-thumb--clickable:hover { transform: scale(1.04); box-shadow: 0 0 0 2px var(--vg-accent); }

.pr-preview { position: fixed; inset: 0; z-index: 2400; display: grid; grid-template-rows: auto minmax(0, 1fr); background: color-mix(in srgb, #05080c 92%, transparent); backdrop-filter: blur(6px); color: #e8eef2; }
.pr-preview__bar { display: flex; align-items: center; gap: 4px; padding: 12px 16px 12px 22px; background: linear-gradient(to bottom, rgba(0, 0, 0, .55), transparent); }
.pr-preview__title { flex: 1; min-width: 0; margin-right: 12px; font-size: 14px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pr-preview__bar button { display: grid; place-items: center; width: 36px; height: 36px; border: 0; border-radius: 9px; background: transparent; color: rgba(232, 238, 242, .82); cursor: pointer; transition: background .15s, color .15s; }
.pr-preview__bar button:hover { background: rgba(255, 255, 255, .1); color: #fff; }
.pr-preview__stage { display: flex; align-items: center; justify-content: center; min-height: 0; padding: 8px 48px 32px; overflow: hidden; }
.pr-preview__stage img { max-width: 100%; max-height: 100%; border-radius: 6px; box-shadow: 0 24px 80px rgba(0, 0, 0, .55); object-fit: contain; cursor: zoom-in; user-select: none; }
.pr-preview__stage.is-zoomed { display: block; overflow: auto; text-align: center; }
.pr-preview__stage.is-zoomed img { max-width: none; max-height: none; cursor: zoom-out; }
</style>
