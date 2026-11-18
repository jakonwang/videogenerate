<script setup lang="ts">
/**
 * Desktop-style image input: dashed drop zone (click or drag an image) plus 「从商品库选择」; once chosen,
 * a product row with its other images to switch between. Same model as the phone SourcePicker.
 */
import { ref } from 'vue'
import { Boxes, ImagePlus, LoaderCircle, RefreshCw, X } from 'lucide-vue-next'
import CloudImage from '../CloudImage.vue'
import ProductPicker from '../ProductPicker.vue'
import type { Source } from '../SourcePicker.vue'
import { uploadImage } from '@/lib/files'
import type { ProductItem } from '@/lib/library'
import { errorMessage } from '@/lib/session'
import { toast } from '@/lib/toast'

const model = defineModel<Source | null>({ required: true })
defineProps<{ hint?: string }>()
const picking = ref(false)
const uploading = ref(false)
const input = ref<HTMLInputElement>()

function pickProduct(product: ProductItem) {
  picking.value = false
  const first = product.coverFileId || product.images[0]?.fileId
  if (!first) {
    toast('这个商品还没有图片')
    return
  }
  model.value = { fileId: first, product }
}

async function onFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  ;(event.target as HTMLInputElement).value = ''
  if (!file) return
  uploading.value = true
  try {
    model.value = { fileId: (await uploadImage(file)).fileId }
  } catch (error) {
    toast(`上传失败：${errorMessage(error)}`)
  } finally {
    uploading.value = false
  }
}
</script>

<template>
  <div class="wis">
    <div v-if="model" class="wis__chosen">
      <span class="wis__img"><CloudImage :file-id="model.fileId" /></span>
      <div class="wis__info">
        <strong>{{ model.product?.name || '上传的图片' }}</strong>
        <small>{{ model.product ? `商品库 · ${model.product.images.length} 张图` : '本地上传' }}</small>
        <div v-if="model.product && model.product.images.length > 1" class="wis__thumbs">
          <button v-for="image in model.product.images" :key="image.fileId" type="button" :class="{ 'is-active': image.fileId === model.fileId }" @click="model = { ...model!, fileId: image.fileId }">
            <CloudImage :file-id="image.fileId" />
          </button>
        </div>
      </div>
      <div class="wis__actions">
        <button type="button" class="vg-btn vg-btn--sm" @click="picking = true"><RefreshCw :size="13" /> 更换</button>
        <button type="button" class="vg-icon-btn vg-icon-btn--sm" title="清除" @click="model = null"><X :size="14" /></button>
      </div>
    </div>
    <button v-else type="button" class="wis__drop" :disabled="uploading" @click="input?.click()">
      <span class="wis__drop-icon"><LoaderCircle v-if="uploading" :size="20" class="vg-spin" /><ImagePlus v-else :size="20" /></span>
      <strong>{{ uploading ? '上传中…' : '点击上传或拖拽图片到这里' }}</strong>
      <small>{{ hint || '支持 JPG、PNG、WEBP，建议商品主体清晰、构图完整' }}</small>
    </button>
    <div v-if="!model" class="wis__row">
      <button type="button" class="vg-btn vg-btn--sm" @click="picking = true"><Boxes :size="14" /> 从商品库选择</button>
    </div>
    <input ref="input" type="file" accept="image/*" hidden @change="onFile" />
    <ProductPicker v-if="picking" @close="picking = false" @pick="pickProduct" />
  </div>
</template>

<style scoped>
.wis { display: flex; flex-direction: column; gap: 10px; }
.wis__drop { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; min-height: 150px; padding: 18px; border: 1px dashed var(--theme-border-control); border-radius: 12px; background: var(--theme-panel-soft); color: var(--theme-text); cursor: pointer; transition: border-color .15s, background .15s; }
.wis__drop:hover { border-color: var(--vg-accent-line); background: var(--vg-accent-soft); }
.wis__drop-icon { display: grid; place-items: center; width: 40px; height: 40px; border-radius: 11px; background: var(--vg-accent-soft); border: 1px solid var(--vg-accent-line); color: var(--vg-accent); }
.wis__drop strong { font-size: 13px; }
.wis__drop small { font-size: 11.5px; color: var(--theme-text-muted); }
.wis__row { display: flex; gap: 8px; }
.wis__chosen { display: flex; align-items: flex-start; gap: 12px; padding: 10px; border: 1px solid var(--theme-border); border-radius: 12px; background: var(--theme-panel-soft); }
.wis__img { width: 84px; height: 84px; flex-shrink: 0; overflow: hidden; border-radius: 10px; background: var(--theme-control); }
.wis__img :deep(img) { width: 100%; height: 100%; object-fit: cover; }
.wis__info { display: flex; flex-direction: column; gap: 4px; flex: 1; min-width: 0; }
.wis__info strong { font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wis__info small { font-size: 11.5px; color: var(--theme-text-muted); }
.wis__thumbs { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
.wis__thumbs button { width: 36px; height: 36px; padding: 0; overflow: hidden; border: 2px solid transparent; border-radius: 7px; background: none; cursor: pointer; }
.wis__thumbs button.is-active { border-color: var(--vg-accent); }
.wis__thumbs :deep(img) { width: 100%; height: 100%; object-fit: cover; }
.wis__actions { display: flex; gap: 4px; }
</style>
