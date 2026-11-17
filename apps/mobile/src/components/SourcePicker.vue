<script setup lang="ts">
import { ref } from 'vue'
import { Boxes, ImagePlus, LoaderCircle } from 'lucide-vue-next'
import CloudImage from './CloudImage.vue'
import ProductPicker from './ProductPicker.vue'
import { uploadImage } from '@/lib/files'
import type { ProductItem } from '@/lib/library'
import { errorMessage } from '@/lib/session'
import { toast } from '@/lib/toast'

/**
 * 选择生成用的原图：从商品库选商品后点选它的一张图，或直接拍照 / 从相册选。
 */
export type Source = { fileId: string; product?: Pick<ProductItem, 'id' | 'name' | 'type' | 'images'> }

const model = defineModel<Source | null>({ required: true })
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
    const ref = await uploadImage(file)
    model.value = { fileId: ref.fileId }
  } catch (error) {
    toast(`上传失败：${errorMessage(error)}`)
  } finally {
    uploading.value = false
  }
}
</script>

<template>
  <div class="source">
    <div v-if="model" class="source__chosen m-card">
      <span class="source__img"><CloudImage :file-id="model.fileId" /></span>
      <div class="source__info">
        <strong>{{ model.product?.name || '手机里的照片' }}</strong>
        <div v-if="model.product && model.product.images.length > 1" class="source__thumbs">
          <button v-for="image in model.product.images" :key="image.fileId" type="button" :class="{ 'is-active': image.fileId === model.fileId }" @click="model = { ...model!, fileId: image.fileId }">
            <CloudImage :file-id="image.fileId" />
          </button>
        </div>
        <span v-else class="m-muted small">将用这张图生成</span>
      </div>
    </div>
    <div class="source__actions">
      <button type="button" class="m-btn" @click="picking = true"><Boxes :size="18" /> 从商品库选</button>
      <button type="button" class="m-btn" :disabled="uploading" @click="input?.click()">
        <LoaderCircle v-if="uploading" :size="18" class="m-spin" /><ImagePlus v-else :size="18" /> 拍照 / 相册
      </button>
    </div>
    <input ref="input" type="file" accept="image/*" hidden @change="onFile" />
    <ProductPicker v-if="picking" @close="picking = false" @pick="pickProduct" />
  </div>
</template>

<style scoped>
.source { display: flex; flex-direction: column; gap: 10px; }
.source__chosen { display: flex; gap: 12px; padding: 10px; }
.source__img { flex: none; width: 88px; height: 88px; border-radius: 10px; overflow: hidden; }
.source__info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 8px; }
.source__info strong { font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.source__thumbs { display: flex; gap: 6px; overflow-x: auto; }
.source__thumbs button { flex: none; width: 40px; height: 40px; padding: 0; overflow: hidden; border: 2px solid transparent; border-radius: 8px; background: none; }
.source__thumbs button.is-active { border-color: var(--m-accent); }
.source__actions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.source__actions .m-btn { height: 44px; font-size: 14px; }
.small { font-size: 12px; }
</style>
