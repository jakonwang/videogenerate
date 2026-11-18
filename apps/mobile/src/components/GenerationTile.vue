<script setup lang="ts">
import { computed } from 'vue'
import { AlertTriangle, Check, LoaderCircle, Play, X } from 'lucide-vue-next'
import CloudImage from './CloudImage.vue'
import CloudVideo from './CloudVideo.vue'
import type { GenerationItem } from '@/lib/generate'

/** 一个生成结果：进行中显示原图 + 进度，完成显示结果，失败显示原因 */
const props = defineProps<{ item: GenerationItem; tall?: boolean }>()
const done = computed(() => props.item.status === 'succeeded' && props.item.outputFileId)
</script>

<template>
  <div class="tile" :class="{ 'tile--tall': tall }">
    <template v-if="done">
      <CloudVideo v-if="item.kind === 'video'" :file-id="item.outputFileId" autoplay />
      <CloudImage v-else :file-id="item.outputFileId" />
      <span v-if="item.kind === 'video'" class="tile__play"><Play :size="14" fill="currentColor" /></span>
    </template>
    <template v-else>
      <CloudImage v-if="item.sourceFileId" :file-id="item.sourceFileId" class="tile__source" />
      <span class="tile__overlay" :class="{ 'is-failed': item.status === 'failed' }">
        <template v-if="item.status === 'failed'"><AlertTriangle :size="20" /><small>{{ item.error || '生成失败' }}</small></template>
        <template v-else><LoaderCircle :size="22" class="m-spin" /><small>{{ item.status === 'queued' ? '排队中' : item.kind === 'video' ? '生成视频中…' : '生成中…' }}</small></template>
      </span>
    </template>
    <span class="tile__label">{{ item.label }}</span>
    <span v-if="item.review === 'approved'" class="tile__review is-ok"><Check :size="12" :stroke-width="3" /></span>
    <span v-else-if="item.review === 'rejected'" class="tile__review is-no"><X :size="12" :stroke-width="3" /></span>
  </div>
</template>

<style scoped>
.tile { position: relative; aspect-ratio: 1; overflow: hidden; border-radius: 12px; border: 1px solid var(--theme-border); background: var(--theme-panel-soft); }
.tile--tall { aspect-ratio: 9 / 16; }
.tile__source { filter: blur(2px) brightness(.55); }
.tile__overlay { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; padding: 8px; color: #fff; text-align: center; }
.tile__overlay small { font-size: 11px; line-height: 1.35; display: -webkit-box; overflow: hidden; -webkit-line-clamp: 4; -webkit-box-orient: vertical; }
.tile__overlay.is-failed { color: var(--theme-danger-text); background: color-mix(in srgb, var(--theme-danger-soft) 70%, transparent); }
.tile__label { position: absolute; left: 6px; bottom: 6px; padding: 2px 7px; border-radius: 999px; background: rgba(0, 0, 0, .6); color: #fff; font-size: 10px; font-weight: 700; }
.tile__play { position: absolute; top: 6px; left: 6px; display: grid; place-items: center; width: 22px; height: 22px; border-radius: 50%; background: rgba(0, 0, 0, .55); color: #fff; }
.tile__review { position: absolute; top: 6px; right: 6px; display: grid; place-items: center; width: 20px; height: 20px; border-radius: 50%; color: #04201c; }
.tile__review.is-ok { background: var(--m-accent); }
.tile__review.is-no { background: var(--m-red); color: #fff; }
</style>
