<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { LoaderCircle, Plus, X } from 'lucide-vue-next'
import { SWAP_MAX_PRODUCT_IMAGES } from '../../../../../shared/sceneSwap'
import SwapImage from './SwapImage.vue'

/** 换商品：直接上传产品图（点选或拖进来），最多 4 张，不经过商品库 */
type File = { path: string; name: string }
const props = defineProps<{ fileIds: string[]; name: string }>()
const emit = defineEmits<{ change: [value: { fileIds: string[]; name: string }]; error: [message: string] }>()
const { t } = useI18n()
const k = (key: string, params: Record<string, unknown> = {}) => t(`ai.sceneSwap.${key}`, params)
const api = window.api.sceneSwap
const uploading = ref(false)
const dragging = ref(false)
const room = computed(() => SWAP_MAX_PRODUCT_IMAGES - props.fileIds.length)

async function add(getFiles: () => Promise<File[]>) {
  if (uploading.value) return
  try {
    const files = (await getFiles()).slice(0, room.value)
    if (!files.length) return
    uploading.value = true
    const ids: string[] = []
    for (const file of files) ids.push(((await api.upload(file.path)) as { fileId: string }).fileId)
    emit('change', { fileIds: [...new Set([...props.fileIds, ...ids])], name: props.name || files[0]!.name.replace(/\.[^.]+$/, '') })
  } catch (cause) {
    emit('error', String((cause as Error)?.message || cause).replace(/^Error invoking remote method '[^']+': (\w*Error: )?/, ''))
  } finally {
    uploading.value = false
  }
}
const upload = () => add(async () => (await api.pick('files')) as File[])
function drop(event: DragEvent) {
  dragging.value = false
  const paths = Array.from(event.dataTransfer?.files ?? []).map((file) => window.api.getPathForFile(file)).filter(Boolean)
  if (paths.length) void add(async () => (await api.expandPaths(paths)) as File[])
}
function remove(id: string) {
  const fileIds = props.fileIds.filter((item) => item !== id)
  emit('change', { fileIds, name: fileIds.length ? props.name : '' })
}
</script>

<template>
  <div class="product" :class="{ 'is-drop': dragging }" data-testid="product-upload" @dragover.prevent="dragging = true" @dragleave.self="dragging = false" @drop.prevent.stop="drop">
    <div class="product__grid">
      <div v-for="id in fileIds" :key="id" class="product__img"><SwapImage :file-id="id" :alt="name" :width="140" /><button type="button" :aria-label="k('remove')" @click="remove(id)"><X :size="12" /></button></div>
      <button v-if="room > 0" type="button" class="product__add" :class="{ 'is-wide': !fileIds.length }" :disabled="uploading" @click="upload"><LoaderCircle v-if="uploading" :size="18" class="vg-spin" /><Plus v-else :size="18" /><span>{{ k('uploadProduct') }}</span></button>
    </div>
    <p class="product__hint">{{ k('productHint', { max: SWAP_MAX_PRODUCT_IMAGES }) }}</p>
  </div>
</template>

<style scoped>
.product { display: flex; flex-direction: column; gap: 10px; border-radius: 8px; }
.product.is-drop { box-shadow: 0 0 0 2px var(--vg-accent); }
.product__grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
.product__img { position: relative; overflow: hidden; border-radius: 6px; }
.product__img button { position: absolute; top: 4px; right: 4px; display: grid; place-items: center; width: 20px; height: 20px; padding: 0; border: 0; border-radius: 5px; background: rgba(0, 0, 0, .66); color: #fff; cursor: pointer; }
.product__add { display: flex; flex-direction: column; gap: 6px; align-items: center; justify-content: center; aspect-ratio: 3 / 4; padding: 4px; border: 1px dashed var(--gs-line); border-radius: 6px; background: var(--gs-well); color: var(--theme-text-secondary); font-size: 12px; cursor: pointer; }
.product__add.is-wide { grid-column: 1 / -1; height: 120px; aspect-ratio: auto; }
.product__add:hover { border-color: var(--vg-accent); background: var(--gs-hover); color: var(--theme-text); }
.product__hint { color: var(--theme-text-muted); font-size: 12px; line-height: 1.6; }
button:focus-visible { outline: 2px solid var(--vg-accent); outline-offset: 2px; }
</style>
