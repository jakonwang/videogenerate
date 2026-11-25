<script setup lang="ts">
/**
 * 合并入口的切换（AI 出片 / 批量混剪 / 素材库）：放在顶栏里，不占页面高度；当前标签用下划线标出。
 * 当前地址不属于任何合并入口时不显示。电脑端和网页共用（网页外壳没有电脑端文案包，不传 translate，用中文）。
 */
import { computed, onBeforeUnmount, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { rememberSectionTab, sectionForPath } from './sectionTabs'

const props = defineProps<{ translate?: (key: string, fallback: string) => string }>()
const route = useRoute()
const current = computed(() => sectionForPath(route.path))
const label = (key: string, zh: string) => props.translate?.(key, zh) ?? zh

const tabs = computed(() => current.value?.group.tabs.filter((tab) => !tab.devOnly || (import.meta.env.DEV && props.translate)) ?? [])

// 这些页面共用一套边距（见下方全局样式），用根节点标记
watch(
  () => current.value?.group.key,
  (key) => {
    if (key) document.documentElement.dataset.section = key
    else delete document.documentElement.dataset.section
  },
  { immediate: true },
)
onBeforeUnmount(() => delete document.documentElement.dataset.section)
watch(() => route.path, (path) => rememberSectionTab(path), { immediate: true })
</script>

<template>
  <nav v-if="current" class="section-tabs" data-testid="section-tabs" :aria-label="label(current.group.labelKey, current.group.zh)">
    <RouterLink
      v-for="tab in tabs"
      :key="tab.key"
      :to="tab.to"
      class="section-tabs__item"
      :class="{ 'is-active': tab.key === current.tab.key }"
      :aria-current="tab.key === current.tab.key ? 'page' : undefined"
      :data-testid="`section-tab-${tab.key}`"
    >{{ label(tab.labelKey, tab.zh) }}</RouterLink>
  </nav>
</template>

<style scoped>
.section-tabs { display: flex; gap: 24px; align-self: stretch; flex-shrink: 0; -webkit-app-region: no-drag; }
.section-tabs__item {
  position: relative;
  display: inline-flex;
  align-items: center;
  color: var(--theme-text-muted);
  font-size: 13px;
  font-weight: 500;
  text-decoration: none;
  white-space: nowrap;
  transition: color .15s;
}
.section-tabs__item:hover { color: var(--theme-text); }
.section-tabs__item.is-active { color: var(--theme-text); font-weight: 600; }
.section-tabs__item.is-active::after { content: ''; position: absolute; inset: auto 0 -1px; height: 2px; border-radius: 2px; background: var(--theme-accent); box-shadow: 0 0 12px color-mix(in srgb, var(--theme-accent) 60%, transparent); }
.section-tabs__item:focus-visible { outline: 2px solid var(--vg-accent-line); outline-offset: -4px; border-radius: 4px; }
@media (max-width: 1180px) { .section-tabs { gap: 18px; } .section-tabs__item { font-size: 13px; } }
</style>

<style>
/*
 * Pages of a merged entry share one frame: the workspace adds no padding of its own and full-height pages fill it.
 * Doubled classes outrank the shared plugin-workspace rules in styles.css.
 */
html[data-app-theme][data-section] body #app :is(.app-shell, .web-shell) :is(.ds-workspace.ds-workspace:not(:has(> .web-workspace)), .web-workspace.web-workspace) {
  display: flex !important;
  flex-direction: column !important;
  padding: 0 !important;
}
html[data-app-theme][data-section] body #app :is(.app-shell, .web-shell) :is(.ds-workspace, .web-workspace) > :is(.plugin-workspace-standard, .live-photo-page, .asset-page) {
  flex: 1 1 0 !important;
  height: auto !important;
  min-height: 0 !important;
}
/* Brand column = sidebar width, so the tabs start where the page content starts. */
@media (min-width: 1181px) { html[data-section] .vg-titlebar > .vg-titlebar__brand { min-width: 232px; } }
@media (max-width: 1180px) { html[data-section] .vg-titlebar > .vg-titlebar__brand { margin-right: 28px; } }
html[data-section] .vg-titlebar > .vg-titlebar__brand :is(.vg-titlebar__divider, .vg-titlebar__subtitle) { display: none; }
</style>
