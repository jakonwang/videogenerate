<script setup lang="ts">
import { isWeb } from '@/lib/platform'
import { ref } from 'vue'
import { ImagePlus, LoaderCircle, Star, X } from 'lucide-vue-next'
import type { SyncFileRef } from '@shared/cloud/sync'
import CloudImage from './CloudImage.vue'
import { uploadImage } from '@/lib/files'
import { errorMessage } from '@/lib/session'
import { toast } from '@/lib/toast'

/** 图片网格：拍照 / 相册多选上传、设为封面、删除 */
const images = defineModel<SyncFileRef[]>('images', { required: true })
const cover = defineModel<string | undefined>('cover')
defineProps<{ aspect?: string }>()

const input = ref<HTMLInputElement>()
const uploading = ref(0)

async function onPick(event: Event) {
  const files = Array.from((event.target as HTMLInputElement).files || [])
  ;(event.target as HTMLInputElement).value = ''
  for (const file of files) {
    uploading.value += 1
    try {
      const ref = await uploadImage(file)
      if (!images.value.some((image) => image.fileId === ref.fileId)) images.value = [...images.value, ref]
      if (!cover.value) cover.value = ref.fileId
    } catch (error) {
      toast(`上传失败：${errorMessage(error)}`)
    } finally {
      uploading.value -= 1
    }
  }
}

function remove(fileId: string) {
  images.value = images.value.filter((image) => image.fileId !== fileId)
  if (cover.value === fileId) cover.value = images.value[0]?.fileId
}

const coverId = () => cover.value || images.value[0]?.fileId
</script>

<template>
  <div class="grid">
    <div v-for="image in images" :key="image.fileId" class="cell" :style="{ aspectRatio: aspect || '1' }">
      <CloudImage :file-id="image.fileId" />
      <button type="button" class="cell__remove" aria-label="删除图片" @click="remove(image.fileId)"><X :size="14" :stroke-width="2.6" /></button>
      <button type="button" class="cell__cover" :class="{ 'is-cover': coverId() === image.fileId }" @click="cover = image.fileId">
        <Star :size="11" :fill="coverId() === image.fileId ? 'currentColor' : 'none'" />{{ coverId() === image.fileId ? '封面' : '设为封面' }}
      </button>
    </div>
    <div v-for="n in uploading" :key="`u${n}`" class="cell cell--loading" :style="{ aspectRatio: aspect || '1' }"><LoaderCircle :size="22" class="m-spin" /></div>
    <button type="button" class="cell cell--add" :style="{ aspectRatio: aspect || '1' }" @click="input?.click()">
      <ImagePlus :size="24" />
      <span>{{ isWeb ? '上传图片' : '拍照 / 相册' }}</span>
    </button>
    <input ref="input" type="file" accept="image/*" multiple hidden @change="onPick" />
  </div>
</template>

<style scoped>
.grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.cell { position: relative; overflow: hidden; border-radius: 12px; border: 1px solid var(--theme-border); background: var(--theme-panel-soft); }
.cell__remove { position: absolute; top: 6px; right: 6px; display: grid; place-items: center; width: 24px; height: 24px; border: 0; border-radius: 50%; background: rgba(0, 0, 0, .6); color: #fff; }
.cell__cover { position: absolute; left: 6px; bottom: 6px; display: inline-flex; align-items: center; gap: 3px; height: 22px; padding: 0 7px; border: 0; border-radius: 999px; background: rgba(0, 0, 0, .55); color: rgba(255, 255, 255, .85); font-size: 10px; font-weight: 700; }
.cell__cover.is-cover { background: var(--m-accent); color: #04201c; }
.cell--loading { display: grid; place-items: center; color: var(--m-accent-2); }
.cell--add { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; border: 1.5px dashed var(--theme-border-control); background: transparent; color: var(--theme-text-muted); font-size: 11px; font-weight: 600; }
.cell--add:active { background: var(--theme-control); }
</style>
