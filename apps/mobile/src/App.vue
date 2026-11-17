<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { Boxes, Clapperboard, House, ScanSearch, UserRound } from 'lucide-vue-next'
import { toastMessage } from './lib/toast'

const route = useRoute()
const showTabs = computed(() => route.meta.tabs !== false)
const tabs = [
  { to: '/', label: '工作台', icon: House },
  { to: '/research', label: '选品', icon: ScanSearch },
  { to: '/create', label: '创作', icon: Clapperboard },
  { to: '/library', label: '素材', icon: Boxes },
  { to: '/me', label: '我的', icon: UserRound },
]
const isActive = (to: string) => (to === '/' ? route.path === '/' : route.path.startsWith(to))
</script>

<template>
  <router-view v-slot="{ Component }">
    <component :is="Component" />
  </router-view>
  <nav v-if="showTabs" class="m-tabbar" aria-label="主导航">
    <router-link v-for="tab in tabs" :key="tab.to" :to="tab.to" class="m-tab" :class="{ 'is-active': isActive(tab.to) }" replace>
      <span class="m-tab__icon"><component :is="tab.icon" :size="21" :stroke-width="isActive(tab.to) ? 2.4 : 2" /></span>
      {{ tab.label }}
    </router-link>
  </nav>
  <div v-if="toastMessage" class="m-toast" role="status">{{ toastMessage }}</div>
</template>
