<script setup lang="ts">
import { RouterLink } from 'vue-router'

defineProps<{
  items: Array<{
    to: string
    label: string
    active?: boolean
    icon?: any
  }>
}>()
</script>

<template>
  <aside class="ds-sidebar">
    <div class="ds-sidebar__brand">
      <div class="ds-sidebar__mark" aria-hidden="true">
        <svg viewBox="0 0 40 40" class="ds-sidebar__mark-icon" role="img" aria-hidden="true">
          <defs>
            <linearGradient id="vg-mark-a" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="#38d8ff" />
              <stop offset="100%" stop-color="#8b5cf6" />
            </linearGradient>
          </defs>
          <path d="M14 6h12c4.4 0 8 3.6 8 8v12c0 4.4-3.6 8-8 8H14c-4.4 0-8-3.6-8-8V14c0-4.4 3.6-8 8-8Z" fill="url(#vg-mark-a)" opacity="0.16" />
          <path d="M12.5 10.5h15c3.3 0 6 2.7 6 6v7c0 3.3-2.7 6-6 6h-15c-3.3 0-6-2.7-6-6v-7c0-3.3 2.7-6 6-6Z" fill="url(#vg-mark-a)" />
          <path d="M17 14.5h6.5c2.5 0 4.5 2 4.5 4.5v2.5c0 2.5-2 4.5-4.5 4.5H17c-2.5 0-4.5-2-4.5-4.5V19c0-2.5 2-4.5 4.5-4.5Z" fill="#0b1220" opacity="0.28" />
          <path d="M16 14.5h8.2c1.8 0 3.3 1.5 3.3 3.3v4.4c0 1.8-1.5 3.3-3.3 3.3H16c-1.8 0-3.3-1.5-3.3-3.3v-4.4c0-1.8 1.5-3.3 3.3-3.3Z" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="1.1" />
        </svg>
      </div>
      <div class="ds-sidebar__brand-copy">
        <div class="ds-sidebar__title">VideoGen</div>
        <div class="ds-sidebar__subtitle">Studio</div>
      </div>
    </div>
    <nav class="ds-sidebar__nav">
      <RouterLink
        v-for="item in items"
        :key="item.to"
        :to="item.to"
        class="ds-sidebar__item"
        :class="{ 'is-active': item.active }"
        :title="item.label"
      >
        <component :is="item.icon" v-if="item.icon" class="h-4 w-4" />
        <span>{{ item.label }}</span>
      </RouterLink>
    </nav>
    <slot name="footer" />
  </aside>
</template>
