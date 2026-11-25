<script setup lang="ts">
/**
 * tk创意室（网页版）：电脑在线时就是电脑端的 tk创意室页面，所有操作实时交给电脑用 TikTok 创意账号执行
 * （网页版接口见 lib/desktopApi/creativeStudio）。电脑不在线时显示网页的创意室：先下单，电脑上线后执行。
 */
import '@desktop-src/design-system/creative-studio.css'
import DesktopPickerHost from '@/components/web/DesktopPickerHost.vue'
import { Wand2 } from 'lucide-vue-next'
import { useRouter } from 'vue-router'
import { useMuseAvailable } from '@/lib/muse'
import WebCreative from './WebCreative.vue'
import WebDesktopModule from './WebDesktopModule.vue'

const router = useRouter()
const museAvailable = useMuseAvailable()
const load = () => import('@desktop-views/TiktokCreativeStudioView.vue')
const api = () => import('@/lib/desktopApi/creativeStudio')
</script>

<template>
  <div v-if="museAvailable" class="vg-scope wcs-muse"><button type="button" class="vg-btn vg-btn--sm" data-testid="muse-entry" @click="router.push('/muse')"><Wand2 :size="14" /> Muse创意室</button></div>
  <WebDesktopModule title="tk创意室" :load="load" :api="api" offline-note="现在可以先用下面的网页创意室下单，电脑上线后自动执行。">
    <template #fallback><WebCreative /></template>
  </WebDesktopModule>
  <DesktopPickerHost />
</template>

<style scoped>
.wcs-muse { display: flex; justify-content: flex-end; padding: 12px 24px 0; }
</style>
