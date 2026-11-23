<script setup lang="ts">
/**
 * tk创意室（网页版）：电脑在线时就是电脑端的 tk创意室页面，所有操作实时交给电脑用 TikTok 创意账号执行
 * （网页版接口见 lib/desktopApi/creativeStudio）。电脑不在线时显示网页的创意室：先下单，电脑上线后执行。
 */
import '@desktop-src/design-system/creative-studio.css'
import DesktopPickerHost from '@/components/web/DesktopPickerHost.vue'
import WebCreative from './WebCreative.vue'
import WebDesktopModule from './WebDesktopModule.vue'

const load = () => import('@desktop-views/TiktokCreativeStudioView.vue')
const api = () => import('@/lib/desktopApi/creativeStudio')
</script>

<template>
  <WebDesktopModule title="tk创意室" :load="load" :api="api" offline-note="现在可以先用下面的网页创意室下单，电脑上线后自动执行。">
    <template #fallback><WebCreative /></template>
  </WebDesktopModule>
  <DesktopPickerHost />
</template>
