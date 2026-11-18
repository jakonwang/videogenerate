<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { Boxes, LayoutTemplate, ListVideo } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'

const route = useRoute()
const { t } = useI18n()

const items = computed(() => [
  {
    to: '/products',
    label: t('production.tabs.products.label'),
    desc: t('production.tabs.products.desc'),
    icon: Boxes,
  },
  {
    to: '/templates',
    label: t('production.tabs.templates.label'),
    desc: t('production.tabs.templates.desc'),
    icon: LayoutTemplate,
  },
  {
    to: '/production/tasks',
    label: t('production.tabs.tasks.label'),
    desc: t('production.tabs.tasks.desc'),
    icon: ListVideo,
  },
])

const isActive = (to: string) => {
  if (to === '/products') return route.path === '/products' || route.path.startsWith('/products/')
  if (to === '/production/tasks') return route.path === '/production/tasks' || route.path.startsWith('/production/tasks/')
  return route.path === to
}
</script>

<template>
  <nav class="ptabs" :aria-label="t('production.tabs.ariaLabel')">
    <RouterLink
      v-for="item in items"
      :key="item.to"
      :to="item.to"
      class="ptab"
      :class="{ 'is-active': isActive(item.to) }"
    >
      <component :is="item.icon" class="h-4 w-4" />
      <span class="ptab__text">
        <span class="ptab__label">{{ item.label }}</span>
        <span class="ptab__desc">{{ item.desc }}</span>
      </span>
    </RouterLink>
  </nav>
</template>

<style scoped>
/* Production section switcher — theme tokens only. */
.ptabs { display: flex; flex-wrap: wrap; gap: 8px; }
.ptab {
  display: flex;
  flex: 1 1 220px;
  min-width: 0;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 14px;
  border: 1px solid var(--theme-border);
  border-radius: 10px;
  background: var(--theme-panel);
  color: var(--theme-text-secondary);
  text-decoration: none;
  transition: border-color .15s, background .15s, color .15s;
}
.ptab > svg { margin-top: 2px; flex-shrink: 0; }
.ptab:hover { border-color: color-mix(in srgb, var(--theme-accent) 38%, transparent); color: var(--theme-text); }
.ptab.is-active {
  border-color: var(--theme-accent);
  background: color-mix(in srgb, var(--theme-accent) 10%, var(--theme-panel));
  color: var(--theme-accent);
}
.ptab__text { display: grid; gap: 2px; min-width: 0; }
.ptab__label { color: inherit; font-size: 13px; font-weight: 700; }
.ptab__desc { color: var(--theme-text-muted); font-size: 11px; line-height: 1.45; }
</style>
