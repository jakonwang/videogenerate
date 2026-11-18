<script setup lang="ts">
/** 从素材库挑视频 / 图片（网页版各工具共用），可多选；选中的用 picked（fileId 列表）标记。 */
import { Check, Film, X } from 'lucide-vue-next'
import CloudImage from '@/components/CloudImage.vue'
import { formatDuration, useAssets, type AssetItem } from '@/lib/assets'

const props = defineProps<{ kind: 'video' | 'image'; picked: string[]; title?: string }>()
const emit = defineEmits<{ toggle: [item: AssetItem]; close: [] }>()
const { items } = useAssets((item) => item.kind === props.kind)
</script>

<template>
  <div class="vg-backdrop" @click.self="emit('close')">
    <section class="vg-dialog vg-dialog--wide" data-testid="asset-picker">
      <header class="vg-dialog__head">
        <span class="vg-dialog__title">{{ title || (kind === 'video' ? '从素材库选择视频' : '从素材库选图') }}</span>
        <button type="button" class="vg-icon-btn" aria-label="关闭" @click="emit('close')"><X :size="16" /></button>
      </header>
      <div class="vg-dialog__body">
        <div v-if="items.length" class="ap-grid">
          <button v-for="a in items" :key="a.id" type="button" class="ap-item" :class="{ 'is-on': picked.includes(a.fileId) }" :title="a.name" @click="emit('toggle', a)">
            <span class="ap-item__media">
              <CloudImage v-if="kind === 'image' || a.posterFileId" :file-id="kind === 'image' ? a.fileId : a.posterFileId" />
              <Film v-else :size="20" />
              <em v-if="a.durationSec">{{ formatDuration(a.durationSec) }}</em>
            </span>
            <span class="ap-item__name">{{ a.name }}</span>
            <Check v-if="picked.includes(a.fileId)" :size="14" class="ap-item__check" />
          </button>
        </div>
        <p v-else class="vg-muted">素材库里还没有{{ kind === 'video' ? '视频' : '图片' }}，先到「素材库」上传。</p>
      </div>
      <footer class="vg-dialog__foot"><span class="vg-muted">已选 {{ picked.length }}</span><button type="button" class="vg-btn vg-btn--primary" @click="emit('close')">完成</button></footer>
    </section>
  </div>
</template>

<style scoped>
.ap-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 10px; max-height: 60vh; overflow: auto; }
.ap-item { position: relative; display: flex; flex-direction: column; gap: 4px; padding: 6px; border: 1px solid var(--theme-border); border-radius: 10px; background: var(--theme-panel-soft); color: var(--theme-text); cursor: pointer; }
.ap-item.is-on { border-color: var(--vg-accent); box-shadow: 0 0 0 1px var(--vg-accent) inset; }
.ap-item__media { position: relative; display: grid; place-items: center; aspect-ratio: 1; overflow: hidden; border-radius: 6px; background: #000; color: var(--theme-text-muted); }
.ap-item__media :deep(img) { width: 100%; height: 100%; object-fit: cover; }
.ap-item__media em { position: absolute; right: 4px; bottom: 4px; padding: 0 5px; border-radius: 4px; background: rgba(0, 0, 0, .6); color: #fff; font-size: 11px; font-style: normal; }
.ap-item__name { overflow: hidden; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.ap-item__check { position: absolute; top: 10px; right: 10px; padding: 2px; border-radius: 50%; background: var(--vg-accent); color: #fff; }
</style>
