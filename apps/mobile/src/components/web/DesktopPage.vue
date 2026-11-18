<script setup lang="ts">
/** 网页上原样显示一个电脑端页面：先装好电脑端的文案包（只在打开这些页面时加载），再渲染页面。 */
import { defineAsyncComponent, getCurrentInstance, onMounted, shallowRef, type Component } from 'vue'
import { LoaderCircle } from 'lucide-vue-next'
import { ensureDesktopI18n } from '@/lib/desktopI18n'

const props = defineProps<{ load: () => Promise<{ default: Component }> }>()
const app = getCurrentInstance()!.appContext.app
const page = shallowRef<Component>()
onMounted(async () => {
  await ensureDesktopI18n(app)
  page.value = defineAsyncComponent(props.load)
})
</script>

<template>
  <component :is="page" v-if="page" />
  <div v-else class="vg-empty"><LoaderCircle :size="20" class="vg-spin" /></div>
</template>
