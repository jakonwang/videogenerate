<script setup lang="ts">
import { useRouter } from 'vue-router'

type NavItem = { to: string; label: string; active?: boolean; icon?: any }

defineProps<{
  items: NavItem[]
  sections?: Array<{ title: string; items: NavItem[] }>
  collapsed?: boolean
}>()

const router = useRouter()

function navigate(to: string) {
  void router.push(to)
}
</script>

<template>
  <aside class="vg-scope vg-nav" data-testid="app-sidebar" :class="{ 'is-collapsed': collapsed }">
    <nav class="vg-nav__list" aria-label="main">
      <button
        v-for="item in items"
        :key="item.to"
        type="button"
        class="vg-nav__item"
        :class="{ 'is-active': item.active }"
        :title="item.label"
        :aria-current="item.active ? 'page' : undefined"
        @click="navigate(item.to)"
      >
        <component :is="item.icon" v-if="item.icon" class="vg-nav__icon" />
        <span class="vg-nav__label">{{ item.label }}</span>
      </button>

      <div v-for="section in sections || []" :key="section.title" class="vg-nav__section">
        <div class="vg-nav__section-title">{{ section.title }}</div>
        <button
          v-for="item in section.items"
          :key="item.to"
          type="button"
          class="vg-nav__item"
          :class="{ 'is-active': item.active }"
          :title="item.label"
          :aria-current="item.active ? 'page' : undefined"
          @click="navigate(item.to)"
        >
          <component :is="item.icon" v-if="item.icon" class="vg-nav__icon" />
          <span class="vg-nav__label">{{ item.label }}</span>
        </button>
      </div>
    </nav>
    <div class="vg-nav__footer">
      <slot name="footer" />
    </div>
  </aside>
</template>

<style scoped>
.vg-nav {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
  height: 100%;
  padding: 12px 10px;
  background: var(--theme-sidebar);
  border-right: 1px solid var(--theme-border);
  overflow: hidden;
}

.vg-nav__list {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow-y: auto;
  scrollbar-width: none;
}
.vg-nav__list::-webkit-scrollbar { display: none; }

.vg-nav__item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  height: 38px;
  padding: 0 12px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--theme-text-secondary);
  font-size: 13.5px;
  font-weight: 500;
  text-align: left;
  cursor: pointer;
  transition: background .15s, color .15s;
  -webkit-app-region: no-drag;
}
.vg-nav__item:hover {
  background: var(--theme-control-hover);
  color: var(--theme-text);
}
.vg-nav__item:focus-visible {
  outline: 2px solid var(--vg-accent-line);
  outline-offset: -2px;
}
.vg-nav__item.is-active {
  background: var(--vg-accent-soft);
  color: var(--vg-accent);
  font-weight: 600;
}
.vg-nav__item.is-active::before {
  content: '';
  position: absolute;
  left: -10px;
  top: 9px;
  bottom: 9px;
  width: 3px;
  border-radius: 0 3px 3px 0;
  background: var(--vg-accent);
}
.vg-nav__icon {
  width: 17px;
  height: 17px;
  flex-shrink: 0;
}
.vg-nav__label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.vg-nav__section {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--theme-divider);
}
.vg-nav__section-title {
  padding: 0 12px 4px;
  color: var(--theme-text-muted);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: .04em;
}

.vg-nav__footer {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-top: 10px;
  border-top: 1px solid var(--theme-divider);
}

/* Collapsed: icon rail */
.vg-nav.is-collapsed { padding: 12px 8px; }
.vg-nav.is-collapsed .vg-nav__item { justify-content: center; padding: 0; }
.vg-nav.is-collapsed .vg-nav__item.is-active::before { left: -8px; }
.vg-nav.is-collapsed .vg-nav__label,
.vg-nav.is-collapsed .vg-nav__section-title { display: none; }
.vg-nav.is-collapsed .vg-nav__section { margin-top: 8px; padding-top: 8px; }

/* Narrow windows always use the icon rail (matches the previous shell behaviour). */
@media (max-width: 1180px) {
  .vg-nav { padding: 12px 8px; }
  .vg-nav__item { justify-content: center; padding: 0; }
  .vg-nav__item.is-active::before { left: -8px; }
  .vg-nav__label,
  .vg-nav__section-title { display: none; }
  .vg-nav__section { margin-top: 8px; padding-top: 8px; }
}
</style>
