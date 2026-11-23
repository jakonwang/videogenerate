<script setup lang="ts">
/**
 * 网页上原样显示一个电脑端页面：先装好电脑端的文案包（只在打开这些页面时加载），再渲染页面。
 * 页面里的「从素材库选择」由 DesktopPickerHost 接住（网页素材库 / 作品库）。
 * 有 `api` 时，页面打开期间把它的 window.api 部分换成网页版（lib/desktopApi/*），离开时还原。
 */
import { defineAsyncComponent, getCurrentInstance, onBeforeUnmount, onMounted, shallowRef, type Component } from 'vue'
import { LoaderCircle } from 'lucide-vue-next'
import { ensureDesktopI18n } from '@/lib/desktopI18n'
import { installDesktopApiParts, type ApiParts } from '@/lib/desktopApiParts'
import DesktopPickerHost from './DesktopPickerHost.vue'
// 电脑端旧版插件页在 styles.css 里的主题 / 版式规则（构建时从 styles.css 抽出，见 vite.config.ts）
import 'virtual:desktop-page-themes.css'

const props = defineProps<{ load: () => Promise<{ default: Component }>; api?: () => Promise<{ default: ApiParts }> }>()
const app = getCurrentInstance()!.appContext.app
const page = shallowRef<Component>()
let restore: (() => void) | null = null
let unmounted = false

onMounted(async () => {
  const [, api] = await Promise.all([ensureDesktopI18n(app), props.api?.()])
  if (unmounted) return
  if (api) restore = installDesktopApiParts(api.default)
  page.value = defineAsyncComponent(props.load)
})
onBeforeUnmount(() => {
  unmounted = true
  restore?.()
})
</script>

<template>
  <component :is="page" v-if="page" />
  <div v-else class="vg-empty"><LoaderCircle :size="20" class="vg-spin" /></div>
  <!-- 电脑端页面里的「从素材库选择」 -->
  <DesktopPickerHost />
</template>
