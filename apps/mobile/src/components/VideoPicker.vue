<script setup lang="ts">
import { computed, ref } from 'vue'
import { Check, Film, LoaderCircle, Plus, X } from 'lucide-vue-next'
import CloudVideo from './CloudVideo.vue'
import { uploadVideo } from '@/lib/clone'
import { useGenerations } from '@/lib/generate'
import { errorMessage } from '@/lib/session'
import { toast } from '@/lib/toast'

/**
 * 选视频：从相册上传，或从「我的视频」（AI 生成、复刻成片、下载的视频等）里选。
 * multiple=false 时只保留一个。
 */
const model = defineModel<string[]>({ required: true })
const props = defineProps<{ multiple?: boolean; max?: number }>()
const input = ref<HTMLInputElement>()
const uploading = ref(0)
const picking = ref(false)
const mine = useGenerations((item) => item.kind === 'video' && item.status === 'succeeded' && Boolean(item.outputFileId))
const limit = computed(() => (props.multiple ? props.max ?? 20 : 1))

function add(fileId: string) {
  if (model.value.includes(fileId)) return
  model.value = props.multiple ? [...model.value, fileId].slice(0, limit.value) : [fileId]
}

async function onFiles(event: Event) {
  const files = Array.from((event.target as HTMLInputElement).files || []).slice(0, limit.value)
  ;(event.target as HTMLInputElement).value = ''
  for (const file of files) {
    uploading.value += 1
    try {
      add((await uploadVideo(file)).fileId)
    } catch (error) {
      toast(`上传失败：${errorMessage(error)}`)
    } finally {
      uploading.value -= 1
    }
  }
}

function toggleMine(fileId: string) {
  if (model.value.includes(fileId)) model.value = model.value.filter((id) => id !== fileId)
  else add(fileId)
}
</script>

<template>
  <div class="picker">
    <div class="grid">
      <div v-for="fileId in model" :key="fileId" class="cell">
        <CloudVideo :file-id="fileId" />
        <button type="button" class="cell__remove" aria-label="移除" @click="model = model.filter((id) => id !== fileId)"><X :size="14" :stroke-width="2.6" /></button>
      </div>
      <div v-for="n in uploading" :key="`u${n}`" class="cell cell--loading"><LoaderCircle :size="20" class="m-spin" /><small>上传中</small></div>
      <button v-if="model.length < limit" type="button" class="cell cell--add" @click="input?.click()"><Plus :size="22" /><small>相册</small></button>
      <button v-if="model.length < limit && mine.length" type="button" class="cell cell--add" @click="picking = true"><Film :size="22" /><small>我的视频</small></button>
    </div>
    <input ref="input" type="file" accept="video/*" :multiple="multiple" hidden @change="onFiles" />

    <Teleport to="body">
      <div v-if="picking" class="sheet-backdrop" @click.self="picking = false">
        <section class="sheet">
          <header class="sheet__head"><h2>我的视频</h2><button type="button" class="m-btn m-btn--sm m-btn--primary" @click="picking = false">完成</button></header>
          <div class="mine">
            <button v-for="item in mine" :key="item.id" type="button" class="mine__item" :class="{ 'is-active': model.includes(item.outputFileId!) }" @click="toggleMine(item.outputFileId!)">
              <CloudVideo :file-id="item.outputFileId" />
              <span class="mine__label">{{ item.label }}</span>
              <span v-if="model.includes(item.outputFileId!)" class="mine__check"><Check :size="14" :stroke-width="3" /></span>
            </button>
          </div>
        </section>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.cell { position: relative; aspect-ratio: 9 / 16; overflow: hidden; border-radius: 10px; border: 1px solid var(--theme-border); background: var(--theme-panel-soft); }
.cell__remove { position: absolute; top: 4px; right: 4px; display: grid; place-items: center; width: 22px; height: 22px; border: 0; border-radius: 50%; background: rgba(0, 0, 0, .6); color: #fff; }
.cell--loading, .cell--add { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; color: var(--theme-text-muted); font-size: 11px; }
.cell--add { border: 1.5px dashed var(--theme-border-control); background: transparent; }
.sheet-backdrop { position: fixed; inset: 0; z-index: 60; display: flex; align-items: flex-end; background: var(--theme-overlay); }
.sheet { width: 100%; max-height: 80vh; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; padding: 12px var(--m-gutter) calc(16px + var(--m-safe-bottom)); border-radius: 22px 22px 0 0; background: var(--theme-panel); }
.sheet__head { display: flex; align-items: center; justify-content: space-between; }
.sheet__head h2 { margin: 0; font-size: 17px; }
.mine { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.mine__item { position: relative; aspect-ratio: 9 / 16; overflow: hidden; padding: 0; border: 2px solid transparent; border-radius: 10px; background: var(--theme-panel-soft); }
.mine__item.is-active { border-color: var(--m-accent); }
.mine__label { position: absolute; left: 4px; right: 4px; bottom: 4px; overflow: hidden; padding: 1px 5px; border-radius: 6px; background: rgba(0, 0, 0, .6); color: #fff; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
.mine__check { position: absolute; top: 4px; right: 4px; display: grid; place-items: center; width: 22px; height: 22px; border-radius: 50%; background: var(--m-accent); color: #04201c; }
</style>
