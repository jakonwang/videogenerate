<script setup lang="ts">
import type { Component } from "vue";
import { BarChart3, BookOpen, PanelLeftClose, PanelLeftOpen } from "lucide-vue-next";

export type GmvMaxNavItem = {
  id: string;
  label: string;
  icon: Component;
  tab?: string;
  count?: number;
  children?: Array<{ id: string; label: string; tab: string }>;
};

const props = defineProps<{
  items: GmvMaxNavItem[];
  activeTab: string;
  collapsed: boolean;
  connected: boolean;
  helpLabel: string;
  connectionLabel: string;
  collapseLabel: string;
  expandLabel: string;
}>();

const emit = defineEmits<{
  select: [tab: string];
  help: [];
  toggle: [];
}>();

function itemActive(item: GmvMaxNavItem) {
  return item.tab === props.activeTab || item.children?.some((child) => child.tab === props.activeTab);
}
</script>

<template>
  <aside :class="['gmv-v2-nav', { 'is-collapsed': collapsed }]" data-testid="gmv-feature-nav">
    <div class="gmv-v2-nav__brand">
      <span><BarChart3 /></span>
      <div><strong>GMV MAX</strong><small>CONTROL TOWER</small></div>
    </div>

    <nav aria-label="GMV MAX">
      <template v-for="item in items" :key="item.id">
        <button
          v-if="item.tab"
          type="button"
          :class="['gmv-v2-nav__item', { 'is-active': itemActive(item) }]"
          :data-testid="`gmv-tab-${item.tab}`"
          :title="collapsed ? item.label : undefined"
          @click="emit('select', item.tab)"
        >
          <component :is="item.icon" />
          <span>{{ item.label }}</span>
          <em v-if="item.count">{{ item.count > 99 ? '99+' : item.count }}</em>
        </button>
        <section v-else :class="['gmv-v2-nav__group', { 'is-active': itemActive(item) }]">
          <div :title="collapsed ? item.label : undefined">
            <component :is="item.icon" />
            <span>{{ item.label }}</span>
          </div>
          <button
            v-for="child in item.children"
            :key="child.id"
            type="button"
            :class="{ 'is-active': child.tab === activeTab }"
            :data-testid="`gmv-tab-${child.tab}`"
            :title="collapsed ? child.label : undefined"
            @click="emit('select', child.tab)"
          >
            <i></i><span>{{ child.label }}</span>
          </button>
        </section>
      </template>
    </nav>

    <footer>
      <button
        type="button"
        :class="['gmv-v2-nav__help', { 'is-active': activeTab === 'help' }]"
        data-testid="gmv-tab-help"
        :title="collapsed ? helpLabel : undefined"
        @click="emit('help')"
      >
        <BookOpen /><span>{{ helpLabel }}</span>
      </button>
      <div class="gmv-v2-nav__status" :title="connectionLabel">
        <i :class="{ 'is-connected': connected }"></i><span>{{ connectionLabel }}</span>
      </div>
      <button
        type="button"
        class="gmv-v2-nav__toggle"
        data-testid="gmv-feature-nav-toggle"
        :title="collapsed ? expandLabel : collapseLabel"
        :aria-label="collapsed ? expandLabel : collapseLabel"
        :aria-expanded="!collapsed"
        @click="emit('toggle')"
      >
        <component :is="collapsed ? PanelLeftOpen : PanelLeftClose" />
        <span>{{ collapsed ? expandLabel : collapseLabel }}</span>
      </button>
    </footer>
  </aside>
</template>

<style scoped>
.gmv-v2-nav {
  position: sticky;
  top: 0;
  height: calc(100vh - 64px);
  max-height: calc(100vh - 64px);
  min-height: 0;
  padding: 20px 14px 14px;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--theme-divider);
  background: var(--theme-sidebar);
  overflow: hidden;
}
.gmv-v2-nav__brand {
  min-height: 58px;
  padding: 0 8px 18px;
  display: flex;
  gap: 11px;
  align-items: center;
  border-bottom: 1px solid var(--theme-divider);
}
.gmv-v2-nav__brand > span {
  width: 40px;
  height: 40px;
  flex: 0 0 40px;
  display: grid;
  place-items: center;
  color: #ffffff;
  border-radius: 8px;
  background: #e83f62;
  box-shadow: 0 8px 22px color-mix(in srgb, #e83f62 24%, transparent);
}
.gmv-v2-nav__brand svg { width: 20px; }
.gmv-v2-nav__brand div { min-width: 0; display: grid; gap: 2px; }
.gmv-v2-nav__brand strong { color: var(--theme-text); font-size: 17px; line-height: 1.15; }
.gmv-v2-nav__brand small { color: var(--theme-text-muted); font-size: 10px; letter-spacing: 0; }
.gmv-v2-nav nav {
  min-height: 0;
  padding: 14px 0 10px;
  display: grid;
  grid-auto-rows: max-content;
  align-content: start;
  gap: 3px;
  overflow-y: auto;
  scrollbar-width: thin;
}
.gmv-v2-nav button { color: inherit; font: inherit; border: 0; cursor: pointer; }
.gmv-v2-nav__item,
.gmv-v2-nav__group > div,
.gmv-v2-nav__group > button,
.gmv-v2-nav__help,
.gmv-v2-nav__toggle {
  display: grid;
  align-items: center;
}
.gmv-v2-nav__item,
.gmv-v2-nav__group > div,
.gmv-v2-nav__help,
.gmv-v2-nav__toggle {
  min-height: 42px;
  grid-template-columns: 20px minmax(0, 1fr) auto;
  gap: 10px;
  padding: 0 10px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  text-align: left;
}
.gmv-v2-nav__item:hover,
.gmv-v2-nav__help:hover,
.gmv-v2-nav__toggle:hover,
.gmv-v2-nav__group > button:hover {
  background: var(--theme-control-hover);
  color: var(--theme-text);
}
.gmv-v2-nav__item.is-active,
.gmv-v2-nav__help.is-active {
  border-color: color-mix(in srgb, var(--theme-accent) 28%, var(--theme-border));
  background: color-mix(in srgb, var(--theme-accent) 10%, var(--theme-panel));
  color: var(--theme-control-selected-text);
  box-shadow: inset 3px 0 0 var(--theme-accent);
}
.gmv-v2-nav svg { width: 17px; height: 17px; color: var(--theme-text-muted); }
.gmv-v2-nav__item.is-active > svg,
.gmv-v2-nav__help.is-active > svg,
.gmv-v2-nav__group.is-active > div > svg { color: var(--theme-accent); }
.gmv-v2-nav__item > span,
.gmv-v2-nav__help span,
.gmv-v2-nav__toggle span { font-size: 13px; font-weight: 700; }
.gmv-v2-nav__item em {
  min-width: 22px;
  padding: 2px 5px;
  color: #ffffff;
  font-size: 10px;
  font-style: normal;
  text-align: center;
  border-radius: 9px;
  background: #e83f62;
}
.gmv-v2-nav__group {
  position: relative;
  margin-top: 7px;
  padding: 8px 0 3px;
  border-top: 1px solid var(--theme-divider);
}
.gmv-v2-nav__group > div {
  min-height: 34px;
  color: var(--theme-text-muted);
}
.gmv-v2-nav__group > div span {
  font-size: 12px;
  font-weight: 750;
}
.gmv-v2-nav__group.is-active > div { color: var(--theme-text-secondary); }
.gmv-v2-nav__group > button {
  position: relative;
  width: 100%;
  min-height: 36px;
  grid-template-columns: 14px minmax(0, 1fr);
  gap: 9px;
  padding: 0 10px 0 17px;
  color: var(--theme-text-secondary);
  border-radius: 5px;
  background: transparent;
  text-align: left;
}
.gmv-v2-nav__group > button i {
  width: 3px;
  height: 14px;
  justify-self: center;
  border-radius: 2px;
  background: var(--theme-border-control);
}
.gmv-v2-nav__group > button span { font-size: 13px; font-weight: 650; }
.gmv-v2-nav__group > button.is-active {
  color: var(--theme-control-selected-text);
  background: color-mix(in srgb, var(--theme-accent) 10%, transparent);
}
.gmv-v2-nav__group > button.is-active i { background: var(--theme-accent); }
.gmv-v2-nav footer {
  margin-top: auto;
  padding-top: 12px;
  display: grid;
  gap: 4px;
  border-top: 1px solid var(--theme-divider);
}
.gmv-v2-nav__status {
  min-height: 30px;
  padding: 0 11px;
  display: flex;
  gap: 8px;
  align-items: center;
  color: var(--theme-text-muted);
  font-size: 11px;
}
.gmv-v2-nav__status i { width: 7px; height: 7px; border-radius: 50%; background: var(--theme-danger); }
.gmv-v2-nav__status i.is-connected {
  background: var(--theme-success-text);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--theme-success-text) 12%, transparent);
}
.gmv-v2-nav__toggle { color: var(--theme-text-muted); }
.gmv-v2-nav.is-collapsed { padding-inline: 8px; }
.gmv-v2-nav.is-collapsed .gmv-v2-nav__brand { justify-content: center; padding-inline: 0; }
.gmv-v2-nav.is-collapsed .gmv-v2-nav__brand div,
.gmv-v2-nav.is-collapsed .gmv-v2-nav__item span,
.gmv-v2-nav.is-collapsed .gmv-v2-nav__item em,
.gmv-v2-nav.is-collapsed .gmv-v2-nav__group > div span,
.gmv-v2-nav.is-collapsed .gmv-v2-nav__group > button span,
.gmv-v2-nav.is-collapsed .gmv-v2-nav__help span,
.gmv-v2-nav.is-collapsed .gmv-v2-nav__toggle span,
.gmv-v2-nav.is-collapsed .gmv-v2-nav__status span { display: none; }
.gmv-v2-nav.is-collapsed .gmv-v2-nav__item,
.gmv-v2-nav.is-collapsed .gmv-v2-nav__group > div,
.gmv-v2-nav.is-collapsed .gmv-v2-nav__help,
.gmv-v2-nav.is-collapsed .gmv-v2-nav__toggle {
  grid-template-columns: 1fr;
  justify-items: center;
  padding: 0;
}
.gmv-v2-nav.is-collapsed .gmv-v2-nav__item.is-active,
.gmv-v2-nav.is-collapsed .gmv-v2-nav__help.is-active { box-shadow: inset 0 -3px 0 var(--theme-accent); }
.gmv-v2-nav.is-collapsed .gmv-v2-nav__group { padding-top: 6px; }
.gmv-v2-nav.is-collapsed .gmv-v2-nav__group > button { grid-template-columns: 1fr; padding: 0; }
.gmv-v2-nav.is-collapsed .gmv-v2-nav__group > button i { width: 4px; height: 14px; }
.gmv-v2-nav.is-collapsed .gmv-v2-nav__status { justify-content: center; padding: 0; }
@media (max-height: 800px) {
  .gmv-v2-nav { padding-top: 12px; padding-bottom: 8px; }
  .gmv-v2-nav__brand { min-height: 48px; padding-bottom: 10px; }
  .gmv-v2-nav__brand > span { width: 34px; height: 34px; flex-basis: 34px; }
  .gmv-v2-nav nav { padding-top: 8px; gap: 1px; }
  .gmv-v2-nav__item,
  .gmv-v2-nav__help,
  .gmv-v2-nav__toggle { min-height: 34px; }
  .gmv-v2-nav__group { margin-top: 3px; padding-block: 4px 2px; }
  .gmv-v2-nav__group > div { min-height: 29px; }
  .gmv-v2-nav__group > button { min-height: 31px; }
  .gmv-v2-nav footer { padding-top: 6px; gap: 2px; }
  .gmv-v2-nav__status { min-height: 26px; }
}
</style>
