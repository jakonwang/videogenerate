<script setup lang="ts">
import Sidebar from './Sidebar.vue'
import Topbar from './Topbar.vue'

defineProps<{
  navItems: Array<{ to: string; label: string; active?: boolean; icon?: any }>
  title?: string
  subtitle?: string
}>()
</script>

<template>
  <div class="ds-shell">
    <Sidebar :items="navItems">
      <template #footer>
        <slot name="sidebar-footer" />
      </template>
    </Sidebar>
    <div class="ds-shell__main">
      <Topbar :title="title" :subtitle="subtitle">
        <slot name="topbar" />
      </Topbar>
      <main class="ds-workspace">
        <slot />
      </main>
    </div>
  </div>
</template>
