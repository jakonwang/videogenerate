<script setup lang="ts">
/** 直播切片（网页版）：先装好电脑端的文案包，再显示和电脑端一样的切片页面。 */
import { defineAsyncComponent, getCurrentInstance, onMounted, shallowRef, type Component } from 'vue'
import { LoaderCircle } from 'lucide-vue-next'
import { ensureDesktopI18n } from '@/lib/desktopI18n'

const app = getCurrentInstance()!.appContext.app
const page = shallowRef<Component>()
onMounted(async () => {
  await ensureDesktopI18n(app)
  page.value = defineAsyncComponent(() => import('./WebLiveSlicerPage.vue'))
})
</script>

<template>
  <component :is="page" v-if="page" />
  <div v-else class="vg-empty"><LoaderCircle :size="20" class="vg-spin" /></div>
</template>
