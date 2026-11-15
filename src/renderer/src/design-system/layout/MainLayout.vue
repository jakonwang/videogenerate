<script setup lang="ts">
import Sidebar from './Sidebar.vue'
import Topbar from './Topbar.vue'

const props = defineProps<{
  navItems: Array<{ to: string; label: string; active?: boolean; icon?: any }>
  sections?: Array<{
    title: string
    items: Array<{ to: string; label: string; active?: boolean; icon?: any }>
  }>
  title?: string
  subtitle?: string
  topbarEnabled?: boolean
  collapsed?: boolean
}>()
</script>

<template>
  <div class="vg-shell" :class="{ 'is-collapsed': props.collapsed }">
    <Sidebar :items="navItems" :sections="sections" :collapsed="props.collapsed">
      <template #footer>
        <slot name="sidebar-footer" />
      </template>
    </Sidebar>
    <div class="ds-shell__main" :class="{ 'ds-shell__main--with-topbar': props.topbarEnabled }">
      <Topbar v-if="props.topbarEnabled" :title="props.title" :subtitle="props.subtitle">
        <slot name="topbar" />
      </Topbar>
      <main class="ds-workspace">
        <slot />
      </main>
    </div>
  </div>
</template>

<style scoped>
.vg-shell {
  --vg-sidebar-width: 224px;
  display: grid;
  grid-template-columns: var(--vg-sidebar-width) minmax(0, 1fr);
  height: 100%;
  min-height: 0;
  background: var(--theme-shell);
  transition: grid-template-columns .18s ease;
}
.vg-shell.is-collapsed { --vg-sidebar-width: 64px; }
@media (max-width: 1180px) { .vg-shell { --vg-sidebar-width: 64px; } }

.ds-shell__main {
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-rows: minmax(0, 1fr);
}
.ds-shell__main--with-topbar { grid-template-rows: auto minmax(0, 1fr); }

.ds-workspace {
  min-width: 0;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  background: transparent;
}
</style>
