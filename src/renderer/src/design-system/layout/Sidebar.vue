<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()

defineProps<{
  items: Array<{
    to: string
    label: string
    active?: boolean
    icon?: any
  }>
  sections?: Array<{
    title: string
    items: Array<{
      to: string
      label: string
      active?: boolean
      icon?: any
    }>
  }>
}>()

function navigate(to: string) {
  void router.push(to)
}
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
      <button
        v-for="item in items"
        :key="item.to"
        type="button"
        class="ds-sidebar__item"
        :class="{ 'is-active': item.active }"
        :title="item.label"
        style="-webkit-app-region: no-drag"
        @click="navigate(item.to)"
      >
        <component :is="item.icon" v-if="item.icon" class="h-4 w-4" />
        <span>{{ item.label }}</span>
      </button>

      <div v-for="section in sections || []" :key="section.title" class="ds-sidebar__section">
        <div class="ds-sidebar__section-title">{{ section.title }}</div>
        <div class="ds-sidebar__section-items">
          <button
            v-for="item in section.items"
            :key="item.to"
            type="button"
            class="ds-sidebar__item ds-sidebar__item--sub"
            :class="{ 'is-active': item.active }"
            :title="item.label"
            style="-webkit-app-region: no-drag"
            @click="navigate(item.to)"
          >
            <component :is="item.icon" v-if="item.icon" class="h-4 w-4" />
            <span>{{ item.label }}</span>
          </button>
        </div>
      </div>
    </nav>
    <slot name="footer" />
  </aside>
</template>

<style scoped>
.ds-sidebar {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.ds-sidebar__nav {
  flex: 1 1 auto;
  min-height: 0;
  display: grid !important;
  align-content: start !important;
  justify-content: start !important;
  overflow: auto;
  padding-right: 2px;
  gap: 12px;
}

.ds-sidebar__section {
  display: grid;
  gap: 10px;
  padding-top: 12px;
}

.ds-sidebar__section-title {
  padding: 0 10px;
  color: rgba(226, 232, 240, 0.72);
  font-size: 13px;
  font-weight: 700;
  line-height: 1.2;
}

.ds-sidebar__section-items {
  display: grid;
  gap: 8px;
}

.ds-sidebar__item--sub {
  margin-left: 0;
}
</style>
