<script setup lang="ts">
/** Results column of the desktop tool pages: recent outputs of this tool, newest first. */
import { useRouter } from 'vue-router'
import { Inbox, Sparkles } from 'lucide-vue-next'
import GenerationTile from '../GenerationTile.vue'
import WebStep from './WebStep.vue'
import type { GenerationItem } from '@/lib/generate'

withDefaults(defineProps<{ items: GenerationItem[]; index?: number | string; title?: string; tall?: boolean; limit?: number }>(), { title: '生成结果', limit: 12 })
const router = useRouter()
</script>

<template>
  <WebStep :index="index" :title="title" :subtitle="items.length ? '在云端生成，关掉网页也会继续' : undefined" :meta="items.length ? `${items.length} 条` : undefined">
    <template #head>
      <button type="button" class="vg-btn vg-btn--sm vg-btn--ghost" @click="router.push('/review')"><Inbox :size="13" /> 审核收件箱</button>
    </template>
    <div v-if="items.length" class="wr-grid" :class="{ 'wr-grid--tall': tall }">
      <GenerationTile v-for="item in items.slice(0, limit)" :key="item.id" :item="item" :tall="tall" @click="router.push(`/review?focus=${item.id}`)" />
    </div>
    <div v-else class="vg-empty wr-empty">
      <span class="vg-empty__icon"><Sparkles :size="20" /></span>
      <h3>暂无结果</h3>
      <p>提交后结果会出现在这里，完成后也会进入「审核收件箱」</p>
    </div>
  </WebStep>
</template>

<style scoped>
.wr-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(104px, 1fr)); gap: 8px; }
.wr-grid :deep(.tile) { cursor: pointer; }
.wr-empty { padding: 28px 12px; }
</style>
