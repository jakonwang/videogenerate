<script setup lang="ts">
/** GMV Max（网页版）：电脑在线时就是电脑端的 GMV Max 优化器页面，操作实时交给电脑执行。 */
import GmvView from '@/views/GmvView.vue'
import WebDesktopModule from './WebDesktopModule.vue'

const load = () => import('@desktop-views/TiktokGmvMaxOptimizerView.vue')
</script>

<template>
  <WebDesktopModule title="GMV Max" :load="load">
    <template #fallback><GmvView /></template>
  </WebDesktopModule>
</template>
