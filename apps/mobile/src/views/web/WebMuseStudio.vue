<script setup lang="ts">
/** Muse创意室（网页版）：电脑端页面本身，所有操作实时交给电脑用 Muse 账号和代理执行（网页版接口见 lib/desktopApi/museStudio）。 */
import '@desktop-src/design-system/creative-studio.css'
import DesktopPickerHost from '@/components/web/DesktopPickerHost.vue'
import WebDesktopModule from './WebDesktopModule.vue'

const load = () => import('@desktop-views/MuseCreativeStudioView.vue')
const api = () => import('@/lib/desktopApi/museStudio')
</script>

<template>
  <WebDesktopModule title="Muse创意室" :load="load" :api="api" reason="Muse创意室要用电脑上登录的 Muse 账号和代理执行" offline-note="已经发出的任务会在电脑上线后继续。" />
  <DesktopPickerHost />
</template>
