<script lang="ts">
/** 云端图片 → 可显示的路径：同一张只取一次，最多同时取 4 张 */
import { reactive } from 'vue'

const paths = reactive<Record<string, string>>({})
const asked = new Set<string>()
const waiting: string[] = []
let active = 0

function pump() {
  while (active < 4 && waiting.length) {
    const id = waiting.shift()!
    active += 1
    void window.api.sceneSwap
      .imagePath(id)
      .then((path: string) => (paths[id] = path))
      .catch(() => asked.delete(id))
      .finally(() => {
        active -= 1
        pump()
      })
  }
}
function ask(id: string) {
  if (!id || asked.has(id)) return
  asked.add(id)
  waiting.push(id)
  pump()
}
</script>

<script setup lang="ts">
import { watch } from 'vue'
import { localMediaUrl, thumbnailUrl } from '@/lib/localMedia'

const props = defineProps<{ fileId?: string; alt?: string; width?: number; fill?: boolean }>()
watch(() => props.fileId, (id) => id && ask(id), { immediate: true })
</script>

<template>
  <span class="swap-img" :class="{ 'is-fill': fill }">
    <img v-if="fileId && paths[fileId]" :src="width ? thumbnailUrl(paths[fileId], width) : localMediaUrl(paths[fileId])" :alt="alt || ''" loading="lazy" decoding="async" draggable="false" />
  </span>
</template>

<style scoped>
.swap-img { display: block; width: 100%; aspect-ratio: 3 / 4; overflow: hidden; background: var(--gs-well, var(--theme-panel-soft)); }
.swap-img img { display: block; width: 100%; height: 100%; object-fit: cover; }
.swap-img.is-fill { height: 100%; aspect-ratio: auto; }
.swap-img.is-fill img { object-fit: contain; }
</style>
