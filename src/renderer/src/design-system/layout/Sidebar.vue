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
  gap: 8px;
}

.ds-sidebar__section {
  display: grid;
  gap: 8px;
  padding-top: 8px;
}

.ds-sidebar__section-title {
  padding: 0 8px;
  color: rgba(226, 232, 240, 0.72);
  font-size: 12px;
  font-weight: 700;
  line-height: 1.2;
}

.ds-sidebar__section-items {
  display: grid;
  gap: 6px;
}

.ds-sidebar__item--sub {
  margin-left: 0;
}

.sidebar-brand-v2 {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 56px;
  padding: 6px 6px 10px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.06);
}

.sidebar-brand-v2__icon {
  flex: 0 0 auto;
  display: grid;
  place-items: center;
}

.sidebar-brand-v2__icon-image {
  width: 34px;
  height: 34px;
  display: block;
  border-radius: 10px;
  object-fit: contain;
  object-position: center;
}

.sidebar-brand-v2__copy {
  min-width: 0;
  display: grid;
  align-content: center;
  gap: 3px;
}

.sidebar-brand-v2__title {
  margin: 0;
  color: #f8fbff;
  font-size: 16px;
  font-weight: 800;
  line-height: 1;
  letter-spacing: -0.03em;
  white-space: nowrap;
}

.sidebar-brand-v2__subtitle {
  margin: 0;
  color: rgba(162, 178, 204, 0.82);
  font-size: 9px;
  font-weight: 600;
  line-height: 1.1;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  white-space: nowrap;
}
</style>
