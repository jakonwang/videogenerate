<script setup lang="ts">
import { ref, watch } from 'vue'
import { ImageOff } from 'lucide-vue-next'
import { fileUrl } from '@/lib/files'

/** 显示云端同步的图片（需要登录令牌，不能直接用 <img src>） */
const props = defineProps<{ fileId?: string | null; alt?: string }>()
const src = ref('')
const failed = ref(false)

watch(
  () => props.fileId,
  async (id) => {
    src.value = ''
    failed.value = false
    if (!id) return
    try {
      src.value = await fileUrl(id)
    } catch {
      failed.value = true
    }
  },
  { immediate: true },
)
</script>

<template>
  <img v-if="src" :src="src" :alt="alt || ''" class="cloud-img" draggable="false" />
  <span v-else class="cloud-img cloud-img--empty" :class="{ 'is-loading': fileId && !failed }"><ImageOff v-if="!fileId || failed" :size="20" /></span>
</template>

<style scoped>
.cloud-img { width: 100%; height: 100%; object-fit: cover; background: var(--theme-panel-soft); }
.cloud-img--empty { display: grid; place-items: center; color: var(--theme-text-muted); }
.cloud-img--empty.is-loading { background: linear-gradient(100deg, var(--theme-panel-soft) 30%, var(--theme-control-hover) 50%, var(--theme-panel-soft) 70%); background-size: 200% 100%; animation: shimmer 1.2s linear infinite; }
@keyframes shimmer { to { background-position: -200% 0; } }
</style>
