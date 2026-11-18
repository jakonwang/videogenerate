<script setup lang="ts">
import { ref, watch } from 'vue'
import { fileUrl } from '@/lib/files'

/** 播放云端视频（同 CloudImage，需要登录令牌，先取回再播放） */
/** start / end：只播放一段（媒体片段 #t=start,end），用于素材池镜头预览 */
const props = defineProps<{ fileId?: string | null; autoplay?: boolean; controls?: boolean; start?: number; end?: number }>()
const src = ref('')
/** Android WebView 没有 poster 时会画一个灰色大播放图标，用透明图盖掉 */
const TRANSPARENT = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

watch(
  () => props.fileId,
  async (id) => {
    src.value = ''
    // '#t=0.1' makes the browser paint the first frame instead of a blank / default poster.
    const fragment = props.start !== undefined ? `#t=${props.start.toFixed(2)}${props.end !== undefined ? `,${props.end.toFixed(2)}` : ''}` : '#t=0.1'
    if (id) src.value = await fileUrl(id).then((url) => (url ? `${url}${fragment}` : '')).catch(() => '')
  },
  { immediate: true },
)
</script>

<template>
  <video v-if="src" :src="src" class="cloud-video" playsinline muted preload="metadata" :poster="TRANSPARENT" :autoplay="autoplay" :controls="controls" :loop="start === undefined" />
  <span v-else class="cloud-video cloud-video--loading" />
</template>

<style scoped>
.cloud-video { display: block; width: 100%; height: 100%; object-fit: cover; background: #000; }
.cloud-video--loading { background: var(--theme-panel-soft); }
</style>
