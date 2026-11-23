<script setup lang="ts">
/**
 * 批量混剪（网页版）：电脑在线时就是电脑端的批量混剪页面，素材池、方案、成片都在电脑上执行
 * （网页版接口见 lib/desktopApi/production）。电脑不在线时显示网页的批量混剪页面（云端简版成片 / 先下单）。
 */
import { computed, type Component } from 'vue'
import { useRoute } from 'vue-router'
import DesktopPickerHost from '@/components/web/DesktopPickerHost.vue'
import WebDesktopModule from './WebDesktopModule.vue'

defineProps<{ load: () => Promise<{ default: Component }>; fallback: Component }>()
const api = () => import('@/lib/desktopApi/production')
// Every production route uses this component: a new page per route (otherwise Vue keeps the previous page).
const route = useRoute()
const pageKey = computed(() => route.matched[route.matched.length - 1]?.path ?? route.path)
</script>

<template>
  <WebDesktopModule
    :key="pageKey"
    title="批量混剪"
    :load="load"
    :api="api"
    reason="批量混剪的素材池和成片在电脑上（原始素材在电脑上）"
    offline-note="现在可以先用下面的网页批量混剪：用同步上来的素材池下单，电脑上线后成片，或改用云端简版成片。"
  >
    <template #fallback><component :is="fallback" /></template>
  </WebDesktopModule>
  <DesktopPickerHost />
</template>
