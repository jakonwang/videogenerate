<script setup lang="ts">
import { computed, type Component } from 'vue'
import { ArrowLeft, ChevronLeft, LayoutGrid } from 'lucide-vue-next'
import { useRoute, useRouter } from 'vue-router'
import { MODULES } from '@/lib/modules'
import { useInWebShell } from '@/lib/layout'

const props = defineProps<{ title: string; back?: boolean | string; description?: string; icon?: Component }>()
const router = useRouter()
const route = useRoute()
const inWebShell = useInWebShell()

function goBack() {
  if (typeof props.back === 'string') router.replace(props.back)
  else if (window.history.length > 1) router.back()
  else router.replace('/')
}

// Web shell: desktop page head (icon tile, title, one-line description) taken from the module catalog.
const module = computed(() => {
  const candidates = MODULES.filter((item) => item.route)
  const exact = candidates.find((item) => {
    const [path, query] = item.route!.split('?')
    if (path !== route.path) return false
    if (!query) return true
    const [key, value] = query.split('=')
    return String(route.query[key] || '') === value
  })
  return exact || candidates.find((item) => route.path.startsWith(`${item.route!.split('?')[0]}/`)) || null
})
const isModuleHome = computed(() => Boolean(module.value && module.value.route!.split('?')[0] === route.path))
const subtitle = computed(() => props.description ?? (isModuleHome.value ? module.value?.description : ''))
// Sub pages (a project, a product…) keep a back button; module pages are reached from the sidebar.
const showBack = computed(() => Boolean(props.back) && !isModuleHome.value)
</script>

<template>
  <header v-if="inWebShell" class="vg-page-head web-head">
    <button v-if="showBack" type="button" class="vg-icon-btn web-head__back" aria-label="返回" title="返回" @click="goBack"><ArrowLeft :size="18" /></button>
    <span class="vg-page-head__icon"><component :is="icon || module?.icon || LayoutGrid" :size="20" /></span>
    <div class="vg-page-head__text">
      <h1>{{ title }}</h1>
      <p v-if="subtitle">{{ subtitle }}</p>
    </div>
    <div class="vg-page-head__actions"><slot name="actions" /></div>
  </header>
  <header v-else class="m-header" :class="{ 'm-header--back': back }">
    <button v-if="back" class="m-icon-btn" type="button" aria-label="返回" @click="goBack"><ChevronLeft :size="24" /></button>
    <h1 class="m-header__title">{{ title }}</h1>
    <div class="m-header__actions"><slot name="actions" /></div>
  </header>
</template>
