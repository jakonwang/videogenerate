<script setup lang="ts">
/**
 * 发布中心（网页版）：电脑在线时就是电脑端的批量发布页面（CreatOK），所有操作实时交给电脑执行；
 * 网页选的视频（素材库 / 作品库 / 本地上传）由电脑先下载再建草稿。电脑不在线时是网页的发布页。
 */
import '@desktop-src/design-system/creative-studio.css'
import '@desktop-src/design-system/publisher.css'
import PublishView from '@/views/PublishView.vue'
import DesktopPickerHost from '@/components/web/DesktopPickerHost.vue'
import WebDesktopModule from './WebDesktopModule.vue'

const load = () => import('@desktop-views/TiktokBatchPublisherView.vue')
</script>

<template>
  <WebDesktopModule title="发布中心" :load="load" offline-note="现在可以先用下面的网页发布：下载视频后在 TikTok / 抖音网页上传。">
    <template #fallback><PublishView /></template>
  </WebDesktopModule>
  <DesktopPickerHost />
</template>
