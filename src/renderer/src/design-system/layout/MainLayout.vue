<script setup lang="ts">
import Sidebar from './Sidebar.vue'
import Topbar from './Topbar.vue'

defineProps<{
  navItems: Array<{ to: string; label: string; active?: boolean; icon?: any }>
  sections?: Array<{
    title: string
    items: Array<{ to: string; label: string; active?: boolean; icon?: any }>
  }>
  title?: string
  subtitle?: string
}>()
</script>

<template>
  <div class="ds-shell">
    <Sidebar :items="navItems" :sections="sections">
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

<style scoped>
.ds-shell {
  display: grid;
  grid-template-columns: 248px minmax(0, 1fr);
  min-height: 100%;
}

.ds-shell__main {
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-rows: 88px minmax(0, 1fr);
}

.ds-workspace {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  padding: 5px !important;
}
</style>
