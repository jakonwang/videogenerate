<script setup lang="ts">
/**
 * 合并入口的切换条（AI 出片 / 批量混剪 / 素材库）：页面上方的分段切换，和页面自己的下划线标签区分开。
 * 侧边栏已经高亮了所在入口，这里不再重复入口名。当前地址不属于任何合并入口时不显示。
 * 电脑端和网页共用（网页外壳没有电脑端文案包，传 translate 用中文）。
 */
import { computed, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { rememberSectionTab, sectionForPath } from './sectionTabs'

const props = defineProps<{ translate?: (key: string, fallback: string) => string }>()
const route = useRoute()
const current = computed(() => sectionForPath(route.path))
const label = (key: string, zh: string) => props.translate?.(key, zh) ?? zh

watch(() => route.path, (path) => rememberSectionTab(path), { immediate: true })
</script>

<template>
  <div v-if="current" class="vg-scope section-switch" data-testid="section-tabs">
    <nav class="section-switch__track" :aria-label="label(current.group.labelKey, current.group.zh)">
      <RouterLink
        v-for="tab in current.group.tabs"
        :key="tab.key"
        :to="tab.to"
        class="section-switch__item"
        :class="{ 'is-active': tab.key === current.tab.key }"
        :aria-current="tab.key === current.tab.key ? 'page' : undefined"
        :data-testid="`section-tab-${tab.key}`"
      >
        <component :is="tab.icon" class="section-switch__icon" />
        <span>{{ label(tab.labelKey, tab.zh) }}</span>
      </RouterLink>
    </nav>
  </div>
</template>

<style scoped>
/* Lines up with the page content below (vg-page pads 20px left / right). */
.section-switch { padding: 16px 20px 4px; }
.section-switch__track {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 2px;
  max-width: 100%;
  padding: 3px;
  border: 1px solid var(--theme-border);
  border-radius: 11px;
  background: color-mix(in srgb, var(--theme-text) 3.5%, var(--theme-panel));
}
.section-switch__item {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 30px;
  padding: 0 14px;
  border: 1px solid transparent;
  border-radius: 8px;
  color: var(--theme-text-muted);
  font-size: 13px;
  font-weight: 500;
  line-height: 1;
  text-decoration: none;
  white-space: nowrap;
  transition: color 0.15s ease, background-color 0.15s ease, border-color 0.15s ease;
}
.section-switch__item:hover { color: var(--theme-text); }
.section-switch__item:focus-visible { outline: 2px solid var(--vg-accent-line); outline-offset: 1px; }
.section-switch__item.is-active {
  border-color: var(--theme-border);
  background: var(--theme-panel);
  color: var(--theme-text);
  font-weight: 600;
  box-shadow: 0 1px 2px color-mix(in srgb, #000 18%, transparent);
}
.section-switch__icon { width: 15px; height: 15px; flex-shrink: 0; stroke-width: 1.9; opacity: 0.8; }
.section-switch__item.is-active .section-switch__icon { color: var(--vg-accent); opacity: 1; }
</style>
