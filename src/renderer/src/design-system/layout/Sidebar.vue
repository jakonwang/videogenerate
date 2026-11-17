<script setup lang="ts">
import { useRouter } from 'vue-router'

type NavItem = { to: string; label: string; active?: boolean; icon?: any; badge?: number }

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
        <span v-if="item.icon" class="vg-nav__tile">
          <component :is="item.icon" class="vg-nav__icon" />
        </span>
        <span class="vg-nav__label">{{ item.label }}</span><span v-if="item.badge" class="vg-nav__badge">{{ item.badge > 99 ? '99+' : item.badge }}</span>
      </button>

      <div v-for="section in sections || []" :key="section.title" class="vg-nav__section">
        <div class="vg-nav__section-title"><span>{{ section.title }}</span></div>
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
          <span v-if="item.icon" class="vg-nav__tile">
            <component :is="item.icon" class="vg-nav__icon" />
          </span>
          <span class="vg-nav__label">{{ item.label }}</span><span v-if="item.badge" class="vg-nav__badge">{{ item.badge > 99 ? '99+' : item.badge }}</span>
        </button>
      </div>
    </nav>
    <div class="vg-nav__footer">
      <slot name="footer" />
    </div>
  </aside>
</template>

<style scoped>
.vg-nav__badge { margin-left: auto; min-width: 18px; height: 18px; padding: 0 5px; border-radius: 999px; background: var(--theme-tone-red, #f87171); color: #fff; font-size: 10.5px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
.vg-nav.is-collapsed .vg-nav__badge { position: absolute; top: 2px; right: 4px; min-width: 14px; height: 14px; font-size: 9px; padding: 0 3px; }

.vg-nav {
  --nav-ink: color-mix(in srgb, var(--theme-text) 86%, transparent);
  --nav-hover: color-mix(in srgb, var(--theme-text) 5%, transparent);
  --nav-tile: color-mix(in srgb, var(--theme-text) 5%, transparent);
  --nav-tile-line: color-mix(in srgb, var(--theme-text) 8%, transparent);
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  padding: 12px 10px 10px;
  background:
    radial-gradient(120% 40% at 0% 0%, color-mix(in srgb, var(--theme-accent) 7%, transparent), transparent 70%),
    var(--theme-sidebar);
  border-right: 1px solid var(--theme-border);
  overflow: hidden;
}

.vg-nav__list {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
  overflow-y: auto;
  scrollbar-width: none;
}
.vg-nav__list::-webkit-scrollbar { display: none; }

.vg-nav__item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 11px;
  width: 100%;
  height: 36px;
  padding: 0 8px;
  border: 1px solid transparent;
  border-radius: 10px;
  background: transparent;
  color: var(--nav-ink);
  font-size: 14px;
  font-weight: 500;
  letter-spacing: .02em;
  text-align: left;
  cursor: pointer;
  transition: background .15s, color .15s, border-color .15s;
  -webkit-app-region: no-drag;
}
.vg-nav__item:hover {
  background: var(--nav-hover);
  color: var(--theme-text);
}
.vg-nav__item:focus-visible {
  outline: 2px solid var(--vg-accent-line);
  outline-offset: -2px;
}

.vg-nav__tile {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  border: 1px solid var(--nav-tile-line);
  border-radius: 8px;
  background: var(--nav-tile);
  color: var(--theme-text-secondary);
  transition: background .15s, color .15s, border-color .15s, box-shadow .15s;
}
.vg-nav__item:hover .vg-nav__tile {
  color: var(--theme-text);
  border-color: color-mix(in srgb, var(--theme-text) 14%, transparent);
}
.vg-nav__icon {
  width: 16px;
  height: 16px;
  stroke-width: 1.9;
}

.vg-nav__item.is-active {
  background: linear-gradient(90deg,
    color-mix(in srgb, var(--theme-accent) 18%, transparent),
    color-mix(in srgb, var(--theme-accent) 4%, transparent));
  border-color: color-mix(in srgb, var(--theme-accent) 24%, transparent);
  color: var(--theme-text);
  font-weight: 600;
}
.vg-nav__item.is-active .vg-nav__tile {
  border-color: transparent;
  background: linear-gradient(135deg,
    color-mix(in srgb, var(--theme-accent) 100%, #ffffff 12%),
    color-mix(in srgb, var(--theme-accent) 100%, #000000 22%));
  color: var(--theme-on-accent);
  box-shadow: 0 4px 12px color-mix(in srgb, var(--theme-accent) 38%, transparent);
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
}
.vg-nav__section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 8px 6px;
  color: var(--theme-text-muted);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: .12em;
}
.vg-nav__section-title::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--theme-divider);
}

.vg-nav__footer {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin-top: 8px;
  padding-top: 10px;
  border-top: 1px solid var(--theme-divider);
}

/* Collapsed: icon rail */
.vg-nav.is-collapsed .vg-nav__item { justify-content: center; padding: 0; }
.vg-nav.is-collapsed .vg-nav__label,
.vg-nav.is-collapsed .vg-nav__section-title { display: none; }
.vg-nav.is-collapsed .vg-nav__section { margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--theme-divider); }

/* Narrow windows always use the icon rail (matches the previous shell behaviour). */
@media (max-width: 1180px) {
  .vg-nav__item { justify-content: center; padding: 0; }
  .vg-nav__label,
  .vg-nav__section-title { display: none; }
  .vg-nav__section { margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--theme-divider); }
}
</style>
